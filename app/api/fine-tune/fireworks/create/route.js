import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { decrypt } from '../../../../../lib/cryptoUtils'; // Adjust path as needed
import { v4 as uuidv4 } from 'uuid'; // For generating internal job IDs

// Initialize S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});
const bucketName = process.env.AWS_S3_BUCKET;

// Helper function to read stream to buffer
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

export async function POST(request) {
  console.log('[API_FW_CREATE] Received fine-tuning request.');
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  let userId = 'unknown';
  let internalJobId = uuidv4(); // Generate internal ID early for logging
  let decryptedApiKey = null;
  let fireworksFileId = null;

  try {
    // 1. Authentication & Get User Metadata
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.warn('[API_FW_CREATE] Unauthorized attempt.');
      return new NextResponse('Unauthorized', { status: 401 });
    }
    userId = user.id;
    console.log(`[API_FW_CREATE] Authenticated user: ${userId}, Internal Job ID: ${internalJobId}`);

    // 2. Get Request Body
    const { outputKey, modelName, baseModel } = await request.json();
    if (!outputKey || !modelName || !baseModel) {
      return new NextResponse('Missing required fields: outputKey, modelName, baseModel', { status: 400 });
    }
    console.log(`[API_FW_CREATE] Job details for user ${userId}:`, { outputKey, modelName, baseModel });

    // 3. Retrieve and Decrypt Fireworks API Key
    const encryptedApiKey = user.user_metadata?.encrypted_fireworks_api_key;
    if (!encryptedApiKey) {
      console.warn(`[API_FW_CREATE] User ${userId} does not have a Fireworks API key stored.`);
      return new NextResponse('Fireworks API key not found. Please add it in your profile.', { status: 403 });
    }
    try {
        decryptedApiKey = decrypt(encryptedApiKey);
        console.log(`[API_FW_CREATE] Fireworks key decrypted for user ${userId}.`);
    } catch (decryptError) {
        console.error(`[API_FW_CREATE] Failed to decrypt Fireworks key for user ${userId}:`, decryptError);
        return new NextResponse('Failed to process stored API key.', { status: 500 });
    }

    // 4. Download Dataset from S3
    console.log(`[API_FW_CREATE] Downloading dataset ${outputKey} from S3 bucket ${bucketName} for user ${userId}...`);
    const getObjectParams = { Bucket: bucketName, Key: outputKey };
    const command = new GetObjectCommand(getObjectParams);
    const { Body: s3Stream, ContentLength } = await s3Client.send(command);
    if (!s3Stream) {
      throw new Error(`Failed to download dataset from S3: ${outputKey}`);
    }
    const fileBuffer = await streamToBuffer(s3Stream);
    console.log(`[API_FW_CREATE] Downloaded ${fileBuffer.length} bytes for user ${userId}.`);

    // --- Create Initial Job Record in DB --- 
    // Do this BEFORE interacting with Fireworks file upload
    console.log(`[API_FW_CREATE] Creating initial job record in DB for user ${userId}...`);
    const { data: initialDbJob, error: initialDbError } = await supabase
      .from('fireworks_fine_tuning_jobs')
      .insert({
        id: internalJobId, // Use the generated UUID
        user_id: userId,
        model_name: modelName,
        base_model: baseModel,
        status: 'uploading_to_fireworks', // Initial status
        fireworks_file_id: 'PENDING_UPLOAD' // Placeholder
      })
      .select()
      .single();

    if (initialDbError) {
      console.error(`[API_FW_CREATE] Failed to insert initial job record for user ${userId}:`, initialDbError);
      throw new Error(`Database error creating job record: ${initialDbError.message}`);
    }
    console.log(`[API_FW_CREATE] Initial job record created with ID: ${internalJobId} for user ${userId}`);
    // --------------------------------------

    // 5. Upload File to Fireworks
    console.log(`[API_FW_CREATE] Uploading dataset to Fireworks for user ${userId}...`);
    const formData = new FormData();
    const originalFilename = outputKey.split('/').pop() || 'training_data.jsonl';
    formData.append('file', new Blob([fileBuffer]), originalFilename);
    formData.append('purpose', 'fine-tune');

    const uploadResponse = await fetch('https://api.fireworks.ai/v1/files', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${decryptedApiKey}` },
      body: formData,
    });

    // --- Robust Response Handling --- 
    if (!uploadResponse.ok) {
      let errorPayload = `Fireworks file upload failed: ${uploadResponse.status} ${uploadResponse.statusText || 'Unknown error'}`;
      try {
        // Attempt to read error text from Fireworks
        const errorText = await uploadResponse.text(); 
        if (errorText) {
          errorPayload = `Fireworks file upload failed: ${errorText}`;
        }
      } catch (e) { /* Ignore text reading error, use status code */ }
      console.error(`[API_FW_CREATE] ${errorPayload} for user ${userId}`);
      // Update DB record to failed status
      await supabase.from('fireworks_fine_tuning_jobs').update({ status: 'failed', error_message: errorPayload }).eq('id', internalJobId);
      throw new Error(errorPayload);
    }
    // --- End Robust Response Handling ---

    // Only parse JSON if response is OK
    const uploadResult = await uploadResponse.json(); 
    if (!uploadResult.id) {
         const errorMessage = `Fireworks file upload succeeded but response missing 'id': ${JSON.stringify(uploadResult)}`;
         console.error(`[API_FW_CREATE] ${errorMessage} for user ${userId}`);
         await supabase.from('fireworks_fine_tuning_jobs').update({ status: 'failed', error_message: errorMessage }).eq('id', internalJobId);
         throw new Error(errorMessage);
    }
    fireworksFileId = uploadResult.id;
    console.log(`[API_FW_CREATE] File uploaded to Fireworks. File ID: ${fireworksFileId} for user ${userId}.`);

    // Update DB record with Fireworks File ID and status
     await supabase.from('fireworks_fine_tuning_jobs').update({ fireworks_file_id: fireworksFileId, status: 'starting_job' }).eq('id', internalJobId);
     console.log(`[API_FW_CREATE] DB record updated with file ID ${fireworksFileId} for user ${userId}.`);

    // 6. Start Fine-Tuning Job on Fireworks
    console.log(`[API_FW_CREATE] Starting fine-tuning job on Fireworks for user ${userId}...`);
    const fineTunePayload = {
      model: baseModel,
      training_file: fireworksFileId,
      // Using default hyperparameters as specified
      hyperparameters: {
        n_epochs: 3,
        batch_size: 2
      },
      suffix: modelName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 18) // Generate a suffix based on user name
    };

    const fineTuneResponse = await fetch('https://api.fireworks.ai/v1/fine-tunes', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${decryptedApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(fineTunePayload),
    });

    const fineTuneResult = await fineTuneResponse.json();
    if (!fineTuneResponse.ok || !fineTuneResult.id) {
        console.error(`[API_FW_CREATE] Fireworks fine-tune start failed for user ${userId}:`, { status: fineTuneResponse.status, body: fineTuneResult });
        // Update DB record to failed status
        await supabase.from('fireworks_fine_tuning_jobs').update({ status: 'failed', error_message: `Fireworks job start failed: ${fineTuneResult.message || fineTuneResponse.statusText}` }).eq('id', internalJobId);
        throw new Error(`Fireworks fine-tune start failed: ${fineTuneResult.message || fineTuneResponse.statusText}`);
    }
    const fireworksJobId = fineTuneResult.id;
    const jobStatus = fineTuneResult.status || 'pending'; // Use status from response
    console.log(`[API_FW_CREATE] Fine-tuning job started on Fireworks. Job ID: ${fireworksJobId}, Status: ${jobStatus} for user ${userId}.`);

    // 7. Update Final Job Record in DB
    const { error: finalDbError } = await supabase
        .from('fireworks_fine_tuning_jobs')
        .update({ 
            fireworks_job_id: fireworksJobId,
            status: jobStatus 
        })
        .eq('id', internalJobId);
        
    if (finalDbError) {
        // Log error but proceed, the job is started on Fireworks side
        console.error(`[API_FW_CREATE] Failed to update job record with Fireworks Job ID for user ${userId}, internal ID ${internalJobId}:`, finalDbError);
        // Don't throw here, let the client know the job started
    }
    console.log(`[API_FW_CREATE] DB record ${internalJobId} updated with job ID ${fireworksJobId} for user ${userId}.`);

    // 8. Return Success Response
    return NextResponse.json({ 
        message: 'Fireworks fine-tuning job initiated successfully.', 
        internalJobId: internalJobId, 
        fireworksJobId: fireworksJobId, 
        status: jobStatus 
    }, { status: 201 });

  } catch (error) {
    console.error(`[API_FW_CREATE] General Error for user ${userId}, internal job ${internalJobId}:`, error);
    // Ensure DB record reflects failure if it exists and wasn't updated previously
     try {
         await supabase.from('fireworks_fine_tuning_jobs').update({ status: 'failed', error_message: error.message || 'Unknown error during job creation' }).eq('id', internalJobId);
     } catch (dbUpdateError) {
         console.error(`[API_FW_CREATE] Failed to update job status to failed in DB for job ${internalJobId}:`, dbUpdateError);
     }
    
    if (error instanceof SyntaxError) { return new NextResponse('Invalid JSON', { status: 400 }); }
    return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
  }
} 
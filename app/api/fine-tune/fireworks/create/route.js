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

// Helper function for robust error response handling
async function handleFireworksError(response, defaultMessage, internalJobId, supabase) {
    let errorPayload = `${defaultMessage}: ${response.status} ${response.statusText || 'Unknown error'}`;
    let fireworksErrorDetail = 'No additional detail available';
    try {
        fireworksErrorDetail = await response.text(); 
        if (fireworksErrorDetail) {
            console.log("[API_FW_CREATE] Raw Fireworks Error Response Body:", fireworksErrorDetail);
            try {
                const jsonError = JSON.parse(fireworksErrorDetail);
                errorPayload = `${defaultMessage}: ${jsonError.message || JSON.stringify(jsonError)}`;
            } catch (jsonParseError) {
                errorPayload = `${defaultMessage}: ${fireworksErrorDetail}`; 
            }
        } else {
             errorPayload = `${defaultMessage}: ${response.status} ${response.statusText || 'Empty response body'}`;
        }
    } catch (e) { 
        console.warn("[API_FW_CREATE] Could not read error response body from Fireworks.", e);
    }
    console.error(`[API_FW_CREATE] ${errorPayload}`);
    // Update DB record to failed status
    await supabase.from('fireworks_fine_tuning_jobs').update({ status: 'failed', error_message: errorPayload }).eq('id', internalJobId);
    return new Error(errorPayload);
}

export async function POST(request) {
  console.log('[API_FW_CREATE] Received fine-tuning request (Native Workflow).');
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  let userId = 'unknown';
  let internalJobId = uuidv4(); // Generate internal ID early for logging
  let decryptedApiKey = null;
  let fireworksDatasetName = null;
  let fireworksJobId = null;
  let fireworksAccountId = null; // Will be fetched and decrypted

  try {
    // 1. Authentication & Get User Metadata
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.warn('[API_FW_CREATE] Unauthorized attempt.');
      return new NextResponse('Unauthorized', { status: 401 });
    }
    userId = user.id;
    console.log(`[API_FW_CREATE] Authenticated user: ${userId}, Internal Job ID: ${internalJobId}`);

    // --- Retrieve and Decrypt Fireworks Account ID --- 
    const encryptedAccountId = user.user_metadata?.encrypted_fireworks_account_id;
    if (!encryptedAccountId) {
      console.warn(`[API_FW_CREATE] User ${userId} does not have a Fireworks Account ID stored.`);
      return new NextResponse('Fireworks Account ID not found. Please add it in your profile.', { status: 403 });
    }
    try {
        fireworksAccountId = decrypt(encryptedAccountId);
        console.log(`[API_FW_CREATE] Fireworks Account ID decrypted for user ${userId}.`);
    } catch (decryptError) {
        console.error(`[API_FW_CREATE] Failed to decrypt Fireworks Account ID for user ${userId}:`, decryptError);
        return new NextResponse('Failed to process stored Account ID.', { status: 500 });
    }
    // --- End Account ID Decryption ---

    // 2. Get Request Body
    const { outputKey, modelName, baseModel } = await request.json();
    if (!outputKey || !modelName || !baseModel) { // Account ID is checked above
      return new NextResponse('Missing required fields: outputKey, modelName, baseModel', { status: 400 });
    }
    console.log(`[API_FW_CREATE] Job details for user ${userId}:`, { outputKey, modelName, baseModel, fireworksAccountId });

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
    const { Body: s3Stream } = await s3Client.send(command);
    if (!s3Stream) {
      throw new Error(`Failed to download dataset from S3: ${outputKey}`);
    }
    const fileBuffer = await streamToBuffer(s3Stream);
    console.log(`[API_FW_CREATE] Downloaded ${fileBuffer.length} bytes for user ${userId}.`);

    // --- Create Initial Job Record in DB --- 
    console.log(`[API_FW_CREATE] Creating initial job record in DB for user ${userId}...`);
    const { error: initialDbError } = await supabase
      .from('fireworks_fine_tuning_jobs')
      .insert({
        id: internalJobId,
        user_id: userId,
        model_name: modelName,
        base_model: baseModel,
        status: 'creating_fw_dataset', // New initial status
        // Add placeholder for file_id and the actual dataset name
        fireworks_file_id: 'NATIVE_WORKFLOW', // Satisfy NOT NULL constraint
        fireworks_dataset_name: fireworksDatasetName // Store the generated dataset name
      })
      .select() // Keep select() in case you need the result, though we don't use initialDbJob here
      .single();
    if (initialDbError) {
      console.error(`[API_FW_CREATE] Failed to insert initial job record for user ${userId}:`, initialDbError);
      throw new Error(`Database error creating job record: ${initialDbError.message}`);
    }
    console.log(`[API_FW_CREATE] Initial job record created with ID: ${internalJobId} for user ${userId}`);
    // --------------------------------------

    // 5. STEP 1 (Fireworks Native): Create Dataset Metadata Entry
    // Generate a unique dataset name using UUID
    fireworksDatasetName = `ds-${uuidv4()}`; 
    console.log(`[API_FW_CREATE] STEP 1: Creating dataset metadata entry '${fireworksDatasetName}' on Fireworks...`);

    // Construct payload according to Fireworks Create Dataset API docs
    const createMetadataPayload = {
        dataset: {
            // Optional: Add a display name for easier identification in Fireworks UI
            displayName: fireworksDatasetName // Use the generated UUID name here too
        },
        datasetId: fireworksDatasetName 
    };
    console.log(`[API_FW_CREATE] Create Dataset Metadata Payload:`, JSON.stringify(createMetadataPayload));

    const createMetadataResponse = await fetch(`https://api.fireworks.ai/v1/accounts/${fireworksAccountId}/datasets`, {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${decryptedApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(createMetadataPayload)
    });

    if (!createMetadataResponse.ok) {
        throw await handleFireworksError(createMetadataResponse, "Fireworks dataset metadata creation failed", internalJobId, supabase);
    }
    console.log(`[API_FW_CREATE] Dataset metadata entry '${fireworksDatasetName}' created successfully.`);
    
    // --- Update DB record status --- 
    await supabase.from('fireworks_fine_tuning_jobs').update({ status: 'uploading_to_fireworks', fireworks_dataset_name: fireworksDatasetName }).eq('id', internalJobId);
    
    // 6. STEP 2 (Fireworks Native): Upload File Content
    console.log(`[API_FW_CREATE] STEP 2: Uploading file content to dataset '${fireworksDatasetName}'...`);
    const uploadFormData = new FormData();
    uploadFormData.append('file', new Blob([fileBuffer]), outputKey.split('/').pop() || 'training_data.jsonl');

    // POST to the :upload endpoint for the created dataset ID
    const uploadFileResponse = await fetch(`https://api.fireworks.ai/v1/accounts/${fireworksAccountId}/datasets/${fireworksDatasetName}:upload`, {
      method: 'POST', 
      headers: { 'Authorization': `Bearer ${decryptedApiKey}` }, // Content-Type is set automatically by FormData
      body: uploadFormData,
    });

    if (!uploadFileResponse.ok) {
      // Use a different error message for this step
      throw await handleFireworksError(uploadFileResponse, "Fireworks dataset file upload failed", internalJobId, supabase);
    }
    // We might get info back about the file, but often just need the success status
    // const uploadResult = await uploadFileResponse.json();
    console.log(`[API_FW_CREATE] File content uploaded successfully to dataset '${fireworksDatasetName}'.`);

    // Update DB record status
    await supabase.from('fireworks_fine_tuning_jobs').update({ status: 'starting_fw_job' }).eq('id', internalJobId);

    // 7. STEP 3 (Fireworks Native): Start Fine-Tuning Job
    console.log(`[API_FW_CREATE] STEP 3: Starting supervised fine-tuning job on Fireworks for user ${userId}...`);
    
    // Ensure the baseModel ID has the correct prefix for the job creation API
    let finalBaseModelId = baseModel;
    if (!baseModel.startsWith('accounts/')) {
        finalBaseModelId = `accounts/fireworks/models/${baseModel}`;
        console.log(`[API_FW_CREATE] Prepended prefix to baseModel ID: ${finalBaseModelId}`);
    }

    // Clean the user-provided model name to be a valid ID segment
    const cleanedModelName = modelName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-') // Replace invalid chars with hyphens
        .replace(/-+/g, '-')       // Collapse multiple hyphens
        .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens
        
    if (!cleanedModelName) {
         throw new Error("Invalid Fine-tuned Model Name provided. Please use letters, numbers, and hyphens.");
    }

    // Construct the fully qualified output model name required by the API
    const finalOutputModelId = `accounts/${fireworksAccountId}/models/${cleanedModelName}`;
    
    // --- Construct the fully qualified dataset name required by the API --- 
    const finalDatasetId = `accounts/${fireworksAccountId}/datasets/${fireworksDatasetName}`;
    
    const jobPayload = {
      baseModel: finalBaseModelId, 
      dataset: finalDatasetId, // Use the fully qualified dataset name/ID
      outputModel: finalOutputModelId, 
    };
    console.log(`[API_FW_CREATE] Payload for starting supervised job:`, JSON.stringify(jobPayload, null, 2));

    const startJobResponse = await fetch(`https://api.fireworks.ai/v1/accounts/${fireworksAccountId}/supervisedFineTuningJobs`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${decryptedApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobPayload),
    });

    if (!startJobResponse.ok) {
        throw await handleFireworksError(startJobResponse, "Fireworks job start failed", internalJobId, supabase);
    }
    
    const startJobResult = await startJobResponse.json();
    const jobNameParts = startJobResult.name?.split('/');
    fireworksJobId = jobNameParts?.[jobNameParts.length - 1];
    
    if (!fireworksJobId) {
        const errorMessage = `Fireworks job start succeeded but response missing parsable job ID in 'name': ${JSON.stringify(startJobResult)}`;
        console.error(`[API_FW_CREATE] ${errorMessage} for user ${userId}`);
        await supabase.from('fireworks_fine_tuning_jobs').update({ status: 'failed', error_message: errorMessage }).eq('id', internalJobId);
        throw new Error(errorMessage);
    }
    
    const jobStatus = startJobResult.state || 'JOB_STATE_CREATING'; 
    console.log(`[API_FW_CREATE] Fine-tuning job started on Fireworks. Job ID: ${fireworksJobId}, State: ${jobStatus} for user ${userId}.`);

    // 8. Update Final Job Record in DB
    const { error: finalDbError } = await supabase
        .from('fireworks_fine_tuning_jobs')
        .update({ 
            fireworks_job_id: fireworksJobId,
            status: jobStatus 
        })
        .eq('id', internalJobId);
        
    if (finalDbError) {
        console.error(`[API_FW_CREATE] Failed to update job record with Fireworks Job ID for user ${userId}, internal ID ${internalJobId}:`, finalDbError);
    }
    console.log(`[API_FW_CREATE] DB record ${internalJobId} updated with job ID ${fireworksJobId} for user ${userId}.`);

    // 9. Return Success Response
    return NextResponse.json({ 
        message: 'Fireworks fine-tuning job initiated successfully.', 
        internalJobId: internalJobId, 
        fireworksJobId: fireworksJobId, 
        status: jobStatus 
    }, { status: 201 });

  } catch (error) {
    console.error(`[API_FW_CREATE] General Error for user ${userId}, internal job ${internalJobId}:`, error);
    if (internalJobId) {
         try {
             await supabase.from('fireworks_fine_tuning_jobs').update({ status: 'failed', error_message: error.message || 'Unknown error during job creation' }).eq('id', internalJobId);
         } catch (dbUpdateError) {
             console.error(`[API_FW_CREATE] Failed to update job status to failed in DB for job ${internalJobId}:`, dbUpdateError);
         }
     }
    
    if (error instanceof SyntaxError) { return new NextResponse('Invalid JSON', { status: 400 }); }
    return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
  }
}
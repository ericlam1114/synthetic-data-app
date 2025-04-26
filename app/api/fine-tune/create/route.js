import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import OpenAI, { toFile } from 'openai';
// Import Supabase helper for Route Handlers
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import { decrypt } from '@/lib/encryption'; // Corrected import path

// Initialize S3 Client
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});
const bucketName = process.env.AWS_S3_BUCKET;

// --- Function to get and decrypt API key ---
async function getDecryptedApiKey(userId, supabase) {
    try {
        console.log(`[API Fine-tune Create] Fetching encrypted key for user ${userId}...`);
        const { data: apiKeyData, error: keyFetchError } = await supabase
            .from('user_api_keys') // ASSUMED TABLE NAME
            .select('openai_api_key_encrypted')
            .eq('user_id', userId)
            .single();

        if (keyFetchError) throw keyFetchError; // Let main try/catch handle DB errors
        if (!apiKeyData?.openai_api_key_encrypted) {
            console.warn(`[API Fine-tune Create] No API key found in DB for user ${userId}`);
            return null;
        }
        
        console.log(`[API Fine-tune Create] Decrypting key for user ${userId}...`);
        const decryptedKey = decrypt(apiKeyData.openai_api_key_encrypted);
        if (!decryptedKey) throw new Error('Decryption failed. Key might be corrupted or encryption key is wrong.');
        
        console.log(`[API Fine-tune Create] Key decrypted successfully for user ${userId}.`);
        return decryptedKey;

    } catch (error) {
         // Log specific error but re-throw or return null for the caller to handle
         console.error(`[API Fine-tune Create] Error fetching/decrypting API key for user ${userId}:`, error);
         // Determine if the error should halt the process or just mean no key is available
         if (error.code === 'PGRST116') { // Row not found is expected if no key saved
            return null;
         }
         throw error; // Re-throw other errors (like decryption failure)
    }
}
// --- End Function to get and decrypt API key ---

// Helper function to check if a line is valid JSON
const tryParseJson = (line) => {
    try {
        return JSON.parse(line);
    } catch (e) {
        return null;
    }
};

// Placeholder for secure API key retrieval (implement later)
async function getOpenAIApiKey(userId, supabase) {
    // TODO: Fetch securely stored key from DB 
    console.warn("[API Fine-tune Create] Using API key directly from request - IMPLEMENT SECURE STORAGE.");
    return null; 
}

export async function POST(request) {
    console.log("POST /api/fine-tune/create called");
    const supabase = createRouteHandlerClient({ cookies });
    let userId = 'anonymous';
    let openaiFileId = null; // Keep track for potential cleanup
    let apiKeyToUse = null; // Define apiKeyToUse here to use in finally block

    try {
        // --- Authentication ---
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            console.warn("[API Fine-tune Create] Unauthorized attempt.", authError);
            return new NextResponse("Unauthorized", { status: 401 });
        }
        userId = user.id;

        // --- Get data from body (NO API Key expected anymore) ---
        const { outputKey, baseModel, modelName } = await request.json(); 

        if (!outputKey || !baseModel || !modelName) {
            return new NextResponse("Missing required fields (outputKey, baseModel, modelName)", { status: 400 });
        }

        // --- Get API Key securely ---
        apiKeyToUse = await getDecryptedApiKey(userId, supabase);
        if (!apiKeyToUse) {
            return new NextResponse("OpenAI API Key not found. Please save your key first.", { status: 403 }); // 403 Forbidden - key needed
        }
        const openai = new OpenAI({ apiKey: apiKeyToUse });

        console.log(`[API Fine-tune Create] User ${userId} starting job. Model: ${baseModel}, Name: ${modelName}, Key: ${outputKey}`);

        // --- Verify Dataset Ownership & Get Info ---
        const { data: dataset, error: fetchError } = await supabase
            .from('datasets')
            .select('id, format, name') // Fetch name too for filename
            .eq('output_key', outputKey)
            .eq('user_id', userId)
            .single();

        if (fetchError || !dataset) {
            console.warn(`[API Fine-tune Create] Dataset ${outputKey} not found or not owned by user ${userId}.`, fetchError);
            return new NextResponse("Dataset not found or access denied", { status: 404 });
        }
        // Ensure format is compatible
        if (!['jsonl', 'openai-jsonl'].includes(dataset.format?.toLowerCase())) {
             return new NextResponse(`Dataset format (${dataset.format}) is not compatible. Only JSONL is supported.`, { status: 400 });
        }

        // --- Download dataset from S3 ---
        console.log(`[API Fine-tune Create] Downloading dataset: ${outputKey}`);
        const fileContentBuffer = await getS3FileContent(outputKey); // Get Buffer
        console.log(`[API Fine-tune Create] Downloaded ${fileContentBuffer.length} bytes.`);

        // --- Upload file to OpenAI using the Buffer wrapped with toFile ---
        console.log("[API Fine-tune Create] Uploading file buffer via toFile to OpenAI...");
        const filename = dataset.name || outputKey.split('/').pop() || 'training_data.jsonl';
        try {
             const fileForUpload = await toFile(fileContentBuffer, filename); // Wrap buffer
             const uploadedFile = await openai.files.create({
                 file: fileForUpload, // Pass the wrapped file object
                 purpose: 'fine-tune'
             });
             openaiFileId = uploadedFile.id; 
             console.log(`[API Fine-tune Create] File uploaded to OpenAI. File ID: ${openaiFileId}`);
        } catch(uploadError) {
             console.error("[API Fine-tune Create] OpenAI file upload error:", uploadError);
             return new NextResponse(`OpenAI file upload failed: ${uploadError.message || 'Unknown Error'}`, { status: 500 });
        }
       
        // --- Create Fine-tuning Job on OpenAI ---
        console.log("[API Fine-tune Create] Creating fine-tuning job on OpenAI...");
        let fineTuneJob;
        try {
             fineTuneJob = await openai.fineTuning.jobs.create({
                 training_file: openaiFileId,
                 model: baseModel,
                 suffix: modelName, // Use provided model name as suffix
             });
             console.log(`[API Fine-tune Create] Fine-tuning job created. Job ID: ${fineTuneJob.id}, Status: ${fineTuneJob.status}`);
        } catch (jobError) {
             console.error("[API Fine-tune Create] OpenAI job creation error:", jobError);
             // Attempt to clean up the file if job creation fails
             if (openaiFileId) {
                 try { await openai.files.del(openaiFileId); console.log(`[API Fine-tune Create] Cleaned up OpenAI file ${openaiFileId}`); } catch (e) { console.error("Failed to cleanup OpenAI file:", e); }
             }
             return new NextResponse(`OpenAI job creation failed: ${jobError.message || 'Unknown Error'}`, { status: 500 });
        }
        
        // --- Store Job Info in Supabase (Assume table `fine_tuning_jobs` exists) ---
        console.log("[API Fine-tune Create] Saving job info to database...");
        const { data: newDbRecord, error: insertError } = await supabase
             .from('fine_tuning_jobs') // ASSUMED TABLE NAME
             .insert({
                 user_id: userId,
                 dataset_ids: [dataset.id], // Correct column name and use array
                 model_name: modelName,
                 base_model: baseModel,
                 openai_job_id: fineTuneJob.id,
                 openai_file_id: openaiFileId,
                 status: fineTuneJob.status,
                 // Add other fields like fine_tuned_model_id (null initially)
             })
             .select('id') // Select only the new record ID
             .single();

        if (insertError) {
            console.error("[API Fine-tune Create] Error saving job to DB:", insertError);
            // Attempt to cancel job and delete file if DB save fails
            try { await openai.fineTuning.jobs.cancel(fineTuneJob.id); console.log(`[API Fine-tune Create] Canceled OpenAI job ${fineTuneJob.id} due to DB error.`); } catch (e) { console.error("Failed to cancel OpenAI job:", e); }
            if (openaiFileId) {
                try { await openai.files.del(openaiFileId); console.log(`[API Fine-tune Create] Cleaned up OpenAI file ${openaiFileId}`); } catch (e) { console.error("Failed to cleanup OpenAI file:", e); }
            }
            return new NextResponse(`Database error saving job: ${insertError.message}`, { status: 500 });
        }

        console.log(`[API Fine-tune Create] Job ${fineTuneJob.id} saved to DB with internal ID: ${newDbRecord.id}`);

        // --- Return Success Response ---
        return NextResponse.json({ 
            message: "Fine-tuning job created successfully.", 
            jobId: fineTuneJob.id, 
            dbId: newDbRecord.id, 
            status: fineTuneJob.status 
        }, { status: 201 }); // Use 201 Created status

    } catch (error) {
        console.error(`[API Fine-tune Create] General Error for user ${userId}:`, error);
        // Attempt cleanup if file was uploaded before error
        if (openaiFileId && apiKeyToUse) {
            try {
                 const cleanupClient = new OpenAI({ apiKey: apiKeyToUse });
                 await cleanupClient.files.del(openaiFileId);
                 console.log(`[API Fine-tune Create] Cleaned up OpenAI file ${openaiFileId} after error.`);
            } catch (e) { console.error("Failed to cleanup OpenAI file after general error:", e); }
        }
        if (error instanceof SyntaxError) {
            return new NextResponse("Invalid JSON format in request body", { status: 400 });
        }
        return new NextResponse(`Internal Server Error: ${error.message || 'Unknown error'}`, { status: 500 });
    }
}

// --- Revert S3 Helper to download full content ---
async function getS3FileContent(key) {
    const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
    try {
        const { Body } = await s3Client.send(command);
        if (!Body) throw new Error('S3 Body is empty');
        // Convert stream to Buffer/String
        const chunks = [];
        for await (const chunk of Body) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    } catch (error) {
        console.error(`Failed to download/read S3 key ${key}:`, error);
        throw new Error(`Could not retrieve dataset file: ${key}. ${error.message}`);
    }
}
// --- End Revert --- 
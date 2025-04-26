import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { decrypt } from '@/lib/encryption'; 

// --- Function to get and decrypt API key (Copied from create route) ---
async function getDecryptedApiKey(userId, supabase) {
    try {
        const { data: apiKeyData, error: keyFetchError } = await supabase
            .from('user_api_keys')
            .select('openai_api_key_encrypted')
            .eq('user_id', userId)
            .single();
        if (keyFetchError) throw keyFetchError;
        if (!apiKeyData?.openai_api_key_encrypted) return null;
        const decryptedKey = decrypt(apiKeyData.openai_api_key_encrypted);
        if (!decryptedKey) throw new Error('Decryption failed');
        return decryptedKey;
    } catch (error) {
         console.error(`[API Status] Error fetching/decrypting API key for user ${userId}:`, error);
         if (error.code === 'PGRST116') return null;
         throw error; 
    }
}
// ---------------------------------------------------------------------

export async function GET(request) {
    console.log("GET /api/fine-tune/status called");
    const supabase = createRouteHandlerClient({ cookies });
    const { searchParams } = new URL(request.url);
    const openaiJobIdsParam = searchParams.get('jobIds');
    let userId = 'anonymous';

    if (!openaiJobIdsParam) {
        return new NextResponse("Missing jobIds query parameter", { status: 400 });
    }
    const openaiJobIds = openaiJobIdsParam.split(',').filter(Boolean);
    if (openaiJobIds.length === 0) {
        return NextResponse.json({ updatedJobs: [] }); // No IDs provided, return empty
    }

    try {
        // --- Authentication ---
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }
        userId = user.id;
        console.log(`[API Status] User ${userId} checking status for jobs:`, openaiJobIds);

        // --- Get API Key securely ---
        const apiKey = await getDecryptedApiKey(userId, supabase);
        if (!apiKey) {
             return new NextResponse("OpenAI API Key not configured.", { status: 403 });
        }
        const openai = new OpenAI({ apiKey });

        // --- Fetch status for each job and update DB --- 
        const updatedJobs = [];
        const dbUpdatePromises = [];

        for (const jobId of openaiJobIds) {
            try {
                console.log(`[API Status] Retrieving job ${jobId} from OpenAI...`);
                const jobDetails = await openai.fineTuning.jobs.retrieve(jobId);
                
                const updateData = {
                    status: jobDetails.status,
                    fine_tuned_model_id: jobDetails.fine_tuned_model, // Will be null until succeeded
                    error_message: jobDetails.error, // Store OpenAI error object
                    updated_at: new Date()
                };

                console.log(`[API Status] Updating DB for job ${jobId} with status: ${jobDetails.status}`);
                // Add DB update promise
                dbUpdatePromises.push(
                    supabase
                        .from('fine_tuning_jobs')
                        .update(updateData)
                        .eq('openai_job_id', jobId)
                        .eq('user_id', userId) // Ensure ownership
                        .select('id, openai_job_id, status, fine_tuned_model_id, error_message') // Select data to return
                        .single() // Expect only one row per job ID / user
                );

            } catch (openaiError) {
                console.error(`[API Status] Error fetching status for job ${jobId} from OpenAI:`, openaiError);
                // Store error in DB for this job if possible, or just log
                 dbUpdatePromises.push(
                     supabase
                         .from('fine_tuning_jobs')
                         .update({
                             status: 'error_fetching_status', // Custom status?
                             error_message: { apiError: openaiError.message || 'Unknown OpenAI API error' },
                             updated_at: new Date()
                         })
                         .eq('openai_job_id', jobId)
                         .eq('user_id', userId)
                         .select('id, openai_job_id, status, error_message')
                         .single()
                 );
                // Continue to next job ID even if one fails
            }
        }

        // --- Wait for all DB updates and collect results --- 
        const results = await Promise.allSettled(dbUpdatePromises);
        
        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value.data) {
                updatedJobs.push(result.value.data);
            } else {
                console.error(`[API Status] Failed DB update for OpenAI job ID: ${openaiJobIds[index]}:`, result.reason || result.value?.error);
                // Optionally include failed updates in response?
                 updatedJobs.push({ openai_job_id: openaiJobIds[index], status: 'db_update_failed', error: result.reason?.message || result.value?.error?.message });
            }
        });

        console.log(`[API Status] Finished status check for user ${userId}. Updated ${updatedJobs.length} jobs.`);
        return NextResponse.json({ updatedJobs });

    } catch (error) {
        console.error(`[API Status] General Error for user ${userId}:`, error);
        return new NextResponse(`Internal Server Error: ${error.message || 'Unknown error'}`, { status: 500 });
    }
} 
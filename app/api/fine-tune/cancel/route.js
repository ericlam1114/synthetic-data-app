import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { decrypt } from '@/lib/encryption'; 

// --- Function to get and decrypt API key --- 
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
         console.error(`[API Cancel] Error fetching/decrypting API key for user ${userId}:`, error);
         if (error.code === 'PGRST116') return null;
         throw error; 
    }
}
// ---------------------------------------------

export async function POST(request) {
    console.log("POST /api/fine-tune/cancel called");
    const supabase = createRouteHandlerClient({ cookies });
    let userId = 'anonymous';

    try {
        // --- Authentication ---
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }
        userId = user.id;

        // --- Get OpenAI Job ID from body ---
        const { openaiJobId } = await request.json();
        if (!openaiJobId) {
            return new NextResponse("Missing openaiJobId in request body", { status: 400 });
        }
        console.log(`[API Cancel] User ${userId} requesting cancellation for OpenAI Job ID: ${openaiJobId}`);

        // --- Verify ownership (Optional but recommended) ---
        // Check if a job with this openai_job_id exists for this user
        const { count, error: checkError } = await supabase
            .from('fine_tuning_jobs')
            .select('id', { count: 'exact', head: true }) // More efficient check
            .eq('openai_job_id', openaiJobId)
            .eq('user_id', userId);

        if (checkError) {
             console.error("[API Cancel] DB error checking job ownership:", checkError);
             return new NextResponse("Database error checking job", { status: 500 });
        }
        if (count === 0) {
            console.warn(`[API Cancel] User ${userId} attempted to cancel unowned/non-existent job ${openaiJobId}`);
            return new NextResponse("Job not found or access denied", { status: 404 });
        }
        // ---------------------------------------------

        // --- Get API Key securely ---
        const apiKey = await getDecryptedApiKey(userId, supabase);
        if (!apiKey) {
             return new NextResponse("OpenAI API Key not configured.", { status: 403 });
        }
        const openai = new OpenAI({ apiKey });
        // --------------------------

        // --- Attempt to Cancel on OpenAI ---
        console.log(`[API Cancel] Sending cancel request to OpenAI for job ${openaiJobId}...`);
        const cancelledJob = await openai.fineTuning.jobs.cancel(openaiJobId);
        console.log(`[API Cancel] OpenAI response status: ${cancelledJob.status}`);
        // ----------------------------------

        // --- Update Status in DB ---
        console.log(`[API Cancel] Updating DB status for job ${openaiJobId} to ${cancelledJob.status}`);
        const { data: updatedDbJob, error: updateError } = await supabase
             .from('fine_tuning_jobs')
             .update({ 
                 status: cancelledJob.status, // Use status returned by OpenAI
                 updated_at: new Date() 
              })
             .eq('openai_job_id', openaiJobId)
             .eq('user_id', userId)
             .select('id, openai_job_id, status') // Return relevant fields
             .single();
        
        if (updateError) {
             console.error(`[API Cancel] Failed to update DB status for job ${openaiJobId}:`, updateError);
             // Don't fail the whole request if DB update fails, but log it
             // Return the status from OpenAI anyway
              return NextResponse.json({
                 message: "Cancellation requested with OpenAI, but DB update failed.", 
                 jobId: cancelledJob.id, 
                 status: cancelledJob.status 
              }, { status: 207 }); // Multi-Status
        }
        // --------------------------

        return NextResponse.json({
             message: "Cancellation request processed.", 
             jobId: updatedDbJob.openai_job_id, 
             status: updatedDbJob.status 
        });

    } catch (error) {
        console.error(`[API Cancel] General Error for user ${userId}:`, error);
        let errorMessage = "Internal Server Error during cancellation.";
        let status = 500;
        if (error.status === 404) { // OpenAI might return 404 if job ID invalid/already done
           errorMessage = error.message || "Job not found on OpenAI or already completed/cancelled.";
           status = 404;
        } else if (error.message) {
            errorMessage = error.message;
        }
        return new NextResponse(errorMessage, { status });
    }
} 
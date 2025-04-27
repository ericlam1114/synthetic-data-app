import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { decrypt } from '../../../../../lib/cryptoUtils';

// Helper function for robust error response handling from Fireworks
async function handleFireworksError(response, defaultMessage) {
    let errorPayload = `${defaultMessage}: ${response.status} ${response.statusText || 'Unknown error'}`;
    let fireworksErrorDetail = 'No additional detail available';
    try {
        fireworksErrorDetail = await response.text(); 
        if (fireworksErrorDetail) {
            console.log("[API_FW_JOB_CANCEL] Raw Fireworks Error Response Body:", fireworksErrorDetail);
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
        console.warn("[API_FW_JOB_CANCEL] Could not read error response body from Fireworks.", e);
    }
    console.error(`[API_FW_JOB_CANCEL] Error: ${errorPayload}`);
    return new Error(errorPayload);
}

// Changed from DELETE to POST to handle request body
export async function POST(request) { 
  
  console.log(`[API_FW_JOB_CANCEL] Received POST request for job cancellation.`);
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  let userId = 'unknown';
  let internalJobId = null; // Get from body now

  try {
    // --- Get internalJobId from request body --- 
    const body = await request.json();
    internalJobId = body.internalJobId;
    if (!internalJobId) {
        return new NextResponse('Missing internalJobId in request body', { status: 400 });
    }
    // --------------------------------------------

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.warn('[API_FW_JOB_CANCEL] Unauthorized attempt.');
      return new NextResponse('Unauthorized', { status: 401 });
    }
    userId = user.id;
    console.log(`[API_FW_JOB_CANCEL] Authenticated user: ${userId}`);

    // 2. Retrieve job details from DB to get Fireworks Job ID and check ownership
    const { data: jobData, error: dbFetchError } = await supabase
      .from('fireworks_fine_tuning_jobs')
      .select('fireworks_job_id, status')
      .eq('id', internalJobId)
      .eq('user_id', userId)
      .single();

    if (dbFetchError) {
      console.error(`[API_FW_JOB_CANCEL] Error fetching job ${internalJobId} for user ${userId}:`, dbFetchError);
      if (dbFetchError.code === 'PGRST116') { // Not found or not owned
          return new NextResponse('Job not found or access denied', { status: 404 });
      }
      return new NextResponse('Database error fetching job', { status: 500 });
    }

    if (!jobData.fireworks_job_id || jobData.fireworks_job_id === 'NATIVE_WORKFLOW') {
        console.warn(`[API_FW_JOB_CANCEL] Job ${internalJobId} does not have a valid Fireworks Job ID to cancel.`);
        // Optionally update status if needed, but likely already failed/not started on FW side
         await supabase.from('fireworks_fine_tuning_jobs').update({ status: 'failed', error_message: 'Missing Fireworks Job ID' }).eq('id', internalJobId);
        return new NextResponse('Cannot cancel: Job was not successfully submitted to Fireworks.', { status: 400 });
    }
    
    // Check if job is already in a terminal state
    const terminalStates = ['completed', 'failed', 'cancelled', 'job_state_completed', 'job_state_failed', 'job_state_cancelled'];
    if (terminalStates.includes(jobData.status?.toLowerCase())) {
         console.log(`[API_FW_JOB_CANCEL] Job ${internalJobId} is already in a terminal state (${jobData.status}). No action needed.`);
         return new NextResponse('Job already completed or failed.', { status: 400 });
    }

    // 3. Retrieve and Decrypt Fireworks Credentials
    const encryptedApiKey = user.user_metadata?.encrypted_fireworks_api_key;
    const encryptedAccountId = user.user_metadata?.encrypted_fireworks_account_id;

    if (!encryptedApiKey || !encryptedAccountId) {
      return new NextResponse('Fireworks API key or Account ID not found in profile.', { status: 403 });
    }
    let decryptedApiKey;
    let fireworksAccountId;
    try {
        decryptedApiKey = decrypt(encryptedApiKey);
        fireworksAccountId = decrypt(encryptedAccountId);
    } catch (decryptError) {
        console.error(`[API_FW_JOB_CANCEL] Failed to decrypt credentials for user ${userId}:`, decryptError);
        return new NextResponse('Failed to process stored credentials.', { status: 500 });
    }

    // 4. Call Fireworks API to Cancel Job
    const fireworksJobId = jobData.fireworks_job_id;
    console.log(`[API_FW_JOB_CANCEL] Attempting to cancel Fireworks job ${fireworksJobId} for account ${fireworksAccountId}...`);

    const cancelResponse = await fetch(`https://api.fireworks.ai/v1/accounts/${fireworksAccountId}/supervisedFineTuningJobs/${fireworksJobId}`, {
        method: 'DELETE', // Use DELETE method as per Fireworks API docs for cancellation
        headers: { 'Authorization': `Bearer ${decryptedApiKey}` },
    });

    if (!cancelResponse.ok) {
        // Handle potential errors (e.g., job already completed/failed, not found on FW side)
        throw await handleFireworksError(cancelResponse, "Fireworks job cancellation failed");
    }
    
    console.log(`[API_FW_JOB_CANCEL] Cancellation request for Fireworks job ${fireworksJobId} successful.`);

    // 5. Update Job Status in DB
    const { error: dbUpdateError } = await supabase
        .from('fireworks_fine_tuning_jobs')
        .update({ status: 'cancelled' }) // Mark as cancelled
        .eq('id', internalJobId)
        .eq('user_id', userId);

    if (dbUpdateError) {
        console.error(`[API_FW_JOB_CANCEL] Failed to update job ${internalJobId} status to cancelled in DB:`, dbUpdateError);
        // Don't throw, cancellation on FW side was likely successful
    }

    return NextResponse.json({ message: 'Job cancellation requested successfully.' }, { status: 200 });

  } catch (error) {
    console.error(`[API_FW_JOB_CANCEL] General Error for job ${internalJobId}, user ${userId}:`, error);
    return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
  }
} 
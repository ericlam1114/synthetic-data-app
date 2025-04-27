import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { decrypt } from '../../../../../lib/cryptoUtils'; // Adjust path as needed

export async function GET(request) {
  console.log('[API_FW_STATUS] Received status check request.');
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  let userId = 'unknown';

  try {
    // 1. Authentication & Get User Credentials
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.warn('[API_FW_STATUS] Unauthorized attempt.');
      return new NextResponse('Unauthorized', { status: 401 });
    }
    userId = user.id;

    const encryptedApiKey = user.user_metadata?.encrypted_fireworks_api_key;
    const encryptedAccountId = user.user_metadata?.encrypted_fireworks_account_id; // Get encrypted Account ID

    if (!encryptedApiKey || !encryptedAccountId) { // Check for both
      console.warn(`[API_FW_STATUS] User ${userId} missing Fireworks API key or Account ID.`);
      // Decide how to handle: return 403 or proceed without API check?
      // For now, log and proceed, status won't update from API.
    }
    
    let decryptedApiKey = null;
    let fireworksAccountId = null; // Variable for decrypted Account ID
    try {
        if (encryptedApiKey) decryptedApiKey = decrypt(encryptedApiKey);
        if (encryptedAccountId) fireworksAccountId = decrypt(encryptedAccountId); // Decrypt Account ID
    } catch (decryptError) {
        console.error(`[API_FW_STATUS] Failed to decrypt Fireworks credentials for user ${userId}:`, decryptError);
        return new NextResponse('Failed to process stored credentials.', { status: 500 });
    }

    // 2. Get Job IDs from Query Params
    const { searchParams } = new URL(request.url);
    const internalJobIdsParam = searchParams.get('jobIds');
    if (!internalJobIdsParam) {
      return new NextResponse('Missing jobIds query parameter', { status: 400 });
    }
    const internalJobIds = internalJobIdsParam.split(',').filter(Boolean);
    if (internalJobIds.length === 0) {
        return NextResponse.json([]);
    }
    console.log(`[API_FW_STATUS] User ${userId} checking status for internal job IDs:`, internalJobIds);

    // 3. Fetch Job Details from DB (including fireworks_job_id)
    const { data: jobs, error: dbFetchError } = await supabase
      .from('fireworks_fine_tuning_jobs')
      .select('id, fireworks_job_id, status, fine_tuned_model_id')
      .in('id', internalJobIds)
      .eq('user_id', userId);

    if (dbFetchError) {
      console.error(`[API_FW_STATUS] DB Error fetching jobs for user ${userId}:`, dbFetchError);
      throw new Error(`Database error fetching job details: ${dbFetchError.message}`);
    }

    if (!jobs || jobs.length === 0) {
      console.log(`[API_FW_STATUS] No matching jobs found in DB for user ${userId} with IDs:`, internalJobIds);
      return NextResponse.json([]);
    }

    // 4. Check Status with Fireworks API & Update DB
    const updatedJobs = [];
    for (const job of jobs) {
      // Skip checking if job is already terminal OR if key/account ID is missing
      const isTerminal = ['succeeded', 'failed', 'cancelled', 'job_state_completed', 'job_state_failed', 'job_state_cancelled'].includes(job.status?.toLowerCase());
      if (!decryptedApiKey || !fireworksAccountId || !job.fireworks_job_id || (isTerminal && job.fine_tuned_model_id)) {
        if (!decryptedApiKey || !fireworksAccountId) console.warn(`[API_FW_STATUS] Skipping FW API check for job ${job.id} - User credentials missing/decryption failed.`);
        if (!job.fireworks_job_id) console.warn(`[API_FW_STATUS] Skipping FW API check for job ${job.id} - Missing fireworks_job_id.`);
        if (isTerminal && job.fine_tuned_model_id) console.log(`[API_FW_STATUS] Skipping FW API check for job ${job.id} - Already in terminal state (${job.status}) with model ID.`);
        updatedJobs.push(job);
        continue;
      }

      try {
          console.log(`[API_FW_STATUS] Checking Fireworks status for job ${job.id} (FW ID: ${job.fireworks_job_id}) for user ${userId} account ${fireworksAccountId}...`);
          // --- Use the correct SFTJ endpoint --- 
          const fireworksUrl = `https://api.fireworks.ai/v1/accounts/${fireworksAccountId}/supervisedFineTuningJobs/${job.fireworks_job_id}`;
          console.log(`[API_FW_STATUS] Using Fireworks URL: ${fireworksUrl}`); // Log the URL
          // ----------------------------------------
          const response = await fetch(fireworksUrl, {
              method: 'GET',
              headers: {
                  'Authorization': `Bearer ${decryptedApiKey}`,
                  'Accept': 'application/json',
              },
          });

          if (!response.ok) {
              console.error(`[API_FW_STATUS] Fireworks API error for job ${job.fireworks_job_id}, user ${userId}, account ${fireworksAccountId}. Status: ${response.status}`);
               try {
                   const errorBody = await response.json();
                   console.error(`[API_FW_STATUS] Fireworks error body:`, errorBody);
               } catch (e) { console.error(`[API_FW_STATUS] Could not parse Fireworks error body.`); }
               updatedJobs.push(job);
               continue;
          }

          const fireworksSftJobStatus = await response.json(); // Renamed variable for clarity
          // --- Add Logging Here --- 
          console.log(`[API_FW_STATUS] Raw Fireworks SFT Job Status Response for ${job.fireworks_job_id}:`, JSON.stringify(fireworksSftJobStatus, null, 2));
          // ------------------------
          
          // --- Adapt payload based on SFT Job response structure --- 
          // Assuming the SFT job response has a 'state' field for status and 'outputModel' for the model ID.
          // Adjust these field names based on the actual API response structure if different.
          const newStatus = fireworksSftJobStatus.state; // Use 'state' from SFT job response
          const newModelId = fireworksSftJobStatus.outputModel; // Use 'outputModel' 
          const errorMessage = fireworksSftJobStatus.error?.message; // Check for error message

          const updatePayload = {
              status: newStatus, // Update with status from SFT job response
              updated_at: new Date(), // Force update timestamp
          };
          if (newStatus === 'JOB_STATE_COMPLETED' && newModelId) {
              updatePayload.fine_tuned_model_id = newModelId;
              console.log(`[API_FW_STATUS] Job ${job.fireworks_job_id} succeeded. Tuned model ID: ${updatePayload.fine_tuned_model_id}`);
          }
           if (newStatus === 'JOB_STATE_FAILED' && errorMessage) {
              updatePayload.error_message = errorMessage;
              console.warn(`[API_FW_STATUS] Job ${job.fireworks_job_id} failed. Error: ${updatePayload.error_message}`);
          }
          // ---------------------------------------------------------
          
          // Only update if the status or relevant fields changed
          if (job.status !== updatePayload.status || (updatePayload.fine_tuned_model_id && job.fine_tuned_model_id !== updatePayload.fine_tuned_model_id) || (updatePayload.error_message && job.error_message !== updatePayload.error_message)) {
              // --- Add Logging Here --- 
              console.log(`[API_FW_STATUS] Detected change for job ${job.id}. Preparing DB update payload:`, updatePayload);
              // ------------------------
              console.log(`[API_FW_STATUS] Updating DB for internal job ${job.id} with payload:`, updatePayload);
              const { data: updatedDbJob, error: dbUpdateError } = await supabase
                  .from('fireworks_fine_tuning_jobs')
                  .update(updatePayload)
                  .eq('id', job.id)
                  .eq('user_id', userId)
                  .select('id, fireworks_job_id, status, fine_tuned_model_id')
                  .single();

              if (dbUpdateError) {
                  console.error(`[API_FW_STATUS] DB Error updating job ${job.id} for user ${userId}:`, dbUpdateError);
                  updatedJobs.push(job);
              } else if (updatedDbJob) {
                  updatedJobs.push(updatedDbJob);
              } else {
                   console.warn(`[API_FW_STATUS] DB update for job ${job.id} returned no data.`);
                   updatedJobs.push(job);
              }
          } else {
               console.log(`[API_FW_STATUS] No status change for job ${job.id}. Current DB status: ${job.status}, FW status: ${newStatus}`);
              updatedJobs.push(job);
          }

      } catch (fetchError) {
          console.error(`[API_FW_STATUS] Error during status check for job ${job.fireworks_job_id}:`, fetchError);
          updatedJobs.push(job);
      }
    }

    // 5. Return Updated Job Details
    console.log(`[API_FW_STATUS] Finished status check for user ${userId}. Returning ${updatedJobs.length} jobs.`);
    return NextResponse.json(updatedJobs);

  } catch (error) {
    console.error(`[API_FW_STATUS] General Error for user ${userId}:`, error);
    if (error instanceof SyntaxError) { return new NextResponse('Invalid JSON', { status: 400 }); }
    return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
  }
} 
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { decrypt } from '../../../../../lib/cryptoUtils'; // Adjust path as needed

export async function GET(request) {
  console.log('[API_FW_STATUS] Received status check request.');
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  let userId = 'unknown';

  try {
    // 1. Authentication & Get User Key
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.warn('[API_FW_STATUS] Unauthorized attempt.');
      return new NextResponse('Unauthorized', { status: 401 });
    }
    userId = user.id;

    const encryptedApiKey = user.user_metadata?.encrypted_fireworks_api_key;
    if (!encryptedApiKey) {
      console.warn(`[API_FW_STATUS] User ${userId} does not have Fireworks key for status check.`);
      // Return potentially stale data from DB without failing the whole request
      // Or return 403 if key is absolutely required for any status update?
      // Let's proceed but log this potential issue.
    }
    
    let decryptedApiKey = null;
    try {
        if (encryptedApiKey) decryptedApiKey = decrypt(encryptedApiKey);
    } catch (decryptError) {
        console.error(`[API_FW_STATUS] Failed to decrypt Fireworks key for user ${userId}:`, decryptError);
        return new NextResponse('Failed to process stored API key.', { status: 500 });
    }

    // 2. Get Job IDs from Query Params
    const { searchParams } = new URL(request.url);
    const internalJobIdsParam = searchParams.get('jobIds'); // Expecting comma-separated IDs
    if (!internalJobIdsParam) {
      return new NextResponse('Missing jobIds query parameter', { status: 400 });
    }
    const internalJobIds = internalJobIdsParam.split(',').filter(Boolean);
    if (internalJobIds.length === 0) {
        return NextResponse.json([]); // Return empty array if no valid IDs provided
    }
    console.log(`[API_FW_STATUS] User ${userId} checking status for internal job IDs:`, internalJobIds);

    // 3. Fetch Job Details from DB (including fireworks_job_id)
    const { data: jobs, error: dbFetchError } = await supabase
      .from('fireworks_fine_tuning_jobs')
      .select('id, fireworks_job_id, status, fine_tuned_model_id') // Select necessary fields
      .in('id', internalJobIds)
      .eq('user_id', userId); // Ensure user ownership

    if (dbFetchError) {
      console.error(`[API_FW_STATUS] DB Error fetching jobs for user ${userId}:`, dbFetchError);
      throw new Error(`Database error fetching job details: ${dbFetchError.message}`);
    }

    if (!jobs || jobs.length === 0) {
      console.log(`[API_FW_STATUS] No matching jobs found in DB for user ${userId} with IDs:`, internalJobIds);
      return NextResponse.json([]); // Return empty if no jobs found for this user
    }

    // 4. Check Status with Fireworks API & Update DB
    const updatedJobs = [];
    for (const job of jobs) {
      // Skip checking if job is already in a terminal state in our DB or if key is missing
      if (!decryptedApiKey || !job.fireworks_job_id || ['succeeded', 'failed', 'cancelled'].includes(job.status)) {
        if (!decryptedApiKey) console.warn(`[API_FW_STATUS] Skipping Fireworks API check for job ${job.id} - User key missing/decryption failed.`);
        if (!job.fireworks_job_id) console.warn(`[API_FW_STATUS] Skipping Fireworks API check for job ${job.id} - Missing fireworks_job_id.`);
        updatedJobs.push(job); // Return the job as is from DB
        continue;
      }

      try {
          console.log(`[API_FW_STATUS] Checking Fireworks status for job ${job.id} (FW ID: ${job.fireworks_job_id}) for user ${userId}...`);
          const fireworksUrl = `https://api.fireworks.ai/v1/fine-tunes/${job.fireworks_job_id}`;
          const response = await fetch(fireworksUrl, {
              method: 'GET',
              headers: {
                  'Authorization': `Bearer ${decryptedApiKey}`,
                  'Accept': 'application/json',
              },
          });

          if (!response.ok) {
              // Don't fail the whole request, just log and skip update for this job
              console.error(`[API_FW_STATUS] Fireworks API error for job ${job.fireworks_job_id}, user ${userId}. Status: ${response.status}`);
               // Attempt to read error body
               try {
                   const errorBody = await response.json();
                   console.error(`[API_FW_STATUS] Fireworks error body:`, errorBody);
                   // Optionally update DB with error? For now, just skip.
               } catch (e) { console.error(`[API_FW_STATUS] Could not parse Fireworks error body.`); }
               updatedJobs.push(job); // Keep existing job data
               continue;
          }

          const fireworksStatus = await response.json();
          
          // Prepare update payload for our DB
          const updatePayload = {
              status: fireworksStatus.status, // Update with status from Fireworks
              updated_at: new Date(), // Force update timestamp
          };
          if (fireworksStatus.status === 'succeeded' && fireworksStatus.fine_tuned_model) {
              updatePayload.fine_tuned_model_id = fireworksStatus.fine_tuned_model;
              console.log(`[API_FW_STATUS] Job ${job.fireworks_job_id} succeeded. Tuned model ID: ${updatePayload.fine_tuned_model_id}`);
          }
           if (fireworksStatus.status === 'failed' && fireworksStatus.error?.message) {
              updatePayload.error_message = fireworksStatus.error.message;
              console.warn(`[API_FW_STATUS] Job ${job.fireworks_job_id} failed. Error: ${updatePayload.error_message}`);
          }
          
          // Only update if the status or relevant fields changed
          if (job.status !== updatePayload.status || (updatePayload.fine_tuned_model_id && job.fine_tuned_model_id !== updatePayload.fine_tuned_model_id) || updatePayload.error_message) {
              console.log(`[API_FW_STATUS] Updating DB for internal job ${job.id} with payload:`, updatePayload);
              const { data: updatedDbJob, error: dbUpdateError } = await supabase
                  .from('fireworks_fine_tuning_jobs')
                  .update(updatePayload)
                  .eq('id', job.id)
                  .eq('user_id', userId) // Ensure ownership again for safety
                  .select('id, fireworks_job_id, status, fine_tuned_model_id') // Return updated fields
                  .single();

              if (dbUpdateError) {
                  console.error(`[API_FW_STATUS] DB Error updating job ${job.id} for user ${userId}:`, dbUpdateError);
                  // Push original job data on error to avoid losing it in response
                  updatedJobs.push(job);
              } else if (updatedDbJob) {
                  updatedJobs.push(updatedDbJob);
              } else {
                   console.warn(`[API_FW_STATUS] DB update for job ${job.id} returned no data.`);
                   updatedJobs.push(job); // Push original if update returns null
              }
          } else {
               console.log(`[API_FW_STATUS] No status change for job ${job.id}.`);
              updatedJobs.push(job); // Status hasn't changed, push original data
          }

      } catch (fetchError) {
          console.error(`[API_FW_STATUS] Error fetching status from Fireworks for job ${job.fireworks_job_id}:`, fetchError);
          updatedJobs.push(job); // Keep existing job data on fetch error
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
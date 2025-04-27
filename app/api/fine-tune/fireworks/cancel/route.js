import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { decrypt } from '../../../../../lib/cryptoUtils'; // Adjust path as needed

export async function POST(request) {
  console.log('[API_FW_CANCEL] Received cancel request.');
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  let userId = 'unknown';
  let internalJobId = null;

  try {
    // 1. Authentication & Get User Key
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.warn('[API_FW_CANCEL] Unauthorized attempt.');
      return new NextResponse('Unauthorized', { status: 401 });
    }
    userId = user.id;
    console.log(`[API_FW_CANCEL] Authenticated user: ${userId}`);

    // 2. Get internalJobId from request body
    // Using internal ID is safer as it implies ownership check during lookup
    const body = await request.json(); 
    internalJobId = body.internalJobId;
    if (!internalJobId) {
       return new NextResponse('Missing internalJobId in request body', { status: 400 });
    }
    console.log(`[API_FW_CANCEL] Request to cancel internal job ID: ${internalJobId}`);

    // 3. Retrieve Job Details (including fireworks_job_id) & Decrypt Key
    const { data: job, error: dbFetchError } = await supabase
        .from('fireworks_fine_tuning_jobs')
        .select('id, fireworks_job_id, status')
        .eq('id', internalJobId)
        .eq('user_id', userId) // Verify ownership
        .single();

    if (dbFetchError || !job) {
         console.error(`[API_FW_CANCEL] Job ${internalJobId} not found or not owned by user ${userId}. Error:`, dbFetchError);
         return new NextResponse('Job not found or access denied.', { status: 404 });
    }
    
    if (!job.fireworks_job_id) {
        return new NextResponse('Fireworks job ID missing for this record.', { status: 400 });
    }
    
    // Check if job is already in a terminal state
    if (['succeeded', 'failed', 'cancelled', 'completed'].includes(job.status?.toLowerCase())) {
        return new NextResponse(`Job is already in a terminal state (${job.status}).`, { status: 400 });
    }

    const encryptedApiKey = user.user_metadata?.encrypted_fireworks_api_key;
    if (!encryptedApiKey) {
      console.warn(`[API_FW_CANCEL] User ${userId} has no Fireworks API key stored.`);
      return new NextResponse('Fireworks API key not found.', { status: 403 });
    }
    
    let decryptedApiKey = null;
    try {
        decryptedApiKey = decrypt(encryptedApiKey);
    } catch (decryptError) {
        console.error(`[API_FW_CANCEL] Failed to decrypt Fireworks key for user ${userId}:`, decryptError);
        return new NextResponse('Failed to process stored API key.', { status: 500 });
    }
    console.log(`[API_FW_CANCEL] Decrypted key for user ${userId}. Proceeding with cancel API call.`);

    // 4. Call Fireworks Cancel API
    const fireworksUrl = `https://api.fireworks.ai/v1/fine-tunes/${job.fireworks_job_id}/cancel`;
    const response = await fetch(fireworksUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${decryptedApiKey}`,
        'Accept': 'application/json',
      },
    });

    const cancelResult = await response.json();

    if (!response.ok) {
      console.error(`[API_FW_CANCEL] Fireworks cancel API failed for job ${job.fireworks_job_id}, user ${userId}. Status: ${response.status}`, cancelResult);
      // Attempt to update DB status even on API failure if possible? Or just report error?
      // Let's report the error from Fireworks.
      throw new Error(`Fireworks API error during cancellation: ${cancelResult.message || response.statusText}`);
    }
    
    console.log(`[API_FW_CANCEL] Fireworks cancel API successful for job ${job.fireworks_job_id}. Response:`, cancelResult);
    const newStatus = cancelResult.status || 'cancelling'; // Use status from response if available

    // 5. Update Job Status in DB
    const { error: dbUpdateError } = await supabase
      .from('fireworks_fine_tuning_jobs')
      .update({ status: newStatus, updated_at: new Date() })
      .eq('id', internalJobId)
      .eq('user_id', userId);

    if (dbUpdateError) {
      console.error(`[API_FW_CANCEL] Failed to update job ${internalJobId} status to '${newStatus}' in DB for user ${userId}:`, dbUpdateError);
      // Log error but still return success from the API call perspective
    }

    // 6. Return Success Response
    return NextResponse.json({ 
        message: 'Fireworks fine-tuning job cancellation requested successfully.', 
        internalJobId: internalJobId, 
        fireworksJobId: job.fireworks_job_id,
        status: newStatus
    });

  } catch (error) {
    console.error(`[API_FW_CANCEL] General Error for user ${userId}, job ${internalJobId}:`, error);
    return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
  }
} 
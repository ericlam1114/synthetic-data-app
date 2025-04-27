import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request) {
  console.log(`[API_BULK_DELETE] Received POST request`);
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  let userId = 'unknown';

  try {
    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.warn('[API_BULK_DELETE] Unauthorized attempt.');
      return new NextResponse('Unauthorized', { status: 401 });
    }
    userId = user.id;
    console.log(`[API_BULK_DELETE] Authenticated user: ${userId}`);

    // 2. Get job IDs from request body
    const { jobIds } = await request.json();
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return new NextResponse('Missing or invalid jobIds array in request body', { status: 400 });
    }
    console.log(`[API_BULK_DELETE] Attempting to delete ${jobIds.length} job records for user ${userId}.`);

    // 3. Perform delete operations on both tables, ensuring ownership
    // We run them sequentially for simplicity, could be parallelized with Promise.all
    
    // --- Add logging before delete --- 
    console.log(`[API_BULK_DELETE] Querying 'fine_tuning_jobs': Deleting IDs [${jobIds.join(', ')}] for user ${userId}`);
    // ---------------------------------
    
    // Delete from OpenAI table
    const { error: deleteOpenAIError, count: countOpenAI } = await supabase
      .from('fine_tuning_jobs')
      .delete({ count: 'exact' }) // Request count of deleted rows
      .in('id', jobIds)
      .eq('user_id', userId);
      
    if (deleteOpenAIError) {
      console.error(`[API_BULK_DELETE] DB delete error (OpenAI jobs) for user ${userId}:`, deleteOpenAIError);
      // Don't stop here, try deleting from the other table too
    }
    console.log(`[API_BULK_DELETE] Deleted ${countOpenAI || 0} records from fine_tuning_jobs.`);

    // --- Add logging before delete --- 
    console.log(`[API_BULK_DELETE] Querying 'fireworks_fine_tuning_jobs': Deleting IDs [${jobIds.join(', ')}] for user ${userId}`);
    // ---------------------------------

    // Delete from Fireworks table
    const { error: deleteFireworksError, count: countFireworks } = await supabase
      .from('fireworks_fine_tuning_jobs')
      .delete({ count: 'exact' }) // Request count of deleted rows
      .in('id', jobIds)
      .eq('user_id', userId);

    if (deleteFireworksError) {
      console.error(`[API_BULK_DELETE] DB delete error (Fireworks jobs) for user ${userId}:`, deleteFireworksError);
      // If the first delete also failed, return a general error
      if (deleteOpenAIError) {
          return new NextResponse(`Database error during bulk delete.`, { status: 500 });
      }
    }
     console.log(`[API_BULK_DELETE] Deleted ${countFireworks || 0} records from fireworks_fine_tuning_jobs.`);

    // If either delete had an error but the other might have succeeded, maybe return a mixed response?
    // For now, return success if at least one delete operation didn't error out entirely.
    if (deleteOpenAIError && deleteFireworksError) {
        return new NextResponse('Failed to delete job records from both sources.', { status: 500 });
    }

    const totalDeleted = (countOpenAI || 0) + (countFireworks || 0);
    console.log(`[API_BULK_DELETE] Total records deleted: ${totalDeleted} for user ${userId}.`);
    return NextResponse.json({ message: `${totalDeleted} job record(s) deleted successfully.` }, { status: 200 });

  } catch (error) {
    console.error(`[API_BULK_DELETE] General Error for user ${userId}:`, error);
     if (error instanceof SyntaxError) { return new NextResponse('Invalid JSON', { status: 400 }); }
    return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
  }
} 
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function DELETE(request, { params }) {
  const internalJobId = params.id; // Get ID from the path parameter
  console.log(`[API_FW_JOB_DELETE] Received DELETE request for internal job ID: ${internalJobId}`);
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  let userId = 'unknown';

  try {
    // 1. Authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.warn('[API_FW_JOB_DELETE] Unauthorized attempt.');
      return new NextResponse('Unauthorized', { status: 401 });
    }
    userId = user.id;
    console.log(`[API_FW_JOB_DELETE] Authenticated user: ${userId}`);

    if (!internalJobId) {
      return new NextResponse('Missing internal job ID in path', { status: 400 });
    }

    // 2. Delete the job record from the database, ensuring ownership
    const { error: deleteError } = await supabase
      .from('fireworks_fine_tuning_jobs')
      .delete()
      .eq('id', internalJobId)
      .eq('user_id', userId); // IMPORTANT: Verify ownership

    if (deleteError) {
        // Check if the error is because the row didn't exist or wasn't owned (Supabase might return error or just 0 count)
        // PostgREST error P0001 might indicate RLS failure, or just no rows matched.
        // Let's assume any DB error means it failed.
        console.error(`[API_FW_JOB_DELETE] DB delete error for user ${userId}, job ${internalJobId}:`, deleteError);
        // Consider checking deleteError.code if specific errors need different handling
        return new NextResponse(`Database error deleting job record: ${deleteError.message}`, { status: 500 });
    }
    
    // Note: Supabase delete doesn't explicitly tell you if 0 rows were deleted vs 1 unless you select first.
    // We rely on the RLS and eq(user_id) to prevent unauthorized deletion.
    // If the query succeeds without error, assume it worked or the record was already gone/not owned.
    
    console.log(`[API_FW_JOB_DELETE] Job record ${internalJobId} deleted successfully (or was not found/owned) for user ${userId}.`);
    return new NextResponse('Fireworks job record deleted successfully.', { status: 200 });

  } catch (error) {
    console.error(`[API_FW_JOB_DELETE] General Error for user ${userId}, job ${internalJobId}:`, error);
    return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
  }
} 
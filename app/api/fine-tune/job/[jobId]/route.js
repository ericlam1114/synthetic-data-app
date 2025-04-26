import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function DELETE(request, { params }) {
    const jobId = params.jobId; // Get job ID from the dynamic route parameter
    console.log(`DELETE /api/fine-tune/job/${jobId} called`);
    const supabase = createRouteHandlerClient({ cookies });
    let userId = 'anonymous';

    if (!jobId) {
        return new NextResponse("Missing job ID in route parameter", { status: 400 });
    }

    try {
        // --- Authentication ---
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }
        userId = user.id;
        console.log(`[API Delete Job] User ${userId} attempting to delete job record: ${jobId}`);

        // --- Delete the job record from Supabase ---
        const { error: deleteError } = await supabase
            .from('fine_tuning_jobs')
            .delete()
            .eq('id', jobId)
            .eq('user_id', userId); // Ensure user owns the record

        if (deleteError) {
            // Handle case where the record wasn't found (or didn't match user)
            if (deleteError.code === 'PGRST116') { 
                console.warn(`[API Delete Job] Job record ${jobId} not found or not owned by user ${userId}.`);
                return new NextResponse("Job record not found or access denied", { status: 404 });
            }
            // Otherwise, it's a different DB error
            console.error(`[API Delete Job] DB delete error for user ${userId}, job ${jobId}:`, deleteError);
            return new NextResponse(`Database error deleting job record: ${deleteError.message}`, { status: 500 });
        }

        console.log(`[API Delete Job] Successfully deleted job record ${jobId} for user ${userId}`);
        return NextResponse.json({ message: "Job record deleted successfully." }, { status: 200 });

    } catch (error) {
        console.error(`[API Delete Job] General Error for user ${userId}, job ${jobId}:`, error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
} 
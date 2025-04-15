// app/api/jobs/status/route.js
import { NextResponse } from 'next/server';
import documentQueue from '../../../../lib/queue/documentQueue';
import { getJobStatus, resumeJob } from '../../../../lib/workers/documentProcessor';

/**
 * GET handler for job status
 * Returns detailed status of a specific job by ID
 */
export async function GET(request) {
  try {
    // Get job ID from query params
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('id');
    
    if (!jobId) {
      return NextResponse.json({ error: 'No job ID provided' }, { status: 400 });
    }
    
    // Get job status
    const jobStatus = await documentQueue.getStatus(jobId);
    
    if (!jobStatus) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    
    // Return job status
    return NextResponse.json(jobStatus);
  } catch (error) {
    console.error('Error getting job status:', error);
    return NextResponse.json(
      { error: 'Failed to get job status', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST handler for job management operations
 * Can be used to list all jobs or perform operations on a specific job
 */
export async function POST(request) {
  try {
    // Parse request
    const requestData = await request.json();
    const { jobId, action } = requestData;
    
    if (!jobId) {
      return NextResponse.json({ error: 'No job ID provided' }, { status: 400 });
    }
    
    // Handle different actions
    switch (action) {
      case 'resume':
        const resumedJob = await documentQueue.resumeJob(jobId);
        return NextResponse.json({
          message: `Job ${jobId} resumed`,
          job: resumedJob
        });
        
      default:
        return NextResponse.json(
          { error: `Unsupported action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in job action API:', error);
    return NextResponse.json(
      { error: 'Failed to perform job action', details: error.message },
      { status: 500 }
    );
  }
}
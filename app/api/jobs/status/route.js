// app/api/jobs/status/route.js
import { NextResponse } from 'next/server';
import jobQueue from '../../../../lib/queue/jobQueue';

export async function GET(request) {
  // Get job ID from query params
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('id');
  
  if (!jobId) {
    return NextResponse.json({ error: 'No job ID provided' }, { status: 400 });
  }
  
  // Get job status
  const job = jobQueue.getJob(jobId);
  
  if (!job) {
    return NextResponse.json({ error: `Job ${jobId} not found` }, { status: 404 });
  }
  
  // Create a sanitized copy without the function
  const sanitizedJob = { ...job };
  delete sanitizedJob.fn; // Don't return the function
  
  return NextResponse.json(sanitizedJob);
}

export async function POST(request) {
  try {
    // Get all jobs (admin only)
    const allJobs = jobQueue.getAllJobs();
    
    // Sanitize jobs (remove function references)
    const sanitized = {
      queued: allJobs.queued.map(job => {
        const { fn, ...rest } = job;
        return rest;
      }),
      running: allJobs.running.map(job => {
        const { fn, ...rest } = job;
        return rest;
      }),
      completed: allJobs.completed.map(job => {
        const { fn, ...rest } = job;
        return rest;
      }),
      failed: allJobs.failed.map(job => {
        const { fn, ...rest } = job;
        return rest;
      })
    };
    
    return NextResponse.json(sanitized);
  } catch (error) {
    console.error('Error getting jobs:', error);
    return NextResponse.json(
      { error: 'Failed to get jobs', details: error.message },
      { status: 500 }
    );
  }
}
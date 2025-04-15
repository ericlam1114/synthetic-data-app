// app/api/jobs/queue/route.js
import { NextResponse } from 'next/server';
import jobQueue from '../../../../lib/queue/jobQueue';
import { processDocumentInBackground } from '../../../../lib/workers/documentProcessor';

export async function POST(request) {
  try {
    const { textKey, pipelineType, options } = await request.json();
    
    if (!textKey) {
      return NextResponse.json({ error: 'No text key provided' }, { status: 400 });
    }
    
    // Add job to queue
    const jobId = jobQueue.add(
      async (jobContext) => {
        // Process document in background
        return await processDocumentInBackground(textKey, pipelineType, options, jobContext);
      },
      { 
        textKey, 
        pipelineType, 
        options,
        type: 'document_processing'
      }
    );
    
    // Return job ID immediately
    return NextResponse.json({ 
      jobId,
      message: 'Document processing job added to queue',
      status: 'queued'
    });
    
  } catch (error) {
    console.error('Error queueing document processing job:', error);
    return NextResponse.json(
      { error: 'Failed to queue processing job', details: error.message },
      { status: 500 }
    );
  }
}
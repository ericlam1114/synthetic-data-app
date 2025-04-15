// Modified version of app/api/extract/route.js - No demo/fallback
import { NextResponse } from 'next/server';
import { 
  S3Client, 
  GetObjectCommand, 
  PutObjectCommand 
} from '@aws-sdk/client-s3';
import { 
  TextractClient, 
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand
} from '@aws-sdk/client-textract';
import getConfig from 'next/config';
import { v4 as uuidv4 } from 'uuid';

// Get server-side config
const { serverRuntimeConfig } = getConfig();

// Initialize AWS clients
const s3Client = new S3Client({
  region: serverRuntimeConfig.aws.region,
  credentials: {
    accessKeyId: serverRuntimeConfig.aws.accessKeyId,
    secretAccessKey: serverRuntimeConfig.aws.secretAccessKey
  }
});

const textractClient = new TextractClient({
  region: serverRuntimeConfig.aws.region,
  credentials: {
    accessKeyId: serverRuntimeConfig.aws.accessKeyId,
    secretAccessKey: serverRuntimeConfig.aws.secretAccessKey
  }
});

// Helper function to wait for job completion
// Helper function to wait for job completion
const waitForJobCompletion = async (jobId) => {
  let jobStatus = 'IN_PROGRESS';
  let maxRetries = 600; // 10 minutes at 1 second intervals
  let waitTime = 1000; // Start with 1 second wait
  
  // For large documents, use adaptive waiting to reduce API calls
  let consecutiveWaits = 0;
  
  while (jobStatus === 'IN_PROGRESS' && maxRetries > 0) {
    const getResultsCommand = new GetDocumentTextDetectionCommand({
      JobId: jobId
    });
    
    try {
      const response = await textractClient.send(getResultsCommand);
      jobStatus = response.JobStatus;
      
      if (jobStatus === 'IN_PROGRESS') {
        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, waitTime));
        maxRetries--;
        
        // Adaptive waiting - increase wait time for long-running jobs
        consecutiveWaits++;
        if (consecutiveWaits > 10) {
          // Increase wait time to reduce API calls for large documents
          waitTime = Math.min(5000, waitTime * 1.5); // Gradually increase up to 5 seconds
          console.log(`Increasing wait time to ${waitTime}ms for large document processing (${maxRetries} retries remaining)`);
        }
      } else {
        return response;
      }
    } catch (error) {
      console.error(`Error checking job status: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      maxRetries--;
    }
  }
  
  throw new Error(`Textract job (${jobId}) is taking longer than expected. Please check the job status later.`);
};

// Helper function to collect all results (handling pagination)
const getAllResults = async (jobId) => {
  let nextToken = null;
  let blocks = [];
  
  do {
    const getResultsCommand = new GetDocumentTextDetectionCommand({
      JobId: jobId,
      NextToken: nextToken
    });
    
    const response = await textractClient.send(getResultsCommand);
    
    if (response.Blocks) {
      blocks = blocks.concat(response.Blocks);
    }
    
    nextToken = response.NextToken;
  } while (nextToken);
  
  return blocks;
};

export async function POST(request) {
  try {
    const { fileKey } = await request.json();
    
    if (!fileKey) {
      return NextResponse.json({ error: 'No file key provided' }, { status: 400 });
    }
    
    // Start asynchronous document text detection
    console.log(`Starting asynchronous text detection for document: ${fileKey}`);
    
    const startCommand = new StartDocumentTextDetectionCommand({
      DocumentLocation: {
        S3Object: {
          Bucket: serverRuntimeConfig.aws.s3Bucket,
          Name: fileKey
        }
      }
    });
    
    const startResponse = await textractClient.send(startCommand);
    const jobId = startResponse.JobId;
    
    console.log(`Started text detection job with ID: ${jobId}`);
    
    // Wait for the job to complete (polling approach - in production you'd use SNS)
    console.log('Waiting for job completion...');
    const completedJob = await waitForJobCompletion(jobId);
    
    if (completedJob.JobStatus === 'SUCCEEDED') {
      // Get all the results, handling pagination if needed
      console.log('Job completed, collecting results...');
      const blocks = await getAllResults(jobId);
      
      // Extract text from the LINE blocks
      const extractedText = blocks
        .filter(block => block.BlockType === 'LINE')
        .map(block => block.Text)
        .join('\n');
      
      console.log(`Extracted ${extractedText.length} characters of text`);
      
      // Save extracted text to S3
      const textKey = `text/${uuidv4()}.txt`;
      
      await s3Client.send(new PutObjectCommand({
        Bucket: serverRuntimeConfig.aws.s3Bucket,
        Key: textKey,
        Body: extractedText,
        ContentType: 'text/plain'
      }));
      
      console.log(`Saved extracted text to S3 with key: ${textKey}`);
      
      // Return the text key for further processing
      return NextResponse.json({ textKey });
    } else {
      throw new Error(`Textract job failed with status: ${completedJob.JobStatus}`);
    }
  } catch (error) {
    console.error('Error extracting text:', error);
    return NextResponse.json(
      { error: 'Failed to extract text', details: error.message },
      { status: 500 }
    );
  }
}
// File: app/api/extract/route.js
import { NextResponse } from 'next/server';
import { 
  S3Client, 
  GetObjectCommand, 
  PutObjectCommand 
} from '@aws-sdk/client-s3';
import { 
  TextractClient, 
  DetectDocumentTextCommand,
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

export async function POST(request) {
  try {
    const { fileKey } = await request.json();
    
    if (!fileKey) {
      return NextResponse.json({ error: 'No file key provided' }, { status: 400 });
    }
    
    // Extract text using Textract - using synchronous API for smaller documents
    // For larger docs would need to use async API with SNS/SQS
    const detectTextCommand = new DetectDocumentTextCommand({
      Document: {
        S3Object: {
          Bucket: serverRuntimeConfig.aws.s3Bucket,
          Name: fileKey
        }
      }
    });
    
    const textractResponse = await textractClient.send(detectTextCommand);
    
    // Process Textract response to extract text
    const extractedText = textractResponse.Blocks
      .filter(block => block.BlockType === 'LINE')
      .map(block => block.Text)
      .join('\n');
    
    // Save extracted text to S3
    const textKey = `text/${uuidv4()}.txt`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: serverRuntimeConfig.aws.s3Bucket,
      Key: textKey,
      Body: extractedText,
      ContentType: 'text/plain'
    }));
    
    // Return the text key for further processing
    return NextResponse.json({ textKey });
    
  } catch (error) {
    console.error('Error extracting text:', error);
    return NextResponse.json(
      { error: 'Failed to extract text', details: error.message },
      { status: 500 }
    );
  }
}

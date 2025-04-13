// File: app/api/process/route.js
import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import getConfig from 'next/config';
import { v4 as uuidv4 } from 'uuid';
import SyntheticDataPipeline from '../../../lib/SyntheticDataPipeline';

// Get server-side config
const { serverRuntimeConfig } = getConfig();

// Initialize S3 client
const s3Client = new S3Client({
  region: serverRuntimeConfig.aws.region,
  credentials: {
    accessKeyId: serverRuntimeConfig.aws.accessKeyId,
    secretAccessKey: serverRuntimeConfig.aws.secretAccessKey
  }
});

// Custom ReadableStream transformer for streaming progress updates
function createProgressStream(onProgress) {
  let encoder = new TextEncoder();
  
  return new TransformStream({
    start(controller) {
      // Send initial progress
      controller.enqueue(
        encoder.encode(JSON.stringify({
          progress: 0,
          stage: 'initializing',
          message: 'Starting pipeline processing'
        }))
      );
    },
    transform(chunk, controller) {
      // Pass through the chunk
      controller.enqueue(chunk);
    },
    flush(controller) {
      // Final progress update
      controller.enqueue(
        encoder.encode(JSON.stringify({
          progress: 100,
          stage: 'complete',
          message: 'Processing complete'
        }))
      );
    }
  });
}

export async function POST(request) {
  // Create a streaming response
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  
  // Start processing in the background and stream updates
  (async () => {
    try {
      const { textKey, outputFormat, classFilter, prioritizeImportant } = await request.json();
      
      if (!textKey) {
        await writer.write(encoder.encode(JSON.stringify({ 
          error: 'No text key provided' 
        })));
        await writer.close();
        return;
      }
      
      // Get the extracted text from S3
      const getObjectCommand = new GetObjectCommand({
        Bucket: serverRuntimeConfig.aws.s3Bucket,
        Key: textKey
      });
      
      const s3Response = await s3Client.send(getObjectCommand);
      const s3Body = await s3Response.Body.transformToString();
      
      // Send progress update
      await writer.write(encoder.encode(JSON.stringify({
        progress: 5,
        stage: 'initialization',
        message: 'Retrieved text, initializing pipeline'
      })));
      
      // Initialize the pipeline with progress callback
      const pipeline = new SyntheticDataPipeline({
        apiKey: serverRuntimeConfig.openai.apiKey,
        outputFormat: outputFormat || 'openai-jsonl',
        classFilter: classFilter || 'all',
        prioritizeImportant: prioritizeImportant !== undefined ? prioritizeImportant : true,
        onProgress: async (progressData) => {
          // Stream progress updates to client
          await writer.write(encoder.encode(JSON.stringify(progressData)));
        }
      });
      
      // Process the text through the pipeline
      const result = await pipeline.process(s3Body);
      
      // Save the output to S3
      const outputKey = `output/${uuidv4()}.${outputFormat === 'json' ? 'json' : 'jsonl'}`;
      
      await s3Client.send(new PutObjectCommand({
        Bucket: serverRuntimeConfig.aws.s3Bucket,
        Key: outputKey,
        Body: result.output,
        ContentType: outputFormat === 'json' ? 'application/json' : 'application/jsonl'
      }));
      
      // Send the final result
      await writer.write(encoder.encode(JSON.stringify({
        success: true,
        data: result.output,
        stats: result.stats,
        outputKey,
        format: outputFormat
      })));
      
    } catch (error) {
      console.error('Error processing text:', error);
      
      // Send error response
      await writer.write(encoder.encode(JSON.stringify({
        error: 'Failed to process text',
        details: error.message
      })));
      
    } finally {
      // Close the stream
      await writer.close();
    }
  })();
  
  // Return the streaming response
  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Transfer-Encoding': 'chunked'
    }
  });
}
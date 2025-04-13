// File: app/api/process/route.js
import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import getConfig from 'next/config';
import { v4 as uuidv4 } from 'uuid';
import SyntheticDataPipeline from '../../lib/SyntheticDataPipeline';

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
      // Send initial progress with type field
      controller.enqueue(
        encoder.encode(JSON.stringify({
          type: "progress",
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
      // Final progress update with type field
      controller.enqueue(
        encoder.encode(JSON.stringify({
          type: "progress",
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
        type: "progress",
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
          // Add type field to progress updates
          await writer.write(encoder.encode(JSON.stringify({
            type: "progress",
            ...progressData
          })));
        }
      });
      
      // Process the text through the pipeline
      const result = await pipeline.process(s3Body);
      
      // For openai-jsonl format, ensure proper format without escaping issues
      let finalOutput = result.output;
      
      // Special handling for openai-jsonl format to ensure proper JSONL format
      if (outputFormat === 'openai-jsonl' && typeof result.output === 'string') {
        try {
          // Split by newlines and parse each line to get clean objects
          const jsonLines = result.output
            .split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => {
              try {
                // Parse the line to get the clean object
                return JSON.parse(line);
              } catch (e) {
                console.error('Error parsing JSONL line:', e);
                return null;
              }
            })
            .filter(obj => obj !== null);
          
          // Re-serialize as clean JSONL
          finalOutput = jsonLines.map(JSON.stringify).join('\n');
        } catch (e) {
          console.error('Error processing JSONL output:', e);
          // Fallback to original output
          finalOutput = result.output;
        }
      }
      
      // Save the output to S3
      const outputKey = `output/${uuidv4()}.${outputFormat === 'json' ? 'json' : 'jsonl'}`;
      
      await s3Client.send(new PutObjectCommand({
        Bucket: serverRuntimeConfig.aws.s3Bucket,
        Key: outputKey,
        Body: finalOutput,
        ContentType: outputFormat === 'json' ? 'application/json' : 'application/jsonl'
      }));
      
      // Send the final result
      await writer.write(encoder.encode(JSON.stringify({
        type: "result",
        success: true,
        format: outputFormat,
        data: finalOutput,
        stats: result.stats,
        outputKey
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
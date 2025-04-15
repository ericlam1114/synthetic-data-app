// app/api/process/route.js - Improved version
import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import getConfig from 'next/config';
import { v4 as uuidv4 } from 'uuid';
import SyntheticDataPipeline from '../../lib/SyntheticDataPipeline';
import QASyntheticDataPipeline from '../../lib/QASyntheticDataPipeline';
import FinanceSyntheticDataPipeline from '../../lib/FinanceSyntheticDataPipeline';

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

export async function POST(request) {
  // Create a streaming response
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  
  // Start processing in the background and stream updates
  (async () => {
    try {
      const { 
        textKey, 
        pipelineType = 'legal', 
        outputFormat,
        // Legal pipeline options
        classFilter, 
        prioritizeImportant,
        // Q&A pipeline options
        questionTypes,
        difficultyLevels,
        maxQuestionsPerSection,
        orgStyleSample,
        // Finance pipeline options
        metricFilter,
        generateProjections,
        projectionTypes
      } = await request.json();
      
      if (!textKey) {
        await writer.write(encoder.encode(JSON.stringify({ 
          error: 'No text key provided' 
        })));
        await writer.close();
        return;
      }
      
      // IMPROVED: Send early progress update to client
      await writer.write(encoder.encode(JSON.stringify({
        type: "progress",
        progress: 2,
        stage: 'initialization',
        message: 'Starting process...'
      }) + '\n'));
      
      // Get the extracted text from S3
      try {
        const getObjectCommand = new GetObjectCommand({
          Bucket: serverRuntimeConfig.aws.s3Bucket,
          Key: textKey
        });
        
        const s3Response = await s3Client.send(getObjectCommand);
        
        // IMPROVED: Stream the S3 response instead of loading it all at once
        // This significantly reduces memory usage
        const chunks = [];
        const stream = s3Response.Body;
        
        // IMPROVED: Process S3 data in chunks to prevent loading the entire file into memory
        for await (const chunk of stream) {
          chunks.push(chunk);
          
          // IMPROVED: Force intermediate garbage collection to prevent memory buildup
          if (typeof global.gc === 'function') {
            global.gc();
          }
          
          // IMPROVED: If chunks get too large, combine, process and reset
          if (chunks.length > 10) {
            const combinedChunk = Buffer.concat(chunks);
            chunks.length = 0; // Clear the array
            
            // Send progress update
            await writer.write(encoder.encode(JSON.stringify({
              type: "progress",
              progress: 3,
              stage: 'loading',
              message: 'Loading text data from storage...'
            }) + '\n'));
          }
        }
        
        // Create the final text from chunks
        const s3Body = Buffer.concat(chunks).toString('utf8');
        chunks.length = 0; // Clear the array immediately
        
        // IMPROVED: Force garbage collection after text loading
        if (typeof global.gc === 'function') {
          global.gc();
        }
        
        // Send progress update
        await writer.write(encoder.encode(JSON.stringify({
          type: "progress",
          progress: 5,
          stage: 'initialization',
          message: 'Retrieved text, initializing pipeline'
        }) + '\n')); // Add newline to separate JSON objects
        
        let pipeline;
        
        // IMPROVED: Use pipeline-specific configuration with memory optimizations
        if (pipelineType === 'qa') {
          // Initialize Q&A pipeline with reduced batch sizes and chunk sizes
          pipeline = new QASyntheticDataPipeline({
            apiKey: serverRuntimeConfig.openai.apiKey,
            outputFormat: outputFormat || 'openai-jsonl',
            questionTypes: questionTypes || ['factual', 'procedural', 'critical-thinking'],
            difficultyLevels: difficultyLevels || ['basic', 'intermediate', 'advanced'],
            maxQuestionsPerSection: maxQuestionsPerSection || 5, 
            // IMPROVED: Reduced chunk size
            chunkSize: 300, // Reduced from default
            chunkOverlap: 50, // Reduced from default
            orgStyleSample: orgStyleSample || null,
            onProgress: async (progressData) => {
              // Add type field to progress updates and ensure they're separated by newlines
              await writer.write(encoder.encode(JSON.stringify({
                type: "progress",
                ...progressData
              }) + '\n'));
            }
          });
        } else if (pipelineType === 'finance') {
          // Initialize finance pipeline
          pipeline = new FinanceSyntheticDataPipeline({
            apiKey: serverRuntimeConfig.openai.apiKey,
            outputFormat: outputFormat || 'openai-jsonl',
            metricFilter: metricFilter || 'all',
            generateProjections: generateProjections !== undefined ? generateProjections : true,
            projectionTypes: projectionTypes || ['valuation', 'growth', 'profitability'],
            // Memory optimizations
            chunkSize: 300,
            chunkOverlap: 50,
            onProgress: async (progressData) => {
              // Add type field to progress updates and ensure they're separated by newlines
              await writer.write(encoder.encode(JSON.stringify({
                type: "progress",
                ...progressData
              }) + '\n'));
            }
          });
        } else {
          // Initialize legal pipeline (default) with reduced batch sizes and chunk sizes
          pipeline = new SyntheticDataPipeline({
            apiKey: serverRuntimeConfig.openai.apiKey,
            outputFormat: outputFormat || 'openai-jsonl',
            classFilter: classFilter || 'all',
            prioritizeImportant: prioritizeImportant !== undefined ? prioritizeImportant : true,
            // IMPROVED: Reduced chunk size
            chunkSize: 300, // Reduced from default
            chunkOverlap: 50, // Reduced from default
            orgStyleSample: orgStyleSample || null, 
            onProgress: async (progressData) => {
              // Add type field to progress updates and ensure they're separated by newlines
              await writer.write(encoder.encode(JSON.stringify({
                type: "progress",
                ...progressData
              }) + '\n'));
            }
          });
        }
        
        // IMPROVED: Validate text size before processing
        const MAX_TEXT_LENGTH = 5000; // Set a reasonable limit
        let processText = s3Body;
        
        if (s3Body.length > MAX_TEXT_LENGTH) {
          processText = s3Body.substring(0, MAX_TEXT_LENGTH);
          
          // Send warning about truncation
          await writer.write(encoder.encode(JSON.stringify({
            type: "progress",
            progress: 7,
            stage: 'truncation',
            message: `Text exceeds size limit, truncating to ${MAX_TEXT_LENGTH} characters for processing`
          }) + '\n'));
        }
        
        // Process the text through the pipeline
        const result = await pipeline.process(processText);
        
        // Force garbage collection after processing
        if (typeof global.gc === 'function') {
          global.gc();
          await new Promise(resolve => setTimeout(resolve, 100)); // Wait for GC
        }
        
        // For openai-jsonl format, ensure proper format without escaping issues
        let finalOutput = result.output;
        
        // Special handling for openai-jsonl format to ensure proper JSONL format
        if (outputFormat === 'openai-jsonl' && typeof result.output === 'string') {
          try {
            // IMPROVED: Process the lines in smaller batches to prevent large array creation
            const lines = result.output.split('\n').filter(line => line.trim().length > 0);
            const batchSize = 20;
            let processedLines = [];
            
            for (let i = 0; i < lines.length; i += batchSize) {
              const batch = lines.slice(i, Math.min(i + batchSize, lines.length));
              
              // Process each line to get clean JSON
              const processedBatch = batch.map(line => {
                try {
                  return JSON.stringify(JSON.parse(line));
                } catch (e) {
                  console.error('Error parsing JSONL line:', e);
                  return null;
                }
              }).filter(line => line !== null);
              
              processedLines.push(...processedBatch);
              
              // Force intermediate garbage collection
              if (typeof global.gc === 'function') {
                global.gc();
              }
            }
            
            // Combine processed lines
            finalOutput = processedLines.join('\n');
            processedLines = null; // Clear reference
            
          } catch (e) {
            console.error('Error processing JSONL output:', e);
            // Fallback to original output
            finalOutput = result.output;
          }
        }
        
        // Save the output to S3
        const fileExt = outputFormat === 'json' ? 'json' : 'jsonl';
        const outputKey = `output/${pipelineType}_${uuidv4()}.${fileExt}`;
        
        await s3Client.send(new PutObjectCommand({
          Bucket: serverRuntimeConfig.aws.s3Bucket,
          Key: outputKey,
          Body: finalOutput,
          ContentType: outputFormat === 'json' ? 'application/json' : 'application/jsonl'
        }));
        
        // IMPROVED: Send minimal data to client to avoid memory issues
        // Instead of sending full data, send the S3 key and minimal stats
        await writer.write(encoder.encode(JSON.stringify({
          type: "result",
          success: true,
          format: outputFormat,
          data: finalOutput, // Still include data for current functionality
          // If data size becomes an issue, remove 'data' field and implement a separate
          // endpoint to fetch the data from S3 when needed
          stats: result.stats,
          outputKey,
          pipelineType
        }) + '\n'));
      } catch (error) {
        console.error('Error retrieving text from S3:', error);
        await writer.write(encoder.encode(JSON.stringify({
          error: 'Failed to retrieve text from storage',
          details: error.message
        }) + '\n'));
      }
      
    } catch (error) {
      console.error('Error processing text:', error);
      
      // Send error response with a newline
      await writer.write(encoder.encode(JSON.stringify({
        error: 'Failed to process text',
        details: error.message
      }) + '\n'));
      
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
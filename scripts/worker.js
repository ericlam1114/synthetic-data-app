#!/usr/bin/env node
// scripts/worker.js
require('dotenv').config();
const { connectToDatabase } = require('../lib/db/mongodb');
const Queue = require('bull');
const { processDocumentInBackground } = require('../lib/workers/documentProcessor');
const jobService = require('../lib/services/jobService');

// Create a document processing queue
const documentQueue = new Queue('document-processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
});

// Initialize MongoDB connection
connectToDatabase()
  .then(() => {
    console.log('Worker started and connected to MongoDB');
    
    // Process jobs
    documentQueue.process(async (job) => {
      const { textKey, pipelineType, options, jobId } = job.data;
      
      try {
        console.log(`Processing document job ${jobId} (${pipelineType})`);
        
        // Create progress reporting function
        const jobContext = {
          jobId,
          progress: async (progress, message) => {
            // Update job in database
            await jobService.updateJob(jobId, {
              progress,
              message,
              status: progress >= 100 ? 'completed' : 'processing'
            });
            
            // Update Bull job progress
            job.progress(progress);
            
            // Log progress
            console.log(`Job ${jobId}: ${progress}% - ${message}`);
          }
        };
        
        // Process the document
        const result = await processDocumentInBackground(
          textKey,
          pipelineType,
          options,
          jobContext
        );
        
        // Mark as completed in database
        await jobService.updateJob(jobId, {
          status: 'completed',
          message: 'Processing complete',
          progress: 100,
          outputKey: result.outputKey,
          stats: result.stats,
          completed: new Date()
        });
        
        console.log(`Job ${jobId} completed successfully`);
        return result;
      } catch (error) {
        console.error(`Error processing document job ${jobId}:`, error);
        
        // Update job with error
        await jobService.updateJob(jobId, {
          status: 'failed',
          message: `Processing failed: ${error.message}`,
          error: error.message,
          failed: new Date()
        });
        
        throw error;
      }
    });
    
    // Add event handlers for monitoring
    documentQueue.on('completed', (job, result) => {
      console.log(`Job ${job.id} completed`);
    });
    
    documentQueue.on('failed', (job, error) => {
      console.error(`Job ${job.id} failed with error:`, error);
    });
    
    documentQueue.on('stalled', (job) => {
      console.warn(`Job ${job.id} stalled`);
    });
    
    console.log('Worker is ready and processing jobs');
  })
  .catch(error => {
    console.error('Failed to start worker:', error);
    process.exit(1);
  });

// Handle graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  console.log('Shutting down worker...');
  
  try {
    await documentQueue.close();
    console.log('Closed document queue');
    
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
} 
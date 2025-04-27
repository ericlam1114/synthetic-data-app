import Queue from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { processDocumentInBackground } from '../workers/documentProcessor';
import jobService from '../services/jobService';

// Set up dedicated Redis clients for Bull (helps prevent stalling issues)
let redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  connectTimeout: 10000,
  keepAlive: 5000,
  enableOfflineQueue: true,
  retryStrategy: (times) => {
    console.log(`Redis retry attempt ${times}`);
    return Math.min(times * 100, 3000);
  }
};

// Create a new queue for document processing
const documentQueue = new Queue('document-processing', {
  redis: redisConfig,
  prefix: 'bull:synthetic-data:',
  defaultJobOptions: {
    attempts: 3,               // Retry up to 3 times
    backoff: {
      type: 'exponential',     // Exponential backoff
      delay: 5000              // Starting at 5 seconds
    },
    removeOnComplete: 100,     // Keep the last 100 completed jobs
    removeOnFail: 200,         // Keep the last 200 failed jobs
    timeout: 20 * 60 * 1000    // 20 minute timeout per job attempt
  },
  settings: {
    stalledInterval: 15000,    // Check for stalled jobs every 15 seconds (was 30s)
    maxStalledCount: 1,        // Mark as failed after first stall to avoid hanging
    lockDuration: 30000,       // Lock duration of 30 seconds
    lockRenewTime: 10000       // Renew lock every 10 seconds (1/3 of lockDuration)
  }
});

// Process jobs
documentQueue.process(async (job) => {
  const { textKey, pipelineType, options, jobId } = job.data;
  
  try {
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
  console.log(`Job ${job.id} completed with result:`, result);
});

documentQueue.on('failed', (job, error) => {
  console.error(`Job ${job.id} failed with error:`, error);
});

documentQueue.on('stalled', (job) => {
  console.warn(`Job ${job.id} stalled`);
});

/**
 * Add a document processing job to the queue
 * @param {string} textKey - S3 key of the text to process
 * @param {string} pipelineType - Type of pipeline to use
 * @param {Object} options - Processing options
 * @returns {Promise<string>} - Job ID
 */
export async function addDocumentJob(textKey, pipelineType = 'legal', options = {}) {
  // Generate a job ID
  const jobId = options.jobId || uuidv4();
  
  // Save initial job state to database
  await jobService.saveJob(jobId, {
    id: jobId,
    status: 'initialized',
    message: 'Job initialized and queued',
    progress: 0,
    textKey,
    pipelineType,
    options,
    created: new Date()
  });
  
  // Add job to queue
  await documentQueue.add(
    {
      textKey,
      pipelineType,
      options,
      jobId
    },
    {
      jobId, // Use the same ID for both MongoDB and Bull
      priority: options.priority || 0,
      timeout: 30 * 60 * 1000, // 30 minutes timeout
      attempts: options.attempts || 3
    }
  );
  
  return jobId;
}

/**
 * Get the status of a job
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} - Job status
 */
export async function getJobStatus(jobId) {
  // Get job from database
  const jobData = await jobService.getJob(jobId);
  
  if (!jobData) {
    return null;
  }
  
  // Get queue status
  try {
    const queueJob = await documentQueue.getJob(jobId);
    
    if (queueJob) {
      // Add queue-specific data
      return {
        ...jobData,
        queueState: await queueJob.getState(),
        queueAttempts: queueJob.attemptsMade
      };
    }
  } catch (error) {
    console.warn(`Could not get queue status for job ${jobId}:`, error);
  }
  
  return jobData;
}

/**
 * Resume a failed job
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} - Resumed job
 */
export async function resumeJob(jobId) {
  const jobData = await jobService.getJob(jobId);
  
  if (!jobData || jobData.status !== 'failed') {
    throw new Error(`Job ${jobId} not found or not failed`);
  }
  
  // Update job status
  await jobService.updateJob(jobId, {
    status: 'resuming',
    message: 'Resuming job',
    resumed: new Date()
  });
  
  // Create a new job with the same ID
  await documentQueue.add(
    {
      textKey: jobData.textKey,
      pipelineType: jobData.pipelineType,
      options: { ...jobData.options, jobId },
      jobId
    },
    {
      jobId,
      timeout: 30 * 60 * 1000,
      attempts: 3
    }
  );
  
  return jobService.getJob(jobId);
}

// Assign to a variable before default export
const documentQueueService = {
  queue: documentQueue,
  addJob: addDocumentJob,
  getStatus: getJobStatus,
  resumeJob
};

export default documentQueueService; 
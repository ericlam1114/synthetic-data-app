// lib/queue/persistentJobQueue.js
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * PersistentJobQueue - A job queue implementation with S3 persistence
 * Provides a resilient queue that can survive server restarts
 */
class PersistentJobQueue {
  constructor(options = {}) {
    // Configuration
    this.options = {
      s3Bucket: options.s3Bucket || process.env.AWS_S3_BUCKET,
      s3Region: options.s3Region || process.env.AWS_REGION || 'us-east-1',
      s3KeyPrefix: options.s3KeyPrefix || 'jobs/',
      concurrency: options.concurrency || 1,
      timeout: options.timeout || 10 * 60 * 1000, // 10 minutes default
      retries: options.retries || 2,
      pollInterval: options.pollInterval || 5000, // 5 seconds
      ...options
    };
    
    // Initialize memory caches for performance
    this.queueCache = [];
    this.runningCache = new Map();
    this.completedCache = new Map();
    this.failedCache = new Map();
    
    // Cache expiration (only memory-cached items will expire)
    this.cacheExpiration = 60 * 60 * 1000; // 1 hour
    
    // S3 client initialization
    this.s3Client = new S3Client({
      region: this.options.s3Region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    
    // Processing state
    this.processing = false;
    this.lastJobId = null;
    
    // Auto-cleanup interval
    this.cleanupInterval = setInterval(() => {
      this._cleanupCaches();
    }, 30 * 60 * 1000); // Every 30 minutes
  }
  
  /**
   * Add a job to the queue
   * @param {Function} jobFn - Async function to execute
   * @param {Object} metadata - Job metadata
   * @returns {string} - Job ID
   */
  async add(jobFn, metadata = {}) {
    // Generate a job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create job object
    const job = {
      id: jobId,
      status: 'queued',
      added: Date.now(),
      metadata,
      retries: 0,
      // Don't store the function in S3
      // fn will only exist in memory
    };
    
    // Add to memory cache
    this.queueCache.push({
      ...job,
      fn: jobFn, // Only memory cache has the function
      cacheExpiration: Date.now() + this.cacheExpiration
    });
    
    // Add to S3 for persistence
    await this._saveJobToS3(jobId, job);
    
    this.lastJobId = jobId;
    
    // Start processing if not already running
    if (!this.processing) {
      this._processQueue();
    }
    
    return jobId;
  }
  
  /**
   * Get job status
   * @param {string} jobId - Job ID
   * @returns {Promise<Object|null>} - Job status or null if not found
   */
  async getJob(jobId) {
    // Check memory caches first for performance
    if (this.runningCache.has(jobId)) {
      return this.runningCache.get(jobId);
    }
    
    if (this.completedCache.has(jobId)) {
      return this.completedCache.get(jobId);
    }
    
    if (this.failedCache.has(jobId)) {
      return this.failedCache.get(jobId);
    }
    
    // Check queued jobs
    const queuedJob = this.queueCache.find(job => job.id === jobId);
    if (queuedJob) {
      return queuedJob;
    }
    
    // Not found in memory, try S3
    try {
      const job = await this._getJobFromS3(jobId);
      if (job) {
        // Add to appropriate cache for future quick access
        this._addToCache(job);
        return job;
      }
    } catch (error) {
      console.error(`Error getting job ${jobId} from S3:`, error);
    }
    
    return null;
  }
  
  /**
   * Get all jobs
   * @returns {Promise<Object>} - All jobs grouped by status
   */
  async getAllJobs() {
    try {
      // Start with memory-cached jobs
      const result = {
        queued: [...this.queueCache],
        running: Array.from(this.runningCache.values()),
        completed: Array.from(this.completedCache.values()),
        failed: Array.from(this.failedCache.values())
      };
      
      // Add jobs from S3 that aren't in memory cache
      const s3Jobs = await this._listAllJobsFromS3();
      
      // Deduplicate and add jobs from S3
      for (const job of s3Jobs) {
        const { id, status } = job;
        
        // Only add if not already in memory cache
        if (status === 'queued' && !result.queued.some(j => j.id === id)) {
          result.queued.push(job);
        } else if (status === 'running' && !result.running.some(j => j.id === id)) {
          result.running.push(job);
        } else if (status === 'completed' && !result.completed.some(j => j.id === id)) {
          result.completed.push(job);
        } else if (status === 'failed' && !result.failed.some(j => j.id === id)) {
          result.failed.push(job);
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error getting all jobs:', error);
      
      // Fall back to memory cache if S3 fails
      return {
        queued: [...this.queueCache],
        running: Array.from(this.runningCache.values()),
        completed: Array.from(this.completedCache.values()),
        failed: Array.from(this.failedCache.values())
      };
    }
  }
  
  /**
   * Update job status and details
   * @param {string} jobId - Job ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<boolean>} - Success status
   */
  async updateJob(jobId, updates) {
    try {
      // Get current job state
      const job = await this.getJob(jobId);
      if (!job) {
        console.error(`Cannot update job ${jobId}: not found`);
        return false;
      }
      
      // Apply updates
      const updatedJob = {
        ...job,
        ...updates,
        lastUpdated: Date.now()
      };
      
      // Update in S3
      await this._saveJobToS3(jobId, updatedJob);
      
      // Update in memory cache
      this._updateInCache(updatedJob);
      
      return true;
    } catch (error) {
      console.error(`Error updating job ${jobId}:`, error);
      return false;
    }
  }
  
  /**
   * Process the queue
   * @private
   */
  async _processQueue() {
    // Only process if we have jobs and concurrency isn't exceeded
    const allJobs = await this.getAllJobs();
    if (allJobs.queued.length === 0 || allJobs.running.length >= this.options.concurrency) {
      this.processing = false;
      return;
    }
    
    this.processing = true;
    
    // Get the next job
    const nextJob = allJobs.queued[0];
    
    // Get job function if we have it in memory
    const jobInMemory = this.queueCache.find(j => j.id === nextJob.id);
    if (!jobInMemory || !jobInMemory.fn) {
      console.error(`Cannot process job ${nextJob.id}: function not available in memory`);
      
      // Mark as failed
      await this.updateJob(nextJob.id, {
        status: 'failed',
        error: 'Job function not available',
        failed: Date.now()
      });
      
      // Try next job
      setImmediate(() => this._processQueue());
      return;
    }
    
    // Remove from queue and update status
    this.queueCache = this.queueCache.filter(j => j.id !== nextJob.id);
    
    const jobToRun = {
      ...nextJob,
      status: 'running',
      started: Date.now(),
      fn: jobInMemory.fn
    };
    
    // Update job status in S3 and memory
    await this._saveJobToS3(nextJob.id, {
      ...jobToRun,
      // Don't save function to S3
      fn: undefined
    });
    
    // Add to running cache
    this.runningCache.set(nextJob.id, jobToRun);
    
    // Execute with timeout
    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Job ${nextJob.id} timed out after ${this.options.timeout}ms`)), 
        this.options.timeout)
      );
      
      // Create job context with progress updates
      const jobContext = {
        jobId: nextJob.id,
        progress: async (percent, message) => {
          await this.updateJob(nextJob.id, {
            progress: percent,
            progressMessage: message,
            lastUpdate: Date.now()
          });
        }
      };
      
      // Execute job with timeout
      const result = await Promise.race([jobToRun.fn(jobContext), timeoutPromise]);
      
      // Job completed successfully
      const completedJob = {
        ...jobToRun,
        status: 'completed',
        completed: Date.now(),
        result,
        duration: Date.now() - jobToRun.started
      };
      
      // Remove function reference for storage
      const { fn, ...jobWithoutFn } = completedJob;
      
      // Update in S3 and memory
      await this._saveJobToS3(nextJob.id, jobWithoutFn);
      this.runningCache.delete(nextJob.id);
      this.completedCache.set(nextJob.id, completedJob);
      
      console.log(`Job ${nextJob.id} completed in ${completedJob.duration}ms`);
    } catch (error) {
      console.error(`Job ${nextJob.id} failed:`, error);
      
      // Check if we should retry
      if (jobToRun.retries < this.options.retries) {
        jobToRun.retries++;
        jobToRun.status = 'queued';
        jobToRun.error = error.message;
        jobToRun.lastRetry = Date.now();
        
        // Add back to queue but with exponential backoff
        setTimeout(async () => {
          // Update in S3 and memory
          await this._saveJobToS3(nextJob.id, {
            ...jobToRun,
            // Don't save function to S3
            fn: undefined
          });
          
          this.queueCache.push(jobToRun);
          this.runningCache.delete(nextJob.id);
          
          this._processQueue();
        }, Math.pow(2, jobToRun.retries) * 1000); // 2, 4, 8 seconds...
      } else {
        // Max retries reached, mark as failed
        const failedJob = {
          ...jobToRun,
          status: 'failed',
          failed: Date.now(),
          error: error.message,
          duration: Date.now() - jobToRun.started
        };
        
        // Remove function reference for storage
        const { fn, ...jobWithoutFn } = failedJob;
        
        // Update in S3 and memory
        await this._saveJobToS3(nextJob.id, jobWithoutFn);
        this.runningCache.delete(nextJob.id);
        this.failedCache.set(nextJob.id, failedJob);
      }
    }
    
    // Continue processing queue
    setImmediate(() => this._processQueue());
  }
  
  /**
   * Save job to S3
   * @param {string} jobId - Job ID
   * @param {Object} job - Job data
   * @private
   */
  async _saveJobToS3(jobId, job) {
    try {
      // Make sure to never store the function in S3
      const jobToSave = { ...job };
      delete jobToSave.fn;
      
      // Save to S3
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.options.s3Bucket,
        Key: `${this.options.s3KeyPrefix}${jobId}.json`,
        Body: JSON.stringify(jobToSave),
        ContentType: 'application/json'
      }));
      
      return true;
    } catch (error) {
      console.error(`Error saving job ${jobId} to S3:`, error);
      return false;
    }
  }
  
  /**
   * Get job from S3
   * @param {string} jobId - Job ID
   * @returns {Promise<Object|null>} - Job data or null if not found
   * @private
   */
  async _getJobFromS3(jobId) {
    try {
      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: this.options.s3Bucket,
        Key: `${this.options.s3KeyPrefix}${jobId}.json`
      }));
      
      const job = JSON.parse(await response.Body.transformToString());
      return job;
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return null; // Job not found
      }
      
      console.error(`Error getting job ${jobId} from S3:`, error);
      throw error;
    }
  }
  
  /**
   * List all jobs from S3
   * @returns {Promise<Array<Object>>} - All jobs from S3
   * @private
   */
  async _listAllJobsFromS3() {
    try {
      const response = await this.s3Client.send(new ListObjectsV2Command({
        Bucket: this.options.s3Bucket,
        Prefix: this.options.s3KeyPrefix
      }));
      
      if (!response.Contents) {
        return [];
      }
      
      // Get job data for each key
      const jobPromises = response.Contents.map(async (object) => {
        try {
          const key = object.Key;
          const jobId = key.replace(this.options.s3KeyPrefix, '').replace('.json', '');
          
          return await this._getJobFromS3(jobId);
        } catch (error) {
          console.error(`Error getting job from ${object.Key}:`, error);
          return null;
        }
      });
      
      const jobs = await Promise.all(jobPromises);
      return jobs.filter(job => job !== null);
    } catch (error) {
      console.error('Error listing jobs from S3:', error);
      throw error;
    }
  }
  
  /**
   * Add job to appropriate memory cache
   * @param {Object} job - Job to add to cache
   * @private
   */
  _addToCache(job) {
    if (!job) return;
    
    // Add to appropriate cache based on status
    switch (job.status) {
      case 'queued':
        if (!this.queueCache.some(j => j.id === job.id)) {
          this.queueCache.push({
            ...job,
            cacheExpiration: Date.now() + this.cacheExpiration
          });
        }
        break;
        
      case 'running':
        this.runningCache.set(job.id, {
          ...job,
          cacheExpiration: Date.now() + this.cacheExpiration
        });
        break;
        
      case 'completed':
        this.completedCache.set(job.id, {
          ...job,
          cacheExpiration: Date.now() + this.cacheExpiration
        });
        break;
        
      case 'failed':
        this.failedCache.set(job.id, {
          ...job,
          cacheExpiration: Date.now() + this.cacheExpiration
        });
        break;
    }
  }
  
  /**
   * Update job in memory cache
   * @param {Object} job - Updated job
   * @private
   */
  _updateInCache(job) {
    if (!job) return;
    
    // Remove from all caches
    this.queueCache = this.queueCache.filter(j => j.id !== job.id);
    this.runningCache.delete(job.id);
    this.completedCache.delete(job.id);
    this.failedCache.delete(job.id);
    
    // Add to appropriate cache
    this._addToCache(job);
  }
  
  /**
   * Clean up expired items from memory caches
   * @private
   */
  _cleanupCaches() {
    const now = Date.now();
    
    // Clean queued cache
    this.queueCache = this.queueCache.filter(job => 
      !job.cacheExpiration || job.cacheExpiration > now
    );
    
    // Clean running cache
    for (const [id, job] of this.runningCache.entries()) {
      if (job.cacheExpiration && job.cacheExpiration <= now) {
        this.runningCache.delete(id);
      }
    }
    
    // Clean completed cache
    for (const [id, job] of this.completedCache.entries()) {
      if (job.cacheExpiration && job.cacheExpiration <= now) {
        this.completedCache.delete(id);
      }
    }
    
    // Clean failed cache
    for (const [id, job] of this.failedCache.entries()) {
      if (job.cacheExpiration && job.cacheExpiration <= now) {
        this.failedCache.delete(id);
      }
    }
  }
  
  /**
   * Clean up old jobs from S3
   * @param {number} maxAgeHours - Maximum age of jobs to keep in hours
   * @returns {Promise<Object>} - Cleanup results
   */
  async cleanupS3Jobs(maxAgeHours = 24) {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - maxAgeHours);
      
      // List all jobs
      const jobs = await this._listAllJobsFromS3();
      
      // Find old jobs to delete
      const oldJobs = jobs.filter(job => {
        // Keep all running jobs
        if (job.status === 'running') {
          return false;
        }
        
        // For completed and failed jobs, check completion time
        const jobTime = job.completed || job.failed || job.added;
        return new Date(jobTime) < cutoffTime;
      });
      
      // Delete old jobs
      const results = {
        deleted: 0,
        errors: []
      };
      
      for (const job of oldJobs) {
        try {
          await this.s3Client.send(new DeleteObjectCommand({
            Bucket: this.options.s3Bucket,
            Key: `${this.options.s3KeyPrefix}${job.id}.json`
          }));
          
          results.deleted++;
        } catch (error) {
          console.error(`Error deleting job ${job.id}:`, error);
          results.errors.push({
            jobId: job.id,
            error: error.message
          });
        }
      }
      
      return results;
    } catch (error) {
      console.error('Error cleaning up S3 jobs:', error);
      return {
        deleted: 0,
        errors: [{ general: error.message }]
      };
    }
  }
  
  /**
   * Stop the job queue and cleanup
   */
  stop() {
    // Clear auto-cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Clear caches
    this.queueCache = [];
    this.runningCache.clear();
    this.completedCache.clear();
    this.failedCache.clear();
  }
}

// Create singleton instance
const persistentJobQueue = new PersistentJobQueue();

export default persistentJobQueue;
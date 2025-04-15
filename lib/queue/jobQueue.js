/**
 * Simple in-memory job queue for document processing
 */
class JobQueue {
    constructor(options = {}) {
      this.queue = [];
      this.running = new Map();
      this.completed = new Map();
      this.failed = new Map();
      this.options = {
        concurrency: options.concurrency || 1,
        timeout: options.timeout || 10 * 60 * 1000, // 10 minutes default
        retries: options.retries || 2
      };
      this.processing = false;
      this.lastJobId = null;
    }
  
    /**
     * Add a job to the queue
     * @param {Function} jobFn - Async function to execute
     * @param {Object} metadata - Job metadata
     * @returns {string} - Job ID
     */
    add(jobFn, metadata = {}) {
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.queue.push({
        id: jobId,
        fn: jobFn,
        metadata,
        status: 'queued',
        added: Date.now(),
        retries: 0
      });
      
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
     * @returns {Object|null} - Job status or null if not found
     */
    getJob(jobId) {
      // Check running jobs
      if (this.running.has(jobId)) {
        return this.running.get(jobId);
      }
      
      // Check completed jobs
      if (this.completed.has(jobId)) {
        return this.completed.get(jobId);
      }
      
      // Check failed jobs
      if (this.failed.has(jobId)) {
        return this.failed.get(jobId);
      }
      
      // Check queue
      const queuedJob = this.queue.find(job => job.id === jobId);
      if (queuedJob) {
        return queuedJob;
      }
      
      return null;
    }
  
    /**
     * Get all jobs
     * @returns {Object} - All jobs grouped by status
     */
    getAllJobs() {
      return {
        queued: this.queue,
        running: Array.from(this.running.values()),
        completed: Array.from(this.completed.values()),
        failed: Array.from(this.failed.values())
      };
    }
  
    /**
     * Process the queue
     * @private
     */
    async _processQueue() {
      if (this.queue.length === 0 || this.running.size >= this.options.concurrency) {
        this.processing = false;
        return;
      }
      
      this.processing = true;
      
      // Get the next job
      const job = this.queue.shift();
      job.status = 'running';
      job.started = Date.now();
      this.running.set(job.id, job);
      
      // Execute with timeout
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Job ${job.id} timed out after ${this.options.timeout}ms`)), 
          this.options.timeout)
        );
        
        // Create a job context with progress updates
        const jobContext = {
          jobId: job.id,
          progress: (percent, message) => {
            job.progress = percent;
            job.progressMessage = message;
            job.lastUpdate = Date.now();
          }
        };
        
        // Execute job with timeout
        const result = await Promise.race([job.fn(jobContext), timeoutPromise]);
        
        // Job completed successfully
        job.status = 'completed';
        job.completed = Date.now();
        job.result = result;
        job.duration = job.completed - job.started;
        
        this.running.delete(job.id);
        this.completed.set(job.id, job);
        
        console.log(`Job ${job.id} completed in ${job.duration}ms`);
      } catch (error) {
        console.error(`Job ${job.id} failed:`, error);
        
        // Check if we should retry
        if (job.retries < this.options.retries) {
          job.retries++;
          job.status = 'queued';
          job.error = error.message;
          job.lastRetry = Date.now();
          
          // Add back to queue but with exponential backoff
          setTimeout(() => {
            this.queue.push(job);
            this._processQueue();
          }, Math.pow(2, job.retries) * 1000); // 2, 4, 8 seconds...
        } else {
          // Max retries reached, mark as failed
          job.status = 'failed';
          job.failed = Date.now();
          job.error = error.message;
          job.duration = job.failed - job.started;
          
          this.running.delete(job.id);
          this.failed.set(job.id, job);
        }
      }
      
      // Continue processing queue
      setImmediate(() => this._processQueue());
    }
  
    /**
     * Clean up old jobs
     * @param {number} maxAgeHours - Maximum age in hours
     */
    cleanup(maxAgeHours = 24) {
      const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000);
      
      // Clean completed jobs
      for (const [jobId, job] of this.completed.entries()) {
        if (job.completed < cutoff) {
          this.completed.delete(jobId);
        }
      }
      
      // Clean failed jobs
      for (const [jobId, job] of this.failed.entries()) {
        if (job.failed < cutoff) {
          this.failed.delete(jobId);
        }
      }
    }
  }
  
  // Create singleton instance
  const jobQueue = new JobQueue();
  
  // Start cleanup interval
  setInterval(() => {
    jobQueue.cleanup();
  }, 60 * 60 * 1000); // Clean up every hour
  
  export default jobQueue;
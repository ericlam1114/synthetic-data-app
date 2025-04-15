import Job from '../db/models/Job';
import { connectToDatabase } from '../db/mongodb';

/**
 * Service to manage document processing jobs
 */
const jobService = {
  /**
   * Save a new job or update an existing one
   * @param {string} jobId - Job ID
   * @param {Object} jobData - Job data
   * @returns {Promise<Object>} - Saved job data
   */
  async saveJob(jobId, jobData) {
    await connectToDatabase();
    
    try {
      // Check if job exists
      let job = await Job.findOne({ id: jobId });
      
      if (job) {
        // Update existing job
        Object.assign(job, jobData);
      } else {
        // Create new job
        job = new Job({
          id: jobId,
          ...jobData
        });
      }
      
      await job.save();
      return job.toObject();
    } catch (error) {
      console.error(`Error saving job to MongoDB: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Get a job by ID
   * @param {string} jobId - Job ID
   * @returns {Promise<Object|null>} - Job data or null if not found
   */
  async getJob(jobId) {
    await connectToDatabase();
    
    try {
      const job = await Job.findOne({ id: jobId });
      return job ? job.toObject() : null;
    } catch (error) {
      console.error(`Error getting job from MongoDB: ${error.message}`);
      return null;
    }
  },
  
  /**
   * Update an existing job
   * @param {string} jobId - Job ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} - Updated job data
   */
  async updateJob(jobId, updates) {
    await connectToDatabase();
    
    try {
      const job = await Job.findOne({ id: jobId });
      
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }
      
      Object.assign(job, updates);
      await job.save();
      
      return job.toObject();
    } catch (error) {
      console.error(`Error updating job in MongoDB: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Get all jobs with optional filtering
   * @param {Object} filter - MongoDB filter
   * @returns {Promise<Array<Object>>} - Array of jobs
   */
  async getJobs(filter = {}) {
    await connectToDatabase();
    
    try {
      const jobs = await Job.find(filter).sort({ lastUpdated: -1 });
      return jobs.map(job => job.toObject());
    } catch (error) {
      console.error(`Error getting jobs from MongoDB: ${error.message}`);
      return [];
    }
  },
  
  /**
   * Delete a job
   * @param {string} jobId - Job ID
   * @returns {Promise<boolean>} - True if deleted, false otherwise
   */
  async deleteJob(jobId) {
    await connectToDatabase();
    
    try {
      const result = await Job.deleteOne({ id: jobId });
      return result.deletedCount > 0;
    } catch (error) {
      console.error(`Error deleting job from MongoDB: ${error.message}`);
      return false;
    }
  }
};

export default jobService; 
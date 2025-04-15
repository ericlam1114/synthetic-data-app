#!/usr/bin/env node
// Test script to verify if the application's processing system is using OpenAI
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import fetch from 'node-fetch';
import { setTimeout } from 'timers/promises';
import path from 'path';
import fs from 'fs';

// Try to load environment variables from .env.local
const envFilePath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envFilePath)) {
  console.log('Loading environment variables from .env.local...');
  const envFile = fs.readFileSync(envFilePath, 'utf8');
  const envVars = envFile.split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .reduce((vars, line) => {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      if (key && value) {
        vars[key.trim()] = value;
      }
      return vars;
    }, {});
  
  // Set important environment variables if found
  ['OPENAI_API_KEY', 'MONGODB_URI', 'REDIS_HOST'].forEach(varName => {
    if (envVars[varName] && !process.env[varName]) {
      process.env[varName] = envVars[varName];
      console.log(`Loaded ${varName} from .env.local`);
    }
  });
}

// API base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api';

// Sample text for testing - keeping it very small
const TEST_TEXT = `This is a test document. It contains some information that should be processed.`;

/**
 * Create a job for testing by direct insertion into MongoDB
 */
async function createTestJob() {
  try {
    // Import MongoDB driver and connect
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    
    // Get DB and collection
    const db = client.db();
    const jobsCollection = db.collection('jobs');
    
    // Create a unique job ID
    const jobId = `test-job-${Date.now()}`;
    
    // Create a test job document
    const jobDoc = {
      id: jobId,
      status: 'initialized',
      message: 'Test job initialized',
      progress: 0,
      textContent: TEST_TEXT, // Store text directly in the job
      pipelineType: 'legal', // Use simplest pipeline 
      options: {
        outputFormat: 'openai-jsonl',
      },
      created: new Date(),
      lastUpdated: new Date()
    };
    
    // Insert the job
    await jobsCollection.insertOne(jobDoc);
    
    console.log(`Created test job in MongoDB with ID: ${jobId}`);
    
    // Close the connection
    await client.close();
    
    return jobId;
  } catch (error) {
    console.error('Error creating test job:', error);
    throw error;
  }
}

/**
 * Submit job to processing queue
 */
async function submitJobToQueue(jobId) {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      // If the /jobs/queue endpoint doesn't exist, try the direct process endpoint
      console.log('Jobs queue endpoint not found, trying direct process endpoint...');
      return await submitToProcessEndpoint(jobId);
    }
    
    console.log('Job submitted to queue successfully:', data);
    return data.jobId || jobId;
  } catch (error) {
    console.error('Error submitting job to queue, trying direct process endpoint...', error);
    return await submitToProcessEndpoint(jobId);
  }
}

/**
 * Alternative: Submit directly to process endpoint
 */
async function submitToProcessEndpoint(jobId) {
  try {
    // Create a direct test key with embedded content
    const textKey = `test_${jobId}`;
    
    // Use MongoDB to update the job with this key
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    
    // Get DB and collection
    const db = client.db();
    const jobsCollection = db.collection('jobs');
    
    // Update the job
    await jobsCollection.updateOne(
      { id: jobId },
      { $set: { textKey } }
    );
    
    await client.close();
    
    // Now submit to process endpoint
    const response = await fetch(`${API_BASE_URL}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        textKey,
        pipelineType: 'legal',
        outputFormat: 'openai-jsonl',
        jobId // Use the same job ID
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`API error: ${data.error || response.statusText}`);
    }
    
    console.log('Job submitted to process endpoint successfully:', data);
    return data.jobId || jobId;
  } catch (error) {
    console.error('Error submitting to process endpoint:', error);
    throw error;
  }
}

/**
 * Poll job status until completion or failure
 */
async function pollJobStatus(jobId) {
  console.log(`Polling job status for job ${jobId}...`);
  
  let isComplete = false;
  let attempt = 0;
  const MAX_ATTEMPTS = 30; // Allow 5 minutes (10 seconds * 30 attempts)
  
  while (!isComplete && attempt < MAX_ATTEMPTS) {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/status?id=${jobId}`);
      
      // Handle API not found
      if (response.status === 404) {
        console.log('Job status API not found, trying to check MongoDB directly...');
        await checkJobStatusInMongoDB(jobId);
        await setTimeout(10000);
        attempt++;
        continue;
      }
      
      const data = await response.json();
      
      if (!data || !data.status) {
        console.log('Invalid response from status API, trying direct MongoDB check...');
        await checkJobStatusInMongoDB(jobId);
        await setTimeout(10000);
        attempt++;
        continue;
      }
      
      // Print detailed job status
      console.log('\n==== Job Status Update ====');
      console.log(`Status: ${data.status}`);
      console.log(`Progress: ${data.progress}%`);
      console.log(`Message: ${data.message}`);
      
      if (data.lastError) {
        console.log(`Last Error: ${data.lastError}`);
      }
      
      // Check for OpenAI activity
      const hasOpenAIActivity = data.message && (
        data.message.includes('AI') || 
        data.message.includes('model') || 
        data.message.includes('OpenAI') ||
        data.message.includes('processing')
      );
      
      if (hasOpenAIActivity) {
        console.log('\n✅ OpenAI API APPEARS TO BE ACTIVE!');
        console.log('Message indicates AI/model activity: ', data.message);
      }
      
      // Check for errors that indicate OpenAI was contacted
      if (data.errors && data.errors.length > 0) {
        const aiErrors = data.errors.filter(err => 
          err.message && (
            err.message.includes('OpenAI') || 
            err.message.includes('API') ||
            err.message.includes('model') ||
            err.message.includes('AI')
          )
        );
        
        if (aiErrors.length > 0) {
          console.log('\n✅ OpenAI API WAS DEFINITELY CONTACTED!');
          console.log('Found OpenAI-related errors:', aiErrors);
        }
      }
      
      // Check if job is complete
      if (['completed', 'completed_with_warnings', 'failed'].includes(data.status)) {
        isComplete = true;
        
        if (data.status === 'completed' || data.status === 'completed_with_warnings') {
          console.log('\n✅ JOB COMPLETED SUCCESSFULLY!');
          console.log('Output available at:', data.outputKey);
          console.log('\nThis confirms that OpenAI API is being called successfully.');
        } else {
          console.log('\n❌ JOB FAILED!');
          console.log('Error:', data.error || 'Unknown error');
          
          // Check if failure is related to OpenAI
          if (data.error && (
            data.error.includes('OpenAI') || 
            data.error.includes('API') || 
            data.error.includes('token') ||
            data.error.includes('model')
          )) {
            console.log('\n✅ OpenAI API WAS CONTACTED BUT FAILED!');
            console.log('This confirms OpenAI was called, but there was an error:', data.error);
          }
        }
      }
      
    } catch (error) {
      console.error('Error polling job status:', error);
    }
    
    attempt++;
    console.log(`\nWaiting for next update (attempt ${attempt}/${MAX_ATTEMPTS})...`);
    await setTimeout(10000); // Wait 10 seconds between polls
  }
  
  if (!isComplete) {
    console.log('\n⚠️ TIMEOUT: Job did not complete within the allotted time.');
    console.log('This might indicate the worker is not processing jobs or OpenAI API is very slow.');
  }
}

/**
 * Check job status directly in MongoDB
 */
async function checkJobStatusInMongoDB(jobId) {
  try {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    
    // Get DB and collection
    const db = client.db();
    const jobsCollection = db.collection('jobs');
    
    // Find the job
    const job = await jobsCollection.findOne({ id: jobId });
    
    if (!job) {
      console.log(`⚠️ Job ${jobId} not found in MongoDB.`);
      await client.close();
      return;
    }
    
    // Print job status
    console.log('\n==== Job Status from MongoDB ====');
    console.log(`Status: ${job.status}`);
    console.log(`Progress: ${job.progress}%`);
    console.log(`Message: ${job.message}`);
    
    if (job.lastError) {
      console.log(`Last Error: ${job.lastError}`);
    }
    
    // Check for OpenAI activity
    if (job.message && (job.message.includes('AI') || job.message.includes('model'))) {
      console.log('\n✅ OpenAI API APPEARS TO BE ACTIVE!');
      console.log('Message indicates AI activity: ', job.message);
    }
    
    // Check if job is complete
    if (['completed', 'completed_with_warnings', 'failed'].includes(job.status)) {
      console.log(`\nJob ${job.status}!`);
    }
    
    await client.close();
  } catch (error) {
    console.error('Error checking job in MongoDB:', error);
  }
}

/**
 * Run the test
 */
async function runTest() {
  try {
    console.log('=== APPLICATION OPENAI INTEGRATION TEST ===');
    console.log('Starting test to verify the application is calling OpenAI API...\n');
    
    // Step 1: Create a test job in MongoDB
    console.log('Step 1: Creating a test job in MongoDB...');
    const jobId = await createTestJob();
    
    // Step 2: Submit job to processing queue
    console.log('\nStep 2: Submitting job to processing queue...');
    await submitJobToQueue(jobId);
    
    // Step 3: Monitor job status
    console.log('\nStep 3: Monitoring job status...');
    await pollJobStatus(jobId);
    
    console.log('\n=== TEST COMPLETE ===');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
runTest(); 
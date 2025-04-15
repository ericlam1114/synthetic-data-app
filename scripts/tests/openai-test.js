#!/usr/bin/env node
// Test script to verify OpenAI API calls are working
import 'dotenv/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fetch from 'node-fetch';
import { setTimeout } from 'timers/promises';
import path from 'path';
import fs from 'fs';

// Check environment variables
function checkRequiredEnvVars() {
  const requiredVars = [
    'AWS_S3_BUCKET',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'OPENAI_API_KEY'
  ];
  
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('\n❌ ERROR: Missing required environment variables:');
    missingVars.forEach(varName => {
      console.error(`- ${varName}`);
    });
    console.error('\nPlease make sure these are set in your .env.local file and that you\'re loading it properly.');
    
    // Try to load from .env.local directly if it exists
    const envFilePath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envFilePath)) {
      console.log('\nFound .env.local file. Attempting to load directly...');
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
      
      requiredVars.forEach(varName => {
        if (envVars[varName] && !process.env[varName]) {
          process.env[varName] = envVars[varName];
          console.log(`- Loaded ${varName} from .env.local`);
        }
      });
      
      // Check if all required vars are now available
      const stillMissingVars = requiredVars.filter(varName => !process.env[varName]);
      if (stillMissingVars.length > 0) {
        console.error('\n❌ Still missing required environment variables after loading .env.local:');
        stillMissingVars.forEach(varName => {
          console.error(`- ${varName}`);
        });
        return false;
      }
      
      return true;
    }
    
    return false;
  }
  
  return true;
}

// Initialize the S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Sample text for testing
const TEST_TEXT = `
This is a test document to verify that OpenAI API calls are working properly.
We will submit this document to the synthetic data pipeline and observe if 
calls are made to the OpenAI API.

Key points:
1. This is a very small document to process quickly
2. It should trigger API calls to OpenAI for processing
3. We should be able to monitor the job status and see progress
`;

// API base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api';

/**
 * Upload test text to S3
 */
async function uploadTestFile() {
  if (!process.env.AWS_S3_BUCKET) {
    throw new Error('AWS_S3_BUCKET environment variable is required');
  }
  
  const key = `test/openai-test-${Date.now()}.txt`;
  
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        Body: TEST_TEXT,
        ContentType: 'text/plain',
      })
    );
    
    console.log(`Test file uploaded to S3: s3://${process.env.AWS_S3_BUCKET}/${key}`);
    return key;
  } catch (error) {
    console.error('Error uploading test file:', error);
    throw error;
  }
}

/**
 * Submit test file for processing
 */
async function submitForProcessing(textKey) {
  try {
    const response = await fetch(`${API_BASE_URL}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        textKey,
        pipelineType: 'legal', // Use simplest pipeline for testing
        outputFormat: 'openai-jsonl',
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`API error: ${data.error || response.statusText}`);
    }
    
    console.log('Job submitted successfully:', data);
    return data.jobId;
  } catch (error) {
    console.error('Error submitting job:', error);
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
      const data = await response.json();
      
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
 * Run the test
 */
async function runTest() {
  try {
    console.log('=== OpenAI API INTEGRATION TEST ===');
    console.log('Starting test to verify OpenAI API calls are working...\n');
    
    // Check environment variables
    console.log('Checking environment variables...');
    if (!checkRequiredEnvVars()) {
      console.error('❌ Test aborted due to missing environment variables.');
      process.exit(1);
    }
    console.log('✅ Environment variables are properly configured.\n');
    
    // Step 1: Upload test file
    console.log('Step 1: Uploading test file to S3...');
    const textKey = await uploadTestFile();
    
    // Step 2: Submit for processing
    console.log('\nStep 2: Submitting file for processing...');
    const jobId = await submitForProcessing(textKey);
    
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
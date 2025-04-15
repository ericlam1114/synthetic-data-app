// File: utils/aws.js
import { S3Client } from '@aws-sdk/client-s3';
import { TextractClient } from '@aws-sdk/client-textract';
import { loadEnvConfig } from '@next/env';

// Load environment variables directly
loadEnvConfig(process.cwd());

// Helper function to create an S3 client
export function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
}

// Helper function to create a Textract client
export function getTextractClient() {
  return new TextractClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
}

// Function to get S3 bucket name
export function getS3BucketName() {
  return process.env.AWS_S3_BUCKET;
}
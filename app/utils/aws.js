// File: utils/aws.js
import { S3Client } from '@aws-sdk/client-s3';
import { TextractClient } from '@aws-sdk/client-textract';
import getConfig from 'next/config';

// Get server-side config
const { serverRuntimeConfig } = getConfig();

// Create and export AWS clients - for reuse across API routes
export const getS3Client = () => {
  return new S3Client({
    region: serverRuntimeConfig.aws.region,
    credentials: {
      accessKeyId: serverRuntimeConfig.aws.accessKeyId,
      secretAccessKey: serverRuntimeConfig.aws.secretAccessKey
    }
  });
};

export const getTextractClient = () => {
  return new TextractClient({
    region: serverRuntimeConfig.aws.region,
    credentials: {
      accessKeyId: serverRuntimeConfig.aws.accessKeyId,
      secretAccessKey: serverRuntimeConfig.aws.secretAccessKey
    }
  });
};
// AWS S3 Configuration
export const awsConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  bucket: process.env.AWS_S3_BUCKET || 'synthetic-data-app-storage',
  credentials: {
    // These should be set via environment variables
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  // Temporary storage paths
  tempPaths: {
    chunks: 'tmp/chunks/',
    processing: 'tmp/processing/',
    outputs: 'tmp/outputs/',
  },
  // Max file size for direct memory processing (1MB)
  maxInMemorySize: 1000000,
}; 
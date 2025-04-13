/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    serverRuntimeConfig: {
      // Server-side environment variables
      aws: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION,
        s3Bucket: process.env.AWS_S3_BUCKET
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY
      }
    },
    publicRuntimeConfig: {
      // Both client and server
      aws: {
        region: process.env.AWS_REGION
      }
    }
  };
  
  export default nextConfig;
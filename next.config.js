/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverRuntimeConfig: {
    aws: {
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      s3Bucket: process.env.AWS_S3_BUCKET,
    },
    mongodb: {
      uri: process.env.MONGODB_URI
    },
    redis: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD
    }
  },
  publicRuntimeConfig: {
    // Add public runtime config here (accessible from browser)
  }
};

export default nextConfig; 
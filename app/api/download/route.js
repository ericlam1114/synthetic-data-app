import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'Missing S3 key' }, { status: 400 });
  }

  if (!BUCKET_NAME) {
    console.error('S3 Bucket Name is not configured in environment variables.');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  try {
    console.log(`[Download API] Received request for key: ${key}`);

    // Optional: Get metadata first to determine filename and content type
    // This adds an extra API call but ensures headers are more accurate.
    // Alternatively, derive from key if filename pattern is consistent.
    let contentType = 'application/octet-stream'; // Default content type
    let contentLength = undefined;
    try {
        const headCmd = new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key });
        const metadata = await s3Client.send(headCmd);
        contentType = metadata.ContentType || contentType;
        contentLength = metadata.ContentLength;
        console.log(`[Download API] Fetched metadata: ContentType=${contentType}, ContentLength=${contentLength}`);
    } catch (headError) {
        // If HeadObject fails (e.g., permissions), proceed but use default content type
        console.warn(`[Download API] Could not get HEAD for ${key}: ${headError.message}. Proceeding with GetObject.`);
         // If HEAD fails because the object doesn't exist, return 404 directly
        if (headError.name === 'NotFound' || headError.$metadata?.httpStatusCode === 404) {
          console.error(`[Download API] File not found in S3: ${key}`);
          return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }
    }


    // Fetch the object from S3
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    const s3Response = await s3Client.send(command);

    // Check if Body is a readable stream
    if (!(s3Response.Body instanceof Readable) && typeof s3Response.Body?.transformToWebStream !== 'function') {
         console.error(`[Download API] S3 Body is not a readable stream for key: ${key}`);
         throw new Error('Failed to retrieve file stream from S3');
    }
    
    // Use transformToWebStream if available (newer SDK versions), otherwise assume it's Node stream compatible
    const bodyStream = typeof s3Response.Body.transformToWebStream === 'function'
      ? s3Response.Body.transformToWebStream()
      : s3Response.Body;

    // Extract filename from the key (adjust logic if needed)
    const filename = key.split('/').pop() || 'downloaded_file';

    // Set headers for download
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    if (contentLength !== undefined) {
        headers.set('Content-Length', contentLength.toString());
    }

    console.log(`[Download API] Streaming file ${filename} (${contentType}) to client.`);

    // Stream the S3 object body as the response
    return new NextResponse(bodyStream, {
      status: 200,
      headers: headers,
    });

  } catch (error) {
     console.error(`[Download API] Error fetching key ${key} from S3:`, error);
     // Handle specific S3 errors like NoSuchKey
     if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
       return NextResponse.json({ error: 'File not found' }, { status: 404 });
     }
     return NextResponse.json({ error: 'Failed to download file', details: error.message }, { status: 500 });
  }
} 
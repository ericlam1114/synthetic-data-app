// Modified version of app/api/upload/route.js
import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import getConfig from 'next/config';

// Get server-side config
const { serverRuntimeConfig } = getConfig();

// Initialize S3 client
const s3Client = new S3Client({
  region: serverRuntimeConfig.aws.region,
  credentials: {
    accessKeyId: serverRuntimeConfig.aws.accessKeyId,
    secretAccessKey: serverRuntimeConfig.aws.secretAccessKey
  }
});

export async function POST(request) {
  try {
    // Parse the multipart form data
    const formData = await request.formData();
    const file = formData.get('file');
    
    // Validate file
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // More thorough content type checking
    const isAcceptedType = file.type === 'application/pdf' || 
                          file.type === 'application/x-pdf' ||
                          file.name.toLowerCase().endsWith('.pdf');
    
    if (!isAcceptedType) {
      return NextResponse.json({ 
        error: 'File must be a PDF', 
        details: `Provided file has type: ${file.type}` 
      }, { status: 400 });
    }
    
    // Check file size (limit to 10MB)
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ 
        error: 'File too large', 
        details: 'Maximum file size is 10MB' 
      }, { status: 400 });
    }
    
    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Additional PDF validation - check for PDF header
    const isPdfHeader = buffer.slice(0, 5).toString().match(/%PDF-/);
    if (!isPdfHeader) {
      return NextResponse.json({ 
        error: 'Invalid PDF file', 
        details: 'File does not have a valid PDF header' 
      }, { status: 400 });
    }
    
    // Generate a unique key for S3
    const fileKey = `uploads/${uuidv4()}-${file.name.replace(/\s+/g, '_')}`;
    
    // Upload to S3 with proper content type
    await s3Client.send(new PutObjectCommand({
      Bucket: serverRuntimeConfig.aws.s3Bucket,
      Key: fileKey,
      Body: buffer,
      ContentType: 'application/pdf'
    }));
    
    // Return the file key for further processing
    return NextResponse.json({ fileKey });
    
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: error.message },
      { status: 500 }
    );
  }
}
// app/api/upload-style/route.js
import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { loadEnvConfig } from '@next/env';

// Load environment variables directly
loadEnvConfig(process.cwd());

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

export async function POST(request) {
  try {
    // Parse the multipart form data
    const formData = await request.formData();
    const file = formData.get('styleFile');
    
    // Validate file
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Check file type
    const validTypes = [
      'application/pdf', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain'
    ];
    
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const validExtensions = ['pdf', 'docx', 'doc', 'txt'];
    
    const isAcceptedType = validTypes.includes(file.type) || 
                          validExtensions.includes(fileExtension);
    
    if (!isAcceptedType) {
      return NextResponse.json({ 
        error: 'Invalid file type', 
        details: `Provided file has type: ${file.type}. Only PDF, DOCX, DOC, and TXT files are supported.` 
      }, { status: 400 });
    }
    
    // Check file size (limit to 5MB)
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ 
        error: 'File too large', 
        details: 'Maximum file size is 5MB' 
      }, { status: 400 });
    }
    
    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Generate a unique key for S3
    const fileKey = `styles/${uuidv4()}-${file.name.replace(/\s+/g, '_')}`;
    
    // Determine content type
    let contentType = 'application/octet-stream'; // default
    if (fileExtension === 'pdf') contentType = 'application/pdf';
    else if (fileExtension === 'docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (fileExtension === 'doc') contentType = 'application/msword';
    else if (fileExtension === 'txt') contentType = 'text/plain';
    
    // Upload to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: fileKey,
      Body: buffer,
      ContentType: contentType
    }));
    
    // Return the file key for further processing
    return NextResponse.json({ styleFileKey: fileKey });
    
  } catch (error) {
    console.error('Error uploading style file:', error);
    return NextResponse.json(
      { error: 'Failed to upload style file', details: error.message },
      { status: 500 }
    );
  }
}
import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// Initialize S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const bucketName = process.env.AWS_S3_BUCKET;

export async function GET(request) {
  console.log("GET /api/download called");
  // Await cookies() and pass the resolved store
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  if (!bucketName) {
    console.error("[API_DOWNLOAD] AWS_S3_BUCKET environment variable not set.");
    return new NextResponse("Server configuration error: S3 bucket not specified.", { status: 500 });
  }
  
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  if (!key) {
    return new NextResponse("Missing required 'key' query parameter.", { status: 400 });
  }

  try {
    // 1. Authenticate the user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("[API_DOWNLOAD] Authentication error:", authError);
      return new NextResponse("Unauthorized", { status: 401 });
    }
    
    // 2. Verify user owns the dataset associated with the key
    const { data: dataset, error: dbError } = await supabase
      .from('datasets')
      .select('id') // Select minimal data 
      .eq('output_key', key)
      .eq('user_id', user.id)
      .maybeSingle(); 

    if (dbError) {
      console.error("[API_DOWNLOAD] Database error checking ownership:", dbError);
      return new NextResponse(`Database error: ${dbError.message}`, { status: 500 });
    }

    if (!dataset) {
      console.warn(`[API_DOWNLOAD] Access denied or key not found for user ${user.id} and key ${key}`);
      return new NextResponse("Forbidden: You do not have access to this file or it does not exist.", { status: 403 });
    }
    
    console.log(`[API_DOWNLOAD] User ${user.id} authorized to download key ${key}`);

    // 3. Generate a presigned URL for the S3 object
    const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
    const expiresIn = 60 * 15; // 15 minutes
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });

    console.log(`[API_DOWNLOAD] Generated presigned URL for user ${user.id}, key ${key}`);

    // 4. Redirect the user to the presigned URL
    return NextResponse.redirect(signedUrl, 302);

  } catch (error) {
    console.error("[API_DOWNLOAD] Error:", error);
    if (error.name === 'NoSuchKey') {
       return new NextResponse("File not found in storage.", { status: 404 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
} 
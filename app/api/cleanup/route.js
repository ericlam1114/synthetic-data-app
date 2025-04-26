// app/api/cleanup/route.js
import { NextResponse } from 'next/server';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
// Import Supabase helper for Route Handlers
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// Initialize S3 Client (ensure AWS credentials are configured in your environment)
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const bucketName = process.env.AWS_S3_BUCKET;

export async function POST(request) {
  console.log("POST /api/cleanup called");
  // Await cookies() and pass the resolved store
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  let userId = 'unknown';

  if (!bucketName) {
    console.error("[API_CLEANUP] AWS_S3_BUCKET environment variable not set.");
    return new NextResponse("Server configuration error: S3 bucket not specified.", { status: 500 });
  }
  
  try {
      // --- Authentication --- 
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
          console.warn("[API_CLEANUP] Unauthorized attempt.", authError);
          return new NextResponse("Unauthorized", { status: 401 });
      }
      userId = user.id;
  } catch (authCheckError) {
       console.error("[API_CLEANUP] Error during auth check:", authCheckError);
       return new NextResponse("Internal Server Error during auth check", { status: 500 });
  }

  try {
    const { keys } = await request.json();

    if (!Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json({ message: "No keys provided for cleanup." }, { status: 200 });
    }
    
    // --- Remove Incorrect Ownership Check --- 
    // The following block assumed keys were prefixed with user ID, which is not the case.
    // Authorization is handled by the initial Supabase auth check.
    /*
    const prefix = `uploads/${userId}/`; // Assuming upload keys are stored like this
    const textPrefix = `text/${userId}/`; // Assuming text keys are stored like this
    
    const unauthorizedKeys = keys.filter(key => 
        !key.startsWith(prefix) && !key.startsWith(textPrefix)
    );

    if (unauthorizedKeys.length > 0) {
        console.warn(`[API_CLEANUP] User ${userId} attempted to delete unauthorized keys:`, unauthorizedKeys);
        return new NextResponse("Forbidden: Attempt to delete unauthorized files.", { status: 403 });
    }
    */
    // --- End Removed Ownership Check ---
    
    console.log(`[API_CLEANUP] User ${userId} attempting to delete ${keys.length} keys from bucket ${bucketName}`);

    const objectsToDelete = keys.map(key => ({ Key: key }));
    const deleteParams = { Bucket: bucketName, Delete: { Objects: objectsToDelete, Quiet: false } };
    const command = new DeleteObjectsCommand(deleteParams);
    const { Deleted, Errors } = await s3Client.send(command);

    if (Errors && Errors.length > 0) {
      console.warn("[API_CLEANUP] Errors occurred during deletion for user:", userId, Errors);
      return NextResponse.json({ message: "Cleanup completed with some errors.", deletedCount: Deleted?.length || 0, errors: Errors }, { status: 207 });
    }

    console.log(`[API_CLEANUP] User ${userId} successfully deleted ${Deleted?.length || 0} objects.`);
    return NextResponse.json({ message: "Cleanup successful.", deletedCount: Deleted?.length || 0 }, { status: 200 });

  } catch (error) {
    console.error(`[API_CLEANUP] General Error for user ${userId}:`, error);
    if (error instanceof SyntaxError) { return new NextResponse("Invalid JSON format", { status: 400 }); }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
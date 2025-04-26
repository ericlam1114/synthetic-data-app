import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';

// Initialize S3 Client
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});
const bucketName = process.env.AWS_S3_BUCKET;
const outputPrefix = process.env.S3_OUTPUT_PREFIX || 'output/'; // Use environment variable or default

export async function POST(request) {
    console.log("POST /api/datasets/save-prepared called");

    // Await cookies() and pass the resolved store
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    if (!bucketName) {
        return new NextResponse("Server configuration error: S3 bucket not specified.", { status: 500 });
    }

    try {
        // 1. Authenticate user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            console.error("[API_SAVE_PREPARED] Auth error:", authError);
            return new NextResponse("Unauthorized", { status: 401 });
        }
        const userId = user.id;

        // 2. Get content and original keys from request body
        const { content, originalOutputKeys } = await request.json(); 
        if (typeof content !== 'string' || !Array.isArray(originalOutputKeys) || originalOutputKeys.length === 0) {
            return new NextResponse("Invalid request body: 'content' (string) and 'originalOutputKeys' (array) required.", { status: 400 });
        }

        // 3. Generate new S3 key and filename
        // We can base the name on the original files or create a new one
        const firstOriginalKey = originalOutputKeys[0];
        const baseName = firstOriginalKey.split('/').pop().replace(/\.[^/.]+$/, ""); // Get filename without extension
        const newFileName = `${baseName}-prepared-${uuidv4().substring(0, 8)}.jsonl`;
        const newS3Key = `${outputPrefix}${userId}/${newFileName}`; // Store under user ID

        console.log(`[API_SAVE_PREPARED] Saving prepared data for user ${userId} to key ${newS3Key}`);

        // 4. Upload prepared content to S3
        const putCommand = new PutObjectCommand({
            Bucket: bucketName,
            Key: newS3Key,
            Body: content,
            ContentType: 'application/jsonl', // Set correct content type
        });
        await s3Client.send(putCommand);

        console.log(`[API_SAVE_PREPARED] Successfully uploaded ${newS3Key} to S3`);

        // 5. Create new dataset record in Supabase
        const newDatasetName = `${baseName} (Prepared)`;
        const { data: newDatasetRecord, error: insertError } = await supabase
            .from('datasets')
            .insert({
                user_id: userId,
                name: newDatasetName,
                output_key: newS3Key, 
                file_key: null, // No direct original file key for prepared data
                text_key: null, // No direct text key for prepared data
                format: 'jsonl', // Assuming prepared data is always jsonl
                // Consider adding a link to original dataset IDs if needed
                // original_dataset_ids: originalDatasetIds (need to fetch these based on keys first)
            })
            .select()
            .single();
        
        if (insertError) {
            console.error(`[API_SAVE_PREPARED] Error saving dataset record for user ${userId}:`, insertError);
             // Attempt to delete the just-uploaded S3 file if DB insert fails
            try {
                 const deleteCommand = new DeleteObjectCommand({ Bucket: bucketName, Key: newS3Key });
                 await s3Client.send(deleteCommand);
                 console.log(`[API_SAVE_PREPARED] Cleaned up S3 file ${newS3Key} due to DB error.`);
            } catch (cleanupError) {
                 console.error(`[API_SAVE_PREPARED] Failed to cleanup S3 file ${newS3Key} after DB error:`, cleanupError);
            }
            return new NextResponse(`Database error saving prepared dataset: ${insertError.message}`, { status: 500 });
        }

        console.log(`[API_SAVE_PREPARED] Saved new dataset record: ${newDatasetRecord.id}`);

        // 6. Return success response with the new key
        return NextResponse.json({ 
            message: "Prepared data saved successfully.", 
            newOutputKey: newS3Key,
            newDatasetId: newDatasetRecord.id
        }, { status: 201 });

    } catch (error) {
        console.error("[API_SAVE_PREPARED] General Error:", error);
        if (error instanceof SyntaxError) {
            return new NextResponse("Invalid JSON format in request body", { status: 400 });
        }
        return new NextResponse("Internal Server Error while saving prepared data.", { status: 500 });
    }
} 
import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
// Import Supabase helper for Route Handlers
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Readable } from 'stream';

// Initialize S3 Client
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});
const bucketName = process.env.AWS_S3_BUCKET;

// Helper function to download from S3 and return content as string
async function getS3FileContent(key) {
    const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
    try {
        const { Body } = await s3Client.send(command);
        if (!Body || !(Body instanceof Readable)) throw new Error('S3 Body is not a readable stream');
        return new Promise((resolve, reject) => {
            const chunks = [];
            Body.on('data', (chunk) => chunks.push(chunk));
            Body.on('error', reject);
            Body.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        });
    } catch (error) {
        console.error(`Failed to download/read S3 key ${key}:`, error);
        throw new Error(`Could not retrieve dataset file: ${key}. ${error.message}`);
    }
}

export async function GET(request) {
    console.log("GET /api/datasets/content called");
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    if (!bucketName) {
        return new NextResponse("Server config error", { status: 500 });
    }

    try {
        // 1. Authenticate user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }
        const userId = user.id;

        // 2. Get keys from query parameters
        const { searchParams } = new URL(request.url);
        const keysParam = searchParams.get('keys');
        if (!keysParam) {
            return new NextResponse("Missing keys param", { status: 400 });
        }
        const outputKeys = keysParam.split(',').map(decodeURIComponent).filter(Boolean);
        if (outputKeys.length === 0) {
            return new NextResponse("No valid keys", { status: 400 });
        }

        // 3. Verify dataset ownership
        const { data: datasets, error: dbError } = await supabase
            .from('datasets')
            .select('id') // Minimal select
            .in('output_key', outputKeys)
            .eq('user_id', userId);
        if (dbError) {
            return new NextResponse("DB error verifying ownership", { status: 500 });
        }
        // Ensure the user owns ALL requested keys
        if (datasets?.length !== outputKeys.length) {
            const ownedKeys = new Set(datasets.map(d => d.output_key));
            const missingKeys = outputKeys.filter(k => !ownedKeys.has(k));
            console.warn(`[API_DS_CONTENT] User ${userId} attempted to access unowned/non-existent keys: ${missingKeys.join(', ')}`);
            return new NextResponse(`Forbidden`, { status: 403 });
        }

        console.log(`[API_DS_CONTENT] Fetching content for ${outputKeys.length} keys for user ${userId}`);

        // 4. Download and Merge Datasets
        let mergedContent = '';
        for (const key of outputKeys) {
            try {
                mergedContent += (await getS3FileContent(key)).trim() + '\n';
            } catch (downloadError) {
                console.error(`[API_DS_CONTENT] Failed process key ${key}:`, downloadError);
                return new NextResponse(`Failed process dataset file: ${key}`, { status: 500 });
            }
        }
        
        console.log(`[API_DS_CONTENT] Merged content for user ${userId}`);
        // 5. Return merged content
        return NextResponse.json({ mergedContent });

    } catch (error) {
        console.error("[API_DS_CONTENT] General Error:", error);
        if (error instanceof SyntaxError) {
            return new NextResponse("Invalid JSON format", { status: 400 });
        }
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
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

// --- Conversion Logic Helpers ---
const parseData = (dataString, format) => {
    console.log(`[Convert API] Parsing data from format: ${format}`);
    try {
        if (format.includes('jsonl')) {
            // Handle potential empty lines
            return dataString.trim().split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line));
        } else if (format === 'json') {
            return JSON.parse(dataString);
        } else if (format === 'csv') {
            const lines = dataString.trim().split('\n');
            if (lines.length < 2) return []; // Need headers and at least one data row
            const headers = lines[0].split(',').map(h => h.trim());
            return lines.slice(1).map(line => {
                const values = line.split(','); // Basic split, won't handle commas in fields
                let obj = {};
                headers.forEach((header, index) => {
                    obj[header] = values[index]?.trim() ?? ''; // Handle missing values
                });
                return obj;
            });
        }
    } catch (e) {
        console.error(`Parsing failed for format ${format}:`, e);
        throw new Error(`Failed to parse data as ${format}. Check file content.`);
    }
    throw new Error(`Unsupported input format for parsing: ${format}`);
};

const formatData = (parsedData, targetFormat) => {
    console.log(`[Convert API] Formatting data to target format: ${targetFormat}`);
    if (!Array.isArray(parsedData)) {
       throw new Error("Parsed data must be an array for formatting.");
    }
    try {
        if (targetFormat.includes('jsonl')) {
            return parsedData.map(item => JSON.stringify(item)).join('\n');
        } else if (targetFormat === 'json') {
            return JSON.stringify(parsedData, null, 2); // Pretty print JSON
        } else if (targetFormat === 'csv') {
            if (parsedData.length === 0) return "";
            // Ensure consistent headers, even if keys vary slightly between objects
            const allKeys = new Set();
            parsedData.forEach(item => Object.keys(item).forEach(key => allKeys.add(key)));
            const headers = Array.from(allKeys);
            
            const csvRows = parsedData.map(item => {
                return headers.map(header => {
                    let value = item[header] ?? ''; // Default to empty string if key missing
                    // Basic CSV escaping: quote if value contains comma, newline, or quote
                    if (typeof value === 'string' && (value.includes(',') || value.includes('\n') || value.includes('"'))) {
                        value = `"${value.replace(/"/g, '""')}"`; // Escape quotes by doubling them
                    }
                    return value;
                }).join(',');
            });
            return `${headers.join(',')}\n${csvRows.join('\n')}`;
        }
    } catch (e) {
        console.error(`Formatting failed for target format ${targetFormat}:`, e);
        throw new Error(`Failed to format data as ${targetFormat}.`);
    }
    throw new Error(`Unsupported target format for formatting: ${targetFormat}`);
};
// --- End Helpers ---

export async function POST(request) {
    console.log("POST /api/datasets/convert called");
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    let userId = 'unknown';

    if (!bucketName) {
        console.error("[Convert API] AWS_S3_BUCKET environment variable not set.");
        return new NextResponse("Server configuration error: S3 bucket not specified.", { status: 500 });
    }

    try {
        // --- Authentication ---
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            console.warn("[Convert API] Unauthorized attempt.", authError);
            return new NextResponse("Unauthorized", { status: 401 });
        }
        userId = user.id;

        // --- Get ID and Target Format from Body ---
        const { id: datasetId, targetFormat } = await request.json();

        if (!datasetId || !targetFormat) {
            return new NextResponse("Missing required fields (id, targetFormat)", { status: 400 });
        }
        console.log(`[Convert API] User ${userId} converting dataset ${datasetId} to ${targetFormat}`);

        // --- Fetch the dataset record ---
        const { data: dataset, error: fetchError } = await supabase
            .from('datasets')
            .select('id, name, output_key, format, user_id')
            .eq('id', datasetId)
            .eq('user_id', userId)
            .single();

        if (fetchError || !dataset) {
            console.warn(`[Convert API] Dataset ${datasetId} not found or not owned by user ${userId}.`, fetchError);
            return new NextResponse("Dataset not found or access denied", { status: 404 });
        }

        if (dataset.format === targetFormat) {
             return new NextResponse("Target format is the same as the current format.", { status: 400 });
        }

        console.log(`[Convert API] Found dataset: ${dataset.name}, Current Format: ${dataset.format}, Key: ${dataset.output_key}`);

        // --- Download original file from S3 ---
        console.log(`[Convert API] Downloading original file: ${dataset.output_key}`);
        const getObjectParams = { Bucket: bucketName, Key: dataset.output_key };
        const getCommand = new GetObjectCommand(getObjectParams);
        let originalDataString;
        try {
            const { Body } = await s3Client.send(getCommand);
            if (!Body) throw new Error("S3 GetObjectCommand returned empty body.");
            originalDataString = await Body.transformToString('utf-8'); // Assuming utf-8
        } catch (s3Error) {
            console.error(`[Convert API] Error downloading S3 object ${dataset.output_key}:`, s3Error);
            return new NextResponse("Failed to download original dataset file.", { status: 500 });
        }
        console.log(`[Convert API] Downloaded ${originalDataString.length} bytes.`);

        // --- Parse data based on current format ---
        let parsedDataObject;
        try {
             parsedDataObject = parseData(originalDataString, dataset.format);
             console.log(`[Convert API] Successfully parsed ${Array.isArray(parsedDataObject) ? parsedDataObject.length : 'object'} records/structure.`);
        } catch (parseError) {
             console.error(`[Convert API] Error parsing data from format ${dataset.format}:`, parseError);
             return new NextResponse(`Failed to parse original data: ${parseError.message}`, { status: 400 });
        }

        // --- Format data to target format ---
        let convertedDataString;
        try {
            convertedDataString = formatData(parsedDataObject, targetFormat);
            console.log(`[Convert API] Successfully formatted data to ${targetFormat}. New length: ${convertedDataString.length} bytes.`);
        } catch (formatError) {
             console.error(`[Convert API] Error formatting data to target format ${targetFormat}:`, formatError);
             return new NextResponse(`Failed to format data: ${formatError.message}`, { status: 500 });
        }

        // --- Upload converted file to S3 with a new key ---
        const fileExtension = targetFormat.split('-')[0]; // e.g., 'jsonl', 'json', 'csv'
        const newKey = `output/${uuidv4()}_${dataset.name}_converted_to_${fileExtension}.${fileExtension}`;
        console.log(`[Convert API] Uploading converted file to: ${newKey}`);
        const putObjectParams = {
            Bucket: bucketName,
            Key: newKey,
            Body: convertedDataString,
            ContentType: `application/${fileExtension === 'jsonl' ? 'x-jsonlines' : fileExtension}`, // Adjust content type
        };
        const putCommand = new PutObjectCommand(putObjectParams);
        try {
             await s3Client.send(putCommand);
             console.log(`[Convert API] Successfully uploaded converted file to S3.`);
        } catch (s3UploadError) {
             console.error(`[Convert API] Error uploading converted file to S3 key ${newKey}:`, s3UploadError);
             return new NextResponse("Failed to save converted dataset file.", { status: 500 });
        }

        // --- Update dataset record in Supabase ---
        console.log(`[Convert API] Updating Supabase record for dataset ${datasetId}`);
        const { data: updatedDataset, error: updateError } = await supabase
            .from('datasets')
            .update({
                format: targetFormat,
                output_key: newKey,
            })
            .eq('id', datasetId)
            .eq('user_id', userId)
            .select()
            .single();

        if (updateError) {
             console.error(`[Convert API] Error updating Supabase dataset record ${datasetId}:`, updateError);
             return new NextResponse(`Failed to update dataset record: ${updateError.message}`, { status: 500 });
        }

        console.log(`[Convert API] Dataset ${datasetId} converted and updated successfully.`);
        
        // --- Delete the OLD S3 file ---
        try {
             console.log(`[Convert API] Deleting old S3 file: ${dataset.output_key}`);
             await s3Client.send(new DeleteObjectsCommand({ Bucket: bucketName, Delete: { Objects: [{ Key: dataset.output_key }] } }));
        } catch(deleteError) {
             console.warn(`[Convert API] Failed to delete old S3 file ${dataset.output_key}. Manual cleanup may be required.`, deleteError);
        }
        // --- End Delete ---

        return NextResponse.json(updatedDataset, { status: 200 });

    } catch (error) {
        console.error(`[Convert API] General Error for user ${userId}:`, error);
        if (error instanceof SyntaxError) {
            return new NextResponse("Invalid JSON format in request body", { status: 400 });
        }
        return new NextResponse("Internal Server Error", { status: 500 });
    }
} 
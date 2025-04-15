// app/api/cleanup/route.js
import { NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
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

/**
 * Cleanup API endpoint to delete temporary files from S3
 * This can be called after processing is complete or if processing fails
 */
export async function POST(request) {
  try {
    // Get the keys to delete from the request
    const { keys, prefix, cleanupType } = await request.json();
    
    let objectsDeleted = 0;
    let errors = [];
    
    // If specific keys are provided, delete them
    if (keys && Array.isArray(keys) && keys.length > 0) {
      // Delete each key individually
      for (const key of keys) {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: key
          }));
          objectsDeleted++;
        } catch (error) {
          console.error(`Error deleting object with key ${key}:`, error);
          errors.push({ key, error: error.message });
        }
      }
    } 
    // If a prefix is provided, list and delete all objects with that prefix
    else if (prefix) {
      try {
        // List all objects with the prefix
        const listCommand = new ListObjectsV2Command({
          Bucket: process.env.AWS_S3_BUCKET,
          Prefix: prefix
        });
        
        const listResponse = await s3Client.send(listCommand);
        
        if (listResponse.Contents && listResponse.Contents.length > 0) {
          // Delete each object
          for (const object of listResponse.Contents) {
            try {
              await s3Client.send(new DeleteObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET,
                Key: object.Key
              }));
              objectsDeleted++;
            } catch (error) {
              console.error(`Error deleting object with key ${object.Key}:`, error);
              errors.push({ key: object.Key, error: error.message });
            }
          }
        }
      } catch (error) {
        console.error(`Error listing objects with prefix ${prefix}:`, error);
        errors.push({ prefix, error: error.message });
      }
    }
    // If cleanup type is "session", delete temporary files from this session
    else if (cleanupType === "session") {
      try {
        // Get session ID from cookies or headers if needed
        // For now, we'll use a timestamp as a basic identifier
        const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        // Delete uploads from today
        const uploadsPrefix = `uploads/${timestamp}`;
        const textPrefix = `text/${timestamp}`;
        const outputPrefix = `output/${timestamp}`;
        
        // List and delete uploads
        for (const prefix of [uploadsPrefix, textPrefix, outputPrefix]) {
          try {
            const listCommand = new ListObjectsV2Command({
              Bucket: process.env.AWS_S3_BUCKET,
              Prefix: prefix
            });
            
            const listResponse = await s3Client.send(listCommand);
            
            if (listResponse.Contents && listResponse.Contents.length > 0) {
              for (const object of listResponse.Contents) {
                try {
                  await s3Client.send(new DeleteObjectCommand({
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: object.Key
                  }));
                  objectsDeleted++;
                } catch (error) {
                  console.error(`Error deleting object with key ${object.Key}:`, error);
                  errors.push({ key: object.Key, error: error.message });
                }
              }
            }
          } catch (error) {
            console.error(`Error listing objects with prefix ${prefix}:`, error);
            errors.push({ prefix, error: error.message });
          }
        }
      } catch (error) {
        console.error(`Error in session cleanup:`, error);
        errors.push({ cleanupType, error: error.message });
      }
    }
    
    // Return the results
    return NextResponse.json({
      success: true,
      objectsDeleted,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('Error in cleanup API:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup storage', details: error.message },
      { status: 500 }
    );
  }
}
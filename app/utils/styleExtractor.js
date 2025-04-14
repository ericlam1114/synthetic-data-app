// app/utils/styleExtractor.js
import { getS3Client } from './aws';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import getConfig from 'next/config';

// Get server-side config
const { serverRuntimeConfig } = getConfig();

/**
 * Extract text from a style sample document
 * @param {string} fileKey - S3 key of the uploaded file
 * @param {number} maxLength - Maximum characters to extract (default: 1000)
 * @returns {Promise<string>} - The extracted text, truncated to maxLength
 */
export async function extractStyleSample(fileKey, maxLength = 1000) {
  try {
    // Initialize S3 client
    const s3Client = getS3Client();
    
    // Get file extension
    const fileExtension = fileKey.split('.').pop().toLowerCase();
    
    // Get the file from S3
    const getObjectCommand = new GetObjectCommand({
      Bucket: serverRuntimeConfig.aws.s3Bucket,
      Key: fileKey
    });
    
    const response = await s3Client.send(getObjectCommand);
    
    // Process based on file type
    let extractedText = '';
    
    if (fileExtension === 'txt') {
      // For plain text files, just get the content
      extractedText = await response.Body.transformToString();
    } 
    else if (fileExtension === 'pdf') {
      // For PDFs, use pdf-parse
      const buffer = await streamToBuffer(response.Body);
      
      // Use dynamic import to avoid server-side issues
      const pdfParse = (await import('pdf-parse')).default;
      const pdfData = await pdfParse(buffer);
      extractedText = pdfData.text;
    } 
    else if (fileExtension === 'docx' || fileExtension === 'doc') {
      // For DOCX files, use mammoth
      const buffer = await streamToBuffer(response.Body);
      
      // Use dynamic import to avoid server-side issues
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      extractedText = result.value;
    }
    
    // Clean up the text
    extractedText = cleanText(extractedText);
    
    // Truncate to maxLength
    if (extractedText.length > maxLength) {
      // Try to find a sentence break near the maxLength
      const truncated = findSentenceBreak(extractedText, maxLength);
      return truncated;
    }
    
    return extractedText;
  } catch (error) {
    console.error('Error extracting style sample:', error);
    throw error;
  }
}

/**
 * Convert stream to buffer
 */
async function streamToBuffer(stream) {
  // Browser environment
  if (typeof window !== 'undefined' && window.ReadableStream) {
    const reader = stream.getReader();
    const chunks = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    return new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], []));
  }
  
  // Node.js environment
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Clean up the extracted text
 */
function cleanText(text) {
  return text
    .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
    .replace(/\n+/g, ' ') // Replace newlines with spaces
    .trim(); // Remove leading/trailing whitespace
}

/**
 * Find a sentence break near the specified length
 */
function findSentenceBreak(text, maxLength) {
  // If the text is shorter than maxLength, return it as is
  if (text.length <= maxLength) {
    return text;
  }
  
  // Look for a sentence ending within 20% of maxLength
  const searchWindow = Math.floor(maxLength * 0.2);
  const endPos = Math.min(text.length, maxLength);
  const startPos = Math.max(0, endPos - searchWindow);
  
  // Extract the segment to search
  const segment = text.substring(startPos, endPos);
  
  // Find the last sentence break in the segment
  const match = segment.match(/[.!?]\s+[A-Z]/g);
  
  if (match && match.length > 0) {
    // Get position of the last match
    const lastMatch = match[match.length - 1];
    const matchPos = segment.lastIndexOf(lastMatch);
    
    // Return text up to the end of the sentence
    return text.substring(0, startPos + matchPos + 1);
  }
  
  // If no sentence break is found, just truncate at maxLength
  return text.substring(0, maxLength);
}
// lib/workers/documentProcessor.js
import { getPipelineConfig } from "../config/pipelineConfig.js";
import SyntheticDataPipeline from "../../app/lib/SyntheticDataPipeline.js";
import QASyntheticDataPipeline from "../../app/lib/QASyntheticDataPipeline.js";
import FinanceSyntheticDataPipeline from "../../app/lib/FinanceSyntheticDataPipeline.js";
import { v4 as uuidv4 } from "uuid";
import { forceGC } from "../utils/enhancedMemoryManager.js";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { pdfParse } from "../utils/pdfParseWrapper.js";
import jobService from "../services/jobService.js";

// Initialize the S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// --- Constants --- 
const DEFAULT_CHUNK_SIZE = 4000; // Characters per chunk for splitting large text
// -----------------

/**
 * Helper function to ensure job lock is maintained during CPU-intensive operations
 * @param {Object} jobContext - The job context object with progress method
 * @param {Number} currentProgress - Current progress percentage  
 * @param {String} message - Current progress message
 * @param {Number} intervalMs - How often to send heartbeats (ms)
 * @returns {Function} - A cleanup function to stop the heartbeat
 */
function maintainJobLock(jobContext, currentProgress, message, intervalMs = 5000) {
  if (!jobContext || !jobContext.progress) return () => {};
  
  let lastHeartbeat = Date.now();
  let heartbeatCount = 0;
  
  // Send an initial heartbeat
  try {
    jobContext.progress(currentProgress, `${message} (maintaining connection)`);
  } catch (error) {
    console.warn('Error sending initial heartbeat:', error.message);
  }
  
  // Set up interval to keep updating progress with small increments
  const interval = setInterval(() => {
    try {
      heartbeatCount++;
      lastHeartbeat = Date.now();
      
      // Alternate between same progress and tiny increments to ensure Bull detects the update
      const progressToReport = heartbeatCount % 2 === 0 
        ? currentProgress
        : Math.min(currentProgress + 0.1, 99.9);
        
      // Don't increase progress, just refresh the lock by reporting the same progress
      jobContext.progress(
        progressToReport, 
        `${message} (heartbeat #${heartbeatCount} - ${new Date().toISOString()})`
      );
    } catch (error) {
      console.warn(`Error maintaining job lock (heartbeat #${heartbeatCount}):`, error.message);
      // Continue running despite errors - the timeout will eventually clear this
    }
  }, intervalMs);
  
  // Return function to clear the interval
  return () => {
    clearInterval(interval);
    
    // Log how long the lock was maintained
    const duration = (Date.now() - lastHeartbeat) / 1000;
    console.log(`Job lock maintained for ${duration.toFixed(1)}s with ${heartbeatCount} heartbeats`);
  };
}

/**
 * Extract text from a PDF page by page
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} jobId - Job ID for tracking progress
 * @returns {Promise<Array<{pageNum: number, text: string}>>} - Array of page texts
 */
async function extractTextByPage(pdfBuffer, jobId) {
  try {
    // Load the PDF document
    const pdf = await pdfParse(pdfBuffer);
    const totalPages = pdf.numpages;

    // Update job status
    await jobService.updateJob(jobId, {
      status: "extracting",
      message: `Extracting text from PDF (${totalPages} pages)`,
      progress: 20,
      totalPages,
      currentPage: 0,
    });

    // Array to hold page text
    const pageTexts = [];

    // Process each page separately
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      // Extract text from this page
      const pageData = await pdfParse(pdfBuffer, {
        max: pageNum, // Max pages to parse
        pagerender: (render) => {
          return render.getTextContent({
            normalizeWhitespace: true,
            disableCombineTextItems: false,
          });
        },
      });

      // Get text content from this page only
      const pageText = pageData.text;

      // Store the page text
      pageTexts.push({
        pageNum,
        text: pageText,
      });

      // Update job status
      await jobService.updateJob(jobId, {
        status: "extracting",
        message: `Extracted text from page ${pageNum} of ${totalPages}`,
        progress: 20 + Math.floor((pageNum / totalPages) * 30),
        currentPage: pageNum,
      });

      // Force garbage collection after each page
      forceGC();
    }

    return pageTexts;
  } catch (error) {
    console.error("Error extracting text by page:", error);
    throw error;
  }
}

/**
 * Process a PDF document page by page
 * @param {string} fileKey - S3 key of the PDF file
 * @param {string} pipelineType - Type of pipeline to use
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} - Processing results
 */
export async function processDocumentPageByPage(
  fileKey,
  pipelineType = "legal",
  options = {}
) {
  // Create a job ID
  const jobId = options.jobId || uuidv4();

  try {
    // Initialize job status
    await jobService.saveJob(jobId, {
      id: jobId,
      status: "initialized",
      message: "Initializing document processing",
      progress: 0,
      fileKey,
      pipelineType,
      options,
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      errors: [], // Initialize empty errors array
    });

    // Update job status
    await jobService.updateJob(jobId, {
      status: "downloading",
      message: "Downloading document from storage",
      progress: 10,
    });

    // Download the PDF file
    const fileResponse = await s3Client.send(
      new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileKey,
      })
    );

    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of fileResponse.Body) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    // Extract text from PDF pages
    const pageTexts = await extractTextByPage(fileBuffer, jobId);

    // Clear file buffer from memory
    forceGC();

    // Create temp directory for page results
    const tempDir = `tmp/jobs/${jobId}`;
    const resultPaths = [];

    // Update job with page info
    await jobService.updateJob(jobId, {
      status: "processing",
      message: `Processing ${pageTexts.length} pages`,
      progress: 50,
      totalPages: pageTexts.length,
      currentPage: 0,
      resultPaths: [],
    });

    // Track timeout errors
    let timeoutErrors = 0;
    const maxTimeoutErrors = 5; // Maximum number of timeouts before failing job

    // Process each page separately
    for (let i = 0; i < pageTexts.length; i++) {
      const { pageNum, text } = pageTexts[i];

      // Update job status
      await jobService.updateJob(jobId, {
        status: "processing",
        message: `Processing page ${pageNum} of ${pageTexts.length}`,
        progress: 50 + Math.floor((i / pageTexts.length) * 40),
        currentPage: pageNum,
      });

      // Create appropriate pipeline with progress reporting and error handling
      const pipeline = createPipeline(pipelineType, {
        ...options,
        jobId,
        onProgress: async (progress) => {
          // Update job with progress
          if (options.onProgress) {
            options.onProgress(progress);
          }
          
          // Only update job status if this is not an error message
          if (!progress.isError) {
            await jobService.updateJob(jobId, {
              status: "processing",
              message: progress.message,
              progress: 50 + Math.floor((i / pageTexts.length) * 40) + (progress.progress / 100) * (40 / pageTexts.length),
              detail: progress.stage,
            });
          }
        },
      });

      try {
        // Process the current page
        // Start heartbeat to prevent stalling during page processing
        const stopHeartbeat = maintainJobLock(
          { progress: async (p, m) => await jobService.updateJob(jobId, { progress: p, message: m }) },
          50 + Math.floor((i / pageTexts.length) * 40),
          `Processing page ${pageNum}`,
          15000
        );
        
        let pageResult;
        try {
          pageResult = await pipeline.process(text);
        } finally {
          stopHeartbeat();
        }
        
        // Store page result
        const resultPath = `${tempDir}/page_${pageNum}.json`;
        await s3Client.send(
          new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: resultPath,
            Body: JSON.stringify({
              pageNum,
              result: pageResult,
            }),
            ContentType: "application/json",
          })
        );

        // Add to result paths
        resultPaths.push(resultPath);

        // Update job with new result path
        await jobService.updateJob(jobId, {
          status: "processing",
          currentPage: pageNum,
          resultPaths,
          message: `Processed page ${pageNum} of ${pageTexts.length}`,
        });
      } catch (pageError) {
        // Check if it's a timeout error
        const isTimeout = pageError.message?.includes('timeout') || 
                          pageError.code === 'ETIMEDOUT' || 
                          pageError.code === 'ESOCKETTIMEDOUT' ||
                          pageError.message?.includes('AI model timeout');
        
        console.error(`Error processing page ${pageNum}:`, pageError);
        
        // Get current job to access its errors
        const currentJob = await jobService.getJob(jobId);
        const errors = currentJob.errors || [];
        
        if (isTimeout) {
          timeoutErrors++;
          
          // Add error information
          errors.push({
            type: 'timeout',
            stage: 'page_processing',
            message: `Timeout while processing page ${pageNum}: ${pageError.message}`,
            timestamp: new Date().toISOString(),
            pageNum
          });
          
          // Update job with error information
          await jobService.updateJob(jobId, {
            errors,
            hasTimeouts: true,
            timeoutCount: timeoutErrors,
            lastError: pageError.message,
            lastErrorTime: new Date().toISOString(),
            message: `⚠️ Timeout on page ${pageNum}. Continuing with next page...`,
          });
          
          // If we've hit the max timeout limit, fail the job
          if (timeoutErrors >= maxTimeoutErrors) {
            await jobService.updateJob(jobId, {
              status: "failed",
              message: `Too many timeouts (${timeoutErrors} pages). Try processing a smaller document or simplifying content.`,
              progress: 50 + Math.floor((i / pageTexts.length) * 40),
              failed: new Date().toISOString(),
              failureReason: "excessive_timeouts"
            });
            
            throw new Error(`Job failed due to excessive timeouts (${timeoutErrors} pages). Try processing a smaller document or simplifying content.`);
          }
          
          // Continue with next page
          continue;
        } else {
          // For non-timeout errors
          errors.push({
            type: 'processing_error',
            stage: 'page_processing',
            message: `Error processing page ${pageNum}: ${pageError.message}`,
            timestamp: new Date().toISOString(),
            pageNum
          });
          
          await jobService.updateJob(jobId, {
            errors,
            lastError: pageError.message,
            lastErrorTime: new Date().toISOString(),
            message: `⚠️ Error on page ${pageNum}. Continuing with next page...`,
          });
          
          // Continue with next page
          continue;
        }
      }

      // Force garbage collection
      forceGC();
    }
    
    // If we completed but there were some timeouts, include a warning in the message
    const finalStatus = timeoutErrors > 0 ? 
      `Completed with ${timeoutErrors} page timeout${timeoutErrors > 1 ? 's' : ''}. Some content may be missing.` :
      "Merging page results";
    
    // Merge results
    await jobService.updateJob(jobId, {
      status: "merging",
      message: finalStatus,
      progress: 90,
    });

    const mergedResults = await mergePageResults(
      resultPaths,
      pipelineType,
      options.outputFormat
    );

    // Store final results
    const outputKey = `output/${pipelineType}_${jobId}.${getFileExtension(
      options.outputFormat
    )}`;

    // --- Logging before S3 Put --- 
    console.log(`[Worker] Preparing to save output to S3 key: ${outputKey}`);
    console.log(`[Worker] Type of mergedResults: ${typeof mergedResults}`);
    console.log(`[Worker] Length of mergedResults: ${mergedResults?.length ?? 'undefined'}`);
    // --- End Logging --- 

    try { // --- Add specific try/catch around S3 put ---
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: outputKey,
          Body: mergedResults, 
          ContentType: getContentType(options.outputFormat),
        })
      );
      console.log(`[Worker] Successfully saved output to S3 key: ${outputKey}`); // Added log
    } catch (s3Error) {
      console.error(`[Worker] FAILED to save output to S3 key ${outputKey}:`, s3Error);
      jobContext?.progress(95, `Error saving results to S3: ${s3Error.message}`);
      // Re-throw the error so the job fails correctly
      throw new Error(`Failed to save results to S3: ${s3Error.message}`);
    }
    // --- End specific try/catch --- 

    // Mark job as completed, with warning if there were timeouts
    const completionStatus = timeoutErrors > 0 ? "completed_with_warnings" : "completed";
    const completionMessage = timeoutErrors > 0 ? 
      `Processing complete with ${timeoutErrors} timeout${timeoutErrors > 1 ? 's' : ''}. Some content may be incomplete.` : 
      "Processing complete";
    
    await jobService.updateJob(jobId, {
      status: completionStatus,
      message: completionMessage,
      progress: 100,
      outputKey,
      completed: new Date().toISOString(),
      timeoutCount: timeoutErrors,
    });

    return {
      success: true,
      jobId,
      outputKey,
      pipelineType,
      format: options.outputFormat,
      warnings: timeoutErrors > 0 ? [`${timeoutErrors} page${timeoutErrors > 1 ? 's' : ''} experienced timeout errors`] : undefined
    };
  } catch (error) {
    console.error(`Error in page-by-page processing: ${error.message}`);
    
    // Check if it's a timeout error
    const isTimeout = error.message?.includes('timeout') || 
                      error.code === 'ETIMEDOUT' || 
                      error.code === 'ESOCKETTIMEDOUT' ||
                      error.message?.includes('AI model timeout');
    
    // Mark job as failed with error details
    const failureReason = isTimeout ? "timeout" : "processing_error";
    const failureMessage = isTimeout ? 
      "Document processing timed out. The document may be too complex or too large." : 
      `Error processing document: ${error.message}`;
    
    try {
      await jobService.updateJob(jobId, {
        status: "failed",
        message: failureMessage,
        failureReason,
        failed: new Date().toISOString(),
        lastError: error.message,
        lastErrorTime: new Date().toISOString(),
      });
    } catch (updateError) {
      console.error(`Error updating job status for failed job: ${updateError.message}`);
    }

    // Re-throw the error
    throw error;
  }
}

/**
 * Process document from a background job
 * Handles text extraction, chunking (if needed), and pipeline processing.
 * @param {string} textKey - S3 key of the text/PDF to process
 * @param {string} pipelineType - Type of pipeline to use
 * @param {Object} options - Pipeline options
 * @param {Object} jobContext - Job context for progress updates
 * @returns {Promise<Object>} - Processing results
 */
export async function processDocumentInBackground(
  textKey, // Can be PDF or TXT key now
  pipelineType = "legal",
  options = {},
  jobContext // Contains jobId and progress function
) {
  const jobId = options.jobId || jobContext?.jobId || uuidv4();
  const updateJob = (update) => jobService.updateJob(jobId, update); // Helper
  const updateProgress = (progress, message, stage = 'processing') => {
      // Update job status using the helper
      updateJob({ progress, message, stage, status: 'running' }); // Ensure status is set to running during progress
      jobContext?.progress(progress, message);
  }

  try {
    // Start progress reporting after initial setup
    updateProgress(5, "Downloading document from storage", "downloading"); // Set stage correctly

    // Download the file
    const fileResponse = await s3Client.send(
      new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: textKey,
      })
    );
    const fileBuffer = Buffer.concat(await fileResponse.Body.toArray());
    const contentType = fileResponse.ContentType || '';
    console.log(`[Worker ${jobId}] Downloaded ${fileBuffer.length} bytes, content-type: ${contentType}`);

    let fullText = '';
    if (contentType.includes('pdf') || textKey.toLowerCase().endsWith('.pdf')) {
        updateProgress(10, "Extracting text from PDF...");
        // Simple text extraction for now, not page-by-page for chunking
        const pdfData = await pdfParse(fileBuffer);
        fullText = pdfData.text;
        updateProgress(20, `Extracted ${fullText.length} characters from PDF.`);
    } else {
        updateProgress(15, "Reading text file...");
        fullText = fileBuffer.toString('utf8');
        updateProgress(20, `Read ${fullText.length} characters from file.`);
    }
    
    forceGC(); // Free buffer memory

    // --- Document Chunking --- 
    updateProgress(25, "Preparing text chunks...");
    let chunks = [];
    
    console.log(`[Worker ${jobId}] Using fixed-size chunking ONLY (Size: ${DEFAULT_CHUNK_SIZE}).`);
    if (fullText && fullText.length > 0) { // Ensure fullText is not empty
      for (let i = 0; i < fullText.length; i += DEFAULT_CHUNK_SIZE) {
          const chunkContent = fullText.slice(i, i + DEFAULT_CHUNK_SIZE).trim();
          if (chunkContent.length > 10) { // Only add non-trivial chunks
             chunks.push(chunkContent);
          }
      }
    } else {
       console.warn(`[Worker ${jobId}] Full text was empty or null, cannot create chunks.`);
    }
    
    console.log(`[Worker ${jobId}] Split document into ${chunks.length} chunks.`);
    if (chunks.length === 0) {
        // If still no chunks, it means the document was likely empty after trimming/filtering
        throw new Error("Document contains no processable text content after chunking.");
    }
    await updateJob({ totalChunks: chunks.length, currentChunk: 0 });
    // ------------------------

    let allResults = []; // Array to hold results from all chunks
    const CHUNK_PROGRESS_RANGE = 65; // Assign 65% of progress to chunk processing (25% -> 90%)
    const PROGRESS_START = 25;

    // --- Process Chunks Iteratively --- 
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const chunkProgressStart = PROGRESS_START + (i / chunks.length) * CHUNK_PROGRESS_RANGE;
      const chunkProgressEnd = PROGRESS_START + ((i + 1) / chunks.length) * CHUNK_PROGRESS_RANGE;
      const currentOverallProgress = Math.round(chunkProgressStart);

      updateProgress(currentOverallProgress, `Processing chunk ${i + 1} of ${chunks.length}`);
      await updateJob({ currentChunk: i + 1 });

      const pipeline = createPipeline(pipelineType, {
          ...options,
          // Update progress relative to this chunk's range
          onProgress: (progressData) => {
              const progressWithinChunk = (progressData.progress || 0) / 100;
              const overallProgress = chunkProgressStart + progressWithinChunk * (chunkProgressEnd - chunkProgressStart);
              updateProgress(Math.round(overallProgress), progressData.message, progressData.stage);
          },
      });

      const stopHeartbeat = maintainJobLock(jobContext, currentOverallProgress, `Processing chunk ${i + 1}`, 15000);
      
      try {
          console.log(`[Worker ${jobId}] Processing chunk ${i+1}/${chunks.length} (length: ${chunkText.length})`);
          const chunkResult = await pipeline.process(chunkText);
          if (chunkResult && chunkResult.output) {
             // --- Add Logging for Chunk Output --- 
             const outputLines = chunkResult.output.trim().split('\n');
             const numPairs = outputLines.filter(line => line.trim() !== '').length;
             console.log(`[Worker ${jobId}] Chunk ${i+1} processed. Generated ${numPairs} Q&A pairs. Result length: ${chunkResult.output.length}`);
             // -----------------------------------
             allResults.push(chunkResult.output);
          } else {
             console.warn(`[Worker ${jobId}] Chunk ${i+1} processing returned no output.`);
          }
      } catch (chunkError) {
          console.error(`[Worker ${jobId}] Error processing chunk ${i + 1}:`, chunkError);
          // Log error to job record but continue processing other chunks
          const currentJob = await jobService.getJob(jobId);
          const errors = currentJob?.errors || [];
          errors.push({
              type: 'chunk_processing_error',
              stage: 'processing',
              message: `Error in chunk ${i + 1}: ${chunkError.message}`,
              timestamp: new Date().toISOString(),
              chunkIndex: i
          });
          await updateJob({ errors, lastError: chunkError.message, lastErrorTime: new Date().toISOString() });
          // Optionally mark job with warnings? For now, just log and continue.
      } finally {
          stopHeartbeat();
          forceGC();
      }
    }
    // --------------------------------

    updateProgress(92, "Aggregating and saving results...");

    // --- Aggregate Results --- 
    // Join the results based on the output format (assuming JSONL for now)
    let finalOutputString = "";
    if (options.outputFormat === 'json' || options.outputFormat === 'csv') {
        // Requires parsing each chunk output and merging - more complex
        // For now, just concatenate for JSONL/default
        console.warn(`[Worker ${jobId}] Merging for JSON/CSV not fully implemented in chunking, concatenating lines.`);
        finalOutputString = allResults.join('\n').trim(); // Simple join for now
    } else { // Default to JSONL logic
        finalOutputString = allResults.join('\n').trim(); // Join chunk outputs, trim ensures no trailing newline if last chunk was empty
        // Ensure a single newline at the end if content exists
        if (finalOutputString) {
           finalOutputString += '\n'; 
        }
    }
    // --------------------------

    const outputKey = `output/${pipelineType}_${jobId}.${getFileExtension(options.outputFormat)}`;
    console.log(`[Worker ${jobId}] Saving aggregated output (${finalOutputString.length} bytes) to S3 key: ${outputKey}`);

    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: outputKey,
          Body: finalOutputString,
          ContentType: getContentType(options.outputFormat),
        })
      );
      console.log(`[Worker ${jobId}] Successfully saved output to S3.`);
    } catch (s3Error) {
      console.error(`[Worker ${jobId}] FAILED to save output to S3 key ${outputKey}:`, s3Error);
      updateProgress(95, `Error saving results to S3: ${s3Error.message}`, 'saving');
      throw new Error(`Failed to save results to S3: ${s3Error.message}`);
    }

    // --- Final Job Update --- 
    const finalStatus = (await jobService.getJob(jobId))?.errors?.length > 0 ? "completed_with_warnings" : "completed";
    const finalMessage = finalStatus === "completed_with_warnings" ? "Processing complete with some errors in chunks." : "Processing complete";
    
    await updateJob({
        status: finalStatus,
        message: finalMessage,
        progress: 100,
        outputKey,
        completed: new Date().toISOString(),
    });
    jobContext?.progress(100, finalMessage); // Final update for Bull queue if needed
    // ------------------------

    return {
      success: true,
      outputKey,
      // stats: result.stats, // Need to aggregate stats from chunks if required
      pipelineType,
      format: options.outputFormat || "openai-jsonl",
    };

  } catch (error) {
    console.error(`[Worker ${jobId}] Error processing document in background:`, error);
    // --- Update Job Status on Failure --- 
    try {
        await updateJob({
            status: "failed",
            message: `Processing failed: ${error.message}`,
            error: error.message, // Store main error
            failed: new Date().toISOString(),
        });
        jobContext?.progress(0, `Processing failed: ${error.message}`); // Update Bull queue
    } catch (updateError) {
        console.error(`[Worker ${jobId}] Error updating job status after failure:`, updateError);
    }
    // ----------------------------------
    throw error; // Re-throw original error for Bull queue handling
  }
}

/**
 * Process text in chunks (simulating pages)
 * @param {string} textKey - S3 key of the text file
 * @param {string} pipelineType - Type of pipeline to use
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} - Processing results
 */
async function processTextInChunks(textKey, pipelineType, options) {
  const { jobId, jobContext } = options;

  try {
    // Initialize job status
    await jobService.saveJob(jobId, {
      id: jobId,
      status: "initialized",
      message: "Initializing chunked text processing",
      progress: 0,
      textKey,
      pipelineType,
      options,
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    });

    // Update job status
    const updateStatus = async (status, message, progress) => {
      await jobService.updateJob(jobId, {
        status,
        message,
        progress,
      });

      // Also update job context if available
      jobContext?.progress(progress, message);
    };

    await updateStatus("downloading", "Downloading text from storage", 10);

    // Download the text file
    const textResponse = await s3Client.send(
      new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: textKey,
      })
    );

    // Get the text
    const fullText = await textResponse.Body.transformToString();

    // Divide text into chunks
    await updateStatus("chunking", "Dividing text into chunks", 20);

    const chunkSize = 5000; // Characters per chunk
    const chunks = [];

    for (let i = 0; i < fullText.length; i += chunkSize) {
      const chunk = fullText.slice(i, i + chunkSize);
      chunks.push(chunk);
    }

    // Update job with chunk info
    await jobService.updateJob(jobId, {
      totalChunks: chunks.length,
      currentChunk: 0,
      resultPaths: [],
    });

    // Process each chunk separately
    const tempDir = `tmp/jobs/${jobId}`;
    const resultPaths = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Update status
      await updateStatus(
        "processing",
        `Processing chunk ${i + 1} of ${chunks.length}`,
        30 + Math.floor((i / chunks.length) * 50)
      );

      // Create appropriate pipeline
      const pipeline = createPipeline(pipelineType, options);

      // Process the current chunk
      const chunkResult = await pipeline.process(chunk);

      // Store chunk result
      const resultPath = `${tempDir}/chunk_${i + 1}.json`;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: resultPath,
          Body: JSON.stringify({
            chunkIndex: i,
            result: chunkResult,
          }),
          ContentType: "application/json",
        })
      );

      // Add to result paths
      resultPaths.push(resultPath);

      // Update job with new result path
      await jobService.updateJob(jobId, {
        status: "processing",
        currentChunk: i + 1,
        resultPaths,
      });

      // Force garbage collection
      forceGC();
    }

    // Merge results
    await updateStatus("merging", "Merging chunk results", 90);

    const mergedResults = await mergePageResults(
      resultPaths,
      pipelineType,
      options.outputFormat
    );

    // Store final results
    const outputKey = `output/${pipelineType}_${jobId}.${getFileExtension(
      options.outputFormat
    )}`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: outputKey,
        Body: mergedResults,
        ContentType: getContentType(options.outputFormat),
      })
    );

    // Mark job as completed
    await updateStatus("completed", "Processing complete", 100);

    await jobService.updateJob(jobId, {
      outputKey,
      completed: new Date().toISOString(),
    });

    return {
      success: true,
      jobId,
      outputKey,
      pipelineType,
      format: options.outputFormat,
    };
  } catch (error) {
    console.error(`Error in chunk processing: ${error.message}`);

    // Update job with error
    await jobService.updateJob(jobId, {
      status: "failed",
      message: `Processing failed: ${error.message}`,
      error: error.message,
      failed: new Date().toISOString(),
    });

    // Also update job context if available
    jobContext?.progress(0, `Processing failed: ${error.message}`);

    throw error;
  }
}

/**
 * Merge results from multiple pages
 * @param {Array<string>} resultPaths - S3 paths to page results
 * @param {string} pipelineType - Type of pipeline used
 * @param {string} outputFormat - Output format
 * @returns {Promise<string>} - Merged results
 */
async function mergePageResults(resultPaths, pipelineType, outputFormat) {
  try {
    let mergedResults = "";

    // Determine how to merge based on output format
    switch (outputFormat) {
      case "json":
        // For JSON, merge the arrays
        const jsonResults = [];

        for (const path of resultPaths) {
          // Get the page result
          const response = await s3Client.send(
            new GetObjectCommand({
              Bucket: process.env.AWS_S3_BUCKET,
              Key: path,
            })
          );

          const pageData = JSON.parse(await response.Body.transformToString());

          // Extract the actual results and add to array
          try {
            const pageResults = JSON.parse(pageData.result.output);
            if (Array.isArray(pageResults)) {
              jsonResults.push(...pageResults);
            } else {
              // If not an array, handle appropriately
              jsonResults.push(pageResults);
            }
          } catch (error) {
            console.error(
              `Error parsing JSON results from ${path}: ${error.message}`
            );
          }
        }

        mergedResults = JSON.stringify(jsonResults);
        break;

      case "jsonl":
      case "openai-jsonl":
        // For JSONL, concatenate lines
        for (const path of resultPaths) {
          // Get the page result
          const response = await s3Client.send(
            new GetObjectCommand({
              Bucket: process.env.AWS_S3_BUCKET,
              Key: path,
            })
          );

          const pageData = JSON.parse(await response.Body.transformToString());

          // Add the JSONL content
          if (pageData.result && pageData.result.output) {
            // Make sure we add a newline if needed
            const pageOutput = pageData.result.output.endsWith("\n")
              ? pageData.result.output
              : pageData.result.output + "\n";

            mergedResults += pageOutput;
          }
        }
        break;

      case "csv":
        // For CSV, keep header from first page only
        let isFirstPage = true;

        for (const path of resultPaths) {
          // Get the page result
          const response = await s3Client.send(
            new GetObjectCommand({
              Bucket: process.env.AWS_S3_BUCKET,
              Key: path,
            })
          );

          const pageData = JSON.parse(await response.Body.transformToString());

          if (pageData.result && pageData.result.output) {
            if (isFirstPage) {
              // Include header for first page
              mergedResults += pageData.result.output;
              isFirstPage = false;
            } else {
              // Skip header (first line) for subsequent pages
              const lines = pageData.result.output.split("\n");
              if (lines.length > 1) {
                mergedResults += "\n" + lines.slice(1).join("\n");
              }
            }
          }
        }
        break;

      default:
        // Default to simple concatenation
        for (const path of resultPaths) {
          // Get the page result
          const response = await s3Client.send(
            new GetObjectCommand({
              Bucket: process.env.AWS_S3_BUCKET,
              Key: path,
            })
          );

          const pageData = JSON.parse(await response.Body.transformToString());

          // Add the content
          if (pageData.result && pageData.result.output) {
            mergedResults += pageData.result.output;
          }
        }
    }

    return mergedResults;
  } catch (error) {
    console.error(`Error merging page results: ${error.message}`);
    throw error;
  }
}

/**
 * Create a pipeline instance based on type
 * @param {string} pipelineType - Type of pipeline
 * @param {Object} options - Pipeline options
 * @returns {Object} - Pipeline instance
 */
function createPipeline(pipelineType, options) {
  // --- Debugging: Log options received by createPipeline ---
  console.log(`[createPipeline] Called for type ${pipelineType}. Received options (including privacy):`, JSON.stringify(options, null, 2));
  // -----------------------------------------------------
  
  // Use smaller chunk sizes for all pipelines to manage memory better
  const baseOptions = {
    apiKey: process.env.OPENAI_API_KEY,
    chunkSize: 300,
    chunkOverlap: 50,
    onProgress: options.onProgress || (() => {}),
    onError: async (error) => {
      // Get current job ID from options
      const jobId = options.jobId;
      if (!jobId) {
        console.error("Error in pipeline but no job ID available:", error);
        return;
      }

      // Log the error details
      console.error(`Pipeline error in job ${jobId}:`, error);
      
      try {
        // Determine error severity
        const isTimeout = error.type === 'timeout';
        const currentJob = await jobService.getJob(jobId);
        
        if (!currentJob) {
          console.error(`Could not find job ${jobId} to update error status`);
          return;
        }
        
        // Create error entry for job
        const errorEntry = {
          type: error.type || 'unknown',
          stage: error.stage || 'processing',
          message: error.message || 'Unknown error occurred',
          timestamp: new Date().toISOString()
        };
        
        // Create or update errors array in job
        const errors = currentJob.errors || [];
        errors.push(errorEntry);
        
        // For timeouts or serious errors, update job status
        if (isTimeout) {
          // Update job with error information but don't mark as failed yet
          // This allows the process to continue with other chunks
          await jobService.updateJob(jobId, {
            errors,
            hasTimeouts: true,
            lastError: error.message,
            lastErrorTime: new Date().toISOString(),
            // Keep the current status and progress
          });
        } else {
          // For non-timeout errors, just log them but don't change job status
          await jobService.updateJob(jobId, {
            errors,
            // Keep the current status and progress
          });
        }
        
        // Also use the onProgress callback to show the error in the UI
        if (options.onProgress) {
          options.onProgress({
            stage: error.stage || 'processing',
            message: error.message,
            progress: currentJob.progress || 50, // Keep current progress
            isError: true,
            recovery: error.recovery || 'The system will attempt to continue processing.'
          });
        }
      } catch (updateError) {
        console.error('Error updating job with error information:', updateError);
      }
    },
    orgContext: options.orgContext || "",
    formattingDirective: options.formattingDirective || "balanced",
    orgStyleSample: options.orgStyleSample,
    outputFormat: options.outputFormat || "openai-jsonl",
    privacyMaskingEnabled: options.privacyMaskingEnabled || false,
    excludeStandard: options.excludeStandard || false,
  };
  
  // --- Debugging: Log the created baseOptions ---
  console.log(`[createPipeline] Constructed baseOptions (including privacy):`, JSON.stringify(baseOptions, null, 2));
  // ---------------------------------------------

  // Create appropriate pipeline type
  switch (pipelineType) {
    case "qa":
      return new QASyntheticDataPipeline({
        ...baseOptions,
        questionTypes: options.questionTypes || [
          "factual",
          "procedural",
          "critical-thinking",
        ],
        difficultyLevels: options.difficultyLevels || [
          "basic",
          "intermediate",
          "advanced",
        ],
        maxQuestionsPerSection: options.maxQuestionsPerSection || 5,
        chunkSize: 250, // Even smaller chunks for QA
      });

    case "finance":
      return new FinanceSyntheticDataPipeline({
        ...baseOptions,
        metricFilter: options.metricFilter || "all",
        generateProjections:
          options.generateProjections !== undefined
            ? options.generateProjections
            : true,
        projectionTypes: options.projectionTypes || [
          "valuation",
          "growth",
          "profitability",
        ],
        chunkSize: 200, // Smaller chunks for finance
      });

    default:
      // Default to legal pipeline
      return new SyntheticDataPipeline({
        ...baseOptions,
        classFilter: options.classFilter || "all",
        prioritizeImportant:
          options.prioritizeImportant !== undefined
            ? options.prioritizeImportant
            : true,
      });
  }
}

/**
 * Get file extension for the output format
 * @param {string} outputFormat - Output format
 * @returns {string} - File extension
 */
function getFileExtension(outputFormat) {
  switch (outputFormat) {
    case "json":
      return "json";
    case "csv":
      return "csv";
    case "jsonl":
    case "openai-jsonl":
    default:
      return "jsonl";
  }
}

/**
 * Get content type for the output format
 * @param {string} outputFormat - Output format
 * @returns {string} - Content type
 */
function getContentType(outputFormat) {
  switch (outputFormat) {
    case "json":
      return "application/json";
    case "csv":
      return "text/csv";
    case "jsonl":
    case "openai-jsonl":
    default:
      return "application/jsonl";
  }
}

/**
 * Get the status of a job
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} - Job status
 */
export async function getJobStatus(jobId) {
  return await jobService.getJob(jobId);
}

/**
 * Resume a failed or timed-out job
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} - Job status
 */
export async function resumeJob(jobId) {
  try {
    // Get the job
    const job = await jobService.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // Check if job is failed or timed out
    if (job.status !== "failed" && job.status !== "timeout") {
      return job; // Job is not in a resumable state
    }

    // Update job status
    await jobService.updateJob(jobId, {
      status: "resuming",
      message: "Resuming processing",
      resumed: new Date().toISOString(),
    });

    // Determine where to resume based on job state
    if (job.resultPaths && job.resultPaths.length > 0) {
      // Job has partial results, resume from next page/chunk
      if (job.totalPages && job.currentPage) {
        // Resume page-by-page processing
        if (job.currentPage < job.totalPages) {
          // Resume from next page
          const nextPage = job.currentPage + 1;

          await jobService.updateJob(jobId, {
            status: "processing",
            message: `Resuming from page ${nextPage} of ${job.totalPages}`,
            currentPage: nextPage - 1, // Will be incremented in processing
          });

          // Continue processing by re-downloading file and processing remaining pages
          return processDocumentPageByPage(job.fileKey, job.pipelineType, {
            ...job.options,
            jobId,
            resumeFromPage: nextPage,
          });
        }
      } else if (job.totalChunks && job.currentChunk) {
        // Resume chunk processing
        if (job.currentChunk < job.totalChunks) {
          // Resume from next chunk
          const nextChunk = job.currentChunk + 1;

          await jobService.updateJob(jobId, {
            status: "processing",
            message: `Resuming from chunk ${nextChunk} of ${job.totalChunks}`,
            currentChunk: nextChunk - 1, // Will be incremented in processing
          });

          // Continue processing chunks
          return processTextInChunks(job.textKey, job.pipelineType, {
            ...job.options,
            jobId,
            resumeFromChunk: nextChunk,
          });
        }
      }

      // If we have results but no clear resume point, try to merge existing results
      if (
        job.status === "failed" &&
        job.resultPaths &&
        job.resultPaths.length > 0
      ) {
        // Try to merge the results we have
        await jobService.updateJob(jobId, {
          status: "merging",
          message: "Attempting to merge partial results",
          progress: 90,
        });

        try {
          // Merge existing results
          const mergedResults = await mergePageResults(
            job.resultPaths,
            job.pipelineType,
            job.options.outputFormat
          );

          // Store final results
          const outputKey = `output/${
            job.pipelineType
          }_${jobId}.${getFileExtension(job.options.outputFormat)}`;
          await s3Client.send(
            new PutObjectCommand({
              Bucket: process.env.AWS_S3_BUCKET,
              Key: outputKey,
              Body: mergedResults,
              ContentType: getContentType(job.options.outputFormat),
            })
          );

          // Mark job as completed
          await jobService.updateJob(jobId, {
            status: "completed",
            message: "Processing complete (merged partial results)",
            progress: 100,
            outputKey,
            completed: new Date().toISOString(),
          });

          return {
            success: true,
            jobId,
            outputKey,
            pipelineType: job.pipelineType,
            format: job.options.outputFormat,
            mergedPartial: true,
          };
        } catch (mergeError) {
          console.error(`Error merging partial results: ${mergeError.message}`);

          // Mark as still failed but with attempt to resume
          await jobService.updateJob(jobId, {
            status: "failed",
            message: `Failed to merge partial results: ${mergeError.message}`,
            resumeAttempted: new Date().toISOString(),
          });
        }
      }
    }

    // No clear resume path, restart processing from beginning
    await jobService.updateJob(jobId, {
      status: "restarting",
      message: "Restarting processing from beginning",
      restarted: new Date().toISOString(),
      progress: 0,
      // Reset tracking fields
      currentPage: 0,
      currentChunk: 0,
      resultPaths: [],
    });

    // Restart based on what we know about the job
    if (job.fileKey) {
      // We have a file key, restart page-by-page processing
      return processDocumentPageByPage(job.fileKey, job.pipelineType, {
        ...job.options,
        jobId,
      });
    } else if (job.textKey) {
      // We have a text key, use that
      return processDocumentInBackground(job.textKey, job.pipelineType, {
        ...job.options,
        jobId,
      });
    } else {
      throw new Error("Cannot resume job - no input file or text key found");
    }
  } catch (error) {
    console.error(`Error resuming job ${jobId}:`, error);

    // Update job with error
    await jobService.updateJob(jobId, {
      status: "failed",
      message: `Failed to resume job: ${error.message}`,
      resumeError: error.message,
      resumed: new Date().toISOString(),
    });

    throw error;
  }
}

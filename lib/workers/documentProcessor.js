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

      // Create appropriate pipeline
      const pipeline = createPipeline(pipelineType, options);

      // Process the current page
      const pageResult = await pipeline.process(text);

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
      });

      // Force garbage collection
      forceGC();
    }

    // Merge results
    await jobService.updateJob(jobId, {
      status: "merging",
      message: "Merging page results",
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
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: outputKey,
        Body: mergedResults,
        ContentType: getContentType(options.outputFormat),
      })
    );

    // Mark job as completed
    await jobService.updateJob(jobId, {
      status: "completed",
      message: "Processing complete",
      progress: 100,
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
    console.error(`Error in page-by-page processing: ${error.message}`);

    // Update job with error
    await jobService.updateJob(jobId, {
      status: "failed",
      message: `Processing failed: ${error.message}`,
      error: error.message,
      failed: new Date().toISOString(),
    });

    throw error;
  }
}

/**
 * Process document from a background job
 * @param {string} textKey - S3 key of the text to process
 * @param {string} pipelineType - Type of pipeline to use
 * @param {Object} options - Pipeline options
 * @param {Object} jobContext - Job context for progress updates
 * @returns {Promise<Object>} - Processing results
 */
export async function processDocumentInBackground(
  textKey,
  pipelineType = "legal",
  options = {},
  jobContext
) {
  try {
    // Create a job ID
    const jobId = options.jobId || jobContext?.jobId || uuidv4();

    // Determine if we should use page-by-page processing
    // If text is coming from S3, we'll need to get it first
    let text = "";
    let totalLength = 0;

    // Update progress
    jobContext?.progress(5, "Initializing document processing");

    try {
      // Download the text file
      jobContext?.progress(
        10,
        `Loading text data from storage (key: ${textKey})`
      );
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: textKey,
        })
      );

      // Get content length if available
      totalLength = response.ContentLength || 0;

      // If length is very large, switch to page-by-page processing
      if (totalLength > 1000000) {
        // 1MB threshold
        jobContext?.progress(
          15,
          `Large document detected (${Math.round(
            totalLength / 1024
          )}KB). Using page-by-page processing.`
        );

        // Check if this is a PDF that needs extraction
        if (
          textKey.endsWith(".pdf") ||
          response.ContentType === "application/pdf"
        ) {
          return processDocumentPageByPage(textKey, pipelineType, {
            ...options,
            jobId,
          });
        }

        // Otherwise get the text directly
        text = await response.Body.transformToString();
      } else {
        // For smaller documents, get all the text
        text = await response.Body.transformToString();
        jobContext?.progress(
          15,
          `Retrieved ${text.length} characters of text data`
        );
      }
    } catch (error) {
      console.error(`Error getting text: ${error.message}`);
      jobContext?.progress(15, `Error getting text: ${error.message}`);
      throw error;
    }

    // If text is too large, use page-by-page processing
    if (text.length > 1000000) {
      // 1MB threshold
      jobContext?.progress(
        18,
        `Text exceeds 1MB (${text.length} characters), switching to page-by-page processing`
      );

      // Create a temporary file with the text
      const tempTextKey = `tmp/text_${jobId}.txt`;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: tempTextKey,
          Body: text,
          ContentType: "text/plain",
        })
      );

      // Clear text from memory
      text = "";
      forceGC();

      // Use page-by-page processing with chunks as "pages"
      return processTextInChunks(tempTextKey, pipelineType, {
        ...options,
        jobId,
        jobContext,
      });
    }

    // Force GC
    forceGC();

    // For medium-sized documents, truncate if needed
    const maxTextLength =
      getPipelineConfig().pipelines[pipelineType]?.maxTextLength || 20000;
    const truncatedText =
      text.length > maxTextLength ? text.substring(0, maxTextLength) : text;

    if (text.length > maxTextLength) {
      jobContext?.progress(
        18,
        `Text exceeds ${maxTextLength} characters, truncating for processing`
      );
    }

    // Create pipeline based on type
    jobContext?.progress(20, `Initializing ${pipelineType} pipeline`);
    const pipeline = createPipeline(pipelineType, {
      ...options,
      onProgress: (progressData) => {
        // Convert pipeline progress (0-100) to job progress (20-90)
        const normalizedProgress = 20 + (progressData.progress || 0) * 0.7;
        jobContext?.progress(normalizedProgress, progressData.message);
      },
    });

    // Process the document
    jobContext?.progress(25, "Starting document processing");
    const result = await pipeline.process(truncatedText);

    // Force GC
    forceGC();

    // Save the results
    jobContext?.progress(92, "Saving processing results");

    // Determine file extension
    const fileExt = getFileExtension(options.outputFormat);

    // Save to storage
    const outputKey = `output/${pipelineType}_${jobId}.${fileExt}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: outputKey,
        Body: result.output,
        ContentType: getContentType(options.outputFormat),
      })
    );

    jobContext?.progress(100, "Processing complete");

    // Return minimal result info
    return {
      success: true,
      outputKey,
      stats: result.stats,
      pipelineType,
      format: options.outputFormat || "openai-jsonl",
    };
  } catch (error) {
    console.error("Error processing document in background:", error);
    throw error;
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
  // Use smaller chunk sizes for all pipelines to manage memory better
  const baseOptions = {
    apiKey: process.env.OPENAI_API_KEY,
    outputFormat: options.outputFormat || "openai-jsonl",
    chunkSize: 300,
    chunkOverlap: 50,
    onProgress: options.onProgress || (() => {}),
  };

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
        orgStyleSample: options.orgStyleSample,
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
        orgStyleSample: options.orgStyleSample,
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

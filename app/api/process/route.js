// app/api/process/route.js
import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import getConfig from "next/config";
import { v4 as uuidv4 } from "uuid";
import { EnhancedMemoryManager } from "../../lib/utils/enhancedMemoryManager";
import SyntheticDataPipeline from "../../lib/SyntheticDataPipeline";
import QASyntheticDataPipeline from "../../lib/QASyntheticDataPipeline";
import FinanceSyntheticDataPipeline from "../../lib/FinanceSyntheticDataPipeline";
import documentStorageService from "../../lib/services/documentStorageService";
import { getPipelineConfig } from "../../lib/config/pipelineConfig";

// Get server-side config
const { serverRuntimeConfig } = getConfig();

// Initialize S3 client
const s3Client = new S3Client({
  region: serverRuntimeConfig.aws.region,
  credentials: {
    accessKeyId: serverRuntimeConfig.aws.accessKeyId,
    secretAccessKey: serverRuntimeConfig.aws.secretAccessKey,
  },
});

// Initialize memory manager
const memoryManager = new EnhancedMemoryManager({
  enableLogging: true,
  enableAutoGC: true,
  onCriticalMemory: handleCriticalMemory,
});

// Start memory monitoring
memoryManager.startMonitoring();

// Handle critical memory situations by forcing GC
function handleCriticalMemory(heapUsedMB) {
  console.warn(
    `Critical memory situation detected: ${heapUsedMB}MB in use. Forcing GC and reducing batch sizes.`
  );
  memoryManager.forceGC();
}

export async function POST(request) {
  // Create a streaming response
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  // Utility to send progress updates
  const sendProgress = async (data) => {
    try {
      await writer.write(
        encoder.encode(
          JSON.stringify({
            type: "progress",
            ...data,
          }) + "\n"
        )
      );
    } catch (error) {
      console.error("Error sending progress update:", error);
    }
  };

  // Utility to send error
  const sendError = async (message, details = null) => {
    try {
      await writer.write(
        encoder.encode(
          JSON.stringify({
            type: "error",
            message,
            details: details || message,
          }) + "\n"
        )
      );
    } catch (error) {
      console.error("Error sending error message:", error);
    }
  };

  // Function to log memory
  const logMemoryToClient = async (label = "Current memory usage") => {
    const memStats = memoryManager.getMemoryTrend();
    if (memStats && memStats.currentUsage) {
      await sendProgress({
        stage: "memory",
        message: `${label}: ${memStats.currentUsage}MB (${memStats.trend} trend)`,
        progress: null, // Don't update progress bar for memory logs
      });
    }
  };

  // Start processing in the background and stream updates
  (async () => {
    try {
      // Parse request with timeout to avoid hanging
      const requestPromise = request.json();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request parsing timeout")), 5000)
      );

      const requestData = await Promise.race([requestPromise, timeoutPromise]);

      const {
        textKey,
        pipelineType = "legal",
        outputFormat = "openai-jsonl",
        // Legal pipeline options
        classFilter = "all",
        prioritizeImportant = true,
        // Q&A pipeline options
        questionTypes = ["factual", "procedural", "critical-thinking"],
        difficultyLevels = ["basic", "intermediate", "advanced"],
        maxQuestionsPerSection = 5,
        orgStyleSample = null,
        // Finance pipeline options
        metricFilter = "all",
        generateProjections = true,
        projectionTypes = ["valuation", "growth", "profitability"],
      } = requestData;

      if (!textKey) {
        await sendError("No text key provided");
        await writer.close();
        return;
      }

      // IMPROVED: Send detailed initial progress update
      await sendProgress({
        stage: "initialization",
        message: "Starting process with optimized pipeline...",
        progress: 2,
      });

      // Get pipeline configuration
      const config = getPipelineConfig();

      // Log initial memory state
      await logMemoryToClient("Initial memory before processing");

      // Get the extracted text from S3 using the storage service
      let s3Body;
      try {
        await sendProgress({
          stage: "loading",
          message: `Loading text data from storage (key: ${textKey})...`,
          progress: 5,
        });

        // Use the storage service to download the file
        const downloadResult = await documentStorageService.downloadFile(
          textKey,
          {
            asText: true,
          }
        );

        s3Body = downloadResult.content;

        // Check content size and provide feedback
        await sendProgress({
          stage: "loading",
          message: `Retrieved ${s3Body.length} characters of text data`,
          progress: 10,
        });

        // Force GC after loading text
        memoryManager.forceGC();
        await logMemoryToClient("Memory after text loading");
      } catch (error) {
        console.error("Error retrieving text from S3:", error);
        await sendError("Failed to retrieve text from storage", error.message);
        await writer.close();
        return;
      }

      // IMPROVED: Limit text size based on pipeline type to prevent memory issues
      const maxTextLength =
        {
          legal: 20000,
          qa: 15000,
          finance: 10000,
        }[pipelineType] || 10000;

      const truncatedText =
        s3Body.length > maxTextLength
          ? s3Body.substring(0, maxTextLength)
          : s3Body;

      if (s3Body.length > maxTextLength) {
        await sendProgress({
          stage: "loading",
          message: `Text exceeds ${maxTextLength} characters, truncating for processing`,
          progress: 12,
        });
      }

      // Clear original text from memory
      s3Body = null;
      memoryManager.forceGC();

      await sendProgress({
        stage: "initialization",
        message: "Initializing pipeline with optimal memory settings...",
        progress: 15,
      });

      let pipeline;

      // IMPROVED: Create pipeline with proper error handling
      try {
        // Get pipeline-specific memory-optimized parameters
        const pipelineBaseOptions = {
          apiKey: serverRuntimeConfig.openai.apiKey,
          outputFormat: outputFormat,
          // Reduced chunk sizes to prevent memory issues
          chunkSize: 300,
          chunkOverlap: 50,
          orgStyleSample: orgStyleSample,
          onProgress: async (progressData) => {
            await sendProgress({
              ...progressData,
            });

            // Log memory on certain stages
            if (
              progressData.stage === "chunking" ||
              progressData.stage === "extraction" ||
              (progressData.progress !== undefined &&
                progressData.progress % 25 === 0)
            ) {
              await logMemoryToClient(`Memory during ${progressData.stage}`);
            }
          },
        };

        // Create pipeline based on type with specific configuration
        if (pipelineType === "qa") {
          const qaOptions = {
            ...pipelineBaseOptions,
            questionTypes,
            difficultyLevels,
            maxQuestionsPerSection,
            // Even smaller chunks for QA pipeline
            chunkSize: 250,
          };

          pipeline = new QASyntheticDataPipeline(qaOptions);
        } else if (pipelineType === "finance") {
          const financeOptions = {
            ...pipelineBaseOptions,
            metricFilter,
            generateProjections,
            projectionTypes,
            // Finance pipeline needs smaller chunks
            chunkSize: 200,
          };

          pipeline = new FinanceSyntheticDataPipeline(financeOptions);
        } else {
          // Default to legal pipeline
          const legalOptions = {
            ...pipelineBaseOptions,
            classFilter,
            prioritizeImportant,
          };

          pipeline = new SyntheticDataPipeline(legalOptions);
        }

        // Validate pipeline was created successfully
        if (!pipeline) {
          throw new Error("Failed to initialize pipeline");
        }

        if (typeof pipeline.process !== "function") {
          throw new Error(
            `Pipeline does not have a process method (pipelineType: ${pipelineType})`
          );
        }

        await sendProgress({
          stage: "initialization",
          message: `Successfully initialized ${pipelineType} pipeline`,
          progress: 20,
        });
      } catch (error) {
        console.error(`Error initializing ${pipelineType} pipeline:`, error);
        await sendError(
          `Failed to initialize ${pipelineType} pipeline`,
          error.message
        );
        await writer.close();
        return;
      }

      // Process the text through the pipeline inside a try-catch block
      try {
        await sendProgress({
          stage: "processing",
          message: "Starting document processing...",
          progress: 25,
        });

        // Process with timeout guard to prevent hanging
        const processingPromise = pipeline.process(truncatedText);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Processing timeout after 5 minutes")),
            5 * 60 * 1000
          )
        );

        const result = await Promise.race([processingPromise, timeoutPromise]);

        // Force garbage collection after processing
        memoryManager.forceGC();
        await logMemoryToClient("Memory after pipeline processing");

        // Special handling for JSONL format to avoid issues
        // app/api/process/route.js (continued)

        // Special handling for JSONL format to avoid issues
        let finalOutput = result.output;

        // Ensure proper JSONL format and prevent memory issues
        // Special handling for JSONL format to avoid issues
        if (outputFormat === "openai-jsonl" || outputFormat === "jsonl") {
          try {
            await sendProgress({
              stage: "formatting",
              message: `Processing JSONL output in memory-efficient chunks...`,
              progress: 90,
            });

            // Process the lines in smaller batches to prevent large array creation
            const lines = result.output
              .split("\n")
              .filter((line) => line.trim().length > 0);

            const batchSize = 10;
            let processedLines = "";
            let processedCount = 0;

            for (let i = 0; i < lines.length; i += batchSize) {
              await sendProgress({
                stage: "formatting",
                message: `Processing batch ${
                  Math.floor(i / batchSize) + 1
                } of ${Math.ceil(lines.length / batchSize)}`,
                progress: 90 + (i / lines.length) * 5,
              });

              const batch = lines.slice(
                i,
                Math.min(i + batchSize, lines.length)
              );

              // Process each line to get clean JSON
              for (const line of batch) {
                try {
                  const parsed = JSON.parse(line);
                  processedLines += JSON.stringify(parsed) + "\n";
                  processedCount++;
                } catch (e) {
                  console.error("Error parsing JSONL line:", e);
                }
              }

              // Force intermediate garbage collection
              memoryManager.forceGC();

              // Allow event loop to continue
              await new Promise((resolve) => setTimeout(resolve, 0));

              // Occasionally log memory stats
              if (i % (batchSize * 5) === 0) {
                await logMemoryToClient("Memory during output formatting");
              }
            }

            // Use the processed output
            finalOutput = processedLines;

            await sendProgress({
              stage: "formatting",
              message: `Processed ${processedCount} of ${lines.length} lines of output data`,
              progress: 95,
            });

            // Force GC before saving output
            memoryManager.forceGC();
          } catch (e) {
            console.error("Error processing JSONL output:", e);
            // Log the issue but continue with original output
            await sendProgress({
              stage: "formatting",
              message: `Warning: Error processing JSONL, using raw output`,
              progress: 95,
            });
            finalOutput = result.output;
          }
        }

        // Generate output file extension
        const fileExt =
          outputFormat === "json"
            ? "json"
            : outputFormat === "csv"
            ? "csv"
            : "jsonl";

        try {
          await sendProgress({
            stage: "saving",
            message: "Saving processed results to storage...",
            progress: 96,
          });

          // Save the output to storage using the storage service
          const outputKey = `output/${pipelineType}_${uuidv4()}.${fileExt}`;

          await documentStorageService.uploadFile(
            finalOutput,
            `${pipelineType}_result.${fileExt}`,
            outputFormat === "json"
              ? "application/json"
              : outputFormat === "csv"
              ? "text/csv"
              : "application/jsonl",
            "results"
          );

          await sendProgress({
            stage: "complete",
            message: "Processing complete! Results saved successfully.",
            progress: 100,
          });

          // Send minimal data to client to avoid memory issues
          await writer.write(
            encoder.encode(
              JSON.stringify({
                type: "result",
                success: true,
                format: outputFormat,
                data: finalOutput, // Include data for current functionality
                stats: result.stats,
                outputKey,
                pipelineType,
              }) + "\n"
            )
          );
        } catch (error) {
          console.error("Error saving output:", error);

          // Still send results even if saving failed
          await writer.write(
            encoder.encode(
              JSON.stringify({
                type: "result",
                success: true,
                format: outputFormat,
                data: finalOutput,
                stats: result.stats,
                saveError: error.message,
                pipelineType,
              }) + "\n"
            )
          );
        }
      } catch (error) {
        console.error("Error processing text:", error);

        // Send structured error with helpful suggestions
        await sendError("Document processing failed", {
          message: error.message,
          suggestions: [
            "Try with a smaller document",
            "Simplify the document complexity",
            "Split the document into smaller parts",
            "Check if the document contains unusual or corrupted text",
          ],
          errorType: error.name || "ProcessingError",
          stage: "processing",
        });
      }
    } catch (error) {
      console.error("Error in overall pipeline:", error);

      // Send error response with a newline
      await sendError("Failed to process document", error.message);
    } finally {
      // Clean up resources
      try {
        // Log final memory state
        await logMemoryToClient("Final memory usage");

        // Stop memory monitoring
        memoryManager.stopMonitoring();
        memoryManager.forceGC();

        // Close the stream writer
        await writer.close();
      } catch (finalError) {
        console.error("Error during cleanup:", finalError);
      }
    }
  })();

  // Return the streaming response
  return new NextResponse(stream.readable, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Transfer-Encoding": "chunked",
    },
  });
}

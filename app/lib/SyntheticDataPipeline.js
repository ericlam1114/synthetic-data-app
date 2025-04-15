// File: lib/SyntheticDataPipeline.js
// Enhanced version with middleware for deduplication and filtering

import { OpenAI } from "openai";
import { buildOrgSystemPrompt } from "../../lib/utils/promptBuilder.js";
import { logMemory, forceGC } from "../../lib/utils/memoryManager.js";

class SyntheticDataPipeline {
  constructor(options = {}) {
    this.openai = new OpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY,
      timeout: 30000, // 30 seconds timeout for API calls
    });

    // Model configurations
    this.models = {
      extractor:
        options.extractorModel ||
        "ft:gpt-4o-mini-2024-07-18:personal:clause-extractor:BJoJl5pB",
      classifier:
        options.classifierModel ||
        "ft:gpt-4o-mini-2024-07-18:personal:classifier:BKXRNBJy",
      duplicator:
        options.duplicatorModel ||
        "ft:gpt-4o-mini-2024-07-18:personal:upscale-v2:BMMLpKg9",
    };

    // IMPROVED: Reduce chunk size to prevent memory issues
    this.chunkSize = options.chunkSize || 300; // Reduced from 1000
    this.chunkOverlap = options.chunkOverlap || 50; // Reduced from 100
    this.classFilter = options.classFilter || "all";
    this.outputFormat = options.outputFormat || "jsonl";
    this.prioritizeImportant = options.prioritizeImportant || false;
    this.orgStyleSample = options.orgStyleSample || null;
    // Callbacks
    this.onProgress = options.onProgress || (() => {});
    this.onError = options.onError || (() => {}); // Add onError callback support

    // Store filter settings from user
    this.userSettings = {
      classFilter: options.classFilter || "all",
      prioritizeImportant:
        options.prioritizeImportant !== undefined
          ? options.prioritizeImportant
          : true,
      orgStyleSample: options.orgStyleSample || null,
    };
  }

  // IMPROVED: Helper method to force memory cleanup
  _forceClearMemory() {
    try {
      if (global.gc) {
        global.gc();
      }

      // Allow time for GC to run
      return new Promise((resolve) => setTimeout(resolve, 100));
    } catch (e) {
      console.log(
        "Could not force garbage collection. Run with --expose-gc flag."
      );
    }
  }

  // More intelligent GC strategy
  _strategicClearMemory(forceClear = false) {
    // Track when we last did GC
    const now = Date.now();
    if (!this._lastGcTime) {
      this._lastGcTime = 0;
    }

    // Only run GC if:
    // 1. It's been at least 3 seconds since last GC, or
    // 2. forceClear is true
    if (forceClear || now - this._lastGcTime > 3000) {
      this._lastGcTime = now;
      return this._forceClearMemory();
    }

    return Promise.resolve();
  }

  // New method to check if document should use S3 streaming
  _shouldUseS3Streaming(textLength) {
    // Use S3 streaming for documents larger than 1MB
    return textLength > 1000000;
  }

  // New method to stream chunks to/from S3
  async _streamChunksToS3(text, chunkSize = 5000) {
    try {
      this.onProgress?.({
        stage: "chunking",
        message: "🔄 Streaming large document to S3 storage...",
        progress: 12,
      });

      // Import AWS SDK dynamically to avoid loading it unnecessarily
      const { S3Client, PutObjectCommand, GetObjectCommand } = await import(
        "@aws-sdk/client-s3"
      );
      const { v4: uuidv4 } = await import("uuid");

      // Initialize S3 client - use environment variables for credentials
      const s3Client = new S3Client({
        region: process.env.AWS_REGION || "us-east-2",
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      });

      // Create a unique key for this document processing session
      const sessionId = uuidv4();
      const s3BasePath = `tmp/chunking/${sessionId}/`;

      // Create chunks with stream processing to minimize memory usage
      const totalChunks = Math.ceil(text.length / chunkSize);
      const chunkKeys = [];

      this.onProgress?.({
        stage: "chunking",
        message: `📦 Creating ${totalChunks} chunks and storing in cloud...`,
        progress: 15,
      });

      for (let i = 0; i < text.length; i += chunkSize) {
        // Extract chunk with minimal memory copy
        const end = Math.min(i + chunkSize, text.length);
        const chunk = text.slice(i, end);

        // Create a chunk key
        const chunkNum = Math.floor(i / chunkSize);
        const chunkKey = `${s3BasePath}chunk_${chunkNum
          .toString()
          .padStart(5, "0")}.txt`;

        // Upload chunk to S3
        await s3Client.send(
          new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: chunkKey,
            Body: chunk,
            ContentType: "text/plain",
          })
        );

        // Store chunk key for later retrieval
        chunkKeys.push(chunkKey);

        // Update progress
        if (chunkNum % 5 === 0 || chunkNum === totalChunks - 1) {
          const percentComplete = ((chunkNum + 1) / totalChunks) * 100;
          this.onProgress?.({
            stage: "chunking",
            message: `📤 Stored ${
              chunkNum + 1
            } of ${totalChunks} chunks (${Math.floor(percentComplete)}%)`,
            progress: 15 + percentComplete * 0.05,
          });
        }

        // Release memory after each chunk
        await this._strategicClearMemory();
      }

      // Store chunk metadata
      const metadataKey = `${s3BasePath}metadata.json`;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: metadataKey,
          Body: JSON.stringify({
            sessionId,
            totalChunks,
            chunkKeys,
            originalLength: text.length,
            timestamp: new Date().toISOString(),
          }),
          ContentType: "application/json",
        })
      );

      this.onProgress?.({
        stage: "chunking",
        message: `✅ Document successfully split into ${totalChunks} chunks in cloud storage`,
        progress: 20,
      });

      return {
        useS3: true,
        sessionId,
        totalChunks,
        chunkKeys,
        metadataKey,
        s3Client,
      };
    } catch (error) {
      console.error("Error in S3 streaming:", error);
      this.onProgress?.({
        stage: "chunking",
        message: `⚠️ Cloud storage error: ${error.message}. Falling back to local processing...`,
        progress: 15,
      });

      // Return false to indicate S3 streaming failed
      return { useS3: false };
    }
  }

  // Create text chunks with natural language boundaries
  async _createTextChunks(text) {
    // Calculate optimal chunk parameters based on text size
    const textSizeMB = text.length / (1024 * 1024);
    
    // Start progress update for chunking process with animation indicators
    this.onProgress?.({
      stage: "chunking",
      message: `⏳ Analyzing ${textSizeMB.toFixed(2)}MB document for optimal chunking...`,
      progress: 10,
    });
    
    // Adjust settings based on document size
    let maxLength = this.chunkSize;
    let overlap = this.chunkOverlap;
    let maxChunks = 100;
    
    if (textSizeMB > 5) { // Very large document (5MB+)
      maxLength = Math.min(this.chunkSize, 250); // Smaller chunks
      overlap = Math.floor(this.chunkOverlap * 0.5); // Reduced overlap
      maxChunks = 200; // More chunks allowed but still limited
      
      this.onProgress?.({
        stage: "chunking",
        message: `📊 Large document detected. Using smaller chunks (${maxLength} chars)`,
        progress: 11,
      });
    } else if (textSizeMB > 2) { // Large document (2-5MB)
      maxLength = Math.min(this.chunkSize, 300);
      overlap = Math.floor(this.chunkOverlap * 0.7);
      maxChunks = 150;
      
      this.onProgress?.({
        stage: "chunking",
        message: `📊 Medium-large document. Adjusting chunk settings (${maxLength} chars)`,
        progress: 11,
      });
    }
    
    const minLength = 50; // Minimum chunk size in characters
    
    // Define stronger sentence boundary patterns
    const sentenceEndPatterns = [
      /[.!?]\s+[A-Z]/g, // Period, exclamation, question mark followed by space and capital letter
      /\n\s*\n/g, // Double line breaks (paragraphs)
    ];

    let chunks = [];

    // If text is short enough, return as single chunk
    if (text.length <= maxLength) {
      this.onProgress?.({
        stage: "chunking",
        message: `✅ Text is short (${text.length} chars), using as single chunk`,
        progress: 20,
      });
      return [text];
    }

    let startPos = 0;
    let chunkCount = 0;

    this.onProgress?.({
      stage: "chunking",
      message: `🔄 Creating chunks from ${text.length} characters of text`,
      progress: 15,
    });

    // Use an array of loading indicators to create animation effect
    const loadingAnimations = ["⏳", "⌛", "⏳", "⌛"];
    let animationIndex = 0;
    let lastProgressUpdate = Date.now();
    
    while (startPos < text.length && chunkCount < maxChunks) {
      // Determine end position (either maxLength or end of text)
      let endPos = Math.min(startPos + maxLength, text.length);
      
      // Send progress updates frequently to show active processing
      const now = Date.now();
      if (now - lastProgressUpdate > 300) {
        // Calculate overall progress percentage
        const percentComplete = (startPos / text.length) * 100;
        
        // Rotate through loading animations
        animationIndex = (animationIndex + 1) % loadingAnimations.length;
        const loadingIndicator = loadingAnimations[animationIndex];
        
        this.onProgress?.({
          stage: "chunking",
          message: `${loadingIndicator} Creating text chunks (${Math.floor(percentComplete)}% complete)`,
          progress: Math.min(20, 15 + (percentComplete * 0.05)),
        });
        lastProgressUpdate = now;
      }

      // If we're not at the end of the text, look for a sentence boundary
      if (endPos < text.length) {
        // Search backward from max position to find a good sentence boundary
        let boundaryFound = false;

        // Start from the max position and work backward
        for (
          let searchPos = endPos;
          searchPos > startPos + minLength;
          searchPos--
        ) {
          const textSlice = text.slice(startPos, searchPos);

          // Check for sentence ending patterns
          for (const pattern of sentenceEndPatterns) {
            const matches = [...textSlice.matchAll(pattern)];
            if (matches.length > 0) {
              // Get the last match
              const lastMatch = matches[matches.length - 1];
              const boundaryPos = startPos + lastMatch.index + 1; // +1 to include the period

              // If this boundary is far enough from start, use it
              if (boundaryPos > startPos + minLength) {
                endPos = boundaryPos;
                boundaryFound = true;
                break;
              }
            }
          }

          if (boundaryFound) break;

          // Fallback to simpler boundaries if we can't find good sentence breaks
          if (searchPos > startPos + minLength) {
            const char = text[searchPos];
            if (
              ".!?;:".includes(char) &&
              searchPos + 1 < text.length &&
              text[searchPos + 1] === " "
            ) {
              endPos = searchPos + 1; // Include the punctuation
              boundaryFound = true;
              break;
            }
          }
        }
      }

      // Extract the chunk and add to list
      const chunk = text.slice(startPos, endPos).trim();
      if (chunk.length >= minLength) {
        chunks.push(chunk);
        chunkCount++;
        
        // Occasionally send updates about chunk count
        if (chunkCount % 5 === 0) {
          this.onProgress?.({
            stage: "chunking",
            message: `📊 Created ${chunkCount} chunks so far...`,
            progress: Math.min(19, 15 + (chunkCount * 0.2)),
          });
        }
      }

      // Move start position for next chunk, ensuring overlap
      startPos = Math.max(0, endPos - overlap);

      // Handle case where we can't find good boundaries to progress
      if (startPos >= endPos - 1) {
        startPos = endPos; // Force progress to avoid infinite loop
      }
      
      // For very long texts, periodically force GC
      if (chunkCount % 20 === 0) {
        await this._strategicClearMemory(true);
      }
    }

    // Final progress update for chunk creation
    this.onProgress?.({
      stage: "chunking",
      message: `✅ Created ${chunks.length} text chunks successfully`,
      progress: 20,
    });

    return chunks;
  }

  // Modified extraction method to work with S3-stored chunks
  async _extractClauses(chunks) {
    const allClauses = [];

    // Check if we're using S3 streaming
    const usingS3 = this._s3Session && chunks.length > 0 && chunks[0].s3Key;

    if (usingS3) {
      this.onProgress?.({
        stage: "extraction",
        message: `🔄 Retrieving chunks from cloud storage...`,
        progress: 30,
      });

      try {
        // Import AWS SDK dynamically
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");

        // Process chunks from S3 in small batches
        const BATCH_SIZE = 5;

        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
          const batch = chunks.slice(
            i,
            Math.min(i + BATCH_SIZE, chunks.length)
          );

          this.onProgress?.({
            stage: "extraction",
            message: `📥 Loading batch ${
              Math.floor(i / BATCH_SIZE) + 1
            } of ${Math.ceil(chunks.length / BATCH_SIZE)} from cloud...`,
            progress: 31 + (i / chunks.length) * 3,
          });

          // Process each chunk in batch
          for (const chunk of batch) {
            try {
              // Get chunk from S3
              const response = await this._s3Session.s3Client.send(
                new GetObjectCommand({
                  Bucket: process.env.AWS_S3_BUCKET,
                  Key: chunk.s3Key,
                })
              );

              // Convert stream to text
              const chunkText = await response.Body.transformToString();

              // Process the chunk (using existing extraction logic)
              await this._processChunkForExtraction(chunkText, allClauses);

              // Clean up memory
              await this._strategicClearMemory();
            } catch (err) {
              console.error(`Error processing S3 chunk ${chunk.s3Key}:`, err);
            }
          }
        }

        // Clean up S3 session
        this.onProgress?.({
          stage: "extraction",
          message: `🧹 Cleaning up temporary cloud storage...`,
          progress: 35,
        });

        // Additional clean-up could be implemented here to delete S3 files
      } catch (error) {
        console.error("Error in S3 extraction:", error);
        this.onProgress?.({
          stage: "extraction",
          message: `⚠️ Cloud storage error: ${error.message}. Using available chunks...`,
          progress: 35,
        });
      }
    } else {
      // Standard in-memory processing for regular chunks
      console.log(`Attempting to extract clauses from ${chunks.length} chunks`);
      await this._processChunksForExtraction(chunks, allClauses);
    }

    // Final extraction progress update
    this.onProgress?.({
      stage: "extraction",
      message: `🎉 Extraction complete - found ${allClauses.length} clauses`,
      progress: 45,
    });

    return allClauses;
  }

  // Helper method to process chunks for extraction (factored out to support both S3 and regular)
  async _processChunksForExtraction(chunks, allClauses) {
    try {
      // IMPROVED: Further reduce batch size to 1 (from 2)
      const BATCH_SIZE = 1;

      logMemory("Before extraction");

      // Initial progress update with immediate feedback
      this.onProgress?.({
        stage: "extraction",
        message: `🚀 Starting extraction process - ${chunks.length} chunks to process`,
        progress: 30,
      });

      // Set a shorter initial delay for first update
      let lastProgressUpdate = Date.now() - 200;

      // Use loading animations for visual feedback
      const loadingAnimations = ["⏱️", "⌛", "⏳", "🔄"];
      let animationIndex = 0;

      // Pre-extraction notice
      setTimeout(() => {
        this.onProgress?.({
          stage: "extraction",
          message: `🔍 Preparing text for clause extraction...`,
          progress: 31,
        });
      }, 300);

      // Show model loading message
      setTimeout(() => {
        this.onProgress?.({
          stage: "extraction",
          message: `🧠 Loading AI extraction model...`,
          progress: 32,
        });
      }, 800);

      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        // Log memory usage
        logMemory(`Processing chunk ${i + 1}/${chunks.length}`);

        const batchChunks = chunks.slice(i, i + BATCH_SIZE);

        // Send progress updates very frequently to show active processing
        const now = Date.now();
        if (now - lastProgressUpdate > 200) {
          // More frequent updates (200ms)
          const percentComplete = (i / chunks.length) * 100;
          const normalizedProgress =
            33 + Math.floor((percentComplete / 100) * 12);

          // Rotate through loading animations
          animationIndex = (animationIndex + 1) % loadingAnimations.length;
          const loadingIndicator = loadingAnimations[animationIndex];

          this.onProgress?.({
            stage: "extraction",
            message: `${loadingIndicator} Extracting clauses: chunk ${
              i + 1
            } of ${chunks.length} (${Math.floor(percentComplete)}%)`,
            progress: normalizedProgress,
          });
          lastProgressUpdate = now;
        }

        // Process each chunk in batch
        for (const chunk of batchChunks) {
          await this._processChunkForExtraction(chunk, allClauses);
        }

        // Force GC after each batch
        await this._strategicClearMemory();

        // Progress update after batch
        this.onProgress?.({
          stage: "extraction",
          message: `✅ Completed ${Math.min(
            i + BATCH_SIZE,
            chunks.length
          )} of ${chunks.length} chunks (found ${
            allClauses.length
          } clauses so far)`,
          progress:
            33 +
            Math.floor(
              (Math.min(i + BATCH_SIZE, chunks.length) / chunks.length) * 12
            ),
        });
      }
    } catch (error) {
      console.error("Error in extraction process:", error);
      this.onProgress?.({
        stage: "extraction",
        message: `❌ Error in extraction process: ${error.message}`,
        progress: 40,
      });
    }
  }

  // Helper method to process a single chunk for extraction
  async _processChunkForExtraction(chunk, allClauses) {
    try {
      // Check if this is an S3 chunk reference
      if (chunk.s3Key) {
        // For S3 chunks, we already processed the actual text in _extractClauses
        // Just log the reference and return (actual processing done in _extractClauses)
        console.log(`Processing S3 chunk with key: ${chunk.s3Key}`);
        return;
      }
      
      console.log(`Processing chunk, length: ${chunk.length} characters`);

      // Progress update for individual chunk processing
      this.onProgress?.({
        stage: "extraction",
        message: `🔍 Analyzing text chunk (${chunk.length} characters)`,
        progress: 33,
      });

      // IMPROVED: Further reduce chunk size limit
      const MAX_CHUNK_LENGTH = 4000; // Reduced from 8000
      const truncatedChunk =
        chunk.length > MAX_CHUNK_LENGTH
          ? chunk.substring(0, MAX_CHUNK_LENGTH)
          : chunk;

      // Progress update for API call with time estimate
      this.onProgress?.({
        stage: "extraction",
        message: `🧠 Running AI extraction model (may take 10-20 seconds)...`,
        progress: 34,
      });

      // Show "thinking" updates during the API call
      const apiStartTime = Date.now();
      const apiUpdateInterval = setInterval(() => {
        // Only update if the API call is still running
        if (Date.now() - apiStartTime < 30000) {
          // 30s max to avoid infinite updates
          // Rotate through loading animations
          const loadingAnimations = ["⏱️", "⌛", "⏳", "🔄"];
          const animationIndex =
            Math.floor((Date.now() - apiStartTime) / 500) %
            loadingAnimations.length;
          const loadingIndicator = loadingAnimations[animationIndex];

          this.onProgress?.({
            stage: "extraction",
            message: `${loadingIndicator} AI model processing text (${Math.floor(
              (Date.now() - apiStartTime) / 1000
            )}s)...`,
            progress: 34,
          });
        }
      }, 2000); // Update every 2 seconds during API call

      try {
        // Use the current OpenAI API format
        const response = await this.openai.chat.completions.create({
          model: this.models.duplicator,
          messages: [
            {
              role: "system",
              content: buildOrgSystemPrompt(this.orgStyleSample),
            },
            {
              role: "user",
              content: truncatedChunk,
            },
          ],
          // IMPROVED: Reduce max token limit
          max_tokens: 512, // Reduced from 1024
          temperature: 0.3,
        });

        // Clear the interval once the API call is complete
        clearInterval(apiUpdateInterval);

        // Progress update for response parsing
        this.onProgress?.({
          stage: "extraction",
          message: `📊 Processing extraction results...`,
          progress: 35,
        });

        if (response && response.choices && response.choices.length > 0) {
          const content = response.choices[0].message.content;

          // Parse response (assuming one clause per line)
          const parsedClauses = content
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && line.length < 300) // Reduce max length from 500
            .map((line) => this._ensureCompleteSentences(line));

          // IMPROVED: Add clauses one by one instead of storing in an intermediate array
          for (const clause of parsedClauses) {
            allClauses.push(clause);
          }

          // Update progress with clauses found
          this.onProgress?.({
            stage: "extraction",
            message: `✅ Found ${parsedClauses.length} clauses in current chunk`,
            progress: 35,
          });
        }
      } catch (apiError) {
        // Clear the interval if there's an error
        clearInterval(apiUpdateInterval);
        
        // Check if it's a timeout error
        const isTimeout = apiError.message?.includes('timeout') || 
                          apiError.code === 'ETIMEDOUT' || 
                          apiError.code === 'ESOCKETTIMEDOUT' ||
                          apiError.type === 'request_timeout';
        
        if (isTimeout) {
          console.error("OpenAI API timeout during extraction:", apiError);
          
          // Provide specific error message for timeout
          const timeoutError = {
            type: 'timeout',
            stage: 'extraction',
            message: 'The AI model took too long to respond. This might happen with very complex or large text chunks.',
            details: apiError.message,
            recovery: 'The system will continue processing other chunks. Consider using smaller document sections.'
          };
          
          // Send error through callback if available
          this.onError?.(timeoutError);
          
          // Show timeout message in progress updates
          this.onProgress?.({
            stage: "extraction",
            message: `⏱️ Timeout: AI model took too long to respond. Continuing with other chunks...`,
            progress: 35,
          });
        } else {
          // Handle other API errors
          console.error("OpenAI API error during extraction:", apiError);
          
          // Provide general API error info
          const apiErrorInfo = {
            type: 'api_error',
            stage: 'extraction',
            message: 'Error connecting to AI service: ' + (apiError.message || 'Unknown error'),
            details: apiError.message,
            recovery: 'The system will attempt to continue processing. Check your network connection.'
          };
          
          // Send error through callback
          this.onError?.(apiErrorInfo);
          
          // Show API error in progress updates
          this.onProgress?.({
            stage: "extraction",
            message: `❌ API error: ${apiError.message || 'Unknown error'}. Attempting to continue...`,
            progress: 35,
          });
        }
      }

      // Force GC after processing
      await this._strategicClearMemory();
    } catch (error) {
      console.error("Error extracting clauses:", error);
      // Error progress update
      this.onProgress?.({
        stage: "extraction",
        message: `❌ Error processing chunk: ${error.message}`,
        progress: 35,
      });
      
      // Send general error through callback
      this.onError?.({
        type: 'processing_error',
        stage: 'extraction',
        message: 'Error processing text chunk: ' + error.message,
        details: error.stack || error.message,
        recovery: 'The system will attempt to continue with other chunks.'
      });
    }
  }

  // Add this method to your class
  _ensureCompleteSentences(text) {
    // If text is empty or null, return as is
    if (!text || text.trim() === "") return text;

    // Ensure text starts with a capital letter
    text = text.trim();
    if (text.length > 0) {
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }

    // Ensure text ends with proper punctuation
    if (!/[.!?]$/.test(text)) {
      text += ".";
    }

    // Remove any incomplete sentence fragments at the beginning
    const startsWithLowercase =
      /^[a-z]/.test(text) && !text.startsWith("i ") && !text.startsWith("i'");
    if (startsWithLowercase) {
      // Try to find the first sentence boundary
      const sentenceMatch = text.match(/[.!?]\s+[A-Z]/);
      if (sentenceMatch) {
        const boundaryIndex = sentenceMatch.index + 1;
        text = text.substring(boundaryIndex).trim();
        if (text.length > 0) {
          text = text.charAt(0).toUpperCase() + text.slice(1);
        }
      }
    }

    // Remove any incomplete fragments at the end
    const lastSentenceMatch = text.match(/[.!?]\s+[a-z]/g);
    if (lastSentenceMatch) {
      const lastMatch = lastSentenceMatch[lastSentenceMatch.length - 1];
      const lastBoundaryIndex = text.lastIndexOf(lastMatch) + 1;
      if (lastBoundaryIndex > 0) {
        text = text.substring(0, lastBoundaryIndex);
      }
    }

    return text;
  }

  // NEW: Middleware 1 - Deduplicate clauses
  _deduplicateClauses(clauses) {
    console.log(`Deduplicating ${clauses.length} clauses`);

    try {
      // Use Map for O(n) deduplication without creating massive Sets
      const uniqueClauseMap = new Map();

      // Enhanced deduplication with similarity detection
      for (const clause of clauses) {
        // Normalize the clause to improve matching
        const normalizedClause = this._normalizeText(clause);

        // Check if we already have this or a very similar clause
        let isDuplicate = false;

        // Simple exact match first (most efficient)
        if (uniqueClauseMap.has(normalizedClause)) {
          isDuplicate = true;
        } else {
          // Store normalized version for efficiency
          uniqueClauseMap.set(normalizedClause, clause);
        }
      }

      // Convert back to array of original clauses
      const uniqueClauses = Array.from(uniqueClauseMap.values());

      console.log(
        `Deduplication complete: ${clauses.length} clauses → ${uniqueClauses.length} unique clauses`
      );
      return uniqueClauses;
    } catch (error) {
      console.error("Error in deduplication process:", error);
      // In case of error, return original array with basic deduplication
      const simpleDeduped = [...new Set(clauses)];
      return simpleDeduped;
    }
  }

  // Helper for deduplication - normalize text for better matching
  _normalizeText(text) {
    if (!text) return "";

    return text
      .toLowerCase()
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/[.,;:!?()'"]/g, "") // Remove punctuation
      .trim();
  }

  // Classify clauses using Model 2
  async _classifyClauses(clauses) {
    const classifiedClauses = [];

    console.log(`Attempting to classify ${clauses.length} clauses`);

    try {
      // Process clauses in smaller batches to prevent memory issues
      const BATCH_SIZE = 20;
      for (let i = 0; i < clauses.length; i += BATCH_SIZE) {
        const batchClauses = clauses.slice(i, i + BATCH_SIZE);

        this.onProgress?.({
          stage: "classification",
          message: `Processing classification batch ${
            Math.floor(i / BATCH_SIZE) + 1
          } of ${Math.ceil(clauses.length / BATCH_SIZE)}, with ${
            batchClauses.length
          } clauses`,
          progress: 60 + Math.floor((i / clauses.length) * 10),
        });

        // Process each clause in the batch with a limit on concurrent requests
        const batchPromises = batchClauses.map(async (clause) => {
          try {
            console.log(`Classifying clause: "${clause.substring(0, 30)}..."`);

            // Limit clause size to prevent memory issues
            const MAX_CLAUSE_LENGTH = 500;
            const truncatedClause =
              clause.length > MAX_CLAUSE_LENGTH
                ? clause.substring(0, MAX_CLAUSE_LENGTH)
                : clause;

            try {
              const response = await this.openai.chat.completions.create({
                model: this.models.classifier,
                messages: [
                  {
                    role: "system",
                    content:
                      "You are a document importance classifier that analyzes legal and business text to identify and rank the most important clauses. You evaluate clauses based on legal significance, financial impact, risk exposure, and operational relevance. You classify each clause as 'Critical', 'Important', or 'Standard' and explain your reasoning.",
                  },
                  {
                    role: "user",
                    content: `Please classify the importance of this clause: '${truncatedClause}'`,
                  },
                ],
                temperature: 0.3,
                max_tokens: 128,
              });

              if (response && response.choices && response.choices.length > 0) {
                // Parse classification from response
                const classificationText = response.choices[0].message.content;

                // Extract classification label (simple approach)
                let classification = "Standard";
                if (classificationText.includes("Critical")) {
                  classification = "Critical";
                } else if (classificationText.includes("Important")) {
                  classification = "Important";
                }

                return {
                  text: clause,
                  classification,
                };
              }
            } catch (apiError) {
              // Check if it's a timeout error
              const isTimeout = apiError.message?.includes('timeout') || 
                               apiError.code === 'ETIMEDOUT' || 
                               apiError.code === 'ESOCKETTIMEDOUT' ||
                               apiError.type === 'request_timeout';
              
              if (isTimeout) {
                console.error("OpenAI API timeout during classification:", apiError);
                
                // Send timeout error through callback
                this.onError?.({
                  type: 'timeout',
                  stage: 'classification',
                  message: 'AI model timeout during classification. The system will continue with default classification.',
                  details: apiError.message,
                  recovery: 'Affected clause will be marked as Standard and processing will continue.'
                });
                
                // Log the timeout for the specific clause
                console.log(`Classification timeout for clause: "${clause.substring(0, 30)}..."`);
              } else {
                // Handle other API errors
                console.error("OpenAI API error during classification:", apiError);
                
                // Send general API error through callback
                this.onError?.({
                  type: 'api_error',
                  stage: 'classification',
                  message: 'Error connecting to AI service during classification: ' + (apiError.message || 'Unknown error'),
                  details: apiError.message,
                  recovery: 'Processing will continue with default classification.'
                });
              }
            }

            // Default classification if response can't be parsed or there's an error
            return {
              text: clause,
              classification: "Standard",
            };
          } catch (error) {
            console.error("Error classifying clause:", error);

            // Send general error through callback
            this.onError?.({
              type: 'processing_error',
              stage: 'classification',
              message: 'Error processing clause: ' + error.message,
              details: error.stack || error.message,
              recovery: 'The system will continue with default classification for this clause.'
            });

            // Default classification if there's an error
            return {
              text: clause,
              classification: "Standard",
            };
          }
        });

        // Use sequential processing with a concurrency limit to avoid memory issues
        const CONCURRENCY_LIMIT = 5;
        const results = [];

        for (let j = 0; j < batchPromises.length; j += CONCURRENCY_LIMIT) {
          const concurrentBatch = batchPromises.slice(j, j + CONCURRENCY_LIMIT);
          const batchResults = await Promise.all(concurrentBatch);
          results.push(...batchResults);

          // Allow garbage collection between concurrent batches
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        // Add batch results to overall results
        for (const result of results) {
          if (result && result.text) {
            classifiedClauses.push(result);
          }
        }

        // Give garbage collector a chance to run
        await this._strategicClearMemory();
      }
    } catch (error) {
      console.error("Error in classification process:", error);
    }

    console.log(`Classified ${classifiedClauses.length} clauses successfully`);
    return classifiedClauses;
  }

  // NEW: Middleware 2 - Filter clauses based on user settings
  _filterClausesByUserSettings(classifiedClauses) {
    console.log(
      `Filtering ${classifiedClauses.length} classified clauses based on user settings`
    );
    console.log(
      `User settings: Filter=${this.userSettings.classFilter}, Prioritize=${this.userSettings.prioritizeImportant}`
    );

    // Track statistics for different classifications
    const stats = {
      total: classifiedClauses.length,
      Critical: 0,
      Important: 0,
      Standard: 0,
      filtered: 0,
    };

    try {
      // Count instances of each classification
      for (const clause of classifiedClauses) {
        stats[clause.classification] = (stats[clause.classification] || 0) + 1;
      }

      console.log(
        `Classification stats: Critical=${stats.Critical}, Important=${stats.Important}, Standard=${stats.Standard}`
      );

      // Step 1: Apply the filter based on user's classFilter setting
      let filteredClauses = [...classifiedClauses]; // Start with all clauses

      // Apply class filter according to user selection
      if (this.userSettings.classFilter === "critical_only") {
        console.log("Filtering to keep only Critical clauses");
        filteredClauses = classifiedClauses.filter(
          (c) => c.classification === "Critical"
        );
      } else if (this.userSettings.classFilter === "important_plus") {
        console.log("Filtering to keep Important and Critical clauses");
        filteredClauses = classifiedClauses.filter(
          (c) =>
            c.classification === "Critical" || c.classification === "Important"
        );
      }

      console.log(
        `After filtering by class: ${filteredClauses.length} clauses remaining`
      );

      // Step 2: Apply prioritization if requested
      const maxClausesToProcess = 50; // Limit max clauses to process

      if (this.userSettings.prioritizeImportant) {
        console.log("Prioritizing by importance level");
        // Sort by classification priority
        filteredClauses.sort((a, b) => {
          const priority = { Critical: 3, Important: 2, Standard: 1 };
          return priority[b.classification] - priority[a.classification];
        });
      }

      // Take only a limited number of clauses to prevent memory issues
      const finalClauses = filteredClauses.slice(0, maxClausesToProcess);
      stats.filtered = finalClauses.length;

      console.log(`Final filtered set: ${finalClauses.length} clauses`);

      return finalClauses;
    } catch (error) {
      console.error("Error filtering clauses:", error);

      // In case of error, return a safe subset
      const safeClauses = classifiedClauses.slice(
        0,
        Math.min(20, classifiedClauses.length)
      );
      return safeClauses;
    }
  }

  // Generate variants using Model 3
  async _generateVariants(classifiedClauses) {
    const variantResults = [];

    try {
      console.log(
        `Generating variants for ${classifiedClauses.length} clauses`
      );

      // Process clauses in smaller batches to prevent memory issues
      const BATCH_SIZE = 10;
      for (let i = 0; i < classifiedClauses.length; i += BATCH_SIZE) {
        const batchClauses = classifiedClauses.slice(i, i + BATCH_SIZE);

        this.onProgress?.({
          stage: "generation",
          message: `Processing variant batch ${
            Math.floor(i / BATCH_SIZE) + 1
          } of ${Math.ceil(classifiedClauses.length / BATCH_SIZE)}, with ${
            batchClauses.length
          } clauses`,
          progress: 85 + Math.floor((i / classifiedClauses.length) * 10),
        });

        // Process each clause in the batch with a limit on concurrent requests
        const batchPromises = batchClauses.map(async (clauseObj) => {
          try {
            const { text, classification } = clauseObj;
            console.log(
              `Generating variants for clause: "${text.substring(0, 30)}..."`
            );

            // Limit text size to prevent memory issues
            const MAX_TEXT_LENGTH = 500;
            const truncatedText =
              text.length > MAX_TEXT_LENGTH
                ? text.substring(0, MAX_TEXT_LENGTH)
                : text;

            try {
              const response = await this.openai.chat.completions.create({
                model: this.models.duplicator,
                messages: [
                  {
                    role: "system",
                    content:
                      "You are a clause rewriter that upscales and rewrites informal, vague, or casual language into clear, professional organizational formatting with high fidelity. Your output should match legal or business standards, even if the input is messy or shorthand. Always ensure each variant is a complete sentence or paragraph with proper beginning and ending. Never produce partial or truncated sentences.",
                  },
                  {
                    role: "user",
                    content: truncatedText,
                  },
                ],
                temperature: 0.7,
                max_tokens: 1024,
              });

              if (response && response.choices && response.choices.length > 0) {
                // Parse variants (one per line)
                const content = response.choices[0].message.content;
                let variants = content
                  .split("\n")
                  .map((line) => line.trim())
                  .filter((line) => line.length > 0 && line.length < 1000);

                // Apply post-processing to ensure complete sentences
                variants = variants.map((variant) =>
                  this._ensureCompleteSentences(variant)
                );

                return {
                  original: text,
                  classification,
                  variants: variants.slice(0, 3), // Ensure max 3 variants
                };
              }
            } catch (apiError) {
              // Check if it's a timeout error
              const isTimeout = apiError.message?.includes('timeout') || 
                               apiError.code === 'ETIMEDOUT' || 
                               apiError.code === 'ESOCKETTIMEDOUT' ||
                               apiError.type === 'request_timeout';
              
              if (isTimeout) {
                console.error("OpenAI API timeout during variant generation:", apiError);
                
                // Send timeout error through callback
                this.onError?.({
                  type: 'timeout',
                  stage: 'generation',
                  message: 'AI model timeout during variant generation. The system will continue with original text only.',
                  details: apiError.message,
                  recovery: 'This clause will not have generated variants. Consider adjusting chunk sizes or simplifying text.'
                });
                
                // Show timeout in progress updates for this specific clause
                this.onProgress?.({
                  stage: "generation",
                  message: `⏱️ Timeout generating variants for clause: "${text.substring(0, 30)}..."`,
                  progress: 85 + Math.floor((i / classifiedClauses.length) * 10),
                });
              } else {
                // Handle other API errors
                console.error("OpenAI API error during variant generation:", apiError);
                
                // Send general API error through callback
                this.onError?.({
                  type: 'api_error',
                  stage: 'generation',
                  message: 'Error connecting to AI service during variant generation: ' + (apiError.message || 'Unknown error'),
                  details: apiError.message,
                  recovery: 'Processing will continue with original text only for this clause.'
                });
              }
            }

            return {
              original: text,
              classification,
              variants: [],
            };
          } catch (error) {
            console.error("Error generating variants:", error);
            
            // Send general error through callback
            this.onError?.({
              type: 'processing_error',
              stage: 'generation',
              message: 'Error generating variants: ' + error.message,
              details: error.stack || error.message,
              recovery: 'The system will continue with original text only for this clause.'
            });
            
            return {
              original: clauseObj.text,
              classification: clauseObj.classification,
              variants: [],
            };
          }
        });

        // Use sequential processing with a concurrency limit to avoid memory issues
        const CONCURRENCY_LIMIT = 3;
        const results = [];

        for (let j = 0; j < batchPromises.length; j += CONCURRENCY_LIMIT) {
          const concurrentBatch = batchPromises.slice(j, j + CONCURRENCY_LIMIT);
          const batchResults = await Promise.all(concurrentBatch);
          results.push(...batchResults);

          // Allow garbage collection between concurrent batches
          await this._strategicClearMemory();
        }

        // Add batch results to overall results
        for (const result of results) {
          if (result && result.original) {
            variantResults.push(result);
          }
        }

        // Give garbage collector a chance to run
        await this._strategicClearMemory();
      }

      return variantResults;
    } catch (error) {
      console.error("Error generating variants:", error);

      // Return original clauses without variants in case of error
      return classifiedClauses.map((clauseObj) => ({
        original: clauseObj.text,
        classification: clauseObj.classification,
        variants: [],
      }));
    }
  }

  // Quality filtering middleware to ensure variants are meaningfully different
  async _filterVariantsBySimilarity(variantResults) {
    console.log(`Quality filtering ${variantResults.length} clause variants`);

    try {
      this.onProgress?.({
        stage: "quality_filtering",
        message: `Assessing quality of generated variants`,
        progress: 92,
      });

      const qualityAssessedResults = [];
      const similarityThreshold = 0.85; // Similarity threshold (adjust as needed)

      // Process in batches to manage memory and API usage
      const BATCH_SIZE = 5;

      for (let i = 0; i < variantResults.length; i += BATCH_SIZE) {
        const batch = variantResults.slice(i, i + BATCH_SIZE);

        // Process each clause and its variants
        const batchPromises = batch.map(async (clauseObj) => {
          const { original, variants, classification } = clauseObj;

          // If no variants, just return the original
          if (!variants || variants.length === 0) {
            return {
              original,
              classification,
              variants: [],
              quality_metrics: {
                filtered_count: 0,
                avg_similarity: 0,
                legal_score: 0,
              },
            };
          }

          // Calculate semantic similarity for each variant
          const filteredVariants = [];
          const similarityScores = [];
          const legalScores = [];

          // Call OpenAI to evaluate variants' quality
          try {
            const response = await this.openai.chat.completions.create({
              model: "gpt-4o", // Use a strong model for evaluation
              messages: [
                {
                  role: "system",
                  content: `You are a legal document evaluator that assesses the quality of rewritten legal clauses.
                  For each variant of the original clause, provide:
                  1. A semantic similarity score (0-1) measuring how similar the meaning is
                  2. A legal terminology preservation score (0-1)
                  3. A determination of whether the variant is sufficiently different while preserving legal meaning
                  
                  Return the results as a JSON array of objects with properties:
                  - similarity_score: number between 0-1
                  - legal_score: number between 0-1
                  - should_keep: boolean
                  - reason: short explanation`,
                },
                {
                  role: "user",
                  content: `Original clause: "${original}"
                  
                  Variants to assess:
                  ${variants.map((v, idx) => `${idx + 1}. ${v}`).join("\n\n")}`,
                },
              ],
              temperature: 0.1,
              response_format: { type: "json_object" },
            });

            // Parse the evaluation results
            const evaluationResults = JSON.parse(
              response.choices[0].message.content
            );

            // Apply filtering based on the evaluation
            if (evaluationResults && evaluationResults.variants) {
              // Keep track of filtered variants and quality metrics
              let filteredCount = 0;

              // Process each variant with its evaluation
              for (let j = 0; j < variants.length; j++) {
                const evaluation = evaluationResults.variants[j];

                // Only keep variants that passed quality checks
                if (evaluation && evaluation.should_keep) {
                  filteredVariants.push(variants[j]);
                  similarityScores.push(evaluation.similarity_score);
                  legalScores.push(evaluation.legal_score);
                } else {
                  filteredCount++;
                }
              }

              // Compute quality metrics
              const avgSimilarity =
                similarityScores.length > 0
                  ? similarityScores.reduce((a, b) => a + b, 0) /
                    similarityScores.length
                  : 0;

              const avgLegalScore =
                legalScores.length > 0
                  ? legalScores.reduce((a, b) => a + b, 0) / legalScores.length
                  : 0;

              // Return the filtered variants with quality metrics
              return {
                original,
                classification,
                variants: filteredVariants,
                quality_metrics: {
                  filtered_count: filteredCount,
                  avg_similarity: avgSimilarity,
                  avg_legal_score: avgLegalScore,
                  total_variants: filteredVariants.length,
                },
              };
            }
          } catch (error) {
            console.error(
              `Error evaluating variants for clause: ${original.substring(
                0,
                30
              )}...`,
              error
            );

            // Fallback: Use a simple heuristic approach if API call fails
            // Calculate word-level similarity as a rough approximation
            for (const variant of variants) {
              // Simple fallback similarity check
              const originalWords = new Set(
                original.toLowerCase().split(/\s+/)
              );
              const variantWords = new Set(variant.toLowerCase().split(/\s+/));

              // Calculate Jaccard similarity
              const intersection = new Set(
                [...originalWords].filter((word) => variantWords.has(word))
              );
              const union = new Set([...originalWords, ...variantWords]);
              const similarity = intersection.size / union.size;

              // Only keep variants that are sufficiently different
              if (similarity < similarityThreshold) {
                filteredVariants.push(variant);
                similarityScores.push(similarity);
              }
            }

            // Calculate average similarity
            const avgSimilarity =
              similarityScores.length > 0
                ? similarityScores.reduce((a, b) => a + b, 0) /
                  similarityScores.length
                : 0;

            // Return fallback result
            return {
              original,
              classification,
              variants: filteredVariants,
              quality_metrics: {
                filtered_count: variants.length - filteredVariants.length,
                avg_similarity: avgSimilarity,
                avg_legal_score: 0, // Can't calculate without AI
                total_variants: filteredVariants.length,
                fallback_method: true,
              },
            };
          }

          // If evaluation failed completely, return original variants
          return {
            original,
            classification,
            variants,
            quality_metrics: {
              filtered_count: 0,
              avg_similarity: 0,
              avg_legal_score: 0,
              evaluation_failed: true,
            },
          };
        });

        // Process batch concurrently with limits
        const batchResults = await Promise.all(batchPromises);
        qualityAssessedResults.push(...batchResults);

        // Update progress
        this.onProgress?.({
          stage: "quality_filtering",
          message: `Processed quality assessment batch ${
            Math.floor(i / BATCH_SIZE) + 1
          } of ${Math.ceil(variantResults.length / BATCH_SIZE)}`,
          progress: 92 + Math.floor((i / variantResults.length) * 3),
        });

        // Allow for garbage collection
        await this._strategicClearMemory();
      }

      // Log quality metrics summary
      const totalFiltered = qualityAssessedResults.reduce(
        (sum, item) => sum + (item.quality_metrics?.filtered_count || 0),
        0
      );

      const totalVariants = qualityAssessedResults.reduce(
        (sum, item) => sum + (item.variants?.length || 0),
        0
      );

      console.log(
        `Quality filtering complete. Removed ${totalFiltered} low-quality variants, kept ${totalVariants} high-quality variants.`
      );

      return qualityAssessedResults;
    } catch (error) {
      console.error("Error in quality filtering:", error);
      return variantResults; // Return original results if filtering fails
    }
  }

  // Format variants for output
  _formatOutput(variants) {
    console.log(`Formatting ${variants.length} variant objects for output`);

    // If no variants, return empty string
    if (!variants || variants.length === 0) {
      return "";
    }

    try {
      // First, ensure all variants have complete sentences
      const processedVariants = variants.map((variant) => {
        // Process the original text to ensure it's a complete sentence
        const processedOriginal = this._ensureCompleteSentences(
          variant.original
        );

        // Process each variant to ensure they are complete sentences
        let processedVariantTexts = [];
        if (variant.variants && Array.isArray(variant.variants)) {
          processedVariantTexts = variant.variants.map((v) =>
            this._ensureCompleteSentences(v)
          );
        }

        // Return the processed variant object
        return {
          ...variant,
          original: processedOriginal,
          variants: processedVariantTexts,
        };
      });

      // Format based on output format setting - USE processedVariants BELOW INSTEAD OF variants
      switch (this.outputFormat.toLowerCase()) {
        case "jsonl":
          // Each line is a JSON object
          return processedVariants
            .map((variant) => {
              // Format for JSONL with required properties
              const formattedVariant = {
                original: variant.original,
                classification: variant.classification,
                variants: variant.variants || [],
              };
              return JSON.stringify(formattedVariant);
            })
            .join("\n");

        case "json":
          // Single JSON array
          return JSON.stringify(processedVariants, null, 2);

        case "openai-jsonl":
          // Format for OpenAI fine-tuning - fixed to create proper JSONL format
          const trainingExamples = [];

          // Process each variant
          for (const variant of processedVariants) {
            // Skip items with no variants
            if (!variant.variants || variant.variants.length === 0) {
              continue;
            }

            // Create a training example for each variant
            for (const v of variant.variants) {
              const example = {
                messages: [
                  {
                    role: "system",
                    content:
                      "You are a clause rewriter that upscales and rewrites informal, vague, or casual language into clear, professional organizational formatting with high fidelity. Your output should match legal or business standards, even if the input is messy or shorthand. Always ensure each variant is a complete sentence or paragraph with proper beginning and ending. Never produce partial or truncated sentences.",
                  },
                  { role: "user", content: variant.original },
                  { role: "assistant", content: v },
                ],
              };
              trainingExamples.push(example);
            }
          }

          // Convert array to JSONL format (one JSON object per line)
          return trainingExamples.map(JSON.stringify).join("\n");

        case "csv":
          // CSV format
          const header = "original,classification,variant";
          const rows = [];

          for (const variant of variants) {
            if (variant.variants && variant.variants.length > 0) {
              // Add a row for each variant
              for (const v of variant.variants) {
                rows.push(
                  `"${variant.original.replace(/"/g, '""')}","${
                    variant.classification
                  }","${v.replace(/"/g, '""')}"`
                );
              }
            } else {
              // Add a row for the original only
              rows.push(
                `"${variant.original.replace(/"/g, '""')}","${
                  variant.classification
                }",""`
              );
            }
          }

          return [header, ...rows].join("\n");

        default:
          // Default to pretty JSON
          return JSON.stringify(processedVariants, null, 2);
      }
    } catch (error) {
      console.error("Error formatting output:", error);
      // Return basic JSON as fallback
      return JSON.stringify(variants, null, 2);
    }
  }

  // Main entry point for the pipeline
  async process(text) {
    console.log(
      "Starting legal synthetic data pipeline for text length:",
      text.length
    );

    try {
      // Initialize stats for progress reporting
      const stats = {
        textLength: text.length,
        totalChunks: 0,
        processedChunks: 0,
        extractedClauses: 0,
        classifiedClauses: 0,
        generatedVariants: 0,
        startTime: Date.now(),
        processingTimeMs: 0,
        errors: [], // New field to track errors during processing
      };

      this.onProgress?.({
        stage: "chunking",
        message: `Creating chunks from ${text.length} characters of text`,
        progress: 10,
      });

      // Step 1: Create text chunks
      // Check if document is large enough to use S3 streaming
      const useS3 = this._shouldUseS3Streaming(text.length);
      let chunks = [];

      if (useS3) {
        // For very large documents, use S3 streaming
        this.onProgress?.({
          stage: "chunking",
          message: `📊 Large document detected (${text.length} chars). Using cloud storage...`,
          progress: 11,
        });
        
        const s3Result = await this._streamChunksToS3(text);
        
        if (s3Result.useS3) {
          // Store S3 session data for later stages
          this._s3Session = s3Result;
          
          // Return minimal placeholder chunks - actual content will be streamed from S3 as needed
          chunks = s3Result.chunkKeys.map(key => ({ s3Key: key, length: 0 }));
        } else {
          // If S3 streaming failed, continue with in-memory processing
          chunks = await this._createTextChunks(text);
        }
      } else {
        // For smaller documents, process normally
        chunks = await this._createTextChunks(text);
      }

      // Force garbage collection after creating chunks
      await this._strategicClearMemory();

      stats.totalChunks = chunks.length;

      this.onProgress?.({
        stage: "extraction",
        message: `Extracting clauses from ${chunks.length} chunks`,
        progress: 30,
      });

      // Step 2: Extract clauses
      const extractedClauses = await this._extractClauses(chunks);
      chunks.length = 0; // Clear chunks array
      await this._strategicClearMemory();

      stats.extractedClauses = extractedClauses.length;

      // Step 3: Deduplicate clauses
      this.onProgress?.({
        stage: "deduplication",
        message: `Deduplicating ${extractedClauses.length} clauses`,
        progress: 50,
      });

      const dedupedClauses = this._deduplicateClauses(extractedClauses);
      extractedClauses.length = 0; // Clear array
      await this._strategicClearMemory();

      // Step 4: Classify clauses
      this.onProgress?.({
        stage: "classification",
        message: `Classifying ${dedupedClauses.length} clauses`,
        progress: 60,
      });

      const classifiedClauses = await this._classifyClauses(dedupedClauses);
      stats.classifiedClauses = classifiedClauses.length;

      // Step 5: Filter clauses by user settings
      const filteredClauses =
        this._filterClausesByUserSettings(classifiedClauses);

      // Step 6: Generate variants
      this.onProgress?.({
        stage: "generation",
        message: `Generating variants for ${filteredClauses.length} clauses`,
        progress: 75,
      });

      const variantResults = await this._generateVariants(filteredClauses);
      stats.generatedVariants = variantResults.length;

      // Step 7: Quality filtering
      this.onProgress?.({
        stage: "quality_filtering",
        message: `Quality checking ${variantResults.length} variant sets`,
        progress: 90,
      });

      const qualityFilteredVariants = await this._filterVariantsBySimilarity(
        variantResults
      );

      // Step 8: Format output
      this.onProgress?.({
        stage: "formatting",
        message: `Formatting output in ${this.outputFormat} format`,
        progress: 95,
      });

      const formattedOutput = this._formatOutput(qualityFilteredVariants);

      // Calculate processing time
      stats.processingTimeMs = Date.now() - stats.startTime;

      this.onProgress?.({
        stage: "complete",
        message: `Processing complete`,
        progress: 100,
      });

      // Return the results with stats
      return {
        success: true,
        stats,
        output: formattedOutput,
        format: this.outputFormat,
      };
    } catch (error) {
      console.error("Pipeline processing error:", error);
      
      // Check if it's a timeout error
      const isTimeout = error.message?.includes('timeout') || 
                       error.code === 'ETIMEDOUT' || 
                       error.code === 'ESOCKETTIMEDOUT' ||
                       error.type === 'request_timeout';
      
      if (isTimeout) {
        // Create a user-friendly timeout error
        const timeoutError = {
          type: 'timeout',
          stage: 'processing',
          message: 'The AI model took too long to respond. This typically happens with very large or complex documents.',
          details: error.message,
          recovery: 'Try processing a smaller section of the document or reducing the complexity of content.'
        };
        
        // Send timeout error through callback
        this.onError?.(timeoutError);
        
        throw new Error("AI model timeout: The operation took too long to complete. Try processing a smaller document or section.");
      } else {
        // Send general error through callback
        this.onError?.({
          type: 'processing_error',
          stage: 'processing',
          message: 'Pipeline processing error: ' + error.message,
          details: error.stack || error.message,
          recovery: 'Check network connection and document size/format, then try again.'
        });
        
        throw error;
      }
    }
  }
}

export default SyntheticDataPipeline;

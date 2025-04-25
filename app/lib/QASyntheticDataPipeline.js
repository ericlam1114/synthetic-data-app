// app/lib/QASyntheticDataPipeline.js
import { OpenAI } from "openai";
import SyntheticDataPipeline from './SyntheticDataPipeline.js';
import { adaptiveChunking } from '../lib/adaptiveChunking.js';

class QASyntheticDataPipeline {
  constructor(options = {}) {
    this.openai = new OpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY,
      timeout: 30000, // 30 seconds timeout for API calls
    });

    // Model configurations - using the fine-tuned models you specified
    this.models = {
      extractor:
        options.extractorModel ||
        "ft:gpt-4o-mini-2024-07-18:personal:clause-extractor:BJoJl5pB",
      classifier:
        options.classifierModel ||
        "ft:gpt-4o-mini-2024-07-18:personal:classifier:BKXRNBJy",
      qaGenerator:
        options.qaModel || "ft:gpt-4o-mini-2024-07-18:personal:qa:BMJr4zYZ",
    };

    this.outputFormat = options.outputFormat || "jsonl";

    // Q&A specific options
    this.questionTypes = options.questionTypes || [
      "factual",
      "procedural",
      "critical-thinking",
    ];
    this.difficultyLevels = options.difficultyLevels || [
      "basic",
      "intermediate",
      "advanced",
    ];
    this.maxQuestionsPerSection = options.maxQuestionsPerSection || 5;
    this.orgStyleSample = options.orgStyleSample || null;

    // Callbacks
    this.onProgress = options.onProgress || (() => {});
    this.onError = options.onError || (() => {}); // Add onError callback support

    // Store user settings
    this.userSettings = {
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
      outputFormat: options.outputFormat || "jsonl",
      orgStyleSample: options.orgStyleSample || null,
    };

    // --- Store settings directly on 'this' ---
    this.orgContext = options.orgContext || "";
    this.formattingDirective = options.formattingDirective || "balanced";
    this.privacyMaskingEnabled = options.privacyMaskingEnabled || false;
    this.documentEntities = []; // Initialize entity storage
    // -----------------------------------------
  }

  // IMPROVED: Helper method to force memory cleanup
  _forceClearMemory() {
    try {
      if (global.gc) {
        global.gc();
      }
      
      // Allow time for GC to run
      return new Promise(resolve => setTimeout(resolve, 100));
    } catch (e) {
      console.log("Could not force garbage collection. Run with --expose-gc flag.");
    }
  }

  // Main entry point for the pipeline
  async process(text) {
    console.log(
      "Starting Q&A synthetic data pipeline for text length:",
      text.length
    );

    try {
      // Initialize stats for progress reporting
      const stats = {
        textLength: text.length,
        totalChunks: 0,
        processedChunks: 0,
        extractedSections: 0,
        classifiedSections: 0,
        generatedQAPairs: 0,
        startTime: Date.now(),
        processingTimeMs: 0,
        errors: [], // New field to track errors during processing
      };

      // IMPROVED: Reduce max text length to prevent memory issues
      const MAX_TEXT_LENGTH = 5000; // Reduced from 20000
      const truncatedText =
        text.length > MAX_TEXT_LENGTH
          ? text.substring(0, MAX_TEXT_LENGTH)
          : text;

      console.log(
        `Original text length: ${text.length}, truncated to ${truncatedText.length}`
      );

      this.onProgress?.({
        stage: "chunking",
        message: `Creating chunks from ${truncatedText.length} characters of text`,
        progress: 10,
      });

      const chunks = this._createTextChunks(truncatedText);
      
      // IMPROVED: Force garbage collection after creating chunks
      await this._forceClearMemory();

      stats.totalChunks = chunks.length;
      stats.processedChunks = 0;

      this.onProgress?.({
        stage: "chunking",
        message: `Created ${chunks.length} chunks`,
        progress: 20,
      });

      // Step 2: Extract clauses using Model 1 (same as legal pipeline)
      this.onProgress?.({
        stage: "extraction",
        message: `Extracting clauses from ${chunks.length} chunks`,
        progress: 30,
      });

      const extractedClauses = await this._extractClauses(chunks);
      
      // IMPROVED: Clear chunks from memory and force GC
      chunks.length = 0;
      await this._forceClearMemory();

      stats.extractedSections = extractedClauses.length;
      stats.processedChunks = chunks.length;

      this.onProgress?.({
        stage: "extraction",
        message: `Extracted ${extractedClauses.length} clauses`,
        progress: 45,
      });

      // Step 3: Deduplicate clauses
      this.onProgress?.({
        stage: "deduplication",
        message: `Deduplicating ${extractedClauses.length} clauses`,
        progress: 50,
      });

      const dedupedClauses = this._deduplicateClauses(extractedClauses);
      
      // IMPROVED: Clear extracted clauses and force GC
      extractedClauses.length = 0;
      await this._forceClearMemory();

      this.onProgress?.({
        stage: "deduplication",
        message: `Deduplicated to ${dedupedClauses.length} unique clauses`,
        progress: 55,
      });

      // IMPROVED: Strictly limit number of clauses to process
      // Take at most 50 clauses to prevent memory issues (reduced from 200)
      const limitedClauses = dedupedClauses.slice(0, 50);
      
      // Clear dedupedClauses from memory
      dedupedClauses.length = 0;
      await this._forceClearMemory();

      // Step 4: Classify clauses using Model 2 (same as legal pipeline)
      this.onProgress?.({
        stage: "classification",
        message: `Classifying ${limitedClauses.length} clauses`,
        progress: 60,
      });

      const classifiedClauses = await this._classifyClauses(limitedClauses);
      
      // IMPROVED: Clear limitedClauses from memory
      limitedClauses.length = 0;
      await this._forceClearMemory();

      stats.classifiedSections = classifiedClauses.length;

      this.onProgress?.({
        stage: "classification",
        message: `Classified ${classifiedClauses.length} clauses`,
        progress: 65,
      });

      // Step 5: Generate Q&A pairs using Model 3
      this.onProgress?.({
        stage: "qa_generation",
        message: `Generating Q&A pairs for ${classifiedClauses.length} clauses`,
        progress: 70,
      });

      const qaPairs = await this._generateQAPairs(classifiedClauses);
      
      // IMPROVED: Clear classifiedClauses from memory
      classifiedClauses.length = 0;
      await this._forceClearMemory();

      stats.generatedQAPairs = qaPairs.length;

      this.onProgress?.({
        stage: "qa_generation",
        message: `Generated ${qaPairs.length} Q&A pairs`,
        progress: 90,
      });

      // Step 6: Format output
      this.onProgress?.({
        stage: "formatting",
        message: `Formatting output in ${this.outputFormat} format`,
        progress: 95,
      });

      const formattedOutput = this._formatOutput(qaPairs);
      
      // IMPROVED: Clear qaPairs from memory
      qaPairs.length = 0;
      await this._forceClearMemory();

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
        qaPairs: [], // IMPROVED: Return empty array instead of full qaPairs to save memory
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
        // Log the full error for debugging non-timeout issues
        console.error("[Pipeline Process Error] Full details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
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

  // Create text chunks with natural language boundaries
  _createTextChunks(text) {
    console.log(`[Chunking QA] Starting adaptive chunking for text length: ${text.length}`);
    // Pass empty metadata {} for now, can be enhanced later
    const chunks = adaptiveChunking(text, {}); 
    console.log(`[Chunking QA] Adaptive chunking created ${chunks.length} chunks.`);
    return chunks;
  }

  // Extract clauses using Model 1 - reused from legal pipeline
  async _extractClauses(chunks) {
    const allClauses = [];

    console.log(`Attempting to extract clauses from ${chunks.length} chunks`);

    try {
      // IMPROVED: Process chunks one at a time
      const BATCH_SIZE = 1;
      
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batchChunks = chunks.slice(i, i + BATCH_SIZE);

        this.onProgress?.({
          stage: "extraction",
          message: `Processing batch ${
            Math.floor(i / BATCH_SIZE) + 1
          } of ${Math.ceil(chunks.length / BATCH_SIZE)}, with ${
            batchChunks.length
          } chunks`,
          progress: 30 + Math.floor((i / chunks.length) * 15),
        });

        // Process each chunk sequentially
        for (const chunk of batchChunks) {
          try {
            console.log(`Processing chunk, length: ${chunk.length} characters`);

            // IMPROVED: Further reduce max chunk length
            const MAX_CHUNK_LENGTH = 4000; // Reduced from 8000
            const truncatedChunk =
              chunk.length > MAX_CHUNK_LENGTH
                ? chunk.substring(0, MAX_CHUNK_LENGTH)
                : chunk;

            try {
              // Use the current OpenAI API format with the fine-tuned model
              const response = await this.openai.chat.completions.create({
                model: this.models.extractor,
                messages: [
                  {
                    role: "system",
                    content: this._buildDynamicSystemPrompt(
                      'extractor', 
                      this.documentEntities, 
                      this.orgContext || this.orgStyleSample
                    ),
                  },
                  { role: "user", content: truncatedChunk },
                ],
                // IMPROVED: Reduce max token limit
                max_tokens: 512, // Reduced from 1024
                temperature: 0.3,
              });

              if (response && response.choices && response.choices.length > 0) {
                const content = response.choices[0].message.content;

                // Parse response (assuming one clause per line)
                const clauses = content
                  .split("\n")
                  .map((line) => line.trim())
                  .filter((line) => line.length > 0 && line.length < 300) // Reduced from 500
                  .map((line) => this._ensureCompleteSentences(line));
                
                // Add clauses one by one to prevent large array creation
                for (const clause of clauses) {
                  allClauses.push(clause);
                }
              }
            } catch (apiError) {
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
          } catch (error) {
            console.error("Error extracting clauses:", error);
            
            // Send general error through callback
            this.onError?.({
              type: 'processing_error',
              stage: 'extraction',
              message: 'Error processing text chunk: ' + error.message,
              details: error.stack || error.message,
              recovery: 'The system will attempt to continue with other chunks.'
            });
          }
          
          // Force GC after processing each chunk
          await this._forceClearMemory();
        }

        // Force GC after each batch
        await this._forceClearMemory();
      }
    } catch (error) {
      console.error("Error in extraction process:", error);
    }

    return allClauses;
  }

  // Middleware: Deduplicate clauses - reused from legal pipeline
  _deduplicateClauses(clauses) {
    console.log(`Deduplicating ${clauses.length} clauses`);

    try {
      // IMPROVED: Limit the maximum number of clauses to process
      const MAX_CLAUSES = 200;
      const limitedClauses = clauses.length > MAX_CLAUSES ? 
        clauses.slice(0, MAX_CLAUSES) : clauses;
        
      console.log(`Processing ${limitedClauses.length} clauses for deduplication`);

      // Use Map for O(n) deduplication without creating massive Sets
      const uniqueClauseMap = new Map();

      // Enhanced deduplication with similarity detection
      for (const clause of limitedClauses) {
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

      // IMPROVED: Limit the number of unique clauses further if needed
      const MAX_UNIQUE_CLAUSES = 100;
      const limitedUniqueClauses = uniqueClauses.length > MAX_UNIQUE_CLAUSES ?
        uniqueClauses.slice(0, MAX_UNIQUE_CLAUSES) : uniqueClauses;

      console.log(
        `Deduplication complete: ${limitedClauses.length} clauses → ${limitedUniqueClauses.length} unique clauses`
      );
      
      return limitedUniqueClauses;
    } catch (error) {
      console.error("Error in deduplication process:", error);
      // In case of error, return original array with basic deduplication but limited size
      const MAX_FALLBACK_CLAUSES = 50;
      const simpleDeduped = [...new Set(clauses.slice(0, MAX_FALLBACK_CLAUSES))];
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

  // Classify clauses using Model 2 - reused from legal pipeline
  async _classifyClauses(clauses) {
    const classifiedClauses = [];

    console.log(`Attempting to classify ${clauses.length} clauses`);

    try {
      // IMPROVED: Process clauses in smaller batches with less concurrency
      const BATCH_SIZE = 5; // Reduced from 20
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

        // IMPROVED: Process one clause at a time to reduce memory pressure
        for (const clause of batchClauses) {
          try {
            console.log(`Classifying clause: "${clause.substring(0, 30)}..."`);

            // IMPROVED: Further reduce max clause length
            const MAX_CLAUSE_LENGTH = 300; // Reduced from 500
            const truncatedClause =
              clause.length > MAX_CLAUSE_LENGTH
                ? clause.substring(0, MAX_CLAUSE_LENGTH)
                : clause;

            const response = await this.openai.chat.completions.create({
              model: this.models.classifier,
              messages: [
                {
                  role: "system",
                  content: this._buildDynamicSystemPrompt(
                    'classifier',
                    this.documentEntities,
                    this.orgContext || this.orgStyleSample
                  ),
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

              classifiedClauses.push({
                text: clause,
                classification,
              });
            }
          } catch (error) {
            console.error("Error classifying clause:", error);
            
            // Default classification if there's an error
            classifiedClauses.push({
              text: clause,
              classification: "Standard",
            });
          }
          
          // IMPROVED: Force GC after each clause to keep memory usage low
          await this._forceClearMemory();
        }

        // IMPROVED: Force GC after batch
        await this._forceClearMemory();
      }
    } catch (error) {
      console.error("Error in classification process:", error);
    }

    console.log(`Classified ${classifiedClauses.length} clauses successfully`);
    return classifiedClauses;
  }

  // Generate Q&A pairs from clauses using Model 3
  async _generateQAPairs(classifiedClauses) {
    const qaPairs = [];

    console.log(`Generating Q&A pairs for ${classifiedClauses.length} clauses`);

    try {
      // IMPROVED: Process clauses individually
      for (let i = 0; i < classifiedClauses.length; i++) {
        const clauseObj = classifiedClauses[i];

        this.onProgress?.({
          stage: "qa_generation",
          message: `Processing Q&A for clause ${i + 1} of ${classifiedClauses.length}`,
          progress: 70 + Math.floor((i / classifiedClauses.length) * 20),
        });

        try {
          const { text, classification } = clauseObj;
          console.log(
            `Generating Q&A for clause: "${text.substring(0, 30)}..."`
          );

          // IMPROVED: Further reduce max text length
          const MAX_TEXT_LENGTH = 400; // Reduced from 800
          const truncatedText =
            text.length > MAX_TEXT_LENGTH
              ? text.substring(0, MAX_TEXT_LENGTH)
              : text;

          // Find question types to generate based on user settings
          const allowedQuestionTypes = this.questionTypes.join(", ");
          const allowedDifficulties = this.difficultyLevels.join(", ");

          const response = await this.openai.chat.completions.create({
            model: this.models.qaGenerator,
            messages: [
              {
                role: "system",
                content: this._buildDynamicSystemPrompt(
                  'qa_generator',
                  this.documentEntities,
                  this.orgContext || this.orgStyleSample
                ),
              },
              { role: "user", content: truncatedText },
            ],
            temperature: 0.7,
            max_tokens: 512, // IMPROVED: Reduced from 1024
          });

          if (response && response.choices && response.choices.length > 0) {
            const content = response.choices[0].message.content.trim();

            // Extract Q&A from the response
            // Format is expected to be:
            // Q: Question text
            // A: Answer text

            let question = "";
            let answer = "";

            // Parse the Q&A format
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();

              if (line.startsWith("Q:")) {
                question = line.substring(2).trim();
              } else if (line.startsWith("A:")) {
                answer = line.substring(2).trim();

                // For multiline answers, keep appending lines until we hit another question or end
                let j = i + 1;
                while (
                  j < lines.length &&
                  !lines[j].trim().startsWith("Q:")
                ) {
                  answer += " " + lines[j].trim();
                  j++;
                }

                // Add this Q&A pair
                if (question && answer) {
                  const qaPair = {
                    question,
                    answer,
                    questionType: this._determineQuestionType(
                      question,
                      this.questionTypes[0]
                    ),
                    difficultyLevel: this._determineDifficultyLevel(
                      question,
                      answer,
                      this.difficultyLevels[0]
                    ),
                    sectionTitle: `Section ${i + 1}`,
                    classification,
                    sourceText: text,
                  };

                  qaPairs.push(qaPair);

                  // Reset for next pair
                  question = "";
                  answer = "";
                }

                // Move the index forward if we consumed additional lines
                i = j - 1;
              }
            }
          }
        } catch (apiError) {
          // Check if it's a timeout error
          const isTimeout = apiError.message?.includes('timeout') || 
                           apiError.code === 'ETIMEDOUT' || 
                           apiError.code === 'ESOCKETTIMEDOUT' ||
                           apiError.type === 'request_timeout';
          
          if (isTimeout) {
            console.error("OpenAI API timeout during Q&A generation:", apiError);
            
            // Send timeout error through callback
            this.onError?.({
              type: 'timeout',
              stage: 'qa_generation',
              message: 'AI model timeout during Q&A generation. The system will continue with other sections.',
              details: apiError.message,
              recovery: 'This section will not have generated Q&A pairs. Consider simplifying text.'
            });
            
            // Show timeout in progress updates for this specific clause
            this.onProgress?.({
              stage: "qa_generation",
              message: `⏱️ Timeout generating Q&A pairs for section: "${text.substring(0, 30)}..."`,
              progress: 75 + Math.floor((i / classifiedClauses.length) * 15),
            });
          } else {
            // Handle other API errors
            console.error("OpenAI API error during Q&A generation:", apiError);
            
            // Send general API error through callback
            this.onError?.({
              type: 'api_error',
              stage: 'qa_generation',
              message: 'Error connecting to AI service during Q&A generation: ' + (apiError.message || 'Unknown error'),
              details: apiError.message,
              recovery: 'Processing will continue with other sections.'
            });
          }
          
          // Return empty result for this clause
          return {
            section: text,
            classification,
            qaPairs: [],
          };
        }
        
        // IMPROVED: Force GC after each clause
        await this._forceClearMemory();
      }
    } catch (error) {
      console.error("Error in Q&A generation process:", error);
      
      // Send general error through callback
      this.onError?.({
        type: 'processing_error',
        stage: 'qa_generation',
        message: 'Error in Q&A generation process: ' + error.message,
        details: error.stack || error.message,
        recovery: 'Check network connection and document size/format, then try again.'
      });
    }

    console.log(`Generated ${qaPairs.length} Q&A pairs`);
    return qaPairs;
  }

  // Helper to determine question type based on content
  _determineQuestionType(question, defaultType) {
    question = question.toLowerCase();

    // Check for factual questions (who, what, when, where)
    if (
      question.match(
        /what is|who is|when did|where is|how many|how much|define/
      )
    ) {
      return "factual";
    }

    // Check for procedural questions (how to, steps)
    if (
      question.match(
        /how to|how do|what steps|process|procedure|steps to|method/
      )
    ) {
      return "procedural";
    }

    // Check for critical thinking questions (why, evaluate, assess)
    if (
      question.match(
        /why|evaluate|assess|analyze|compare|contrast|explain|justify/
      )
    ) {
      return "critical-thinking";
    }

    return defaultType;
  }

  // Helper to determine difficulty level based on content
  _determineDifficultyLevel(question, answer, defaultLevel) {
    // Use question and answer length as one indicator
    const totalLength = question.length + answer.length;

    if (totalLength > 400) {
      return "advanced";
    } else if (totalLength > 200) {
      return "intermediate";
    }

    // Use complexity of language as another indicator
    const complexWords =
      /analyze|evaluate|synthesize|critique|integrate|formulate|hypothesize|differentiate|prioritize/;

    if (
      complexWords.test(question.toLowerCase()) ||
      complexWords.test(answer.toLowerCase())
    ) {
      return "advanced";
    }

    return defaultLevel;
  }

  // Format the output according to the specified format
  _formatOutput(variants) {
    console.log(`Formatting ${variants.length} variant objects for output`);

    // If no variants, return empty string
    if (!variants || variants.length === 0) {
      return "";
    }

    try {
      // IMPROVED: Limit the number of variants to process to prevent memory issues
      const MAX_VARIANTS = 100;
      const limitedVariants = variants.length > MAX_VARIANTS ? variants.slice(0, MAX_VARIANTS) : variants;
      
      console.log(`Processing ${limitedVariants.length} variants for output formatting`);

      // Process variants in smaller batches
      const BATCH_SIZE = 20;
      let formattedOutput = "";
      
      // Format based on output format setting
      switch (this.outputFormat.toLowerCase()) {
        case "jsonl":
          // IMPROVED: Process in batches to reduce memory pressure
          for (let i = 0; i < limitedVariants.length; i += BATCH_SIZE) {
            const batch = limitedVariants.slice(i, Math.min(i + BATCH_SIZE, limitedVariants.length));
            
            // Process each variant in the batch
            for (const pair of batch) {
              let maskedQuestion = pair.question;
              let maskedAnswer = pair.answer;
              if (this.privacyMaskingEnabled) {
                maskedQuestion = this._applyPrivacyMasking(pair.question);
                maskedAnswer = this._applyPrivacyMasking(pair.answer);
              }
              const maskedPair = { ...pair, question: maskedQuestion, answer: maskedAnswer };
              formattedOutput += JSON.stringify(maskedPair) + "\n";
            }
            
            // Force GC after each batch
            this._forceClearMemory();
          }
          return formattedOutput;

        case "json":
          // IMPROVED: Process in batches, building array manually
          formattedOutput = "[";
          for (let i = 0; i < limitedVariants.length; i += BATCH_SIZE) {
            const batch = limitedVariants.slice(i, Math.min(i + BATCH_SIZE, limitedVariants.length));
            
            // Process each variant in the batch
            for (let j = 0; j < batch.length; j++) {
              let maskedQuestion = batch[j].question;
              let maskedAnswer = batch[j].answer;
              if (this.privacyMaskingEnabled) {
                maskedQuestion = this._applyPrivacyMasking(batch[j].question);
                maskedAnswer = this._applyPrivacyMasking(batch[j].answer);
              }
              const maskedPair = { ...batch[j], question: maskedQuestion, answer: maskedAnswer };
              formattedOutput += (i > 0 || j > 0 ? "," : "") + JSON.stringify(maskedPair);
            }
            
            // Force GC after each batch
            this._forceClearMemory();
          }
          formattedOutput += "]";
          return formattedOutput;

        case "openai-jsonl":
          console.log("[Formatting] Using OpenAI-JSONL format.");
          // Format for OpenAI fine-tuning - fixed to create proper JSONL format
          const trainingExamples = [];
          let loggedFirstPrompt = false; // Flag to log only once

          // Process each variant
          for (let i = 0; i < limitedVariants.length; i += BATCH_SIZE) {
            const batch = limitedVariants.slice(i, Math.min(i + BATCH_SIZE, limitedVariants.length));
            
            for (const pair of batch) {
              // Define the simpler system prompt for the fine-tuning data
              let systemPromptContent = "You are a helpful AI assistant answering questions based on provided document sections.";
              if (this.orgContext && this.orgContext.trim() !== "") {
                systemPromptContent += `\nContext: This information pertains to ${this.orgContext}.`;
              }
              
              // Apply masking if enabled
              let maskedQuestion = pair.question;
              let maskedAnswer = pair.answer;
              if (this.privacyMaskingEnabled) {
                maskedQuestion = this._applyPrivacyMasking(pair.question);
                maskedAnswer = this._applyPrivacyMasking(pair.answer);
              }
              
              const example = {
                messages: [
                  {
                    role: "system",
                    content: systemPromptContent, // Use the simpler, inference-focused prompt
                  },
                  { role: "user", content: maskedQuestion }, // Use potentially masked question
                  { role: "assistant", content: maskedAnswer }, // Use potentially masked answer
                ],
              };
              // --- Debugging: Log the system prompt being added ---
              if (i === 0 && !loggedFirstPrompt) { // Log only for the first pair overall
                 console.log(`[_formatOutput/openai-jsonl] Using system prompt: "${systemPromptContent}"`);
                 loggedFirstPrompt = true; // Set flag so we don't log again
              }
              // -----------------------------------------------------
              trainingExamples.push(example);
            }
            
            // Force GC after each batch
            this._forceClearMemory();
          }
          // --- START FIX --- 
          // Remove the line causing the error:
          // outputString = trainingExamples.map(JSON.stringify).join("\n"); 
          
          // Replace with direct return:
          const finalJsonl = trainingExamples.map(JSON.stringify).join("\n");
          console.log(`[Formatting] Created ${trainingExamples.length} OpenAI training examples.`);
          console.log(`[Formatting] Final formatted output string length (within case): ${finalJsonl.length}`);
          return finalJsonl;
          // --- END FIX --- 
          // Remove the break statement as it's unreachable after return
          // break; 

        case "csv":
          // CSV format - process in batches
          const header = "question,answer,questionType,difficultyLevel,sectionTitle,classification";
          formattedOutput = header + "\n";
          
          for (let i = 0; i < limitedVariants.length; i += BATCH_SIZE) {
            const batch = limitedVariants.slice(i, Math.min(i + BATCH_SIZE, limitedVariants.length));
            
            for (const pair of batch) {
              let maskedQuestion = pair.question;
              let maskedAnswer = pair.answer;
              if (this.privacyMaskingEnabled) {
                maskedQuestion = this._applyPrivacyMasking(pair.question);
                maskedAnswer = this._applyPrivacyMasking(pair.answer);
              }

              // Escape quotes for CSV
              const escapedQuestion = maskedQuestion.replace(/"/g, '""');
              const escapedAnswer = maskedAnswer.replace(/"/g, '""');
              const escapedSection = pair.sectionTitle.replace(/"/g, '""');

              formattedOutput += `"${escapedQuestion}","${escapedAnswer}","${pair.questionType}","${pair.difficultyLevel}","${escapedSection}","${pair.classification}"\n`;
            }
            
            // Force GC after each batch
            this._forceClearMemory();
          }
          return formattedOutput;

        default:
          // Default to JSON but with batch processing
          // Re-call formatOutput specifically for JSON, applying masking if needed
          let jsonString = "[";
          for (let i = 0; i < limitedVariants.length; i++) {
            let maskedQuestion = limitedVariants[i].question;
            let maskedAnswer = limitedVariants[i].answer;
            if (this.privacyMaskingEnabled) {
              maskedQuestion = this._applyPrivacyMasking(limitedVariants[i].question);
              maskedAnswer = this._applyPrivacyMasking(limitedVariants[i].answer);
            }
            const maskedPair = { ...limitedVariants[i], question: maskedQuestion, answer: maskedAnswer };
            jsonString += (i > 0 ? "," : "") + JSON.stringify(maskedPair);
          }
          jsonString += "]";
          return jsonString;
      }
    } catch (error) {
      console.error("Error formatting output:", error);
      // Return basic string as fallback to avoid memory issues
      return `Error formatting output: ${variants.length} variants`;
    } finally {
      // IMPROVED: Final GC cleanup
      this._forceClearMemory();
    }
  }

  // New preprocessing function to extract key entities
  async _extractKeyEntities(text) {
    const textForExtraction = text.substring(0, 8000);
    console.log(`[Entities QA] Extracting entities from text sample (length: ${textForExtraction.length})`);
    if (textForExtraction.length < 100) {
       console.log("[Entities QA] Text too short, skipping entity extraction.");
       return [];
    }
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Extract key named entities (company names, product names, specific legal terms, person names, locations) from the text. Format as a JSON object containing a single key 'entities' which is an array of objects, each with 'entity' (the extracted name) and 'type' (e.g., 'COMPANY', 'PRODUCT', 'PERSON', 'LOCATION', 'LEGAL_TERM') fields."
          },
          {
            role: "user",
            content: textForExtraction
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });
      const result = JSON.parse(response.choices[0].message.content);
      const entities = result.entities || [];
      console.log(`[Entities QA] Extracted ${entities.length} entities.`);
      if(entities.length > 0) {
         console.log("[Entities QA] Sample: ", entities.slice(0, 3));
      }
      return entities;
    } catch (error) {
      console.error("[Entities QA] Error extracting key entities:", error);
      this.onError?.({
        type: 'entity_extraction_error',
        stage: 'preprocessing',
        message: 'Could not extract key entities from the document.',
        details: error.message,
        recovery: 'Processing will continue without entity preservation instructions.'
      });
      return [];
    }
  }

  // New method to build system prompts dynamically
  _buildDynamicSystemPrompt(purpose, entities = [], orgStyleSample = null) {
    let basePrompt = "";
    let directive = "";

    // Base prompt based on purpose
    switch (purpose) {
      case 'extractor':
        basePrompt = "You are an assistant that extracts key clauses or sections relevant for Q&A generation from documents."; // Adjusted for QA context
        break;
      case 'classifier':
        basePrompt = "You are a document importance classifier analyzing text sections to identify importance for Q&A generation. Classify each section as 'Critical', 'Important', or 'Standard'."; // Adjusted for QA context
        break;
      case 'qa_generator': // Specific for QA model
        basePrompt = "You are an assistant trained to generate Question & Answer pairs from procedural or informational documents. Focus on clarity and accuracy based *only* on the provided text section.";
        break;
      default:
        basePrompt = "You are a helpful AI assistant.";
    }

    // Formatting directive - Less relevant for QA, but keep for consistency
    switch (this.formattingDirective) {
      case "concise":
        directive = "Generate concise questions and answers.";
        break;
      case "expanded":
        directive = "Generate detailed and comprehensive questions and answers.";
        break;
      // Other directives might not apply well to Q&A generation
      default: // balanced
        directive = "Generate clear and reasonably detailed questions and answers.";
    }
    
    let finalPrompt = `${basePrompt} ${directive}`;

    // Add entity preservation instructions if entities exist
    if (entities && entities.length > 0) {
      finalPrompt += "\n\nIMPORTANT: Preserve the following named entities exactly as they appear in your output (do not rephrase or replace them):"
      const entitiesToShow = entities.slice(0, 15);
      entitiesToShow.forEach(entity => {
        finalPrompt += `\n- ${entity.entity} (${entity.type})`;
      });
      if (entities.length > 15) {
         finalPrompt += "\n- ... and other key entities identified in the text."
      }
    }

    // Add Organization/Usage Context if provided
    if (this.orgContext && this.orgContext.trim() !== "") {
      finalPrompt += `\n\nConsider this context about the organization or usage: ${this.orgContext}`;
    }
    // Fallback to orgStyleSample if context is empty but sample exists
    else if (orgStyleSample) { 
       finalPrompt += `\n\nEmulate this organizational writing style sample: ${orgStyleSample}`;
    } 
    
    // Add QA specific instructions if needed (can be enhanced)
    if (purpose === 'qa_generator') {
       finalPrompt += `\nGenerate questions covering these types: ${this.questionTypes.join(', ')}. Aim for difficulty levels: ${this.difficultyLevels.join(', ')}. Limit to ${this.maxQuestionsPerSection} Q&A pairs per text section. Format output strictly as:
Q: [Question Text]
A: [Answer Text]`;
    }

    return finalPrompt.trim();
  }

  // Privacy Masking Helper
  _applyPrivacyMasking(text) {
    if (!text) return "";
    console.log(`[Masking QA] Input: "${text.substring(0, 100)}..."`); 
    let maskedText = text;
    let originalMaskedText;
    // Email Addresses
    originalMaskedText = maskedText;
    maskedText = maskedText.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
    if (maskedText !== originalMaskedText) console.log(`[Masking QA] After Email Mask: "${maskedText.substring(0, 100)}..."`);
    // Phone Numbers
    originalMaskedText = maskedText;
    maskedText = maskedText.replace(/(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}|\+\d{1,3}[-\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, '[PHONE]');
    if (maskedText !== originalMaskedText) console.log(`[Masking QA] After Phone Mask: "${maskedText.substring(0, 100)}..."`);
    // Simple Name Heuristic (Titles)
    originalMaskedText = maskedText;
    maskedText = maskedText.replace(/(?:Mr\.|Mrs\.|Ms\.|Dr\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, (match, p1) => match.replace(p1, '[NAME]'));
    if (maskedText !== originalMaskedText) console.log(`[Masking QA] After Name (Title) Mask: "${maskedText.substring(0, 100)}..."`);
    // Simple Currency/Amount
    originalMaskedText = maskedText;
    maskedText = maskedText.replace(/(?:\$|€|£)\s?\d{1,3}(?:[,.]\d{3})*(?:[.,]\d{1,2})?/g, '[AMOUNT]');
    if (maskedText !== originalMaskedText) console.log(`[Masking QA] After Amount Mask: "${maskedText.substring(0, 100)}..."`);
    console.log(`[Masking QA] Final Output: "${maskedText.substring(0, 100)}..."`);
    return maskedText;
  }
}

export default QASyntheticDataPipeline;

// app/lib/QASyntheticDataPipeline.js
import { OpenAI } from "openai";

class QASyntheticDataPipeline {
  constructor(options = {}) {
    this.openai = new OpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY,
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

    // Processing options
    this.chunkSize = options.chunkSize || 1000;
    this.chunkOverlap = options.chunkOverlap || 100;
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

    // Callbacks
    this.onProgress = options.onProgress || (() => {});

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
    };
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
      };

      // Step 1: Create text chunks with memory safety
      const MAX_TEXT_LENGTH = 50000; // Limit total text size
      const truncatedText =
        text.length > MAX_TEXT_LENGTH
          ? text.substring(0, MAX_TEXT_LENGTH)
          : text;

      this.onProgress?.({
        stage: "chunking",
        message: `Creating chunks from ${truncatedText.length} characters of text`,
        progress: 10,
      });

      const chunks = this._createTextChunks(truncatedText);

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

      this.onProgress?.({
        stage: "deduplication",
        message: `Deduplicated to ${dedupedClauses.length} unique clauses`,
        progress: 55,
      });

      // Step 4: Classify clauses using Model 2 (same as legal pipeline)
      this.onProgress?.({
        stage: "classification",
        message: `Classifying ${Math.min(dedupedClauses.length, 200)} clauses`,
        progress: 60,
      });

      const classifiedClauses = await this._classifyClauses(
        dedupedClauses.slice(0, 200)
      );

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
        qaPairs: qaPairs,
        format: this.outputFormat,
      };
    } catch (error) {
      console.error("Pipeline processing error:", error);
      throw error;
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
    const {
      minLength = 50, // Minimum chunk size in characters
      maxLength = this.chunkSize, // Maximum chunk size in characters
      overlap = this.chunkOverlap, // Overlap between chunks
    } = {};

    // Define stronger sentence boundary patterns
    const sentenceEndPatterns = [
      /[.!?]\s+[A-Z]/g, // Period, exclamation, question mark followed by space and capital letter
      /\n\s*\n/g, // Double line breaks (paragraphs)
    ];

    let chunks = [];

    // If text is short enough, return as single chunk
    if (text.length <= maxLength) {
      return [text];
    }

    let startPos = 0;

    while (startPos < text.length) {
      // Determine end position (either maxLength or end of text)
      let endPos = Math.min(startPos + maxLength, text.length);

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
      }

      // Move start position for next chunk, ensuring overlap
      startPos = Math.max(0, endPos - overlap);

      // Handle case where we can't find good boundaries to progress
      if (startPos >= endPos - 1) {
        startPos = endPos; // Force progress to avoid infinite loop
      }
    }

    return chunks;
  }

  // Extract clauses using Model 1 - reused from legal pipeline
  async _extractClauses(chunks) {
    const allClauses = [];

    console.log(`Attempting to extract clauses from ${chunks.length} chunks`);

    try {
      // Process chunks in smaller batches to prevent memory issues
      const BATCH_SIZE = 5;
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

        // Process each chunk in the batch
        const batchPromises = batchChunks.map(async (chunk) => {
          try {
            console.log(`Processing chunk, length: ${chunk.length} characters`);

            // Limit chunk size to prevent memory issues
            const MAX_CHUNK_LENGTH = 8000;
            const truncatedChunk =
              chunk.length > MAX_CHUNK_LENGTH
                ? chunk.substring(0, MAX_CHUNK_LENGTH)
                : chunk;

            // Use the current OpenAI API format with the fine-tuned model
            const response = await this.openai.chat.completions.create({
              model: this.models.extractor,
              messages: [
                {
                  role: "system",
                  content:
                    "You are a data extractor that identifies and formats exact clauses from documents without rewriting them. Always return complete sentences or paragraphs, never partial or truncated sentences.",
                },
                { role: "user", content: truncatedChunk },
              ],
              // Set a max token limit to prevent too large responses
              max_tokens: 1024,
              temperature: 0.3,
            });

            if (response && response.choices && response.choices.length > 0) {
              const content = response.choices[0].message.content;

              // Parse response (assuming one clause per line)
              return content
              .split("\n")
              .map((line) => line.trim())
              .filter((line) => line.length > 0 && line.length < 500) // Prevent huge clauses
              .map(line => this._ensureCompleteSentences(line)); // Ensure complete sentences
            }
            return [];
          } catch (error) {
            console.error("Error extracting clauses:", error);
            return [];
          }
        });

        // Wait for all chunks in this batch to be processed before moving to next batch
        const batchResults = await Promise.all(batchPromises);

        // Safely add results to allClauses without creating massive arrays
        for (const clauseArray of batchResults) {
          if (Array.isArray(clauseArray)) {
            // Add clauses one by one instead of spreading the array
            for (let j = 0; j < clauseArray.length; j++) {
              allClauses.push(clauseArray[j]);
            }
          }
        }

        // Give garbage collector a chance to run
        await new Promise((resolve) => setTimeout(resolve, 100));
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

  // Classify clauses using Model 2 - reused from legal pipeline
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

            // Default classification if response can't be parsed
            return {
              text: clause,
              classification: "Standard",
            };
          } catch (error) {
            console.error("Error classifying clause:", error);

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
        await new Promise((resolve) => setTimeout(resolve, 100));
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
      // Process clauses in batches
      const BATCH_SIZE = 10;
      for (let i = 0; i < classifiedClauses.length; i += BATCH_SIZE) {
        const batchClauses = classifiedClauses.slice(i, i + BATCH_SIZE);

        this.onProgress?.({
          stage: "qa_generation",
          message: `Processing Q&A batch ${
            Math.floor(i / BATCH_SIZE) + 1
          } of ${Math.ceil(classifiedClauses.length / BATCH_SIZE)}, with ${
            batchClauses.length
          } clauses`,
          progress: 70 + Math.floor((i / classifiedClauses.length) * 20),
        });

        // Process each clause in the batch with concurrency limits
        const batchPromises = batchClauses.map(async (clauseObj) => {
          try {
            const { text, classification } = clauseObj;
            console.log(
              `Generating Q&A for clause: "${text.substring(0, 30)}..."`
            );

            // Limit text size to prevent memory issues
            const MAX_TEXT_LENGTH = 800;
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
                  content:
                    "You are an assistant trained to generate Q&A pairs from legal and business documents. You will receive a clause and return a single Q&A pair formatted as plain text.",
                },
                { role: "user", content: truncatedText },
              ],
              temperature: 0.7,
              max_tokens: 1024,
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
          } catch (error) {
            console.error("Error generating Q&A pairs:", error);
          }
        });

        // Use concurrency limits for processing
        const CONCURRENCY_LIMIT = 3;

        for (let j = 0; j < batchPromises.length; j += CONCURRENCY_LIMIT) {
          const concurrentBatch = batchPromises.slice(j, j + CONCURRENCY_LIMIT);
          await Promise.all(concurrentBatch);

          // Allow garbage collection between concurrent batches
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        // Give garbage collector a chance to run
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error("Error generating Q&A pairs:", error);
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
      // First, ensure all variants have complete sentences
      const processedVariants = variants.map(variant => {
        // Process the original text to ensure it's a complete sentence
        const processedOriginal = this._ensureCompleteSentences(variant.original);
        
        // Process each variant to ensure they are complete sentences
        let processedVariantTexts = [];
        if (variant.variants && Array.isArray(variant.variants)) {
          processedVariantTexts = variant.variants.map(v => this._ensureCompleteSentences(v));
        }
        
        // Return the processed variant object
        return {
          ...variant,
          original: processedOriginal,
          variants: processedVariantTexts
        };
      });
      
      // Format based on output format setting - USE processedVariants BELOW INSTEAD OF variants
      switch (this.outputFormat.toLowerCase()) {
        case "jsonl":
          // Each line is a JSON object
          return processedVariants.map((pair) => JSON.stringify(pair)).join("\n");

        case "json":
          // Single JSON array
          return JSON.stringify(processedVariants, null, 2);

        case "openai-jsonl":
          // Format for OpenAI fine-tuning
          const trainingExamples = processedVariants.map((pair) => ({
            messages: [
              {
                role: "system",
                content:
                  "You are an assistant trained to answer questions about standard operating procedures and legal documents accurately and concisely.",
              },
              { role: "user", content: pair.question },
              { role: "assistant", content: pair.answer },
            ],
          }));

          // Convert to JSONL format
          return trainingExamples.map(JSON.stringify).join("\n");

        case "csv":
          // CSV format
          const header =
            "question,answer,questionType,difficultyLevel,sectionTitle,classification";
            const rows = processedVariants.map(
            (pair) =>
              `"${pair.question.replace(/"/g, '""')}","${pair.answer.replace(
                /"/g,
                '""'
              )}","${pair.questionType}","${
                pair.difficultyLevel
              }","${pair.sectionTitle.replace(/"/g, '""')}","${
                pair.classification
              }"`
          );

          return [header, ...rows].join("\n");

        default:
          // Default to pretty JSON
          return JSON.stringify(processedVariants, null, 2);
      }
    } catch (error) {
      console.error("Error formatting output:", error);
      // Return basic JSON as fallback
      return JSON.stringify(processedVariants);
    }
  }
}

export default QASyntheticDataPipeline;

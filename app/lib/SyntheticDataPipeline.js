// File: lib/SyntheticDataPipeline.js
// Enhanced version with middleware for deduplication and filtering

import { OpenAI } from "openai";

class SyntheticDataPipeline {
  constructor(options = {}) {
    this.openai = new OpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY,
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
        "ft:gpt-4o-mini-2024-07-18:personal:clause-duplicator:BK81g7rc",
    };

    // Processing options
    this.chunkSize = options.chunkSize || 1000;
    this.chunkOverlap = options.chunkOverlap || 100;
    this.classFilter = options.classFilter || "all";
    this.outputFormat = options.outputFormat || "jsonl";
    this.prioritizeImportant = options.prioritizeImportant || false;

    // Callbacks
    this.onProgress = options.onProgress || (() => {});

    // Store filter settings from user
    this.userSettings = {
      classFilter: options.classFilter || "all",
      prioritizeImportant:
        options.prioritizeImportant !== undefined
          ? options.prioritizeImportant
          : true,
    };
  }

  // Main entry point for the pipeline
  async process(text) {
    console.log(
      "Starting synthetic data pipeline for text length:",
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

      // Step 2: Extract clauses using Model 1
      this.onProgress?.({
        stage: "extraction",
        message: `Extracting clauses from ${chunks.length} chunks`,
        progress: 30,
      });

      const extractedClauses = await this._extractClauses(chunks);

      stats.extractedClauses = extractedClauses.length;
      stats.processedChunks = chunks.length;

      this.onProgress?.({
        stage: "extraction",
        message: `Extracted ${extractedClauses.length} clauses`,
        progress: 45,
      });

      // NEW: Middleware 1 - Deduplicate clauses
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

      // Step 3: Classify clauses using Model 2
      this.onProgress?.({
        stage: "classification",
        message: `Classifying ${Math.min(dedupedClauses.length, 200)} clauses`,
        progress: 60,
      });

      const classifiedClauses = await this._classifyClauses(
        dedupedClauses.slice(0, 200)
      );

      stats.classifiedClauses = classifiedClauses.length;

      this.onProgress?.({
        stage: "classification",
        message: `Classified ${classifiedClauses.length} clauses`,
        progress: 70,
      });

      // NEW: Middleware 2 - Filter clauses based on user settings
      this.onProgress?.({
        stage: "filtering",
        message: `Filtering ${classifiedClauses.length} clauses based on user settings`,
        progress: 75,
      });

      const filteredClauses =
        this._filterClausesByUserSettings(classifiedClauses);

      this.onProgress?.({
        stage: "filtering",
        message: `Filtered to ${filteredClauses.length} clauses matching criteria`,
        progress: 80,
      });

      // Step 5: Generate synthetic variants using Model 3
      this.onProgress?.({
        stage: "generation",
        message: `Generating variants for ${filteredClauses.length} clauses`,
        progress: 85,
      });

      const generatedVariants = await this._generateVariants(filteredClauses);

      stats.generatedVariants = generatedVariants.reduce(
        (sum, item) => sum + (item.variants?.length || 0),
        0
      );

      this.onProgress?.({
        stage: "generation",
        message: `Generated variants for ${generatedVariants.length} clauses`,
        progress: 90,
      });

      // NEW: Quality filtering of variants
      this.onProgress?.({
        stage: "quality_filtering",
        message: `Assessing quality of generated variants`,
        progress: 92,
      });

      const qualityFilteredVariants = await this._filterVariantsBySimilarity(generatedVariants);

      stats.generatedVariants = qualityFilteredVariants.reduce(
        (sum, item) => sum + (item.variants?.length || 0),
        0
      );

      // Step 6: Format output
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
        clauses: qualityFilteredVariants,
        format: this.outputFormat,
      };
    } catch (error) {
      console.error("Pipeline processing error:", error);
      throw error;
    }
  }

  // Create text chunks with natural language boundaries
  _createTextChunks(text) {
    const {
      minLength = 50, // Minimum chunk size in characters
      maxLength = this.chunkSize, // Maximum chunk size in characters
      overlap = this.chunkOverlap, // Overlap between chunks
    } = {};

    // Use natural language boundaries for chunking
    const sentenceBreaks = [".", "!", "?", "\n\n"];
    const clauseBreaks = [";", ":", "\n", ". "];

    let chunks = [];
    let currentChunk = "";
    let lastBreakPos = 0;

    // Process text character by character
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      currentChunk += char;

      // Check if we've hit a natural break point
      const isSentenceBreak =
        sentenceBreaks.includes(char) &&
        i + 1 < text.length &&
        text[i + 1] === " ";
      const isClauseBreak = clauseBreaks.includes(char);
      const isBreakPoint =
        isSentenceBreak || (isClauseBreak && currentChunk.length > minLength);

      if (isBreakPoint) {
        lastBreakPos = i;
      }

      // Check if we've hit max length and have a break point
      if (currentChunk.length >= maxLength && lastBreakPos > 0) {
        // Cut at the last break point
        const breakPos = lastBreakPos - (currentChunk.length - i - 1);
        const chunk = currentChunk.substring(0, breakPos + 1).trim();

        if (chunk.length >= minLength) {
          chunks.push(chunk);
        }

        // Start a new chunk with overlap
        const overlapStart = Math.max(0, breakPos - overlap);
        currentChunk = currentChunk.substring(overlapStart);
        lastBreakPos = 0;
      }
    }

    // Add the final chunk if it's not empty
    if (currentChunk.trim().length >= minLength) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  // Extract clauses using Model 1
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

            // Use the current OpenAI API format
            const response = await this.openai.chat.completions.create({
              model: this.models.extractor,
              messages: [
                {
                  role: "system",
                  content:
                    "You are a data extractor that identifies and formats exact clauses from documents without rewriting them.",
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
                .filter((line) => line.length > 0 && line.length < 500); // Prevent huge clauses
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
  
            const response = await this.openai.chat.completions.create({
              model: this.models.duplicator,
              messages: [
                {
                  role: "system",
                  content:
                    "You are a clause rewriter that duplicates organizational language and formatting with high fidelity.",
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
              const variants = content
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line.length > 0 && line.length < 1000);
  
              return {
                original: text,
                classification,
                variants: variants.slice(0, 3), // Ensure max 3 variants
              };
            }
  
            return {
              original: text,
              classification,
              variants: [],
            };
          } catch (error) {
            console.error("Error generating variants:", error);
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
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
  
        // Add batch results to overall results
        for (const result of results) {
          if (result && result.original) {
            variantResults.push(result);
          }
        }
  
        // Give garbage collector a chance to run
        await new Promise((resolve) => setTimeout(resolve, 100));
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
                legal_score: 0
              }
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
                  - reason: short explanation`
                },
                {
                  role: "user",
                  content: `Original clause: "${original}"
                  
                  Variants to assess:
                  ${variants.map((v, idx) => `${idx+1}. ${v}`).join('\n\n')}`
                }
              ],
              temperature: 0.1,
              response_format: { type: "json_object" }
            });
            
            // Parse the evaluation results
            const evaluationResults = JSON.parse(response.choices[0].message.content);
            
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
              const avgSimilarity = similarityScores.length > 0 
                ? similarityScores.reduce((a, b) => a + b, 0) / similarityScores.length
                : 0;
                
              const avgLegalScore = legalScores.length > 0
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
                  total_variants: filteredVariants.length
                }
              };
            }
          } catch (error) {
            console.error(`Error evaluating variants for clause: ${original.substring(0, 30)}...`, error);
            
            // Fallback: Use a simple heuristic approach if API call fails
            // Calculate word-level similarity as a rough approximation
            for (const variant of variants) {
              // Simple fallback similarity check
              const originalWords = new Set(original.toLowerCase().split(/\s+/));
              const variantWords = new Set(variant.toLowerCase().split(/\s+/));
              
              // Calculate Jaccard similarity
              const intersection = new Set([...originalWords].filter(word => variantWords.has(word)));
              const union = new Set([...originalWords, ...variantWords]);
              const similarity = intersection.size / union.size;
              
              // Only keep variants that are sufficiently different
              if (similarity < similarityThreshold) {
                filteredVariants.push(variant);
                similarityScores.push(similarity);
              }
            }
            
            // Calculate average similarity
            const avgSimilarity = similarityScores.length > 0 
              ? similarityScores.reduce((a, b) => a + b, 0) / similarityScores.length 
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
                fallback_method: true
              }
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
              evaluation_failed: true
            }
          };
        });
        
        // Process batch concurrently with limits
        const batchResults = await Promise.all(batchPromises);
        qualityAssessedResults.push(...batchResults);
        
        // Update progress
        this.onProgress?.({
          stage: "quality_filtering",
          message: `Processed quality assessment batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(variantResults.length / BATCH_SIZE)}`,
          progress: 92 + Math.floor((i / variantResults.length) * 3),
        });
        
        // Allow for garbage collection
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Log quality metrics summary
      const totalFiltered = qualityAssessedResults.reduce(
        (sum, item) => sum + (item.quality_metrics?.filtered_count || 0), 0
      );
      
      const totalVariants = qualityAssessedResults.reduce(
        (sum, item) => sum + (item.variants?.length || 0), 0
      );
      
      console.log(`Quality filtering complete. Removed ${totalFiltered} low-quality variants, kept ${totalVariants} high-quality variants.`);
      
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
      // Format based on output format setting
      switch (this.outputFormat.toLowerCase()) {
        case "jsonl":
          // Each line is a JSON object
          return variants
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
          return JSON.stringify(variants, null, 2);

        case "openai-jsonl":
          // Format for OpenAI fine-tuning - fixed to create proper JSONL format
          const trainingExamples = [];

          // Process each variant
          for (const variant of variants) {
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
                      "You are a clause rewriter that duplicates organizational language and formatting with high fidelity.",
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
          return JSON.stringify(variants, null, 2);
      }
    } catch (error) {
      console.error("Error formatting output:", error);
      // Return basic JSON as fallback
      return JSON.stringify(variants, null, 2);
    }
  }
}

export default SyntheticDataPipeline;


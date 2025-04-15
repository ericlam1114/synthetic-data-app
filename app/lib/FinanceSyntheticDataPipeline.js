// app/lib/FinanceSyntheticDataPipeline.js
import { OpenAI } from "openai";
import { logMemory, forceGC } from "../../lib/utils/memoryManager";

class FinanceSyntheticDataPipeline {
  constructor(options = {}) {
    this.openai = new OpenAI({
      apiKey: options.apiKey
    });

    // Model configurations
    this.models = {
      extractor:
        options.extractorModel ||
        "ft:gpt-4o-mini-2024-07-18:personal:finance-extractor:BMMXB1KK",
      classifier:
        options.classifierModel ||
        "ft:gpt-4o-mini-2024-07-18:personal:finance-classifier:BMMbh50M",
      projector:
        options.projectorModel ||
        "ft:gpt-4o-mini-2024-07-18:personal:finance-projection:BMMi50w7",
    };

    // Set memory-efficient processing parameters
    this.chunkSize = options.chunkSize || 300; // Small chunk size to prevent memory issues
    this.chunkOverlap = options.chunkOverlap || 50;
    this.outputFormat = options.outputFormat || "jsonl";
    
    // Finance-specific options
    this.metricFilter = options.metricFilter || "all"; // all, valuation_input, cost_driver, projection_basis
    this.generateProjections = options.generateProjections !== undefined ? options.generateProjections : true;
    this.projectionTypes = options.projectionTypes || ["valuation", "growth", "profitability"]; 
    
    // Callbacks
    this.onProgress = options.onProgress || (() => {});

    // Store filter settings from user
    this.userSettings = {
      metricFilter: options.metricFilter || "all",
      generateProjections: options.generateProjections !== undefined ? options.generateProjections : true,
      projectionTypes: options.projectionTypes || ["valuation", "growth", "profitability"],
      outputFormat: options.outputFormat || "jsonl",
    };
  }

  // Helper method to force memory cleanup
  async _forceClearMemory() {
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
      "Starting finance synthetic data pipeline for text length:",
      text.length
    );

    try {
      // Initialize stats for progress reporting
      const stats = {
        textLength: text.length,
        totalChunks: 0,
        processedChunks: 0,
        extractedMetrics: 0,
        classifiedMetrics: 0,
        generatedProjections: 0,
        startTime: Date.now(),
        processingTimeMs: 0,
      };

      // Reduce max text length to prevent memory issues
      const MAX_TEXT_LENGTH = 5000;
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
      
      // Force garbage collection after creating chunks
      await this._forceClearMemory();

      stats.totalChunks = chunks.length;
      stats.processedChunks = 0;

      this.onProgress?.({
        stage: "chunking",
        message: `Created ${chunks.length} chunks`,
        progress: 20,
      });

      // Step 1: Extract financial metrics using Model 1
      this.onProgress?.({
        stage: "extraction",
        message: `Extracting financial metrics from ${chunks.length} chunks`,
        progress: 30,
      });

      const extractedMetrics = await this._extractFinancialMetrics(chunks);
      
      // Clear chunks from memory and force GC
      chunks.length = 0;
      await this._forceClearMemory();

      stats.extractedMetrics = extractedMetrics.length;
      stats.processedChunks = chunks.length;

      this.onProgress?.({
        stage: "extraction",
        message: `Extracted ${extractedMetrics.length} financial metrics`,
        progress: 45,
      });

      // Step 2: Deduplicate metrics
      this.onProgress?.({
        stage: "deduplication",
        message: `Deduplicating ${extractedMetrics.length} financial metrics`,
        progress: 50,
      });

      const dedupedMetrics = this._deduplicateMetrics(extractedMetrics);
      
      // Clear extracted metrics from memory
      extractedMetrics.length = 0;
      await this._forceClearMemory();

      // Strictly limit to maximum 50 metrics total
      const limitedMetrics = dedupedMetrics.slice(0, 50);
      
      // Clear deduped metrics from memory
      dedupedMetrics.length = 0;
      await this._forceClearMemory();

      this.onProgress?.({
        stage: "deduplication",
        message: `Deduplicated to ${limitedMetrics.length} unique financial metrics`,
        progress: 55,
      });

      // Step 3: Classify metrics using Model 2
      this.onProgress?.({
        stage: "classification",
        message: `Classifying ${limitedMetrics.length} financial metrics`,
        progress: 60,
      });

      logMemory("Before classification");
      const classifiedMetrics = await this._classifyMetrics(limitedMetrics);
      
      // Clear limited metrics from memory
      limitedMetrics.length = 0;
      await this._forceClearMemory();

      stats.classifiedMetrics = classifiedMetrics.length;

      this.onProgress?.({
        stage: "classification",
        message: `Classified ${classifiedMetrics.length} financial metrics`,
        progress: 70,
      });

      // Step 4: Filter metrics based on user settings
      this.onProgress?.({
        stage: "filtering",
        message: `Filtering ${classifiedMetrics.length} financial metrics based on user settings`,
        progress: 75,
      });

      const filteredMetrics =
        this._filterMetricsByUserSettings(classifiedMetrics);
      
      // Clear classified metrics from memory
      classifiedMetrics.length = 0;
      await this._forceClearMemory();

      this.onProgress?.({
        stage: "filtering",
        message: `Filtered to ${filteredMetrics.length} financial metrics matching criteria`,
        progress: 80,
      });

      // Step 5: Generate financial projections using Model 3 (if enabled)
      let projections = [];
      
      if (this.userSettings.generateProjections) {
        this.onProgress?.({
          stage: "projection",
          message: `Generating financial projections from ${filteredMetrics.length} metrics`,
          progress: 85,
        });

        projections = await this._generateProjections(filteredMetrics);
        
        stats.generatedProjections = projections.length;

        this.onProgress?.({
          stage: "projection",
          message: `Generated ${projections.length} financial projections`,
          progress: 90,
        });
      }

      // Step 6: Format output
      this.onProgress?.({
        stage: "formatting",
        message: `Formatting output in ${this.outputFormat} format`,
        progress: 95,
      });

      const formattedOutput = this._formatOutput(filteredMetrics, projections);
      
      // Clear filteredMetrics and projections from memory
      filteredMetrics.length = 0;
      projections.length = 0;
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
      maxLength = Math.min(this.chunkSize, 400), // Maximum chunk size
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
    let chunkCount = 0;
    const MAX_CHUNKS = 20; // Limit total number of chunks

    while (startPos < text.length && chunkCount < MAX_CHUNKS) {
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
        chunkCount++;
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

  // Extract financial metrics using Model 1
  async _extractFinancialMetrics(chunks) {
    const allMetrics = [];

    console.log(`Attempting to extract financial metrics from ${chunks.length} chunks`);

    try {
      // Process chunks one at a time
      const BATCH_SIZE = 1;
      
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        // Log memory usage
        logMemory(`Processing chunk ${i+1}/${chunks.length}`);

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
        
        // Process each chunk sequentially to avoid memory issues
        for (const chunk of batchChunks) {
          try {
            console.log(`Processing chunk, length: ${chunk.length} characters`);
            
            // Further reduce chunk size limit
            const MAX_CHUNK_LENGTH = 4000;
            const truncatedChunk =
              chunk.length > MAX_CHUNK_LENGTH
                ? chunk.substring(0, MAX_CHUNK_LENGTH)
                : chunk;

            // Use the finance extractor model
            const response = await this.openai.chat.completions.create({
              model: this.models.extractor,
              messages: [
                {
                  role: "system",
                  content: "You are a financial data extractor.",
                },
                {
                  role: "user",
                  content: truncatedChunk,
                },
              ],
              // Reduce max token limit
              max_tokens: 512,
              temperature: 0.1,
              response_format: { type: "json_object" } // Ensure JSON response
            });

            if (response && response.choices && response.choices.length > 0) {
              const content = response.choices[0].message.content;
              
              try {
                // Parse the extracted JSON
                const extractedData = JSON.parse(content);
                
                // Store extracted metrics with source text
                if (Object.keys(extractedData).length > 0) {
                  allMetrics.push({
                    metrics: extractedData,
                    sourceText: chunk
                  });
                }
              } catch (parseError) {
                console.error("Error parsing extracted JSON:", parseError);
              }
            }
            
            // Force GC after each chunk
            await this._forceClearMemory();
            
          } catch (error) {
            console.error("Error extracting financial metrics:", error);
          }
        }

        // Force GC after each batch
        await this._forceClearMemory();
      }
    } catch (error) {
      console.error("Error in extraction process:", error);
    }

    return allMetrics;
  }

  // Deduplicate metrics to avoid redundancies
  _deduplicateMetrics(metricsData) {
    console.log(`Deduplicating ${metricsData.length} financial metric sets`);

    try {
      // Use Map for O(n) deduplication without creating massive Sets
      const uniqueMetricsMap = new Map();

      // For financial metrics, we'll consider them duplicates if they have the same
      // fiscal year/quarter and same metric types (revenue, profit, etc.)
      for (const metricObj of metricsData) {
        // Create a unique key based on relevant fields
        const metrics = metricObj.metrics;
        
        // Skip empty metrics
        if (!metrics || Object.keys(metrics).length === 0) {
          continue;
        }
        
        // Construct a key using fiscal period info and metrics types
        let keyParts = [];
        
        // Add fiscal period information to the key
        if (metrics.fiscal_year) {
          keyParts.push(`FY${metrics.fiscal_year}`);
        }
        if (metrics.quarter) {
          keyParts.push(metrics.quarter);
        }
        
        // Add metric types to the key (sorted alphabetically)
        const metricTypes = Object.keys(metrics)
          .filter(key => key !== 'fiscal_year' && key !== 'quarter')
          .sort();
          
        keyParts.push(metricTypes.join(','));
        
        const key = keyParts.join('_');
        
        // If this key doesn't exist, add it
        if (!uniqueMetricsMap.has(key)) {
          uniqueMetricsMap.set(key, metricObj);
        } else {
          // If it exists, use the one with more metrics (more complete)
          const existingEntry = uniqueMetricsMap.get(key);
          const existingMetricCount = Object.keys(existingEntry.metrics).length;
          const newMetricCount = Object.keys(metrics).length;
          
          if (newMetricCount > existingMetricCount) {
            uniqueMetricsMap.set(key, metricObj);
          }
        }
      }

      // Convert back to array
      const uniqueMetrics = Array.from(uniqueMetricsMap.values());

      console.log(
        `Deduplication complete: ${metricsData.length} metric sets → ${uniqueMetrics.length} unique metric sets`
      );
      return uniqueMetrics;
    } catch (error) {
      console.error("Error in deduplication process:", error);
      // In case of error, return a limited subset of the original array
      return metricsData.slice(0, 20);
    }
  }

  // Classify metrics using Model 2
  async _classifyMetrics(metricsData) {
    const classifiedMetrics = [];

    console.log(`Attempting to classify ${metricsData.length} metric sets`);

    try {
      // Process metrics in small batches
      const BATCH_SIZE = 5;
      for (let i = 0; i < metricsData.length; i += BATCH_SIZE) {
        const batchMetrics = metricsData.slice(i, i + BATCH_SIZE);

        this.onProgress?.({
          stage: "classification",
          message: `Processing classification batch ${
            Math.floor(i / BATCH_SIZE) + 1
          } of ${Math.ceil(metricsData.length / BATCH_SIZE)}, with ${
            batchMetrics.length
          } metric sets`,
          progress: 60 + Math.floor((i / metricsData.length) * 10),
        });

        // Process each metric set in the batch
        for (const metricObj of batchMetrics) {
          try {
            const metrics = metricObj.metrics;
            const sourceText = metricObj.sourceText;
            
            console.log(`Classifying metrics: ${JSON.stringify(metrics).substring(0, 50)}...`);

            // Use the finance classifier model
            const response = await this.openai.chat.completions.create({
              model: this.models.classifier,
              messages: [
                {
                  role: "system",
                  content: "You are a financial metric classifier.",
                },
                {
                  role: "user",
                  content: JSON.stringify(metrics),
                },
              ],
              temperature: 0.1,
              max_tokens: 1024,
              response_format: { type: "json_object" } // Ensure JSON response
            });

            if (response && response.choices && response.choices.length > 0) {
              const content = response.choices[0].message.content;
              
              try {
                // Parse classification results
                const classificationResults = JSON.parse(content);
                
                // Combine original metrics with classifications
                classifiedMetrics.push({
                  metrics,
                  classifications: classificationResults,
                  sourceText
                });
              } catch (parseError) {
                console.error("Error parsing classification JSON:", parseError);
                
                // Add with empty classifications as fallback
                classifiedMetrics.push({
                  metrics,
                  classifications: {},
                  sourceText
                });
              }
            }
          } catch (error) {
            console.error("Error classifying metrics:", error);
            
            // Add with empty classifications as fallback
            classifiedMetrics.push({
              metrics: metricObj.metrics,
              classifications: {},
              sourceText: metricObj.sourceText
            });
          }
          
          // Force GC after each metric set
          await this._forceClearMemory();
        }

        // Force GC after each batch
        await this._forceClearMemory();
      }
    } catch (error) {
      console.error("Error in classification process:", error);
    }

    console.log(`Classified ${classifiedMetrics.length} metric sets successfully`);
    return classifiedMetrics;
  }

  // Filter metrics based on user settings
  _filterMetricsByUserSettings(classifiedMetrics) {
    console.log(
      `Filtering ${classifiedMetrics.length} classified metric sets based on user settings`
    );
    console.log(
      `User settings: Filter=${this.userSettings.metricFilter}, GenerateProjections=${this.userSettings.generateProjections}`
    );

    try {
      // Start with all metrics
      let filteredMetrics = [...classifiedMetrics];

      // Apply metric filter according to user selection
      if (this.userSettings.metricFilter !== "all") {
        console.log(`Filtering to keep only ${this.userSettings.metricFilter} metrics`);
        
        filteredMetrics = classifiedMetrics.filter(item => {
          // Check if any metric has the desired classification
          const classifications = item.classifications;
          
          // If no classifications available, keep the item
          if (!classifications || Object.keys(classifications).length === 0) {
            return true;
          }
          
          // Check if any metric has the desired classification
          for (const [metricName, classInfo] of Object.entries(classifications)) {
            if (classInfo && classInfo.label === this.userSettings.metricFilter) {
              return true;
            }
          }
          
          return false;
        });
      }

      console.log(
        `After filtering by metric type: ${filteredMetrics.length} metric sets remaining`
      );

      // Take only a limited number of metrics to prevent memory issues
      const maxMetricsToProcess = 30;
      const finalMetrics = filteredMetrics.slice(0, maxMetricsToProcess);

      console.log(`Final filtered set: ${finalMetrics.length} metric sets`);
      return finalMetrics;
    } catch (error) {
      console.error("Error filtering metrics:", error);

      // In case of error, return a safe subset
      return classifiedMetrics.slice(0, 10);
    }
  }

  // Generate financial projections using Model 3
  async _generateProjections(filteredMetrics) {
    const projections = [];

    console.log(`Generating projections for ${filteredMetrics.length} metric sets`);

    try {
      // Only generate projections if enabled
      if (!this.userSettings.generateProjections) {
        console.log("Projection generation is disabled in user settings");
        return projections;
      }
      
      // Get projection types to generate
      const projectionTypes = this.userSettings.projectionTypes || 
        ["valuation", "growth", "profitability"];
        
      // Process metrics in small batches
      const BATCH_SIZE = 3;
      for (let i = 0; i < filteredMetrics.length; i += BATCH_SIZE) {
        const batchMetrics = filteredMetrics.slice(i, i + BATCH_SIZE);

        this.onProgress?.({
          stage: "projection",
          message: `Processing projection batch ${
            Math.floor(i / BATCH_SIZE) + 1
          } of ${Math.ceil(filteredMetrics.length / BATCH_SIZE)}, with ${
            batchMetrics.length
          } metric sets`,
          progress: 85 + Math.floor((i / filteredMetrics.length) * 10),
        });

        // Process each metric set in the batch
        for (const metricObj of batchMetrics) {
          try {
            const metrics = metricObj.metrics;
            const sourceText = metricObj.sourceText;
            
            // Convert metrics to data string format expected by projection model
            const dataString = Object.entries(metrics)
              .map(([key, value]) => {
                // Format numbers with appropriate units (M for millions, etc.)
                if (typeof value === 'number') {
                  if (value >= 1000000) {
                    return `${key} = $${value/1000000}M`;
                  } else if (value >= 1000) {
                    return `${key} = $${value/1000}K`;
                  } else if (key.includes('rate') || key.includes('margin')) {
                    return `${key} = ${value * 100}%`;
                  } else {
                    return `${key} = ${value}`;
                  }
                }
                return `${key} = ${value}`;
              })
              .join(', ');
            
            // For each projection type, generate a relevant question
            for (const projType of projectionTypes) {
              // Use the default question generator
              const question = this._getDefaultQuestion(projType, metrics);
              
              // Prepare the prompt for the projector model
              const prompt = `Data: ${dataString}\n\nQuestion: ${question}`;
              
              // Use the projector model
              const response = await this.openai.chat.completions.create({
                model: this.models.projector,
                messages: [
                  {
                    role: "system",
                    content: "You are a financial analyst assistant. Based on the provided financial data and question, provide a grounded, factual answer using business logic.",
                  },
                  {
                    role: "user",
                    content: prompt,
                  },
                ],
                temperature: 0.3,
                max_tokens: 256
              });

              if (response && response.choices && response.choices.length > 0) {
                const projectionResult = response.choices[0].message.content;
                
                // Add to projections
                projections.push({
                  metrics,
                  projectionType: projType,
                  question,
                  result: projectionResult,
                  sourceText
                });
              }
              
              // Force GC after each projection
              await this._forceClearMemory();
            }
          } catch (error) {
            console.error("Error generating projection:", error);
          }
        }

        // Force GC after each batch
        await this._forceClearMemory();
      }
    } catch (error) {
      console.error("Error in projection generation process:", error);
    }

    console.log(`Generated ${projections.length} projections`);
    return projections;
  }

  // Helper method to generate default questions for projection types
  _getDefaultQuestion(projectionType, metrics) {
    switch (projectionType) {
      case 'valuation':
        return metrics.revenue 
          ? `What is a reasonable valuation for a company with $${(metrics.revenue/1000000).toFixed(1)}M revenue?` 
          : "What is a reasonable valuation for this company?";
          
      case 'growth':
        return metrics.growth_rate_yoy 
          ? `What growth trajectory can be expected for a company growing at ${(metrics.growth_rate_yoy*100).toFixed(1)}%?` 
          : "What is the expected growth trajectory?";
          
      case 'profitability':
        return metrics.net_margin || metrics.gross_margin
          ? `What is the profitability outlook for a company with ${metrics.net_margin ? `${(metrics.net_margin*100).toFixed(1)}% net margin` : `${(metrics.gross_margin*100).toFixed(1)}% gross margin`}?`
          : "What is the profitability outlook?";
          
      default:
        return "What insights can you provide based on these metrics?";
    }
  }

  // Format the output according to the specified format
  _formatOutput(filteredMetrics, projections) {
    console.log(`Formatting ${filteredMetrics.length} metric sets and ${projections.length} projections for output`);

    // If no metrics, return empty string
    if (!filteredMetrics || filteredMetrics.length === 0) {
      return "";
    }

    try {
      // Format based on output format setting
      switch (this.outputFormat.toLowerCase()) {
        case "jsonl":
          // Each line is a JSON object
          let result = "";
          
          // Process metrics
          for (const metricObj of filteredMetrics) {
            result += JSON.stringify({
              type: "metric",
              data: metricObj.metrics,
              classifications: metricObj.classifications
            }) + "\n";
          }
          
          // Process projections
          for (const projection of projections) {
            result += JSON.stringify({
              type: "projection",
              metrics: projection.metrics,
              projectionType: projection.projectionType,
              question: projection.question,
              result: projection.result
            }) + "\n";
          }
          
          return result;

        case "json":
          // Single JSON array
          return JSON.stringify({
            metrics: filteredMetrics.map(metricObj => ({
              data: metricObj.metrics,
              classifications: metricObj.classifications
            })),
            projections: projections.map(projection => ({
              metrics: projection.metrics,
              projectionType: projection.projectionType,
              question: projection.question,
              result: projection.result
            }))
          }, null, 2);

        case "openai-jsonl":
          // Format for OpenAI fine-tuning
          let openaiFormat = "";
          
          // Format metrics for analysis
          for (const metricObj of filteredMetrics) {
            const metricsString = JSON.stringify(metricObj.metrics);
            
            // Generate a simple analysis summary if needed
            let analysisSummary = "";
            const metrics = metricObj.metrics;
            
            if (metrics.revenue) {
              analysisSummary += `revenue of $${metrics.revenue.toLocaleString()}`;
            }
            
            if (metrics.growth_rate_yoy) {
              analysisSummary += `, year-over-year growth of ${(metrics.growth_rate_yoy * 100).toFixed(1)}%`;
            }
            
            if (metrics.net_margin) {
              analysisSummary += `, net margin of ${(metrics.net_margin * 100).toFixed(1)}%`;
            }
            
            if (metrics.fiscal_year) {
              analysisSummary += ` for fiscal year ${metrics.fiscal_year}`;
              
              if (metrics.quarter) {
                analysisSummary += ` ${metrics.quarter}`;
              }
            }
            
            if (!analysisSummary) {
              analysisSummary = `various financial metrics including ${Object.keys(metrics).join(', ')}`;
            }
            
            const example = {
              messages: [
                {
                  role: "system",
                  content: "You are a financial data analyst that extracts and interprets financial metrics."
                },
                {
                  role: "user",
                  content: `Analyze these financial metrics: ${metricsString}`
                },
                {
                  role: "assistant",
                  content: `These metrics indicate ${analysisSummary}.`
                }
              ]
            };
            
            openaiFormat += JSON.stringify(example) + "\n";
          }
          
          // Format projections
          for (const projection of projections) {
            const example = {
              messages: [
                {
                  role: "system",
                  content: "You are a financial data analyst that generates projections based on financial metrics."
                },
                {
                  role: "user",
                  content: projection.question
                },
                {
                  role: "assistant",
                  content: projection.result
                }
              ]
            };
            
            openaiFormat += JSON.stringify(example) + "\n";
          }
          
          return openaiFormat;
          
        default:
          // Fallback to JSON
          return JSON.stringify({
            metrics: filteredMetrics.map(metricObj => ({
              data: metricObj.metrics,
              classifications: metricObj.classifications
            })),
            projections: projections.map(projection => ({
              metrics: projection.metrics,
              projectionType: projection.projectionType,
              question: projection.question,
              result: projection.result
            }))
          }, null, 2);
      }
    } catch (error) {
      console.error("Error formatting output:", error);
      // Return simpler format in case of error
      return JSON.stringify({
        metrics: filteredMetrics.map(m => m.metrics),
        projections: projections.map(p => ({ type: p.projectionType, result: p.result }))
      }, null, 2);
    }
  }
}

export default FinanceSyntheticDataPipeline;
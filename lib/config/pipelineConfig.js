// lib/config/pipelineConfig.js
/**
 * Configurable document processing pipeline settings
 * Following enterprise standards for configuration management
 */

// Default pipeline configurations
const defaultPipelineConfig = {
    // General settings
    general: {
      tempStoragePath: process.env.TEMP_STORAGE_PATH || 'tmp/processing',
      outputStoragePath: process.env.OUTPUT_STORAGE_PATH || 'output',
      maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '20', 10),
      cleanup: {
        enabled: process.env.ENABLE_AUTO_CLEANUP !== 'false',
        tempFileTtlHours: parseInt(process.env.TEMP_FILE_TTL_HOURS || '24', 10),
        outputFileTtlDays: parseInt(process.env.OUTPUT_FILE_TTL_DAYS || '30', 10)
      }
    },
    
    // Memory management
    memory: {
      warningThresholdMb: parseInt(process.env.MEMORY_WARNING_THRESHOLD_MB || '768', 10),
      criticalThresholdMb: parseInt(process.env.MEMORY_CRITICAL_THRESHOLD_MB || '1024', 10),
      enableAutoGc: process.env.ENABLE_AUTO_GC !== 'false',
      gcIntervalMs: parseInt(process.env.GC_INTERVAL_MS || '30000', 10),
      reduceChunkSizeOnHighMemory: true,
    },
    
    // Chunking
    chunking: {
      // Text size thresholds
      smallDocumentThresholdMb: 0.5,  // 500KB
      mediumDocumentThresholdMb: 2,   // 2MB
      largeDocumentThresholdMb: 5,    // 5MB
      
      // Chunking options by document size
      small: {
        chunkSize: 800,
        chunkOverlap: 100,
        useMemoryOnly: true,
        returnFullText: true,
        maxChunks: 50
      },
      medium: {
        chunkSize: 600,
        chunkOverlap: 75,
        useMemoryOnly: true,
        returnFullText: false,
        maxChunks: 100
      },
      large: {
        chunkSize: 400,
        chunkOverlap: 50,
        useMemoryOnly: false,
        returnFullText: false,
        maxChunks: 200,
        streamToS3: true
      },
      extraLarge: {
        chunkSize: 300,
        chunkOverlap: 30,
        useMemoryOnly: false,
        returnFullText: false,
        maxChunks: 500,
        streamToS3: true,
        useMultipartUpload: true
      }
    },
    
    // Storage settings for AWS S3
    s3Storage: {
      region: process.env.AWS_REGION || 'us-east-1',
      bucket: process.env.AWS_S3_BUCKET,
      tempPrefix: process.env.S3_TEMP_PREFIX || 'tmp/processing/',
      outputPrefix: process.env.S3_OUTPUT_PREFIX || 'output/',
      expirationDays: parseInt(process.env.S3_TEMP_EXPIRATION_DAYS || '7', 10),
      usePresignedUrls: process.env.USE_PRESIGNED_URLS === 'true',
      presignedUrlExpirationSeconds: parseInt(process.env.PRESIGNED_URL_EXPIRATION_SECONDS || '3600', 10),
    },
    
    // Pipeline specific settings
    pipelines: {
      legal: {
        // Legal document processing settings
        extractorModel: process.env.LEGAL_EXTRACTOR_MODEL || "ft:gpt-4o-mini-2024-07-18:personal:clause-extractor:BJoJl5pB",
        classifierModel: process.env.LEGAL_CLASSIFIER_MODEL || "ft:gpt-4o-mini-2024-07-18:personal:classifier:BKXRNBJy",
        duplicatorModel: process.env.LEGAL_DUPLICATOR_MODEL || "ft:gpt-4o-mini-2024-07-18:personal:upscale-v2:BMMLpKg9",
        maxVariantsPerClause: parseInt(process.env.MAX_VARIANTS_PER_CLAUSE || '5', 10),
        skipEmptyClauses: true,
        enableQualityFiltering: true,
        similarityThreshold: 0.85,
        maxClausesToProcess: 100,
        maxOutputSizeMb: 10,
      },
      qa: {
        // Q&A generation settings
        extractorModel: process.env.QA_EXTRACTOR_MODEL || "ft:gpt-4o-mini-2024-07-18:personal:clause-extractor:BJoJl5pB",
        classifierModel: process.env.QA_CLASSIFIER_MODEL || "ft:gpt-4o-mini-2024-07-18:personal:classifier:BKXRNBJy",
        qaModel: process.env.QA_GENERATOR_MODEL || "ft:gpt-4o-mini-2024-07-18:personal:qa:BMJr4zYZ",
        defaultQuestionTypes: ["factual", "procedural", "critical-thinking"],
        defaultDifficultyLevels: ["basic", "intermediate", "advanced"],
        maxQuestionsPerSection: 5,
        preserveSourceText: false,
        maxOutputSizeMb: 5,
      },
      finance: {
        // Financial document settings
        extractorModel: process.env.FINANCE_EXTRACTOR_MODEL || "ft:gpt-4o-mini-2024-07-18:personal:finance-extractor:BMMXB1KK",
        classifierModel: process.env.FINANCE_CLASSIFIER_MODEL || "ft:gpt-4o-mini-2024-07-18:personal:finance-classifier:BMMbh50M",
        projectorModel: process.env.FINANCE_PROJECTOR_MODEL || "ft:gpt-4o-mini-2024-07-18:personal:finance-projection:BMMi50w7",
        metricFilterDefault: "all",
        generateProjectionsDefault: true,
        projectionTypesDefault: ["valuation", "growth", "profitability"],
        maxMetricsToProcess: 50,
        maxOutputSizeMb: 5,
      }
    },
    
    // Monitoring and telemetry
    monitoring: {
      enablePerformanceMetrics: process.env.ENABLE_PERFORMANCE_METRICS !== 'false',
      enableErrorReporting: process.env.ENABLE_ERROR_REPORTING !== 'false',
      enableDetailedLogs: process.env.ENABLE_DETAILED_LOGS === 'true',
      logLevel: process.env.LOG_LEVEL || 'info',
      metricsNamespace: process.env.METRICS_NAMESPACE || 'synthetic-data-pipeline',
      sendAnonymousUsageStats: process.env.SEND_ANONYMOUS_USAGE_STATS === 'true',
    }
  };
  
  /**
   * Get pipeline configuration with optional overrides
   * @param {Object} overrides - Configuration overrides 
   * @returns {Object} - Complete configuration with defaults and overrides
   */
  export function getPipelineConfig(overrides = {}) {
    // Deep merge defaults with overrides
    return deepMerge(defaultPipelineConfig, overrides);
  }
  
  /**
   * Get configuration for a specific document size
   * @param {number} documentSizeBytes - Document size in bytes
   * @returns {Object} - Size-specific configuration
   */
  export function getChunkingConfigForSize(documentSizeBytes, config = defaultPipelineConfig) {
    const documentSizeMb = documentSizeBytes / (1024 * 1024);
    const chunking = config.chunking;
    
    if (documentSizeMb <= chunking.smallDocumentThresholdMb) {
      return chunking.small;
    } else if (documentSizeMb <= chunking.mediumDocumentThresholdMb) {
      return chunking.medium;
    } else if (documentSizeMb <= chunking.largeDocumentThresholdMb) {
      return chunking.large;
    } else {
      return chunking.extraLarge;
    }
  }
  
  /**
   * Helper function for deep merging objects
   */
  function deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
          result[key] = deepMerge(target[key], source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }
  
  // Export default configuration
  export default defaultPipelineConfig;
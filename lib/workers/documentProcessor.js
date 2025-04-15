// lib/workers/documentProcessor.js
import documentStorageService from '../../lib/services/documentStorageService';
import SyntheticDataPipeline from '../../app/lib/SyntheticDataPipeline';
import QASyntheticDataPipeline from '../../app/lib/QASyntheticDataPipeline';
import FinanceSyntheticDataPipeline from '../../app/lib/FinanceSyntheticDataPipeline';
import { v4 as uuidv4 } from 'uuid';
import { forceGC } from '../utils/enhancedMemoryManager';

/**
 * Process a document in the background
 * @param {string} textKey - S3 key of the text to process
 * @param {string} pipelineType - Type of pipeline to use (legal, qa, finance)
 * @param {Object} options - Pipeline options
 * @param {Object} jobContext - Job context for progress updates
 * @returns {Object} - Processing results
 */
export async function processDocumentInBackground(textKey, pipelineType = 'legal', options = {}, jobContext) {
  try {
    // Update progress
    jobContext.progress(5, 'Initializing document processing');
    
    // Download the text file
    jobContext.progress(10, `Loading text data from storage (key: ${textKey})`);
    const downloadResult = await documentStorageService.downloadFile(textKey, {
      asText: true,
    });
    
    const text = downloadResult.content;
    jobContext.progress(15, `Retrieved ${text.length} characters of text data`);
    
    // Determine maximum text length based on pipeline type
    const maxTextLength = {
      legal: 20000,
      qa: 15000,
      finance: 10000,
    }[pipelineType] || 10000;
    
    // Truncate if needed
    const truncatedText = text.length > maxTextLength 
      ? text.substring(0, maxTextLength) 
      : text;
    
    if (text.length > maxTextLength) {
      jobContext.progress(18, `Text exceeds ${maxTextLength} characters, truncating for processing`);
    }
    
    // Force GC
    forceGC();
    
    // Create pipeline based on type
    jobContext.progress(20, `Initializing ${pipelineType} pipeline`);
    let pipeline;
    
    // Use chunked processing to reduce memory usage
    const pipelineOptions = {
      apiKey: process.env.OPENAI_API_KEY,
      outputFormat: options.outputFormat || 'openai-jsonl',
      chunkSize: 300, // Small chunks to prevent memory issues
      chunkOverlap: 50,
      onProgress: (progressData) => {
        // Convert pipeline progress (0-100) to job progress (20-90)
        const normalizedProgress = 20 + (progressData.progress || 0) * 0.7;
        jobContext.progress(normalizedProgress, progressData.message);
      }
    };
    
    // Add pipeline-specific options
    if (pipelineType === 'qa') {
      pipeline = new QASyntheticDataPipeline({
        ...pipelineOptions,
        questionTypes: options.questionTypes || ['factual', 'procedural', 'critical-thinking'],
        difficultyLevels: options.difficultyLevels || ['basic', 'intermediate', 'advanced'],
        maxQuestionsPerSection: options.maxQuestionsPerSection || 5,
        chunkSize: 250, // Even smaller chunks for QA
      });
    } else if (pipelineType === 'finance') {
      pipeline = new FinanceSyntheticDataPipeline({
        ...pipelineOptions,
        metricFilter: options.metricFilter || 'all',
        generateProjections: options.generateProjections !== undefined ? options.generateProjections : true,
        projectionTypes: options.projectionTypes || ['valuation', 'growth', 'profitability'],
        chunkSize: 200, // Smaller chunks for finance
      });
    } else {
      // Default to legal pipeline
      pipeline = new SyntheticDataPipeline({
        ...pipelineOptions,
        classFilter: options.classFilter || 'all',
        prioritizeImportant: options.prioritizeImportant !== undefined ? options.prioritizeImportant : true,
      });
    }
    
    // Process the document with timeout protection
    jobContext.progress(25, 'Starting document processing');
    
    const processingPromise = pipeline.process(truncatedText);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Processing timeout after 5 minutes')), 5 * 60 * 1000)
    );
    
    const result = await Promise.race([processingPromise, timeoutPromise]);
    
    // Force GC
    forceGC();
    
    // Save the results
    jobContext.progress(92, 'Saving processing results');
    
    // Determine file extension
    const fileExt = options.outputFormat === 'json' ? 'json' : 
                    options.outputFormat === 'csv' ? 'csv' : 'jsonl';
    
    // Save to storage
    const outputKey = `output/${pipelineType}_${uuidv4()}.${fileExt}`;
    
    await documentStorageService.uploadFile(
      result.output,
      `${pipelineType}_result.${fileExt}`,
      options.outputFormat === 'json' ? 'application/json' : 
      options.outputFormat === 'csv' ? 'text/csv' : 'application/jsonl',
      'results'
    );
    
    jobContext.progress(100, 'Processing complete');
    
    // Return minimal result info
    return {
      success: true,
      outputKey,
      stats: result.stats,
      pipelineType,
      format: options.outputFormat || 'openai-jsonl'
    };
  } catch (error) {
    console.error('Error processing document in background:', error);
    throw error;
  }
}
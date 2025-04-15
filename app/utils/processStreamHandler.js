// app/utils/processStreamHandler.js

/**
 * Utility for handling streaming responses from the process API
 * Provides structured handling of all message types including progress updates
 */
export class ProcessStreamHandler {
    constructor(options = {}) {
      this.options = {
        onProgress: options.onProgress || (() => {}),
        onError: options.onError || (() => {}),
        onResult: options.onResult || (() => {}),
        onLogs: options.onLogs || (() => {}),
        onMemory: options.onMemory || (() => {}),
        debugMode: options.debugMode || false
      };
      
      // Internal state
      this.buffer = '';
      this.streamDone = false;
      this.result = null;
      this.errors = [];
      this.progress = {
        stage: 'initializing',
        message: 'Starting process...',
        progress: 0,
        logs: []
      };
    }
    
    /**
     * Process a chunk of data from the stream
     * @param {Uint8Array} chunk - Binary chunk from the stream
     */
    processChunk(chunk) {
      // Convert binary chunk to string and add to buffer
      const decoder = new TextDecoder();
      this.buffer += decoder.decode(chunk, { stream: true });
      
      // Process complete JSON objects in the buffer
      this._processBuffer();
    }
    
    /**
     * Indicate the stream is complete and process any remaining data
     */
    complete() {
      // Process any remaining data in the buffer
      if (this.buffer.trim()) {
        this._processBuffer(true);
      }
      
      this.streamDone = true;
      
      // Log completion if in debug mode
      if (this.options.debugMode) {
        console.log('Stream processing complete', {
          result: this.result ? 'Received' : 'Not received',
          errors: this.errors.length,
          progress: this.progress
        });
      }
    }
    
    /**
     * Process the buffer for complete JSON objects
     * @param {boolean} isComplete - Whether this is the final processing
     */
    _processBuffer(isComplete = false) {
      let startPos = 0;
      let endPos = -1;
      
      // Find complete JSON objects in the buffer
      while ((endPos = this._findJsonEnd(this.buffer, startPos)) !== -1) {
        try {
          // Extract JSON string
          const jsonStr = this.buffer.substring(startPos, endPos + 1);
          
          // Parse and process the JSON object
          const data = JSON.parse(jsonStr);
          this._handleMessage(data);
          
          // Move to the next position
          startPos = endPos + 1;
        } catch (error) {
          // Skip invalid JSON and continue from the next character
          if (this.options.debugMode) {
            console.warn('Error parsing JSON in stream buffer:', error);
          }
          startPos++;
        }
      }
      
      // Keep any remaining incomplete data in the buffer
      this.buffer = this.buffer.substring(startPos);
      
      // If this is the final processing and we still have data, try to parse it
      if (isComplete && this.buffer.trim()) {
        try {
          const data = JSON.parse(this.buffer);
          this._handleMessage(data);
          this.buffer = '';
        } catch (error) {
          if (this.options.debugMode) {
            console.warn('Error parsing final JSON in stream buffer:', error);
          }
        }
      }
    }
    
    /**
     * Handle a parsed message object
     * @param {Object} message - Parsed message from the stream
     */
    _handleMessage(message) {
      // Handle different message types
      switch (message.type) {
        case 'progress':
          this._handleProgressUpdate(message);
          break;
        case 'error':
          this._handleError(message);
          break;
        case 'result':
          this._handleResult(message);
          break;
        default:
          if (this.options.debugMode) {
            console.warn('Unknown message type:', message.type, message);
          }
      }
    }
    
    /**
     * Handle a progress update message
     * @param {Object} message - Progress update message
     */
    _handleProgressUpdate(message) {
      // Update progress state
      if (message.stage) {
        this.progress.stage = message.stage;
      }
      
      if (message.message) {
        this.progress.message = message.message;
        
        // Add to logs
        this.progress.logs.push({
          time: new Date(),
          message: message.message,
          stage: message.stage || this.progress.stage
        });
        
        // Limit log size
        if (this.progress.logs.length > 100) {
          this.progress.logs = this.progress.logs.slice(-100);
        }
      }
      
      if (message.progress !== undefined && message.progress !== null) {
        this.progress.progress = message.progress;
      }
      
      // Call progress callback
      this.options.onProgress(this.progress);
      
      // Special handling for memory logs
      if (message.stage === 'memory') {
        this.options.onMemory(message);
      }
      
      // Call logs callback if needed
      if (this.progress.logs.length > 0) {
        this.options.onLogs(this.progress.logs);
      }
    }
    
    /**
     * Handle an error message
     * @param {Object} message - Error message
     */
    _handleError(message) {
      const error = {
        message: message.message || 'Unknown error',
        details: message.details || message.message || 'No details available',
        time: new Date()
      };
      
      // Add to errors list
      this.errors.push(error);
      
      // Call error callback
      this.options.onError(error);
      
      if (this.options.debugMode) {
        console.error('Stream processing error:', error);
      }
    }
    
    /**
     * Handle a result message
     * @param {Object} message - Result message
     */
    _handleResult(message) {
      this.result = message;
      
      // Call result callback
      this.options.onResult(message);
      
      if (this.options.debugMode) {
        console.log('Stream processing result received', {
          success: message.success,
          format: message.format,
          dataLength: message.data ? message.data.length : 0,
          stats: message.stats
        });
      }
    }
    
    /**
     * Find the end position of a complete JSON object
     * @param {string} str - String to search
     * @param {number} startPos - Position to start searching
     * @returns {number} - End position or -1 if no complete JSON found
     */
    _findJsonEnd(str, startPos) {
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;
      let firstBraceFound = false;
      
      for (let i = startPos; i < str.length; i++) {
        const char = str[i];
        
        if (!firstBraceFound) {
          if (char === '{') {
            firstBraceFound = true;
            braceCount = 1;
          }
          continue;
        }
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\' && inString) {
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            
            // If all braces are closed, we've found a complete JSON object
            if (braceCount === 0) {
              return i;
            }
          }
        }
      }
      
      // No complete JSON object found
      return -1;
    }
    
    /**
     * Get the current processing state
     * @returns {Object} - Current state
     */
    getState() {
      return {
        progress: this.progress,
        errors: this.errors,
        result: this.result,
        complete: this.streamDone,
        buffer: this.buffer.length
      };
    }
  }
  
  /**
   * Process document with progress streaming
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} - Processing result
   */
  export async function processDocumentWithStream(options) {
    const {
      textKey,
      pipelineType = "legal",
      outputFormat = "openai-jsonl",
      // Pipeline-specific options
      ...pipelineOptions
    } = options;
    
    // Callbacks
    const {
      onProgress = () => {},
      onError = () => {},
      onResult = () => {},
      onLogs = () => {},
      onMemory = () => {},
      debugMode = false
    } = options;
    
    // Create stream handler
    const streamHandler = new ProcessStreamHandler({
      onProgress,
      onError,
      onResult,
      onLogs,
      onMemory,
      debugMode
    });
    
    try {
      // Make API request with streaming response
      const response = await fetch("/api/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          textKey,
          pipelineType,
          outputFormat,
          ...pipelineOptions
        }),
      });
      
      if (!response.ok || !response.body) {
        throw new Error(`API request failed with status: ${response.status}`);
      }
      
      // Process the stream
      const reader = response.body.getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        
        streamHandler.processChunk(value);
      }
      
      // Mark stream as complete
      streamHandler.complete();
      
      // Return result or error
      if (streamHandler.result) {
        return {
          success: true,
          data: streamHandler.result,
          progress: streamHandler.progress
        };
      } else if (streamHandler.errors.length > 0) {
        throw new Error(streamHandler.errors[0].message);
      } else {
        throw new Error("No result received from processing");
      }
    } catch (error) {
      // Log the error
      console.error("Error processing document:", error);
      
      // Add to errors and call error callback
      const errorObj = {
        message: error.message,
        details: error.stack || error.message,
        time: new Date()
      };
      
      streamHandler.errors.push(errorObj);
      onError(errorObj);
      
      // Return error result
      return {
        success: false,
        error: errorObj,
        progress: streamHandler.progress
      };
    }
  }
  
  export default processDocumentWithStream;
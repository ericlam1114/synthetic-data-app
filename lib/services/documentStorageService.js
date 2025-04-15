// lib/services/documentStorageService.js
/**
 * Document storage service
 * Handles all document storage operations using best practices from enterprise systems
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { v4 as uuidv4 } from 'uuid';
import { getPipelineConfig } from '../config/pipelineConfig';
import { createMemoryManager } from '../utils/enhancedMemoryManager';

// Create memory manager for storage operations
const memoryManager = createMemoryManager({
  enableLogging: true,
  enableAutoGC: true
});

/**
 * Document Storage Service Class
 * Enterprise-grade storage handling with retry logic, error handling, and monitoring
 */
class DocumentStorageService {
  constructor(config = {}) {
    // Get configuration
    this.config = getPipelineConfig(config).s3Storage;
    
    // Initialize S3 client
    this.s3Client = new S3Client({
      region: this.config.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    
    // Set up base paths
    this.tmpBasePath = this.config.tempPrefix;
    this.outputBasePath = this.config.outputPrefix;
    
    // Setup tracking for storage operations
    this.activeUploads = new Map();
    this.activeDownloads = new Map();
  }
  
  /**
   * Generate a unique storage key for a file
   * @param {string} filename - Original filename
   * @param {string} category - File category (e.g., 'uploads', 'chunks', 'results')
   * @returns {string} - Unique storage key
   */
  generateStorageKey(filename, category = 'uploads') {
    const cleanFilename = filename.replace(/\s+/g, '_');
    const uuid = uuidv4();
    const datePath = new Date().toISOString().split('T')[0].replace(/-/g, '/');
    
    return `${this.tmpBasePath}${category}/${datePath}/${uuid}-${cleanFilename}`;
  }
  
  /**
   * Generate a unique output key for results
   * @param {string} pipelineType - Type of pipeline (legal, qa, finance)
   * @param {string} fileExt - File extension (e.g., 'jsonl', 'json', 'csv')
   * @returns {string} - Unique output key
   */
  generateOutputKey(pipelineType, fileExt) {
    const uuid = uuidv4();
    const datePath = new Date().toISOString().split('T')[0].replace(/-/g, '/');
    
    return `${this.outputBasePath}${pipelineType}/${datePath}/${uuid}.${fileExt}`;
  }
  
  /**
   * Upload a file to storage
   * @param {Buffer|Blob|ReadableStream} fileContent - File content
   * @param {string} filename - Original filename
   * @param {string} contentType - MIME content type
   * @param {string} category - File category
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Upload result with key
   */
  async uploadFile(fileContent, filename, contentType, category = 'uploads', options = {}) {
    const key = options.key || this.generateStorageKey(filename, category);
    const operationId = uuidv4();
    const useMultipart = options.useMultipart || fileContent.length > 5 * 1024 * 1024; // Use multipart for files > 5MB
    
    try {
      // Track active uploads
      this.activeUploads.set(operationId, { 
        key, 
        startTime: Date.now(),
        size: fileContent.length || 'unknown',
        progress: 0
      });
      
      // Use multipart upload for large files
      if (useMultipart) {
        const upload = new Upload({
          client: this.s3Client,
          params: {
            Bucket: this.config.bucket,
            Key: key,
            Body: fileContent,
            ContentType: contentType
          },
          queueSize: 4, // Number of concurrent parts to upload
          partSize: 5 * 1024 * 1024, // 5MB per part
        });
        
        // Listen for progress events
        upload.on('httpUploadProgress', (progress) => {
          const activeUpload = this.activeUploads.get(operationId);
          if (activeUpload) {
            activeUpload.progress = progress.loaded / progress.total * 100;
            this.activeUploads.set(operationId, activeUpload);
          }
        });
        
        // Execute the upload
        await upload.done();
      } 
      // Use regular upload for smaller files
      else {
        await this.s3Client.send(new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: fileContent,
          ContentType: contentType
        }));
      }
      
      // Update completion status
      const activeUpload = this.activeUploads.get(operationId);
      if (activeUpload) {
        activeUpload.progress = 100;
        activeUpload.completed = true;
        activeUpload.completionTime = Date.now();
        this.activeUploads.set(operationId, activeUpload);
      }
      
      // Generate presigned URL if needed
      let url = null;
      if (this.config.usePresignedUrls) {
        url = await this.generatePresignedUrl(key, 'get', this.config.presignedUrlExpirationSeconds);
      }
      
      // Force GC after large upload
      if (useMultipart) {
        memoryManager.forceGC();
      }
      
      return {
        success: true,
        key,
        url,
        operationId,
        category
      };
    } catch (error) {
      console.error(`Error uploading file to ${key}:`, error);
      
      // Update error status
      const activeUpload = this.activeUploads.get(operationId);
      if (activeUpload) {
        activeUpload.error = error.message;
        activeUpload.errorTime = Date.now();
        this.activeUploads.set(operationId, activeUpload);
      }
      
      throw new Error(`Failed to upload file: ${error.message}`);
    } finally {
      // Clean up tracking after 5 minutes
      setTimeout(() => {
        this.activeUploads.delete(operationId);
      }, 5 * 60 * 1000);
    }
  }
  
  /**
   * Download a file from storage
   * @param {string} key - Storage key
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Download result with content
   */
  async downloadFile(key, options = {}) {
    const operationId = uuidv4();
    
    try {
      // Track active downloads
      this.activeDownloads.set(operationId, { 
        key, 
        startTime: Date.now(),
        progress: 0
      });
      
      // Get object from S3
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      });
      
      const response = await this.s3Client.send(command);
      
      // Handle different response types based on options
      let content;
      if (options.asStream) {
        content = response.Body;
      } else if (options.asBuffer) {
        const chunks = [];
        for await (const chunk of response.Body) {
          chunks.push(chunk);
        }
        content = Buffer.concat(chunks);
      } else if (options.asText) {
        content = await response.Body.transformToString(options.encoding || 'utf8');
      } else {
        // Default to buffer
        const chunks = [];
        for await (const chunk of response.Body) {
          chunks.push(chunk);
        }
        content = Buffer.concat(chunks);
      }
      
      // Update completion status
      const activeDownload = this.activeDownloads.get(operationId);
      if (activeDownload) {
        activeDownload.progress = 100;
        activeDownload.completed = true;
        activeDownload.completionTime = Date.now();
        this.activeDownloads.set(operationId, activeDownload);
      }
      
      return {
        success: true,
        key,
        content,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        operationId
      };
    } catch (error) {
      console.error(`Error downloading file from ${key}:`, error);
      
      // Update error status
      const activeDownload = this.activeDownloads.get(operationId);
      if (activeDownload) {
        activeDownload.error = error.message;
        activeDownload.errorTime = Date.now();
        this.activeDownloads.set(operationId, activeDownload);
      }
      
      throw new Error(`Failed to download file: ${error.message}`);
    } finally {
      // Clean up tracking after 5 minutes
      setTimeout(() => {
        this.activeDownloads.delete(operationId);
      }, 5 * 60 * 1000);
    }
  }
  
  /**
   * Save text chunks to storage
   * @param {Array<string>} chunks - Array of text chunks
   * @param {string} baseKey - Base key for chunks
   * @param {Object} options - Additional options
   * @returns {Promise<Array<string>>} - Array of chunk keys
   */
  async saveTextChunks(chunks, baseKey, options = {}) {
    const chunkKeys = [];
    const category = options.category || 'chunks';
    const basePath = baseKey || `${this.tmpBasePath}${category}/${uuidv4()}/`;
    
    try {
      // Determine batch size based on memory conditions
      const memoryStats = memoryManager._checkMemoryUsage();
      const batchSize = memoryStats && memoryStats.isWarningLevel ? 5 : 10;
      
      // Process chunks in batches to manage memory
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
        
        // Upload each chunk in the batch concurrently
        const uploadPromises = batch.map(async (chunk, index) => {
          const chunkIndex = i + index;
          const chunkKey = `${basePath}chunk_${String(chunkIndex).padStart(5, '0')}.txt`;
          
          await this.s3Client.send(new PutObjectCommand({
            Bucket: this.config.bucket,
            Key: chunkKey,
            Body: chunk,
            ContentType: 'text/plain'
          }));
          
          return chunkKey;
        });
        
        // Wait for all uploads in this batch to complete
        const batchKeys = await Promise.all(uploadPromises);
        chunkKeys.push(...batchKeys);
        
        // Force GC between batches
        if (i + batchSize < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
          memoryManager.forceGC();
        }
      }
      
      // Save metadata for chunks
      const metadataKey = `${basePath}metadata.json`;
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: metadataKey,
        Body: JSON.stringify({
          totalChunks: chunks.length,
          chunkKeys,
          createdAt: new Date().toISOString(),
          options
        }),
        ContentType: 'application/json'
      }));
      
      return {
        success: true,
        chunkKeys,
        basePath,
        metadataKey,
        totalChunks: chunks.length
      };
    } catch (error) {
      console.error(`Error saving text chunks to ${basePath}:`, error);
      throw new Error(`Failed to save text chunks: ${error.message}`);
    }
  }
  
  /**
   * Load text chunks from storage
   * @param {Array<string>} chunkKeys - Array of chunk keys
   * @param {Object} options - Additional options
   * @returns {Promise<Array<string>>} - Array of text chunks
   */
  async loadTextChunks(chunkKeys, options = {}) {
    const chunks = [];
    
    try {
      // Determine batch size based on memory conditions
      const memoryStats = memoryManager._checkMemoryUsage();
      const batchSize = memoryStats && memoryStats.isWarningLevel ? 3 : 5;
      
      // Load chunks in batches to manage memory
      for (let i = 0; i < chunkKeys.length; i += batchSize) {
        const batch = chunkKeys.slice(i, Math.min(i + batchSize, chunkKeys.length));
        
        // Download each chunk in the batch concurrently
        const downloadPromises = batch.map(async (chunkKey) => {
          const response = await this.s3Client.send(new GetObjectCommand({
            Bucket: this.config.bucket,
            Key: chunkKey
          }));
          
          // Convert stream to text
          return await response.Body.transformToString('utf-8');
        });
        
        // Wait for all downloads in this batch to complete
        const batchChunks = await Promise.all(downloadPromises);
        chunks.push(...batchChunks);
        
        // Force GC between batches
        if (i + batchSize < chunkKeys.length) {
          await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
          memoryManager.forceGC();
        }
      }
      
      return {
        success: true,
        chunks,
        totalChunks: chunks.length
      };
    } catch (error) {
      console.error(`Error loading text chunks:`, error);
      throw new Error(`Failed to load text chunks: ${error.message}`);
    }
  }
  
  /**
   * Delete files from storage
   * @param {Array<string>} keys - Array of keys to delete
   * @returns {Promise<Object>} - Deletion result
   */
  async deleteFiles(keys) {
    const results = {
      success: true,
      deleted: [],
      failed: []
    };
    
    try {
      // Process deletions in batches to avoid overwhelming the service
      const batchSize = 10;
      
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, Math.min(i + batchSize, keys.length));
        
        // Delete each file in the batch concurrently
        const deletePromises = batch.map(async (key) => {
          try {
            await this.s3Client.send(new DeleteObjectCommand({
              Bucket: this.config.bucket,
              Key: key
            }));
            
            return { key, success: true };
          } catch (error) {
            console.error(`Error deleting file ${key}:`, error);
            return { key, success: false, error: error.message };
          }
        });
        
        // Wait for all deletions in this batch to complete
        const batchResults = await Promise.all(deletePromises);
        
        // Categorize results
        for (const result of batchResults) {
          if (result.success) {
            results.deleted.push(result.key);
          } else {
            results.failed.push({ key: result.key, error: result.error });
          }
        }
      }
      
      // Update overall success flag
      results.success = results.failed.length === 0;
      
      return results;
    } catch (error) {
      console.error(`Error during batch deletion:`, error);
      return {
        success: false,
        error: error.message,
        deleted: results.deleted,
        failed: [...results.failed, { general: error.message }]
      };
    }
  }
  
  /**
   * Delete files by prefix
   * @param {string} prefix - Prefix to delete
   * @returns {Promise<Object>} - Deletion result
   */
  async deleteByPrefix(prefix) {
    try {
      // List all objects with the prefix
      const listCommand = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: prefix
      });
      
      const listedObjects = await this.s3Client.send(listCommand);
      
      if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
        return {
          success: true,
          message: 'No objects found with the given prefix',
          deleted: [],
          failed: []
        };
      }
      
      // Extract keys and delete them
      const keys = listedObjects.Contents.map(obj => obj.Key);
      return await this.deleteFiles(keys);
    } catch (error) {
      console.error(`Error deleting files by prefix ${prefix}:`, error);
      return {
        success: false,
        error: error.message,
        deleted: [],
        failed: [{ prefix, error: error.message }]
      };
    }
  }
  
  /**
   * Clean up temporary files based on age
   * @param {number} olderThanHours - Delete files older than this many hours
   * @returns {Promise<Object>} - Cleanup result
   */
  async cleanupTempFiles(olderThanHours = 24) {
    try {
      // Calculate cutoff time
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - olderThanHours);
      
      // List all objects in the temp directory
      const listCommand = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: this.tmpBasePath
      });
      
      const listedObjects = await this.s3Client.send(listCommand);
      
      if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
        return {
          success: true,
          message: 'No temporary files found to clean up',
          deleted: [],
          failed: []
        };
      }
      
      // Find files older than the cutoff time
      const oldKeys = listedObjects.Contents
        .filter(obj => obj.LastModified < cutoffTime)
        .map(obj => obj.Key);
      
      if (oldKeys.length === 0) {
        return {
          success: true,
          message: 'No old temporary files found to clean up',
          deleted: [],
          failed: []
        };
      }
      
      // Delete the old files
      return await this.deleteFiles(oldKeys);
    } catch (error) {
      console.error(`Error cleaning up temporary files:`, error);
      return {
        success: false,
        error: error.message,
        deleted: [],
        failed: [{ general: error.message }]
      };
    }
  }
  
  /**
   * Generate a presigned URL for a file
   * @param {string} key - File key
   * @param {string} operation - Operation ('get' or 'put')
   * @param {number} expiresInSeconds - URL expiration in seconds
   * @returns {Promise<string>} - Presigned URL
   */
  async generatePresignedUrl(key, operation = 'get', expiresInSeconds = 3600) {
    try {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      
      let command;
      if (operation === 'get') {
        command = new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: key
        });
      } else if (operation === 'put') {
        command = new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key
        });
      } else {
        throw new Error(`Unsupported operation: ${operation}`);
      }
      
      const url = await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
      return url;
    } catch (error) {
      console.error(`Error generating presigned URL for ${key}:`, error);
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }
}

// Create singleton instance
const storageService = new DocumentStorageService();

export default storageService;
// app/components/BatchUploader.js
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { cn } from '../../lib/utils';
import { FileIcon, UploadCloud, X, AlertTriangle, Check, Trash2 } from 'lucide-react';
import { formatBytes } from '../utils/textHandler';
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';

const BatchUploader = ({ 
  files, 
  setFiles, 
  onRemoveFile, 
  fileStatuses, 
  processingBatch, 
  onClearCompleted 
}) => {
  const onDrop = useCallback((acceptedFiles) => {
    // Filter out PDFs that are too large (>10MB)
    const validFiles = acceptedFiles.filter(file => {
      const isValidType = file.type === 'application/pdf';
      const isValidSize = file.size <= 10 * 1024 * 1024;
      return isValidType && isValidSize;
    });

    // Add new files to the existing files
    setFiles(prev => [...prev, ...validFiles]);
  }, [setFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: true
  });

  // Calculate file status
  const getFileStatus = (file) => {
    // Check if we have a status for this file
    const status = fileStatuses[file.name];
    
    if (status) {
      return status;
    }
    
    // If no status, calculate based on file properties
    if (file.size > 10 * 1024 * 1024) {
      return {
        valid: false,
        status: 'invalid',
        message: 'File exceeds maximum size of 10MB',
        icon: AlertTriangle,
        iconClass: 'text-amber-500'
      };
    }
    
    if (file.type !== 'application/pdf') {
      return {
        valid: false,
        status: 'invalid',
        message: 'Only PDF files are supported',
        icon: AlertTriangle,
        iconClass: 'text-amber-500'
      };
    }
    
    // File is valid but not processed
    return {
      valid: true,
      status: 'pending',
      message: 'Ready to process',
      icon: Check,
      iconClass: 'text-green-500'
    };
  };

  return (
    <div className="w-full space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2",
          isDragActive ? "border-primary-400 bg-primary-50" : "border-gray-300 hover:border-primary-300 hover:bg-gray-50",
          files.length > 0 && "border-gray-200 bg-gray-50",
        )}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center text-center">
          <div className={cn(
            "p-3 mb-2 rounded-full",
            isDragActive ? "bg-primary-100 text-primary-600" : "bg-gray-100 text-gray-500"
          )}>
            <UploadCloud className="h-6 w-6" />
          </div>
          
          <h3 className="font-medium text-gray-900">
            {isDragActive ? "Drop files to upload" : "Upload multiple documents"}
          </h3>
          
          <p className="mt-1 text-sm text-gray-500">
            {isDragActive 
              ? "Release to upload your files" 
              : "Drag and drop your files here, or click to browse"}
          </p>
          
          <p className="mt-2 text-xs text-gray-400">
            PDF files only (max. 10MB each)
          </p>
        </div>
      </div>
      
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-medium text-gray-700">Files to process ({files.length})</h4>
            
            {/* Show clear button if we have completed files */}
            {Object.values(fileStatuses).some(status => status.status === 'completed') && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onClearCompleted}
                className="text-gray-500 text-xs"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Clear completed
              </Button>
            )}
          </div>
          
          <div className="border rounded-lg overflow-hidden divide-y">
            {files.map((file, index) => {
              const fileStatus = getFileStatus(file);
              
              return (
                <div key={file.name} className={cn(
                  "p-3 flex items-center justify-between gap-3",
                  fileStatus.status === 'processing' ? "bg-blue-50" : 
                  fileStatus.status === 'completed' ? "bg-green-50" : 
                  fileStatus.status === 'error' ? "bg-red-50" : 
                  "bg-white"
                )}>
                  <div className="flex items-center gap-3 flex-grow min-w-0">
                    <div className="p-2 rounded-md bg-white shadow-sm">
                      <FileIcon className="h-5 w-5 text-red-500" />
                    </div>
                    
                    <div className="min-w-0 flex-grow">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span>{formatBytes(file.size)}</span>
                        
                        {fileStatus.status === 'processing' && (
                          <>
                            <span>•</span>
                            <div className="flex items-center gap-1">
                              <span>Processing: {fileStatus.progress || 0}%</span>
                            </div>
                          </>
                        )}
                        
                        {fileStatus.status !== 'processing' && (
                          <>
                            <span>•</span>
                            <div className="flex items-center gap-1">
                              {fileStatus.icon && <fileStatus.icon className={cn("h-3 w-3", fileStatus.iconClass)} />}
                              <span>{fileStatus.message}</span>
                            </div>
                          </>
                        )}
                      </div>
                      
                      {fileStatus.status === 'processing' && fileStatus.progress && (
                        <div className="mt-1">
                          <Progress value={fileStatus.progress} className="h-1" />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Only show remove button if not currently processing */}
                  {fileStatus.status !== 'processing' && (
                    <button
                      type="button"
                      onClick={() => onRemoveFile(file)}
                      className="p-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4 text-gray-500" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchUploader;
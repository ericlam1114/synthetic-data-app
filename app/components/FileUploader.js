// app/components/FileUploader.jsx
import React from 'react';
import { cn } from '../../lib/utils';
import { FileIcon, UploadCloud, X, AlertTriangle, Check } from 'lucide-react';
import { formatBytes } from '../utils/textHandler';

const FileUploader = ({ getRootProps, getInputProps, isDragActive, file, setFile }) => {
  // Calculate file status
  const getFileStatus = (file) => {
    if (!file) return null;
    
    // Check if file is too large (> 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return {
        valid: false,
        message: 'File exceeds maximum size of 10MB',
        icon: AlertTriangle,
        iconClass: 'text-amber-500'
      };
    }
    
    // Check if file is PDF
    if (file.type !== 'application/pdf') {
      return {
        valid: false,
        message: 'Only PDF files are supported',
        icon: AlertTriangle,
        iconClass: 'text-amber-500'
      };
    }
    
    // File is valid
    return {
      valid: true,
      message: 'Ready to process',
      icon: Check,
      iconClass: 'text-green-500'
    };
  };
  
  const fileStatus = file ? getFileStatus(file) : null;
  
  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2",
          isDragActive ? "border-primary-400 bg-primary-50" : "border-gray-300 hover:border-primary-300 hover:bg-gray-50",
          file && "border-gray-200 bg-gray-50",
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
            {isDragActive ? "Drop file to upload" : "Upload a document"}
          </h3>
          
          <p className="mt-1 text-sm text-gray-500">
            {isDragActive 
              ? "Release to upload your file" 
              : "Drag and drop your file here, or click to browse"}
          </p>
          
          <p className="mt-2 text-xs text-gray-400">
            PDF files only (max. 10MB)
          </p>
        </div>
      </div>
      
      {file && (
        <div className={cn(
          "mt-3 p-3 rounded-lg border flex items-center justify-between",
          fileStatus?.valid ? "bg-green-50 border-green-100" : "bg-amber-50 border-amber-100"
        )}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-white shadow-sm">
              <FileIcon className="h-5 w-5 text-red-500" />
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-900 truncate max-w-[240px]">
                {file.name}
              </p>
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <span>{formatBytes(file.size)}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  {fileStatus?.icon && <fileStatus.icon className={cn("h-3 w-3", fileStatus.iconClass)} />}
                  {fileStatus?.message}
                </span>
              </p>
            </div>
          </div>
          
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFile(null);
            }}
            className="p-1 rounded-full hover:bg-white transition-colors"
            aria-label="Remove file"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      )}
    </div>
  );
};

export default FileUploader;
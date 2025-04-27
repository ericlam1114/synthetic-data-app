// app/components/FileUploader.jsx
import React from 'react';
import { cn } from '../../lib/utils';
import { FileIcon, UploadCloud, X, AlertTriangle, Check } from 'lucide-react';
import { formatBytes } from '../utils/textHandler';
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { FileText, CheckCircle, AlertCircle } from "lucide-react";
import { Progress } from "../../components/ui/progress";

const FileUploader = ({
  getRootProps,
  getInputProps,
  isDragActive,
  files,
  onRemoveFile,
}) => {
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
  
  // Add console log here to check props on render
  console.log("[FileUploader] Rendering with props:", { files });
  
  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2",
          isDragActive ? "border-primary-400 bg-primary-50" : "border-gray-300 hover:border-primary-300 hover:bg-gray-50",
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
      
      {/* Only display list if files exist */}
      {files && files.length > 0 && (
        // Display multiple files list
        <div className="mt-4 text-left text-sm space-y-2">
          <p className="font-medium text-muted-foreground mb-2">Selected files ({files.length}):</p>
          <ul className="max-h-32 overflow-y-auto space-y-1 border rounded-md p-2 bg-gray-50">
            {files.map((f, index) => (
              <li key={`${f.name}-${index}`} className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-gray-100">
                <div className="flex items-center gap-1 overflow-hidden flex-grow mr-2">
                  <FileText className="h-3 w-3 flex-shrink-0 text-gray-500" />
                  <span className="truncate" title={f.name}>{f.name}</span>
            </div>
                <Button
                  variant="ghost"
                  size="sm"
            onClick={(e) => {
              e.stopPropagation();
                    if (onRemoveFile) {
                       onRemoveFile(f.name);
                    }
            }}
                  className="p-1 h-auto text-gray-500 hover:text-red-500 hover:bg-red-100 transition-colors flex-shrink-0"
                  aria-label={`Remove ${f.name}`}
          >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FileUploader;
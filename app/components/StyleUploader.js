// app/components/StyleUploader.js
import React from 'react';
import { cn } from '../../lib/utils';
import { FileIcon, UploadCloud, X, AlertTriangle, Check, FileText } from 'lucide-react';
import { formatBytes } from '../utils/textHandler';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { Info } from 'lucide-react';

const StyleUploader = ({ styleFile, setStyleFile, getRootProps, getInputProps, isDragActive }) => {
  // Calculate file status
  const getFileStatus = (file) => {
    if (!file) return null;
    
    // Check if file is too large (> 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return {
        valid: false,
        message: 'File exceeds maximum size of 5MB',
        icon: AlertTriangle,
        iconClass: 'text-amber-500'
      };
    }
    
    // Check if file has valid extension
    const validExtensions = ['pdf', 'docx', 'txt', 'doc'];
    const extension = file.name.split('.').pop().toLowerCase();
    if (!validExtensions.includes(extension)) {
      return {
        valid: false,
        message: 'Only PDF, DOCX, DOC and TXT files are supported',
        icon: AlertTriangle,
        iconClass: 'text-amber-500'
      };
    }
    
    // File is valid
    return {
      valid: true,
      message: 'Style sample ready',
      icon: Check,
      iconClass: 'text-green-500'
    };
  };
  
  const fileStatus = styleFile ? getFileStatus(styleFile) : null;
  
  return (
    <div className="w-full">
      <div className="flex items-center mb-2">
        <h4 className="font-medium text-gray-700">Writing Style Sample</h4>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="ml-2 h-4 w-4 text-gray-400 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-sm">
              <p className="text-sm">
                Upload a document that represents your organization&apos;s writing style. 
                The system will analyze this to generate variants in your preferred tone.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Examples: contract templates, policy documents, or standard agreements.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2",
          isDragActive ? "border-primary-400 bg-primary-50" : "border-gray-300 hover:border-primary-300 hover:bg-gray-50",
          styleFile && "border-gray-200 bg-gray-50",
        )}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center text-center">
          <div className={cn(
            "p-2 rounded-full",
            isDragActive ? "bg-primary-100 text-primary-600" : "bg-gray-100 text-gray-500"
          )}>
            <FileText className="h-5 w-5" />
          </div>
          
          <h3 className="font-medium text-gray-900 text-sm">
            {isDragActive ? "Drop style document" : "Upload a style reference document"}
          </h3>
          
          <p className="mt-1 text-xs text-gray-500">
            {isDragActive 
              ? "Release to upload your file" 
              : "PDF, DOCX, DOC or TXT (max. 5MB)"}
          </p>
        </div>
      </div>
      
      {styleFile && (
        <div className={cn(
          "mt-3 p-2 rounded-lg border flex items-center justify-between",
          fileStatus?.valid ? "bg-green-50 border-green-100" : "bg-amber-50 border-amber-100"
        )}>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-white shadow-sm">
              <FileIcon className="h-4 w-4 text-blue-500" />
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-900 truncate max-w-[240px]">
                {styleFile.name}
              </p>
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <span>{formatBytes(styleFile.size)}</span>
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
              setStyleFile(null);
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

export default StyleUploader;
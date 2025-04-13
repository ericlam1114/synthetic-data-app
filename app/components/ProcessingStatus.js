// components/ProcessingStatus.js
import React from 'react'
import { Check, Clock, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Separator } from '../../components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip'

function ProcessingStatus({ progress, stage, statusMessage }) {
  // Define stages for progress indicators
  const stages = [
    { id: 'uploading', label: 'Upload', description: 'Uploading document to secure storage', threshold: 5 },
    { id: 'extracting', label: 'Text Extraction', description: 'Extracting text from PDF with AWS Textract', threshold: 15 },
    { id: 'chunking', label: 'Text Chunking', description: 'Dividing document into processable chunks', threshold: 30 },
    { id: 'extraction', label: 'Clause Extraction', description: 'Finding legal clauses using trained extraction model', threshold: 50 },
    { id: 'classification', label: 'Classification', description: 'Categorizing clauses by importance', threshold: 70 },
    { id: 'generation', label: 'Variant Generation', description: 'Creating alternative phrasings with same legal meaning', threshold: 90 },
    { id: 'formatting', label: 'Formatting', description: 'Preparing final output in requested format', threshold: 100 }
  ];
  
  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="grid gap-2">
          {stages.map((stageItem) => {
            const isActive = stage === stageItem.id;
            const isCompleted = progress >= stageItem.threshold;
            const isPending = !isCompleted && !isActive;
            
            return (
              <div key={stageItem.id} className="grid grid-cols-[24px_1fr] items-start pb-4 last:pb-0">
                <div className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border",
                  isCompleted 
                    ? "border-green-500 bg-green-500 text-white" 
                    : isActive 
                      ? "border-primary-500 bg-primary-50 text-primary-500 animate-pulse" 
                      : "border-gray-200 bg-gray-100 text-gray-400"
                )}>
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : isActive ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Clock className="h-3.5 w-3.5" />
                  )}
                </div>
                
                <div className="ml-2 space-y-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center">
                        <p className={cn(
                          "text-sm font-medium",
                          isCompleted 
                            ? "text-green-600" 
                            : isActive 
                              ? "text-primary-600" 
                              : "text-gray-500"
                        )}>
                          {stageItem.label}
                        </p>
                        
                        {isActive && (
                          <span className="ml-2 text-xs bg-primary-50 text-primary-600 px-1.5 py-0.5 rounded-full">
                            In progress
                          </span>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <p>{stageItem.description}</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  {isActive && (
                    <p className="text-xs text-gray-500">{statusMessage}</p>
                  )}
                </div>
                
                {stageItem.id !== stages[stages.length - 1].id && (
                  <div className="ml-3 h-8 w-px bg-border col-start-1 row-start-2"></div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  )
}

export default ProcessingStatus
// components/ProcessingStatus.js
import React from 'react'
import { Check, Clock, Loader2, ArrowRight, Sparkles, FileText, Brain, Code, Database } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Separator } from '../../components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip'

function ProcessingStatus({ progress, stage, statusMessage }) {
  // Define stages for progress indicators with enhanced metadata
  const stages = [
    { 
      id: 'uploading', 
      label: 'Upload', 
      description: 'Uploading document to secure storage',
      threshold: 5,
      icon: FileText,
      color: 'blue'
    },
    { 
      id: 'extracting', 
      label: 'Text Extraction', 
      description: 'Extracting text from PDF with AWS Textract',
      threshold: 15,
      icon: Database,
      color: 'indigo'
    },
    { 
      id: 'chunking', 
      label: 'Text Chunking', 
      description: 'Dividing document into processable chunks',
      threshold: 30,
      icon: Code,
      color: 'violet'
    },
    { 
      id: 'extraction', 
      label: 'Clause Extraction', 
      description: 'Finding legal clauses using trained extraction model',
      threshold: 50,
      icon: Brain,
      color: 'purple'
    },
    { 
      id: 'classification', 
      label: 'Classification', 
      description: 'Categorizing clauses by importance',
      threshold: 70,
      icon: Brain,
      color: 'fuchsia'
    },
    { 
      id: 'generation', 
      label: 'Variant Generation', 
      description: 'Creating alternative phrasings with same legal meaning',
      threshold: 90,
      icon: Sparkles,
      color: 'pink'
    },
    { 
      id: 'formatting', 
      label: 'Formatting', 
      description: 'Preparing final output in requested format',
      threshold: 100,
      icon: Code,
      color: 'rose'
    }
  ];
  
  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="grid gap-2">
          {stages.map((stageItem, index) => {
            const isActive = stage === stageItem.id;
            const isCompleted = progress >= stageItem.threshold;
            const isPending = !isCompleted && !isActive;
            const nextStage = stages[index + 1];
            const showConnector = index < stages.length - 1;
            
            // Dynamic color classes based on state
            const stateColorClasses = {
              completed: {
                border: 'border-green-500',
                bg: 'bg-green-500',
                text: 'text-white',
                connector: 'bg-green-500'
              },
              active: {
                border: `border-${stageItem.color}-500`,
                bg: `bg-${stageItem.color}-50`,
                text: `text-${stageItem.color}-500`,
                connector: `bg-${stageItem.color}-200`
              },
              pending: {
                border: 'border-gray-200',
                bg: 'bg-gray-50',
                text: 'text-gray-400',
                connector: 'bg-gray-200'
              }
            };
            
            const currentState = isCompleted ? 'completed' : isActive ? 'active' : 'pending';
            const colorClasses = stateColorClasses[currentState];
            
            return (
              <div key={stageItem.id} className="relative">
                <div className="grid grid-cols-[24px_1fr] items-start pb-4 last:pb-0">
                  <div className={cn(
                    "relative flex h-6 w-6 items-center justify-center rounded-full border transition-all duration-300",
                    colorClasses.border,
                    colorClasses.bg,
                    colorClasses.text,
                    isActive && "ring-4 ring-opacity-20 ring-primary-500"
                  )}>
                    {isCompleted ? (
                      <Check className="h-3.5 w-3.5 transition-transform duration-200 ease-spring" />
                    ) : isActive ? (
                      <div className="relative">
                        <stageItem.icon className="h-3.5 w-3.5 animate-pulse" />
                        <div className="absolute inset-0 rounded-full animate-ping-slow opacity-75 bg-current" />
                      </div>
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                  </div>
                  
                  <div className="ml-2 space-y-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center">
                          <p className={cn(
                            "text-sm font-medium transition-colors duration-200",
                            isCompleted ? "text-green-600" : 
                            isActive ? `text-${stageItem.color}-600` : 
                            "text-gray-500"
                          )}>
                            {stageItem.label}
                          </p>
                          
                          {isActive && (
                            <span className={cn(
                              "ml-2 text-xs px-1.5 py-0.5 rounded-full transition-all duration-300",
                              `bg-${stageItem.color}-50 text-${stageItem.color}-600`
                            )}>
                              <div className="flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                In progress
                              </div>
                            </span>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p>{stageItem.description}</p>
                      </TooltipContent>
                    </Tooltip>
                    
                    {isActive && (
                      <div className="relative">
                        <p className="text-xs text-gray-500 animate-fade-in">
                          {statusMessage}
                        </p>
                        {nextStage && (
                          <div className={cn(
                            "absolute right-0 top-1/2 -translate-y-1/2 flex items-center text-xs text-gray-400 opacity-75",
                            "transition-opacity duration-300"
                          )}>
                            <span className="mr-1">Next:</span>
                            <nextStage.icon className="h-3 w-3 mr-1" />
                            {nextStage.label}
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Animated connector line */}
                {showConnector && (
                  <div className="absolute left-3 top-6 ml-px h-8 w-px">
                    <div className={cn(
                      "h-full w-full transition-all duration-300",
                      isCompleted ? "bg-green-500" : 
                      isActive ? `bg-${stageItem.color}-200` : 
                      "bg-gray-200"
                    )} />
                    {isActive && (
                      <div className={cn(
                        "absolute inset-0 animate-progress-pulse",
                        `bg-${stageItem.color}-400`
                      )} />
                    )}
                  </div>
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
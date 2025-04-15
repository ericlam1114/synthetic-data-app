// app/components/ProcessingStatus.js
import React from 'react';
import { Check, Clock, Loader2, ArrowRight, Sparkles, FileText, Brain, Code, Database, FileDigit, FileSearch } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Separator } from '../../components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { Progress } from '../../components/ui/progress';

function ProcessingStatus({ progress, stage, statusMessage, job }) {
  // Enhanced stages for progress indicators with detailed page processing
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
      id: 'downloading', 
      label: 'Ingesting', 
      description: 'Downloading document from storage',
      threshold: 10,
      icon: FileSearch,
      color: 'cyan'
    },
    { 
      id: 'extracting', 
      label: 'Text Extraction', 
      description: 'Extracting text from PDF with AI models',
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
      color: 'violet',
      subSteps: ['Creating chunks', 'Processing text', 'Optimizing memory']
    },
    { 
      id: 'processing', 
      label: 'Page Processing', 
      description: 'Processing document page by page',
      threshold: 50,
      icon: FileDigit,
      color: 'purple'
    },
    { 
      id: 'extraction', 
      label: 'Content Extraction', 
      description: 'Finding relevant content using trained models',
      threshold: 60,
      icon: Brain,
      color: 'purple'
    },
    { 
      id: 'classification', 
      label: 'Classification', 
      description: 'Categorizing extracted content by importance',
      threshold: 70,
      icon: Brain,
      color: 'fuchsia'
    },
    { 
      id: 'generation', 
      label: 'Content Generation', 
      description: 'Synthesizing upload into AI training data',
      threshold: 85,
      icon: Sparkles,
      color: 'pink'
    },
    { 
      id: 'merging', 
      label: 'Merging Results', 
      description: 'Combining page-level results into final output',
      threshold: 90,
      icon: Code,
      color: 'rose'
    },
    { 
      id: 'formatting', 
      label: 'Formatting', 
      description: 'Preparing final output in requested format',
      threshold: 95,
      icon: Code,
      color: 'rose'
    }
  ];
  
  // Determine the current sub-step for chunking stage (if active)
  const getChunkingSubStep = () => {
    if (stage !== 'chunking' && stage !== 'transition' && progress < 30) return null;
    
    const normalizedProgress = ((progress - 10) / 20) * 100; // Progress within chunking (10-30%)
    if (normalizedProgress < 33) return 0;
    if (normalizedProgress < 66) return 1;
    return 2;
  };
  
  // Get current sub-step for chunking
  const currentChunkingSubStep = getChunkingSubStep();

  // Filter out stages that are not relevant based on the current job info
  const getRelevantStages = () => {
    // Start with all stages
    let filteredStages = [...stages];
    
    // If this is page-by-page processing, adjust stages
    if (job?.totalPages) {
      // Enhance the processing stage with page info
      const processingStageIndex = filteredStages.findIndex(s => s.id === 'processing');
      if (processingStageIndex !== -1) {
        filteredStages[processingStageIndex].description = 
          `Processing ${job.totalPages} pages sequentially`;
        filteredStages[processingStageIndex].label = 'Page Processing';
      }
    } else if (job?.totalChunks) {
      // Enhance with chunk info
      const processingStageIndex = filteredStages.findIndex(s => s.id === 'processing');
      if (processingStageIndex !== -1) {
        filteredStages[processingStageIndex].description = 
          `Processing ${job.totalChunks} chunks sequentially`;
        filteredStages[processingStageIndex].label = 'Chunk Processing';
      }
    }
    
    return filteredStages;
  };
  
  const displayStages = getRelevantStages();
  
  // Page-by-page progress indicator
  const renderPageProgress = () => {
    if (!job?.totalPages) return null;
    
    const currentPage = job.currentPage || 0;
    const totalPages = job.totalPages || 1;
    const pagePercent = (currentPage / totalPages) * 100;
    
    return (
      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
        <h4 className="text-sm font-medium text-blue-800 mb-2">Page-by-Page Processing</h4>
        <div className="flex justify-between text-xs text-blue-700 mb-1">
          <span>Page {currentPage} of {totalPages}</span>
          <span>{pagePercent.toFixed(0)}% complete</span>
        </div>
        <Progress value={pagePercent} className="h-2 bg-blue-100" />
        <p className="mt-2 text-xs text-blue-600">{statusMessage}</p>
        
        {/* Show recently processed pages */}
        {job?.resultPaths && job.resultPaths.length > 0 && (
          <div className="mt-2">
            <div className="text-xs text-blue-700">Processed {job.resultPaths.length} pages so far</div>
          </div>
        )}
      </div>
    );
  };
  
  // Chunk processing indicator
  const renderChunkProgress = () => {
    if (!job?.totalChunks) return null;
    
    const currentChunk = job.currentChunk || 0;
    const totalChunks = job.totalChunks || 1;
    const chunkPercent = (currentChunk / totalChunks) * 100;
    
    return (
      <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-100">
        <h4 className="text-sm font-medium text-green-800 mb-2">Chunk-by-Chunk Processing</h4>
        <div className="flex justify-between text-xs text-green-700 mb-1">
          <span>Chunk {currentChunk} of {totalChunks}</span>
          <span>{chunkPercent.toFixed(0)}% complete</span>
        </div>
        <Progress value={chunkPercent} className="h-2 bg-green-100" />
        <p className="mt-2 text-xs text-green-600">{statusMessage}</p>
      </div>
    );
  };
  
  // Failed job with resume option
  const renderFailedJobInfo = () => {
    if (!job || job.status !== 'failed') return null;
    
    return (
      <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-100">
        <h4 className="text-sm font-medium text-red-800 mb-2">Processing Failed</h4>
        <p className="text-xs text-red-600 mb-2">{job.message || 'An error occurred during processing.'}</p>
        
        <div className="text-xs text-red-700">
          {job.resultPaths && job.resultPaths.length > 0 ? (
            <div>
              <p>Partial results available: {job.resultPaths.length} pages processed.</p>
              <p className="mt-2">You can resume processing from where it left off.</p>
            </div>
          ) : (
            <p>No partial results available. You can try processing again.</p>
          )}
        </div>
      </div>
    );
  };
  
  // Render resume info for timed out jobs
  const renderTimeoutInfo = () => {
    if (!job || job.status !== 'timeout') return null;
    
    return (
      <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-100">
        <h4 className="text-sm font-medium text-amber-800 mb-2">Processing Timed Out</h4>
        <p className="text-xs text-amber-600 mb-2">The processing job exceeded the maximum allowed time.</p>
        
        <div className="text-xs text-amber-700">
          {job.resultPaths && job.resultPaths.length > 0 ? (
            <div>
              <p>Partial results available: {job.resultPaths.length} pages processed.</p>
              <p className="mt-2">You can resume processing from where it left off.</p>
            </div>
          ) : (
            <p>No partial results available. You can try processing again with a smaller document.</p>
          )}
        </div>
      </div>
    );
  };
  
  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="grid gap-2">
          {displayStages.map((stageItem, index) => {
            // Determine if this stage is active
            const isActive = stage === stageItem.id;
            
            // Determine if this stage is completed based on progress
            const isCompleted = progress >= stageItem.threshold;
            
            const isPending = !isCompleted && !isActive;
            const nextStage = displayStages[index + 1];
            const showConnector = index < displayStages.length - 1;
            
            // Determine if we should show sub-steps for chunking
            const isChunkingWithSubsteps = stageItem.id === 'chunking' && progress >= 10 && progress < 30;
            
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
                        
                        {/* Display sub-steps for chunking stage */}
                        {stageItem.id === 'chunking' && stageItem.subSteps && (
                          <div className="mt-2 space-y-1 border-l-2 border-violet-200 pl-2">
                            {stageItem.subSteps.map((subStep, subIndex) => (
                              <div key={subIndex} className="flex items-center gap-1.5">
                                {subIndex < currentChunkingSubStep ? (
                                  <Check className="h-3 w-3 text-green-500" />
                                ) : subIndex === currentChunkingSubStep ? (
                                  <Loader2 className="h-3 w-3 text-violet-500 animate-spin" />
                                ) : (
                                  <div className="h-3 w-3 rounded-full border border-gray-300"></div>
                                )}
                                <span className={cn(
                                  "text-xs",
                                  subIndex < currentChunkingSubStep ? "text-green-600" : 
                                  subIndex === currentChunkingSubStep ? "text-violet-600" : 
                                  "text-gray-500"
                                )}>
                                  {subStep}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Show page progress if processing pages */}
                        {stageItem.id === 'processing' && job?.totalPages && (
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className="text-blue-600">
                              Page {job.currentPage || 0} of {job.totalPages}
                            </span>
                            <Progress 
                              value={((job.currentPage || 0) / job.totalPages) * 100} 
                              className="h-1 w-24" 
                            />
                          </div>
                        )}
                        
                        {/* Show chunk progress if processing chunks */}
                        {stageItem.id === 'processing' && job?.totalChunks && (
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className="text-green-600">
                              Chunk {job.currentChunk || 0} of {job.totalChunks}
                            </span>
                            <Progress 
                              value={((job.currentChunk || 0) / job.totalChunks) * 100} 
                              className="h-1 w-24" 
                            />
                          </div>
                        )}
                        
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
        
        {/* Add detailed page/chunk progress if available */}
        {renderPageProgress()}
        {renderChunkProgress()}
        
        {/* Add failed job info */}
        {renderFailedJobInfo()}
        {renderTimeoutInfo()}
        
        {/* Add memory monitoring display */}
        {stage === "memory" && (
          <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-md">
            <div className="text-sm font-medium mb-1 text-gray-700">Memory Usage</div>
            <div className="flex items-center gap-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    statusMessage?.includes('trend') && statusMessage.includes('increasing')
                      ? 'bg-amber-500 animate-pulse'
                      : statusMessage?.includes('critical')
                        ? 'bg-red-500'
                        : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(
                    parseInt(statusMessage?.match(/(\d+)MB/)?.[1] || '0') / 10, 
                    100
                  )}%` }}
                />
              </div>
              <span className="text-xs whitespace-nowrap">{
                statusMessage?.match(/(\d+)MB/)?.[0] || 'N/A'
              }</span>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export default ProcessingStatus;
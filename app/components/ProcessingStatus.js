// app/components/ProcessingStatus.js
import React from 'react';
import { Check, Clock, Loader2, ArrowRight, Sparkles, FileText, Brain, Code, Database, FileDigit, FileSearch } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Separator } from '../../components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { Progress } from '../../components/ui/progress';

function ProcessingStatus({ progress, stage, statusMessage, job, currentFileIndex, totalFiles }) {
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
      label: 'Synthetic Extraction', 
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
  
  // Render timeout warnings
  const renderTimeoutInfo = () => {
    // Display timeout warnings for jobs that have timeouts but aren't failed
    if (!job || !job.hasTimeouts) return null;
    
    const timeoutCount = job.timeoutCount || job.errors?.filter(e => e.type === 'timeout').length || 0;
    
    return (
      <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
        <h4 className="text-sm font-medium text-amber-800 mb-2">
          <Clock className="inline-block w-4 h-4 mr-1" />
          AI Processing Timeouts Detected
        </h4>
        
        <p className="text-xs text-amber-700 mb-2">
          {timeoutCount === 1 
            ? "1 page has experienced a timeout during processing." 
            : `${timeoutCount} pages have experienced timeouts during processing.`}
        </p>
        
        <div className="text-xs text-amber-800 space-y-1">
          <p>Timeouts typically occur with:</p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li>Very large or complex documents</li>
            <li>Pages containing dense tables or financial data</li>
            <li>Documents with unusual formatting</li>
          </ul>
          
          <p className="mt-2 font-medium">Recommendations:</p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li>Try processing smaller sections of the document</li>
            <li>Processing will continue with other pages</li>
            <li>The final output will include all successfully processed content</li>
          </ul>
        </div>
      </div>
    );
  };

  // Add a function to render error information about the job
  const renderErrorInfo = () => {
    // Don't show if job doesn't exist or has no errors (other than timeouts which are handled separately)
    if (!job || !job.errors || job.errors.length === 0) return null;
    
    // Count non-timeout errors
    const nonTimeoutErrors = job.errors.filter(e => e.type !== 'timeout');
    if (nonTimeoutErrors.length === 0) return null;
    
    return (
      <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
        <h4 className="text-sm font-medium text-red-800 mb-2">
          Processing Errors Detected
        </h4>
        
        <p className="text-xs text-red-700 mb-2">
          {nonTimeoutErrors.length === 1 
            ? "1 error occurred during processing." 
            : `${nonTimeoutErrors.length} errors occurred during processing.`}
        </p>
        
        {/* Show the most recent error message */}
        {job.lastError && (
          <div className="mb-2 p-2 bg-red-100 rounded text-xs text-red-800 font-mono">
            {job.lastError}
          </div>
        )}
        
        <div className="text-xs text-red-700">
          <p>Processing will continue with the remainder of the document.</p>
        </div>
      </div>
    );
  };

  // Add a function to render completion warnings (for jobs that completed with warnings)
  const renderCompletionWarnings = () => {
    if (!job || job.status !== 'completed_with_warnings') return null;
    
    return (
      <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
        <h4 className="flex items-center text-sm font-medium text-yellow-800 mb-2">
          <Check className="inline-block w-4 h-4 mr-1" />
          Processing Complete with Warnings
        </h4>
        
        <p className="text-xs text-yellow-700 mb-2">
          Your document was processed successfully but some parts may have been skipped due to processing limitations.
        </p>
        
        {job.timeoutCount > 0 && (
          <div className="text-xs text-yellow-800">
            <p>
              {job.timeoutCount === 1 
                ? "1 page experienced a timeout and may have incomplete results." 
                : `${job.timeoutCount} pages experienced timeouts and may have incomplete results.`}
            </p>
          </div>
        )}
        
        <div className="text-xs text-yellow-800 mt-2">
          <p>Your results are ready and include all successfully processed content.</p>
        </div>
      </div>
    );
  };

  // Determine if we are in batch mode for display
  const isBatchMode = totalFiles > 1;

  return (
    <div className="w-full max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex flex-col space-y-1.5">
        <h3 className="text-2xl font-semibold leading-none tracking-tight">
          {job?.status === 'completed' || job?.status === 'completed_with_warnings' ? (
            <span className="text-green-600 flex items-center">
              <Check className="mr-2 h-6 w-6" />
              Processing Complete
            </span>
          ) : job?.status === 'failed' ? (
            <span className="text-red-600">Processing Failed</span>
          ) : (
            <span className="flex items-center">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Processing Document
            </span>
          )}
        </h3>
        {/* Conditionally display the prominent batch status */}
        {isBatchMode && currentFileIndex !== undefined && (
            <p className="text-lg font-medium text-muted-foreground">
              Processing File {currentFileIndex + 1} of {totalFiles}
            </p>
        )}
        <p className="text-sm text-muted-foreground">{statusMessage}</p>
      </div>
      
      <div className="space-y-6">
        {/* Show timeout warnings if applicable */}
        {renderTimeoutInfo()}
        
        {/* Show errors if applicable */}
        {renderErrorInfo()}
        
        {/* Show completion warnings if applicable */}
        {renderCompletionWarnings()}
        
        {/* Show failed job info if applicable */}
        {renderFailedJobInfo()}
        
        {/* Show page progress for page-by-page processing */}
        {renderPageProgress()}
        
        {/* --- Remove Chunk Progress Display --- */}
        {/* {renderChunkProgress()} */}
        {/* ------------------------------------- */}
        
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Overall Progress</h4>
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress.toFixed(0)}% complete</span>
            <span>{stage}</span>
          </div>
        </div>
        
        <Separator />
        
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Processing Pipeline</h4>
          <div className="relative">
            {/* Processing steps with enhanced styling */}
            <ol className="relative border-l border-gray-200 dark:border-gray-700">
              {displayStages.map((s, i) => {
                const isCurrentStage = s.id === stage;
                const isCompleted = progress >= s.threshold;
                const isPrevious = progress < s.threshold && i > 0 && progress >= displayStages[i-1].threshold;
                
                // Determine color and icon to show
                let Component = isCompleted ? Check : isCurrentStage ? ArrowRight : s.icon;
                let colorClass = isCompleted 
                  ? 'bg-green-100 text-green-800 ring-green-50' 
                  : isCurrentStage || isPrevious
                    ? `bg-${s.color}-100 text-${s.color}-800 ring-${s.color}-50` 
                    : 'bg-gray-100 text-gray-500 ring-gray-50';
                
                if (isCurrentStage && progress < 100) {
                  Component = Loader2;
                  colorClass += ' animate-pulse';
                }
                
                return (
                  <li key={s.id} className="mb-6 ml-4">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span 
                            className={cn(
                              "absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full",
                              "ring-8 ring-white",
                              colorClass
                            )}
                          >
                            <Component className={cn(
                              "h-3.5 w-3.5",
                              {'animate-spin': isCurrentStage && Component === Loader2}
                            )} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p>{s.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <h3 className={cn(
                      "mb-1 ml-2 text-lg font-semibold",
                      isCompleted ? 'text-green-600' : 
                      isCurrentStage ? 'text-blue-600' : 
                      'text-gray-500'
                    )}>
                      {s.label}
                    </h3>
                    
                    {/* Show sub-steps for chunking */}
                    {s.id === 'chunking' && s.subSteps && isCurrentStage && (
                      <div className="mt-2 ml-2 space-y-1">
                        {s.subSteps.map((subStep, idx) => (
                          <div 
                            key={idx} 
                            className={cn(
                              "flex items-center text-xs",
                              idx === currentChunkingSubStep ? 'text-blue-600 font-medium' :
                              idx < currentChunkingSubStep ? 'text-green-600' : 'text-gray-500'
                            )}
                          >
                            {idx === currentChunkingSubStep && (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            )}
                            {idx < currentChunkingSubStep && (
                              <Check className="mr-1 h-3 w-3" />
                            )}
                            <span className={idx < currentChunkingSubStep ? 'line-through' : ''}>
                              {subStep}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProcessingStatus;
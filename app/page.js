// app/page.js (updated with batch processing)
"use client"

import { useState, useCallback, useEffect } from 'react'
import { useToast } from '../hooks/use-toast'
import PipelineConfigForm from './components/PipelineConfigForm';
import ProcessingStatus from './components/ProcessingStatus'
import ResultsViewer from './components/ResultsViewer'
import DataCanvas from './components/DataCanvas' // New component
import BatchUploader from './components/BatchUploader' // New component
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Button } from '../components/ui/button'
import { AlertCircle, CheckCircle2, Download } from 'lucide-react'

export default function Home() {
  const { toast } = useToast();
  
  // Single file state (for backward compatibility)
  const [file, setFile] = useState(null)
  
  // Batch processing state
  const [files, setFiles] = useState([])
  const [fileStatuses, setFileStatuses] = useState({})
  const [processingBatch, setProcessingBatch] = useState(false)
  const [currentFileIndex, setCurrentFileIndex] = useState(0)
  
  // Processing state
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  
  // Combined results for batch processing
  const [combinedResults, setCombinedResults] = useState(null)
  
  // Pipeline configuration options
  const [outputFormat, setOutputFormat] = useState('openai-jsonl')
  const [classFilter, setClassFilter] = useState('all')
  const [prioritizeImportant, setPrioritizeImportant] = useState(true)
  
  // UI state
  const [activeTab, setActiveTab] = useState('single')
  
  // Add state variables to track file keys
  const [fileKey, setFileKey] = useState(null);
  const [textKey, setTextKey] = useState(null);
  const [outputKey, setOutputKey] = useState(null);
  
  // Function to cleanup files in storage
  const cleanupStorage = async (keys = []) => {
    try {
      // Collect all file keys from this session
      const allKeys = [...keys];
      
      // Add current file key if applicable
      if (fileKey) {
        allKeys.push(fileKey);
      }
      
      // Add text key if applicable
      if (textKey) {
        allKeys.push(textKey);
      }
      
      // Add output key if applicable
      if (outputKey) {
        allKeys.push(outputKey);
      }
      
      // Call the cleanup API
      if (allKeys.length > 0) {
        const response = await fetch('/api/cleanup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ keys: allKeys })
        });
        
        if (!response.ok) {
          console.warn('Cleanup API returned an error:', await response.json());
        } else {
          console.log('Storage cleanup completed successfully');
        }
      }
    } catch (error) {
      console.error('Error cleaning up storage:', error);
      // Non-fatal error, don't throw
    }
  };
  
  // Add cleanup when component unmounts
  useEffect(() => {
    return () => {
      // Cleanup any files when component unmounts
      cleanupStorage();
    };
  }, []);
  
  // Handle removing a file from batch
  const handleRemoveFile = (fileToRemove) => {
    setFiles(prevFiles => prevFiles.filter(f => f !== fileToRemove));
    
    // Also remove from statuses
    setFileStatuses(prevStatuses => {
      const newStatuses = {...prevStatuses};
      delete newStatuses[fileToRemove.name];
      return newStatuses;
    });
  };
  
  // Handle clearing completed files
  const handleClearCompleted = () => {
    // Identify completed files
    const completedFiles = Object.entries(fileStatuses)
      .filter(([_, status]) => status.status === 'completed')
      .map(([fileName, _]) => fileName);
    
    // Remove completed files
    setFiles(prevFiles => prevFiles.filter(f => !completedFiles.includes(f.name)));
    
    // Update statuses
    setFileStatuses(prevStatuses => {
      const newStatuses = {...prevStatuses};
      completedFiles.forEach(fileName => {
        delete newStatuses[fileName];
      });
      return newStatuses;
    });
  };
  
  // Regular file upload handler
  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0]
      // Check if file is a PDF and within size limit (10MB)
      if (selectedFile.type !== 'application/pdf') {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF document",
          variant: "destructive",
        });
        return;
      }
      
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Maximum file size is 10MB",
          variant: "destructive",
        });
        return;
      }
      
      setFile(selectedFile)
      setError(null)
      
      toast({
        title: "File uploaded",
        description: `${selectedFile.name} is ready for processing`,
      });
    }
  }, [toast])
  
  // Process a single document
  const processDocument = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please upload a PDF file first",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true)
    setProgress(0)
    setStage('initializing')
    setStatusMessage('Preparing to process document...')
    setResults(null)
    setError(null)
    
    // Reset keys from previous runs
    setFileKey(null);
    setTextKey(null);
    setOutputKey(null);
    
    try {
      // Create a FormData object to send the file and options
      const formData = new FormData()
      formData.append('file', file)
      formData.append('options', JSON.stringify({
        outputFormat,
        classFilter,
        prioritizeImportant
      }))
      
      // Show initial toast
      toast({
        title: "Processing started",
        description: "Your document is being uploaded...",
      });
      
      // Upload file to S3 through the API
      setStage('uploading')
      setStatusMessage('Uploading document to secure storage...')
      setProgress(5)
      
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })
      
      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json()
        throw new Error(errorData.message || 'Failed to upload document')
      }
      
      const { fileKey: uploadedFileKey } = await uploadResponse.json()
      setFileKey(uploadedFileKey); // Save for cleanup later
      
      // Start text extraction with Textract
      setStage('extracting')
      setStatusMessage('Extracting text from document using AWS Textract...')
      setProgress(15)
      
      toast({
        title: "Text extraction",
        description: "Extracting text from your PDF...",
      });
      
      const extractResponse = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileKey: uploadedFileKey })
      })
      
      if (!extractResponse.ok) {
        const errorData = await extractResponse.json()
        
        // Cleanup uploaded file since extraction failed
        await cleanupStorage([uploadedFileKey]);
        
        throw new Error(errorData.message || 'Failed to extract text from document')
      }
      
      const { textKey: extractedTextKey } = await extractResponse.json()
      setTextKey(extractedTextKey); // Save for cleanup later
      
      // Start the synthetic data pipeline
      setStage('processing')
      setStatusMessage('Running document through synthetic data pipeline...')
      setProgress(30)
      
      toast({
        title: "Pipeline processing",
        description: "Running your document through the synthetic data pipeline...",
      });
      
      const pipelineResponse = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          textKey: extractedTextKey,
          outputFormat,
          classFilter,
          prioritizeImportant
        })
      })
      
      // Handle streaming response to show progress
      const reader = pipelineResponse.body.getReader()
      let progressChunks = []
      let resultData = null
      let decoder = new TextDecoder()
      let buffer = ''  // Add a buffer to handle incomplete JSON objects
      
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          // Process any remaining data in the buffer
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer.trim())
              if (data.type === "result") {
                resultData = data
              }
            } catch (e) {
              console.warn("Could not parse remaining buffer", e)
            }
          }
          break
        }
        
        // Add newly read data to buffer
        buffer += decoder.decode(value, { stream: true })
        
        // Try to extract complete JSON objects from the buffer
        let startPos = 0
        let objectEnd = -1
        
        // Keep processing until we can't find any more complete JSON objects
        while ((objectEnd = findNextJsonEnd(buffer, startPos)) !== -1) {
          try {
            const jsonString = buffer.substring(startPos, objectEnd + 1)
            const data = JSON.parse(jsonString)
            
            // Handle based on message type
            if (data.type === "progress") {
              // This is a progress update
              progressChunks.push(data)
              
              if (data.progress) {
                setProgress(30 + (data.progress * 0.7)) // Scale from 30% to 100%
              }
              
              if (data.stage) {
                setStage(data.stage)
              }
              
              if (data.message) {
                setStatusMessage(data.message)
              }
            } 
            else if (data.type === "result") {
              // This is the final result
              resultData = data
            }
            
            // Move startPos to the character after this JSON object
            startPos = objectEnd + 1
          } catch (e) {
            // If we hit a parse error, move startPos forward and try again
            console.warn("Error parsing JSON object: ", e)
            startPos++
          }
        }
        
        // Keep any remaining incomplete data in the buffer
        buffer = buffer.substring(startPos)
      }
      
      // Process the final result
      if (resultData) {
        // We have a properly formatted result
        setResults({ 
          data: resultData.data,
          format: resultData.format || outputFormat
        })
        
        // After successful processing, save output key and cleanup intermediate files
        if (resultData.outputKey) {
          setOutputKey(resultData.outputKey);
          
          // Cleanup intermediate files (PDF upload and extracted text)
          // But keep the output file for download
          await cleanupStorage([uploadedFileKey, extractedTextKey]);
        }
        
        toast({
          title: "Processing complete",
          description: "Your document has been successfully processed!",
        });
      } else {
        // Fallback handling if no proper result was received
        throw new Error("No valid result data received from the pipeline")
      }
      
      setProgress(100)
      setStatusMessage('Processing complete!')
      
    } catch (error) {
      console.error('Processing error:', error)
      
      // Cleanup any files created before the error
      await cleanupStorage();
      
      setError('An error occurred during processing: ' + error.message)
      
      toast({
        title: "Processing failed",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setProcessing(false)
    }
  }
  
  // Process batch of documents one by one
  const processBatch = async () => {
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please upload PDF files first",
        variant: "destructive",
      });
      return;
    }
    
    setProcessingBatch(true);
    setCurrentFileIndex(0);
    setCombinedResults(null);
    
    // Initialize combined results based on format
    let combinedOutput = '';
    
    // Process files one by one
    for (let i = 0; i < files.length; i++) {
      const currentFile = files[i];
      setCurrentFileIndex(i);
      
      // Skip already processed files
      if (fileStatuses[currentFile.name]?.status === 'completed') {
        continue;
      }
      
      // Update file status to processing
      setFileStatuses(prev => ({
        ...prev,
        [currentFile.name]: {
          status: 'processing',
          progress: 0,
          message: 'Starting processing...',
          icon: null,
          iconClass: '',
        }
      }));
      
      try {
        // Create a FormData object for this file
        const formData = new FormData();
        formData.append('file', currentFile);
        formData.append('options', JSON.stringify({
          outputFormat,
          classFilter,
          prioritizeImportant
        }));
        
        // Upload file
        setFileStatuses(prev => ({
          ...prev,
          [currentFile.name]: {
            ...prev[currentFile.name],
            progress: 5,
            message: 'Uploading to storage...',
          }
        }));
        
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json();
          throw new Error(errorData.message || 'Failed to upload document');
        }
        
        const { fileKey } = await uploadResponse.json();
        
        // Extract text
        setFileStatuses(prev => ({
          ...prev,
          [currentFile.name]: {
            ...prev[currentFile.name],
            progress: 15,
            message: 'Extracting text...',
          }
        }));
        
        const extractResponse = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileKey })
        });
        
        if (!extractResponse.ok) {
          const errorData = await extractResponse.json();
          throw new Error(errorData.message || 'Failed to extract text');
        }
        
        const { textKey } = await extractResponse.json();
        
        // Process with pipeline
        setFileStatuses(prev => ({
          ...prev,
          [currentFile.name]: {
            ...prev[currentFile.name],
            progress: 30,
            message: 'Running through pipeline...',
          }
        }));
        
        const pipelineResponse = await fetch('/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            textKey,
            outputFormat,
            classFilter,
            prioritizeImportant
          })
        });
        
        // Handle streaming response
        const reader = pipelineResponse.body.getReader();
        let resultData = null;
        let decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            // Process remaining buffer
            if (buffer.trim()) {
              try {
                const data = JSON.parse(buffer.trim());
                if (data.type === "result") {
                  resultData = data;
                }
              } catch (e) {
                console.warn("Could not parse remaining buffer", e);
              }
            }
            break;
          }
          
          buffer += decoder.decode(value, { stream: true });
          
          // Extract JSON objects
          let startPos = 0;
          let objectEnd = -1;
          
          while ((objectEnd = findNextJsonEnd(buffer, startPos)) !== -1) {
            try {
              const jsonString = buffer.substring(startPos, objectEnd + 1);
              const data = JSON.parse(jsonString);
              
              if (data.type === "progress") {
                // Update progress for this file
                setFileStatuses(prev => ({
                  ...prev,
                  [currentFile.name]: {
                    ...prev[currentFile.name],
                    progress: 30 + (data.progress * 0.7),
                    message: data.message || prev[currentFile.name].message,
                  }
                }));
              } 
              else if (data.type === "result") {
                resultData = data;
              }
              
              startPos = objectEnd + 1;
            } catch (e) {
              console.warn("Error parsing JSON object:", e);
              startPos++;
            }
          }
          
          buffer = buffer.substring(startPos);
        }
        
        // Process result
        if (resultData) {
          // Add to combined output based on format
          if (outputFormat === 'openai-jsonl' || outputFormat === 'jsonl') {
            // For JSONL formats, concatenate with newlines
            if (combinedOutput && !combinedOutput.endsWith('\n')) {
              combinedOutput += '\n';
            }
            combinedOutput += resultData.data;
          } 
          else if (outputFormat === 'json') {
            // For JSON format, merge arrays
            try {
              const newResults = JSON.parse(resultData.data);
              const existingResults = combinedOutput ? JSON.parse(combinedOutput) : [];
              
              // Combine arrays
              const combined = [...existingResults, ...newResults];
              combinedOutput = JSON.stringify(combined);
            } catch (e) {
              console.error('Error combining JSON results:', e);
              if (!combinedOutput) {
                combinedOutput = resultData.data;
              }
            }
          }
          else if (outputFormat === 'csv') {
            // For CSV, keep headers only once
            if (!combinedOutput) {
              // First file, include headers
              combinedOutput = resultData.data;
            } else {
              // Subsequent files, skip header row
              const lines = resultData.data.split('\n');
              if (lines.length > 1) {
                // Add all lines except the first (header)
                combinedOutput += '\n' + lines.slice(1).join('\n');
              }
            }
          }
          
          // Mark file as completed
          setFileStatuses(prev => ({
            ...prev,
            [currentFile.name]: {
              status: 'completed',
              progress: 100,
              message: 'Processing complete',
              icon: CheckCircle2,
              iconClass: 'text-green-500',
            }
          }));
        } else {
          throw new Error('No valid result received from pipeline');
        }
      } catch (error) {
        console.error(`Error processing ${currentFile.name}:`, error);
        
        // Mark file as error
        setFileStatuses(prev => ({
          ...prev,
          [currentFile.name]: {
            status: 'error',
            progress: 0,
            message: error.message || 'Processing failed',
            icon: AlertCircle,
            iconClass: 'text-red-500',
          }
        }));
        
        // Show toast but continue with next file
        toast({
          title: `Error processing ${currentFile.name}`,
          description: error.message || 'An unexpected error occurred',
          variant: 'destructive',
        });
      }
      
      // Small delay between files to avoid API rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // All files processed, set combined results
    if (combinedOutput) {
      setCombinedResults({
        data: combinedOutput,
        format: outputFormat
      });
      
      toast({
        title: 'Batch processing complete',
        description: `Successfully processed ${files.length} documents`,
      });
    }
    
    setProcessingBatch(false);
  };
  
  // Helper function to find the end position of a complete JSON object
  function findNextJsonEnd(str, startPos) {
    let braceCount = 0
    let inString = false
    let escapeNext = false
    
    for (let i = startPos; i < str.length; i++) {
      const char = str[i]
      
      if (escapeNext) {
        escapeNext = false
        continue
      }
      
      if (char === '\\' && inString) {
        escapeNext = true
        continue
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString
        continue
      }
      
      if (!inString) {
        if (char === '{') {
          braceCount++
        } else if (char === '}') {
          braceCount--
          
          // If we've closed all open braces, we've found a complete JSON object
          if (braceCount === 0) {
            return i
          }
        }
      }
    }
    
    // No complete JSON object found
    return -1
  }

  const downloadResults = (resultsToDownload) => {
    if (!resultsToDownload) return
    
    let downloadContent = ''
    let fileName = `legal_synthetic_data_${new Date().toISOString().slice(0,10)}`
    
    // Format content based on the output format
    if (outputFormat === 'jsonl' || outputFormat === 'openai-jsonl') {
      downloadContent = resultsToDownload.data
      fileName += '.jsonl'
    } else if (outputFormat === 'json') {
      downloadContent = JSON.stringify(resultsToDownload.data, null, 2)
      fileName += '.json'
    } else if (outputFormat === 'csv') {
      downloadContent = resultsToDownload.data
      fileName += '.csv'
    }
    
    const blob = new Blob([downloadContent], { 
      type: outputFormat.includes('json') 
        ? 'application/json' 
        : outputFormat === 'csv' 
          ? 'text/csv' 
          : 'text/plain' 
    })
    
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    toast({
      title: "Download started",
      description: `${fileName} is being downloaded`,
    });
    
    // After download is initiated, clean up any remaining files
    // including the output file since it's now downloaded
    if (outputKey) {
      cleanupStorage([outputKey]);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Tabs
        defaultValue="single"
        value={activeTab}
        onValueChange={setActiveTab}
        className="mb-6"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="single">Single Document</TabsTrigger>
          <TabsTrigger value="batch">Batch Processing</TabsTrigger>
        </TabsList>
        
        <TabsContent value="single" className="pt-4">
          <PipelineConfigForm
            file={file}
            setFile={setFile}
            getRootProps={getRootProps}
            getInputProps={getInputProps}
            isDragActive={isDragActive}
            outputFormat={outputFormat}
            setOutputFormat={setOutputFormat}
            classFilter={classFilter}
            setClassFilter={setClassFilter}
            prioritizeImportant={prioritizeImportant}
            setPrioritizeImportant={setPrioritizeImportant}
            processing={processing}
            onSubmit={processDocument}
          />
        </TabsContent>
        
        <TabsContent value="batch" className="pt-4">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Batch Document Upload
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BatchUploader
                files={files}
                setFiles={setFiles}
                onRemoveFile={handleRemoveFile}
                fileStatuses={fileStatuses}
                processingBatch={processingBatch}
                onClearCompleted={handleClearCompleted}
              />
            </CardContent>
            <CardFooter className="flex justify-between">
              <div className="flex items-center text-sm text-muted-foreground">
                {files.length > 0 ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                    {`Ready to process ${files.length} documents`}
                  </>
                ) : (
                  <>
                    <AlertCircle className="mr-2 h-4 w-4" />
                    {"Upload PDF files to begin"}
                  </>
                )}
              </div>
              <Button 
                type="submit" 
                disabled={processingBatch || files.length === 0}
                className="min-w-[180px] bg-black text-white hover:bg-black/90"
                onClick={processBatch}
              >
                {processingBatch ? `Processing (${currentFileIndex + 1}/${files.length})...` : "Process All Documents"}
              </Button>
            </CardFooter>
          </Card>
          
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Pipeline Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Output Format</label>
                  <select 
                    value={outputFormat} 
                    onChange={(e) => setOutputFormat(e.target.value)}
                    className="w-full border rounded p-2"
                    disabled={processingBatch}
                  >
                    <option value="openai-jsonl">OpenAI Fine-tuning JSONL</option>
                    <option value="jsonl">Standard JSONL</option>
                    <option value="json">JSON</option>
                    <option value="csv">CSV</option>
                  </select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Clause Filter Level</label>
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <input 
                        type="radio" 
                        id="all-batch" 
                        value="all" 
                        checked={classFilter === "all"} 
                        onChange={() => setClassFilter("all")} 
                        disabled={processingBatch}
                        className="mr-2"
                      />
                      <label htmlFor="all-batch">All Clauses</label>
                    </div>
                    <div className="flex items-center">
                      <input 
                        type="radio" 
                        id="critical-batch" 
                        value="critical_only" 
                        checked={classFilter === "critical_only"} 
                        onChange={() => setClassFilter("critical_only")} 
                        disabled={processingBatch}
                        className="mr-2"
                      />
                      <label htmlFor="critical-batch">Critical Clauses Only</label>
                    </div>
                    <div className="flex items-center">
                      <input 
                        type="radio" 
                        id="important-batch" 
                        value="important_plus" 
                        checked={classFilter === "important_plus"} 
                        onChange={() => setClassFilter("important_plus")} 
                        disabled={processingBatch}
                        className="mr-2"
                      />
                      <label htmlFor="important-batch">Important & Critical Clauses</label>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Processing Priority</label>
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      id="prioritize-batch" 
                      checked={prioritizeImportant} 
                      onChange={(e) => setPrioritizeImportant(e.target.checked)} 
                      disabled={processingBatch}
                      className="mr-2"
                    />
                    <label htmlFor="prioritize-batch" className="text-sm">
                      Prioritize important clauses during processing
                    </label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {error && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-red-800 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}
      
      {activeTab === 'single' && (processing || progress > 0) && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              {progress === 100 ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <div className="h-5 w-5 animate-pulse rounded-full bg-primary-500" />
              )}
              Processing Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{progress.toFixed(0)}% complete</span>
                <span className="text-gray-500">{stage ? stage.charAt(0).toUpperCase() + stage.slice(1) : 'Processing'}</span>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-gray-600 mt-1">{statusMessage}</p>
            </div>
            
            <ProcessingStatus 
              progress={progress} 
              stage={stage}
              statusMessage={statusMessage} 
            />
          </CardContent>
        </Card>
      )}
      
      {/* For single document mode */}
      {activeTab === 'single' && results && (
        <>
          <DataCanvas 
            data={results.data} 
            format={results.format || outputFormat} 
          />
          
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Results</CardTitle>
              <Button 
                onClick={() => downloadResults(results)} 
                className="bg-primary-100 text-primary-700 hover:bg-primary-200"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Results
              </Button>
            </CardHeader>
            <CardContent>
              <ResultsViewer 
                results={results} 
                format={outputFormat} 
              />
            </CardContent>
          </Card>
        </>
      )}
      
      {/* For batch mode */}
      {activeTab === 'batch' && combinedResults && (
        <>
          <DataCanvas 
            data={combinedResults.data} 
            format={combinedResults.format || outputFormat} 
          />
          
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Combined Results</CardTitle>
              <Button 
                onClick={() => downloadResults(combinedResults)} 
                className="bg-primary-100 text-primary-700 hover:bg-primary-200"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Combined Results
              </Button>
            </CardHeader>
            <CardContent>
              <ResultsViewer 
                results={combinedResults} 
                format={outputFormat} 
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
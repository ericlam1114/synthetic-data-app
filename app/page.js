// app/page.js (updated with new components)
"use client"

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useToast } from '../hooks/use-toast'
import PipelineConfigForm from './components/PipelineConfigForm';
import ProcessingStatus from './components/ProcessingStatus'
import ResultsViewer from './components/ResultsViewer'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

export default function Home() {
  const { toast } = useToast();
  const [file, setFile] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  
  // Pipeline configuration options
  const [outputFormat, setOutputFormat] = useState('openai-jsonl')
  const [classFilter, setClassFilter] = useState('all')
  const [prioritizeImportant, setPrioritizeImportant] = useState(true)
  
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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    multiple: false
  })

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
      
      const { fileKey } = await uploadResponse.json()
      
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
        body: JSON.stringify({ fileKey })
      })
      
      if (!extractResponse.ok) {
        const errorData = await extractResponse.json()
        throw new Error(errorData.message || 'Failed to extract text from document')
      }
      
      const { textKey } = await extractResponse.json()
      
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
          textKey,
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
      
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          break
        }
        
        // Decode the chunk and parse it
        const chunk = decoder.decode(value, { stream: true })
        
        try {
          // Try to parse the chunk as JSON
          const data = JSON.parse(chunk)
          
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
        } catch (e) {
          console.error("Error parsing chunk:", e)
          // Could be partial chunk, will be handled in final processing
        }
      }
      
      // Process the final result
      if (resultData) {
        // We have a properly formatted result
        setResults({ 
          data: resultData.data,
          format: resultData.format || outputFormat
        })
        
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

  const downloadResults = () => {
    if (!results) return
    
    let downloadContent = ''
    let fileName = `legal_synthetic_data_${new Date().toISOString().slice(0,10)}`
    
    // Format content based on the output format
    if (outputFormat === 'jsonl' || outputFormat === 'openai-jsonl') {
      downloadContent = results.data
      fileName += '.jsonl'
    } else if (outputFormat === 'json') {
      downloadContent = JSON.stringify(results.data, null, 2)
      fileName += '.json'
    } else if (outputFormat === 'csv') {
      downloadContent = results.data
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
  }

  return (
    <div className="max-w-4xl mx-auto">
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
      
      {(processing || progress > 0) && (
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
      
      {results && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Results</CardTitle>
            <button 
              onClick={downloadResults} 
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-primary-100 text-primary-700 hover:bg-primary-200 h-9 px-4 py-2"
            >
              Download Results
            </button>
          </CardHeader>
          <CardContent>
            <ResultsViewer 
              results={results} 
              format={outputFormat} 
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
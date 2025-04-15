// app/page.js (updated with batch processing)
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useToast } from "../hooks/use-toast";
import PipelineConfigForm from "./components/PipelineConfigForm";
import ProcessingStatus from "./components/ProcessingStatus";
import ResultsViewer from "./components/ResultsViewer";
import DataCanvas from "./components/DataCanvas"; // New component
import BatchUploader from "./components/BatchUploader"; // New component
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import FinanceSyntheticDataPipeline from "./lib/FinanceSyntheticDataPipeline";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import PipelineSelector from "./components/PipelineSelector";
import { Separator } from "../components/ui/separator";
import { Label } from "../components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import { Checkbox } from "../components/ui/checkbox";
import { Info } from "lucide-react";
import { TooltipProvider } from "../components/ui/tooltip";

export default function Home() {
  const { toast } = useToast();

  // Single file state (for backward compatibility)
  const [file, setFile] = useState(null);

  // Batch processing state
  const [files, setFiles] = useState([]);
  const [fileStatuses, setFileStatuses] = useState({});
  const [processingBatch, setProcessingBatch] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [styleFile, setStyleFile] = useState(null);
  const [styleFileKey, setStyleFileKey] = useState(null);
  const [styleSample, setStyleSample] = useState(null);

  // Combined results for batch processing
  const [combinedResults, setCombinedResults] = useState(null);

  // Pipeline configuration options
  const [outputFormat, setOutputFormat] = useState("openai-jsonl");
  const [classFilter, setClassFilter] = useState("all");
  const [prioritizeImportant, setPrioritizeImportant] = useState(true);
  const [pipelineType, setPipelineType] = useState("legal");

  // UI state
  const [activeTab, setActiveTab] = useState("single");

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
        const response = await fetch("/api/cleanup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ keys: allKeys }),
        });

        if (!response.ok) {
          console.warn("Cleanup API returned an error:", await response.json());
        } else {
          console.log("Storage cleanup completed successfully");
        }
      }
    } catch (error) {
      console.error("Error cleaning up storage:", error);
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

  // Client-side memory monitor
  const [browserMemoryWarning, setBrowserMemoryWarning] = useState(false);

  // Setup memory monitoring for browser
  useEffect(() => {
    // Only works in Chrome
    if (window.performance && window.performance.memory) {
      const memoryCheck = setInterval(() => {
        const memoryInfo = window.performance.memory;
        if (memoryInfo) {
          const usedHeapSize = memoryInfo.usedJSHeapSize;
          const totalHeapSize = memoryInfo.jsHeapSizeLimit;

          // If using more than 80% of available heap
          if (usedHeapSize > totalHeapSize * 0.8) {
            setBrowserMemoryWarning(true);

            // Show toast
            toast({
              title: "High browser memory usage",
              description:
                "Try refreshing the page if performance becomes slow",
              variant: "warning",
            });
          } else {
            setBrowserMemoryWarning(false);
          }
        }
      }, 10000); // Check every 10 seconds

      return () => clearInterval(memoryCheck);
    }
  }, [toast]);

  // Handle removing a file from batch
  const handleRemoveFile = (fileToRemove) => {
    setFiles((prevFiles) => prevFiles.filter((f) => f !== fileToRemove));

    // Also remove from statuses
    setFileStatuses((prevStatuses) => {
      const newStatuses = { ...prevStatuses };
      delete newStatuses[fileToRemove.name];
      return newStatuses;
    });
  };

  // Handle clearing completed files
  const handleClearCompleted = () => {
    // Identify completed files
    const completedFiles = Object.entries(fileStatuses)
      .filter(([_, status]) => status.status === "completed")
      .map(([fileName, _]) => fileName);

    // Remove completed files
    setFiles((prevFiles) =>
      prevFiles.filter((f) => !completedFiles.includes(f.name))
    );

    // Update statuses
    setFileStatuses((prevStatuses) => {
      const newStatuses = { ...prevStatuses };
      completedFiles.forEach((fileName) => {
        delete newStatuses[fileName];
      });
      return newStatuses;
    });
  };

  // Regular file upload handler
  const onDrop = useCallback(
    (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        const selectedFile = acceptedFiles[0];
        // Check if file is a PDF and within size limit (10MB)
        if (selectedFile.type !== "application/pdf") {
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

        setFile(selectedFile);
        setError(null);

        toast({
          title: "File uploaded",
          description: `${selectedFile.name} is ready for processing`,
        });
      }
    },
    [toast]
  );

  // Setup dropzone for file uploads after onDrop is defined
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: false,
  });

  // Setup dropzone for style file uploads
  const {
    getRootProps: getStyleRootProps,
    getInputProps: getStyleInputProps,
    isDragActive: isStyleDragActive,
  } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setStyleFile(acceptedFiles[0]);
      }
    },
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
      "application/msword": [".doc"],
      "text/plain": [".txt"],
    },
    maxSize: 5 * 1024 * 1024, // 5MB
    multiple: false,
  });

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

    setProcessing(true);
    setProgress(0);
    setStage("initializing");
    setStatusMessage("Preparing to process document...");
    setResults(null);
    setError(null);

    // Reset keys from previous runs
    setFileKey(null);
    setTextKey(null);
    setOutputKey(null);

    try {
      // Create a FormData object to send the file and options
      const formData = new FormData();
      formData.append("file", file);
      formData.append(
        "options",
        JSON.stringify({
          pipelineType,
          outputFormat,
          classFilter,
          prioritizeImportant,
        })
      );

      // Show initial toast
      toast({
        title: "Processing started",
        description: "Your document is being uploaded...",
      });

      // Upload file to S3 through the API
      setStage("uploading");
      setStatusMessage("Uploading document to secure storage...");
      setProgress(5);

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.message || "Failed to upload document");
      }

      const { fileKey: uploadedFileKey } = await uploadResponse.json();
      setFileKey(uploadedFileKey); // Save for cleanup later

      // Start text extraction with Textract
      setStage("extracting");
      setStatusMessage("Extracting text from document using AI models...");
      setProgress(15);

      toast({
        title: "Text extraction",
        description: "Extracting text from your PDF...",
      });

      const extractResponse = await fetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileKey: uploadedFileKey }),
      });

      if (!extractResponse.ok) {
        const errorData = await extractResponse.json();

        // Cleanup uploaded file since extraction failed
        await cleanupStorage([uploadedFileKey]);

        throw new Error(
          errorData.message || "Failed to extract text from document"
        );
      }

      const { textKey: extractedTextKey } = await extractResponse.json();
      setTextKey(extractedTextKey); // Save for cleanup later

      // Start the processing job (now using the queue system)
      setStage("processing");
      setStatusMessage("Starting document processing in background...");
      setProgress(30);

      toast({
        title: "Pipeline processing",
        description: "Document processing has started in the background...",
      });

      const pipelineResponse = await fetch("/api/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          textKey: extractedTextKey,
          pipelineType,
          outputFormat,
          classFilter,
          prioritizeImportant,
          orgStyleSample: styleSample,
        }),
      });

      if (!pipelineResponse.ok) {
        const errorData = await pipelineResponse.json();
        throw new Error(errorData.message || "Failed to start processing");
      }

      const { jobId, pollUrl } = await pipelineResponse.json();

      // Start polling for job status
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(pollUrl);
          if (!statusResponse.ok) {
            console.error(
              "Error polling job status:",
              await statusResponse.text()
            );
            return;
          }

          const jobStatus = await statusResponse.json();

          // Update progress and status
          if (jobStatus.progress) {
            setProgress(jobStatus.progress);
          }

          if (jobStatus.progressMessage) {
            setStatusMessage(jobStatus.progressMessage);
          }

          if (jobStatus.status === "running") {
            setStage(jobStatus.stage || "processing");
          } else if (jobStatus.status === "completed") {
            // Job completed successfully
            clearInterval(pollInterval);

            // Set final progress
            setProgress(100);
            setStage("complete");
            setStatusMessage("Processing complete!");

            // Set results
            setResults({
              data: jobStatus.result?.output || "",
              format: jobStatus.result?.format || outputFormat,
            });

            // Set output key
            if (jobStatus.result?.outputKey) {
              setOutputKey(jobStatus.result.outputKey);
            }

            toast({
              title: "Processing complete",
              description: "Your document has been successfully processed!",
            });

            setProcessing(false);
          } else if (jobStatus.status === "failed") {
            // Job failed
            clearInterval(pollInterval);

            setError(
              "An error occurred during processing: " +
                (jobStatus.error || "Unknown error")
            );

            toast({
              title: "Processing failed",
              description: jobStatus.error || "An unexpected error occurred",
              variant: "destructive",
            });

            setProcessing(false);
          }
        } catch (pollError) {
          console.error("Error polling job status:", pollError);
        }
      }, 2000); // Poll every 2 seconds

      // Set a maximum polling time of 15 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        // Only stop if we haven't completed yet
        if (processing) {
          setError(
            "Processing timeout after 15 minutes. The job may still be running in the background."
          );
          setProcessing(false);

          toast({
            title: "Processing timeout",
            description:
              "The job is taking longer than expected. Check back later for results.",
            variant: "warning",
          });
        }
      }, 15 * 60 * 1000);
    } catch (error) {
      console.error("Processing error:", error);

      // Cleanup any files created before the error
      await cleanupStorage();

      setError("An error occurred during processing: " + error.message);

      toast({
        title: "Processing failed",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });

      setProcessing(false);
    }
  };

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
    let combinedOutput = "";

    // Process files one by one
    for (let i = 0; i < files.length; i++) {
      const currentFile = files[i];
      setCurrentFileIndex(i);

      // Skip already processed files
      if (fileStatuses[currentFile.name]?.status === "completed") {
        continue;
      }

      // Update file status to processing
      setFileStatuses((prev) => ({
        ...prev,
        [currentFile.name]: {
          status: "processing",
          progress: 0,
          message: "Starting processing...",
          icon: null,
          iconClass: "",
        },
      }));

      try {
        // Create a FormData object for this file
        const formData = new FormData();
        formData.append("file", currentFile);
        formData.append(
          "options",
          JSON.stringify({
            pipelineType,
            outputFormat,
            classFilter,
            prioritizeImportant,
          })
        );

        // Upload file
        setFileStatuses((prev) => ({
          ...prev,
          [currentFile.name]: {
            ...prev[currentFile.name],
            progress: 5,
            message: "Uploading to storage...",
          },
        }));

        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json();
          throw new Error(errorData.message || "Failed to upload document");
        }

        const { fileKey } = await uploadResponse.json();

        // Extract text
        setFileStatuses((prev) => ({
          ...prev,
          [currentFile.name]: {
            ...prev[currentFile.name],
            progress: 15,
            message: "Extracting text...",
          },
        }));

        const extractResponse = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileKey }),
        });

        if (!extractResponse.ok) {
          const errorData = await extractResponse.json();
          throw new Error(errorData.message || "Failed to extract text");
        }

        const { textKey } = await extractResponse.json();

        // Process with pipeline
        setFileStatuses((prev) => ({
          ...prev,
          [currentFile.name]: {
            ...prev[currentFile.name],
            progress: 30,
            message: "Running through pipeline...",
          },
        }));

        const pipelineResponse = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            textKey,
            pipelineType,
            outputFormat,
            classFilter,
            prioritizeImportant,
          }),
        });

        // Handle streaming response
        const reader = pipelineResponse.body.getReader();
        let resultData = null;
        let decoder = new TextDecoder();
        let buffer = "";

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
                setFileStatuses((prev) => ({
                  ...prev,
                  [currentFile.name]: {
                    ...prev[currentFile.name],
                    progress: 30 + data.progress * 0.7,
                    message: data.message || prev[currentFile.name].message,
                  },
                }));
              } else if (data.type === "result") {
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
          if (outputFormat === "openai-jsonl" || outputFormat === "jsonl") {
            // For JSONL formats, concatenate with newlines
            if (combinedOutput && !combinedOutput.endsWith("\n")) {
              combinedOutput += "\n";
            }
            combinedOutput += resultData.data;
          } else if (outputFormat === "json") {
            // For JSON format, merge arrays
            try {
              const newResults = JSON.parse(resultData.data);
              const existingResults = combinedOutput
                ? JSON.parse(combinedOutput)
                : [];

              // Combine arrays
              const combined = [...existingResults, ...newResults];
              combinedOutput = JSON.stringify(combined);
            } catch (e) {
              console.error("Error combining JSON results:", e);
              if (!combinedOutput) {
                combinedOutput = resultData.data;
              }
            }
          } else if (outputFormat === "csv") {
            // For CSV, keep headers only once
            if (!combinedOutput) {
              // First file, include headers
              combinedOutput = resultData.data;
            } else {
              // Subsequent files, skip header row
              const lines = resultData.data.split("\n");
              if (lines.length > 1) {
                // Add all lines except the first (header)
                combinedOutput += "\n" + lines.slice(1).join("\n");
              }
            }
          }

          // Mark file as completed
          setFileStatuses((prev) => ({
            ...prev,
            [currentFile.name]: {
              status: "completed",
              progress: 100,
              message: "Processing complete",
              icon: CheckCircle2,
              iconClass: "text-green-500",
            },
          }));
        } else {
          throw new Error("No valid result received from pipeline");
        }
      } catch (error) {
        console.error(`Error processing ${currentFile.name}:`, error);

        // Mark file as error
        setFileStatuses((prev) => ({
          ...prev,
          [currentFile.name]: {
            status: "error",
            progress: 0,
            message: error.message || "Processing failed",
            icon: AlertCircle,
            iconClass: "text-red-500",
          },
        }));

        // Show toast but continue with next file
        toast({
          title: `Error processing ${currentFile.name}`,
          description: error.message || "An unexpected error occurred",
          variant: "destructive",
        });
      }

      // Small delay between files to avoid API rate limits
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // All files processed, set combined results
    if (combinedOutput) {
      setCombinedResults({
        data: combinedOutput,
        format: outputFormat,
      });

      toast({
        title: "Batch processing complete",
        description: `Successfully processed ${files.length} documents`,
      });
    }

    setProcessingBatch(false);
  };

  // Helper function to find the end position of a complete JSON object
  function findNextJsonEnd(str, startPos) {
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = startPos; i < str.length; i++) {
      const char = str[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\" && inString) {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "{") {
          braceCount++;
        } else if (char === "}") {
          braceCount--;

          // If we've closed all open braces, we've found a complete JSON object
          if (braceCount === 0) {
            return i;
          }
        }
      }
    }

    // No complete JSON object found
    return -1;
  }

  const downloadResults = (resultsToDownload) => {
    if (!resultsToDownload) return;

    let downloadContent = "";
    let fileName = `legal_synthetic_data_${new Date()
      .toISOString()
      .slice(0, 10)}`;

    // Format content based on the output format
    if (outputFormat === "jsonl" || outputFormat === "openai-jsonl") {
      downloadContent = resultsToDownload.data;
      fileName += ".jsonl";
    } else if (outputFormat === "json") {
      downloadContent = JSON.stringify(resultsToDownload.data, null, 2);
      fileName += ".json";
    } else if (outputFormat === "csv") {
      downloadContent = resultsToDownload.data;
      fileName += ".csv";
    }

    const blob = new Blob([downloadContent], {
      type: outputFormat.includes("json")
        ? "application/json"
        : outputFormat === "csv"
        ? "text/csv"
        : "text/plain",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Download started",
      description: `${fileName} is being downloaded`,
    });

    // After download is initiated, clean up any remaining files
    // including the output file since it's now downloaded
    if (outputKey) {
      cleanupStorage([outputKey]);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Browser memory warning */}
      {browserMemoryWarning && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 animate-pulse">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <h4 className="font-medium text-red-700">
                High memory usage detected
              </h4>
              <p className="text-sm text-red-600">
                This browser tab is using a lot of memory. You may want to
                refresh the page if you experience slowdowns.
              </p>
            </div>
          </div>
        </div>
      )}

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
            styleFile={styleFile}
            setStyleFile={setStyleFile}
            getStyleRootProps={getStyleRootProps}
            getStyleInputProps={getStyleInputProps}
            isStyleDragActive={isStyleDragActive}
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
                {processingBatch
                  ? `Processing (${currentFileIndex + 1}/${files.length})...`
                  : "Process All Documents"}
              </Button>
            </CardFooter>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Pipeline Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <TooltipProvider>
                {/* Pipeline Type Selector */}
                <PipelineSelector
                  pipelineType={pipelineType}
                  setPipelineType={setPipelineType}
                  disabled={processingBatch}
                />

                <Separator />

                {/* Output Format Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="output-format-batch"
                      className="text-base font-medium"
                    >
                      Output Format
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-sm">
                        <p className="font-medium">
                          Choose the format of the generated output:
                        </p>
                        <ul className="list-disc pl-4 mt-1 space-y-2">
                          <li>
                            <span className="font-medium">
                              OpenAI Fine-tuning JSONL
                            </span>
                            <p className="text-sm text-muted-foreground">
                              Ready for OpenAI fine-tuning (GPT-3.5, GPT-4).
                              Includes system prompts and role-based formatting.
                            </p>
                          </li>
                          <li>
                            <span className="font-medium">Standard JSONL</span>
                            <p className="text-sm text-muted-foreground">
                              Each line is a JSON object. Compatible with most
                              ML frameworks (Hugging Face, TensorFlow, PyTorch).
                            </p>
                          </li>
                          <li>
                            <span className="font-medium">JSON</span>
                            <p className="text-sm text-muted-foreground">
                              Single JSON array. Universal format for any model
                              or framework. Good for data analysis and custom
                              processing.
                            </p>
                          </li>
                          <li>
                            <span className="font-medium">CSV</span>
                            <p className="text-sm text-muted-foreground">
                              Comma-separated values. Compatible with
                              spreadsheet software and tabular ML models
                              (scikit-learn, pandas).
                            </p>
                          </li>
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Select
                    value={outputFormat}
                    onValueChange={setOutputFormat}
                    disabled={processingBatch}
                  >
                    <SelectTrigger id="output-format-batch" className="w-full">
                      <SelectValue placeholder="Select output format" />
                    </SelectTrigger>
                    <SelectContent className="bg-background !bg-opacity-100">
                      <SelectItem
                        value="openai-jsonl"
                        className="cursor-pointer hover:bg-accent hover:text-accent-foreground"
                      >
                        OpenAI (GPT-3.5, GPT-4) - JSONL Format
                      </SelectItem>
                      <SelectItem
                        value="jsonl"
                        className="cursor-pointer hover:bg-accent hover:text-accent-foreground"
                      >
                        Mistral, Claude, Llama - JSONL Format
                      </SelectItem>
                      <SelectItem
                        value="json"
                        className="cursor-pointer hover:bg-accent hover:text-accent-foreground"
                      >
                        Universal (All Models) - JSON Format
                      </SelectItem>
                      <SelectItem
                        value="csv"
                        className="cursor-pointer hover:bg-accent hover:text-accent-foreground"
                      >
                        Tabular Models (sklearn, pandas) - CSV Format
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Content Filtering Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-base font-medium">
                      Clause Filter Level
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-sm">
                        <p className="font-medium">
                          Filter clauses based on importance classification:
                        </p>
                        <ul className="list-disc pl-4 mt-1 space-y-1">
                          <li>
                            <span className="font-medium">All Clauses</span>:
                            Process all extracted clauses
                          </li>
                          <li>
                            <span className="font-medium">Critical Only</span>:
                            Only process clauses classified as "Critical"
                          </li>
                          <li>
                            <span className="font-medium">
                              Important & Critical
                            </span>
                            : Process clauses classified as either "Important"
                            or "Critical"
                          </li>
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  <RadioGroup
                    value={classFilter}
                    onValueChange={setClassFilter}
                    disabled={processingBatch}
                    className="flex flex-col space-y-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="all" id="filter-all-batch" />
                      <Label
                        htmlFor="filter-all-batch"
                        className="cursor-pointer"
                      >
                        All Clauses
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="critical_only"
                        id="filter-critical-batch"
                      />
                      <Label
                        htmlFor="filter-critical-batch"
                        className="cursor-pointer"
                      >
                        Critical Clauses Only
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="important_plus"
                        id="filter-important-batch"
                      />
                      <Label
                        htmlFor="filter-important-batch"
                        className="cursor-pointer"
                      >
                        Important & Critical Clauses
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <Separator />

                {/* Processing Priority */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="prioritize-batch"
                      className="text-base font-medium"
                    >
                      Processing Priority
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        When enabled, the system will process the most important
                        clauses first
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="prioritize-batch"
                      checked={prioritizeImportant}
                      onCheckedChange={setPrioritizeImportant}
                      disabled={processingBatch}
                    />
                    <Label
                      htmlFor="prioritize-batch"
                      className="cursor-pointer text-sm leading-relaxed"
                    >
                      Prioritize important clauses during processing
                      <span className="block text-xs text-muted-foreground mt-1">
                        Critical and important clauses will be processed first
                        when you're running out of tokens
                      </span>
                    </Label>
                  </div>
                </div>
              </TooltipProvider>
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

      {activeTab === "single" && (processing || progress > 0) && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            {/* <CardTitle className="flex items-center gap-2">
              {progress === 100 ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <div className="h-5 w-5 animate-pulse rounded-full bg-primary-500" />
              )}
              Processing Status
            </CardTitle> */}
          </CardHeader>
          <CardContent className="space-y-5">
            {/* <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">
                  {progress.toFixed(0)}% complete
                </span>
                <span className="text-gray-500">
                  {stage
                    ? stage.charAt(0).toUpperCase() + stage.slice(1)
                    : "Processing"}
                </span>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-gray-600 mt-1">{statusMessage}</p>
            </div> */}

            <ProcessingStatus
              progress={progress}
              stage={stage}
              statusMessage={statusMessage}
            />
          </CardContent>
        </Card>
      )}

      {/* For single document mode */}
      {activeTab === "single" && results && (
        <>
          {/* Memory health indicator */}
          {progress > 20 && (
            <div
              className={`mb-4 border rounded-lg p-3 flex items-center gap-3 ${
                progress > 90
                  ? "bg-green-50 border-green-200 text-green-700"
                  : progress > 70
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "bg-amber-50 border-amber-200 text-amber-700"
              }`}
            >
              <div
                className={`p-2 rounded-full ${
                  progress > 90
                    ? "bg-green-100"
                    : progress > 70
                    ? "bg-blue-100"
                    : "bg-amber-100"
                }`}
              >
                {progress > 90 ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin" />
                )}
              </div>
              <div>
                <p className="font-medium">
                  {progress > 90
                    ? "Processing complete"
                    : progress > 70
                    ? "Processing is progressing well"
                    : "Processing is ongoing"}
                </p>
                <p className="text-sm">
                  {progress > 90
                    ? "Results are ready to view and download."
                    : progress > 70
                    ? "Almost there! Final stages in progress."
                    : "Please wait while we process your document. Large files may take several minutes."}
                </p>
              </div>
            </div>
          )}
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
              <ResultsViewer results={results} format={outputFormat} />
            </CardContent>
          </Card>
        </>
      )}

      {/* For batch mode */}
      {activeTab === "batch" && combinedResults && (
        <>
          {/* Memory health indicator */}
          {progress > 20 && (
            <div
              className={`mb-4 border rounded-lg p-3 flex items-center gap-3 ${
                progress > 90
                  ? "bg-green-50 border-green-200 text-green-700"
                  : progress > 70
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "bg-amber-50 border-amber-200 text-amber-700"
              }`}
            >
              <div
                className={`p-2 rounded-full ${
                  progress > 90
                    ? "bg-green-100"
                    : progress > 70
                    ? "bg-blue-100"
                    : "bg-amber-100"
                }`}
              >
                {progress > 90 ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin" />
                )}
              </div>
              <div>
                <p className="font-medium">
                  {progress > 90
                    ? "Processing complete"
                    : progress > 70
                    ? "Processing is progressing well"
                    : "Processing is ongoing"}
                </p>
                <p className="text-sm">
                  {progress > 90
                    ? "Results are ready to view and download."
                    : progress > 70
                    ? "Almost there! Final stages in progress."
                    : "Please wait while we process your document. Large files may take several minutes."}
                </p>
              </div>
            </div>
          )}
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
              <ResultsViewer results={combinedResults} format={outputFormat} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

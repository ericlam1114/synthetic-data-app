"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useToast } from "../../../hooks/use-toast";
import PipelineConfigForm from "../../components/PipelineConfigForm";
import ProcessingStatus from "../../components/ProcessingStatus";
import BatchUploader from "../../components/BatchUploader";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "../../../components/ui/card";
import { Progress } from "../../../components/ui/progress";
import FinanceSyntheticDataPipeline from "../../lib/FinanceSyntheticDataPipeline";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";
import { Button } from "../../../components/ui/button";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import PipelineSelector from "../../components/PipelineSelector";
import { Separator } from "../../../components/ui/separator";
import { Label } from "../../../components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { RadioGroup, RadioGroupItem } from "../../../components/ui/radio-group";
import { Checkbox } from "../../../components/ui/checkbox";
import { Info } from "lucide-react";
import { TooltipProvider } from "../../../components/ui/tooltip";
import { Textarea } from "../../../components/ui/textarea";

export default function UploadPage() {
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

  // Add state to hold the current job status object
  const [currentJobStatus, setCurrentJobStatus] = useState(null);

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

  // Add state for new config options
  const [orgContext, setOrgContext] = useState("");
  const [formattingDirective, setFormattingDirective] = useState("balanced"); // Default

  // --- Add state for QA pipeline options --- 
  const [questionTypes, setQuestionTypes] = useState([]); // Initialize as empty array
  const [difficultyLevels, setDifficultyLevels] = useState([]); // Initialize as empty array
  const [maxQuestionsPerSection, setMaxQuestionsPerSection] = useState(5); // Default value
  // ------------------------------------------

  // --- Add wrapper for logging state update --- 
  const handlePipelineTypeChange = (newValue) => {
    console.log(`[UploadPage] handlePipelineTypeChange called with: ${newValue}`);
    setPipelineType(newValue);
  };
  // --- End wrapper ---

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
    setCurrentJobStatus(null); // Reset job status for new run

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
          orgContext,
          formattingDirective,
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
          orgContext,
          formattingDirective,
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
          
          // Update the job status state
          setCurrentJobStatus(jobStatus);

          if (jobStatus.status === "running") {
            setStage(jobStatus.stage || "processing");
          } else if (jobStatus.status === "completed") {
            // Job completed successfully
            clearInterval(pollInterval);

            // Set final progress
            setProgress(100);
            setStage("complete");
            setStatusMessage("Processing complete!");

            // Set output key (Keep this - it's needed for download)
            if (jobStatus.outputKey) {
              setOutputKey(jobStatus.outputKey);
              console.log("[Polling] Job complete. Output key set:", jobStatus.outputKey);
              
              // Save dataset metadata
              saveDatasetMetadata({
                name: file?.name || `Dataset_${Date.now()}`, // Use file name or generate one
                outputKey: jobStatus.outputKey,
                fileKey: fileKey, // Include original file key
                textKey: textKey, // Include text key
                format: outputFormat, // Include format
                // userId: 'get_from_session' // TODO: Add user ID from session/auth
              });
              
            } else {
              console.error("[Polling] Job complete but outputKey is missing from jobStatus:", jobStatus);
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
            orgContext,
            formattingDirective,
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
            orgContext,
            formattingDirective,
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
      // **Important:** Assume the `outputKey` state holds the key for the combined output
      // If not, the backend /api/process for batch needs to return the combined output key.
      if (outputKey) { 
        setCombinedResults({
          data: combinedOutput,
          format: outputFormat,
          outputKey: outputKey // Store the key with combined results
        });

        // Save combined dataset metadata
        saveDatasetMetadata({
           name: `Batch_Result_${files.length}_files_${Date.now()}`, // Generate a name
           outputKey: outputKey,
           fileKey: null, // Cannot easily associate single fileKey with batch
           textKey: null, // Cannot easily associate single textKey with batch
           format: outputFormat,
           // userId: 'get_from_session' // TODO: Add user ID
        });
        
        toast({
          title: "Batch processing complete",
          description: `Successfully processed ${files.length} documents`,
        });
      } else {
         console.error("Batch processing finished, but no outputKey was set for the combined result.");
         toast({
           title: "Batch Complete (Error)",
           description: "Processing finished, but could not save or download results due to missing output key.",
           variant: "destructive",
         });
      }
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

  // Function to save dataset metadata to the backend
  const saveDatasetMetadata = async (metadata) => {
    try {
      const response = await fetch("/api/datasets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metadata),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to save dataset metadata");
      }

      console.log("Dataset metadata saved successfully:", await response.json());
      // Optional: Show a success toast, but might be too noisy
    } catch (error) {
      console.error("Error saving dataset metadata:", error);
      toast({
        title: "Metadata Save Error",
        description: `Could not save dataset info: ${error.message}`,
        variant: "warning", // Use warning as it might not be critical for user flow
      });
    }
  };

  const downloadResults = () => {
    // Use the outputKey from state
    if (!outputKey) {
       console.error("[Download] Cannot download, outputKey is not set.");
       toast({
         title: "Download Error",
         description: "Output file key is missing. Cannot start download.",
         variant: "destructive",
       });
       return;
    }

    console.log(`[Download] Initiating download for outputKey: ${outputKey}`);

    // Construct the download URL using the new API route
    const downloadUrl = `/api/download?key=${encodeURIComponent(outputKey)}`;
    console.log(`[Download] Requesting download from URL: ${downloadUrl}`);

    // Option 2: Create an invisible link and click it (more reliable for forcing download)
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.style.display = 'none'; // Make it invisible
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    toast({
      title: "Download started",
      description: `Your file is being downloaded.`, // Filename comes from server now
    });
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
          {processing ? (
            // Show processing status when processing
            <Card className="mb-6">
              <CardContent className="pt-6">
                <ProcessingStatus
                  progress={progress}
                  stage={stage}
                  statusMessage={statusMessage}
                  job={currentJobStatus} 
                />
              </CardContent>
            </Card>
          ) : outputKey ? (
            // Show download button when complete
            <Card className="mb-6 text-center">
              <CardHeader>
                 <CardTitle className="flex items-center justify-center gap-2 text-green-600">
                    <CheckCircle2 className="h-6 w-6" />
                    Processing Complete!
                 </CardTitle>
              </CardHeader>
              <CardContent>
                 <p className="text-muted-foreground mb-4">Your synthetic data is ready for download.</p>
                 <Button
                    onClick={downloadResults}
                    disabled={!outputKey}
                    className="bg-black text-white hover:bg-black/90"
                 >
                    <Download className="h-4 w-4 mr-2" />
                    Download Results
                 </Button>
              </CardContent>
            </Card>
          ) : (
            // Show config form initially
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
              orgContext={orgContext}
              setOrgContext={setOrgContext}
              formattingDirective={formattingDirective}
              setFormattingDirective={setFormattingDirective}
              pipelineType={pipelineType}
              setPipelineType={handlePipelineTypeChange}
              // -------------------------
              // --- Pass QA props --- 
              questionTypes={questionTypes}
              setQuestionTypes={setQuestionTypes}
              difficultyLevels={difficultyLevels}
              setDifficultyLevels={setDifficultyLevels}
              maxQuestionsPerSection={maxQuestionsPerSection}
              setMaxQuestionsPerSection={setMaxQuestionsPerSection}
              // -------------------
            />
          )}
        </TabsContent>

        <TabsContent value="batch" className="pt-4">
          {processingBatch ? (
            // Show processing status during batch processing
             <Card className="mb-6">
               <CardContent className="pt-6">
                 {/* TODO: Potentially enhance ProcessingStatus for batch specifics */}
                 <ProcessingStatus 
                   progress={currentFileIndex / files.length * 100} // Approximate overall progress
                   stage={`Processing file ${currentFileIndex + 1} of ${files.length}`}
                   statusMessage={fileStatuses[files[currentFileIndex]?.name]?.message || 'Preparing next file...'}
                   job={{ status: 'running' }} // Assume running for status display
                 />
               </CardContent>
             </Card>
          ) : combinedResults && outputKey ? (
            // Show download button when batch is complete
            <Card className="mb-6 text-center">
              <CardHeader>
                 <CardTitle className="flex items-center justify-center gap-2 text-green-600">
                    <CheckCircle2 className="h-6 w-6" />
                    Batch Processing Complete!
                 </CardTitle>
              </CardHeader>
              <CardContent>
                 <p className="text-muted-foreground mb-4">Your combined synthetic data is ready for download.</p>
                 {/* TODO: Batch download might need adjustment if 'outputKey' isn't right for combined */}
                 <Button
                    onClick={() => downloadResults()} // Simplified to use the main download logic
                    disabled={!outputKey} // Disable if no key is available
                    className="bg-black text-white hover:bg-black/90"
                 >
                    <Download className="h-4 w-4 mr-2" />
                    Download Combined Results 
                 </Button>
              </CardContent>
            </Card>
          ) : (
             // Show uploader and config initially
             <>
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
                       setPipelineType={handlePipelineTypeChange}
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

               {/* --- START: Organization Context (Batch) --- */}
               <div className="space-y-3">
                 <div className="flex items-center gap-2">
                   <Label htmlFor="org-context-batch" className="text-base font-medium">
                     Organization/Usage Context (Optional)
                   </Label>
                   <Tooltip>
                     <TooltipTrigger asChild>
                       <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                     </TooltipTrigger>
                     <TooltipContent side="right" className="max-w-sm">
                       <p>Briefly describe your organization or the intended use for all documents in this batch.</p>
                       <p className="mt-1 text-xs text-muted-foreground">This context helps tailor the output for all processed documents.</p>
                     </TooltipContent>
                   </Tooltip>
                 </div>
                 <Textarea
                   id="org-context-batch"
                   placeholder="e.g., Generating training data for legal contract AI..."
                   value={orgContext}
                   onChange={(e) => setOrgContext(e.target.value)}
                   disabled={processingBatch}
                   className="min-h-[60px]"
                 />
               </div>
               {/* --- END: Organization Context (Batch) --- */}

               <Separator />
               
               {/* --- START: Formatting Directive (Batch) --- */}
                <div className="space-y-3">
                 <div className="flex items-center gap-2">
                   <Label htmlFor="formatting-directive-batch" className="text-base font-medium">
                     Formatting Style
                   </Label>
                   <Tooltip>
                     <TooltipTrigger asChild>
                       <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                     </TooltipTrigger>
                     <TooltipContent side="right" className="max-w-sm">
                        <p className="font-medium">Choose the desired output style (applied to all batch documents):</p>
                        <ul className="list-disc pl-4 mt-1 space-y-1 text-xs">
                          <li><span className="font-medium">Balanced:</span> Good mix of clarity and brevity (Default).</li>
                          <li><span className="font-medium">Concise:</span> Prioritizes brevity, uses abbreviations.</li>
                          <li><span className="font-medium">Expanded:</span> Prioritizes completeness and explicitness.</li>
                          <li><span className="font-medium">Preserve Length:</span> Tries to match original text length.</li>
                        </ul>
                     </TooltipContent>
                   </Tooltip>
                 </div>
                 <Select
                   value={formattingDirective}
                   onValueChange={setFormattingDirective}
                   disabled={processingBatch}
                 >
                   <SelectTrigger id="formatting-directive-batch" className="w-full">
                     <SelectValue placeholder="Select formatting style" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="balanced">Balanced (Default)</SelectItem>
                     <SelectItem value="concise">Concise</SelectItem>
                     <SelectItem value="expanded">Expanded</SelectItem>
                     <SelectItem value="preserve_length">Preserve Length</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
               {/* --- END: Formatting Directive (Batch) --- */}

               <Separator />
             </>
           )}
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
    </div>
  );
}

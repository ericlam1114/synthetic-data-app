"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useToast } from "../../../hooks/use-toast";
import PipelineConfigForm from "../../components/PipelineConfigForm";
import ProcessingStatus from "../../components/ProcessingStatus";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  CardDescription,
} from "../../../components/ui/card";
import { Progress } from "../../../components/ui/progress";
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
  BrainCircuit,
  FileSearch,
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
import { ScrollArea } from "../../../components/ui/scroll-area";
import { Badge } from "../../../components/ui/badge";
import { useRouter } from 'next/navigation';
import { supabase } from "../../../lib/supabaseClient";

export default function UploadPage() {
  const { toast } = useToast();
  const router = useRouter();

  // Batch processing state (now used for all uploads)
  const [files, setFiles] = useState([]); // Holds one or more files
  const [fileStatuses, setFileStatuses] = useState({});
  const [processingBatch, setProcessingBatch] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);

  // Shared Processing state
  const [processing, setProcessing] = useState(false); // Kept for consistency? Or merge into processingBatch?
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState(null);
  const [styleFile, setStyleFile] = useState(null);

  // Results state - only need fileStatuses which holds output keys per file
  // const [singleResultOutputKey, setSingleResultOutputKey] = useState(null);

  // Job status state (for display during processing)
  const [currentJobStatus, setCurrentJobStatus] = useState(null);

  // Pipeline configuration options (shared)
  const [outputFormat, setOutputFormat] = useState("openai-jsonl");
  const [pipelineType, setPipelineType] = useState("legal");
  const [orgContext, setOrgContext] = useState("");
  const [formattingDirective, setFormattingDirective] = useState("balanced");
  const [questionTypes, setQuestionTypes] = useState([]);
  const [difficultyLevels, setDifficultyLevels] = useState([]);
  const [maxQuestionsPerSection, setMaxQuestionsPerSection] = useState(5);
  const [privacyMaskingEnabled, setPrivacyMaskingEnabled] = useState(false);
  const [excludeStandard, setExcludeStandard] = useState(false);

  // File key tracking state (internal)
  const [currentProcessingFileKey, setCurrentProcessingFileKey] = useState(null);
  const [currentProcessingTextKey, setCurrentProcessingTextKey] = useState(null);

  // Wrapper for logging state update
  const handlePipelineTypeChange = (newValue) => {
    console.log(`[UploadPage] handlePipelineTypeChange called with: ${newValue}`);
    setPipelineType(newValue);
  };

  // Function to cleanup files in storage - ADD credentials: 'include'
  const cleanupStorage = async (keys = []) => {
    const keysToClean = [...keys];
    if (currentProcessingFileKey) keysToClean.push(currentProcessingFileKey);
    if (currentProcessingTextKey) keysToClean.push(currentProcessingTextKey);
    if (keysToClean.length === 0) return;

    console.log("[Cleanup] Attempting to clean keys:", keysToClean);

    try {
        // --- Add client-side session check before fetch ---
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        console.log("[Cleanup] Client-side session check before fetch:", { 
            hasSession: !!session, 
            tokenExists: !!session?.access_token, 
            tokenFirstChars: session?.access_token?.substring(0, 10), 
            sessionError 
        });
        if (sessionError || !session?.access_token) { 
            console.error("Client-side session invalid or token missing before fetch!");
            toast({ title: "Auth Error", description: "Client session invalid. Please try logging out and back in.", variant: "destructive" });
            return; 
        }
        // --- End client-side session check ---
        
        const response = await fetch("/api/cleanup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
             // Auth header is redundant if cookies work, but doesn't hurt
             "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ keys: keysToClean }),
          credentials: 'include',
        });
        
        // Check for 401/403 specifically, as the route handler might still reject
        if (response.status === 401 || response.status === 403) {
            const errorText = await response.text();
            console.warn(`Cleanup API Auth error (${response.status}):`, errorText);
             toast({ title: "Cleanup Failed", description: `Authorization error: ${errorText}`, variant: "destructive" });
            return;
        }

        if (!response.ok) {
            // Attempt to parse JSON, fallback to text
            let errorPayload = `HTTP error ${response.status}`; 
            try { errorPayload = (await response.json()).message || errorPayload; }
            catch(e){ errorPayload = await response.text().catch(() => errorPayload); }
            console.warn("Cleanup API error:", errorPayload);
            // Maybe show a less intrusive warning for cleanup errors?
            // toast({ title: "Cleanup Warning", description: `Some temporary files might remain: ${errorPayload}`, variant: "warning" });
        } else {
            const result = await response.json(); // Assuming success returns JSON
            console.log(`Storage cleanup successful for ${result.deletedCount || 0} keys.`);
        }
     } catch (err) {
       console.error("Error calling cleanup API:", err);
       // Display error if it was an auth error
       if (err.message.includes("Authorization error")) {
          toast({ title: "Cleanup Failed", description: err.message, variant: "destructive" });
      }
    }
  };

  // Cleanup on unmount remains the same
  useEffect(() => {
    return () => {
      // Attempt cleanup on unmount, might catch keys if user navigates away mid-process
       const potentialKeys = [currentProcessingFileKey, currentProcessingTextKey].filter(Boolean);
       if (potentialKeys.length > 0) {
          console.log("[Unmount Cleanup] Cleaning potential keys:", potentialKeys);
          cleanupStorage(potentialKeys);
       }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProcessingFileKey, currentProcessingTextKey]); // Depend on keys

  // Browser memory monitor remains the same
  const [browserMemoryWarning, setBrowserMemoryWarning] = useState(false);
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

  // --- Refactored onDrop to accumulate files --- 
  const onDrop = useCallback(
    (acceptedFiles) => {
      console.log(`[onDrop] Received ${acceptedFiles.length} files.`);
      setError(null); // Clear general error on new drop

      const validFiles = acceptedFiles.filter(f => {
        const isPdf = f.type === "application/pdf";
        const isSizeOk = f.size <= 10 * 1024 * 1024;
        const isValid = isPdf && isSizeOk;
        if (!isValid) {
            // Maybe toast here, or collect messages?
            console.warn(`[onDrop] Invalid file filtered out: ${f.name}`);
            toast({ title: `Invalid File: ${f.name}`, description: !isPdf ? "Must be PDF" : "Exceeds 10MB limit", variant: "destructive" });
        }
        return isValid;
      });

      if (validFiles.length > 0) {
        console.log(`[onDrop] Adding ${validFiles.length} valid files.`);

        // Use functional update to append to the existing files array
        // Prevent duplicates based on name and size (simple check)
        setFiles(prevFiles => {
            const newFiles = [...prevFiles];
            validFiles.forEach(vf => {
                if (!newFiles.some(pf => pf.name === vf.name && pf.size === vf.size)) {
                    newFiles.push(vf);
                }
      });
            return newFiles;
    });

        // Update statuses based on the potentially updated `files` array in the next render cycle
        // We'll update statuses fully when processing starts
        toast({ title: `${validFiles.length} file(s) added/updated.` });

      } else if (acceptedFiles.length > 0) {
        // Files dropped, but none were valid
        console.log("[onDrop] No valid files found in this drop.");
        // No need to set error state here, individual toasts are shown
      }
      // No else needed: If acceptedFiles is empty, do nothing.

    },
    // Dependencies: toast, setFiles, setError
    [toast, setFiles, setError] // Removed file-specific setters
  );

  // --- Add file removal handler --- 
  const handleRemoveFile = (fileNameToRemove) => {
    console.log(`[RemoveFile] Request to remove: ${fileNameToRemove}`);
    setFiles(prevFiles => prevFiles.filter(f => f.name !== fileNameToRemove));
    // Also remove from statuses if it exists
    setFileStatuses(prevStatuses => {
       const newStatuses = { ...prevStatuses };
       delete newStatuses[fileNameToRemove];
       return newStatuses;
    });
    toast({ title: `File removed: ${fileNameToRemove}` });
  };

  // useDropzone hook remains the same (multiple: true)
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxSize: 10 * 1024 * 1024,
    multiple: true,
  });

  // Style dropzone remains the same
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

  // --- processMultipleSequentially (now the main processor) ---
  const processSequentially = async () => {
      if (files.length === 0) {
         toast({ title: "No files uploaded", description: "Please upload one or more PDF files.", variant: "destructive" });
      return;
    }

      setProcessingBatch(true); // Use this state for all processing indication
      setCurrentFileIndex(0);
    setError(null);

      // Initialize/Reset statuses for all files in the current list
      const initialStatuses = {};
      files.forEach(f => {
          initialStatuses[f.name] = { status: 'queued', progress: 0, message: 'Waiting...', outputKey: null, error: null };
      });
      setFileStatuses(initialStatuses);
      console.log("[Process] Starting sequential processing for files:", files.map(f => f.name));
      console.log("[Process] Initial statuses:", initialStatuses);

      for (let i = 0; i < files.length; i++) {
          const currentFile = files[i];
          setCurrentFileIndex(i);
          setProgress(0);
          setStage("initializing");
          setCurrentJobStatus(null);
          setCurrentProcessingFileKey(null);
          setCurrentProcessingTextKey(null);

          let tempFileKey = null;
          let tempTextKey = null;

          // Update status for the current file starting
          console.log(`[Process] Starting file ${i + 1}: ${currentFile.name}`);
          setFileStatuses(prev => ({
              ...prev,
              [currentFile.name]: { ...prev[currentFile.name], status: 'processing', message: 'Starting...' }
          }));

    try {
              // 1. Upload
              setStage("uploading"); setProgress(5);
              setStatusMessage("Uploading to secure storage..."); // Set main status message
              setFileStatuses(prev => ({ ...prev, [currentFile.name]: { ...prev[currentFile.name], message: 'Uploading...', progress: 5 } }));
      const formData = new FormData();
              formData.append("file", currentFile);
              formData.append("options", JSON.stringify({
                  pipelineType, outputFormat, 
                  orgContext, formattingDirective, privacyMaskingEnabled, excludeStandard,
                  ...(pipelineType === 'qa' && {
                      questionTypes, difficultyLevels, maxQuestionsPerSection
                  })
              }));
              const uploadResponse = await fetch("/api/upload", { method: "POST", body: formData });
              if (!uploadResponse.ok) throw new Error((await uploadResponse.json()).message || "Upload failed");
      const { fileKey: uploadedFileKey } = await uploadResponse.json();
              tempFileKey = uploadedFileKey;
              setCurrentProcessingFileKey(uploadedFileKey);
              console.log(`[Process] File ${currentFile.name} uploaded. Key: ${tempFileKey}`);

              // 2. Extract
              setStage("extracting"); setProgress(15);
              setStatusMessage("Extracting text using AI models...");
              setFileStatuses(prev => ({ ...prev, [currentFile.name]: { ...prev[currentFile.name], message: 'Extracting...', progress: 15 } }));
      const extractResponse = await fetch("/api/extract", {
                  method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileKey: uploadedFileKey }),
      });
              if (!extractResponse.ok) throw new Error((await extractResponse.json()).message || "Extraction failed");
      const { textKey: extractedTextKey } = await extractResponse.json();
              tempTextKey = extractedTextKey;
              setCurrentProcessingTextKey(extractedTextKey);
              console.log(`[Process] File ${currentFile.name} extracted. Key: ${tempTextKey}`);

              // 3. Process (Start Job)
              setStage("processing"); setProgress(30);
              setStatusMessage("Starting background processing job...");
              setFileStatuses(prev => ({ ...prev, [currentFile.name]: { ...prev[currentFile.name], message: 'Starting job...', progress: 30 } }));
      const pipelineResponse = await fetch("/api/process", {
                  method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          textKey: extractedTextKey,
                      pipelineType, outputFormat,
                      orgContext, formattingDirective, privacyMaskingEnabled, excludeStandard,
                      ...(pipelineType === 'qa' && {
                          questionTypes, difficultyLevels, maxQuestionsPerSection
                      })
        }),
      });
              if (!pipelineResponse.ok) throw new Error((await pipelineResponse.json()).message || "Failed to start processing job");
      const { jobId, pollUrl } = await pipelineResponse.json();
              console.log(`[Process] File ${currentFile.name} job started. Job ID: ${jobId}`);

              // 4. Poll for Status
              await new Promise((resolve, reject) => {
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(pollUrl);
          if (!statusResponse.ok) {
                              console.error(`Polling error for ${currentFile.name}:`, statusResponse.status, statusResponse.statusText); 
            return;
          }
          const jobStatus = await statusResponse.json();
                          setCurrentJobStatus(jobStatus); // Update main status display
                          if(jobStatus.progressMessage) setStatusMessage(jobStatus.progressMessage);

                          // Update individual file status & progress
                          setFileStatuses(prev => {
                            if (!prev || !prev[currentFile.name]) return prev;
                            const currentStatus = prev[currentFile.name];
                            const newProgress = Math.min(100, jobStatus.progress !== undefined ? jobStatus.progress : currentStatus.progress);
                            const finalProgress = (jobStatus.status === 'completed' || jobStatus.status === 'completed_with_warnings') ? 100 : Math.max(currentStatus.progress || 0, newProgress);
                            return { ...prev, [currentFile.name]: { ...currentStatus, message: jobStatus.progressMessage || currentStatus.message, progress: finalProgress, stage: jobStatus.stage || currentStatus.stage } };
                          });
                          // Update overall progress bar
                          setProgress(prev => Math.max(prev, Math.min(100, jobStatus.progress || 0)));

          if (jobStatus.status === "running") {
            setStage(jobStatus.stage || "processing");
                          } else if (jobStatus.status === "completed" || jobStatus.status === "completed_with_warnings") {
            clearInterval(pollInterval);
                              setProgress(100); setStage("complete");
                              const finalMessage = "Processing complete!";
                              let finalOutputKey = null;
            if (jobStatus.outputKey) {
                                  finalOutputKey = jobStatus.outputKey;
              saveDatasetMetadata({
                                      name: currentFile.name, 
                                      outputKey: finalOutputKey, 
                                      fileKey: tempFileKey, 
                                      textKey: tempTextKey, 
                                      format: outputFormat
                                  });
                                  console.log(`[Process] File ${currentFile.name} completed. Output key: ${finalOutputKey}`);
            } else {
                                  console.error(`Job complete for ${currentFile.name} but no outputKey!`);
                                  finalMessage = "Completed (Output Key Missing)";
            }
                              setFileStatuses(prev => ({ ...prev, [currentFile.name]: { ...prev[currentFile.name], status: 'completed', message: finalMessage, progress: 100, outputKey: finalOutputKey } }));
                              resolve();
          } else if (jobStatus.status === "failed") {
            clearInterval(pollInterval);
                              const errorMsg = jobStatus.error || "Unknown processing error";
                              console.error(`[Process] File ${currentFile.name} failed: ${errorMsg}`);
                              setFileStatuses(prev => ({ ...prev, [currentFile.name]: { ...prev[currentFile.name], status: 'error', message: errorMsg, error: errorMsg, progress: 0 } })); // Reset progress on error
                              toast({ title: `Processing failed for ${currentFile.name}`, description: errorMsg, variant: "destructive" });
                              // Resolve instead of reject, to allow batch to continue
                              resolve(); // Allow loop to continue to next file
          }
        } catch (pollError) {
                          console.error(`Error polling for ${currentFile.name}:`, pollError);
                          // Maybe resolve after several poll errors?
        }
                  }, 2000);

                  // Timeout for individual file
      setTimeout(() => {
        clearInterval(pollInterval);
                      const currentStatusCheck = fileStatuses[currentFile.name]; // Read latest status
                      if (currentStatusCheck && (currentStatusCheck.status === 'processing' || currentStatusCheck.status === 'queued')) {
                          const timeoutMsg = "Timeout after 15 minutes";
                          console.warn(`[Process] File ${currentFile.name} timed out.`);
                          setFileStatuses(prev => ({ ...prev, [currentFile.name]: { ...prev[currentFile.name], status: 'error', message: timeoutMsg, error: timeoutMsg } }));
                          toast({ title: `Timeout for ${currentFile.name}`, description: timeoutMsg, variant: "warning" });
                          resolve(); // Resolve on timeout to allow batch to continue
        }
      }, 15 * 60 * 1000);
              });

              // Cleanup intermediate files for *this* file (success or handled failure/timeout)
              await cleanupStorage([tempFileKey, tempTextKey].filter(Boolean));

          } catch (err) {
              // Catch errors from upload/extract/start-process steps
              console.error(`Critical error processing ${currentFile.name}:`, err);
              const errorMsg = err.message || "Processing failed critically";
              setFileStatuses(prev => ({
                  ...prev,
                  [currentFile.name]: { ...(prev ? prev[currentFile.name] : {}), status: 'error', message: errorMsg, error: errorMsg, progress: 0 }
              }));
              toast({ title: `Error for ${currentFile.name}`, description: errorMsg, variant: "destructive" });
              // Attempt cleanup even on critical error for this file
              await cleanupStorage([tempFileKey, tempTextKey].filter(Boolean));
              // Continue to the next file in the batch
          } finally {
              setCurrentProcessingFileKey(null);
              setCurrentProcessingTextKey(null);
          }
           // Optional small delay between files
           // await new Promise(resolve => setTimeout(resolve, 200));
      } // End of loop

      setProcessingBatch(false);
    setCurrentFileIndex(0);
      setStage("");
      setProgress(0);
      setCurrentJobStatus(null);
      toast({ title: "Processing sequence finished", description: "Check individual file statuses." });
  };

  // Function to save dataset metadata - ADD credentials: 'include'
  const saveDatasetMetadata = async (metadata) => {
    console.log("[Metadata] Attempting to save:", JSON.stringify(metadata, null, 2));
      try {
        // --- Add client-side session check before fetch ---
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        console.log("[Metadata] Client-side session check before fetch:", { 
            hasSession: !!session, 
            tokenExists: !!session?.access_token, 
            tokenFirstChars: session?.access_token?.substring(0, 10), 
            sessionError 
        });
        if (sessionError || !session?.access_token) { 
            console.error("Client-side session invalid or token missing before fetch!");
            toast({ title: "Auth Error", description: "Client session invalid. Please try logging out and back in.", variant: "destructive" });
            return; 
        }
        // --- End client-side session check ---

        const response = await fetch("/api/datasets", {
          method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`, // Keep for robustness
            },
            body: JSON.stringify(metadata),
            credentials: 'include',
        });

        // Specific check for 401/403
        if (response.status === 401 || response.status === 403) {
            const errorText = await response.text(); 
            console.error("[Metadata] API Auth Error Response:", errorText);
            throw new Error(`Failed to save metadata: Authentication failed (${response.status}) - ${errorText}`);
              }

        if (!response.ok) {
            let errorPayload = `HTTP error ${response.status}: ${response.statusText || 'Unknown error'}`;
            try {
                const jsonError = await response.json();
                errorPayload = jsonError.message || JSON.stringify(jsonError);
            } catch (e) {
                 try { errorPayload = await response.text(); } catch (textErr) { /* Keep original */ }
            }
            console.error("[Metadata] API Error Response:", errorPayload);
            throw new Error(`Failed to save metadata: ${errorPayload}`);
      }

       const result = await response.json();
       console.log("Dataset metadata saved:", result);

     } catch (err) {
       console.error("Error saving dataset metadata:", err);
       toast({ title: "Metadata Save Failed", description: err.message, variant: "destructive" });
      }
  };

  // Modified download function to handle keys from different states
  const downloadResult = (outputKeyToDownload, fileNameHint = "results") => {
    if (!outputKeyToDownload) {
       console.error("[Download] No output key provided.");
       toast({ title: "Download Error", description: "Output key missing.", variant: "destructive" });
       return;
    }
    console.log(`[Download] Initiating download for key: ${outputKeyToDownload}`);
    const downloadUrl = `/api/download?key=${encodeURIComponent(outputKeyToDownload)}`;

    // Use invisible link method
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `${fileNameHint}.${outputFormat.split('-')[0]}`; // Suggest filename based on format
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    toast({ title: "Download started", description: `Downloading ${fileNameHint}...` });
  };

  // Update button disabled logic
  const isProcessButtonDisabled = processingBatch || files.length === 0;

  // Update button text logic
  const getProcessButtonText = () => {
      // Remove single file logic
      // if (processing) return "Processing Single...";
      if (processingBatch) return `Processing ${currentFileIndex + 1} of ${files.length}...`;
      if (files.length === 1) return "Process Document";
      if (files.length > 1) return `Process ${files.length} Documents`;
      return "Process Document"; // Default if files.length is 0
  };

  // Updated handler to navigate to the preparation page
  const handlePrepareDataClick = () => {
    const successfulOutputKeys = Object.values(fileStatuses)
      .filter(s => s.status === 'completed' && s.outputKey)
      .map(s => s.outputKey);
      
    if (successfulOutputKeys.length === 0) {
      toast({ title: "No completed datasets", description: "Cannot prepare data without successfully processed files.", variant: "warning" });
      return;
    }
    
    const keysQueryParam = successfulOutputKeys.join(',');
    // Navigate to the new preparation page route
    router.push(`/dashboard/prepare-data?outputKeys=${encodeURIComponent(keysQueryParam)}`);
  };

  // --- Refactored renderMainContent --- 
  const renderMainContent = () => {
    const hasProcessedFiles = !processingBatch && files.length > 0 && Object.keys(fileStatuses).length > 0 && Object.values(fileStatuses).some(s => s.status === 'completed' || s.status === 'error');
    const hasSuccessfulFiles = hasProcessedFiles && Object.values(fileStatuses).some(s => s.status === 'completed' && s.outputKey);

    // 1. If currently processing batch
    if (processingBatch) {
      return (
            <Card className="mb-6">
              <CardContent className="pt-6">
                <ProcessingStatus
              progress={progress} // Shows current file progress
              // Pass index and total separately for prominent display
              currentFileIndex={currentFileIndex} 
              totalFiles={files.length}
              stage={stage} // Pass only the actual stage name
                  statusMessage={statusMessage}
              job={currentJobStatus} // Shows details for the current job being polled
                />
              </CardContent>
            </Card>
      );
    }

    // 2. If processing is NOT active AND files have been processed (check statuses)
    // This covers both single and multiple file completion display
    if (hasProcessedFiles) {
      return (
        <Card className="mb-6">
              <CardHeader>
             <CardTitle>Processing Results</CardTitle>
             <CardDescription>Status for each processed document.</CardDescription>
              </CardHeader>
              <CardContent>
             <ScrollArea className="h-[300px] w-full pr-4">
               <ul className="space-y-3">
                 {files.map((f) => {
                   const statusInfo = fileStatuses[f.name];
                   if (!statusInfo) { // Render placeholder if status somehow missing
                       return <li key={f.name}>Status pending for {f.name}...</li>;
                   }
                    let Icon = Loader2;
                    let iconClass = "animate-spin";
                    if (statusInfo.status === 'completed') { Icon = CheckCircle2; iconClass = "text-green-600"; }
                    else if (statusInfo.status === 'error') { Icon = AlertCircle; iconClass = "text-red-600"; }
                    else if (statusInfo.status === 'queued') { Icon = CheckCircle2; iconClass = "text-gray-400"; }

                    return (
                      <li key={f.name} className="flex items-center justify-between p-3 rounded-md border bg-card">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <Icon className={`h-5 w-5 flex-shrink-0 ${iconClass}`} />
                          <div className="flex-grow overflow-hidden">
                            <p className="text-sm font-medium truncate" title={f.name}>{f.name}</p>
                            <p className="text-xs text-muted-foreground truncate" title={statusInfo.message}>{statusInfo.message}</p>
                            {(statusInfo.status === 'processing' || statusInfo.progress > 0) && statusInfo.status !== 'error' && statusInfo.status !== 'completed' && (
                              <Progress value={statusInfo.progress || 0} className="h-1 mt-1" />
                            )}
                          </div>
                        </div>
                        {statusInfo.status === 'completed' && statusInfo.outputKey && (
                          <Button variant="outline" size="sm" onClick={() => downloadResult(statusInfo.outputKey, f.name)} title={`Download result for ${f.name}`}>
                            <Download className="h-4 w-4" />
                 </Button>
                        )}
                        {statusInfo.status === 'error' && statusInfo.error && (
                          <Tooltip>
                             <TooltipTrigger asChild><span className="text-red-500 cursor-help">Error</span></TooltipTrigger>
                             <TooltipContent side="left" className="max-w-xs bg-red-100 text-red-800 border-red-300"><p>{statusInfo.error}</p></TooltipContent>
                          </Tooltip>
                        )}
                      </li>
                    );
                 })}
               </ul>
             </ScrollArea>
              </CardContent>
           <CardFooter className="justify-between border-t pt-4">
             <Button variant="outline" onClick={() => { setFiles([]); setFileStatuses({}); setError(null); }}>
               Start New Upload
             </Button>
             {hasSuccessfulFiles && (
                <Button onClick={handlePrepareDataClick} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    <FileSearch className="mr-2 h-4 w-4" />
                    Inspect & Prepare Data
                </Button>
             )}
           </CardFooter>
            </Card>
      );
    }

    // 3. Default: Show the configuration form (if not processing and no results to show)
    return (
            <PipelineConfigForm
          files={files} // Pass files array for display
          // Pass the new removal handler down
          onRemoveFile={handleRemoveFile}
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
              pipelineType={pipelineType}
              setPipelineType={handlePipelineTypeChange}
              questionTypes={questionTypes}
              setQuestionTypes={setQuestionTypes}
              difficultyLevels={difficultyLevels}
              setDifficultyLevels={setDifficultyLevels}
              maxQuestionsPerSection={maxQuestionsPerSection}
              setMaxQuestionsPerSection={setMaxQuestionsPerSection}
          processing={processingBatch} // Use processingBatch here
          onSubmit={processSequentially} // Always call processSequentially
          orgContext={orgContext}
          setOrgContext={setOrgContext}
          formattingDirective={formattingDirective}
          setFormattingDirective={setFormattingDirective}
              privacyMaskingEnabled={privacyMaskingEnabled}
              setPrivacyMaskingEnabled={setPrivacyMaskingEnabled}
              excludeStandard={excludeStandard}
              setExcludeStandard={setExcludeStandard}
          isProcessButtonDisabled={isProcessButtonDisabled}
          processButtonText={getProcessButtonText()}
       />
    );
  };

  // Main return statement uses renderMainContent
  return (
    <div className="max-w-4xl mx-auto">
      {/* Memory warning ... */}
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

      {renderMainContent()}

      {/* General Error Display - Define hasProcessedFiles outside of render logic */}
      {error && !processingBatch && (() => {
          const hasProcessedFiles = !processingBatch && 
            files.length > 0 && 
            Object.keys(fileStatuses).length > 0 && 
            Object.values(fileStatuses).some(s => s.status === 'completed' || s.status === 'error');
          return !hasProcessedFiles;
      })() && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-red-800 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" /> Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">{error}</p>
          </CardContent>
          <CardFooter className="justify-end">
             <Button variant="outline" onClick={() => { setError(null); setFiles([]); }}>
                Dismiss
             </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

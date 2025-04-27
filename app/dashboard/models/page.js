"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { 
  AlertTriangle, 
  ChevronLeft, 
  Database, 
  Loader2, 
  ListChecks, // Icon for jobs/models
  Info, // For error tooltips
  MoreHorizontal, // Icon for dropdown trigger
  Trash2,         // Icon for delete
  XCircle,         // Icon for cancel
  Copy,            // Icon for copy
  Flame,           // Add Flame for Fireworks jobs
  HelpCircle,       // Add HelpCircle for usage instructions
  Play             // Add Play for model playground
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";

// Updated StatusBadge to include Fireworks statuses
const StatusBadge = ({ status }) => {
  let variant = "secondary";
  let text = status || 'Unknown';
  
  const lowerStatus = status?.toLowerCase();

  // Map potential Fireworks statuses to existing variants
  switch (lowerStatus) {
    // Success states
    case 'succeeded':
    case 'completed': // From OpenAI API reference
    case 'job_state_completed': // From Fireworks API reference
       variant = "success"; 
       text = 'Succeeded';
       break;
    // Failure states
    case 'failed': 
    case 'cancelled':
    case 'job_state_failed': // Fireworks
    case 'job_state_cancelled': // Fireworks
    case 'job_state_deleting_incomplete': // Fireworks - Treat as failed?
      variant = "destructive";
      text = status.replace(/job_state_/i, '').replace(/_/g, ' ').split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' '); // Clean up display text
      break;
    // Pending/Running states
    case 'running':
    case 'pending': // Fireworks old/generic status?
    case 'job_state_running': // Fireworks
    case 'job_state_creating': // Fireworks
    case 'job_state_validating': // Fireworks
    case 'job_state_writing_results': // Fireworks
    case 'job_state_evaluation': // Fireworks
    case 'job_state_handling_failure': // Fireworks
    case 'job_state_deleting': // Fireworks
    case 'job_state_policy_update': // Fireworks
    case 'job_state_rollout': // Fireworks
      variant = "default"; 
      text = status.replace(/job_state_/i, '').replace(/_/g, ' ').split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
      break;
    // Initializing states (ours + OpenAI)
    case 'queued': // OpenAI
    case 'validating_files': // OpenAI
    case 'uploading_to_fireworks': // Custom status
    case 'starting_fw_job': // Custom status
    case 'creating_fw_dataset': // Custom status
      variant = "outline";
      text = status.replace(/_/g, ' ').split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' '); // Format custom status
      break;
    default:
      variant = "secondary";
      text = 'Unknown';
  }
  return <Badge variant={variant}>{text}</Badge>;
};

// --- Usage Info Component for Fireworks --- 
const FireworksUsageInfo = ({ modelId }) => {
    if (!modelId) return null;
    
    const endpoint = "https://api.fireworks.ai/v1/chat/completions";
    const exampleBody = JSON.stringify({
        model: modelId,
        messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: "What is the weather in London?" }
        ],
        max_tokens: 512,
        temperature: 0.7
    }, null, 2);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-blue-500 hover:bg-blue-100">
                   <HelpCircle className="h-4 w-4" />
                </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-md p-4 shadow-lg bg-background border">
                <h4 className="font-semibold mb-2">How to Use Your Fireworks Model</h4>
                <p className="text-xs mb-1">Make POST requests to:</p>
                <pre className="text-xs bg-muted p-2 rounded font-mono mb-2 break-all">{endpoint}</pre>
                <p className="text-xs mb-1">Include your Fireworks API Key in the <code className="text-xs font-semibold">Authorization: Bearer YOUR_FW_KEY</code> header.</p>
                <p className="text-xs mb-1">Example request body:</p>
                <pre className="text-xs bg-muted p-2 rounded font-mono max-h-40 overflow-auto">{exampleBody}</pre>
            </TooltipContent>
        </Tooltip>
    );
};
// ------------------------------------------

export default function ModelsPage() {
  const [user, setUser] = useState(null);
  const [allJobs, setAllJobs] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [cancellingJobId, setCancellingJobId] = useState(null); 
  const [deletingJobId, setDeletingJobId] = useState(null); 
  const [selectedJobIds, setSelectedJobIds] = useState(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  // Format date helper function (same as datasets page)
  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { 
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // --- Updated useEffect to fetch both job types --- 
  useEffect(() => {
    const loadJobsAndUser = async () => {
      setLoading(true);
      try {
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        if (authError || !session?.user) {
          router.push('/');
      return;
    }
        setUser(session.user);

        // Fetch OpenAI jobs
        const { data: openaiJobsData, error: openaiJobsError } = await supabase
          .from('fine_tuning_jobs') // Original table
          .select('*') // Select all columns normally
          .eq('user_id', session.user.id) // Ensure user owns these
          .order('created_at', { ascending: false });
        
        if (openaiJobsError) console.error("Error fetching OpenAI jobs:", openaiJobsError);

        // Fetch Fireworks jobs
        const { data: fireworksJobsData, error: fireworksJobsError } = await supabase
          .from('fireworks_fine_tuning_jobs') // New table
          .select('*') // Select all columns normally
          .eq('user_id', session.user.id) // Ensure user owns these
          .order('created_at', { ascending: false });
          
        if (fireworksJobsError) console.error("Error fetching Fireworks jobs:", fireworksJobsError);

        // Combine and sort jobs
        const combinedJobs = [
            ...(openaiJobsData || []).map(job => ({ ...job, provider: 'openai' })), // Ensure provider field exists
            ...(fireworksJobsData || []).map(job => ({ ...job, provider: 'fireworks' })) // Ensure provider field exists
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // Sort newest first
        
        setAllJobs(combinedJobs);

      } catch (error) {
        console.error('Error loading fine-tuning jobs:', error);
      toast({
          title: "Error Loading Jobs",
          description: error.message,
        variant: "destructive",
      });
      } finally {
        setLoading(false);
      }
    };
    loadJobsAndUser();
  }, [router, toast]);

  // --- Updated Polling Effect for both providers ---
  useEffect(() => {
      const jobsToPoll = allJobs.filter(job => 
          !['succeeded', 'failed', 'cancelled', 'completed'].includes(job.status?.toLowerCase()) &&
          ((job.provider === 'openai' && job.openai_job_id) || 
           (job.provider === 'fireworks' && job.fireworks_job_id))
      );

      if (jobsToPoll.length === 0) {
          console.log("[Polling] No active jobs found to poll.");
      return;
    }

      const openaiJobIds = jobsToPoll.filter(j => j.provider === 'openai').map(j => j.openai_job_id);
      const fireworksJobIds = jobsToPoll.filter(j => j.provider === 'fireworks').map(j => j.id); // Use internal ID for FW status check
      
      console.log(`[Polling] Setting up polling. OpenAI: [${openaiJobIds.join(', ')}], Fireworks (Internal): [${fireworksJobIds.join(', ')}]`);

      const intervalId = setInterval(async () => {
          let allUpdates = [];

          // Poll OpenAI Status
          if (openaiJobIds.length > 0) {
              console.log(`[Polling] Fetching OpenAI status for jobs: ${openaiJobIds.join(', ')}`);
              try {
                  const response = await fetch(`/api/fine-tune/status?jobIds=${openaiJobIds.join(',')}`);
                  if (response.ok) {
                      const { updatedJobs } = await response.json();
                      if (updatedJobs) allUpdates.push(...updatedJobs.map(j => ({...j, provider: 'openai'}))); // Add provider info
                  } else {
                      console.warn(`[Polling] OpenAI status fetch failed: ${response.status}`);
                  }
              } catch (error) {
                  console.error("[Polling] Error during OpenAI status poll:", error);
              }
          }

          // Poll Fireworks Status
          if (fireworksJobIds.length > 0) {
               console.log(`[Polling] Fetching Fireworks status for internal job IDs: ${fireworksJobIds.join(', ')}`);
               try {
                   const response = await fetch(`/api/fine-tune/fireworks/status?jobIds=${fireworksJobIds.join(',')}`);
                   if (response.ok) {
                       const updatedFwJobs = await response.json();
                       if (updatedFwJobs) allUpdates.push(...updatedFwJobs.map(j => ({...j, provider: 'fireworks'}))); // Add provider info
                   } else {
                       console.warn(`[Polling] Fireworks status fetch failed: ${response.status}`);
                   }
               } catch (error) {
                   console.error("[Polling] Error during Fireworks status poll:", error);
               }
          }

          // Process all updates
          if (allUpdates.length > 0) {
              console.log("[Polling] Received updates:", allUpdates);
              setAllJobs(currentJobs => {
                  const updatesMap = new Map(allUpdates.map(uj => [uj.id, uj])); // Use internal DB ID for mapping
                  return currentJobs.map(job => {
                      const update = updatesMap.get(job.id);
                      if (update) {
                           console.log(`[Polling] Applying update for job ${job.id}:`, update);
                          // Merge update based on provider specific fields if needed
                          return { 
                              ...job, 
                              status: update.status,
                              // OpenAI specific fields
                              fine_tuned_model_id: update.provider === 'openai' ? (update.fine_tuned_model_id !== undefined ? update.fine_tuned_model_id : job.fine_tuned_model_id) : job.fine_tuned_model_id,
                              openai_job_id: update.provider === 'openai' ? (update.openai_job_id || job.openai_job_id) : job.openai_job_id,
                              // Fireworks specific fields
                              fireworks_job_id: update.provider === 'fireworks' ? (update.fireworks_job_id || job.fireworks_job_id) : job.fireworks_job_id,
                              fireworks_file_id: update.provider === 'fireworks' ? (update.fireworks_file_id || job.fireworks_file_id) : job.fireworks_file_id,
                              fine_tuned_model_id: update.provider === 'fireworks' ? (update.fine_tuned_model_id !== undefined ? update.fine_tuned_model_id : job.fine_tuned_model_id) : job.fine_tuned_model_id,
                              error_message: update.error_message !== undefined ? update.error_message : job.error_message,
                              updated_at: new Date().toISOString() 
                          };
                      }
                      return job;
                  });
              });
          }

      }, 30000); // Keep polling interval

      return () => {
          console.log("[Polling] Clearing polling interval.");
          clearInterval(intervalId);
      };

  }, [allJobs]); // Depend on the combined list
  // --------------------------------------------

  // --- Updated Cancel Handler ---
  const handleCancelJob = async (job) => {
      if (!job || !job.id) return;
      
      const providerName = job.provider === 'openai' ? 'OpenAI' : 'Fireworks';
      const jobIdToCancel = job.provider === 'openai' ? job.openai_job_id : job.fireworks_job_id;
      // Correct endpoint for Fireworks cancel
      const cancelApiUrl = job.provider === 'openai' 
          ? '/api/fine-tune/cancel' 
          : '/api/fine-tune/fireworks/cancel'; 

      if (!jobIdToCancel && job.provider === 'openai') { // Only error if OpenAI job ID is missing for OpenAI job
          toast({ title: "Cannot Cancel", description: `Missing ${providerName} job ID.`, variant: "warning" });
          return;
      }

      // Construct payload correctly for both providers
      const payload = job.provider === 'openai' 
          ? { openaiJobId: jobIdToCancel } 
          : { internalJobId: job.id }; // Send internal ID for Fireworks cancel

      if (!confirm(`Are you sure you want to attempt to cancel ${providerName} job: ${job.model_name || jobIdToCancel || job.id}?`)) return;
      
      setCancellingJobId(job.id); 
      try {
          console.log(`[Models Page] Requesting cancellation for ${providerName} Job (Internal ID: ${job.id}, Provider ID: ${jobIdToCancel}) via ${cancelApiUrl}`);
          const response = await fetch(cancelApiUrl, {
              method: 'POST', // Use POST for both cancel endpoints now
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          
          const result = await response.json();
          if (!response.ok) {
              throw new Error(result.error || result.message || `Failed to cancel job (${response.status})`);
          }
          
          // Update local state 
          setAllJobs(prevJobs => prevJobs.map(j => 
              j.id === job.id ? { ...j, status: result.status || 'cancelling' } : j
          ));
          toast({ title: "Cancellation Requested", description: `Cancellation process initiated for ${providerName} job ${jobIdToCancel || job.id}. Status: ${result.status}` });

      } catch (error) {
          console.error(`Error cancelling ${providerName} job:`, error);
          toast({ title: "Cancellation Failed", description: error.message, variant: "destructive" });
      } finally {
          setCancellingJobId(null);
      }
  };
  // ----------------------------
  
  // --- Updated Delete Handler --- 
  const handleDeleteJob = async (job) => {
      if (!job || !job.id) return;
      
      const providerName = job.provider === 'openai' ? 'OpenAI' : 'Fireworks';
      // Use the internal ID for the delete URL for both providers
      const deleteApiUrl = job.provider === 'openai' 
          ? `/api/fine-tune/job/${job.id}` 
          : `/api/fine-tune/fireworks/job/${job.id}`; 

      if (!confirm(`Are you sure you want to delete the record for ${providerName} job: ${job.model_name || job.openai_job_id || job.fireworks_job_id}? This does NOT delete the actual fine-tuned model.`)) return;
      
      setDeletingJobId(job.id); 
      try {
          const response = await fetch(deleteApiUrl, { method: 'DELETE' });
           if (!response.ok) {
              const resultText = await response.text(); // Get text for better debugging
              let errorMsg = `Failed to delete job record (${response.status})`;
              try { errorMsg = JSON.parse(resultText).message || JSON.parse(resultText).error || errorMsg; } catch(e){} 
              console.error(`Delete API Error (${deleteApiUrl}):`, resultText);
              throw new Error(errorMsg);
          }
          
          setAllJobs(prevJobs => prevJobs.filter(j => j.id !== job.id));
          toast({ title: "Job Record Deleted", description: `The ${providerName} job record has been removed.`, variant: "success" });

      } catch (error) {
          console.error(`Error deleting ${providerName} job record:`, error);
          toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
      } finally {
           setDeletingJobId(null);
      }
  };
  // --------------------------------

  // --- Add handlers for selection ---
  const handleRowSelect = (jobId) => {
    setSelectedJobIds(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(jobId)) {
        newSelected.delete(jobId);
      } else {
        newSelected.add(jobId);
      }
      return newSelected;
    });
  };

  // Updated to accept the checked state directly
  const handleSelectAll = (checkedState) => {
      if (checkedState === true) {
          setSelectedJobIds(new Set(allJobs.map(job => job.id)));
      } else {
          setSelectedJobIds(new Set());
      }
  };
  // -----------------------------------

  // --- Add Bulk Delete Handler ---
  const handleBulkDelete = async () => {
      const numSelected = selectedJobIds.size;
      if (numSelected === 0) return;
      
      // --- Add logging here --- 
      console.log("[Models Page] handleBulkDelete called. Selected Job IDs:", Array.from(selectedJobIds));
      // ------------------------

      if (!confirm(`Are you sure you want to delete the records for ${numSelected} selected job(s)? This does NOT delete the actual fine-tuned models.`)) return;

      setIsBulkDeleting(true);
      try {
           console.log(`[Models Page] Requesting bulk delete for jobs:`, Array.from(selectedJobIds));
          const response = await fetch('/api/fine-tune/bulk-delete', { 
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobIds: Array.from(selectedJobIds) })
          });

           const result = await response.json(); // Attempt JSON parse
           if (!response.ok) {
               throw new Error(result.message || `Failed to delete records (${response.status})`);
           }

           // Remove deleted jobs from local state and clear selection
           setAllJobs(prevJobs => prevJobs.filter(j => !selectedJobIds.has(j.id)));
           setSelectedJobIds(new Set());
           toast({ title: "Job Records Deleted", description: result.message || `${numSelected} job record(s) removed.`, variant: "success" });

      } catch (error) {
          console.error("Error bulk deleting job records:", error);
          toast({ title: "Bulk Delete Failed", description: error.message, variant: "destructive" });
      } finally {
          setIsBulkDeleting(false);
      }
  };
  // ------------------------------

  // Determine if the header checkbox should be checked
  const isAllSelected = allJobs.length > 0 && selectedJobIds.size === allJobs.length;
  const isIndeterminate = selectedJobIds.size > 0 && selectedJobIds.size < allJobs.length;

  if (loading) {
    return (
      <div className="container mx-auto py-10 max-w-5xl flex justify-center items-center min-h-[60vh]">
          <Card className="w-full text-center">
              <CardContent className="pt-6">
                  <div className="flex flex-col items-center gap-4">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      <p className="text-muted-foreground">Loading fine-tuning jobs...</p>
                  </div>
              </CardContent>
          </Card>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="container mx-auto  max-w-5xl">
            <Button variant="outline" onClick={() => router.push('/dashboard')} className="gap-2 mb-6">
            <ChevronLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div>   
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <ListChecks className="h-7 w-7" />
              Fine-tuning Jobs & Models
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitor your fine-tuning jobs and access completed models.
            </p>
          </div>
          <Link href="/dashboard/playground" passHref>
             <Button variant="default" className="bg-blue-600 hover:bg-blue-700 text-white">
                 <Play className="mr-2 h-4 w-4"/>
                 Go to Playground
             </Button>
          </Link>
        </div>
        
        {allJobs.length === 0 ? (
          <Card className="w-full text-center py-10">
            <CardContent>
              <div className="flex flex-col items-center gap-4">
                <AlertTriangle className="h-12 w-12 text-muted-foreground" />
                <div>
                  <h2 className="text-xl font-semibold">No Jobs Found</h2>
                  <p className="text-muted-foreground mt-1">
                    You haven&apos;t started any fine-tuning jobs yet.
                  </p>
                </div>
                <Link href="/dashboard/datasets">
                  <Button className="mt-4 bg-black text-white hover:bg-black/90">
                    Prepare a Dataset
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Your Fine-tuning Jobs</CardTitle>
               <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-2">
                 <CardDescription>
                    Showing {allJobs.length} {allJobs.length === 1 ? 'job' : 'jobs'}. Statuses update periodically.
                 </CardDescription>
                 {selectedJobIds.size > 0 && (
                     <Button 
                         variant="destructive"
                         size="sm"
                         onClick={handleBulkDelete}
                         disabled={isBulkDeleting}
                         className="w-full sm:w-auto"
                      >
                         {isBulkDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Trash2 className="mr-2 h-4 w-4" />} 
                         Delete {selectedJobIds.size} Selected
                      </Button>
                 )}
               </div>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">
                           <Checkbox 
                              id="select-all-jobs"
                              checked={isAllSelected}
                              onCheckedChange={handleSelectAll} 
                              aria-label="Select all rows"
                              data-state={isIndeterminate ? 'indeterminate' : (isAllSelected ? 'checked' : 'unchecked')}
                           />
                        </TableHead>
                       <TableHead className="w-[80px]">Provider</TableHead>
                      <TableHead>Custom Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Base Model</TableHead>
                        <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">Created</TableHead>
                      <TableHead>Model Endpoint/ID</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                    {allJobs.map((job) => {
                        const isSelected = selectedJobIds.has(job.id);
                        const isCancellable = (job.provider === 'openai' && ['queued', 'running', 'validating_files'].includes(job.status?.toLowerCase())) || 
                                              (job.provider === 'fireworks' && !['job_state_completed', 'job_state_failed', 'job_state_cancelled', 'job_state_deleting_incomplete'].includes(job.status?.toLowerCase()));
                        const isCancelling = cancellingJobId === job.id;
                        const isDeleting = deletingJobId === job.id;
                        const displayModelId = job.fine_tuned_model_id;
                        // --- Check if model is completed and has ID --- 
                        const isCompletedWithModel = (job.status === 'succeeded' || job.status === 'JOB_STATE_COMPLETED') && displayModelId;
                        // ---------------------------------------------
                        
                        return (
                          <TableRow 
                             key={job.id} 
                             data-provider={job.provider}
                             data-state={isSelected ? "selected" : ""}
                          >
                            <TableCell>
                               <Checkbox 
                                  id={`select-job-${job.id}`}
                                  checked={isSelected}
                                  onCheckedChange={() => handleRowSelect(job.id)}
                                  aria-label={`Select row for job ${job.model_name}`}
                               />
                            </TableCell>
                            <TableCell>
                               {job.provider === 'openai' ? (
                                  <span className="text-xs font-medium">OpenAI</span>
                               ) : (
                                  <span className="text-xs font-medium flex items-center gap-1"> Fireworks</span>
                               )}
                            </TableCell>
                           <TableCell className="font-medium">
                              <span className="truncate max-w-[150px] inline-block" title={job.model_name}>
                                 {job.model_name || '-'}
                              </span>
                           </TableCell>
                           <TableCell className="hidden sm:table-cell">
                              <span className="text-xs">{job.base_model || '-'}</span>
                           </TableCell>
                            <TableCell>
                               <div className="flex items-center gap-1">
                                  <StatusBadge status={job.status} />
                                  {job.status === 'failed' && job.error_message && (
                                     <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Info className="h-4 w-4 text-destructive cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-xs bg-destructive/10 border-destructive text-destructive-foreground">
                                            <p className="font-semibold mb-1">Error:</p>
                                            <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(job.error_message, null, 2)}</pre>
                                        </TooltipContent>
                                     </Tooltip>
                              )}
                            </div>
                          </TableCell>
                            <TableCell className="hidden md:table-cell">
                               {formatDate(job.created_at)}
                            </TableCell>
                            <TableCell>
                               {displayModelId ? (
                                  <div className="flex items-center gap-1">
                                     <span 
                                         className="font-mono text-xs bg-muted p-1 rounded block max-w-[200px] break-all" 
                                         title={displayModelId}
                                      >
                                         {displayModelId}
                                     </span>
                                     <Button
                                         variant="ghost"
                                         size="icon"
                                         className="h-6 w-6"
                                         onClick={() => navigator.clipboard.writeText(displayModelId).then(() => toast({ title: "Copied Model ID!" }))}
                                         title="Copy Model ID"
                                     >
                                         <Copy className="h-3 w-3" />
                                     </Button>
                                      {job.provider === 'fireworks' && <FireworksUsageInfo modelId={displayModelId} />}
                                  </div>
                               ) : (
                                   <span className="text-muted-foreground text-xs">N/A</span>
                               )}
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" className="h-8 w-8 p-0" disabled={isCancelling || isDeleting}>
                                           {(isCancelling || isDeleting) ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                                           <span className="sr-only">Open actions</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                       <DropdownMenuLabel>{job.provider === 'openai' ? 'OpenAI' : 'Fireworks'} Actions</DropdownMenuLabel>
                                       <DropdownMenuSeparator />
                                       <DropdownMenuItem 
                                          disabled={ 
                                             isCancelling || isDeleting ||
                                             !isCancellable
                                          }
                                          onClick={() => handleCancelJob(job)} 
                                          className="text-amber-600 focus:text-amber-700 focus:bg-amber-100"
                                       >
                                          <XCircle className="mr-2 h-4 w-4" />
                                          <span>Cancel Job</span>
                                    </DropdownMenuItem>
                                       <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                          onClick={() => handleDeleteJob(job)} 
                                          disabled={isDeleting}
                                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                        >
                                           <Trash2 className="mr-2 h-4 w-4" />
                                           <span>Delete Record</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                    })}
                    </TableBody>
                  </Table>
              </div>
            </CardContent>
          </Card>
        )}
              </div>
    </TooltipProvider>
  );
}

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
  Copy            // Icon for copy
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

// Helper to format status badges
const StatusBadge = ({ status }) => {
  let variant = "secondary";
  switch (status?.toLowerCase()) {
    case 'succeeded':
      variant = "success"; // Assuming you have a success variant
      break;
    case 'failed':
    case 'cancelled':
      variant = "destructive";
      break;
    case 'running':
      variant = "default"; // Use primary color for running
      break;
    case 'queued':
    case 'validating_files':
      variant = "outline";
      break;
    default:
      variant = "secondary";
  }
  return <Badge variant={variant}>{status || 'Unknown'}</Badge>;
};

export default function ModelsPage() {
  const [user, setUser] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancellingJobId, setCancellingJobId] = useState(null); // Track cancelling state
  const [deletingJobId, setDeletingJobId] = useState(null); // Track deleting state
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

  // Fetch initial jobs
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

        const { data: jobsData, error: jobsError } = await supabase
          .from('fine_tuning_jobs')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (jobsError) throw jobsError;
        
        setJobs(jobsData || []);
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

  // TODO: Implement polling useEffect here later
  // --- Add Polling Effect ---
  useEffect(() => {
      // Only poll if there are jobs that might still be running
      const jobsToPoll = jobs.filter(job => 
           !['succeeded', 'failed', 'cancelled', 'error_fetching_status'].includes(job.status?.toLowerCase()) 
           && job.openai_job_id // Only poll if we have the OpenAI job ID
      );

      if (jobsToPoll.length === 0) {
          console.log("[Polling] No active jobs found to poll.");
          return; // No active jobs, no need to poll
      }

      const jobIdsToPoll = jobsToPoll.map(job => job.openai_job_id);
      console.log(`[Polling] Setting up polling for job IDs: ${jobIdsToPoll.join(', ')}`);

      const intervalId = setInterval(async () => {
          console.log(`[Polling] Fetching status update for jobs: ${jobIdsToPoll.join(', ')}`);
          try {
              const response = await fetch(`/api/fine-tune/status?jobIds=${jobIdsToPoll.join(',')}`);
              if (!response.ok) {
                  console.warn(`[Polling] Status fetch failed: ${response.status}`);
                  return; // Don't process bad response
              }
              const { updatedJobs } = await response.json();
              
              if (updatedJobs && updatedJobs.length > 0) {
                  console.log("[Polling] Received updates:", updatedJobs);
                  setJobs(currentJobs => {
                      // Create a map for quick lookup of updates
                      const updatesMap = new Map(updatedJobs.map(uj => [uj.openai_job_id, uj]));
                      // Update existing jobs
                      return currentJobs.map(job => {
                           const update = updatesMap.get(job.openai_job_id);
                           if (update) {
                               // Merge update, prioritizing fields from the update
                               return { 
                                   ...job, 
                                   status: update.status,
                                   fine_tuned_model_id: update.fine_tuned_model_id !== undefined ? update.fine_tuned_model_id : job.fine_tuned_model_id,
                                   error_message: update.error_message !== undefined ? update.error_message : job.error_message,
                                   updated_at: new Date().toISOString() // Update local timestamp too
                               };
                           }
                           return job; // No update for this job
                      });
                  });
              }

          } catch (error) {
              console.error("[Polling] Error during status poll:", error);
              // Optionally notify user? Polling will retry on next interval.
          }
      }, 30000); // Poll every 30 seconds

      // Cleanup function to clear the interval when the component unmounts
      // or when the list of jobs to poll changes
      return () => {
          console.log("[Polling] Clearing polling interval.");
          clearInterval(intervalId);
      };

  }, [jobs]); // Re-run the effect if the jobs list changes (e.g., after an update)
  // --------------------------

  // --- Handler to Cancel Job --- 
  const handleCancelJob = async (job) => {
      if (!job || !job.openai_job_id) return;
      if (!confirm(`Are you sure you want to attempt to cancel job: ${job.model_name || job.openai_job_id}?`)) return;
      
      setCancellingJobId(job.id);
      try {
          console.log(`[Models Page] Requesting cancellation for OpenAI Job ID: ${job.openai_job_id}`);
          const response = await fetch('/api/fine-tune/cancel', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ openaiJobId: job.openai_job_id })
          });
          
          const result = await response.json();
          if (!response.ok) {
              throw new Error(result.error || `Failed to cancel job (${response.status})`);
          }
          
          // Update local state immediately to 'cancelling' or 'cancelled'
          setJobs(prevJobs => prevJobs.map(j => 
              j.id === job.id ? { ...j, status: result.status || 'cancelling' } : j
          ));
          toast({ title: "Cancellation Requested", description: `Cancellation process initiated for job ${result.jobId}. Status: ${result.status}` });

      } catch (error) {
          console.error('Error cancelling job:', error);
          toast({ title: "Cancellation Failed", description: error.message, variant: "destructive" });
      } finally {
          setCancellingJobId(null);
      }
  };
  // ----------------------------
  
  // --- Handler to Delete DB Record --- 
  const handleDeleteJob = async (job) => {
      if (!job || !job.id) return;
      if (!confirm(`Are you sure you want to delete the record for job: ${job.model_name || job.openai_job_id}? This does NOT delete the model on OpenAI.`)) return;
      
      setDeletingJobId(job.id);
      try {
          const response = await fetch(`/api/fine-tune/job/${job.id}`, { // Assuming a new route for specific job deletion
              method: 'DELETE',
          });
           if (!response.ok) {
              const result = await response.json().catch(() => ({}));
              throw new Error(result.error || `Failed to delete job record (${response.status})`);
          }
          
          setJobs(prevJobs => prevJobs.filter(j => j.id !== job.id));
          toast({ title: "Job Record Deleted", description: "The job record has been removed.", variant: "success" });

      } catch (error) {
          console.error('Error deleting job record:', error);
          toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
      } finally {
           setDeletingJobId(null);
      }
  };
  // --------------------------------

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
      <div className="container mx-auto py-10 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <ListChecks className="h-7 w-7" />
              Fine-tuning Jobs & Models
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitor your fine-tuning jobs and access completed models.
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push('/dashboard')} className="gap-2">
            <ChevronLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
        
        {jobs.length === 0 ? (
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
              <CardDescription>
                 Showing {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}. Statuses will update periodically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Custom Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Base Model</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">Created</TableHead>
                      <TableHead>Model API Endpoint</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job) => {
                        const isCancellable = ['queued', 'running', 'validating_files'].includes(job.status?.toLowerCase());
                        const isCancelling = cancellingJobId === job.id;
                        const isDeleting = deletingJobId === job.id;
                        
                        return (
                          <TableRow key={job.id}>
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
                               {job.fine_tuned_model_id ? (
                                  <div className="flex items-center gap-1">
                                     <span 
                                         className="font-mono text-xs bg-muted p-1 rounded block max-w-[200px] break-all" 
                                         title={job.fine_tuned_model_id}
                                      >
                                         {job.fine_tuned_model_id}
                                     </span>
                                     <Button
                                         variant="ghost"
                                         size="icon"
                                         className="h-6 w-6"
                                         onClick={() => navigator.clipboard.writeText(job.fine_tuned_model_id).then(() => toast({ title: "Copied Model ID!" }))}
                                         title="Copy Model ID"
                                     >
                                         <Copy className="h-3 w-3" />
                                     </Button>
                                  </div>
                               ) : (
                                   <span className="text-muted-foreground text-xs">N/A</span>
                               )}
                            </TableCell>
                            <TableCell className="text-right">
                               {/* --- Actions Dropdown --- */}
                               <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" className="h-8 w-8 p-0" disabled={isCancelling || isDeleting}>
                                         {(isCancelling || isDeleting) ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                                         <span className="sr-only">Open actions</span>
                                      </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                     <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                     <DropdownMenuSeparator />
                                     {/* TODO: Add View Details Item */} 
                                     <DropdownMenuItem disabled={!isCancellable || isCancelling} onClick={() => handleCancelJob(job)} className="text-amber-600 focus:text-amber-700 focus:bg-amber-100">
                                        <XCircle className="mr-2 h-4 w-4" />
                                        <span>Cancel Job</span>
                                     </DropdownMenuItem>
                                     <DropdownMenuSeparator />
                                     <DropdownMenuItem onClick={() => handleDeleteJob(job)} disabled={isDeleting} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                         <Trash2 className="mr-2 h-4 w-4" />
                                         <span>Delete Record</span>
                                     </DropdownMenuItem>
                                  </DropdownMenuContent>
                               </DropdownMenu>
                               {/* ------------------------- */}
                            </TableCell>
                          </TableRow>
                        );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
            {/* Optional Footer */}
            {/* <CardFooter className="border-t pt-4">
                 <p className="text-xs text-muted-foreground">Status refresh interval: 30 seconds</p>
            </CardFooter> */}
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}

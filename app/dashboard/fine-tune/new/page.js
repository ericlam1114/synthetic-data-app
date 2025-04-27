"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardFooter, 
  CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  AlertCircle, 
  ChevronLeft, 
  Info, 
  BrainCircuit, 
  Loader2, 
  KeyRound, 
  Save, 
  CheckCircle, 
  Wand2 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import Link from 'next/link';

// --- Hardcode BASE_MODELS based on screenshot ---
const BASE_MODELS = [
  { id: "gpt-4o-mini-2024-07-18", name: "gpt-4o-mini-2024-07-18" },
  { id: "gpt-3.5-turbo-0125", name: "gpt-3.5-turbo-0125" },
  { id: "gpt-3.5-turbo-1106", name: "gpt-3.5-turbo-1106" },
  { id: "gpt-4o-2024-08-06", name: "gpt-4o-2024-08-06" }, // Added based on screenshot if needed
  { id: "gpt-4.1-mini-2025-04-14", name: "gpt-4.1-mini-2025-04-14" }, // Added based on screenshot
  { id: "gpt-4.1-2025-04-14", name: "gpt-4.1-2025-04-14" }, // Added based on screenshot
].sort((a, b) => {
    // Optional: Sort logic if needed, e.g., prioritize mini, then 3.5
    if (a.id.includes('gpt-4o-mini') && !b.id.includes('gpt-4o-mini')) return -1;
    if (!a.id.includes('gpt-4o-mini') && b.id.includes('gpt-4o-mini')) return 1;
    if (a.id.includes('gpt-3.5') && !b.id.includes('gpt-3.5')) return -1;
    if (!a.id.includes('gpt-3.5') && b.id.includes('gpt-3.5')) return 1;
    return a.name.localeCompare(b.name);
});
// ------------------------------------------------

// Wrapper component to read search params
function FineTuneSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [outputKeys, setOutputKeys] = useState([]);
  
  // API Key State
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isCheckingKey, setIsCheckingKey] = useState(true);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false); // Control visibility of input

  // Fine-tuning Job State
  const [modelName, setModelName] = useState(''); // User-defined name for the FT model
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [error, setError] = useState(null);
  
  // Set default base model from hardcoded list
  const [baseModel, setBaseModel] = useState(BASE_MODELS.length > 0 ? BASE_MODELS[0].id : undefined);

  // Fetch initial data (user, keys, API key status)
  useEffect(() => {
    let isMounted = true;
    const loadInitialData = async () => {
        // Combine loading states
        setIsCheckingKey(true); 
        try {
            // User session
            const { data: { session }, error: authError } = await supabase.auth.getSession();
            if (!session?.user) {
                toast({ title: "Unauthorized", description: "Please log in.", variant: "destructive" });
                router.push('/');
                return;
            }
            if (isMounted) setUser(session.user);

            // Dataset keys
            const keysParam = searchParams.get('outputKeys');
            if (keysParam) {
                const keys = keysParam.split(',').map(decodeURIComponent).filter(Boolean);
                if (keys.length > 0) {
                    if (isMounted) setOutputKeys(keys);
                } else {
                    toast({ title: "Missing Data", description: "No valid dataset keys found.", variant: "destructive" });
                    router.push('/dashboard/upload');
                    return;
                }
            } else {
                toast({ title: "Missing Data", description: "No dataset keys provided.", variant: "destructive" });
                router.push('/dashboard/upload');
                return;
            }

            // Check API key status (needed for enabling the main submit button)
            const apiKeyRes = await fetch('/api/user/api-key');
            if (!apiKeyRes.ok) {
                console.warn(`API key status check failed (${apiKeyRes.status}), assuming no key saved.`);
                // Don't throw, allow model fetching anyway
                if (isMounted) setHasApiKey(false);
            } else {
                const apiKeyData = await apiKeyRes.json();
                setHasApiKey(apiKeyData.hasApiKey);
                // Always show input if no key exists, allow user to hide later if they wish
                if (isMounted && !hasApiKey) setShowKeyInput(true);
            }

        } catch (err) {
            if (isMounted) {
                console.error("Initial load error:", err);
                setError(err.message);
                toast({ title: "Error Loading Setup", description: err.message, variant: "destructive" });
            }
        } finally {
            // Also set checking key to false here, as it happens after model fetch attempt
            if (isMounted) setIsCheckingKey(false);
        }
    };
    
    loadInitialData();
    return () => { isMounted = false; }; // Cleanup
}, [searchParams, router, toast, hasApiKey]);

 // Handler to save the API key
  const handleSaveApiKey = async () => {
    if (!apiKeyInput.startsWith('sk-')) {
      toast({ title: "Invalid Key Format", description: "OpenAI key must start with 'sk-'.", variant: "destructive" });
      return;
    }
    setIsSavingKey(true);
    setError(null);
    try {
      const response = await fetch('/api/user/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to save API key');
      }
      toast({ title: "API Key Saved Successfully" });
      setHasApiKey(true); // Update state
      setShowKeyInput(false); // Hide input after saving
      setApiKeyInput(''); // Clear input
    } catch (err) {
      console.error("Save API key error:", err);
      setError(err.message);
      toast({ title: "Error Saving Key", description: err.message, variant: "destructive" });
    } finally {
      setIsSavingKey(false);
    }
  };

  // Handler to submit the fine-tuning job
  const handleCreateJob = async (e) => {
    e.preventDefault();
    if (!user || outputKeys.length !== 1 || !modelName.trim() || !baseModel) {
      setError("Please provide a model name and select a base model.");
      return;
    }
    if (!hasApiKey) {
      setError("Please save your OpenAI API key before starting a job.");
      return;
    }
    
    setIsSubmittingJob(true);
    setError(null);

    try {
      // API key is NOT sent from client anymore
      const response = await fetch('/api/fine-tune/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          outputKey: outputKeys[0], 
          modelName: modelName.trim(), 
          baseModel: baseModel, 
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP error ${response.status}`);
      }

      toast({
        title: "Fine-tuning Job Created",
        description: `Job ${result.jobId} started. Check Models page for status.`,
      });
      router.push('/dashboard/models'); 

    } catch (err) {
      console.error("Fine-tuning submission error:", err);
      setError(err.message || "Failed to start fine-tuning job.");
      toast({ title: "Error Creating Job", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmittingJob(false);
    }
  };

  // --- Add log to check state during render --- 
  console.log("[Fine-tune Page Render] State check:", {
      isCheckingKey,
      baseModel,
      hasApiKey,
      isSavingKey
  });
  // -------------------------------------------

  // Loading state for initial check
  if (isCheckingKey) { // Check only checking key
    return (
         <div className="container mx-auto py-10 max-w-2xl flex justify-center items-center min-h-[50vh]">
             <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
         </div>
     );
  }

  // --- Log button disabled state --- 
  const isSaveButtonDisabled = isSavingKey || !apiKeyInput || !apiKeyInput.startsWith('sk-');
  console.log("[Fine-tune Render Check] Save Button Disabled State:", {
      isSavingKey,
      apiKeyInputLength: apiKeyInput.length,
      startsWithSk: apiKeyInput.startsWith('sk-'),
      isDisabled: isSaveButtonDisabled
  });
  // --------------------------------

  return (
    <TooltipProvider>
      <div className="container mx-auto py-10 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Wand2 className="h-7 w-7" />
              Configure Fine-tuning Job
            </h1>
            <p className="text-muted-foreground mt-1">
              Set up your OpenAI fine-tuning job.
            </p>
          </div>
          <Button variant="outline" onClick={() => router.back()} className="gap-2">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        <Card>
          <form onSubmit={handleCreateJob}>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>
                Provide details for your fine-tuning job.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {error && (
                 <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                   <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                   <p>{error}</p>
                 </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="datasets">Selected Dataset(s)</Label>
                <div className="p-3 border rounded-md bg-muted text-sm text-muted-foreground">
                  Using data from {outputKeys.length} processed file(s).
                </div>
                 <p className="text-xs text-muted-foreground">
                  The content from the output file(s) you selected will be merged and used for training.
                </p>
              </div>

              <div className="space-y-2 border p-4 rounded-md bg-secondary/30">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <Label htmlFor="apiKey" className="font-semibold">OpenAI API Key</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                           <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                           <p>Required to interact with the OpenAI fine-tuning API. Your key is stored securely using encryption.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    {hasApiKey && !showKeyInput && (
                        <Button variant="link" size="sm" onClick={() => setShowKeyInput(true)} className="text-xs h-auto p-0">
                           Update Key
                        </Button>
                    )}
                </div>

                {hasApiKey && !showKeyInput ? (
                    <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-2 rounded-md border border-green-200">
                        <CheckCircle className="h-4 w-4"/>
                        <span>API Key is securely stored.</span>
                    </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="apiKeyInput"
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder="Enter your OpenAI key (sk-...)"
                        required={!hasApiKey}
                        className="pl-10"
                      />
                    </div>
                     <Button 
                         type="button" 
                         onClick={handleSaveApiKey}
                         disabled={isSaveButtonDisabled}
                         className="bg-black text-white hover:bg-black/90"
                         size="sm"
                      >
                         {isSavingKey ? <Loader2 className=" mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                         {hasApiKey ? 'Update Saved Key' : 'Save Key'}
                      </Button>
                      <p className="text-xs text-muted-foreground pt-1">
                          Your API key will be securely encrypted before saving.
                      </p>
                  </div>
                )}
                {!hasApiKey && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3"/> You must save an API key to start a fine-tuning job.
                    </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="modelName">Your Model Name</Label>
                <Input
                  id="modelName"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="e.g., my-legal-assistant-v1"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  A descriptive name for your fine-tuned model.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="baseModel">Base Model</Label>
                <Select 
                    value={baseModel} 
                    onValueChange={setBaseModel} 
                    required 
                    disabled={BASE_MODELS.length === 0} // Disable if hardcoded list is empty
                >
                  <SelectTrigger id="baseModel">
                    <SelectValue placeholder={BASE_MODELS.length === 0 ? "No models available" : "Select base model"} />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Use hardcoded BASE_MODELS */}
                    {BASE_MODELS.map(model => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name} 
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choose the foundation model to fine-tune.
                </p>
              </div>
            </CardContent>
            <CardFooter className="border-t pt-6">
               <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:opacity-90"
                disabled={isSubmittingJob || !hasApiKey || isSavingKey || !modelName.trim() || !baseModel} 
                title={!hasApiKey ? "Save your API key first" : (!modelName.trim() || !baseModel) ? "Enter model name and select base model" : "Start fine-tuning job"}
              >
                {isSubmittingJob ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting Fine-tuning...
                  </>
                ) : (
                  <>
                    <BrainCircuit className="mr-2 h-4 w-4" />
                    Start Fine-tuning Job
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </TooltipProvider>
  );
}

// Export a wrapper component that uses Suspense
export default function FineTuneNewPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-[50vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <FineTuneSetupContent />
    </Suspense>
  );
} 
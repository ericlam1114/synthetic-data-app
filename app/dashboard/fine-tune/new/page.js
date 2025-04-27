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
  Wand2,
  Flame,
  RefreshCw,
  HelpCircle,
  ExternalLink
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

// --- Combine Base Models into a single list (Updated IDs based on Docs/Screenshot) ---
const ALL_BASE_MODELS = [
  // OpenAI Models (Keep as is)
  { id: "gpt-4o-mini-2024-07-18", name: "GPT-4o Mini", provider: 'openai' },
  { id: "gpt-3.5-turbo-0125", name: "GPT-3.5 Turbo", provider: 'openai' },
  // Fireworks Models (Use shorter IDs from docs/screenshot where possible, prioritize tunable)
  // From screenshot:
  { id: "llama-v3p1-8b-instruct", name: "Llama 3.1 8B Instruct", provider: 'fireworks' }, // Used in docs example
  // { id: "llama-v3p1-405b-instruct", name: "Llama 3.1 405B Instruct", provider: 'fireworks' }, // Needs confirmation if ID is exactly this
  // { id: "deepseek-v2", name: "DeepSeek V2", provider: 'fireworks' }, // Assuming DeepSeek V3 = v2? Need confirmation
  // { id: "deepseek-r1-fast", name: "DeepSeek R1 (Fast)", provider: 'fireworks' }, // Need ID confirmation
  // From previous list (keep if potentially tunable, use shorter ID if known)
  { id: "mistral-7b-instruct-v0p3", name: "Mistral 7B Instruct v0.3", provider: 'fireworks' }, // Assume short ID
  // { id: "mixtral-8x7b-instruct", name: "Mixtral 8x7B Instruct", provider: 'fireworks' }, // Assume short ID
  { id: "llama-v3-70b-instruct", name: "Llama 3 70B Instruct", provider: 'fireworks' }, // Keep original short ID
].sort((a, b) => {
    // Sort perhaps by provider then name
    if (a.provider < b.provider) return -1;
    if (a.provider > b.provider) return 1;
    return a.name.localeCompare(b.name);
});
// Note: Need to confirm exact IDs for 405B, DeepSeek models if possible.
// -----------------------------------------------------------------------------------

// Helper function to determine provider from model ID
function getProviderFromModelId(modelId) {
    if (!modelId) return null;
    // Check based on known Fireworks patterns or explicit provider field
    const modelInfo = ALL_BASE_MODELS.find(m => m.id === modelId);
    if (modelInfo) return modelInfo.provider;
    
    // Fallback heuristics (less reliable)
    if (modelId.includes('instruct') || modelId.includes('llama') || modelId.includes('mistral') || modelId.includes('deepseek')) {
        // Assume these are likely Fireworks if not explicitly OpenAI
        if (!modelId.startsWith('gpt-')) {
             console.warn(`[getProviderFromModelId] Assuming 'fireworks' for model: ${modelId}`);
            return 'fireworks';
        }
    }
    if (modelId.startsWith('gpt-')) {
         console.warn(`[getProviderFromModelId] Assuming 'openai' for model: ${modelId}`);
        return 'openai';
    }
    console.error(`[getProviderFromModelId] Could not determine provider for model: ${modelId}`);
    return null; // Cannot determine
}

// Wrapper component
function FineTuneSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [outputKeys, setOutputKeys] = useState([]);
  
  // --- Add state for dataset ID and conversion flow ---
  const [datasetId, setDatasetId] = useState(null);
  const [showConversionOption, setShowConversionOption] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  // -----------------------------------------------------

  // API Key States
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
  const [hasFireworksKey, setHasFireworksKey] = useState(false);
  const [isCheckingKeys, setIsCheckingKeys] = useState(true);
  // Add state for Account ID status
  const [hasFireworksAccountId, setHasFireworksAccountId] = useState(false); 

  // Fine-tuning Job State
  const [modelName, setModelName] = useState(''); 
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [error, setError] = useState(null);
  // State to hold the format of the dataset being used
  const [datasetFormat, setDatasetFormat] = useState(null);
  
  // --- State for Inline Key Input ---
  const [openaiApiKeyInput, setOpenaiApiKeyInput] = useState('');
  const [fireworksApiKeyInput, setFireworksApiKeyInput] = useState('');
  const [isSavingApiKeyInline, setIsSavingApiKeyInline] = useState(false);
  // ---------------------------------

  // --- State for Inline Account ID Input ---
  const [fireworksAccountIdInput, setFireworksAccountIdInput] = useState('');
  const [isSavingAccountIdInline, setIsSavingAccountIdInline] = useState(false);
  // -------------------------------------

  // Default to the first model in the combined list
  const [baseModel, setBaseModel] = useState(ALL_BASE_MODELS[0]?.id);

  // Get current provider based on selected baseModel
  const currentProvider = getProviderFromModelId(baseModel);

  // Fetch initial data (user, keys, API key statuses)
  useEffect(() => {
    let isMounted = true;
    const loadInitialData = async () => {
        setIsCheckingKeys(true); // Use this single state for all initial checks
        try {
            const { data: { session }, error: authError } = await supabase.auth.getSession();
            if (!session?.user) {
                toast({ title: "Unauthorized", description: "Please log in.", variant: "destructive" });
                 if (isMounted) router.push('/');
                return;
            }
            if (isMounted) setUser(session.user);

            // Get dataset keys
            const keysParam = searchParams.get('outputKeys');
            if (keysParam) {
                const keys = keysParam.split(',').map(decodeURIComponent).filter(Boolean);
                if (keys.length > 0) {
                    if (isMounted) setOutputKeys(keys);
                } else {
                    toast({ title: "Missing Data", description: "No valid dataset keys found.", variant: "destructive" });
                    if (isMounted) router.push('/dashboard/datasets'); // Redirect to datasets page
                    return;
                }
            } else {
                toast({ title: "Missing Data", description: "No dataset keys provided.", variant: "destructive" });
                if (isMounted) router.push('/dashboard/datasets'); // Redirect to datasets page
                return;
            }

            // Get dataset format
            const formatParam = searchParams.get('datasetFormat');
            console.log(`[FineTunePage useEffect Load] Received datasetFormat from URL: ${formatParam}`); 
            if (formatParam) {
                if (isMounted) setDatasetFormat(decodeURIComponent(formatParam));
            } else {
                // If format is missing, we can't proceed reliably
                toast({ title: "Missing Data", description: "Dataset format information is missing.", variant: "warning" });
                if (isMounted) router.push('/dashboard/datasets'); // Redirect back
                return;
            }

            // --- Get dataset ID --- 
            const idParam = searchParams.get('datasetId');
            console.log(`[FineTunePage useEffect Load] Received datasetId from URL: ${idParam}`); 
            if (idParam) {
                if (isMounted) setDatasetId(decodeURIComponent(idParam));
            } else {
                toast({ title: "Missing Data", description: "Dataset ID information is missing.", variant: "warning" });
                if (isMounted) router.push('/dashboard/datasets'); // Redirect back
                return;
            }
            // ----------------------

            // Fetch all statuses concurrently
            const [openaiRes, fireworksKeyRes, fireworksAccountRes] = await Promise.all([
                fetch('/api/user/api-key').catch(e => null),
                fetch('/api/user/fireworks-key').catch(e => null),
                fetch('/api/user/fireworks-account').catch(e => null) // Fetch account status
            ]);
            if (openaiRes?.ok) {
                const openaiData = await openaiRes.json();
                if (isMounted) setHasOpenAIKey(openaiData.hasApiKey);
            }
            if (fireworksKeyRes?.ok) {
                 const fireworksKeyData = await fireworksKeyRes.json();
                 console.log("[FineTunePage useEffect Load] Fetched Fireworks Key Status:", fireworksKeyData);
                 if (isMounted) setHasFireworksKey(fireworksKeyData.hasApiKey);
            } else {
                 console.warn("[FineTunePage useEffect Load] Fetch Fireworks Key Status FAILED:", fireworksKeyRes?.status);
            }
             // Set Fireworks Account ID status
            if (fireworksAccountRes?.ok) {
                 const fireworksAccountData = await fireworksAccountRes.json();
                 console.log("[FineTunePage useEffect Load] Fetched Fireworks Account ID Status:", fireworksAccountData);
                 if (isMounted) setHasFireworksAccountId(fireworksAccountData.hasAccountId);
            } else {
                 console.warn("[FineTunePage useEffect Load] Fetch Fireworks Account ID Status FAILED:", fireworksAccountRes?.status);
            }

        } catch (err) {
            if (isMounted) {
                console.error("Initial load error:", err);
                setError(err.message);
                toast({ title: "Error Loading Setup", description: err.message, variant: "destructive" });
            }
        } finally {
            if (isMounted) setIsCheckingKeys(false); // Single loading state
        }
    };
    
    loadInitialData();
    return () => { isMounted = false; };
}, [searchParams, router, toast]);

// --- Add useEffect for dynamic format/key checks --- 
useEffect(() => {
    // Wait for initial data load to complete
    if (isCheckingKeys || !datasetFormat || !baseModel) {
      return; 
    }

    const provider = getProviderFromModelId(baseModel);
    const requiredFormat = provider === 'openai' ? 'openai-jsonl' : 'jsonl';
    
    // Reset needs flags
    let formatMismatched = false;
    let apiKeyMissing = false;
    let accountIdMissing = false;
    let currentError = null;

    // 1. Check Format
    if (datasetFormat !== requiredFormat) {
        formatMismatched = true;
        const formatMap = { 'jsonl': 'Standard JSONL', 'openai-jsonl': 'OpenAI JSONL', 'json': 'JSON', 'csv': 'CSV' };
        const currentFormatDisplay = formatMap[datasetFormat] || datasetFormat;
        const requiredFormatDisplay = formatMap[requiredFormat] || requiredFormat;
        currentError = `Format Mismatch: This dataset is '${currentFormatDisplay}'. The selected ${provider === 'openai' ? 'OpenAI' : 'Fireworks'} model requires '${requiredFormatDisplay}'.`;
        console.log(`[FineTunePage useEffect Check] Result: Format Mismatch.`);
    } 
    // 2. Else (Format is OK), check Credentials
    else {
        if (provider === 'openai' && !hasOpenAIKey) {
            apiKeyMissing = true;
            currentError = "OpenAI API Key Missing: Please save your OpenAI API key below.";
        }
        if (provider === 'fireworks') {
            if (!hasFireworksKey) {
                apiKeyMissing = true;
                 // Set a combined message if both are missing initially
                currentError = hasFireworksAccountId 
                    ? "Fireworks AI Key Missing: Please save your API key below." 
                    : "Fireworks Credentials Missing: Please save your API key and Account ID below.";
            } 
            if (!hasFireworksAccountId) { // Check ID independently
                accountIdMissing = true;
                 // Update error message if key is present but ID is missing
                 if (!apiKeyMissing) {
                     currentError = "Fireworks Account ID Missing: Please save your Account ID below.";
                 }
                 // If key is also missing, the combined message from above is already set
            }
        }
        console.log(`[FineTunePage useEffect Check] Result: Format OK. Needs Key=${apiKeyMissing}, Needs AccID=${accountIdMissing}`);
    }

    // Update state
    setError(currentError);
    setShowConversionOption(formatMismatched); 
    // Note: We don't set individual needs flags in state, the JSX will handle rendering based on provider and error content

}, [baseModel, datasetFormat, hasOpenAIKey, hasFireworksKey, hasFireworksAccountId, isCheckingKeys]);
// -------------------------------------------------

  // Handler to submit the fine-tuning job
  const handleCreateJob = async (e) => {
    e.preventDefault();
    const provider = getProviderFromModelId(baseModel); 
    
    // --- Re-check critical conditions before submit --- 
    if (!user || !datasetId || outputKeys.length === 0 || !modelName.trim() || !baseModel || !provider || !datasetFormat) {
      setError("Please ensure a dataset is selected, provide a model name, and select a base model.");
      setShowConversionOption(false); 
      return;
    }
    const requiredFormat = provider === 'openai' ? 'openai-jsonl' : 'jsonl';
    if (datasetFormat !== requiredFormat) {
        setError("Dataset format does not match the selected model's requirement. Please use the conversion option or select a different dataset/model.");
        setShowConversionOption(true);
        toast({ title: "Format Mismatch", description: "Cannot start job, incorrect dataset format for the selected model.", variant: "destructive" });
        return; // Stop if format mismatch somehow missed by useEffect
    }
    if (provider === 'openai' && !hasOpenAIKey) {
       setError("OpenAI API Key Missing: Please save your OpenAI API key first.");
       setShowConversionOption(false); 
       return;
    }
    // Add check for Fireworks Account ID
    if (provider === 'fireworks') {
      if (!hasFireworksKey) {
        setError("Fireworks AI Key Missing: Please save your Fireworks API key first.");
        setShowConversionOption(false); 
        return;
      }
      if (!hasFireworksAccountId) {
        setError("Fireworks Account ID Missing: Please save your Fireworks Account ID first.");
        setShowConversionOption(false); 
        return;
      }
    }
    // --- End re-checks ---

    console.log(`[handleCreateJob] Submit validation passed. Submitting job...`); // <-- LOGGING UPDATED
    setIsSubmittingJob(true);
    setError(null); // Clear any residual UI errors before submission

    const apiUrl = provider === 'openai' 
        ? '/api/fine-tune/create' 
        : '/api/fine-tune/fireworks/create';
    const providerName = provider === 'openai' ? 'OpenAI' : 'Fireworks AI';

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          outputKey: outputKeys[0], 
          modelName: modelName.trim(), 
          baseModel: baseModel, 
        }),
      });

      // --- Improved Error Handling --- 
      if (!response.ok) {
          let errorPayload = `HTTP error ${response.status}: ${response.statusText || 'Unknown error'}`;
          try {
              // First try to parse as JSON
              const jsonError = await response.json();
              errorPayload = jsonError.message || jsonError.error || JSON.stringify(jsonError);
          } catch (parseError) {
              // If JSON parsing fails, try to read as text
              try { 
                  errorPayload = await response.text();
                  // If text is empty, keep the original HTTP error message
                  if (!errorPayload) { 
                      errorPayload = `HTTP error ${response.status}: ${response.statusText || 'Unknown error'}`;
                  }
              } catch (textError) { /* Ignore text reading error, keep original HTTP error */ }
          }
          console.error("[handleCreateJob] API Error Response:", errorPayload);
          throw new Error(errorPayload);
      }
      // --- End Improved Error Handling ---

      const result = await response.json(); // Only parse JSON if response.ok

      const jobId = result.jobId || result.internalJobId || result.fireworksJobId || 'Unknown ID';
      toast({
        title: `${providerName} Fine-tuning Job Created`,
        description: `Job ${jobId} started. Check Models page for status.`,
      });
      router.push('/dashboard/models'); 

    } catch (err) {
      console.error(`${providerName} submission error:`, err);
      // Use the potentially improved error message from the catch block
      setError(err.message || `Failed to start ${providerName} fine-tuning job.`); 
      toast({ title: `Error Creating ${providerName} Job`, description: err.message, variant: "destructive" });
    } finally {
      setIsSubmittingJob(false);
    }
  };

  // --- Handler to initiate dataset conversion --- 
  const handleConvertDataset = async () => {
      setIsConverting(true);
      setError(null); // Clear previous errors
      const targetFormat = currentProvider === 'openai' ? 'openai-jsonl' : 'jsonl';
      
      if (!datasetId || !targetFormat) {
          toast({title: "Error", description: "Cannot start conversion, missing dataset ID or target format.", variant: "destructive"});
          setIsConverting(false);
          return;
      }

      console.log(`[handleConvertDataset] Attempting conversion for dataset ${datasetId} to ${targetFormat}`);

      try {
          const response = await fetch('/api/datasets/convert', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: datasetId, targetFormat: targetFormat }),
          });

          const result = await response.json(); // Attempt to parse JSON regardless of status

          if (!response.ok) {
              throw new Error(result.message || `Conversion failed with status ${response.status}`);
          }

          // --- Success --- 
          toast({ 
              title: "Conversion Successful", 
              description: `Dataset format changed to ${targetFormat}.`, 
              variant: "success"
          });
          // Update local state to reflect the change
          setDatasetFormat(targetFormat);
          // Update the outputKey if the API returned it (it should)
          if (result.output_key) {
              setOutputKeys([result.output_key]); 
          }
          setShowConversionOption(false); // Hide conversion button
          setError(null); // Clear the format mismatch error explicitly
          console.log(`[handleConvertDataset] Conversion successful. New format: ${targetFormat}, New key: ${result.output_key}`);

      } catch (err) {
          console.error("Dataset conversion error:", err);
          setError(`Conversion failed: ${err.message}`); // Display conversion error
          toast({ title: "Conversion Failed", description: err.message, variant: "destructive" });
      } finally {
          setIsConverting(false);
      }
  };
  // --------------------------------------------------------

  // --- Handler to save API key entered inline --- 
  const handleSaveApiKeyInline = async () => {
      setIsSavingApiKeyInline(true);
      setError(null); // Clear previous errors
      let keyToSave = '';
      let saveUrl = '';
      let providerName = '';
      let successStateSetter = null;

      if (currentProvider === 'openai') {
          keyToSave = openaiApiKeyInput;
          saveUrl = '/api/user/api-key';
          providerName = 'OpenAI';
          successStateSetter = setHasOpenAIKey;
          if (!keyToSave || !keyToSave.startsWith('sk-')) {
              toast({ title: "Invalid Format", description: "OpenAI key must start with 'sk-'.", variant: "destructive" });
              setIsSavingApiKeyInline(false);
              return;
          }
      } else if (currentProvider === 'fireworks') {
          keyToSave = fireworksApiKeyInput;
          saveUrl = '/api/user/fireworks-key';
          providerName = 'Fireworks AI';
          successStateSetter = setHasFireworksKey;
           if (!keyToSave || !keyToSave.startsWith('fw_')) {
              toast({ title: "Invalid Format", description: "Fireworks key must start with 'fw_'.", variant: "destructive" });
              setIsSavingApiKeyInline(false);
              return;
          }
      } else {
          toast({ title: "Error", description: "Cannot determine API provider.", variant: "destructive" });
          setIsSavingApiKeyInline(false);
          return;
      }

      try {
          const response = await fetch(saveUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ apiKey: keyToSave }),
          });

          if (!response.ok) {
              const result = await response.json().catch(() => ({}));
              throw new Error(result.message || result.error || `Failed to save key (${response.status})`);
          }

          toast({ 
              title: `${providerName} Key Saved`, 
              description: "You can now start the fine-tuning job.",
              variant: "success"
          });
          successStateSetter(true); // Update the key status state
          // Clear the specific input field
          if (currentProvider === 'openai') setOpenaiApiKeyInput('');
          else setFireworksApiKeyInput('');
          setError(null); // Clear the missing key error
          
      } catch (err) {
          console.error(`Save ${providerName} key error:`, err);
          setError(`Failed to save ${providerName} key: ${err.message}`); // Set error specific to saving
          toast({ title: `Error Saving ${providerName} Key`, description: err.message, variant: "destructive" });
      } finally {
          setIsSavingApiKeyInline(false);
      }
  };
  // ---------------------------------------------

  // --- Handler to save Account ID entered inline --- 
  const handleSaveAccountIdInline = async () => {
      if (!fireworksAccountIdInput || fireworksAccountIdInput.trim().length === 0) {
          toast({ title: "Invalid Input", description: "Please enter your Fireworks Account ID.", variant: "destructive" });
          return;
      }
      setIsSavingAccountIdInline(true);
      setError(null); // Clear previous errors

      try {
          const response = await fetch('/api/user/fireworks-account', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accountId: fireworksAccountIdInput.trim() }), // Trim whitespace
          });

          if (!response.ok) {
              const result = await response.json().catch(() => ({}));
              throw new Error(result.message || result.error || `Failed with status ${response.status}`);
          }

          toast({ 
              title: "Fireworks Account ID Saved", 
              description: "You can now start the fine-tuning job.", 
              variant: "success" 
          });
          setHasFireworksAccountId(true); // Update state
          setFireworksAccountIdInput(''); // Clear input
          setError(null); // Clear the missing account ID error

      } catch (err) {
          console.error("Save Fireworks Account ID inline error:", err);
          setError(`Failed to save Account ID: ${err.message}`);
          toast({ title: "Error Saving Account ID", description: err.message, variant: "destructive" });
      } finally {
          setIsSavingAccountIdInline(false);
      }
  };
  // ---------------------------------------------

  // Loading state check
  if (isCheckingKeys) {
      return (
         <div className="container mx-auto py-10 max-w-2xl flex justify-center items-center min-h-[50vh]">
             <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
         </div>
     );
  }

  // Determine if submit is disabled based on inferred provider
  const isSubmitDisabled = isSubmittingJob 
      || !modelName.trim() 
      || !baseModel 
      || (currentProvider === 'openai' && !hasOpenAIKey)
      || (currentProvider === 'fireworks' && (!hasFireworksKey || !hasFireworksAccountId))
      || showConversionOption; // Disable submit if conversion is needed

  console.log("[FineTunePage Render] isSubmitDisabled:", isSubmitDisabled, "showConversionOption:", showConversionOption);

  // Tooltip for submit button remains mostly the same, but format check is handled by showing conversion button
  const submitButtonTitle = 
      showConversionOption ? "Convert dataset format first" : 
      (currentProvider === 'openai' && !hasOpenAIKey) ? "Save your OpenAI API key first" : 
      (currentProvider === 'fireworks' && (!hasFireworksKey && !hasFireworksAccountId)) ? "Save Fireworks API Key and Account ID first" : // Combined message
      (currentProvider === 'fireworks' && !hasFireworksKey) ? "Save your Fireworks API key first" :
      (currentProvider === 'fireworks' && !hasFireworksAccountId) ? "Save your Fireworks Account ID first" :
      (!modelName.trim() || !baseModel) ? "Enter model name and select base model" : 
      `Start ${currentProvider === 'openai' ? 'OpenAI' : 'Fireworks'} Fine-tuning Job`;

  // Helper to format file type (copied from Datasets page for consistency)
  const formatFileType = (format) => {
    if (!format) return 'Unknown';
    const formatMap = { 'jsonl': 'Standard JSONL', 'openai-jsonl': 'OpenAI JSONL', 'json': 'JSON', 'csv': 'CSV' };
    return formatMap[format] || format.toUpperCase();
  };

  return (
    <TooltipProvider>
      <div className="container mx-auto  max-w-2xl ">
      <Button variant="outline" onClick={() => router.back()} className="gap-2 mb-6">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Wand2 className="h-7 w-7" />
              Configure Fine-tuning Job
            </h1>
            <p className="text-muted-foreground mt-1">
              Select a dataset and model to start fine-tuning.
            </p>
          </div>
          
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
              <div className="space-y-2">
                <Label htmlFor="datasets">Selected Dataset(s)</Label>
                <div className="p-3 border rounded-md bg-muted text-sm text-muted-foreground">
                  Using data from {outputKeys.length} processed file(s).
                </div>
                 <p className="text-xs text-muted-foreground">
                  The content from the output file(s) you selected will be merged and used for training.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="modelName">Your Fine-tuned Model Name</Label>
                <Input
                  id="modelName"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="e.g., my-legal-assistant-v1"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  A descriptive name for your custom model.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="baseModel">Base Model</Label>
                <Select 
                    value={baseModel}
                    onValueChange={setBaseModel} 
                    required 
                    disabled={ALL_BASE_MODELS.length === 0}
                >
                  <SelectTrigger id="baseModel">
                    <SelectValue placeholder={ALL_BASE_MODELS.length === 0 ? "No models available" : "Select base model"} />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_BASE_MODELS.map(model => (
                      <SelectItem key={model.id} value={model.id}>
                         {/* Display Provider for clarity */} 
                         <span className={`mr-2 px-1.5 py-0.5 rounded text-xs ${model.provider === 'openai' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                           {model.provider === 'openai' ? 'OpenAI' : 'Fireworks'}
                         </span>
                        {model.name} 
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                 
                 {/* --- Display Area for Dynamic Warnings/Inputs --- */} 
                 <div className="mt-2 space-y-3">
                     {/* Format Mismatch Error & Conversion Button */} 
                     {showConversionOption && error?.includes("Format Mismatch") && (
                         <div className="border border-red-200 bg-red-50 p-3 rounded-md space-y-3">
                             <p className="text-xs text-red-700 flex items-start gap-1.5">
                                 <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5"/> 
                                 <span>{error}</span>
                             </p>
                             <Button 
                                type="button" 
                                onClick={handleConvertDataset} 
                                variant="destructive"
                                size="sm"
                                className="w-full sm:w-auto"
                                disabled={isConverting} // Disable if conversion is in progress (future state)
                             >
                                 {isConverting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4" />} 
                                 Convert & Prepare Data
                             </Button>
                         </div>
                     )}

                     {/* --- Container for Credential Input Sections --- */}
                     {!showConversionOption && (
                        <> 
                            {/* OpenAI Key Input (Only shows if OpenAI selected AND key missing) */} 
                            {currentProvider === 'openai' && !hasOpenAIKey && (
                                <div className="border border-amber-200 bg-amber-50 p-3 rounded-md space-y-3">
                                    <p className="text-xs text-amber-700 flex items-start gap-1.5">
                                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5"/> 
                                        <span>
                                            {error || "OpenAI API Key Missing: Please save your OpenAI API key below."} {/* Fallback message */}
                                            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline font-medium ml-1">Get one from OpenAI <ExternalLink className="inline h-3 w-3 ml-0.5 mb-0.5"/></a>.
                                        </span>
                                    </p>
                                    {/* ... existing OpenAI Key Input form ... */} 
                                     <div className="relative">
                                        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                           id="openaiApiKeyInputInline"
                                           type="password"
                                           value={openaiApiKeyInput}
                                           onChange={(e) => setOpenaiApiKeyInput(e.target.value)}
                                           placeholder="Enter your OpenAI key (sk-...)"
                                           className="pl-10 bg-white"
                                           disabled={isSavingApiKeyInline}
                                        />
                                     </div>
                                     <Button 
                                       type="button" 
                                       onClick={handleSaveApiKeyInline} 
                                       disabled={isSavingApiKeyInline || !openaiApiKeyInput || !openaiApiKeyInput.startsWith('sk-')}
                                       className="w-full sm:w-auto bg-blue-600 text-white hover:bg-blue-700"
                                       size="sm"
                                     >
                                        {isSavingApiKeyInline ? <Loader2 className=" mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                        Save Key & Continue
                                     </Button>
                                </div>
                            )}

                            {/* Fireworks Credentials Section (Shows if provider is FW and key OR account is missing) */} 
                            {currentProvider === 'fireworks' && (!hasFireworksKey || !hasFireworksAccountId) && (
                                <div className="border border-amber-200 bg-amber-50 p-3 rounded-md space-y-4"> {/* Increased spacing */} 
                                    {/* General Warning Text */} 
                                     <p className="text-xs text-amber-700 flex items-start gap-1.5">
                                         <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5"/> 
                                         <span>
                                             {error || "Fireworks Credentials Missing: Please provide the required details below."} {/* Use state error or fallback */} 
                                             <span className="block italic mt-1">(Fireworks uses a BYOK model - see <Link href="/dashboard/profile" className="underline">Profile</Link> for details.)</span>
                                         </span>
                                     </p>
                                    
                                     {/* Fireworks Key Input (Show if key specifically missing) */} 
                                     {!hasFireworksKey && (
                                        <div className="space-y-2 pl-5"> {/* Indent slightly */} 
                                             <Label htmlFor="fireworksApiKeyInputInline" className="text-xs font-medium text-amber-800">Fireworks API Key</Label>
                                             <div className="relative">
                                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                   id="fireworksApiKeyInputInline"
                                                   type="password"
                                                   value={fireworksApiKeyInput}
                                                   onChange={(e) => setFireworksApiKeyInput(e.target.value)}
                                                   placeholder="Enter your Fireworks key (fw_...)"
                                                   className="pl-10 bg-white"
                                                   disabled={isSavingApiKeyInline}
                                                />
                                             </div>
                                             <Button 
                                                type="button" 
                                                onClick={handleSaveApiKeyInline} 
                                                disabled={isSavingApiKeyInline || !fireworksApiKeyInput || !fireworksApiKeyInput.startsWith('fw_')}
                                                className="w-full sm:w-auto bg-orange-500 text-white hover:bg-orange-600"
                                                size="sm"
                                             >
                                                {isSavingApiKeyInline ? <Loader2 className=" mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                                Save Key
                                             </Button>
                                        </div>
                                     )}

                                     {/* Fireworks Account ID Input (Show if ID specifically missing) */} 
                                     {!hasFireworksAccountId && (
                                        <div className="space-y-2 pl-5"> {/* Indent slightly */} 
                                            <Label htmlFor="fireworksAccountIdInputInline" className="text-xs font-medium text-amber-800">Fireworks Account ID</Label>
                                             <div className="relative">
                                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /> 
                                                <Input
                                                   id="fireworksAccountIdInputInline"
                                                   type="text" 
                                                   value={fireworksAccountIdInput}
                                                   onChange={(e) => setFireworksAccountIdInput(e.target.value)}
                                                   placeholder="Enter your Fireworks Account ID"
                                                   className="pl-10 bg-white"
                                                   disabled={isSavingAccountIdInline}
                                                />
                                             </div>
                                             <Button 
                                                type="button" 
                                                onClick={handleSaveAccountIdInline} 
                                                disabled={isSavingAccountIdInline || !fireworksAccountIdInput.trim()}
                                                className="w-full sm:w-auto bg-orange-500 text-white hover:bg-orange-600" 
                                                size="sm"
                                             >
                                                {isSavingAccountIdInline ? <Loader2 className=" mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                                Save Account ID
                                             </Button>
                                             <p className="text-xs text-muted-foreground">Find your Account ID in your <a href="https://fireworks.ai/account/home" target="_blank" rel="noopener noreferrer" className="underline">Fireworks Settings</a>.</p>
                                        </div>
                                     )}
                                </div>
                            )}
                        </> 
                     )}
                 </div> {/* Closing div for the dynamic display area */} 
                 {/* --- End Display Area --- */}
                 
                 {!currentProvider && baseModel && (
                     <p className="text-xs text-red-600">Could not determine provider for selected model.</p>
                 )}
                 <p className="text-xs text-muted-foreground pt-1">
                   Choose the foundation model to fine-tune.
                 </p>
              </div>

            </CardContent>
            <CardFooter className="border-t pt-6 flex flex-col items-stretch gap-4"> 
               {/* Conversion Button Display (now separate from main button) */} 
               {showConversionOption && (
                  <Button 
                     type="button" 
                     onClick={handleConvertDataset} 
                     variant="destructive"
                     className="w-full"
                     disabled={isConverting} 
                  >
                     {isConverting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4" />} 
                     Convert & Prepare Data for Selected Model
                  </Button>
                )}

              {/* Show Start Fine-tuning button ONLY if conversion is NOT needed */}
              {!showConversionOption && (
                 <Button 
                   type="submit" 
                   className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:opacity-90"
                   disabled={isSubmitDisabled} 
                   title={submitButtonTitle}
                 >
                   {isSubmittingJob ? (
                       <>
                           <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                           Starting Fine-tuning...
                       </>
                   ) : (
                       <>
                           <BrainCircuit className="mr-2 h-4 w-4" />
                           Start {currentProvider === 'openai' ? 'OpenAI' : currentProvider === 'fireworks' ? 'Fireworks' : ''} Fine-tuning Job
                       </>
                   )}
                 </Button>
              )}
            </CardFooter>
          </form>
        </Card>
      </div>
    </TooltipProvider>
  );
}

// Export with Suspense
export default function FineTuneNewPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-[50vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <FineTuneSetupContent />
    </Suspense>
  );
} 
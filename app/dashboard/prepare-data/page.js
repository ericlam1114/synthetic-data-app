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
} from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Textarea } from "../../../components/ui/textarea"; // Use Textarea for now
import { Label } from "../../../components/ui/label";
import { 
  AlertCircle, 
  ChevronLeft, 
  FileSearch, 
  Loader2, 
  CheckSquare, // Validation
  Sparkles,   // Deduplication
  Save,       // Saving
  BrainCircuit, // Fine-tuning
} from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { useToast } from "../../../hooks/use-toast";
import { supabase } from "../../../lib/supabaseClient";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../../components/ui/accordion";
import { ScrollArea } from "../../../components/ui/scroll-area";

// Helper component to access searchParams
function PrepareDataContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [initialOutputKeys, setInitialOutputKeys] = useState([]);
  const [isLoadingContent, setIsLoadingContent] = useState(true);
  const [content, setContent] = useState("");
  const [error, setError] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isDeduplicating, setIsDeduplicating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoConverting, setIsAutoConverting] = useState(false);
  const [conversionTargetFormat, setConversionTargetFormat] = useState(null);
  const [preparedDataKey, setPreparedDataKey] = useState(null); // Key of the saved data
  const [validationErrors, setValidationErrors] = useState([]);
  const [currentFormat, setCurrentFormat] = useState('unknown');
  const [contentModified, setContentModified] = useState(false); // Track if content was edited

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
        setIsLoadingContent(true);
        setError(null); // Clear previous errors on load
        try {
            // User session
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                toast({ title: "Unauthorized", description: "Please log in.", variant: "destructive" });
                router.push('/');
                return;
            }
            if (isMounted) setUser(session.user);

            // --- Get parameters from URL --- 
            const keysParam = searchParams.get('outputKeys');
            const datasetIdParam = searchParams.get('datasetId'); // Needed for conversion
            const originalFormatParam = searchParams.get('originalFormat'); // Format before potential conversion
            const requiredFormatParam = searchParams.get('requiredFormat'); // Format needed by fine-tune page
            // --------------------------------
            
            let currentKey = null;
            let currentDatasetId = datasetIdParam;
            let currentDetectedFormat = originalFormatParam; // Start with original format

            if (!keysParam) {
                 toast({ title: "Missing Data", description: "No dataset keys provided.", variant: "destructive" });
                 router.push('/dashboard/datasets');
                 return;
            }
            const keys = keysParam.split(',').map(decodeURIComponent).filter(Boolean);
            if (keys.length === 0 || keys.length > 1) { 
                 toast({ title: "Invalid Request", description: "Please prepare one dataset at a time.", variant: "destructive" });
                 router.push('/dashboard/datasets');
                 return;
            }
            currentKey = keys[0];
            if (isMounted) setInitialOutputKeys([currentKey]); 
            
            // --- Set initial format --- 
            if (currentDetectedFormat) {
                 if (isMounted) setCurrentFormat(currentDetectedFormat);
                 console.log(`[Prepare Data] Initial format provided: ${currentDetectedFormat}`);
            } else if (currentKey) {
                // Fallback: Try to detect from key if not provided
                const extension = currentKey.split('.').pop()?.toLowerCase();
                if (extension === 'jsonl') currentDetectedFormat = 'jsonl';
                else if (extension === 'json') currentDetectedFormat = 'json';
                else if (extension === 'csv') currentDetectedFormat = 'csv';
                else currentDetectedFormat = 'unknown'; 
                if (isMounted) setCurrentFormat(currentDetectedFormat);
                 console.log(`[Prepare Data] Detected format from key: ${currentDetectedFormat}`);
            }
            // --------------------------

            // --- Handle Auto-Conversion --- 
            if (currentDatasetId && requiredFormatParam && currentDetectedFormat && currentDetectedFormat !== requiredFormatParam) {
                if (isMounted) {
                    setIsAutoConverting(true);
                    setConversionTargetFormat(requiredFormatParam);
                    toast({ title: "Format Conversion Needed", description: `Auto-converting from ${currentDetectedFormat.toUpperCase()} to ${requiredFormatParam.toUpperCase()}...`, variant: "info", duration: 5000 });
                }
                
                try {
                     console.log(`[Prepare Data] Calling convert API for dataset ${currentDatasetId} to ${requiredFormatParam}`);
                     const convertResponse = await fetch('/api/datasets/convert', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: currentDatasetId, targetFormat: requiredFormatParam })
                     });
                     
                     if (!convertResponse.ok) {
                         let errorMsg = `Auto-conversion failed: ${convertResponse.status}`;
                         try { errorMsg = (await convertResponse.json()).message || errorMsg; } catch(e){ /* ignore */ }
                         throw new Error(errorMsg);
                     }
                     
                     const convertedData = await convertResponse.json();
                     console.log("[Prepare Data] Auto-conversion successful:", convertedData);
                     
                     // --- IMPORTANT: Update state with CONVERTED data --- 
                     currentKey = convertedData.output_key; // Use the NEW key to fetch content
                     currentDetectedFormat = convertedData.format; // Use the NEW format
                     if (isMounted) {
                        setCurrentFormat(currentDetectedFormat); // Update format state
                        setInitialOutputKeys([currentKey]); // Update key state (though maybe less critical here)
                        toast({ title: "Conversion Complete", description: `Dataset converted to ${currentDetectedFormat.toUpperCase()}. Loading content...`, variant: "success" });
                     }
                     // --------------------------------------------------

                } catch (conversionError) {
                     if (isMounted) {
                         console.error("[Prepare Data] Auto-conversion failed:", conversionError);
                         setError(`Failed to auto-convert dataset: ${conversionError.message}`);
                         toast({ title: "Conversion Failed", description: conversionError.message, variant: "destructive" });
                         // Don't proceed if conversion fails
                         setIsLoadingContent(false);
                         setIsAutoConverting(false);
                         return; 
                     }
                } finally {
                     if (isMounted) setIsAutoConverting(false);
                }
            }
            // --- End Auto-Conversion ---
            
            // Fetch content (using currentKey, which might be the converted key now)
            console.log(`[Prepare Data] Fetching content for key: ${currentKey}`);
            const contentRes = await fetch(`/api/datasets/content?keys=${encodeURIComponent(currentKey)}`);
            if (!contentRes.ok) {
                const resJson = await contentRes.json().catch(() => ({}));
                throw new Error(resJson.error || `Failed to fetch dataset content (${contentRes.status})`);
            }
            const { mergedContent } = await contentRes.json();
            if (isMounted) setContent(mergedContent || "");

            // Initialize preparedDataKey with the key we actually loaded content from
            if (isMounted && currentKey) {
                 setPreparedDataKey(currentKey); 
                 setContentModified(false); // Start unmodified
                 console.log(`[Prepare Data] Initialized. Prepared key: ${currentKey}`);
            }

        } catch (err) {
            if (isMounted) {
                console.error("Load prepare data error:", err);
                setError(`Failed to load data: ${err.message}`);
                toast({ title: "Error Loading Data", description: err.message, variant: "destructive" });
            }
        } finally {
            if (isMounted) {
                 setIsLoadingContent(false);
                 setIsAutoConverting(false); // Ensure this is false even if load fails
            }
        }
    };
    loadData();
    return () => { isMounted = false; };
}, [searchParams, router, toast]); // Removed currentFormat dependency here, set inside effect

  // --- Updated Handlers --- 
  const handleValidate = async () => {
      setIsValidating(true);
      setValidationErrors([]);
      setError(null);
      try {
          console.log(`[Validate] Validating content with detected format: ${currentFormat}`);
           const response = await fetch('/api/datasets/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, format: currentFormat })
           });
           const result = await response.json();
           if (!response.ok) throw new Error(result.error || 'Validation request failed');

           if (result.isValid) {
                toast({ title: "Validation Successful", description: "No errors found in the dataset.", variant: "success" });
                setValidationErrors([]);
           } else {
                toast({ title: "Validation Issues Found", description: `Found ${result.errors.length} potential issues.`, variant: "warning" });
                setValidationErrors(result.errors || ["Unknown validation error"]);
           }
      } catch (err) {
           console.error("Validation Error:", err);
           setError(`Validation failed: ${err.message}`);
           toast({ title: "Validation Error", description: err.message, variant: "destructive" });
      } finally {
          setIsValidating(false);
      }
  };

  const handleDeduplicate = async (mode) => {
      setIsDeduplicating(true);
      setError(null);
       setValidationErrors([]); // Clear validation errors after edit
      try {
           const response = await fetch('/api/datasets/deduplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, mode })
           });
            const result = await response.json();
           if (!response.ok) throw new Error(result.error || 'Deduplication request failed');

           setContent(result.deduplicatedContent);
           toast({ 
               title: "Deduplication Complete", 
               description: `Removed ${result.removedCount} duplicate lines based on ${mode} message. Kept ${result.deduplicatedCount}.`,
               variant: "success"
            });
            setPreparedDataKey(null); // Reset saved state as content changed

      } catch (err) {
           console.error("Deduplication Error:", err);
           setError(`Deduplication failed: ${err.message}`);
           toast({ title: "Deduplication Error", description: err.message, variant: "destructive" });
      } finally {
          setIsDeduplicating(false);
      }
  };

  const handleSavePreparedData = async () => {
      setIsSaving(true);
      setError(null);
       setValidationErrors([]); // Clear validation errors before save
      try {
           const response = await fetch('/api/datasets/save-prepared', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, originalOutputKeys: initialOutputKeys })
           });
            const result = await response.json();
           if (!response.ok) throw new Error(result.error || 'Save request failed');

            setPreparedDataKey(result.newOutputKey); // Store the new key
            setContentModified(false); // Mark content as saved (no longer modified)
            toast({ 
               title: "Prepared Data Saved", 
               description: `Saved successfully. New dataset ID: ${result.newDatasetId}`,
               variant: "success"
            });

      } catch (err) {
           console.error("Save Prepared Data Error:", err);
           setError(`Save failed: ${err.message}`);
           toast({ title: "Save Error", description: err.message, variant: "destructive" });
      } finally {
          setIsSaving(false);
      }
  };

  const handleProceedToFineTune = async () => {
      // 1. Check if data has been saved OR if content hasn't been modified since load/conversion
      if (!preparedDataKey && contentModified) { // Only block if modified and not saved
          toast({ 
              title: "Unsaved Changes", 
              description: "Please save your changes using the 'Save Changes' button before proceeding to fine-tuning.", 
              variant: "warning" 
          });
          return;
      }
      
      // Use the key that corresponds to the CURRENT content (either original or saved prepared key)
      const keyToUse = preparedDataKey || initialOutputKeys[0]; 
      
      if (!keyToUse) {
           toast({ title: "Error", description: "Dataset key is missing.", variant: "destructive" });
           return;
      }
      
      // 2. Check format (remains the same)
      if (currentFormat === 'unknown') {
          toast({ 
              title: "Unknown Format", 
              description: "Cannot determine dataset format. Please ensure the file extension is correct or contact support.", 
              variant: "warning" 
          });
          return;
      }

      // 3. Re-validate the *current* content before proceeding
      setIsValidating(true); // Use the validation loading state
      setValidationErrors([]);
      setError(null);
      let isValid = false;
      try {
          console.log(`[Fine-tune Pre-Check] Validating content with format: ${currentFormat}`);
          const response = await fetch('/api/datasets/validate', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ content, format: currentFormat })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Validation request failed');

          if (result.isValid) {
              console.log("[Fine-tune Pre-Check] Validation successful.");
              isValid = true;
              setValidationErrors([]); // Clear any previous errors
          } else {
              console.warn("[Fine-tune Pre-Check] Validation failed:", result.errors);
              toast({ title: "Validation Required", description: `Found ${result.errors.length} potential issues. Please fix them before fine-tuning.`, variant: "warning" });
              setValidationErrors(result.errors || ["Unknown validation error"]);
              // Scroll validation errors into view? (Optional enhancement)
          }
      } catch (err) {
          console.error("[Fine-tune Pre-Check] Validation Error:", err);
          setError(`Validation check failed: ${err.message}`); // Set general error
          toast({ title: "Validation Error", description: err.message, variant: "destructive" });
      } finally {
          setIsValidating(false);
      }
      
      // 4. Navigate if valid, using the keyToUse and currentFormat
      if (isValid) {
          console.log(`Navigating to fine-tune setup with key: ${keyToUse} and format: ${currentFormat}`);
           // --- Pass datasetId back to fine-tune page --- 
           const datasetIdToPass = searchParams.get('datasetId'); // Get ID from original URL param
           const params = new URLSearchParams({
               outputKeys: keyToUse,
               datasetFormat: currentFormat,
           });
           if(datasetIdToPass) {
                params.set('datasetId', datasetIdToPass);
           }
           // ------------------------------------------------
           router.push(`/dashboard/fine-tune/new?${params.toString()}`);
      }
  };

  // --- Render Logic --- 
  if (isLoadingContent || isAutoConverting) { // Show loader during conversion too
      return (
          <div className="container mx-auto py-10 max-w-4xl flex justify-center items-center min-h-[60vh]">
              <Card className="w-full text-center">
                  <CardContent className="pt-6">
                      <div className="flex flex-col items-center gap-4">
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                          <p className="text-muted-foreground">
                              {isAutoConverting ? `Converting to ${conversionTargetFormat?.toUpperCase()}...` : "Loading dataset content..."}
                          </p>
                      </div>
                  </CardContent>
              </Card>
          </div>
      );
  }

  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileSearch className="h-7 w-7" />
            Inspect & Prepare Dataset
          </h1>
          <p className="text-muted-foreground mt-1">
            Validate, deduplicate, and save your dataset before fine-tuning.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.back()} className="gap-2">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      {error && (
        <Card className="mb-4 border-destructive bg-destructive/10">
            <CardContent className="pt-4 text-destructive flex items-start gap-2">
                <AlertCircle className="h-5 w-5 mt-0.5"/>
                <div>
                    <p className="font-semibold">Error</p>
                    <p className="text-sm">{error}</p>
                </div>
            </CardContent>
        </Card>
      )}
      
       {validationErrors.length > 0 && (
        <Card className="mb-4 border-amber-500 bg-amber-50/50">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg text-amber-700">Validation Issues Found</CardTitle>
            </CardHeader>
            <CardContent>
                 <ul className="list-disc pl-5 text-sm text-amber-800 space-y-1 max-h-40 overflow-y-auto">
                    {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
                 </ul>
            </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Dataset Content</CardTitle>
              <CardDescription className="mt-1">
                Review, validate, modify, and save your dataset. Current format: <Badge variant="outline">{currentFormat.toUpperCase()}</Badge>
              </CardDescription>
            </div>
            {/* --- Action Buttons Moved Top --- */}
            <div className="flex flex-wrap gap-2 justify-start sm:justify-end w-full sm:w-auto pt-2 sm:pt-0">
              <Button 
                  onClick={handleValidate} 
                  variant="secondary" 
                  size="sm"
                  disabled={isValidating || !content}
              >
                  {isValidating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckSquare className="mr-2 h-4 w-4"/>}
                  Validate
              </Button>
               {/* Dedupe buttons can remain or be put in dropdown */}
               <Button 
                  onClick={() => handleDeduplicate('user')} 
                  variant="secondary" 
                  size="sm"
                  disabled={isDeduplicating || !content}
               >
                  {isDeduplicating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}
                   Dedupe (User)
               </Button>
                <Button 
                  onClick={() => handleDeduplicate('assistant')} 
                  variant="secondary" 
                  size="sm"
                  disabled={isDeduplicating || !content}
               >
                   {isDeduplicating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}
                   Dedupe (Assistant)
               </Button>
               <Button 
                   variant="outline" 
                   size="sm"
                   onClick={handleSavePreparedData}
                   disabled={isSaving || !content || !contentModified}
                   title={!content ? "No content to save" : contentModified ? "Save your changes" : "Content is already saved"}
               >
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                    {contentModified ? 'Save Changes' : 'Saved'}
               </Button>
               <Button 
                   className="bg-blue-600 hover:bg-blue-700 text-white"
                   size="sm"
                   onClick={handleProceedToFineTune}
                   disabled={contentModified || isValidating || isSaving || isDeduplicating} // Main blocker is unsaved changes
                   title={contentModified ? "Save changes before fine-tuning" : "Proceed to fine-tuning setup"}
               >
                    <BrainCircuit className="mr-2 h-4 w-4" />
                    Proceed to Fine-tuning
               </Button>
            </div>
            {/* -------------------------------- */}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {/* --- Collapsible Content Area --- */}
          <Accordion type="single" collapsible defaultValue="item-1">
             <AccordionItem value="item-1">
               <AccordionTrigger className="text-base font-medium hover:no-underline">
                  Dataset Preview (First 20 lines)
               </AccordionTrigger>
               <AccordionContent className="pt-2">
                 <pre className="p-4 bg-muted rounded-md overflow-x-auto font-mono text-xs leading-relaxed">
                     {content.split('\n').slice(0, 20).join('\n')}
                     {content.split('\n').length > 20 ? '\n... (Expand to see more)' : ''}
                 </pre>
               </AccordionContent>
             </AccordionItem>
             <AccordionItem value="item-2">
                 <AccordionTrigger className="text-base font-medium hover:no-underline">
                     Full Dataset Content (Editable)
                 </AccordionTrigger>
                 <AccordionContent>
                     <Label htmlFor="dataset-content" className="sr-only">Full Dataset Content</Label>
                     <ScrollArea className="h-[500px] w-full border rounded-md">
                       <Textarea
                         id="dataset-content"
                         value={content}
                         onChange={(e) => {
                             setContent(e.target.value);
                             setContentModified(true); // Mark content as modified
                             if(validationErrors.length > 0) setValidationErrors([]); // Clear validation on edit
                         }}
                         placeholder="Dataset content will load here..."
                         className="min-h-[500px] font-mono text-xs leading-relaxed border-0 focus-visible:ring-0 focus-visible:ring-offset-0 resize-none"
                         disabled={isLoadingContent || isValidating || isDeduplicating || isSaving}
                       />
                     </ScrollArea>
                 </AccordionContent>
             </AccordionItem>
          </Accordion>
          {/* --------------------------------- */}
        </CardContent>
      </Card>
    </div>
  );
}

// Use Suspense to handle search param reading
export default function PrepareDataPage() {
  return (
    <Suspense fallback={
        <div className="container mx-auto py-10 max-w-4xl flex justify-center items-center min-h-[60vh]">
            <Card className="w-full text-center">
                <CardContent className="pt-6">
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <p className="text-muted-foreground">Loading dataset content...</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    }>
      <PrepareDataContent />
    </Suspense>
  );
} 
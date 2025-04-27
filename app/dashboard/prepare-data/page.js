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
  const [preparedDataKey, setPreparedDataKey] = useState(null); // Key of the saved data
  const [validationErrors, setValidationErrors] = useState([]);
  const [currentFormat, setCurrentFormat] = useState('unknown');
  const [contentModified, setContentModified] = useState(false); // Track if content was edited

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
        setIsLoadingContent(true);
        try {
            // User session
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                toast({ title: "Unauthorized", description: "Please log in.", variant: "destructive" });
                router.push('/');
                return;
            }
            if (isMounted) setUser(session.user);

            // Get keys
            const keysParam = searchParams.get('outputKeys');
            if (!keysParam) {
                 toast({ title: "Missing Data", description: "No dataset keys provided.", variant: "destructive" });
                 router.push('/dashboard/datasets'); // Go back to datasets if keys missing
                 return;
            }
            const keys = keysParam.split(',').map(decodeURIComponent).filter(Boolean);
            if (keys.length === 0 || keys.length > 1) { // Enforce single key for this page flow
                 toast({ title: "Invalid Request", description: "Please prepare one dataset at a time.", variant: "destructive" });
                 router.push('/dashboard/datasets');
                 return;
            }
            const initialKey = keys[0];
            if (isMounted) setInitialOutputKeys([initialKey]); // Store as array still, but only one
            
            // --- Determine format from first key --- 
            if (initialKey) {
                const extension = initialKey.split('.').pop()?.toLowerCase();
                // Simple mapping - adjust if needed
                if (extension === 'jsonl') setCurrentFormat('jsonl');
                else if (extension === 'json') setCurrentFormat('json');
                else if (extension === 'csv') setCurrentFormat('csv');
                else setCurrentFormat('unknown'); // Fallback
                console.log(`[Prepare Data] Detected format: ${currentFormat} from key: ${initialKey}`);
            }
            // ------------------------------------
            
            // Fetch content
            const contentRes = await fetch(`/api/datasets/content?keys=${encodeURIComponent(keys.join(','))}`);
            if (!contentRes.ok) {
                const resJson = await contentRes.json().catch(() => ({}));
                throw new Error(resJson.error || `Failed to fetch dataset content (${contentRes.status})`);
            }
            const { mergedContent } = await contentRes.json();
            if (isMounted) setContent(mergedContent || "");

            // --- Initialize preparedDataKey with the loaded key ---
            if (isMounted && initialKey) {
                 setPreparedDataKey(initialKey); 
                 setContentModified(false); // Start unmodified
                 console.log(`[Prepare Data] Initialized. Prepared key: ${initialKey}`);
            }
            // --------------------------------------------------------

        } catch (err) {
            if (isMounted) {
                console.error("Load prepare data error:", err);
                setError(`Failed to load data: ${err.message}`);
                toast({ title: "Error Loading Data", description: err.message, variant: "destructive" });
            }
        } finally {
            if (isMounted) setIsLoadingContent(false);
        }
    };
    loadData();
    return () => { isMounted = false; };
}, [searchParams, router, toast, currentFormat]);

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
      // 1. Check if data has been saved
      if (!preparedDataKey) {
          toast({ 
              title: "Data Not Saved", 
              description: "Please save the prepared data using the 'Save' button before proceeding.", 
              variant: "warning" 
          });
          return;
      }
      
      // 2. Check if the format is compatible (assuming currentFormat reflects the saved data)
      const compatibleFormats = ['jsonl', 'openai-jsonl'];
      if (!compatibleFormats.includes(currentFormat.toLowerCase())) {
          toast({ 
              title: "Incompatible Format", 
              description: `Fine-tuning currently only supports JSONL formats. Current format is ${currentFormat.toUpperCase()}. Please convert the dataset first.`, 
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
      
      // 4. Navigate if valid
      if (isValid) {
          console.log(`Navigating to fine-tune setup with key: ${preparedDataKey}`);
          router.push(`/dashboard/fine-tune/new?outputKeys=${encodeURIComponent(preparedDataKey)}`);
      }
  };

  // --- Render Logic --- 
  if (isLoadingContent) {
      return (
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
                   disabled={!preparedDataKey || contentModified || isValidating || isSaving || isDeduplicating}
                   title={!preparedDataKey ? "Load data first" : contentModified ? "Save changes before fine-tuning" : "Proceed to fine-tuning setup"}
               >
                    <BrainCircuit className="mr-2 h-4 w-4" />
                    Fine-tune
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
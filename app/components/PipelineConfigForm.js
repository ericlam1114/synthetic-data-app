// app/components/PipelineConfigForm.js
import React from "react";
import { useToast } from "../../hooks/use-toast";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { Checkbox } from "../../components/ui/checkbox";
import { Separator } from "../../components/ui/separator";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "../../components/ui/tooltip";
import { Info, AlertCircle, CheckCircle, SlidersHorizontal } from "lucide-react";
import FileUploader from "./FileUploader";
import PipelineSelector from "./PipelineSelector";
import StyleUploader from "./StyleUploader";
import { Textarea } from "../../components/ui/textarea";
// --- Add Accordion Imports ---
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
// ---------------------------

const PipelineConfigForm = ({
  file,
  setFile,
  getRootProps,
  getInputProps,
  isDragActive,
  styleFile,
  setStyleFile,
  getStyleRootProps,
  getStyleInputProps,
  isStyleDragActive,
  outputFormat,
  setOutputFormat,
  classFilter,
  setClassFilter,
  prioritizeImportant,
  setPrioritizeImportant,
  pipelineType,
  setPipelineType,
  questionTypes,
  setQuestionTypes,
  difficultyLevels,
  setDifficultyLevels,
  maxQuestionsPerSection,
  setMaxQuestionsPerSection,
  processing,
  onSubmit,
  orgContext,
  setOrgContext,
  formattingDirective,
  setFormattingDirective,
  privacyMaskingEnabled,
  setPrivacyMaskingEnabled,
  excludeStandard,
  setExcludeStandard,
}) => {
  const { toast } = useToast();

  // --- Add Logging ---
  console.log(`[PipelineConfigForm] Rendered. pipelineType prop: ${pipelineType}`);

  // Define dynamic placeholders based on pipelineType
  const getOrgContextPlaceholder = (currentType) => {
    // Log the type being used inside the function
    console.log(`[getOrgContextPlaceholder] Called with type: ${currentType}`);
    switch (currentType) {
      case 'legal':
        console.log("[getOrgContextPlaceholder] Matched 'legal'");
        return "e.g., Law firm specializing in real estate contracts, Compliance department reviewing SaaS agreements...";
      case 'qa':
        console.log("[getOrgContextPlaceholder] Matched 'qa'");
        return "e.g., Creating chatbot for HR department, SOP chatbot for electrical engineering...";
      // Add cases for other potential pipeline types here
      // case 'financial':
      //   return "e.g., Investment bank analyzing quarterly reports, Accounting firm auditing financial statements...";
      default:
        console.log(`[getOrgContextPlaceholder] Default case for type: ${currentType}`);
        return "e.g., Tech startup knowledge base, Financial report analysis...";
    }
  };

  // Call the function once during render to log its result
  const currentPlaceholder = getOrgContextPlaceholder(pipelineType);
  console.log(`[PipelineConfigForm] Placeholder generated: "${currentPlaceholder}"`);
  // --- End Logging ---

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!file) {
      toast({
        title: "Missing file",
        description: "Please upload a PDF document first",
        variant: "destructive",
      });
      return;
    }

    onSubmit();
  };

  // Render different config options based on pipeline type
  const renderPipelineSpecificConfig = () => {
    // Always return null to hide all pipeline-specific options for now
    return null;
  };

  // Calculate specific config JSX before the return statement
  const specificConfig = renderPipelineSpecificConfig();

  return (
    <TooltipProvider>
      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Document Upload
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  Upload a PDF document to process through the synthetic data
                  pipeline
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <CardDescription>
              {pipelineType === "legal"
                ? "Upload a legal document to extract, classify, and generate variants of its clauses"
                : "Upload a standard operating procedure (SOP) document to generate Q&A pairs"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileUploader
              getRootProps={getRootProps}
              getInputProps={getInputProps}
              isDragActive={isDragActive}
              file={file}
              setFile={setFile}
            />
          </CardContent>
        </Card>
        {/* <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Organization Style Reference (Optional)
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  Upload a document that represents your organization's writing
                  style
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <CardDescription>
              Help the system generate content that matches your organization's
              tone and style
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StyleUploader
              styleFile={styleFile}
              setStyleFile={setStyleFile}
              getRootProps={getStyleRootProps}
              getInputProps={getStyleInputProps}
              isDragActive={isStyleDragActive}
            />
          </CardContent>
        </Card> */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Pipeline Configuration
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  Configure how your document will be processed into synthetic
                  training data
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <CardDescription>
              Customize the pipeline type and output format for the synthetic
              data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Pipeline Type Selector */}
            <PipelineSelector
              pipelineType={pipelineType}
              setPipelineType={setPipelineType}
              disabled={processing}
            />

            {/* <Separator /> */}

            {/* Pipeline Specific Configuration */}
            {/* Render Pipeline Specific Config JSX calculated above */}
            {specificConfig}

            {/* Separator only rendered AFTER specific config if it exists */}
            { specificConfig && <Separator /> }

            {/* --- START: Organization Context --- */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="org-context" className="text-base font-medium">
                  Training Context (Optional)
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-sm">
                    <p>Briefly describe your organization or how you intend to use the generated data (e.g., 'Law firm for real estate contracts', 'Internal training SOPs').</p>
                    <p className="mt-1 text-xs text-muted-foreground">This helps the AI preserve specific terminology and tailor the output.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                id="org-context"
                placeholder={getOrgContextPlaceholder(pipelineType)}
                value={orgContext}
                onChange={(e) => setOrgContext(e.target.value)}
                disabled={processing}
                className="min-h-[60px]"
              />
            </div>
            {/* --- END: Organization Context --- */}

            {/* <Separator /> */}
            <div className="space-y-6 bg-gray-50 rounded-lg border p-4">

            {/* --- START: Accordion for Advanced Options --- */}
            <Accordion type="single" collapsible className="w-full ">
              <AccordionItem value="advanced-options">
                <AccordionTrigger className="text-base font-medium py-3 hover:no-underline">
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                    Advanced Options
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pt-4 space-y-6 border-t mt-2">

                  {/* --- START: Exclude Standard Content (Moved Here) --- */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="exclude-standard" className="text-base font-medium">
                        Content Filtering
                      </Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <p>If enabled, only content classified as 'Important' or 'Critical' will be used for generation. 'Standard' content (like boilerplate, simple headings) will be excluded.</p>
                          <p className="mt-2 text-xs text-muted-foreground">This can focus the output on key information and reduce processing time/cost, but might exclude useful context if classification is imperfect.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex items-center space-x-2">
                       <Checkbox
                         id="exclude-standard"
                         checked={excludeStandard}
                         onCheckedChange={setExcludeStandard}
                         disabled={processing}
                         />
                       <Label
                         htmlFor="exclude-standard"
                         className="cursor-pointer text-sm font-normal"
                         >
                         Prune Low-Importance Sections (Experimental)
                       </Label>
                     </div>
                  </div>
                  {/* --- END: Exclude Standard Content --- */}

                  {/* <Separator /> */}

                  {/* --- START: Formatting Directive --- */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="formatting-directive" className="text-base font-medium">
                        Formatting Style
                      </Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-sm">
                           <p className="font-medium">Choose the desired output style:</p>
                           <ul className="list-disc pl-4 mt-1 space-y-1 text-xs">
                             <li><span className="font-medium">Balanced:</span> Good mix of clarity and brevity (Default).</li>
                             <li><span className="font-medium">Concise:</span> Prioritizes brevity, uses abbreviations.</li>
                             <li><span className="font-medium">Expanded:</span> Prioritizes completeness and explicitness.</li>
                             <li><span className="font-medium">Preserve Length:</span> Tries to match original text length.</li>
                           </ul>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    {/* Revert to Select dropdown for compactness */}
                    <Select
                      value={formattingDirective}
                      onValueChange={setFormattingDirective}
                      disabled={processing}
                      >
                      <SelectTrigger id="formatting-directive" className="w-full">
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
                  {/* --- END: Formatting Directive --- */}

                  {/* <Separator /> */}
                  
                  {/* --- START: Privacy Masking --- */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="privacy-masking" className="text-base font-medium">
                        Privacy Masking (Experimental)
                      </Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <p>If enabled, attempts to automatically replace common PII (names, emails, phones, etc.) with placeholders like [NAME] or [EMAIL] in the output file.</p>
                          <p className="mt-2 text-xs"><span className="font-semibold">Pro:</span> Significantly reduces the risk of accidentally exposing sensitive information.</p>
                          <p className="mt-2 text-xs"><span className="font-semibold">Con:</span> Slight loss in quality of the output.</p>
                          <p className="mt-2 text-xs text-amber-600">Warning: This is experimental and may not catch all sensitive data or might mask non-sensitive data.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex items-center space-x-2">
                       <Checkbox
                         id="privacy-masking"
                         checked={privacyMaskingEnabled}
                         onCheckedChange={setPrivacyMaskingEnabled}
                         disabled={processing}
                         />
                       <Label
                         htmlFor="privacy-masking"
                         className="cursor-pointer text-sm font-normal"
                         >
                         Privacy masking in output
                       </Label>
                     </div>
                  </div>
                  {/* --- END: Privacy Masking --- */}
                  
                </AccordionContent>
              </AccordionItem>
            </Accordion>
                         </div>
            {/* --- END: Accordion for Advanced Options --- */}

            {/* <Separator /> */}

            {/* --- START: Output Format (Moved Last) --- */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="output-format"
                  className="text-base font-medium"
                >
                  Output File Format
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-sm">
                    <p className="font-medium">
                      Choose the final file format for the generated data:
                    </p>
                    <ul className="list-disc pl-4 mt-1 space-y-2 text-xs">
                      <li><span className="font-medium">OpenAI JSONL:</span> For GPT-3.5/4 fine-tuning.</li>
                      <li><span className="font-medium">Standard JSONL:</span> General ML frameworks (one JSON per line).</li>
                      <li><span className="font-medium">JSON:</span> Single JSON array.</li>
                      <li><span className="font-medium">CSV:</span> Comma-separated for spreadsheets/tabular models.</li>
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Select
                value={outputFormat}
                onValueChange={setOutputFormat}
                disabled={processing}
              >
                <SelectTrigger id="output-format" className="w-full">
                  <SelectValue placeholder="Select output file format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai-jsonl">OpenAI (GPT-3.5, GPT-4) - JSONL</SelectItem>
                  <SelectItem value="jsonl">Mistral, Claude, Llama - JSONL</SelectItem>
                  <SelectItem value="json">Universal (All Models) - JSON</SelectItem>
                  <SelectItem value="csv">Tabular Models (sklearn, pandas) - CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* --- END: Output Format --- */}
          </CardContent>
          <CardFooter className="flex justify-between">
            <div className="flex items-center text-sm text-muted-foreground">
              {file ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                  {`Ready to process "${file.name}"`}
                </>
              ) : (
                <>
                  <AlertCircle className="mr-2 h-4 w-4" />
                  {"Upload a PDF to begin"}
                </>
              )}
            </div>
            <Button
              type="submit"
              disabled={processing || !file}
              className="min-w-[180px] bg-black text-white hover:bg-black/90"
            >
              {processing ? "Processing..." : "Process Document"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </TooltipProvider>
  );
};

export default PipelineConfigForm;

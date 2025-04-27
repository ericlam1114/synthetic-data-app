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
  files,
  getRootProps,
  getInputProps,
  isDragActive,
  onRemoveFile,
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
  isProcessButtonDisabled,
  processButtonText,
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
        return "e.g., Law firm specializing in real estate contracts, business department drafting SaaS agreements...";
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

  return (
    <TooltipProvider>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Document Upload & Configuration
          </CardTitle>
          <CardDescription>
            Upload PDF(s), configure the pipeline, and start processing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FileUploader
            getRootProps={getRootProps}
            getInputProps={getInputProps}
            isDragActive={isDragActive}
            files={files}
            onRemoveFile={onRemoveFile}
          />
          
          {/* Conditionally display the sequential processing note */} 
          {files && files.length > 1 && (
              <p className="text-xs text-muted-foreground text-center px-4">
                 Note: Multiple files will be processed sequentially one after another for stability.
              </p>
          )}

          <PipelineSelector
            pipelineType={pipelineType}
            setPipelineType={setPipelineType}
            disabled={processing}
          />
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
                  <p>Briefly describe your organization or how you intend to use the generated data (e.g., &apos;Law firm for real estate contracts&apos;, &apos;Internal training SOPs&apos;).</p>
                  <p className="mt-1 text-xs text-muted-foreground">This helps the AI preserve specific terminology and tailor the output.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Textarea
              id="org-context"
              placeholder={currentPlaceholder}
              value={orgContext}
              onChange={(e) => setOrgContext(e.target.value)}
              disabled={processing}
              className="min-h-[60px]"
            />
          </div>
          <div className="space-y-6 bg-gray-50 rounded-lg border p-4">
            <Accordion type="single" collapsible className="w-full ">
              <AccordionItem value="advanced-options">
                <AccordionTrigger className="text-base font-medium py-3 hover:no-underline">
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                    Advanced Options
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pt-4 space-y-6 border-t mt-2">
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
                          <p>If enabled, only content classified as &apos;Important&apos; or &apos;Critical&apos; will be used for generation. &apos;Standard&apos; content (like boilerplate, simple headings) will be excluded.</p>
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
                          <p className="mt-2 text-xs text-amber-600">Warning: This is experimental and may not catch all sensitive data or might mask non&apos;sensitive data.</p>
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
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
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
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="flex items-center text-sm text-muted-foreground">
            {files.length > 0 ? (
               <>
                 <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                 {`Ready to process ${files.length} document${files.length > 1 ? 's' : ''}`}
               </>
            ) : (
              <>
                <AlertCircle className="mr-2 h-4 w-4" />
                {"Upload PDF(s) to begin"}
              </>
            )}
          </div>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isProcessButtonDisabled}
            className="min-w-[180px] bg-black text-white hover:bg-black/90"
          >
            {processButtonText}
          </Button>
        </CardFooter>
      </Card>
    </TooltipProvider>
  );
};

export default PipelineConfigForm;

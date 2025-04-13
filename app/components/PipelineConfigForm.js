// components/PipelineConfigForm.jsx
import React from 'react';
import { useToast } from '../../hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Checkbox } from '../../components/ui/checkbox';
import { Separator } from '../../components/ui/separator';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '../../components/ui/tooltip';
import { Info, AlertCircle, CheckCircle } from 'lucide-react';
import FileUploader from './FileUploader';

const PipelineConfigForm = ({
  file,
  setFile,
  getRootProps,
  getInputProps,
  isDragActive,
  outputFormat,
  setOutputFormat,
  classFilter,
  setClassFilter,
  prioritizeImportant,
  setPrioritizeImportant,
  processing,
  onSubmit
}) => {
  const { toast } = useToast();

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
                  Upload a PDF document to process through the legal synthetic data pipeline
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <CardDescription>
              Upload a legal document to extract, classify, and generate variants of its clauses
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

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Pipeline Configuration
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  Configure how your document will be processed into synthetic training data
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <CardDescription>
              Customize the output format and filtering options for the synthetic data pipeline
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Output Format Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="output-format" className="text-base font-medium">Output Format</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 bg text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-sm">
                    <p className="font-medium">Choose the format of the generated output:</p>
                    <ul className="list-disc pl-4 mt-1 space-y-1">
                      <li><span className="font-medium">OpenAI Fine-tuning JSONL</span>: Ready for OpenAI fine-tuning</li>
                      <li><span className="font-medium">Standard JSONL</span>: Each line is a JSON object</li>
                      <li><span className="font-medium">JSON</span>: Single JSON array</li>
                      <li><span className="font-medium">CSV</span>: Comma-separated values</li>
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
                  <SelectValue placeholder="Select output format" />
                </SelectTrigger>
                <SelectContent className="bg-background !bg-opacity-100">
                  <SelectItem value="openai-jsonl" className="cursor-pointer hover:bg-accent hover:text-accent-foreground">OpenAI Fine-tuning JSONL</SelectItem>
                  <SelectItem value="jsonl" className="cursor-pointer hover:bg-accent hover:text-accent-foreground">Standard JSONL</SelectItem>
                  <SelectItem value="json" className="cursor-pointer hover:bg-accent hover:text-accent-foreground">JSON</SelectItem>
                  <SelectItem value="csv" className="cursor-pointer hover:bg-accent hover:text-accent-foreground">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Content Filtering Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-base font-medium">Clause Filter Level</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-sm">
                    <p className="font-medium">Filter clauses based on importance classification:</p>
                    <ul className="list-disc pl-4 mt-1 space-y-1">
                      <li><span className="font-medium">All Clauses</span>: Process all extracted clauses</li>
                      <li><span className="font-medium">Critical Only</span>: Only process clauses classified as "Critical"</li>
                      <li><span className="font-medium">Important & Critical</span>: Process clauses classified as either "Important" or "Critical"</li>
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </div>
              
              <RadioGroup 
                value={classFilter}
                onValueChange={setClassFilter}
                disabled={processing}
                className="flex flex-col space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="filter-all" />
                  <Label htmlFor="filter-all" className="cursor-pointer">All Clauses</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="critical_only" id="filter-critical" />
                  <Label htmlFor="filter-critical" className="cursor-pointer">Critical Clauses Only</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="important_plus" id="filter-important" />
                  <Label htmlFor="filter-important" className="cursor-pointer">Important & Critical Clauses</Label>
                </div>
              </RadioGroup>
            </div>

            <Separator />

            {/* Processing Priority */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="prioritize" className="text-base font-medium">Processing Priority</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    When enabled, the system will process the most important clauses first
                  </TooltipContent>
                </Tooltip>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="prioritize" 
                  checked={prioritizeImportant}
                  onCheckedChange={setPrioritizeImportant}
                  disabled={processing}
                />
                <Label 
                  htmlFor="prioritize" 
                  className="cursor-pointer text-sm leading-relaxed"
                >
                  Prioritize important clauses during processing 
                  <span className="block text-xs text-muted-foreground mt-1">
                    Critical and important clauses will be processed first when resources are limited
                  </span>
                </Label>
              </div>
            </div>
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
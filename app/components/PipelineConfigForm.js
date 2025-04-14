// app/components/PipelineConfigForm.js
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
import PipelineSelector from './PipelineSelector';

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
  pipelineType,
  setPipelineType,
  questionTypes,
  setQuestionTypes,
  difficultyLevels,
  setDifficultyLevels,
  maxQuestionsPerSection,
  setMaxQuestionsPerSection,
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

  // Render different config options based on pipeline type
  const renderPipelineSpecificConfig = () => {
    if (pipelineType === 'legal') {
      return (
        <>
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
                  Critical and important clauses will be processed first when you're running out of tokens
                </span>
              </Label>
            </div>
          </div>
        </>
      );
    } else if (pipelineType === 'qa') {
      return (
        <>
          {/* Question Types Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-base font-medium">Question Types</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-sm">
                  <p className="font-medium">Select the types of questions to generate:</p>
                  <ul className="list-disc pl-4 mt-1 space-y-1">
                    <li><span className="font-medium">Factual</span>: Basic knowledge questions about specific information</li>
                    <li><span className="font-medium">Procedural</span>: Questions about steps, processes, or how to perform tasks</li>
                    <li><span className="font-medium">Critical Thinking</span>: Questions requiring analysis, evaluation, or decision-making</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </div>
            
            <div className="flex flex-col space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="factual-questions" 
                  checked={questionTypes.includes('factual')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setQuestionTypes(prev => [...prev, 'factual']);
                    } else {
                      setQuestionTypes(prev => prev.filter(t => t !== 'factual'));
                    }
                  }}
                  disabled={processing}
                />
                <Label htmlFor="factual-questions" className="cursor-pointer">Factual Questions</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="procedural-questions" 
                  checked={questionTypes.includes('procedural')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setQuestionTypes(prev => [...prev, 'procedural']);
                    } else {
                      setQuestionTypes(prev => prev.filter(t => t !== 'procedural'));
                    }
                  }}
                  disabled={processing}
                />
                <Label htmlFor="procedural-questions" className="cursor-pointer">Procedural Questions</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="critical-questions" 
                  checked={questionTypes.includes('critical-thinking')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setQuestionTypes(prev => [...prev, 'critical-thinking']);
                    } else {
                      setQuestionTypes(prev => prev.filter(t => t !== 'critical-thinking'));
                    }
                  }}
                  disabled={processing}
                />
                <Label htmlFor="critical-questions" className="cursor-pointer">Critical Thinking Questions</Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Difficulty Levels Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-base font-medium">Difficulty Levels</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  Select the difficulty levels of questions to generate
                </TooltipContent>
              </Tooltip>
            </div>
            
            <div className="flex flex-col space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="basic-level" 
                  checked={difficultyLevels.includes('basic')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setDifficultyLevels(prev => [...prev, 'basic']);
                    } else {
                      setDifficultyLevels(prev => prev.filter(l => l !== 'basic'));
                    }
                  }}
                  disabled={processing}
                />
                <Label htmlFor="basic-level" className="cursor-pointer">Basic</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="intermediate-level" 
                  checked={difficultyLevels.includes('intermediate')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setDifficultyLevels(prev => [...prev, 'intermediate']);
                    } else {
                      setDifficultyLevels(prev => prev.filter(l => l !== 'intermediate'));
                    }
                  }}
                  disabled={processing}
                />
                <Label htmlFor="intermediate-level" className="cursor-pointer">Intermediate</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="advanced-level" 
                  checked={difficultyLevels.includes('advanced')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setDifficultyLevels(prev => [...prev, 'advanced']);
                    } else {
                      setDifficultyLevels(prev => prev.filter(l => l !== 'advanced'));
                    }
                  }}
                  disabled={processing}
                />
                <Label htmlFor="advanced-level" className="cursor-pointer">Advanced</Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Questions Per Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="max-questions" className="text-base font-medium">Questions Per Section</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  Maximum number of questions to generate for each document section
                </TooltipContent>
              </Tooltip>
            </div>
            
            <Select 
              value={String(maxQuestionsPerSection)}
              onValueChange={(value) => setMaxQuestionsPerSection(Number(value))}
              disabled={processing}
            >
              <SelectTrigger id="max-questions" className="w-full">
                <SelectValue placeholder="Select maximum questions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 questions</SelectItem>
                <SelectItem value="5">5 questions</SelectItem>
                <SelectItem value="10">10 questions</SelectItem>
                <SelectItem value="15">15 questions</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      );
    }
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
                  Upload a PDF document to process through the synthetic data pipeline
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <CardDescription>
              {pipelineType === 'legal' 
                ? 'Upload a legal document to extract, classify, and generate variants of its clauses'
                : 'Upload a standard operating procedure (SOP) document to generate Q&A pairs'}
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
              Customize the pipeline type and output format for the synthetic data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Pipeline Type Selector */}
            <PipelineSelector
              pipelineType={pipelineType}
              setPipelineType={setPipelineType}
              disabled={processing}
            />
            
            <Separator />
            
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
                    <ul className="list-disc pl-4 mt-1 space-y-2">
                      <li>
                        <span className="font-medium">OpenAI Fine-tuning JSONL</span>
                        <p className="text-sm text-muted-foreground">Ready for OpenAI fine-tuning (GPT-3.5, GPT-4). Includes system prompts and role-based formatting.</p>
                      </li>
                      <li>
                        <span className="font-medium">Standard JSONL</span>
                        <p className="text-sm text-muted-foreground">Each line is a JSON object. Compatible with most ML frameworks (Hugging Face, TensorFlow, PyTorch).</p>
                      </li>
                      <li>
                        <span className="font-medium">JSON</span>
                        <p className="text-sm text-muted-foreground">Single JSON array. Universal format for any model or framework. Good for data analysis and custom processing.</p>
                      </li>
                      <li>
                        <span className="font-medium">CSV</span>
                        <p className="text-sm text-muted-foreground">Comma-separated values. Compatible with spreadsheet software and tabular ML models (scikit-learn, pandas).</p>
                      </li>
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
                  <SelectItem value="openai-jsonl" className="cursor-pointer hover:bg-accent hover:text-accent-foreground">
                    OpenAI (GPT-3.5, GPT-4) - JSONL Format
                  </SelectItem>
                  <SelectItem value="jsonl" className="cursor-pointer hover:bg-accent hover:text-accent-foreground">
                    Mistral, Claude, Llama - JSONL Format
                  </SelectItem>
                  <SelectItem value="json" className="cursor-pointer hover:bg-accent hover:text-accent-foreground">
                    Universal (All Models) - JSON Format
                  </SelectItem>
                  <SelectItem value="csv" className="cursor-pointer hover:bg-accent hover:text-accent-foreground">
                    Tabular Models (sklearn, pandas) - CSV Format
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Separator />
            
            {/* Pipeline Specific Configuration */}
            {renderPipelineSpecificConfig()}
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
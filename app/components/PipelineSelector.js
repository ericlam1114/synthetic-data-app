// app/components/PipelineSelector.js
import React from 'react';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { Info } from 'lucide-react';

const PipelineSelector = ({ pipelineType, setPipelineType, disabled }) => {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Label htmlFor="pipeline-type" className="text-base font-medium">Pipeline Type</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-sm bg-white !bg-opacity-100 border shadow-lg p-3 backdrop-blur-none">
                  <div className="bg-white w-full">
                    <p className="font-medium mb-2">Customize the pipeline type and output format for the synthetic data</p>
                    <ul className="list-disc pl-4 space-y-2">
                      <li>
                        <span className="font-medium">Rewriter (Legal, Agreements, etc.)</span>
                        <p className="text-sm text-muted-foreground">Generate variations of legal text while preserving meaning and compliance requirements</p>
                      </li>
                      <li>
                        <span className="font-medium">Q&A Generator</span>
                        <p className="text-sm text-muted-foreground">Create question-answer pairs from your procedural documents and guidelines</p>
                      </li>
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          <Select 
            value={pipelineType}
            onValueChange={setPipelineType}
            disabled={disabled}
            className="mt-2"
          >
            <SelectTrigger id="pipeline-type" className="w-full">
              <SelectValue placeholder="Select pipeline type" />
            </SelectTrigger>
            <SelectContent className="bg-white border shadow-md">
              <SelectItem value="legal" className="cursor-pointer">
                Rewriter (Legal, Agreements, etc.)
              </SelectItem>
              <SelectItem value="qa" className="cursor-pointer">
                Q&A Generator (SOPs, HR, Customer Service, etc.)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* <div>
          <div className="flex items-center gap-2">
            <Label htmlFor="output-format" className="text-base font-medium">Output Format</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-sm bg-white !bg-opacity-100 border shadow-lg p-3 backdrop-blur-none">
                  <div className="bg-white w-full">
                    <p className="font-medium mb-2">Choose the format of the generated output:</p>
                    <ul className="list-disc pl-4 space-y-2">
                      <li>
                        <span className="font-medium">OpenAI Fine-tuning JSONL:</span>
                        <p className="text-sm text-muted-foreground">Ready for OpenAI fine-tuning</p>
                      </li>
                      <li>
                        <span className="font-medium">Standard JSONL:</span>
                        <p className="text-sm text-muted-foreground">Each line is a JSON object</p>
                      </li>
                      <li>
                        <span className="font-medium">JSON:</span>
                        <p className="text-sm text-muted-foreground">Single JSON array</p>
                      </li>
                      <li>
                        <span className="font-medium">CSV:</span>
                        <p className="text-sm text-muted-foreground">Comma-separated values</p>
                      </li>
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <Select disabled className="mt-2">
            <SelectTrigger id="output-format" className="w-full">
              <SelectValue>OpenAI Fine-tuning JSONL</SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-white border shadow-md">
              <SelectItem value="jsonl">OpenAI Fine-tuning JSONL</SelectItem>
            </SelectContent>
          </Select>
        </div> */}
      </div>
    </div>
  );
};

export default PipelineSelector;
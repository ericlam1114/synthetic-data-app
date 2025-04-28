// Updated app/components/PipelineSelector.js
import React from "react";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { Info } from "lucide-react";

const PipelineSelector = ({ pipelineType, setPipelineType, disabled }) => {
  // Log the received props
  console.log(`[PipelineSelector] Rendered. Received pipelineType: ${pipelineType}, setPipelineType is function: ${typeof setPipelineType === 'function'}`);

  // Create a local handler to log before calling the prop function
  const handleSelectChange = (newValue) => {
    console.log(`[PipelineSelector] handleSelectChange triggered with value: ${newValue}`);
    if (typeof setPipelineType === 'function') {
      setPipelineType(newValue); // Call the function passed via props
    } else {
      console.error("[PipelineSelector] setPipelineType prop is not a function!");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Label htmlFor="pipeline-type" className="text-base font-medium">
              Pipeline Type
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="max-w-sm bg-white !bg-opacity-100 border shadow-lg p-3 backdrop-blur-none"
                >
                  <div className="bg-white w-full">
                    <p className="font-medium mb-2">
                      Customize the pipeline type and output format for the
                      synthetic data
                    </p>
                    <ul className="list-disc pl-4 space-y-2">
                      <li>
                        <span className="font-medium">
                          Rewriter (Legal, Agreements, etc.)
                        </span>
                        <p className="text-sm text-muted-foreground">
                          Generate variations of legal text while preserving
                          meaning and compliance requirements
                        </p>
                      </li>
                      <li>
                        <span className="font-medium">Q&A Generator</span>
                        <p className="text-sm text-muted-foreground">
                          Create question-answer pairs from your procedural
                          documents and guidelines
                        </p>
                      </li>
                      <li>
                        <span className="font-medium">Finance Analyst</span>
                        <p className="text-sm text-muted-foreground">
                          Extract financial metrics and generate projections
                          from financial documents and reports
                        </p>
                      </li>
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <Select
            value={pipelineType}
            defaultValue="legal"
            onValueChange={handleSelectChange}
            disabled={disabled}
            className="mt-2"
          >
            <SelectTrigger id="pipeline-type" className="w-full">
              <SelectValue placeholder="Rewriter (Legal, Agreements, etc.)" />
            </SelectTrigger>
            <SelectContent className="bg-white border shadow-md">
              <SelectItem value="legal" className="cursor-pointer">
                Rewriter (Legal, Agreements, etc.)
              </SelectItem>
              <SelectItem value="qa" className="cursor-pointer">
                Q&A Generator (SOPs, HR, Customer Service, etc.)
              </SelectItem>
              {/* <SelectItem value="finance" className="cursor-pointer">
                Finance Analyst (Financial Reports, Metrics, Projections)
              </SelectItem> */}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default PipelineSelector;

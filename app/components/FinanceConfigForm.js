// app/components/FinanceConfigForm.js
import React from 'react';
import { Label } from '../../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Checkbox } from '../../components/ui/checkbox';
import { Separator } from '../../components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { Info } from 'lucide-react';

const FinanceConfigForm = ({
  metricFilter,
  setMetricFilter,
  generateProjections,
  setGenerateProjections,
  projectionTypes,
  setProjectionTypes,
  processing
}) => {
  return (
    <TooltipProvider>
      <>
        {/* Metric Filtering Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-base font-medium">
              Metric Filter
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-sm">
                <p className="font-medium">
                  Filter metrics based on their classification:
                </p>
                <ul className="list-disc pl-4 mt-1 space-y-1">
                  <li>
                    <span className="font-medium">All Metrics</span>: Process
                    all extracted financial metrics
                  </li>
                  <li>
                    <span className="font-medium">Valuation Inputs</span>: Only
                    process metrics classified as valuation inputs (revenue, profit, etc.)
                  </li>
                  <li>
                    <span className="font-medium">Cost Drivers</span>: Only
                    process metrics related to costs and expenses
                  </li>
                  <li>
                    <span className="font-medium">Projection Basis</span>: Only
                    process metrics used for future projections (growth rates, etc.)
                  </li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </div>

          <RadioGroup
            value={metricFilter}
            onValueChange={setMetricFilter}
            disabled={processing}
            className="flex flex-col space-y-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="all" id="filter-all" />
              <Label htmlFor="filter-all" className="cursor-pointer">
                All Metrics
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="valuation_input" id="filter-valuation" />
              <Label htmlFor="filter-valuation" className="cursor-pointer">
                Valuation Inputs
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="cost_driver" id="filter-cost" />
              <Label htmlFor="filter-cost" className="cursor-pointer">
                Cost Drivers
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="projection_basis" id="filter-projection" />
              <Label htmlFor="filter-projection" className="cursor-pointer">
                Projection Basis
              </Label>
            </div>
          </RadioGroup>
        </div>

        <Separator />

        {/* Projections Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="generate-projections" className="text-base font-medium">
              Financial Projections
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right">
                Enable to generate financial projections and insights based on extracted metrics
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="generate-projections"
              checked={generateProjections}
              onCheckedChange={setGenerateProjections}
              disabled={processing}
            />
            <Label
              htmlFor="generate-projections"
              className="cursor-pointer text-sm leading-relaxed"
            >
              Generate financial projections and insights
              <span className="block text-xs text-muted-foreground mt-1">
                Uses extracted metrics to provide valuation estimates and growth projections
              </span>
            </Label>
          </div>
        </div>

        {generateProjections && (
          <>
            <Separator />

            {/* Projection Types Section */}
            <div className="space-y-3 ml-6">
              <div className="flex items-center gap-2">
                <Label className="text-base font-medium">Projection Types</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-sm">
                    <p className="font-medium">
                      Select the types of financial projections to generate:
                    </p>
                    <ul className="list-disc pl-4 mt-1 space-y-1">
                      <li>
                        <span className="font-medium">Valuation</span>: Estimates of company value based on financial metrics
                      </li>
                      <li>
                        <span className="font-medium">Growth</span>: Projections of future growth based on trends
                      </li>
                      <li>
                        <span className="font-medium">Profitability</span>: Analysis of profit margins and cost structure
                      </li>
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="flex flex-col space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="valuation-projection"
                    checked={projectionTypes.includes("valuation")}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setProjectionTypes((prev) => [...prev, "valuation"]);
                      } else {
                        setProjectionTypes((prev) =>
                          prev.filter((t) => t !== "valuation")
                        );
                      }
                    }}
                    disabled={processing}
                  />
                  <Label htmlFor="valuation-projection" className="cursor-pointer">
                    Valuation Projections
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="growth-projection"
                    checked={projectionTypes.includes("growth")}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setProjectionTypes((prev) => [...prev, "growth"]);
                      } else {
                        setProjectionTypes((prev) =>
                          prev.filter((t) => t !== "growth")
                        );
                      }
                    }}
                    disabled={processing}
                  />
                  <Label htmlFor="growth-projection" className="cursor-pointer">
                    Growth Projections
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="profitability-projection"
                    checked={projectionTypes.includes("profitability")}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setProjectionTypes((prev) => [...prev, "profitability"]);
                      } else {
                        setProjectionTypes((prev) =>
                          prev.filter((t) => t !== "profitability")
                        );
                      }
                    }}
                    disabled={processing}
                  />
                  <Label htmlFor="profitability-projection" className="cursor-pointer">
                    Profitability Analysis
                  </Label>
                </div>
              </div>
            </div>
          </>
        )}
      </>
    </TooltipProvider>
  );
};

export default FinanceConfigForm;
// app/components/DataCanvas.js
import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Separator } from '../../components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { Info, Shuffle, Check, X, AlertTriangle, BarChart2 } from 'lucide-react';

const DataCanvas = ({ data, format }) => {
  const [viewMode, setViewMode] = useState('canvas');
  const [clauses, setClauses] = useState([]);
  const [metrics, setMetrics] = useState({
    totalClauses: 0,
    totalVariants: 0,
    classifications: { Critical: 0, Important: 0, Standard: 0 },
    avgSimilarity: 0,
    avgLegalScore: 0,
    filteredCount: 0
  });
  
  // Parse data based on format
  useEffect(() => {
    if (!data) return;
    
    try {
      let parsedData = [];
      
      if (format === 'openai-jsonl' || format === 'jsonl') {
        // Parse JSONL format
        parsedData = data.split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));
          
        if (format === 'openai-jsonl') {
          // Map OpenAI format data to a more usable structure
          const mappedData = [];
          const messageMap = new Map();
          
          // Group by original text
          for (const item of parsedData) {
            if (!item.messages || item.messages.length < 3) continue;
            
            const original = item.messages[1].content;
            const variant = item.messages[2].content;
            
            if (!messageMap.has(original)) {
              messageMap.set(original, {
                original,
                classification: item.classification || 'Unknown',
                variants: [variant],
                quality_metrics: item.quality_metrics || {}
              });
            } else {
              messageMap.get(original).variants.push(variant);
            }
          }
          
          parsedData = Array.from(messageMap.values());
        }
      } else if (format === 'json') {
        // Parse JSON format
        parsedData = typeof data === 'string' ? JSON.parse(data) : data;
      }
      
      // Calculate metrics
      const calculatedMetrics = {
        totalClauses: parsedData.length,
        totalVariants: parsedData.reduce((sum, clause) => sum + (clause.variants?.length || 0), 0),
        classifications: { Critical: 0, Important: 0, Standard: 0 },
        avgSimilarity: 0,
        avgLegalScore: 0,
        filteredCount: 0
      };
      
      // Count classifications
      parsedData.forEach(clause => {
        const classification = clause.classification || 'Unknown';
        calculatedMetrics.classifications[classification] = 
          (calculatedMetrics.classifications[classification] || 0) + 1;
          
        // Add quality metrics if available
        if (clause.quality_metrics) {
          calculatedMetrics.avgSimilarity += clause.quality_metrics.avg_similarity || 0;
          calculatedMetrics.avgLegalScore += clause.quality_metrics.avg_legal_score || 0;
          calculatedMetrics.filteredCount += clause.quality_metrics.filtered_count || 0;
        }
      });
      
      // Calculate averages
      if (parsedData.length > 0) {
        calculatedMetrics.avgSimilarity /= parsedData.length;
        calculatedMetrics.avgLegalScore /= parsedData.length;
      }
      
      setClauses(parsedData);
      setMetrics(calculatedMetrics);
    } catch (error) {
      console.error('Error parsing data for canvas:', error);
      setClauses([]);
    }
  }, [data, format]);
  
  // Quality indicator component
  const QualityIndicator = ({ score }) => {
    let color = 'text-gray-400';
    if (score > 0.8) color = 'text-green-500';
    else if (score > 0.5) color = 'text-yellow-500';
    else if (score > 0) color = 'text-red-500';
    
    return (
      <div className="flex items-center gap-1">
        <div className={`h-2 w-2 rounded-full ${color.replace('text-', 'bg-')}`}></div>
        <span className={`text-xs ${color}`}>
          {score > 0 ? Math.round(score * 100) + '%' : 'N/A'}
        </span>
      </div>
    );
  };
  
  // Metrics panel
  const MetricsPanel = () => (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
      <div className="space-y-1">
        <div className="text-sm text-gray-500">Total Clauses</div>
        <div className="text-2xl font-semibold">{metrics.totalClauses}</div>
      </div>
      
      <div className="space-y-1">
        <div className="text-sm text-gray-500">Total Variants</div>
        <div className="text-2xl font-semibold">{metrics.totalVariants}</div>
      </div>
      
      <div className="space-y-1">
        <div className="text-sm text-gray-500 flex items-center gap-1">
          Filtered Variants
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                Variants that were removed due to quality issues
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="text-2xl font-semibold">{metrics.filteredCount}</div>
      </div>
      
      <div className="space-y-1">
        <div className="text-sm text-gray-500 flex items-center gap-1">
          Avg. Similarity
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                Semantic similarity between variants and original clauses (lower is better)
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-semibold">
            {(metrics.avgSimilarity * 100).toFixed(1)}%
          </div>
          <QualityIndicator score={1 - metrics.avgSimilarity} />
        </div>
      </div>
      
      <div className="space-y-1">
        <div className="text-sm text-gray-500 flex items-center gap-1">
          Legal Accuracy
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                How well variants preserve legal terminology
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-semibold">
            {(metrics.avgLegalScore * 100).toFixed(1)}%
          </div>
          <QualityIndicator score={metrics.avgLegalScore} />
        </div>
      </div>
      
      <div className="space-y-1">
        <div className="text-sm text-gray-500">Classification</div>
        <div className="flex flex-col text-sm">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-red-500"></div>
            <span>Critical: {metrics.classifications.Critical || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-amber-500"></div>
            <span>Important: {metrics.classifications.Important || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-blue-500"></div>
            <span>Standard: {metrics.classifications.Standard || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
  
  // No data state
  if (!data || clauses.length === 0) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5" />
            Data Canvas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-gray-400" />
            <p>No data available to visualize.</p>
            <p className="text-sm mt-2">Process a document to view the data canvas.</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5" />
            Data Canvas
          </div>
          <div className="flex space-x-2 text-sm bg-gray-100 rounded-md p-1">
            <button 
              className={`px-3 py-1 rounded ${viewMode === 'canvas' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
              onClick={() => setViewMode('canvas')}
            >
              Canvas View
            </button>
            <button 
              className={`px-3 py-1 rounded ${viewMode === 'list' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
              onClick={() => setViewMode('list')}
            >
              List View
            </button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <MetricsPanel />
        
        <div className="space-y-6">
          {viewMode === 'canvas' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {clauses.slice(0, 9).map((clause, index) => (
                <div key={index} className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="p-3 bg-gray-50 border-b flex justify-between items-center">
                    <div className="font-medium truncate max-w-[80%]">
                      Clause #{index + 1}
                    </div>
                    <div className={`px-2 py-0.5 rounded-full text-xs ${
                      clause.classification === 'Critical' ? 'bg-red-100 text-red-800' :
                      clause.classification === 'Important' ? 'bg-amber-100 text-amber-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {clause.classification || 'Standard'}
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-medium mb-1">Original</div>
                    <div className="text-sm bg-gray-50 p-2 rounded mb-3 max-h-24 overflow-y-auto">
                      {clause.original}
                    </div>
                    
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm font-medium">Variants ({clause.variants?.length || 0})</div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {clause.quality_metrics && (
                          <>
                            <div className="flex items-center gap-1">
                              <Shuffle className="h-3 w-3" />
                              <span>Similarity: <QualityIndicator score={1 - (clause.quality_metrics.avg_similarity || 0)} /></span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Check className="h-3 w-3" />
                              <span>Legal: <QualityIndicator score={clause.quality_metrics.avg_legal_score || 0} /></span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {clause.variants && clause.variants.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {clause.variants.map((variant, vIdx) => (
                          <div key={vIdx} className="text-sm bg-green-50 p-2 rounded">
                            {variant}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 italic p-2">No variants generated</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {clauses.map((clause, index) => (
                <div key={index} className="border rounded-lg overflow-hidden">
                  <div 
                    className="p-3 bg-gray-50 border-b cursor-pointer hover:bg-gray-100 flex justify-between"
                    onClick={() => {
                      // Toggle expanded state
                      const newClauses = [...clauses];
                      newClauses[index] = {...clause, _expanded: !clause._expanded};
                      setClauses(newClauses);
                    }}
                  >
                    <div className="font-medium">
                      Clause #{index + 1} - {clause.classification || 'Standard'}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">
                        {clause.variants?.length || 0} variants
                      </span>
                      <svg 
                        className={`w-5 h-5 text-gray-500 transform transition-transform ${clause._expanded ? 'rotate-180' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24" 
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  
                  {clause._expanded && (
                    <div className="p-3 border-t">
                      <div className="mb-3">
                        <div className="text-sm font-medium mb-1">Original</div>
                        <div className="text-sm bg-gray-50 p-2 rounded">
                          {clause.original}
                        </div>
                      </div>
                      
                      {clause.quality_metrics && (
                        <div className="mb-3 flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">Similarity:</span>
                            <QualityIndicator score={1 - (clause.quality_metrics.avg_similarity || 0)} />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">Legal Accuracy:</span>
                            <QualityIndicator score={clause.quality_metrics.avg_legal_score || 0} />
                          </div>
                          {clause.quality_metrics.filtered_count > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">Filtered Out:</span>
                              <span className="text-amber-600">{clause.quality_metrics.filtered_count}</span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="text-sm font-medium mb-1">Variants</div>
                      {clause.variants && clause.variants.length > 0 ? (
                        <div className="space-y-2">
                          {clause.variants.map((variant, vIdx) => (
                            <div key={vIdx} className="text-sm bg-green-50 p-2 rounded">
                              {variant}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500 italic">No variants generated</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {clauses.length > 9 && viewMode === 'canvas' && (
            <div className="text-center">
              <button 
                onClick={() => setViewMode('list')}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                View all {clauses.length} clauses in list view
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default DataCanvas;
// app/components/FinanceDataViewer.js
import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Separator } from '../../components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { BarChart2, Info, AlertTriangle, DollarSign, TrendingUp, PieChart } from 'lucide-react';

const FinanceDataViewer = ({ data, format }) => {
  const [viewMode, setViewMode] = useState('dashboard');
  const [expandedItems, setExpandedItems] = useState({});
  const [metrics, setMetrics] = useState([]);
  const [projections, setProjections] = useState([]);
  const [metricStats, setMetricStats] = useState({
    totalMetrics: 0,
    totalProjections: 0,
    fiscalYears: [],
    hasRevenue: false,
    hasGrowth: false,
    hasMargins: false
  });
  
  // Parse data based on format
  useEffect(() => {
    if (!data) return;
    
    try {
      let parsedMetrics = [];
      let parsedProjections = [];
      
      if (format === 'openai-jsonl' || format === 'jsonl') {
        // Parse JSONL format
        const lines = data.split('\n')
          .filter(line => line.trim());
          
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            
            if (parsed.type === 'metric') {
              parsedMetrics.push({
                data: parsed.data,
                classifications: parsed.classifications
              });
            } else if (parsed.type === 'projection') {
              parsedProjections.push({
                metrics: parsed.metrics,
                projectionType: parsed.projectionType,
                question: parsed.question,
                result: parsed.result
              });
            } else if (parsed.messages) {
              // Handle OpenAI fine-tuning format
              // Extract metrics from the messages
              const userMessage = parsed.messages.find(m => m.role === 'user');
              if (userMessage && userMessage.content.includes('Analyze these financial metrics:')) {
                try {
                  const metricsStr = userMessage.content.replace('Analyze these financial metrics:', '').trim();
                  const metricsData = JSON.parse(metricsStr);
                  parsedMetrics.push({
                    data: metricsData,
                    classifications: {} // No classification available in this format
                  });
                } catch (e) {
                  console.error('Failed to parse metrics from OpenAI format:', e);
                }
              } else if (userMessage && userMessage.content.includes('Data:') && userMessage.content.includes('Question:')) {
                // Extract projection
                const dataPart = userMessage.content.split('Question:')[0].replace('Data:', '').trim();
                const questionPart = userMessage.content.split('Question:')[1].trim();
                const resultPart = parsed.messages.find(m => m.role === 'assistant')?.content || '';
                
                try {
                  const metricsData = JSON.parse(dataPart);
                  let projectionType = 'general';
                  
                  if (questionPart.toLowerCase().includes('valuation')) {
                    projectionType = 'valuation';
                  } else if (questionPart.toLowerCase().includes('growth')) {
                    projectionType = 'growth';
                  } else if (questionPart.toLowerCase().includes('profitability')) {
                    projectionType = 'profitability';
                  }
                  
                  parsedProjections.push({
                    metrics: metricsData,
                    projectionType,
                    question: questionPart,
                    result: resultPart
                  });
                } catch (e) {
                  console.error('Failed to parse projection from OpenAI format:', e);
                }
              }
            }
          } catch (e) {
            console.error('Error parsing JSONL line:', e);
          }
        }
      } else if (format === 'json') {
        // Parse JSON format
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
        
        if (parsedData.metrics) {
          parsedMetrics = parsedData.metrics;
        }
        
        if (parsedData.projections) {
          parsedProjections = parsedData.projections;
        }
      } else if (format === 'csv') {
        // Handle CSV format - this is complex with two sections
        const sections = data.split('\n\n');
        
        if (sections.length >= 1) {
          // Parse metrics section
          const metricsLines = sections[0].split('\n');
          if (metricsLines.length > 1) {
            const headers = metricsLines[0].split(',').map(h => h.trim());
            
            // Extract metrics
            for (let i = 1; i < metricsLines.length; i++) {
              const values = metricsLines[i].split(',');
              if (values.length === headers.length && values[0] === 'metric') {
                const metricData = {};
                
                // Map CSV values to object keys
                for (let j = 1; j < headers.length; j++) {
                  const headerName = headers[j];
                  const value = values[j];
                  
                  // Convert numeric values
                  if (!isNaN(value) && value.trim() !== '') {
                    metricData[headerName] = parseFloat(value);
                  } else if (value && value !== '""') {
                    // Remove quotes and add as string
                    metricData[headerName] = value.replace(/^"|"$/g, '');
                  }
                }
                
                parsedMetrics.push({
                  data: metricData,
                  classifications: {}
                });
              }
            }
          }
        }
        
        // Parse projections if available
        if (sections.length >= 2) {
          const projectionLines = sections[1].split('\n');
          if (projectionLines.length > 1) {
            for (let i = 1; i < projectionLines.length; i++) {
              const line = projectionLines[i];
              const match = line.match(/projection,([^,]*),("([^"]|"")*"|[^,]*),("([^"]|"")*"|[^,]*)/);
              
              if (match) {
                const projectionType = match[1];
                const question = match[2].replace(/^"|"$/g, '').replace(/""/g, '"');
                const result = match[3].replace(/^"|"$/g, '').replace(/""/g, '"');
                
                parsedProjections.push({
                  metrics: {}, // No metrics in CSV format for projections
                  projectionType,
                  question,
                  result
                });
              }
            }
          }
        }
      }
      
      // Calculate statistics
      const stats = {
        totalMetrics: parsedMetrics.length,
        totalProjections: parsedProjections.length,
        fiscalYears: [],
        hasRevenue: false,
        hasGrowth: false,
        hasMargins: false
      };
      
      // Extract fiscal years and check for key metrics
      for (const metricObj of parsedMetrics) {
        const data = metricObj.data;
        
        if (data.fiscal_year && !stats.fiscalYears.includes(data.fiscal_year)) {
          stats.fiscalYears.push(data.fiscal_year);
        }
        
        if (data.revenue !== undefined) {
          stats.hasRevenue = true;
        }
        
        if (data.growth_rate_yoy !== undefined) {
          stats.hasGrowth = true;
        }
        
        if (data.net_margin !== undefined || data.gross_margin !== undefined) {
          stats.hasMargins = true;
        }
      }
      
      // Sort fiscal years
      stats.fiscalYears.sort();
      
      setMetrics(parsedMetrics);
      setProjections(parsedProjections);
      setMetricStats(stats);
    } catch (error) {
      console.error('Error parsing data for finance viewer:', error);
      setMetrics([]);
      setProjections([]);
    }
  }, [data, format]);
  
  // Toggle expansion of a section
  const toggleItem = (id) => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };
  
  // Format financial values for display
  const formatFinancialValue = (value, key) => {
    if (value === undefined || value === null) {
      return 'N/A';
    }
    
    if (typeof value === 'number') {
      if (key.includes('margin') || key.includes('rate')) {
        // Format as percentage
        return `${(value * 100).toFixed(1)}%`;
      } else if (value >= 1000000) {
        // Format as millions
        return `${(value / 1000000).toFixed(1)}M`;
      } else if (value >= 1000) {
        // Format as thousands
        return `${(value / 1000).toFixed(1)}K`;
      } else {
        return `${value.toFixed(2)}`;
      }
    }
    
    return value;
  };
  
  // Helper to get metric classification badge
  const getClassificationBadge = (metricName, classifications) => {
    if (!classifications || !classifications[metricName]) {
      return null;
    }
    
    const label = classifications[metricName].label;
    
    switch(label) {
      case 'valuation_input':
        return <span className="px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">Valuation</span>;
      case 'cost_driver':
        return <span className="px-1.5 py-0.5 text-xs rounded-full bg-red-100 text-red-800">Cost</span>;
      case 'projection_basis':
        return <span className="px-1.5 py-0.5 text-xs rounded-full bg-green-100 text-green-800">Projection</span>;
      default:
        return null;
    }
  };
  
  // Helper to get projection type badge
  const getProjectionTypeBadge = (type) => {
    switch(type) {
      case 'valuation':
        return <span className="px-1.5 py-0.5 text-xs rounded-full bg-purple-100 text-purple-800">Valuation</span>;
      case 'growth':
        return <span className="px-1.5 py-0.5 text-xs rounded-full bg-green-100 text-green-800">Growth</span>;
      case 'profitability':
        return <span className="px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">Profitability</span>;
      default:
        return <span className="px-1.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-800">General</span>;
    }
  };
  
  // Metrics panel component
  const MetricsPanel = () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
      <div className="space-y-1">
        <div className="text-sm text-gray-500">Total Metrics</div>
        <div className="text-2xl font-semibold">{metricStats.totalMetrics}</div>
      </div>
      
      <div className="space-y-1">
        <div className="text-sm text-gray-500">Projections</div>
        <div className="text-2xl font-semibold">{metricStats.totalProjections}</div>
      </div>
      
      <div className="space-y-1">
        <div className="text-sm text-gray-500">Fiscal Years</div>
        <div className="text-lg font-semibold">
          {metricStats.fiscalYears.length > 0 
            ? metricStats.fiscalYears.join(', ') 
            : 'N/A'}
        </div>
      </div>
      
      <div className="space-y-1">
        <div className="text-sm text-gray-500">Key Metrics</div>
        <div className="flex flex-col text-sm">
          {metricStats.hasRevenue && (
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-green-500"></div>
              <span>Revenue Data</span>
            </div>
          )}
          {metricStats.hasGrowth && (
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-blue-500"></div>
              <span>Growth Metrics</span>
            </div>
          )}
          {metricStats.hasMargins && (
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-purple-500"></div>
              <span>Margin Data</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  
  // No data state
  if (!data || (metrics.length === 0 && projections.length === 0)) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5" />
            Financial Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-gray-400" />
            <p>No financial data available to display.</p>
            <p className="text-sm mt-2">Process a document to extract financial metrics.</p>
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
            Financial Analysis
          </div>
          <div className="flex space-x-2 text-sm bg-gray-100 rounded-md p-1">
            <button 
              className={`px-3 py-1 rounded ${viewMode === 'dashboard' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
              onClick={() => setViewMode('dashboard')}
            >
              Dashboard
            </button>
            <button 
              className={`px-3 py-1 rounded ${viewMode === 'metrics' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
              onClick={() => setViewMode('metrics')}
            >
              Metrics
            </button>
            <button 
              className={`px-3 py-1 rounded ${viewMode === 'projections' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
              onClick={() => setViewMode('projections')}
              disabled={projections.length === 0}
            >
              Projections
            </button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <MetricsPanel />
        
        {viewMode === 'dashboard' && (
          <div className="space-y-6">
            {/* Financial Metrics Summary */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" /> 
                Key Financial Metrics
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {metrics.slice(0, 6).map((metricObj, index) => {
                  const data = metricObj.data;
                  const fiscalPeriod = data.fiscal_year ? 
                    `${data.quarter ? data.quarter + ' ' : ''}FY${data.fiscal_year}` : 
                    'Current Period';
                    
                  return (
                    <div key={index} className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      <div className="p-3 bg-gray-50 border-b flex justify-between items-center">
                        <div className="font-medium truncate max-w-[80%]">
                          {fiscalPeriod}
                        </div>
                      </div>
                      
                      <div className="p-3">
                        <div className="space-y-2">
                          {Object.entries(data)
                            .filter(([key]) => key !== 'fiscal_year' && key !== 'quarter')
                            .map(([key, value], i) => (
                              <div key={i} className="flex justify-between items-center">
                                <div className="text-sm flex items-center gap-1">
                                  {key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                                  {getClassificationBadge(key, metricObj.classifications)}
                                </div>
                                <div className="font-semibold">
                                  {formatFinancialValue(value, key)}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {metrics.length > 6 && (
                <div className="text-center">
                  <button 
                    onClick={() => setViewMode('metrics')}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    View all {metrics.length} metric sets
                  </button>
                </div>
              )}
            </div>
            
            {/* Financial Projections Summary */}
            {projections.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-600" /> 
                  Financial Projections
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {projections.slice(0, 4).map((projection, index) => (
                    <div key={index} className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      <div className="p-3 bg-gray-50 border-b flex justify-between items-center">
                        <div className="font-medium truncate max-w-[80%] flex items-center gap-2">
                          {getProjectionTypeBadge(projection.projectionType)}
                          <span>Financial Projection</span>
                        </div>
                      </div>
                      
                      <div className="p-3">
                        <div className="mb-2 text-sm font-medium text-gray-700">
                          {projection.question}
                        </div>
                        <div className="text-sm bg-blue-50 p-3 rounded">
                          {projection.result}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {projections.length > 4 && (
                  <div className="text-center">
                    <button 
                      onClick={() => setViewMode('projections')}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      View all {projections.length} projections
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {viewMode === 'metrics' && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">All Financial Metrics</h3>
            
            {metrics.map((metricObj, index) => {
              const data = metricObj.data;
              const fiscalPeriod = data.fiscal_year ? 
                `${data.quarter ? data.quarter + ' ' : ''}FY${data.fiscal_year}` : 
                'Current Period';
                
              return (
                <div key={index} className="border rounded-lg overflow-hidden">
                  <div 
                    className="p-3 bg-gray-50 border-b cursor-pointer hover:bg-gray-100 flex justify-between items-center"
                    onClick={() => toggleItem(`metric-${index}`)}
                  >
                    <div className="font-medium">
                      {fiscalPeriod} Financial Metrics
                    </div>
                    <svg 
                      className={`w-5 h-5 text-gray-500 transform transition-transform ${expandedItems[`metric-${index}`] ? 'rotate-180' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24" 
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  
                  {expandedItems[`metric-${index}`] && (
                    <div className="p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {Object.entries(data)
                          .filter(([key]) => key !== 'fiscal_year' && key !== 'quarter')
                          .map(([key, value], i) => (
                            <div key={i} className="bg-gray-50 p-3 rounded">
                              <div className="flex justify-between items-center mb-1">
                                <div className="text-sm font-medium flex items-center gap-1">
                                  {key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                                  {getClassificationBadge(key, metricObj.classifications)}
                                </div>
                              </div>
                              <div className="text-xl font-semibold">
                                {formatFinancialValue(value, key)}
                              </div>
                              {metricObj.classifications && metricObj.classifications[key] && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {metricObj.classifications[key].reason}
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        {viewMode === 'projections' && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">All Financial Projections</h3>
            
            {projections.map((projection, index) => (
              <div key={index} className="border rounded-lg overflow-hidden">
                <div 
                  className="p-3 bg-gray-50 border-b cursor-pointer hover:bg-gray-100 flex justify-between items-center"
                  onClick={() => toggleItem(`projection-${index}`)}
                >
                  <div className="font-medium flex items-center gap-2">
                    {getProjectionTypeBadge(projection.projectionType)}
                    <span>{projection.question}</span>
                  </div>
                  <svg 
                    className={`w-5 h-5 text-gray-500 transform transition-transform ${expandedItems[`projection-${index}`] ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24" 
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                
                {expandedItems[`projection-${index}`] && (
                  <div className="p-4">
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-500 mb-2">Projection Result</h4>
                      <div className="text-sm bg-blue-50 p-3 rounded">
                        {projection.result}
                      </div>
                    </div>
                    
                    {Object.keys(projection.metrics).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 mb-2">Based On</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {Object.entries(projection.metrics)
                            .filter(([key]) => key !== 'fiscal_year' && key !== 'quarter')
                            .map(([key, value], i) => (
                              <div key={i} className="flex justify-between text-sm">
                                <span>{key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</span>
                                <span className="font-medium">{formatFinancialValue(value, key)}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FinanceDataViewer;
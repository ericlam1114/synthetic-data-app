// app/components/QADataViewer.js
import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Separator } from '../../components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { BarChart2, Info, AlertTriangle, MessageSquare, BookOpen } from 'lucide-react';

const QADataViewer = ({ data, format }) => {
  const [viewMode, setViewMode] = useState('list');
  const [expandedItems, setExpandedItems] = useState({});
  const [metrics, setMetrics] = useState({
    totalQuestions: 0,
    totalSections: 0,
    questionTypes: { factual: 0, procedural: 0, 'critical-thinking': 0 },
    difficultyLevels: { basic: 0, intermediate: 0, advanced: 0 }
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
          // For OpenAI JSONL format, extract the Q&A from messages
          const qaPairs = [];
          for (const item of parsedData) {
            if (item.messages && item.messages.length >= 3) {
              const systemMsg = item.messages[0]?.content || '';
              const question = item.messages[1]?.content || '';
              const answer = item.messages[2]?.content || '';
              
              if (question && answer) {
                qaPairs.push({
                  question,
                  answer,
                  questionType: item.questionType || 'factual',
                  difficultyLevel: item.difficultyLevel || 'basic',
                  sectionTitle: item.sectionTitle || 'Uncategorized',
                  classification: item.classification || 'Standard'
                });
              }
            }
          }
          parsedData = qaPairs;
        }
      } else if (format === 'json') {
        // Parse JSON format
        parsedData = typeof data === 'string' ? JSON.parse(data) : data;
      } else if (format === 'csv') {
        // Handle CSV format
        const lines = data.split('\n');
        if (lines.length > 1) {
          const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
          
          parsedData = lines.slice(1).map(line => {
            // Handle commas inside quoted strings
            const values = [];
            let inQuote = false;
            let currentValue = '';
            
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              
              if (char === '"') {
                inQuote = !inQuote;
              } else if (char === ',' && !inQuote) {
                values.push(currentValue.replace(/^"|"$/g, ''));
                currentValue = '';
              } else {
                currentValue += char;
              }
            }
            
            // Add the last value
            values.push(currentValue.replace(/^"|"$/g, ''));
            
            // Create object from headers and values
            const obj = {};
            headers.forEach((header, index) => {
              obj[header] = values[index] || '';
            });
            
            return obj;
          });
        }
      }
      
      // Calculate metrics
      const calculatedMetrics = {
        totalQuestions: parsedData.length,
        totalSections: new Set(parsedData.map(item => item.sectionTitle || 'Uncategorized')).size,
        questionTypes: { factual: 0, procedural: 0, 'critical-thinking': 0 },
        difficultyLevels: { basic: 0, intermediate: 0, advanced: 0 }
      };
      
      // Count question types and difficulty levels
      parsedData.forEach(qa => {
        const questionType = qa.questionType || 'factual';
        const difficultyLevel = qa.difficultyLevel || 'basic';
        
        calculatedMetrics.questionTypes[questionType] = 
          (calculatedMetrics.questionTypes[questionType] || 0) + 1;
          
        calculatedMetrics.difficultyLevels[difficultyLevel] = 
          (calculatedMetrics.difficultyLevels[difficultyLevel] || 0) + 1;
      });
      
      setMetrics(calculatedMetrics);
      
      // Group questions by section
      const sectionMap = {};
      parsedData.forEach(qa => {
        const sectionTitle = qa.sectionTitle || 'Uncategorized';
        
        if (!sectionMap[sectionTitle]) {
          sectionMap[sectionTitle] = [];
        }
        
        sectionMap[sectionTitle].push(qa);
      });
      
      // Initialize expanded state for all sections
      const initialExpandedState = {};
      Object.keys(sectionMap).forEach(title => {
        initialExpandedState[title] = false;
      });
      
      setExpandedItems(initialExpandedState);
      setQAPairs(parsedData);
      setSectionMap(sectionMap);
      
    } catch (error) {
      console.error('Error parsing data for QA viewer:', error);
    }
  }, [data, format]);
  
  const [qaPairs, setQAPairs] = useState([]);
  const [sectionMap, setSectionMap] = useState({});
  
  // Toggle expansion of a section
  const toggleSection = (sectionTitle) => {
    setExpandedItems(prev => ({
      ...prev,
      [sectionTitle]: !prev[sectionTitle]
    }));
  };
  
  // Helper function to get badge color based on question type
  const getQuestionTypeBadge = (type) => {
    switch (type) {
      case 'factual':
        return 'bg-blue-100 text-blue-800';
      case 'procedural':
        return 'bg-green-100 text-green-800';
      case 'critical-thinking':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  // Helper function to get badge color based on difficulty level
  const getDifficultyBadge = (level) => {
    switch (level) {
      case 'basic':
        return 'bg-green-100 text-green-800';
      case 'intermediate':
        return 'bg-amber-100 text-amber-800';
      case 'advanced':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  // Metrics panel component
  const MetricsPanel = () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
      <div className="space-y-1">
        <div className="text-sm text-gray-500">Total Q&A Pairs</div>
        <div className="text-2xl font-semibold">{metrics.totalQuestions}</div>
      </div>
      
      <div className="space-y-1">
        <div className="text-sm text-gray-500">Total Sections</div>
        <div className="text-2xl font-semibold">{metrics.totalSections}</div>
      </div>
      
      <div className="space-y-1">
        <div className="text-sm text-gray-500">Question Types</div>
        <div className="flex flex-col text-sm">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-blue-500"></div>
            <span>Factual: {metrics.questionTypes.factual || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <span>Procedural: {metrics.questionTypes.procedural || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-purple-500"></div>
            <span>Critical: {metrics.questionTypes['critical-thinking'] || 0}</span>
          </div>
        </div>
      </div>
      
      <div className="space-y-1">
        <div className="text-sm text-gray-500">Difficulty Levels</div>
        <div className="flex flex-col text-sm">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <span>Basic: {metrics.difficultyLevels.basic || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-amber-500"></div>
            <span>Intermediate: {metrics.difficultyLevels.intermediate || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-red-500"></div>
            <span>Advanced: {metrics.difficultyLevels.advanced || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
  
  // No data state
  if (!data) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5" />
            Q&A Pairs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-gray-400" />
            <p>No Q&A data available to display.</p>
            <p className="text-sm mt-2">Process a document to generate Q&A pairs.</p>
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
            Q&A Pairs
          </div>
          <div className="flex space-x-2 text-sm bg-gray-100 rounded-md p-1">
            <button 
              className={`px-3 py-1 rounded ${viewMode === 'list' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
              onClick={() => setViewMode('list')}
            >
              List View
            </button>
            <button 
              className={`px-3 py-1 rounded ${viewMode === 'card' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
              onClick={() => setViewMode('card')}
            >
              Card View
            </button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <MetricsPanel />
        
        <div className="space-y-6">
          {viewMode === 'list' ? (
            // List view - grouped by section
            <div className="space-y-4">
              {Object.entries(sectionMap).map(([sectionTitle, questions]) => (
                <div key={sectionTitle} className="border rounded-lg overflow-hidden">
                  <div 
                    className="p-3 bg-gray-50 border-b cursor-pointer hover:bg-gray-100 flex justify-between items-center"
                    onClick={() => toggleSection(sectionTitle)}
                  >
                    <div className="font-medium flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-gray-500" />
                      <span>{sectionTitle}</span>
                      <span className="text-sm text-gray-500">({questions.length} questions)</span>
                    </div>
                    <svg 
                      className={`w-5 h-5 text-gray-500 transform transition-transform ${expandedItems[sectionTitle] ? 'rotate-180' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24" 
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  
                  {expandedItems[sectionTitle] && (
                    <div className="divide-y">
                      {questions.map((qa, qaIndex) => (
                        <div key={qaIndex} className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`px-2 py-0.5 text-xs rounded-full ${getQuestionTypeBadge(qa.questionType)}`}>
                              {qa.questionType || 'factual'}
                            </div>
                            <div className={`px-2 py-0.5 text-xs rounded-full ${getDifficultyBadge(qa.difficultyLevel)}`}>
                              {qa.difficultyLevel || 'basic'}
                            </div>
                          </div>
                          
                          <div className="mb-2">
                            <div className="flex items-start gap-2">
                              <MessageSquare className="h-5 w-5 text-blue-500 mt-0.5" />
                              <div className="font-medium text-blue-700">
                                {qa.question}
                              </div>
                            </div>
                          </div>
                          
                          <div className="pl-7 text-gray-700">
                            {qa.answer}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            // Card view - show as individual cards
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {qaPairs.slice(0, 6).map((qa, index) => (
                <div key={index} className="border rounded-lg shadow-sm hover:shadow-md transition-shadow">
                  <div className="p-3 bg-gray-50 border-b flex justify-between items-center">
                    <div className="font-medium truncate max-w-[80%]">
                      {qa.sectionTitle || 'Section'}
                    </div>
                    <div className="flex gap-1">
                      <div className={`px-2 py-0.5 text-xs rounded-full ${getQuestionTypeBadge(qa.questionType)}`}>
                        {qa.questionType || 'factual'}
                      </div>
                      <div className={`px-2 py-0.5 text-xs rounded-full ${getDifficultyBadge(qa.difficultyLevel)}`}>
                        {qa.difficultyLevel || 'basic'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-3">
                    <div className="mb-2">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="h-5 w-5 text-blue-500 mt-0.5" />
                        <div className="font-medium text-blue-700">
                          {qa.question}
                        </div>
                      </div>
                    </div>
                    
                    <div className="pl-7 text-gray-700">
                      {qa.answer}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {viewMode === 'card' && qaPairs.length > 6 && (
            <div className="text-center">
              <button 
                onClick={() => setViewMode('list')}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                View all {qaPairs.length} Q&A pairs in list view
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default QADataViewer;
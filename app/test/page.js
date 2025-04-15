// app/test/page.js - Test page for error handling
'use client';

import React, { useState, useEffect } from 'react';
import { ProcessingStatus } from '../components/ProcessingStatus';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../components/ui/card';

export default function TestErrorHandling() {
  const [mockJob, setMockJob] = useState(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('initializing');
  const [message, setMessage] = useState('Preparing test environment');

  // Create a mock job with timeout errors
  const createMockTimeoutJob = () => {
    setProgress(0);
    setStage('initializing');
    setMessage('Initializing job with simulated timeouts');
    
    // Create mock job with timeouts
    setMockJob({
      id: 'test-timeout-' + Date.now(),
      status: 'processing',
      message: 'Processing document with timeouts',
      progress: 0,
      fileKey: 'test-document.pdf',
      pipelineType: 'finance',
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalPages: 10,
      currentPage: 0,
      resultPaths: [],
      hasTimeouts: true,
      timeoutCount: 2,
      errors: [
        {
          type: 'timeout',
          stage: 'extraction',
          message: 'AI model timeout during financial metrics extraction',
          timestamp: new Date().toISOString(),
          pageNum: 3
        },
        {
          type: 'timeout',
          stage: 'classification',
          message: 'AI model timeout during financial metrics classification',
          timestamp: new Date().toISOString(),
          pageNum: 7
        }
      ]
    });

    // Simulate progress
    simulateProgress('timeout');
  };

  // Create a mock job with processing errors
  const createMockErrorJob = () => {
    setProgress(0);
    setStage('initializing');
    setMessage('Initializing job with simulated errors');
    
    // Create mock job with errors
    setMockJob({
      id: 'test-error-' + Date.now(),
      status: 'processing',
      message: 'Processing document with errors',
      progress: 0,
      fileKey: 'test-document.pdf',
      pipelineType: 'finance',
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalPages: 10,
      currentPage: 0,
      resultPaths: [],
      lastError: 'Error parsing classification JSON: Unexpected token in JSON at position 423',
      lastErrorTime: new Date().toISOString(),
      errors: [
        {
          type: 'processing_error',
          stage: 'extraction',
          message: 'Error processing text chunk for financial data: invalid property reference',
          timestamp: new Date().toISOString(),
          pageNum: 2
        },
        {
          type: 'api_error',
          stage: 'classification',
          message: 'Error connecting to AI service: Request failed with status code 429',
          timestamp: new Date().toISOString(),
          pageNum: 5
        }
      ]
    });

    // Simulate progress
    simulateProgress('error');
  };

  // Create a completed job with warnings
  const createCompletedWithWarningsJob = () => {
    setProgress(0);
    setStage('initializing');
    setMessage('Initializing job that will complete with warnings');
    
    // Create mock job
    setMockJob({
      id: 'test-warnings-' + Date.now(),
      status: 'processing',
      message: 'Processing document that will have warnings',
      progress: 0,
      fileKey: 'test-document.pdf',
      pipelineType: 'finance',
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalPages: 10,
      currentPage: 0,
      resultPaths: [],
      hasTimeouts: true,
      timeoutCount: 3,
      errors: [
        {
          type: 'timeout',
          stage: 'extraction',
          message: 'AI model timeout during financial metrics extraction',
          timestamp: new Date().toISOString(),
          pageNum: 2
        },
        {
          type: 'timeout',
          stage: 'classification',
          message: 'AI model timeout during financial metrics classification',
          timestamp: new Date().toISOString(),
          pageNum: 4
        },
        {
          type: 'timeout',
          stage: 'projections',
          message: 'AI model timeout during valuation projection generation',
          timestamp: new Date().toISOString(),
          pageNum: 8
        }
      ]
    });

    // Simulate progress
    simulateProgress('completed_with_warnings');
  };

  // Create a failed job
  const createFailedJob = () => {
    setProgress(0);
    setStage('initializing');
    setMessage('Initializing job that will fail');
    
    // Create mock job
    setMockJob({
      id: 'test-failed-' + Date.now(),
      status: 'processing',
      message: 'Processing document that will fail',
      progress: 0,
      fileKey: 'test-document.pdf',
      pipelineType: 'finance',
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalPages: 10,
      currentPage: 0,
      resultPaths: [
        'tmp/jobs/test-failed/page_1.json',
        'tmp/jobs/test-failed/page_2.json'
      ],
      hasTimeouts: true,
      timeoutCount: 6,
      errors: [
        {
          type: 'timeout',
          stage: 'extraction',
          message: 'AI model timeout during financial metrics extraction',
          timestamp: new Date().toISOString(),
          pageNum: 1
        },
        {
          type: 'timeout',
          stage: 'extraction',
          message: 'AI model timeout during financial metrics extraction',
          timestamp: new Date().toISOString(),
          pageNum: 2
        },
        {
          type: 'timeout',
          stage: 'extraction',
          message: 'AI model timeout during financial metrics extraction',
          timestamp: new Date().toISOString(),
          pageNum: 3
        },
        {
          type: 'timeout',
          stage: 'extraction',
          message: 'AI model timeout during financial metrics extraction',
          timestamp: new Date().toISOString(),
          pageNum: 4
        },
        {
          type: 'timeout',
          stage: 'extraction',
          message: 'AI model timeout during financial metrics extraction',
          timestamp: new Date().toISOString(),
          pageNum: 5
        },
        {
          type: 'timeout',
          stage: 'extraction',
          message: 'AI model timeout during financial metrics extraction',
          timestamp: new Date().toISOString(),
          pageNum: 6
        }
      ]
    });

    // Simulate progress to failure
    simulateProgress('failed');
  };

  // Simulate job progress
  const simulateProgress = (finalState) => {
    let currentPage = 0;
    let currentProgress = 0;
    const intervalId = setInterval(() => {
      if (finalState === 'failed' && currentProgress >= 50) {
        // Fail the job
        setMockJob(prev => ({
          ...prev,
          status: 'failed',
          message: 'Too many timeouts (6 pages). Try processing a smaller document or simplifying content.',
          progress: currentProgress,
          currentPage,
          failureReason: 'excessive_timeouts',
          failed: new Date().toISOString()
        }));
        setStage('failed');
        setMessage('Too many timeouts (6 pages). Try processing a smaller document or simplifying content.');
        clearInterval(intervalId);
        return;
      }
      
      if (currentProgress >= 100) {
        // Complete the job
        setMockJob(prev => ({
          ...prev,
          status: finalState === 'completed_with_warnings' ? 'completed_with_warnings' : 'completed',
          message: finalState === 'completed_with_warnings' 
            ? 'Processing complete with 3 timeouts. Some content may be incomplete.' 
            : 'Processing complete',
          progress: 100,
          currentPage: 10,
          resultPaths: Array.from({length: 10}, (_, i) => `tmp/jobs/test/page_${i+1}.json`),
          outputKey: 'output/finance_test.jsonl',
          completed: new Date().toISOString()
        }));
        setProgress(100);
        setStage(finalState === 'completed_with_warnings' ? 'completed_with_warnings' : 'complete');
        setMessage(finalState === 'completed_with_warnings' 
          ? 'Processing complete with 3 timeouts. Some content may be incomplete.' 
          : 'Processing complete');
        clearInterval(intervalId);
        return;
      }
      
      // Increment progress
      currentProgress += 5;
      if (currentProgress > 50) {
        currentPage = Math.min(Math.floor((currentProgress - 50) / 5) + 1, 10);
      }
      
      // Update state based on progress
      let newStage = 'processing';
      if (currentProgress < 10) newStage = 'downloading';
      else if (currentProgress < 30) newStage = 'chunking';
      else if (currentProgress < 50) newStage = 'processing';
      else if (currentProgress < 60) newStage = 'extraction';
      else if (currentProgress < 70) newStage = 'classification';
      else if (currentProgress < 85) newStage = 'generation';
      else if (currentProgress < 90) newStage = 'merging';
      else newStage = 'formatting';
      
      setProgress(currentProgress);
      setStage(newStage);
      
      // Update message based on stage
      let newMessage = `Processing stage: ${newStage}`;
      if (newStage === 'processing') {
        newMessage = `Processing page ${currentPage} of 10`;
      } else if (newStage === 'extraction') {
        newMessage = 'Extracting financial metrics';
      } else if (newStage === 'classification') {
        newMessage = 'Classifying financial metrics';
      } else if (newStage === 'generation') {
        newMessage = 'Generating financial projections';
      }
      
      setMessage(newMessage);
      
      // Update mock job
      setMockJob(prev => ({
        ...prev,
        status: 'processing',
        message: newMessage,
        progress: currentProgress,
        currentPage,
        resultPaths: Array.from({length: currentPage}, (_, i) => `tmp/jobs/test/page_${i+1}.json`)
      }));
      
      // Add simulated timeout errors at specific points for timeout test
      if (finalState === 'timeout' || finalState === 'completed_with_warnings') {
        if (currentPage === 3) {
          setMessage('⚠️ Timeout on page 3. Continuing with next page...');
        } else if (currentPage === 7) {
          setMessage('⚠️ Timeout on page 7. Continuing with next page...');
        }
      }
      
      // Add simulated processing errors at specific points for error test
      if (finalState === 'error') {
        if (currentPage === 2) {
          setMessage('⚠️ Error on page 2. Continuing with next page...');
        } else if (currentPage === 5) {
          setMessage('⚠️ Error on page 5. Continuing with next page...');
        }
      }
    }, 1000);
    
    return () => clearInterval(intervalId);
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Error Handling Test Dashboard</h1>
      
      <div className="grid grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Job with Timeouts</CardTitle>
            <CardDescription>Test how the UI handles processing timeouts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-4">
              Simulates a job that encounters AI model timeouts but continues processing
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={createMockTimeoutJob}>Run Timeout Test</Button>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Job with Processing Errors</CardTitle>
            <CardDescription>Test how the UI handles general processing errors</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-4">
              Simulates a job that encounters API and processing errors
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={createMockErrorJob}>Run Error Test</Button>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Completed with Warnings</CardTitle>
            <CardDescription>Test a job that completes with warning messages</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-4">
              Simulates a job that completes successfully but had timeouts
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={createCompletedWithWarningsJob}>Run Completion Test</Button>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Failed Job</CardTitle>
            <CardDescription>Test a job that fails due to excessive timeouts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-4">
              Simulates a job that exceeds the maximum allowed timeouts
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={createFailedJob}>Run Failure Test</Button>
          </CardFooter>
        </Card>
      </div>
      
      {mockJob && (
        <div className="mt-8">
          <h2 className="text-2xl font-semibold mb-4">Job Status</h2>
          <ProcessingStatus 
            progress={progress} 
            stage={stage} 
            statusMessage={message}
            job={mockJob}
          />
        </div>
      )}
    </div>
  );
} 
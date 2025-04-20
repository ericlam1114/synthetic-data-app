import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from '../../components/ui/button'

function ResultsViewer({ results, format }) {
  const [viewMode, setViewMode] = useState('preview')
  const [expandedItems, setExpandedItems] = useState({})
  
  // Toggle item expansion
  const toggleItem = (index) => {
    setExpandedItems(prev => ({
      ...prev,
      [index]: !prev[index]
    }))
  }
  
  // Parse JSONL into array of objects
  const parseJsonl = (jsonlString) => {
    if (!jsonlString) return []
    
    // Split by newline and parse each line
    return jsonlString
      .split('\n')
      .filter(line => line.trim())
      .map((line, index) => {
        try {
          return JSON.parse(line)
        } catch (e) {
          return { error: `Could not parse line ${index + 1}`, line }
        }
      })
  }
  
  // Render content based on format and view mode
  const renderContent = () => {
    if (!results || !results.data) {
      return <p className="text-gray-500">No results to display</p>
    }
    
    // Handle raw view mode (just show the text)
    if (viewMode === 'raw') {
      return (
        <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-xs font-mono max-h-96">
          {results.data}
        </pre>
      )
    }
    
    // Handle preview mode
    if (format === 'jsonl' || format === 'openai-jsonl') {
      const parsedData = parseJsonl(results.data)
      
      return (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            {parsedData.length} items in JSONL format
          </p>
          
          {parsedData.map((item, index) => (
            <div key={index} className="border rounded-lg overflow-hidden">
              <div 
                className="flex justify-between items-center p-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
                onClick={() => toggleItem(index)}
              >
                <div className="font-medium">Item #{index + 1}</div>
                <svg 
                  className={`w-5 h-5 text-gray-500 transform transition-transform ${expandedItems[index] ? 'rotate-180' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7" 
                  />
                </svg>
              </div>
              
              {expandedItems[index] && (
                <div className="p-3 border-t">
                  <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
                    {JSON.stringify(item, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )
    } 
    
    // Handle JSON format
    if (format === 'json') {
      let parsedData
      try {
        parsedData = typeof results.data === 'string' 
          ? JSON.parse(results.data) 
          : results.data
      } catch (e) {
        return (
          <div className="bg-red-50 p-4 rounded-lg">
            <p className="text-red-700">Error parsing JSON: {e.message}</p>
            <pre className="mt-2 bg-gray-50 p-2 rounded text-xs overflow-x-auto">
              {results.data}
            </pre>
          </div>
        )
      }
      
      return (
        <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-xs font-mono max-h-96">
          {JSON.stringify(parsedData, null, 2)}
        </pre>
      )
    }
    
    // Handle CSV format
    if (format === 'csv') {
      const lines = results.data.split('\n')
      const headers = lines[0].split(',')
      
      return (
        <div className="bg-white rounded-lg border overflow-x-auto max-h-96">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {headers.map((header, i) => (
                  <th 
                    key={i}
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {header.replace(/"/g, '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {lines.slice(1).map((line, i) => {
                const cells = line.split(',').map(cell => cell.replace(/"/g, ''))
                return (
                  <tr key={i}>
                    {cells.map((cell, j) => (
                      <td key={j} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {cell}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )
    }
    
    // Default fallback
    return (
      <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-xs font-mono max-h-96">
        {results.data}
      </pre>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setViewMode('preview')}
            className={`px-3 py-1 text-sm rounded ${
              viewMode === 'preview' ? 'bg-black text-white' : 'bg-gray-100'
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => setViewMode('raw')}
            className={`px-3 py-1 text-sm rounded ${
              viewMode === 'raw' ? 'bg-black text-white' : 'bg-gray-100'
            }`}
          >
            Raw
          </button>
        </div>
      </div>
      
      {renderContent()}
      
      {results && results.data && (
        <div className="mt-6 flex justify-end">
          <Link href="/dashboard/datasets">
            <Button className="bg-black text-white hover:bg-black/90">
              View All Datasets
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}

export default ResultsViewer

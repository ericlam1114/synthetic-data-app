"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Code, Copy, Loader2, Bot, User, Terminal } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ModelPlayground = ({ modelId, provider, userId }) => {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { toast } = useToast();

  const handlePromptChange = (e) => {
    setPrompt(e.target.value);
  };

  const handleSendPrompt = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setError(null);
    setResponse(''); // Clear previous response

    console.log(`[Playground] Sending prompt for model: ${modelId}, provider: ${provider}`);

    try {
      const apiResponse = await fetch('/api/playground/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: modelId,
          provider: provider,
          prompt: prompt,
          // We don't send userId directly in body, backend gets it from session
        }),
      });

      const result = await apiResponse.json();

      if (!apiResponse.ok) {
        throw new Error(result.message || `API request failed with status ${apiResponse.status}`);
      }

      // Assuming the API returns the response text in a field like 'responseText' or similar
      setResponse(result.responseText || 'No response text received.'); 

    } catch (err) {
      console.error("[Playground] API Error:", err);
      setError(err.message);
      toast({ title: "Error Sending Prompt", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Code Snippet Generation ---
  const generateCodeSnippet = (lang) => {
    const apiKeyPlaceholder = provider === 'openai' ? 'YOUR_OPENAI_API_KEY' : 'YOUR_FIREWORKS_API_KEY';
    const chatEndpoint = provider === 'openai' 
        ? 'https://api.openai.com/v1/chat/completions' 
        : 'https://api.fireworks.ai/v1/chat/completions';
        
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKeyPlaceholder}`
    };
    
    const body = JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: "You are a helpful assistant." }, // Example system prompt
        { role: "user", content: prompt || "Your prompt here..." }
      ],
      max_tokens: 512, // Example parameter
    }, null, 2); // Pretty print JSON

    if (lang === 'javascript') {
      return `// Remember to replace with your actual API key, preferably from environment variables
fetch('${chatEndpoint}', {
  method: 'POST',
  headers: ${JSON.stringify(headers, null, 2)},
  body: ${body}
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));`;
    }

    if (lang === 'python') {
      return `import requests
import json
import os # Recommended: Load key from environment

url = "${chatEndpoint}"
headers = ${JSON.stringify(headers, null, 2)}
# Remember to replace with your actual API key, e.g., using os.environ.get('YOUR_API_KEY_ENV_VAR')
# headers['Authorization'] = f"Bearer {os.environ.get('YOUR_API_KEY_ENV_VAR')}"

payload = ${body}

response = requests.post(url, headers=headers, data=json.dumps(payload))

if response.ok:
    print(response.json())
else:
    print(f"Error: {response.status_code}")
    print(response.text)`;
    }
    
    if (lang === 'curl') {
         return `# Remember to replace with your actual API key
curl ${chatEndpoint} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${apiKeyPlaceholder}" \
  -d '${JSON.stringify(JSON.parse(body))}'`; // Compact JSON for curl
    }

    return 'Unsupported language';
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => toast({ title: "Code Copied!" }))
      .catch(err => {
          console.error('Failed to copy text: ', err);
          toast({ title: "Copy Failed", description: "Could not copy code to clipboard.", variant: "destructive" });
      });
  };
  
  const jsSnippet = generateCodeSnippet('javascript');
  const pySnippet = generateCodeSnippet('python');
  const curlSnippet = generateCodeSnippet('curl');

  return (
    <div className="flex flex-col h-full p-1">
      {/* Main Interaction Area - Allow growth */}
      <div className="flex-grow flex flex-col lg:flex-row gap-4 overflow-hidden mb-4">
        {/* Input Panel - Give more space */}
        <div className="lg:w-1/2 flex flex-col space-y-2">
          <Label htmlFor="prompt-input" className="flex items-center gap-1.5 font-medium"><User className="h-4 w-4"/> Your Prompt</Label>
          <Textarea
            id="prompt-input"
            placeholder="Enter your prompt here...\nShift+Enter for new line."
            value={prompt}
            onChange={handlePromptChange}
            className="flex-grow resize-none text-sm p-3 min-h-[150px] lg:min-h-0" // Let it grow
            // Optional: Add keydown listener for Shift+Enter if desired
          />
          <Button  onClick={handleSendPrompt} disabled={isLoading || !prompt.trim()} className="mt-auto bg-black"> {/* Stick button to bottom of this panel */} 
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
            Send Prompt
          </Button>
        </div>

        {/* Output Panel - Give more space */}
        <div className="lg:w-1/2 flex flex-col space-y-2">
          <Label htmlFor="response-output" className="flex items-center gap-1.5 font-medium"><Bot className="h-4 w-4"/> Model Response</Label>
          {/* Ensure ScrollArea takes up remaining space */} 
          <ScrollArea className="flex-grow border rounded-md p-3 bg-muted/50 min-h-[150px] lg:min-h-0"> 
            {isLoading && (
              <div className="flex items-center justify-center h-full">
                 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                 <span className="ml-2 text-muted-foreground">Generating...</span>
              </div>
            )}
            {!isLoading && response && (
              <pre className="text-sm whitespace-pre-wrap break-words">
                {response}
              </pre>
            )}
            {!isLoading && !response && !error && (
              <p className="text-sm text-muted-foreground italic text-center pt-4">Model response will appear here.</p>
            )}
             {!isLoading && error && (
               <p className="text-sm text-destructive">Error: {error}</p>
             )}
          </ScrollArea>
        </div>
      </div>

      {/* Code Snippets - Limit height, allow scroll */}
      <div className="border-t pt-4 flex-shrink-0">
         <h3 className="text-lg font-semibold mb-2 flex items-center gap-1.5"><Terminal className="h-5 w-5"/> API Usage Examples</h3>
         <p className="text-xs text-muted-foreground mb-3">Remember to replace the placeholder API key with your actual key.</p>
         {/* Limit overall height of Tabs container */}
         <div className="max-h-[250px] overflow-y-auto pr-2"> 
            <Tabs defaultValue="javascript" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-2 sticky top-0 bg-background z-10">
                    <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                    <TabsTrigger value="python">Python</TabsTrigger>
                    <TabsTrigger value="curl">cURL</TabsTrigger>
                </TabsList>
                
                <TabsContent value="javascript">
                    <div className="relative p-3 border rounded-md bg-muted/30">
                       <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6 z-20" onClick={() => copyToClipboard(jsSnippet)} title="Copy JavaScript code">
                          <Copy className="h-3.5 w-3.5"/>
                       </Button>
                       {/* No inner ScrollArea needed now */}
                       <pre className="text-xs whitespace-pre-wrap break-all">{jsSnippet}</pre>
                    </div>
                </TabsContent>
                <TabsContent value="python">
                   <div className="relative p-3 border rounded-md bg-muted/30">
                       <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6 z-20" onClick={() => copyToClipboard(pySnippet)} title="Copy Python code">
                          <Copy className="h-3.5 w-3.5"/>
                       </Button>
                       <pre className="text-xs whitespace-pre-wrap break-all">{pySnippet}</pre>
                    </div>
                </TabsContent>
                <TabsContent value="curl">
                    <div className="relative p-3 border rounded-md bg-muted/30">
                       <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6 z-20" onClick={() => copyToClipboard(curlSnippet)} title="Copy cURL command">
                          <Copy className="h-3.5 w-3.5"/>
                       </Button>
                       <pre className="text-xs whitespace-pre-wrap break-all">{curlSnippet}</pre>
                    </div>
                </TabsContent>
            </Tabs>
         </div>
      </div>
    </div>
  );
};

export default ModelPlayground; 
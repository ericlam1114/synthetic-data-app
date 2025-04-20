"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  CardDescription,
} from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Label } from "../../../components/ui/label";
import { Progress } from "../../../components/ui/progress";
import { Badge } from "../../../components/ui/badge";
import { MoreVertical, Play, Pause, RefreshCw, BarChart, Download, Trash } from "lucide-react";
import { useToast } from "../../../hooks/use-toast";

export default function ModelsPage() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState("");
  const [selectedModelType, setSelectedModelType] = useState("gpt-3.5-turbo");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Mock data for now - in a real app this would fetch from an API
  useEffect(() => {
    // Simulate loading delay
    const timer = setTimeout(() => {
      // Mock models
      const mockModels = [
        {
          id: "ft-001",
          name: "Custom Financial Assistant",
          baseModel: "gpt-3.5-turbo",
          createdAt: "2023-06-10T14:30:00Z",
          status: "completed",
          dataset: "Financial Statements Q1 2023",
          progress: 100,
        },
        {
          id: "ft-002",
          name: "Legal Contract Analyzer",
          baseModel: "gpt-3.5-turbo",
          createdAt: "2023-06-15T09:45:00Z",
          status: "training",
          dataset: "Legal Contracts Analysis",
          progress: 65,
        },
      ];
      
      // Mock datasets (same as in datasets page)
      const mockDatasets = [
        {
          id: "ds-001",
          name: "Financial Statements Q1 2023",
          format: "JSONL",
          recordCount: 256,
          status: "complete",
        },
        {
          id: "ds-002",
          name: "Legal Contracts Analysis",
          format: "CSV",
          recordCount: 128,
          status: "complete",
        },
        {
          id: "ds-003",
          name: "Medical Records Synthesis",
          format: "JSONL",
          recordCount: 512,
          status: "processing",
        },
      ];
      
      setModels(mockModels);
      setDatasets(mockDatasets.filter(d => d.status === "complete"));
      setIsLoading(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const handleStartFineTuning = () => {
    if (!apiKey) {
      toast({
        title: "API Key Required",
        description: "Please enter your OpenAI API key to start fine-tuning.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedDataset) {
      toast({
        title: "Dataset Required",
        description: "Please select a dataset to use for fine-tuning.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      const newModel = {
        id: `ft-${Math.floor(Math.random() * 1000)}`,
        name: `Custom Model (${datasets.find(d => d.id === selectedDataset)?.name})`,
        baseModel: selectedModelType,
        createdAt: new Date().toISOString(),
        status: "preparing",
        dataset: datasets.find(d => d.id === selectedDataset)?.name,
        progress: 0,
      };

      setModels([newModel, ...models]);
      setSelectedDataset("");
      setIsSubmitting(false);

      toast({
        title: "Fine-tuning started",
        description: "Your model is being prepared for training.",
      });
    }, 2000);
  };

  const handleDeleteModel = (modelId) => {
    setModels(models.filter(model => model.id !== modelId));
    toast({
      title: "Model deleted",
      description: `Model ${modelId} has been deleted.`,
    });
  };

  return (
    <div className="container mx-auto py-10 max-w-6xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Custom Models</h1>
      </div>

      <Tabs defaultValue="models" className="mb-8">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="models">Your Models</TabsTrigger>
          <TabsTrigger value="create">Fine-tune New Model</TabsTrigger>
        </TabsList>
        
        <TabsContent value="models">
          <Card>
            <CardHeader>
              <CardTitle>Your Fine-tuned Models</CardTitle>
              <CardDescription>
                Models trained on your datasets are listed here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center items-center py-10">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
                </div>
              ) : models.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-muted-foreground mb-6">You don't have any custom models yet.</p>
                  <Button variant="outline" onClick={() => document.querySelector('button[value="create"]').click()}>
                    Start fine-tuning your first model
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Base Model</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Dataset</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {models.map((model) => (
                        <TableRow key={model.id}>
                          <TableCell className="font-medium">{model.name}</TableCell>
                          <TableCell>{model.baseModel}</TableCell>
                          <TableCell>{formatDate(model.createdAt)}</TableCell>
                          <TableCell>{model.dataset}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge
                                variant={
                                  model.status === "completed" ? "success" : 
                                  model.status === "training" || model.status === "preparing" ? "warning" : 
                                  "destructive"
                                }
                              >
                                {model.status === "completed" ? "Completed" : 
                                 model.status === "training" ? "Training" : 
                                 model.status === "preparing" ? "Preparing" : 
                                 "Failed"}
                              </Badge>
                              {(model.status === "training" || model.status === "preparing") && (
                                <Progress value={model.progress} className="h-2 w-full" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="bg-white hover:bg-gray-100">
                                  <MoreVertical className="h-4 w-4" />
                                  <span className="sr-only">Open menu</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-white border shadow-lg">
                                {model.status === "completed" && (
                                  <DropdownMenuItem className="hover:bg-gray-100">
                                    <Play className="mr-2 h-4 w-4" />
                                    Use Model
                                  </DropdownMenuItem>
                                )}
                                {model.status === "training" && (
                                  <DropdownMenuItem className="hover:bg-gray-100">
                                    <Pause className="mr-2 h-4 w-4" />
                                    Pause Training
                                  </DropdownMenuItem>
                                )}
                                {model.status === "completed" && (
                                  <DropdownMenuItem className="hover:bg-gray-100">
                                    <BarChart className="mr-2 h-4 w-4" />
                                    View Metrics
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem 
                                  onClick={() => handleDeleteModel(model.id)} 
                                  className="hover:bg-gray-100"
                                >
                                  <Trash className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>Fine-tune a New Model</CardTitle>
              <CardDescription>
                Create a custom model by fine-tuning OpenAI models with your data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="apiKey">OpenAI API Key</Label>
                <div className="relative">
                  <input
                    id="apiKey"
                    type={showApiKey ? "text" : "password"}
                    className="w-full p-2 border rounded-md"
                    placeholder="Enter your OpenAI API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="absolute right-2 top-1/2 transform -translate-y-1/2"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Your API key is only used for this operation and not stored on our servers.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="modelType">Base Model</Label>
                <select
                  id="modelType"
                  className="w-full p-2 border rounded-md"
                  value={selectedModelType}
                  onChange={(e) => setSelectedModelType(e.target.value)}
                >
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Recommended)</option>
                  <option value="gpt-3.5-turbo-1106">GPT-3.5 Turbo 1106</option>
                  <option value="davinci-002">Davinci 002 (Legacy)</option>
                </select>
                <p className="text-sm text-muted-foreground">
                  Select the base model to fine-tune. Different models have different capabilities and costs.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataset">Dataset</Label>
                {datasets.length === 0 ? (
                  <div className="bg-gray-50 p-4 rounded-md">
                    <p className="text-muted-foreground mb-2">You don't have any completed datasets available for fine-tuning.</p>
                    <Link href="/dashboard/upload">
                      <Button variant="outline" size="sm">Create a dataset</Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    <select
                      id="dataset"
                      className="w-full p-2 border rounded-md"
                      value={selectedDataset}
                      onChange={(e) => setSelectedDataset(e.target.value)}
                    >
                      <option value="">Select a dataset</option>
                      {datasets.map((dataset) => (
                        <option key={dataset.id} value={dataset.id}>
                          {dataset.name} ({dataset.recordCount} records)
                        </option>
                      ))}
                    </select>
                    <p className="text-sm text-muted-foreground">
                      Choose one of your processed datasets to train the model.
                    </p>
                  </>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => document.querySelector('button[value="models"]').click()}>
                Cancel
              </Button>
              <Button 
                className="bg-black text-white hover:bg-black/90"
                onClick={handleStartFineTuning}
                disabled={isSubmitting || datasets.length === 0}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Start Fine-tuning"
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>API Endpoints</CardTitle>
          <CardDescription>
            Access your fine-tuned models programmatically using our API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">Completion Endpoint</h3>
              <div className="bg-gray-50 p-3 rounded-md font-mono text-sm">
                POST https://yourdomain.com/api/v1/models/{'{model_id}'}/completions
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Use this endpoint to generate text completions with your custom model.
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">Chat Completion Endpoint</h3>
              <div className="bg-gray-50 p-3 rounded-md font-mono text-sm">
                POST https://yourdomain.com/api/v1/models/{'{model_id}'}/chat/completions
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Use this endpoint for chat-based interactions with your custom model.
              </p>
            </div>

            <div className="pt-4 border-t">
              <p className="text-sm">
                <a href="#" className="text-blue-600 hover:underline">
                  View full API documentation →
                </a>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coming Soon: Additional Model Types</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-md">
              <h3 className="font-semibold mb-2">Mistral AI</h3>
              <p className="text-sm text-muted-foreground">
                Support for Mistral AI models is coming soon, enabling efficient fine-tuning for specialized tasks.
              </p>
            </div>

            <div className="p-4 border rounded-md">
              <h3 className="font-semibold mb-2">Custom Embeddings</h3>
              <p className="text-sm text-muted-foreground">
                Train domain-specific embedding models for better semantic search and retrieval.
              </p>
            </div>

            <div className="p-4 border rounded-md">
              <h3 className="font-semibold mb-2">Batch Predictions</h3>
              <p className="text-sm text-muted-foreground">
                Process large volumes of data with your custom models using our batch processing API.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

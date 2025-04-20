"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useToast } from "../../../hooks/use-toast";
import PipelineConfigForm from "../../components/PipelineConfigForm";
import ProcessingStatus from "../../components/ProcessingStatus";
import ResultsViewer from "../../components/ResultsViewer";
import DataCanvas from "../../components/DataCanvas";
import BatchUploader from "../../components/BatchUploader";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "../../../components/ui/card";
import { Progress } from "../../../components/ui/progress";
import FinanceSyntheticDataPipeline from "../../lib/FinanceSyntheticDataPipeline";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";
import { Button } from "../../../components/ui/button";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import PipelineSelector from "../../components/PipelineSelector";
import { Separator } from "../../../components/ui/separator";
import { Label } from "../../../components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { RadioGroup, RadioGroupItem } from "../../../components/ui/radio-group";
import { Checkbox } from "../../../components/ui/checkbox";
import { Info } from "lucide-react";
import { TooltipProvider } from "../../../components/ui/tooltip";

export default function UploadPage() {
  const { toast } = useToast();

  // Single file state (for backward compatibility)
  const [file, setFile] = useState(null);

  // Batch processing state
  const [files, setFiles] = useState([]);
  const [fileStatuses, setFileStatuses] = useState({});
  const [processingBatch, setProcessingBatch] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [styleFile, setStyleFile] = useState(null);
  const [styleFileKey, setStyleFileKey] = useState(null);
  const [styleSample, setStyleSample] = useState(null);

  // Combined results for batch processing
  const [combinedResults, setCombinedResults] = useState(null);

  // Pipeline configuration options
  const [outputFormat, setOutputFormat] = useState("openai-jsonl");
  const [classFilter, setClassFilter] = useState("all");
  const [prioritizeImportant, setPrioritizeImportant] = useState(true);
  const [pipelineType, setPipelineType] = useState("legal");

  // UI state
  const [activeTab, setActiveTab] = useState("single");

  // Add state variables to track file keys
  const [fileKey, setFileKey] = useState(null);
  const [textKey, setTextKey] = useState(null);
  const [outputKey, setOutputKey] = useState(null);

  // Function to cleanup files in storage
  const cleanupStorage = async (keys = []) => {
    try {
      // Collect all file keys from this session
      const allKeys = [...keys];

      // Add current file key if applicable
      if (fileKey) {
        allKeys.push(fileKey);
      }

      // Add text key if applicable
      if (textKey) {
        allKeys.push(textKey);
      }

      // Add output key if applicable
      if (outputKey) {
        allKeys.push(outputKey);
      }

      // Call the cleanup API
      if (allKeys.length > 0) {
        const response = await fetch("/api/cleanup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ keys: allKeys }),
        });

        if (!response.ok) {
          console.warn("Cleanup API returned an error:", await response.json());
        } else {
          console.log("Storage cleanup completed successfully");
        }
      }
    } catch (error) {
      console.error("Error cleaning up storage:", error);
      // Non-fatal error, don't throw
    }
  };

  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const handleLogin = (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Mock login - in a real app this would authenticate with a backend
    setTimeout(() => {
      setIsLoading(false);
      router.push("/dashboard");
    }, 1000);
  };
  
  const handleSignup = (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Mock signup - in a real app this would register with a backend
    setTimeout(() => {
      setIsLoading(false);
      router.push("/dashboard");
    }, 1000);
  };

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center py-12">
      <div className="mx-auto w-full max-w-md">
        <div className="flex flex-col items-center space-y-2 text-center mb-8">
          <h1 className="text-3xl font-bold">Synthetic Data Generator</h1>
          <p className="text-muted-foreground max-w-sm">
            Generate high-quality synthetic data from your documents for training, testing, and development.
          </p>
        </div>

        <Card className="w-full">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin}>
                <CardHeader>
                  <CardTitle className="text-center">Login to your account</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <input
                        id="email"
                        type="email"
                        placeholder="name@example.com"
                        className="w-full rounded-md border border-input px-3 py-2 text-sm"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        <Link href="#" className="text-xs underline text-primary">
                          Forgot password?
                        </Link>
                      </div>
                      <input
                        id="password"
                        type="password"
                        className="w-full rounded-md border border-input px-3 py-2 text-sm"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    type="submit" 
                    className="w-full bg-black text-white hover:bg-black/90"
                    disabled={isLoading}
                  >
                    {isLoading ? "Logging in..." : "Login"}
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignup}>
                <CardHeader>
                  <CardTitle className="text-center">Create an account</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="first-name">First name</Label>
                        <input
                          id="first-name"
                          type="text"
                          className="w-full rounded-md border border-input px-3 py-2 text-sm"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="last-name">Last name</Label>
                        <input
                          id="last-name"
                          type="text"
                          className="w-full rounded-md border border-input px-3 py-2 text-sm"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <input
                        id="signup-email"
                        type="email"
                        placeholder="name@example.com"
                        className="w-full rounded-md border border-input px-3 py-2 text-sm"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <input
                        id="signup-password"
                        type="password"
                        className="w-full rounded-md border border-input px-3 py-2 text-sm"
                        required
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col">
                  <Button 
                    type="submit" 
                    className="w-full bg-black text-white hover:bg-black/90"
                    disabled={isLoading}
                  >
                    {isLoading ? "Creating account..." : "Create account"}
                  </Button>
                  <p className="mt-4 text-xs text-center text-muted-foreground">
                    By creating an account, you agree to our{" "}
                    <Link href="#" className="underline text-primary">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="#" className="underline text-primary">
                      Privacy Policy
                    </Link>
                    .
                  </p>
                </CardFooter>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
        
        <div className="mt-8">
          <Separator className="my-4" />
          <div className="text-center text-sm text-muted-foreground">
            <p>Demo credentials:</p>
            <p className="font-medium">Email: demo@example.com | Password: demopassword</p>
          </div>
        </div>
      </div>
    </div>
  );
}

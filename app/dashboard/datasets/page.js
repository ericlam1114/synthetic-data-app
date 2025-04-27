"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  CardDescription 
} from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Separator } from "../../../components/ui/separator";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../../../components/ui/table";
import { Badge } from "../../../components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter, 
  DialogTrigger 
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "../../../components/ui/select";
import {
  AlertCircle, 
  Download, 
  Trash2, 
  FileText, 
  ChevronLeft, 
  AlertTriangle, 
  Database, 
  Loader2, 
  FileSearch,
  Pencil,
  Workflow,
  MoreHorizontal,
  XCircle,
  Combine,
  BrainCircuit,
  Ellipsis
} from "lucide-react";
import { useToast } from "../../../hooks/use-toast";
import { supabase } from "../../../lib/supabaseClient";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../components/ui/tooltip";

// Define available output formats for conversion
const availableFormats = [
  { value: 'openai-jsonl', label: 'OpenAI JSONL (GPT-3.5, GPT-4)' },
  { value: 'jsonl', label: 'Standard JSONL (Mistral, Llama, etc.)' },
];

export default function DatasetsPage() {
  const [user, setUser] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null); // ID of dataset being deleted
  const { toast } = useToast();
  const router = useRouter();

  // --- State for Modals ---
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState(null); // Dataset being edited/converted
  const [newName, setNewName] = useState("");
  const [targetFormat, setTargetFormat] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  // ------------------------

  // --- Effect to clear selected dataset when modals close ---
  useEffect(() => {
    // If both modals are closed, ensure selectedDataset is cleared
    if (!isRenameModalOpen && !isConvertModalOpen) {
      if (selectedDataset !== null) {
        console.log("[Effect] Clearing selected dataset as modals are closed.");
        setSelectedDataset(null);
      }
    }
  }, [isRenameModalOpen, isConvertModalOpen, selectedDataset]); // Add selectedDataset to dependencies
  // ---------------------------------------------------------

  // Format date helper function
  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { 
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Format file type for display
  const formatFileType = (format) => {
    if (!format) return 'Unknown';
    
    const formatMap = {
      'jsonl': 'JSONL',
      'openai-jsonl': 'OpenAI JSONL',
      'json': 'JSON',
      'csv': 'CSV'
    };
    
    return formatMap[format] || format.toUpperCase();
  };

  useEffect(() => {
    const loadDatasetsAndUser = async () => {
      try {
        // First get the authenticated user
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        
        if (authError) throw authError;
        
        if (!session || !session.user) {
          router.push('/');
          return;
        }
        
        setUser(session.user);
        
        // Then fetch datasets for this user
        const { data: datasetsData, error: datasetsError } = await supabase
          .from('datasets')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (datasetsError) throw datasetsError;
        
        setDatasets(datasetsData || []);
      } catch (error) {
        console.error('Error loading datasets:', error);
        toast({
          title: "Error Loading Datasets",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    
    loadDatasetsAndUser();
  }, [router, toast]);

  const handleDownload = (dataset) => {
    if (!dataset || !dataset.output_key) {
      toast({
        title: "Download Failed",
        description: "Output key is missing for this dataset",
        variant: "destructive",
      });
      return;
    }
    
    // Construct the download URL
    const downloadUrl = `/api/download?key=${encodeURIComponent(dataset.output_key)}`;
    
    // Use invisible link method for download
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `${dataset.name}.${dataset.format.split('-')[0]}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    toast({
      title: "Download Started",
      description: `Downloading ${dataset.name}...`,
    });
  };

  const handleDelete = async (datasetId) => {
    if (!datasetId) return;
    
    setDeleting(datasetId);
    
    try {
      // Delete the dataset record
      const response = await fetch(`/api/datasets?id=${datasetId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        // Try to get error message from response body, otherwise use status text
        let errorMsg = `Delete failed: ${response.status} ${response.statusText}`;
        try { 
          const errorBody = await response.json(); // Try JSON first
          errorMsg = errorBody.message || JSON.stringify(errorBody);
        } catch (e) {
          try { errorMsg = await response.text(); } catch (e2) { /* ignore */ }
        }
        throw new Error(errorMsg);
      }
      
      // If response is ok (e.g., 200 or 204), proceed without parsing JSON
      
      // Update local state
      setDatasets(datasets.filter(d => d.id !== datasetId));
      
      toast({
        title: "Dataset Deleted",
        description: "The dataset has been removed successfully.",
      });
    } catch (error) {
      console.error('Error deleting dataset:', error);
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
    }
  };

  const handlePrepareData = (dataset) => {
    if (!dataset || !dataset.output_key) {
      toast({ title: "Error", description: "Dataset output key is missing.", variant: "destructive" });
      return;
    }
    router.push(`/dashboard/prepare-data?outputKeys=${encodeURIComponent(dataset.output_key)}&datasetFormat=${encodeURIComponent(dataset.format)}`);
  };

  // --- Add handler for Fine-tune Button --- 
  const handleFineTuneClick = (dataset) => {
      if (!dataset || !dataset.output_key || !dataset.format || !dataset.id) {
          toast({ title: "Cannot Fine-tune", description: "Dataset ID, key or format is missing.", variant: "warning" });
          return;
      }
       // Navigate to the new fine-tune page, passing key, format, AND ID
       router.push(`/dashboard/fine-tune/new?outputKeys=${encodeURIComponent(dataset.output_key)}&datasetFormat=${encodeURIComponent(dataset.format)}&datasetId=${encodeURIComponent(dataset.id)}`);
  };
  // -----------------------------------------

  // --- Modal Open Handlers ---
  const openRenameModal = (dataset) => {
    setSelectedDataset(dataset);
    setNewName(dataset.name); // Pre-fill with current name
    setIsRenameModalOpen(true);
  };

  const openConvertModal = (dataset) => {
    setSelectedDataset(dataset);
    setTargetFormat(''); // Reset target format
    setIsConvertModalOpen(true);
  };
  // -------------------------

  // --- Modal Submit Handlers (Placeholder) ---
  const handleRenameSubmit = async () => {
    if (!selectedDataset || !newName.trim() || newName.trim() === selectedDataset.name) return;
    
    setIsRenaming(true);
    try {
      const response = await fetch('/api/datasets', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          id: selectedDataset.id, 
          name: newName.trim() 
        }),
      });

      if (!response.ok) {
        let errorMsg = `Rename failed: ${response.status}`;
        try { errorMsg = (await response.json()).message || errorMsg; } catch(e){ /* ignore */ }
        throw new Error(errorMsg);
      }
      
      const updatedDataset = await response.json();

      // Update local state
      setDatasets(prevDatasets => 
        prevDatasets.map(d => 
          d.id === selectedDataset.id ? { ...d, name: updatedDataset.name } : d
        )
      );
      
      toast({ title: "Dataset Renamed", description: `Successfully renamed to "${updatedDataset.name}".` });
      setIsRenameModalOpen(false);
      setSelectedDataset(null); // Clear selection

    } catch (error) {
      console.error('Error renaming dataset:', error);
      toast({ title: "Rename Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsRenaming(false);
    }
  };

  const handleConvertSubmit = async () => {
    if (!selectedDataset || !targetFormat || targetFormat === selectedDataset.format) return;
    
    setIsConverting(true);
    try {
      console.log(`[Client] Calling convert API for dataset ${selectedDataset.id} to ${targetFormat}`);
      const response = await fetch('/api/datasets/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          id: selectedDataset.id, 
          targetFormat: targetFormat
        }),
      });

      if (!response.ok) {
        let errorMsg = `Conversion failed: ${response.status}`;
        try { 
            const errBody = await response.json();
            errorMsg = errBody.message || JSON.stringify(errBody);
        } catch(e){ 
            try { errorMsg = await response.text(); } catch(e2) { /* ignore */ }
        }
        throw new Error(errorMsg);
      }
      
      const updatedDataset = await response.json();

      // Update local state
      setDatasets(prevDatasets => 
        prevDatasets.map(d => 
          d.id === selectedDataset.id 
            ? { ...d, format: updatedDataset.format, output_key: updatedDataset.output_key } 
            : d
        )
      );
      
      toast({ title: "Conversion Successful", description: `Dataset converted to ${formatFileType(updatedDataset.format)}.` });
      setIsConvertModalOpen(false);
      setSelectedDataset(null); // Clear selection

    } catch (error) {
      console.error('Error converting dataset:', error);
      toast({ title: "Conversion Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsConverting(false);
    }
  };
  // ------------------------------------------

  if (loading) {
    return (
      <div className="container mx-auto py-10 max-w-5xl flex items-center justify-center min-h-[60vh]">
        <Card className="w-full text-center">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
              <p className="text-muted-foreground">Loading your datasets...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider>
      {/* <div className="container mx-auto py-10 max-w-5xl"> */}
      <div className="container mx-auto  max-w-5xl">
            <Button variant="outline" onClick={() => router.push('/dashboard')} className="gap-2 mb-6">
            <ChevronLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Database className="h-7 w-7" />
              Your Datasets
            </h1>
            <p className="text-muted-foreground mt-1">
              View and manage your synthetic data files
            </p>
          </div>
          
      </div>

        {datasets.length === 0 ? (
          <Card className="w-full text-center py-10">
        <CardContent>
              <div className="flex flex-col items-center gap-4">
                <AlertTriangle className="h-12 w-12 text-muted-foreground" />
                <div>
                  <h2 className="text-xl font-semibold">No Datasets Found</h2>
                  <p className="text-muted-foreground mt-1">
                    You have&apos;t created any datasets yet.
                  </p>
            </div>
              <Link href="/dashboard/upload">
                  <Button className="mt-4 bg-black text-white hover:bg-black/90">
                    Upload Files
                  </Button>
              </Link>
            </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Your Saved Datasets</CardTitle>
              <CardDescription>
                You have {datasets.length} saved {datasets.length === 1 ? 'dataset' : 'datasets'}.
              </CardDescription>
            </CardHeader>
            <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                      <TableHead className="hidden md:table-cell">Created</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                    {datasets.map((dataset) => {
                        const isFineTuneDisabled = dataset.format !== 'jsonl' && dataset.format !== 'openai-jsonl';
                        const fineTuneTooltipText = isFineTuneDisabled
                          ? `Fine-tuning requires JSONL or OpenAI-JSONL format (dataset is ${formatFileType(dataset.format)})`
                          : "Start a fine-tuning job with this dataset";
                        const isDeleting = deleting === dataset.id;

                        return (
                    <TableRow key={dataset.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <span className="truncate max-w-[150px] sm:max-w-[200px] md:max-w-[250px]" title={dataset.name}>
                                  {dataset.name}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {formatDate(dataset.created_at)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {formatFileType(dataset.format)}
                              </Badge>
                            </TableCell>
                      <TableCell className="text-right">
                              <div className="hidden md:flex justify-end items-center gap-1.5">
                                <Tooltip>
                                   <TooltipTrigger asChild>
                                      <span tabIndex={isFineTuneDisabled ? 0 : -1}>
                                         <Button
                                           size="sm"
                                           className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                           onClick={() => handleFineTuneClick(dataset)}
                                           disabled={isFineTuneDisabled}
                                           aria-label={fineTuneTooltipText}
                                         >
                                           <BrainCircuit className="h-4 w-4 mr-1.5" />
                                           Fine-tune
                                         </Button>
                                      </span>
                                   </TooltipTrigger>
                                   <TooltipContent><p>{fineTuneTooltipText}</p></TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                   <TooltipTrigger asChild>
                                      <Button variant="outline" size="sm" onClick={() => handlePrepareData(dataset)}>
                                         <FileSearch className="h-4 w-4 mr-1.5" />
                                         Inspect / Edit
                                      </Button>
                                   </TooltipTrigger>
                                   <TooltipContent><p>Inspect content and prepare for fine-tuning</p></TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                   <TooltipTrigger asChild>
                                      <Button variant="outline" size="sm" onClick={() => handleDownload(dataset)}>
                                         <Download className="h-4 w-4 mr-1.5" />
                                         Download
                                      </Button>
                                   </TooltipTrigger>
                                   <TooltipContent><p>Download Dataset File</p></TooltipContent>
                                </Tooltip>

                                <DropdownMenu>
                                   <Tooltip>
                                      <TooltipTrigger asChild>
                                         <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                               <Ellipsis className="h-4 w-4" />
                                                <span className="sr-only">More actions</span>
                                            </Button>
                                         </DropdownMenuTrigger>
                                      </TooltipTrigger>
                                      <TooltipContent><p>More actions</p></TooltipContent>
                                   </Tooltip>
                                    <DropdownMenuContent align="end">
                                        <Dialog open={isRenameModalOpen && selectedDataset?.id === dataset.id} onOpenChange={setIsRenameModalOpen}>
                                            <DialogTrigger asChild>
                                                <DropdownMenuItem onSelect={(e) => {e.preventDefault(); openRenameModal(dataset);}} className="cursor-pointer">
                                                     <Pencil className="mr-2 h-4 w-4" />
                                                     Rename
                                                </DropdownMenuItem>
                                           </DialogTrigger>
                                           <DialogContent>
                                               <DialogHeader>
                                                   <DialogTitle>Rename Dataset</DialogTitle>
                                                   <DialogDescription>
                                                       Current name: <span className="font-medium">{dataset.name}</span>
                                                   </DialogDescription>
                                               </DialogHeader>
                                               <div className="grid gap-4 py-4">
                                                   <div className="grid grid-cols-4 items-center gap-4">
                                                       <Label htmlFor={`new-name-${dataset.id}`} className="text-right">
                                                           New Name
                                                       </Label>
                                                       <Input
                                                           id={`new-name-${dataset.id}`}
                                                           value={selectedDataset?.id === dataset.id ? newName : dataset.name}
                                                           onChange={(e) => setNewName(e.target.value)}
                                                           className="col-span-3"
                                                           disabled={isRenaming}
                                                       />
                                                   </div>
                                               </div>
                                               <DialogFooter>
                                                   <Button variant="outline" onClick={() => setIsRenameModalOpen(false)} disabled={isRenaming}>Cancel</Button>
                                                   <Button onClick={handleRenameSubmit} disabled={isRenaming || !newName.trim() || newName === dataset.name}>
                                                       {isRenaming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                       {isRenaming ? 'Saving...' : 'Save Name'}
                                                   </Button>
                                               </DialogFooter>
                                           </DialogContent>
                                        </Dialog>
                                        
                                        <Dialog open={isConvertModalOpen && selectedDataset?.id === dataset.id} onOpenChange={setIsConvertModalOpen}>
                                            <DialogTrigger asChild>
                                                <DropdownMenuItem onSelect={(e) => {e.preventDefault(); openConvertModal(dataset);}} className="cursor-pointer">
                                                     <Combine className="mr-2 h-4 w-4" />
                                                     Convert Format
                                                </DropdownMenuItem>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>Convert Dataset Format</DialogTitle>
                                                    <DialogDescription>
                                                        Convert &quot;<span className="font-medium">{dataset.name}</span>&quot; from <Badge variant="secondary">{formatFileType(dataset.format)}</Badge> format.
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <div className="grid gap-4 py-4">
                                                    <div className="grid grid-cols-4 items-center gap-4">
                                                        <Label htmlFor={`target-format-${dataset.id}`} className="text-right">
                                                            Target Format
                                                        </Label>
                                                        <Select 
                                                            value={selectedDataset?.id === dataset.id ? targetFormat : ''}
                                                            onValueChange={setTargetFormat}
                                                            disabled={isConverting}
                                                        >
                                                            <SelectTrigger id={`target-format-${dataset.id}`} className="col-span-3">
                                                                <SelectValue placeholder="Select new format" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {availableFormats.map(format => (
                                                                    <SelectItem key={format.value} value={format.value} disabled={format.value === dataset.format}>
                                                                        {format.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                <DialogFooter>
                                                    <Button variant="outline" onClick={() => setIsConvertModalOpen(false)} disabled={isConverting}>Cancel</Button>
                                                    <Button 
                                                        onClick={handleConvertSubmit} 
                                                        disabled={isConverting || !targetFormat || targetFormat === dataset.format}
                                                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                                    >
                                                        {isConverting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                        {isConverting ? 'Converting...' : 'Start Conversion'}
                                                    </Button>
                                                </DialogFooter>
                                            </DialogContent>
                                         </Dialog>
                                        
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem 
                                            onClick={() => handleDelete(dataset.id)} 
                                            disabled={isDeleting}
                                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                         >
                                             {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                            <span>Delete</span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                              </div>

                              <div className="md:hidden">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                                         <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <Ellipsis className="h-4 w-4" />
                                             <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                                     <DropdownMenuContent align="end">
                                         <Tooltip>
                                           <TooltipTrigger asChild>
                                              <span className={isFineTuneDisabled ? "cursor-not-allowed" : ""}>
                                                 <DropdownMenuItem
                                                   onClick={() => handleFineTuneClick(dataset)}
                                                   disabled={isFineTuneDisabled}
                                                   className={isFineTuneDisabled ? "text-muted-foreground" : ""}
                                                 >
                                                   <BrainCircuit className="mr-2 h-4 w-4" />
                                                   Fine-tune
                                                 </DropdownMenuItem>
                                              </span>
                                           </TooltipTrigger>
                                           <TooltipContent><p>{fineTuneTooltipText}</p></TooltipContent>
                                        </Tooltip>
                                         <DropdownMenuItem onClick={() => handlePrepareData(dataset)} className="cursor-pointer">
                                             <FileSearch className="mr-2 h-4 w-4" />
                                             Inspect / Edit
                                         </DropdownMenuItem>
                                         <DropdownMenuItem onClick={() => handleDownload(dataset)} className="cursor-pointer">
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                                         <DropdownMenuSeparator />
                                         <Dialog open={isRenameModalOpen && selectedDataset?.id === dataset.id} onOpenChange={setIsRenameModalOpen}>
                                             <DialogTrigger asChild>
                                                  <DropdownMenuItem onSelect={(e) => {e.preventDefault(); openRenameModal(dataset);}} className="cursor-pointer">
                                                      <Pencil className="mr-2 h-4 w-4" />
                                                      Rename
                                                 </DropdownMenuItem>
                                             </DialogTrigger>
                                             <DialogContent>
                                                 <DialogHeader>
                                                     <DialogTitle>Rename Dataset</DialogTitle>
                                                     <DialogDescription>
                                                         Current name: <span className="font-medium">{dataset.name}</span>
                                                     </DialogDescription>
                                                 </DialogHeader>
                                                 <div className="grid gap-4 py-4">
                                                     <div className="grid grid-cols-4 items-center gap-4">
                                                         <Label htmlFor={`new-name-${dataset.id}`} className="text-right">
                                                             New Name
                                                         </Label>
                                                         <Input
                                                             id={`new-name-${dataset.id}`}
                                                             value={selectedDataset?.id === dataset.id ? newName : dataset.name}
                                                             onChange={(e) => setNewName(e.target.value)}
                                                             className="col-span-3"
                                                             disabled={isRenaming}
                                                         />
                                                     </div>
                                                 </div>
                                                 <DialogFooter>
                                                     <Button variant="outline" onClick={() => setIsRenameModalOpen(false)} disabled={isRenaming}>Cancel</Button>
                                                     <Button onClick={handleRenameSubmit} disabled={isRenaming || !newName.trim() || newName === dataset.name}>
                                                         {isRenaming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                         {isRenaming ? 'Saving...' : 'Save Name'}
                                                     </Button>
                                                 </DialogFooter>
                                             </DialogContent>
                                         </Dialog>
                                         <Dialog open={isConvertModalOpen && selectedDataset?.id === dataset.id} onOpenChange={setIsConvertModalOpen}>
                                             <DialogTrigger asChild>
                                                 <DropdownMenuItem onSelect={(e) => {e.preventDefault(); openConvertModal(dataset);}} className="cursor-pointer">
                                                      <Combine className="mr-2 h-4 w-4" />
                                                      Convert Format
                                                 </DropdownMenuItem>
                                             </DialogTrigger>
                                             <DialogContent>
                                                 <DialogHeader>
                                                     <DialogTitle>Convert Dataset Format</DialogTitle>
                                                     <DialogDescription>
                                                         Convert &quot;<span className="font-medium">{dataset.name}</span>&quot; from <Badge variant="secondary">{formatFileType(dataset.format)}</Badge> format.
                                                     </DialogDescription>
                                                 </DialogHeader>
                                                 <div className="grid gap-4 py-4">
                                                     <div className="grid grid-cols-4 items-center gap-4">
                                                         <Label htmlFor={`target-format-${dataset.id}`} className="text-right">
                                                             Target Format
                                                         </Label>
                                                         <Select 
                                                             value={selectedDataset?.id === dataset.id ? targetFormat : ''}
                                                             onValueChange={setTargetFormat}
                                                             disabled={isConverting}
                                                         >
                                                             <SelectTrigger id={`target-format-${dataset.id}`} className="col-span-3">
                                                                 <SelectValue placeholder="Select new format" />
                                                             </SelectTrigger>
                                                             <SelectContent>
                                                                 {availableFormats.map(format => (
                                                                     <SelectItem key={format.value} value={format.value} disabled={format.value === dataset.format}>
                                                                         {format.label}
                                                                     </SelectItem>
                                                                 ))}
                                                             </SelectContent>
                                                         </Select>
                                                     </div>
                                                 </div>
                                                 <DialogFooter>
                                                     <Button variant="outline" onClick={() => setIsConvertModalOpen(false)} disabled={isConverting}>Cancel</Button>
                                                     <Button 
                                                         onClick={handleConvertSubmit} 
                                                         disabled={isConverting || !targetFormat || targetFormat === dataset.format}
                                                         className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                                     >
                                                         {isConverting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                         {isConverting ? 'Converting...' : 'Start Conversion'}
                                                     </Button>
                                                 </DialogFooter>
                                             </DialogContent>
                                         </Dialog>
                                         <DropdownMenuSeparator />
                                         <DropdownMenuItem 
                                             onClick={() => handleDelete(dataset.id)} 
                                             disabled={isDeleting}
                                             className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                          >
                                             {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                             <span>Delete</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                              </div>
                      </TableCell>
                    </TableRow>
                        );
                    })}
                </TableBody>
              </Table>
            </div>
        </CardContent>
      </Card>
        )}
    </div>
    </TooltipProvider>
  );
}

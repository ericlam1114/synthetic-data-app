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
  XCircle
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

// Define available output formats for conversion
const availableFormats = [
  { value: 'openai-jsonl', label: 'OpenAI JSONL' },
  { value: 'jsonl', label: 'Standard JSONL' },
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV' },
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
      const { error } = await fetch(`/api/datasets?id=${datasetId}`, {
        method: 'DELETE',
      }).then(res => {
        if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
        return res.json();
      });
      
      if (error) throw error;
      
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
    router.push(`/dashboard/prepare-data?outputKeys=${encodeURIComponent(dataset.output_key)}`);
  };

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
    <div className="container mx-auto py-10 max-w-5xl">
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
        <Button variant="outline" onClick={() => router.push('/dashboard')} className="gap-2">
          <ChevronLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
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
                  {datasets.map((dataset) => (
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
                        <div className="hidden md:flex justify-end gap-2">
                          <Dialog open={isRenameModalOpen && selectedDataset?.id === dataset.id} onOpenChange={setIsRenameModalOpen}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => openRenameModal(dataset)} title="Rename Dataset">
                                <Pencil className="h-4 w-4" />
                              </Button>
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
                               <Button variant="outline" size="sm" onClick={() => openConvertModal(dataset)} title="Convert Format">
                                 <Workflow className="h-4 w-4" />
                               </Button>
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
                          <Button variant="outline" size="sm" onClick={() => handlePrepareData(dataset)} title="Inspect & Prepare Data">
                            <FileSearch className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDownload(dataset)} title="Download Dataset">
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="text-destructive border-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(dataset.id)}
                            disabled={deleting === dataset.id}
                            title="Delete Dataset"
                          >
                            {deleting === dataset.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </div>

                        <div className="md:hidden">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openRenameModal(dataset)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                <span>Rename</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openConvertModal(dataset)}>
                                <Workflow className="mr-2 h-4 w-4" />
                                <span>Convert Format</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handlePrepareData(dataset)}>
                                <FileSearch className="mr-2 h-4 w-4" />
                                <span>Inspect</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDownload(dataset)}>
                                <Download className="mr-2 h-4 w-4" />
                                <span>Download</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => handleDelete(dataset.id)} 
                                disabled={deleting === dataset.id}
                                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                              >
                                {deleting === dataset.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="mr-2 h-4 w-4" />
                                )}
                                <span>Delete</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t pt-6">
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              Back to Dashboard
            </Button>
            <Link href="/dashboard/upload">
              <Button className="bg-black text-white hover:bg-black/90">
                Upload New Files
              </Button>
            </Link>
          </CardFooter>
        </Card>
      )}

    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
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
import { Download, MoreVertical, Eye, Trash, Edit } from "lucide-react";
import { useToast } from "../../../hooks/use-toast";
import { Badge } from "../../../components/ui/badge";

export default function DatasetsPage() {
  const { toast } = useToast();
  const [datasets, setDatasets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch datasets from API
  useEffect(() => {
    const fetchDatasets = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/datasets");
        if (!response.ok) {
          throw new Error("Failed to fetch datasets");
        }
        const data = await response.json();
        setDatasets(data);
      } catch (error) {
        console.error("Error fetching datasets:", error);
        toast({
          title: "Error",
          description: "Could not load datasets. Please try again later.",
          variant: "destructive",
        });
        setDatasets([]); // Clear datasets on error
      } finally {
        setIsLoading(false);
      }
    };

    fetchDatasets();
  }, [toast]);

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

  const handleDownload = (outputKey) => {
    if (!outputKey) {
      toast({
        title: "Download Error",
        description: "Dataset key is missing. Cannot start download.",
        variant: "destructive",
      });
      return;
    }
    
    // Construct the download URL
    const downloadUrl = `/api/download?key=${encodeURIComponent(outputKey)}`;
    
    // Use the invisible link method to trigger download
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    toast({
      title: "Download started",
      description: `Your file is being downloaded.`,
    });
  };

  const handleDelete = async (datasetId) => {
    if (!window.confirm("Are you sure you want to delete this dataset? This will remove all associated data.")) {
      return;
    }

    try {
      const response = await fetch(`/api/datasets/${datasetId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete dataset");
      }

      // Remove dataset from local state
      setDatasets(datasets.filter(dataset => dataset.id !== datasetId));
      
      toast({
        title: "Dataset deleted",
        description: `Dataset has been successfully deleted.`,
      });
    } catch (error) {
      console.error("Error deleting dataset:", error);
      toast({
        title: "Delete Error",
        description: error.message || "Could not delete dataset. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto py-10 max-w-6xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Your Datasets</h1>
        <Link href="/dashboard/upload">
          <Button className="bg-black text-white hover:bg-black/90">
            Create New Dataset
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Synthetic Datasets</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-10">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
            </div>
          ) : datasets.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-muted-foreground mb-6">You don't have any datasets yet.</p>
              <Link href="/dashboard/upload">
                <Button variant="outline">Upload a document to create your first dataset</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datasets.map((dataset) => (
                    <TableRow key={dataset.id}>
                      <TableCell className="font-medium">{dataset.name || `Dataset ${dataset.id}`}</TableCell>
                      <TableCell>{formatDate(dataset.createdAt)}</TableCell>
                      <TableCell>{dataset.format}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="bg-white hover:bg-gray-100">
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white border shadow-lg">
                            <DropdownMenuItem onClick={() => handleDownload(dataset.outputKey)} className="hover:bg-gray-100">
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(dataset.id)} className="hover:bg-gray-100 text-red-600 focus:text-red-600 focus:bg-red-50">
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
    </div>
  );
}

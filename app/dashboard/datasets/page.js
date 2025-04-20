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

  // Mock data for now - in a real app this would fetch from an API
  useEffect(() => {
    // Simulate loading delay
    const timer = setTimeout(() => {
      // Mock datasets
      const mockDatasets = [
        {
          id: "ds-001",
          name: "Financial Statements Q1 2023",
          createdAt: "2023-04-15T10:30:00Z",
          format: "JSONL",
          recordCount: 256,
          status: "complete",
          sourceFile: "Q1_2023_Financial_Report.pdf",
        },
        {
          id: "ds-002",
          name: "Legal Contracts Analysis",
          createdAt: "2023-05-02T14:22:00Z",
          format: "CSV",
          recordCount: 128,
          status: "complete",
          sourceFile: "Contract_Bundle_2023.pdf",
        },
        {
          id: "ds-003",
          name: "Medical Records Synthesis",
          createdAt: "2023-05-10T09:15:00Z",
          format: "JSONL",
          recordCount: 512,
          status: "processing",
          sourceFile: "Patient_Records_Sample.pdf",
        },
      ];
      
      setDatasets(mockDatasets);
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

  const handleDownload = (datasetId) => {
    // Implementation for downloading the dataset
    toast({
      title: "Download started",
      description: `Dataset ${datasetId} is being prepared for download.`,
    });
  };

  const handleDelete = (datasetId) => {
    // Implementation for deleting the dataset
    setDatasets(datasets.filter(dataset => dataset.id !== datasetId));
    toast({
      title: "Dataset deleted",
      description: `Dataset ${datasetId} has been deleted.`,
    });
  };

  const handleView = (datasetId) => {
    // Implementation for viewing the dataset
    toast({
      title: "Viewing dataset",
      description: `Opening dataset ${datasetId} for viewing.`,
    });
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
                    <TableHead>Records</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datasets.map((dataset) => (
                    <TableRow key={dataset.id}>
                      <TableCell className="font-medium">{dataset.name}</TableCell>
                      <TableCell>{formatDate(dataset.createdAt)}</TableCell>
                      <TableCell>{dataset.format}</TableCell>
                      <TableCell>{dataset.recordCount.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            dataset.status === "complete" ? "success" : 
                            dataset.status === "processing" ? "warning" : 
                            "destructive"
                          }
                        >
                          {dataset.status === "complete" ? "Complete" : 
                           dataset.status === "processing" ? "Processing" : 
                           "Failed"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate" title={dataset.sourceFile}>
                        {dataset.sourceFile}
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
                            <DropdownMenuItem onClick={() => handleView(dataset.id)} className="hover:bg-gray-100">
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownload(dataset.id)} className="hover:bg-gray-100">
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(dataset.id)} className="hover:bg-gray-100">
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

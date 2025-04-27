"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  LogOut, 
  UserCircle, 
  FileText, 
  Database, 
  Clock, 
  FolderKanban,
  Loader2,
  ListChecks,
  Wand2,
  AlertTriangle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

const StatusBadge = ({ status }) => {
  let variant = "secondary";
  switch (status?.toLowerCase()) {
    case 'succeeded': variant = "success"; break;
    case 'failed': case 'cancelled': variant = "destructive"; break;
    case 'running': variant = "default"; break;
    case 'queued': case 'validating_files': variant = "outline"; break;
    default: variant = "secondary";
  }
  return <Badge variant={variant}>{status || 'Unknown'}</Badge>;
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatFileType = (format) => {
  if (!format) return '-';
  const formatMap = { 'jsonl': 'JSONL', 'openai-jsonl': 'OpenAI JSONL', 'json': 'JSON', 'csv': 'CSV' };
  return formatMap[format] || format.toUpperCase();
};

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [latestJobs, setLatestJobs] = useState([]);
  const [latestDatasets, setLatestDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const router = useRouter();

  const fetchDataForUser = async (userId) => {
    try {
      console.log(`[Dashboard Page] Fetching data for user: ${userId}`);
      // Fetch datasets
      const { data: datasetsData, error: datasetsError } = await supabase
        .from('datasets')
        .select('id, name, format, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(3);
      if (datasetsError) console.error("Error fetching datasets:", datasetsError);
      else setLatestDatasets(datasetsData || []);

      // Fetch jobs
      const { data: jobsData, error: jobsError } = await supabase
        .from('fine_tuning_jobs')
        .select('id, model_name, base_model, status, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(3);
      if (jobsError) console.error("Error fetching jobs:", jobsError);
      else setLatestJobs(jobsData || []);

    } catch (dataError) {
      console.error('Error loading dashboard data:', dataError);
      toast({ title: "Data Loading Error", description: dataError.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    let isMounted = true;
    console.log("[Dashboard Page] Auth listener effect mounting.");
    setLoading(true); // Start loading when the listener effect runs

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => { 
        console.log("[Dashboard Page] Auth state change received:", { event, hasSession: !!session });
        if (!isMounted) return;

        const currentUser = session?.user ?? null;
        setUser(currentUser); // Update user state

        if (currentUser) {
             console.log(`[Dashboard Page] Auth listener: User found (ID: ${currentUser.id}), fetching data...`);
             await fetchDataForUser(currentUser.id);
             if (isMounted) setLoading(false); // Stop loading AFTER data fetch
        } else {
            // If no user, just stop loading. Redirect is handled by Effect 2.
            console.log("[Dashboard Page] Auth listener: No user session found, setting loading false.");
            if (isMounted) setLoading(false); 
        }
      }
    );

    return () => {
      isMounted = false;
      console.log("[Dashboard Page] Unsubscribing auth listener.");
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []); // Run only once on mount

  useEffect(() => {
      console.log("[Dashboard Page] Redirect check effect running:", { loading, user: !!user });
      // Only redirect if loading is complete AND there is no user
      if (!loading && !user) {
           console.log("[Dashboard Page] Redirect effect: No user after load, redirecting to /.");
           router.push('/');
      }
      // No action needed if loading is true, or if user exists
  }, [loading, user, router]); // Re-run when loading or user state changes
  
  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast({
        title: "Signed Out",
        description: "You have been successfully signed out.",
      });
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: "Sign Out Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };
  
  if (loading) {
    return (
      <div className="container mx-auto py-10 max-w-5xl flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md p-6 text-center">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary"/>
              <p className="text-muted-foreground">Checking authentication...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    console.log("[Dashboard Page] Render: No user found after loading, redirecting (safeguard)" )
    return null;
  }

  const getInitials = (name) => {
    if (!name) return "?";
    const parts = name.split(" ").filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };
  
  const userEmail = user.email || '';
  const firstName = user.user_metadata?.first_name || '';
  const lastName = user.user_metadata?.last_name || '';
  const userName = firstName || userEmail.split('@')[0];
  const fullName = firstName ? (lastName ? `${firstName} ${lastName}` : firstName) : userName;
  const initials = getInitials(fullName);

  return (
    <div className="container mx-auto py-10 max-w-5xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/profile">
            <Avatar className="h-12 w-12 border-2 border-primary cursor-pointer hover:opacity-80 transition-opacity">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Welcome, {userName}</h1>
            <p className="text-muted-foreground flex items-center">
              {userEmail} 
              <Link href="/dashboard/profile" className="ml-2 text-primary inline-flex items-center text-sm hover:underline">
                <UserCircle className="h-3 w-3 mr-1" />
                Edit Profile
              </Link>
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-2">
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              1. Upload & Prepare
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm">Upload documents, inspect content, and save prepared datasets.</p>
            <Link href="/dashboard/upload">
              <Button className="w-full bg-black text-white hover:bg-black/90">
                Go to Upload
              </Button>
            </Link>
             <Link href="/dashboard/datasets">
              <Button variant="outline" className="w-full mt-2">
                View Datasets
              </Button>
            </Link>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
               <Wand2 className="h-5 w-5" />
              2. Fine-tune Model
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm">Start a fine-tuning job using a prepared dataset.</p>
            <Link href="/dashboard/datasets">
              <Button className="w-full bg-black text-white hover:bg-black/90">
                Select Dataset to Fine-tune
              </Button>
            </Link>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              3. Monitor & Use Models
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm">Monitor fine-tuning job progress and access your custom models.</p>
            <Link href="/dashboard/models">
              <Button className="w-full bg-black text-white hover:bg-black/90">
                View Jobs & Models
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Recent Datasets
                </CardTitle>
                <Link href="/dashboard/datasets">
                   <Button variant="ghost" size="sm">View All</Button>
                </Link>
            </div>
          </CardHeader>
          <CardContent>
            {latestDatasets.length === 0 ? (
              <p className="text-muted-foreground text-sm">No datasets created yet.</p>
            ) : (
              <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>Name</TableHead>
                     <TableHead>Format</TableHead>
                     <TableHead className="text-right">Created</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {latestDatasets.map(ds => (
                     <TableRow key={ds.id}>
                       <TableCell className="font-medium truncate max-w-[150px]" title={ds.name}>{ds.name}</TableCell>
                       <TableCell><Badge variant="outline">{formatFileType(ds.format)}</Badge></TableCell>
                       <TableCell className="text-right text-xs text-muted-foreground">{formatDate(ds.created_at)}</TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
             <div className="flex justify-between items-center">
                 <CardTitle className="flex items-center gap-2">
                   <ListChecks className="h-5 w-5" />
                   Recent Fine-tuning Jobs
                 </CardTitle>
                 <Link href="/dashboard/models">
                   <Button variant="ghost" size="sm">View All</Button>
                 </Link>
             </div>
          </CardHeader>
          <CardContent>
             {latestJobs.length === 0 ? (
              <p className="text-muted-foreground text-sm">No fine-tuning jobs started yet.</p>
             ) : (
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>Name</TableHead>
                     <TableHead>Base Model</TableHead>
                     <TableHead className="text-right">Status</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {latestJobs.map(job => (
                     <TableRow key={job.id}>
                       <TableCell className="font-medium truncate max-w-[150px]" title={job.model_name}>{job.model_name}</TableCell>
                       <TableCell className="text-xs truncate max-w-[150px]" title={job.base_model}>{job.base_model}</TableCell>
                       <TableCell className="text-right"><StatusBadge status={job.status} /></TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
               </Table>
             )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 
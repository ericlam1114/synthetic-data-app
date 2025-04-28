"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  AlertTriangle,
  UploadCloud,
  Play,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  CreditCard,
  KeyRound,
  Check
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { cn } from "@/lib/utils";

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

const bannerSlides = [
  {
    title: "Prepare Your Data",
    description: "Upload documents and transform them into high-quality training datasets in minutes.",
    buttonText: "Go to Upload",
    link: "/dashboard/upload",
    bgColor: "bg-gradient-to-r from-blue-500 to-indigo-600",
    icon: UploadCloud
  },
  {
    title: "Fine-Tune Models",
    description: "Easily launch fine-tuning jobs on OpenAI or Fireworks AI using your prepared datasets.",
    buttonText: "Start Fine-tuning",
    link: "/dashboard/datasets",
    bgColor: "bg-gradient-to-r from-purple-500 to-pink-600",
    icon: Wand2
  },
  {
    title: "Test & Integrate",
    description: "Use the playground to interact with your custom models and get code snippets.",
    buttonText: "Go to Playground",
    link: "/dashboard/playground",
    bgColor: "bg-gradient-to-r from-teal-500 to-cyan-600",
    icon: Play
  },
];

const initialChecklistItems = [
  { id: 'subscribe', title: "Buy Subscription", description: "Choose a plan to unlock features.", icon: CreditCard, completed: false },
  { id: 'apikey', title: "Add API Key(s)", description: "Save your OpenAI or Fireworks key.", icon: KeyRound, link: '/dashboard/profile', completed: false },
  { id: 'upload', title: "Upload & Prepare Data", description: "Process your first document.", icon: UploadCloud, link: '/dashboard/upload', completed: false },
];

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [latestDatasets, setLatestDatasets] = useState([]);
  const [latestJobs, setLatestJobs] = useState([]);
  const [datasetCount, setDatasetCount] = useState(0);
  const [jobCount, setJobCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const router = useRouter();

  const [currentSlide, setCurrentSlide] = useState(0);
  const [checklistItems, setChecklistItems] = useState(initialChecklistItems);
  const [checklistProgress, setChecklistProgress] = useState(0);
  const [showChecklist, setShowChecklist] = useState(true);

  const fetchDataForUser = useCallback(async (userId) => {
      if (!userId) {
           console.warn("[Dashboard] fetchDataForUser called without userId");
           setLoading(false); 
           return;
      }
      console.log(`[Dashboard] Fetching data for user: ${userId}`);
      try {
          const { data: { user: userData }, error: userError } = await supabase.auth.getUser();
          if (userError || !userData) {
               console.error("Error fetching user data for checks:", userError);
               throw new Error("Could not retrieve user data.");
          }

          const { data: fetchedLatestDatasets, error: datasetsError } = await supabase
              .from('datasets')
              .select('id, name, format, created_at')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(3);
              
          const { data: fetchedOpenAIJobs, error: openaiJobsError } = await supabase
              .from('fine_tuning_jobs')
              .select('id, model_name, base_model, status, created_at')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(3);

          const { data: fetchedFireworksJobs, error: fireworksJobsError } = await supabase
              .from('fireworks_fine_tuning_jobs')
              .select('id, model_name, base_model, status, created_at')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(3);

          if (datasetsError) console.error("Error fetching datasets:", datasetsError);
          if (openaiJobsError) console.error("Error fetching OpenAI jobs:", openaiJobsError);
          if (fireworksJobsError) console.error("Error fetching Fireworks jobs:", fireworksJobsError);

          const combinedLatestJobs = [
             ...(fetchedOpenAIJobs || []).map(job => ({ ...job, provider: 'openai' })),
             ...(fetchedFireworksJobs || []).map(job => ({ ...job, provider: 'fireworks' }))
          ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3);
          
          setLatestDatasets(fetchedLatestDatasets || []);
          setLatestJobs(combinedLatestJobs);
          
          const { count: totalDatasets } = await supabase.from('datasets').select('id', { count: 'exact', head: true }).eq('user_id', userId);
          const { count: totalOpenAIJobs } = await supabase.from('fine_tuning_jobs').select('id', { count: 'exact', head: true }).eq('user_id', userId);
          const { count: totalFireworksJobs } = await supabase.from('fireworks_fine_tuning_jobs').select('id', { count: 'exact', head: true }).eq('user_id', userId);
          setDatasetCount(totalDatasets || 0);
          setJobCount((totalOpenAIJobs || 0) + (totalFireworksJobs || 0));

          const metadata = userData.user_metadata || {};
          const hasApiKey = !!metadata.encrypted_openai_api_key || !!metadata.encrypted_fireworks_api_key;
          const hasSubscription = false;

          setChecklistItems(prevItems => {
              const updatedChecklist = prevItems.map(item => {
                let completed = item.completed;
                if (item.id === 'subscribe' && hasSubscription) { completed = true; }
                if (item.id === 'apikey' && hasApiKey) { completed = true; }
                if (item.id === 'upload' && (totalDatasets || 0) > 0) { completed = true; }
                return { ...item, completed };
              });
              
              const completedCount = updatedChecklist.filter(item => item.completed).length;
              const progress = Math.round((completedCount / updatedChecklist.length) * 100);
              setChecklistProgress(progress);
              setShowChecklist(completedCount !== updatedChecklist.length);
              return updatedChecklist;
           });

      } catch (dataError) {
          console.error('Error loading dashboard data:', dataError);
          toast({ title: "Data Loading Error", description: dataError.message, variant: "destructive" });
      } finally {
          // Loading state is handled by the calling effect
      }
  }, [toast, supabase]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    console.log("[Dashboard Page] Consolidated effect mounting.");

    supabase.auth.getSession().then(({ data: { session } }) => {
       if (!isMounted) return;
       console.log("[Dashboard Page] Initial session check:", { hasSession: !!session });
       const initialUser = session?.user ?? null;
       setUser(initialUser);
       if (initialUser) {
          fetchDataForUser(initialUser.id).finally(() => {
             if (isMounted) setLoading(false);
          });
       } else {
          setLoading(false);
       }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => { 
        if (!isMounted) return;
        console.log("[Dashboard Page] Auth state change received:", { event, hasSession: !!session });
        
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (event === 'SIGNED_IN' && currentUser) {
            console.log(`[Dashboard Page] Auth listener: SIGNED_IN, fetching data for ${currentUser.id}...`);
            setLoading(true);
            fetchDataForUser(currentUser.id).finally(() => {
                if (isMounted) setLoading(false);
            });
        } else if (event === 'SIGNED_OUT') {
            console.log("[Dashboard Page] Auth listener: SIGNED_OUT.");
            setDatasetCount(0);
            setJobCount(0);
            setChecklistItems(initialChecklistItems);
            setChecklistProgress(0);
            setShowChecklist(true);
            setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      console.log("[Dashboard Page] Unsubscribing auth listener.");
      authListener?.subscription?.unsubscribe();
    };
  }, [fetchDataForUser, router, supabase]);

  useEffect(() => {
      console.log("[Dashboard Page] Redirect check effect running:", { loading, user: !!user });
      if (!loading && !user) {
           console.log("[Dashboard Page] Redirect effect: No user after load, redirecting to /.");
           router.push('/');
      }
  }, [loading, user, router]);
  
  useEffect(() => {
      // ... banner scroll logic ...
  }, []);

  const handleSignOut = async () => {
      // ... sign out logic ... 
  };
  
  if (loading) {
      // ... loading JSX ...
  }

  if (!user) {
    console.log("[Dashboard Page] Render: No user found after loading, redirecting (safeguard)" );
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

  const handleChecklistItemClick = (item) => {
      if (item.id === 'subscribe') {
          toast({
              title: "Congrats! 🎉",
              description: "Trainified is currently free to use while in Beta.",
              duration: 5000, // Show for 5 seconds
          });
          // Optionally mark as complete here if desired after showing the message?
          // setChecklistItems(prev => prev.map(i => i.id === 'subscribe' ? { ...i, completed: true } : i));
      } else if (item.link) {
          router.push(item.link);
      }
  };

  return (
    <div className="container mx-auto py-10 max-w-5xl space-y-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
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
      </div>
      
      <div className="relative w-full h-64 md:h-56 rounded-lg overflow-hidden shadow-lg">
        {bannerSlides.map((slide, index) => (
          <div
            key={index}
            className={cn(
              "absolute inset-0 transition-opacity duration-1000 ease-in-out flex flex-col md:flex-row items-center justify-between p-6 md:p-10 text-white",
              slide.bgColor,
              index === currentSlide ? "opacity-100 z-10" : "opacity-0 z-0"
            )}
          >
            <div className="md:w-2/3 mb-4 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold mb-2">{slide.title}</h2>
              <p className="text-sm md:text-base opacity-90 mb-4">{slide.description}</p>
              <Link href={slide.link}>
                <Button variant="secondary" className="gap-2 bg-white/20 hover:bg-white/30 text-white">
                  {slide.buttonText}
                  <ChevronRight className="h-4 w-4"/>
                </Button>
              </Link>
            </div>
            {slide.icon && (
              <div className="md:w-1/3 flex justify-center md:justify-end text-6xl md:text-8xl opacity-20 md:opacity-30">
                <slide.icon/>
              </div>
            )}
          </div>
        ))}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 flex space-x-2">
          {bannerSlides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                index === currentSlide ? "bg-white scale-125" : "bg-white/50 hover:bg-white/75"
              )}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
      
      {showChecklist && (
        <Card>
          <CardHeader>
            <CardTitle>Getting Started Checklist</CardTitle>
            <div className="flex justify-between items-center pt-1">
               <CardDescription>{checklistProgress}% completed</CardDescription>
               {checklistProgress === 100 && <Badge variant="success">Complete!</Badge>}
            </div>
            <Progress value={checklistProgress} className="mt-2 h-2" />
          </CardHeader>
          <CardContent className="space-y-3">
            {checklistItems.map((item) => (
              <div 
                 key={item.id} 
                 className="block cursor-pointer" 
                 onClick={() => handleChecklistItemClick(item)} 
                 role="button" 
                 tabIndex={0} 
                 onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleChecklistItemClick(item); }}
              >
                 <div className={cn(
                    "flex items-center justify-between p-3 rounded-md border transition-colors",
                    item.completed ? "bg-green-50 border-green-200 hover:bg-green-100" : "bg-card hover:bg-muted/50"
                 )}>
                  <div className="flex items-center gap-3">
                    {item.completed ? 
                      <Check className="h-5 w-5 text-green-600 flex-shrink-0" /> :
                      <item.icon className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                    }
                    <div>
                      <p className={cn("text-sm font-medium", item.completed && "line-through text-muted-foreground")}>{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                   {item.completed && <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 opacity-0"/>}
                 </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
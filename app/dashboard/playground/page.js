'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import ModelPlayground from "../../components/ModelPlayground";
import { Loader2, Play, ChevronLeft, AlertTriangle, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { Badge } from "@/components/ui/badge";

export default function PlaygroundPage() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [availableModels, setAvailableModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState(null); // Store { id, provider, name }
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        const fetchUserAndModels = async () => {
            setLoading(true);
            try {
                const { data: { session }, error: authError } = await supabase.auth.getSession();
                if (authError || !session?.user) {
                    toast({ title: "Unauthorized", description: "Please log in.", variant: "destructive" });
                    router.push('/');
                    return;
                }
                setUser(session.user);

                // Fetch completed jobs from both tables
                const { data: openaiJobs, error: openaiError } = await supabase
                    .from('fine_tuning_jobs')
                    .select('id, model_name, fine_tuned_model_id, status, base_model')
                    .eq('user_id', session.user.id)
                    .eq('status', 'succeeded') // Only succeeded OpenAI jobs
                    .not('fine_tuned_model_id', 'is', null); // Ensure model ID exists
                    
                const { data: fireworksJobs, error: fireworksError } = await supabase
                    .from('fireworks_fine_tuning_jobs')
                    .select('id, model_name, fine_tuned_model_id, status, base_model')
                    .eq('user_id', session.user.id)
                    .eq('status', 'JOB_STATE_COMPLETED') // Only completed Fireworks jobs
                    .not('fine_tuned_model_id', 'is', null); // Ensure model ID exists

                if (openaiError) console.error("Error fetching OpenAI models:", openaiError);
                if (fireworksError) console.error("Error fetching Fireworks models:", fireworksError);

                const combinedModels = [
                    ...(openaiJobs || []).map(job => ({
                        id: job.fine_tuned_model_id,
                        provider: 'openai',
                        name: job.model_name || job.fine_tuned_model_id,
                        base_model: job.base_model
                    })),
                    ...(fireworksJobs || []).map(job => ({
                        id: job.fine_tuned_model_id,
                        provider: 'fireworks',
                        name: job.model_name || job.fine_tuned_model_id,
                         base_model: job.base_model
                    }))
                ].sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically by name
                
                setAvailableModels(combinedModels);

            } catch (err) {
                console.error("Error loading playground data:", err);
                toast({ title: "Error", description: "Could not load models.", variant: "destructive" });
            } finally {
                setLoading(false);
            }
        };

        fetchUserAndModels();
    }, [router, toast]);

    const handleModelSelect = (modelId) => {
        const model = availableModels.find(m => m.id === modelId);
        setSelectedModel(model);
        console.log("[PlaygroundPage] Selected model:", model);
    };

    if (loading) {
        return (
            <div className="container mx-auto py-10 max-w-3xl flex justify-center items-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="container mx-auto max-w-5xl py-8">
             <Button variant="outline" onClick={() => router.push('/dashboard/models')} className="gap-2 mb-6">
                <ChevronLeft className="h-4 w-4" />
                Back to Models
            </Button>

            <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><Play className="h-7 w-7"/> Model Playground</h1>
            
            {availableModels.length === 0 ? (
                 <Card className="w-full text-center py-10">
                    <CardContent>
                    <div className="flex flex-col items-center gap-4">
                        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
                        <div>
                        <h2 className="text-xl font-semibold">No Completed Models Found</h2>
                        <p className="text-muted-foreground mt-1">
                            You need a successfully completed fine-tuning job to use the playground.
                        </p>
                        </div>
                        <Link href="/dashboard/datasets">
                        <Button className="mt-4 bg-black text-white hover:bg-black/90">
                             <Wand2 className="mr-2 h-4 w-4"/> Start a Fine-tuning Job
                        </Button>
                        </Link>
                    </div>
                    </CardContent>
                </Card>
            ) : (
                 <Card>
                    <CardHeader>
                        <CardTitle>Select a Model</CardTitle>
                        <CardDescription>Choose one of your fine-tuned models to interact with.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="max-w-md">
                            <Label htmlFor="model-select">Fine-tuned Model</Label>
                            <Select onValueChange={handleModelSelect} value={selectedModel?.id || ""}>
                                <SelectTrigger id="model-select">
                                    <SelectValue placeholder="Select a model..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableModels.map(model => (
                                        <SelectItem key={model.id} value={model.id}>
                                            <div className="flex items-center gap-2">
                                                <Badge variant={model.provider === 'openai' ? 'success' : 'warning'} className="capitalize text-xs w-[80px] flex-shrink-0 justify-center">
                                                    {model.provider}
                                                </Badge>
                                                <span className="truncate" title={model.name}>{model.name}</span>
                                                <span className="text-xs text-muted-foreground ml-auto pl-2">({model.base_model})</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        
                        {/* Conditionally Render Playground */} 
                        {selectedModel && (
                            <div className="mt-6 border-t pt-6 h-[70vh]"> {/* Give playground defined height */} 
                                <ModelPlayground 
                                    modelId={selectedModel.id}
                                    provider={selectedModel.provider}
                                    userId={user?.id}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
} 
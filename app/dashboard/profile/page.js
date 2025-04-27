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
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Avatar, AvatarFallback } from "../../../components/ui/avatar";
import { 
    AlertCircle, 
    UserCircle, 
    Save, 
    Loader2, 
    KeyRound, 
    Trash2,
    CheckCircle,
    Info,
    Flame,
    Lock,
    Fingerprint
} from "lucide-react";
import { useToast } from "../../../hooks/use-toast";
import { supabase } from "../../../lib/supabaseClient";
import { 
    Tooltip, 
    TooltipContent, 
    TooltipProvider, 
    TooltipTrigger 
} from "../../../components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { Separator } from "../../../components/ui/separator";

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
  });
  
  // State for OpenAI API Key
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
  const [isCheckingOpenAIKey, setIsCheckingOpenAIKey] = useState(true);
  const [isSavingOpenAIKey, setIsSavingOpenAIKey] = useState(false);
  const [isRemovingOpenAIKey, setIsRemovingOpenAIKey] = useState(false);
  const [openaiApiKeyInput, setOpenaiApiKeyInput] = useState('');
  const [showOpenAIKeyInput, setShowOpenAIKeyInput] = useState(false);
  
  // State for Fireworks API Key
  const [hasFireworksKey, setHasFireworksKey] = useState(false);
  const [isCheckingFireworksKey, setIsCheckingFireworksKey] = useState(true);
  const [isSavingFireworksKey, setIsSavingFireworksKey] = useState(false);
  const [isRemovingFireworksKey, setIsRemovingFireworksKey] = useState(false);
  const [fireworksApiKeyInput, setFireworksApiKeyInput] = useState('');
  const [showFireworksKeyInput, setShowFireworksKeyInput] = useState(false);

  // --- State for Fireworks Account ID ---
  const [hasFireworksAccountId, setHasFireworksAccountId] = useState(false);
  const [isCheckingFireworksAccountId, setIsCheckingFireworksAccountId] = useState(true);
  const [isSavingFireworksAccountId, setIsSavingFireworksAccountId] = useState(false);
  const [isRemovingFireworksAccountId, setIsRemovingFireworksAccountId] = useState(false);
  const [fireworksAccountIdInput, setFireworksAccountIdInput] = useState('');
  const [showFireworksAccountIdInput, setShowFireworksAccountIdInput] = useState(false);
  // -------------------------------------
  
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    const loadInitialData = async () => {
        setIsCheckingOpenAIKey(true);
        setIsCheckingFireworksKey(true);
        setIsCheckingFireworksAccountId(true);
        setLoading(true);
        try {
            // User session
            const { data: { session }, error: authError } = await supabase.auth.getSession();
            if (!session?.user) {
                router.push('/');
                return;
            }
            const userData = session.user;
            if (isMounted) {
                setUser(userData);
                setFormData({
                    firstName: userData.user_metadata?.first_name || '',
                    lastName: userData.user_metadata?.last_name || '',
                    email: userData.email || '',
                });
                setLoading(false); // Profile data loaded
            }

            // Check ALL API key/ID statuses in parallel
            const [openaiRes, fireworksKeyRes, fireworksAccountRes] = await Promise.all([
                fetch('/api/user/api-key').catch(e => { console.error("Fetch OpenAI Key Status Error:", e); return null; }), 
                fetch('/api/user/fireworks-key').catch(e => { console.error("Fetch Fireworks Key Status Error:", e); return null; }), 
                fetch('/api/user/fireworks-account').catch(e => { console.error("Fetch Fireworks Account ID Status Error:", e); return null; })
            ]);

            // Process OpenAI key status
            if (openaiRes?.ok) {
                const openaiData = await openaiRes.json();
                if (isMounted) {
                    setHasOpenAIKey(openaiData.hasApiKey);
                    if (!openaiData.hasApiKey) setShowOpenAIKeyInput(true);
                }
            } else {
                 if (isMounted) {
                     console.warn("Failed to fetch OpenAI key status:", openaiRes?.status);
                     setShowOpenAIKeyInput(true); 
                 }
            }
            
            // Process Fireworks key status
            if (fireworksKeyRes?.ok) {
                const fireworksKeyData = await fireworksKeyRes.json();
                if (isMounted) {
                    setHasFireworksKey(fireworksKeyData.hasApiKey);
                    if (!fireworksKeyData.hasApiKey) setShowFireworksKeyInput(true);
                }
            } else {
                 if (isMounted) console.warn("Failed to fetch Fireworks key status:", fireworksKeyRes?.status);
                 if (isMounted) setShowFireworksKeyInput(true); 
            }

            // Process Fireworks Account ID status
            if (fireworksAccountRes?.ok) {
                const fireworksAccountData = await fireworksAccountRes.json();
                if (isMounted) {
                    setHasFireworksAccountId(fireworksAccountData.hasAccountId);
                    if (!fireworksAccountData.hasAccountId) setShowFireworksAccountIdInput(true);
                }
            } else {
                 if (isMounted) console.warn("Failed to fetch Fireworks Account ID status:", fireworksAccountRes?.status);
                 if (isMounted) setShowFireworksAccountIdInput(true); 
            }

        } catch (err) {
            if (isMounted) {
                console.error("Initial load error:", err);
                toast({ title: "Error Loading Profile Data", description: err.message, variant: "destructive" });
            }
        } finally {
            if (isMounted) {
                setIsCheckingOpenAIKey(false);
                setIsCheckingFireworksKey(false);
                setIsCheckingFireworksAccountId(false);
            }
        }
    };
    
    loadInitialData();
    return () => { isMounted = false; };
}, [router, toast]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setFormError(null);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { 
          first_name: formData.firstName, 
          last_name: formData.lastName 
        }
      });
      if (error) throw error;
      toast({ title: "Profile Updated" });
      setUser(prev => ({ ...prev, user_metadata: { ...prev.user_metadata, first_name: formData.firstName, last_name: formData.lastName } }));
    } catch (error) {
      console.error('Error updating profile:', error);
      setFormError(error.message);
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  // OpenAI Key Handlers
  const handleSaveOpenAIKey = async () => {
      if (!openaiApiKeyInput || !openaiApiKeyInput.startsWith('sk-')) {
          toast({ title: "Invalid Format", description: "OpenAI key must start with 'sk-'.", variant: "destructive" });
          return;
      }
      setIsSavingOpenAIKey(true);
      setFormError(null);
      try {
          const response = await fetch('/api/user/api-key', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ apiKey: openaiApiKeyInput }),
          });
          
          if (!response.ok) {
              const result = await response.json().catch(() => ({}));
              throw new Error(result.message || result.error || `Failed with status ${response.status}`);
          }
          
          toast({ title: "OpenAI Key Saved Successfully" });
          setHasOpenAIKey(true);
          setShowOpenAIKeyInput(false); 
          setOpenaiApiKeyInput(''); 
      } catch (err) {
          console.error("Save OpenAI key error:", err);
          setFormError(err.message);
          toast({ title: "Error Saving OpenAI Key", description: err.message, variant: "destructive" });
      } finally {
          setIsSavingOpenAIKey(false);
      }
  };

  const handleRemoveOpenAIKey = async () => {
      if (!confirm('Are you sure you want to remove your stored OpenAI API key? You will need to re-enter it to start new OpenAI fine-tuning jobs.')) {
          return;
      }
      setIsRemovingOpenAIKey(true);
      setFormError(null);
      try {
          const response = await fetch('/api/user/api-key', {
              method: 'DELETE',
          });
          if (!response.ok) {
              const result = await response.json().catch(() => ({}));
              throw new Error(result.message || 'Failed to remove OpenAI key');
          }
          toast({ title: "OpenAI Key Removed Successfully" });
          setHasOpenAIKey(false);
          setShowOpenAIKeyInput(true); // Show input again after removal
      } catch (err) {
          console.error("Remove OpenAI key error:", err);
          setFormError(err.message);
          toast({ title: "Error Removing OpenAI Key", description: err.message, variant: "destructive" });
      } finally {
          setIsRemovingOpenAIKey(false);
      }
  };

  // Fireworks Key Handlers
  const handleSaveFireworksApiKey = async () => {
      if (!fireworksApiKeyInput || !fireworksApiKeyInput.startsWith('fw_')) {
          toast({ title: "Invalid Format", description: "Fireworks key must start with 'fw_'.", variant: "destructive" });
          return;
      }
      setIsSavingFireworksKey(true);
      setFormError(null);
      try {
          const response = await fetch('/api/user/fireworks-key', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ apiKey: fireworksApiKeyInput }),
          });
          const resultText = await response.text(); // Read body regardless of status
          if (!response.ok) {
               let errorMsg = resultText || `Failed with status ${response.status}`;
               try { // Try parsing JSON for a more specific error
                  const jsonError = JSON.parse(resultText);
                  errorMsg = jsonError.message || jsonError.error || errorMsg;
               } catch (e) { /* Ignore parsing error, use text */ }
               console.error("Save Fireworks Key API Error:", errorMsg);
               throw new Error(errorMsg); 
          }
          toast({ title: "Fireworks Key Saved Successfully" });
          setHasFireworksKey(true);
          setShowFireworksKeyInput(false); 
          setFireworksApiKeyInput(''); 
      } catch (err) {
          console.error("Save Fireworks key error:", err);
          setFormError(err.message);
          toast({ title: "Error Saving Fireworks Key", description: err.message, variant: "destructive" });
      } finally {
          setIsSavingFireworksKey(false);
      }
  };

  const handleRemoveFireworksApiKey = async () => {
      if (!confirm('Are you sure you want to remove your stored Fireworks API key? You will need to re-enter it to start new Fireworks fine-tuning jobs.')) {
          return;
      }
      setIsRemovingFireworksKey(true);
      setFormError(null);
      try {
          const response = await fetch('/api/user/fireworks-key', {
              method: 'DELETE',
          });
          if (!response.ok) {
              const result = await response.json().catch(() => ({}));
              throw new Error(result.message || 'Failed to remove Fireworks key');
          }
          toast({ title: "Fireworks Key Removed Successfully" });
          setHasFireworksKey(false);
          setShowFireworksKeyInput(true); // Show input again after removal
      } catch (err) {
          console.error("Remove Fireworks key error:", err);
          setFormError(err.message);
          toast({ title: "Error Removing Fireworks Key", description: err.message, variant: "destructive" });
      } finally {
          setIsRemovingFireworksKey(false);
      }
  };

  // --- Handlers for Fireworks Account ID ---
  const handleSaveFireworksAccountId = async () => {
      if (!fireworksAccountIdInput || fireworksAccountIdInput.trim().length === 0) {
          toast({ title: "Invalid Input", description: "Please enter your Fireworks Account ID.", variant: "destructive" });
          return;
      }
      setIsSavingFireworksAccountId(true);
      setFormError(null);
      try {
          const response = await fetch('/api/user/fireworks-account', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accountId: fireworksAccountIdInput }),
          });
          
          if (!response.ok) {
              const result = await response.json().catch(() => ({}));
              throw new Error(result.message || result.error || `Failed with status ${response.status}`);
          }
          
          toast({ title: "Fireworks Account ID Saved Successfully" });
          setHasFireworksAccountId(true);
          setShowFireworksAccountIdInput(false); 
          setFireworksAccountIdInput(''); 
      } catch (err) {
          console.error("Save Fireworks Account ID error:", err);
          setFormError(err.message);
          toast({ title: "Error Saving Fireworks Account ID", description: err.message, variant: "destructive" });
      } finally {
          setIsSavingFireworksAccountId(false);
      }
  };

  const handleRemoveFireworksAccountId = async () => {
      if (!confirm('Are you sure you want to remove your stored Fireworks Account ID? You will need to re-enter it to start new Fireworks fine-tuning jobs.')) {
          return;
      }
      setIsRemovingFireworksAccountId(true);
      setFormError(null);
      try {
          const response = await fetch('/api/user/fireworks-account', {
              method: 'DELETE',
          });
          if (!response.ok) {
              const result = await response.json().catch(() => ({}));
              throw new Error(result.message || 'Failed to remove Account ID');
          }
          toast({ title: "Fireworks Account ID Removed Successfully" });
          setHasFireworksAccountId(false);
          setShowFireworksAccountIdInput(true); // Show input again after removal
      } catch (err) {
          console.error("Remove Fireworks Account ID error:", err);
          setFormError(err.message);
          toast({ title: "Error Removing Fireworks Account ID", description: err.message, variant: "destructive" });
      } finally {
          setIsRemovingFireworksAccountId(false);
      }
  };
  // ----------------------------------------

  if (loading || isCheckingOpenAIKey || isCheckingFireworksKey || isCheckingFireworksAccountId) { 
    return (
      <div className="container mx-auto py-10 max-w-xl flex items-center justify-center min-h-[60vh]">
        <Card className="w-full text-center">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading profile & keys...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const getInitials = (name) => {
    if (!name) return "?";
    const parts = name.split(" ").filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };
  
  const fullName = formData.firstName ? 
    (formData.lastName ? `${formData.firstName} ${formData.lastName}` : formData.firstName) 
    : formData.email;
  const initials = getInitials(fullName);

  return (
    <TooltipProvider>
      <div className="container mx-auto py-10 max-w-xl">
        <Card className="w-full">
          <CardHeader className="flex flex-col items-center">
            <Avatar className="h-20 w-20 mb-4 text-xl">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <CardTitle className="text-center text-2xl">Your Profile</CardTitle>
            <CardDescription className="text-center">
              View and update your account information
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-4">
                 <TabsTrigger value="profile">Profile</TabsTrigger>
                 <TabsTrigger value="openai-key">OpenAI Key</TabsTrigger>
                 <TabsTrigger value="fireworks-key">Fireworks</TabsTrigger>
              </TabsList>

              <TabsContent value="profile">
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>
                    Update your personal information
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form onSubmit={handleUpdateProfile} className="space-y-6">
                    {formError && (
                      <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                        <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                        <p>{formError}</p>
                      </div>
                    )}
                    
                    <div className="space-y-4 border p-4 rounded-md">
                      <CardTitle className="text-lg">Personal Information</CardTitle>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="firstName">First Name</Label>
                          <Input
                            id="firstName"
                            name="firstName"
                            value={formData.firstName}
                            onChange={handleInputChange}
                            placeholder="Your first name"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="lastName">Last Name</Label>
                          <Input
                            id="lastName"
                            name="lastName"
                            value={formData.lastName}
                            onChange={handleInputChange}
                            placeholder="Your last name"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input
                          id="email"
                          name="email"
                          value={formData.email}
                          disabled
                          className="bg-muted"
                        />
                        <p className="text-xs text-muted-foreground">
                          Email address cannot be changed. Contact support if you need to update it.
                        </p>
                      </div>
                      
                      <div className="pt-2">
                        <Button 
                          type="submit" 
                          className="w-full bg-black text-white hover:bg-black/90"
                          disabled={savingProfile}
                        >
                          {savingProfile ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          Save Profile Changes
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2 border p-4 rounded-md bg-muted/50">
                      <Label htmlFor="userId" className="text-muted-foreground">User ID</Label>
                      <Input id="userId" value={user?.id || ''} disabled className="bg-transparent border-none p-0 h-auto font-mono text-xs" />
                    </div>

                  </form>
                </CardContent>
              </TabsContent>

              <TabsContent value="openai-key">
                <CardHeader className="px-1 pt-0">
                  <CardTitle>OpenAI API Key</CardTitle>
                  <CardDescription>
                    Manage your OpenAI API key for fine-tuning jobs. It&apos;s stored securely.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 px-1">
                  <div className="space-y-4 border p-4 rounded-md">
                     <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">OpenAI API Key</CardTitle>
                          <Tooltip>
                             <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                             </TooltipTrigger>
                             <TooltipContent side="top" className="max-w-xs">
                                <p>Used for fine-tuning models. Your key is stored securely using encryption.</p>
                             </TooltipContent>
                          </Tooltip>
                        </div>
                         {hasOpenAIKey && !showOpenAIKeyInput && (
                            <Button variant="link" size="sm" onClick={() => setShowOpenAIKeyInput(true)} className="text-xs h-auto p-0">
                               Update Key
                            </Button>
                         )}
                     </div>

                     {hasOpenAIKey && !showOpenAIKeyInput ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-md border border-green-200">
                            <CheckCircle className="h-4 w-4"/>
                            <span>API Key is securely stored.</span>
                        </div>
                        <Button 
                          variant="destructive"
                          size="sm"
                          onClick={handleRemoveOpenAIKey}
                          disabled={isRemovingOpenAIKey}
                          className="w-full md:w-auto"
                        >
                            {isRemovingOpenAIKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Remove Stored OpenAI Key
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                         <div className="relative">
                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                               id="openaiApiKeyInput"
                               type="password"
                               value={openaiApiKeyInput}
                               onChange={(e) => setOpenaiApiKeyInput(e.target.value)}
                               placeholder="Enter your OpenAI key (sk-...)"
                               className="pl-10"
                            />
                         </div>
                         <Button 
                           type="button" 
                           onClick={handleSaveOpenAIKey}
                           disabled={isSavingOpenAIKey || !openaiApiKeyInput || !openaiApiKeyInput.startsWith('sk-')}
                           className="bg-blue-600 text-white hover:bg-blue-700"
                           size="sm"
                         >
                            {isSavingOpenAIKey ? <Loader2 className=" mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                            {hasOpenAIKey ? 'Update Saved Key' : 'Save OpenAI Key'}
                         </Button>
                         {hasOpenAIKey && showOpenAIKeyInput && (
                            <Button 
                                type="button" 
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setShowOpenAIKeyInput(false);
                                    setOpenaiApiKeyInput('');
                                }}
                                disabled={isSavingOpenAIKey}
                            >
                                Cancel Update
                            </Button>
                         )}
                         <p className="text-xs text-muted-foreground pt-1">
                             Your API key will be securely encrypted before saving.
                         </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </TabsContent>

              <TabsContent value="fireworks-key">
                 <CardHeader className="px-1 pt-0">
                  <CardTitle className="flex items-center gap-2"> <Flame className="h-5 w-5 text-orange-500"/> Fireworks AI Settings</CardTitle>
                  <CardDescription>
                    Manage your Fireworks API key and Account ID for fine-tuning.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 px-1">
                   <Alert variant="info" className="bg-blue-50 border-blue-200 text-blue-800">
                     <Flame className="h-5 w-5 text-blue-600" />
                     <AlertTitle className="font-semibold">Bring Your Own Key (BYOK) Model</AlertTitle>
                     <AlertDescription className="text-xs">
                       When using Fireworks AI for fine-tuning, you provide your own API key.
                       This means the fine-tuning process and model hosting run under your Fireworks account.
                       You are responsible for any costs incurred directly with Fireworks AI based on their pricing.
                       Your key is stored securely encrypted by us and only used when initiating jobs on your behalf.
                       <a href="https://docs.fireworks.ai/introduction/pricing" target="_blank" rel="noopener noreferrer" className="underline font-medium ml-1 hover:text-blue-700">
                         Learn more about Fireworks pricing.
                       </a>
                     </AlertDescription>
                   </Alert>
                   
                   <div className="space-y-4 border p-4 rounded-md">
                      <div className="flex items-center justify-between mb-2">
                         <div className="flex items-center gap-2">
                           <CardTitle className="text-lg">API Key</CardTitle>
                           <Tooltip>
                              <TooltipTrigger asChild>
                                 <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                 <p>Required for fine-tuning models like Mistral via Fireworks AI. Your key is stored securely.</p>
                              </TooltipContent>
                           </Tooltip>
                         </div>
                         {hasFireworksKey && !showFireworksKeyInput && (
                            <Button variant="link" size="sm" onClick={() => setShowFireworksKeyInput(true)} className="text-xs h-auto p-0">
                               Update Key
                            </Button>
                         )}
                      </div>

                      {hasFireworksKey && !showFireworksKeyInput ? (
                         <div className="space-y-3">
                             <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-md border border-green-200">
                                 <CheckCircle className="h-4 w-4"/>
                                 <span>Fireworks API Key is securely stored.</span>
                             </div>
                             <Button 
                                 variant="destructive"
                                 size="sm"
                                 onClick={handleRemoveFireworksApiKey}
                                 disabled={isRemovingFireworksKey}
                                 className="w-full md:w-auto"
                             >
                                 {isRemovingFireworksKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                 Remove Stored Fireworks Key
                             </Button>
                         </div>
                       ) : (
                          <div className="space-y-3">
                             <div className="relative">
                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                   id="fireworksApiKeyInput"
                                   type="password"
                                   value={fireworksApiKeyInput}
                                   onChange={(e) => setFireworksApiKeyInput(e.target.value)}
                                   placeholder="Enter your Fireworks key (fw_...)"
                                   className="pl-10"
                                />
                             </div>
                             <Button 
                                type="button" 
                                onClick={handleSaveFireworksApiKey}
                                disabled={isSavingFireworksKey || !fireworksApiKeyInput || !fireworksApiKeyInput.startsWith('fw_')}
                                className="bg-orange-500 text-white hover:bg-orange-600"
                                size="sm"
                             >
                                {isSavingFireworksKey ? <Loader2 className=" mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                {hasFireworksKey ? 'Update Saved Key' : 'Save Fireworks Key'}
                             </Button>
                             {hasFireworksKey && showFireworksKeyInput && (
                                 <Button 
                                     type="button" 
                                     variant="outline"
                                     size="sm"
                                     onClick={() => {
                                         setShowFireworksKeyInput(false);
                                         setFireworksApiKeyInput('');
                                     }}
                                     disabled={isSavingFireworksKey}
                                 >
                                     Cancel Update
                                 </Button>
                             )}
                             <p className="text-xs text-muted-foreground pt-1">
                                 Your API key will be securely encrypted before saving.
                             </p>
                          </div>
                       )}
                       {!hasFireworksKey && (
                          <p className="text-xs text-amber-600 flex items-center gap-1 pt-1">
                             <AlertCircle className="h-3 w-3"/> You must save a Fireworks key to fine-tune.
                          </p>
                       )}
                    </div>

                    <Separator /> 

                    <div className="space-y-4 border p-4 rounded-md">
                      <div className="flex items-center justify-between mb-2">
                         <div className="flex items-center gap-2">
                           <CardTitle className="text-lg">Account ID</CardTitle>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                 <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                 <p>Your unique Fireworks AI Account ID. Find this in your Fireworks account settings. It's needed to interact with their native fine-tuning API.</p>
                              </TooltipContent>
                           </Tooltip>
                         </div>
                         {hasFireworksAccountId && !showFireworksAccountIdInput && (
                            <Button variant="link" size="sm" onClick={() => setShowFireworksAccountIdInput(true)} className="text-xs h-auto p-0">
                               Update Account ID
                            </Button>
                         )}
                      </div>

                      {hasFireworksAccountId && !showFireworksAccountIdInput ? (
                         <div className="space-y-3">
                             <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-md border border-green-200">
                                 <CheckCircle className="h-4 w-4"/>
                                 <span>Account ID is securely stored.</span>
                             </div>
                             <Button 
                                 variant="destructive"
                                 size="sm"
                                 onClick={handleRemoveFireworksAccountId}
                                 disabled={isRemovingFireworksAccountId}
                                 className="w-full md:w-auto"
                             >
                                 {isRemovingFireworksAccountId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} 
                                 Remove Stored Account ID
                             </Button>
                         </div>
                       ) : (
                          <div className="space-y-3">
                              <div className="relative">
                                 <Fingerprint className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                 <Input
                                    id="fireworksAccountIdInput"
                                    type="text"
                                    value={fireworksAccountIdInput}
                                    onChange={(e) => setFireworksAccountIdInput(e.target.value)}
                                    placeholder="Enter your Fireworks Account ID"
                                    className="pl-10"
                                 />
                              </div>
                              <Button 
                                 type="button" 
                                 onClick={handleSaveFireworksAccountId}
                                 disabled={isSavingFireworksAccountId || !fireworksAccountIdInput}
                                 className="bg-orange-500 text-white hover:bg-orange-600"
                                 size="sm"
                              >
                                 {isSavingFireworksAccountId ? <Loader2 className=" mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                 {hasFireworksAccountId ? 'Update Saved ID' : 'Save Account ID'}
                              </Button>
                              {hasFireworksAccountId && showFireworksAccountIdInput && (
                                  <Button 
                                      type="button" 
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                          setShowFireworksAccountIdInput(false);
                                          setFireworksAccountIdInput('');
                                      }}
                                      disabled={isSavingFireworksAccountId}
                                  >
                                      Cancel Update
                                  </Button>
                              )}
                              <p className="text-xs text-muted-foreground pt-1">
                                  Your Account ID will be securely encrypted before saving.
                              </p>
                          </div>
                       )}
                       {!hasFireworksAccountId && (
                          <p className="text-xs text-amber-600 flex items-center gap-1 pt-1">
                              <AlertCircle className="h-3 w-3"/> You must save your Account ID to use Fireworks fine-tuning.
                          </p>
                       )}
                    </div>
                 </CardContent>
              </TabsContent>
              
            </Tabs>
          </CardContent>
          
          <CardFooter className="flex justify-center border-t pt-6">
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              Back to Dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    </TooltipProvider>
  );
} 
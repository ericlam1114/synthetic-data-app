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
    Info
} from "lucide-react";
import { useToast } from "../../../hooks/use-toast";
import { supabase } from "../../../lib/supabaseClient";
import { 
    Tooltip, 
    TooltipContent, 
    TooltipProvider, 
    TooltipTrigger 
} from "../../../components/ui/tooltip";
import { Tabs, TabsContent } from "../../../components/ui/tabs";

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
  
  // State for API Key management
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);
  const [isRemovingKey, setIsRemovingKey] = useState(false);
  
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    const loadInitialData = async () => {
        setIsCheckingKey(true);
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

            // Check API key status
            const apiKeyRes = await fetch('/api/user/api-key');
            if (!apiKeyRes.ok) throw new Error('Failed to check API key status');
            const apiKeyData = await apiKeyRes.json();
            if (isMounted) {
                setHasApiKey(apiKeyData.hasApiKey);
            }

        } catch (err) {
            if (isMounted) {
                console.error("Initial load error:", err);
                toast({ title: "Error Loading Profile Data", description: err.message, variant: "destructive" });
                 // Don't redirect here, user might still be logged in but API key check failed
            }
        } finally {
            if (isMounted) setIsCheckingKey(false);
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

  // --- New Handler to Remove API Key ---
  const handleRemoveApiKey = async () => {
      if (!confirm('Are you sure you want to remove your stored OpenAI API key? You will need to re-enter it to start new fine-tuning jobs.')) {
          return;
      }
      setIsRemovingKey(true);
      setFormError(null);
      try {
          const response = await fetch('/api/user/api-key', {
              method: 'DELETE',
          });
          if (!response.ok) {
              const result = await response.json().catch(() => ({})); // Try to get error message
              throw new Error(result.message || 'Failed to remove API key');
          }
          toast({ title: "API Key Removed Successfully" });
          setHasApiKey(false); // Update state to reflect removal
      } catch (err) {
          console.error("Remove API key error:", err);
          setFormError(err.message);
          toast({ title: "Error Removing Key", description: err.message, variant: "destructive" });
      } finally {
          setIsRemovingKey(false);
      }
  };

  if (loading || isCheckingKey) { // Show loading if either profile or key check is pending
    return (
      <div className="container mx-auto py-10 max-w-xl flex items-center justify-center min-h-[60vh]">
        <Card className="w-full text-center">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading profile...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Calculate initials using standard function
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
              {/* API Key Management Tab */}
              <TabsContent value="api-key">
                <CardHeader>
                  <CardTitle>OpenAI API Key</CardTitle>
                  <CardDescription>
                    Manage your OpenAI API key for fine-tuning jobs. It&apos;s stored securely.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4 border p-4 rounded-md">
                    <div className="flex items-center justify-between">
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
                    </div>

                    {hasApiKey ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-md border border-green-200">
                          <CheckCircle className="h-4 w-4"/>
                          <span>API Key is securely stored.</span>
                        </div>
                        <Button 
                          variant="destructive"
                          size="sm"
                          onClick={handleRemoveApiKey}
                          disabled={isRemovingKey}
                          className="w-full md:w-auto"
                        >
                          {isRemovingKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                          Remove Stored Key
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          You haven&apos;t saved an OpenAI API key yet. You can add one here or when you start your first fine-tuning job.
                        </p>
                        <Button 
                          type="button" 
                          variant="secondary"
                          onClick={() => router.push('/dashboard/fine-tune/new')} 
                        >
                          Add API Key Now
                        </Button>
                      </div>
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
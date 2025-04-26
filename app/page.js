"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Separator } from "../components/ui/separator";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { useToast } from "../hooks/use-toast";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState(null);
  
  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        throw error;
      }
      
      toast({
        title: "Login successful",
        description: "Welcome back!",
      });
      
      router.push("/dashboard");
    } catch (error) {
      console.error('Error logging in:', error);
      setError(error.message);
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSignup = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
          }
        }
      });
      
      if (error) {
        throw error;
      }
      
      toast({
        title: "Sign up successful",
        description: "Please check your email for the confirmation link.",
      });
      
      // Redirect to dashboard if auto-confirm is enabled or redirect to a confirmation page
      if (data.session) {
        router.push("/dashboard");
      }
    } catch (error) {
      console.error('Error signing up:', error);
      setError(error.message);
      toast({
        title: "Sign up failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
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
                    {error && (
                      <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                        <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                        <p>{error}</p>
                      </div>
                    )}
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
                    {error && (
                      <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                        <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                        <p>{error}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="first-name">First name</Label>
                        <input
                          id="first-name"
                          type="text"
                          className="w-full rounded-md border border-input px-3 py-2 text-sm"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="last-name">Last name</Label>
                        <input
                          id="last-name"
                          type="text"
                          className="w-full rounded-md border border-input px-3 py-2 text-sm"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
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
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <input
                        id="signup-password"
                        type="password"
                        className="w-full rounded-md border border-input px-3 py-2 text-sm"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
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
            <p>Sign up with the form above to create your account</p>
            <p className="mt-2">Or use the demo credentials:</p>
            <p className="font-medium">Email: demo@example.com | Password: demopassword</p>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, Star, Loader2 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState(null);
  
  useEffect(() => {
    const checkSession = async () => {
      console.log("[Home Page] Checking session on load...");
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        console.log("[Home Page] Session check result:", { hasSession: !!session, sessionError });
        if (sessionError) {
           console.error("[Home Page] Error checking session:", sessionError);
           return;
        }
        if (session?.user) {
          console.log("[Home Page] User already authenticated, redirecting to /dashboard");
          router.push('/dashboard');
        } else {
          console.log("[Home Page] No active session found on load.");
        }
      } catch (error) {
        console.error("[Home Page] Exception during session check:", error);
      }
    };
    
    checkSession();
  }, [router]);

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

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setError(null);
    try {
      const getRedirectURL = () => {
        let url = process?.env?.NEXT_PUBLIC_SITE_URL ??
                  process?.env?.NEXT_PUBLIC_VERCEL_URL ??
                  'http://localhost:3000/'
        url = url.includes('http') ? url : `https://${url}`
        url = url.charAt(url.length - 1) === '/' ? url : `${url}/`
        url = `${url}auth/callback`
        return url
      }
      const redirectURL = getRedirectURL();
      console.log("[Google Sign-In] Using redirect URL:", redirectURL);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectURL,
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error signing in with Google:', error);
      setError(error.message);
      toast({ title: "Google Sign-In Failed", description: error.message, variant: "destructive" });
      setIsGoogleLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      toast({ title: "Email Required", description: "Please enter your email address first.", variant: "warning" });
      return;
    }
    setIsResetLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });
      if (error) throw error;
      toast({ title: "Password Reset Email Sent", description: "Check your email for instructions to reset your password." });
    } catch (error) {
      console.error('Error sending password reset:', error);
      setError(error.message);
      toast({ title: "Password Reset Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsResetLoading(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center py-6 px-2  sm:px-6 lg:px-8 bg-white">
      <div className="mx-auto w-full max-w-md space-y-8">
      
        <div className="text-center">
        <div className="flex items-center justify-center">
            <Link
              href="/"
              className="flex items-center hover:opacity-90 transition-opacity"
            >
              <Image
                src="/converted_pyramid_logo.svg"
                alt="Trainified Logo"
                width={32}
                height={32}
                className="mr-2 h-12 w-auto"
              />
              <span className="font-bold text-5xl tracking-tight">
                trainified
              </span>
            </Link>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 mb-4 mt-2 sm:flex-row sm:gap-4">
           
            <h1 className="text-xl  tracking-tight text-black sm:text-2xl">
              Train AI models on your data
            </h1>
          </div>
          <div className="">
            <div className="mt-6 flex flex-col sm:flex-row justify-center items-center gap-2 sm:gap-3">
              <div className="flex items-center space-x-1">
                {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 text-yellow-400 fill-yellow-400" />
                ))}
              </div>
              <p className="text-sm text-gray-500 italic">
                 &quot;High-quality training data 10x faster!&quot;
              </p>
            </div>
          </div>
        </div>

        <Card className="w-full shadow-xl">
          <div className="px-6 pt-6">
            <Button 
              variant="outline" 
              className="w-full flex items-center justify-center" 
              onClick={handleGoogleSignIn} 
              disabled={isLoading || isGoogleLoading || isResetLoading}
            >
              {isGoogleLoading ? (
                 <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 
              ) : (
                <Image 
                   src="/Google__G__logo.svg"
                   alt="Google logo"
                   width={16}
                   height={16}
                   className="mr-2"
                 />
              )}
              Login with Google
            </Button>
          </div>

          <div className="my-4 flex items-center px-6">
              <div className="flex-grow border-t border-gray-300"></div>
              <span className="mx-4 flex-shrink text-gray-500 text-sm">or</span>
              <div className="flex-grow border-t border-gray-300"></div>
          </div>

          <Tabs defaultValue="login" className="w-full px-4">
            <TabsList className="grid w-full grid-cols-2 ">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin}>
                <CardContent className="pt-6">
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
                        className="w-full rounded-md border border-input px-3 py-2 text-sm focus:ring-black focus:border-black"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        <button 
                          type="button" 
                          onClick={handlePasswordReset}
                          disabled={isResetLoading || !email}
                          className="text-xs underline text-black hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <input
                        id="password"
                        type="password"
                        className="w-full rounded-md border border-input px-3 py-2 text-sm focus:ring-black focus:border-black"
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
                    className="w-full bg-black text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
                    disabled={isLoading}
                  >
                    {isLoading ? "Logging in..." : "Login"}
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignup}>
                <CardContent className="pt-6">
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
                          className="w-full rounded-md border border-input px-3 py-2 text-sm focus:ring-black focus:border-black"
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
                          className="w-full rounded-md border border-input px-3 py-2 text-sm focus:ring-black focus:border-black"
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
                        className="w-full rounded-md border border-input px-3 py-2 text-sm focus:ring-black focus:border-black"
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
                        className="w-full rounded-md border border-input px-3 py-2 text-sm focus:ring-black focus:border-black"
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
                    className="w-full bg-black text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
                    disabled={isLoading}
                  >
                    {isLoading ? "Creating account..." : "Create account"}
                  </Button>
                  <p className="mt-4 text-xs text-center text-gray-500">
                    By creating an account, you agree to our{" "}
                    <Link href="https://www.trainified.com/terms" target="_blank" rel="noopener noreferrer" className="underline text-black hover:text-gray-700">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="https://www.trainified.com/privacy" target="_blank" rel="noopener noreferrer" className="underline text-black hover:text-gray-700">
                      Privacy Policy
                    </Link>
                    .
                  </p>
                </CardFooter>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}

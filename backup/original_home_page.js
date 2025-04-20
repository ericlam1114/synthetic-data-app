"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Separator } from "../components/ui/separator";
import Link from "next/link";

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const handleLogin = (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Mock login - in a real app this would authenticate with a backend
    setTimeout(() => {
      setIsLoading(false);
      router.push("/dashboard");
    }, 1000);
  };
  
  const handleSignup = (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Mock signup - in a real app this would register with a backend
    setTimeout(() => {
      setIsLoading(false);
      router.push("/dashboard");
    }, 1000);
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="first-name">First name</Label>
                        <input
                          id="first-name"
                          type="text"
                          className="w-full rounded-md border border-input px-3 py-2 text-sm"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="last-name">Last name</Label>
                        <input
                          id="last-name"
                          type="text"
                          className="w-full rounded-md border border-input px-3 py-2 text-sm"
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
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <input
                        id="signup-password"
                        type="password"
                        className="w-full rounded-md border border-input px-3 py-2 text-sm"
                        required
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
            <p>Demo credentials:</p>
            <p className="font-medium">Email: demo@example.com | Password: demopassword</p>
          </div>
        </div>
      </div>
    </div>
  );
}

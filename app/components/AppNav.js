"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "../../components/ui/button";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { UserCircle, LogOut } from "lucide-react";
import { useToast } from "../../hooks/use-toast";
import { supabase } from "../../lib/supabaseClient";
import Image from "next/image";

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Determine if we're currently on specific pages
  const isUploadPage = pathname === "/dashboard/upload";
  const isDashboardPage = pathname === "/dashboard";
  const isDatasetsPage = pathname === "/dashboard/datasets";
  const isModelsPage = pathname === "/dashboard/models";
  const isProfilePage = pathname === "/dashboard/profile";
  
  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;
        
        if (session?.user) {
          setUser(session.user);
        } else {
          // If no session, redirect to login
          router.push('/');
        }
      } catch (error) {
        console.error('Error getting auth session:', error);
      } finally {
        setLoading(false);
      }
    };
    
    getUser();
    
    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          router.push('/');
        } else if (session?.user) {
          setUser(session.user);
        }
      }
    );
    
    return () => {
      if (authListener && authListener.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, [router]);
  
  // Function to handle logout
  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) throw error;
      
      toast({
        title: "Signed Out",
        description: "You have been successfully signed out.",
      });
      
      router.push('/');
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: "Sign Out Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };
  
  // Get user's display name and initials
  const userEmail = user?.email || '';
  const firstName = user?.user_metadata?.first_name || '';
  const lastName = user?.user_metadata?.last_name || '';
  const displayName = firstName ? (lastName ? `${firstName} ${lastName}` : firstName) : userEmail.split('@')[0];
  // Standard Shadcn Avatar initials calculation
  const getInitials = (name) => {
    if (!name) return "?";
    const parts = name.split(" ").filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };
  const initials = getInitials(displayName);

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="container mx-auto px-4 pb-4 -mt-2 flex justify-between items-center">
        <div className="flex items-center">
          <a
            href="/dashboard"
            className="flex items-center hover:opacity-90 transition-opacity"
          >
            <Image
              src="/converted_pyramid_logo.svg"
              alt="Trainified Logo"
              width={32}
              height={32}
              className="mr-2 h-8 w-auto"
            />
            <span className="font-bold text-3xl tracking-tight">
              trainified
            </span>
          </a>
        </div>
        
        {/* Mobile menu button */}
        <div className="md:hidden">
          <button 
            onClick={toggleMobileMenu}
            className="flex items-center p-2 rounded-md hover:bg-gray-100"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-6 w-6" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} 
              />
            </svg>
          </button>
        </div>
        
        {/* Desktop Navigation - centered */}
        <nav className="hidden md:flex space-x-4 absolute left-1/2 transform -translate-x-1/2">
          <Link 
            href="/dashboard" 
            className={`px-3 py-2 rounded-md ${isDashboardPage ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
            Dashboard
          </Link>
          <Link 
            href="/dashboard/upload" 
            className={`px-3 py-2 rounded-md ${isUploadPage ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
            Upload
          </Link>
            <Link 
              href="/dashboard/datasets" 
              className={`px-3 py-2 rounded-md ${isDatasetsPage ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
              Datasets
            </Link>
            <Link 
              href="/dashboard/models" 
              className={`px-3 py-2 rounded-md ${isModelsPage ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
              Models
            </Link>
        </nav>
        
        {/* User profile and logout - desktop */}
        <div className="hidden md:flex items-center space-x-3">
          <Link href="/dashboard/profile" className="flex items-center gap-2 hover:bg-gray-50 p-2 rounded-md">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{displayName}</span>
          </Link>
          <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1">
            <LogOut className="h-3.5 w-3.5" />
            <span>Logout</span>
          </Button>
        </div>
        
        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-16 left-0 right-0 bg-white z-50 shadow-lg py-2 px-4 border-t border-gray-200">
            <nav className="flex flex-col space-y-2">
              <Link 
                href="/dashboard" 
                onClick={() => setMobileMenuOpen(false)}
                className={`px-3 py-2 rounded-md ${isDashboardPage ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                Dashboard
              </Link>
              <Link 
                href="/dashboard/upload" 
                onClick={() => setMobileMenuOpen(false)}
                className={`px-3 py-2 rounded-md ${isUploadPage ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                Upload
              </Link>
              <Link 
                href="/dashboard/datasets" 
                onClick={() => setMobileMenuOpen(false)}
                className={`px-3 py-2 rounded-md ${isDatasetsPage ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                Datasets
              </Link>
              <Link 
                href="/dashboard/models" 
                onClick={() => setMobileMenuOpen(false)}
                className={`px-3 py-2 rounded-md ${isModelsPage ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                Models
              </Link>
              <div className="pt-3 border-t border-gray-200 mt-2">
                <Link
                  href="/dashboard/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center px-3 py-2 rounded-md mb-2 ${isProfilePage ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                >
                  <Avatar className="h-6 w-6 mr-2">
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium">{displayName}</div>
                    <div className="text-xs text-muted-foreground">{userEmail}</div>
                  </div>
                </Link>
                <Button variant="outline" onClick={handleLogout} className="w-full gap-2">
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
} 
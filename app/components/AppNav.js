"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "../../components/ui/button";

export default function AppNav() {
  const pathname = usePathname();
  const [userName, setUserName] = useState("User");
  
  // Determine if we're currently on the dashboard or upload page
  const isUploadPage = pathname === "/dashboard/upload";
  const isDashboardPage = pathname === "/dashboard";
  
  // Function to handle logout
  const handleLogout = () => {
    // In a real app, this would clear auth tokens, etc.
    window.location.href = "/";
  };

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-8">
          <Link href="/dashboard" className="font-bold text-xl">Synthetic Data App</Link>
          
          <nav className="hidden md:flex space-x-4">
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
          </nav>
        </div>
        
        <div className="flex items-center space-x-4">
          <span className="hidden md:inline text-sm text-gray-600">Welcome, {userName}</span>
          <Button variant="outline" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
} 
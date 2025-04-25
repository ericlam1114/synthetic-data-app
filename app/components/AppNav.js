"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "../../components/ui/button";
import Image from "next/image";

export default function AppNav() {
  const pathname = usePathname();
  const [userName, setUserName] = useState("User");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Determine if we're currently on the dashboard or upload page
  const isUploadPage = pathname === "/dashboard/upload";
  const isDashboardPage = pathname === "/dashboard";
  const isDatasetsPage = pathname === "/dashboard/datasets";
  const isModelsPage = pathname === "/dashboard/models";
  // Function to handle logout
  const handleLogout = () => {
    // In a real app, this would clear auth tokens, etc.
    window.location.href = "/";
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="container mx-auto px-4 pb-4 flex justify-between items-center">
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
        
        <div className="hidden md:flex items-center space-x-4">
          <span className="text-sm text-gray-600">Welcome, {userName}</span>
          <Button variant="outline" onClick={handleLogout}>
            Logout
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
              <div className="pt-2 border-t border-gray-200 mt-2">
                <div className="text-sm text-gray-600 mb-2">Welcome, {userName}</div>
                <Button variant="outline" onClick={handleLogout} className="w-full">
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
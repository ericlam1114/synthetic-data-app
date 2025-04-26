"use client";

import AppNav from "../components/AppNav";

export default function DashboardLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col ">
      <AppNav />
      <main className="flex-1 py-6">
        {children}
      </main>
    </div>
  );
} 
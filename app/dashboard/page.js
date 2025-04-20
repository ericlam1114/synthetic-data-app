"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import Link from "next/link";

export default function Dashboard() {
  const [userName, setUserName] = useState("User");

  return (
    <div className="container mx-auto py-10 max-w-5xl">
      <h1 className="text-3xl font-bold mb-8">Welcome to your Dashboard, {userName}</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <Card>
          <CardHeader>
            <CardTitle>Upload Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4">Upload and process documents to generate synthetic data.</p>
            <Link href="/dashboard/upload">
              <Button className="w-full bg-black text-white hover:bg-black/90">
                Go to Upload Page
              </Button>
            </Link>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">No recent activity to display.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Your Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">You don't have any saved projects yet.</p>
            <Button variant="outline" className="w-full">Create New Project</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 
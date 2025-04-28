"use client";

import { useState } from 'react';
import AppNav from "../components/AppNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription,
    DialogFooter,
    DialogClose
} from "@/components/ui/dialog";
import { HelpCircle, Send, Loader2, Bot } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function DashboardLayout({ children }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const handleSendMessage = async () => {
      if (!chatMessage.trim()) {
          toast({ title: "Message cannot be empty", variant: "warning" });
          return;
      }
      setIsSending(true);
      try {
          const response = await fetch('/api/support/send-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: chatMessage }),
          });

          const result = await response.json();

          if (!response.ok) {
              throw new Error(result.message || "Failed to send message");
          }

          toast({ 
              title: "Message Sent!", 
              description: "Thanks for reaching out! We'll respond to your registered email address shortly."
          });
          setChatMessage('');
          setIsChatOpen(false);

      } catch (error) {
          console.error("Error sending message:", error);
          toast({ title: "Error", description: error.message, variant: "destructive" });
      } finally {
          setIsSending(false);
      }
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      <AppNav />
      <main className="flex-1 py-6">
        {children}
      </main>

      <Button 
        variant="default" 
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 bg-black hover:bg-black" 
        onClick={() => setIsChatOpen(true)}
        aria-label="Open help chat"
      >
        <HelpCircle className="h-7 w-7 text-white" />
      </Button>

      <Dialog open={isChatOpen} onOpenChange={setIsChatOpen}>
        <DialogContent className="sm:max-w-md p-0 flex flex-col h-[70vh] max-h-[600px]">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="flex items-center gap-2">
               <Bot className="h-5 w-5"/> Support Assistant
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-grow p-4 space-y-4 overflow-y-auto">
             <div className="flex justify-start">
                 <div className="bg-muted text-muted-foreground rounded-lg p-3 max-w-[80%]">
                     <p className="text-sm">
                         Hi there! 👋 This is a bot speaking! I'm here to answer your questions.
                     </p>
                     <p className="text-sm mt-2">
                         If you need more help, just send your message and our team will review your matter via email as soon as possible!
                     </p>
                 </div>
             </div>
             <div className="flex justify-start">
                  <div className="bg-muted text-muted-foreground rounded-lg p-3 max-w-[80%]">
                     <p className="text-sm font-medium">
                         So, what brings you here today?
                     </p>
                  </div>
             </div>
          </div>

          <div className="p-4 border-t flex items-center gap-2">
            <Textarea
              id="chat-message"
              placeholder="Ask a question..."
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              rows={1}
              className="flex-grow resize-none min-h-[40px] max-h-[100px]"
              disabled={isSending}
            />
            <Button 
               onClick={handleSendMessage} 
               disabled={isSending || !chatMessage.trim()} 
               size="icon" 
               className="flex-shrink-0 bg-black hover:bg-gray-800"
               aria-label="Send message"
            >
               {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
} 
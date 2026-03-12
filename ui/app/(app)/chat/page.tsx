"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function ChatPage() {
  const router = useRouter();

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:h-screen items-center justify-center p-4">
      <div className="max-w-md text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Medical AI Assistant</h1>
          <p className="text-muted-foreground">
            Start a new conversation or select one from the sidebar
          </p>
        </div>
        <Button size="lg" onClick={() => router.push("/chat/new")}>
          <Plus className="h-5 w-5 mr-2" />
          New Chat
        </Button>
      </div>
    </div>
  );
}

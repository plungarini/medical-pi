"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChatAssistant } from "@/components/chat/ChatAssistant";
import { ChatSearchBar } from "@/components/chat/ChatSearchBar";
import { sessionsApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

export default function NewChatPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const sessionCreatedRef = useRef(false);

  useEffect(() => {
    if (sessionCreatedRef.current) return;
    sessionCreatedRef.current = true;

    // Create session immediately when /chat/new is accessed
    sessionsApi.create()
      .then((session) => {
        console.log("[NewChat] Created session:", session.id);
        setSessionId(session.id);
        setLoading(false);
        // Navigate to the session URL (shallow navigation to keep component mounted)
        router.replace(`/chat/${session.id}`, { scroll: false });
      })
      .catch((error) => {
        console.error("[NewChat] Failed to create session:", error);
        setLoading(false);
      });
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:h-screen p-4">
        <Skeleton className="h-6 w-48 mb-4" />
        <div className="flex-1 space-y-4">
          <Skeleton className="h-20 w-3/4" />
          <Skeleton className="h-20 w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:h-screen">
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <h2 className="font-semibold truncate">New Chat</h2>
        <ChatSearchBar />
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatAssistant sessionId={sessionId} initialMessages={[]} />
      </div>
    </div>
  );
}

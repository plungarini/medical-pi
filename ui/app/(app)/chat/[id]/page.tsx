"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChatAssistant } from "@/components/chat/ChatAssistant";
import { sessionsApi } from "@/lib/api";
import type { Session } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatSearchBar } from "@/components/chat/ChatSearchBar";

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // For actual session IDs, fetch session data with messages
  useEffect(() => {
    if (!sessionId) return;
    sessionsApi.get(sessionId)
      .then((data) => {
        setSession(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [sessionId, router]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:h-screen p-4 space-y-4">
        <div className="border-b px-4 py-3 flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex-1 space-y-4">
          <Skeleton className="h-20 w-3/4" />
          <Skeleton className="h-20 w-1/2 ml-auto" />
          <Skeleton className="h-20 w-2/3" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:h-screen items-center justify-center">
        <p className="text-muted-foreground">Session not found</p>
      </div>
    );
  }

  // Extract messages if they exist in the session data
  const messages = ("messages" in session && Array.isArray(session.messages))
    ? session.messages
    : [];

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:h-screen">
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <h2 className="font-semibold truncate">{session.title || "Chat"}</h2>
        <ChatSearchBar />
      </div>
      <div className="flex-1 overflow-hidden">
        {/* Pass actual session ID and messages for initialization */}
        <ChatAssistant sessionId={session.id} initialMessages={messages} />
      </div>
    </div>
  );
}

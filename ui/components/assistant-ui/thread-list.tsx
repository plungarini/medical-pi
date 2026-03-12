"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sessionsApi } from "@/lib/api";
import type { Session } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ThreadList() {
  const router = useRouter();
  const pathname = usePathname();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Reload sessions when returning to a chat page (after creating new session)
  useEffect(() => {
    if (pathname.startsWith("/chat")) {
      loadSessions();
    }
  }, [pathname]);

  // Listen for real-time updates from SSE
  useEffect(() => {
    const handleUpdate = () => {
      loadSessions();
    };

    window.addEventListener("live:session:created", handleUpdate);
    window.addEventListener("live:session:updated", handleUpdate);
    window.addEventListener("live:session:deleted", handleUpdate);

    return () => {
      window.removeEventListener("live:session:created", handleUpdate);
      window.removeEventListener("live:session:updated", handleUpdate);
      window.removeEventListener("live:session:deleted", handleUpdate);
    };
  }, []);

  async function loadSessions() {
    try {
      setLoading(true);
      const data = await sessionsApi.list(1, 50);
      setSessions(data);
    } catch (error) {
      console.error("[ThreadList] Failed to load sessions:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleNewChat() {
    // Navigate to /chat/new - the ChatRuntimeProvider will handle session creation
    router.push("/chat/new");
  }

  async function handleDeleteSession(e: React.MouseEvent, sessionId: string) {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("Are you sure you want to delete this chat?")) {
      return;
    }

    try {
      await sessionsApi.delete(sessionId);
      // Remove from local state
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));

      // If we deleted the current session, navigate to /chat
      if (pathname === `/chat/${sessionId}`) {
        router.push("/chat");
      }
    } catch (error) {
      console.error("[ThreadList] Failed to delete session:", error);
      alert("Failed to delete chat");
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  }

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* New Chat Button */}
      <div className="p-2 border-b">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2"
          onClick={handleNewChat}
        >
          <Plus className="h-4 w-4" />
          <span>New Chat</span>
        </Button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto min-w-0">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            Loading chats...
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No chats yet. Start a new chat!
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-2">
            {sessions.map((session) => {
              const isActive = pathname === `/chat/${session.id}`;

              return (
                <Link
                  key={session.id}
                  href={`/chat/${session.id}`}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors relative",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="truncate font-medium">
                      {session.title || "Untitled Chat"}
                    </div>
                    <div className="truncate text-xs opacity-70">
                      {formatDate(session.createdAt)}
                    </div>
                  </div>
                  {/* Delete button - show on hover */}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={cn(
                      "h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity",
                      isActive && "opacity-100"
                    )}
                    onClick={(e) => handleDeleteSession(e, session.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

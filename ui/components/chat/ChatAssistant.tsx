"use client";

import { Thread } from "@/components/assistant-ui/thread";
import { ChatRuntimeProvider } from "./ChatRuntimeProvider";
import type { Message } from "@/lib/types";

interface ChatAssistantProps {
  sessionId?: string | null;
  initialMessages?: Message[];
}

// We will intercept the unified stream in the provider, but here we can just render the thread.
export const ChatAssistant = ({ sessionId, initialMessages }: ChatAssistantProps) => {
  return (
    <ChatRuntimeProvider sessionId={sessionId} initialMessages={initialMessages}>
      <div className="h-full relative">
        <Thread />
      </div>
    </ChatRuntimeProvider>
  );
};

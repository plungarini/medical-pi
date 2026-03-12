"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChat } from "@ai-sdk/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { DefaultChatTransport } from "ai";
import { getAuthToken } from "@/lib/api";
import type { Message } from "@/lib/types";

// Context to hold the current session ID
const SessionContext = createContext<string | null>(null);

// Hook to get the current session ID
export function useCurrentSessionId() {
  return useContext(SessionContext);
}

// Convert backend Message format to Vercel AI SDK CoreMessage format
function convertToAIStreamMessage(message: Message) {
  const parts: any[] = [];
  const content = message.content || "";
  
  // MedGemma uses <unused94> for thinking start, <unused95> for end
  const thoughtStart = "<unused94>";
  const thoughtEnd = "<unused95>";
  
  if (content.includes(thoughtStart)) {
    let remaining = content;
    while (remaining.includes(thoughtStart)) {
      const startIndex = remaining.indexOf(thoughtStart);
      const beforeThought = remaining.substring(0, startIndex);
      if (beforeThought) parts.push({ type: "text", text: beforeThought });
      
      const afterStart = remaining.substring(startIndex + thoughtStart.length);
      const endIndex = afterStart.indexOf(thoughtEnd);
      
      if (endIndex !== -1) {
        let thought = afterStart.substring(0, endIndex);
        // Robust cleaning: strip "thought" prefix and trim
        thought = thought.replace(/^thought\s*/i, "").trim();
        
        // Reasoning parts MUST have a 'text' property for assistant-ui and AI SDK
        parts.push({ type: "reasoning", text: thought });
        remaining = afterStart.substring(endIndex + thoughtEnd.length);
      } else {
        // Unclosed thought
        let thought = afterStart.replace(/^thought\s*/i, "").trim();
        parts.push({ type: "reasoning", text: thought });
        remaining = "";
      }
    }
    if (remaining) parts.push({ type: "text", text: remaining });
  } else {
    parts.push({ type: "text", text: content });
  }

  let metadata = message.metadata as any;
  if (typeof metadata === "string" && metadata.trim().startsWith("{")) {
    try {
      metadata = JSON.parse(metadata);
    } catch (e) {
      console.warn("[ChatRuntime] Failed to parse message metadata:", e);
    }
  }

  return {
    id: message.id,
    role: message.role as "user" | "assistant" | "system" | "data",
    content: content,
    parts,
    metadata,
  };
}

interface ChatRuntimeProviderProps {
  children: ReactNode;
  sessionId?: string | null;
  initialMessages?: Message[];
}

export function ChatRuntimeProvider({
  children,
  sessionId: initialSessionId,
  initialMessages = [],
}: ChatRuntimeProviderProps) {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(initialSessionId || null);

  // Initialize useChat hook with DefaultChatTransport (Required for AI SDK v6)
  const chat = useChat({
    transport: new DefaultChatTransport({
      api: "/api/server/chat",
      headers: {
        "Authorization": `Bearer ${getAuthToken()}`,
        "X-Session-Id": currentSessionId || "",
      } as any,
      body: {
        sessionId: currentSessionId,
      },
    }),
    initialMessages: initialMessages.map(msg => convertToAIStreamMessage(msg)) as any,
    onResponse(response: Response) {
      // Sync session ID from header if returned by backend
      const newSessionId = response.headers.get("X-Session-Id");
      if (newSessionId && newSessionId !== currentSessionId) {
        console.log("[ChatRuntime] Updating session ID from response:", newSessionId);
        setCurrentSessionId(newSessionId);
      }
    },
    onError(error: Error) {
      console.error("[ChatRuntime] Chat error:", error);
      // assistant-ui's ErrorPrimitive will show this if we don't handle it,
      // but the user wants it as an assistant response.
      // However, append() might be tricky here. 
      // Usually, just letting assistant-ui handle the error state is better, 
      // but we can customize the error message display in thread.tsx.
    }
  } as any);

  // Update session ID when it changes from props (e.g. after redirect)
  useEffect(() => {
    if (initialSessionId && initialSessionId !== currentSessionId) {
      console.log("[ChatRuntime] Syncing session ID from props:", initialSessionId);
      setCurrentSessionId(initialSessionId);
    }
  }, [initialSessionId, currentSessionId]);

  // Update initial messages when they change (e.g. navigation)
  useEffect(() => {
    if (initialMessages.length > 0) {
      chat.setMessages(initialMessages.map(convertToAIStreamMessage) as any);
    }
  }, [initialMessages]);

  const runtime = useAISDKRuntime(chat);

  return (
    <SessionContext.Provider value={currentSessionId}>
      <AssistantRuntimeProvider runtime={runtime}>
        {children}
      </AssistantRuntimeProvider>
    </SessionContext.Provider>
  );
}

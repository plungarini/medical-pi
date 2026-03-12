"use client";

import { useEffect, useRef } from "react";

export function useLiveEvents() {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      // EventSource naturally sends cookies to same-origin requests
      const sse = new EventSource("/api/server/events", { withCredentials: true });
      eventSourceRef.current = sse;

      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event) {
            // Dispatch a custom event on the window object
            // This allows any component to listen for real-time DB changes
            window.dispatchEvent(new CustomEvent(`live:${data.event}`, { detail: data.data }));
          }
        } catch (e) {
          console.error("Failed to parse SSE live event data:", e);
        }
      };

      sse.onerror = () => {
        sse.close();
        // Reconnect after 3 seconds upon error/disconnect
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);
}

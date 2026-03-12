"use client";

import { useEffect } from "react";

/**
 * Suppresses hydration warnings caused by browser extensions (Dark Reader, etc.)
 * by patching console.error and console.warn to filter out known extension-related warnings.
 */
export function HydrationSuppressor() {
  useEffect(() => {
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    const isDarkReaderHydrationError = (args: unknown[]): boolean => {
      const message = args.join(" ").toLowerCase();
      return (
        message.includes("hydration") &&
        (
          message.includes("data-darkreader") ||
          message.includes("--darkreader") ||
          message.includes("darkreader-inline")
        )
      );
    };
    
    console.error = function(...args: unknown[]) {
      if (isDarkReaderHydrationError(args)) {
        return; // Silently ignore
      }
      originalConsoleError.apply(console, args);
    };
    
    console.warn = function(...args: unknown[]) {
      if (isDarkReaderHydrationError(args)) {
        return; // Silently ignore
      }
      originalConsoleWarn.apply(console, args);
    };

    return () => {
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
    };
  }, []);

  return null;
}

import { randomUUID } from "node:crypto";

const LOGGER_PI_URL = process.env.LOGGER_PI_URL ?? "http://127.0.0.1:4000";
const SERVICE_NAME = process.env.LOGGER_PI_SERVICE_NAME ?? "medical-pi";

interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  message: string;
  metadata?: Record<string, unknown>;
  projectId: string;
}

// In-memory log buffer
const logBuffer: LogEntry[] = [];
let flushTimer: NodeJS.Timeout | null = null;

// Store original console methods at module load time
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function createLogEntry(
  level: string,
  message: string,
  ...args: unknown[]
): LogEntry {
  const metadata: Record<string, unknown> | undefined =
    args.length > 0
      ? args.reduce((acc: Record<string, unknown>, arg, i) => {
          acc[`arg${i}`] = arg;
          return acc;
        }, {})
      : undefined;

  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    message: typeof message === "string" ? message : String(message),
    metadata,
    projectId: SERVICE_NAME,
  };
}

async function flushLogs(): Promise<void> {
  if (logBuffer.length === 0) return;

  const logsToSend = [...logBuffer];
  logBuffer.length = 0; // Clear buffer

  try {
    await fetch(`${LOGGER_PI_URL}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logsToSend),
    });
  } catch {
    // Silently drop logs if logger-pi is unavailable
    // This is by design to avoid affecting the main service
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushLogs();
  }, 500);
}

export function log(level: string, message: string, ...args: unknown[]): void {
  const entry = createLogEntry(level, message, ...args);
  logBuffer.push(entry);
  scheduleFlush();

  // Output to console using ORIGINAL console methods (not intercepted ones)
  // This prevents infinite recursion when interceptConsole() is active
  const consoleMethod =
    level === "ERROR"
      ? originalError
      : level === "WARN"
      ? originalWarn
      : originalLog;
  consoleMethod(`[${level}] ${message}`, ...args);
}

export const logger = {
  debug: (message: string, ...args: unknown[]) => log("DEBUG", message, ...args),
  info: (message: string, ...args: unknown[]) => log("INFO", message, ...args),
  warn: (message: string, ...args: unknown[]) => log("WARN", message, ...args),
  error: (message: string, ...args: unknown[]) => log("ERROR", message, ...args),
  flush: flushLogs,
};

// Graceful shutdown handler
export async function flushOnShutdown(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushLogs();
}

// Track if we've already intercepted to prevent double-interception
let isConsoleIntercepted = false;

// Intercept console methods for automatic logging
export function interceptConsole(): void {
  // Prevent double-interception which would cause duplicate logs
  if (isConsoleIntercepted) {
    return;
  }
  isConsoleIntercepted = true;

  console.log = (...args: unknown[]) => {
    if (args[0] && typeof args[0] === "string") {
      log("INFO", args[0], ...args.slice(1));
    } else {
      // If first arg isn't a string, just pass to original
      originalLog(...args);
    }
  };

  console.error = (...args: unknown[]) => {
    if (args[0] && typeof args[0] === "string") {
      log("ERROR", args[0], ...args.slice(1));
    } else {
      originalError(...args);
    }
  };

  console.warn = (...args: unknown[]) => {
    if (args[0] && typeof args[0] === "string") {
      log("WARN", args[0], ...args.slice(1));
    } else {
      originalWarn(...args);
    }
  };
}

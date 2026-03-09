// A global logger client that intercepts standard console calls,
// batches them, and asynchronously flushes them to the logger-pi service.

import 'dotenv/config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  meta?: unknown;
}

class LoggerClient {
  private logs: LogEntry[] = [];
  private readonly history: string[] = [];
  private readonly projectId = process.env.LOGGER_PI_SERVICE_NAME || 'medical-pi';
  private readonly endpoint = process.env.LOGGER_PI_URL || 'http://127.0.0.1:4000/logs';
  private interval: NodeJS.Timeout | null = null;
  private flushing = false;

  // Keep references to original console methods so we can mirror to terminal
  private readonly origLog = console.log;
  private readonly origWarn = console.warn;
  private readonly origError = console.error;
  private readonly origInfo = console.info;
  private readonly origDebug = console.debug;

  constructor() {
    // Override global console methods
    console.log = (...args: unknown[]) => {
      this.origLog(...args);
      this.queue('info', args);
    };
    console.info = (...args: unknown[]) => {
      this.origInfo(...args);
      this.queue('info', args);
    };
    console.warn = (...args: unknown[]) => {
      this.origWarn(...args);
      this.queue('warn', args);
    };
    console.error = (...args: unknown[]) => {
      this.origError(...args);
      this.queue('error', args);
    };
    console.debug = (...args: unknown[]) => {
      this.origDebug(...args);
      this.queue('debug', args);
    };

    // Flush every 500ms
    this.interval = setInterval(() => this.flush(), 500);

    // Catch uncaught exceptions and flush immediately
    process.on('uncaughtException', (err) => {
      this.origError('Uncaught Exception:', err);
      this.queue('fatal', [err.stack || err.message || String(err)]);
      this.flushSync();
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      this.origError('Unhandled Rejection:', reason);
      const msg = reason instanceof Error ? reason.stack || reason.message : String(reason);
      this.queue('fatal', [msg]);
      this.flushSync();
      process.exit(1);
    });
  }

  private queue(level: LogLevel, args: unknown[]) {
    const message = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');

    this.logs.push({
      level,
      timestamp: new Date().toISOString(),
      message,
    });

    // Also push to persistent history for UI
    this.history.push(message);
    if (this.history.length > 50) {
      this.history.shift();
    }

    // Defend against memory leaks if logger-pi is completely dead
    if (this.logs.length > 5000) {
      this.logs = this.logs.slice(-1000); // keep last 1000 only
    }
  }

  public async flush(): Promise<void> {
    if (this.flushing || this.logs.length === 0) return;
    this.flushing = true;

    const batch = [...this.logs];
    this.logs = []; // clear queue

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: this.projectId, logs: batch }),
      });
    } catch (err) {
      // If logger-pi is down, just silently drop or re-queue.
      // We'll re-queue a limited amount so we don't leak memory.
      this.logs = [...batch, ...this.logs].slice(-5000);
      // intentionally swallowed to prevent logger failure from crashing app
    } finally {
      this.flushing = false;
    }
  }

  // Used during crash scenarios where we must block before exit
  private flushSync(): void {
    if (this.logs.length === 0) return;
    try {
      // Fire off the promise - in a real fatal crash, it might not finish
      fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: this.projectId, logs: this.logs }),
      }).catch(() => {});
    } catch (e) {
      // Intentionally empty for sync flush cleanup
    }
  }

  public getRecentLogs(limit = 20): string[] {
    return this.history.slice(-limit);
  }

  public info(...args: unknown[]): void {
    this.origInfo(...args);
    this.queue('info', args);
  }

  public warn(...args: unknown[]): void {
    this.origWarn(...args);
    this.queue('warn', args);
  }

  public error(...args: unknown[]): void {
    this.origError(...args);
    this.queue('error', args);
  }

  public debug(...args: unknown[]): void {
    this.origDebug(...args);
    this.queue('debug', args);
  }

  public async close(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
    }
    await this.flush();
  }
}

// Instantiate exactly once to bind the global hooks
export const globalLogger = new LoggerClient();

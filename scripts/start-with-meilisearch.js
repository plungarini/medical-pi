#!/usr/bin/env node

/**
 * Production Startup Script
 * 
 * Starts Meilisearch (if not running), then starts the UI and API servers.
 * Works on Windows, Linux, and macOS.
 */

import { spawn, exec } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { promisify } from "node:util";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const IS_WINDOWS = os.platform() === "win32";

const execAsync = promisify(exec);

// Colors for output
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

function log(service, message) {
  const color = service === "UI" ? CYAN : service === "API" ? GREEN : service === "ERROR" ? RED : YELLOW;
  console.log(`${color}[${service}]${RESET} ${message}`);
}

/**
 * Check if a port is in use
 */
async function isPortInUse(port) {
  try {
    if (IS_WINDOWS) {
      const { stdout } = await execAsync(`netstat -an | findstr ":${port}" | findstr "LISTENING"`);
      return stdout.trim().length > 0;
    } else {
      const { stdout } = await execAsync(`lsof -i :${port} -t 2>/dev/null || netstat -an 2>/dev/null | grep ":${port} " | grep LISTEN`);
      return stdout.trim().length > 0;
    }
  } catch {
    return false;
  }
}

/**
 * Kill process using a port
 */
async function killProcessOnPort(port) {
  try {
    if (IS_WINDOWS) {
      // Find PID using the port and kill it
      const { stdout } = await execAsync(`for /f "tokens=5" %a in ('netstat -ano ^| findstr ":${port}" ^| findstr "LISTENING"') do @echo %a`);
      const pids = stdout.trim().split('\n').filter(pid => pid.trim());
      for (const pid of pids) {
        if (pid && !isNaN(parseInt(pid))) {
          try {
            await execAsync(`taskkill /F /PID ${pid} 2>nul`);
            log("MAIN", `Killed process ${pid} using port ${port}`);
          } catch {
            // Ignore errors
          }
        }
      }
    } else {
      const { stdout } = await execAsync(`lsof -i :${port} -t 2>/dev/null`);
      const pids = stdout.trim().split('\n').filter(pid => pid.trim());
      for (const pid of pids) {
        if (pid) {
          try {
            await execAsync(`kill -9 ${pid} 2>/dev/null`);
            log("MAIN", `Killed process ${pid} using port ${port}`);
          } catch {
            // Ignore errors
          }
        }
      }
    }
    // Wait a moment for the port to be released
    await new Promise(r => setTimeout(r, 1000));
  } catch {
    // Port might not be in use
  }
}

/**
 * Check if Meilisearch is running
 */
async function isMeilisearchRunning() {
  try {
    const MEILI_HOST = process.env.MEILISEARCH_HOST || "http://127.0.0.1:7700";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    const response = await fetch(`${MEILI_HOST}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Start Meilisearch in background
 */
async function startMeilisearch() {
  if (await isMeilisearchRunning()) {
    log("MEILI", "Already running ✓");
    return null;
  }

  log("MEILI", "Starting...");
  
  const meiliProcess = spawn("node", [join(__dirname, "start-meilisearch.js")], {
    stdio: "inherit",
    cwd: ROOT_DIR,
    env: process.env,
  });

  return new Promise((resolve, reject) => {
    meiliProcess.on("exit", (code) => {
      if (code === 0) {
        resolve(null);
      } else {
        reject(new Error(`Meilisearch starter exited with code ${code}`));
      }
    });
  });
}

/**
 * Start a service and return the process
 */
function startService(name, command, args, cwd, env = process.env) {
  log(name, `Starting: ${command} ${args.join(" ")}`);
  
  const proc = spawn(command, args, {
    stdio: "inherit",
    cwd: cwd || ROOT_DIR,
    env: env,
    shell: false,
  });

  proc.on("error", (err) => {
    log(name, `Error: ${err.message}`);
  });

  proc.on("exit", (code) => {
    log(name, `Exited with code ${code}`);
    // If any service exits, kill the others
    process.exit(code || 0);
  });

  return proc;
}

/**
 * Main entry point
 */
async function main() {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║           Medical-pi Production Startup                ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  // Get port info
  const PORT = parseInt(process.env.PORT || "3003", 10);
  const API_PORT = PORT + 1000;

  // Check and cleanup ports before starting
  log("MAIN", "Checking for existing processes...");
  
  if (await isPortInUse(API_PORT)) {
    log("MAIN", `Port ${API_PORT} is in use, cleaning up...`);
    await killProcessOnPort(API_PORT);
  }
  
  if (await isPortInUse(PORT)) {
    log("MAIN", `Port ${PORT} is in use, cleaning up...`);
    await killProcessOnPort(PORT);
  }

  // Start Meilisearch first
  try {
    await startMeilisearch();
  } catch (err) {
    console.error("❌ Failed to start Meilisearch:", err.message);
    process.exit(1);
  }

  console.log("\n📍 Service URLs:");
  console.log(`   UI:  http://localhost:${PORT}`);
  console.log(`   API: http://localhost:${API_PORT}`);
  console.log(`   Search: http://localhost:7700`);
  console.log("\n");

  // Start API server
  const apiProc = startService("API", "node", ["server/dist/index.js"]);

  // Give API a moment to start
  await new Promise((r) => setTimeout(r, 2000));

  // Start UI server with PORT env var - run next start directly in ui directory
  const uiEnv = { ...process.env, PORT: String(PORT) };
  const uiProc = startService("UI", "node", [join(ROOT_DIR, "node_modules/next/dist/bin/next"), "start"], join(ROOT_DIR, "ui"), uiEnv);

  // Handle graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n${YELLOW}[MAIN]${RESET} Received ${signal}, shutting down...`);
    
    if (!IS_WINDOWS) {
      apiProc.kill(signal);
      uiProc.kill(signal);
    } else {
      // Windows needs different handling
      apiProc.kill();
      uiProc.kill();
    }
    
    setTimeout(() => process.exit(0), 2000);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Keep process alive
  process.stdin.resume();
}

main().catch((err) => {
  console.error("❌ Startup failed:", err);
  process.exit(1);
});

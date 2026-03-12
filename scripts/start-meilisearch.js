#!/usr/bin/env node

/**
 * Meilisearch Startup Script
 * 
 * Automatically starts Meilisearch before the main application.
 * Works on Windows, Linux, and macOS.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const IS_WINDOWS = os.platform() === "win32";

// Configuration from environment
const MEILI_DB_PATH = process.env.MEILISEARCH_DB_PATH || join(ROOT_DIR, "data", "meilisearch");
const MEILI_HOST = process.env.MEILISEARCH_HOST || "http://127.0.0.1:7700";
const MEILI_PORT = new URL(MEILI_HOST).port || "7700";

/**
 * Check if Meilisearch is already running
 */
async function isMeilisearchRunning() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch(`${MEILI_HOST}/health`, {
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Find Meilisearch binary
 */
function findMeilisearchBinary() {
  // Check local bin directory first
  const localBin = IS_WINDOWS
    ? join(ROOT_DIR, "bin", "meilisearch.exe")
    : join(ROOT_DIR, "bin", "meilisearch");
  
  if (existsSync(localBin)) {
    return localBin;
  }
  
  // Fall back to system PATH
  return "meilisearch";
}

/**
 * Start Meilisearch process
 */
async function startMeilisearch() {
  // Create data directory if needed
  if (!existsSync(MEILI_DB_PATH)) {
    console.log("📁 Creating Meilisearch data directory...");
    mkdirSync(MEILI_DB_PATH, { recursive: true });
  }

  const binary = findMeilisearchBinary();
  const args = [
    "--db-path", MEILI_DB_PATH,
    "--http-addr", `127.0.0.1:${MEILI_PORT}`,
    "--no-analytics",
  ];

  console.log(`🚀 Starting Meilisearch on port ${MEILI_PORT}...`);
  console.log(`   Binary: ${binary}`);
  console.log(`   Data: ${MEILI_DB_PATH}`);

  const meiliProcess = spawn(binary, args, {
    stdio: "pipe",
    detached: !IS_WINDOWS, // Detach on Unix so it doesn't die with parent
    windowsHide: true,     // Hide window on Windows
  });

  // Handle process events
  meiliProcess.on("error", (err) => {
    if (err.code === "ENOENT") {
      console.error("❌ Meilisearch binary not found!");
      console.error("   Run: npm run onboard");
      console.error("   Or download from: https://github.com/meilisearch/meilisearch/releases");
    } else {
      console.error("❌ Failed to start Meilisearch:", err.message);
    }
    process.exit(1);
  });

  meiliProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`❌ Meilisearch exited with code ${code}`);
      process.exit(1);
    }
  });

  // Pipe output for debugging (optional)
  if (process.env.DEBUG_MEILI === "true") {
    meiliProcess.stdout.pipe(process.stdout);
    meiliProcess.stderr.pipe(process.stderr);
  }

  // Wait for Meilisearch to be ready
  console.log("⏳ Waiting for Meilisearch to be ready...");
  let attempts = 0;
  const maxAttempts = 30;
  
  while (attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, 500));
    
    if (await isMeilisearchRunning()) {
      console.log("✅ Meilisearch is ready!\n");
      return meiliProcess;
    }
    
    attempts++;
    if (attempts % 5 === 0) {
      console.log(`   Still waiting... (${attempts}/${maxAttempts})`);
    }
  }

  console.error("❌ Meilisearch failed to start within timeout");
  meiliProcess.kill();
  process.exit(1);
}

/**
 * Main entry point
 */
async function main() {
  // Check if already running
  if (await isMeilisearchRunning()) {
    console.log("✅ Meilisearch is already running\n");
    process.exit(0);
  }

  // Start Meilisearch
  const process_ = await startMeilisearch();

  // On Unix, we can detach and let it run independently
  // On Windows, we need to keep the process reference
  if (!IS_WINDOWS) {
    process_.unref();
  }

  // Give it a moment to fully initialize
  await new Promise((r) => setTimeout(r, 1000));
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});

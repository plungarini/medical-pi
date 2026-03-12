#!/usr/bin/env node

/**
 * Medical-pi Onboarding Script
 * 
 * This script guides users through the initial setup of medical-pi,
 * prompting for required environment variables and verifying connections.
 * 
 * Cross-platform: Works on Windows, Linux (x64/ARM), and macOS
 */

import { createInterface } from "readline";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env");
const ENV_EXAMPLE_PATH = path.join(ROOT_DIR, ".env.example");

// Detect platform
const PLATFORM = os.platform();
const IS_WINDOWS = PLATFORM === "win32";
const IS_LINUX = PLATFORM === "linux";
const IS_MAC = PLATFORM === "darwin";
const ARCH = os.arch(); // 'x64', 'arm64', 'arm'

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt, defaultValue = "") {
  return new Promise((resolve) => {
    const displayDefault = defaultValue || "";
    const fullPrompt = displayDefault ? `${prompt} [${displayDefault}]: ` : `${prompt}: `;
    rl.question(fullPrompt, (answer) => {
      resolve(answer !== undefined ? answer.trim() : "");
    });
  });
}

async function checkModalEndpoint(endpoint) {
  if (!endpoint) return false;
  try {
    const response = await fetch(`${endpoint}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function checkOpenRouterKey(apiKey) {
  if (!apiKey) return false;
  try {
    const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

function checkMeilisearch() {
  try {
    if (IS_WINDOWS) {
      execSync("where meilisearch", { stdio: "ignore" });
    } else {
      execSync("which meilisearch", { stdio: "ignore" });
    }
    return true;
  } catch {
    return false;
  }
}

function getMeilisearchDownloadUrl() {
  // Determine correct binary based on platform and architecture
  // See: https://github.com/meilisearch/meilisearch/releases
  const version = "v1.12.8"; // Latest stable
  
  if (IS_WINDOWS) {
    return `https://github.com/meilisearch/meilisearch/releases/download/${version}/meilisearch-windows-amd64.exe`;
  }
  
  if (IS_MAC) {
    if (ARCH === "arm64") {
      return `https://github.com/meilisearch/meilisearch/releases/download/${version}/meilisearch-macos-apple-silicon`;
    }
    return `https://github.com/meilisearch/meilisearch/releases/download/${version}/meilisearch-macos-amd64`;
  }
  
  if (IS_LINUX) {
    if (ARCH === "arm64" || ARCH === "aarch64") {
      return `https://github.com/meilisearch/meilisearch/releases/download/${version}/meilisearch-linux-aarch64`;
    }
    if (ARCH === "arm") {
      return `https://github.com/meilisearch/meilisearch/releases/download/${version}/meilisearch-linux-armv7`;
    }
    // Default to amd64 for x64
    return `https://github.com/meilisearch/meilisearch/releases/download/${version}/meilisearch-linux-amd64`;
  }
  
  return null;
}

async function installMeilisearchWindows(binDir) {
  console.log("\n📦 Installing Meilisearch for Windows...");
  try {
    const url = getMeilisearchDownloadUrl();
    if (!url) {
      throw new Error("Unsupported platform for automatic Meilisearch installation");
    }
    
    // Create bin directory
    mkdirSync(binDir, { recursive: true });
    
    const meiliPath = path.join(binDir, "meilisearch.exe");
    
    // Download using PowerShell
    console.log("⬇️  Downloading Meilisearch...");
    const psCommand = `powershell -Command "Invoke-WebRequest -Uri '${url}' -OutFile '${meiliPath}'"`;
    execSync(psCommand, { stdio: "inherit" });
    
    console.log(`✅ Meilisearch downloaded to: ${meiliPath}`);
    console.log("📋 To run Meilisearch manually:");
    console.log(`   ${meiliPath} --db-path ./data/meilisearch --http-addr 127.0.0.1:7700`);
    
    return { binPath: meiliPath, manual: true };
  } catch (error) {
    console.error("❌ Failed to install Meilisearch:", error.message);
    console.log("\n📋 Manual installation:");
    console.log("1. Download from: https://github.com/meilisearch/meilisearch/releases");
    console.log(`2. Choose: meilisearch-windows-amd64.exe`);
    console.log("3. Place it in your PATH or run it directly");
    return null;
  }
}

async function installMeilisearchUnix(binDir) {
  console.log(`\n📦 Installing Meilisearch (${IS_MAC ? 'macOS' : 'Linux'} ${ARCH})...`);
  try {
    const url = getMeilisearchDownloadUrl();
    if (!url) {
      throw new Error(`Unsupported platform: ${PLATFORM} ${ARCH}`);
    }
    
    // Create bin directory
    mkdirSync(binDir, { recursive: true });
    
    const meiliName = IS_MAC ? "meilisearch" : "meilisearch";
    const meiliPath = path.join(binDir, meiliName);
    
    // Download
    console.log("⬇️  Downloading Meilisearch...");
    console.log(`   From: ${url}`);
    execSync(`curl -L -o "${meiliPath}" "${url}"`, { stdio: "inherit" });
    
    // Make executable
    execSync(`chmod +x "${meiliPath}"`);
    
    console.log(`✅ Meilisearch installed to: ${meiliPath}`);
    
    // Create systemd service on Linux
    if (IS_LINUX) {
      const homeDir = os.homedir();
      const serviceDir = path.join(homeDir, ".config/systemd/user");
      
      try {
        mkdirSync(serviceDir, { recursive: true });
        
        const serviceContent = `[Unit]
Description=Meilisearch
After=network.target

[Service]
ExecStart=${meiliPath} --db-path ${path.join(ROOT_DIR, "data/meilisearch")} --http-addr 127.0.0.1:7700 --no-analytics
Restart=on-failure

[Install]
WantedBy=default.target
`;
        
        const servicePath = path.join(serviceDir, "meilisearch.service");
        writeFileSync(servicePath, serviceContent);
        
        console.log("🚀 Systemd service created");
        console.log("   Start with: systemctl --user enable --now meilisearch");
      } catch (e) {
        console.log("⚠️  Could not create systemd service (optional)");
      }
    }
    
    console.log("\n📋 To run Meilisearch manually:");
    console.log(`   ${meiliPath} --db-path ./data/meilisearch --http-addr 127.0.0.1:7700`);
    
    return { binPath: meiliPath, manual: IS_MAC };
  } catch (error) {
    console.error("❌ Failed to install Meilisearch:", error.message);
    console.log("\n📋 Manual installation:");
    console.log("1. Download from: https://github.com/meilisearch/meilisearch/releases");
    console.log(`2. Choose binary for: ${PLATFORM} ${ARCH}`);
    console.log("3. Make it executable and place in PATH");
    return null;
  }
}

async function installMeilisearch() {
  const binDir = path.join(ROOT_DIR, "bin");
  
  if (IS_WINDOWS) {
    return await installMeilisearchWindows(binDir);
  }
  
  return await installMeilisearchUnix(binDir);
}

function createDirectories(storagePath) {
  console.log("\n📁 Creating directories...");
  try {
    // Use Node.js API for cross-platform directory creation
    mkdirSync(path.join(storagePath, "documents"), { recursive: true });
    mkdirSync(path.join(storagePath, "logs"), { recursive: true });
    mkdirSync(path.join(ROOT_DIR, "data", "meilisearch"), { recursive: true });
    console.log("✅ Directories created");
    return true;
  } catch (error) {
    console.error("❌ Failed to create directories:", error.message);
    return false;
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║           Medical-pi Setup Assistant                   ║");
  console.log(`║   Platform: ${IS_WINDOWS ? "Windows" : IS_MAC ? "macOS" : "Linux"} (${ARCH})              ║`);
  console.log("╚════════════════════════════════════════════════════════╝\n");

  // Load existing env if present
  let existingEnv = {};
  if (existsSync(ENV_PATH)) {
    const currentContent = readFileSync(ENV_PATH, "utf8");
    currentContent.split("\n").forEach((line) => {
      const trimmed = line ? line.trim() : "";
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex);
          const val = trimmed.substring(eqIndex + 1);
          existingEnv[key] = val;
        }
      }
    });
  }

  // Check if .env.example exists
  if (!existsSync(ENV_EXAMPLE_PATH)) {
    console.error("❌ .env.example not found! Please create it first.");
    process.exit(1);
  }

  // Read .env.example as template
  const exampleContent = readFileSync(ENV_EXAMPLE_PATH, "utf8");
  const lines = exampleContent.split("\n");

  // Save progress function
  const saveProgress = () => {
    let out = "";
    for (const line of lines) {
      const lineStr = line || "";
      const trimmed = lineStr.trim();
      // Preserve empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        out += lineStr + "\n";
        continue;
      }
      // For variable lines, use existing value or default from example
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex < 0) {
        out += lineStr + "\n";
        continue;
      }
      const key = trimmed.substring(0, eqIndex);
      const defaultVal = trimmed.substring(eqIndex + 1);
      const val = existingEnv[key] !== undefined ? existingEnv[key] : defaultVal;
      out += `${key}=${val}\n`;
    }
    writeFileSync(ENV_PATH, out);
    // Also copy to server
    const serverEnvPath = path.join(ROOT_DIR, "server", ".env");
    writeFileSync(serverEnvPath, out);
  };

  // Handle SIGINT to save progress
  rl.on("SIGINT", () => {
    console.log("\n\n⚠️  Setup interrupted. Saving progress...");
    saveProgress();
    console.log("💾 Progress saved to .env\n");
    rl.close();
    process.exit(0);
  });

  console.log("📝 Let's configure your environment variables.");
  console.log("Hit [Enter] to use the suggested default.\n");

  // Process each line from .env.example
  for (const line of lines) {
    const lineStr = line || "";
    const trimmed = lineStr.trim();
    // Skip empty lines and comments - they'll be preserved
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) {
      continue; // Line without = sign, skip
    }

    const key = trimmed.substring(0, eqIndex);
    const defaultValue = existingEnv[key] !== undefined ? existingEnv[key] : trimmed.substring(eqIndex + 1);

    // Special handling for certain keys
    if (key === "JWT_SECRET" && !defaultValue) {
      // Generate a random JWT secret if not set
      existingEnv[key] = "changeme-" + Date.now() + "-" + Math.random().toString(36).substring(2);
      console.log(`✅ Auto-generated ${key}`);
      continue;
    }

    // Adjust default storage path for Windows
    if (key === "BASE_STORAGE_PATH" && IS_WINDOWS && !defaultValue) {
      const windowsPath = path.join(ROOT_DIR, "data").replace(/\\/g, "/");
      existingEnv[key] = windowsPath;
      console.log(`✅ Auto-set ${key} for Windows: ${windowsPath}`);
      continue;
    }

    // Special handling for PORT to explain the API port
    if (key === "PORT") {
      const portNum = parseInt(defaultValue || "3003", 10);
      const apiPort = portNum + 1000;
      console.log(`\nℹ️  Port Configuration:`);
      console.log(`   - UI will run on PORT (${portNum})`);
      console.log(`   - API will run on PORT+1000 (${apiPort})`);
    }

    const answer = await question(key, defaultValue);
    const finalValue = answer !== "" ? answer : defaultValue;
    existingEnv[key] = finalValue;

    // Verify Modal endpoint if provided
    if (key === "MODAL_ENDPOINT" && finalValue) {
      console.log("🔍 Checking Modal endpoint...");
      const reachable = await checkModalEndpoint(finalValue);
      if (reachable) {
        console.log("✅ Modal endpoint reachable");
      } else {
        console.log("⚠️  Modal endpoint not reachable (may be cold, continuing anyway)");
      }
    }

    // Verify OpenRouter key if provided
    if (key === "OPENROUTER_API_KEY" && finalValue) {
      console.log("🔍 Checking OpenRouter API key...");
      const valid = await checkOpenRouterKey(finalValue);
      if (valid) {
        console.log("✅ OpenRouter API key valid");
      } else {
        console.log("⚠️  Could not verify OpenRouter API key (continuing anyway)");
      }
    }
  }

  // Save final .env
  saveProgress();
  console.log("✅ Configuration saved to .env");

  // Check Meilisearch
  console.log("\n🔍 Checking Meilisearch...");
  if (checkMeilisearch()) {
    console.log("✅ Meilisearch found in PATH");
  } else {
    const install = await question("Install Meilisearch? (y/n)", "y");
    if (install.toLowerCase() === "y") {
      await installMeilisearch();
    }
  }

  // Create directories
  const storagePath = existingEnv["BASE_STORAGE_PATH"] || (IS_WINDOWS ? path.join(ROOT_DIR, "data") : "/data/medical-pi");
  createDirectories(storagePath);

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║              Setup Complete! 🎉                        ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  const uiPort = existingEnv["PORT"] || "3003";
  const apiPort = parseInt(uiPort) + 1000;

  console.log("\nNext steps:");
  console.log("1. npm install          # Install all dependencies");
  console.log("2. npm run build        # Build the server");
  console.log("3. npm run dev          # Start development (Meilisearch starts automatically)");
  console.log(`\n📍 The UI will be at http://localhost:${uiPort}`);
  console.log(`📍 The API will be at http://localhost:${apiPort}`);
  console.log("📍 Meilisearch starts automatically with npm start / npm run dev");

  rl.close();
}

main().catch((error) => {
  console.error("\n❌ Setup failed:", error.message);
  process.exit(1);
});

// Load environment variables from .env file BEFORE any other imports
// This must be imported first in index.ts

export { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Robustly find the submodule root (medical-pi) by looking for 'prompts' folder
let currentDir = __dirname;
let rootDir = __dirname;

// Maximum 5 levels up
for (let i = 0; i < 5; i++) {
  if (existsSync(join(currentDir, "prompts")) || existsSync(join(currentDir, "..", "prompts"))) {
    // If prompts is in currentDir, that's the root. If it's in parent, parent might be the root.
    if (existsSync(join(currentDir, "prompts"))) {
      rootDir = currentDir;
    } else {
      rootDir = dirname(currentDir);
    }
    break;
  }
  currentDir = dirname(currentDir);
}

export const SUBMODULE_ROOT = rootDir;

// Load .env from project root
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: join(SUBMODULE_ROOT, ".env") });

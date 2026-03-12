// Load environment variables from .env file BEFORE any other imports
// This must be imported first in index.ts

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..", "..");

// Load .env from project root
const result = config({ path: join(rootDir, ".env") });

if (result.error) {
  console.warn("⚠️  Could not load .env file:", result.error.message);
}

// Re-export for convenience
export { config };

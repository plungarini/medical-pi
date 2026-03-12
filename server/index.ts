// Load environment variables FIRST - must be before any other imports
import "./src/core/env.js";

import { startServer } from "./src/api/server.js";
import { logger } from "./src/core/logger.js";
import { startHeartbeatJobs } from "./src/services/heartbeatService.js";

// Debug: log process events
process.on("exit", (code) => {
  console.error(`Process exiting with code: ${code}`);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});

// Start server
try {
  await startServer();
  logger.info("Server started successfully - KEEPALIVE");
  startHeartbeatJobs();
} catch (error) {
  logger.error("Failed to start server", error);
  console.error("Fatal error starting server:", error);
  process.exit(1);
}

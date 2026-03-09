import './core/logger.js';
import { startServer } from './api/server.js';
import { startHeartbeatJobs, stopHeartbeatJobs } from './services/heartbeatService.js';
import { initializeIndexes } from './core/searchClient.js';
import { globalLogger } from './core/logger.js';
import 'dotenv/config';

async function main() {
  console.log('Starting medical-pi service...');

  // Initialize Meilisearch indexes
  try {
    await initializeIndexes();
  } catch (error) {
    console.warn('Meilisearch initialization failed:', error);
    console.warn('Search functionality will be unavailable');
  }

  // Start heartbeat jobs
  startHeartbeatJobs();

  // Start server
  const server = await startServer();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);

    // Stop heartbeat jobs
    stopHeartbeatJobs();

    // Flush logs
    await globalLogger.close();

    // Close server
    await server.close();

    console.log('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('Failed to start service:', error);
  process.exit(1);
});

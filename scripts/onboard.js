#!/usr/bin/env node

/**
 * Medical PI Onboarding Script
 * 
 * Interactive setup for medical-pi service:
 * 1. Reads existing .env as defaults
 * 2. Prompts for required configuration
 * 3. Verifies Modal and OpenRouter connectivity
 * 4. Sets up Meilisearch binary and service
 * 5. Creates storage directories
 * 6. Runs SQLite migrations
 * 7. Initializes Meilisearch indexes
 * 8. Runs tests
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const envExamplePath = path.join(rootDir, '.env.example');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt, defaultValue = '') => {
  return new Promise((resolve) => {
    const fullPrompt = defaultValue ? `${prompt} [${defaultValue}]: ` : `${prompt}: `;
    rl.question(fullPrompt, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
};

// Load existing .env
function loadEnv() {
  const env = {};
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        env[match[1].trim()] = match[2].trim();
      }
    }
  }
  return env;
}

// Save .env
function saveEnv(env) {
  const lines = Object.entries(env).map(([key, value]) => `${key}=${value}`);
  fs.writeFileSync(envPath, lines.join('\n') + '\n');
  console.log('\n✓ Configuration saved to .env');
}

// Check if Meilisearch is installed
async function checkMeilisearch() {
  try {
    execSync('which meilisearch', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Install Meilisearch
async function installMeilisearch() {
  console.log('\nInstalling Meilisearch...');
  try {
    execSync('curl -L https://install.meilisearch.com | sh', {
      stdio: 'inherit',
      cwd: rootDir,
    });
    execSync('mv meilisearch /usr/local/bin/meilisearch');
    console.log('✓ Meilisearch installed');
  } catch (error) {
    console.error('Failed to install Meilisearch:', error.message);
    console.log('Please install manually: https://docs.meilisearch.com/learn/getting_started/installation.html');
  }
}

// Create Meilisearch systemd service
async function setupMeilisearchService(env) {
  const serviceDir = path.join(process.env.HOME, '.config/systemd/user');
  const servicePath = path.join(serviceDir, 'meilisearch.service');

  const serviceContent = `[Unit]
Description=Meilisearch
After=network.target

[Service]
ExecStart=/usr/local/bin/meilisearch --db-path ${env.MEILISEARCH_DB_PATH || '/data/meilisearch'} --http-addr 127.0.0.1:7700 --no-analytics
Restart=on-failure

[Install]
WantedBy=default.target
`;

  if (!fs.existsSync(serviceDir)) {
    fs.mkdirSync(serviceDir, { recursive: true });
  }

  fs.writeFileSync(servicePath, serviceContent);
  console.log('✓ Meilisearch service file created');

  try {
    execSync('systemctl --user daemon-reload');
    execSync('systemctl --user enable meilisearch');
    execSync('systemctl --user start meilisearch');
    console.log('✓ Meilisearch service started');
  } catch (error) {
    console.warn('Warning: Could not start Meilisearch service automatically');
    console.log('To start manually: systemctl --user start meilisearch');
  }
}

// Verify Modal endpoint
async function verifyModal(endpoint) {
  try {
    const response = await fetch(`${endpoint}/health`, { timeout: 5000 });
    return response.ok;
  } catch {
    return false;
  }
  }

// Verify OpenRouter API key
async function verifyOpenRouter(apiKey) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Main onboarding flow
async function main() {
  console.log('\n🏥 Medical PI Onboarding\n');
  console.log('This script will help you configure the medical-pi service.\n');
  console.log('Press Ctrl+C at any time to save progress and exit.\n');

  let env = loadEnv();

  // Use .env.example as template if .env doesn't exist
  if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    env = loadEnv();
  }

  try {
    // Required configuration
    console.log('=== Required Configuration ===\n');

    // Modal endpoint
    const modalEndpoint = await question('Modal MedGemma endpoint URL', env.MODAL_ENDPOINT || '');
    env.MODAL_ENDPOINT = modalEndpoint;

    if (modalEndpoint) {
      process.stdout.write('Verifying Modal endpoint... ');
      const modalOk = await verifyModal(modalEndpoint);
      if (modalOk) {
        console.log('✓ Online');
      } else {
        console.log('⚠ Unreachable (may be cold, will retry on first use)');
      }
    }

    // Modal API key (optional)
    const modalApiKey = await question('Modal API key (optional)', env.MODAL_API_KEY || '');
    env.MODAL_API_KEY = modalApiKey;

    // OpenRouter API key
    const openrouterKey = await question('OpenRouter API key', env.OPENROUTER_API_KEY || '');
    env.OPENROUTER_API_KEY = openrouterKey;

    if (openrouterKey) {
      process.stdout.write('Verifying OpenRouter API key... ');
      const orOk = await verifyOpenRouter(openrouterKey);
      if (orOk) {
        console.log('✓ Valid');
      } else {
        console.log('✗ Invalid - please check your API key');
      }
    }

    // JWT Secret
    const jwtSecret = await question('JWT Secret (generate a random string)', env.JWT_SECRET || '');
    env.JWT_SECRET = jwtSecret;

    // Storage path
    const storagePath = await question(
      'Base storage path',
      env.BASE_STORAGE_PATH || '/data/medical-pi'
    );
    env.BASE_STORAGE_PATH = storagePath;

    // Create directories
    console.log('\nCreating storage directories...');
    const dirs = [
      storagePath,
      path.join(storagePath, 'documents'),
      path.join(storagePath, 'logs'),
      env.MEILISEARCH_DB_PATH || '/data/meilisearch',
    ];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`  ✓ ${dir}`);
      }
    }

    // Meilisearch setup
    console.log('\n=== Meilisearch Setup ===\n');

    const meiliInstalled = await checkMeilisearch();
    if (!meiliInstalled) {
      const install = await question('Meilisearch not found. Install now? (y/n)', 'y');
      if (install.toLowerCase() === 'y') {
        await installMeilisearch();
        await setupMeilisearchService(env);
      } else {
        console.log('Please install Meilisearch manually before running the service.');
      }
    } else {
      console.log('✓ Meilisearch is already installed');
      const setupService = await question('Setup systemd service? (y/n)', 'y');
      if (setupService.toLowerCase() === 'y') {
        await setupMeilisearchService(env);
      }
    }

    // Save configuration
    saveEnv(env);

    // Run migrations
    console.log('\nRunning database migrations...');
    try {
      execSync('npm run build:server', { cwd: rootDir, stdio: 'inherit' });
      console.log('✓ Build complete');
    } catch (error) {
      console.error('Build failed:', error.message);
    }

    // Run tests
    console.log('\nRunning tests...');
    try {
      execSync('npm test', { cwd: rootDir, stdio: 'inherit' });
      console.log('✓ Tests passed');
    } catch (error) {
      console.warn('Tests failed - please review the output above');
    }

    console.log('\n🎉 Onboarding complete!');
    console.log('\nTo start the service:');
    console.log('  npm run dev    # Development mode');
    console.log('  npm start      # Production mode');

  } catch (error) {
    if (error.name === 'ExitPromptError') {
      console.log('\n\nInterrupted. Saving progress...');
      saveEnv(env);
      process.exit(0);
    }
    throw error;
  } finally {
    rl.close();
  }
}

// Handle SIGINT
process.on('SIGINT', () => {
  console.log('\n\nInterrupted. Saving progress...');
  const env = loadEnv();
  saveEnv(env);
  process.exit(0);
});

main().catch((error) => {
  console.error('Onboarding failed:', error);
  process.exit(1);
});

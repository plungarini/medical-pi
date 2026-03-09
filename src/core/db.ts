import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.BASE_STORAGE_PATH
  ? path.join(process.env.BASE_STORAGE_PATH, 'medical.db')
  : './data/medical.db';

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Run migrations
const migrations = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    pinned INTEGER NOT NULL DEFAULT 0
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),
    content TEXT NOT NULL DEFAULT '',
    attachments TEXT NOT NULL DEFAULT '[]',
    tool_calls TEXT NOT NULL DEFAULT '[]',
    thinking_content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS medical_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    profile TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS profile_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    diff TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS medical_documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    path TEXT NOT NULL,
    extracted_content TEXT,
    uploaded_at TEXT NOT NULL
  );
  `,
  `CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, updated_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_documents_user ON medical_documents(user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_profile_history_user ON profile_history(user_id, created_at DESC);`,
];

export function runMigrations(): void {
  for (const migration of migrations) {
    db.exec(migration);
  }
  console.log('Database migrations completed');
}

// Initialize
runMigrations();

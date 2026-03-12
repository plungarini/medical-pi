import Database from "better-sqlite3";
import type { Statement } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";

import { SUBMODULE_ROOT } from "./env.js";

const DB_PATH = process.env.DB_PATH || path.join(SUBMODULE_ROOT, "data/medical.db");

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (dbDir && dbDir !== "." && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database - not exported directly to avoid type issues
const database = new Database(DB_PATH);

// Enable WAL mode for better concurrency
database.pragma("journal_mode = WAL");

// Create tables
const initSchema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),
  content TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]',
  tool_calls TEXT NOT NULL DEFAULT '[]',
  thinking_content TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS medical_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  profile TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  diff TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS medical_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  path TEXT NOT NULL,
  extracted_content TEXT,
  uploaded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_user ON medical_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_history_user ON profile_history(user_id, created_at DESC);
`;

database.exec(initSchema);

// Migrate: Add metadata column to messages if missing
try {
  database.exec("ALTER TABLE messages ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'");
  console.log("✅ Migrated messages table: added metadata column");
} catch (e: any) {
  if (!e.message.includes("duplicate column name")) {
    throw e;
  }
}

// Type for prepared statement
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PreparedStatement = Statement<unknown[]>;

// Prepared statements for common operations
export const queries: {
  createUser: PreparedStatement;
  getUserByUsername: PreparedStatement;
  getUserById: PreparedStatement;
  createSession: PreparedStatement;
  getSessionsByUser: PreparedStatement;
  getSessionById: PreparedStatement;
  updateSession: PreparedStatement;
  deleteSession: PreparedStatement;
  incrementMessageCount: PreparedStatement;
  createMessage: PreparedStatement;
  getMessagesBySession: PreparedStatement;
  getMessagesBySessionAsc: PreparedStatement;
  getProfile: PreparedStatement;
  createProfile: PreparedStatement;
  updateProfile: PreparedStatement;
  addProfileHistory: PreparedStatement;
  getProfileHistory: PreparedStatement;
  createDocument: PreparedStatement;
  getDocumentsByUser: PreparedStatement;
  getDocumentById: PreparedStatement;
  deleteDocument: PreparedStatement;
  updateDocumentContent: PreparedStatement;
  updateMessageMetadata: PreparedStatement;
  getMessageById: PreparedStatement;
} = {
  // Users
  createUser: database.prepare("INSERT INTO users (id, username, created_at) VALUES (?, ?, ?)"),
  getUserByUsername: database.prepare("SELECT * FROM users WHERE username = ?"),
  getUserById: database.prepare("SELECT * FROM users WHERE id = ?"),

  // Sessions
  createSession: database.prepare(
    "INSERT INTO sessions (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ),
  getSessionsByUser: database.prepare(
    "SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?"
  ),
  getSessionById: database.prepare("SELECT * FROM sessions WHERE id = ?"),
  updateSession: database.prepare(
    "UPDATE sessions SET title = COALESCE(?, title), pinned = COALESCE(?, pinned), updated_at = ? WHERE id = ?"
  ),
  deleteSession: database.prepare("DELETE FROM sessions WHERE id = ?"),
  incrementMessageCount: database.prepare(
    "UPDATE sessions SET message_count = message_count + 1, updated_at = ? WHERE id = ?"
  ),

  // Messages
  createMessage: database.prepare(
    "INSERT INTO messages (id, session_id, role, content, attachments, tool_calls, thinking_content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ),
  getMessagesBySession: database.prepare(
    "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?"
  ),
  getMessagesBySessionAsc: database.prepare(
    "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?"
  ),
  updateMessageMetadata: database.prepare(
    "UPDATE messages SET metadata = ? WHERE id = ?"
  ),
  getMessageById: database.prepare("SELECT * FROM messages WHERE id = ?"),

  // Medical Profiles
  getProfile: database.prepare("SELECT * FROM medical_profiles WHERE user_id = ?"),
  createProfile: database.prepare(
    "INSERT INTO medical_profiles (user_id, profile, updated_at) VALUES (?, ?, ?)"
  ),
  updateProfile: database.prepare(
    "UPDATE medical_profiles SET profile = ?, updated_at = ? WHERE user_id = ?"
  ),

  // Profile History
  addProfileHistory: database.prepare(
    "INSERT INTO profile_history (id, user_id, diff, created_at) VALUES (?, ?, ?, ?)"
  ),
  getProfileHistory: database.prepare(
    "SELECT * FROM profile_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
  ),

  // Documents
  createDocument: database.prepare(
    "INSERT INTO medical_documents (id, user_id, name, mime_type, path, extracted_content, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ),
  getDocumentsByUser: database.prepare(
    "SELECT * FROM medical_documents WHERE user_id = ? ORDER BY uploaded_at DESC"
  ),
  getDocumentById: database.prepare("SELECT * FROM medical_documents WHERE id = ?"),
  deleteDocument: database.prepare("DELETE FROM medical_documents WHERE id = ?"),
  updateDocumentContent: database.prepare(
    "UPDATE medical_documents SET extracted_content = ? WHERE id = ?"
  ),
};

export function generateId(): string {
  return randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

// Export database wrapper functions instead of the database itself
export function exec(sql: string): void {
  database.exec(sql);
}

export function prepare(sql: string): PreparedStatement {
  return database.prepare(sql);
}

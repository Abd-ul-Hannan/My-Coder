// src/storage/sqliteStorageProvider.ts
// Workspace-specific SQLite storage for chat sessions and API keys.
// Each workspace has its own database at: <workspace>/.vscode/my-coder.db

import * as path from 'path';
import * as fs from 'fs';
import { HistoryProvider, ChatSession, SessionSummary, ChatMessage } from '../types';

type Database = import('better-sqlite3').Database;

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT 'Untitled',
  mode        TEXT NOT NULL DEFAULT 'chat',
  project_path TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  plan_json   TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'text',
  timestamp   INTEGER NOT NULL,
  metadata_json TEXT,
  seq         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);

CREATE TABLE IF NOT EXISTS api_keys (
  key_name    TEXT PRIMARY KEY,
  key_value   TEXT NOT NULL,
  updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);
`;

export class SQLiteStorageProvider implements HistoryProvider {
  private db: Database | null = null;
  private readonly dbPath: string;
  private initialized = false;

  constructor(storageDir: string) {
    this.dbPath = path.join(storageDir, 'my-coder.db');
    try {
      fs.mkdirSync(storageDir, { recursive: true });
      console.log('[SQLite] Storage dir created:', storageDir);
    } catch (err) {
      console.error('[SQLite] Failed to create storage dir:', err);
    }
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) return true;
    console.log('[SQLite] Initializing database at:', this.dbPath);
    try {
      const BetterSQLite = require('better-sqlite3') as typeof import('better-sqlite3');
      this.db = new BetterSQLite(this.dbPath);
      console.log('[SQLite] Database opened successfully');
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      console.log('[SQLite] Pragmas set: WAL mode + foreign keys ON');
      this.db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT 'Untitled',
  mode        TEXT NOT NULL DEFAULT 'chat',
  project_path TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  plan_json   TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'text',
  timestamp   INTEGER NOT NULL,
  metadata_json TEXT,
  seq         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);

CREATE TABLE IF NOT EXISTS api_keys (
  key_name    TEXT PRIMARY KEY,
  key_value   TEXT NOT NULL,
  updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);
      `);
      this.initialized = true;
      console.log('[SQLite] ✅ Initialization complete');
      return true;
    } catch (err) {
      console.error('[SQLite] ❌ Initialization failed:', err);
      this.db = null;
      return false;
    }
  }

  isAvailable(): boolean { return this.db !== null; }
  close(): void { if (this.db) { this.db.close(); this.db = null; } }

  async saveSession(session: ChatSession): Promise<void> {
    const db = this.requireDb();
    const upsert = db.prepare(`
      INSERT INTO sessions (id, title, mode, project_path, created_at, updated_at, plan_json)
      VALUES (@id, @title, @mode, @project_path, @created_at, @updated_at, @plan_json)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, mode=excluded.mode, 
        project_path=excluded.project_path, updated_at=excluded.updated_at, plan_json=excluded.plan_json
    `);
    const delMsg = db.prepare(`DELETE FROM messages WHERE session_id = ?`);
    const insMsg = db.prepare(`
      INSERT INTO messages (id, session_id, role, content, type, timestamp, metadata_json, seq)
      VALUES (@id, @session_id, @role, @content, @type, @timestamp, @metadata_json, @seq)
    `);
    db.transaction(() => {
      upsert.run({
        id: session.id, title: session.title, mode: session.mode,
        project_path: session.projectPath ?? null, created_at: session.createdAt,
        updated_at: session.updatedAt, plan_json: session.plan ? JSON.stringify(session.plan) : null,
      });
      delMsg.run(session.id);
      session.messages.forEach((msg, seq) => {
        insMsg.run({
          id: msg.id, session_id: session.id, role: msg.role, content: msg.content,
          type: msg.type, timestamp: msg.timestamp,
          metadata_json: msg.metadata ? JSON.stringify(msg.metadata) : null, seq,
        });
      });
    })();
  }

  async loadSession(sessionId: string): Promise<ChatSession | null> {
    const db = this.requireDb();
    const sRow = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as any;
    if (!sRow) return null;
    const mRows = db.prepare(`SELECT * FROM messages WHERE session_id = ? ORDER BY seq ASC`).all(sessionId) as any[];
    return {
      id: sRow.id, title: sRow.title, mode: sRow.mode, projectPath: sRow.project_path ?? undefined,
      createdAt: sRow.created_at, updatedAt: sRow.updated_at,
      messages: mRows.map(m => ({
        id: m.id, role: m.role, content: m.content, type: m.type, timestamp: m.timestamp,
        metadata: m.metadata_json ? JSON.parse(m.metadata_json) : undefined,
      })),
      plan: sRow.plan_json ? JSON.parse(sRow.plan_json) : undefined,
    };
  }

  async listSessions(): Promise<SessionSummary[]> {
    const db = this.requireDb();
    const rows = db.prepare(`
      SELECT s.id, s.title, s.mode, s.created_at, s.updated_at, COUNT(m.id) as message_count
      FROM sessions s LEFT JOIN messages m ON m.session_id = s.id
      GROUP BY s.id ORDER BY s.updated_at DESC LIMIT 200
    `).all() as any[];
    return rows.map(r => ({
      id: r.id, title: r.title, mode: r.mode, createdAt: r.created_at,
      updatedAt: r.updated_at, messageCount: r.message_count,
    }));
  }

  async deleteSession(sessionId: string): Promise<void> {
    console.log('[SQLite] Delete request for session:', sessionId);
    const db = this.requireDb();
    db.transaction(() => {
      const msgDel = db.prepare(`DELETE FROM messages WHERE session_id = ?`).run(sessionId);
      console.log('[SQLite] Deleted', msgDel.changes, 'messages');
      const sessDel = db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
      console.log('[SQLite] Deleted', sessDel.changes, 'session(s)');
    })();
    console.log('[SQLite] ✅ Delete transaction complete');
  }

  async clearAll(): Promise<void> {
    const db = this.requireDb();
    db.transaction(() => {
      db.prepare(`DELETE FROM messages`).run();
      db.prepare(`DELETE FROM sessions`).run();
    })();
  }

  renameSession(sessionId: string, newTitle: string): void {
    const db = this.requireDb();
    db.prepare(`UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?`)
      .run(newTitle.trim().slice(0, 100), Date.now(), sessionId);
  }

  saveApiKey(keyName: string, keyValue: string): void {
    const db = this.requireDb();
    db.prepare(`
      INSERT INTO api_keys (key_name, key_value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key_name) DO UPDATE SET key_value=excluded.key_value, updated_at=excluded.updated_at
    `).run(keyName, keyValue, Date.now());
  }

  getApiKey(keyName: string): string | null {
    const db = this.requireDb();
    const row = db.prepare(`SELECT key_value FROM api_keys WHERE key_name = ?`).get(keyName) as any;
    return row?.key_value ?? null;
  }

  deleteApiKey(keyName: string): void {
    const db = this.requireDb();
    db.prepare(`DELETE FROM api_keys WHERE key_name = ?`).run(keyName);
  }

  getDbPath(): string { return this.dbPath; }

  private requireDb(): Database {
    if (!this.db) throw new Error('SQLite not initialized');
    return this.db;
  }
}

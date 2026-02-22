"use strict";
// src/storage/sqliteStorageProvider.ts
// ─────────────────────────────────────────────────────────────────────────────
// SQLite-backed local storage for chat sessions and API keys.
//
// Uses better-sqlite3 (synchronous, no native build needed in VS Code context).
// Falls back gracefully to JSON storage if SQLite is unavailable.
//
// Schema:
//   sessions   — one row per session (id, title, mode, json blob, timestamps)
//   messages   — one row per message (foreign key → session)
//   api_keys   — encrypted key-value store for API keys
//   settings   — general key-value config table
// ─────────────────────────────────────────────────────────────────────────────
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLiteStorageProvider = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// ─── DDL ─────────────────────────────────────────────────────────────────────
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

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);
`;
// ─── SQLiteStorageProvider ────────────────────────────────────────────────────
class SQLiteStorageProvider {
    db = null;
    dbPath;
    initialized = false;
    constructor(storageDir) {
        this.dbPath = path.join(storageDir, 'my-coder.db');
        // Ensure directory exists synchronously (called in constructor context)
        try {
            fs.mkdirSync(storageDir, { recursive: true });
        }
        catch { /* already exists */ }
    }
    // ─── Lifecycle ──────────────────────────────────────────────────────────────
    async initialize() {
        if (this.initialized)
            return true;
        try {
            // Dynamic require — better-sqlite3 must be in node_modules
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const BetterSQLite = require('better-sqlite3');
            this.db = new BetterSQLite(this.dbPath, { verbose: undefined });
            this.db.exec(SCHEMA_SQL);
            this.initialized = true;
            return true;
        }
        catch (err) {
            console.error('[MY Coder] SQLite init failed, using JSON fallback:', err);
            this.db = null;
            return false;
        }
    }
    isAvailable() {
        return this.db !== null;
    }
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
    // ─── HistoryProvider ────────────────────────────────────────────────────────
    async saveSession(session) {
        const db = this.requireDb();
        const upsertSession = db.prepare(`
      INSERT INTO sessions (id, title, mode, project_path, created_at, updated_at, plan_json)
      VALUES (@id, @title, @mode, @project_path, @created_at, @updated_at, @plan_json)
      ON CONFLICT(id) DO UPDATE SET
        title       = excluded.title,
        mode        = excluded.mode,
        project_path= excluded.project_path,
        updated_at  = excluded.updated_at,
        plan_json   = excluded.plan_json
    `);
        const deleteOldMessages = db.prepare(`DELETE FROM messages WHERE session_id = ?`);
        const insertMessage = db.prepare(`
      INSERT INTO messages (id, session_id, role, content, type, timestamp, metadata_json, seq)
      VALUES (@id, @session_id, @role, @content, @type, @timestamp, @metadata_json, @seq)
    `);
        // Run entire session save as a transaction for atomicity
        const saveAll = db.transaction(() => {
            upsertSession.run({
                id: session.id,
                title: session.title,
                mode: session.mode,
                project_path: session.projectPath ?? null,
                created_at: session.createdAt,
                updated_at: session.updatedAt,
                plan_json: session.plan ? JSON.stringify(session.plan) : null,
            });
            deleteOldMessages.run(session.id);
            session.messages.forEach((msg, seq) => {
                insertMessage.run({
                    id: msg.id,
                    session_id: session.id,
                    role: msg.role,
                    content: msg.content,
                    type: msg.type,
                    timestamp: msg.timestamp,
                    metadata_json: msg.metadata ? JSON.stringify(msg.metadata) : null,
                    seq,
                });
            });
        });
        saveAll();
    }
    async loadSession(sessionId) {
        const db = this.requireDb();
        const sessionRow = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId);
        if (!sessionRow)
            return null;
        const messageRows = db.prepare(`SELECT * FROM messages WHERE session_id = ? ORDER BY seq ASC`).all(sessionId);
        return this.hydrateSession(sessionRow, messageRows);
    }
    async listSessions() {
        const db = this.requireDb();
        // Get session summaries with message count — single efficient query
        const rows = db.prepare(`
      SELECT
        s.id, s.title, s.mode, s.created_at, s.updated_at,
        COUNT(m.id) as message_count
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
      GROUP BY s.id
      ORDER BY s.updated_at DESC
      LIMIT 200
    `).all();
        return rows.map(r => ({
            id: r.id,
            title: r.title,
            mode: r.mode,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            messageCount: r.message_count,
        }));
    }
    async deleteSession(sessionId) {
        const db = this.requireDb();
        // Explicitly delete messages first as a safety net (CASCADE handles it too,
        // but this guarantees no orphans if foreign_keys pragma ever fails to apply)
        db.transaction(() => {
            db.prepare(`DELETE FROM messages WHERE session_id = ?`).run(sessionId);
            db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
        })();
    }
    async clearAll() {
        const db = this.requireDb();
        db.transaction(() => {
            db.prepare(`DELETE FROM messages`).run();
            db.prepare(`DELETE FROM sessions`).run();
        })();
    }
    // ─── Rename Session ─────────────────────────────────────────────────────────
    renameSession(sessionId, newTitle) {
        const db = this.requireDb();
        db.prepare(`UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?`).run(newTitle.trim().slice(0, 100), Date.now(), sessionId);
    }
    // ─── API Key Store ──────────────────────────────────────────────────────────
    saveApiKey(keyName, keyValue) {
        const db = this.requireDb();
        db.prepare(`
      INSERT INTO api_keys (key_name, key_value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key_name) DO UPDATE SET key_value = excluded.key_value, updated_at = excluded.updated_at
    `).run(keyName, keyValue, Date.now());
    }
    getApiKey(keyName) {
        const db = this.requireDb();
        const row = db.prepare(`SELECT key_value FROM api_keys WHERE key_name = ?`).get(keyName);
        return row?.key_value ?? null;
    }
    deleteApiKey(keyName) {
        const db = this.requireDb();
        db.prepare(`DELETE FROM api_keys WHERE key_name = ?`).run(keyName);
    }
    listApiKeys() {
        const db = this.requireDb();
        return db.prepare(`SELECT key_name, updated_at FROM api_keys ORDER BY key_name`).all().map(r => ({
            name: r.key_name,
            updatedAt: r.updated_at,
        }));
    }
    clearAllApiKeys() {
        const db = this.requireDb();
        db.prepare(`DELETE FROM api_keys`).run();
    }
    // ─── Settings Store ─────────────────────────────────────────────────────────
    saveSetting(key, value) {
        const db = this.requireDb();
        db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, Date.now());
    }
    getSetting(key) {
        const db = this.requireDb();
        const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
        return row?.value ?? null;
    }
    // ─── Stats ──────────────────────────────────────────────────────────────────
    getStats() {
        const db = this.requireDb();
        const sessionCount = db.prepare(`SELECT COUNT(*) as c FROM sessions`).get().c;
        const messageCount = db.prepare(`SELECT COUNT(*) as c FROM messages`).get().c;
        let dbSizeBytes = 0;
        try {
            dbSizeBytes = fs.statSync(this.dbPath).size;
        }
        catch { /* ignore */ }
        return { sessionCount, messageCount, dbSizeBytes };
    }
    getDbPath() {
        return this.dbPath;
    }
    // ─── Private helpers ─────────────────────────────────────────────────────────
    requireDb() {
        if (!this.db)
            throw new Error('SQLite database is not initialized. Call initialize() first.');
        return this.db;
    }
    hydrateSession(row, messageRows) {
        const messages = messageRows.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            type: m.type,
            timestamp: m.timestamp,
            metadata: m.metadata_json ? JSON.parse(m.metadata_json) : undefined,
        }));
        return {
            id: row.id,
            title: row.title,
            mode: row.mode,
            projectPath: row.project_path ?? undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            messages,
            plan: row.plan_json ? JSON.parse(row.plan_json) : undefined,
        };
    }
}
exports.SQLiteStorageProvider = SQLiteStorageProvider;
//# sourceMappingURL=sqliteStorageProvider.js.map
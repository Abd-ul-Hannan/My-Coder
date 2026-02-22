"use strict";
// src/storage/historyManager.ts — SQLite + Drive sync orchestrator
Object.defineProperty(exports, "__esModule", { value: true });
exports.HistoryManager = void 0;
const uuid_1 = require("uuid");
const sqliteStorageProvider_1 = require("./sqliteStorageProvider");
const localStorageProvider_1 = require("./localStorageProvider");
const googleAuth_1 = require("./googleAuth");
const driveSync_1 = require("./driveSync");
class HistoryManager {
    context;
    sqlite;
    jsonFallback;
    sqliteReady = false;
    googleAuth;
    driveSync;
    currentSession;
    constructor(context) {
        this.context = context;
        this.sqlite = new sqliteStorageProvider_1.SQLiteStorageProvider(context.globalStorageUri.fsPath);
        this.jsonFallback = new localStorageProvider_1.LocalStorageProvider(context.globalStorageUri);
        this.googleAuth = new googleAuth_1.GoogleAuth(context.secrets);
    }
    async initialize() {
        this.sqliteReady = await this.sqlite.initialize();
        if (!this.sqliteReady) {
            await this.jsonFallback.initialize();
        }
        const authStatus = await this.googleAuth.getAuthStatus();
        if (authStatus.isSignedIn) {
            this.driveSync = new driveSync_1.DriveSync(this.sqlite, () => this.googleAuth.getAccessToken());
            this.driveSync.pull().catch(err => console.error('[MY Coder] Drive pull on startup failed:', err));
        }
    }
    // ─── Auth ──────────────────────────────────────────────────────────────────
    async getAuthStatus() {
        return this.googleAuth.getAuthStatus();
    }
    async signInWithGoogle() {
        await this.googleAuth.signIn();
        this.driveSync = new driveSync_1.DriveSync(this.sqlite, () => this.googleAuth.getAccessToken());
        try {
            const result = await this.driveSync.pull();
            console.log('[MY Coder] Drive pull on sign-in:', result);
        }
        catch (err) {
            console.error('[MY Coder] Drive pull failed:', err);
        }
        return this.googleAuth.getAuthStatus();
    }
    async signOut() {
        if (this.driveSync) {
            try {
                await this.driveSync.push();
            }
            catch { /* ignore on sign-out */ }
        }
        await this.googleAuth.signOut();
        this.driveSync = undefined;
    }
    // ─── Session Lifecycle ──────────────────────────────────────────────────────
    createSession(mode, projectPath) {
        const session = {
            id: (0, uuid_1.v4)(),
            title: this.generateTitle(mode),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            mode,
            messages: [],
            projectPath,
        };
        this.currentSession = session;
        return session;
    }
    async addMessage(message) {
        if (!this.currentSession) {
            throw new Error('No active session. Call createSession() first.');
        }
        const fullMessage = { ...message, id: (0, uuid_1.v4)() };
        this.currentSession.messages.push(fullMessage);
        this.currentSession.updatedAt = Date.now();
        // Auto-title from first user message
        if (message.role === 'user' &&
            this.currentSession.messages.filter(m => m.role === 'user').length === 1) {
            this.currentSession.title = this.truncateTitle(message.content);
        }
        await this.saveCurrentSession();
        return fullMessage;
    }
    async saveCurrentSession() {
        if (!this.currentSession)
            return;
        await this.storage.saveSession(this.currentSession);
        this.driveSync?.schedulePush();
    }
    getCurrentSession() { return this.currentSession; }
    setCurrentSession(session) { this.currentSession = session; }
    async loadSession(sessionId) {
        const session = await this.storage.loadSession(sessionId);
        if (session)
            this.currentSession = session;
        return session;
    }
    async listSessions() {
        return this.storage.listSessions();
    }
    // ─── Delete ────────────────────────────────────────────────────────────────
    async deleteSession(sessionId) {
        if (this.currentSession?.id === sessionId) {
            this.currentSession = undefined;
        }
        await this.storage.deleteSession(sessionId);
        this.driveSync?.schedulePush(1000);
    }
    // ─── Rename ────────────────────────────────────────────────────────────────
    async renameSession(sessionId, newTitle) {
        const trimmed = newTitle.trim().slice(0, 100);
        if (!trimmed)
            return;
        if (this.sqliteReady) {
            this.sqlite.renameSession(sessionId, trimmed);
        }
        else {
            const session = await this.jsonFallback.loadSession(sessionId);
            if (session) {
                session.title = trimmed;
                session.updatedAt = Date.now();
                await this.jsonFallback.saveSession(session);
            }
        }
        if (this.currentSession?.id === sessionId) {
            this.currentSession.title = trimmed;
            this.currentSession.updatedAt = Date.now();
        }
        this.driveSync?.schedulePush(1000);
    }
    // ─── Clear All ─────────────────────────────────────────────────────────────
    async clearHistory() {
        this.currentSession = undefined;
        await this.storage.clearAll();
        this.driveSync?.schedulePush(500);
    }
    // ─── Full Reset (sessions + API keys) ─────────────────────────────────────
    async fullReset() {
        this.currentSession = undefined;
        if (this.sqliteReady) {
            await this.sqlite.clearAll();
            this.sqlite.clearAllApiKeys();
        }
        else {
            await this.jsonFallback.clearAll();
        }
        if (this.driveSync) {
            try {
                await this.driveSync.push();
            }
            catch { /* ignore */ }
        }
    }
    // ─── API Keys in SQLite ────────────────────────────────────────────────────
    saveApiKeyToDb(keyName, keyValue) {
        if (this.sqliteReady)
            this.sqlite.saveApiKey(keyName, keyValue);
    }
    getApiKeyFromDb(keyName) {
        return this.sqliteReady ? this.sqlite.getApiKey(keyName) : null;
    }
    deleteApiKeyFromDb(keyName) {
        if (this.sqliteReady)
            this.sqlite.deleteApiKey(keyName);
    }
    listApiKeys() {
        return this.sqliteReady ? this.sqlite.listApiKeys() : [];
    }
    clearAllApiKeys() {
        if (this.sqliteReady)
            this.sqlite.clearAllApiKeys();
    }
    // ─── Storage Stats ─────────────────────────────────────────────────────────
    getStorageStats() {
        if (this.sqliteReady)
            return { ...this.sqlite.getStats(), backend: 'sqlite' };
        return { sessionCount: 0, messageCount: 0, dbSizeBytes: 0, backend: 'json' };
    }
    getLastDriveSyncTime() {
        return this.driveSync?.getLastSyncTime() ?? 0;
    }
    // ─── AI Context ────────────────────────────────────────────────────────────
    getMessageHistory() {
        return this.currentSession?.messages ?? [];
    }
    getAIMessages() {
        return (this.currentSession?.messages ?? [])
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role, content: m.content }));
    }
    // ─── Helpers ───────────────────────────────────────────────────────────────
    get storage() {
        return this.sqliteReady ? this.sqlite : this.jsonFallback;
    }
    generateTitle(mode) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        const label = { 'new-app': 'New App', 'existing-project': 'Project Work', 'chat': 'Chat' }[mode];
        return `${label} — ${dateStr}`;
    }
    truncateTitle(content) {
        const cleaned = content.replace(/\n/g, ' ').trim();
        return cleaned.length > 60 ? cleaned.slice(0, 57) + '...' : cleaned;
    }
}
exports.HistoryManager = HistoryManager;
//# sourceMappingURL=historyManager.js.map
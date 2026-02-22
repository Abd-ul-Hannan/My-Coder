// src/storage/historyManager.ts — SQLite + Drive sync orchestrator

import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { ChatSession, ChatMessage, SessionSummary, AuthStatus } from '../types';
import { SQLiteStorageProvider } from './sqliteStorageProvider';
import { LocalStorageProvider } from './localStorageProvider';
import { GoogleAuth } from './googleAuth';
import { DriveSync } from './driveSync';

export class HistoryManager {
  private sqlite: SQLiteStorageProvider;
  private jsonFallback: LocalStorageProvider;
  private sqliteReady = false;
  private googleAuth: GoogleAuth;
  private driveSync?: DriveSync;
  private currentSession?: ChatSession;

  constructor(private readonly context: vscode.ExtensionContext) {
    const storageUri = context.globalStorageUri;
    this.sqlite = new SQLiteStorageProvider(storageUri.fsPath);
    this.jsonFallback = new LocalStorageProvider(storageUri);
    this.googleAuth = new GoogleAuth(context.secrets);
    console.log("[MY Coder] Using global storage:", storageUri.fsPath);
  }

  async initialize(): Promise<void> {
    this.sqliteReady = await this.sqlite.initialize();
    if (!this.sqliteReady) {
      await this.jsonFallback.initialize();
    }
    const authStatus = await this.googleAuth.getAuthStatus();
    if (authStatus.isSignedIn) {
      this.driveSync = new DriveSync(this.sqlite, () => this.googleAuth.getAccessToken());
      
      // Only pull if database is empty
      const sessions = await this.sqlite.listSessions();
      if (sessions.length === 0) {
        this.driveSync.pull().catch(err =>
          console.error('[MY Coder] Drive pull on startup failed:', err)
        );
      }
    }
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  async getAuthStatus(): Promise<AuthStatus> {
    return this.googleAuth.getAuthStatus();
  }

  async signInWithGoogle(): Promise<AuthStatus> {
    await this.googleAuth.signIn();
    this.driveSync = new DriveSync(this.sqlite, () => this.googleAuth.getAccessToken());
    try {
      const result = await this.driveSync.pull();
      console.log('[MY Coder] Drive pull on sign-in:', result);
    } catch (err) {
      console.error('[MY Coder] Drive pull failed:', err);
    }
    return this.googleAuth.getAuthStatus();
  }

  async signOut(): Promise<void> {
    if (this.driveSync) {
      try { await this.driveSync.push(); } catch { /* ignore on sign-out */ }
    }
    await this.googleAuth.signOut();
    this.driveSync = undefined;
  }

  // ─── Session Lifecycle ──────────────────────────────────────────────────────

  createSession(mode: ChatSession['mode'], projectPath?: string): ChatSession {
    const session: ChatSession = {
      id: uuidv4(),
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

  async addMessage(message: Omit<ChatMessage, 'id'>): Promise<ChatMessage> {
    if (!this.currentSession) {
      throw new Error('No active session. Call createSession() first.');
    }
    const fullMessage: ChatMessage = { ...message, id: uuidv4() };
    this.currentSession.messages.push(fullMessage);
    this.currentSession.updatedAt = Date.now();

    // Auto-title from first user message
    if (
      message.role === 'user' &&
      this.currentSession.messages.filter(m => m.role === 'user').length === 1
    ) {
      this.currentSession.title = this.truncateTitle(message.content);
    }

    await this.saveCurrentSession();
    return fullMessage;
  }

  async saveCurrentSession(): Promise<void> {
    if (!this.currentSession) return;
    await this.storage.saveSession(this.currentSession);
    this.driveSync?.schedulePush();
  }

  getCurrentSession(): ChatSession | undefined { return this.currentSession; }
  setCurrentSession(session: ChatSession): void { this.currentSession = session; }

  async loadSession(sessionId: string): Promise<ChatSession | null> {
    const session = await this.storage.loadSession(sessionId);
    if (session) this.currentSession = session;
    return session;
  }

  async listSessions(): Promise<SessionSummary[]> {
    return this.storage.listSessions();
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async deleteSession(sessionId: string): Promise<void> {
    if (this.currentSession?.id === sessionId) {
      this.currentSession = undefined;
    }
    await this.storage.deleteSession(sessionId);
    
    // Immediately push delete to Drive
    if (this.driveSync) {
      try {
        await this.driveSync.push();
      } catch (err) {
        console.error('[MY Coder] Drive push after delete failed:', err);
      }
    }
  }

  // ─── Rename ────────────────────────────────────────────────────────────────

  async renameSession(sessionId: string, newTitle: string): Promise<void> {
    const trimmed = newTitle.trim().slice(0, 100);
    if (!trimmed) return;

    if (this.sqliteReady) {
      this.sqlite.renameSession(sessionId, trimmed);
    } else {
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

  async clearHistory(): Promise<void> {
    this.currentSession = undefined;
    await this.storage.clearAll();
    
    // Immediately push clear to Drive
    if (this.driveSync) {
      try {
        await this.driveSync.push();
      } catch (err) {
        console.error('[MY Coder] Drive push after clear failed:', err);
      }
    }
  }

  // ─── Full Reset (sessions + API keys) ─────────────────────────────────────

  async fullReset(): Promise<void> {
    this.currentSession = undefined;
    if (this.sqliteReady) {
      await this.sqlite.clearAll();
    } else {
      await this.jsonFallback.clearAll();
    }
    if (this.driveSync) {
      try { 
        await this.driveSync.push(); 
      } catch (err) {
        console.error('[MY Coder] Drive push after reset failed:', err);
      }
    }
  }

  // ─── API Keys in SQLite ────────────────────────────────────────────────────

  saveApiKeyToDb(keyName: string, keyValue: string): void {
    if (this.sqliteReady) this.sqlite.saveApiKey(keyName, keyValue);
  }

  getApiKeyFromDb(keyName: string): string | null {
    return this.sqliteReady ? this.sqlite.getApiKey(keyName) : null;
  }

  deleteApiKeyFromDb(keyName: string): void {
    if (this.sqliteReady) this.sqlite.deleteApiKey(keyName);
  }

  listApiKeys(): Array<{ name: string; updatedAt: number }> {
    return [];
  }

  clearAllApiKeys(): void {
    if (this.sqliteReady) this.sqlite.deleteApiKey('');
  }

  // ─── Storage Stats ─────────────────────────────────────────────────────────

  getStorageStats() {
    return { sessionCount: 0, messageCount: 0, dbSizeBytes: 0, backend: 'sqlite' as const };
  }

  getLastDriveSyncTime(): number {
    return this.driveSync?.getLastSyncTime() ?? 0;
  }

  // ─── AI Context ────────────────────────────────────────────────────────────

  getMessageHistory(): ChatMessage[] {
    return this.currentSession?.messages ?? [];
  }

  getAIMessages(): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    return (this.currentSession?.messages ?? [])
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private get storage() {
    return this.sqliteReady ? this.sqlite : this.jsonFallback;
  }

  private generateTitle(mode: ChatSession['mode']): string {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const label = { 'new-app': 'New App', 'existing-project': 'Project Work', 'chat': 'Chat' }[mode];
    return `${label} — ${dateStr}`;
  }

  private truncateTitle(content: string): string {
    const cleaned = content.replace(/\n/g, ' ').trim();
    return cleaned.length > 60 ? cleaned.slice(0, 57) + '...' : cleaned;
  }
}

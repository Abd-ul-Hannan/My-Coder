// src/storage/localStorageProvider.ts
// Stores chat history locally using VS Code's globalStorageUri

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { HistoryProvider, ChatSession, SessionSummary } from '../types';

const SESSIONS_DIR = 'sessions';
const INDEX_FILE = 'sessions-index.json';

export class LocalStorageProvider implements HistoryProvider {
  private sessionsDir: string;
  private indexFile: string;

  constructor(private storageUri: vscode.Uri) {
    this.sessionsDir = path.join(storageUri.fsPath, SESSIONS_DIR);
    this.indexFile = path.join(storageUri.fsPath, INDEX_FILE);
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });

    // Create index file if it doesn't exist
    try {
      await fs.access(this.indexFile);
    } catch {
      await this.writeIndex([]);
    }
  }

  async saveSession(session: ChatSession): Promise<void> {
    await this.initialize();

    const sessionFile = path.join(this.sessionsDir, `${session.id}.json`);
    await fs.writeFile(sessionFile, JSON.stringify(session, null, 2), 'utf-8');

    // Update index
    const index = await this.readIndex();
    const existing = index.findIndex(s => s.id === session.id);
    const summary: SessionSummary = {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      mode: session.mode,
      messageCount: session.messages.length
    };

    if (existing >= 0) {
      index[existing] = summary;
    } else {
      index.unshift(summary);
    }

    // Keep max 100 sessions in index
    await this.writeIndex(index.slice(0, 100));
  }

  async loadSession(sessionId: string): Promise<ChatSession | null> {
    try {
      const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
      const content = await fs.readFile(sessionFile, 'utf-8');
      return JSON.parse(content) as ChatSession;
    } catch {
      return null;
    }
  }

  async listSessions(): Promise<SessionSummary[]> {
    try {
      return await this.readIndex();
    } catch {
      return [];
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);

    try {
      await fs.unlink(sessionFile);
    } catch {
      // File may not exist
    }

    const index = await this.readIndex();
    await this.writeIndex(index.filter(s => s.id !== sessionId));
  }

  async clearAll(): Promise<void> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      await Promise.all(
        files.map(f => fs.unlink(path.join(this.sessionsDir, f)))
      );
    } catch {
      // Directory may not exist
    }
    await this.writeIndex([]);
  }

  private async readIndex(): Promise<SessionSummary[]> {
    try {
      const content = await fs.readFile(this.indexFile, 'utf-8');
      return JSON.parse(content) as SessionSummary[];
    } catch {
      return [];
    }
  }

  private async writeIndex(index: SessionSummary[]): Promise<void> {
    await fs.writeFile(this.indexFile, JSON.stringify(index, null, 2), 'utf-8');
  }
}

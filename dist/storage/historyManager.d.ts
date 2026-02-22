import * as vscode from 'vscode';
import { ChatSession, ChatMessage, SessionSummary, AuthStatus } from '../types';
export declare class HistoryManager {
    private readonly context;
    private sqlite;
    private jsonFallback;
    private sqliteReady;
    private googleAuth;
    private driveSync?;
    private currentSession?;
    constructor(context: vscode.ExtensionContext);
    initialize(): Promise<void>;
    getAuthStatus(): Promise<AuthStatus>;
    signInWithGoogle(): Promise<AuthStatus>;
    signOut(): Promise<void>;
    createSession(mode: ChatSession['mode'], projectPath?: string): ChatSession;
    addMessage(message: Omit<ChatMessage, 'id'>): Promise<ChatMessage>;
    saveCurrentSession(): Promise<void>;
    getCurrentSession(): ChatSession | undefined;
    setCurrentSession(session: ChatSession): void;
    loadSession(sessionId: string): Promise<ChatSession | null>;
    listSessions(): Promise<SessionSummary[]>;
    deleteSession(sessionId: string): Promise<void>;
    renameSession(sessionId: string, newTitle: string): Promise<void>;
    clearHistory(): Promise<void>;
    fullReset(): Promise<void>;
    saveApiKeyToDb(keyName: string, keyValue: string): void;
    getApiKeyFromDb(keyName: string): string | null;
    deleteApiKeyFromDb(keyName: string): void;
    listApiKeys(): Array<{
        name: string;
        updatedAt: number;
    }>;
    clearAllApiKeys(): void;
    getStorageStats(): {
        backend: "sqlite";
        sessionCount: number;
        messageCount: number;
        dbSizeBytes: number;
    } | {
        sessionCount: number;
        messageCount: number;
        dbSizeBytes: number;
        backend: "json";
    };
    getLastDriveSyncTime(): number;
    getMessageHistory(): ChatMessage[];
    getAIMessages(): Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
    }>;
    private get storage();
    private generateTitle;
    private truncateTitle;
}
//# sourceMappingURL=historyManager.d.ts.map
import * as vscode from 'vscode';
import { HistoryProvider, ChatSession, SessionSummary } from '../types';
export declare class LocalStorageProvider implements HistoryProvider {
    private storageUri;
    private sessionsDir;
    private indexFile;
    constructor(storageUri: vscode.Uri);
    initialize(): Promise<void>;
    saveSession(session: ChatSession): Promise<void>;
    loadSession(sessionId: string): Promise<ChatSession | null>;
    listSessions(): Promise<SessionSummary[]>;
    deleteSession(sessionId: string): Promise<void>;
    clearAll(): Promise<void>;
    private readIndex;
    private writeIndex;
}
//# sourceMappingURL=localStorageProvider.d.ts.map
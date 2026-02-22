import { HistoryProvider, ChatSession, SessionSummary } from '../types';
export declare class SQLiteStorageProvider implements HistoryProvider {
    private db;
    private readonly dbPath;
    private initialized;
    constructor(storageDir: string);
    initialize(): Promise<boolean>;
    isAvailable(): boolean;
    close(): void;
    saveSession(session: ChatSession): Promise<void>;
    loadSession(sessionId: string): Promise<ChatSession | null>;
    listSessions(): Promise<SessionSummary[]>;
    deleteSession(sessionId: string): Promise<void>;
    clearAll(): Promise<void>;
    renameSession(sessionId: string, newTitle: string): void;
    saveApiKey(keyName: string, keyValue: string): void;
    getApiKey(keyName: string): string | null;
    deleteApiKey(keyName: string): void;
    listApiKeys(): Array<{
        name: string;
        updatedAt: number;
    }>;
    clearAllApiKeys(): void;
    saveSetting(key: string, value: string): void;
    getSetting(key: string): string | null;
    getStats(): {
        sessionCount: number;
        messageCount: number;
        dbSizeBytes: number;
    };
    getDbPath(): string;
    private requireDb;
    private hydrateSession;
}
//# sourceMappingURL=sqliteStorageProvider.d.ts.map
import { HistoryProvider, ChatSession, SessionSummary } from '../types';
export declare class DriveStorageProvider implements HistoryProvider {
    private accessTokenProvider;
    private sessionsFolderId?;
    constructor(accessTokenProvider: () => Promise<string>);
    saveSession(session: ChatSession): Promise<void>;
    loadSession(sessionId: string): Promise<ChatSession | null>;
    listSessions(): Promise<SessionSummary[]>;
    deleteSession(sessionId: string): Promise<void>;
    clearAll(): Promise<void>;
    private ensureSessionsFolder;
    private apiRequest;
    private uploadRequest;
    private findFile;
    private findFolder;
    private createFolder;
    private createFile;
    private updateFile;
    private downloadFile;
    private listFiles;
    private deleteFile;
}
//# sourceMappingURL=driveStorageProvider.d.ts.map
import { SQLiteStorageProvider } from './sqliteStorageProvider';
export declare class DriveSync {
    private readonly sqlite;
    private readonly getToken;
    private lastSyncAt;
    private debounceTimer?;
    constructor(sqlite: SQLiteStorageProvider, getToken: () => Promise<string>);
    /** Debounced push — coalesces rapid writes into one upload. */
    schedulePush(delayMs?: number): void;
    /** Immediate push — uploads the current DB file to Drive. */
    push(): Promise<void>;
    /**
     * Pull Drive DB into local.
     * - If no local DB: write Drive copy directly (fast path).
     * - If both exist: open Drive copy as a temp DB and import sessions that
     *   are MISSING locally (non-destructive merge — never deletes local data).
     */
    pull(): Promise<'replaced' | 'merged' | 'skipped'>;
    getLastSyncTime(): number;
    private mergeFrom;
    private hydrateRow;
    private pushIndex;
    private findFile;
    private downloadBytes;
    /**
     * Multipart upload — works for both create (POST) and update (PATCH).
     * Uses Buffer throughout so binary SQLite files are never corrupted.
     */
    private uploadMultipart;
    private apiRequest;
}
//# sourceMappingURL=driveSync.d.ts.map
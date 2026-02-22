import { FilePatch, PatchResult } from '../types';
export declare class PatchManager {
    private backupDir;
    constructor(backupBaseDir: string);
    createPatch(rootPath: string, filePath: string, newContent: string): Promise<FilePatch>;
    createPatches(rootPath: string, fileChanges: Map<string, string>): Promise<FilePatch[]>;
    applyPatch(rootPath: string, patch: FilePatch): Promise<void>;
    applyPatches(rootPath: string, patches: FilePatch[]): Promise<PatchResult>;
    rollbackPatch(patch: FilePatch): Promise<void>;
    rollbackAll(patches: FilePatch[]): Promise<void>;
    private createBackup;
    formatDiffForDisplay(patch: FilePatch): string;
    formatDiffAsMarkdown(patch: FilePatch): string;
    getDiffStats(patch: FilePatch): {
        additions: number;
        deletions: number;
    };
    hasMeaningfulChanges(patch: FilePatch): boolean;
    cleanupOldBackups(maxAgeHours?: number): Promise<void>;
    private escapeHtml;
}
//# sourceMappingURL=patchManager.d.ts.map
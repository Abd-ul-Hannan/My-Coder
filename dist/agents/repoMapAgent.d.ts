export interface FileNode {
    path: string;
    language: string;
    sizeBytes: number;
    exports: string[];
    imports: string[];
    summary?: string;
}
export interface RepoMap {
    rootPath: string;
    totalFiles: number;
    totalLines: number;
    languages: Record<string, number>;
    files: FileNode[];
    /** Compact text representation for AI context injection */
    compactSummary: string;
}
export declare class RepoMapAgent {
    /**
     * Scans the repository and builds a full map.
     * For large repos, limits to the most important files.
     *
     * @param rootPath    - Absolute path to repo root
     * @param maxFiles    - Max files to include in detail (default 200)
     */
    buildMap(rootPath: string, maxFiles?: number): Promise<RepoMap>;
    /**
     * Finds files matching a name pattern or content search.
     * Returns relative paths.
     */
    findFiles(rootPath: string, pattern: string): Promise<string[]>;
    /**
     * Searches file contents for a string/regex pattern.
     * Returns { file, line, content } matches.
     */
    searchContent(rootPath: string, searchTerm: string): Promise<Array<{
        file: string;
        line: number;
        content: string;
    }>>;
    /**
     * Builds a compact map string for AI context (token-efficient).
     * Example line: `src/utils/auth.ts (ts) — exports: createClient, signIn, signOut`
     */
    buildCompactSummary(files: FileNode[], rootPath?: string): string;
    private gatherFiles;
    /** Sort: entry points + config first, then by path depth (shallower = more important) */
    private sortByImportance;
    private extractExports;
    private extractImports;
}
//# sourceMappingURL=repoMapAgent.d.ts.map
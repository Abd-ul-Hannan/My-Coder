export interface GitStatus {
    branch: string;
    ahead: number;
    behind: number;
    staged: string[];
    unstaged: string[];
    untracked: string[];
    isRepo: boolean;
}
export interface GitCommit {
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    date: string;
    filesChanged: number;
}
export interface GitDiff {
    file: string;
    additions: number;
    deletions: number;
    patch: string;
}
export declare class GitOperations {
    private readonly repoPath;
    constructor(repoPath: string);
    /** Checks whether the directory is inside a git repository. */
    isGitRepo(): Promise<boolean>;
    /** Initialises a new git repository with an initial commit. */
    init(authorName?: string, authorEmail?: string): Promise<void>;
    /** Returns the full working tree status. */
    getStatus(): Promise<GitStatus>;
    /** Stages all changed files and creates a commit. */
    commitAll(message: string): Promise<string>;
    /** Returns recent commit history. */
    getLog(limit?: number): Promise<GitCommit[]>;
    /** Returns diff of staged changes. */
    getStagedDiff(): Promise<string>;
    /** Returns diff of unstaged changes for a specific file. */
    getFileDiff(filePath: string): Promise<string>;
    /** Lists all local branches. */
    getBranches(): Promise<string[]>;
    /** Creates and checks out a new branch. */
    createBranch(name: string): Promise<void>;
    /** Generates an AI-friendly commit message from staged diff. */
    static generateCommitMessagePrompt(diff: string): string;
    /** Formats git status as markdown for chat display. */
    static formatStatus(status: GitStatus): string;
    private run;
    private createGitignore;
}
//# sourceMappingURL=gitOperations.d.ts.map
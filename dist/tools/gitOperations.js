"use strict";
// src/tools/gitOperations.ts
// ─────────────────────────────────────────────────────────────────────────────
// Git Operations — built-in commit tracking and repository management
// Wraps git CLI via child_process. No external dependencies.
// ─────────────────────────────────────────────────────────────────────────────
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitOperations = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// ─── GitOperations ────────────────────────────────────────────────────────────
class GitOperations {
    repoPath;
    constructor(repoPath) {
        this.repoPath = repoPath;
    }
    /** Checks whether the directory is inside a git repository. */
    async isGitRepo() {
        try {
            await this.run('git rev-parse --is-inside-work-tree');
            return true;
        }
        catch {
            return false;
        }
    }
    /** Initialises a new git repository with an initial commit. */
    async init(authorName = 'MY Coder', authorEmail = 'mycoder@local') {
        await this.run('git init');
        await this.run(`git config user.name "${authorName}"`);
        await this.run(`git config user.email "${authorEmail}"`);
        await this.createGitignore();
        await this.run('git add -A');
        await this.run('git commit -m "Initial commit by MY Coder"');
    }
    /** Returns the full working tree status. */
    async getStatus() {
        try {
            const [branchOut, statusOut] = await Promise.all([
                this.run('git branch --show-current'),
                this.run('git status --porcelain=v1'),
            ]);
            const branch = branchOut.trim() || 'HEAD';
            const staged = [];
            const unstaged = [];
            const untracked = [];
            for (const line of statusOut.split('\n')) {
                if (!line.trim())
                    continue;
                const xy = line.slice(0, 2);
                const file = line.slice(3).trim();
                if (xy[0] !== ' ' && xy[0] !== '?')
                    staged.push(file);
                if (xy[1] === 'M' || xy[1] === 'D')
                    unstaged.push(file);
                if (xy === '??')
                    untracked.push(file);
            }
            // ahead/behind
            let ahead = 0;
            let behind = 0;
            try {
                const abOut = await this.run(`git rev-list --left-right --count origin/${branch}...HEAD`);
                const parts = abOut.trim().split(/\s+/);
                behind = parseInt(parts[0] ?? '0', 10);
                ahead = parseInt(parts[1] ?? '0', 10);
            }
            catch { /* no remote */ }
            return { branch, ahead, behind, staged, unstaged, untracked, isRepo: true };
        }
        catch {
            return { branch: '', ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [], isRepo: false };
        }
    }
    /** Stages all changed files and creates a commit. */
    async commitAll(message) {
        await this.run('git add -A');
        const result = await this.run(`git commit -m "${message.replace(/"/g, '\\"')}"`);
        // Extract hash from output
        const match = result.match(/\[.+?([a-f0-9]{7})\]/);
        return match?.[1] ?? 'committed';
    }
    /** Returns recent commit history. */
    async getLog(limit = 20) {
        try {
            const out = await this.run(`git log --oneline --format="%H|%h|%s|%an|%ar|%b" -${limit}`);
            const commits = [];
            for (const line of out.split('\n')) {
                if (!line.trim())
                    continue;
                const parts = line.split('|');
                commits.push({
                    hash: parts[0] ?? '',
                    shortHash: parts[1] ?? '',
                    message: parts[2] ?? '',
                    author: parts[3] ?? '',
                    date: parts[4] ?? '',
                    filesChanged: 0,
                });
            }
            return commits;
        }
        catch {
            return [];
        }
    }
    /** Returns diff of staged changes. */
    async getStagedDiff() {
        try {
            return await this.run('git diff --cached');
        }
        catch {
            return '';
        }
    }
    /** Returns diff of unstaged changes for a specific file. */
    async getFileDiff(filePath) {
        try {
            return await this.run(`git diff "${filePath}"`);
        }
        catch {
            return '';
        }
    }
    /** Lists all local branches. */
    async getBranches() {
        try {
            const out = await this.run('git branch');
            return out.split('\n').map(b => b.replace('*', '').trim()).filter(Boolean);
        }
        catch {
            return [];
        }
    }
    /** Creates and checks out a new branch. */
    async createBranch(name) {
        await this.run(`git checkout -b "${name}"`);
    }
    /** Generates an AI-friendly commit message from staged diff. */
    static generateCommitMessagePrompt(diff) {
        const lines = diff.split('\n').slice(0, 80).join('\n');
        return `Generate a concise git commit message for this diff (imperative mood, max 72 chars, no period):\n\n${lines}`;
    }
    /** Formats git status as markdown for chat display. */
    static formatStatus(status) {
        if (!status.isRepo)
            return '⚠️ Not a git repository.';
        const lines = [`**Git Status** — branch: \`${status.branch}\``];
        if (status.ahead)
            lines.push(`↑ ${status.ahead} ahead of remote`);
        if (status.behind)
            lines.push(`↓ ${status.behind} behind remote`);
        if (status.staged.length)
            lines.push(`\n**Staged (${status.staged.length}):**\n${status.staged.map(f => `  ✅ ${f}`).join('\n')}`);
        if (status.unstaged.length)
            lines.push(`\n**Modified (${status.unstaged.length}):**\n${status.unstaged.map(f => `  📝 ${f}`).join('\n')}`);
        if (status.untracked.length)
            lines.push(`\n**Untracked (${status.untracked.length}):**\n${status.untracked.slice(0, 10).map(f => `  ❓ ${f}`).join('\n')}`);
        return lines.join('\n');
    }
    async run(command) {
        const { stdout } = await execAsync(command, { cwd: this.repoPath });
        return stdout;
    }
    async createGitignore() {
        const gitignorePath = path.join(this.repoPath, '.gitignore');
        try {
            await fs.access(gitignorePath);
            return;
        }
        catch { /* doesn't exist, create it */ }
        const content = [
            'node_modules/', 'dist/', '.next/', 'build/', '.env', '.env.local',
            '*.log', '.DS_Store', 'coverage/', '.turbo/', '__pycache__/', '*.pyc',
            'target/', '*.class', '.idea/', '.vscode/settings.json',
        ].join('\n');
        await fs.writeFile(gitignorePath, content, 'utf-8');
    }
}
exports.GitOperations = GitOperations;
//# sourceMappingURL=gitOperations.js.map
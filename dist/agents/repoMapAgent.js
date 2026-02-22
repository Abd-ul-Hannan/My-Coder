"use strict";
// src/agents/repoMapAgent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Repository Map Agent — Code Exploration Agent
//
// Builds a compact, token-efficient map of the repository so the AI has
// full context even for large codebases (200K+ token models).
//
// Features:
//   - Generates a symbol index (all exports per file)
//   - Finds files by name, pattern, or content
//   - Summarises each file's purpose in one line (AI-assisted)
//   - Outputs a condensed repo map suitable for large-context AI calls
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
exports.RepoMapAgent = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
// Extensions we scan for symbols
const CODE_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
    '.kt', '.swift', '.rb', '.php', '.cs', '.cpp', '.c', '.scala',
]);
const IGNORE_DIRS = new Set([
    'node_modules', '.git', 'dist', '.next', 'build', 'coverage',
    '__pycache__', 'target', '.turbo', '.cache', '.vscode',
]);
// ─── RepoMapAgent ─────────────────────────────────────────────────────────────
class RepoMapAgent {
    /**
     * Scans the repository and builds a full map.
     * For large repos, limits to the most important files.
     *
     * @param rootPath    - Absolute path to repo root
     * @param maxFiles    - Max files to include in detail (default 200)
     */
    async buildMap(rootPath, maxFiles = 200) {
        const allFiles = await this.gatherFiles(rootPath);
        const sorted = this.sortByImportance(allFiles).slice(0, maxFiles);
        const fileNodes = [];
        let totalLines = 0;
        const languages = {};
        for (const filePath of sorted) {
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const lines = content.split('\n').length;
                totalLines += lines;
                const ext = path.extname(filePath);
                languages[ext] = (languages[ext] ?? 0) + 1;
                const node = {
                    path: path.relative(rootPath, filePath),
                    language: EXT_TO_LANG[ext] ?? 'text',
                    sizeBytes: Buffer.byteLength(content),
                    exports: this.extractExports(content, ext),
                    imports: this.extractImports(content, ext),
                };
                fileNodes.push(node);
            }
            catch { /* skip unreadable */ }
        }
        const compactSummary = this.buildCompactSummary(fileNodes, rootPath);
        return {
            rootPath,
            totalFiles: allFiles.length,
            totalLines,
            languages,
            files: fileNodes,
            compactSummary,
        };
    }
    /**
     * Finds files matching a name pattern or content search.
     * Returns relative paths.
     */
    async findFiles(rootPath, pattern) {
        const allFiles = await this.gatherFiles(rootPath);
        const lower = pattern.toLowerCase();
        return allFiles
            .map(f => path.relative(rootPath, f))
            .filter(f => f.toLowerCase().includes(lower))
            .slice(0, 30);
    }
    /**
     * Searches file contents for a string/regex pattern.
     * Returns { file, line, content } matches.
     */
    async searchContent(rootPath, searchTerm) {
        const allFiles = await this.gatherFiles(rootPath);
        const results = [];
        const lowerSearch = searchTerm.toLowerCase();
        for (const filePath of allFiles.slice(0, 300)) {
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].toLowerCase().includes(lowerSearch)) {
                        results.push({
                            file: path.relative(rootPath, filePath),
                            line: i + 1,
                            content: lines[i].trim().slice(0, 120),
                        });
                        if (results.length >= 50)
                            return results;
                    }
                }
            }
            catch { /* skip */ }
        }
        return results;
    }
    /**
     * Builds a compact map string for AI context (token-efficient).
     * Example line: `src/utils/auth.ts (ts) — exports: createClient, signIn, signOut`
     */
    buildCompactSummary(files, rootPath) {
        const lines = files.map(f => {
            const exportsStr = f.exports.length ? ` — exports: ${f.exports.slice(0, 5).join(', ')}` : '';
            return `${f.path} (${f.language})${exportsStr}`;
        });
        return `Repository map (${files.length} files):\n${lines.join('\n')}`;
    }
    // ─── Private ─────────────────────────────────────────────────────────────
    async gatherFiles(rootPath) {
        const results = [];
        async function walk(dir) {
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                for (const e of entries) {
                    if (IGNORE_DIRS.has(e.name))
                        continue;
                    const full = path.join(dir, e.name);
                    if (e.isDirectory())
                        await walk(full);
                    else if (CODE_EXTENSIONS.has(path.extname(e.name)))
                        results.push(full);
                }
            }
            catch { /* skip */ }
        }
        await walk(rootPath);
        return results;
    }
    /** Sort: entry points + config first, then by path depth (shallower = more important) */
    sortByImportance(files) {
        const PRIORITY = ['index', 'main', 'app', 'server', 'config', 'types', 'utils'];
        return files.sort((a, b) => {
            const aName = path.basename(a, path.extname(a)).toLowerCase();
            const bName = path.basename(b, path.extname(b)).toLowerCase();
            const aPriority = PRIORITY.findIndex(p => aName.includes(p));
            const bPriority = PRIORITY.findIndex(p => bName.includes(p));
            if (aPriority !== bPriority)
                return (aPriority === -1 ? 999 : aPriority) - (bPriority === -1 ? 999 : bPriority);
            return a.split('/').length - b.split('/').length;
        });
    }
    extractExports(content, ext) {
        const results = [];
        if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
            const patterns = [
                /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|interface|type|enum)\s+(\w+)/g,
                /export\s+\{\s*([^}]+)\s*\}/g,
            ];
            for (const pattern of patterns) {
                let m;
                while ((m = pattern.exec(content)) !== null) {
                    const names = m[1].split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
                    results.push(...names);
                }
            }
        }
        else if (ext === '.py') {
            const m = content.match(/^def\s+(\w+)|^class\s+(\w+)/gm) ?? [];
            results.push(...m.map(l => l.replace(/^(def|class)\s+/, '')));
        }
        return [...new Set(results)].slice(0, 10);
    }
    extractImports(content, ext) {
        const results = [];
        if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
            const m = content.match(/from\s+['"]([^'"]+)['"]/g) ?? [];
            results.push(...m.map(s => s.replace(/from\s+['"]|['"]/g, '')));
        }
        return [...new Set(results)].filter(i => !i.startsWith('.')).slice(0, 8);
    }
}
exports.RepoMapAgent = RepoMapAgent;
const EXT_TO_LANG = {
    '.ts': 'ts', '.tsx': 'tsx', '.js': 'js', '.jsx': 'jsx',
    '.py': 'py', '.go': 'go', '.rs': 'rs', '.java': 'java',
    '.kt': 'kt', '.swift': 'swift', '.rb': 'rb', '.php': 'php',
    '.cs': 'cs', '.cpp': 'cpp', '.c': 'c', '.scala': 'scala',
};
//# sourceMappingURL=repoMapAgent.js.map
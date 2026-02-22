"use strict";
// src/agents/contextResolver.ts
// ─────────────────────────────────────────────────────────────────────────────
// Context Resolver — resolves @-references in user messages
//
// Supported references:
//   @file:path/to/file.ts    — injects file content
//   @folder:src/components   — injects all files in folder
//   @workspace               — injects project structure summary
//   @symbol:MyClass          — finds and injects a symbol definition
//   @prompt:name             — expands a saved custom prompt
//   @url:https://...         — fetches and injects URL content (via Tavily)
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
exports.hasContextReferences = hasContextReferences;
exports.resolveContextReferences = resolveContextReferences;
exports.detectAtReferencePrefix = detectAtReferencePrefix;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
// ─── Reference Patterns ───────────────────────────────────────────────────────
const AT_FILE_PATTERN = /@file:([^\s,)]+)/g;
const AT_FOLDER_PATTERN = /@folder:([^\s,)]+)/g;
const AT_WORKSPACE_PATTERN = /@workspace/g;
const AT_SYMBOL_PATTERN = /@symbol:([^\s,)]+)/g;
const AT_PROMPT_PATTERN = /@prompt:([^\s,)]+)/g;
const AT_URL_PATTERN = /@url:([^\s,)]+)/g;
// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Detects whether a user message contains any @-references.
 */
function hasContextReferences(message) {
    return (AT_FILE_PATTERN.test(message) ||
        AT_FOLDER_PATTERN.test(message) ||
        AT_WORKSPACE_PATTERN.test(message) ||
        AT_SYMBOL_PATTERN.test(message) ||
        AT_PROMPT_PATTERN.test(message) ||
        AT_URL_PATTERN.test(message));
}
/**
 * Resolves all @-references in a user message and returns enriched context.
 *
 * @param message         - Raw user message possibly containing @-references
 * @param workspaceRoot   - Absolute path to the workspace root
 * @param savedPrompts    - User's custom saved prompts
 * @param tavilyKey       - Optional Tavily API key for @url: references
 */
async function resolveContextReferences(message, workspaceRoot, savedPrompts = [], tavilyKey) {
    let resolved = message;
    const injectedFiles = [];
    const contextParts = [];
    // ── @file:path ──────────────────────────────────────────────────────────
    const fileMatches = [...message.matchAll(AT_FILE_PATTERN)];
    for (const match of fileMatches) {
        const filePath = match[1];
        const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
        try {
            const content = await fs.readFile(absPath, 'utf-8');
            const snippet = `\n\`\`\`${getLanguage(filePath)}\n// @file:${filePath}\n${content}\n\`\`\`\n`;
            contextParts.push(snippet);
            injectedFiles.push(filePath);
            resolved = resolved.replace(match[0], `[file: ${filePath}]`);
        }
        catch {
            resolved = resolved.replace(match[0], `[file not found: ${filePath}]`);
        }
    }
    // ── @folder:path ────────────────────────────────────────────────────────
    const folderMatches = [...message.matchAll(AT_FOLDER_PATTERN)];
    for (const match of folderMatches) {
        const folderPath = match[1];
        const absFolder = path.isAbsolute(folderPath) ? folderPath : path.join(workspaceRoot, folderPath);
        try {
            const files = await readFolderFiles(absFolder, 10); // max 10 files
            for (const [fp, content] of files) {
                const relPath = path.relative(workspaceRoot, fp);
                contextParts.push(`\n\`\`\`${getLanguage(fp)}\n// @folder:${relPath}\n${content}\n\`\`\`\n`);
                injectedFiles.push(relPath);
            }
            resolved = resolved.replace(match[0], `[folder: ${folderPath}, ${files.length} files]`);
        }
        catch {
            resolved = resolved.replace(match[0], `[folder not found: ${folderPath}]`);
        }
    }
    // ── @workspace ──────────────────────────────────────────────────────────
    if (AT_WORKSPACE_PATTERN.test(message)) {
        AT_WORKSPACE_PATTERN.lastIndex = 0; // reset regex state
        const structure = await getWorkspaceStructure(workspaceRoot);
        contextParts.push(`\n**Workspace structure:**\n\`\`\`\n${structure}\n\`\`\`\n`);
        resolved = resolved.replace(AT_WORKSPACE_PATTERN, '[workspace context attached]');
    }
    // ── @symbol:Name ────────────────────────────────────────────────────────
    const symbolMatches = [...message.matchAll(AT_SYMBOL_PATTERN)];
    for (const match of symbolMatches) {
        const symbolName = match[1];
        const found = await findSymbolInWorkspace(symbolName, workspaceRoot);
        if (found) {
            contextParts.push(`\n**Symbol \`${symbolName}\`:**\n\`\`\`typescript\n${found}\n\`\`\`\n`);
            resolved = resolved.replace(match[0], `[symbol: ${symbolName}]`);
        }
        else {
            resolved = resolved.replace(match[0], `[symbol not found: ${symbolName}]`);
        }
    }
    // ── @prompt:name ────────────────────────────────────────────────────────
    const promptMatches = [...message.matchAll(AT_PROMPT_PATTERN)];
    for (const match of promptMatches) {
        const promptName = match[1];
        const saved = savedPrompts.find(p => p.name.toLowerCase() === promptName.toLowerCase());
        if (saved) {
            resolved = resolved.replace(match[0], saved.content);
        }
        else {
            resolved = resolved.replace(match[0], `[prompt not found: ${promptName}]`);
        }
    }
    // ── @url:https://... ────────────────────────────────────────────────────
    const urlMatches = [...message.matchAll(AT_URL_PATTERN)];
    for (const match of urlMatches) {
        const url = match[1];
        if (tavilyKey) {
            const extracted = await extractUrlContent(url, tavilyKey);
            contextParts.push(`\n**Content from ${url}:**\n${extracted}\n`);
            resolved = resolved.replace(match[0], `[url content attached: ${url}]`);
        }
        else {
            resolved = resolved.replace(match[0], `[url: ${url} — set Tavily key for web extraction]`);
        }
    }
    const contextBlock = contextParts.join('\n');
    const fullMessage = contextBlock ? `${resolved}\n\n---\n${contextBlock}` : resolved;
    return {
        resolvedMessage: fullMessage,
        injectedFiles,
        contextSize: fullMessage.length,
    };
}
/**
 * Returns all @-references found in a message for autocomplete suggestions.
 */
function detectAtReferencePrefix(inputSoFar) {
    const match = inputSoFar.match(/@(file:|folder:|symbol:|prompt:|url:|workspace)?(\w*)$/);
    return match ? match[0] : null;
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
async function readFolderFiles(folderPath, maxFiles) {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const results = [];
    const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.css', '.html']);
    for (const entry of entries) {
        if (results.length >= maxFiles)
            break;
        if (!entry.isFile())
            continue;
        const ext = path.extname(entry.name);
        if (!CODE_EXTS.has(ext))
            continue;
        const fullPath = path.join(folderPath, entry.name);
        try {
            const content = await fs.readFile(fullPath, 'utf-8');
            results.push([fullPath, content.slice(0, 3000)]); // cap per file
        }
        catch { /* skip unreadable */ }
    }
    return results;
}
async function getWorkspaceStructure(rootPath, depth = 3) {
    const lines = [];
    await walkDir(rootPath, '', depth, lines);
    return lines.slice(0, 60).join('\n');
}
async function walkDir(dir, prefix, remaining, out) {
    if (remaining <= 0)
        return;
    const IGNORE = new Set(['node_modules', '.git', 'dist', '.next', 'build', '__pycache__', '.cache']);
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (IGNORE.has(entry.name))
                continue;
            out.push(`${prefix}${entry.isDirectory() ? '📁' : '📄'} ${entry.name}`);
            if (entry.isDirectory()) {
                await walkDir(path.join(dir, entry.name), prefix + '  ', remaining - 1, out);
            }
        }
    }
    catch { /* ignore permission errors */ }
}
async function findSymbolInWorkspace(symbolName, rootPath) {
    const TS_EXTS = ['.ts', '.tsx', '.js', '.jsx'];
    const PATTERNS = [
        new RegExp(`(export\\s+(?:async\\s+)?function\\s+${symbolName}[\\s({])([\\s\\S]{0,600})`),
        new RegExp(`(export\\s+(?:default\\s+)?(?:class|interface|type|const|enum)\\s+${symbolName}[\\s{=<])([\\s\\S]{0,600})`),
    ];
    const files = await getAllFilesRecursive(rootPath, TS_EXTS);
    for (const filePath of files.slice(0, 100)) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            for (const pattern of PATTERNS) {
                const match = content.match(pattern);
                if (match) {
                    // Return surrounding block (up to 600 chars)
                    const idx = content.indexOf(match[0]);
                    return content.slice(Math.max(0, idx), idx + 600);
                }
            }
        }
        catch { /* skip */ }
    }
    return null;
}
async function getAllFilesRecursive(dir, extensions) {
    const IGNORE = new Set(['node_modules', '.git', 'dist', '.next', 'build']);
    const results = [];
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (IGNORE.has(entry.name))
                continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results.push(...await getAllFilesRecursive(full, extensions));
            }
            else if (extensions.includes(path.extname(entry.name))) {
                results.push(full);
            }
        }
    }
    catch { /* ignore */ }
    return results;
}
async function extractUrlContent(url, tavilyKey) {
    try {
        const response = await fetch('https://api.tavily.com/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: tavilyKey, urls: [url] }),
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
            return `[Could not extract: HTTP ${response.status}]`;
        const data = await response.json();
        return data.results?.[0]?.raw_content?.slice(0, 4000) ?? '[No content extracted]';
    }
    catch (err) {
        return `[Extraction failed: ${err instanceof Error ? err.message : String(err)}]`;
    }
}
function getLanguage(filePath) {
    const map = {
        '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
        '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java',
        '.css': 'css', '.html': 'html', '.json': 'json', '.md': 'markdown',
    };
    return map[path.extname(filePath)] ?? 'text';
}
//# sourceMappingURL=contextResolver.js.map
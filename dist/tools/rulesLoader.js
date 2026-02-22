"use strict";
// src/tools/rulesLoader.ts
// ─────────────────────────────────────────────────────────────────────────────
// Rules Loader — reads package-level AI instruction files
//
// Supported locations (all merged):
//   .amazonq/rules/*.md       — Amazon Q compatible rules
//   .mycoder/rules/*.md       — MY Coder native rules
//   .cursorrules              — Cursor-style single file rules
//   .github/copilot-instructions.md — GitHub Copilot instructions
//
// Rules are injected into every AI system prompt as additional constraints,
// giving teams the ability to enforce coding standards project-wide.
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
exports.loadProjectRules = loadProjectRules;
exports.initializeRulesDirectory = initializeRulesDirectory;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const RULES_LOCATIONS = [
    { dir: '.amazonq/rules', glob: '*.md' },
    { dir: '.mycoder/rules', glob: '*.md' },
    { dir: '.github', glob: 'copilot-instructions.md' },
];
const SINGLE_FILE_RULES = [
    '.cursorrules',
    '.mycoderrules',
    '.clinerules',
];
/**
 * Loads all project-level AI rules from standard locations.
 * Results are cached per workspace root for the session.
 */
async function loadProjectRules(workspaceRoot) {
    const parts = [];
    const sources = [];
    // ── Folder-based rules ───────────────────────────────────────────────────
    for (const loc of RULES_LOCATIONS) {
        const dirPath = path.join(workspaceRoot, loc.dir);
        try {
            const entries = await fs.readdir(dirPath);
            for (const entry of entries) {
                if (!entry.endsWith('.md') && !entry.endsWith('.txt'))
                    continue;
                const fullPath = path.join(dirPath, entry);
                const content = await fs.readFile(fullPath, 'utf-8');
                if (content.trim()) {
                    parts.push(`## Rules from ${path.join(loc.dir, entry)}\n\n${content.trim()}`);
                    sources.push(path.join(loc.dir, entry));
                }
            }
        }
        catch { /* directory doesn't exist — skip */ }
    }
    // ── Single-file rules ────────────────────────────────────────────────────
    for (const filename of SINGLE_FILE_RULES) {
        try {
            const content = await fs.readFile(path.join(workspaceRoot, filename), 'utf-8');
            if (content.trim()) {
                parts.push(`## Rules from ${filename}\n\n${content.trim()}`);
                sources.push(filename);
            }
        }
        catch { /* file doesn't exist — skip */ }
    }
    if (!parts.length) {
        return { content: '', sources: [], isEmpty: true };
    }
    return {
        content: `# Project-Level Coding Rules\n\nThe following rules MUST be followed for this project:\n\n${parts.join('\n\n---\n\n')}`,
        sources,
        isEmpty: false,
    };
}
/**
 * Creates the .mycoder/rules/ directory structure with a starter rules file.
 * Called when user runs "MY Coder: Initialize Rules".
 */
async function initializeRulesDirectory(workspaceRoot) {
    const rulesDir = path.join(workspaceRoot, '.mycoder', 'rules');
    await fs.mkdir(rulesDir, { recursive: true });
    const starterPath = path.join(rulesDir, 'coding-standards.md');
    try {
        await fs.access(starterPath);
        return starterPath;
    }
    catch { /* create it */ }
    const starterContent = `# Coding Standards

## Language & Style
- Use TypeScript with strict mode enabled
- Prefer \`const\` over \`let\`, never \`var\`
- Use arrow functions for callbacks
- Add JSDoc comments to all exported functions

## Architecture
- Keep components under 200 lines
- Single responsibility principle
- No business logic in UI components
- Use custom hooks for reusable logic

## Error Handling
- Always handle async errors with try/catch
- Never swallow errors silently
- Use typed error classes

## Testing
- Write tests for all utility functions
- Aim for 80%+ coverage on business logic
- Use descriptive test names: "should do X when Y"

## Security
- Never hardcode secrets or API keys
- Validate all user inputs
- Use parameterized queries for databases
- Enable RLS on all Supabase tables
`;
    await fs.writeFile(starterPath, starterContent, 'utf-8');
    return starterPath;
}
//# sourceMappingURL=rulesLoader.js.map
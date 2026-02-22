"use strict";
// src/core/patchManager.ts
// Safely applies patches to existing files with backup, diff preview, and rollback support
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
exports.PatchManager = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const diff = __importStar(require("diff"));
class PatchManager {
    backupDir;
    constructor(backupBaseDir) {
        this.backupDir = path.join(backupBaseDir, '.my-coder-backups');
    }
    async createPatch(rootPath, filePath, newContent) {
        const absolutePath = path.join(rootPath, filePath);
        let originalContent = '';
        try {
            originalContent = await fs.readFile(absolutePath, 'utf-8');
        }
        catch {
            // File doesn't exist yet — this is a new file addition
        }
        const diffResult = diff.createTwoFilesPatch(filePath, filePath, originalContent, newContent, 'original', 'modified');
        return {
            filePath,
            originalContent,
            newContent,
            diff: diffResult
        };
    }
    async createPatches(rootPath, fileChanges) {
        const patches = [];
        for (const [filePath, newContent] of fileChanges.entries()) {
            const patch = await this.createPatch(rootPath, filePath, newContent);
            patches.push(patch);
        }
        return patches;
    }
    async applyPatch(rootPath, patch) {
        const absolutePath = path.join(rootPath, patch.filePath);
        // Create backup if file exists
        if (patch.originalContent) {
            const backupPath = await this.createBackup(absolutePath, patch.filePath);
            patch.backupPath = backupPath;
        }
        // Ensure parent directory exists
        const parentDir = path.dirname(absolutePath);
        await fs.mkdir(parentDir, { recursive: true });
        // Write new content
        await fs.writeFile(absolutePath, patch.newContent, 'utf-8');
    }
    async applyPatches(rootPath, patches) {
        const appliedPatches = [];
        const failedPatches = [];
        const errors = [];
        for (const patch of patches) {
            try {
                await this.applyPatch(rootPath, patch);
                appliedPatches.push(patch);
            }
            catch (error) {
                failedPatches.push(patch);
                errors.push(`Failed to apply patch for ${patch.filePath}: ${error}`);
            }
        }
        return {
            success: failedPatches.length === 0,
            appliedPatches,
            failedPatches,
            errors
        };
    }
    async rollbackPatch(patch) {
        if (!patch.backupPath) {
            throw new Error(`No backup available for ${patch.filePath}`);
        }
        const backupContent = await fs.readFile(patch.backupPath, 'utf-8');
        await fs.writeFile(patch.filePath, backupContent, 'utf-8');
        await fs.unlink(patch.backupPath);
    }
    async rollbackAll(patches) {
        const rollbackErrors = [];
        for (const patch of patches.reverse()) {
            if (patch.backupPath) {
                try {
                    await this.rollbackPatch(patch);
                }
                catch (error) {
                    rollbackErrors.push(`Failed to rollback ${patch.filePath}: ${error}`);
                }
            }
        }
        if (rollbackErrors.length > 0) {
            throw new Error(`Rollback errors:\n${rollbackErrors.join('\n')}`);
        }
    }
    async createBackup(absolutePath, relativePath) {
        await fs.mkdir(this.backupDir, { recursive: true });
        const timestamp = Date.now();
        const safeName = relativePath.replace(/[/\\]/g, '__');
        const backupPath = path.join(this.backupDir, `${timestamp}__${safeName}`);
        try {
            const content = await fs.readFile(absolutePath, 'utf-8');
            await fs.writeFile(backupPath, content, 'utf-8');
        }
        catch {
            // Original file may not exist (new file)
        }
        return backupPath;
    }
    formatDiffForDisplay(patch) {
        if (!patch.diff)
            return 'No changes';
        const lines = patch.diff.split('\n');
        const formatted = lines.map(line => {
            if (line.startsWith('+') && !line.startsWith('+++'))
                return `<ins>${this.escapeHtml(line)}</ins>`;
            if (line.startsWith('-') && !line.startsWith('---'))
                return `<del>${this.escapeHtml(line)}</del>`;
            return this.escapeHtml(line);
        });
        return formatted.join('\n');
    }
    formatDiffAsMarkdown(patch) {
        const isNewFile = !patch.originalContent;
        const header = isNewFile
            ? `### ✨ New File: \`${patch.filePath}\``
            : `### 📝 Modified: \`${patch.filePath}\``;
        return `${header}\n\`\`\`diff\n${patch.diff}\n\`\`\``;
    }
    getDiffStats(patch) {
        const lines = patch.diff.split('\n');
        const additions = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
        const deletions = lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;
        return { additions, deletions };
    }
    hasMeaningfulChanges(patch) {
        if (!patch.originalContent)
            return true; // New file
        const { additions, deletions } = this.getDiffStats(patch);
        return additions + deletions > 0;
    }
    async cleanupOldBackups(maxAgeHours = 24) {
        try {
            const entries = await fs.readdir(this.backupDir);
            const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
            for (const entry of entries) {
                const timestamp = parseInt(entry.split('__')[0]);
                if (!isNaN(timestamp) && timestamp < cutoff) {
                    await fs.unlink(path.join(this.backupDir, entry));
                }
            }
        }
        catch {
            // Backup dir may not exist
        }
    }
    escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}
exports.PatchManager = PatchManager;
//# sourceMappingURL=patchManager.js.map
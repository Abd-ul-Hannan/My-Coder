"use strict";
// src/storage/localStorageProvider.ts
// Stores chat history locally using VS Code's globalStorageUri
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
exports.LocalStorageProvider = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const SESSIONS_DIR = 'sessions';
const INDEX_FILE = 'sessions-index.json';
class LocalStorageProvider {
    storageUri;
    sessionsDir;
    indexFile;
    constructor(storageUri) {
        this.storageUri = storageUri;
        this.sessionsDir = path.join(storageUri.fsPath, SESSIONS_DIR);
        this.indexFile = path.join(storageUri.fsPath, INDEX_FILE);
    }
    async initialize() {
        await fs.mkdir(this.sessionsDir, { recursive: true });
        // Create index file if it doesn't exist
        try {
            await fs.access(this.indexFile);
        }
        catch {
            await this.writeIndex([]);
        }
    }
    async saveSession(session) {
        await this.initialize();
        const sessionFile = path.join(this.sessionsDir, `${session.id}.json`);
        await fs.writeFile(sessionFile, JSON.stringify(session, null, 2), 'utf-8');
        // Update index
        const index = await this.readIndex();
        const existing = index.findIndex(s => s.id === session.id);
        const summary = {
            id: session.id,
            title: session.title,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            mode: session.mode,
            messageCount: session.messages.length
        };
        if (existing >= 0) {
            index[existing] = summary;
        }
        else {
            index.unshift(summary);
        }
        // Keep max 100 sessions in index
        await this.writeIndex(index.slice(0, 100));
    }
    async loadSession(sessionId) {
        try {
            const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
            const content = await fs.readFile(sessionFile, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    async listSessions() {
        try {
            return await this.readIndex();
        }
        catch {
            return [];
        }
    }
    async deleteSession(sessionId) {
        const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
        try {
            await fs.unlink(sessionFile);
        }
        catch {
            // File may not exist
        }
        const index = await this.readIndex();
        await this.writeIndex(index.filter(s => s.id !== sessionId));
    }
    async clearAll() {
        try {
            const files = await fs.readdir(this.sessionsDir);
            await Promise.all(files.map(f => fs.unlink(path.join(this.sessionsDir, f))));
        }
        catch {
            // Directory may not exist
        }
        await this.writeIndex([]);
    }
    async readIndex() {
        try {
            const content = await fs.readFile(this.indexFile, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return [];
        }
    }
    async writeIndex(index) {
        await fs.writeFile(this.indexFile, JSON.stringify(index, null, 2), 'utf-8');
    }
}
exports.LocalStorageProvider = LocalStorageProvider;
//# sourceMappingURL=localStorageProvider.js.map
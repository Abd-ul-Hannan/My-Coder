"use strict";
// src/storage/driveStorageProvider.ts
// Stores chat history in Google Drive appData folder using minimal OAuth scope
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
exports.DriveStorageProvider = void 0;
const https = __importStar(require("https"));
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const APP_FOLDER = 'appDataFolder';
const SESSIONS_FOLDER_NAME = 'my-coder-sessions';
class DriveStorageProvider {
    accessTokenProvider;
    sessionsFolderId;
    constructor(accessTokenProvider) {
        this.accessTokenProvider = accessTokenProvider;
    }
    async saveSession(session) {
        const folderId = await this.ensureSessionsFolder();
        const fileName = `session-${session.id}.json`;
        const content = JSON.stringify(session);
        // Check if file already exists
        const existingId = await this.findFile(fileName, folderId);
        if (existingId) {
            await this.updateFile(existingId, content);
        }
        else {
            await this.createFile(fileName, content, folderId);
        }
    }
    async loadSession(sessionId) {
        try {
            const folderId = await this.ensureSessionsFolder();
            const fileName = `session-${sessionId}.json`;
            const fileId = await this.findFile(fileName, folderId);
            if (!fileId)
                return null;
            const content = await this.downloadFile(fileId);
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    async listSessions() {
        try {
            const folderId = await this.ensureSessionsFolder();
            const files = await this.listFiles(folderId);
            const sessions = [];
            await Promise.all(files.map(async (file) => {
                try {
                    const content = await this.downloadFile(file.id);
                    const session = JSON.parse(content);
                    sessions.push({
                        id: session.id,
                        title: session.title,
                        createdAt: session.createdAt,
                        updatedAt: session.updatedAt,
                        mode: session.mode,
                        messageCount: session.messages.length
                    });
                }
                catch {
                    // Skip corrupted files
                }
            }));
            return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
        }
        catch {
            return [];
        }
    }
    async deleteSession(sessionId) {
        const folderId = await this.ensureSessionsFolder();
        const fileName = `session-${sessionId}.json`;
        const fileId = await this.findFile(fileName, folderId);
        if (fileId) {
            await this.deleteFile(fileId);
        }
    }
    async clearAll() {
        const folderId = await this.ensureSessionsFolder();
        const files = await this.listFiles(folderId);
        await Promise.all(files.map(f => this.deleteFile(f.id)));
    }
    async ensureSessionsFolder() {
        if (this.sessionsFolderId)
            return this.sessionsFolderId;
        // Search for existing folder
        const existingId = await this.findFolder(SESSIONS_FOLDER_NAME);
        if (existingId) {
            this.sessionsFolderId = existingId;
            return existingId;
        }
        // Create new folder
        const folderId = await this.createFolder(SESSIONS_FOLDER_NAME);
        this.sessionsFolderId = folderId;
        return folderId;
    }
    async apiRequest(method, path, body, params) {
        const token = await this.accessTokenProvider();
        const queryString = params
            ? '?' + new URLSearchParams(params).toString()
            : '';
        const url = new URL(path.startsWith('http') ? path : `${DRIVE_API_BASE}${path}${queryString}`);
        return new Promise((resolve, reject) => {
            const bodyStr = body ? JSON.stringify(body) : undefined;
            const options = {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
                }
            };
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(data ? JSON.parse(data) : {});
                        }
                        catch {
                            resolve(data);
                        }
                    }
                    else {
                        reject(new Error(`Drive API error ${res.statusCode}: ${data}`));
                    }
                });
            });
            req.on('error', reject);
            if (bodyStr)
                req.write(bodyStr);
            req.end();
        });
    }
    async uploadRequest(method, fileId, fileName, content, parentId) {
        const token = await this.accessTokenProvider();
        const isUpdate = !!fileId;
        const metadataPath = isUpdate
            ? `${UPLOAD_API}/files/${fileId}?uploadType=multipart`
            : `${UPLOAD_API}/files?uploadType=multipart`;
        const metadata = isUpdate ? {} : {
            name: fileName,
            parents: [parentId]
        };
        const boundary = 'boundary_my_coder_' + Date.now();
        const metadataStr = JSON.stringify(metadata);
        const body = [
            `--${boundary}`,
            'Content-Type: application/json; charset=UTF-8',
            '',
            metadataStr,
            `--${boundary}`,
            'Content-Type: application/json',
            '',
            content,
            `--${boundary}--`
        ].join('\r\n');
        return new Promise((resolve, reject) => {
            const url = new URL(metadataPath);
            const options = {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: isUpdate ? 'PATCH' : 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`,
                    'Content-Length': Buffer.byteLength(body)
                }
            };
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        const parsed = JSON.parse(data);
                        resolve(parsed.id);
                    }
                    else {
                        reject(new Error(`Upload failed ${res.statusCode}: ${data}`));
                    }
                });
            });
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }
    async findFile(name, parentId) {
        const result = await this.apiRequest('GET', '/files', undefined, {
            q: `name='${name}' and '${parentId}' in parents and trashed=false`,
            spaces: APP_FOLDER,
            fields: 'files(id,name)'
        });
        return result.files[0]?.id ?? null;
    }
    async findFolder(name) {
        const result = await this.apiRequest('GET', '/files', undefined, {
            q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            spaces: APP_FOLDER,
            fields: 'files(id,name)'
        });
        return result.files[0]?.id ?? null;
    }
    async createFolder(name) {
        const result = await this.apiRequest('POST', '/files', {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [APP_FOLDER]
        });
        return result.id;
    }
    async createFile(name, content, parentId) {
        return this.uploadRequest('POST', null, name, content, parentId);
    }
    async updateFile(fileId, content) {
        await this.uploadRequest('PATCH', fileId, '', content, '');
    }
    async downloadFile(fileId) {
        return this.apiRequest('GET', `/files/${fileId}?alt=media`);
    }
    async listFiles(parentId) {
        const result = await this.apiRequest('GET', '/files', undefined, {
            q: `'${parentId}' in parents and trashed=false`,
            spaces: APP_FOLDER,
            fields: 'files(id,name,modifiedTime)',
            pageSize: '100'
        });
        return result.files;
    }
    async deleteFile(fileId) {
        await this.apiRequest('DELETE', `/files/${fileId}`);
    }
}
exports.DriveStorageProvider = DriveStorageProvider;
//# sourceMappingURL=driveStorageProvider.js.map
// src/storage/driveStorageProvider.ts
// Stores chat history in Google Drive appData folder using minimal OAuth scope

import * as https from 'https';
import { HistoryProvider, ChatSession, SessionSummary } from '../types';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const APP_FOLDER = 'appDataFolder';
const SESSIONS_FOLDER_NAME = 'my-coder-sessions';

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
}

interface DriveFileList {
  files: DriveFile[];
  nextPageToken?: string;
}

export class DriveStorageProvider implements HistoryProvider {
  private sessionsFolderId?: string;

  constructor(private accessTokenProvider: () => Promise<string>) {}

  async saveSession(session: ChatSession): Promise<void> {
    const folderId = await this.ensureSessionsFolder();
    const fileName = `session-${session.id}.json`;
    const content = JSON.stringify(session);

    // Check if file already exists
    const existingId = await this.findFile(fileName, folderId);

    if (existingId) {
      await this.updateFile(existingId, content);
    } else {
      await this.createFile(fileName, content, folderId);
    }
  }

  async loadSession(sessionId: string): Promise<ChatSession | null> {
    try {
      const folderId = await this.ensureSessionsFolder();
      const fileName = `session-${sessionId}.json`;
      const fileId = await this.findFile(fileName, folderId);

      if (!fileId) return null;

      const content = await this.downloadFile(fileId);
      return JSON.parse(content) as ChatSession;
    } catch {
      return null;
    }
  }

  async listSessions(): Promise<SessionSummary[]> {
    try {
      const folderId = await this.ensureSessionsFolder();
      const files = await this.listFiles(folderId);
      const sessions: SessionSummary[] = [];

      await Promise.all(
        files.map(async (file) => {
          try {
            const content = await this.downloadFile(file.id);
            const session = JSON.parse(content) as ChatSession;
            sessions.push({
              id: session.id,
              title: session.title,
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
              mode: session.mode,
              messageCount: session.messages.length
            });
          } catch {
            // Skip corrupted files
          }
        })
      );

      return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const folderId = await this.ensureSessionsFolder();
    const fileName = `session-${sessionId}.json`;
    const fileId = await this.findFile(fileName, folderId);

    if (fileId) {
      await this.deleteFile(fileId);
    }
  }

  async clearAll(): Promise<void> {
    const folderId = await this.ensureSessionsFolder();
    const files = await this.listFiles(folderId);
    await Promise.all(files.map(f => this.deleteFile(f.id)));
  }

  private async ensureSessionsFolder(): Promise<string> {
    if (this.sessionsFolderId) return this.sessionsFolderId;

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

  private async apiRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>
  ): Promise<T> {
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
              resolve(data ? JSON.parse(data) : {} as T);
            } catch {
              resolve(data as unknown as T);
            }
          } else {
            reject(new Error(`Drive API error ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  private async uploadRequest(
    method: string,
    fileId: string | null,
    fileName: string,
    content: string,
    parentId: string
  ): Promise<string> {
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
            const parsed = JSON.parse(data) as DriveFile;
            resolve(parsed.id);
          } else {
            reject(new Error(`Upload failed ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  private async findFile(name: string, parentId: string): Promise<string | null> {
    const result = await this.apiRequest<DriveFileList>('GET', '/files', undefined, {
      q: `name='${name}' and '${parentId}' in parents and trashed=false`,
      spaces: APP_FOLDER,
      fields: 'files(id,name)'
    });
    return result.files[0]?.id ?? null;
  }

  private async findFolder(name: string): Promise<string | null> {
    const result = await this.apiRequest<DriveFileList>('GET', '/files', undefined, {
      q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      spaces: APP_FOLDER,
      fields: 'files(id,name)'
    });
    return result.files[0]?.id ?? null;
  }

  private async createFolder(name: string): Promise<string> {
    const result = await this.apiRequest<DriveFile>('POST', '/files', {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [APP_FOLDER]
    });
    return result.id;
  }

  private async createFile(name: string, content: string, parentId: string): Promise<string> {
    return this.uploadRequest('POST', null, name, content, parentId);
  }

  private async updateFile(fileId: string, content: string): Promise<void> {
    await this.uploadRequest('PATCH', fileId, '', content, '');
  }

  private async downloadFile(fileId: string): Promise<string> {
    return this.apiRequest<string>('GET', `/files/${fileId}?alt=media`);
  }

  private async listFiles(parentId: string): Promise<DriveFile[]> {
    const result = await this.apiRequest<DriveFileList>('GET', '/files', undefined, {
      q: `'${parentId}' in parents and trashed=false`,
      spaces: APP_FOLDER,
      fields: 'files(id,name,modifiedTime)',
      pageSize: '100'
    });
    return result.files;
  }

  private async deleteFile(fileId: string): Promise<void> {
    await this.apiRequest('DELETE', `/files/${fileId}`);
  }
}

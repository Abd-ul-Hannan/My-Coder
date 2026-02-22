// src/storage/driveSync.ts
// ─────────────────────────────────────────────────────────────────────────────
// Google Drive sync — uploads the local SQLite DB as a single binary blob.
//
// Push: local DB → Drive appData/my-coder.db
// Pull: Drive → local (merge-only: never overwrites newer local sessions)
// Index: lightweight JSON index so the session list can be refreshed quickly
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as https from 'https';
import { SQLiteStorageProvider } from './sqliteStorageProvider';

const DRIVE_API  = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const APP_FOLDER = 'appDataFolder';
const DB_NAME    = 'my-coder.db';
const IDX_NAME   = 'my-coder-index.json';

interface DriveFile     { id: string; name: string; }
interface DriveFileList { files: DriveFile[]; }

export class DriveSync {
  private lastSyncAt            = 0;
  private debounceTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly sqlite: SQLiteStorageProvider,
    private readonly getToken: () => Promise<string>,
  ) {}

  // ─── Public ───────────────────────────────────────────────────────────────

  /** Debounced push — coalesces rapid writes into one upload. */
  schedulePush(delayMs = 3000): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.push().catch(console.error), delayMs);
  }

  /** Immediate push — uploads the current DB file to Drive. */
  async push(): Promise<void> {
    const dbPath = this.sqlite.getDbPath();
    if (!fs.existsSync(dbPath)) return;

    const content = fs.readFileSync(dbPath);           // raw bytes of the SQLite file
    const existingId = await this.findFile(DB_NAME);

    if (existingId) {
      await this.uploadMultipart('PATCH', existingId, '', content, 'application/octet-stream');
    } else {
      await this.uploadMultipart('POST', null, DB_NAME, content, 'application/octet-stream');
    }

    await this.pushIndex();
    this.lastSyncAt = Date.now();
  }

  /**
   * Pull Drive DB into local.
   * - If no local DB: write Drive copy directly (fast path).
   * - If both exist: open Drive copy as a temp DB and import sessions that
   *   are MISSING locally (non-destructive merge — never deletes local data).
   */
  async pull(): Promise<'replaced' | 'merged' | 'skipped'> {
    const remoteId = await this.findFile(DB_NAME);
    if (!remoteId) return 'skipped';

    const remoteBytes = await this.downloadBytes(remoteId);
    const dbPath      = this.sqlite.getDbPath();

    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, remoteBytes);
      return 'replaced';
    }

    return this.mergeFrom(remoteBytes);
  }

  getLastSyncTime(): number { return this.lastSyncAt; }

  // ─── Merge ────────────────────────────────────────────────────────────────

  private async mergeFrom(remoteBytes: Buffer): Promise<'merged' | 'skipped'> {
    const tmpPath = this.sqlite.getDbPath() + '.drive-tmp';
    let BetterSQLite: typeof import('better-sqlite3');
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      BetterSQLite = require('better-sqlite3');
    } catch {
      return 'skipped';  // SQLite not available — nothing to merge
    }

    try {
      fs.writeFileSync(tmpPath, remoteBytes);
      const remoteDb = new BetterSQLite(tmpPath, { readonly: true });

      // Fetch all remote session IDs + timestamps
      const remoteSessions = remoteDb.prepare(
        'SELECT id, updated_at FROM sessions ORDER BY updated_at DESC'
      ).all() as Array<{ id: string; updated_at: number }>;

      // Compare against local
      const localList  = await this.sqlite.listSessions();
      const localById  = new Map(localList.map(s => [s.id, s.updatedAt]));

      let imported = 0;
      for (const rs of remoteSessions) {
        const localTs = localById.get(rs.id);
        // Skip if local already has an equal-or-newer version
        if (localTs !== undefined && localTs >= rs.updated_at) continue;

        const sessionRow = remoteDb.prepare('SELECT * FROM sessions WHERE id = ?').get(rs.id) as
          Record<string, unknown> | undefined;
        if (!sessionRow) continue;

        const msgRows = remoteDb.prepare(
          'SELECT * FROM messages WHERE session_id = ? ORDER BY seq ASC'
        ).all(rs.id) as Array<Record<string, unknown>>;

        const session = this.hydrateRow(sessionRow, msgRows);
        await this.sqlite.saveSession(session);
        imported++;
      }

      remoteDb.close();
      return imported > 0 ? 'merged' : 'skipped';

    } catch (err) {
      console.error('[DriveSync] mergeFrom failed:', err);
      return 'skipped';
    } finally {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  }

  private hydrateRow(
    row: Record<string, unknown>,
    msgs: Array<Record<string, unknown>>,
  ) {
    return {
      id:          row['id']          as string,
      title:       row['title']       as string,
      mode:        row['mode']        as 'chat' | 'new-app' | 'existing-project',
      projectPath: (row['project_path'] as string | null) ?? undefined,
      createdAt:   row['created_at']  as number,
      updatedAt:   row['updated_at']  as number,
      plan:        row['plan_json']   ? JSON.parse(row['plan_json'] as string) : undefined,
      messages: msgs.map(m => ({
        id:        m['id']        as string,
        role:      m['role']      as 'user' | 'assistant' | 'system',
        content:   m['content']   as string,
        type:      (m['type'] ?? 'text') as 'text' | 'plan' | 'code' | 'diff' | 'build-result' | 'error' | 'progress' | 'interview',
        timestamp: m['timestamp'] as number,
        metadata:  m['metadata_json'] ? JSON.parse(m['metadata_json'] as string) : undefined,
      })),
    };
  }

  // ─── Index ────────────────────────────────────────────────────────────────

  private async pushIndex(): Promise<void> {
    const sessions = await this.sqlite.listSessions();
    const index = sessions.slice(0, 200).map(s => ({
      id: s.id, title: s.title, mode: s.mode, updatedAt: s.updatedAt,
    }));
    const bytes = Buffer.from(JSON.stringify(index), 'utf-8');
    const existingId = await this.findFile(IDX_NAME);
    if (existingId) {
      await this.uploadMultipart('PATCH', existingId, '', bytes, 'application/json');
    } else {
      await this.uploadMultipart('POST', null, IDX_NAME, bytes, 'application/json');
    }
  }

  // ─── Drive API helpers ────────────────────────────────────────────────────

  private async findFile(name: string): Promise<string | null> {
    const res = await this.apiRequest<DriveFileList>('GET', '/files', undefined, {
      q: `name='${name}' and trashed=false`,
      spaces: APP_FOLDER,
      fields: 'files(id,name)',
    });
    return res.files.find(f => f.name === name)?.id ?? null;
  }

  private async downloadBytes(fileId: string): Promise<Buffer> {
    const token = await this.getToken();
    return new Promise<Buffer>((resolve, reject) => {
      const url = new URL(`${DRIVE_API}/files/${fileId}?alt=media`);
      const chunks: Buffer[] = [];
      const req = https.request(
        { hostname: url.hostname, path: url.pathname + url.search, method: 'GET',
          headers: { Authorization: `Bearer ${token}` } },
        res => {
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            if (res.statusCode && res.statusCode < 300) resolve(Buffer.concat(chunks));
            else reject(new Error(`Drive download ${res.statusCode}`));
          });
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Multipart upload — works for both create (POST) and update (PATCH).
   * Uses Buffer throughout so binary SQLite files are never corrupted.
   */
  private async uploadMultipart(
    method: 'POST' | 'PATCH',
    fileId: string | null,
    name: string,
    content: Buffer,
    mimeType: string,
  ): Promise<string> {
    const token    = await this.getToken();
    const isUpdate = fileId !== null;
    const urlStr   = isUpdate
      ? `${UPLOAD_API}/files/${fileId}?uploadType=multipart`
      : `${UPLOAD_API}/files?uploadType=multipart`;

    const meta    = isUpdate ? '{}' : JSON.stringify({ name, parents: [APP_FOLDER] });
    const bnd     = `mcBnd${Date.now()}`;

    const header  = Buffer.from(
      `--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${meta}\r\n--${bnd}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      'utf-8',
    );
    const footer  = Buffer.from(`\r\n--${bnd}--`, 'utf-8');
    const body    = Buffer.concat([header, content, footer]);

    return new Promise<string>((resolve, reject) => {
      const url = new URL(urlStr);
      const req = https.request(
        {
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: isUpdate ? 'PATCH' : 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${bnd}`,
            'Content-Length': body.length,
          },
        },
        res => {
          let data = '';
          res.on('data', (c: Buffer) => { data += c.toString(); });
          res.on('end', () => {
            if (res.statusCode && res.statusCode < 300) {
              try { resolve((JSON.parse(data) as { id: string }).id); }
              catch { resolve(fileId ?? ''); }
            } else {
              reject(new Error(`Drive upload ${res.statusCode}: ${data}`));
            }
          });
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  private async apiRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>,
  ): Promise<T> {
    const token   = await this.getToken();
    const qs      = params ? '?' + new URLSearchParams(params).toString() : '';
    const url     = new URL(path.startsWith('http') ? path : `${DRIVE_API}${path}${qs}`);
    const bodyStr = body ? JSON.stringify(body) : undefined;

    return new Promise<T>((resolve, reject) => {
      const req = https.request(
        {
          hostname: url.hostname,
          path: url.pathname + url.search,
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
          },
        },
        res => {
          let data = '';
          res.on('data', (c: Buffer) => { data += c.toString(); });
          res.on('end', () => {
            if (res.statusCode && res.statusCode < 300) {
              try { resolve(data ? JSON.parse(data) : ({} as T)); }
              catch { resolve(data as unknown as T); }
            } else {
              reject(new Error(`Drive ${method} ${path} → ${res.statusCode}: ${data}`));
            }
          });
        },
      );
      req.on('error', reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }
}

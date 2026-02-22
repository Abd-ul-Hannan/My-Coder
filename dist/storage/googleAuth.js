"use strict";
// src/storage/googleAuth.ts
// Handles Google OAuth2 authentication with minimal drive scope
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
exports.GoogleAuth = void 0;
const vscode = __importStar(require("vscode"));
const http = __importStar(require("http"));
const crypto = __importStar(require("crypto"));
const SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];
const REDIRECT_PORT = 9876;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
// Token storage keys
const ACCESS_TOKEN_KEY = 'my-coder.google-access-token';
const REFRESH_TOKEN_KEY = 'my-coder.google-refresh-token';
const USER_EMAIL_KEY = 'my-coder.google-email';
const USER_NAME_KEY = 'my-coder.google-name';
class GoogleAuth {
    secrets;
    tokenExpiresAt = 0;
    constructor(secrets) {
        this.secrets = secrets;
    }
    async getAuthStatus() {
        const accessToken = await this.secrets.get(ACCESS_TOKEN_KEY);
        const userEmail = await this.secrets.get(USER_EMAIL_KEY);
        const userName = await this.secrets.get(USER_NAME_KEY);
        const refreshToken = await this.secrets.get(REFRESH_TOKEN_KEY);
        const isSignedIn = !!(accessToken || refreshToken);
        return {
            isSignedIn,
            userEmail: userEmail ?? undefined,
            userName: userName ?? undefined,
            storageType: isSignedIn ? 'drive' : 'local'
        };
    }
    async signIn() {
        const clientId = await this.secrets.get('my-coder.google-client-id-key');
        const clientSecret = await this.secrets.get('my-coder.google-client-secret-key');
        if (!clientId || !clientSecret) {
            const setupInstructions = [
                'To use Google Drive sync, you need to set up OAuth credentials:',
                '1. Go to console.cloud.google.com',
                '2. Create a project and enable the Drive API',
                '3. Create OAuth 2.0 credentials (Desktop app)',
                '4. Run "MY Coder: Set API Key" and provide your Client ID and Secret'
            ].join('\n');
            throw new Error(setupInstructions);
        }
        const state = crypto.randomBytes(16).toString('hex');
        const authCode = await this.startOAuthFlow(clientId, state);
        const tokens = await this.exchangeCode(authCode, clientId, clientSecret);
        await this.saveTokens(tokens);
        const userInfo = await this.fetchUserInfo(tokens.access_token);
        await this.secrets.store(USER_EMAIL_KEY, userInfo.email);
        await this.secrets.store(USER_NAME_KEY, userInfo.name);
    }
    async signOut() {
        await Promise.all([
            this.secrets.delete(ACCESS_TOKEN_KEY),
            this.secrets.delete(REFRESH_TOKEN_KEY),
            this.secrets.delete(USER_EMAIL_KEY),
            this.secrets.delete(USER_NAME_KEY)
        ]);
        this.tokenExpiresAt = 0;
    }
    async getAccessToken() {
        const now = Date.now();
        // Try cached access token
        if (this.tokenExpiresAt > now + 60000) {
            const token = await this.secrets.get(ACCESS_TOKEN_KEY);
            if (token)
                return token;
        }
        // Try refresh
        const refreshToken = await this.secrets.get(REFRESH_TOKEN_KEY);
        if (!refreshToken) {
            throw new Error('Not signed in to Google. Run "MY Coder: Sign In with Google"');
        }
        return this.refreshAccessToken(refreshToken);
    }
    startOAuthFlow(clientId, state) {
        return new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => {
                const url = new URL(req.url ?? '/', `http://localhost:${REDIRECT_PORT}`);
                if (url.pathname !== '/callback') {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }
                const code = url.searchParams.get('code');
                const returnedState = url.searchParams.get('state');
                const error = url.searchParams.get('error');
                const html = `
          <html><body style="font-family:sans-serif;text-align:center;padding:40px">
          <h2>MY Coder</h2>
          ${error ? `<p style="color:red">Error: ${error}</p>` : '<p style="color:green">✓ Authorization complete. You can close this tab.</p>'}
          </body></html>`;
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(html);
                server.close();
                if (error || !code) {
                    reject(new Error(error ?? 'Authorization failed: no code received'));
                    return;
                }
                if (returnedState !== state) {
                    reject(new Error('OAuth state mismatch — possible CSRF attack'));
                    return;
                }
                resolve(code);
            });
            server.listen(REDIRECT_PORT, () => {
                const params = new URLSearchParams({
                    client_id: clientId,
                    redirect_uri: REDIRECT_URI,
                    response_type: 'code',
                    scope: SCOPES.join(' '),
                    access_type: 'offline',
                    prompt: 'consent',
                    state
                });
                const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
                vscode.env.openExternal(vscode.Uri.parse(authUrl));
            });
            server.on('error', reject);
            // Timeout after 5 minutes
            setTimeout(() => {
                server.close();
                reject(new Error('OAuth timeout — no response received within 5 minutes'));
            }, 5 * 60 * 1000);
        });
    }
    async exchangeCode(code, clientId, clientSecret) {
        const params = new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code'
        });
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Token exchange failed: ${error}`);
        }
        return response.json();
    }
    async refreshAccessToken(refreshToken) {
        const clientId = await this.secrets.get('my-coder.google-client-id-key');
        const clientSecret = await this.secrets.get('my-coder.google-client-secret-key');
        if (!clientId || !clientSecret) {
            throw new Error('Google credentials not configured');
        }
        const params = new URLSearchParams({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token'
        });
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        if (!response.ok) {
            throw new Error('Token refresh failed — please sign in again');
        }
        const tokens = await response.json();
        await this.secrets.store(ACCESS_TOKEN_KEY, tokens.access_token);
        this.tokenExpiresAt = Date.now() + tokens.expires_in * 1000;
        return tokens.access_token;
    }
    async saveTokens(tokens) {
        await this.secrets.store(ACCESS_TOKEN_KEY, tokens.access_token);
        if (tokens.refresh_token) {
            await this.secrets.store(REFRESH_TOKEN_KEY, tokens.refresh_token);
        }
        this.tokenExpiresAt = Date.now() + tokens.expires_in * 1000;
    }
    async fetchUserInfo(accessToken) {
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!response.ok) {
            return { email: 'unknown@gmail.com', name: 'Google User' };
        }
        return response.json();
    }
}
exports.GoogleAuth = GoogleAuth;
//# sourceMappingURL=googleAuth.js.map
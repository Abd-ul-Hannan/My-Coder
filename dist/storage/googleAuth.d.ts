import * as vscode from 'vscode';
import { AuthStatus } from '../types';
export declare class GoogleAuth {
    private secrets;
    private tokenExpiresAt;
    constructor(secrets: vscode.SecretStorage);
    getAuthStatus(): Promise<AuthStatus>;
    signIn(): Promise<void>;
    signOut(): Promise<void>;
    getAccessToken(): Promise<string>;
    private startOAuthFlow;
    private exchangeCode;
    private refreshAccessToken;
    private saveTokens;
    private fetchUserInfo;
}
//# sourceMappingURL=googleAuth.d.ts.map
import * as vscode from 'vscode';
import { AIService } from '../ai/aiService';
export declare class InlineChatProvider {
    private readonly getAI;
    private decorationType;
    constructor(getAI: () => Promise<AIService | null>);
    /**
     * Shows an inline input box at the cursor position.
     * User types a prompt, AI generates code, shows as diff.
     */
    showInlineChat(editor: vscode.TextEditor): Promise<void>;
    dispose(): void;
}
//# sourceMappingURL=inlineChatProvider.d.ts.map
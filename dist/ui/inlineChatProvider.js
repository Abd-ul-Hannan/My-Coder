"use strict";
// src/ui/inlineChatProvider.ts
// ─────────────────────────────────────────────────────────────────────────────
// Inline Chat Provider — provides inline chat widget at cursor position
// Similar to GitHub Copilot's inline chat (Ctrl+I / Cmd+I)
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
exports.InlineChatProvider = void 0;
const vscode = __importStar(require("vscode"));
class InlineChatProvider {
    getAI;
    decorationType;
    constructor(getAI) {
        this.getAI = getAI;
        this.decorationType = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: ' 💬 Ask AI...',
                color: new vscode.ThemeColor('editorCodeLens.foreground'),
                fontStyle: 'italic',
            },
        });
    }
    /**
     * Shows an inline input box at the cursor position.
     * User types a prompt, AI generates code, shows as diff.
     */
    async showInlineChat(editor) {
        const position = editor.selection.active;
        const document = editor.document;
        // Prompt user for instruction
        const instruction = await vscode.window.showInputBox({
            prompt: 'Ask AI to modify the code',
            placeHolder: 'e.g., Add error handling, Extract to function, Add JSDoc',
            ignoreFocusOut: true,
        });
        if (!instruction)
            return;
        const ai = await this.getAI();
        if (!ai) {
            vscode.window.showErrorMessage('AI service not configured');
            return;
        }
        // Get context: surrounding lines
        const startLine = Math.max(0, position.line - 15);
        const endLine = Math.min(document.lineCount - 1, position.line + 15);
        const contextRange = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
        const contextText = document.getText(contextRange);
        // Build prompt
        const prompt = `
File: ${document.fileName}
Language: ${document.languageId}
Cursor at line ${position.line + 1}

Context:
\`\`\`${document.languageId}
${contextText}
\`\`\`

Instruction: ${instruction}

Return ONLY the modified code block that should replace the context above. No explanation, no markdown fences.`;
        try {
            const response = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'AI generating...',
                cancellable: false,
            }, async () => {
                return await ai.complete([{ role: 'user', content: prompt }], 'You are a code modification assistant. Return only code, no explanations.');
            });
            const newCode = response.content.replace(/```[\w]*\n?/g, '').trim();
            // Show as diff and let user accept
            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, contextRange, newCode);
            const accepted = await vscode.workspace.applyEdit(edit);
            if (accepted) {
                vscode.window.showInformationMessage('✅ AI suggestion applied');
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`AI error: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    dispose() {
        this.decorationType.dispose();
    }
}
exports.InlineChatProvider = InlineChatProvider;
//# sourceMappingURL=inlineChatProvider.js.map
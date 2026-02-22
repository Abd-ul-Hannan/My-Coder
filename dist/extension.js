"use strict";
// src/extension.ts — MY Coder VS Code Extension entry point
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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const chatPanel_1 = require("./ui/chatPanel");
const inlineChatProvider_1 = require("./ui/inlineChatProvider");
const bottomPanel_1 = require("./ui/bottomPanel");
const inlineCompletionProvider_1 = require("./tools/inlineCompletionProvider");
const aiService_1 = require("./ai/aiService");
const rulesLoader_1 = require("./tools/rulesLoader");
async function activate(context) {
    console.log('[MY Coder] Activating...');
    // ── Shared AI service getter (lazy, cached per-session) ───────────────────
    let cachedAI = null;
    const getAIService = async () => {
        try {
            if (!cachedAI)
                cachedAI = await aiService_1.AIService.createFromVSCodeConfig(context);
            return cachedAI;
        }
        catch {
            return null;
        }
    };
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('myCoder'))
            cachedAI = null;
    }));
    // ── Register ChatPanel as a persistent sidebar WebviewViewProvider ─────────
    const chatPanelProvider = new chatPanel_1.ChatPanel(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(chatPanel_1.ChatPanel.viewType, chatPanelProvider, {
        webviewOptions: { retainContextWhenHidden: true },
    }));
    // Helper: get or focus the sidebar panel
    const getPanel = () => {
        return chatPanelProvider;
    };
    const postToPanel = (msg, delayMs = 400) => {
        setTimeout(() => {
            try {
                const p = getPanel().panel;
                if (p)
                    p.webview.postMessage(msg);
            }
            catch { }
        }, delayMs);
    };
    // ── Inline completions (Alt+C / Option+C) ─────────────────────────────────
    (0, inlineCompletionProvider_1.registerInlineCompletions)(context, getAIService);
    // ── Inline chat provider (Ctrl+I / Cmd+I) ─────────────────────────────────
    const inlineChatProvider = new inlineChatProvider_1.InlineChatProvider(getAIService);
    context.subscriptions.push(vscode.commands.registerCommand('my-coder.inlineChat', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor)
            await inlineChatProvider.showInlineChat(editor);
    }));
    // ── Bottom panel with Problems/Actions/Terminal ────────────────────────────
    const bottomPanel = new bottomPanel_1.BottomPanelProvider(context, getAIService);
    context.subscriptions.push(vscode.commands.registerCommand('my-coder.showBottomPanel', () => bottomPanel.show()));
    // ── Panel commands ────────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('my-coder.openPanel', () => {
        vscode.commands.executeCommand('my-coder.mainView.focus');
    }), vscode.commands.registerCommand('my-coder.newApp', () => {
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'triggerNewApp' });
    }), vscode.commands.registerCommand('my-coder.workOnProject', () => {
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'triggerExisting' });
    }), vscode.commands.registerCommand('my-coder.signIn', () => {
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'triggerSignIn' });
    }), vscode.commands.registerCommand('my-coder.signOut', () => {
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'triggerSignOut' });
    }), vscode.commands.registerCommand('my-coder.clearHistory', async () => {
        const ans = await vscode.window.showWarningMessage('Clear all MY Coder chat history?', { modal: true }, 'Clear');
        if (ans === 'Clear') {
            await chatPanelProvider.clearHistory();
        }
    }), 
    // ── API Key command ───────────────────────────────────────────────────────
    vscode.commands.registerCommand('my-coder.setApiKey', async () => {
        const provider = await vscode.window.showQuickPick([
            { label: '$(key) OpenAI', description: 'GPT-4o, o1', value: 'openai' },
            { label: '$(key) Anthropic (Claude)', description: 'Claude Opus/Sonnet/Haiku', value: 'anthropic' },
            { label: '$(key) Groq', description: 'Llama 3.3 — ultra fast', value: 'groq' },
            { label: '$(key) Google Gemini', description: 'Gemini 2.0 Flash', value: 'gemini' },
            { label: '$(key) Mistral AI', description: 'Mistral Large/Codestral', value: 'mistral' },
            { label: '$(key) Perplexity', description: 'Sonar Online', value: 'perplexity' },
            { label: '$(key) OpenRouter', description: '200+ models, one key', value: 'openrouter' },
            { label: '$(key) Tavily (web search)', description: 'Required for /search', value: 'tavily' },
            { label: '$(key) Pexels (stock photos)', description: 'Free stock photos', value: 'pexels' },
            { label: '$(key) Google Drive (OAuth ID)', description: 'History sync', value: 'google-client-id' },
            { label: '$(key) Google Drive (OAuth Secret)', description: 'History sync', value: 'google-client-secret' },
        ], { placeHolder: 'Select key to configure', title: 'MY Coder — Set API Key' });
        if (!provider)
            return;
        const key = await vscode.window.showInputBox({
            prompt: `Enter ${provider.label.replace('$(key) ', '')} key`,
            password: true, ignoreFocusOut: true,
        });
        if (!key)
            return;
        const secretKey = `my-coder.${provider.value}-key`;
        // Save to VS Code SecretStorage (primary — encrypted, per-machine)
        await context.secrets.store(secretKey, key);
        // Also persist in SQLite so the key travels with Drive sync
        chatPanelProvider.saveApiKeyToDb(secretKey, key);
        if (provider.value === 'tavily') {
            await vscode.workspace.getConfiguration('myCoder').update('tavilyApiKey', key, vscode.ConfigurationTarget.Global);
        }
        if (provider.value === 'pexels') {
            await vscode.workspace.getConfiguration('myCoder').update('pexelsApiKey', key, vscode.ConfigurationTarget.Global);
        }
        cachedAI = null;
        vscode.window.showInformationMessage(`✅ ${provider.label.replace('$(key) ', '')} key saved.`);
    }), 
    // ── Utility commands ─────────────────────────────────────────────────────
    vscode.commands.registerCommand('my-coder.initRules', async () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            vscode.window.showErrorMessage('Open a workspace first.');
            return;
        }
        const p = await (0, rulesLoader_1.initializeRulesDirectory)(folders[0].uri.fsPath);
        const doc = await vscode.workspace.openTextDocument(p);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage('✅ Rules file created at .mycoder/rules/coding-standards.md');
    }), vscode.commands.registerCommand('my-coder.webSearch', async () => {
        const q = await vscode.window.showInputBox({ prompt: 'Search the web', placeHolder: 'React Server Components patterns' });
        if (!q)
            return;
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'triggerWebSearch', payload: q });
    }), 
    // ── Context menu commands (right-click on code) ────────────────────────────
    vscode.commands.registerCommand('my-coder.sendToPrompt', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const selection = editor.selection;
        const text = editor.document.getText(selection.isEmpty ? undefined : selection);
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({
            type: 'injectText',
            payload: selection.isEmpty
                ? `Regarding \`${editor.document.fileName.split(/[/\\]/).pop()}\`:\n\`\`\`${editor.document.languageId}\n${text.slice(0, 2000)}\n\`\`\``
                : `\`\`\`${editor.document.languageId}\n${text}\n\`\`\``
        });
    }), vscode.commands.registerCommand('my-coder.explainSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const sel = editor.selection;
        const text = sel.isEmpty ? editor.document.getText().slice(0, 8000) : editor.document.getText(sel);
        const label = sel.isEmpty ? `file \`${editor.document.fileName.split(/[/\\]/).pop()}\`` : 'selected code';
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'sendMessage', payload: `/explain Explain this ${label}:\n\`\`\`${editor.document.languageId}\n${text}\n\`\`\`` });
    }), vscode.commands.registerCommand('my-coder.refactorSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const sel = editor.selection;
        const text = sel.isEmpty ? editor.document.getText().slice(0, 8000) : editor.document.getText(sel);
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'sendMessage', payload: `/refactor\n\`\`\`${editor.document.languageId}\n${text}\n\`\`\`` });
    }), vscode.commands.registerCommand('my-coder.generateTestsForSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const _sel_generateTests = editor.selection;
        const text = _sel_generateTests.isEmpty ? editor.document.getText().slice(0, 8000) : editor.document.getText(_sel_generateTests);
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'sendMessage', payload: `/test\n\`\`\`${editor.document.languageId}\n${text}\n\`\`\`` });
    }), vscode.commands.registerCommand('my-coder.optimizeSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const _sel_optimizeSelection = editor.selection;
        const text = _sel_optimizeSelection.isEmpty ? editor.document.getText().slice(0, 8000) : editor.document.getText(_sel_optimizeSelection);
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'sendMessage', payload: `/refactor Optimize for performance:\n\`\`\`${editor.document.languageId}\n${text}\n\`\`\`` });
    }), vscode.commands.registerCommand('my-coder.fixSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const _sel_fixSelection = editor.selection;
        const text = _sel_fixSelection.isEmpty ? editor.document.getText().slice(0, 8000) : editor.document.getText(_sel_fixSelection);
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'sendMessage', payload: `/fix\n\`\`\`${editor.document.languageId}\n${text}\n\`\`\`` });
    }), 
    // ── Slash command shortcuts ───────────────────────────────────────────────
    vscode.commands.registerCommand('my-coder.securityScan', () => {
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'runSecurityScan' });
    }), vscode.commands.registerCommand('my-coder.runDev', () => {
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'injectSlashCommand', payload: '/dev ' });
    }), vscode.commands.registerCommand('my-coder.runTest', () => {
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'injectSlashCommand', payload: '/test ' });
    }), vscode.commands.registerCommand('my-coder.runDocs', () => {
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'injectSlashCommand', payload: '/docs ' });
    }), vscode.commands.registerCommand('my-coder.runReview', () => {
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'injectSlashCommand', payload: '/review ' });
    }), vscode.commands.registerCommand('my-coder.runSecurity', () => {
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'injectSlashCommand', payload: '/security ' });
    }), vscode.commands.registerCommand('my-coder.runFigma', () => {
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'injectSlashCommand', payload: '/figma ' });
    }), vscode.commands.registerCommand('my-coder.runExplain', () => {
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'injectSlashCommand', payload: '/explain ' });
    }), vscode.commands.registerCommand('my-coder.runRefactor', () => {
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'injectSlashCommand', payload: '/refactor ' });
    }), vscode.commands.registerCommand('my-coder.runFix', () => {
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'injectSlashCommand', payload: '/fix ' });
    }), vscode.commands.registerCommand('my-coder.figmaToCode', () => {
        vscode.commands.executeCommand('my-coder.mainView.focus');
        postToPanel({ type: 'injectSlashCommand', payload: '/figma ' });
    }));
    // ── Status bar ────────────────────────────────────────────────────────────
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = '$(robot) MY Coder';
    statusBar.tooltip = 'Open MY Coder';
    statusBar.command = 'my-coder.openPanel';
    statusBar.show();
    context.subscriptions.push(statusBar);
    // ── First-run welcome ─────────────────────────────────────────────────────
    if (!context.globalState.get('my-coder.activated')) {
        await context.globalState.update('my-coder.activated', true);
        vscode.window.showInformationMessage('🤖 MY Coder is ready! Set your AI provider key to get started.', 'Open Panel', 'Set API Key').then(choice => {
            if (choice === 'Open Panel')
                vscode.commands.executeCommand('my-coder.openPanel');
            if (choice === 'Set API Key')
                vscode.commands.executeCommand('my-coder.setApiKey');
        });
    }
    console.log('[MY Coder] Activated.');
}
function deactivate() { console.log('[MY Coder] Deactivated.'); }
//# sourceMappingURL=extension.js.map
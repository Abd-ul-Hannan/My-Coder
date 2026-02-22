"use strict";
// src/tools/inlineCompletionProvider.ts
// ─────────────────────────────────────────────────────────────────────────────
// Inline Code Completion Provider
// Registers as a VS Code InlineCompletionItemProvider.
// Triggered manually with Alt+C (Option+C on Mac).
// Uses the active AI provider to generate context-aware completions.
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
exports.InlineCompletionProvider = void 0;
exports.registerInlineCompletions = registerInlineCompletions;
const vscode = __importStar(require("vscode"));
const SUPPORTED_LANGUAGES = new Set([
    'typescript', 'typescriptreact', 'javascript', 'javascriptreact',
    'python', 'go', 'rust', 'java', 'kotlin', 'swift', 'dart',
    'c', 'cpp', 'csharp', 'php', 'ruby', 'scala', 'shell', 'sql',
    'html', 'css', 'scss', 'json', 'yaml', 'markdown',
]);
const COMPLETION_SYSTEM_PROMPT = `You are an expert code completion engine.
Given code context (prefix and suffix around the cursor), complete the code at the [CURSOR] marker.

Rules:
- Return ONLY the completion text — no explanation, no markdown, no code fences
- The completion must fit seamlessly between prefix and suffix
- Match existing code style, indentation, and patterns
- Produce 1–8 lines of meaningful code
- Never repeat code already in the prefix
- If no meaningful completion exists, return an empty string`;
// ─── Provider ─────────────────────────────────────────────────────────────────
class InlineCompletionProvider {
    getAIService;
    lastRequestId = 0;
    cache = new Map();
    constructor(getAIService) {
        this.getAIService = getAIService;
    }
    async provideInlineCompletionItems(document, position, _context, token) {
        const cfg = vscode.workspace.getConfiguration('myCoder');
        if (!cfg.get('enableInlineCompletions', true))
            return null;
        if (!SUPPORTED_LANGUAGES.has(document.languageId))
            return null;
        const requestId = ++this.lastRequestId;
        // Build context window: 60 lines before, 20 lines after cursor
        const prefixStart = Math.max(0, position.line - 60);
        const suffixEnd = Math.min(document.lineCount - 1, position.line + 20);
        const prefix = document.getText(new vscode.Range(new vscode.Position(prefixStart, 0), position));
        const suffix = document.getText(new vscode.Range(position, new vscode.Position(suffixEnd, document.lineAt(suffixEnd).text.length)));
        const cacheKey = `${document.uri}:${position.line}:${prefix.slice(-100)}`;
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            return new vscode.InlineCompletionList([new vscode.InlineCompletionItem(cached)]);
        }
        const aiService = await this.getAIService();
        if (!aiService || token.isCancellationRequested)
            return null;
        const prompt = [
            `Language: ${document.languageId}`,
            `File: ${document.fileName.split('/').pop()}`,
            ``,
            `CODE BEFORE CURSOR:`,
            prefix,
            `[CURSOR]`,
            `CODE AFTER CURSOR:`,
            suffix.slice(0, 500),
            ``,
            `Complete the code at [CURSOR]:`,
        ].join('\n');
        try {
            const response = await aiService.complete([{ role: 'user', content: prompt }], COMPLETION_SYSTEM_PROMPT);
            if (token.isCancellationRequested || requestId !== this.lastRequestId)
                return null;
            const completion = response.content.trim();
            if (!completion)
                return null;
            this.cache.set(cacheKey, completion);
            // Keep cache small
            if (this.cache.size > 50) {
                const firstKey = this.cache.keys().next().value;
                if (firstKey)
                    this.cache.delete(firstKey);
            }
            return new vscode.InlineCompletionList([
                new vscode.InlineCompletionItem(completion, new vscode.Range(position, position)),
            ]);
        }
        catch {
            return null;
        }
    }
}
exports.InlineCompletionProvider = InlineCompletionProvider;
/**
 * Registers the inline completion provider and the Alt+C trigger command.
 * Call from extension.ts activate().
 */
function registerInlineCompletions(context, getAIService) {
    const provider = new InlineCompletionProvider(getAIService);
    // Register for all supported languages
    const disposable = vscode.languages.registerInlineCompletionItemProvider(SUPPORTED_LANGUAGES.size > 0
        ? [...SUPPORTED_LANGUAGES].map(lang => ({ language: lang }))
        : [{ pattern: '**' }], provider);
    // Alt+C / Option+C manual trigger command
    const triggerCommand = vscode.commands.registerCommand('my-coder.triggerInlineCompletion', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    });
    context.subscriptions.push(disposable, triggerCommand);
}
//# sourceMappingURL=inlineCompletionProvider.js.map
// src/tools/inlineCompletionProvider.ts
// ─────────────────────────────────────────────────────────────────────────────
// Inline Code Completion Provider
// Registers as a VS Code InlineCompletionItemProvider.
// Triggered manually with Alt+C (Option+C on Mac).
// Uses the active AI provider to generate context-aware completions.
// ─────────────────────────────────────────────────────────────────────────────

import * as vscode from 'vscode';
import { AIService } from '../ai/aiService';

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

export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private lastRequestId = 0;
  private cache = new Map<string, string>();

  constructor(
    private readonly getAIService: () => Promise<AIService | null>,
  ) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionList | null> {
    const cfg = vscode.workspace.getConfiguration('myCoder');
    if (!cfg.get<boolean>('enableInlineCompletions', true)) return null;
    if (!SUPPORTED_LANGUAGES.has(document.languageId)) return null;

    const requestId = ++this.lastRequestId;

    // Build context window: 60 lines before, 20 lines after cursor
    const prefixStart = Math.max(0, position.line - 60);
    const suffixEnd = Math.min(document.lineCount - 1, position.line + 20);

    const prefix = document.getText(
      new vscode.Range(new vscode.Position(prefixStart, 0), position),
    );
    const suffix = document.getText(
      new vscode.Range(position, new vscode.Position(suffixEnd, document.lineAt(suffixEnd).text.length)),
    );

    const cacheKey = `${document.uri}:${position.line}:${prefix.slice(-100)}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      return new vscode.InlineCompletionList([new vscode.InlineCompletionItem(cached)]);
    }

    const aiService = await this.getAIService();
    if (!aiService || token.isCancellationRequested) return null;

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
      const response = await aiService.complete(
        [{ role: 'user', content: prompt }],
        COMPLETION_SYSTEM_PROMPT,
      );

      if (token.isCancellationRequested || requestId !== this.lastRequestId) return null;

      const completion = response.content.trim();
      if (!completion) return null;

      this.cache.set(cacheKey, completion);
      // Keep cache small
      if (this.cache.size > 50) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }

      return new vscode.InlineCompletionList([
        new vscode.InlineCompletionItem(
          completion,
          new vscode.Range(position, position),
        ),
      ]);
    } catch {
      return null;
    }
  }
}

/**
 * Registers the inline completion provider and the Alt+C trigger command.
 * Call from extension.ts activate().
 */
export function registerInlineCompletions(
  context: vscode.ExtensionContext,
  getAIService: () => Promise<AIService | null>,
): void {
  const provider = new InlineCompletionProvider(getAIService);

  // Register for all supported languages
  const disposable = vscode.languages.registerInlineCompletionItemProvider(
    SUPPORTED_LANGUAGES.size > 0
      ? [...SUPPORTED_LANGUAGES].map(lang => ({ language: lang }))
      : [{ pattern: '**' }],
    provider,
  );

  // Alt+C / Option+C manual trigger command
  const triggerCommand = vscode.commands.registerCommand('my-coder.triggerInlineCompletion', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
  });

  context.subscriptions.push(disposable, triggerCommand);
}

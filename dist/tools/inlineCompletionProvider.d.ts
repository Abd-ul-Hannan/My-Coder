import * as vscode from 'vscode';
import { AIService } from '../ai/aiService';
export declare class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
    private readonly getAIService;
    private lastRequestId;
    private cache;
    constructor(getAIService: () => Promise<AIService | null>);
    provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, _context: vscode.InlineCompletionContext, token: vscode.CancellationToken): Promise<vscode.InlineCompletionList | null>;
}
/**
 * Registers the inline completion provider and the Alt+C trigger command.
 * Call from extension.ts activate().
 */
export declare function registerInlineCompletions(context: vscode.ExtensionContext, getAIService: () => Promise<AIService | null>): void;
//# sourceMappingURL=inlineCompletionProvider.d.ts.map
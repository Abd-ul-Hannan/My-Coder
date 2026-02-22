import * as vscode from 'vscode';
import { AIService } from '../ai/aiService';
export declare class BottomPanelProvider {
    private readonly context;
    private readonly getAI;
    private panel;
    private terminal;
    private diagnosticsWatcher?;
    constructor(context: vscode.ExtensionContext, getAI: () => Promise<AIService | null>);
    show(): void;
    private openTerminal;
    private handleAction;
    private fixProblem;
    private sendProblems;
    private getHtml;
}
//# sourceMappingURL=bottomPanel.d.ts.map
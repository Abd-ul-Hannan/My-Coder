import * as vscode from 'vscode';
export type TodoStatus = 'pending' | 'in-progress' | 'done' | 'blocked';
export type TodoPriority = 'high' | 'medium' | 'low';
export interface TodoItem {
    id: string;
    text: string;
    status: TodoStatus;
    priority: TodoPriority;
    createdAt: number;
    completedAt?: number;
    sessionId?: string;
    tags?: string[];
}
export interface TodoList {
    items: TodoItem[];
    lastUpdated: number;
}
export declare class TodoTracker {
    private readonly state;
    constructor(state: vscode.Memento);
    /** Returns all todo items */
    getAll(): TodoItem[];
    /** Returns only pending + in-progress items */
    getActive(): TodoItem[];
    /**
     * Adds one or more todo items.
     * Items extracted from AI responses via extractTodosFromMarkdown() can be
     * bulk-added here.
     */
    add(items: Array<Omit<TodoItem, 'id' | 'createdAt'>>): Promise<TodoItem[]>;
    markDone(id: string): Promise<void>;
    markInProgress(id: string): Promise<void>;
    delete(id: string): Promise<void>;
    clearCompleted(): Promise<void>;
    /**
     * Renders a progress bar string for the webview status bar.
     * e.g. "██████░░░░ 3/5 tasks"
     */
    getProgressSummary(): string;
    /**
     * Extracts markdown checkbox items from AI output and saves them as todos.
     * Handles: `- [ ] task name` and `- [x] completed task`
     */
    syncFromMarkdown(markdown: string, sessionId?: string): Promise<number>;
    private save;
}
//# sourceMappingURL=todoTracker.d.ts.map
// src/tools/todoTracker.ts
// ─────────────────────────────────────────────────────────────────────────────
// Todo Tracker — persistent task management across sessions
//
// Features:
//   - Create/complete/delete todo items
//   - Tag items by session, agent task, or file
//   - Progress visualization
//   - Persist to VS Code globalState
// ─────────────────────────────────────────────────────────────────────────────

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

const STATE_KEY = 'my-coder.todos';

// ─── TodoTracker ──────────────────────────────────────────────────────────────

export class TodoTracker {
  constructor(private readonly state: vscode.Memento) {}

  /** Returns all todo items */
  getAll(): TodoItem[] {
    const list = this.state.get<TodoList>(STATE_KEY);
    return list?.items ?? [];
  }

  /** Returns only pending + in-progress items */
  getActive(): TodoItem[] {
    return this.getAll().filter(t => t.status !== 'done');
  }

  /**
   * Adds one or more todo items.
   * Items extracted from AI responses via extractTodosFromMarkdown() can be
   * bulk-added here.
   */
  async add(items: Array<Omit<TodoItem, 'id' | 'createdAt'>>): Promise<TodoItem[]> {
    const all = this.getAll();
    const added: TodoItem[] = items.map(item => ({
      ...item,
      id: generateId(),
      createdAt: Date.now(),
    }));
    await this.save([...all, ...added]);
    return added;
  }

  async markDone(id: string): Promise<void> {
    const all = this.getAll().map(t =>
      t.id === id ? { ...t, status: 'done' as TodoStatus, completedAt: Date.now() } : t
    );
    await this.save(all);
  }

  async markInProgress(id: string): Promise<void> {
    const all = this.getAll().map(t =>
      t.id === id ? { ...t, status: 'in-progress' as TodoStatus } : t
    );
    await this.save(all);
  }

  async delete(id: string): Promise<void> {
    await this.save(this.getAll().filter(t => t.id !== id));
  }

  async clearCompleted(): Promise<void> {
    await this.save(this.getAll().filter(t => t.status !== 'done'));
  }

  /**
   * Renders a progress bar string for the webview status bar.
   * e.g. "██████░░░░ 3/5 tasks"
   */
  getProgressSummary(): string {
    const all = this.getAll();
    if (!all.length) return '';
    const done = all.filter(t => t.status === 'done').length;
    const total = all.length;
    const pct = Math.round((done / total) * 10);
    const bar = '█'.repeat(pct) + '░'.repeat(10 - pct);
    return `${bar} ${done}/${total} tasks`;
  }

  /**
   * Extracts markdown checkbox items from AI output and saves them as todos.
   * Handles: `- [ ] task name` and `- [x] completed task`
   */
  async syncFromMarkdown(markdown: string, sessionId?: string): Promise<number> {
    const lines = markdown.split('\n');
    const toAdd: Array<Omit<TodoItem, 'id' | 'createdAt'>> = [];

    for (const line of lines) {
      const pending = line.match(/^\s*[-*]\s+\[\s\]\s+(.+)/);
      const done = line.match(/^\s*[-*]\s+\[x\]\s+(.+)/i);
      if (pending) {
        toAdd.push({ text: pending[1].trim(), status: 'pending', priority: 'medium', sessionId });
      } else if (done) {
        toAdd.push({ text: done[1].trim(), status: 'done', priority: 'medium', sessionId, completedAt: Date.now() });
      }
    }

    if (toAdd.length) await this.add(toAdd);
    return toAdd.length;
  }

  private async save(items: TodoItem[]): Promise<void> {
    await this.state.update(STATE_KEY, { items, lastUpdated: Date.now() } satisfies TodoList);
  }
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

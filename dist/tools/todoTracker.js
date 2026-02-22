"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TodoTracker = void 0;
const STATE_KEY = 'my-coder.todos';
// ─── TodoTracker ──────────────────────────────────────────────────────────────
class TodoTracker {
    state;
    constructor(state) {
        this.state = state;
    }
    /** Returns all todo items */
    getAll() {
        const list = this.state.get(STATE_KEY);
        return list?.items ?? [];
    }
    /** Returns only pending + in-progress items */
    getActive() {
        return this.getAll().filter(t => t.status !== 'done');
    }
    /**
     * Adds one or more todo items.
     * Items extracted from AI responses via extractTodosFromMarkdown() can be
     * bulk-added here.
     */
    async add(items) {
        const all = this.getAll();
        const added = items.map(item => ({
            ...item,
            id: generateId(),
            createdAt: Date.now(),
        }));
        await this.save([...all, ...added]);
        return added;
    }
    async markDone(id) {
        const all = this.getAll().map(t => t.id === id ? { ...t, status: 'done', completedAt: Date.now() } : t);
        await this.save(all);
    }
    async markInProgress(id) {
        const all = this.getAll().map(t => t.id === id ? { ...t, status: 'in-progress' } : t);
        await this.save(all);
    }
    async delete(id) {
        await this.save(this.getAll().filter(t => t.id !== id));
    }
    async clearCompleted() {
        await this.save(this.getAll().filter(t => t.status !== 'done'));
    }
    /**
     * Renders a progress bar string for the webview status bar.
     * e.g. "██████░░░░ 3/5 tasks"
     */
    getProgressSummary() {
        const all = this.getAll();
        if (!all.length)
            return '';
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
    async syncFromMarkdown(markdown, sessionId) {
        const lines = markdown.split('\n');
        const toAdd = [];
        for (const line of lines) {
            const pending = line.match(/^\s*[-*]\s+\[\s\]\s+(.+)/);
            const done = line.match(/^\s*[-*]\s+\[x\]\s+(.+)/i);
            if (pending) {
                toAdd.push({ text: pending[1].trim(), status: 'pending', priority: 'medium', sessionId });
            }
            else if (done) {
                toAdd.push({ text: done[1].trim(), status: 'done', priority: 'medium', sessionId, completedAt: Date.now() });
            }
        }
        if (toAdd.length)
            await this.add(toAdd);
        return toAdd.length;
    }
    async save(items) {
        await this.state.update(STATE_KEY, { items, lastUpdated: Date.now() });
    }
}
exports.TodoTracker = TodoTracker;
function generateId() {
    return Math.random().toString(36).slice(2, 10);
}
//# sourceMappingURL=todoTracker.js.map
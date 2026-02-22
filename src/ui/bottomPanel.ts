// src/ui/bottomPanel.ts
// Toggle panel with Problems, AI Actions, Terminal tabs — Amazon Q style

import * as vscode from 'vscode';
import { AIService } from '../ai/aiService';

export class BottomPanelProvider {
  private panel: vscode.WebviewPanel | undefined;
  private terminal: vscode.Terminal | undefined;
  private diagnosticsWatcher?: vscode.Disposable;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getAI: () => Promise<AIService | null>,
  ) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'myCoderBottomPanel',
      'MY Coder — Actions',
      { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'runAction':       await this.handleAction(msg.payload); break;
        case 'loadProblems':    this.sendProblems(); break;
        case 'openTerminal':    this.openTerminal(msg.payload); break;
        case 'fixProblem':      await this.fixProblem(msg.payload); break;
        case 'refreshProblems': this.sendProblems(); break;
      }
    });

    this.panel.onDidDispose(() => {
      this.diagnosticsWatcher?.dispose();
      this.panel = undefined;
    });

    // Watch for diagnostic changes and refresh problems tab
    this.diagnosticsWatcher = vscode.languages.onDidChangeDiagnostics(() => {
      if (this.panel) this.sendProblems();
    });
    this.context.subscriptions.push(this.diagnosticsWatcher);

    setTimeout(() => this.sendProblems(), 150);
  }

  private openTerminal(command?: string): void {
    if (!this.terminal || this.terminal.exitStatus !== undefined) {
      const folders = vscode.workspace.workspaceFolders;
      this.terminal = vscode.window.createTerminal({
        name: 'MY Coder',
        cwd: folders?.[0]?.uri.fsPath,
      });
    }
    this.terminal.show(false);
    if (command) this.terminal.sendText(command);
  }

  private async handleAction(action: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor && !['security', 'review'].includes(action)) {
      vscode.window.showWarningMessage('MY Coder: Open a file first to use this action.');
      return;
    }

    // Focus the MY Coder sidebar panel
    await vscode.commands.executeCommand('my-coder.mainView.focus');

    const commandMap: Record<string, string> = {
      explain:  'my-coder.runExplain',
      refactor: 'my-coder.runRefactor',
      test:     'my-coder.runTest',
      optimize: 'my-coder.runRefactor',
      fix:      'my-coder.runFix',
      review:   'my-coder.runReview',
      security: 'my-coder.runSecurity',
      docs:     'my-coder.runDocs',
    };

    const command = commandMap[action];
    if (command) await vscode.commands.executeCommand(command);
  }

  private async fixProblem(problem: { file: string; line: number; message: string }): Promise<void> {
    // Open the file and position cursor at the error line
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return;
    const uri = vscode.Uri.file(`${folders[0].uri.fsPath}/${problem.file}`);
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      const pos = new vscode.Position(Math.max(0, problem.line - 1), 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    } catch { /* file might not be accessible */ }

    // Then trigger fix on active file
    await vscode.commands.executeCommand('my-coder.mainView.focus');
    await vscode.commands.executeCommand('my-coder.runFix');
  }

  private sendProblems(): void {
    if (!this.panel) return;

    const diagnostics = vscode.languages.getDiagnostics();
    const problems: Array<{ file: string; line: number; col: number; severity: string; message: string; source?: string }> = [];

    for (const [uri, diags] of diagnostics) {
      for (const d of diags) {
        if (d.severity === vscode.DiagnosticSeverity.Error || d.severity === vscode.DiagnosticSeverity.Warning) {
          problems.push({
            file: vscode.workspace.asRelativePath(uri),
            line: d.range.start.line + 1,
            col: d.range.start.character + 1,
            severity: d.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning',
            message: d.message,
            source: d.source,
          });
        }
      }
    }

    // Sort: errors first, then by file
    problems.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
      return a.file.localeCompare(b.file);
    });

    this.panel.webview.postMessage({ type: 'problems', payload: problems });
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; background: #1e1e1e; color: #ccc; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
    .tabs { display: flex; border-bottom: 1px solid #3c3c3c; background: #252526; flex-shrink: 0; }
    .tab { padding: 8px 16px; cursor: pointer; border-bottom: 2px solid transparent; color: #969696; font-size: 11px; font-weight: 500; letter-spacing: 0.3px; text-transform: uppercase; }
    .tab.active { border-bottom-color: #007acc; color: #fff; }
    .tab:hover:not(.active) { background: #2a2d2e; color: #ccc; }
    .tab-content { display: none; flex: 1; overflow-y: auto; }
    .tab-content.active { display: flex; flex-direction: column; }
    /* Problems */
    .problems-toolbar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #252526; border-bottom: 1px solid #3c3c3c; flex-shrink: 0; }
    .badge { background: #f14c4c; color: #fff; font-size: 10px; padding: 1px 6px; border-radius: 10px; font-weight: 600; }
    .badge.warn { background: #cca700; }
    .problems-list { flex: 1; overflow-y: auto; }
    .problem { display: flex; align-items: flex-start; padding: 6px 12px; cursor: pointer; border-bottom: 1px solid #2d2d30; gap: 8px; }
    .problem:hover { background: #2a2d2e; }
    .problem-icon { flex-shrink: 0; font-size: 13px; margin-top: 1px; }
    .problem-body { flex: 1; min-width: 0; }
    .problem-msg { color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .problem-loc { font-size: 10px; color: #858585; font-family: monospace; margin-top: 2px; }
    .problem-fix { flex-shrink: 0; background: none; border: 1px solid #3c3c3c; color: #969696; padding: 2px 8px; border-radius: 3px; cursor: pointer; font-size: 10px; }
    .problem-fix:hover { border-color: #007acc; color: #fff; }
    .empty { text-align: center; padding: 40px 20px; color: #858585; }
    .empty-icon { font-size: 32px; margin-bottom: 8px; }
    /* Actions */
    .actions-grid { padding: 12px; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
    .action-card { padding: 14px 12px; border: 1px solid #3c3c3c; background: #252526; color: #ccc; cursor: pointer; border-radius: 6px; text-align: center; transition: all .15s; }
    .action-card:hover { background: #2a2d2e; border-color: #007acc; color: #fff; transform: translateY(-1px); }
    .action-icon { font-size: 22px; display: block; margin-bottom: 6px; }
    .action-label { font-size: 11px; font-weight: 500; }
    .action-desc { font-size: 10px; color: #858585; margin-top: 3px; }
    /* Terminal */
    .terminal-panel { padding: 12px; }
    .terminal-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .term-btn { padding: 6px 14px; border: 1px solid #3c3c3c; background: #252526; color: #ccc; cursor: pointer; border-radius: 4px; font-size: 11px; }
    .term-btn:hover { border-color: #007acc; color: #fff; }
    .term-info { color: #858585; font-size: 11px; padding: 8px; border: 1px solid #3c3c3c; border-radius: 4px; line-height: 1.6; }
    code { background: #2d2d30; padding: 1px 5px; border-radius: 3px; font-family: monospace; color: #ce9178; }
  </style>
</head>
<body>
  <div class="tabs">
    <div class="tab active" data-tab="problems" onclick="switchTab('problems',this)">⚠ Problems</div>
    <div class="tab" data-tab="actions" onclick="switchTab('actions',this)">⚡ AI Actions</div>
    <div class="tab" data-tab="terminal" onclick="switchTab('terminal',this)">⬛ Terminal</div>
  </div>

  <!-- Problems Tab -->
  <div class="tab-content active" id="tab-problems">
    <div class="problems-toolbar">
      <span id="error-badge" class="badge" style="display:none">0</span>
      <span id="warn-badge" class="badge warn" style="display:none">0</span>
      <span id="problems-count" style="color:#858585;font-size:11px;">Loading...</span>
      <button class="term-btn" style="margin-left:auto;padding:3px 10px;font-size:10px" onclick="refresh()">↻ Refresh</button>
    </div>
    <div class="problems-list" id="problems-list">
      <div class="empty"><div class="empty-icon">🔍</div>Loading problems...</div>
    </div>
  </div>

  <!-- Actions Tab -->
  <div class="tab-content" id="tab-actions">
    <div class="actions-grid">
      <div class="action-card" onclick="runAction('explain')">
        <span class="action-icon">💡</span>
        <div class="action-label">Explain</div>
        <div class="action-desc">Understand this code</div>
      </div>
      <div class="action-card" onclick="runAction('fix')">
        <span class="action-icon">🔧</span>
        <div class="action-label">Fix Issues</div>
        <div class="action-desc">Auto-fix errors</div>
      </div>
      <div class="action-card" onclick="runAction('refactor')">
        <span class="action-icon">♻️</span>
        <div class="action-label">Refactor</div>
        <div class="action-desc">Clean up code</div>
      </div>
      <div class="action-card" onclick="runAction('optimize')">
        <span class="action-icon">⚡</span>
        <div class="action-label">Optimize</div>
        <div class="action-desc">Improve performance</div>
      </div>
      <div class="action-card" onclick="runAction('test')">
        <span class="action-icon">🧪</span>
        <div class="action-label">Generate Tests</div>
        <div class="action-desc">Write test suite</div>
      </div>
      <div class="action-card" onclick="runAction('review')">
        <span class="action-icon">🔍</span>
        <div class="action-label">Code Review</div>
        <div class="action-desc">Full review</div>
      </div>
      <div class="action-card" onclick="runAction('docs')">
        <span class="action-icon">📝</span>
        <div class="action-label">Generate Docs</div>
        <div class="action-desc">JSDoc + README</div>
      </div>
      <div class="action-card" onclick="runAction('security')">
        <span class="action-icon">🔒</span>
        <div class="action-label">Security Scan</div>
        <div class="action-desc">Find vulnerabilities</div>
      </div>
    </div>
  </div>

  <!-- Terminal Tab -->
  <div class="tab-content" id="tab-terminal">
    <div class="terminal-panel">
      <div class="terminal-actions">
        <button class="term-btn" onclick="openTerminal()">⬛ Open Terminal</button>
        <button class="term-btn" onclick="openTerminal('npm run dev')">▶ npm run dev</button>
        <button class="term-btn" onclick="openTerminal('npm run build')">🔨 npm run build</button>
        <button class="term-btn" onclick="openTerminal('npm test')">🧪 npm test</button>
        <button class="term-btn" onclick="openTerminal('npm run lint')">🔎 npm run lint</button>
        <button class="term-btn" onclick="openTerminal('git status')">📦 git status</button>
      </div>
      <div class="term-info">
        Click a button above to open a terminal and run a command, or click <strong>⬛ Open Terminal</strong> to open an empty terminal.<br><br>
        Keyboard shortcut: <code>Ctrl+Shift+P</code> → <strong>MY Coder: Show Bottom Panel</strong>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function switchTab(name, el) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      el.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-' + name).classList.add('active');
      if (name === 'problems') vscode.postMessage({ type: 'loadProblems' });
    }

    function runAction(action) { vscode.postMessage({ type: 'runAction', payload: action }); }
    function openTerminal(cmd) { vscode.postMessage({ type: 'openTerminal', payload: cmd }); }
    function refresh() { vscode.postMessage({ type: 'refreshProblems' }); }

    window.addEventListener('message', e => {
      if (e.data.type !== 'problems') return;
      const problems = e.data.payload;
      const errors = problems.filter(p => p.severity === 'error').length;
      const warnings = problems.filter(p => p.severity === 'warning').length;

      const eb = document.getElementById('error-badge');
      const wb = document.getElementById('warn-badge');
      const ct = document.getElementById('problems-count');

      eb.style.display = errors > 0 ? '' : 'none';
      eb.textContent = errors;
      wb.style.display = warnings > 0 ? '' : 'none';
      wb.textContent = warnings;
      ct.textContent = problems.length === 0 ? 'No problems' : errors + ' error' + (errors !== 1 ? 's' : '') + ', ' + warnings + ' warning' + (warnings !== 1 ? 's' : '');

      const list = document.getElementById('problems-list');
      if (!problems.length) {
        list.innerHTML = '<div class="empty"><div class="empty-icon">✅</div>No problems detected</div>';
        return;
      }

      list.innerHTML = problems.map(p => {
        const icon = p.severity === 'error' ? '🔴' : '🟡';
        const src = p.source ? '[' + p.source + '] ' : '';
        return '<div class="problem" onclick="fixProblem(' + JSON.stringify(p).replace(/"/g, '&quot;') + ')">' +
          '<span class="problem-icon">' + icon + '</span>' +
          '<div class="problem-body">' +
            '<div class="problem-msg">' + escHtml(src + p.message) + '</div>' +
            '<div class="problem-loc">' + escHtml(p.file) + ':' + p.line + ':' + p.col + '</div>' +
          '</div>' +
          '<button class="problem-fix" onclick="event.stopPropagation();fixProblem(' + JSON.stringify(p).replace(/"/g, '&quot;') + ')">🔧 Fix</button>' +
        '</div>';
      }).join('');
    });

    function fixProblem(p) { vscode.postMessage({ type: 'fixProblem', payload: p }); }
    function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    vscode.postMessage({ type: 'loadProblems' });
  </script>
</body>
</html>`;
  }
}

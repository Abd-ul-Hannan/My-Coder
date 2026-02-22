// media/webviewScript.js — MY Coder Full IDE Panel UI
(function () {
  'use strict';

  // @ts-ignore
  const vscode = acquireVsCodeApi();

  // ─── State ─────────────────────────────────────────────────────────────────
  let state = {
    isWaiting: false,
    currentMode: null,
    currentSessionId: null,
    pendingPatches: null,
    provider: 'openai',
    model: 'gpt-4o',
    isSignedIn: false,
    userEmail: null,
    interviewStep: null,
    interviewSelections: [],
    tabs: [],
    activeTab: 'chat'
  };

  // ─── DOM ───────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

  const messagesEl = $('messages');
  const inputEl = $('input');
  const sendBtn = $('send-btn');
  const footer = $('footer');
  const diffBar = $('diff-bar');
  const sessionList = $('session-list');
  const statusDot = $('status-dot');
  const statusText = $('status-text');
  const modelLabel = $('model-label');
  const progressEl = $('progress-inline');
  const tabBar = $('tab-bar');

  // ─── Init ──────────────────────────────────────────────────────────────────
  function init() {
    setupListeners();
    renderWelcome();
    post('loadHistory');
    updateStatusBar('ready', 'Ready');
  }

  // ─── Message from Extension ────────────────────────────────────────────────
  window.addEventListener('message', ({ data: msg }) => {
    switch (msg.type) {
      case 'message':              handleIncomingMessage(msg.payload); break;
      case 'progress':             showProgressInline(msg.payload); break;
      case 'error':                appendError(msg.payload); setWaiting(false); break;
      case 'diff':                 handleDiff(msg.payload); break;
      case 'historyList':          renderHistory(msg.payload.sessions, msg.payload.authStatus); break;
      case 'sessionLoaded':        msg.payload ? loadSessionMessages(msg.payload) : clearChat(); break;
      case 'authStatus':           updateAuth(msg.payload); break;
      case 'providerStatus':       updateProviderBadge(msg.payload); break;
      case 'connectionTestResult': /* handled in modal */ break;
      case 'ollamaModels':         /* handled in modal */ break;
      case 'todos':                renderTodosInPanel(msg.payload); break;
      case 'slashCommands':        populateSlashAutocomplete(msg.payload); break;
      case 'streamChunk':          appendStreamChunk(msg.payload); break;
      case 'injectSlashCommand':   injectSlashCommand(msg.payload); break;
      case 'triggerWebSearch':     handleWebSearchTrigger(msg.payload); break;
      case 'runSecurityScan':      post('runSecurityScan'); break;
      case 'operationComplete':    finalizeStreamMsg(); setWaiting(false); hideProgress(); updateStatusBar('ready', 'Ready'); break;
      case 'activeFile':           updateActiveFileBar(msg.payload); break;
      case 'injectText':           inputEl.value = msg.payload; inputEl.focus(); inputEl.style.height = 'auto'; inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px'; break;
      case 'sendMessage':          inputEl.value = msg.payload; sendMessage(); break;
      case 'triggerNewApp':        startMode('new-app'); break;
      case 'triggerExisting':      startMode('existing-project'); break;
      case 'triggerSignIn':        post('signIn'); break;
      case 'triggerSignOut':       post('signOut'); break;
      case 'clearHistory':         post('clearHistory'); break;
    }
  });

  // ─── Event Listeners ───────────────────────────────────────────────────────
  function setupListeners() {
    // Mode buttons
    $('btn-new-app').addEventListener('click', () => startMode('new-app'));
    $('btn-existing').addEventListener('click', () => startMode('existing-project'));

    // Send
    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    });

    // Titlebar
    $('btn-settings').addEventListener('click', () => showSettingsModal());
    $('btn-clear').addEventListener('click', () => {
      showConfirmAction('Clear all chat history? This cannot be undone.', 'Clear History', () => {
        post('clearHistory');
      });
    });
    $('provider-pill').addEventListener('click', () => showSettingsModal());

    // New session
    $('btn-new-session').addEventListener('click', () => clearChat());

    // Diff
    $('diff-apply').addEventListener('click', () => { post('applyDiff'); diffBar.classList.add('hidden'); });
    $('diff-reject').addEventListener('click', () => { post('rejectDiff'); diffBar.classList.add('hidden'); });

    // Active file toolbar
    $('af-fix').addEventListener('click', function() {
      if (state.isWaiting) return;
      post('fixActiveFile');
      setWaiting(true);
      updateStatusBar('working', 'Detecting issues...');
    });
    $('af-review').addEventListener('click', function() {
      if (state.isWaiting) return;
      post('reviewActiveFile');
      setWaiting(true);
      updateStatusBar('working', 'Reviewing...');
    });
    $('af-explain').addEventListener('click', function() {
      if (state.isWaiting) return;
      post('explainActiveFile');
      setWaiting(true);
      updateStatusBar('working', 'Explaining...');
    });

    // Auth
    $('btn-sign-in').addEventListener('click', () => post('signIn'));
    $('btn-sign-out').addEventListener('click', () => post('signOut'));
  }

  // ─── Mode Switching ────────────────────────────────────────────────────────
  function startMode(mode) {
    state.currentMode = mode;
    ['btn-new-app', 'btn-existing'].forEach(id => $('btn-new-app'.startsWith(id.split('-')[0]) ? id : id).classList.remove('active'));
    $('btn-new-app').classList.toggle('active', mode === 'new-app');
    $('btn-existing').classList.toggle('active', mode === 'existing-project');

    clearChat();
    if (mode === 'new-app') post('startNewApp');
    else post('startWorkOnProject');
  }

  // ─── Send Message ──────────────────────────────────────────────────────────
  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || state.isWaiting) return;

    // Check if this is an interview selection response or free text
    appendMessage({ role: 'user', content: text, type: 'text', timestamp: Date.now() });
    post('sendMessage', text);

    inputEl.value = '';
    inputEl.style.height = 'auto';
    setWaiting(true);
    updateStatusBar('working', 'Thinking...');
  }

  // ─── Incoming Messages ─────────────────────────────────────────────────────
  function handleIncomingMessage(msg) {
    hideProgress();
    setWaiting(false);
    updateStatusBar('ready', 'Ready');

    if (!msg) return;

    // Interview question? Render interactive widget
    if (msg.type === 'interview' && msg.metadata?.options) {
      renderInterviewWidget(msg);
    } else {
      appendMessage(msg);
    }
  }

  // ─── Message Rendering ─────────────────────────────────────────────────────
  function appendMessage(msg) {
    removeWelcome();

    const div = el('div', `message ${msg.role}`);
    div.dataset.type = msg.type || 'text';

    const avatarChar = msg.role === 'user' ? '👤' : '🤖';
    const roleName = msg.role === 'user' ? 'You' : 'MY Coder';
    const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const badgeLabels = { plan: 'PLAN', diff: 'DIFF', 'build-result': 'BUILD', error: 'ERROR', interview: 'INTERVIEW' };
    const badge = badgeLabels[msg.type] ? `<span class="msg-badge">${badgeLabels[msg.type]}</span>` : '';

    div.innerHTML = `
      <div class="msg-hdr">
        <div class="msg-avatar">${avatarChar}</div>
        <span class="msg-role">${roleName}</span>
        <span class="msg-time">${timeStr}</span>
        ${badge}
      </div>
      <div class="msg-body">${renderMarkdown(msg.content || '')}</div>`;

    messagesEl.appendChild(div);
    scrollBottom();
  }

  function appendError(text) {
    removeWelcome();
    updateStatusBar('error', 'Error');
    const div = el('div', 'message assistant');
    div.dataset.type = 'error';
    div.innerHTML = `
      <div class="msg-hdr"><div class="msg-avatar">⚠️</div><span class="msg-role">Error</span><span class="msg-badge">ERROR</span></div>
      <div class="msg-body">${escHtml(text)}</div>`;
    messagesEl.appendChild(div);
    scrollBottom();
  }

  // ─── Interview Widget ──────────────────────────────────────────────────────
  function renderInterviewWidget(msg) {
    removeWelcome();
    const meta = msg.metadata;
    const isMulti = !!meta.isMultiSelect;
    let selected = [];

    const widget = el('div');
    widget.innerHTML = `
      <div class="msg-hdr" style="margin-bottom:6px">
        <div class="msg-avatar">🤖</div>
        <span class="msg-role">MY Coder</span>
        <span class="msg-badge">INTERVIEW</span>
      </div>
      <div class="msg-body" style="padding:0;overflow:hidden">
        <div style="padding:10px 14px;font-weight:500">${escHtml(meta.question)}</div>
      </div>`;

    const widget2 = el('div', 'interview-widget');
    const progress = meta.progress ?? 0;
    widget2.innerHTML = `
      <div class="iw-header">
        <span>${meta.step ?? ''}</span>
        <div class="iw-progress"><div class="iw-progress-bar" style="width:${progress}%"></div></div>
        <span class="iw-step">${progress}%</span>
      </div>
      <div class="iw-options" id="iw-opts-${meta.step}"></div>
      ${isMulti ? '<div class="iw-multi-hint">Select all that apply, then click Confirm</div><button class="iw-confirm-btn" id="iw-confirm">Confirm selection →</button>' : ''}`;

    const optsEl = widget2.querySelector(`#iw-opts-${meta.step}`);

    for (const opt of meta.options) {
      const optEl = el('div', 'iw-option');
      optEl.innerHTML = `<span class="opt-label">${escHtml(opt.label)}</span>${opt.description ? `<span class="opt-desc">${escHtml(opt.description)}</span>` : ''}`;
      optEl.dataset.value = opt.value;

      optEl.addEventListener('click', () => {
        if (isMulti) {
          optEl.classList.toggle('selected');
          const val = opt.value;
          selected = optEl.classList.contains('selected')
            ? [...selected, val]
            : selected.filter(v => v !== val);
        } else {
          // Single select — immediately submit
          optsEl.querySelectorAll('.iw-option').forEach(o => o.classList.remove('selected'));
          optEl.classList.add('selected');
          // Disable all options
          optsEl.querySelectorAll('.iw-option').forEach(o => o.style.pointerEvents = 'none');
          appendMessage({ role: 'user', content: opt.label, type: 'text', timestamp: Date.now() });
          post('sendMessage', opt.value);
          setWaiting(true);
          updateStatusBar('working', 'Processing...');
        }
      });
      optsEl.appendChild(optEl);
    }

    if (isMulti) {
      const confirmBtn = widget2.querySelector('#iw-confirm');
      confirmBtn.addEventListener('click', () => {
        if (!selected.length) return;
        const labels = meta.options.filter(o => selected.includes(o.value)).map(o => o.label).join(', ');
        appendMessage({ role: 'user', content: labels, type: 'text', timestamp: Date.now() });
        post('sendMessage', JSON.stringify(selected));
        setWaiting(true);
        updateStatusBar('working', 'Processing...');
        widget2.style.pointerEvents = 'none'; widget2.style.opacity = '0.6';
      });
    }

    const container = el('div', 'message assistant');
    container.appendChild(widget);
    container.appendChild(widget2);
    messagesEl.appendChild(container);
    scrollBottom();
  }

  // ─── Diff Handling ─────────────────────────────────────────────────────────
  function handleDiff(payload) {
    hideProgress();
    setWaiting(false);
    updateStatusBar('ready', 'Awaiting approval');

    appendMessage({
      role: 'assistant',
      content: payload.diff,
      type: 'diff',
      timestamp: Date.now()
    });

    const count = payload.patches?.length ?? 1;
    $('diff-files').textContent = `${count} file${count === 1 ? '' : 's'} changed`;
    diffBar.classList.remove('hidden');
  }

  // ─── History ───────────────────────────────────────────────────────────────
  function renderHistory(sessions, authStatus) {
    updateAuth(authStatus);
    sessionList.innerHTML = '';

    if (!sessions?.length) {
      sessionList.innerHTML = '<div class="empty-state">No sessions yet</div>';
      return;
    }

    for (const s of sessions) {
      const isActive = s.id === state.currentSessionId;
      const item = el('div', 'session-item' + (isActive ? ' active' : ''));
      const modeIcon = { 'new-app': '✨', 'existing-project': '🔧', 'chat': '💬' }[s.mode] ?? '💬';
      item.innerHTML =
        '<div class="s-body">' +
          '<div class="s-title">' + escHtml(s.title) + '</div>' +
          '<div class="s-meta">' +
            '<span class="s-mode-badge">' + modeIcon + ' ' + (s.mode === 'new-app' ? 'New' : s.mode === 'existing-project' ? 'Edit' : 'Chat') + '</span>' +
            '<span>' + s.messageCount + ' msgs</span>' +
            '<span>' + formatDate(s.updatedAt) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="s-actions">' +
          '<button class="s-ren" title="Rename session">✏️</button>' +
          '<button class="s-del" title="Delete session">🗑</button>' +
        '</div>';

      // Load on row click — skip clicks on action buttons
      item.addEventListener('click', function(e) {
        if (e.target.closest && e.target.closest('.s-actions')) return;
        if (e.target.classList && (e.target.classList.contains('s-del') || e.target.classList.contains('s-ren'))) return;
        sessionList.querySelectorAll('.session-item').forEach(function(el) { el.classList.remove('active'); });
        item.classList.add('active');
        state.currentSessionId = s.id;
        post('loadSession', s.id);
      });

      // Delete button — use IIFE to capture correct session id/title
      (function(sessionId, sessionTitle, sessionItem) {
        var delBtn = sessionItem.querySelector('.s-del');
        delBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          e.preventDefault();
          showConfirmAction('Delete "' + sessionTitle + '"?', 'Delete', function() {
            if (state.currentSessionId === sessionId) {
              state.currentSessionId = null;
              clearChat();
            }
            sessionItem.remove();
            if (!sessionList.querySelector('.session-item')) {
              sessionList.innerHTML = '<div class="empty-state">No sessions yet</div>';
            }
            post('deleteSession', sessionId);
          });
        });
      })(s.id, s.title, item);

      // Rename button — double-click title or click ✏️
      (function(sessionId, sessionTitle, sessionItem) {
        var renBtn = sessionItem.querySelector('.s-ren');
        function startRename() {
          var titleEl = sessionItem.querySelector('.s-title');
          if (!titleEl || titleEl.querySelector('input')) return; // already editing
          var oldTitle = titleEl.textContent;
          titleEl.innerHTML = '';
          var inp = document.createElement('input');
          inp.className = 'rename-input';
          inp.value = oldTitle;
          inp.style.cssText = 'width:100%;background:var(--bg-input,#3c3c3c);color:inherit;border:1px solid var(--accent,#007acc);border-radius:3px;padding:2px 6px;font-size:inherit;font-family:inherit;outline:none';
          titleEl.appendChild(inp);
          inp.focus();
          inp.select();
          function commit() {
            var newTitle = inp.value.trim();
            titleEl.textContent = newTitle || oldTitle;
            if (newTitle && newTitle !== oldTitle) {
              post('renameSession', { id: sessionId, title: newTitle });
            }
          }
          inp.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
            if (ev.key === 'Escape') { titleEl.textContent = oldTitle; }
          });
          inp.addEventListener('blur', commit);
        }
        renBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          startRename();
        });
        var titleEl = sessionItem.querySelector('.s-title');
        if (titleEl) {
          titleEl.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            startRename();
          });
        }
      })(s.id, s.title, item);

      sessionList.appendChild(item);
    }
  }

  function loadSessionMessages(session) {
    clearMessages();
    state.currentSessionId = session.id;
    state.currentMode = session.mode;
    for (const msg of session.messages) appendMessage(msg);
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────
  function updateAuth(status) {
    if (!status) return;
    state.isSignedIn = status.isSignedIn;
    state.userEmail = status.userEmail;

    const signInBtn = $('btn-sign-in');
    const signOutBtn = $('btn-sign-out');
    const authAvatar = $('auth-avatar');
    const authName = $('auth-name');
    const authSub = $('auth-sub');

    if (status.isSignedIn) {
      signInBtn?.classList.add('hidden');
      signOutBtn?.classList.remove('hidden');
      if (authAvatar) authAvatar.textContent = (status.userName?.[0] ?? status.userEmail?.[0] ?? 'G').toUpperCase();
      if (authName) authName.textContent = status.userName ?? status.userEmail ?? 'Google User';
      if (authSub) authSub.textContent = status.storageType === 'drive' ? '☁ Google Drive sync' : '💾 Local storage';
    } else {
      signInBtn?.classList.remove('hidden');
      signOutBtn?.classList.add('hidden');
      if (authAvatar) authAvatar.textContent = '?';
      if (authName) authName.textContent = 'Not signed in';
      if (authSub) authSub.textContent = '💾 Local storage';
    }
  }

  function updateProviderBadge(info) {
    state.provider = info.provider;
    state.model = info.model;
    const badge = $('provider-pill');
    const dot = $('p-dot');
    if (badge) badge.innerHTML = `<span class="p-dot ${info.connected ? '' : 'off'}" id="p-dot"></span>${info.provider.toUpperCase()} · ${info.model}`;
    if (modelLabel) modelLabel.textContent = `${info.provider}/${info.model}`;
  }

  // ─── Settings Modal ────────────────────────────────────────────────────────
  function showSettingsModal() {
    // Provider → model map (mirrors PROVIDER_REGISTRY in aiService.ts)
    const PROVIDERS = {
      openai:      { name: 'OpenAI',              needsKey: true,  keyPlaceholder: 'sk-...',            docsUrl: 'https://platform.openai.com/api-keys',       models: ['gpt-4o','gpt-4o-mini','o1','o1-mini','gpt-4-turbo','gpt-3.5-turbo'] },
      anthropic:   { name: 'Anthropic (Claude)',  needsKey: true,  keyPlaceholder: 'sk-ant-...',         docsUrl: 'https://console.anthropic.com/settings/keys', models: ['claude-opus-4-5-20251101','claude-sonnet-4-5-20250929','claude-haiku-4-5-20251001'] },
      groq:        { name: 'Groq',                needsKey: true,  keyPlaceholder: 'gsk_...',            docsUrl: 'https://console.groq.com/keys',               models: ['llama-3.3-70b-versatile','llama-3.1-8b-instant','mixtral-8x7b-32768','gemma2-9b-it','deepseek-r1-distill-llama-70b'] },
      gemini:      { name: 'Google Gemini',       needsKey: true,  keyPlaceholder: 'AIza...',            docsUrl: 'https://aistudio.google.com/app/apikey',      models: ['gemini-2.0-flash','gemini-2.0-flash-lite','gemini-1.5-pro','gemini-1.5-flash'] },
      mistral:     { name: 'Mistral AI',          needsKey: true,  keyPlaceholder: '...',                docsUrl: 'https://console.mistral.ai/api-keys/',        models: ['mistral-large-latest','mistral-small-latest','codestral-latest','mistral-nemo'] },
      ollama:      { name: 'Ollama (Local, Free)',needsKey: false, keyPlaceholder: '(not required)',     docsUrl: 'https://ollama.ai',                           models: ['llama3.2','llama3.1:8b','codellama','deepseek-coder-v2','qwen2.5-coder:7b','mistral','phi4'] },
      openrouter:  { name: 'OpenRouter',          needsKey: true,  keyPlaceholder: 'sk-or-...',          docsUrl: 'https://openrouter.ai/keys',                  models: ['anthropic/claude-sonnet-4-5','openai/gpt-4o','meta-llama/llama-3.3-70b-instruct','google/gemini-2.0-flash-exp:free','deepseek/deepseek-r1','qwen/qwen-2.5-coder-32b-instruct'] },
      custom:      { name: 'Custom (OpenAI-compatible)', needsKey: false, keyPlaceholder: 'optional',   docsUrl: '',                                            models: [] }
    };

    const overlay = el('div', 'overlay');
    overlay.innerHTML = `
      <div class="modal" style="width:min(480px,95vw)">
        <div class="modal-hdr">
          <span>⚙️ AI Provider Settings</span>
          <button class="modal-close" id="modal-close">✕</button>
        </div>
        <div class="modal-body" style="gap:14px">

          <div class="form-group">
            <label class="form-label">Provider</label>
            <select class="form-select" id="sel-provider">
              ${Object.entries(PROVIDERS).map(([k,v]) =>
                `<option value="${k}" ${state.provider === k ? 'selected' : ''}>${v.name}</option>`
              ).join('')}
            </select>
          </div>

          <div class="form-group" id="model-group">
            <label class="form-label">Model</label>
            <select class="form-select" id="sel-model"></select>
            <div id="ollama-detect" style="display:none;margin-top:4px">
              <button class="btn btn-secondary btn-sm" id="btn-detect-ollama">🔍 Detect local models</button>
            </div>
          </div>

          <div class="form-group" id="apikey-group">
            <label class="form-label">API Key <span id="key-required-badge" style="color:var(--danger);font-size:9px">REQUIRED</span></label>
            <div style="display:flex;gap:6px">
              <input type="password" class="form-input" id="inp-apikey" placeholder="" style="flex:1"/>
              <button class="btn btn-ghost btn-sm" id="btn-toggle-key" style="flex-shrink:0">👁</button>
            </div>
            <span class="form-hint" id="key-hint">Stored in VS Code SecretStorage + SQLite DB (syncs via Google Drive)</span>
            <a class="form-hint" id="key-docs" href="#" style="color:var(--accent);text-decoration:none" target="_blank">Get API key →</a>
          </div>

          <div class="form-group" id="baseurl-group" style="display:none">
            <label class="form-label">Base URL</label>
            <input type="text" class="form-input" id="inp-baseurl" placeholder="http://localhost:11434/v1"/>
            <span class="form-hint">Override endpoint (Ollama, self-hosted, LM Studio, etc.)</span>
          </div>

          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-secondary btn-sm" id="btn-test">🔌 Test connection</button>
            <span id="test-result" style="font-size:10px;color:var(--text-muted)"></span>
          </div>

          <div style="border-top:1px solid var(--border);padding-top:12px">
            <label class="form-label">Google Drive History Sync</label>
            <div style="font-size:11px;color:var(--text-muted);margin:4px 0 8px">Sync chat history across machines using your Google Drive appData folder.</div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm" id="modal-signin" ${state.isSignedIn?'disabled':''}>Sign in with Google</button>
              <button class="btn btn-ghost btn-sm" id="modal-signout" ${!state.isSignedIn?'disabled':''}>Sign out</button>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="modal-save">💾 Save & Apply</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const selProv = overlay.querySelector('#sel-provider');
    const selModel = overlay.querySelector('#sel-model');
    const inpKey = overlay.querySelector('#inp-apikey');
    const inpBaseUrl = overlay.querySelector('#inp-baseurl');
    const keyHint = overlay.querySelector('#key-docs');
    const keyReqBadge = overlay.querySelector('#key-required-badge');
    const baseUrlGroup = overlay.querySelector('#baseurl-group');
    const ollamaDetect = overlay.querySelector('#ollama-detect');
    const testResult = overlay.querySelector('#test-result');

    function refreshForProvider(provider) {
      const info = PROVIDERS[provider];
      if (!info) return;

      // Update model dropdown
      selModel.innerHTML = info.models.length
        ? info.models.map(m => `<option value="${m}">${m}</option>`).join('')
        : '<option value="custom-model">custom-model</option>';

      // Select current model if it matches
      if (info.models.includes(state.model)) selModel.value = state.model;

      // API key field
      inpKey.placeholder = info.keyPlaceholder;
      inpKey.disabled = !info.needsKey;
      keyReqBadge.style.display = info.needsKey ? '' : 'none';
      keyHint.textContent = info.docsUrl ? 'Get API key →' : '';
      keyHint.href = info.docsUrl || '#';

      // Show base URL for ollama/custom
      const showBase = provider === 'ollama' || provider === 'custom';
      baseUrlGroup.style.display = showBase ? '' : 'none';

      // Ollama auto-detect button
      ollamaDetect.style.display = provider === 'ollama' ? '' : 'none';
    }

    // Initialize with current provider
    refreshForProvider(selProv.value);

    selProv.addEventListener('change', () => refreshForProvider(selProv.value));

    // Toggle key visibility
    overlay.querySelector('#btn-toggle-key').addEventListener('click', () => {
      inpKey.type = inpKey.type === 'password' ? 'text' : 'password';
    });

    // Ollama model detection
    overlay.querySelector('#btn-detect-ollama').addEventListener('click', async () => {
      const btn = overlay.querySelector('#btn-detect-ollama');
      btn.textContent = '⏳ Detecting...'; btn.disabled = true;
      post('detectOllamaModels', inpBaseUrl.value || null);
      // Result comes back via message handler — see 'ollamaModels' case
      setTimeout(() => { btn.textContent = '🔍 Detect local models'; btn.disabled = false; }, 3000);
    });

    // Test connection
    overlay.querySelector('#btn-test').addEventListener('click', () => {
      testResult.textContent = '⏳ Testing...';
      testResult.style.color = 'var(--text-muted)';
      const provider = selProv.value;
      const model = selModel.value;
      const apiKey = inpKey.value.trim();
      const baseUrl = inpBaseUrl.value.trim() || null;
      post('testConnection', { provider, model, apiKey, baseUrl });
    });

    // Handle test result message
    const testHandler = (ev) => {
      if (ev.data.type === 'connectionTestResult') {
        const r = ev.data.payload;
        testResult.textContent = r.ok ? `✅ Connected (${r.latencyMs}ms)` : `❌ ${r.error}`;
        testResult.style.color = r.ok ? 'var(--success)' : 'var(--danger)';
      }
      if (ev.data.type === 'ollamaModels' && ev.data.payload?.length) {
        selModel.innerHTML = ev.data.payload.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
      }
      if (ev.data.type === 'authStatus') {
        // Update sign-in/out button states when auth changes
        const signinBtn = overlay.querySelector('#modal-signin');
        const signoutBtn = overlay.querySelector('#modal-signout');
        if (signinBtn && signoutBtn) {
          const isSignedIn = ev.data.payload.isSignedIn;
          signinBtn.disabled = isSignedIn;
          signoutBtn.disabled = !isSignedIn;
          if (isSignedIn) {
            signinBtn.textContent = '✅ Signed in';
          }
        }
      }
    };
    window.addEventListener('message', testHandler);

    const close = () => { window.removeEventListener('message', testHandler); overlay.remove(); };
    overlay.querySelector('#modal-close').addEventListener('click', close);
    overlay.querySelector('#modal-cancel').addEventListener('click', close);
    overlay.querySelector('#modal-signin').addEventListener('click', () => {
      const signinBtn = overlay.querySelector('#modal-signin');
      const originalText = signinBtn.textContent;
      signinBtn.disabled = true;
      signinBtn.textContent = '⏳ Opening browser...';
      
      // Send sign-in request
      post('signIn');
      
      // Reset button after 3 seconds (auth flow happens in browser)
      setTimeout(() => {
        signinBtn.textContent = originalText;
        signinBtn.disabled = false;
      }, 3000);
    });
    
    overlay.querySelector('#modal-signout').addEventListener('click', () => { 
      post('signOut'); 
      close(); 
    });

    overlay.querySelector('#modal-save').addEventListener('click', async () => {
      const provider = selProv.value;
      const model = selModel.value;
      const apiKey = inpKey.value.trim();
      const baseUrl = inpBaseUrl.value.trim() || null;
      const providerInfo = PROVIDERS[provider];

      // Disable save button while processing
      const saveBtn = overlay.querySelector('#modal-save');
      const originalText = saveBtn.textContent;
      saveBtn.disabled = true;
      saveBtn.textContent = '⏳ Saving...';

      try {
        // Step 1: Save API key FIRST if required and provided
        if (providerInfo.needsKey && apiKey) {
          post('setApiKey', { provider, apiKey });
          // Wait a moment for the key to be saved to secrets
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Step 2: Update provider/model settings
        post('updateSettings', { provider, model, baseUrl });
        await new Promise(resolve => setTimeout(resolve, 200));

        // Step 3: Update local state and UI
        state.provider = provider;
        state.model = model;
        updateProviderBadge({ provider, model, connected: !!apiKey || !providerInfo.needsKey });

        // Success - close modal
        close();
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
        testResult.textContent = '❌ Save failed: ' + (err.message || String(err));
        testResult.style.color = 'var(--danger)';
      }
    });

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  }

  // ─── Status & Progress ─────────────────────────────────────────────────────
  function setWaiting(val) {
    state.isWaiting = val;
    sendBtn.disabled = val;
    if (!val) hideProgress();
  }

  function showProgressInline(text) {
    hideProgress();
    const p = el('div', 'progress-msg');
    p.id = 'progress-inline';
    p.innerHTML = `<div class="progress-spinner"></div><span>${escHtml(text)}</span>`;
    messagesEl.appendChild(p);
    scrollBottom();
    updateStatusBar('working', text.length > 40 ? text.slice(0, 40) + '...' : text);
  }

  function hideProgress() {
    const p = $('progress-inline');
    if (p) p.remove();
  }

  function updateStatusBar(status, text) {
    const dot = $('status-dot');
    const txt = $('status-text');
    if (dot) { dot.className = 'status-dot ' + status; }
    if (txt) txt.textContent = text;
  }

  // ─── Misc UI ───────────────────────────────────────────────────────────────
  function renderWelcome() {
    messagesEl.innerHTML = `
      <div class="welcome">
        <div class="welcome-icon">🤖</div>
        <h2>MY Coder</h2>
        <p>Your autonomous AI developer.<br/>Choose a mode from the sidebar to get started, or just chat below.</p>
        <div class="welcome-actions">
          <button class="btn btn-primary" onclick="document.getElementById('btn-new-app').click()">✨ Create New App</button>
          <button class="btn btn-secondary" onclick="document.getElementById('btn-existing').click()">🔧 Work on Project</button>
        </div>
      </div>`;
  }

  function clearChat() {
    clearMessages();
    renderWelcome();
    state.currentSessionId = null;
    diffBar.classList.add('hidden');
    setWaiting(false);
    updateStatusBar('ready', 'Ready');
    $('btn-new-app').classList.remove('active');
    $('btn-existing').classList.remove('active');
  }

  function clearMessages() { messagesEl.innerHTML = ''; }
  function removeWelcome() { const w = messagesEl.querySelector('.welcome'); if (w) w.remove(); }
  function scrollBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }

  // ─── Markdown Renderer ─────────────────────────────────────────────────────
  function renderMarkdown(text) {
    let h = escHtml(text);
    // Code blocks first
    h = h.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code>${renderDiffColors(code.trim())}</code></pre>`);
    // Inline code
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold, italic
    h = h.replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>');
    h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Headers
    h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    // Lists
    h = h.replace(/^- (.+)$/gm, '<li>$1</li>');
    h = h.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
    h = h.replace(/(<li>.*?<\/li>(\n|$))+/gs, '<ul>$&</ul>');
    // HR
    h = h.replace(/^---$/gm, '<hr>');
    // Links
    h = h.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');
    // Paragraphs
    h = h.replace(/\n\n+/g, '</p><p>');
    h = '<p>' + h + '</p>';
    h = h.replace(/\n/g, '<br>');
    // Clean up
    ['<p><h', '</h2></p>', '</h3></p>', '<p><ul>', '</ul></p>',
     '<p><pre>', '</pre></p>', '<p><hr>', '</p>'].reduce((s, t, i, a) => {
       if (i % 2 === 0) return s; // Skip odd indexed
       return s;
    }, h);
    h = h.replace(/<p>(<h[23]>)/g, '$1').replace(/(<\/h[23]>)<\/p>/g, '$1');
    h = h.replace(/<p>(<ul>)/g, '$1').replace(/(<\/ul>)<\/p>/g, '$1');
    h = h.replace(/<p>(<pre>)/g, '$1').replace(/(<\/pre>)<\/p>/g, '$1');
    h = h.replace(/<p>(<hr>)<\/p>/g, '$1');
    h = h.replace(/<p><\/p>/g, '');
    return h;
  }

  function renderDiffColors(code) {
    return code.split('\n').map(line => {
      if (line.startsWith('+') && !line.startsWith('+++')) return `<span class="diff-add">${line}</span>`;
      if (line.startsWith('-') && !line.startsWith('---')) return `<span class="diff-del">${line}</span>`;
      if (line.startsWith('@@')) return `<span class="diff-hunk">${line}</span>`;
      return line;
    }).join('\n');
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function post(type, payload) { vscode.postMessage({ type, payload }); }
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts), now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  // ─── Custom Confirm Dialog (replaces blocked confirm()) ───────────────────
  function showConfirmAction(message, confirmLabel, onConfirm) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `
      <div style="background:var(--surface,#252526);border:1px solid var(--border,#3e3e42);border-radius:8px;padding:20px 24px;min-width:260px;max-width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.4)">
        <div style="font-size:13px;color:var(--text,#cccccc);margin-bottom:18px;line-height:1.5">${message}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="ca-no"  style="padding:5px 14px;border-radius:4px;border:1px solid var(--border,#3e3e42);background:transparent;color:var(--text,#cccccc);cursor:pointer;font-size:12px">Cancel</button>
          <button id="ca-yes" style="padding:5px 14px;border-radius:4px;border:none;background:#f44747;color:#fff;cursor:pointer;font-size:12px">${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#ca-yes').addEventListener('click', () => { overlay.remove(); onConfirm(); });
    overlay.querySelector('#ca-no').addEventListener('click',  () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  // ─── Slash Command Autocomplete ────────────────────────────────────────────
  let slashCommands = [];
  function populateSlashAutocomplete(cmds) { slashCommands = cmds; }

  const autocompleteEl = el('div', 'slash-autocomplete hidden');
  autocompleteEl.id = 'slash-autocomplete';
  document.body.appendChild(autocompleteEl);

  inputEl.addEventListener('input', () => {
    const val = inputEl.value;
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    handleInputAutocomplete(val);
  });

  function handleInputAutocomplete(val) {
    // Slash command autocomplete
    if (val.startsWith('/') && !val.includes(' ')) {
      const prefix = val.toLowerCase();
      const matches = slashCommands.filter(c => c.command.startsWith(prefix));
      if (matches.length) {
        showSlashAutocomplete(matches);
        return;
      }
    }
    hideSlashAutocomplete();
  }

  function showSlashAutocomplete(matches) {
    autocompleteEl.innerHTML = matches.map(c =>
      `<div class="slash-item" data-cmd="${escHtml(c.command)}">
        <span class="slash-cmd">${escHtml(c.command)}</span>
        <span class="slash-desc">${escHtml(c.description)}</span>
      </div>`
    ).join('');
    autocompleteEl.classList.remove('hidden');

    // Position above the footer
    const footerRect = $('footer').getBoundingClientRect();
    autocompleteEl.style.bottom = (window.innerHeight - footerRect.top + 4) + 'px';
    autocompleteEl.style.left = '212px';
    autocompleteEl.style.right = '12px';

    autocompleteEl.querySelectorAll('.slash-item').forEach(item => {
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        inputEl.value = item.dataset.cmd + ' ';
        inputEl.focus();
        hideSlashAutocomplete();
      });
    });
  }

  function hideSlashAutocomplete() { autocompleteEl.classList.add('hidden'); }

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideSlashAutocomplete();
  });

  document.addEventListener('click', e => {
    if (!autocompleteEl.contains(e.target) && e.target !== inputEl) hideSlashAutocomplete();
  });

  function injectSlashCommand(text) {
    inputEl.value = text;
    inputEl.focus();
    handleInputAutocomplete(text);
  }

  // ─── Streaming Chunks ──────────────────────────────────────────────────────
  let streamingMsgEl = null;

  function appendStreamChunk(chunk) {
    removeWelcome();
    if (!streamingMsgEl) {
      const div = el('div', 'message assistant');
      div.dataset.type = 'text';
      div.innerHTML = `
        <div class="msg-hdr">
          <div class="msg-avatar">🤖</div>
          <span class="msg-role">MY Coder</span>
          <span class="msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="msg-body" id="stream-body"></div>`;
      messagesEl.appendChild(div);
      streamingMsgEl = div.querySelector('#stream-body');
    }
    streamingMsgEl.textContent = (streamingMsgEl.textContent ?? '') + chunk;
    scrollBottom();
  }

  // Finalize streaming message with markdown rendering
  function finalizeStreamMsg() {
    if (!streamingMsgEl) return;
    streamingMsgEl.innerHTML = renderMarkdown(streamingMsgEl.textContent ?? '');
    streamingMsgEl.id = '';
    streamingMsgEl = null;
  }

  // ─── Todo Panel ────────────────────────────────────────────────────────────
  function renderTodosInPanel(todos) {
    const existing = $('todo-panel');
    if (existing) existing.remove();
    if (!todos?.length) return;

    const active = todos.filter(t => t.status !== 'done');
    if (!active.length) return;

    const panel = el('div');
    panel.id = 'todo-panel';
    panel.style.cssText = 'position:fixed;bottom:180px;right:12px;width:220px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:8px;z-index:50;box-shadow:var(--shadow-lg);';
    panel.innerHTML = `
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-muted);margin-bottom:6px;display:flex;align-items:center;justify-content:space-between">
        <span>📋 Tasks (${active.length})</span>
        <button onclick="document.getElementById('todo-panel').remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px">✕</button>
      </div>
      ${active.slice(0, 8).map(t => `
        <div style="display:flex;align-items:flex-start;gap:5px;margin-bottom:4px;font-size:10px">
          <button onclick="vscode.postMessage({type:'completeTodo',payload:'${t.id}'})" style="background:none;border:1px solid var(--border);border-radius:2px;width:12px;height:12px;flex-shrink:0;cursor:pointer;margin-top:1px"></button>
          <span style="color:var(--text)">${escHtml(t.text)}</span>
        </div>`).join('')}`;
    document.body.appendChild(panel);
  }

  // ─── Web Search Trigger ────────────────────────────────────────────────────
  function handleWebSearchTrigger(query) {
    post('webSearch', query);
    appendMessage({ role: 'user', content: `/search ${query}`, type: 'text', timestamp: Date.now() });
    setWaiting(true);
    updateStatusBar('working', 'Searching...');
  }

  // ─── @ Context hints in input ──────────────────────────────────────────────
  // Show hint when user types @ in input
  inputEl.addEventListener('keyup', e => {
    const val = inputEl.value;
    const lastAt = val.lastIndexOf('@');
    if (lastAt >= 0 && lastAt === val.length - 1) {
      showAtHint();
    } else {
      hideAtHint();
    }
  });

  function showAtHint() {
    let hint = $('at-hint');
    if (!hint) {
      hint = el('div');
      hint.id = 'at-hint';
      hint.style.cssText = 'position:absolute;bottom:100%;left:0;right:0;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 10px;font-size:10px;color:var(--text-muted);z-index:10';
      hint.innerHTML = '<strong>@-references:</strong> @file:path  @folder:src  @workspace  @symbol:MyClass  @prompt:name  @url:https://...';
      $('compose-wrap').style.position = 'relative';
      $('compose-wrap').appendChild(hint);
    }
  }

  function hideAtHint() { $('at-hint')?.remove(); }

  // ─── Active File Bar ────────────────────────────────────────────────────────
  function updateActiveFileBar(fileInfo) {
    var nameEl = $('active-file-name');
    var fixBtn  = $('af-fix');
    var bar     = $('active-file-bar');
    if (!nameEl) return;

    if (!fileInfo) {
      nameEl.textContent = 'No file open';
      nameEl.className = 'af-name';
      fixBtn.textContent = '🔴 Fix Issues';
      return;
    }

    nameEl.textContent = fileInfo.name;
    nameEl.className = 'af-name';

    if (fileInfo.errorCount > 0) {
      fixBtn.textContent = '🔴 Fix ' + fileInfo.errorCount + ' Error' + (fileInfo.errorCount > 1 ? 's' : '');
      fixBtn.style.color = 'var(--danger, #f44747)';
    } else if (fileInfo.warningCount > 0) {
      fixBtn.textContent = '⚠️ Fix ' + fileInfo.warningCount + ' Warning' + (fileInfo.warningCount > 1 ? 's' : '');
      fixBtn.style.color = 'var(--warning, #cca700)';
    } else {
      fixBtn.textContent = '✅ Optimise';
      fixBtn.style.color = '';
    }
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────
  init();
  // Load slash commands for autocomplete
  post('getSlashCommands');
  // Load todos
  post('getTodos');
})();

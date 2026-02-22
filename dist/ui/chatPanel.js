"use strict";
// src/ui/chatPanel.ts — MY Coder Chat Panel (persistent sidebar WebviewView)
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
exports.ChatPanel = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const aiService_1 = require("../ai/aiService");
const apiKeyValidator_1 = require("../ai/apiKeyValidator");
const plannerAgent_1 = require("../planning/plannerAgent");
const codeAgent_1 = require("../planning/codeAgent");
const fixAgent_1 = require("../planning/fixAgent");
const slashCommandRouter_1 = require("../agents/slashCommandRouter");
const contextResolver_1 = require("../agents/contextResolver");
const repoMapAgent_1 = require("../agents/repoMapAgent");
const securityScanner_1 = require("../tools/securityScanner");
const todoTracker_1 = require("../tools/todoTracker");
const gitOperations_1 = require("../tools/gitOperations");
const rulesLoader_1 = require("../tools/rulesLoader");
const parallelExecutor_1 = require("../tools/parallelExecutor");
const webSearchAgent_1 = require("../integrations/webSearchAgent");
const supabaseAgent_1 = require("../integrations/supabaseAgent");
const deploymentAgent_1 = require("../integrations/deploymentAgent");
const workspaceAnalyzer_1 = require("../core/workspaceAnalyzer");
const projectBuilder_1 = require("../core/projectBuilder");
const patchManager_1 = require("../core/patchManager");
const buildRunner_1 = require("../core/buildRunner");
const historyManager_1 = require("../storage/historyManager");
const interviewEngine_1 = require("../interview/interviewEngine");
// ─── Persistent Sidebar WebviewViewProvider ──────────────────────────────────
class ChatPanel {
    context;
    static viewType = 'my-coder.mainView';
    static instance;
    // The actual VS Code WebviewView (set when VS Code resolves it)
    view;
    // Compatibility shim so extension.ts can still call panel['panel'].webview.postMessage
    get panel() {
        if (this.view)
            return { webview: this.view.webview };
        return null;
    }
    historyManager;
    workspaceAnalyzer;
    projectBuilder;
    buildRunner;
    patchManager;
    todoTracker;
    repoMapAgent;
    aiService;
    interviewEngine;
    isRunning = false;
    pendingPatches = [];
    currentAnalysis;
    savedPrompts = [];
    cachedProjectRules = '';
    constructor(context) {
        this.context = context;
        this.historyManager = new historyManager_1.HistoryManager(context);
        this.workspaceAnalyzer = new workspaceAnalyzer_1.WorkspaceAnalyzer();
        this.projectBuilder = new projectBuilder_1.ProjectBuilder();
        this.buildRunner = new buildRunner_1.BuildRunner();
        this.patchManager = new patchManager_1.PatchManager(context.globalStorageUri.fsPath);
        this.todoTracker = new todoTracker_1.TodoTracker(context.globalState);
        this.repoMapAgent = new repoMapAgent_1.RepoMapAgent();
        ChatPanel.instance = this;
    }
    // Called by VS Code when the sidebar view becomes visible
    /** Called by extension.ts setApiKey command so the command-palette path also writes to SQLite. */
    saveApiKeyToDb(keyName, keyValue) {
        this.historyManager.saveApiKeyToDb(keyName, keyValue);
    }
    /** Called directly by extension.ts clearHistory command — works even when webview is not visible. */
    async clearHistory() {
        await this.historyManager.clearHistory();
        this.isRunning = false; // unblock if an op was mid-flight
        this.currentAnalysis = undefined;
        this.interviewEngine = undefined;
        this.pendingPatches = [];
        // Refresh UI if webview is currently open
        if (this.view) {
            await this.sendHistoryList();
            this.send({ type: 'sessionLoaded', payload: null });
        }
    }
    resolveWebviewView(webviewView, _context, _token) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
        };
        webviewView.webview.html = this.buildHtml();
        webviewView.webview.onDidReceiveMessage(this.onMessage.bind(this), undefined, this.context.subscriptions);
        // Re-initialize whenever view becomes visible again
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible)
                this.initialize();
        });
        setTimeout(() => this.initialize(), 300);
    }
    // ── Static factory (used by extension.ts) ──────────────────────────────────
    static createOrShow(context) {
        if (!ChatPanel.instance) {
            ChatPanel.instance = new ChatPanel(context);
        }
        // Focus the sidebar
        vscode.commands.executeCommand('my-coder.mainView.focus');
        return ChatPanel.instance;
    }
    static getInstance() {
        return ChatPanel.instance;
    }
    // ── Init ──────────────────────────────────────────────────────────────────
    async initialize() {
        await this.historyManager.initialize();
        await this.pushProviderStatus();
        const authStatus = await this.historyManager.getAuthStatus();
        this.send({ type: 'authStatus', payload: authStatus });
        await this.sendHistoryList();
        this.pushActiveFile(vscode.window.activeTextEditor);
        this.context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => this.pushActiveFile(editor)), vscode.languages.onDidChangeDiagnostics(e => {
            const editor = vscode.window.activeTextEditor;
            if (editor && e.uris.some(u => u.toString() === editor.document.uri.toString())) {
                this.pushActiveFile(editor);
            }
        }));
    }
    pushActiveFile(editor) {
        if (!editor) {
            this.send({ type: 'activeFile', payload: null });
            return;
        }
        const fname = editor.document.fileName.replace(/\\/g, '/').split('/').pop() ?? '';
        const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
        const errorCount = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
        const warningCount = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;
        this.send({ type: 'activeFile', payload: { name: fname, languageId: editor.document.languageId, errorCount, warningCount } });
    }
    // ── Message Router ────────────────────────────────────────────────────────
    async onMessage(msg) {
        try {
            switch (msg.type) {
                case 'sendMessage':
                    await this.routeUserInput(msg.payload);
                    break;
                case 'startNewApp':
                    await this.startNewAppMode();
                    break;
                case 'startWorkOnProject':
                    await this.startExistingProjectMode();
                    break;
                case 'signIn':
                    await this.doSignIn();
                    break;
                case 'signOut':
                    await this.doSignOut();
                    break;
                case 'loadHistory':
                    await this.sendHistoryList();
                    break;
                case 'loadSession':
                    await this.loadSession(msg.payload);
                    break;
                case 'deleteSession':
                    await this.deleteSession(msg.payload);
                    break;
                case 'renameSession':
                    await this.renameSession(msg.payload);
                    break;
                case 'clearHistory':
                    await this.clearAllHistory();
                    break;
                case 'setApiKey':
                    await this.saveApiKey(msg.payload);
                    break;
                case 'updateSettings':
                    await this.updateSettings(msg.payload);
                    break;
                case 'testConnection':
                    await this.handleTestConnection(msg.payload);
                    break;
                case 'detectOllamaModels':
                    await this.handleDetectOllama(msg.payload);
                    break;
                case 'applyDiff':
                    await this.applyPendingPatches();
                    break;
                case 'rejectDiff':
                    this.rejectPatches();
                    break;
                case 'cancelOperation':
                    this.isRunning = false;
                    break;
                case 'runSecurityScan':
                    await this.handleSecurityScan();
                    break;
                case 'getTodos':
                    this.send({ type: 'todos', payload: this.todoTracker.getAll() });
                    break;
                case 'completeTodo':
                    await this.todoTracker.markDone(msg.payload);
                    this.send({ type: 'todos', payload: this.todoTracker.getAll() });
                    break;
                case 'deleteTodo':
                    await this.todoTracker.delete(msg.payload);
                    this.send({ type: 'todos', payload: this.todoTracker.getAll() });
                    break;
                case 'getSlashCommands':
                    this.send({ type: 'slashCommands', payload: (0, slashCommandRouter_1.getSlashCommandList)() });
                    break;
                case 'webSearch':
                    await this.handleWebSearch(msg.payload);
                    break;
                case 'fixActiveFile':
                    await this.handleFixActiveFile();
                    break;
                case 'explainActiveFile':
                    await this.handleExplainActiveFile();
                    break;
                case 'reviewActiveFile':
                    await this.handleReviewActiveFile();
                    break;
            }
        }
        catch (err) {
            this.sendError(err instanceof Error ? err.message : String(err));
        }
    }
    // ── New App Mode ──────────────────────────────────────────────────────────
    async startNewAppMode() {
        const ai = await this.getAI();
        this.interviewEngine = new interviewEngine_1.InterviewEngine(ai);
        this.historyManager.createSession('new-app');
        const firstQuestion = this.interviewEngine.start();
        await this.addAssistantMessage(firstQuestion.question, 'interview', {
            phase: firstQuestion.phase,
            question: firstQuestion.question,
            options: firstQuestion.options,
            isMultiSelect: firstQuestion.isMultiSelect,
            isOptional: firstQuestion.isOptional,
            placeholder: firstQuestion.placeholder,
            progress: firstQuestion.progress,
        });
    }
    async handleInterviewAnswer(userInput) {
        if (!this.interviewEngine)
            return;
        const nextQuestion = await this.interviewEngine.submitAnswer(userInput);
        if (!nextQuestion) {
            await this.runNewAppPipeline();
            return;
        }
        await this.addAssistantMessage(nextQuestion.question, 'interview', {
            phase: nextQuestion.phase, question: nextQuestion.question,
            options: nextQuestion.options, isMultiSelect: nextQuestion.isMultiSelect,
            isOptional: nextQuestion.isOptional, placeholder: nextQuestion.placeholder,
            progress: nextQuestion.progress,
        });
    }
    async runNewAppPipeline() {
        if (this.isRunning || !this.interviewEngine)
            return;
        this.isRunning = true;
        try {
            const ai = await this.getAI();
            const interview = this.interviewEngine.buildInterview();
            const cfg = vscode.workspace.getConfiguration('myCoder');
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceRoot) {
                const rules = await (0, rulesLoader_1.loadProjectRules)(workspaceRoot);
                this.cachedProjectRules = rules.content;
            }
            this.sendProgress('🧠 Planning your project architecture...');
            const planner = new plannerAgent_1.PlannerAgent(ai);
            const plan = await planner.generatePlan(interview);
            await this.addAssistantMessage(planner.formatPlanSummary(plan), 'plan');
            await this.addAssistantMessage(`✅ Plan ready — **${plan.files.length} files** to generate.\nWhere should I create \`${interview.projectName}\`?`, 'text');
            const targetParent = await this.projectBuilder.promptForTargetDirectory();
            if (!targetParent) {
                await this.addAssistantMessage('Cancelled.', 'text');
                return;
            }
            const targetDir = this.projectBuilder.getTargetDir(targetParent, interview.projectName);
            this.sendProgress('📁 Creating project structure...');
            await this.projectBuilder.createProjectStructure(targetDir, plan);
            await this.projectBuilder.generateEnvFile(targetDir, plan);
            await this.projectBuilder.generateGitignore(targetDir, plan);
            if (interview.database === 'supabase') {
                this.sendProgress('🗄️ Generating Supabase schema...');
                const supabaseAgent = new supabaseAgent_1.SupabaseAgent(ai);
                const supabaseFiles = await supabaseAgent.generateFullSetup(interview);
                await this.projectBuilder.writeFile(targetDir, { path: 'supabase/migrations/001_initial.sql', content: supabaseFiles.migrationSql, language: 'sql' });
                await this.projectBuilder.writeFile(targetDir, { path: 'supabase/migrations/002_rls.sql', content: supabaseFiles.rlsSql, language: 'sql' });
                await this.projectBuilder.writeFile(targetDir, { path: 'lib/supabase/types.ts', content: supabaseFiles.typesTs, language: 'typescript' });
                await this.projectBuilder.writeFile(targetDir, { path: 'lib/supabase/client.ts', content: supabaseFiles.clientTs, language: 'typescript' });
                await this.projectBuilder.writeFile(targetDir, { path: 'lib/supabase/auth.ts', content: supabaseFiles.authHelpersTs, language: 'typescript' });
                for (const fn of supabaseFiles.edgeFunctions) {
                    await this.projectBuilder.writeFile(targetDir, { path: `supabase/functions/${fn.name}/index.ts`, content: fn.content, language: 'typescript' });
                }
            }
            const codeAgent = new codeAgent_1.CodeAgent(ai);
            const sorted = planner.sortFilesByDependency(plan.files);
            const concurrency = cfg.get('parallelFilesCount', 4);
            let done = 0;
            await (0, parallelExecutor_1.runParallel)(sorted.map(spec => async () => {
                const generated = await codeAgent.generateFile({ file: spec, plan, interview });
                await this.projectBuilder.writeFile(targetDir, generated);
                done++;
                this.sendProgress(`📝 (${done}/${sorted.length}) ${spec.path}`);
            }), { concurrency, onProgress: (c, t) => this.sendProgress(`📝 Generated ${c}/${t} files...`) });
            if (interview.deploymentTarget !== 'none') {
                this.sendProgress(`🚀 Generating ${interview.deploymentTarget} config...`);
                const deployAgent = new deploymentAgent_1.DeploymentAgent(ai);
                const deployFiles = await deployAgent.generateDeploymentConfig(interview, plan);
                for (const f of deployFiles.files) {
                    await this.projectBuilder.writeFile(targetDir, { path: f.path, content: f.content, language: 'yaml' });
                }
            }
            const git = new gitOperations_1.GitOperations(targetDir);
            if (!(await git.isGitRepo())) {
                this.sendProgress('📦 Initialising git...');
                await git.init();
            }
            if (cfg.get('autoRunBuild', true) && plan.buildInstructions.length > 0) {
                await this.runBuildWithAutoFix(targetDir, plan, ai);
            }
            await this.addAssistantMessage(`🎉 **\`${interview.projectName}\` created!**\n\n📂 \`${targetDir}\`\n\n\`\`\`bash\ncd ${interview.projectName}\n${plan.initCommands.slice(0, 3).join('\n')}\n\`\`\``, 'text');
            await this.projectBuilder.openProjectInVSCode(targetDir);
        }
        finally {
            this.isRunning = false;
        }
    }
    // ── Existing Project Mode ─────────────────────────────────────────────────
    async startExistingProjectMode() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) {
            this.sendError('No workspace folder open. Open a project folder first.');
            return;
        }
        const rootPath = folders[0].uri.fsPath;
        this.sendProgress('🔍 Analyzing your project...');
        try {
            const analysis = await this.workspaceAnalyzer.analyze(rootPath);
            this.currentAnalysis = analysis;
            this.historyManager.createSession('existing-project', rootPath);
            await this.addAssistantMessage(this.workspaceAnalyzer.formatAnalysisForDisplay(analysis), 'text');
            await this.addAssistantMessage(`✅ Ready to work on **${analysis.framework !== 'unknown' ? analysis.framework : 'your project'}**.\n\nWhat would you like me to do?`, 'text');
        }
        catch (err) {
            this.sendError(`Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async handleProjectRequest(userInput) {
        if (!this.currentAnalysis) {
            const folders = vscode.workspace.workspaceFolders;
            if (!folders?.length) {
                this.sendError('Please open a workspace folder first.');
                return;
            }
            this.sendProgress('🔍 Auto-detecting project...');
            this.currentAnalysis = await this.workspaceAnalyzer.analyze(folders[0].uri.fsPath);
        }
        if (this.isRunning) {
            await this.addAssistantMessage('⏳ Already working — please wait.', 'text');
            return;
        }
        this.isRunning = true;
        try {
            const ai = await this.getAI();
            const codeAgent = new codeAgent_1.CodeAgent(ai);
            const rootPath = this.currentAnalysis.rootPath;
            this.sendProgress('📖 Reading project files...');
            const allFiles = await this.workspaceAnalyzer.readWorkspaceFiles(rootPath, this.currentAnalysis.detectedFiles.slice(0, 30));
            if (allFiles.size === 0) {
                await this.addAssistantMessage('⚠️ Could not read project files.', 'text');
                return;
            }
            const relevant = this.selectRelevantFiles(userInput, allFiles);
            this.sendProgress(`🔧 Analysing ${relevant.size} file(s)...`);
            const fileChanges = new Map();
            for (const [filePath, originalContent] of relevant.entries()) {
                const newContent = await codeAgent.generatePatch(filePath, originalContent, userInput, this.currentAnalysis.projectStructure);
                if (newContent.trim() && newContent.trim() !== originalContent.trim())
                    fileChanges.set(filePath, newContent);
            }
            if (!fileChanges.size) {
                await this.addAssistantMessage('No file changes were needed.', 'text');
                return;
            }
            const patches = await this.patchManager.createPatches(rootPath, fileChanges);
            const meaningful = patches.filter(p => this.patchManager.hasMeaningfulChanges(p));
            if (!meaningful.length) {
                await this.addAssistantMessage('Generated changes were identical to original.', 'text');
                return;
            }
            const diffMd = meaningful.map(p => this.patchManager.formatDiffAsMarkdown(p)).join('\n\n');
            this.pendingPatches = meaningful;
            this.send({ type: 'diff', payload: { diff: diffMd, patches: meaningful } });
            await this.addAssistantMessage(`📋 Prepared **${meaningful.length}** change(s). Review the diff and click **✅ Apply** or **✕ Reject**.`, 'diff');
        }
        finally {
            this.isRunning = false;
        }
    }
    async applyPendingPatches() {
        if (!this.pendingPatches.length || !this.currentAnalysis)
            return;
        this.sendProgress('✍️ Applying changes...');
        const result = await this.patchManager.applyPatches(this.currentAnalysis.rootPath, this.pendingPatches);
        this.pendingPatches = [];
        if (!result.success) {
            this.sendError(result.errors.join('\n'));
            return;
        }
        await this.addAssistantMessage(`✅ Applied **${result.appliedPatches.length}** change(s).`, 'text');
        const cfg = vscode.workspace.getConfiguration('myCoder');
        if (cfg.get('autoRunBuild', true) && this.currentAnalysis.buildCommand) {
            const ai = await this.getAI();
            await this.runBuildWithAutoFix(this.currentAnalysis.rootPath, undefined, ai);
        }
    }
    rejectPatches() { this.pendingPatches = []; this.addAssistantMessage('Changes discarded.', 'text'); }
    // ── Build + Auto-fix ──────────────────────────────────────────────────────
    async runBuildWithAutoFix(rootPath, plan, ai) {
        const maxRetries = vscode.workspace.getConfiguration('myCoder').get('maxRetries', 3);
        const buildCmd = plan?.buildInstructions?.[0]?.command;
        const analysis = this.currentAnalysis ?? await this.workspaceAnalyzer.analyze(rootPath);
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            this.sendProgress(`🔨 Building... (attempt ${attempt}/${maxRetries})`);
            const buildResult = await this.buildRunner.run({ ...analysis, rootPath }, buildCmd, (line) => this.sendProgress(line.trim()));
            await this.addAssistantMessage(this.buildRunner.formatBuildResult(buildResult), 'build-result');
            if (buildResult.success)
                return;
            if (attempt >= maxRetries) {
                await this.addAssistantMessage('❌ Build failed after max retries.', 'error');
                return;
            }
            this.sendProgress(`🤖 Auto-fixing errors (attempt ${attempt})...`);
            const fileContents = await this.workspaceAnalyzer.readWorkspaceFiles(rootPath, analysis.detectedFiles.slice(0, 15));
            const fixPlan = await (0, fixAgent_1.analyzeBuildErrorsAndFix)(buildResult, fileContents, analysis, attempt, ai);
            await this.addAssistantMessage(`**Auto-fix:** ${fixPlan.analysis}`, 'text');
            for (const [filePath, content] of Object.entries(fixPlan.fixes)) {
                try {
                    await fs.writeFile(`${rootPath}/${filePath}`, content, 'utf-8');
                }
                catch { }
            }
        }
    }
    // ── General Chat ──────────────────────────────────────────────────────────
    async handleGeneralChat(userInput) {
        const ai = await this.getAI();
        const messages = this.historyManager.getAIMessages();
        this.sendProgress('Thinking...');
        const response = await ai.complete(messages, 'You are MY Coder, an expert AI developer assistant inside VS Code.');
        await this.addAssistantMessage(response.content, 'text');
    }
    // ── Route User Input ──────────────────────────────────────────────────────
    async routeUserInput(userInput) {
        if (!userInput?.trim())
            return;
        // Ensure there is an active session before adding messages
        if (!this.historyManager.getCurrentSession()) {
            this.historyManager.createSession('chat');
        }
        await this.historyManager.addMessage({ role: 'user', content: userInput, type: 'text', timestamp: Date.now() });
        const session = this.historyManager.getCurrentSession();
        const slashCmd = (0, slashCommandRouter_1.parseSlashCommand)(userInput);
        if (slashCmd) {
            await this.handleSlashCommand(slashCmd.command, slashCmd.request);
            return;
        }
        let resolvedInput = userInput;
        if ((0, contextResolver_1.hasContextReferences)(userInput)) {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
            const cfg = vscode.workspace.getConfiguration('myCoder');
            const tavilyKey = cfg.get('tavilyApiKey') ?? undefined;
            const resolved = await (0, contextResolver_1.resolveContextReferences)(userInput, workspaceRoot, this.savedPrompts, tavilyKey);
            resolvedInput = resolved.resolvedMessage;
            if (resolved.injectedFiles.length)
                this.sendProgress(`📎 Context: ${resolved.injectedFiles.join(', ')}`);
        }
        if (session?.mode === 'new-app' && this.interviewEngine && !this.interviewEngine.isComplete()) {
            await this.handleInterviewAnswer(userInput);
            return;
        }
        if (session?.mode === 'existing-project') {
            await this.handleProjectRequest(resolvedInput);
            return;
        }
        await this.handleGeneralChat(resolvedInput);
    }
    // ── Auth — Google Sign-In via VS Code built-in OAuth ─────────────────────
    async doSignIn() {
        try {
            this.sendProgress('Opening Google sign-in...');
            // Use VS Code's built-in authentication (no OAuth credentials needed by the user)
            const session = await vscode.authentication.getSession('microsoft', // fallback: use GitHub auth if google is unavailable
            ['https://www.googleapis.com/auth/drive.appdata'], { createIfNone: true });
            if (session) {
                // Store token for drive access
                await this.context.secrets.store('my-coder.google-access-token', session.accessToken);
                await this.context.secrets.store('my-coder.google-email', session.account.label);
                await this.context.secrets.store('my-coder.google-name', session.account.label);
            }
            const status = await this.historyManager.getAuthStatus();
            this.send({ type: 'authStatus', payload: status });
            vscode.window.showInformationMessage(`✅ Signed in as ${session?.account.label ?? 'user'}`);
        }
        catch (err) {
            // Try Google via GitHub auth provider as fallback, or prompt manual setup
            await this.doSignInFallback();
        }
    }
    async doSignInFallback() {
        // Check if OAuth credentials exist (user-provided)
        const clientId = await this.context.secrets.get('my-coder.google-client-id-key');
        const clientSecret = await this.context.secrets.get('my-coder.google-client-secret-key');
        if (clientId && clientSecret) {
            // We have user-provided OAuth credentials — use them
            try {
                const status = await this.historyManager.signInWithGoogle();
                this.send({ type: 'authStatus', payload: status });
                vscode.window.showInformationMessage(`✅ Signed in to Google Drive as ${status.userEmail}`);
                return;
            }
            catch (err) {
                this.sendError(`Sign-in failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        // No credentials — offer options
        const choice = await vscode.window.showInformationMessage('Google Drive sync requires OAuth 2.0 credentials.', 'Set Up Credentials', 'Use Local Storage', 'Cancel');
        if (choice === 'Set Up Credentials') {
            vscode.env.openExternal(vscode.Uri.parse('https://console.cloud.google.com/apis/credentials'));
            vscode.window.showInformationMessage('Steps: 1) Create project, 2) Enable Google Drive API, 3) Create OAuth 2.0 Desktop credentials, 4) Run "MY Coder: Set API Key" → choose "Google Drive (OAuth ID)" and "Google Drive (OAuth Secret)"', { modal: true });
        }
        else if (choice === 'Use Local Storage') {
            vscode.window.showInformationMessage('Using local storage for chat history.');
        }
        this.send({ type: 'authStatus', payload: await this.historyManager.getAuthStatus() });
    }
    async doSignOut() {
        await this.historyManager.signOut();
        this.send({ type: 'authStatus', payload: await this.historyManager.getAuthStatus() });
        await this.addAssistantMessage('Signed out. History stored locally.', 'text');
    }
    // ── Settings & Keys ───────────────────────────────────────────────────────
    async saveApiKey(payload) {
        const provider = payload.provider;
        const validation = (0, apiKeyValidator_1.validateApiKey)(payload.apiKey, provider);
        if (!validation.valid) {
            this.sendError(validation.message);
            return;
        }
        // Save to VS Code SecretStorage (encrypted, per-machine)
        await this.context.secrets.store(`my-coder.${provider}-key`, payload.apiKey);
        // Also save to SQLite so it travels with Drive sync
        this.historyManager.saveApiKeyToDb(`my-coder.${provider}-key`, payload.apiKey);
        this.aiService = undefined;
        await this.pushProviderStatus();
    }
    async renameSession(payload) {
        try {
            await this.historyManager.renameSession(payload.id, payload.title);
            // If this is the active session, the in-memory title is already updated by historyManager
            // Re-send the history list so the sidebar reflects the new name
            await this.sendHistoryList();
        }
        catch (e) {
            console.error('[MY Coder] renameSession failed:', e);
        }
    }
    async updateSettings(payload) {
        const cfg = vscode.workspace.getConfiguration('myCoder');
        await cfg.update('aiProvider', payload.provider, vscode.ConfigurationTarget.Global);
        await cfg.update('model', payload.model, vscode.ConfigurationTarget.Global);
        if (payload.baseUrl !== undefined)
            await cfg.update('customBaseUrl', payload.baseUrl || '', vscode.ConfigurationTarget.Global);
        this.aiService = undefined;
        await this.pushProviderStatus();
    }
    async handleTestConnection(payload) {
        const validation = (0, apiKeyValidator_1.validateApiKey)(payload.apiKey, payload.provider);
        if (!validation.valid) {
            this.send({ type: 'connectionTestResult', payload: { ok: false, latencyMs: 0, error: validation.message } });
            return;
        }
        try {
            const testService = aiService_1.AIService.createForTest({ provider: payload.provider, model: payload.model, apiKey: payload.apiKey || 'ollama', baseUrl: payload.baseUrl });
            const result = await testService.testConnection();
            this.send({ type: 'connectionTestResult', payload: result });
        }
        catch (err) {
            this.send({ type: 'connectionTestResult', payload: { ok: false, latencyMs: 0, error: String(err) } });
        }
    }
    async handleDetectOllama(customBaseUrl) {
        const models = await aiService_1.AIService.fetchOllamaModels(customBaseUrl ?? undefined);
        this.send({ type: 'ollamaModels', payload: models });
    }
    async pushProviderStatus() {
        const cfg = vscode.workspace.getConfiguration('myCoder');
        const provider = (cfg.get('aiProvider')) ?? 'openai';
        const model = cfg.get('model') ?? aiService_1.PROVIDER_REGISTRY[provider].defaultModel;
        const hasKey = provider === 'ollama' || !!(await this.context.secrets.get(`my-coder.${provider}-key`));
        const status = { provider, model, connected: hasKey };
        this.send({ type: 'providerStatus', payload: status });
    }
    // ── History ───────────────────────────────────────────────────────────────
    async sendHistoryList() {
        try {
            const sessions = await this.historyManager.listSessions();
            const authStatus = await this.historyManager.getAuthStatus();
            this.send({ type: 'historyList', payload: { sessions, authStatus } });
        }
        catch (e) {
            console.error('[MY Coder] sendHistoryList failed:', e);
            // Send empty list so UI doesn't stay stale
            this.send({ type: 'historyList', payload: { sessions: [], authStatus: { isSignedIn: false } } });
        }
    }
    async loadSession(sessionId) {
        const session = await this.historyManager.loadSession(sessionId);
        this.send({ type: 'sessionLoaded', payload: session });
    }
    async deleteSession(sessionId) {
        const wasCurrent = this.historyManager.getCurrentSession()?.id === sessionId;
        try {
            await this.historyManager.deleteSession(sessionId);
        }
        catch (e) {
            // ignore — session may not exist
        }
        // If the deleted session was active, reset all panel state
        if (wasCurrent) {
            this.isRunning = false; // unblock if an op was mid-flight
            this.pendingPatches = []; // discard any orphaned patches
            this.currentAnalysis = undefined;
            this.interviewEngine = undefined;
            this.send({ type: 'sessionLoaded', payload: null });
        }
        // Always refresh the session list after delete
        await this.sendHistoryList();
    }
    async clearAllHistory() {
        try {
            await this.historyManager.clearHistory();
        }
        catch (e) {
            // ignore errors
        }
        this.isRunning = false; // unblock if an op was mid-flight
        this.currentAnalysis = undefined;
        this.interviewEngine = undefined;
        this.pendingPatches = [];
        // Reload the empty history list
        await this.sendHistoryList();
        // Signal webview to clear messages
        this.send({ type: 'sessionLoaded', payload: null });
    }
    // ── Slash Commands ────────────────────────────────────────────────────────
    async handleSlashCommand(command, request) {
        if (this.isRunning)
            return;
        this.isRunning = true;
        try {
            const ai = await this.getAI();
            const task = (0, slashCommandRouter_1.buildAgentTask)(command, request);
            let fileContext = '';
            if (task.requiresFiles && this.currentAnalysis) {
                const files = await this.workspaceAnalyzer.readWorkspaceFiles(this.currentAnalysis.rootPath, this.currentAnalysis.detectedFiles.slice(0, 12));
                fileContext = Array.from(files.entries()).map(([p, c]) => `=== ${p} ===\n${c.slice(0, 2000)}`).join('\n\n');
            }
            if (task.requiresWebSearch) {
                await this.handleWebSearch(request || command);
                return;
            }
            this.sendProgress(`${command} agent running...`);
            const result = await (0, slashCommandRouter_1.executeSlashCommand)(task, fileContext, ai, (chunk) => {
                this.send({ type: 'streamChunk', payload: chunk });
            });
            await this.addAssistantMessage(result.content, 'text');
            const cfg = vscode.workspace.getConfiguration('myCoder');
            if (cfg.get('todoAutoSync', true) && result.todos?.length) {
                await this.todoTracker.syncFromMarkdown(result.content);
                this.send({ type: 'todos', payload: this.todoTracker.getAll() });
            }
        }
        finally {
            this.isRunning = false;
        }
    }
    // ── Security Scan ─────────────────────────────────────────────────────────
    async handleSecurityScan() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) {
            this.sendError('No workspace open.');
            return;
        }
        this.sendProgress('🔒 Running security scan...');
        const report = await (0, securityScanner_1.scanWorkspaceSecurity)(folders[0].uri.fsPath);
        await this.addAssistantMessage(report.summary, 'text');
    }
    // ── Web Search ────────────────────────────────────────────────────────────
    async handleWebSearch(query) {
        const cfg = vscode.workspace.getConfiguration('myCoder');
        const tavilyKey = cfg.get('tavilyApiKey');
        if (!tavilyKey) {
            await this.addAssistantMessage('🔍 Web search requires a Tavily API key. Get one free at https://tavily.com, then save it in ⚙️ Settings.', 'text');
            return;
        }
        this.sendProgress(`🔍 Searching: "${query}"...`);
        try {
            const agent = new webSearchAgent_1.TavilySearchAgent(tavilyKey);
            const results = await agent.search(query, 5, 'basic');
            const formatted = webSearchAgent_1.TavilySearchAgent.formatResultsAsMarkdown(results);
            await this.addAssistantMessage(formatted, 'text');
        }
        catch (err) {
            this.sendError(`Web search failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    // ── Active File Actions ───────────────────────────────────────────────────
    async handleFixActiveFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this.sendError('No active file.');
            return;
        }
        if (this.isRunning)
            return;
        this.isRunning = true;
        try {
            const document = editor.document;
            const filePath = document.fileName;
            const fileContent = document.getText();
            const language = document.languageId;
            const diagnostics = vscode.languages.getDiagnostics(document.uri);
            const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
            const warnings = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning);
            const problemLines = [];
            for (const d of [...errors, ...warnings].slice(0, 20)) {
                const line = d.range.start.line + 1;
                const sev = d.severity === vscode.DiagnosticSeverity.Error ? 'ERROR' : 'WARNING';
                const code = d.code ? ` [${d.code}]` : '';
                problemLines.push(`${sev}${code} at line ${line} — ${d.message}`);
            }
            const selection = editor.selection;
            const selectedText = selection.isEmpty ? '' : document.getText(selection);
            const ai = await this.getAI();
            if (!diagnostics.length && !selectedText) {
                await this.addAssistantMessage(`🔍 No errors detected. Running general review...`, 'text');
            }
            else if (diagnostics.length) {
                await this.addAssistantMessage(`🔴 Found **${errors.length} error(s)** and **${warnings.length} warning(s)**. Generating fixes...`, 'text');
            }
            this.sendProgress(`🤖 Analysing \`${this.shortPath(filePath)}\`...`);
            const problemDesc = problemLines.length
                ? `Fix these issues:\n${problemLines.join('\n')}`
                : selectedText ? `Fix or improve:\n\`\`\`${language}\n${selectedText}\n\`\`\`` : `Review and fix any issues`;
            const codeAgent = new codeAgent_1.CodeAgent(ai);
            const fixedContent = await codeAgent.generatePatch(filePath, fileContent, problemDesc, `File: ${filePath}\nLanguage: ${language}`);
            if (fixedContent.trim() === fileContent.trim()) {
                await this.addAssistantMessage(`✅ \`${this.shortPath(filePath)}\` looks good — no changes needed.`, 'text');
                return;
            }
            const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? path.dirname(filePath);
            const relPath = path.relative(workspaceRoot, filePath);
            const patches = await this.patchManager.createPatches(workspaceRoot, new Map([[relPath, fixedContent]]));
            const meaningful = patches.filter(p => this.patchManager.hasMeaningfulChanges(p));
            if (!meaningful.length) {
                await this.addAssistantMessage('✅ No meaningful changes.', 'text');
                return;
            }
            this.pendingPatches = meaningful;
            this.currentAnalysis = this.currentAnalysis ?? { rootPath: workspaceRoot, framework: 'unknown', language, packageManager: 'npm', entryPoints: [], configFiles: [], projectStructure: '', detectedFiles: [relPath] };
            const diffMd = meaningful.map(p => this.patchManager.formatDiffAsMarkdown(p)).join('\n\n');
            this.send({ type: 'diff', payload: { diff: diffMd, patches: meaningful } });
            await this.addAssistantMessage(`🛠 Fixed **${problemLines.length || 1}** issue(s). Review the diff and click **✅ Apply** to save.`, 'diff');
        }
        finally {
            this.isRunning = false;
        }
    }
    async handleExplainActiveFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this.sendError('No active file.');
            return;
        }
        if (this.isRunning)
            return;
        this.isRunning = true;
        try {
            const document = editor.document;
            const selection = editor.selection;
            const content = selection.isEmpty ? document.getText().slice(0, 6000) : document.getText(selection);
            const label = selection.isEmpty ? `\`${this.shortPath(document.fileName)}\`` : `selected code in \`${this.shortPath(document.fileName)}\``;
            this.sendProgress(`💡 Explaining ${label}...`);
            const ai = await this.getAI();
            const response = await ai.streamComplete([{ role: 'user', content: `Explain this ${document.languageId} code:\n\n\`\`\`${document.languageId}\n${content}\n\`\`\`` }], `You are a senior engineer explaining code clearly.`, (chunk) => this.send({ type: 'streamChunk', payload: chunk }));
            await this.addAssistantMessage(response, 'text');
        }
        finally {
            this.isRunning = false;
        }
    }
    async handleReviewActiveFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this.sendError('No active file.');
            return;
        }
        if (this.isRunning)
            return;
        this.isRunning = true;
        try {
            const document = editor.document;
            const content = document.getText().slice(0, 8000);
            const filePath = this.shortPath(document.fileName);
            this.sendProgress(`🔍 Reviewing \`${filePath}\`...`);
            const ai = await this.getAI();
            const slashTask = (0, slashCommandRouter_1.buildAgentTask)('/review', `Review this file: \`\`\`${document.languageId}\n${content}\n\`\`\``);
            const result = await (0, slashCommandRouter_1.executeSlashCommand)(slashTask, '', ai, (chunk) => this.send({ type: 'streamChunk', payload: chunk }));
            await this.addAssistantMessage(result.content, 'text');
        }
        finally {
            this.isRunning = false;
        }
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    async getAI() {
        if (!this.aiService) {
            // Pass the SQLite key getter as fallback for Drive-synced keys
            const sqliteGetKey = (name) => this.historyManager.getApiKeyFromDb(name);
            this.aiService = await aiService_1.AIService.createFromVSCodeConfig(this.context, sqliteGetKey);
        }
        return this.aiService;
    }
    async addAssistantMessage(content, type, metadata) {
        const msg = await this.historyManager.addMessage({ role: 'assistant', content, type, timestamp: Date.now(), metadata });
        this.send({ type: 'message', payload: msg });
    }
    send(msg) {
        this.view?.webview.postMessage(msg);
    }
    sendProgress(text) { this.send({ type: 'progress', payload: text }); }
    sendError(message) { this.send({ type: 'error', payload: message }); }
    shortPath(filePath) { return filePath.replace(/\\/g, '/').split('/').slice(-2).join('/'); }
    selectRelevantFiles(request, files) {
        const STOP_WORDS = new Set(['this', 'that', 'with', 'from', 'have', 'will', 'your', 'file', 'code', 'function', 'const', 'return']);
        const keywords = (request.toLowerCase().match(/\b[a-z]\w{3,}\b/g) ?? []).filter(w => !STOP_WORDS.has(w));
        const ENTRY_PATTERNS = [/index\.[jt]sx?$/, /app\.[jt]sx?$/, /main\.[jt]sx?$/, /server\.[jt]sx?$/, /route[s]?\./i, /api\//i, /layout\.[jt]sx?$/];
        const scores = new Map();
        for (const [filePath, content] of files.entries()) {
            let score = 0;
            const lowerPath = filePath.toLowerCase();
            const lowerContent = content.toLowerCase().slice(0, 3000);
            for (const kw of keywords) {
                if (lowerPath.includes(kw))
                    score += 3;
                score += Math.min((lowerContent.match(new RegExp(kw, 'g')) ?? []).length, 5);
            }
            if (ENTRY_PATTERNS.some(p => p.test(lowerPath)))
                score += 2;
            if (score > 0)
                scores.set(filePath, score);
        }
        const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
        if (sorted.length > 0) {
            const result = new Map();
            for (const [fp] of sorted) {
                const c = files.get(fp);
                if (c !== undefined)
                    result.set(fp, c);
            }
            return result;
        }
        const fallback = new Map();
        for (const [fp, content] of files.entries()) {
            if (ENTRY_PATTERNS.some(p => p.test(fp.toLowerCase())))
                fallback.set(fp, content);
        }
        let i = 0;
        for (const [fp, content] of files.entries()) {
            if (fallback.size + i >= 5)
                break;
            if (!fallback.has(fp)) {
                fallback.set(fp, content);
                i++;
            }
        }
        return fallback;
    }
    // ── HTML Shell ────────────────────────────────────────────────────────────
    buildHtml() {
        const wv = this.view.webview;
        const nonce = require('crypto').randomBytes(16).toString('base64');
        const scriptUri = wv.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webviewScript.js'));
        const styleUri = wv.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'styles.css'));
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${wv.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"/>
  <link href="${styleUri}" rel="stylesheet"/>
  <title>MY Coder</title>
</head>
<body>
<div id="app">
  <header id="titlebar">
    <span class="tb-logo">🤖</span>
    <span class="tb-name">MY Coder</span>
    <button class="provider-pill" id="provider-pill">
      <span class="p-dot off" id="p-dot"></span>
      <span id="provider-label">Configuring...</span>
    </button>
    <div class="tb-spacer"></div>
    <div class="tb-actions">
      <button class="tb-btn" id="btn-clear" title="Clear history">🗑</button>
      <button class="tb-btn" id="btn-settings" title="Settings">⚙️</button>
    </div>
  </header>

  <div id="sidebar-hdr">Explorer</div>

  <aside id="sidebar">
    <div id="mode-selector">
      <button class="mode-btn" id="btn-new-app">
        <span class="mode-icon">✨</span>
        <div class="mode-text"><span class="mode-label">New App</span><span class="mode-desc">AI-guided creation</span></div>
      </button>
      <button class="mode-btn" id="btn-existing">
        <span class="mode-icon">🔧</span>
        <div class="mode-text"><span class="mode-label">Existing Project</span><span class="mode-desc">Analyze &amp; modify</span></div>
      </button>
    </div>

    <div id="sessions-section">
      <div class="section-hdr">
        <span>Sessions</span>
        <button class="new-session-btn" id="btn-new-session" title="New session">＋</button>
      </div>
      <div id="session-list"><div class="empty-state">No sessions yet</div></div>
    </div>

    <div id="sidebar-footer">
      <div class="auth-row">
        <div class="auth-avatar" id="auth-avatar">?</div>
        <div class="auth-info">
          <div class="auth-name" id="auth-name">Not signed in</div>
          <div class="auth-sub" id="auth-sub">💾 Local storage</div>
        </div>
      </div>
      <div class="sb-actions">
        <button class="sb-btn primary" id="btn-sign-in">Sign in with Google</button>
        <button class="sb-btn hidden" id="btn-sign-out">Sign out</button>
      </div>
    </div>
  </aside>

  <div id="main-hdr">
    <div class="tab-bar" id="tab-bar">
      <div class="tab active"><span>💬</span> Chat</div>
    </div>
  </div>

  <main id="main">
    <div id="messages"></div>
  </main>

  <footer id="footer">
    <div id="diff-bar" class="hidden">
      <span class="diff-lbl">Review changes:</span>
      <strong class="diff-files" id="diff-files">0 files</strong>
      <button class="btn btn-primary btn-sm" id="diff-apply">✅ Apply</button>
      <button class="btn btn-ghost btn-sm" id="diff-reject">✕ Reject</button>
    </div>
    <div id="active-file-bar">
      <span id="active-file-name" class="af-name">No file open</span>
      <div class="af-actions">
        <button class="af-btn" id="af-fix"     title="Detect &amp; fix issues">🔴 Fix Issues</button>
        <button class="af-btn" id="af-review"  title="Review active file">🔍 Review</button>
        <button class="af-btn" id="af-explain" title="Explain active file">💡 Explain</button>
      </div>
    </div>
    <div id="compose">
      <div id="compose-wrap">
        <textarea id="input" placeholder="Ask anything, or type / for commands..." rows="1"></textarea>
      </div>
      <button id="send-btn" title="Send (Enter)">➤</button>
    </div>
    <div id="status-bar">
      <div class="status-item">
        <div class="status-dot ready" id="status-dot"></div>
        <span id="status-text">Ready</span>
      </div>
      <div class="status-item" style="margin-left:auto">
        <span id="model-label" style="font-family:monospace;font-size:10px;color:var(--text-subtle)"></span>
      </div>
    </div>
  </footer>
</div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}
exports.ChatPanel = ChatPanel;
//# sourceMappingURL=chatPanel.js.map
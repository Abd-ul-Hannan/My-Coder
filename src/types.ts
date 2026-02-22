// src/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared types for the entire MY Coder extension.
// Rule: NO business logic here. Pure type declarations only.
// ─────────────────────────────────────────────────────────────────────────────

// ═══ AI PROVIDERS ════════════════════════════════════════════════════════════

export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'gemini'
  | 'mistral'
  | 'ollama'
  | 'openrouter'
  | 'perplexity'
  | 'custom';

/** Prefix patterns that identify a provider from its API key string */
export type ApiKeyPrefix = 'sk-ant-' | 'sk-or-' | 'sk-' | 'gsk_' | 'AIza' | 'None';

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIServiceConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
  /** Override endpoint — used for Ollama, LM Studio, self-hosted, etc. */
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  provider: AIProvider;
  model: string;
  error?: string;
}

/** Result of API key validation before initializing AIService */
export interface KeyValidationResult {
  valid: boolean;
  detectedProvider: AIProvider | null;
  mismatch: boolean;
  message: string;
}

// ═══ PROJECT TYPES ════════════════════════════════════════════════════════════

export type ProjectType = 'web' | 'mobile' | 'backend' | 'cli' | 'desktop' | 'fullstack';

/**
 * High-level category used to tailor interview questions and plan generation.
 * The AI infers this from the user's initial free-text intent description.
 */
export type AppCategory =
  | 'ecommerce'
  | 'dashboard'
  | 'blog'
  | 'ai-tool'
  | 'saas'
  | 'portfolio'
  | 'game'
  | 'api-service'
  | 'mobile-app'
  | 'cli-tool'
  | 'custom';

export type Framework =
  | 'react' | 'nextjs' | 'vue' | 'nuxt' | 'angular' | 'svelte'
  | 'express' | 'fastify' | 'nestjs' | 'hono'
  | 'flutter' | 'react-native' | 'expo'
  | 'electron' | 'tauri'
  | 'none';

export type Database =
  | 'postgresql' | 'mysql' | 'mongodb' | 'sqlite'
  | 'supabase' | 'firebase' | 'redis' | 'none';

export type DeploymentTarget =
  | 'vercel' | 'netlify' | 'aws' | 'gcp' | 'azure'
  | 'docker' | 'railway' | 'fly' | 'none';

export type Language = 'typescript' | 'javascript' | 'python' | 'dart' | 'rust' | 'go';

export type AuthProvider = 'jwt' | 'oauth' | 'session' | 'clerk' | 'auth0' | 'supabase-auth';

// ═══ INTERVIEW STATE MACHINE ══════════════════════════════════════════════════

/**
 * The interview flows through these states in order.
 * Each state maps to exactly one question asked to the user.
 */
export type InterviewPhase =
  | 'intent'
  | 'refinement'
  | 'stack-selection'
  | 'database'           // ← Added: ask DB after framework is locked
  | 'auth'
  | 'deployment'
  | 'features'
  | 'confirmation'
  | 'finalized';

/** Partial answers accumulated across interview phases */
export interface InterviewAnswers {
  rawIntent?: string;
  projectName?: string;
  projectType?: ProjectType;
  appCategory?: AppCategory;
  framework?: Framework;
  language?: Language;
  database?: Database;
  authRequired?: boolean;
  authProvider?: AuthProvider;
  deploymentTarget?: DeploymentTarget;
  features?: string[];
  additionalNotes?: string;
}

/** What the AI infers from the user's initial intent description */
export interface InferredIntent {
  projectName: string;
  projectType: ProjectType;
  appCategory: AppCategory;
  suggestedFramework: Framework;
  suggestedDatabase: Database;
  suggestedLanguage: Language;
  inferredFeatures: string[];
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

/** A single interview question with all rendering metadata */
export interface InterviewQuestion {
  phase: InterviewPhase;
  question: string;
  options?: InterviewOption[];
  isMultiSelect?: boolean;
  isOptional?: boolean;
  placeholder?: string;
  /** 0–100, shown as a progress bar in the webview */
  progress: number;
}

export interface InterviewOption {
  value: string;
  label: string;
  description?: string;
  isRecommended?: boolean;
}

/** Final assembled interview, passed to PlannerAgent */
export interface ProjectInterview {
  projectName: string;
  projectType: ProjectType;
  appCategory: AppCategory;
  framework: Framework;
  language: Language;
  database: Database;
  authRequired: boolean;
  authProvider?: AuthProvider;
  deploymentTarget: DeploymentTarget;
  features: string[];
  additionalNotes?: string;
}

// ═══ PLANNING ══════════════════════════════════════════════════════════════════

export interface FileSpec {
  path: string;
  description: string;
  dependencies?: string[];
  isEntryPoint?: boolean;
}

export interface DependencySpec {
  name: string;
  version: string;
  isDev: boolean;
}

export interface BuildInstruction {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
}

export interface EnvVariable {
  key: string;
  description: string;
  required: boolean;
  example?: string;
}

export interface DevelopmentPlan {
  projectName: string;
  projectType: ProjectType;
  appCategory: AppCategory;
  framework: Framework;
  folderStructure: string[];
  files: FileSpec[];
  dependencies: DependencySpec[];
  devDependencies: DependencySpec[];
  buildInstructions: BuildInstruction[];
  initCommands: string[];
  envVariables: EnvVariable[];
  readme: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
  language: string;
}

export interface CodeGenerationRequest {
  file: FileSpec;
  plan: DevelopmentPlan;
  interview: ProjectInterview;
  existingFiles?: string[];
}

// ═══ BROWNFIELD / EXISTING PROJECT ════════════════════════════════════════════

export interface WorkspaceAnalysis {
  rootPath: string;
  framework: Framework | 'unknown';
  language: string;
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'pip' | 'pub' | 'cargo' | 'go' | 'none';
  entryPoints: string[];
  configFiles: string[];
  buildCommand?: string;
  testCommand?: string;
  projectStructure: string;
  detectedFiles: string[];
  packageJson?: Record<string, unknown>;
}

export interface FilePatch {
  filePath: string;
  originalContent: string;
  newContent: string;
  diff: string;
  backupPath?: string;
}

export interface PatchResult {
  success: boolean;
  appliedPatches: FilePatch[];
  failedPatches: FilePatch[];
  errors: string[];
}

// ═══ BUILD ══════════════════════════════════════════════════════════════════════

export interface BuildResult {
  success: boolean;
  output: string;
  errors: BuildError[];
  warnings: BuildWarning[];
  exitCode: number;
  duration: number;
}

export interface BuildError {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  code?: string;
  severity: 'error' | 'fatal';
}

export interface BuildWarning {
  file?: string;
  line?: number;
  message: string;
}

// ═══ CHAT & HISTORY ════════════════════════════════════════════════════════════

export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageType =
  | 'text'
  | 'plan'
  | 'code'
  | 'diff'
  | 'build-result'
  | 'error'
  | 'progress'
  | 'interview';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  type: MessageType;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  mode: 'new-app' | 'existing-project' | 'chat';
  messages: ChatMessage[];
  projectPath?: string;
  plan?: DevelopmentPlan;
}

// ═══ STORAGE ════════════════════════════════════════════════════════════════════

export interface HistoryProvider {
  saveSession(session: ChatSession): Promise<void>;
  loadSession(sessionId: string): Promise<ChatSession | null>;
  listSessions(): Promise<SessionSummary[]>;
  deleteSession(sessionId: string): Promise<void>;
  clearAll(): Promise<void>;
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  mode: ChatSession['mode'];
  messageCount: number;
}

// ═══ WEBVIEW MESSAGING ══════════════════════════════════════════════════════════

/** Messages FROM the webview TO the extension */
export type WebviewMessageType =
  | 'sendMessage'
  | 'startNewApp'
  | 'startWorkOnProject'
  | 'signIn'
  | 'signOut'
  | 'loadHistory'
  | 'loadSession'
  | 'deleteSession'
  | 'renameSession'
  | 'clearHistory'
  | 'setApiKey'
  | 'updateSettings'
  | 'testConnection'
  | 'detectOllamaModels'
  | 'cancelOperation'
  | 'applyDiff'
  | 'rejectDiff'
  | 'runSecurityScan'
  | 'getTodos'
  | 'completeTodo'
  | 'deleteTodo'
  | 'getSlashCommands'
  | 'webSearch'
  | 'fixActiveFile'
  | 'explainActiveFile'
  | 'reviewActiveFile';

/** Messages FROM the extension TO the webview */
export type ExtensionMessageType =
  | 'message'
  | 'progress'
  | 'plan'
  | 'diff'
  | 'buildResult'
  | 'historyList'
  | 'sessionLoaded'
  | 'authStatus'
  | 'providerStatus'
  | 'connectionTestResult'
  | 'ollamaModels'
  | 'error'
  | 'ready'
  | 'operationComplete';

export interface WebviewMessage {
  type: WebviewMessageType;
  payload?: unknown;
}

export interface ExtensionMessage {
  type: ExtensionMessageType;
  payload?: unknown;
}

export interface AuthStatus {
  isSignedIn: boolean;
  userEmail?: string;
  userName?: string;
  storageType: 'local' | 'drive';
}

export interface ProviderStatus {
  provider: AIProvider;
  model: string;
  connected: boolean;
  baseUrl?: string;
}

// ═══ INTEGRATIONS ════════════════════════════════════════════════════════════

export interface IntegrationConfig {
  tavilyApiKey?: string;
  pexelsApiKey?: string;
  perplexityApiKey?: string;
  googleAnalyticsId?: string;
}

export interface TodoItem {
  id: string;
  text: string;
  status: 'pending' | 'in-progress' | 'done' | 'blocked';
  priority: 'high' | 'medium' | 'low';
  createdAt: number;
  completedAt?: number;
  sessionId?: string;
  tags?: string[];
}

export interface SecurityFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  file: string;
  line: number;
  message: string;
  remediation: string;
  snippet?: string;
}

// src/ai/aiService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Universal AI Service
//
// Supports: OpenAI, Anthropic (Claude), Groq, Google Gemini, Mistral,
//           Ollama (local/free), OpenRouter, Custom (any OpenAI-compatible).
//
// Architecture decisions:
//   - Anthropic uses its own SDK (different wire format, native streaming).
//   - All other providers use the OpenAI SDK with a custom baseURL.
//     Groq, Gemini (v1beta), Mistral, Ollama, OpenRouter all expose
//     the /v1/chat/completions endpoint — fully compatible.
//
//   - validateApiKey() is called in the factory BEFORE any network call.
//   - humanizeApiError() converts raw 401/429/network errors to readable text.
//   - testConnection() makes a minimal safe request; never throws.
//
// Dependency rule: This file may import from '../types' and '../ai/apiKeyValidator'.
//                  It must NOT import from ui/, storage/, or core/.
// ─────────────────────────────────────────────────────────────────────────────

import * as vscode from 'vscode';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

import {
  AIMessage,
  AIResponse,
  AIServiceConfig,
  AIProvider,
  ConnectionTestResult,
} from '../types';

import { validateApiKey, humanizeApiError } from './apiKeyValidator';

// ═══ Provider Registry ════════════════════════════════════════════════════════

/** Static information about each supported AI provider. */
export interface ProviderInfo {
  /** Human-readable display name */
  name: string;
  /** Default API base URL — override with config.baseUrl */
  baseUrl: string;
  /** Model to use when user hasn't specified one */
  defaultModel: string;
  /** Whether this provider requires an API key */
  requiresKey: boolean;
  /** URL where the user can create an API key */
  docsUrl: string;
  /** All models supported by this provider */
  models: ReadonlyArray<ModelInfo>;
}

export interface ModelInfo {
  id: string;
  label: string;
  /** Maximum context window in tokens */
  contextWindow: number;
}

/**
 * Static registry of every supported provider.
 * Update this map to add new providers — no other code changes needed.
 */
export const PROVIDER_REGISTRY: Readonly<Record<AIProvider, ProviderInfo>> = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    requiresKey: true,
    docsUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4o',        label: 'GPT-4o (recommended)', contextWindow: 128_000 },
      { id: 'gpt-4o-mini',   label: 'GPT-4o Mini (fast)',   contextWindow: 128_000 },
      { id: 'o1',            label: 'o1 (reasoning)',        contextWindow: 200_000 },
      { id: 'o1-mini',       label: 'o1 Mini',              contextWindow: 128_000 },
      { id: 'gpt-4-turbo',   label: 'GPT-4 Turbo',          contextWindow: 128_000 },
      { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (cheap)',contextWindow:  16_385 },
    ],
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-5-20250929',
    requiresKey: true,
    docsUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-opus-4-5-20251101',   label: 'Claude Opus 4.5 (most powerful)', contextWindow: 200_000 },
      { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (balanced)',     contextWindow: 200_000 },
      { id: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5 (fastest)',       contextWindow: 200_000 },
    ],
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    requiresKey: true,
    docsUrl: 'https://console.groq.com/keys',
    models: [
      { id: 'llama-3.3-70b-versatile',        label: 'Llama 3.3 70B (recommended)',   contextWindow: 128_000 },
      { id: 'llama-3.1-8b-instant',           label: 'Llama 3.1 8B (ultra fast)',     contextWindow: 128_000 },
      { id: 'mixtral-8x7b-32768',             label: 'Mixtral 8x7B',                  contextWindow:  32_768 },
      { id: 'gemma2-9b-it',                   label: 'Gemma 2 9B',                    contextWindow:   8_192 },
      { id: 'deepseek-r1-distill-llama-70b',  label: 'DeepSeek R1 Distill 70B',       contextWindow: 128_000 },
    ],
  },
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    requiresKey: true,
    docsUrl: 'https://aistudio.google.com/app/apikey',
    models: [
      { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash (recommended)', contextWindow: 1_048_576 },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite (fast)',   contextWindow: 1_048_576 },
      { id: 'gemini-1.5-pro',        label: 'Gemini 1.5 Pro',                 contextWindow: 2_097_152 },
      { id: 'gemini-1.5-flash',      label: 'Gemini 1.5 Flash',               contextWindow: 1_048_576 },
    ],
  },
  mistral: {
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    requiresKey: true,
    docsUrl: 'https://console.mistral.ai/api-keys/',
    models: [
      { id: 'mistral-large-latest', label: 'Mistral Large (most capable)',  contextWindow: 131_072 },
      { id: 'mistral-small-latest', label: 'Mistral Small (efficient)',     contextWindow: 131_072 },
      { id: 'codestral-latest',     label: 'Codestral (code specialist)',   contextWindow: 262_144 },
      { id: 'mistral-nemo',         label: 'Mistral Nemo (compact)',        contextWindow: 131_072 },
    ],
  },
  ollama: {
    name: 'Ollama (Local, Free)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    requiresKey: false,
    docsUrl: 'https://ollama.ai',
    models: [
      { id: 'llama3.2',          label: 'Llama 3.2 (recommended)',  contextWindow: 131_072 },
      { id: 'llama3.1:8b',       label: 'Llama 3.1 8B',            contextWindow: 131_072 },
      { id: 'codellama',         label: 'CodeLlama (code focused)', contextWindow: 100_000 },
      { id: 'deepseek-coder-v2', label: 'DeepSeek Coder V2',       contextWindow: 163_840 },
      { id: 'qwen2.5-coder:7b',  label: 'Qwen 2.5 Coder 7B',      contextWindow: 131_072 },
      { id: 'mistral',           label: 'Mistral 7B',              contextWindow:  32_768 },
      { id: 'phi4',              label: 'Phi-4 (Microsoft)',        contextWindow:  16_384 },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-sonnet-4-5',
    requiresKey: true,
    docsUrl: 'https://openrouter.ai/keys',
    models: [
      { id: 'anthropic/claude-sonnet-4-5',       label: 'Claude Sonnet 4.5',        contextWindow: 200_000 },
      { id: 'anthropic/claude-opus-4-5',         label: 'Claude Opus 4.5',          contextWindow: 200_000 },
      { id: 'openai/gpt-4o',                     label: 'GPT-4o',                   contextWindow: 128_000 },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (free)',     contextWindow: 128_000 },
      { id: 'google/gemini-2.0-flash-exp:free',  label: 'Gemini 2.0 Flash (free)',  contextWindow: 1_048_576 },
      { id: 'deepseek/deepseek-r1',              label: 'DeepSeek R1',              contextWindow:  65_536 },
      { id: 'qwen/qwen-2.5-coder-32b-instruct',  label: 'Qwen 2.5 Coder 32B',      contextWindow: 131_072 },
    ],
  },
  custom: {
    name: 'Custom (OpenAI-compatible)',
    baseUrl: 'http://localhost:8080/v1',
    defaultModel: 'custom-model',
    requiresKey: false,
    docsUrl: '',
    models: [
      { id: 'custom-model', label: 'Your custom model', contextWindow: 32_768 },
    ],
  },
  perplexity: {
    name: 'Perplexity AI',
    baseUrl: 'https://api.perplexity.ai',
    defaultModel: 'llama-3.1-sonar-large-128k-online',
    requiresKey: true,
    docsUrl: 'https://www.perplexity.ai/settings/api',
    models: [
      { id: 'llama-3.1-sonar-large-128k-online', label: 'Sonar Large Online (live web)',  contextWindow: 128000 },
      { id: 'llama-3.1-sonar-small-128k-online', label: 'Sonar Small Online (fast)',      contextWindow: 128000 },
      { id: 'llama-3.1-sonar-huge-128k-online',  label: 'Sonar Huge Online (powerful)',   contextWindow: 128000 },
      { id: 'llama-3.1-sonar-large-128k-chat',   label: 'Sonar Large Chat (no search)',   contextWindow: 128000 },
    ],
  },
} as const;

// ═══ AIService ════════════════════════════════════════════════════════════════

export class AIService {
  private readonly config: AIServiceConfig;
  private readonly providerInfo: ProviderInfo;
  private readonly openaiClient: OpenAI | null;
  private readonly anthropicClient: Anthropic | null;

  private constructor(config: AIServiceConfig) {
    this.config = config;
    this.providerInfo = PROVIDER_REGISTRY[config.provider];

    if (config.provider === 'anthropic') {
      this.anthropicClient = new Anthropic({ apiKey: config.apiKey });
      this.openaiClient = null;
    } else {
      const baseURL = config.baseUrl ?? this.providerInfo.baseUrl;
      this.openaiClient = new OpenAI({
        apiKey: config.apiKey || 'ollama',        // Ollama ignores the key
        baseURL,
        defaultHeaders: this.buildExtraHeaders(),
      });
      this.anthropicClient = null;
    }
  }

  // ─── Factory ───────────────────────────────────────────────────────────────

  /**
   * Creates an AIService from the current VS Code workspace configuration.
   *
   * Validates the API key against the selected provider BEFORE making any
   * network call. Throws a user-friendly Error if validation fails.
   *
   * @param context - VS Code extension context (for SecretStorage access).
   * @throws Error with a human-readable message if key is invalid or missing.
   */
  static async createFromVSCodeConfig(
    context: vscode.ExtensionContext,
    sqliteGetKey?: (name: string) => string | null,
  ): Promise<AIService> {
    const cfg = vscode.workspace.getConfiguration('myCoder');
    const provider = (cfg.get<AIProvider>('aiProvider')) ?? 'openai';
    const info = PROVIDER_REGISTRY[provider];
    const model = cfg.get<string>('model') ?? info.defaultModel;
    const baseUrl = cfg.get<string>('customBaseUrl') || undefined;

    // Ollama: no key required, connect directly
    if (provider === 'ollama') {
      return new AIService({ provider, model, apiKey: 'ollama', baseUrl });
    }

    const secretName = `my-coder.${provider}-key`;

    // 1. Check VS Code SecretStorage first (encrypted, per-machine)
    let apiKey = await context.secrets.get(secretName);

    // 2. Fall back to SQLite (so Drive-synced keys work on a new machine)
    if (!apiKey && sqliteGetKey) {
      const fromDb = sqliteGetKey(secretName);
      if (fromDb) {
        apiKey = fromDb;
        // Promote the key into SecretStorage silently
        void context.secrets.store(secretName, apiKey);
      }
    }

    if (!apiKey) {
      throw new Error(
        `No API key configured for ${info.name}.\n` +
        `Click ⚙️ Settings in MY Coder and paste your key.\n` +
        `Get one at: ${info.docsUrl}`,
      );
    }

    // Validate prefix — catches gsk_ key used with openai provider, etc.
    const validation = validateApiKey(apiKey, provider);
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    return new AIService({ provider, model, apiKey, baseUrl });
  }

  /**
   * Creates a temporary AIService for connection testing from raw values.
   * Used by the settings modal's "Test connection" button.
   *
   * @throws Error if validation fails (no key for a required provider).
   */
  static createForTest(config: AIServiceConfig): AIService {
    if (config.provider !== 'ollama') {
      const validation = validateApiKey(config.apiKey, config.provider);
      if (!validation.valid) {
        throw new Error(validation.message);
      }
    }
    return new AIService(config);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Non-streaming completion. Returns the full response once the model finishes.
   *
   * @param messages      - Conversation history in AIMessage format.
   * @param systemPrompt  - Optional system instruction.
   * @throws Error with a human-readable message on API failure.
   */
  async complete(messages: ReadonlyArray<AIMessage>, systemPrompt?: string): Promise<AIResponse> {
    try {
      return this.config.provider === 'anthropic'
        ? await this.anthropicComplete(messages, systemPrompt)
        : await this.openaiCompatComplete(messages, systemPrompt);
    } catch (error) {
      throw new Error(humanizeApiError(error, this.config.provider));
    }
  }

  /**
   * Streaming completion. Calls onChunk for every text fragment received,
   * then returns the full concatenated response.
   *
   * @param messages      - Conversation history.
   * @param systemPrompt  - System instruction.
   * @param onChunk       - Callback fired for each incremental text chunk.
   * @throws Error with a human-readable message on API failure.
   */
  async streamComplete(
    messages: ReadonlyArray<AIMessage>,
    systemPrompt: string,
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    try {
      return this.config.provider === 'anthropic'
        ? await this.anthropicStream(messages, systemPrompt, onChunk)
        : await this.openaiCompatStream(messages, systemPrompt, onChunk);
    } catch (error) {
      throw new Error(humanizeApiError(error, this.config.provider));
    }
  }

  /**
   * Tests the connection by making the smallest possible API call.
   * Never throws — returns a structured result instead.
   *
   * @returns ConnectionTestResult with ok, latencyMs, and optional error.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      const response = await this.complete(
        [{ role: 'user', content: 'Reply with exactly the word: OK' }],
        'You are a test assistant. Reply with exactly the word: OK',
      );
      const replied = response.content.toLowerCase().includes('ok');
      return {
        ok: replied,
        latencyMs: Date.now() - start,
        provider: this.config.provider,
        model: this.config.model,
        error: replied ? undefined : `Unexpected response: "${response.content.slice(0, 50)}"`,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        provider: this.config.provider,
        model: this.config.model,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ─── Ollama Model Discovery ────────────────────────────────────────────────

  /**
   * Fetches the list of locally installed Ollama models from the running daemon.
   * Returns an empty array if Ollama is not running or unreachable.
   *
   * @param baseUrl - Override if user has a non-default Ollama address.
   */
  static async fetchOllamaModels(baseUrl?: string): Promise<ModelInfo[]> {
    const url = (baseUrl?.replace(/\/v1\/?$/, '') ?? 'http://localhost:11434') + '/api/tags';
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      if (!response.ok) return [];
      const data = await response.json() as {
        models: Array<{ name: string; size: number }>;
      };
      return (data.models ?? []).map((m) => ({
        id: m.name,
        label: `${m.name} (${(m.size / 1e9).toFixed(1)} GB)`,
        contextWindow: 32_768,
      }));
    } catch {
      return [];
    }
  }

  // ─── Accessors ─────────────────────────────────────────────────────────────

  getProvider(): AIProvider { return this.config.provider; }
  getModel(): string { return this.config.model; }
  getProviderInfo(): ProviderInfo { return this.providerInfo; }

  // ─── Private: OpenAI-compatible path ──────────────────────────────────────

  private async openaiCompatComplete(
    messages: ReadonlyArray<AIMessage>,
    systemPrompt?: string,
  ): Promise<AIResponse> {
    if (!this.openaiClient) throw new Error('OpenAI-compatible client not initialized.');

    const builtMessages = this.buildOpenAIMessages(messages, systemPrompt);

    const response = await this.openaiClient.chat.completions.create({
      model: this.config.model,
      messages: builtMessages,
      max_tokens: this.config.maxTokens ?? 4_096,
      // o1 / o3 family does not accept temperature
      ...(this.modelRequiresNoTemperature() ? {} : { temperature: this.config.temperature ?? 0.2 }),
    });

    return {
      content: response.choices[0]?.message?.content ?? '',
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
    };
  }

  private async openaiCompatStream(
    messages: ReadonlyArray<AIMessage>,
    systemPrompt: string,
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    if (!this.openaiClient) throw new Error('OpenAI-compatible client not initialized.');

    const builtMessages = this.buildOpenAIMessages(messages, systemPrompt);

    const stream = await this.openaiClient.chat.completions.create({
      model: this.config.model,
      messages: builtMessages,
      max_tokens: this.config.maxTokens ?? 8_192,
      ...(this.modelRequiresNoTemperature() ? {} : { temperature: this.config.temperature ?? 0.2 }),
      stream: true,
    });

    let full = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) { full += delta; onChunk(delta); }
    }
    return full;
  }

  private buildOpenAIMessages(
    messages: ReadonlyArray<AIMessage>,
    systemPrompt?: string,
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (systemPrompt) result.push({ role: 'system', content: systemPrompt });
    for (const m of messages) {
      result.push({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      });
    }
    return result;
  }

  /** Returns true if the selected model does not accept a temperature parameter. */
  private modelRequiresNoTemperature(): boolean {
    return this.config.model.startsWith('o1') || this.config.model.startsWith('o3');
  }

  // ─── Private: Anthropic native path ───────────────────────────────────────

  private async anthropicComplete(
    messages: ReadonlyArray<AIMessage>,
    systemPrompt?: string,
  ): Promise<AIResponse> {
    if (!this.anthropicClient) throw new Error('Anthropic client not initialized.');

    const filtered = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const response = await this.anthropicClient.messages.create({
      model: this.config.model,
      system: systemPrompt ?? '',
      messages: filtered,
      max_tokens: this.config.maxTokens ?? 4_096,
    });

    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      content,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  private async anthropicStream(
    messages: ReadonlyArray<AIMessage>,
    systemPrompt: string,
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    if (!this.anthropicClient) throw new Error('Anthropic client not initialized.');

    const filtered = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const stream = this.anthropicClient.messages.stream({
      model: this.config.model,
      system: systemPrompt,
      messages: filtered,
      max_tokens: this.config.maxTokens ?? 8_192,
    });

    let full = '';
    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        full += event.delta.text;
        onChunk(event.delta.text);
      }
    }
    return full;
  }

  // ─── Private: Extra headers ────────────────────────────────────────────────

  /**
   * Returns provider-specific headers that must be sent with every request.
   * OpenRouter requires HTTP-Referer and X-Title for analytics / ToS compliance.
   */
  private buildExtraHeaders(): Record<string, string> {
    if (this.config.provider === 'openrouter') {
      return {
        'HTTP-Referer': 'https://github.com/my-coder-vscode',
        'X-Title': 'MY Coder VS Code Extension',
      };
    }
    return {};
  }
}

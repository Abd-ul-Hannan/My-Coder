import * as vscode from 'vscode';
import { AIMessage, AIResponse, AIServiceConfig, AIProvider, ConnectionTestResult } from '../types';
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
export declare const PROVIDER_REGISTRY: Readonly<Record<AIProvider, ProviderInfo>>;
export declare class AIService {
    private readonly config;
    private readonly providerInfo;
    private readonly openaiClient;
    private readonly anthropicClient;
    private constructor();
    /**
     * Creates an AIService from the current VS Code workspace configuration.
     *
     * Validates the API key against the selected provider BEFORE making any
     * network call. Throws a user-friendly Error if validation fails.
     *
     * @param context - VS Code extension context (for SecretStorage access).
     * @throws Error with a human-readable message if key is invalid or missing.
     */
    static createFromVSCodeConfig(context: vscode.ExtensionContext, sqliteGetKey?: (name: string) => string | null): Promise<AIService>;
    /**
     * Creates a temporary AIService for connection testing from raw values.
     * Used by the settings modal's "Test connection" button.
     *
     * @throws Error if validation fails (no key for a required provider).
     */
    static createForTest(config: AIServiceConfig): AIService;
    /**
     * Non-streaming completion. Returns the full response once the model finishes.
     *
     * @param messages      - Conversation history in AIMessage format.
     * @param systemPrompt  - Optional system instruction.
     * @throws Error with a human-readable message on API failure.
     */
    complete(messages: ReadonlyArray<AIMessage>, systemPrompt?: string): Promise<AIResponse>;
    /**
     * Streaming completion. Calls onChunk for every text fragment received,
     * then returns the full concatenated response.
     *
     * @param messages      - Conversation history.
     * @param systemPrompt  - System instruction.
     * @param onChunk       - Callback fired for each incremental text chunk.
     * @throws Error with a human-readable message on API failure.
     */
    streamComplete(messages: ReadonlyArray<AIMessage>, systemPrompt: string, onChunk: (chunk: string) => void): Promise<string>;
    /**
     * Tests the connection by making the smallest possible API call.
     * Never throws — returns a structured result instead.
     *
     * @returns ConnectionTestResult with ok, latencyMs, and optional error.
     */
    testConnection(): Promise<ConnectionTestResult>;
    /**
     * Fetches the list of locally installed Ollama models from the running daemon.
     * Returns an empty array if Ollama is not running or unreachable.
     *
     * @param baseUrl - Override if user has a non-default Ollama address.
     */
    static fetchOllamaModels(baseUrl?: string): Promise<ModelInfo[]>;
    getProvider(): AIProvider;
    getModel(): string;
    getProviderInfo(): ProviderInfo;
    private openaiCompatComplete;
    private openaiCompatStream;
    private buildOpenAIMessages;
    /** Returns true if the selected model does not accept a temperature parameter. */
    private modelRequiresNoTemperature;
    private anthropicComplete;
    private anthropicStream;
    /**
     * Returns provider-specific headers that must be sent with every request.
     * OpenRouter requires HTTP-Referer and X-Title for analytics / ToS compliance.
     */
    private buildExtraHeaders;
}
//# sourceMappingURL=aiService.d.ts.map
import { AIProvider, KeyValidationResult } from '../types';
/**
 * Detects which AI provider an API key belongs to based on its prefix.
 *
 * @param apiKey - The raw API key string entered by the user.
 * @returns The matched AIProvider, or null if the prefix is not recognized.
 *
 * @example
 *   detectProviderFromKey('gsk_abc123') // → 'groq'
 *   detectProviderFromKey('sk-ant-xyz') // → 'anthropic'
 *   detectProviderFromKey('AIzaSy...')  // → 'gemini'
 *   detectProviderFromKey('random')     // → null
 */
export declare function detectProviderFromKey(apiKey: string): AIProvider | null;
/**
 * Validates that an API key is consistent with the selected provider.
 * Returns a structured result — never throws.
 *
 * Rules:
 *   - Ollama needs no key → always valid.
 *   - If key has a recognizable prefix, it MUST match the selected provider.
 *   - Providers with flexible key formats skip prefix validation.
 *
 * @param apiKey        - Raw API key string.
 * @param provider      - The provider the user currently has selected.
 * @returns KeyValidationResult with mismatch flag and human-readable message.
 */
export declare function validateApiKey(apiKey: string, provider: AIProvider): KeyValidationResult;
/**
 * Converts a raw API error (e.g. from fetch or OpenAI SDK) into a
 * human-readable message shown directly in the chat panel.
 *
 * @param error    - The caught error object.
 * @param provider - Current provider, used to give targeted advice.
 * @returns A user-friendly error string.
 */
export declare function humanizeApiError(error: unknown, provider: AIProvider): string;
//# sourceMappingURL=apiKeyValidator.d.ts.map
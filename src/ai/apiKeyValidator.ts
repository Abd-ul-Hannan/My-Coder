// src/ai/apiKeyValidator.ts
// ─────────────────────────────────────────────────────────────────────────────
// Issue 1 Fix: API Key Validation & Provider Detection
//
// Responsibility:
//   1. Detect which provider an API key belongs to by its prefix.
//   2. Reject key/provider mismatches BEFORE making any API call.
//   3. Provide user-friendly error messages for 401 responses.
//
// Rule: No API calls here. Pure key inspection only.
// ─────────────────────────────────────────────────────────────────────────────

import { AIProvider, KeyValidationResult } from '../types';

// ─── Prefix → Provider Map ────────────────────────────────────────────────────

/**
 * Maps well-known API key prefixes to their canonical provider ID.
 * Order matters: longer/more-specific prefixes must come first.
 */
const PREFIX_TO_PROVIDER: ReadonlyArray<{ prefix: string; provider: AIProvider }> = [
  { prefix: 'sk-ant-',  provider: 'anthropic'  },
  { prefix: 'sk-or-',   provider: 'openrouter' },
  { prefix: 'gsk_',     provider: 'groq'       },
  { prefix: 'AIza',     provider: 'gemini'     },
  { prefix: 'sk-',      provider: 'openai'     },
];

/**
 * Providers that accept arbitrary key formats (custom endpoint, Mistral, etc.)
 * For these we skip prefix-based mismatch detection.
 */
const PROVIDERS_WITH_FLEXIBLE_KEYS: ReadonlySet<AIProvider> = new Set([
  'mistral',
  'ollama',   // no key needed at all
  'custom',
]);

// ─── Public API ───────────────────────────────────────────────────────────────

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
export function detectProviderFromKey(apiKey: string): AIProvider | null {
  const trimmed = apiKey.trim();
  for (const { prefix, provider } of PREFIX_TO_PROVIDER) {
    if (trimmed.startsWith(prefix)) {
      return provider;
    }
  }
  return null;
}

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
export function validateApiKey(apiKey: string, provider: AIProvider): KeyValidationResult {
  // Ollama runs locally — no key required
  if (provider === 'ollama') {
    return {
      valid: true,
      detectedProvider: 'ollama',
      mismatch: false,
      message: 'Ollama requires no API key.',
    };
  }

  const trimmed = apiKey.trim();

  // Empty key for a provider that requires one
  if (!trimmed) {
    return {
      valid: false,
      detectedProvider: null,
      mismatch: false,
      message: `API key is required for ${provider}. Please enter your key in Settings.`,
    };
  }

  const detectedProvider = detectProviderFromKey(trimmed);

  // Key has a recognizable prefix — check for mismatch
  if (detectedProvider !== null && detectedProvider !== provider) {
    const providerNames: Record<AIProvider, string> = {
      openai:     'OpenAI',
      anthropic:  'Anthropic',
      groq:       'Groq',
      gemini:     'Google Gemini',
      mistral:    'Mistral AI',
      ollama:     'Ollama',
      openrouter: 'OpenRouter',
      custom:     'Custom',
      perplexity: 'Perplexity',
    };
    return {
      valid: false,
      detectedProvider,
      mismatch: true,
      message:
        `This API key looks like a ${providerNames[detectedProvider]} key ` +
        `(prefix: "${getPrefixForProvider(detectedProvider)}") ` +
        `but provider is set to "${providerNames[provider]}". ` +
        `Switch the provider to "${providerNames[detectedProvider]}" in Settings.`,
    };
  }

  // Provider uses flexible keys — skip prefix validation
  if (PROVIDERS_WITH_FLEXIBLE_KEYS.has(provider)) {
    return {
      valid: true,
      detectedProvider: detectedProvider ?? provider,
      mismatch: false,
      message: 'Key accepted.',
    };
  }

  return {
    valid: true,
    detectedProvider: detectedProvider ?? provider,
    mismatch: false,
    message: 'Key accepted.',
  };
}

/**
 * Converts a raw API error (e.g. from fetch or OpenAI SDK) into a
 * human-readable message shown directly in the chat panel.
 *
 * @param error    - The caught error object.
 * @param provider - Current provider, used to give targeted advice.
 * @returns A user-friendly error string.
 */
export function humanizeApiError(error: unknown, provider: AIProvider): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  // 401 — bad key
  if (lower.includes('401') || lower.includes('incorrect api key') || lower.includes('invalid api key')) {
    const providerKeyUrls: Partial<Record<AIProvider, string>> = {
      openai:     'https://platform.openai.com/api-keys',
      anthropic:  'https://console.anthropic.com/settings/keys',
      groq:       'https://console.groq.com/keys',
      gemini:     'https://aistudio.google.com/app/apikey',
      openrouter: 'https://openrouter.ai/keys',
    };
    const url = providerKeyUrls[provider];
    return (
      `Invalid API key or wrong provider selected.\n` +
      `Make sure you have selected the correct provider in ⚙️ Settings.\n` +
      (url ? `Get a valid key at: ${url}` : '')
    );
  }

  // 429 — rate limit
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return `Rate limit reached for ${provider}. Wait a moment and try again.`;
  }

  // 403 — permission / quota
  if (lower.includes('403') || lower.includes('forbidden') || lower.includes('quota')) {
    return `Access denied (403). Check your account quota or billing status for ${provider}.`;
  }

  // Network errors
  if (lower.includes('econnrefused') || lower.includes('fetch failed') || lower.includes('network')) {
    if (provider === 'ollama') {
      return `Cannot connect to Ollama. Make sure Ollama is running: run "ollama serve" in a terminal.`;
    }
    return `Network error connecting to ${provider}. Check your internet connection.`;
  }

  // Context length
  if (lower.includes('context') && lower.includes('length')) {
    return `Prompt too long for this model. Try a smaller file or select a model with a larger context window.`;
  }

  // Fallback
  return `${provider} API error: ${raw.slice(0, 200)}`;
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

function getPrefixForProvider(provider: AIProvider): string {
  const match = PREFIX_TO_PROVIDER.find(p => p.provider === provider);
  return match?.prefix ?? '(unknown)';
}

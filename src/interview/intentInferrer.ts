// src/interview/intentInferrer.ts
// ─────────────────────────────────────────────────────────────────────────────
// Issue 2 Fix — Step 1 of the dynamic interview:
//   Converts a user's free-text intent ("I want to build an e-commerce site
//   with product listings and Stripe") into a structured InferredIntent object.
//
// Responsibility: AI inference only. No UI. No state mutation.
// ─────────────────────────────────────────────────────────────────────────────

import { AIService } from '../ai/aiService';
import {
  InferredIntent, AppCategory, ProjectType, Framework,
  Database, Language,
} from '../types';

// ─── System Prompt ────────────────────────────────────────────────────────────

const INFER_SYSTEM_PROMPT = `You are a senior software architect.

Given a user's project description, infer the most suitable technology stack.

Return ONLY a valid JSON object — no markdown, no explanation, no code fences.

JSON structure:
{
  "projectName": string,          // kebab-case, derived from description
  "projectType": "web"|"mobile"|"backend"|"cli"|"desktop"|"fullstack",
  "appCategory": "ecommerce"|"dashboard"|"blog"|"ai-tool"|"saas"|"portfolio"|"game"|"api-service"|"mobile-app"|"cli-tool"|"custom",
  "suggestedFramework": "nextjs"|"react"|"vue"|"nuxt"|"svelte"|"angular"|"nestjs"|"fastify"|"express"|"hono"|"flutter"|"expo"|"react-native"|"electron"|"tauri"|"none",
  "suggestedDatabase": "postgresql"|"mongodb"|"sqlite"|"supabase"|"firebase"|"mysql"|"redis"|"none",
  "suggestedLanguage": "typescript"|"javascript"|"python"|"dart"|"rust"|"go",
  "inferredFeatures": string[],   // max 6 items, specific features mentioned
  "confidence": "high"|"medium"|"low",
  "reasoning": string             // one sentence explaining the main choice
}

Rules:
- projectName must be kebab-case, max 30 chars
- Prefer TypeScript over JavaScript unless user says JS
- Prefer Next.js for web apps unless another framework is mentioned
- For mobile apps always suggest expo (React Native) or flutter
- confidence = "high" if intent is clear, "low" if very vague
- inferredFeatures: extract only concrete features (auth, payments, search, etc.)`;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Uses the AI to infer a structured project intent from free text.
 *
 * @param rawIntent   - The user's raw description, e.g. "I want to build a
 *                      Shopify clone with multi-vendor support".
 * @param aiService   - Initialized AIService to use for inference.
 * @returns           Structured InferredIntent, never throws (returns fallback on failure).
 */
export async function inferIntentFromText(
  rawIntent: string,
  aiService: AIService,
): Promise<InferredIntent> {
  const userMessage = `User's project description:\n"${rawIntent}"\n\nInfer the stack and return JSON only.`;

  let responseText = '';
  try {
    const response = await aiService.complete(
      [{ role: 'user', content: userMessage }],
      INFER_SYSTEM_PROMPT,
    );
    responseText = response.content;
    return parseInferredIntent(responseText);
  } catch (_error) {
    // If AI call fails or JSON is malformed, return a safe default
    return buildFallbackIntent(rawIntent);
  }
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Parses the AI response JSON into InferredIntent.
 * Strips accidental markdown fences before parsing.
 */
function parseInferredIntent(raw: string): InferredIntent {
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  return {
    projectName:       sanitizeProjectName(String(parsed['projectName'] ?? 'my-app')),
    projectType:       asProjectType(parsed['projectType']),
    appCategory:       asAppCategory(parsed['appCategory']),
    suggestedFramework:asFramework(parsed['suggestedFramework']),
    suggestedDatabase: asDatabase(parsed['suggestedDatabase']),
    suggestedLanguage: asLanguage(parsed['suggestedLanguage']),
    inferredFeatures:  asStringArray(parsed['inferredFeatures']).slice(0, 6),
    confidence:        asConfidence(parsed['confidence']),
    reasoning:         String(parsed['reasoning'] ?? ''),
  };
}

/** Safe fallback when AI call fails or returns invalid JSON */
function buildFallbackIntent(rawIntent: string): InferredIntent {
  const lower = rawIntent.toLowerCase();
  const isWeb = lower.includes('web') || lower.includes('site') || lower.includes('app');
  const isMobile = lower.includes('mobile') || lower.includes('ios') || lower.includes('android');
  const isBackend = lower.includes('api') || lower.includes('backend') || lower.includes('server');

  let projectType: ProjectType = 'web';
  if (isMobile) projectType = 'mobile';
  else if (isBackend && !isWeb) projectType = 'backend';

  return {
    projectName:        sanitizeProjectName(rawIntent.split(' ').slice(0, 3).join('-')),
    projectType,
    appCategory:        'custom',
    suggestedFramework: isMobile ? 'expo' : isBackend ? 'nestjs' : 'nextjs',
    suggestedDatabase:  'postgresql',
    suggestedLanguage:  'typescript',
    inferredFeatures:   [],
    confidence:         'low',
    reasoning:          'Could not parse intent — using safe defaults.',
  };
}

// ─── Type Coercions (safe casts from unknown) ─────────────────────────────────

function sanitizeProjectName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 30);
}

function asProjectType(v: unknown): ProjectType {
  const valid: ProjectType[] = ['web', 'mobile', 'backend', 'cli', 'desktop', 'fullstack'];
  return valid.includes(v as ProjectType) ? (v as ProjectType) : 'web';
}

function asAppCategory(v: unknown): AppCategory {
  const valid: AppCategory[] = [
    'ecommerce', 'dashboard', 'blog', 'ai-tool', 'saas',
    'portfolio', 'game', 'api-service', 'mobile-app', 'cli-tool', 'custom',
  ];
  return valid.includes(v as AppCategory) ? (v as AppCategory) : 'custom';
}

function asFramework(v: unknown): Framework {
  const valid: Framework[] = [
    'react', 'nextjs', 'vue', 'nuxt', 'angular', 'svelte',
    'express', 'fastify', 'nestjs', 'hono',
    'flutter', 'react-native', 'expo',
    'electron', 'tauri', 'none',
  ];
  return valid.includes(v as Framework) ? (v as Framework) : 'nextjs';
}

function asDatabase(v: unknown): Database {
  const valid: Database[] = ['postgresql', 'mysql', 'mongodb', 'sqlite', 'supabase', 'firebase', 'redis', 'none'];
  return valid.includes(v as Database) ? (v as Database) : 'none';
}

function asLanguage(v: unknown): Language {
  const valid: Language[] = ['typescript', 'javascript', 'python', 'dart', 'rust', 'go'];
  return valid.includes(v as Language) ? (v as Language) : 'typescript';
}

function asConfidence(v: unknown): 'high' | 'medium' | 'low' {
  if (v === 'high' || v === 'medium' || v === 'low') return v;
  return 'medium';
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((item): item is string => typeof item === 'string');
}

// Re-export types used externally
export type { Framework, Database, Language };

// src/integrations/supabaseAgent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Supabase Agent — generates complete Supabase integration code
//
// Generates:
//   - Schema SQL with migrations
//   - Row Level Security (RLS) policies
//   - Edge Functions (serverless)
//   - Type-safe TypeScript client
//   - Auth helpers (signup, login, reset, session, protected routes)
//   - Real-time subscriptions
//   - Stripe + Resend + Twilio integration stubs
// ─────────────────────────────────────────────────────────────────────────────

import { AIService } from '../ai/aiService';
import { ProjectInterview } from '../types';

export interface SupabaseSchema {
  tables: SupabaseTable[];
  enums?: string[];
  functions?: string[];
}

export interface SupabaseTable {
  name: string;
  columns: Array<{ name: string; type: string; nullable?: boolean; default?: string }>;
  rls?: boolean;
  policies?: RLSPolicy[];
}

export interface RLSPolicy {
  name: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  using?: string;
  withCheck?: string;
}

export interface GeneratedSupabaseFiles {
  migrationSql: string;
  rlsSql: string;
  typesTs: string;
  clientTs: string;
  authHelpersTs: string;
  edgeFunctions: Array<{ name: string; content: string }>;
  envExample: string;
}

// ─── System Prompts ───────────────────────────────────────────────────────────

const SCHEMA_PROMPT = `You are a Supabase database architect.
Given a project specification, generate:
1. A complete PostgreSQL migration SQL file with all tables, indexes, and foreign keys
2. Row Level Security (RLS) SQL — enable RLS on all tables and create appropriate policies
3. TypeScript types matching the schema

Return ONLY a JSON object:
{
  "migrationSql": "complete SQL string",
  "rlsSql": "complete RLS SQL string",
  "typesTs": "complete TypeScript types file content"
}
No markdown. No explanation.`;

const AUTH_HELPERS_PROMPT = `You are a Supabase auth expert.
Generate a complete TypeScript auth helpers file for a Next.js app using @supabase/ssr.
Include: createClient, signUp, signIn, signOut, resetPassword, getSession, 
getUser, updateProfile, protectedRoute middleware, and auth context provider.
Return ONLY the TypeScript file content. No markdown fences.`;

const EDGE_FUNCTION_PROMPT = `You are a Supabase Edge Functions expert (Deno runtime).
Generate a complete Edge Function. 
Rules:
- Use Deno imports (https://esm.sh/...)
- Handle CORS with proper headers
- Parse request body safely
- Return proper JSON responses with status codes
- Include error handling
Return ONLY the TypeScript function content. No markdown fences.`;

// ─── SupabaseAgent ────────────────────────────────────────────────────────────

export class SupabaseAgent {
  constructor(private readonly aiService: AIService) {}

  /**
   * Generates a complete Supabase setup for a project.
   * Includes schema, RLS, types, client, auth helpers, and edge functions.
   */
  async generateFullSetup(interview: ProjectInterview): Promise<GeneratedSupabaseFiles> {
    const projectDesc = `
Project: ${interview.projectName}
Category: ${interview.appCategory}
Features: ${interview.features.join(', ')}
Auth: ${interview.authRequired ? interview.authProvider : 'none'}
`;

    // Run schema + auth in parallel
    const [schemaResult, authContent] = await Promise.all([
      this.generateSchema(projectDesc),
      this.generateAuthHelpers(),
    ]);

    // Generate client with types
    const clientContent = this.generateTypesSafeClient();

    // Generate edge functions based on features
    const edgeFunctions = await this.generateEdgeFunctions(interview);

    return {
      migrationSql: schemaResult.migrationSql,
      rlsSql: schemaResult.rlsSql,
      typesTs: schemaResult.typesTs,
      clientTs: clientContent,
      authHelpersTs: authContent,
      edgeFunctions,
      envExample: this.generateEnvExample(interview),
    };
  }

  private async generateSchema(projectDesc: string): Promise<{ migrationSql: string; rlsSql: string; typesTs: string }> {
    const response = await this.aiService.complete(
      [{ role: 'user', content: `Generate Supabase schema for:\n${projectDesc}` }],
      SCHEMA_PROMPT,
    );
    try {
      const cleaned = response.content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return {
        migrationSql: this.fallbackMigration(),
        rlsSql: this.fallbackRLS(),
        typesTs: this.fallbackTypes(),
      };
    }
  }

  private async generateAuthHelpers(): Promise<string> {
    const response = await this.aiService.complete(
      [{ role: 'user', content: 'Generate Supabase SSR auth helpers for Next.js 14 app router.' }],
      AUTH_HELPERS_PROMPT,
    );
    return response.content.replace(/```typescript\s*/gi, '').replace(/```\s*/gi, '').trim();
  }

  private async generateEdgeFunctions(interview: ProjectInterview): Promise<Array<{ name: string; content: string }>> {
    const functions: Array<{ name: string; content: string }> = [];
    const featureLower = interview.features.map(f => f.toLowerCase());

    const requests: Array<{ name: string; prompt: string }> = [];

    if (featureLower.some(f => f.includes('stripe') || f.includes('payment') || f.includes('billing'))) {
      requests.push({ name: 'stripe-webhook', prompt: 'Stripe webhook handler that processes payment_intent.succeeded, customer.subscription.created, and invoice.payment_failed events' });
    }
    if (featureLower.some(f => f.includes('email') || f.includes('resend') || f.includes('notification'))) {
      requests.push({ name: 'send-email', prompt: 'Resend email sending Edge Function with template support for transactional emails' });
    }
    if (featureLower.some(f => f.includes('sms') || f.includes('twilio'))) {
      requests.push({ name: 'send-sms', prompt: 'Twilio SMS sending Edge Function' });
    }
    if (featureLower.some(f => f.includes('ai') || f.includes('chat') || f.includes('openai'))) {
      requests.push({ name: 'ai-chat', prompt: 'OpenAI streaming chat completion Edge Function with conversation history' });
    }

    // Always add a hello world as example
    if (!requests.length) {
      requests.push({ name: 'hello', prompt: 'Simple hello world Edge Function with CORS and JSON response' });
    }

    for (const req of requests) {
      const response = await this.aiService.complete(
        [{ role: 'user', content: `Generate a Supabase Edge Function: ${req.prompt}` }],
        EDGE_FUNCTION_PROMPT,
      );
      functions.push({ name: req.name, content: response.content.replace(/```typescript\s*/gi, '').replace(/```\s*/gi, '').trim() });
    }

    return functions;
  }

  // ─── Type-safe client ─────────────────────────────────────────────────────

  private generateTypesSafeClient(): string {
    return `// lib/supabase/client.ts
// Auto-generated by MY Coder — type-safe Supabase client

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env.local file.');
}

/** Browser-side Supabase client — use in Client Components */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}

/** Singleton for use in utility functions */
export const supabase = createClient();
`;
  }

  // ─── Fallbacks ────────────────────────────────────────────────────────────

  private fallbackMigration(): string {
    return `-- Migration: Initial schema
-- Generated by MY Coder

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
`;
  }

  private fallbackRLS(): string {
    return `-- Row Level Security Policies
-- Generated by MY Coder

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
`;
  }

  private fallbackTypes(): string {
    return `// types/supabase.ts — Generated by MY Coder
// Run: npx supabase gen types typescript --local > types/supabase.ts

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; email: string; display_name: string | null; avatar_url: string | null; created_at: string; updated_at: string };
        Insert: { id: string; email: string; display_name?: string | null; avatar_url?: string | null };
        Update: { display_name?: string | null; avatar_url?: string | null; updated_at?: string };
      };
    };
  };
};
`;
  }

  private generateEnvExample(interview: ProjectInterview): string {
    const features = interview.features.map(f => f.toLowerCase());
    const lines = [
      '# Supabase',
      'NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key',
      'SUPABASE_SERVICE_ROLE_KEY=your-service-role-key',
      '',
    ];
    if (features.some(f => f.includes('stripe') || f.includes('payment'))) {
      lines.push('# Stripe', 'STRIPE_SECRET_KEY=sk_live_...', 'STRIPE_WEBHOOK_SECRET=whsec_...', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...', '');
    }
    if (features.some(f => f.includes('email') || f.includes('resend'))) {
      lines.push('# Resend', 'RESEND_API_KEY=re_...', 'FROM_EMAIL=noreply@yourdomain.com', '');
    }
    if (features.some(f => f.includes('twilio') || f.includes('sms'))) {
      lines.push('# Twilio', 'TWILIO_ACCOUNT_SID=AC...', 'TWILIO_AUTH_TOKEN=...', 'TWILIO_PHONE_NUMBER=+1...', '');
    }
    if (features.some(f => f.includes('openai') || f.includes('ai'))) {
      lines.push('# OpenAI', 'OPENAI_API_KEY=sk-...', '');
    }
    if (features.some(f => f.includes('analytics'))) {
      lines.push('# Analytics', 'NEXT_PUBLIC_GA_MEASUREMENT_ID=G-...', 'NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-...', '');
    }
    return lines.join('\n');
  }
}

// src/interview/interviewStateMachine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Issue 2 Fix — Dynamic Interview State Machine
//
// Replaces the old static InterviewManager with a proper state machine:
//   intent → (refinement?) → stack-selection → auth → deployment → features → confirmation → finalized
//
// Key behaviours:
//   • Only asks questions that are RELEVANT to the inferred project type.
//   • Skips questions whose answers are already confidently inferred.
//   • Framework options change dynamically based on projectType.
//   • Never asks all questions at once.
//
// Responsibility: State management only. No AI calls. No file I/O.
// ─────────────────────────────────────────────────────────────────────────────

import {
  InterviewPhase, InterviewAnswers, InterviewQuestion, InterviewOption,
  ProjectInterview, InferredIntent, ProjectType, Framework,
  Database, DeploymentTarget, AppCategory, AuthProvider,
} from '../types';

// ─── Framework Options by ProjectType ────────────────────────────────────────

const FRAMEWORK_OPTIONS_BY_TYPE: Readonly<Record<ProjectType, InterviewOption[]>> = {
  web: [
    { value: 'nextjs',  label: 'Next.js',   description: 'React + SSR/API routes (recommended)', isRecommended: true },
    { value: 'react',   label: 'React + Vite', description: 'SPA, fast builds' },
    { value: 'vue',     label: 'Vue 3',      description: 'Progressive framework' },
    { value: 'nuxt',    label: 'Nuxt 3',     description: 'Vue + SSR' },
    { value: 'svelte',  label: 'SvelteKit',  description: 'Lightweight + fast' },
    { value: 'angular', label: 'Angular',    description: 'Enterprise-grade' },
  ],
  fullstack: [
    { value: 'nextjs',  label: 'Next.js',    description: 'Fullstack React (recommended)', isRecommended: true },
    { value: 'nuxt',    label: 'Nuxt 3',     description: 'Fullstack Vue' },
  ],
  backend: [
    { value: 'nestjs',  label: 'NestJS',     description: 'Opinionated, scalable (recommended)', isRecommended: true },
    { value: 'fastify', label: 'Fastify',    description: 'High performance' },
    { value: 'express', label: 'Express',    description: 'Minimal, flexible' },
    { value: 'hono',    label: 'Hono',       description: 'Ultra-lightweight, edge-ready' },
  ],
  mobile: [
    { value: 'expo',         label: 'Expo (React Native)', description: 'Cross-platform, easiest setup', isRecommended: true },
    { value: 'react-native', label: 'React Native CLI',    description: 'More control' },
    { value: 'flutter',      label: 'Flutter',             description: 'Dart-based, excellent perf' },
  ],
  cli: [
    { value: 'none', label: 'Node.js + Commander', description: 'TypeScript CLI app', isRecommended: true },
  ],
  desktop: [
    { value: 'electron', label: 'Electron', description: 'Web tech for desktop', isRecommended: true },
    { value: 'tauri',    label: 'Tauri',    description: 'Rust backend, lighter weight' },
  ],
};

const DATABASE_OPTIONS: InterviewOption[] = [
  { value: 'none',       label: 'No Database',  description: 'Stateless or file-based' },
  { value: 'postgresql', label: 'PostgreSQL',   description: 'Relational, best for most apps', isRecommended: true },
  { value: 'supabase',   label: 'Supabase',     description: 'PostgreSQL + Auth + Storage BaaS' },
  { value: 'mongodb',    label: 'MongoDB',      description: 'Document-based NoSQL' },
  { value: 'sqlite',     label: 'SQLite',       description: 'Embedded, no server needed' },
  { value: 'firebase',   label: 'Firebase',     description: 'Google BaaS + realtime' },
  { value: 'mysql',      label: 'MySQL',        description: 'Widely supported relational DB' },
];

const AUTH_OPTIONS: InterviewOption[] = [
  { value: 'none',          label: 'No auth',          description: 'Public app, no login' },
  { value: 'clerk',         label: 'Clerk',             description: 'Drop-in auth UI (recommended)', isRecommended: true },
  { value: 'supabase-auth', label: 'Supabase Auth',     description: 'If using Supabase DB' },
  { value: 'auth0',         label: 'Auth0',             description: 'Enterprise identity platform' },
  { value: 'jwt',           label: 'JWT (custom)',      description: 'Roll your own tokens' },
  { value: 'oauth',         label: 'OAuth2 (custom)',   description: 'Google/GitHub login' },
];

const DEPLOYMENT_OPTIONS: InterviewOption[] = [
  { value: 'vercel',   label: 'Vercel',   description: 'Best for Next.js / static', isRecommended: true },
  { value: 'railway',  label: 'Railway',  description: 'Simple fullstack deployment' },
  { value: 'docker',   label: 'Docker',   description: 'Containerized, anywhere' },
  { value: 'netlify',  label: 'Netlify',  description: 'Great for Jamstack' },
  { value: 'aws',      label: 'AWS',      description: 'Enterprise cloud' },
  { value: 'fly',      label: 'Fly.io',   description: 'Edge deployment' },
  { value: 'none',     label: 'Not sure', description: 'Decide later' },
];

const FEATURE_OPTIONS_BY_CATEGORY: Readonly<Record<AppCategory, InterviewOption[]>> = {
  ecommerce: [
    { value: 'Product catalog', label: 'Product Catalog' },
    { value: 'Shopping cart', label: 'Shopping Cart' },
    { value: 'Stripe payments', label: 'Stripe Payments' },
    { value: 'Order management', label: 'Order Management' },
    { value: 'Inventory tracking', label: 'Inventory Tracking' },
    { value: 'Multi-vendor support', label: 'Multi-Vendor' },
  ],
  dashboard: [
    { value: 'Charts and analytics', label: 'Charts & Analytics' },
    { value: 'Data tables', label: 'Data Tables' },
    { value: 'Real-time updates', label: 'Real-time Updates' },
    { value: 'Export to CSV/PDF', label: 'CSV / PDF Export' },
    { value: 'User roles', label: 'User Roles' },
  ],
  blog: [
    { value: 'Markdown editor', label: 'Markdown Editor' },
    { value: 'Categories and tags', label: 'Categories & Tags' },
    { value: 'Comments', label: 'Comments' },
    { value: 'RSS feed', label: 'RSS Feed' },
    { value: 'SEO optimisation', label: 'SEO' },
  ],
  'ai-tool': [
    { value: 'Chat interface', label: 'Chat Interface' },
    { value: 'File upload + AI analysis', label: 'File Upload + Analysis' },
    { value: 'Streaming responses', label: 'Streaming Responses' },
    { value: 'Token usage tracking', label: 'Token Usage Tracking' },
    { value: 'Prompt history', label: 'Prompt History' },
  ],
  saas: [
    { value: 'Subscription billing (Stripe)', label: 'Subscription Billing' },
    { value: 'Team workspaces', label: 'Team Workspaces' },
    { value: 'Usage metering', label: 'Usage Metering' },
    { value: 'Admin panel', label: 'Admin Panel' },
    { value: 'Onboarding flow', label: 'Onboarding' },
    { value: 'Email notifications', label: 'Email Notifications' },
  ],
  portfolio: [
    { value: 'Project showcase', label: 'Project Showcase' },
    { value: 'Blog section', label: 'Blog Section' },
    { value: 'Contact form', label: 'Contact Form' },
    { value: 'Dark mode', label: 'Dark Mode' },
    { value: 'Animations', label: 'Animations' },
  ],
  game: [
    { value: 'Leaderboard', label: 'Leaderboard' },
    { value: 'Multiplayer', label: 'Multiplayer' },
    { value: 'Save game state', label: 'Save / Load' },
    { value: 'Sound effects', label: 'Sound Effects' },
  ],
  'api-service': [
    { value: 'OpenAPI/Swagger docs', label: 'OpenAPI Docs' },
    { value: 'Rate limiting', label: 'Rate Limiting' },
    { value: 'API key authentication', label: 'API Key Auth' },
    { value: 'Webhooks', label: 'Webhooks' },
    { value: 'Request logging', label: 'Request Logging' },
  ],
  'mobile-app': [
    { value: 'Push notifications', label: 'Push Notifications' },
    { value: 'Offline support', label: 'Offline Support' },
    { value: 'Camera / gallery access', label: 'Camera Access' },
    { value: 'Location services', label: 'Location Services' },
    { value: 'Biometric auth', label: 'Biometric Auth' },
  ],
  'cli-tool': [
    { value: 'Config file support', label: 'Config File' },
    { value: 'Colored output', label: 'Colored Output' },
    { value: 'Progress bars', label: 'Progress Bars' },
    { value: 'Interactive prompts', label: 'Interactive Prompts' },
  ],
  custom: [
    { value: 'Authentication', label: 'Authentication' },
    { value: 'Dashboard', label: 'Dashboard' },
    { value: 'File upload', label: 'File Upload' },
    { value: 'Email notifications', label: 'Email' },
    { value: 'Real-time updates', label: 'Real-time' },
    { value: 'Dark mode', label: 'Dark Mode' },
    { value: 'CI/CD pipeline', label: 'CI/CD' },
  ],
};

// ─── Phase Sequence ───────────────────────────────────────────────────────────

const PHASE_ORDER: InterviewPhase[] = [
  'intent',
  'refinement',
  'stack-selection',
  'database',
  'auth',
  'deployment',
  'features',
  'confirmation',
  'finalized',
];

// ─── InterviewStateMachine ────────────────────────────────────────────────────

export class InterviewStateMachine {
  private phase: InterviewPhase = 'intent';
  private answers: InterviewAnswers = {};
  private inferred: InferredIntent | null = null;

  /** Whether the interview is complete and ready to build. */
  isFinalized(): boolean {
    return this.phase === 'finalized';
  }

  getCurrentPhase(): InterviewPhase {
    return this.phase;
  }

  getAnswers(): Readonly<InterviewAnswers> {
    return this.answers;
  }

  /**
   * Called by InterviewEngine after AI infers intent from free text.
   * Populates initial answers and optionally skips phases that are
   * already confidently answered.
   */
  applyInferredIntent(intent: InferredIntent): void {
    this.inferred = intent;
    this.answers = {
      ...this.answers,
      projectName:    intent.projectName,
      projectType:    intent.projectType,
      appCategory:    intent.appCategory,
      framework:      intent.suggestedFramework,
      database:       intent.suggestedDatabase,
      language:       intent.suggestedLanguage,
      features:       intent.inferredFeatures,
    };
  }

  /**
   * Builds the InterviewQuestion for the current phase.
   * Returns null only when phase is 'finalized'.
   */
  getCurrentQuestion(): InterviewQuestion | null {
    const progress = this.calculateProgress();

    switch (this.phase) {
      case 'intent':
        return {
          phase: 'intent',
          question: "What do you want to build? Describe it in your own words.",
          isOptional: false,
          placeholder: 'e.g. A SaaS dashboard for tracking team productivity with Stripe billing and real-time charts',
          progress,
        };

      case 'refinement':
        return {
          phase: 'refinement',
          question:
            `I understood: **${this.inferred?.reasoning ?? 'your project'}**\n\n` +
            `Detected: ${this.answers.projectType} · ${this.answers.appCategory} · ${this.answers.framework}\n\n` +
            `Is this correct? Type "yes" to proceed, or describe what to change.`,
          isOptional: false,
          placeholder: 'yes / change framework to Vue / make it a mobile app',
          progress,
        };

      case 'stack-selection':
        return {
          phase: 'stack-selection',
          question: `Which framework would you like to use for **${this.answers.projectType}** project?`,
          options: this.getFrameworkOptions(),
          isOptional: false,
          progress,
        };

      case 'database': {
        // CLI tools and desktop apps rarely need a DB — pre-skip if low relevance
        const dbOptions = this.shouldSkipDatabase()
          ? DATABASE_OPTIONS
          : DATABASE_OPTIONS.map((opt) => ({
              ...opt,
              isRecommended: opt.value === this.inferred?.suggestedDatabase,
            }));
        return {
          phase: 'database',
          question: 'Which database does your project need?',
          options: dbOptions,
          isOptional: false,
          progress,
        };
      }

      case 'auth':
        return {
          phase: 'auth',
          question: 'Does your project need user authentication?',
          options: AUTH_OPTIONS,
          isOptional: false,
          progress,
        };

      case 'deployment':
        return {
          phase: 'deployment',
          question: 'Where do you plan to deploy?',
          options: DEPLOYMENT_OPTIONS,
          isOptional: false,
          progress,
        };

      case 'features':
        return {
          phase: 'features',
          question: 'Select the features you need:',
          options: this.getFeatureOptions(),
          isMultiSelect: true,
          isOptional: true,
          progress,
        };

      case 'confirmation':
        return {
          phase: 'confirmation',
          question: this.buildConfirmationSummary(),
          options: [
            { value: 'confirm', label: '✅ Looks good — build it!', isRecommended: true },
            { value: 'restart', label: '🔄 Start over' },
          ],
          isOptional: false,
          progress,
        };

      case 'finalized':
        return null;
    }
  }

  /**
   * Processes the user's answer for the current phase and advances the state.
   *
   * @param answer - String for single-select or free text; string[] for multi-select.
   */
  processAnswer(answer: string | string[]): void {
    switch (this.phase) {
      case 'intent':
        this.answers.rawIntent = answer as string;
        // After intent is saved, the InterviewEngine will call AI to infer,
        // then call applyInferredIntent(), then we advance to refinement.
        this.phase = 'refinement';
        break;

      case 'refinement': {
        const text = (answer as string).trim().toLowerCase();
        if (text === 'yes' || text === 'y' || text === 'correct' || text === 'looks good') {
          // Skip stack-selection — use the inferred values
          this.phase = 'auth';
        } else {
          // User wants to change something — go to manual stack selection
          this.applyRefinementText(answer as string);
          this.phase = 'stack-selection';
        }
        break;
      }

      case 'stack-selection':
        this.answers.framework = answer as Framework;
        this.phase = 'database';
        break;

      case 'database':
        this.answers.database = answer as Database;
        this.phase = 'auth';
        break;

      case 'auth':
        if (answer === 'none') {
          this.answers.authRequired = false;
          this.answers.authProvider = undefined;
        } else {
          this.answers.authRequired = true;
          this.answers.authProvider = answer as AuthProvider;
        }
        this.phase = 'deployment';
        break;

      case 'deployment':
        this.answers.deploymentTarget = answer as DeploymentTarget;
        this.phase = 'features';
        break;

      case 'features': {
        const selected = Array.isArray(answer) ? answer : [answer].filter(Boolean);
        // Merge AI-inferred features with user selections (deduplicated)
        const merged = Array.from(new Set([...(this.answers.features ?? []), ...selected]));
        this.answers.features = merged;
        this.phase = 'confirmation';
        break;
      }

      case 'confirmation':
        if (answer === 'confirm') {
          this.phase = 'finalized';
        } else if (answer === 'restart') {
          this.reset();
        }
        break;

      case 'finalized':
        break;
    }
  }

  /**
   * Assembles the final ProjectInterview from all collected answers.
   * Throws if called before interview is finalized.
   */
  buildProjectInterview(): ProjectInterview {
    if (this.phase !== 'finalized') {
      throw new Error('Interview is not finalized yet. Call processAnswer() until isFinalized() returns true.');
    }

    const a = this.answers;

    if (!a.projectName || !a.projectType || !a.appCategory || !a.framework || !a.language) {
      throw new Error('Interview answers are incomplete. Required fields missing.');
    }

    return {
      projectName:     a.projectName,
      projectType:     a.projectType,
      appCategory:     a.appCategory,
      framework:       a.framework,
      language:        a.language,
      database:        a.database ?? 'none',
      authRequired:    a.authRequired ?? false,
      authProvider:    a.authProvider,
      deploymentTarget:a.deploymentTarget ?? 'none',
      features:        a.features ?? [],
      additionalNotes: a.additionalNotes,
    };
  }

  reset(): void {
    this.phase = 'intent';
    this.answers = {};
    this.inferred = null;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /** Returns framework options filtered to the detected project type */
  private getFrameworkOptions(): InterviewOption[] {
    const type = this.answers.projectType ?? 'web';
    const options = FRAMEWORK_OPTIONS_BY_TYPE[type] ?? FRAMEWORK_OPTIONS_BY_TYPE['web'];

    // Highlight the AI-inferred recommendation
    return options.map((opt) => ({
      ...opt,
      isRecommended: opt.value === this.inferred?.suggestedFramework,
    }));
  }

  /**
   * CLI tools and pure desktop apps rarely need a hosted database.
   * When true, the database question still shows but without a pre-selected value.
   */
  private shouldSkipDatabase(): boolean {
    return this.answers.projectType === 'cli' || this.answers.projectType === 'desktop';
  }

  /** Returns feature options tailored to the detected app category */
  private getFeatureOptions(): InterviewOption[] {
    const category = this.answers.appCategory ?? 'custom';
    const specific = FEATURE_OPTIONS_BY_CATEGORY[category] ?? FEATURE_OPTIONS_BY_CATEGORY['custom'];

    // Mark already-inferred features as pre-selected
    return specific.map((opt) => ({
      ...opt,
      isRecommended: (this.answers.features ?? []).includes(opt.value),
    }));
  }

  /**
   * Applies free-text refinement (e.g. "change framework to Vue")
   * using simple keyword matching — no AI call needed here.
   */
  private applyRefinementText(text: string): void {
    const lower = text.toLowerCase();

    const frameworkKeywords: Array<[string, Framework]> = [
      ['vue', 'vue'], ['nuxt', 'nuxt'], ['react', 'react'],
      ['next', 'nextjs'], ['svelte', 'svelte'], ['angular', 'angular'],
      ['flutter', 'flutter'], ['expo', 'expo'], ['nest', 'nestjs'],
      ['fastify', 'fastify'], ['express', 'express'],
    ];
    for (const [keyword, fw] of frameworkKeywords) {
      if (lower.includes(keyword)) { this.answers.framework = fw; break; }
    }

    if (lower.includes('mobile')) { this.answers.projectType = 'mobile'; this.answers.framework = 'expo'; }
    if (lower.includes('backend') || lower.includes('api')) { this.answers.projectType = 'backend'; }
    if (lower.includes('postgres')) { this.answers.database = 'postgresql'; }
    if (lower.includes('mongo')) { this.answers.database = 'mongodb'; }
    if (lower.includes('supabase')) { this.answers.database = 'supabase'; }
  }

  private buildConfirmationSummary(): string {
    const a = this.answers;
    const lines = [
      `**📋 Project Summary — Please confirm:**`,
      ``,
      `- **Name:** \`${a.projectName}\``,
      `- **Type:** ${a.projectType} · ${a.appCategory}`,
      `- **Framework:** ${a.framework}`,
      `- **Language:** ${a.language}`,
      `- **Database:** ${a.database}`,
      `- **Auth:** ${a.authRequired ? a.authProvider : 'none'}`,
      `- **Deploy to:** ${a.deploymentTarget}`,
      `- **Features:** ${(a.features ?? []).slice(0, 4).join(', ') || 'none selected'}`,
    ];
    return lines.join('\n');
  }

  private calculateProgress(): number {
    const idx = PHASE_ORDER.indexOf(this.phase);
    return Math.round((idx / (PHASE_ORDER.length - 1)) * 100);
  }
}

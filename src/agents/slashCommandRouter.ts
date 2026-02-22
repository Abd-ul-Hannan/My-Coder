// src/agents/slashCommandRouter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Slash Command Router — handles /dev, /test, /docs, /review, /search, /figma
//
// Each slash command maps to a specialized agent prompt strategy.
// The router parses the command, strips the prefix, and returns an
// AgentTask that chatPanel executes via the appropriate agent.
// ─────────────────────────────────────────────────────────────────────────────

import { AIService } from '../ai/aiService';
import { WorkspaceAnalysis } from '../types';

export type SlashCommand =
  | '/dev'
  | '/test'
  | '/docs'
  | '/review'
  | '/search'
  | '/figma'
  | '/explain'
  | '/refactor'
  | '/fix'
  | '/security'
  | '/optimize';

export interface AgentTask {
  command: SlashCommand;
  userRequest: string;
  systemPrompt: string;
  requiresFiles: boolean;
  requiresWebSearch: boolean;
}

export interface SlashCommandResult {
  content: string;
  artifacts?: Array<{ path: string; content: string }>;
  todos?: string[];
}

// ─── Command Definitions ──────────────────────────────────────────────────────

const COMMAND_META: Record<SlashCommand, { description: string; systemPrompt: string; requiresFiles: boolean; requiresWebSearch: boolean }> = {
  '/dev': {
    description: 'Full development agent — plans and implements complex multi-file features',
    requiresFiles: true,
    requiresWebSearch: false,
    systemPrompt: `You are an expert full-stack developer agent.
Given a feature request and the current project state, produce a complete implementation plan followed by all necessary code changes.

Output format:
1. ## Implementation Plan — numbered steps
2. ## Files to Create/Modify — list with purpose
3. ## Code — each file as a fenced code block with the path as the language tag header

Be complete. Never use TODO or placeholders. Write production-ready code.`,
  },
  '/test': {
    description: 'Generate comprehensive tests for selected code or the whole project',
    requiresFiles: true,
    requiresWebSearch: false,
    systemPrompt: `You are a senior QA engineer specializing in automated testing.
Generate comprehensive test suites for the provided code.

Cover:
- Unit tests for all public functions
- Edge cases and error paths
- Integration tests where relevant
- Use the testing framework already in the project (detect from package.json)

Output each test file as a fenced code block with its full path. Never skip assertions.`,
  },
  '/docs': {
    description: 'Generate documentation: README, JSDoc, API reference, usage examples',
    requiresFiles: true,
    requiresWebSearch: false,
    systemPrompt: `You are a technical writer and documentation engineer.
Generate thorough, accurate documentation for the provided code.

Include:
- Function/class JSDoc comments
- README sections with usage examples
- API reference tables
- Architecture diagrams in ASCII/Mermaid

Output documentation in Markdown. Insert inline JSDoc directly into source files where requested.`,
  },
  '/review': {
    description: 'Comprehensive code review: bugs, security, performance, best practices',
    requiresFiles: true,
    requiresWebSearch: false,
    systemPrompt: `You are a principal engineer conducting a rigorous code review.

Analyze the code thoroughly across these dimensions:
1. **🐛 Bugs** — logic errors, off-by-one, null/undefined risks, race conditions
2. **🔒 Security** — XSS, SQL injection, CSRF, hardcoded secrets, OWASP Top 10, insecure dependencies
3. **⚡ Performance** — unnecessary re-renders, N+1 queries, missing indexes, memory leaks, blocking operations
4. **🎯 Type Safety** — missing types, unsafe any casts, incorrect generics, missing null checks
5. **🏗️ Architecture** — SOLID violations, coupling, cohesion, single responsibility, DRY
6. **📛 Naming** — unclear variable/function names, misleading comments, missing docs
7. **🛡️ Error Handling** — unhandled promise rejections, missing try/catch, swallowed errors
8. **♿ Accessibility** — missing aria labels, keyboard navigation, color contrast, focus management

Format your response:
## Summary
Brief overall assessment (2-3 sentences).

## Issues Found
| Severity | Category | Location | Issue | Fix |
|----------|----------|----------|-------|-----|

## Recommended Fixes
For critical/major issues, provide the corrected code snippet.

## Positive Observations
Highlight what's done well (encourages good patterns).`,
  },
  '/search': {
    description: 'Search the web for documentation, solutions, or research',
    requiresFiles: false,
    requiresWebSearch: true,
    systemPrompt: `You are a senior developer researching a technical topic.
Summarise search results clearly and concisely. Focus on practical, actionable information.
Always cite sources. Prefer official docs over blog posts.`,
  },
  '/figma': {
    description: 'Convert Figma design description or URL to production React/HTML code',
    requiresFiles: false,
    requiresWebSearch: false,
    systemPrompt: `You are a senior frontend engineer specialising in pixel-perfect UI implementation.
Convert the provided Figma design description into production-ready React + Tailwind CSS code.

Rules:
- Use Tailwind for all styling (no external CSS files)
- Use TypeScript with proper prop types
- Make components fully responsive (mobile-first)
- Add aria labels for accessibility
- Export named components
- Include hover/focus states and micro-interactions
Return complete, runnable code.`,
  },
  '/explain': {
    description: 'Explain code in simple terms with examples',
    requiresFiles: true,
    requiresWebSearch: false,
    systemPrompt: `You are a senior engineer explaining code to a junior developer.
Explain the provided code in simple, clear language.
Include: what it does, how it works, why it's written this way, potential gotchas.
Use analogies where helpful. Show simplified examples if useful.`,
  },
  '/refactor': {
    description: 'Refactor code for clarity, performance, and maintainability',
    requiresFiles: true,
    requiresWebSearch: false,
    systemPrompt: `You are a principal engineer refactoring production code.
Improve the provided code for: readability, performance, maintainability, and type safety.
Preserve all existing behaviour. Explain each change briefly.
Return the complete refactored file(s) as fenced code blocks.`,
  },
  '/fix': {
    description: 'Diagnose and fix bugs, errors, or failing tests',
    requiresFiles: true,
    requiresWebSearch: false,
    systemPrompt: `You are an expert debugger and software engineer.

Approach:
1. **Identify** the exact root cause — be specific, not vague
2. **Trace** the error through the call stack if relevant
3. **Fix ALL issues** found, not just the reported one
4. **Explain** what was wrong and why the fix works
5. **Prevent recurrence** — add input validation, error boundaries, or null checks

If the error is a TypeScript type error: fix the type, don't use 'any'.
If the error is a runtime crash: add proper null/undefined guards.
If the error is a logic bug: trace through the logic step by step.
If the error is a network/async bug: fix promise handling, add error boundaries.

Return the COMPLETE fixed file(s) as fenced code blocks. Never use TODO or placeholders.`,
  },
  '/optimize': {
    description: 'Optimize code for performance, memory, and efficiency',
    requiresFiles: true,
    requiresWebSearch: false,
    systemPrompt: `You are a performance optimization expert.
Analyze the provided code and produce optimized version with measurable improvements.

Focus on:
1. **Algorithmic complexity** — reduce O(n²) to O(n log n) where possible
2. **Memory efficiency** — eliminate unnecessary allocations, use iterators
3. **Database queries** — fix N+1 queries, add proper indexes, use batching
4. **Caching opportunities** — memoization, request deduplication
5. **Bundle size** — tree shaking, lazy loading, code splitting
6. **Rendering performance** — virtualization, debouncing, memoization
7. **Async patterns** — parallel vs sequential, connection pooling

For each change: explain what was slow, why the fix helps, expected improvement.
Return complete optimized file(s) as fenced code blocks with explanation.`,
  },
  '/security': {
    description: 'Security audit: secrets, vulnerabilities, SAST, dependency risks',
    requiresFiles: true,
    requiresWebSearch: false,
    systemPrompt: `You are a security engineer performing a SAST and dependency audit.

Check for:
1. **Hardcoded secrets** — API keys, passwords, tokens in source
2. **Injection vulnerabilities** — SQL, command, XSS, SSTI
3. **Insecure dependencies** — known CVEs (flag by name, user should check npm audit)
4. **Authentication flaws** — missing auth checks, broken session management
5. **Sensitive data exposure** — logging PII, insecure storage
6. **CORS / CSP misconfigurations**
7. **Input validation gaps**

Report each finding with: severity, file:line, description, remediation.
Use a markdown table. Mark critical findings clearly.`,
  },
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detects if the user's input starts with a slash command.
 * Returns the command and the remaining request text, or null.
 */
export function parseSlashCommand(input: string): { command: SlashCommand; request: string } | null {
  const trimmed = input.trim();
  const commands = Object.keys(COMMAND_META) as SlashCommand[];

  for (const cmd of commands) {
    if (trimmed.toLowerCase().startsWith(cmd + ' ') || trimmed.toLowerCase() === cmd) {
      return {
        command: cmd,
        request: trimmed.slice(cmd.length).trim(),
      };
    }
  }
  return null;
}

/**
 * Builds an AgentTask for a slash command, ready for chatPanel to execute.
 */
export function buildAgentTask(command: SlashCommand, request: string): AgentTask {
  const meta = COMMAND_META[command];
  return {
    command,
    userRequest: request,
    systemPrompt: meta.systemPrompt,
    requiresFiles: meta.requiresFiles,
    requiresWebSearch: meta.requiresWebSearch,
  };
}

/**
 * Returns all available slash commands with descriptions for the autocomplete UI.
 */
export function getSlashCommandList(): Array<{ command: SlashCommand; description: string }> {
  return (Object.entries(COMMAND_META) as Array<[SlashCommand, { description: string }]>).map(
    ([command, meta]) => ({ command, description: meta.description }),
  );
}

/**
 * Executes a slash command task by calling the AI with the appropriate
 * system prompt and assembled file context.
 *
 * @param task          - AgentTask from buildAgentTask()
 * @param fileContext   - Relevant file contents as a pre-assembled string
 * @param aiService     - Initialized AIService
 * @param onChunk       - Optional streaming callback
 */
export async function executeSlashCommand(
  task: AgentTask,
  fileContext: string,
  aiService: AIService,
  onChunk?: (chunk: string) => void,
): Promise<SlashCommandResult> {
  const userMessage = [
    task.userRequest ? `Request: ${task.userRequest}` : '',
    fileContext ? `\n\nProject context:\n${fileContext}` : '',
  ].filter(Boolean).join('\n');

  let content: string;
  if (onChunk) {
    content = await aiService.streamComplete(
      [{ role: 'user', content: userMessage }],
      task.systemPrompt,
      onChunk,
    );
  } else {
    const response = await aiService.complete(
      [{ role: 'user', content: userMessage }],
      task.systemPrompt,
    );
    content = response.content;
  }

  // Extract todo items if mentioned
  const todos = extractTodos(content);

  return { content, todos };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractTodos(content: string): string[] {
  const lines = content.split('\n');
  const todos: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*[-*]\s+\[\s?\]\s+(.+)/);
    if (match) todos.push(match[1].trim());
  }
  return todos;
}

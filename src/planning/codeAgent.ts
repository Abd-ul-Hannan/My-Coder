// src/planning/codeAgent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Planning Layer — generates complete file content from a FileSpec + plan.
// Moved to src/planning/ for Issue 3 (clean architecture).
//
// Responsibility: Generate one file at a time. Maintain context window summary
// of previously generated files so each new file is consistent.
// ─────────────────────────────────────────────────────────────────────────────

import { AIService } from '../ai/aiService';
import { CodeGenerationRequest, GeneratedFile, DevelopmentPlan, ProjectInterview } from '../types';

const CODE_SYSTEM_PROMPT = `You are a senior software engineer writing production-ready code.

Rules:
- Write COMPLETE, compilable code. Never use "TODO", "...", or placeholders.
- Follow best practices and idioms for the language and framework.
- Include proper error handling and TypeScript types.
- Return ONLY the raw file content — no markdown, no code fences, no commentary.
- The file must work as-is, without any modifications.`;

/**
 * Generates file content for a single file in a development plan.
 * Maintains a rolling context summary of previously generated files.
 */
export class CodeAgent {
  /** Stores the first 400 chars of each generated file for context */
  private readonly context = new Map<string, string>();

  constructor(private readonly aiService: AIService) {}

  /**
   * Generates the content of a single file.
   * Streams content as it arrives (onChunk), then returns the full string.
   */
  async generateFile(
    request: CodeGenerationRequest,
    onChunk?: (chunk: string) => void,
  ): Promise<GeneratedFile> {
    const systemPrompt = this.buildSystemPrompt(request.plan, request.interview);
    const userPrompt = this.buildUserPrompt(request);

    const content = await this.aiService.streamComplete(
      [{ role: 'user', content: userPrompt }],
      systemPrompt,
      onChunk ?? (() => undefined),
    );

    const cleaned = this.stripMarkdownFences(content);
    this.context.set(request.file.path, cleaned.slice(0, 400));

    return {
      path: request.file.path,
      content: cleaned,
      language: detectLanguage(request.file.path),
    };
  }

  /**
   * Generates a minimal patch for an existing file based on a user instruction.
   * Returns the COMPLETE updated file content (not a diff).
   */
  async generatePatch(
    filePath: string,
    originalContent: string,
    instruction: string,
    projectContext: string,
  ): Promise<string> {
    const language = detectLanguage(filePath);
    const prompt = [
      `File: ${filePath}  (${language})`,
      ``,
      `PROJECT CONTEXT:`,
      projectContext,
      ``,
      `CURRENT CONTENT:`,
      originalContent,
      ``,
      `REQUESTED CHANGE:`,
      instruction,
      ``,
      `Return the complete updated file content:`,
    ].join('\n');

    const systemPrompt = [
      'You are a senior software engineer making targeted, precise changes to existing production code.',
      '',
      'Critical rules:',
      '- Preserve ALL existing code that is not directly related to the requested change',
      '- Maintain the exact same coding style, indentation, and patterns as the original',
      '- Do NOT remove imports, exports, comments, or functions unless explicitly asked',
      '- Do NOT add unnecessary blank lines or change formatting of untouched code',
      '- If adding a feature, integrate it naturally with existing patterns',
      '- Return ONLY the complete updated file content — no markdown, no code fences, no commentary',
      '- If the change is impossible or would break the code, return the original unchanged',
    ].join('\n');

    const response = await this.aiService.complete([{ role: 'user', content: prompt }], systemPrompt);
    return this.stripMarkdownFences(response.content);
  }

  clearContext(): void {
    this.context.clear();
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private buildSystemPrompt(plan: DevelopmentPlan, interview: ProjectInterview): string {
    const contextSummary = Array.from(this.context.entries())
      .slice(-6)
      .map(([path, preview]) => `// ${path}:\n${preview}…`)
      .join('\n\n');

    return [
      CODE_SYSTEM_PROMPT,
      ``,
      `PROJECT: ${plan.projectName}  ·  Framework: ${plan.framework}  ·  Language: ${interview.language}`,
      `Database: ${interview.database}  ·  Auth: ${interview.authRequired ? interview.authProvider : 'none'}`,
      `Features: ${interview.features.join(', ') || 'none'}`,
      contextSummary ? `\nPREVIOUSLY GENERATED FILES (for context):\n${contextSummary}` : '',
    ].join('\n');
  }

  private buildUserPrompt(req: CodeGenerationRequest): string {
    const deps = req.file.dependencies?.length
      ? `\nImports from: ${req.file.dependencies.join(', ')}`
      : '';
    return [
      `Generate the complete content for: ${req.file.path}`,
      `Purpose: ${req.file.description}${deps}`,
      ``,
      `All project files for reference:`,
      req.plan.files.map((f) => `  ${f.path}`).join('\n'),
      ``,
      `Available packages: ${[...req.plan.dependencies, ...req.plan.devDependencies].map((d) => d.name).join(', ')}`,
      ``,
      `Write ${req.file.path}:`,
    ].join('\n');
  }

  private stripMarkdownFences(content: string): string {
    return content.replace(/^```[\w]*\n?/gm, '').replace(/^```\s*$/gm, '').trim();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact',
    js: 'javascript', jsx: 'javascriptreact',
    py: 'python', dart: 'dart', rs: 'rust', go: 'go',
    java: 'java', kt: 'kotlin', swift: 'swift',
    json: 'json', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', css: 'css', scss: 'scss', html: 'html',
    sh: 'bash', toml: 'toml', sql: 'sql',
  };
  return map[ext] ?? 'plaintext';
}

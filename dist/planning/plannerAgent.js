"use strict";
// src/planning/plannerAgent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Planning Layer — generates structured DevelopmentPlan from a ProjectInterview.
// Moved from src/ai/ to src/planning/ for Issue 3 (clean architecture).
//
// Responsibility: Call AI once with full project spec, parse + validate JSON plan.
// No interview logic. No state. No file I/O.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerAgent = void 0;
const PLANNER_SYSTEM_PROMPT = `You are a world-class software architect with 20 years of experience building production applications.

Given a project specification, return a COMPLETE and PRODUCTION-READY development plan as a single JSON object.
No markdown. No code fences. No explanation. Return ONLY valid JSON.

Schema:
{
  "projectName": string,
  "projectType": string,
  "appCategory": string,
  "framework": string,
  "folderStructure": string[],
  "files": [{ "path": string, "description": string, "dependencies": string[], "isEntryPoint": boolean }],
  "dependencies": [{ "name": string, "version": string, "isDev": false }],
  "devDependencies": [{ "name": string, "version": string, "isDev": true }],
  "buildInstructions": [{ "command": string, "cwd": string }],
  "initCommands": string[],
  "envVariables": [{ "key": string, "description": string, "required": boolean, "example": string }],
  "readme": string
}

Architecture rules:
- Generate a COMPLETE set of files — a partial app is useless. Every feature must be implemented.
- Include: components, pages, layouts, API routes, hooks, utilities, types, constants, middleware, config files, tests, CI/CD, Docker.
- Use the LATEST stable versions with exact semver (e.g. "^18.3.1" not "latest").
- Apply proper separation of concerns: UI, business logic, data access must be in separate layers.
- Include error boundaries, loading states, and proper TypeScript types throughout.
- For React apps: use React Query/SWR for data fetching, Zustand/Redux for complex state, React Hook Form for forms.
- For Node APIs: use proper router organization, middleware, validation (Zod), error handling middleware.
- Include environment variable validation at startup (Zod schema for process.env).
- Add a proper .env.example with all required variables documented.
- Include ESLint + Prettier config, tsconfig.json, and a complete README with setup instructions.
- Be opinionated — choose the best library for the job, don't hedge with "you could use X or Y".
- The generated app must be able to run after: npm install && npm run dev`;
/**
 * Generates a complete DevelopmentPlan from a finalized ProjectInterview.
 *
 * @param interview   - The complete interview from InterviewEngine.
 * @param aiService   - Initialized AIService to use for generation.
 * @returns           Validated DevelopmentPlan ready for ProjectBuilder.
 */
class PlannerAgent {
    aiService;
    constructor(aiService) {
        this.aiService = aiService;
    }
    async generatePlan(interview) {
        const prompt = this.buildPrompt(interview);
        const response = await this.aiService.complete([{ role: 'user', content: prompt }], PLANNER_SYSTEM_PROMPT);
        const plan = this.parsePlan(response.content, interview);
        this.validatePlan(plan);
        return plan;
    }
    /**
     * Refines an existing plan based on user feedback.
     * Used when the user asks for changes after seeing the plan.
     */
    async refinePlan(plan, feedback) {
        const prompt = `Current plan:\n${JSON.stringify(plan, null, 2)}\n\nUser feedback:\n${feedback}\n\nReturn the updated plan as JSON only.`;
        const response = await this.aiService.complete([{ role: 'user', content: prompt }], PLANNER_SYSTEM_PROMPT);
        const refined = this.parsePlan(response.content, { projectName: plan.projectName });
        this.validatePlan(refined);
        return refined;
    }
    /**
     * Sorts files so configs come first and entry points come last,
     * ensuring each file is generated after its dependencies.
     */
    sortFilesByDependency(files) {
        const configs = files.filter((f) => f.path.endsWith('.json') || f.path.endsWith('.yaml') ||
            f.path.endsWith('.yml') || f.path.includes('config') || f.path.endsWith('.env.example'));
        const entryPoints = files.filter((f) => f.isEntryPoint);
        const rest = files.filter((f) => !configs.includes(f) && !entryPoints.includes(f));
        return [...configs, ...rest, ...entryPoints];
    }
    /** Formats the plan as markdown for display in the chat panel */
    formatPlanSummary(plan) {
        return [
            `## 📋 Development Plan: \`${plan.projectName}\``,
            `**Framework:** ${plan.framework}  ·  **Category:** ${plan.appCategory}`,
            '',
            '### 📄 Files to generate',
            ...plan.files.slice(0, 12).map((f) => `- \`${f.path}\` — ${f.description}`),
            plan.files.length > 12 ? `  _…and ${plan.files.length - 12} more_` : '',
            '',
            '### 📦 Key dependencies',
            ...plan.dependencies.slice(0, 8).map((d) => `- ${d.name}@${d.version}`),
            '',
            '### 🔧 Init commands',
            '```bash',
            ...plan.initCommands.slice(0, 5),
            '```',
        ].filter((l) => l !== undefined).join('\n');
    }
    // ─── Private ─────────────────────────────────────────────────────────────
    buildPrompt(interview) {
        const authSection = interview.authRequired
            ? `Auth Provider: ${interview.authProvider}\nAuth Features: email/password login, session management, protected routes`
            : 'Auth: none (public app)';
        const dbSection = interview.database !== 'none'
            ? `Database: ${interview.database}\nDB Features: migrations, seed data, connection pooling, proper error handling`
            : 'Database: none';
        return [
            `Generate a COMPLETE, PRODUCTION-READY development plan for:`,
            ``,
            `Project Name:  ${interview.projectName}`,
            `Type:          ${interview.projectType}`,
            `Category:      ${interview.appCategory}`,
            `Framework:     ${interview.framework}`,
            `Language:      ${interview.language}`,
            dbSection,
            authSection,
            `Deploy Target: ${interview.deploymentTarget}`,
            `Features:      ${interview.features.join(', ') || 'core functionality'}`,
            interview.additionalNotes ? `Extra Notes:   ${interview.additionalNotes}` : '',
            ``,
            `Requirements:`,
            `- Generate EVERY file needed. Missing files = broken app.`,
            `- Each feature listed must be fully implemented, not stubbed.`,
            `- Include proper error handling, loading states, and TypeScript types.`,
            `- The app must work after: npm install && npm run dev`,
            ``,
            `Return ONLY the JSON plan object.`,
        ].filter(Boolean).join('\n');
    }
    parsePlan(raw, interview) {
        const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        try {
            const parsed = JSON.parse(cleaned);
            if (!parsed.projectName)
                parsed.projectName = interview.projectName;
            return parsed;
        }
        catch (err) {
            throw new Error(`PlannerAgent: failed to parse plan JSON.\nError: ${err}\nRaw:\n${cleaned.slice(0, 400)}`);
        }
    }
    validatePlan(plan) {
        const required = ['projectName', 'files', 'dependencies', 'initCommands', 'folderStructure'];
        for (const field of required) {
            if (!plan[field])
                throw new Error(`PlannerAgent: plan missing required field "${field}".`);
        }
        if (!Array.isArray(plan.files) || plan.files.length === 0) {
            throw new Error('PlannerAgent: plan must include at least one file.');
        }
    }
}
exports.PlannerAgent = PlannerAgent;
//# sourceMappingURL=plannerAgent.js.map
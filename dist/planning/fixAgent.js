"use strict";
// src/planning/fixAgent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Planning Layer — analyzes build errors and generates targeted code fixes.
// Moved to src/planning/ for Issue 3 (clean architecture).
//
// Responsibility: Given BuildResult + file contents → return file patches.
// No state between sessions. No UI.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeBuildErrorsAndFix = analyzeBuildErrorsAndFix;
const FIX_SYSTEM_PROMPT = `You are a senior build engineer and TypeScript expert who specializes in rapid error diagnosis.

Given build errors and source files, return ONLY a valid JSON object (no markdown, no fences):
{
  "analysis": "Precise root cause explanation — be specific about what is wrong and why",
  "fixes": {
    "path/to/file.ts": "complete corrected file content"
  }
}

Diagnostic strategy:
1. Read ALL errors before fixing — many are caused by one root issue
2. Identify the PRIMARY cause (often a type mismatch, missing export, or bad import)
3. Fix the root cause first — secondary errors often disappear
4. Verify your fix doesn't introduce new issues

Common build error patterns:
- "Cannot find module" → fix the import path or add missing export
- "Type X is not assignable to type Y" → fix the type, never use 'any' as a workaround
- "Property does not exist" → add the property to the interface or use optional chaining
- "is not a function" → check the import and ensure the function is exported correctly
- "Missing dependency" → add the import, don't remove the usage
- Circular dependency → restructure by moving shared types to a separate file

Rules:
- Fix ALL listed errors in one pass
- Return COMPLETE file contents for every file that needs changes
- NEVER use 'any' to suppress type errors — fix the actual type
- Preserve all existing functionality — do not remove features to make it compile
- Return ONLY valid JSON`;
/**
 * Analyzes build output and generates fixes for all detected errors.
 *
 * @param buildResult     - The failed build output with parsed errors.
 * @param fileContents    - Map of filePath → content for relevant files.
 * @param analysis        - Workspace metadata (framework, language, etc.).
 * @param attemptNumber   - 1-indexed retry attempt number (used in prompt context).
 * @param aiService       - Initialized AIService to use.
 * @returns               FixPlan with analysis and per-file corrected content.
 */
async function analyzeBuildErrorsAndFix(buildResult, fileContents, analysis, attemptNumber, aiService) {
    const errorList = buildResult.errors.map(formatError).join('\n\n');
    const filesSection = buildFilesSection(buildResult.errors, fileContents);
    const prompt = [
        `Attempt ${attemptNumber} — Fix build errors.`,
        ``,
        `PROJECT: ${analysis.rootPath}`,
        `FRAMEWORK: ${analysis.framework}  ·  LANGUAGE: ${analysis.language}`,
        ``,
        `BUILD ERRORS:`,
        errorList,
        ``,
        `LAST 2000 CHARS OF BUILD OUTPUT:`,
        buildResult.output.slice(-2000),
        ``,
        `RELEVANT SOURCE FILES:`,
        filesSection,
        ``,
        `Return the FixPlan JSON only.`,
    ].join('\n');
    const response = await aiService.complete([{ role: 'user', content: prompt }], FIX_SYSTEM_PROMPT);
    return parseFixPlan(response.content);
}
// ─── Private Helpers ──────────────────────────────────────────────────────────
function formatError(error) {
    const parts = [`ERROR: ${error.message}`];
    if (error.file)
        parts.push(`  File: ${error.file}${error.line ? `:${error.line}` : ''}`);
    if (error.code)
        parts.push(`  Code: ${error.code}`);
    return parts.join('\n');
}
/**
 * Selects only the files that are mentioned in error messages,
 * falling back to the first 10 files if none are specifically matched.
 */
function buildFilesSection(errors, fileContents) {
    const relevant = new Map();
    for (const error of errors) {
        if (!error.file)
            continue;
        const normalized = error.file.replace(/\\/g, '/');
        for (const [path, content] of fileContents.entries()) {
            if (path.endsWith(normalized) || normalized.endsWith(path)) {
                relevant.set(path, content);
            }
        }
    }
    if (relevant.size === 0) {
        let count = 0;
        for (const [path, content] of fileContents.entries()) {
            if (count++ >= 10)
                break;
            relevant.set(path, content);
        }
    }
    return Array.from(relevant.entries())
        .map(([path, content]) => `=== ${path} ===\n${content}`)
        .join('\n\n');
}
function parseFixPlan(raw) {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    }
    catch {
        // Try extracting embedded JSON
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                parsed = JSON.parse(match[0]);
            }
            catch {
                throw new Error(`FixAgent: could not parse fix plan JSON.\nRaw: ${cleaned.slice(0, 400)}`);
            }
        }
        else {
            throw new Error(`FixAgent: no JSON found in response.\nRaw: ${cleaned.slice(0, 400)}`);
        }
    }
    const obj = parsed;
    if (typeof obj['fixes'] !== 'object' || !obj['fixes']) {
        throw new Error('FixAgent: fix plan missing "fixes" object.');
    }
    return {
        analysis: typeof obj['analysis'] === 'string' ? obj['analysis'] : 'Auto-fix applied.',
        fixes: obj['fixes'],
    };
}
//# sourceMappingURL=fixAgent.js.map
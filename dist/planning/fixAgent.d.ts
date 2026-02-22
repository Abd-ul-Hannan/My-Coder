import { AIService } from '../ai/aiService';
import { BuildResult, WorkspaceAnalysis } from '../types';
export interface FixPlan {
    analysis: string;
    fixes: Record<string, string>;
}
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
export declare function analyzeBuildErrorsAndFix(buildResult: BuildResult, fileContents: Map<string, string>, analysis: WorkspaceAnalysis, attemptNumber: number, aiService: AIService): Promise<FixPlan>;
//# sourceMappingURL=fixAgent.d.ts.map
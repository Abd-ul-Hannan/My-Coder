import { AIService } from '../ai/aiService';
import { ProjectInterview, DevelopmentPlan, FileSpec } from '../types';
/**
 * Generates a complete DevelopmentPlan from a finalized ProjectInterview.
 *
 * @param interview   - The complete interview from InterviewEngine.
 * @param aiService   - Initialized AIService to use for generation.
 * @returns           Validated DevelopmentPlan ready for ProjectBuilder.
 */
export declare class PlannerAgent {
    private readonly aiService;
    constructor(aiService: AIService);
    generatePlan(interview: ProjectInterview): Promise<DevelopmentPlan>;
    /**
     * Refines an existing plan based on user feedback.
     * Used when the user asks for changes after seeing the plan.
     */
    refinePlan(plan: DevelopmentPlan, feedback: string): Promise<DevelopmentPlan>;
    /**
     * Sorts files so configs come first and entry points come last,
     * ensuring each file is generated after its dependencies.
     */
    sortFilesByDependency(files: FileSpec[]): FileSpec[];
    /** Formats the plan as markdown for display in the chat panel */
    formatPlanSummary(plan: DevelopmentPlan): string;
    private buildPrompt;
    private parsePlan;
    private validatePlan;
}
//# sourceMappingURL=plannerAgent.d.ts.map
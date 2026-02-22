import { InterviewPhase, InterviewAnswers, InterviewQuestion, ProjectInterview, InferredIntent } from '../types';
export declare class InterviewStateMachine {
    private phase;
    private answers;
    private inferred;
    /** Whether the interview is complete and ready to build. */
    isFinalized(): boolean;
    getCurrentPhase(): InterviewPhase;
    getAnswers(): Readonly<InterviewAnswers>;
    /**
     * Called by InterviewEngine after AI infers intent from free text.
     * Populates initial answers and optionally skips phases that are
     * already confidently answered.
     */
    applyInferredIntent(intent: InferredIntent): void;
    /**
     * Builds the InterviewQuestion for the current phase.
     * Returns null only when phase is 'finalized'.
     */
    getCurrentQuestion(): InterviewQuestion | null;
    /**
     * Processes the user's answer for the current phase and advances the state.
     *
     * @param answer - String for single-select or free text; string[] for multi-select.
     */
    processAnswer(answer: string | string[]): void;
    /**
     * Assembles the final ProjectInterview from all collected answers.
     * Throws if called before interview is finalized.
     */
    buildProjectInterview(): ProjectInterview;
    reset(): void;
    /** Returns framework options filtered to the detected project type */
    private getFrameworkOptions;
    /**
     * CLI tools and pure desktop apps rarely need a hosted database.
     * When true, the database question still shows but without a pre-selected value.
     */
    private shouldSkipDatabase;
    /** Returns feature options tailored to the detected app category */
    private getFeatureOptions;
    /**
     * Applies free-text refinement (e.g. "change framework to Vue")
     * using simple keyword matching — no AI call needed here.
     */
    private applyRefinementText;
    private buildConfirmationSummary;
    private calculateProgress;
}
//# sourceMappingURL=interviewStateMachine.d.ts.map
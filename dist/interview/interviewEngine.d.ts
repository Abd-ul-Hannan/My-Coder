import { AIService } from '../ai/aiService';
import { InterviewQuestion, ProjectInterview, InterviewPhase } from '../types';
export declare class InterviewEngine {
    private machine;
    private aiService;
    constructor(aiService: AIService);
    /**
     * Resets the interview and returns the first question.
     * Always call this before starting a new app session.
     */
    start(): InterviewQuestion;
    /**
     * Processes the user's answer for the current phase.
     *
     * If the current phase is 'intent', this will call the AI to infer
     * the project structure — it is the ONLY async step in the flow.
     *
     * @param answer  - Free text string or array for multi-select phases.
     * @returns       The next InterviewQuestion, or null if the interview is done.
     */
    submitAnswer(answer: string | string[]): Promise<InterviewQuestion | null>;
    /**
     * Returns the final ProjectInterview once the interview is complete.
     * Throws if called before the interview is finalized.
     */
    buildInterview(): ProjectInterview;
    /** True when the user has confirmed their selection and we can generate code */
    isComplete(): boolean;
    getCurrentPhase(): InterviewPhase;
    getProgress(): number;
    /** Reset for reuse without creating a new engine instance */
    reset(): void;
}
//# sourceMappingURL=interviewEngine.d.ts.map
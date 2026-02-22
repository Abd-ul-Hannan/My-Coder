"use strict";
// src/interview/interviewEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Issue 2 Fix — Interview Orchestrator
//
// Sits between chatPanel (UI) and InterviewStateMachine (state).
// Handles the one async operation in the flow: calling intentInferrer
// after the user submits their intent text.
//
// chatPanel calls:
//   engine.start()               → returns first question
//   engine.submitAnswer(text)    → returns next question (or null if done)
//   engine.buildInterview()      → returns final ProjectInterview
//
// Architecture rule: No VS Code API calls. No file I/O. Only orchestration.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.InterviewEngine = void 0;
const intentInferrer_1 = require("./intentInferrer");
const interviewStateMachine_1 = require("./interviewStateMachine");
class InterviewEngine {
    machine;
    aiService;
    constructor(aiService) {
        this.aiService = aiService;
        this.machine = new interviewStateMachine_1.InterviewStateMachine();
    }
    /**
     * Resets the interview and returns the first question.
     * Always call this before starting a new app session.
     */
    start() {
        this.machine.reset();
        const q = this.machine.getCurrentQuestion();
        if (!q)
            throw new Error('State machine returned null for initial phase.');
        return q;
    }
    /**
     * Processes the user's answer for the current phase.
     *
     * If the current phase is 'intent', this will call the AI to infer
     * the project structure — it is the ONLY async step in the flow.
     *
     * @param answer  - Free text string or array for multi-select phases.
     * @returns       The next InterviewQuestion, or null if the interview is done.
     */
    async submitAnswer(answer) {
        const currentPhase = this.machine.getCurrentPhase();
        // ── Special case: intent phase triggers AI inference ──────────────────
        if (currentPhase === 'intent') {
            const rawIntent = answer;
            // Advance state machine first (sets phase to 'refinement')
            this.machine.processAnswer(rawIntent);
            // Now infer intent asynchronously
            const inferred = await (0, intentInferrer_1.inferIntentFromText)(rawIntent, this.aiService);
            this.machine.applyInferredIntent(inferred);
            // Return the refinement question (shows inference result to user)
            return this.machine.getCurrentQuestion();
        }
        // ── All other phases: synchronous state transition ─────────────────────
        this.machine.processAnswer(answer);
        if (this.machine.isFinalized())
            return null;
        return this.machine.getCurrentQuestion();
    }
    /**
     * Returns the final ProjectInterview once the interview is complete.
     * Throws if called before the interview is finalized.
     */
    buildInterview() {
        return this.machine.buildProjectInterview();
    }
    /** True when the user has confirmed their selection and we can generate code */
    isComplete() {
        return this.machine.isFinalized();
    }
    getCurrentPhase() {
        return this.machine.getCurrentPhase();
    }
    getProgress() {
        return this.machine.getCurrentQuestion()?.progress ?? 100;
    }
    /** Reset for reuse without creating a new engine instance */
    reset() {
        this.machine.reset();
    }
}
exports.InterviewEngine = InterviewEngine;
//# sourceMappingURL=interviewEngine.js.map
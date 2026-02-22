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

import { AIService } from '../ai/aiService';
import { inferIntentFromText } from './intentInferrer';
import { InterviewStateMachine } from './interviewStateMachine';
import { InterviewQuestion, ProjectInterview, InterviewPhase } from '../types';

export class InterviewEngine {
  private machine: InterviewStateMachine;
  private aiService: AIService;

  constructor(aiService: AIService) {
    this.aiService = aiService;
    this.machine = new InterviewStateMachine();
  }

  /**
   * Resets the interview and returns the first question.
   * Always call this before starting a new app session.
   */
  start(): InterviewQuestion {
    this.machine.reset();
    const q = this.machine.getCurrentQuestion();
    if (!q) throw new Error('State machine returned null for initial phase.');
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
  async submitAnswer(answer: string | string[]): Promise<InterviewQuestion | null> {
    const currentPhase = this.machine.getCurrentPhase();

    // ── Special case: intent phase triggers AI inference ──────────────────
    if (currentPhase === 'intent') {
      const rawIntent = answer as string;

      // Advance state machine first (sets phase to 'refinement')
      this.machine.processAnswer(rawIntent);

      // Now infer intent asynchronously
      const inferred = await inferIntentFromText(rawIntent, this.aiService);
      this.machine.applyInferredIntent(inferred);

      // Return the refinement question (shows inference result to user)
      return this.machine.getCurrentQuestion();
    }

    // ── All other phases: synchronous state transition ─────────────────────
    this.machine.processAnswer(answer);

    if (this.machine.isFinalized()) return null;

    return this.machine.getCurrentQuestion();
  }

  /**
   * Returns the final ProjectInterview once the interview is complete.
   * Throws if called before the interview is finalized.
   */
  buildInterview(): ProjectInterview {
    return this.machine.buildProjectInterview();
  }

  /** True when the user has confirmed their selection and we can generate code */
  isComplete(): boolean {
    return this.machine.isFinalized();
  }

  getCurrentPhase(): InterviewPhase {
    return this.machine.getCurrentPhase();
  }

  getProgress(): number {
    return this.machine.getCurrentQuestion()?.progress ?? 100;
  }

  /** Reset for reuse without creating a new engine instance */
  reset(): void {
    this.machine.reset();
  }
}

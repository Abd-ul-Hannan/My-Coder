import { AIService } from '../ai/aiService';
import { InferredIntent, Framework, Database, Language } from '../types';
/**
 * Uses the AI to infer a structured project intent from free text.
 *
 * @param rawIntent   - The user's raw description, e.g. "I want to build a
 *                      Shopify clone with multi-vendor support".
 * @param aiService   - Initialized AIService to use for inference.
 * @returns           Structured InferredIntent, never throws (returns fallback on failure).
 */
export declare function inferIntentFromText(rawIntent: string, aiService: AIService): Promise<InferredIntent>;
export type { Framework, Database, Language };
//# sourceMappingURL=intentInferrer.d.ts.map
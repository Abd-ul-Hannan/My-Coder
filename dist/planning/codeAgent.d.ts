import { AIService } from '../ai/aiService';
import { CodeGenerationRequest, GeneratedFile } from '../types';
/**
 * Generates file content for a single file in a development plan.
 * Maintains a rolling context summary of previously generated files.
 */
export declare class CodeAgent {
    private readonly aiService;
    /** Stores the first 400 chars of each generated file for context */
    private readonly context;
    constructor(aiService: AIService);
    /**
     * Generates the content of a single file.
     * Streams content as it arrives (onChunk), then returns the full string.
     */
    generateFile(request: CodeGenerationRequest, onChunk?: (chunk: string) => void): Promise<GeneratedFile>;
    /**
     * Generates a minimal patch for an existing file based on a user instruction.
     * Returns the COMPLETE updated file content (not a diff).
     */
    generatePatch(filePath: string, originalContent: string, instruction: string, projectContext: string): Promise<string>;
    clearContext(): void;
    private buildSystemPrompt;
    private buildUserPrompt;
    private stripMarkdownFences;
}
export declare function detectLanguage(filePath: string): string;
//# sourceMappingURL=codeAgent.d.ts.map
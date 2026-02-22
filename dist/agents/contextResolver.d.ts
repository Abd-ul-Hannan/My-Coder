export interface ResolvedContext {
    /** The user message with @-references replaced by their resolved content */
    resolvedMessage: string;
    /** List of files that were injected */
    injectedFiles: string[];
    /** Total character count of injected context */
    contextSize: number;
}
export interface SavedPrompt {
    name: string;
    content: string;
    description?: string;
}
/**
 * Detects whether a user message contains any @-references.
 */
export declare function hasContextReferences(message: string): boolean;
/**
 * Resolves all @-references in a user message and returns enriched context.
 *
 * @param message         - Raw user message possibly containing @-references
 * @param workspaceRoot   - Absolute path to the workspace root
 * @param savedPrompts    - User's custom saved prompts
 * @param tavilyKey       - Optional Tavily API key for @url: references
 */
export declare function resolveContextReferences(message: string, workspaceRoot: string, savedPrompts?: SavedPrompt[], tavilyKey?: string): Promise<ResolvedContext>;
/**
 * Returns all @-references found in a message for autocomplete suggestions.
 */
export declare function detectAtReferencePrefix(inputSoFar: string): string | null;
//# sourceMappingURL=contextResolver.d.ts.map
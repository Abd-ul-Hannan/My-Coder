import { AIService } from '../ai/aiService';
export type SlashCommand = '/dev' | '/test' | '/docs' | '/review' | '/search' | '/figma' | '/explain' | '/refactor' | '/fix' | '/security' | '/optimize';
export interface AgentTask {
    command: SlashCommand;
    userRequest: string;
    systemPrompt: string;
    requiresFiles: boolean;
    requiresWebSearch: boolean;
}
export interface SlashCommandResult {
    content: string;
    artifacts?: Array<{
        path: string;
        content: string;
    }>;
    todos?: string[];
}
/**
 * Detects if the user's input starts with a slash command.
 * Returns the command and the remaining request text, or null.
 */
export declare function parseSlashCommand(input: string): {
    command: SlashCommand;
    request: string;
} | null;
/**
 * Builds an AgentTask for a slash command, ready for chatPanel to execute.
 */
export declare function buildAgentTask(command: SlashCommand, request: string): AgentTask;
/**
 * Returns all available slash commands with descriptions for the autocomplete UI.
 */
export declare function getSlashCommandList(): Array<{
    command: SlashCommand;
    description: string;
}>;
/**
 * Executes a slash command task by calling the AI with the appropriate
 * system prompt and assembled file context.
 *
 * @param task          - AgentTask from buildAgentTask()
 * @param fileContext   - Relevant file contents as a pre-assembled string
 * @param aiService     - Initialized AIService
 * @param onChunk       - Optional streaming callback
 */
export declare function executeSlashCommand(task: AgentTask, fileContext: string, aiService: AIService, onChunk?: (chunk: string) => void): Promise<SlashCommandResult>;
//# sourceMappingURL=slashCommandRouter.d.ts.map
export interface LoadedRules {
    content: string;
    sources: string[];
    isEmpty: boolean;
}
/**
 * Loads all project-level AI rules from standard locations.
 * Results are cached per workspace root for the session.
 */
export declare function loadProjectRules(workspaceRoot: string): Promise<LoadedRules>;
/**
 * Creates the .mycoder/rules/ directory structure with a starter rules file.
 * Called when user runs "MY Coder: Initialize Rules".
 */
export declare function initializeRulesDirectory(workspaceRoot: string): Promise<string>;
//# sourceMappingURL=rulesLoader.d.ts.map
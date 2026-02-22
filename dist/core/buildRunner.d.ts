import { BuildResult, WorkspaceAnalysis } from '../types';
export declare class BuildRunner {
    run(analysis: WorkspaceAnalysis, customCommand?: string, onOutput?: (line: string) => void): Promise<BuildResult>;
    runInstall(rootPath: string, packageManager: WorkspaceAnalysis['packageManager'], onOutput?: (line: string) => void): Promise<BuildResult>;
    runTypeCheck(rootPath: string, onOutput?: (line: string) => void): Promise<BuildResult>;
    private execute;
    private parseErrors;
    private parseTsErrors;
    private parseWarnings;
    formatBuildResult(result: BuildResult): string;
}
//# sourceMappingURL=buildRunner.d.ts.map
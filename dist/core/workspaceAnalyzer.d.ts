import { WorkspaceAnalysis } from '../types';
export declare class WorkspaceAnalyzer {
    analyze(workspacePath: string): Promise<WorkspaceAnalysis>;
    private detectFramework;
    private detectLanguage;
    private detectPackageManager;
    private findConfigFiles;
    private findEntryPoints;
    private readPackageJson;
    private buildProjectStructure;
    private listSourceFiles;
    private inferBuildCommand;
    private inferTestCommand;
    readFileContent(filePath: string): Promise<string>;
    readWorkspaceFiles(rootPath: string, filePaths: string[]): Promise<Map<string, string>>;
    private fileExists;
    formatAnalysisForDisplay(analysis: WorkspaceAnalysis): string;
}
//# sourceMappingURL=workspaceAnalyzer.d.ts.map
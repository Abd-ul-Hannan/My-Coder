import { DevelopmentPlan, GeneratedFile } from '../types';
export interface BuildProgress {
    total: number;
    current: number;
    currentFile: string;
    phase: 'structure' | 'files' | 'complete';
}
export type ProgressCallback = (progress: BuildProgress) => void;
export declare class ProjectBuilder {
    createProjectStructure(targetDir: string, plan: DevelopmentPlan): Promise<void>;
    writeFile(targetDir: string, generatedFile: GeneratedFile): Promise<void>;
    writeAllFiles(targetDir: string, generatedFiles: GeneratedFile[], onProgress?: ProgressCallback): Promise<void>;
    generateEnvFile(targetDir: string, plan: DevelopmentPlan): Promise<void>;
    generateGitignore(targetDir: string, plan: DevelopmentPlan): Promise<void>;
    openProjectInVSCode(targetDir: string): Promise<void>;
    openFilesInEditor(targetDir: string, filePaths: string[]): Promise<void>;
    getTargetDir(parentDir: string, projectName: string): string;
    promptForTargetDirectory(): Promise<string | undefined>;
    verifyWritePermissions(targetDir: string): Promise<boolean>;
    fileCount(targetDir: string): Promise<number>;
}
//# sourceMappingURL=projectBuilder.d.ts.map
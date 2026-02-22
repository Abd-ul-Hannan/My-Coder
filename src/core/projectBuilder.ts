// src/core/projectBuilder.ts
// Creates project files and folders from a DevelopmentPlan

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { DevelopmentPlan, GeneratedFile } from '../types';

export interface BuildProgress {
  total: number;
  current: number;
  currentFile: string;
  phase: 'structure' | 'files' | 'complete';
}

export type ProgressCallback = (progress: BuildProgress) => void;

export class ProjectBuilder {
  async createProjectStructure(
    targetDir: string,
    plan: DevelopmentPlan
  ): Promise<void> {
    // Create root directory
    await fs.mkdir(targetDir, { recursive: true });

    // Create all folders from folderStructure
    for (const folder of plan.folderStructure) {
      const folderPath = path.join(targetDir, folder);
      await fs.mkdir(folderPath, { recursive: true });
    }

    // Ensure parent directories for all file paths
    for (const fileSpec of plan.files) {
      const filePath = path.join(targetDir, fileSpec.path);
      const parentDir = path.dirname(filePath);
      await fs.mkdir(parentDir, { recursive: true });
    }
  }

  async writeFile(
    targetDir: string,
    generatedFile: GeneratedFile
  ): Promise<void> {
    const filePath = path.join(targetDir, generatedFile.path);
    const parentDir = path.dirname(filePath);

    await fs.mkdir(parentDir, { recursive: true });
    await fs.writeFile(filePath, generatedFile.content, 'utf-8');
  }

  async writeAllFiles(
    targetDir: string,
    generatedFiles: GeneratedFile[],
    onProgress?: ProgressCallback
  ): Promise<void> {
    for (let i = 0; i < generatedFiles.length; i++) {
      const file = generatedFiles[i];

      onProgress?.({
        total: generatedFiles.length,
        current: i + 1,
        currentFile: file.path,
        phase: 'files'
      });

      await this.writeFile(targetDir, file);
    }

    onProgress?.({
      total: generatedFiles.length,
      current: generatedFiles.length,
      currentFile: '',
      phase: 'complete'
    });
  }

  async generateEnvFile(
    targetDir: string,
    plan: DevelopmentPlan
  ): Promise<void> {
    if (!plan.envVariables || plan.envVariables.length === 0) return;

    const envLines = plan.envVariables.map(env => {
      const comment = `# ${env.description}${env.required ? ' (required)' : ' (optional)'}`;
      const value = env.example ? `${env.key}=${env.example}` : `${env.key}=`;
      return `${comment}\n${value}`;
    });

    const envContent = envLines.join('\n\n');

    // Write .env.example (safe to commit)
    await fs.writeFile(
      path.join(targetDir, '.env.example'),
      envContent + '\n',
      'utf-8'
    );

    // Write .env only if it doesn't exist
    const envPath = path.join(targetDir, '.env');
    try {
      await fs.access(envPath);
      // Already exists, don't overwrite
    } catch {
      await fs.writeFile(envPath, envContent + '\n', 'utf-8');
    }
  }

  async generateGitignore(targetDir: string, plan: DevelopmentPlan): Promise<void> {
    const standard = [
      '# Dependencies',
      'node_modules/',
      '.pnp',
      '.pnp.js',
      '',
      '# Build outputs',
      'dist/',
      'build/',
      '.next/',
      '.nuxt/',
      'out/',
      '',
      '# Environment',
      '.env',
      '.env.local',
      '.env.development.local',
      '.env.test.local',
      '.env.production.local',
      '',
      '# Debug',
      'npm-debug.log*',
      'yarn-debug.log*',
      'yarn-error.log*',
      '',
      '# Editor',
      '.vscode/',
      '.idea/',
      '*.swp',
      '*.swo',
      '',
      '# OS',
      '.DS_Store',
      'Thumbs.db',
      '',
      '# Testing',
      'coverage/',
      '.nyc_output',
      '',
      '# TypeScript',
      '*.tsbuildinfo'
    ];

    if (plan.framework === 'flutter') {
      standard.push('', '# Flutter', '.dart_tool/', '.packages', '*.g.dart', '*.freezed.dart');
    }

    await fs.writeFile(
      path.join(targetDir, '.gitignore'),
      standard.join('\n') + '\n',
      'utf-8'
    );
  }

  async openProjectInVSCode(targetDir: string): Promise<void> {
    const uri = vscode.Uri.file(targetDir);
    await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false });
  }

  async openFilesInEditor(targetDir: string, filePaths: string[]): Promise<void> {
    for (const filePath of filePaths.slice(0, 3)) {
      try {
        const uri = vscode.Uri.file(path.join(targetDir, filePath));
        await vscode.window.showTextDocument(uri, { preview: false });
      } catch {
        // File may not exist yet
      }
    }
  }

  getTargetDir(parentDir: string, projectName: string): string {
    return path.join(parentDir, projectName);
  }

  async promptForTargetDirectory(): Promise<string | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const defaultUri = workspaceFolders?.[0]?.uri
      ? vscode.Uri.joinPath(workspaceFolders[0].uri, '..')
      : vscode.Uri.file(process.env['HOME'] ?? '/');

    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select parent folder for new project',
      defaultUri
    });

    return selected?.[0]?.fsPath;
  }

  async verifyWritePermissions(targetDir: string): Promise<boolean> {
    try {
      const testFile = path.join(targetDir, '.my-coder-test');
      await fs.writeFile(testFile, '');
      await fs.unlink(testFile);
      return true;
    } catch {
      return false;
    }
  }

  async fileCount(targetDir: string): Promise<number> {
    let count = 0;
    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        if (entry.isDirectory()) {
          await walk(path.join(dir, entry.name));
        } else {
          count++;
        }
      }
    };
    try {
      await walk(targetDir);
    } catch {
      // Directory might not exist yet
    }
    return count;
  }
}

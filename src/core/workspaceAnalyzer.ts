// src/core/workspaceAnalyzer.ts
// Analyzes existing workspaces to detect framework, structure, and entry points

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { WorkspaceAnalysis, Framework } from '../types';

interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  main?: string;
  module?: string;
}

export class WorkspaceAnalyzer {
  async analyze(workspacePath: string): Promise<WorkspaceAnalysis> {
    const [
      framework,
      language,
      packageManager,
      configFiles,
      entryPoints,
      packageJson,
      projectStructure,
      detectedFiles
    ] = await Promise.all([
      this.detectFramework(workspacePath),
      this.detectLanguage(workspacePath),
      this.detectPackageManager(workspacePath),
      this.findConfigFiles(workspacePath),
      this.findEntryPoints(workspacePath),
      this.readPackageJson(workspacePath),
      this.buildProjectStructure(workspacePath),
      this.listSourceFiles(workspacePath)
    ]);

    const buildCommand = this.inferBuildCommand(framework, packageManager, packageJson);
    const testCommand = this.inferTestCommand(packageJson);

    return {
      rootPath: workspacePath,
      framework,
      language,
      packageManager,
      entryPoints,
      configFiles,
      buildCommand,
      testCommand,
      projectStructure,
      detectedFiles,
      packageJson: packageJson as Record<string, unknown> | undefined
    };
  }

  private async detectFramework(rootPath: string): Promise<Framework | 'unknown'> {
    try {
      const pkgJson = await this.readPackageJson(rootPath);
      if (!pkgJson) return 'unknown';

      const allDeps = {
        ...pkgJson.dependencies,
        ...pkgJson.devDependencies
      };

      // Check in priority order
      if (allDeps['next']) return 'nextjs';
      if (allDeps['nuxt'] || allDeps['nuxt3']) return 'nuxt';
      if (allDeps['@angular/core']) return 'angular';
      if (allDeps['svelte'] || allDeps['@sveltejs/kit']) return 'svelte';
      if (allDeps['vue']) return 'vue';
      if (allDeps['react']) return 'react';
      if (allDeps['@nestjs/core']) return 'nestjs';
      if (allDeps['fastify']) return 'fastify';
      if (allDeps['express']) return 'express';
      if (allDeps['hono']) return 'hono';
      if (allDeps['electron']) return 'electron';

      // Check for pubspec.yaml (Flutter)
      const hasPubspec = await this.fileExists(path.join(rootPath, 'pubspec.yaml'));
      if (hasPubspec) return 'flutter';

      return 'none';
    } catch {
      return 'unknown';
    }
  }

  private async detectLanguage(rootPath: string): Promise<string> {
    const [hasTsConfig, hasPubspec, hasPyProject, hasGoMod, hasCargoToml] = await Promise.all([
      this.fileExists(path.join(rootPath, 'tsconfig.json')),
      this.fileExists(path.join(rootPath, 'pubspec.yaml')),
      this.fileExists(path.join(rootPath, 'pyproject.toml')),
      this.fileExists(path.join(rootPath, 'go.mod')),
      this.fileExists(path.join(rootPath, 'Cargo.toml'))
    ]);

    if (hasTsConfig) return 'typescript';
    if (hasPubspec) return 'dart';
    if (hasPyProject) return 'python';
    if (hasGoMod) return 'go';
    if (hasCargoToml) return 'rust';
    return 'javascript';
  }

  private async detectPackageManager(rootPath: string): Promise<WorkspaceAnalysis['packageManager']> {
    const [hasPnpm, hasYarnLock, hasBunLock, hasPkgLock, hasPubspec, hasPipfile, hasGoMod, hasCargo] =
      await Promise.all([
        this.fileExists(path.join(rootPath, 'pnpm-lock.yaml')),
        this.fileExists(path.join(rootPath, 'yarn.lock')),
        this.fileExists(path.join(rootPath, 'bun.lockb')),
        this.fileExists(path.join(rootPath, 'package-lock.json')),
        this.fileExists(path.join(rootPath, 'pubspec.yaml')),
        this.fileExists(path.join(rootPath, 'Pipfile')),
        this.fileExists(path.join(rootPath, 'go.mod')),
        this.fileExists(path.join(rootPath, 'Cargo.toml'))
      ]);

    if (hasPnpm) return 'pnpm';
    if (hasYarnLock) return 'yarn';
    if (hasBunLock) return 'bun';
    if (hasPkgLock) return 'npm';
    if (hasPubspec) return 'pub';
    if (hasPipfile) return 'pip';
    if (hasGoMod) return 'go';
    if (hasCargo) return 'cargo';
    return 'none';
  }

  private async findConfigFiles(rootPath: string): Promise<string[]> {
    const configNames = [
      'tsconfig.json', 'jsconfig.json', '.eslintrc.js', '.eslintrc.json',
      '.prettierrc', '.prettierrc.json', 'vite.config.ts', 'vite.config.js',
      'next.config.js', 'next.config.ts', 'nuxt.config.ts', 'webpack.config.js',
      'jest.config.ts', 'jest.config.js', 'vitest.config.ts', 'tailwind.config.ts',
      'tailwind.config.js', 'postcss.config.js', '.env', '.env.example',
      'docker-compose.yml', 'Dockerfile', '.github/workflows/ci.yml',
      'pubspec.yaml', 'pyproject.toml', 'go.mod', 'Cargo.toml'
    ];

    const found: string[] = [];
    for (const name of configNames) {
      if (await this.fileExists(path.join(rootPath, name))) {
        found.push(name);
      }
    }
    return found;
  }

  private async findEntryPoints(rootPath: string): Promise<string[]> {
    const candidates = [
      'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js',
      'src/app.ts', 'src/app.js', 'src/server.ts', 'src/server.js',
      'index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js',
      'lib/index.ts', 'lib/index.js',
      'src/App.tsx', 'src/App.jsx',
      'pages/_app.tsx', 'pages/_app.js',
      'app/layout.tsx', 'app/page.tsx',
      'bin/index.ts', 'bin/cli.ts'
    ];

    const found: string[] = [];
    for (const candidate of candidates) {
      if (await this.fileExists(path.join(rootPath, candidate))) {
        found.push(candidate);
      }
    }
    return found;
  }

  private async readPackageJson(rootPath: string): Promise<PackageJson | undefined> {
    try {
      const pkgPath = path.join(rootPath, 'package.json');
      const content = await fs.readFile(pkgPath, 'utf-8');
      return JSON.parse(content) as PackageJson;
    } catch {
      return undefined;
    }
  }

  private async buildProjectStructure(rootPath: string, depth: number = 3): Promise<string> {
    const lines: string[] = [];

    const walk = async (dir: string, currentDepth: number, prefix: string): Promise<void> => {
      if (currentDepth > depth) return;

      let entries: string[];
      try {
        entries = await fs.readdir(dir);
      } catch {
        return;
      }

      const ignoreDirs = new Set([
        'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
        '__pycache__', '.dart_tool', 'target', 'vendor', '.idea', '.vscode'
      ]);

      const filtered = entries
        .filter(e => !e.startsWith('.') || e === '.env.example')
        .filter(e => !ignoreDirs.has(e))
        .sort();

      for (let i = 0; i < filtered.length; i++) {
        const entry = filtered[i];
        const isLast = i === filtered.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const entryPath = path.join(dir, entry);

        let stat;
        try {
          stat = await fs.stat(entryPath);
        } catch {
          continue;
        }

        lines.push(`${prefix}${connector}${entry}`);

        if (stat.isDirectory()) {
          const newPrefix = prefix + (isLast ? '    ' : '│   ');
          await walk(entryPath, currentDepth + 1, newPrefix);
        }
      }
    };

    const dirName = path.basename(rootPath);
    lines.push(dirName);
    await walk(rootPath, 1, '');
    return lines.join('\n');
  }

  private async listSourceFiles(rootPath: string): Promise<string[]> {
    const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.dart', '.rs', '.go'];
    const files: string[] = [];

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 5) return;

      const ignoreDirs = new Set([
        'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
        '__pycache__', 'target', 'vendor'
      ]);

      let entries: string[];
      try {
        entries = await fs.readdir(dir);
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        const fullPath = path.join(dir, entry);
        const relativePath = path.relative(rootPath, fullPath);

        let stat;
        try {
          stat = await fs.stat(fullPath);
        } catch {
          continue;
        }

        if (stat.isDirectory()) {
          if (!ignoreDirs.has(entry)) {
            await walk(fullPath, depth + 1);
          }
        } else {
          const ext = path.extname(entry);
          if (sourceExtensions.includes(ext)) {
            files.push(relativePath.replace(/\\/g, '/'));
          }
        }
      }
    };

    await walk(rootPath, 1);
    return files.slice(0, 100); // Cap at 100 files
  }

  private inferBuildCommand(
    framework: Framework | 'unknown',
    packageManager: WorkspaceAnalysis['packageManager'],
    packageJson?: PackageJson
  ): string | undefined {
    const pm = packageManager === 'npm' ? 'npm run' :
                packageManager === 'yarn' ? 'yarn' :
                packageManager === 'pnpm' ? 'pnpm' :
                packageManager === 'bun' ? 'bun run' : null;

    if (!pm) return undefined;

    if (packageJson?.scripts?.build) {
      return `${pm} build`;
    }

    if (packageJson?.scripts?.['type-check']) {
      return `${pm} type-check`;
    }

    return undefined;
  }

  private inferTestCommand(packageJson?: PackageJson): string | undefined {
    if (packageJson?.scripts?.test) {
      return 'npm test';
    }
    return undefined;
  }

  async readFileContent(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  async readWorkspaceFiles(rootPath: string, filePaths: string[]): Promise<Map<string, string>> {
    const contents = new Map<string, string>();
    await Promise.all(
      filePaths.map(async (relPath) => {
        try {
          const fullPath = path.join(rootPath, relPath);
          const content = await fs.readFile(fullPath, 'utf-8');
          contents.set(relPath, content);
        } catch {
          // File not readable, skip
        }
      })
    );
    return contents;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  formatAnalysisForDisplay(analysis: WorkspaceAnalysis): string {
    const lines = [
      `## 🔍 Workspace Analysis`,
      '',
      `**Framework:** ${analysis.framework}`,
      `**Language:** ${analysis.language}`,
      `**Package Manager:** ${analysis.packageManager}`,
      '',
      '### 📄 Entry Points',
      ...analysis.entryPoints.map(e => `- \`${e}\``),
      '',
      '### ⚙️ Config Files',
      ...analysis.configFiles.slice(0, 8).map(c => `- \`${c}\``),
      ''
    ];

    if (analysis.buildCommand) {
      lines.push(`**Build Command:** \`${analysis.buildCommand}\``);
    }

    lines.push('', '### 📁 Project Structure', '```', analysis.projectStructure, '```');

    return lines.join('\n');
  }
}

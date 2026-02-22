"use strict";
// src/core/workspaceAnalyzer.ts
// Analyzes existing workspaces to detect framework, structure, and entry points
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceAnalyzer = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
class WorkspaceAnalyzer {
    async analyze(workspacePath) {
        const [framework, language, packageManager, configFiles, entryPoints, packageJson, projectStructure, detectedFiles] = await Promise.all([
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
            packageJson: packageJson
        };
    }
    async detectFramework(rootPath) {
        try {
            const pkgJson = await this.readPackageJson(rootPath);
            if (!pkgJson)
                return 'unknown';
            const allDeps = {
                ...pkgJson.dependencies,
                ...pkgJson.devDependencies
            };
            // Check in priority order
            if (allDeps['next'])
                return 'nextjs';
            if (allDeps['nuxt'] || allDeps['nuxt3'])
                return 'nuxt';
            if (allDeps['@angular/core'])
                return 'angular';
            if (allDeps['svelte'] || allDeps['@sveltejs/kit'])
                return 'svelte';
            if (allDeps['vue'])
                return 'vue';
            if (allDeps['react'])
                return 'react';
            if (allDeps['@nestjs/core'])
                return 'nestjs';
            if (allDeps['fastify'])
                return 'fastify';
            if (allDeps['express'])
                return 'express';
            if (allDeps['hono'])
                return 'hono';
            if (allDeps['electron'])
                return 'electron';
            // Check for pubspec.yaml (Flutter)
            const hasPubspec = await this.fileExists(path.join(rootPath, 'pubspec.yaml'));
            if (hasPubspec)
                return 'flutter';
            return 'none';
        }
        catch {
            return 'unknown';
        }
    }
    async detectLanguage(rootPath) {
        const [hasTsConfig, hasPubspec, hasPyProject, hasGoMod, hasCargoToml] = await Promise.all([
            this.fileExists(path.join(rootPath, 'tsconfig.json')),
            this.fileExists(path.join(rootPath, 'pubspec.yaml')),
            this.fileExists(path.join(rootPath, 'pyproject.toml')),
            this.fileExists(path.join(rootPath, 'go.mod')),
            this.fileExists(path.join(rootPath, 'Cargo.toml'))
        ]);
        if (hasTsConfig)
            return 'typescript';
        if (hasPubspec)
            return 'dart';
        if (hasPyProject)
            return 'python';
        if (hasGoMod)
            return 'go';
        if (hasCargoToml)
            return 'rust';
        return 'javascript';
    }
    async detectPackageManager(rootPath) {
        const [hasPnpm, hasYarnLock, hasBunLock, hasPkgLock, hasPubspec, hasPipfile, hasGoMod, hasCargo] = await Promise.all([
            this.fileExists(path.join(rootPath, 'pnpm-lock.yaml')),
            this.fileExists(path.join(rootPath, 'yarn.lock')),
            this.fileExists(path.join(rootPath, 'bun.lockb')),
            this.fileExists(path.join(rootPath, 'package-lock.json')),
            this.fileExists(path.join(rootPath, 'pubspec.yaml')),
            this.fileExists(path.join(rootPath, 'Pipfile')),
            this.fileExists(path.join(rootPath, 'go.mod')),
            this.fileExists(path.join(rootPath, 'Cargo.toml'))
        ]);
        if (hasPnpm)
            return 'pnpm';
        if (hasYarnLock)
            return 'yarn';
        if (hasBunLock)
            return 'bun';
        if (hasPkgLock)
            return 'npm';
        if (hasPubspec)
            return 'pub';
        if (hasPipfile)
            return 'pip';
        if (hasGoMod)
            return 'go';
        if (hasCargo)
            return 'cargo';
        return 'none';
    }
    async findConfigFiles(rootPath) {
        const configNames = [
            'tsconfig.json', 'jsconfig.json', '.eslintrc.js', '.eslintrc.json',
            '.prettierrc', '.prettierrc.json', 'vite.config.ts', 'vite.config.js',
            'next.config.js', 'next.config.ts', 'nuxt.config.ts', 'webpack.config.js',
            'jest.config.ts', 'jest.config.js', 'vitest.config.ts', 'tailwind.config.ts',
            'tailwind.config.js', 'postcss.config.js', '.env', '.env.example',
            'docker-compose.yml', 'Dockerfile', '.github/workflows/ci.yml',
            'pubspec.yaml', 'pyproject.toml', 'go.mod', 'Cargo.toml'
        ];
        const found = [];
        for (const name of configNames) {
            if (await this.fileExists(path.join(rootPath, name))) {
                found.push(name);
            }
        }
        return found;
    }
    async findEntryPoints(rootPath) {
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
        const found = [];
        for (const candidate of candidates) {
            if (await this.fileExists(path.join(rootPath, candidate))) {
                found.push(candidate);
            }
        }
        return found;
    }
    async readPackageJson(rootPath) {
        try {
            const pkgPath = path.join(rootPath, 'package.json');
            const content = await fs.readFile(pkgPath, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return undefined;
        }
    }
    async buildProjectStructure(rootPath, depth = 3) {
        const lines = [];
        const walk = async (dir, currentDepth, prefix) => {
            if (currentDepth > depth)
                return;
            let entries;
            try {
                entries = await fs.readdir(dir);
            }
            catch {
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
                }
                catch {
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
    async listSourceFiles(rootPath) {
        const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.dart', '.rs', '.go'];
        const files = [];
        const walk = async (dir, depth) => {
            if (depth > 5)
                return;
            const ignoreDirs = new Set([
                'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
                '__pycache__', 'target', 'vendor'
            ]);
            let entries;
            try {
                entries = await fs.readdir(dir);
            }
            catch {
                return;
            }
            for (const entry of entries) {
                if (entry.startsWith('.'))
                    continue;
                const fullPath = path.join(dir, entry);
                const relativePath = path.relative(rootPath, fullPath);
                let stat;
                try {
                    stat = await fs.stat(fullPath);
                }
                catch {
                    continue;
                }
                if (stat.isDirectory()) {
                    if (!ignoreDirs.has(entry)) {
                        await walk(fullPath, depth + 1);
                    }
                }
                else {
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
    inferBuildCommand(framework, packageManager, packageJson) {
        const pm = packageManager === 'npm' ? 'npm run' :
            packageManager === 'yarn' ? 'yarn' :
                packageManager === 'pnpm' ? 'pnpm' :
                    packageManager === 'bun' ? 'bun run' : null;
        if (!pm)
            return undefined;
        if (packageJson?.scripts?.build) {
            return `${pm} build`;
        }
        if (packageJson?.scripts?.['type-check']) {
            return `${pm} type-check`;
        }
        return undefined;
    }
    inferTestCommand(packageJson) {
        if (packageJson?.scripts?.test) {
            return 'npm test';
        }
        return undefined;
    }
    async readFileContent(filePath) {
        return fs.readFile(filePath, 'utf-8');
    }
    async readWorkspaceFiles(rootPath, filePaths) {
        const contents = new Map();
        await Promise.all(filePaths.map(async (relPath) => {
            try {
                const fullPath = path.join(rootPath, relPath);
                const content = await fs.readFile(fullPath, 'utf-8');
                contents.set(relPath, content);
            }
            catch {
                // File not readable, skip
            }
        }));
        return contents;
    }
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    formatAnalysisForDisplay(analysis) {
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
exports.WorkspaceAnalyzer = WorkspaceAnalyzer;
//# sourceMappingURL=workspaceAnalyzer.js.map
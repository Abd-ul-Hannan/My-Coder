// src/core/buildRunner.ts
// Executes build commands and parses output into structured errors/warnings

import * as child_process from 'child_process';
import * as path from 'path';
import { BuildResult, BuildError, BuildWarning, WorkspaceAnalysis } from '../types';

export class BuildRunner {
  async run(
    analysis: WorkspaceAnalysis,
    customCommand?: string,
    onOutput?: (line: string) => void
  ): Promise<BuildResult> {
    const command = customCommand ?? analysis.buildCommand;

    if (!command) {
      return {
        success: false,
        output: 'No build command available',
        errors: [{ message: 'No build command configured', severity: 'error' }],
        warnings: [],
        exitCode: -1,
        duration: 0
      };
    }

    const start = Date.now();
    const result = await this.execute(command, analysis.rootPath, onOutput);
    const duration = Date.now() - start;

    const errors = this.parseErrors(result.output, analysis.framework as string);
    const warnings = this.parseWarnings(result.output);

    return {
      success: result.exitCode === 0 && errors.length === 0,
      output: result.output,
      errors,
      warnings,
      exitCode: result.exitCode,
      duration
    };
  }

  async runInstall(
    rootPath: string,
    packageManager: WorkspaceAnalysis['packageManager'],
    onOutput?: (line: string) => void
  ): Promise<BuildResult> {
    const commandMap: Record<string, string> = {
      npm: 'npm install',
      yarn: 'yarn install',
      pnpm: 'pnpm install',
      bun: 'bun install',
      pip: 'pip install -r requirements.txt',
      pub: 'flutter pub get',
      cargo: 'cargo build',
      go: 'go mod download',
      none: 'npm install'
    };

    const command = commandMap[packageManager] ?? 'npm install';
    const start = Date.now();
    const result = await this.execute(command, rootPath, onOutput);

    return {
      success: result.exitCode === 0,
      output: result.output,
      errors: result.exitCode !== 0
        ? [{ message: `Installation failed: ${result.output.slice(-500)}`, severity: 'fatal' }]
        : [],
      warnings: [],
      exitCode: result.exitCode,
      duration: Date.now() - start
    };
  }

  async runTypeCheck(
    rootPath: string,
    onOutput?: (line: string) => void
  ): Promise<BuildResult> {
    const start = Date.now();
    const result = await this.execute('npx tsc --noEmit', rootPath, onOutput);

    const errors = this.parseTsErrors(result.output);

    return {
      success: result.exitCode === 0,
      output: result.output,
      errors,
      warnings: [],
      exitCode: result.exitCode,
      duration: Date.now() - start
    };
  }

  private execute(
    command: string,
    cwd: string,
    onOutput?: (line: string) => void
  ): Promise<{ output: string; exitCode: number }> {
    return new Promise((resolve) => {
      const parts = command.split(' ');
      const cmd = parts[0];
      const args = parts.slice(1);

      let output = '';

      const proc = child_process.spawn(cmd, args, {
        cwd,
        shell: true,
        env: { ...process.env }
      });

      proc.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        output += text;
        onOutput?.(text);
      });

      proc.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        output += text;
        onOutput?.(text);
      });

      proc.on('close', (code) => {
        resolve({ output, exitCode: code ?? 1 });
      });

      proc.on('error', (err) => {
        output += `\nProcess error: ${err.message}`;
        resolve({ output, exitCode: 1 });
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        proc.kill();
        output += '\nBuild timed out after 5 minutes';
        resolve({ output, exitCode: 124 });
      }, 5 * 60 * 1000);
    });
  }

  private parseErrors(output: string, framework: string): BuildError[] {
    const errors: BuildError[] = [];

    // TypeScript errors: "src/file.ts(10,5): error TS2345: ..."
    const tsPattern = /(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)/g;
    for (const match of output.matchAll(tsPattern)) {
      errors.push({
        file: match[1].trim(),
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        code: match[4],
        message: match[5].trim(),
        severity: 'error'
      });
    }

    if (errors.length > 0) return errors;

    // Vite/Rollup errors: "[vite] Error: ..."
    const vitePattern = /\[vite\].*?error:?\s+(.+)/gi;
    for (const match of output.matchAll(vitePattern)) {
      errors.push({ message: match[1].trim(), severity: 'error' });
    }

    // Next.js build errors
    const nextPattern = /Error:?\s+(.+?)(?:\n|$)/gm;
    if (framework.includes('next') && errors.length === 0) {
      for (const match of output.matchAll(nextPattern)) {
        if (!match[1].includes('at ') && match[1].length < 300) {
          errors.push({ message: match[1].trim(), severity: 'error' });
        }
      }
    }

    // Generic "error:" pattern (fallback)
    if (errors.length === 0) {
      const genericPattern = /^(?:error|ERROR|Error):\s+(.+)/gm;
      for (const match of output.matchAll(genericPattern)) {
        errors.push({ message: match[1].trim(), severity: 'error' });
      }
    }

    // Exit code non-zero but no specific error parsed
    if (errors.length === 0 && output.toLowerCase().includes('failed')) {
      const lastLines = output.split('\n').slice(-10).join('\n');
      errors.push({
        message: `Build failed. Last output:\n${lastLines}`,
        severity: 'error'
      });
    }

    return errors;
  }

  private parseTsErrors(output: string): BuildError[] {
    const errors: BuildError[] = [];
    const pattern = /(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)/g;

    for (const match of output.matchAll(pattern)) {
      errors.push({
        file: match[1].trim(),
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        code: match[4],
        message: match[5].trim(),
        severity: 'error'
      });
    }

    return errors;
  }

  private parseWarnings(output: string): BuildWarning[] {
    const warnings: BuildWarning[] = [];

    // TypeScript warnings: "src/file.ts(10,5): warning TS..."
    const tsWarnPattern = /(.+?)\((\d+),\d+\): warning \w+: (.+)/g;
    for (const match of output.matchAll(tsWarnPattern)) {
      warnings.push({
        file: match[1].trim(),
        line: parseInt(match[2]),
        message: match[3].trim()
      });
    }

    return warnings.slice(0, 20); // Cap warnings
  }

  formatBuildResult(result: BuildResult): string {
    const status = result.success ? '✅ Build succeeded' : '❌ Build failed';
    const duration = `(${(result.duration / 1000).toFixed(1)}s)`;

    const lines = [`${status} ${duration}`];

    if (result.errors.length > 0) {
      lines.push('', `**${result.errors.length} error(s):**`);
      for (const error of result.errors.slice(0, 10)) {
        const loc = error.file
          ? `${error.file}${error.line ? `:${error.line}` : ''}`
          : '';
        lines.push(`- ${loc ? `\`${loc}\` ` : ''}${error.message}`);
      }
    }

    if (result.warnings.length > 0) {
      lines.push('', `**${result.warnings.length} warning(s)**`);
    }

    return lines.join('\n');
  }
}

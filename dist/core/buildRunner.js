"use strict";
// src/core/buildRunner.ts
// Executes build commands and parses output into structured errors/warnings
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
exports.BuildRunner = void 0;
const child_process = __importStar(require("child_process"));
class BuildRunner {
    async run(analysis, customCommand, onOutput) {
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
        const errors = this.parseErrors(result.output, analysis.framework);
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
    async runInstall(rootPath, packageManager, onOutput) {
        const commandMap = {
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
    async runTypeCheck(rootPath, onOutput) {
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
    execute(command, cwd, onOutput) {
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
            proc.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                onOutput?.(text);
            });
            proc.stderr.on('data', (data) => {
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
    parseErrors(output, framework) {
        const errors = [];
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
        if (errors.length > 0)
            return errors;
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
    parseTsErrors(output) {
        const errors = [];
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
    parseWarnings(output) {
        const warnings = [];
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
    formatBuildResult(result) {
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
exports.BuildRunner = BuildRunner;
//# sourceMappingURL=buildRunner.js.map
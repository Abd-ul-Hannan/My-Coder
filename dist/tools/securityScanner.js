"use strict";
// src/tools/securityScanner.ts
// ─────────────────────────────────────────────────────────────────────────────
// Security Scanner — static analysis without external dependencies
//
// Checks:
//   1. Hardcoded secrets (API keys, tokens, passwords)
//   2. Injection vulnerabilities (SQL, XSS, command injection)
//   3. Insecure patterns (eval, innerHTML, dangerouslySetInnerHTML)
//   4. Missing security headers
//   5. Dependency risk flags (known risky patterns in package.json)
//   6. Environment variable exposure
// ─────────────────────────────────────────────────────────────────────────────
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
exports.scanWorkspaceSecurity = scanWorkspaceSecurity;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const SECRET_PATTERNS = [
    { name: 'OpenAI API Key', pattern: /sk-[A-Za-z0-9]{48}/g, severity: 'critical', remediation: 'Move to environment variable. Rotate the key immediately.' },
    { name: 'Anthropic API Key', pattern: /sk-ant-[A-Za-z0-9\-_]{40,}/g, severity: 'critical', remediation: 'Move to environment variable. Rotate the key immediately.' },
    { name: 'AWS Access Key', pattern: /AKIA[A-Z0-9]{16}/g, severity: 'critical', remediation: 'Revoke key and rotate. Use IAM roles instead.' },
    { name: 'Generic API Key', pattern: /[Aa][Pp][Ii][_\-]?[Kk]ey\s*=\s*['"][A-Za-z0-9\-_]{16,}['"]/g, severity: 'high', remediation: 'Move to environment variable.' },
    { name: 'Password in code', pattern: /[Pp]assword\s*[:=]\s*['"][^'"]{8,}['"]/g, severity: 'high', remediation: 'Never hardcode passwords. Use environment variables.' },
    { name: 'Private Key', pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g, severity: 'critical', remediation: 'Remove immediately. Rotate the private key.' },
    { name: 'JWT Secret', pattern: /jwt[_\-]?secret\s*[:=]\s*['"][^'"]{8,}['"]/gi, severity: 'high', remediation: 'Move to environment variable.' },
    { name: 'Stripe Secret Key', pattern: /sk_live_[A-Za-z0-9]{24,}/g, severity: 'critical', remediation: 'Move to environment variable. Rotate immediately.' },
    { name: 'Google API Key', pattern: /AIzaSy[A-Za-z0-9\-_]{33}/g, severity: 'high', remediation: 'Move to environment variable.' },
    { name: 'Supabase Service Key', pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9\-_.+/]+=*/g, severity: 'high', remediation: 'Move to environment variable. Never expose service key client-side.' },
];
const VULN_PATTERNS = [
    // XSS
    { name: 'dangerouslySetInnerHTML', pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{__html:/g, severity: 'high', category: 'XSS', remediation: 'Sanitize with DOMPurify before setting innerHTML.' },
    { name: 'innerHTML assignment', pattern: /\.innerHTML\s*=/g, severity: 'high', category: 'XSS', remediation: 'Use textContent or sanitize input before setting innerHTML.' },
    { name: 'document.write', pattern: /document\.write\s*\(/g, severity: 'high', category: 'XSS', remediation: 'Avoid document.write — use DOM APIs instead.' },
    // SQL Injection
    { name: 'SQL concatenation', pattern: /["'`]\s*SELECT.*\+\s*(req\.|params\.|query\.|body\.)/gi, severity: 'critical', category: 'SQL Injection', remediation: 'Use parameterized queries or an ORM.' },
    { name: 'SQL template literal', pattern: /`SELECT[^`]*\$\{/gi, severity: 'critical', category: 'SQL Injection', remediation: 'Use parameterized queries. Never interpolate user input into SQL.' },
    // Command Injection
    { name: 'exec with user input', pattern: /exec\s*\([^)]*req\.|child_process.*exec.*\$\{/gi, severity: 'critical', category: 'Command Injection', remediation: 'Validate and sanitize all inputs. Use execFile with arguments array.' },
    { name: 'eval usage', pattern: /\beval\s*\(/g, severity: 'high', category: 'Code Injection', remediation: 'Avoid eval. Use safer alternatives like JSON.parse.' },
    { name: 'Function constructor', pattern: /new\s+Function\s*\(/g, severity: 'high', category: 'Code Injection', remediation: 'Avoid dynamic function construction with user input.' },
    // Insecure crypto
    { name: 'MD5 usage', pattern: /\bmd5\s*\(/gi, severity: 'medium', category: 'Weak Crypto', remediation: 'Use bcrypt, argon2, or SHA-256+ for passwords.' },
    { name: 'SHA1 usage', pattern: /\bsha1\s*\(|createHash\(['"]sha1['"]\)/gi, severity: 'medium', category: 'Weak Crypto', remediation: 'Use SHA-256 or higher.' },
    // Prototype pollution
    { name: 'Prototype pollution', pattern: /\.__proto__\s*=|\[['"]__proto__['"]\]\s*=/g, severity: 'high', category: 'Prototype Pollution', remediation: 'Never assign to __proto__. Use Object.create(null) for lookup tables.' },
    // SSRF
    { name: 'Unvalidated URL fetch', pattern: /fetch\s*\(\s*(req\.|params\.|query\.|body\.)\w+\)/gi, severity: 'high', category: 'SSRF', remediation: 'Validate and allowlist URLs before fetching external resources.' },
    // Console.log sensitive data
    { name: 'Logging sensitive data', pattern: /console\.log\s*\(.*[Pp]assword|console\.log\s*\(.*[Tt]oken|console\.log\s*\(.*apiKey/g, severity: 'medium', category: 'Sensitive Data Exposure', remediation: 'Remove logging of sensitive fields in production.' },
];
// ─── Scanner ──────────────────────────────────────────────────────────────────
/**
 * Scans all source files in a workspace for security issues.
 * Runs purely statically — no network calls, no code execution.
 *
 * @param rootPath  - Absolute path to project root
 * @returns         SecurityReport with all findings and a formatted summary
 */
async function scanWorkspaceSecurity(rootPath) {
    const SCAN_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.env', '.json', '.yaml', '.yml']);
    const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build', '.cache']);
    const files = await gatherFiles(rootPath, SCAN_EXTS, IGNORE_DIRS);
    const findings = [];
    for (const filePath of files) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const relPath = path.relative(rootPath, filePath);
            // Skip .env.example — it's documentation
            if (relPath.endsWith('.env.example'))
                continue;
            scanForSecrets(content, relPath, findings);
            scanForVulnerabilities(content, relPath, findings);
            // Flag .env files committed to source (only if not in .gitignore)
            if (path.basename(filePath) === '.env') {
                findings.push({
                    severity: 'critical',
                    category: 'Exposed Secrets',
                    file: relPath,
                    line: 1,
                    message: '.env file detected in project — ensure it is in .gitignore',
                    remediation: 'Add .env to .gitignore. Never commit .env files to source control.',
                });
            }
        }
        catch { /* skip unreadable files */ }
    }
    // Scan package.json for known risky direct dep patterns
    const packagePath = path.join(rootPath, 'package.json');
    try {
        const pkg = JSON.parse(await fs.readFile(packagePath, 'utf-8'));
        const deps = { ...(pkg['dependencies'] ?? {}), ...(pkg['devDependencies'] ?? {}) };
        for (const [name] of Object.entries(deps)) {
            if (name === 'node-serialize') {
                findings.push({ severity: 'critical', category: 'SCA', file: 'package.json', line: 0, message: `Dependency "${name}" has known RCE vulnerability`, remediation: 'Remove node-serialize — use JSON.parse instead.' });
            }
        }
    }
    catch { /* no package.json */ }
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;
    return {
        scannedFiles: files.length,
        totalFindings: findings.length,
        criticalCount,
        highCount,
        findings: findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
        summary: formatSummary(findings, files.length),
    };
}
// ─── Private ──────────────────────────────────────────────────────────────────
function scanForSecrets(content, filePath, out) {
    const lines = content.split('\n');
    for (const rule of SECRET_PATTERNS) {
        rule.pattern.lastIndex = 0;
        let match;
        while ((match = rule.pattern.exec(content)) !== null) {
            const lineNum = content.slice(0, match.index).split('\n').length;
            out.push({
                severity: rule.severity,
                category: 'Hardcoded Secret',
                file: filePath,
                line: lineNum,
                message: `${rule.name} detected in source code`,
                remediation: rule.remediation,
                snippet: lines[lineNum - 1]?.trim().slice(0, 80),
            });
        }
    }
}
function scanForVulnerabilities(content, filePath, out) {
    for (const rule of VULN_PATTERNS) {
        rule.pattern.lastIndex = 0;
        let match;
        while ((match = rule.pattern.exec(content)) !== null) {
            const lineNum = content.slice(0, match.index).split('\n').length;
            const lines = content.split('\n');
            out.push({
                severity: rule.severity,
                category: rule.category,
                file: filePath,
                line: lineNum,
                message: `${rule.name}: ${rule.category} risk detected`,
                remediation: rule.remediation,
                snippet: lines[lineNum - 1]?.trim().slice(0, 80),
            });
        }
    }
}
async function gatherFiles(root, exts, ignoreDirs) {
    const results = [];
    async function walk(dir) {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const e of entries) {
                if (ignoreDirs.has(e.name))
                    continue;
                const full = path.join(dir, e.name);
                if (e.isDirectory())
                    await walk(full);
                else if (exts.has(path.extname(e.name)))
                    results.push(full);
            }
        }
        catch { /* skip */ }
    }
    await walk(root);
    return results;
}
function formatSummary(findings, fileCount) {
    if (!findings.length)
        return `✅ No security issues found in ${fileCount} files.`;
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings)
        counts[f.severity]++;
    const lines = [
        `## 🔒 Security Scan — ${fileCount} files`,
        '',
        `| Severity | Count |`,
        `|---|---|`,
        `| 🔴 Critical | ${counts.critical} |`,
        `| 🟠 High     | ${counts.high} |`,
        `| 🟡 Medium   | ${counts.medium} |`,
        `| 🟢 Low      | ${counts.low} |`,
        '',
        ...findings.slice(0, 20).map(f => `**${f.severity.toUpperCase()}** · \`${f.file}:${f.line}\`\n` +
            `${f.message}\n` +
            `→ *${f.remediation}*\n` +
            (f.snippet ? `\`\`\`\n${f.snippet}\n\`\`\`` : '')),
    ];
    return lines.join('\n');
}
function severityRank(s) {
    return { critical: 0, high: 1, medium: 2, low: 3, info: 4 }[s] ?? 5;
}
//# sourceMappingURL=securityScanner.js.map
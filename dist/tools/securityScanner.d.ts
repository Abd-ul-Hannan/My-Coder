export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export interface SecurityFinding {
    severity: Severity;
    category: string;
    file: string;
    line: number;
    column?: number;
    message: string;
    remediation: string;
    snippet?: string;
}
export interface SecurityReport {
    scannedFiles: number;
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    findings: SecurityFinding[];
    summary: string;
}
/**
 * Scans all source files in a workspace for security issues.
 * Runs purely statically — no network calls, no code execution.
 *
 * @param rootPath  - Absolute path to project root
 * @returns         SecurityReport with all findings and a formatted summary
 */
export declare function scanWorkspaceSecurity(rootPath: string): Promise<SecurityReport>;
//# sourceMappingURL=securityScanner.d.ts.map
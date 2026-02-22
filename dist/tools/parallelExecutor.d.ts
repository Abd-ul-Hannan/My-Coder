export interface TaskResult<T> {
    index: number;
    success: boolean;
    value?: T;
    error?: string;
    durationMs: number;
}
export interface ParallelOptions {
    /** Max concurrent tasks (default: 4) */
    concurrency?: number;
    /** Called when a task completes (success or failure) */
    onProgress?: (completed: number, total: number, result: TaskResult<unknown>) => void;
    /** If true, stop all tasks on first failure (default: false) */
    failFast?: boolean;
}
/**
 * Runs an array of async tasks in parallel with a concurrency limit.
 * Returns results in the SAME ORDER as the input tasks array.
 *
 * @example
 * const results = await runParallel(
 *   files.map(f => () => generateFile(f)),
 *   { concurrency: 3, onProgress: (done, total) => console.log(`${done}/${total}`) }
 * );
 */
export declare function runParallel<T>(tasks: Array<() => Promise<T>>, options?: ParallelOptions): Promise<TaskResult<T>[]>;
/**
 * Runs tasks in sequence (one at a time) with progress reporting.
 * Use when tasks must not run concurrently (e.g., sequential file writes).
 */
export declare function runSequential<T>(tasks: Array<() => Promise<T>>, onProgress?: (completed: number, total: number, label?: string) => void, labels?: string[]): Promise<TaskResult<T>[]>;
/**
 * Retries a single async task up to maxAttempts times with exponential backoff.
 */
export declare function withRetry<T>(task: () => Promise<T>, maxAttempts?: number, baseDelayMs?: number): Promise<T>;
//# sourceMappingURL=parallelExecutor.d.ts.map
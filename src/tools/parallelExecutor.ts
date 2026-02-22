// src/tools/parallelExecutor.ts
// ─────────────────────────────────────────────────────────────────────────────
// Parallel Task Executor
//
// Runs multiple async tasks concurrently with:
//   - Configurable concurrency limit (default 4)
//   - Progress callbacks per task
//   - Partial failure handling (some tasks can fail without cancelling others)
//   - Result collection in original order
//
// Used for: parallel file generation, concurrent tool execution,
//           multi-file patching, batch AI calls
// ─────────────────────────────────────────────────────────────────────────────

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
export async function runParallel<T>(
  tasks: Array<() => Promise<T>>,
  options: ParallelOptions = {},
): Promise<TaskResult<T>[]> {
  const { concurrency = 4, onProgress, failFast = false } = options;
  const results: TaskResult<T>[] = new Array(tasks.length);
  let completed = 0;
  let aborted = false;
  let activeIndex = 0;

  async function runTask(taskIndex: number): Promise<void> {
    if (aborted) return;
    const start = Date.now();
    try {
      const value = await tasks[taskIndex]();
      const result: TaskResult<T> = { index: taskIndex, success: true, value, durationMs: Date.now() - start };
      results[taskIndex] = result;
      completed++;
      onProgress?.(completed, tasks.length, result as TaskResult<unknown>);
    } catch (err) {
      const result: TaskResult<T> = {
        index: taskIndex, success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
      results[taskIndex] = result;
      completed++;
      onProgress?.(completed, tasks.length, result as TaskResult<unknown>);
      if (failFast) aborted = true;
    }
  }

  // Worker pool
  async function worker(): Promise<void> {
    while (activeIndex < tasks.length && !aborted) {
      const myIndex = activeIndex++;
      await runTask(myIndex);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Runs tasks in sequence (one at a time) with progress reporting.
 * Use when tasks must not run concurrently (e.g., sequential file writes).
 */
export async function runSequential<T>(
  tasks: Array<() => Promise<T>>,
  onProgress?: (completed: number, total: number, label?: string) => void,
  labels?: string[],
): Promise<TaskResult<T>[]> {
  const results: TaskResult<T>[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const start = Date.now();
    try {
      const value = await tasks[i]();
      const result: TaskResult<T> = { index: i, success: true, value, durationMs: Date.now() - start };
      results.push(result);
      onProgress?.(i + 1, tasks.length, labels?.[i]);
    } catch (err) {
      const result: TaskResult<T> = { index: i, success: false, error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - start };
      results.push(result);
      onProgress?.(i + 1, tasks.length, labels?.[i]);
    }
  }
  return results;
}

/**
 * Retries a single async task up to maxAttempts times with exponential backoff.
 */
export async function withRetry<T>(
  task: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await task();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await delay(baseDelayMs * Math.pow(2, attempt - 1));
      }
    }
  }
  throw lastError;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

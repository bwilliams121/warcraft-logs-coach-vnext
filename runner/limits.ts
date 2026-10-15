/**
 * Runner resource limits (M11-G3-1). A job that would exceed one is
 * JOB_REJECTED before the engine starts; an engine that exceeds one while
 * running is stopped and reported with a typed failure.
 */

export interface RunnerLimits {
  /** Highest `threads` a job may request on this runner. */
  readonly coreLimit: number;
  /** Concurrent engine processes; a job arriving when all are busy is RUNNER_OVERLOADED. */
  readonly maxConcurrentJobs: number;
  /** Hard wall-clock cap, regardless of the policy's own timeout. */
  readonly maxWallClockMs: number;
  /** Container memory cap (Docker launcher). */
  readonly memoryBytes: number;
  /** Engine JSON output cap. */
  readonly maxOutputBytes: number;
  /** Captured stdout/stderr per stream; the rest is dropped. */
  readonly maxStdioBytes: number;
}

export const DEFAULT_RUNNER_LIMITS: RunnerLimits = {
  coreLimit: 12,
  maxConcurrentJobs: 1,
  maxWallClockMs: 60_000,
  memoryBytes: 2 * 1024 * 1024 * 1024,
  maxOutputBytes: 5 * 1024 * 1024,
  maxStdioBytes: 64 * 1024,
};

/** Bounded concurrency without a queue: acquire fails immediately when full. */
export class JobSlots {
  private active = 0;

  constructor(private readonly capacity: number) {}

  tryAcquire(): (() => void) | null {
    if (this.active >= this.capacity) return null;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }

  get inUse(): number {
    return this.active;
  }
}

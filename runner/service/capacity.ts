/**
 * RUNNER CAPACITY (M11-G3-5): a versioned description of the host the service
 * runs on, and the limits derived from it.
 *
 * Concurrency is modelled SEPARATELY from SimC threads: each running job uses
 * up to `threadsPerJob` engine threads, so `maxConcurrentJobs × threadsPerJob`
 * must fit `logicalCpu`. A configuration that would oversubscribe the host is
 * invalid and the service reports NOT READY — it never silently runs 2 × 8
 * threads on a 8-vCPU box.
 *
 * Only the development default is a configuration this repository has run.
 * RECOMMENDED_PRODUCTION_V1 is a recommendation for a host not yet provisioned.
 */

export interface RunnerCapacity {
  readonly id: string;
  readonly version: number;
  readonly logicalCpu: number;
  readonly maxConcurrentJobs: number;
  /** The most engine threads one job may use (the approved policies use 8). */
  readonly threadsPerJob: number;
  readonly maxQueueDepth: number;
  /** A job still QUEUED after this long fails RUNNER_OVERLOADED. */
  readonly maxQueueWaitMs: number;
  readonly maxMemoryPerJobBytes: number;
  readonly maxWallTimeMs: number;
  /** Terminal tickets kept for polling, then forgotten (a retry re-submits). */
  readonly ticketRetentionMs: number;
  readonly maxRetainedTickets: number;
}

const GIB = 1024 * 1024 * 1024;

/** Safe local default: one 8-thread job at a time. */
export const DEV_LOCAL_CAPACITY_V1: RunnerCapacity = {
  id: "DEV_LOCAL_CAPACITY_V1",
  version: 1,
  logicalCpu: 8,
  maxConcurrentJobs: 1,
  threadsPerJob: 8,
  maxQueueDepth: 8,
  maxQueueWaitMs: 120_000,
  maxMemoryPerJobBytes: 2 * GIB,
  maxWallTimeMs: 60_000,
  ticketRetentionMs: 15 * 60_000,
  maxRetainedTickets: 1_000,
};

/** RECOMMENDATION ONLY (not a deployed host): 16 vCPU, two 8-thread jobs. */
export const RECOMMENDED_PRODUCTION_CAPACITY_V1: RunnerCapacity = {
  id: "RECOMMENDED_PRODUCTION_CAPACITY_V1",
  version: 1,
  logicalCpu: 16,
  maxConcurrentJobs: 2,
  threadsPerJob: 8,
  maxQueueDepth: 32,
  maxQueueWaitMs: 180_000,
  maxMemoryPerJobBytes: 2 * GIB,
  maxWallTimeMs: 60_000,
  ticketRetentionMs: 15 * 60_000,
  maxRetainedTickets: 5_000,
};

/** Null when valid; otherwise the reason the service must not become ready. */
export function capacityProblem(capacity: RunnerCapacity): string | null {
  const positive = [
    capacity.logicalCpu,
    capacity.maxConcurrentJobs,
    capacity.threadsPerJob,
    capacity.maxQueueDepth,
    capacity.maxQueueWaitMs,
    capacity.maxMemoryPerJobBytes,
    capacity.maxWallTimeMs,
    capacity.ticketRetentionMs,
    capacity.maxRetainedTickets,
  ];
  if (!positive.every((value) => Number.isSafeInteger(value) && value > 0)) {
    return "every capacity field must be a positive integer";
  }
  if (capacity.maxConcurrentJobs * capacity.threadsPerJob > capacity.logicalCpu) {
    return `oversubscribed: ${String(capacity.maxConcurrentJobs)} jobs × ${String(capacity.threadsPerJob)} threads > ${String(capacity.logicalCpu)} logical CPUs`;
  }
  if (capacity.maxWallTimeMs > 600_000) return "maxWallTimeMs above 10 minutes";
  return null;
}

/** A capacity may not claim more logical CPUs than the host it runs on actually has. */
export function hostCapacityProblem(capacity: RunnerCapacity, hostLogicalCpu: number): string | null {
  return capacity.logicalCpu > hostLogicalCpu
    ? `capacity ${capacity.id} declares ${String(capacity.logicalCpu)} logical CPUs; this host has ${String(hostLogicalCpu)}`
    : null;
}

export const RUNNER_CAPACITIES: readonly RunnerCapacity[] = [
  DEV_LOCAL_CAPACITY_V1,
  RECOMMENDED_PRODUCTION_CAPACITY_V1,
];

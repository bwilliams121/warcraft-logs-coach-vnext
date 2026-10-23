/**
 * M11-G3-5 queue, concurrency and cancellation (tests P–Z, shutdown).
 *
 * Deterministic: most tests drive a GatedExecutor (each engine run waits until
 * the test releases it, then runs the real fake-engine executor) and a manual
 * clock/timer, so ordering never depends on wall time. Process-level tests
 * (U, W, shutdown) use the fake engine's `hang-pid` mode to prove the engine
 * process is actually gone.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DirectLauncher } from "../../../runner/engine-launcher.js";
import { MemorySimulationCache } from "../../../runner/service/cache.js";
import { firstSemanticDifference } from "../../../src/simulation/result.js";
import { RESULT_REPRODUCIBILITY_TOLERANCE } from "../../../src/simulation/simulation-policy.js";
import {
  bytesOf,
  devJob,
  FAKE,
  gatedService,
  settle,
  startedService,
  TEST_CAPACITY,
  TEST_LIMITS,
} from "../../support/simulation/runner-service.js";

declare const process: { execPath: string; kill(pid: number, signal: number): void };

type Json = Record<string, any>;

const submit = async (service: Awaited<ReturnType<typeof gatedService>>["service"], job: Json) => {
  const submission = await service.submit({ job, rawByteLength: bytesOf(job) });
  if (!submission.accepted) throw new Error(`refused: ${submission.rejected.failure.code}`);
  return submission.ticket;
};

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const waitUntil = async (predicate: () => boolean, ms = 10_000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

describe("M11-G3-5 queue (P–S)", () => {
  it("P. never more than maxConcurrentJobs engine runs, separate from SimC threads", async () => {
    const q = await gatedService();
    for (let index = 0; index < 4; index += 1) await submit(q.service, devJob(index));
    await settle();
    expect(q.gated.calls).toHaveLength(2);
    expect(q.service.metrics()).toMatchObject({ running: 2, queueDepth: 2 });
    q.gated.calls[0]?.release();
    await q.service.waitFor((await submit(q.service, devJob(0))).jobId);
    await settle();
    expect(q.gated.calls).toHaveLength(3);
    expect(q.service.metrics().running).toBeLessThanOrEqual(2);
    // 2 jobs × 8 threads on a declared 16 CPUs; one more job would oversubscribe and is NOT READY.
    const over = await startedService({ capacity: { ...TEST_CAPACITY, maxConcurrentJobs: 3 } });
    expect(over.service.readiness()).toMatchObject({ ready: false, checks: { capacity: "INVALID" } });
    expect(over.service.readiness().detail.join()).toMatch(/oversubscribed: 3 jobs × 8 threads > 16/);
  });

  it("Q. the queue is bounded: past maxQueueDepth a submission is refused, and no ticket is created", async () => {
    const q = await gatedService();
    for (let index = 0; index < 4; index += 1) await submit(q.service, devJob(index));
    await settle();
    const refused = await q.service.submit({ job: devJob(9), rawByteLength: bytesOf(devJob(9)) });
    expect(refused.accepted).toBe(false);
    if (refused.accepted) return;
    expect(refused.rejected.failure.code).toBe("RUNNER_OVERLOADED");
    expect(refused.rejected.status).toBe("REFUSED");
    expect(q.service.metrics()).toMatchObject({ queueDepth: 2, running: 2 });
    expect(q.service.metrics().counters.rejectedOverload).toBe(1);
  });

  it("R. overload is typed: a job queued past maxQueueWaitMs fails RUNNER_OVERLOADED (no caller priority exists)", async () => {
    const q = await gatedService();
    for (let index = 0; index < 2; index += 1) await submit(q.service, devJob(index));
    const waiting = await submit(q.service, devJob(2));
    await settle();
    q.advance(TEST_CAPACITY.maxQueueWaitMs - 1);
    expect(q.service.status(waiting.jobId)?.status).toBe("QUEUED");
    q.advance(1);
    const view = q.service.status(waiting.jobId);
    expect(view).toMatchObject({ status: "FAILED", failure: { code: "RUNNER_OVERLOADED" } });
    expect(view?.result).toBeUndefined();
    expect(q.service.metrics().queueDepth).toBe(0);
    expect(q.gated.calls).toHaveLength(2);
    // The request schema has no priority field at all.
    expect(
      Object.keys(
        (await import("../../../src/simulation/runner-protocol.js")).submitSimulationRequestSchema.shape,
      ),
    ).toEqual(["protocol", "job", "readiness"]);
  });

  it("S. queued jobs eventually run, in FIFO order, as slots free", async () => {
    const q = await gatedService();
    const tickets = [];
    for (let index = 0; index < 4; index += 1) tickets.push(await submit(q.service, devJob(index)));
    await settle();
    q.gated.calls[1]?.release();
    await q.service.waitFor(tickets[1]?.jobId ?? "");
    await settle();
    q.gated.calls[0]?.release();
    await q.service.waitFor(tickets[0]?.jobId ?? "");
    await settle();
    expect(q.gated.calls.map((call) => call.key)).toEqual([60_000, 61_000, 62_000, 63_000]);
    q.gated.calls[2]?.release();
    q.gated.calls[3]?.release();
    for (const ticket of tickets) expect((await q.service.waitFor(ticket.jobId))?.status).toBe("SUCCEEDED");
  });
});

describe("M11-G3-5 cancellation (T–V)", () => {
  it("T. a cancelled queued job is removed and never executed", async () => {
    const q = await gatedService();
    for (let index = 0; index < 2; index += 1) await submit(q.service, devJob(index));
    const queued = await submit(q.service, devJob(2));
    const view = q.service.cancel(queued.jobId);
    expect(view).toMatchObject({ status: "CANCELLED", failure: { code: "CANCELLED" } });
    expect(q.service.metrics().queueDepth).toBe(0);
    q.gated.calls[0]?.release();
    q.gated.calls[1]?.release();
    await settle(20);
    expect(q.gated.calls.map((call) => call.key)).toEqual([60_000, 61_000]);
    expect(q.service.status(queued.jobId)?.status).toBe("CANCELLED");
  });

  it("U. cancelling a running job kills the engine process", async () => {
    const pidDir = mkdtempSync(join(tmpdir(), "wlc-g35-pid-"));
    try {
      const pidFile = join(pidDir, "pid");
      const h = await startedService();
      h.launcher.mode = `hang-pid:${pidFile}`;
      const ticket = (await h.service.submit({ job: devJob(), rawByteLength: bytesOf(devJob()) })) as Json;
      await waitUntil(() => existsSync(pidFile) && readFileSync(pidFile, "utf8").length > 0);
      const pid = Number(readFileSync(pidFile, "utf8"));
      expect(alive(pid)).toBe(true);
      expect(h.service.cancel(ticket.ticket.jobId)?.status).toBe("CANCELLED");
      await h.service.waitFor(ticket.ticket.jobId);
      await waitUntil(() => h.service.liveExecutions === 0);
      await waitUntil(() => !alive(pid));
      expect(alive(pid)).toBe(false);
      expect(h.service.metrics()).toMatchObject({ running: 0, queueDepth: 0 });
      expect(h.service.status(ticket.ticket.jobId)?.result).toBeUndefined();
    } finally {
      rmSync(pidDir, { recursive: true, force: true });
    }
  });

  it("V. completion vs cancel race: a cancel processed first wins for that ticket (no partial result); after completion the result stands", async () => {
    const q = await gatedService();
    const raced = await submit(q.service, devJob(0));
    await settle();
    q.gated.calls[0]?.release();
    // Same tick as the release: the cancel is processed before the execution's terminal transition.
    const cancelled = q.service.cancel(raced.jobId);
    expect(cancelled?.status).toBe("CANCELLED");
    const final = await q.service.waitFor(raced.jobId);
    expect(final).toMatchObject({ status: "CANCELLED", failure: { code: "CANCELLED" } });
    expect(final?.result).toBeUndefined();
    await settle(20);

    const finished = await submit(q.service, devJob(1));
    await settle();
    q.gated.calls[1]?.release();
    await q.service.waitFor(finished.jobId);
    const late = q.service.cancel(finished.jobId);
    expect(late?.status).toBe("SUCCEEDED");
    expect(late?.result?.dps.mean).toBe(50_000);
    expect(q.service.status(finished.jobId)?.status).toBe("SUCCEEDED");
  });
});

describe("M11-G3-5 cleanup and capacity accounting (W–X)", () => {
  it("W. every engine run leaves no job directory behind — success, failure, timeout and cancel", async () => {
    const before = new Set(readdirSync(tmpdir(), { recursive: false, withFileTypes: false }));
    const h = await startedService();
    for (const mode of ["ok", "exit-nonzero", "no-output", "zero-dps"]) {
      h.launcher.mode = mode;
      const job = devJob(["ok", "exit-nonzero", "no-output", "zero-dps"].indexOf(mode) + 10);
      const submission = await h.service.submit({ job, rawByteLength: bytesOf(job) });
      if (submission.accepted) await h.service.waitFor(submission.ticket.jobId);
    }
    h.launcher.mode = "hang";
    const hung = await h.service.submit({ job: devJob(20), rawByteLength: bytesOf(devJob(20)) });
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (hung.accepted) h.service.cancel(hung.ticket.jobId);
    await waitUntil(() => h.service.liveExecutions === 0);
    // Direct timeout path: the launcher's own wall-clock cap.
    const timeout = await new DirectLauncher(
      { executable: process.execPath, leadingArgs: [FAKE, "hang"], binaryToHash: FAKE },
      { ...TEST_LIMITS, maxWallClockMs: 200 },
    ).launch({ input: "x=1\n", timeoutMs: 200 });
    expect(timeout.kind).toBe("TIMEOUT");
    await new Promise((resolve) => setTimeout(resolve, 200));
    const leftovers = readdirSync(tmpdir(), { recursive: false, withFileTypes: false }).filter(
      (name) => name.startsWith("wlc-simc-") && !before.has(name),
    );
    expect(leftovers).toEqual([]);
  });

  it("X. no capacity leaks: after successes, failures, overloads, expiries and cancels the service is empty and runs at full width again", async () => {
    const q = await gatedService();
    const a = await submit(q.service, devJob(0));
    await submit(q.service, devJob(1));
    const queued = await submit(q.service, devJob(2));
    const expiring = await submit(q.service, devJob(3));
    const refused = await q.service.submit({ job: devJob(4), rawByteLength: bytesOf(devJob(4)) });
    expect(refused.accepted).toBe(false);
    await settle();
    q.service.cancel(queued.jobId);
    q.advance(TEST_CAPACITY.maxQueueWaitMs);
    expect(q.service.status(expiring.jobId)?.status).toBe("FAILED");
    q.service.cancel(a.jobId);
    q.gated.calls[1]?.release();
    await settle(20);
    await waitUntil(() => q.service.liveExecutions === 0);
    expect(q.service.metrics()).toMatchObject({ running: 0, queueDepth: 0 });
    for (let index = 5; index < 7; index += 1) await submit(q.service, devJob(index));
    await settle();
    expect(q.service.metrics().running).toBe(2);
    for (const call of q.gated.calls) call.release();
    await settle(20);
    await waitUntil(() => q.service.liveExecutions === 0);
  });
});

describe("M11-G3-5 coalescing and cache hits (Y–Z)", () => {
  it("Y. identical in-flight jobs coalesce onto one execution; one caller cancelling does not cancel the other", async () => {
    const q = await gatedService();
    const first = await submit(q.service, devJob(0));
    const second = await submit(q.service, devJob(0));
    const third = await submit(q.service, devJob(0));
    expect([first.cacheStatus, second.cacheStatus, third.cacheStatus]).toEqual([
      "MISS",
      "COALESCED",
      "COALESCED",
    ]);
    expect(new Set([first.cacheKey, second.cacheKey, third.cacheKey]).size).toBe(1);
    expect(new Set([first.jobId, second.jobId, third.jobId]).size).toBe(3);
    await settle();
    expect(q.gated.calls).toHaveLength(1);
    q.service.cancel(first.jobId);
    expect(q.gated.calls[0]?.signal.aborted).toBe(false);
    q.gated.calls[0]?.release();
    const [, b, c] = [
      await q.service.waitFor(first.jobId),
      await q.service.waitFor(second.jobId),
      await q.service.waitFor(third.jobId),
    ];
    expect(q.service.status(first.jobId)?.status).toBe("CANCELLED");
    expect(b?.status).toBe("SUCCEEDED");
    expect(
      firstSemanticDifference(b?.result as never, c?.result as never, RESULT_REPRODUCIBILITY_TOLERANCE),
    ).toBeNull();
    // When every caller cancels, the shared engine run is aborted.
    const solo = await submit(q.service, devJob(5));
    const twin = await submit(q.service, devJob(5));
    await settle();
    q.service.cancel(solo.jobId);
    expect(q.gated.calls[1]?.signal.aborted).toBe(false);
    q.service.cancel(twin.jobId);
    expect(q.gated.calls[1]?.signal.aborted).toBe(true);
  });

  it("Z. a completed job is served from the cache: HIT, terminal at once, no engine run", async () => {
    const cache = new MemorySimulationCache();
    const q = await gatedService(TEST_CAPACITY, cache);
    const miss = await submit(q.service, devJob(0));
    await settle();
    q.gated.calls[0]?.release();
    const missed = await q.service.waitFor(miss.jobId);
    const hit = await submit(q.service, devJob(0));
    expect(hit).toMatchObject({ status: "SUCCEEDED", cacheStatus: "HIT", cacheKey: miss.cacheKey });
    expect(q.gated.calls).toHaveLength(1);
    expect(firstSemanticDifference(missed?.result as never, hit.result as never, 0)).toBeNull();
    expect(q.service.metrics().counters).toMatchObject({ cacheHits: 1, cacheMisses: 1 });
  });
});

describe("M11-G3-5 shutdown", () => {
  it("graceful shutdown refuses new work, kills running engines after the grace period, and leaves no process", async () => {
    const pidDir = mkdtempSync(join(tmpdir(), "wlc-g35-pid-"));
    try {
      const pidFile = join(pidDir, "pid");
      const h = await startedService();
      h.launcher.mode = `hang-pid:${pidFile}`;
      const running = await h.service.submit({ job: devJob(0), rawByteLength: bytesOf(devJob(0)) });
      const queued = await h.service.submit({ job: devJob(1), rawByteLength: bytesOf(devJob(1)) });
      const queued2 = await h.service.submit({ job: devJob(2), rawByteLength: bytesOf(devJob(2)) });
      await waitUntil(() => existsSync(pidFile) && readFileSync(pidFile, "utf8").length > 0);
      const pid = Number(readFileSync(pidFile, "utf8"));
      await h.service.shutdown(100);
      expect(h.service.liveExecutions).toBe(0);
      await waitUntil(() => !alive(pid));
      for (const submission of [running, queued, queued2]) {
        if (!submission.accepted) continue;
        expect(["CANCELLED", "FAILED"]).toContain(h.service.status(submission.ticket.jobId)?.status);
        expect(h.service.status(submission.ticket.jobId)?.result).toBeUndefined();
      }
      expect(h.service.readiness()).toMatchObject({ ready: false, checks: { accepting: false } });
      const late = await h.service.submit({ job: devJob(3), rawByteLength: bytesOf(devJob(3)) });
      expect(late.accepted ? "ACCEPTED_LATE" : late.rejected.failure.code).toBe("RUNNER_UNAVAILABLE");
    } finally {
      rmSync(pidDir, { recursive: true, force: true });
    }
  });
});

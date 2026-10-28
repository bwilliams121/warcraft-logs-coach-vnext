/**
 * M11-G3-5 cache (tests AA–AI). The key is the G3-1 PARSED-RESULT key, so any
 * change to profile, environment, execution profile, model or parser is a
 * different key — no invalidation step exists. Every hit is re-verified
 * against the identity recomputed from the submitted job.
 */

import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { RUNNER_SPEC_BINDINGS } from "../../../runner/spec-bindings.js";
import { FileSystemSimulationCache, MemorySimulationCache } from "../../../runner/service/cache.js";
import { canonicalJson, sha256Hex } from "../../../src/simulation/canonical.js";
import { prepareSimulation } from "../../../src/simulation/prepare.js";
import { RESULT_PARSER_REVISION } from "../../../src/simulation/result-parser.js";
import { firstSemanticDifference } from "../../../src/simulation/result.js";
import {
  expectedResultIdentity,
  verifySimulationResult,
} from "../../../src/simulation/result-verification.js";
import { bytesOf, devJob, FAKE_ARTIFACT, startedService } from "../../support/simulation/runner-service.js";

type Json = Record<string, any>;

const DIRS: string[] = [];
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), "wlc-g35-cache-"));
  DIRS.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of DIRS) rmSync(dir, { recursive: true, force: true });
});

const keysOf = async (job: Json, artifact = FAKE_ARTIFACT) => {
  const prepared = await prepareSimulation(job, bytesOf(job), artifact, RUNNER_SPEC_BINDINGS);
  if (!prepared.ok) throw new Error(prepared.failure.detail);
  return prepared.value.keys;
};

const run = async (h: Awaited<ReturnType<typeof startedService>>, job: Json) => {
  const submission = await h.service.submit({ job, rawByteLength: bytesOf(job) });
  if (!submission.accepted) throw new Error(submission.rejected.failure.code);
  const done = await h.service.waitFor(submission.ticket.jobId);
  if (done === null) throw new Error("lost");
  return { submitted: submission.ticket, done };
};

describe("M11-G3-5 cache keys (AA–AF)", () => {
  it("AA. the same job always has the same key, and the second submission is a HIT", async () => {
    expect(await keysOf(devJob())).toEqual(await keysOf(structuredClone(devJob())));
    const h = await startedService();
    const first = await run(h, devJob());
    const second = await run(h, devJob());
    expect(first.submitted.cacheStatus).toBe("MISS");
    expect(second.submitted.cacheStatus).toBe("HIT");
    expect(second.submitted.cacheKey).toBe(first.submitted.cacheKey);
    // The job id is a ticket, never an input to the key.
    expect(second.submitted.jobId).not.toBe(first.submitted.jobId);
  });

  it("AB. a profile change (one enchant) is a different key", async () => {
    const changed = devJob();
    changed.character.gear[0].enchant = { kind: "KNOWN_NONE" };
    const [a, b] = [await keysOf(devJob()), await keysOf(changed)];
    expect(b.profileHash).not.toBe(a.profileHash);
    expect(b.parsedResultKey).not.toBe(a.parsedResultKey);
    expect(b.environmentHash).toBe(a.environmentHash);
  });

  it("AC. an environment change (duration, Bloodlust) is a different key", async () => {
    const lust = devJob();
    lust.environment.bloodlust.atMs = 6_000;
    const base = await keysOf(devJob());
    for (const changed of [devJob(1), lust]) {
      const keys = await keysOf(changed);
      expect(keys.environmentHash).not.toBe(base.environmentHash);
      expect(keys.parsedResultKey).not.toBe(base.parsedResultKey);
      expect(keys.profileHash).toBe(base.profileHash);
    }
  });

  it("AD. a different execution profile (revision) is a different key", async () => {
    const pinned = devJob();
    pinned.executionProfileId = "SIMC_DEFAULT_PINNED";
    const [a, b] = [await keysOf(devJob()), await keysOf(pinned)];
    expect(b.executionProfileRevision).not.toBe(a.executionProfileRevision);
    expect(b.parsedResultKey).not.toBe(a.parsedResultKey);
  });

  it("AE. a different engine artifact (binary, recipe, model data) is a different key", async () => {
    const base = await keysOf(devJob());
    const otherBinary = { ...FAKE_ARTIFACT, binarySha256: "1".repeat(64) };
    const otherRecipe = { ...FAKE_ARTIFACT, buildRecipeRevision: "simc-build/2" };
    for (const artifact of [otherBinary, otherRecipe]) {
      expect((await keysOf(devJob(), artifact)).parsedResultKey).not.toBe(base.parsedResultKey);
    }
  });

  it("AF. the parser revision is part of the parsed-result key, and an entry from another parser is refused", async () => {
    const keys = await keysOf(devJob());
    const recompute = async (parserRevision: string) =>
      await sha256Hex(
        canonicalJson({
          kind: "simulation-parsed-result-key/1",
          engineRunKey: keys.engineRunKey,
          parserRevision,
        }),
      );
    expect(await recompute(RESULT_PARSER_REVISION)).toBe(keys.parsedResultKey);
    expect(await recompute("SIMC_JSON_2_PARSER_V2")).not.toBe(keys.parsedResultKey);
    const h = await startedService();
    const first = await run(h, devJob());
    const expected = await expectedResultIdentity(
      devJob(),
      bytesOf(devJob()),
      FAKE_ARTIFACT,
      RUNNER_SPEC_BINDINGS,
    );
    if (!expected.ok) throw new Error("prepare");
    const foreign = structuredClone(first.done.result) as Json;
    foreign.provenance.parserRevision = "SIMC_JSON_2_PARSER_V1";
    expect(verifySimulationResult(foreign, expected.value)).toMatchObject({
      ok: false,
      failure: { code: "MODEL_PROVENANCE_MISMATCH" },
    });
  });
});

describe("M11-G3-5 cache entries (AG–AI)", () => {
  it("AG. a HIT carries the full provenance of the run that produced it", async () => {
    const h = await startedService();
    const miss = await run(h, devJob());
    const hit = await run(h, devJob());
    expect(hit.done.result).toEqual(miss.done.result);
    const entry = await h.cache.get(miss.submitted.cacheKey);
    expect(entry?.resultMac).toMatch(/^[0-9a-f]{64}$/);
    expect(entry).toMatchObject({
      schema: "simulation-cache-entry/2",
      cacheKey: miss.submitted.cacheKey,
      modelIdentity: miss.done.result?.model,
      parserRevision: RESULT_PARSER_REVISION,
    });
    expect(Number.isNaN(Date.parse(entry?.createdAt ?? ""))).toBe(false);
    const result = hit.done.result as Json;
    expect(result.model.binarySha256).toBe(FAKE_ARTIFACT.binarySha256);
    expect(Object.keys(result.provenance).sort()).toEqual(
      [
        "bloodlustProvenance",
        "consumablesProvenance",
        "durationAssumption",
        "engineVersion",
        "hotfixHash",
        "inputBuilderRevision",
        "networkingCompiledOut",
        "parserRevision",
        "raidBuffsProvenance",
        "reportVersion",
        "simulatedDurationMs",
        "tankModel",
      ].sort(),
    );
  });

  it("AH. a corrupt, truncated or foreign durable entry is rejected, dropped and recomputed", async () => {
    for (const [name, corrupt] of [
      ["junk", "not json at all"],
      ["truncated", null],
      ["wrong shape", JSON.stringify({ schema: "simulation-cache-entry/1", cacheKey: "x" })],
      ["empty", ""],
    ] as const) {
      const dir = scratch();
      const cache = new FileSystemSimulationCache(dir);
      const h = await startedService({ cache });
      const first = await run(h, devJob());
      const path = join(dir, `${first.submitted.cacheKey}.json`);
      const valid = JSON.stringify(await cache.get(first.submitted.cacheKey));
      writeFileSync(path, corrupt ?? valid.slice(0, valid.length / 2), "utf8");
      const launches = h.launcher.launches;
      const again = await run(h, devJob());
      expect(again.submitted.cacheStatus, name).toBe("MISS");
      expect(again.done.status, name).toBe("SUCCEEDED");
      expect(h.launcher.launches, name).toBe(launches + 1);
      const rewritten = await cache.get(first.submitted.cacheKey);
      expect(rewritten?.schema, name).toBe("simulation-cache-entry/2");
      expect(rewritten?.resultMac, name).toMatch(/^[0-9a-f]{64}$/);
      expect(
        firstSemanticDifference(rewritten?.result as never, first.done.result as never, 0),
        name,
      ).toBeNull();
      expect(
        firstSemanticDifference(again.done.result as never, first.done.result as never, 0),
        name,
      ).toBeNull();
      expect(
        readdirSync(dir, { recursive: false, withFileTypes: false }).filter((file) => file.endsWith(".tmp")),
        name,
      ).toEqual([]);
    }
    // An invalid key never becomes a path.
    await expect(new FileSystemSimulationCache(scratch()).get("../../etc/passwd")).rejects.toThrow(
      /invalid key/,
    );
  });

  it("AI. how a result was served (MISS / COALESCED / HIT) never changes the result, and is recorded beside it", async () => {
    const h = await startedService();
    const a = await h.service.submit({ job: devJob(), rawByteLength: bytesOf(devJob()) });
    const b = await h.service.submit({ job: devJob(), rawByteLength: bytesOf(devJob()) });
    if (!a.accepted || !b.accepted) throw new Error("refused");
    const [miss, coalesced] = [
      await h.service.waitFor(a.ticket.jobId),
      await h.service.waitFor(b.ticket.jobId),
    ];
    const hit = await run(h, devJob());
    expect([miss?.cacheStatus, coalesced?.cacheStatus, hit.done.cacheStatus]).toEqual([
      "MISS",
      "COALESCED",
      "HIT",
    ]);
    for (const view of [coalesced, hit.done]) {
      expect(firstSemanticDifference(miss?.result as never, view?.result as never, 0)).toBeNull();
      expect(view?.result).toEqual(miss?.result);
    }
    expect(JSON.stringify(miss?.result)).not.toMatch(/cacheStatus|MISS|HIT|COALESCED|jobId/);
    // The memory and durable adapters behave identically.
    const durable = await startedService({ cache: new FileSystemSimulationCache(scratch()) });
    const memory = await startedService({ cache: new MemorySimulationCache() });
    const [d1, m1] = [await run(durable, devJob()), await run(memory, devJob())];
    const [d2, m2] = [await run(durable, devJob()), await run(memory, devJob())];
    expect([d2.submitted.cacheStatus, m2.submitted.cacheStatus]).toEqual(["HIT", "HIT"]);
    expect(firstSemanticDifference(d1.done.result as never, m1.done.result as never, 0)).toBeNull();
  });
});

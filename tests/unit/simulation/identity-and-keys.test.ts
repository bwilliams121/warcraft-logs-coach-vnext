/**
 * M11-G3-1: model provenance, identity hashes and cache keys.
 *
 * An engine artifact is identified by what it REPORTS and by the hash of the
 * binary the runner executed — never by a filename or tag. Hashes describe the
 * simulated character and environment and never a person, report or path;
 * cache keys cover every input that can change a result.
 */

import { describe, expect, it } from "vitest";

import { simulationCacheKeys } from "../../../src/simulation/cache-key.js";
import { canonicalJson, environmentHash, profileHash } from "../../../src/simulation/canonical.js";
import { executionProfileById } from "../../../src/simulation/execution-profiles.js";
import type { SimulationJob } from "../../../src/simulation/job.js";
import {
  verifyEngineIdentity,
  type ApprovedEngineArtifact,
  type ObservedEngineIdentity,
} from "../../../src/simulation/model.js";
import { simulationPolicyById } from "../../../src/simulation/simulation-policy.js";
import { BLOOD_SIMULATION_BINDING as BLOOD } from "../../../src/specs/deathknight/blood/simulation-binding.js";
import { devBloodJob, TEST_ARTIFACT } from "../../support/simulation/dev-blood-job.js";
import { DEV_SIMULATION_MODEL_ID, modelPin } from "../../support/simulation/dev-blood-job.js";

/** The historical simulation model these tests were written against (M11 model registry). */
const HISTORICAL_MODEL = modelPin(DEV_SIMULATION_MODEL_ID);

const job = (): SimulationJob => JSON.parse(JSON.stringify(devBloodJob())) as SimulationJob;

const observed: ObservedEngineIdentity = {
  reportedGitRevision: "33622e9",
  reportedGameDataBuild: "12.1.0.69587",
  binarySha256: TEST_ARTIFACT.binarySha256,
  networkingCompiledOut: true,
};

describe("M11-G3-1 model provenance", () => {
  it("R. the approved pin is 33622e9d / 12.1.0.69587", () => {
    expect(HISTORICAL_MODEL).toEqual({
      simcCommit: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
      gameDataBuild: "12.1.0.69587",
    });
  });

  it("R. the engine's own identity is accepted only when every field agrees", () => {
    expect(verifyEngineIdentity(observed, TEST_ARTIFACT).ok).toBe(true);
    const mismatches: [string, Partial<ObservedEngineIdentity>][] = [
      ["nightly revision", { reportedGitRevision: "af05b9e" }],
      ["too-short revision", { reportedGitRevision: "33622e" }],
      ["no revision", { reportedGitRevision: null }],
      ["uppercase revision", { reportedGitRevision: "33622E9" }],
      ["nightly game data", { reportedGameDataBuild: "12.1.0.69933" }],
      ["no game data", { reportedGameDataBuild: null }],
      ["different binary", { binarySha256: "1".repeat(64) }],
      ["networking compiled in", { networkingCompiledOut: false }],
    ];
    for (const [label, change] of mismatches) {
      const result = verifyEngineIdentity({ ...observed, ...change }, TEST_ARTIFACT);
      expect(result.ok, label).toBe(false);
      if (!result.ok) expect(result.failure.code, label).toBe("MODEL_PROVENANCE_MISMATCH");
    }
  });

  it("R. the full revision is also accepted, and the result names the approved commit", () => {
    const full = verifyEngineIdentity(
      { ...observed, reportedGitRevision: HISTORICAL_MODEL.simcCommit },
      TEST_ARTIFACT,
    );
    expect(full.ok && full.value.simcCommit).toBe(HISTORICAL_MODEL.simcCommit);
  });
});

describe("M11-G3-1 identity hashes", () => {
  it("canonical JSON is key-order independent and refuses non-JSON values", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
    expect(() => canonicalJson({ a: new Date(0) })).toThrow();
  });

  it("J. a different duration changes the environment hash and not the profile hash", async () => {
    const base = job();
    const longer = job();
    (longer.environment as { durationMs: number }).durationMs += 1;
    expect(await environmentHash(longer.environment)).not.toBe(await environmentHash(base.environment));
    expect(await profileHash(longer.character)).toBe(await profileHash(base.character));
  });

  it("J. a gear change changes the profile hash and not the environment hash", async () => {
    const base = job();
    const regemmed = job();
    (regemmed.character.gear[1] as { gems: unknown }).gems = { kind: "KNOWN_NONE" };
    expect(await profileHash(regemmed.character)).not.toBe(await profileHash(base.character));
    expect(await environmentHash(regemmed.environment)).toBe(await environmentHash(base.environment));
  });

  it("J. buffs and Bloodlust timing are environment identity; consumables are profile identity", async () => {
    const base = job();
    const lust = job();
    (lust.environment.bloodlust as { atMs: number }).atMs = 6_000;
    expect(await environmentHash(lust.environment)).not.toBe(await environmentHash(base.environment));
    const potion = job();
    (potion.character.consumables as { potion: string }).potion = "NONE";
    expect(await profileHash(potion.character)).not.toBe(await profileHash(base.character));
  });

  it("hash inputs hold no name, report, actor or path (the job cannot carry them)", () => {
    const text = canonicalJson(job());
    expect(text).not.toMatch(/b1PmaKrd6CDfzngc|"name"|reportCode|sourceID|actorId|[A-Za-z]:\\\\/);
  });
});

describe("M11-G3-1 cache keys", () => {
  const profile = executionProfileById("SIMC_DEFAULT_PINNED");
  const policy = simulationPolicyById("STANDARD_SIM_V1");
  if (profile === undefined || policy === undefined) throw new Error("registry");

  it("M. the engine-run key changes with every component that can change a result", async () => {
    const base = await simulationCacheKeys(job(), BLOOD, TEST_ARTIFACT, profile, policy);
    const variants: [string, Promise<{ engineRunKey: string }>][] = [];
    const add = (label: string, keys: Promise<{ engineRunKey: string }>) => variants.push([label, keys]);
    const altered = <T>(value: T, change: (copy: T) => void): T => {
      const copy = JSON.parse(JSON.stringify(value)) as T;
      change(copy);
      return copy;
    };
    add(
      "binary",
      simulationCacheKeys(job(), BLOOD, { ...TEST_ARTIFACT, binarySha256: "1".repeat(64) }, profile, policy),
    );
    add(
      "recipe",
      simulationCacheKeys(job(), BLOOD, { ...TEST_ARTIFACT, buildRecipeRevision: "other" }, profile, policy),
    );
    add(
      "model",
      simulationCacheKeys(
        job(),
        BLOOD,
        { ...TEST_ARTIFACT, model: { ...TEST_ARTIFACT.model, gameDataBuild: "x" } } as ApprovedEngineArtifact,
        profile,
        policy,
      ),
    );
    add(
      "execution profile version",
      simulationCacheKeys(job(), BLOOD, TEST_ARTIFACT, { ...profile, version: profile.version + 1 }, policy),
    );
    add(
      "execution profile setting",
      simulationCacheKeys(
        job(),
        BLOOD,
        TEST_ARTIFACT,
        altered(profile, (p) => ((p.player as { reactionTimeMeanMs: number }).reactionTimeMeanMs = 249)),
        policy,
      ),
    );
    add(
      "policy version",
      simulationCacheKeys(job(), BLOOD, TEST_ARTIFACT, profile, { ...policy, version: 2 }),
    );
    add(
      "iterations",
      simulationCacheKeys(job(), BLOOD, TEST_ARTIFACT, profile, { ...policy, iterations: 2_001 }),
    );
    add("seed", simulationCacheKeys(job(), BLOOD, TEST_ARTIFACT, profile, { ...policy, seed: 1 }));
    add("threads", simulationCacheKeys(job(), BLOOD, TEST_ARTIFACT, profile, { ...policy, threads: 4 }));
    add(
      "outputs",
      simulationCacheKeys(
        altered(job(), (j) => ((j.requestedOutputs as { petBreakdown: boolean }).petBreakdown = false)),
        BLOOD,
        TEST_ARTIFACT,
        profile,
        policy,
      ),
    );
    add(
      "profile",
      simulationCacheKeys(
        altered(job(), (j) => ((j.character as { race: string }).race = "human")),
        BLOOD,
        TEST_ARTIFACT,
        profile,
        policy,
      ),
    );
    add(
      "environment",
      simulationCacheKeys(
        altered(job(), (j) => ((j.environment as { durationMs: number }).durationMs = 300_000)),
        BLOOD,
        TEST_ARTIFACT,
        profile,
        policy,
      ),
    );
    const seen = new Set([base.engineRunKey]);
    for (const [label, keys] of variants) {
      const key = (await keys).engineRunKey;
      expect(seen.has(key), label).toBe(false);
      seen.add(key);
    }
  });

  it("M. the same job reproduces the same keys; the parsed-result key extends the run key", async () => {
    const first = await simulationCacheKeys(job(), BLOOD, TEST_ARTIFACT, profile, policy);
    const second = await simulationCacheKeys(job(), BLOOD, TEST_ARTIFACT, profile, policy);
    expect(second).toEqual(first);
    expect(first.parsedResultKey).not.toBe(first.engineRunKey);
    expect(first.engineRunKey).toMatch(/^[0-9a-f]{64}$/);
  });
});

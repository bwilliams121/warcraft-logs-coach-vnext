/**
 * M11 model registry: Consumption / `consumption_release` on BOTH simulation
 * models, from the per-model goldens cut by
 * scripts/bench/m11-consumption-release.bench.ts (an engine-written
 * Consumption loadout through the production path). Offline.
 *
 * FINDING (pinned here): the parser needs no migration — both models parse and
 * verify — but the ACTION BREAKDOWN GRANULARITY is model-dependent:
 *
 *   33622e9d  `consumption` and `consumption_release` are separate TOP-LEVEL
 *             actions -> two breakdown entries.
 *   0a72e6a7  `consumption_release` is a CHILD of `consumption` (upstream
 *             5f3f05020a) -> one `consumption` entry whose compound amount
 *             includes the release.
 *
 * The parser's semantics (one entry per top-level action, compound amount)
 * are unchanged and correct for each model; per-ability comparison ACROSS
 * models must account for the restructure.
 */

import { describe, expect, it } from "vitest";

import { RUNNER_SPEC_BINDINGS } from "../../../runner/spec-bindings.js";
import { APPROVED_ENGINE_ARTIFACTS } from "../../../src/simulation/approved-artifacts.js";
import { prepareSimulation } from "../../../src/simulation/prepare.js";
import { parseSimcJson } from "../../../src/simulation/result-parser.js";
import {
  expectedResultIdentity,
  verifySimulationResult,
} from "../../../src/simulation/result-verification.js";
import historical from "../../fixtures/simulation/simc-33622e9d-blood-consumption.json";
import promoted from "../../fixtures/simulation/simc-0a72e6a7-blood-consumption.json";
import { devBloodJob, jsonBytes } from "../../support/simulation/dev-blood-job.js";

type Json = Record<string, any>;

const OLD = "SIMC_33622E9D_LIVE_12_1_0_69587";
const NEW = "SIMC_0A72E6A7_LIVE_12_1_0_69933";

/** The production path for one model's golden: prepare the engine-written Consumption job, parse, verify. */
async function parseGolden(golden: Json, modelId: string) {
  const job = devBloodJob("STANDARD_SIM_V1", "ELITE_REALISTIC_V1", modelId) as Json;
  job["character"].talents = { importString: golden["_golden"].talentImportString };
  const prepared = await prepareSimulation(
    job,
    jsonBytes(job),
    APPROVED_ENGINE_ARTIFACTS,
    RUNNER_SPEC_BINDINGS,
  );
  if (!prepared.ok) throw new Error(prepared.failure.detail);
  expect(prepared.value.keys.profileHash).toBe(golden["_golden"].jobProfileHash);
  const text = JSON.stringify(golden);
  const parsed = parseSimcJson(text, text.length, {
    job: prepared.value.job,
    binding: prepared.value.binding,
    profile: prepared.value.profile,
    policy: prepared.value.policy,
    approved: prepared.value.artifact,
    executedBinarySha256: prepared.value.artifact.binarySha256,
    profileHash: prepared.value.keys.profileHash,
    environmentHash: prepared.value.keys.environmentHash,
    executionProfileRevision: prepared.value.keys.executionProfileRevision,
  });
  const expected = await expectedResultIdentity(
    job,
    jsonBytes(job),
    APPROVED_ENGINE_ARTIFACTS,
    RUNNER_SPEC_BINDINGS,
  );
  if (!expected.ok) throw new Error(expected.failure.detail);
  return { job, prepared: prepared.value, parsed, expected: expected.value };
}

const statsOf = (golden: Json): Json[] => golden["sim"].players[0].stats as Json[];
const find = (nodes: Json[], name: string): Json | undefined => {
  for (const node of nodes) {
    if (node["name"] === name) return node;
    const inner = find((node["children"] as Json[] | undefined) ?? [], name);
    if (inner !== undefined) return inner;
  }
  return undefined;
};

describe("M11 Consumption / consumption_release across simulation models", () => {
  it("both goldens are the same engine-written Consumption loadout, run on their own engines", () => {
    expect(historical._golden.talentImportString).toBe(promoted._golden.talentImportString);
    expect(historical.git_revision).toBe("33622e9d16");
    expect(promoted.git_revision).toBe("0a72e6a746");
  });

  it("the JSON representation: top-level release at 33622e9d, child release at 0a72e6a7", () => {
    const oldTop = statsOf(historical).map((node) => node["name"]);
    const newTop = statsOf(promoted).map((node) => node["name"]);
    expect(oldTop).toContain("consumption");
    expect(oldTop).toContain("consumption_release");
    expect(newTop).toContain("consumption");
    expect(newTop).not.toContain("consumption_release");
    const parent = statsOf(promoted).find((node) => node["name"] === "consumption");
    expect(((parent?.["children"] as Json[] | undefined) ?? []).map((child) => child["name"])).toContain(
      "consumption_release",
    );
    // The release keeps its spell and its own leech child on both models.
    expect(find(statsOf(historical), "consumption_release")?.["id"]).toBe(1263825);
    expect(find(statsOf(promoted), "consumption_release")?.["id"]).toBe(1263825);
    expect(find(statsOf(promoted), "consumption_leech")?.["id"]).toBe(1263872);
  });

  it("the parser handles both (no migration): one entry per top-level action, compound amount", async () => {
    const oldRun = await parseGolden(historical, OLD);
    const newRun = await parseGolden(promoted, NEW);
    if (!oldRun.parsed.ok || !newRun.parsed.ok) throw new Error("parse");
    const names = (breakdown: readonly { actionName: string }[] | undefined) =>
      (breakdown ?? []).map((entry) => entry.actionName).filter((name) => name.startsWith("consumption"));
    expect(names(oldRun.parsed.value.actionBreakdown)).toEqual(["consumption", "consumption_release"]);
    expect(names(newRun.parsed.value.actionBreakdown)).toEqual(["consumption"]);
    // At 0a72e6a7 the consumption entry INCLUDES the release (its compound amount).
    const newEntry = newRun.parsed.value.actionBreakdown?.find((entry) => entry.actionName === "consumption");
    const releaseChild = find(statsOf(promoted), "consumption_release");
    expect(newEntry?.meanDamagePerIteration).toBe(
      find(statsOf(promoted), "consumption")?.["compound_amount"],
    );
    expect(newEntry?.meanDamagePerIteration ?? 0).toBeGreaterThan(
      Number(releaseChild?.["compound_amount"] ?? 0),
    );
  });

  it("result verification and cache identity are per model; neither result verifies as the other model", async () => {
    const oldRun = await parseGolden(historical, OLD);
    const newRun = await parseGolden(promoted, NEW);
    if (!oldRun.parsed.ok || !newRun.parsed.ok) throw new Error("parse");
    expect(verifySimulationResult(oldRun.parsed.value, oldRun.expected).ok).toBe(true);
    expect(verifySimulationResult(newRun.parsed.value, newRun.expected).ok).toBe(true);
    expect(verifySimulationResult(newRun.parsed.value, oldRun.expected)).toMatchObject({
      ok: false,
      failure: { code: "MODEL_PROVENANCE_MISMATCH" },
    });
    expect(verifySimulationResult(oldRun.parsed.value, newRun.expected)).toMatchObject({
      ok: false,
      failure: { code: "MODEL_PROVENANCE_MISMATCH" },
    });
    expect(oldRun.prepared.keys.parsedResultKey).not.toBe(newRun.prepared.keys.parsedResultKey);
  });
});

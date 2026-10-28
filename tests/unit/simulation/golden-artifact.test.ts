/**
 * M11-G3-1: the GOLDEN artifact from the exact-pin engine.
 *
 * tests/fixtures/simulation/simc-33622e9d-blood-dev-standard.json is a
 * sanitized projection (fields the parser reads only; no build date, time or
 * timestamp) of the real `json2` report the approved artifact produced for the
 * development Blood job under STANDARD_SIM_V1 and SIMC_DEFAULT_PINNED. Its
 * `_golden` block records the raw report's SHA-256.
 *
 * These pins are the engine's numbers, not expectations about Blood: they
 * change only when the engine, the job, the builder or the parser changes —
 * and then the artifact is re-cut from a verified engine, never edited.
 */

import { describe, expect, it } from "vitest";

import { APPROVED_ENGINE_ARTIFACTS } from "../../../runner/approved-artifacts.js";
import { approvedArtifactForPin } from "../../../src/simulation/approved-artifacts.js";
import { RUNNER_SPEC_BINDINGS } from "../../../runner/spec-bindings.js";
import { prepareSimulation } from "../../../src/simulation/prepare.js";
import { parseSimcJson, type ParseContext } from "../../../src/simulation/result-parser.js";
import golden from "../../fixtures/simulation/simc-33622e9d-blood-dev-standard.json";
import { devBloodJob, jsonBytes } from "../../support/simulation/dev-blood-job.js";

/** This golden is the 33622e9d model's (M11 model registry: one artifact per registered model). */
const ARTIFACT = approvedArtifactForPin({
  simcCommit: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  gameDataBuild: "12.1.0.69587",
});

async function context(): Promise<ParseContext> {
  if (ARTIFACT === undefined) throw new Error("no approved artifact");
  const job = devBloodJob("STANDARD_SIM_V1", "SIMC_DEFAULT_PINNED");
  const prepared = await prepareSimulation(job, jsonBytes(job), ARTIFACT, RUNNER_SPEC_BINDINGS);
  if (!prepared.ok) throw new Error(prepared.failure.code);
  return {
    job: prepared.value.job,
    binding: prepared.value.binding,
    profile: prepared.value.profile,
    policy: prepared.value.policy,
    approved: ARTIFACT,
    executedBinarySha256: ARTIFACT.binarySha256,
    profileHash: prepared.value.keys.profileHash,
    environmentHash: prepared.value.keys.environmentHash,
    executionProfileRevision: prepared.value.keys.executionProfileRevision,
  };
}

const text = JSON.stringify(golden);

describe("M11-G3-1 golden exact-pin artifact", () => {
  it("is the approved engine's own identity", () => {
    // Exactly the two registered models; the historical artifact is unchanged.
    expect(APPROVED_ENGINE_ARTIFACTS.map((artifact) => artifact.binarySha256)).toEqual([
      "41347bc4203bd1b073a617cd9cd147a96c9c09a36f8c7af5c013ca7be273cb77",
      "79bf5a406b0ca16eb8e828ef017603b60fdee576a5cb3cf4acaacf93a08eea36",
    ]);
    expect(ARTIFACT?.binarySha256).toBe("41347bc4203bd1b073a617cd9cd147a96c9c09a36f8c7af5c013ca7be273cb77");
    expect(golden.git_revision).toBe("33622e9d16");
    expect(golden.no_networking).toBe(true);
    expect(golden.sim.options.dbc.Live.wow_version).toBe("12.1.0.69587");
    expect(golden._golden.source).toContain(ARTIFACT?.binarySha256 ?? "none");
  });

  it("parses to the pinned result through the production parser", async () => {
    const outcome = parseSimcJson(text, text.length, await context());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const result = outcome.value;
    expect(result.model).toEqual({
      requestedSimcCommit: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
      reportedGitRevision: "33622e9d16",
      gameDataBuild: "12.1.0.69587",
      binarySha256: "41347bc4203bd1b073a617cd9cd147a96c9c09a36f8c7af5c013ca7be273cb77",
      buildRecipeRevision: "simc-build/1",
    });
    expect(result.iterations).toEqual({ requested: 2_000, counted: 1_992 });
    expect(result.dps.mean).toBe(golden.sim.players[0]?.collected_data.dps.mean);
    expect(result.dps.mean).toBeCloseTo(82_330.6176, 3);
    expect(result.dps.relativeStandardError).toBeLessThan(0.0008);
    expect(result.provenance.simulatedDurationMs).toBe(345_177);
    expect(result.petBreakdown?.map((pet) => pet.petName)).toEqual(["dance_of_midnight", "everlasting_bond"]);
    expect(result.actionBreakdown?.length).toBeGreaterThan(10);
  });

  it("fails closed when the executed binary is not the approved one", async () => {
    const ctx = await context();
    const outcome = parseSimcJson(text, text.length, { ...ctx, executedBinarySha256: "0".repeat(64) });
    expect(outcome.ok ? "OK" : outcome.failure.code).toBe("MODEL_PROVENANCE_MISMATCH");
  });

  it("carries no host path, user, timestamp or report identity", () => {
    expect(text).not.toMatch(
      /[A-Za-z]:\\\\|\/work\/|\/tmp\/|\/home\/|Users|b1PmaKrd6CDfzngc|"timestamp"|"build_date"|"build_time"/,
    );
    expect(text.length).toBeLessThan(32 * 1024);
  });
});

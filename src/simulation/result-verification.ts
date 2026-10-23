/**
 * RESULT VERIFICATION (M11-G3-5): a SimulationResult that did not come straight
 * out of `parseSimcJson` in this process — a cache entry, a remote response —
 * is accepted only after it is re-checked against the identity RECOMPUTED from
 * the job itself:
 *
 *   shape          the exact SimulationResult schema        SIMULATION_OUTPUT_MALFORMED
 *   model          commit, data build, binary, recipe        MODEL_PROVENANCE_MISMATCH
 *   job identity   profile/environment hash, execution
 *                  profile id/version/revision/settings,
 *                  policy id/version, iterations, duration,
 *                  tank model, provenance labels             MODEL_PROVENANCE_MISMATCH
 *   revisions      parser and input-builder revisions        MODEL_PROVENANCE_MISMATCH
 *   numbers        finite, positive mean, counted iterations SIMULATION_OUTPUT_MALFORMED
 *   precision      relative SE within the policy's bound     SIMULATION_PRECISION_NOT_MET
 *
 * HTTP 200 or a cache hit is never trust: this is the gate. Worker-safe.
 */

import { z } from "zod";

import { fail, succeed, type SimulationOutcome } from "./failures.js";
import { INPUT_BUILDER_REVISION } from "./input-builder.js";
import type { ApprovedEngineArtifact } from "./model.js";
import { prepareSimulation, type PreparedSimulation } from "./prepare.js";
import { RESULT_PARSER_REVISION } from "./result-parser.js";
import { SIMULATION_RESULT_SCHEMA_VERSION, type SimulationResult } from "./result.js";
import type { SimulationSpecBinding } from "./spec-binding.js";

const finite = z.number().finite();
const hex64 = z.string().regex(/^[0-9a-f]{64}$/);

const executionSimSettingsSchema = z
  .object({
    strictGcdQueue: z.boolean(),
    queueLagMs: finite,
    queueLagStddevMs: finite,
    gcdLagMs: finite,
    gcdLagStddevMs: finite,
    channelLagMs: finite,
    channelLagStddevMs: finite,
    queueGcdReductionMs: finite,
    worldLagMs: finite,
    worldLagStddevMs: finite,
    cooldownToleranceMs: finite,
    auraDelayMs: finite,
    auraDelayStddevMs: finite,
    simReactionTimeMs: finite,
    defaultSkill: finite,
    travelVariance: finite,
  })
  .strict();

const executionPlayerSettingsSchema = z
  .object({
    reactionTimeMeanMs: finite,
    reactionTimeStddevMs: finite,
    reactionTimeNuMs: finite,
    reactionTimeOffsetMs: finite,
    reactionTimeMaxMs: finite,
    brainLagMs: finite,
    brainLagStddevMs: finite,
    skill: finite,
    enableSpellQueue: z.boolean(),
    spellQueueWindowMs: finite,
    readyTrigger: z.boolean(),
  })
  .strict();

export const simulationResultSchema = z
  .object({
    schemaVersion: z.literal(SIMULATION_RESULT_SCHEMA_VERSION),
    model: z
      .object({
        requestedSimcCommit: z.string().regex(/^[0-9a-f]{40}$/),
        reportedGitRevision: z.string().regex(/^[0-9a-f]{7,40}$/),
        gameDataBuild: z.string(),
        binarySha256: hex64,
        buildRecipeRevision: z.string(),
      })
      .strict(),
    profileHash: hex64,
    environmentHash: hex64,
    executionProfile: z
      .object({
        id: z.string(),
        version: z.number().int(),
        revision: hex64,
        effectiveSettings: z
          .object({ sim: executionSimSettingsSchema, player: executionPlayerSettingsSchema })
          .strict(),
      })
      .strict(),
    simulationPolicy: z.object({ id: z.string(), version: z.number().int() }).strict(),
    iterations: z.object({ requested: z.number().int(), counted: z.number().int() }).strict(),
    dps: z
      .object({
        mean: finite,
        standardDeviation: finite,
        standardError: finite,
        relativeStandardError: finite,
        ci95: z.object({ lower: finite, upper: finite }).strict(),
      })
      .strict(),
    actionBreakdown: z
      .array(
        z
          .object({
            actionName: z.string(),
            spellId: z.number().int(),
            meanDamagePerIteration: finite,
            meanExecutesPerIteration: finite.nullable(),
          })
          .strict(),
      )
      .optional(),
    petBreakdown: z
      .array(z.object({ petName: z.string(), meanDamagePerIteration: finite }).strict())
      .optional(),
    diagnostics: z
      .object({ engineWallSeconds: finite, engineCpuSeconds: finite, eventsProcessed: finite })
      .strict(),
    provenance: z
      .object({
        parserRevision: z.string(),
        inputBuilderRevision: z.string(),
        reportVersion: z.string(),
        engineVersion: z.string(),
        hotfixHash: z.string(),
        networkingCompiledOut: z.literal(true),
        simulatedDurationMs: z.number().int(),
        durationAssumption: z.literal("EXACT_OBSERVED_DURATION_CEILING_ASSUMPTION"),
        tankModel: z.string(),
        consumablesProvenance: z.string(),
        raidBuffsProvenance: z.string(),
        bloodlustProvenance: z.string(),
      })
      .strict(),
  })
  .strict();

/** The identity a result for this job must carry, recomputed from the job (never from the result). */
export interface ExpectedResultIdentity {
  readonly artifact: ApprovedEngineArtifact;
  readonly prepared: PreparedSimulation;
}

export async function expectedResultIdentity(
  job: unknown,
  rawByteLength: number,
  artifact: ApprovedEngineArtifact,
  bindings: readonly SimulationSpecBinding[],
): Promise<SimulationOutcome<ExpectedResultIdentity>> {
  const prepared = await prepareSimulation(job, rawByteLength, artifact, bindings);
  if (!prepared.ok) return prepared;
  return succeed({ artifact, prepared: prepared.value });
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Re-checks a candidate result against the recomputed identity. Returns the typed result or a typed failure. */
export function verifySimulationResult(
  candidate: unknown,
  expected: ExpectedResultIdentity,
): SimulationOutcome<SimulationResult> {
  const parsed = simulationResultSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(
      "SIMULATION_OUTPUT_MALFORMED",
      `result shape: ${issue?.path.join(".") ?? "(root)"} ${issue?.code ?? "invalid"}`,
    );
  }
  const result = parsed.data as SimulationResult;
  const { artifact, prepared } = expected;
  const { job, profile, policy, keys } = prepared;
  const mismatch = (field: string) =>
    fail<SimulationResult>("MODEL_PROVENANCE_MISMATCH", `result ${field} does not match the job`);

  if (result.model.requestedSimcCommit !== artifact.model.simcCommit)
    return mismatch("model.requestedSimcCommit");
  if (!artifact.model.simcCommit.startsWith(result.model.reportedGitRevision))
    return mismatch("model.reportedGitRevision");
  if (result.model.gameDataBuild !== artifact.model.gameDataBuild) return mismatch("model.gameDataBuild");
  if (result.model.binarySha256 !== artifact.binarySha256) return mismatch("model.binarySha256");
  if (result.model.buildRecipeRevision !== artifact.buildRecipeRevision)
    return mismatch("model.buildRecipeRevision");
  if (result.profileHash !== keys.profileHash) return mismatch("profileHash");
  if (result.environmentHash !== keys.environmentHash) return mismatch("environmentHash");
  if (result.executionProfile.id !== profile.id || result.executionProfile.version !== profile.version) {
    return mismatch("executionProfile id/version");
  }
  if (result.executionProfile.revision !== keys.executionProfileRevision)
    return mismatch("executionProfile.revision");
  if (!sameJson(result.executionProfile.effectiveSettings, { sim: profile.sim, player: profile.player })) {
    return mismatch("executionProfile.effectiveSettings");
  }
  if (result.simulationPolicy.id !== policy.id || result.simulationPolicy.version !== policy.version) {
    return mismatch("simulationPolicy");
  }
  if (result.iterations.requested !== policy.iterations) return mismatch("iterations.requested");
  if (result.provenance.parserRevision !== RESULT_PARSER_REVISION)
    return mismatch("provenance.parserRevision");
  if (result.provenance.inputBuilderRevision !== INPUT_BUILDER_REVISION)
    return mismatch("provenance.inputBuilderRevision");
  if (result.provenance.simulatedDurationMs !== job.environment.durationMs)
    return mismatch("provenance.simulatedDurationMs");
  if (result.provenance.tankModel !== job.environment.tankModel) return mismatch("provenance.tankModel");
  if (result.provenance.consumablesProvenance !== job.character.consumables.provenance) {
    return mismatch("provenance.consumablesProvenance");
  }
  if (result.provenance.raidBuffsProvenance !== job.environment.raidBuffs.provenance) {
    return mismatch("provenance.raidBuffsProvenance");
  }
  if (result.provenance.bloodlustProvenance !== job.environment.bloodlust.provenance) {
    return mismatch("provenance.bloodlustProvenance");
  }
  if ((result.actionBreakdown !== undefined) !== job.requestedOutputs.actionBreakdown)
    return mismatch("actionBreakdown presence");
  if ((result.petBreakdown !== undefined) !== job.requestedOutputs.petBreakdown)
    return mismatch("petBreakdown presence");

  if (!(result.dps.mean > 0) || result.iterations.counted < 1) {
    return fail("SIMULATION_OUTPUT_MALFORMED", "result: no positive mean DPS over counted iterations");
  }
  if (result.dps.relativeStandardError > policy.maxRelativeStandardError) {
    return fail(
      "SIMULATION_PRECISION_NOT_MET",
      `relative standard error ${String(result.dps.relativeStandardError)} exceeds ${String(policy.maxRelativeStandardError)}`,
    );
  }
  return succeed(result);
}

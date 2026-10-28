/**
 * SIMULATION MODEL REGISTRY (M11 model promotion).
 *
 * A SimulationModel is one exact SimulationCraft engine + game-data build used
 * to SIMULATE. It is a different concept from the ANALYZER AUTHORITY model
 * (the SimC commit the public analyzers' APL/data authority was extracted
 * from; src/simc/analyzer-authority-model.ts). Neither selects the other, and
 * this module imports nothing from analyzer authority.
 *
 * Every model here is APPROVED and permanent: historical results stay
 * reproducible, so a model is never removed or overwritten. Being newer does
 * not make a model applicable to anything.
 *
 * WHAT A MODEL IS (identity, spec-agnostic):
 *   commit + Live game-data build      the pin a job names (`job.model`)
 *   client-data snapshot               hotfix date/hash and when upstream committed it
 *   engine revision                    what the engine reports in its JSON
 *   artifact                           binary SHA-256 + build recipe (the runner hashes it)
 *   image                              immutable image id it ships in
 *
 * WHERE A MODEL APPLIES (spec-owned, NOT here): a specialization validates a
 * model for production for one game build and a snapshot-bounded window of
 * fight time (`SpecSimulationModelValidation`, declared in the spec's own
 * tree). `selectSimulationModel` combines the two. Nothing falls back to an
 * older or newer model, and there is no default model.
 */

import { fail, succeed, type SimulationOutcome } from "./failures.js";
import type { ApprovedEngineArtifact, SimcModelPin } from "./model.js";

export const SIMULATION_MODEL_REGISTRY_REVISION = "simulation-model-registry/1";

export interface SimulationModel {
  readonly role: "SIMULATION_MODEL";
  readonly id: string;
  readonly pin: SimcModelPin;
  /** Only Live data is ever registered; PTR/Beta lineages are not simulation models. */
  readonly lineage: "LIVE";
  /** The revision the engine reports (`git_revision`). */
  readonly engineRevision: string;
  readonly clientData: {
    readonly hotfixDate: string;
    readonly hotfixHash: string;
    /** The upstream `[live]` data-update commit whose data this commit carries, and when it landed. */
    readonly upstreamDataCommit: string;
    readonly snapshotCommittedAtUtc: string;
  };
  readonly artifact: ApprovedEngineArtifact;
  /** Immutable image id the artifact ships in (never a tag). */
  readonly imageId: string;
  readonly buildRecord: string;
  readonly approval: { readonly status: "APPROVED"; readonly reference: string };
}

const BUILD_RECIPE = "simc-build/1";

export const SIMULATION_MODELS: readonly SimulationModel[] = [
  {
    role: "SIMULATION_MODEL",
    id: "SIMC_33622E9D_LIVE_12_1_0_69587",
    pin: { simcCommit: "33622e9d1662ff0e451691edf85a6b49cc9d11d9", gameDataBuild: "12.1.0.69587" },
    lineage: "LIVE",
    engineRevision: "33622e9d16",
    clientData: {
      hotfixDate: "2026-09-10",
      hotfixHash: "98097f989dd3ee389dab97854be2a62f0f0b00c62d442668ea45332c6a2cd720",
      upstreamDataCommit: "473ed41f2b",
      snapshotCommittedAtUtc: "2026-09-10T20:43:00Z",
    },
    artifact: {
      model: { simcCommit: "33622e9d1662ff0e451691edf85a6b49cc9d11d9", gameDataBuild: "12.1.0.69587" },
      binarySha256: "41347bc4203bd1b073a617cd9cd147a96c9c09a36f8c7af5c013ca7be273cb77",
      buildRecipeRevision: BUILD_RECIPE,
    },
    imageId: "sha256:8ab91e722bd4c6e50a58a38a1244d2688bdaf3ddc68e09cd2aa59877f8b7aaf4",
    buildRecord: "runner/simc-build/build-record.json",
    approval: { status: "APPROVED", reference: "M11-G3-1 exact-pin verification (2026-10-14)" },
  },
  {
    role: "SIMULATION_MODEL",
    id: "SIMC_0A72E6A7_LIVE_12_1_0_69933",
    pin: { simcCommit: "0a72e6a74684d23c989b2d76143e429d2b4f1c91", gameDataBuild: "12.1.0.69933" },
    lineage: "LIVE",
    engineRevision: "0a72e6a746",
    clientData: {
      hotfixDate: "2026-09-22",
      hotfixHash: "dc8f0eeb5ed23ac9889878a4c55bceed727477a8a09c35baaaa27bc4bb387d4d",
      upstreamDataCommit: "0a72e6a746",
      snapshotCommittedAtUtc: "2026-09-22T20:05:35Z",
    },
    artifact: {
      model: { simcCommit: "0a72e6a74684d23c989b2d76143e429d2b4f1c91", gameDataBuild: "12.1.0.69933" },
      binarySha256: "79bf5a406b0ca16eb8e828ef017603b60fdee576a5cb3cf4acaacf93a08eea36",
      buildRecipeRevision: BUILD_RECIPE,
    },
    imageId: "sha256:efea14b4fd0694831af5bab945788be2c382f3e2ed20fce1d0597ba8bf504d59",
    buildRecord: "runner/simc-build/build-record-0a72e6a7.json",
    approval: { status: "APPROVED", reference: "M11 model-pin investigation + promotion (2026-10-23)" },
  },
];

const samePin = (a: SimcModelPin, b: SimcModelPin) =>
  a.simcCommit === b.simcCommit && a.gameDataBuild === b.gameDataBuild;

export function simulationModelById(id: string): SimulationModel | undefined {
  return SIMULATION_MODELS.find((model) => model.id === id);
}

/** The registered model a job's pin names, or UNSUPPORTED_MODEL_VERSION. Exact match only. */
export function resolveSimulationModel(pin: SimcModelPin): SimulationOutcome<SimulationModel> {
  const model = SIMULATION_MODELS.find((entry) => samePin(entry.pin, pin));
  return model === undefined
    ? fail(
        "UNSUPPORTED_MODEL_VERSION",
        `requested ${pin.simcCommit}/${pin.gameDataBuild} is not a registered simulation model`,
      )
    : succeed(model);
}

// ---------------------------------------------------------------------------
// Spec-owned validation and selection
// ---------------------------------------------------------------------------

/**
 * A specialization's production validation of one model, for one game build,
 * over a fight-time window bounded by client-data snapshots shown equivalent
 * for that spec. The window is never wider than the evidence: build equality
 * alone does not prove identical server-side state across a patch window.
 */
export interface SpecSimulationModelValidation {
  readonly modelId: string;
  readonly scope: "PRODUCTION";
  readonly gameBuild: string;
  /** Fight start must satisfy fromUtc <= start < toUtc. */
  readonly window: { readonly fromUtc: string; readonly toUtc: string };
  readonly windowBasis: "SNAPSHOTS_VERIFIED_EQUIVALENT_FOR_SPEC" | "SINGLE_SNAPSHOT_UNTIL_NEXT_LIVE_SNAPSHOT";
  readonly evidence: string;
}

export interface SpecSimulationModelValidations {
  readonly specKey: string;
  readonly validations: readonly SpecSimulationModelValidation[];
}

/**
 * The resolved game context of a log. `gameBuild` is the client build the
 * fight ran on, resolved with evidence; null when it could not be resolved.
 */
export interface SimulationGameContext {
  readonly specKey: string;
  readonly gameBuild: string | null;
  readonly fightStartUtc: string | null;
}

/**
 * WHY the selected model applies to a fight: the one spec validation whose
 * window contains the fight start. Inside that window the model's chronology
 * (its data snapshot predating the log) is discharged for selection; it is not
 * compatibility uncertainty. Specific observed effects the model cannot
 * represent still block on their own codes.
 */
export interface SimulationModelApplicability {
  readonly modelId: string;
  readonly specKey: string;
  readonly gameBuild: string;
  readonly fightStartUtc: string;
  readonly window: { readonly fromUtc: string; readonly toUtc: string };
  readonly windowBasis: SpecSimulationModelValidation["windowBasis"];
}

export interface SimulationModelSelection {
  readonly model: SimulationModel;
  readonly applicability: SimulationModelApplicability;
}

/** Validations a spec declares, from the composition root's set. */
export function validationsForSpec(
  all: readonly SpecSimulationModelValidations[],
  specKey: string,
): readonly SpecSimulationModelValidation[] {
  return all.find((entry) => entry.specKey === specKey)?.validations ?? [];
}

/** Whether a spec has validated `modelId` for production at all (the runner's check; it has no log context). */
export function isModelValidatedForSpec(
  all: readonly SpecSimulationModelValidations[],
  specKey: string,
  modelId: string,
): boolean {
  return validationsForSpec(all, specKey).some(
    (entry) => entry.modelId === modelId && entry.scope === "PRODUCTION",
  );
}

/**
 * Selects the ONE approved simulation model for a log's resolved game context.
 *
 *   build unresolved / fight time unknown        SIMULATION_MODEL_CONTEXT_UNRESOLVED
 *   no registered model for the build            SIMULATION_MODEL_NOT_AVAILABLE
 *   registered, but the spec never validated it  SIMULATION_MODEL_NOT_VALIDATED_FOR_SPEC
 *   validated, but the fight is outside every
 *   validated window for that build              SIMULATION_MODEL_NOT_AVAILABLE
 *   more than one window matches                 SIMULATION_MODEL_CONTEXT_UNRESOLVED
 *
 * There is no fallback to another build's model, older or newer. The selection
 * carries the matching validation as the model's applicability.
 */
export function selectSimulationModel(
  context: SimulationGameContext,
  validations: readonly SpecSimulationModelValidations[],
): SimulationOutcome<SimulationModelSelection> {
  if (context.gameBuild === null) {
    return fail("SIMULATION_MODEL_CONTEXT_UNRESOLVED", "the log's game build is not resolved");
  }
  const forBuild = SIMULATION_MODELS.filter((model) => model.pin.gameDataBuild === context.gameBuild);
  if (forBuild.length === 0) {
    return fail(
      "SIMULATION_MODEL_NOT_AVAILABLE",
      `no approved simulation model for game build ${context.gameBuild}`,
    );
  }
  const specValidations = validationsForSpec(validations, context.specKey).filter(
    (entry) => entry.gameBuild === context.gameBuild && forBuild.some((model) => model.id === entry.modelId),
  );
  if (specValidations.length === 0) {
    return fail(
      "SIMULATION_MODEL_NOT_VALIDATED_FOR_SPEC",
      `${context.specKey} has validated no simulation model for game build ${context.gameBuild}`,
    );
  }
  if (context.fightStartUtc === null || Number.isNaN(Date.parse(context.fightStartUtc))) {
    return fail("SIMULATION_MODEL_CONTEXT_UNRESOLVED", "the fight start time is not resolved");
  }
  const start = Date.parse(context.fightStartUtc);
  const matching = specValidations.filter(
    (entry) => Date.parse(entry.window.fromUtc) <= start && start < Date.parse(entry.window.toUtc),
  );
  if (matching.length === 0) {
    return fail(
      "SIMULATION_MODEL_NOT_AVAILABLE",
      `${context.specKey} has no validated model window for build ${context.gameBuild} at ${context.fightStartUtc}`,
    );
  }
  const validation = matching[0];
  if (matching.length !== 1 || validation === undefined) {
    return fail("SIMULATION_MODEL_CONTEXT_UNRESOLVED", "more than one validated model window matches");
  }
  const model = simulationModelById(validation.modelId);
  return model === undefined
    ? fail("SIMULATION_MODEL_NOT_AVAILABLE", "validated model is not registered")
    : succeed({
        model,
        applicability: {
          modelId: model.id,
          specKey: context.specKey,
          gameBuild: validation.gameBuild,
          fightStartUtc: context.fightStartUtc,
          window: validation.window,
          windowBasis: validation.windowBasis,
        },
      });
}

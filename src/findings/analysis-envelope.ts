/**
 * The spec-neutral analysis envelope.
 *
 * WHAT SHARED ORCHESTRATION IS ALLOWED TO KNOW ABOUT AN ANALYSIS
 *
 * Exactly three things: which status it reached, which specialization it was
 * about, and — when it analyzed anything — which pinned authority it rested on.
 * That is the whole envelope. Everything else an analyzer produces is a
 * specialization-owned PAYLOAD that the envelope carries without reading.
 *
 * WHY THE PAYLOAD IS NOT MODELLED HERE
 *
 * The first analyzer's payload is Assassination's: rotational comparisons, an
 * exclusion list and a coverage block whose counters are named for Envenom and
 * combo points. Lifting those into a "generic" shared result would make every
 * later specialization pretend its decisions are Rogue-shaped, which is the
 * universal-evaluator failure rebuilt as a type. So the payload stays with the
 * specialization, and the one place shared code needs a projection of it — the
 * public and raid-night projectors — reads a separately declared, schema-shaped
 * view supplied by the registration (see `observed-decision-view.ts`).
 *
 * THE STATUS VOCABULARY IS SHARED BECAUSE ITS MEANING IS
 *
 * `SPEC_NOT_SUPPORTED`, `AUTHORITY_NOT_AVAILABLE`, `PROFILE_NOT_RESOLVED` and
 * `INSUFFICIENT_EVIDENCE` say the same thing whichever analyzer says them, and
 * the public contract already publishes them as one enum. Moving their
 * declaration here from the Assassination module changes no value and no
 * consumer; the Assassination module re-exports them.
 */

import type { CombatState } from "../engine/state/combat-state.js";
import type { SpecId } from "./spec-id.js";

export type AnalysisStatus =
  | "ANALYZED"
  | "SPEC_NOT_SUPPORTED"
  | "AUTHORITY_NOT_AVAILABLE"
  | "PROFILE_NOT_RESOLVED"
  | "INSUFFICIENT_EVIDENCE";

export const ANALYSIS_STATUSES = [
  "ANALYZED",
  "SPEC_NOT_SUPPORTED",
  "AUTHORITY_NOT_AVAILABLE",
  "PROFILE_NOT_RESOLVED",
  "INSUFFICIENT_EVIDENCE",
] as const satisfies readonly AnalysisStatus[];

export type UnanalyzedStatus = Exclude<AnalysisStatus, "ANALYZED">;

/** Pinned authority identity, read from the artifact. Never hand-maintained. */
export interface AnalysisAuthorityMetadata {
  readonly authorityId: string;
  readonly artifactRevision: string;
  readonly repository: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly specName: string;
  readonly className: string;
}

/**
 * The envelope of an analysis that evaluated something.
 *
 * `specId` is the registered internal id, narrowed per analyzer so a
 * registration cannot return an analysis about a different specialization.
 */
export interface AnalyzedEnvelope<TSpecId extends SpecId = SpecId> {
  readonly status: "ANALYZED";
  readonly specId: TSpecId;
  readonly authority: AnalysisAuthorityMetadata;
}

/**
 * The envelope of an analysis that evaluated nothing.
 *
 * `specId` is a plain string here on purpose: for `SPEC_NOT_SUPPORTED` it is
 * the OBSERVED identity (`"priest/discipline"`), which is not a `SpecId` and
 * must not be forced into one.
 */
export interface UnanalyzedEnvelope {
  readonly status: UnanalyzedStatus;
  readonly specId: string;
  /** Author-written explanation of what was not done, and why. */
  readonly detail: string;
}

/**
 * An analysis as shared orchestration holds it: the envelope, plus whatever
 * payload the specialization attached to the analyzed variant.
 *
 * `TPayload` defaults to the empty object so a consumer that names no payload
 * type sees exactly the envelope and nothing more.
 */
export type SpecAnalysisEnvelope<TSpecId extends SpecId = SpecId, TPayload extends object = object> =
  (AnalyzedEnvelope<TSpecId> & TPayload) | UnanalyzedEnvelope;

/**
 * What every registered analyzer is handed. Facts only — no gameplay
 * interpretation, and no authority: the registration delivers its own.
 */
export interface SpecAnalysisInput {
  readonly state: CombatState;
  readonly actorId: number;
  /**
   * The caller's resolved specialization. REQUIRED.
   *
   * No default and no inference. A missing or wrong spec must not fall through
   * into another specialization's rules, so the caller states it and the
   * analyzer checks it.
   */
  readonly specId: string;
  /** The enemy the decisions are about, where the caller established one. */
  readonly targetActorId: number | null;
}

/**
 * The promotion-evidence reader (M11-A2, generalized to two evidence roots in
 * M11-C4e, split into two gates in M11-C4h).
 *
 * TWO GATES, ONE READER (M11-C4h)
 *
 * The single M11-A2 rule conflated two different properties. They are now
 * read separately, for every specialization alike:
 *
 *   OBSERVATION     the analyzer handles real play honestly. At least one
 *                   qualifying real MATCH, and the qualifying real resolved
 *                   decisions (MATCH or REJECTED) span at least
 *                   MIN_DISTINCT_OBSERVED_ACTION_TOKENS distinct supported
 *                   observed action tokens, so a slice that resolves one
 *                   action alone does not pass. Each is identified by the
 *                   observed cast's ability id, the one field every
 *                   DECISION_COVERAGE assertion pins for the observed action.
 *                   This is NOT a count of authority entries: no entry
 *                   identity (list, ordinal) is read.
 *   DISCRIMINATION  the analyzer can disagree, on real state. At least one
 *                   qualifying real REJECTED, OR at least one qualifying
 *                   negative control (below).
 *
 * Readiness is both. A natural player mistake is sufficient evidence of
 * discrimination but not necessary: whether one occurs depends on who was
 * sampled, and "keep sampling until a REJECTED appears" is outcome shopping.
 *
 * A QUALIFYING REAL ASSERTION (unchanged since M11-A2 / M11-C4e)
 *
 *     a `<layer>.DECISION_COVERAGE` assertion expecting MATCH or REJECTED
 *     whose WHOLE evidence set is SANITIZED_CAPTURE, whose actor is
 *     mechanically the specialization, and which its root's committed report
 *     records as PASSED.
 *
 *   - every referenced artifact is resolved across BOTH roots, and must
 *     resolve to exactly one: an id held by no committed root, or by two,
 *     disqualifies (the loader refuses both already; this refuses again,
 *     because a gate must not lean on a check it did not make);
 *   - SYNTHETIC or DERIVED_FROM_CAPTURE anywhere in the set disqualifies it
 *     as OBSERVATION, whichever root holds it;
 *   - identity is proven from a committed fight-context artifact in either
 *     root, per decision actor;
 *   - PASSED must come from the committed report of the root the CASE lives
 *     in — and a root with no committed report qualifies nothing.
 *
 * A QUALIFYING NEGATIVE CONTROL (M11-C4h)
 *
 * A `<layer>.DECISION_COVERAGE` assertion expecting REJECTED whose evidence
 * set is SANITIZED_CAPTURE except for exactly ONE DERIVED_FROM_CAPTURE part
 * that declares a `SINGLE_CAST_ABILITY_SUBSTITUTION` (the loader has
 * re-derived that its payload is its SANITIZED_CAPTURE parent's with one
 * cast's ability id changed and nothing else), and:
 *
 *   - the assertion is ABOUT the substituted cast: its actor, report time and
 *     ability are the substitution's actor, report time and new ability;
 *   - a qualifying REAL MATCH exists at the same decision — same actor, same
 *     report time, the substitution's ORIGINAL ability — over the same bundle
 *     with the control part replaced by its parent: the verdict flips from
 *     MATCH to REJECTED when only the action changes;
 *   - the same case pins `<layer>.OBSERVED_TOKEN_APPLICABILITY` for that cast
 *     with every entry naming the substituted token APPLICABLE under the
 *     proven build, PASSED: the REJECTED cannot rest on the action being
 *     background for the build, only on real state;
 *   - identity and PASSED as for a real assertion.
 *
 * A control is never observation. It never enters `observationGate`, never
 * counts as a MATCH or a REJECTED of observed play, and a control expecting
 * anything but REJECTED is disqualified.
 *
 * Nothing here executes an analysis: the evidence that a decision resolved is
 * each root's own deterministic execution, recorded in its report by the gate
 * that ran it (`npm run test:corpus`, `npm run test:evidence`).
 */

import type { CastAbilitySubstitution, EvidenceRootId } from "./contract.js";
import { OBSERVED_TOKEN_APPLICABILITY_SUFFIX, SPEC_LAYER_OF, type OwningLayer } from "./contract.js";
import type { LoadedArtifact, LoadedAssertion, LoadedCase, LoadedCorpus } from "./loader.js";

export interface CommittedReport {
  readonly runtime: string;
  readonly totals: { readonly failed: number; readonly notExecuted: number; readonly declared: number };
  readonly cases: readonly {
    readonly caseId: string;
    readonly assertions: readonly {
      readonly kind: string;
      readonly ordinal: number;
      readonly status: string;
    }[];
  }[];
}

/** One committed root as the gate reads it: its loaded manifest and its committed report, or null when absent. */
export interface EvidenceTier {
  readonly rootId: EvidenceRootId;
  readonly corpus: LoadedCorpus;
  readonly report: CommittedReport | null;
}

export type ProvenanceKind = "SANITIZED_CAPTURE" | "DERIVED_FROM_CAPTURE" | "SYNTHETIC" | "REAL_CAPTURE";

export interface WclIdentity {
  readonly className: string;
  readonly specName: string;
}

export interface ObservedCastRef {
  readonly reportTimeMs: number;
  readonly abilityGameId: number;
}

export interface EvidenceActor {
  readonly reportCode: string;
  readonly fightId: number;
  readonly actorId: number;
}

export interface EvidenceSetEntry {
  readonly artifactId: string;
  readonly rootId: EvidenceRootId;
  readonly kind: ProvenanceKind;
}

export interface QualifyingAssertion {
  readonly rootId: EvidenceRootId;
  readonly caseId: string;
  readonly ordinal: number;
  readonly kind: string;
  readonly expectedOutcome: "MATCH" | "REJECTED";
  readonly artifactId: string;
  readonly observedCast: ObservedCastRef;
  readonly evidenceSet: readonly EvidenceSetEntry[];
  readonly evidenceActor: EvidenceActor;
  readonly evidenceIdentity: WclIdentity;
  readonly reportStatus: string;
}

/** A qualifying negative control: discrimination evidence, never observation. */
export interface QualifyingControl {
  readonly rootId: EvidenceRootId;
  readonly caseId: string;
  readonly ordinal: number;
  readonly kind: string;
  readonly expectedOutcome: "REJECTED";
  readonly artifactId: string;
  readonly observedCast: ObservedCastRef;
  readonly controlArtifactId: string;
  readonly parentArtifactId: string;
  readonly substitution: CastAbilitySubstitution;
  readonly evidenceSet: readonly EvidenceSetEntry[];
  readonly evidenceActor: EvidenceActor;
  readonly evidenceIdentity: WclIdentity;
  readonly reportStatus: string;
  /** The same case's applicability assertion over the substituted cast: every entry APPLICABLE. */
  readonly applicability: { readonly ordinal: number; readonly observedToken: string };
  /** The qualifying real MATCH at the same decision the substitution flips. */
  readonly parentMatch: {
    readonly rootId: EvidenceRootId;
    readonly caseId: string;
    readonly ordinal: number;
  };
}

export interface Disqualified {
  readonly rootId: EvidenceRootId;
  readonly caseId: string;
  readonly ordinal: number;
  readonly reason: string;
}

/**
 * The observation gate needs real resolved decisions over at least this many
 * distinct supported observed action tokens, each identified by the observed
 * cast's ability id. Not authority entries: no entry identity is checked.
 */
export const MIN_DISTINCT_OBSERVED_ACTION_TOKENS = 2;

export interface ObservationGate {
  /** Every qualifying REAL MATCH or REJECTED. Never a control. */
  readonly qualifyingAssertions: readonly QualifyingAssertion[];
  readonly realMatches: number;
  /** The distinct supported observed action tokens among the qualifying real resolved decisions, by ability id, ascending. */
  readonly distinctResolvedAbilityIds: readonly number[];
  readonly ready: boolean;
}

export interface DiscriminationGate {
  /** The qualifying real REJECTED assertions (a subset of the observation gate's). */
  readonly realRejected: readonly QualifyingAssertion[];
  readonly controls: readonly QualifyingControl[];
  readonly ready: boolean;
}

export interface Readiness {
  readonly specId: string;
  readonly exposure: "PUBLIC" | "INTERNAL_ONLY";
  readonly layer: OwningLayer;
  readonly observationGate: ObservationGate;
  readonly discriminationGate: DiscriminationGate;
  /** The observation gate's qualifying real assertions (M11-A2's list, unchanged in meaning). */
  readonly qualifyingAssertions: readonly QualifyingAssertion[];
  readonly disqualified: readonly Disqualified[];
  /** Both gates. Authorizes nothing by itself. */
  readonly evidenceReady: boolean;
}

interface Holder {
  readonly rootId: EvidenceRootId;
  readonly artifact: LoadedArtifact;
}

/** Every committed artifact of every tier, by id. More than one holder is ambiguity, kept as such. */
function artifactHolders(tiers: readonly EvidenceTier[]): ReadonlyMap<string, readonly Holder[]> {
  const holders = new Map<string, Holder[]>();
  for (const tier of tiers) {
    for (const artifact of tier.corpus.artifacts) {
      const list = holders.get(artifact.record.artifactId) ?? [];
      list.push({ rootId: tier.rootId, artifact });
      holders.set(artifact.record.artifactId, list);
    }
  }
  return holders;
}

/** The identity a committed fight-context artifact (in any tier) reports for an actor of a report/fight. */
export function committedIdentity(
  tiers: readonly EvidenceTier[],
  reportCode: string,
  fightId: number,
  actorId: number,
): WclIdentity | null {
  for (const tier of tiers) {
    for (const artifact of tier.corpus.artifacts) {
      const source = artifact.record.provenance.source as
        { readonly reportCode?: unknown; readonly query?: { readonly kind?: unknown } } | null | undefined;
      if (source?.reportCode !== reportCode || source.query?.kind !== "FIGHT_CONTEXT") continue;
      const json = artifact.json as {
        readonly reportData?: {
          readonly report?: {
            readonly masterData?: {
              readonly actors?: readonly { id: number; type: string; subType: string }[];
            };
            readonly fights?: readonly {
              id: number;
              friendlyPlayers: readonly number[];
              friendlySpecs: readonly string[];
            }[];
          };
        };
      };
      const report = json.reportData?.report;
      const actor = report?.masterData?.actors?.find((candidate) => candidate.id === actorId);
      const fight = report?.fights?.find((candidate) => candidate.id === fightId);
      if (actor === undefined || fight === undefined || actor.type !== "Player") return null;
      const index = fight.friendlyPlayers.indexOf(actorId);
      const specName = fight.friendlySpecs[index];
      if (index < 0 || specName === undefined) return null;
      return { className: actor.subType, specName };
    }
  }
  return null;
}

interface DecisionParams {
  readonly actorId?: unknown;
  readonly targetActorId?: unknown;
  readonly historyArtifactIds?: unknown;
  readonly declaredHoles?: unknown;
  readonly evaluationWindow?: unknown;
  readonly observedCast?: { readonly reportTimeMs?: unknown; readonly abilityGameId?: unknown };
  readonly expected?: {
    readonly outcome?: unknown;
    readonly observedToken?: unknown;
    readonly entries?: unknown;
  };
}

function observedCastOf(params: DecisionParams): ObservedCastRef | null {
  const cast = params.observedCast;
  return typeof cast?.reportTimeMs === "number" && typeof cast.abilityGameId === "number"
    ? { reportTimeMs: cast.reportTimeMs, abilityGameId: cast.abilityGameId }
    : null;
}

/**
 * The bundle an assertion is evaluated over, as a comparable key: the case
 * artifact, the history parts in order, the declared holes, the window, the
 * actor and target. `rename` maps one artifact id to another (a control part
 * to its parent) before keying.
 */
function bundleKey(caseArtifactId: string, params: DecisionParams, rename: (id: string) => string): string {
  const history = Array.isArray(params.historyArtifactIds) ? (params.historyArtifactIds as unknown[]) : [];
  return JSON.stringify({
    artifact: rename(caseArtifactId),
    history: history.map((id) => (typeof id === "string" ? rename(id) : id)),
    holes: params.declaredHoles ?? [],
    window: params.evaluationWindow ?? null,
    actor: params.actorId ?? null,
    target: params.targetActorId ?? null,
  });
}

/** The nearest capture source up the lineage chain, resolved across the committed roots. */
function captureSourceOf(
  artifact: LoadedArtifact,
  holders: ReadonlyMap<string, readonly Holder[]>,
): { readonly reportCode?: unknown; readonly fightId?: unknown } | null {
  let cursor: LoadedArtifact | undefined = artifact;
  const seen = new Set<string>();
  while (cursor !== undefined && !seen.has(cursor.record.artifactId)) {
    seen.add(cursor.record.artifactId);
    const source = cursor.record.provenance.source as {
      readonly reportCode?: unknown;
      readonly fightId?: unknown;
    } | null;
    if (source !== null) return source;
    const parentId: string | null = cursor.record.provenance.parentArtifactId;
    const held: readonly Holder[] = parentId === null ? [] : (holders.get(parentId) ?? []);
    cursor = held.length === 1 ? held[0]?.artifact : undefined;
  }
  return null;
}

interface ControlCandidate {
  readonly tier: EvidenceTier;
  readonly kase: LoadedCase;
  readonly ordinal: number;
  readonly assertion: LoadedAssertion;
  readonly params: DecisionParams;
  readonly observedCast: ObservedCastRef;
  readonly control: LoadedArtifact;
  readonly substitution: CastAbilitySubstitution;
  readonly evidenceSet: readonly EvidenceSetEntry[];
  readonly evidenceActor: EvidenceActor;
  readonly evidenceIdentity: WclIdentity;
  readonly reportStatus: string;
}

/** Evaluates one specialization's readiness over every committed evidence root. */
export function evaluatePromotionReadiness(
  tiers: readonly EvidenceTier[],
  specId: string,
  exposure: "PUBLIC" | "INTERNAL_ONLY",
  pairing: (identity: WclIdentity) => boolean,
): Readiness {
  const layer = (SPEC_LAYER_OF as Readonly<Record<string, OwningLayer>>)[specId];
  if (layer === undefined) throw new Error(`no owning layer for ${specId}`);
  const decisionKind = `${layer}.DECISION_COVERAGE`;
  const applicabilityKind = `${layer}${OBSERVED_TOKEN_APPLICABILITY_SUFFIX}`;
  const holders = artifactHolders(tiers);
  const qualifying: QualifyingAssertion[] = [];
  const candidates: ControlCandidate[] = [];
  const disqualified: Disqualified[] = [];

  const consider = (tier: EvidenceTier, kase: LoadedCase): void => {
    if (kase.record.owningLayer !== layer) return;
    kase.assertions.forEach((assertion, ordinal) => {
      if (assertion.kind !== decisionKind) return;
      const params = assertion.params as DecisionParams;
      const outcome = params.expected?.outcome;
      const reject = (reason: string): void => {
        disqualified.push({ rootId: tier.rootId, caseId: kase.record.caseId, ordinal, reason });
      };
      if (outcome !== "MATCH" && outcome !== "REJECTED") return; // an UNKNOWN pin is not promotion evidence
      if (assertion.execution !== "EXECUTABLE") return reject("assertion kind is not EXECUTABLE");

      // A root with no committed report proves nothing it holds.
      if (tier.report === null) return reject(`the committed ${tier.rootId} report is absent`);

      // Strict provenance over the FULL evidence set, resolved across roots.
      const evidenceSet: EvidenceSetEntry[] = [];
      for (const artifactId of kase.referencedArtifactIds) {
        const held = holders.get(artifactId) ?? [];
        if (held.length === 0)
          return reject(`references artifact ${artifactId}, which no committed root holds`);
        if (held.length > 1) {
          return reject(
            `references artifact ${artifactId}, which ${String(held.length)} committed roots hold: ambiguous`,
          );
        }
        const only = held[0];
        if (only === undefined)
          return reject(`references artifact ${artifactId}, which no committed root holds`);
        evidenceSet.push({
          artifactId,
          rootId: only.rootId,
          kind: only.artifact.record.provenance.kind as ProvenanceKind,
        });
      }
      const impure = evidenceSet.filter((entry) => entry.kind !== "SANITIZED_CAPTURE");
      // The one shape that may be a negative control: exactly one derived part
      // that declares a loader-checked substitution. Anything else impure is
      // disqualified exactly as before.
      const onlyImpure = impure.length === 1 ? impure[0] : undefined;
      const controlArtifact =
        onlyImpure?.kind === "DERIVED_FROM_CAPTURE"
          ? holders.get(onlyImpure.artifactId)?.[0]?.artifact
          : undefined;
      const substitution = controlArtifact?.record.provenance.substitution;
      if (impure.length > 0 && (controlArtifact === undefined || substitution === undefined)) {
        return reject(
          `evidence set is not all SANITIZED_CAPTURE: ${impure.map((e) => `${e.artifactId}=${e.kind}`).join(", ")}`,
        );
      }
      const isControl = controlArtifact !== undefined && substitution !== undefined;
      if (isControl && outcome !== "REJECTED") {
        return reject(
          `a negative control counts for discrimination only, as REJECTED; this assertion expects ${outcome} over the substitution ${controlArtifact.record.artifactId}`,
        );
      }

      const observedCast = observedCastOf(params);
      const actorId = typeof params.actorId === "number" ? params.actorId : null;
      // Identity: the case artifact's capture coordinates (up its lineage) and the decision's actor.
      const source = captureSourceOf(kase.artifact, holders);
      if (
        source === null ||
        typeof source.reportCode !== "string" ||
        typeof source.fightId !== "number" ||
        actorId === null ||
        observedCast === null
      ) {
        return reject(
          "the case artifact has no capture coordinates or the assertion names no actor or observed cast",
        );
      }
      // The artifact's `sourceActorId` is the capture SUBJECT the slicer was
      // pointed at; the unfiltered `All` stream legitimately carries other
      // actors' events. Identity is therefore proven per decision actor from
      // the committed master data, never assumed from the capture subject.
      const identity = committedIdentity(tiers, source.reportCode, source.fightId, actorId);
      if (identity === null) return reject("no committed fight-context artifact proves the actor's identity");
      if (!pairing(identity))
        return reject(
          `actor ${String(actorId)} is ${identity.className}/${identity.specName}, not this specialization`,
        );

      // The case's OWN root's committed report must record the assertion as PASSED.
      const reported = tier.report.cases
        .find((candidate) => candidate.caseId === kase.record.caseId)
        ?.assertions.find((candidate) => candidate.ordinal === ordinal && candidate.kind === assertion.kind);
      if (reported === undefined)
        return reject(`the committed ${tier.rootId} report has no record of this assertion`);
      if (reported.status !== "PASSED") return reject(`the committed report records ${reported.status}`);

      const evidenceActor = { reportCode: source.reportCode, fightId: source.fightId, actorId };
      if (isControl) {
        candidates.push({
          tier,
          kase,
          ordinal,
          assertion,
          params,
          observedCast,
          control: controlArtifact,
          substitution,
          evidenceSet,
          evidenceActor,
          evidenceIdentity: identity,
          reportStatus: reported.status,
        });
        return;
      }
      qualifying.push({
        rootId: tier.rootId,
        caseId: kase.record.caseId,
        ordinal,
        kind: assertion.kind,
        expectedOutcome: outcome,
        artifactId: kase.record.artifactId,
        observedCast,
        evidenceSet,
        evidenceActor,
        evidenceIdentity: identity,
        reportStatus: reported.status,
      });
    });
  };
  for (const tier of tiers) for (const kase of tier.corpus.cases) consider(tier, kase);

  // Controls are judged against the real qualifying assertions, never against each other.
  const controls: QualifyingControl[] = [];
  for (const candidate of candidates) {
    const { tier, kase, ordinal, params, observedCast, control, substitution } = candidate;
    const reject = (reason: string): void => {
      disqualified.push({ rootId: tier.rootId, caseId: kase.record.caseId, ordinal, reason });
    };
    const controlId = control.record.artifactId;
    const parentId = control.record.provenance.parentArtifactId;
    const parentHeld = parentId === null ? [] : (holders.get(parentId) ?? []);
    const parent = parentHeld.length === 1 ? parentHeld[0] : undefined;
    if (
      parentId === null ||
      parent === undefined ||
      parent.artifact.record.provenance.kind !== "SANITIZED_CAPTURE"
    ) {
      reject(`the substitution ${controlId}'s parent is not exactly one committed SANITIZED_CAPTURE`);
      continue;
    }
    if (
      candidate.evidenceActor.actorId !== substitution.sourceActorId ||
      observedCast.reportTimeMs !== substitution.reportTimeMs ||
      observedCast.abilityGameId !== substitution.toAbilityGameId
    ) {
      reject(
        `the control assertion is not about the substituted cast (actor ${String(substitution.sourceActorId)} at ${String(substitution.reportTimeMs)}, ability ${String(substitution.toAbilityGameId)})`,
      );
      continue;
    }
    // The same case pins the substituted action's applicability: every entry APPLICABLE, PASSED.
    const report = tier.report;
    const applicabilityOrdinal = kase.assertions.findIndex((other) => {
      if (other.kind !== applicabilityKind) return false;
      const otherParams = other.params as DecisionParams;
      const cast = observedCastOf(otherParams);
      return (
        otherParams.actorId === params.actorId &&
        cast?.reportTimeMs === observedCast.reportTimeMs &&
        cast.abilityGameId === observedCast.abilityGameId &&
        bundleKey(kase.record.artifactId, otherParams, (id) => id) ===
          bundleKey(kase.record.artifactId, params, (id) => id)
      );
    });
    const applicability = applicabilityOrdinal < 0 ? undefined : kase.assertions[applicabilityOrdinal];
    if (applicability === undefined) {
      reject(`the control case pins no ${applicabilityKind} for the substituted cast`);
      continue;
    }
    const applicabilityExpected = (applicability.params as DecisionParams).expected;
    const entries = Array.isArray(applicabilityExpected?.entries)
      ? (applicabilityExpected.entries as readonly { readonly applicability?: unknown }[])
      : [];
    if (entries.length === 0 || entries.some((entry) => entry.applicability !== "APPLICABLE")) {
      reject(
        "the substituted action is not APPLICABLE at every entry under the proven build: a REJECTED that may rest on the action being background is not discrimination evidence",
      );
      continue;
    }
    const applicabilityReported = report?.cases
      .find((entry) => entry.caseId === kase.record.caseId)
      ?.assertions.find(
        (entry) => entry.ordinal === applicabilityOrdinal && entry.kind === applicabilityKind,
      );
    if (applicabilityReported?.status !== "PASSED") {
      reject(`the committed report does not record the ${applicabilityKind} assertion as PASSED`);
      continue;
    }
    // The verdict flips: a qualifying REAL MATCH at the same decision, over the same bundle with the parent.
    const controlKey = bundleKey(kase.record.artifactId, params, (id) => (id === controlId ? parentId : id));
    const parentMatch = qualifying.find((real) => {
      if (real.expectedOutcome !== "MATCH") return false;
      if (JSON.stringify(real.evidenceActor) !== JSON.stringify(candidate.evidenceActor)) return false;
      if (
        real.observedCast.reportTimeMs !== substitution.reportTimeMs ||
        real.observedCast.abilityGameId !== substitution.fromAbilityGameId
      )
        return false;
      const realCase = tiers
        .find((t) => t.rootId === real.rootId)
        ?.corpus.cases.find((entry) => entry.record.caseId === real.caseId);
      const realParams = realCase?.assertions[real.ordinal]?.params as DecisionParams | undefined;
      return realParams !== undefined && bundleKey(real.artifactId, realParams, (id) => id) === controlKey;
    });
    if (parentMatch === undefined) {
      reject(
        `no qualifying real MATCH of ability ${String(substitution.fromAbilityGameId)} at ${String(substitution.reportTimeMs)} over the same bundle with ${parentId} in place of ${controlId}`,
      );
      continue;
    }
    controls.push({
      rootId: tier.rootId,
      caseId: kase.record.caseId,
      ordinal,
      kind: candidate.assertion.kind,
      expectedOutcome: "REJECTED",
      artifactId: kase.record.artifactId,
      observedCast,
      controlArtifactId: controlId,
      parentArtifactId: parentId,
      substitution,
      evidenceSet: candidate.evidenceSet,
      evidenceActor: candidate.evidenceActor,
      evidenceIdentity: candidate.evidenceIdentity,
      reportStatus: candidate.reportStatus,
      applicability: {
        ordinal: applicabilityOrdinal,
        observedToken:
          typeof applicabilityExpected?.observedToken === "string" ? applicabilityExpected.observedToken : "",
      },
      parentMatch: { rootId: parentMatch.rootId, caseId: parentMatch.caseId, ordinal: parentMatch.ordinal },
    });
  }

  const realMatches = qualifying.filter((q) => q.expectedOutcome === "MATCH").length;
  const distinctResolvedAbilityIds = [...new Set(qualifying.map((q) => q.observedCast.abilityGameId))].sort(
    (a, b) => a - b,
  );
  const observationGate: ObservationGate = {
    qualifyingAssertions: qualifying,
    realMatches,
    distinctResolvedAbilityIds,
    ready: realMatches > 0 && distinctResolvedAbilityIds.length >= MIN_DISTINCT_OBSERVED_ACTION_TOKENS,
  };
  const realRejected = qualifying.filter((q) => q.expectedOutcome === "REJECTED");
  const discriminationGate: DiscriminationGate = {
    realRejected,
    controls,
    ready: realRejected.length > 0 || controls.length > 0,
  };

  return {
    specId,
    exposure,
    layer,
    observationGate,
    discriminationGate,
    qualifyingAssertions: qualifying,
    disqualified,
    evidenceReady: observationGate.ready && discriminationGate.ready,
  };
}

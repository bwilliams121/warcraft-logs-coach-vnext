/**
 * The promotion-evidence reader (M11-A2, generalized to two evidence roots in
 * M11-C4e).
 *
 * THE RULE, UNCHANGED
 *
 *     A registration's qualifying evidence is a `<layer>.DECISION_COVERAGE`
 *     assertion expecting MATCH or REJECTED whose WHOLE evidence set is
 *     SANITIZED_CAPTURE, whose actor is mechanically the specialization, and
 *     which its root's committed report records as PASSED.
 *
 * WHAT M11-C4e ADDS
 *
 * The assertion may live in the regression corpus OR the evidence archive.
 * Nothing about what qualifies is relaxed:
 *
 *   - every referenced artifact is resolved across BOTH roots, and must
 *     resolve to exactly one: an id held by no committed root, or by two,
 *     disqualifies (the loader refuses both already; this refuses again,
 *     because a gate must not lean on a check it did not make);
 *   - SYNTHETIC or DERIVED_FROM_CAPTURE anywhere in the set disqualifies,
 *     whichever root holds it;
 *   - identity is proven from a committed fight-context artifact in either
 *     root, per decision actor;
 *   - PASSED must come from the committed report of the root the CASE lives
 *     in — and a root with no committed report qualifies nothing.
 *
 * Nothing here executes an analysis: the evidence that a decision resolved is
 * each root's own deterministic execution, recorded in its report by the gate
 * that ran it (`npm run test:corpus`, `npm run test:evidence`).
 */

import type { EvidenceRootId } from "./contract.js";
import { SPEC_LAYER_OF, type OwningLayer } from "./contract.js";
import type { LoadedArtifact, LoadedCase, LoadedCorpus } from "./loader.js";

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

export interface QualifyingAssertion {
  readonly rootId: EvidenceRootId;
  readonly caseId: string;
  readonly ordinal: number;
  readonly kind: string;
  readonly expectedOutcome: "MATCH" | "REJECTED";
  readonly artifactId: string;
  readonly evidenceSet: readonly {
    readonly artifactId: string;
    readonly rootId: EvidenceRootId;
    readonly kind: ProvenanceKind;
  }[];
  readonly evidenceActor: { readonly reportCode: string; readonly fightId: number; readonly actorId: number };
  readonly evidenceIdentity: WclIdentity;
  readonly reportStatus: string;
}

export interface Disqualified {
  readonly rootId: EvidenceRootId;
  readonly caseId: string;
  readonly ordinal: number;
  readonly reason: string;
}

export interface Readiness {
  readonly specId: string;
  readonly exposure: "PUBLIC" | "INTERNAL_ONLY";
  readonly layer: OwningLayer;
  readonly qualifyingAssertions: readonly QualifyingAssertion[];
  readonly disqualified: readonly Disqualified[];
  readonly evidenceReady: boolean;
}

/** Every committed artifact of every tier, by id. More than one holder is ambiguity, kept as such. */
function artifactHolders(
  tiers: readonly EvidenceTier[],
): ReadonlyMap<string, readonly { readonly rootId: EvidenceRootId; readonly artifact: LoadedArtifact }[]> {
  const holders = new Map<string, { rootId: EvidenceRootId; artifact: LoadedArtifact }[]>();
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
  const holders = artifactHolders(tiers);
  const qualifying: QualifyingAssertion[] = [];
  const disqualified: Disqualified[] = [];

  const consider = (tier: EvidenceTier, kase: LoadedCase): void => {
    if (kase.record.owningLayer !== layer) return;
    kase.assertions.forEach((assertion, ordinal) => {
      if (assertion.kind !== decisionKind) return;
      const params = assertion.params as {
        readonly actorId?: unknown;
        readonly expected?: { readonly outcome?: unknown };
      };
      const outcome = params.expected?.outcome;
      const reject = (reason: string): void => {
        disqualified.push({ rootId: tier.rootId, caseId: kase.record.caseId, ordinal, reason });
      };
      if (outcome !== "MATCH" && outcome !== "REJECTED") return; // an UNKNOWN pin is not promotion evidence
      if (assertion.execution !== "EXECUTABLE") return reject("assertion kind is not EXECUTABLE");

      // A root with no committed report proves nothing it holds.
      if (tier.report === null) return reject(`the committed ${tier.rootId} report is absent`);

      // Strict provenance over the FULL evidence set, resolved across roots.
      const evidenceSet: { artifactId: string; rootId: EvidenceRootId; kind: ProvenanceKind }[] = [];
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
      if (impure.length > 0) {
        return reject(
          `evidence set is not all SANITIZED_CAPTURE: ${impure.map((e) => `${e.artifactId}=${e.kind}`).join(", ")}`,
        );
      }

      // Identity: the case artifact's source coordinates and the decision's actor.
      const source = kase.artifact.record.provenance.source as {
        readonly reportCode?: unknown;
        readonly fightId?: unknown;
        readonly sourceActorId?: unknown;
      } | null;
      const actorId = typeof params.actorId === "number" ? params.actorId : null;
      if (
        source === null ||
        typeof source.reportCode !== "string" ||
        typeof source.fightId !== "number" ||
        actorId === null
      ) {
        return reject("the case artifact has no capture coordinates or the assertion names no actor");
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

      qualifying.push({
        rootId: tier.rootId,
        caseId: kase.record.caseId,
        ordinal,
        kind: assertion.kind,
        expectedOutcome: outcome,
        artifactId: kase.record.artifactId,
        evidenceSet,
        evidenceActor: { reportCode: source.reportCode, fightId: source.fightId, actorId },
        evidenceIdentity: identity,
        reportStatus: reported.status,
      });
    });
  };
  for (const tier of tiers) for (const kase of tier.corpus.cases) consider(tier, kase);

  return {
    specId,
    exposure,
    layer,
    qualifyingAssertions: qualifying,
    disqualified,
    evidenceReady: qualifying.length > 0,
  };
}

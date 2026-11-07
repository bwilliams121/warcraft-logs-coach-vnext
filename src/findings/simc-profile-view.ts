/**
 * What the projectors read of a view's SimC-profile-relative decisions (SIMC-FB-B).
 *
 * Pure functions of the decisions, so a count or a source cannot disagree with them. It imports the view's
 * type and nothing else, so no projector reaches the fallback. The reporting layer reads producers' types
 * only, so it holds its own count (`src/reporting/restatement.ts`), and a test pins the two equal.
 *
 * `"MATCH"` here is only the view's outcome word being counted: authority-compatible, as everywhere.
 */

import type { ObservedDecisionRecord } from "./observed-decision-view.js";

export type SimcProfileFactRecord = NonNullable<ObservedDecisionRecord["simcProfileFacts"]>[number];
export type SimcProfileSemanticRecord = SimcProfileFactRecord["semantic"];

/** Everything about a fact's source except which fact it is and which statement it cites. */
export type SimcProfileSourceRecord = Omit<SimcProfileFactRecord, "fact" | "atomKey" | "semantic"> & {
  readonly semantics: readonly SimcProfileSemanticRecord[];
};

export const SIMC_PROFILE_EVALUATION_REVISION = "simc-profile-evaluation/1" as const;

/** How many decisions of a view were evaluated with a tier-3 fact bound. */
export interface SimcProfileRelativeCounts {
  readonly decisions: number;
  readonly match: number;
  readonly rejected: number;
  readonly unknown: number;
}

export function isSimcProfileRelative(decision: ObservedDecisionRecord): boolean {
  return (decision.simcProfileFacts?.length ?? 0) > 0;
}

/** Null when no decision read the profile. */
export function simcProfileRelativeCountsOf(
  decisions: readonly ObservedDecisionRecord[],
): SimcProfileRelativeCounts | null {
  const relative = decisions.filter(isSimcProfileRelative);
  if (relative.length === 0) return null;
  const count = (outcome: string) => relative.filter((decision) => decision.outcome === outcome).length;
  return {
    decisions: relative.length,
    match: count("MATCH"),
    rejected: count("REJECTED"),
    unknown: count("UNKNOWN"),
  };
}

function sourceKeyOf(fact: SimcProfileFactRecord): string {
  return JSON.stringify([
    fact.datasetId,
    fact.datasetRevision,
    fact.simcCommit,
    fact.clientBuild,
    fact.environmentCommit,
    fact.aplAuthorityId,
    fact.profilePath,
    fact.profileSha256,
    fact.environment,
  ]);
}

/** The distinct sources a view's facts name, first seen first, and where a fact's source is among them. */
export function simcProfileSourcesOf(decisions: readonly ObservedDecisionRecord[]): {
  readonly sources: readonly SimcProfileSourceRecord[];
  readonly sourceIndexOf: (fact: SimcProfileFactRecord) => number;
} {
  const indexes = new Map<string, number>();
  const accumulated: { source: SimcProfileFactRecord; semantics: Map<string, SimcProfileSemanticRecord> }[] =
    [];
  for (const decision of decisions) {
    for (const fact of decision.simcProfileFacts ?? []) {
      const key = sourceKeyOf(fact);
      let index = indexes.get(key);
      if (index === undefined) {
        index = accumulated.length;
        indexes.set(key, index);
        accumulated.push({ source: fact, semantics: new Map() });
      }
      accumulated[index]?.semantics.set(fact.semantic.semanticId, fact.semantic);
    }
  }
  return {
    sources: accumulated.map(({ source, semantics }) => ({
      category: source.category,
      datasetId: source.datasetId,
      datasetRevision: source.datasetRevision,
      simcCommit: source.simcCommit,
      clientBuild: source.clientBuild,
      environmentCommit: source.environmentCommit,
      aplAuthorityId: source.aplAuthorityId,
      profilePath: source.profilePath,
      profileSha256: source.profileSha256,
      environment: source.environment,
      semantics: [...semantics.values()],
    })),
    sourceIndexOf: (fact) => indexes.get(sourceKeyOf(fact)) ?? -1,
  };
}

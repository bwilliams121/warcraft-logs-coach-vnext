/**
 * The versioned schema of Policy B's curated encounter-state data (POLB-A; agent/architecture.md
 * "POLB-A"). Gameplay-neutral: it knows no action's meaning, class or specialization.
 *
 * WHAT A DATUM IS. One empirical fact about one encounter, difficulty and build over one window,
 * derived by a frozen acquisition rule from a neutral census of pulls that evaluate nobody. It is
 * never rotational authority, never what a player should have done, and never encounter truth.
 *
 * WHAT THE PARSER REFUSES, so that no later row can say it by accident:
 *
 *   An upper bound, an exact count or a closed set without a reviewed closure contract. No contract
 *   is reviewed today, because none can justify one (agent/architecture.md "POLB-A"). An observed
 *   maximum is not an upper bound, and the absence of an actor from sampled events closes nothing.
 *
 *   A conflict resolved by choosing. Each source pull keeps its own observation, the lower bound must
 *   be the smallest of them, an upper bound the largest or wider, and a set the union.
 *
 *   One fact standing in for another. Present, targetable, attackable and `spell_targets.<ability>`
 *   are separate facts, each needing its own approved predicate. Only ACTIVE_ENEMIES has one.
 *
 *   A datum without the provenance the owner listed, or with a window that overlaps another's.
 */

import { z } from "zod";

import planJson from "./census-plan.json";

export const censusPlanSchema = z.object({
  planVersion: z.literal(1),
  planRevision: z.string().min(1),
  acquisitionRuleId: z.string().min(1),
  frozenOn: z.string().min(1),
  status: z.enum(["PROPOSED_NOT_AUTHORIZED", "AUTHORIZED"]),
  selectionSalt: z.string().min(1),
  requiredIndependentPulls: z.number().int().positive(),
  partitions: z
    .array(
      z.object({
        partitionId: z.string().min(1),
        zoneId: z.number().int().positive(),
        encounterId: z.number().int().positive(),
        difficulty: z.number().int().positive(),
        region: z.string().min(1),
        gameBuildVersion: z.string().min(1),
        provenIntervalFromUtc: z.string().min(1),
        provenIntervalToUtc: z.string().min(1),
      }),
    )
    .min(1),
  discovery: z.object({
    listing: z.string().min(1),
    listingFields: z.array(z.string().min(1)).min(1),
    pageSize: z.number().int().positive(),
    maxListingPagesPerPartition: z.number().int().positive(),
  }),
  excludedEvaluatedReports: z.array(z.string().min(1)),
  streams: z
    .array(
      z.object({
        id: z.string().min(1),
        dataType: z.string().min(1),
        hostilityType: z.string().min(1),
        includeResources: z.boolean(),
      }),
    )
    .min(1),
  predicate: z.object({ id: z.string().min(1), bracketGapMs: z.number().int().positive() }),
  window: z.object({ gridMs: z.number().int().positive() }),
  limits: z.object({
    eventPageSize: z.number().int().positive(),
    maxEventPagesPerPull: z.number().int().positive(),
  }),
  requestBudget: z.object({
    tokenRequests: z.number().int().nonnegative(),
    regionLookups: z.number().int().nonnegative(),
    listingPages: z.number().int().nonnegative(),
    contextRequests: z.number().int().nonnegative(),
    eventPages: z.number().int().nonnegative(),
    revisionRequests: z.number().int().nonnegative(),
    worstCaseTotal: z.number().int().positive(),
    proposedCap: z.number().int().positive(),
  }),
  retainedBytes: z.object({
    measuredPullWitnessBytes: z.number().int().positive(),
    measuredPullContextSliceBytes: z.number().int().positive(),
    estimatedListingFrameBytesPerPartition: z.number().int().positive(),
    estimatedTotalBytes: z.number().int().positive(),
    proposedAllowanceBytes: z.number().int().positive(),
    noticeLineBytes: z.number().int().positive(),
    bytesLeftUnderNoticeLine: z.number().int().nonnegative(),
  }),
});

export type CensusPlan = z.infer<typeof censusPlanSchema>;

/** The frozen plan. POLB-CENSUS runs it as written, under its own owner grant. */
export const CENSUS_PLAN: CensusPlan = censusPlanSchema.parse(planJson);

export const CENSUS_FACTS = [
  "ACTIVE_ENEMIES",
  "SPELL_TARGETS",
  "TARGET_IF_CANDIDATES",
  "TARGETABILITY",
  "ATTACKABILITY",
  "ADD_AVAILABILITY",
] as const;
export type CensusFact = (typeof CENSUS_FACTS)[number];

/**
 * The evidence predicate each fact may be derived under. A fact with none cannot hold a row, so no
 * predicate can be borrowed from another fact. POLB-C adds one only with its own evidence contract.
 */
export const APPROVED_EVIDENCE_PREDICATES: Readonly<Record<CensusFact, readonly string[]>> = {
  ACTIVE_ENEMIES: ["BRACKETED_HOSTILE_INSTANCE_V1"],
  SPELL_TARGETS: [],
  TARGET_IF_CANDIDATES: [],
  TARGETABILITY: [],
  ATTACKABILITY: [],
  ADD_AVAILABILITY: [],
};

/**
 * The completeness arguments that may justify an upper bound, an exact count or a closed set. Empty,
 * and it stays empty until the owner reviews an argument that an unobserved qualifying unit could
 * not exist for the interval. A frequently observed maximum is not one.
 */
export const REVIEWED_CLOSURE_CONTRACTS: readonly string[] = [];

const censusWindowSchema = z
  .discriminatedUnion("anchor", [
    z.object({
      anchor: z.literal("PULL_START"),
      fromMs: z.number().int().nonnegative(),
      toMs: z.number().int().positive(),
    }),
    z.object({
      anchor: z.literal("PHASE_START"),
      phaseId: z.number().int().positive(),
      fromMs: z.number().int().nonnegative(),
      toMs: z.number().int().positive(),
    }),
  ])
  .refine((window) => window.toMs > window.fromMs, "a window ends after it starts");

const coverageStateSchema = z.enum(["COMPLETE", "PARTIAL", "ABSENT"]);

const sourcePullSchema = z.object({
  reportCode: z.string().min(1),
  reportRevision: z.number().int().nonnegative(),
  fightId: z.number().int().positive(),
  gameBuild: z.string().min(1),
  completeness: coverageStateSchema,
  evidenceArtifactIds: z.array(z.string().min(1)).min(1),
  observation: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("COUNT"), lowerBound: z.number().int().nonnegative() }),
    z.object({
      kind: z.literal("CANDIDATES"),
      creatureGameIds: z.array(z.number().int().positive()),
    }),
  ]),
});

const censusValueSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("COUNT_BOUND"),
    status: z.enum(["EXACT", "BOUNDED"]),
    lowerBound: z.number().int().nonnegative(),
    upperBound: z.number().int().nonnegative().nullable(),
    closureContract: z.string().min(1).nullable(),
  }),
  z.object({
    kind: z.literal("CANDIDATE_SET"),
    status: z.enum(["EXACT", "BOUNDED"]),
    closure: z.enum(["OPEN", "CLOSED"]),
    creatureGameIds: z.array(z.number().int().positive()).min(1),
    closureContract: z.string().min(1).nullable(),
  }),
]);

const censusDatumSchema = z.object({
  datumId: z.string().min(1),
  fact: z.enum(CENSUS_FACTS),
  /** The action a fact belongs to, where it is action-owned. Never a shared count. */
  actionToken: z.string().min(1).nullable(),
  applicability: z.object({
    encounterId: z.number().int().positive(),
    difficulty: z.number().int().positive(),
    gameVersion: z.number().int().positive(),
    logVersion: z.number().int().positive(),
    gameBuilds: z.array(z.string().min(1)).min(1),
  }),
  evidencePredicate: z.string().min(1),
  window: censusWindowSchema,
  value: censusValueSchema,
  completeness: coverageStateSchema,
  sourcePulls: z.array(sourcePullSchema).min(1),
});

export type CensusDatum = z.infer<typeof censusDatumSchema>;
export type CensusWindow = CensusDatum["window"];

const censusDatasetSchema = z.object({
  schemaVersion: z.literal(1),
  datasetId: z.literal("ENCOUNTER_STATE_CENSUS"),
  datasetRevision: z.string().min(1),
  acquisitionRuleId: z.string().min(1),
  sourceCorpusRevision: z.string().min(1),
  data: z.array(censusDatumSchema),
});

export type EncounterStateCensus = z.infer<typeof censusDatasetSchema>;

/** What a parse is checked against. Tests may state their own; production always uses the defaults. */
export interface CensusReviewState {
  readonly plan: Pick<CensusPlan, "acquisitionRuleId" | "requiredIndependentPulls">;
  readonly reviewedClosureContracts: readonly string[];
  readonly approvedPredicates: Readonly<Record<CensusFact, readonly string[]>>;
}

export const PRODUCTION_CENSUS_REVIEW_STATE: CensusReviewState = {
  plan: CENSUS_PLAN,
  reviewedClosureContracts: REVIEWED_CLOSURE_CONTRACTS,
  approvedPredicates: APPROVED_EVIDENCE_PREDICATES,
};

export type CensusRefusalCode =
  | "SHAPE"
  | "ACQUISITION_RULE_MISMATCH"
  | "DUPLICATE_DATUM"
  | "PREDICATE_NOT_APPROVED"
  | "ACTION_OWNERSHIP"
  | "VALUE_KIND_NOT_FOR_FACT"
  | "TOO_FEW_INDEPENDENT_PULLS"
  | "SOURCE_PULLS_NOT_INDEPENDENT"
  | "SOURCE_BUILD_NOT_APPLICABLE"
  | "OBSERVATION_KIND_MISMATCH"
  | "COMPLETENESS_OVERSTATED"
  | "CONFLICT_NOT_WIDENED"
  | "STATUS_MISSTATED"
  | "CLOSURE_WITHOUT_REVIEWED_CONTRACT"
  | "OVERLAPPING_WINDOWS";

export interface CensusRefusal {
  readonly code: CensusRefusalCode;
  readonly datumId: string | null;
  readonly detail: string;
}

export type CensusParse =
  | { readonly ok: true; readonly dataset: EncounterStateCensus }
  | { readonly ok: false; readonly refusals: readonly CensusRefusal[] };

const ACTION_OWNED_FACTS: readonly CensusFact[] = ["SPELL_TARGETS", "TARGET_IF_CANDIDATES"];
const COUNT_FACTS: readonly CensusFact[] = ["ACTIVE_ENEMIES", "SPELL_TARGETS"];
const SET_FACTS: readonly CensusFact[] = ["TARGET_IF_CANDIDATES"];

function windowsOverlap(left: CensusWindow, right: CensusWindow): boolean {
  if (left.anchor !== right.anchor) return false;
  if (left.anchor === "PHASE_START" && right.anchor === "PHASE_START" && left.phaseId !== right.phaseId) {
    return false;
  }
  return left.fromMs < right.toMs && right.fromMs < left.toMs;
}

/** Whether two data speak of the same fact in the same encounter, difficulty and build. */
function sameFactKey(left: CensusDatum, right: CensusDatum): boolean {
  return (
    left.fact === right.fact &&
    left.actionToken === right.actionToken &&
    left.applicability.encounterId === right.applicability.encounterId &&
    left.applicability.difficulty === right.applicability.difficulty &&
    left.applicability.gameBuilds.some((build) => right.applicability.gameBuilds.includes(build))
  );
}

function refusalsOfDatum(datum: CensusDatum, review: CensusReviewState): CensusRefusal[] {
  const refusals: CensusRefusal[] = [];
  const refuse = (code: CensusRefusalCode, detail: string): void => {
    refusals.push({ code, datumId: datum.datumId, detail });
  };

  if (!review.approvedPredicates[datum.fact].includes(datum.evidencePredicate)) {
    refuse("PREDICATE_NOT_APPROVED", `${datum.evidencePredicate} is not approved for ${datum.fact}`);
  }
  if (ACTION_OWNED_FACTS.includes(datum.fact) !== (datum.actionToken !== null)) {
    refuse("ACTION_OWNERSHIP", `${datum.fact} and actionToken ${String(datum.actionToken)} do not agree`);
  }
  const valueFits =
    (datum.value.kind === "COUNT_BOUND" && COUNT_FACTS.includes(datum.fact)) ||
    (datum.value.kind === "CANDIDATE_SET" && SET_FACTS.includes(datum.fact));
  if (!valueFits) refuse("VALUE_KIND_NOT_FOR_FACT", `${datum.value.kind} is not a value of ${datum.fact}`);

  // ---- independence ----
  const reports = new Set(datum.sourcePulls.map((pull) => pull.reportCode));
  if (reports.size < review.plan.requiredIndependentPulls) {
    refuse(
      "TOO_FEW_INDEPENDENT_PULLS",
      `${String(reports.size)} distinct reports, ${String(review.plan.requiredIndependentPulls)} required`,
    );
  }
  if (reports.size !== datum.sourcePulls.length) {
    refuse("SOURCE_PULLS_NOT_INDEPENDENT", "one report supplies two pulls");
  }
  for (const pull of datum.sourcePulls) {
    if (!datum.applicability.gameBuilds.includes(pull.gameBuild)) {
      refuse("SOURCE_BUILD_NOT_APPLICABLE", `${pull.reportCode} is on ${pull.gameBuild}`);
    }
  }
  if (
    datum.completeness === "COMPLETE" &&
    datum.sourcePulls.some((pull) => pull.completeness !== "COMPLETE")
  ) {
    refuse("COMPLETENESS_OVERSTATED", "the datum says COMPLETE and a source pull is not");
  }

  // ---- conflicts widen, and closure needs a contract ----
  const contractReviewed = (contract: string | null): boolean =>
    contract !== null && review.reviewedClosureContracts.includes(contract);
  if (datum.value.kind === "COUNT_BOUND") {
    const counts = datum.sourcePulls.flatMap((pull) =>
      pull.observation.kind === "COUNT" ? [pull.observation.lowerBound] : [],
    );
    if (counts.length !== datum.sourcePulls.length) {
      refuse("OBSERVATION_KIND_MISMATCH", "a count datum needs a count from every pull");
    } else {
      const smallest = Math.min(...counts);
      const largest = Math.max(...counts);
      const { lowerBound, upperBound, closureContract, status } = datum.value;
      if (lowerBound !== smallest) {
        refuse(
          "CONFLICT_NOT_WIDENED",
          `lower bound ${String(lowerBound)}, observations from ${String(smallest)}`,
        );
      }
      if (upperBound !== null && upperBound < largest) {
        refuse(
          "CONFLICT_NOT_WIDENED",
          `upper bound ${String(upperBound)}, observations to ${String(largest)}`,
        );
      }
      if (upperBound !== null && !contractReviewed(closureContract)) {
        refuse("CLOSURE_WITHOUT_REVIEWED_CONTRACT", `upper bound under ${String(closureContract)}`);
      }
      if (upperBound === null && closureContract !== null) {
        refuse("CLOSURE_WITHOUT_REVIEWED_CONTRACT", "a contract names no upper bound");
      }
      if ((status === "EXACT") !== (upperBound === lowerBound)) {
        refuse("STATUS_MISSTATED", `${status} with bounds ${String(lowerBound)} and ${String(upperBound)}`);
      }
    }
  } else {
    const sets = datum.sourcePulls.flatMap((pull) =>
      pull.observation.kind === "CANDIDATES" ? [pull.observation.creatureGameIds] : [],
    );
    if (sets.length !== datum.sourcePulls.length) {
      refuse("OBSERVATION_KIND_MISMATCH", "a candidate datum needs candidates from every pull");
    } else {
      const union = new Set(sets.flat());
      const stated = new Set(datum.value.creatureGameIds);
      if (union.size !== stated.size || [...union].some((id) => !stated.has(id))) {
        refuse("CONFLICT_NOT_WIDENED", "a candidate set must be the union of its observations");
      }
      if (datum.value.closure === "CLOSED" && !contractReviewed(datum.value.closureContract)) {
        refuse(
          "CLOSURE_WITHOUT_REVIEWED_CONTRACT",
          `closed set under ${String(datum.value.closureContract)}`,
        );
      }
      if ((datum.value.status === "EXACT") !== (datum.value.closure === "CLOSED")) {
        refuse("STATUS_MISSTATED", `${datum.value.status} with a ${datum.value.closure} set`);
      }
    }
  }
  return refusals;
}

/** Validates a dataset and everything the shape alone cannot say. Refuses rather than repairs. */
export function parseEncounterStateCensus(
  raw: unknown,
  review: CensusReviewState = PRODUCTION_CENSUS_REVIEW_STATE,
): CensusParse {
  const shaped = censusDatasetSchema.safeParse(raw);
  if (!shaped.success) {
    return {
      ok: false,
      refusals: shaped.error.issues.map((issue) => ({
        code: "SHAPE" as const,
        datumId: null,
        detail: `${issue.path.join(".")}: ${issue.message}`,
      })),
    };
  }
  const dataset = shaped.data;
  const refusals: CensusRefusal[] = [];
  if (dataset.acquisitionRuleId !== review.plan.acquisitionRuleId) {
    refusals.push({
      code: "ACQUISITION_RULE_MISMATCH",
      datumId: null,
      detail: `${dataset.acquisitionRuleId}, the plan is ${review.plan.acquisitionRuleId}`,
    });
  }
  const seen = new Set<string>();
  for (const datum of dataset.data) {
    if (seen.has(datum.datumId)) {
      refusals.push({ code: "DUPLICATE_DATUM", datumId: datum.datumId, detail: "datumId repeats" });
    }
    seen.add(datum.datumId);
    refusals.push(...refusalsOfDatum(datum, review));
  }
  dataset.data.forEach((datum, index) => {
    for (const other of dataset.data.slice(index + 1)) {
      if (sameFactKey(datum, other) && windowsOverlap(datum.window, other.window)) {
        refusals.push({
          code: "OVERLAPPING_WINDOWS",
          datumId: datum.datumId,
          detail: `overlaps ${other.datumId}; a conflict widens one bound, it never keeps two`,
        });
      }
    }
  });
  return refusals.length === 0 ? { ok: true, dataset } : { ok: false, refusals };
}

/**
 * Separation: the census's source reports that are also evaluated, which must be none. A report that
 * holds an evaluated pull is excluded whole, since its other pulls share its players.
 */
export function censusReportsAlsoEvaluated(
  dataset: EncounterStateCensus,
  evaluatedReportCodes: ReadonlySet<string>,
): readonly string[] {
  const overlapping = new Set(
    dataset.data.flatMap((datum) =>
      datum.sourcePulls.map((pull) => pull.reportCode).filter((code) => evaluatedReportCodes.has(code)),
    ),
  );
  return [...overlapping].sort();
}

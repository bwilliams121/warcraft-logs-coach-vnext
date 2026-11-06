/**
 * The supplier seam behind `enemySetAt`'s upper bound and `targetDomainFor` (POLB-A; agent/architecture.md
 * "POLB-A"). Gameplay-neutral: it maps a curated datum onto one position of one analyzed pull, or says
 * why it cannot. What a count means stays with the pinned list and its specialization.
 *
 * A DATUM MAPS ONLY WHEN ALL OF THIS IS ESTABLISHED. Each failure is UNKNOWN, with its reason:
 *
 *   the same encounter and a known difficulty       NO_CURATED_DATUM, DIFFICULTY_UNKNOWN
 *   the same game and log version                   VERSION_NOT_APPLICABLE
 *   a resolved build the datum names                BUILD_UNRESOLVED, BUILD_NOT_COVERED
 *   a report the census did not read                ANALYZED_REPORT_IS_CENSUS_SOURCE
 *   the window's own anchor, at or before D         WINDOW_ANCHOR_NOT_ESTABLISHED, OUTSIDE_WINDOW
 *   one datum only                                  AMBIGUOUS_DATA
 *   complete census evidence                        CENSUS_NOT_COMPLETE
 *
 * NO FUTURE EVIDENCE (O2). Every read goes through the temporal position. The pull's end, its later
 * phases and its later events are never read, so a census row cannot be selected by how the pull ended.
 *
 * NO OWN-PULL BRACKETING. A report the census read cannot be bounded by data derived from itself.
 *
 * WHAT THIS DOES NOT DO. It decides no count. An upper bound below the observed members is the enemy
 * set's contradiction, which is UNKNOWN. POLB-B adds the lower bound's use and the drift diagnostic.
 */

import type {
  EncounterStateCensus,
  CensusDatum,
  CensusFact,
} from "../data/encounter-census/encounter-state-census-artifact.js";
import { ENCOUNTER_STATE_CENSUS } from "../data/encounter-census/encounter-state-census.js";
import type {
  EncounterStateCitation,
  EnemySetUpperBoundEvidence,
} from "../engine/game-state/enemies/enemy-set.js";
import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type { CombatState } from "../engine/state/combat-state.js";
import type { TemporalPosition } from "../engine/state/temporal.js";

export type CensusMappingUnknownReason =
  | "NO_CURATED_DATUM"
  | "DIFFICULTY_UNKNOWN"
  | "VERSION_NOT_APPLICABLE"
  | "BUILD_UNRESOLVED"
  | "BUILD_NOT_COVERED"
  | "ANALYZED_REPORT_IS_CENSUS_SOURCE"
  | "WINDOW_ANCHOR_NOT_ESTABLISHED"
  | "OUTSIDE_WINDOW"
  | "AMBIGUOUS_DATA"
  | "CENSUS_NOT_COMPLETE";

export type CensusMapping =
  | { readonly state: "MAPPED"; readonly datum: CensusDatum; readonly citation: EncounterStateCitation }
  | { readonly state: "UNKNOWN"; readonly reason: CensusMappingUnknownReason };

export interface CensusMappingQuery {
  readonly fact: CensusFact;
  /** The action an action-owned fact belongs to; `null` for a fact no action owns. */
  readonly actionToken: string | null;
  readonly at: TemporalPosition;
}

/** Whether `at` lies in a datum's window. Anchored only on what the pull has established by `at`. */
function windowContains(
  state: CombatState,
  datum: CensusDatum,
  at: TemporalPosition,
): "INSIDE" | "OUTSIDE" | "ANCHOR_NOT_ESTABLISHED" {
  const { window } = datum;
  let offsetMs: number;
  if (window.anchor === "PULL_START") {
    const elapsed = state.encounter.elapsedFightTimeAt(at);
    if (elapsed.certainty !== "EXACT") return "ANCHOR_NOT_ESTABLISHED";
    offsetMs = elapsed.value;
  } else {
    const resolved = state.resolveTemporalPosition(at);
    const phase = state.encounter.phaseAt(at);
    if (!resolved.ok || phase.certainty !== "EXACT") return "ANCHOR_NOT_ESTABLISHED";
    if (phase.value.phaseId !== window.phaseId) return "OUTSIDE";
    offsetMs = resolved.prefix.boundaryReportTimeMs - phase.value.startTimeMs;
  }
  return window.fromMs <= offsetMs && offsetMs < window.toMs ? "INSIDE" : "OUTSIDE";
}

function windowLabelOf(datum: CensusDatum): string {
  const { window } = datum;
  const span = `[${String(window.fromMs)},${String(window.toMs)})`;
  return window.anchor === "PULL_START"
    ? `PULL_START${span}`
    : `PHASE_START:${String(window.phaseId)}${span}`;
}

function citationOf(dataset: EncounterStateCensus, datum: CensusDatum): EncounterStateCitation {
  return {
    datasetId: dataset.datasetId,
    datasetRevision: dataset.datasetRevision,
    datumId: datum.datumId,
    acquisitionRuleId: dataset.acquisitionRuleId,
    evidencePredicate: datum.evidencePredicate,
    sourceCorpusRevision: dataset.sourceCorpusRevision,
    window: windowLabelOf(datum),
    completeness: datum.completeness,
    sourcePulls: datum.sourcePulls.map((pull) => ({ reportCode: pull.reportCode, fightId: pull.fightId })),
  };
}

/** The one datum for this fact at this position of this pull, or why there is none. */
export function mapCensusDatum(
  dataset: EncounterStateCensus,
  state: CombatState,
  gameBuild: string | null,
  query: CensusMappingQuery,
): CensusMapping {
  const unknown = (reason: CensusMappingUnknownReason): CensusMapping => ({ state: "UNKNOWN", reason });
  const fight: CombatFight = state.fight;
  const { difficulty, encounterId } = fight.fight;
  if (difficulty === null) return unknown("DIFFICULTY_UNKNOWN");

  const forFact = dataset.data.filter(
    (datum) =>
      datum.fact === query.fact &&
      datum.actionToken === query.actionToken &&
      datum.applicability.encounterId === encounterId &&
      datum.applicability.difficulty === difficulty,
  );
  if (forFact.length === 0) return unknown("NO_CURATED_DATUM");

  const versioned = forFact.filter(
    (datum) =>
      fight.data.gameVersion !== null &&
      datum.applicability.gameVersion === fight.data.gameVersion &&
      datum.applicability.logVersion === fight.data.logVersion,
  );
  if (versioned.length === 0) return unknown("VERSION_NOT_APPLICABLE");

  if (gameBuild === null) return unknown("BUILD_UNRESOLVED");
  const onBuild = versioned.filter((datum) => datum.applicability.gameBuilds.includes(gameBuild));
  if (onBuild.length === 0) return unknown("BUILD_NOT_COVERED");

  if (onBuild.some((datum) => datum.sourcePulls.some((pull) => pull.reportCode === fight.report.code))) {
    return unknown("ANALYZED_REPORT_IS_CENSUS_SOURCE");
  }

  const placed = onBuild.map((datum) => ({ datum, place: windowContains(state, datum, query.at) }));
  const inside = placed.filter((entry) => entry.place === "INSIDE");
  if (inside.length > 1) return unknown("AMBIGUOUS_DATA");
  const [only] = inside;
  if (only === undefined) {
    return unknown(
      placed.some((entry) => entry.place === "ANCHOR_NOT_ESTABLISHED")
        ? "WINDOW_ANCHOR_NOT_ESTABLISHED"
        : "OUTSIDE_WINDOW",
    );
  }
  // A window whose anchor cannot be read might also hold this position, so one match is not one datum.
  if (placed.some((entry) => entry.place === "ANCHOR_NOT_ESTABLISHED")) return unknown("AMBIGUOUS_DATA");
  if (only.datum.completeness !== "COMPLETE") return unknown("CENSUS_NOT_COMPLETE");
  return { state: "MAPPED", datum: only.datum, citation: citationOf(dataset, only.datum) };
}

/** How a target domain may be stated at a position. A CLOSED one carries what closed it. */
export type TargetDomainClosure =
  | { readonly closure: "CLOSED"; readonly provenance: string }
  | { readonly closure: "OPEN"; readonly provenance: "" };

export interface EncounterStateSupplier {
  upperBoundAt(state: CombatState, at: TemporalPosition): EnemySetUpperBoundEvidence | null;
  targetDomainClosureAt(state: CombatState, actionToken: string, at: TemporalPosition): TargetDomainClosure;
}

export interface EncounterStateSupplierInput {
  readonly dataset: EncounterStateCensus;
  /** The fight's resolved build, or `null`. Never inferred here from a date or a snapshot. */
  readonly gameBuildOf: (fight: CombatFight) => string | null;
}

const OPEN_DOMAIN: TargetDomainClosure = { closure: "OPEN", provenance: "" };

export function createEncounterStateSupplier(input: EncounterStateSupplierInput): EncounterStateSupplier {
  const { dataset, gameBuildOf } = input;
  return {
    upperBoundAt(state, at) {
      const mapped = mapCensusDatum(dataset, state, gameBuildOf(state.fight), {
        fact: "ACTIVE_ENEMIES",
        actionToken: null,
        at,
      });
      if (mapped.state !== "MAPPED" || mapped.datum.value.kind !== "COUNT_BOUND") return null;
      const { upperBound } = mapped.datum.value;
      return upperBound === null ? null : { upperBound, provenance: mapped.citation };
    },
    targetDomainClosureAt(state, actionToken, at) {
      const mapped = mapCensusDatum(dataset, state, gameBuildOf(state.fight), {
        fact: "TARGET_IF_CANDIDATES",
        actionToken,
        at,
      });
      if (mapped.state !== "MAPPED" || mapped.datum.value.kind !== "CANDIDATE_SET") return OPEN_DOMAIN;
      if (mapped.datum.value.closure !== "CLOSED") return OPEN_DOMAIN;
      return {
        closure: "CLOSED",
        provenance: `${mapped.citation.datasetRevision}#${mapped.citation.datumId}`,
      };
    },
  };
}

/**
 * The production supplier. The dataset holds no row, so it supplies nothing. No build is read yet:
 * only the publication pipeline may import the build resolver, so POLB-B wires it with a reviewed
 * change to that boundary, and until then every build is unresolved, which refuses every datum.
 */
export const PRODUCTION_ENCOUNTER_STATE_SUPPLIER: EncounterStateSupplier = createEncounterStateSupplier({
  dataset: ENCOUNTER_STATE_CENSUS,
  gameBuildOf: () => null,
});

/**
 * Artifact → normalized fight: THE coverage interpreter for captured evidence.
 *
 * Every test that builds a `CombatFight` from a corpus artifact builds it
 * here, so one policy decides what coverage a capture is granted. That policy
 * is stingy on purpose:
 *
 *   - capability is granted only to the categories a capture can vouch for;
 *   - coverage is granted only from the artifact's `retainedCoverage.grants`,
 *     each with its own categories, actor scope and ranges;
 *   - a SYNTHETIC artifact is granted no capability at all;
 *   - a slice that retains no grant can prove no absence.
 *
 * A test may not declare coverage over captured events by hand. Where a test
 * needs state the capture does not retain — a wider actor scope, a narrower
 * window — it says so through a named PREMISE, which this module applies to
 * the artifact's own grants and never widens beyond what the premise's
 * construction justifies. `tests/contracts/m9a-corpus-layering.test.ts` guards
 * that no capture-backed module reaches `syntheticFight` directly.
 *
 * The events themselves go through the REAL normalizer under the real
 * contracts. Nothing here fabricates a normalized event.
 */

import {
  classifyCoverage,
  inclusiveRange,
  intersectRangeLists,
  type TimeRangeMs,
} from "../../../src/engine/evidence/coverage.js";
import type { CategoryEvidence } from "../../../src/engine/normalization/completeness.js";
import type { CombatFight } from "../../../src/engine/normalization/combat-fight.js";
import {
  createNormalizer,
  type NormalizationOutput,
} from "../../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../../src/engine/normalization/supported-families.js";
import { createCombatState, type CombatState } from "../../../src/engine/state/combat-state.js";
import type { CapabilityRecord, EvidenceCategory } from "../../../src/wcl/evidence-capability.js";
import { syntheticFight } from "../synthetic-fight.js";
import { committedArtifactRecord, committedEventArray, committedManifest } from "./artifacts.js";
import { CAPTURE_VOUCHED_CATEGORIES, type CorpusArtifactRecord } from "./contract.js";
import type { LoadedArtifact, LoadedCorpus } from "./loader.js";

type CaptureSource = NonNullable<CorpusArtifactRecord["provenance"]["source"]>;
type CoverageGrant = CorpusArtifactRecord["provenance"]["retainedCoverage"]["grants"][number];

/** What the fight builder needs from an artifact, whichever way it was loaded. */
export interface ArtifactEvidence {
  readonly record: CorpusArtifactRecord;
  readonly rawEvents: readonly Record<string, unknown>[];
  /** The nearest capture source up the lineage chain, or `null` for SYNTHETIC. */
  readonly source: CaptureSource | null;
}

/**
 * A stated departure from the artifact's own evidence, applied to its grants.
 *
 * Each kind names what a test did to the events and what that does to
 * coverage. None can widen coverage beyond what its construction justifies:
 *
 * - `TRUNCATED_BEFORE`   events before `cutMs` were removed (a `combatantinfo`
 *                        may be kept). Grants are clipped to start at `cutMs`.
 * - `EVENT_REMOVED_AT`   one event at `reportTimeMs` was removed. Nothing at or
 *                        after that instant is complete any more; grants are
 *                        clipped to end before it.
 * - `FANNED_ACTORS`      every event of `sourceActorId` was cloned once per id
 *                        in `actorIds` with its actor references remapped.
 *                        Each clone set is complete exactly where the
 *                        original's is, so every grant that vouches for
 *                        `sourceActorId` vouches for the clones too. A TEST
 *                        PREMISE: the clones never happened.
 */
export type FightPremise =
  | { readonly kind: "TRUNCATED_BEFORE"; readonly cutMs: number }
  | { readonly kind: "EVENT_REMOVED_AT"; readonly reportTimeMs: number }
  | { readonly kind: "FANNED_ACTORS"; readonly sourceActorId: number; readonly actorIds: readonly number[] };

// --------------------------------------------------------------------------
// Evidence access
// --------------------------------------------------------------------------

function sourceUpChain(
  record: CorpusArtifactRecord,
  recordFor: (artifactId: string) => CorpusArtifactRecord | undefined,
): CaptureSource | null {
  let cursor: CorpusArtifactRecord | undefined = record;
  while (cursor !== undefined) {
    if (cursor.provenance.source !== null) return cursor.provenance.source;
    const parentId: string | null = cursor.provenance.parentArtifactId;
    cursor = parentId === null ? undefined : recordFor(parentId);
  }
  return null;
}

/** Evidence from a loader-validated corpus (the harness path). */
export function evidenceOf(corpus: LoadedCorpus, artifact: LoadedArtifact): ArtifactEvidence {
  return {
    record: artifact.record,
    rawEvents: rawEventsOf(artifact),
    source: sourceUpChain(
      artifact.record,
      (id) => corpus.artifacts.find((entry) => entry.record.artifactId === id)?.record,
    ),
  };
}

/** Evidence from the committed manifest, synchronously (the layer-test path). */
export function committedEvidence(artifactId: string): ArtifactEvidence {
  const record = committedArtifactRecord(artifactId);
  const manifest = committedManifest();
  return {
    record,
    rawEvents: committedEventArray(artifactId),
    source: sourceUpChain(record, (id) => manifest.artifacts.find((entry) => entry.artifactId === id)),
  };
}

export function captureSourceOf(corpus: LoadedCorpus, artifact: LoadedArtifact): CaptureSource | null {
  return evidenceOf(corpus, artifact).source;
}

export function rawEventsOf(artifact: LoadedArtifact): readonly Record<string, unknown>[] {
  if (!Array.isArray(artifact.json)) {
    throw new Error(`artifact ${artifact.record.artifactId} is not an event array`);
  }
  return artifact.json as readonly Record<string, unknown>[];
}

// --------------------------------------------------------------------------
// Normalization
// --------------------------------------------------------------------------

/**
 * The window the normalizer is told it is looking at: the events' own
 * timestamp extent.
 *
 * NOT the source query window. A slice is what it contains; telling the
 * normalizer it spans a query window the slice was cut from would make every
 * out-of-window timestamp a fact about the source rather than the artifact,
 * and would let a `combatantinfo` fetched by a separate single-timestamp query
 * read as outside the requested range. The extent is the honest maximum for
 * every artifact kind, synthetic included.
 */
export function windowOfEvents(rawEvents: readonly Record<string, unknown>[]): TimeRangeMs {
  const timestamps = rawEvents
    .map((event) => event["timestamp"])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (timestamps.length === 0) return inclusiveRange(0, 0);
  return inclusiveRange(Math.min(...timestamps), Math.max(...timestamps));
}

export function windowOf(artifact: LoadedArtifact): TimeRangeMs {
  return windowOfEvents(rawEventsOf(artifact));
}

function normalizeEvents(rawEvents: readonly Record<string, unknown>[]): NormalizationOutput {
  const window = windowOfEvents(rawEvents);
  const normalizer = createNormalizer({
    fightStartTimeMs: window.fromReportTimeMs,
    requestedRange: window,
    contracts: indexContracts(SUPPORTED_TYPE_CONTRACTS),
    directionFields: VERIFIED_DIRECTION_FIELDS,
  });
  normalizer.accept({
    streamId: "all",
    pageOrdinal: 0,
    requestedStartTimeMs: window.fromReportTimeMs,
    nextPageTimestamp: null,
    events: rawEvents,
  });
  return normalizer.finish();
}

export function normalizeArtifact(artifact: LoadedArtifact): NormalizationOutput {
  return normalizeEvents(rawEventsOf(artifact));
}

/** What normalization did to a committed artifact — counts only, never the events. */
export interface NormalizationFacts {
  readonly rawEventCount: number;
  readonly normalizedEventCount: number;
  readonly malformedFamilyEvents: number;
  readonly malformedObservations: number;
  readonly malformedEnvelopes: number;
  readonly degradedCategories: readonly EvidenceCategory[];
}

/**
 * Normalization facts about a committed artifact, for a layer test that wants
 * to state "this slice normalizes cleanly" beside its semantic claims.
 *
 * Deliberately counts and not events: normalized captured events leave this
 * module only inside a fight it built, so no test can hand them to a fight
 * builder with coverage of its own choosing.
 */
export function normalizationFactsOf(artifactId: string): NormalizationFacts {
  const rawEvents = committedEventArray(artifactId);
  const output = normalizeEvents(rawEvents);
  return {
    rawEventCount: rawEvents.length,
    normalizedEventCount: output.events.length,
    malformedFamilyEvents: output.events.filter((event) => event.kind === "MALFORMED_FAMILY").length,
    malformedObservations: output.malformedObservations.length,
    malformedEnvelopes: output.malformedEnvelopeCount,
    degradedCategories: [...output.degradedCategories].sort(),
  };
}

// --------------------------------------------------------------------------
// Coverage
// --------------------------------------------------------------------------

function capabilityFor(record: CorpusArtifactRecord, source: CaptureSource): CapabilityRecord {
  return {
    capability: "OBSERVABLE",
    retrievalSource: "EVENTS_ALL_STREAM",
    evidence: {
      kind: "SANITIZED_CAPTURE",
      fixtureId: record.artifactId,
      capturedOn:
        typeof source.capturedOn === "string" && /^\d{4}/.test(source.capturedOn)
          ? source.capturedOn
          : "UNAVAILABLE",
    },
    logVersionObserved: typeof source.logVersion === "number" ? source.logVersion : null,
    gameVersionObserved: typeof source.gameVersion === "number" ? source.gameVersion : null,
  };
}

/** Clips every range to `[fromMs, toMs]`, dropping ranges that vanish. */
function clipRanges(grant: CoverageGrant, fromMs: number, toMs: number): CoverageGrant {
  const ranges = grant.ranges
    .map((range) => ({
      fromReportTimeMs: Math.max(range.fromReportTimeMs, fromMs),
      toReportTimeMs: Math.min(range.toReportTimeMs, toMs),
    }))
    .filter((range) => range.fromReportTimeMs <= range.toReportTimeMs);
  return { ...grant, ranges };
}

/** The artifact's grants after a premise is applied. Never wider than the premise justifies. */
export function grantsUnder(
  record: CorpusArtifactRecord,
  premise: FightPremise | null,
): readonly CoverageGrant[] {
  const grants = record.provenance.retainedCoverage.grants;
  if (premise === null) return grants;
  switch (premise.kind) {
    case "TRUNCATED_BEFORE":
      return grants
        .map((grant) => clipRanges(grant, premise.cutMs, Number.MAX_SAFE_INTEGER))
        .filter((grant) => grant.ranges.length > 0);
    case "EVENT_REMOVED_AT":
      return grants
        .map((grant) => clipRanges(grant, Number.MIN_SAFE_INTEGER, premise.reportTimeMs - 1))
        .filter((grant) => grant.ranges.length > 0);
    case "FANNED_ACTORS":
      return grants.map((grant) =>
        grant.actorScope === null || !grant.actorScope.includes(premise.sourceActorId)
          ? grant
          : { ...grant, actorScope: [...new Set([...grant.actorScope, ...premise.actorIds])] },
      );
  }
}

function categoriesFor(
  record: CorpusArtifactRecord,
  source: CaptureSource | null,
  window: TimeRangeMs,
  premise: FightPremise | null,
): Partial<Record<EvidenceCategory, CategoryEvidence>> {
  const categories: Partial<Record<EvidenceCategory, CategoryEvidence>> = {};
  if (source === null) return categories;
  const capability = capabilityFor(record, source);
  const grants = grantsUnder(record, premise);
  for (const category of CAPTURE_VOUCHED_CATEGORIES) {
    // At most one grant per category; the loader rejected overlaps.
    const grant = grants.find((candidate) => candidate.categories.includes(category));
    const ranges = (grant?.ranges ?? []).map((range) =>
      inclusiveRange(range.fromReportTimeMs, range.toReportTimeMs),
    );
    categories[category] = {
      capability: "OBSERVABLE",
      source: capability,
      coverage: {
        state: classifyCoverage(ranges, window),
        reason: "COMPLETED_NORMALLY",
        coveredRanges: ranges,
        sourceStreamIds: ["all"],
        actorScope: grant === undefined || grant.actorScope === null ? null : [...grant.actorScope],
      },
    };
  }
  return categories;
}

// --------------------------------------------------------------------------
// Fights
// --------------------------------------------------------------------------

/**
 * A fight over evidence, granted exactly the coverage the artifact retains —
 * or, under a premise, exactly what the premise's construction justifies.
 *
 * `rawEvents` defaults to the artifact's own events. A caller supplying
 * different events MUST supply the premise that explains them; without one,
 * the artifact's grants would be applied to events they do not describe.
 */
export function fightOverEvidence(
  evidence: ArtifactEvidence,
  options: {
    readonly rawEvents?: readonly Record<string, unknown>[];
    readonly premise?: FightPremise | null;
  } = {},
): CombatFight {
  const rawEvents = options.rawEvents ?? evidence.rawEvents;
  const premise = options.premise ?? null;
  if (rawEvents !== evidence.rawEvents && premise === null) {
    throw new Error(
      `a fight over events that are not artifact ${evidence.record.artifactId}'s own needs a stated premise`,
    );
  }
  const window = windowOfEvents(rawEvents);
  const normalized = normalizeEvents(rawEvents);
  return syntheticFight({
    events: normalized.events,
    malformedObservations: normalized.malformedObservations,
    startTimeMs: window.fromReportTimeMs,
    endTimeMs: window.toReportTimeMs,
    categories: categoriesFor(evidence.record, evidence.source, window, premise),
  });
}

/** A fight over a loader-validated artifact (the harness path). */
export function fightOf(corpus: LoadedCorpus, artifact: LoadedArtifact): CombatFight {
  return fightOverEvidence(evidenceOf(corpus, artifact));
}

// --------------------------------------------------------------------------
// Bundles (M10-C5 Phase B)
// --------------------------------------------------------------------------

/**
 * A BUNDLE is several artifacts of ONE capture lineage, in chronological
 * order, composed into one fight: the committed 45-second Phase A slice and
 * the segments that continue it. Composition is deliberately strict, because
 * a join is a coverage claim:
 *
 *   - events are concatenated in artifact order and must not step backwards
 *     in time across a boundary, and no event row may appear on both sides
 *     of a boundary;
 *   - every part must grant the same actor scope, and every part must
 *     descend from the same report and fight;
 *   - a category's covered ranges are the parts' grants, joined where
 *     ADJACENT (`to + 1 == from`) or bridged by a loader-validated zero-event
 *     certificate; the gaps that remain must be EXACTLY the holes the caller
 *     declared — an undeclared hole refuses, and so does a declared hole that
 *     is not there;
 *   - overlapping grants refuse: two parts cannot both vouch for the same
 *     millisecond.
 *
 * The result is a normal fight over one event array: M3 and M4 see nothing
 * bundle-specific, and a declared hole is simply PARTIAL coverage there.
 */
export interface BundleHole {
  readonly fromReportTimeMs: number;
  readonly toReportTimeMs: number;
}

export interface BundleComposition {
  readonly fight: CombatFight;
  /** The merged covered ranges per category, after certificates and holes. */
  readonly coveredRanges: Readonly<Partial<Record<EvidenceCategory, readonly TimeRangeMs[]>>>;
  readonly holes: readonly BundleHole[];
  readonly events: number;
}

export class BundleCompositionError extends Error {
  constructor(message: string) {
    super(`bundle composition refused: ${message}`);
    this.name = "BundleCompositionError";
  }
}

function eventTimestamp(event: Record<string, unknown>): number | null {
  const value = event["timestamp"];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Ranges joined where adjacent or overlapping-by-one; overlaps refuse. */
function joinRanges(ranges: readonly BundleHole[], label: string): BundleHole[] {
  const sorted = [...ranges].sort((a, b) => a.fromReportTimeMs - b.fromReportTimeMs);
  const joined: BundleHole[] = [];
  for (const range of sorted) {
    const last = joined[joined.length - 1];
    if (last === undefined) {
      joined.push({ ...range });
      continue;
    }
    if (range.fromReportTimeMs <= last.toReportTimeMs) {
      throw new BundleCompositionError(
        `${label}: [${String(range.fromReportTimeMs)} .. ${String(range.toReportTimeMs)}] overlaps [${String(last.fromReportTimeMs)} .. ${String(last.toReportTimeMs)}]`,
      );
    }
    if (range.fromReportTimeMs === last.toReportTimeMs + 1) {
      joined[joined.length - 1] = {
        fromReportTimeMs: last.fromReportTimeMs,
        toReportTimeMs: range.toReportTimeMs,
      };
    } else {
      joined.push({ ...range });
    }
  }
  return joined;
}

function holesBetween(joined: readonly BundleHole[]): BundleHole[] {
  const holes: BundleHole[] = [];
  for (let index = 1; index < joined.length; index += 1) {
    const previous = joined[index - 1];
    const current = joined[index];
    if (previous === undefined || current === undefined) continue;
    holes.push({
      fromReportTimeMs: previous.toReportTimeMs + 1,
      toReportTimeMs: current.fromReportTimeMs - 1,
    });
  }
  return holes;
}

const holeKey = (hole: BundleHole): string =>
  `${String(hole.fromReportTimeMs)}..${String(hole.toReportTimeMs)}`;

export function bundleOverEvidence(
  parts: readonly ArtifactEvidence[],
  declaredHoles: readonly BundleHole[],
): BundleComposition {
  if (parts.length < 2) throw new BundleCompositionError("a bundle needs at least two parts");
  const first = parts[0];
  if (first === undefined) throw new BundleCompositionError("no parts");

  // ---- lineage and scope ----
  const lineage = parts.map((part) => `${String(part.source?.reportCode)}/${String(part.source?.fightId)}`);
  if (new Set(lineage).size !== 1 || first.source === null) {
    throw new BundleCompositionError(`parts descend from different captures: ${lineage.join(", ")}`);
  }
  const scopes = parts.flatMap((part) =>
    part.record.provenance.retainedCoverage.grants.map((grant) => JSON.stringify(grant.actorScope)),
  );
  if (new Set(scopes).size !== 1) {
    throw new BundleCompositionError(
      `parts grant different actor scopes: ${[...new Set(scopes)].join(", ")}`,
    );
  }

  // ---- events: order and boundary duplicates ----
  const rawEvents: Record<string, unknown>[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part === undefined) continue;
    const previous = parts[index - 1];
    if (previous !== undefined) {
      const lastPrevious = previous.rawEvents[previous.rawEvents.length - 1];
      const firstCurrent = part.rawEvents[0];
      const before = lastPrevious === undefined ? null : eventTimestamp(lastPrevious);
      const after = firstCurrent === undefined ? null : eventTimestamp(firstCurrent);
      if (before !== null && after !== null && after < before) {
        throw new BundleCompositionError(
          `${part.record.artifactId} starts at ${String(after)}, before ${previous.record.artifactId} ends at ${String(before)}`,
        );
      }
      const rows = new Set(previous.rawEvents.map((event) => JSON.stringify(event)));
      const shared = part.rawEvents.filter((event) => rows.has(JSON.stringify(event))).length;
      if (shared > 0) {
        throw new BundleCompositionError(
          `${String(shared)} event row(s) appear in both ${previous.record.artifactId} and ${part.record.artifactId}`,
        );
      }
    }
    rawEvents.push(...part.rawEvents);
  }

  // ---- coverage: grants joined by adjacency or certificate; holes must match ----
  const coveredRanges: Partial<Record<EvidenceCategory, readonly TimeRangeMs[]>> = {};
  const holesByCategory = new Map<string, readonly BundleHole[]>();
  for (const category of CAPTURE_VOUCHED_CATEGORIES) {
    const ranges: BundleHole[] = [];
    for (const part of parts) {
      const grant = part.record.provenance.retainedCoverage.grants.find((candidate) =>
        candidate.categories.includes(category),
      );
      if (grant === undefined) continue;
      ranges.push(...grant.ranges);
      // A certificate bridges the interval before this part's own coverage
      // for every category this part grants; the loader validated it.
      for (const certificate of part.record.provenance.retainedCoverage.certifiedEmpty ?? []) {
        if (parts.some((candidate) => candidate.record.artifactId === certificate.precedingArtifactId)) {
          ranges.push({
            fromReportTimeMs: certificate.fromReportTimeMs,
            toReportTimeMs: certificate.toReportTimeMs,
          });
        }
      }
    }
    if (ranges.length === 0) continue;
    const joined = joinRanges(ranges, category);
    holesByCategory.set(category, holesBetween(joined));
    coveredRanges[category] = joined.map((range) =>
      inclusiveRange(range.fromReportTimeMs, range.toReportTimeMs),
    );
  }
  const holeSets = [...holesByCategory.values()].map((holes) => holes.map(holeKey).join("|"));
  if (new Set(holeSets).size > 1) {
    throw new BundleCompositionError(
      `categories disagree on the holes: ${[...new Set(holeSets)].join(" vs ")}`,
    );
  }
  const holes = [...holesByCategory.values()][0] ?? [];
  const declared = new Set(declaredHoles.map(holeKey));
  const actual = new Set(holes.map(holeKey));
  const undeclared = holes.filter((hole) => !declared.has(holeKey(hole)));
  const missing = declaredHoles.filter((hole) => !actual.has(holeKey(hole)));
  if (undeclared.length > 0) {
    throw new BundleCompositionError(`undeclared coverage hole(s): ${undeclared.map(holeKey).join(", ")}`);
  }
  if (missing.length > 0) {
    throw new BundleCompositionError(`declared hole(s) not present: ${missing.map(holeKey).join(", ")}`);
  }

  // ---- the fight: one event array through the real normalizer ----
  const window = windowOfEvents(rawEvents);
  const normalized = normalizeEvents(rawEvents);
  const capability = capabilityFor(first.record, first.source);
  const categories: Partial<Record<EvidenceCategory, CategoryEvidence>> = {};
  const actorScope = first.record.provenance.retainedCoverage.grants[0]?.actorScope ?? null;
  for (const category of CAPTURE_VOUCHED_CATEGORIES) {
    const ranges = coveredRanges[category] ?? [];
    categories[category] = {
      capability: "OBSERVABLE",
      source: capability,
      coverage: {
        state: classifyCoverage(intersectRangeLists(ranges, [window]), window),
        reason: "COMPLETED_NORMALLY",
        coveredRanges: ranges,
        sourceStreamIds: ["all"],
        actorScope: actorScope === null ? null : [...actorScope],
      },
    };
  }
  const fight = syntheticFight({
    events: normalized.events,
    malformedObservations: normalized.malformedObservations,
    startTimeMs: window.fromReportTimeMs,
    endTimeMs: window.toReportTimeMs,
    categories,
  });
  return { fight, coveredRanges, holes, events: rawEvents.length };
}

/** A bundle over loader-validated artifacts, in the given order (the harness path). */
export function bundleOf(
  corpus: LoadedCorpus,
  artifactIds: readonly string[],
  declaredHoles: readonly BundleHole[],
): BundleComposition {
  const parts = artifactIds.map((artifactId) => {
    const artifact = corpus.artifacts.find((entry) => entry.record.artifactId === artifactId);
    if (artifact === undefined) throw new BundleCompositionError(`unknown artifact ${artifactId}`);
    return evidenceOf(corpus, artifact);
  });
  return bundleOverEvidence(parts, declaredHoles);
}

export function stateOfBundle(
  corpus: LoadedCorpus,
  artifactIds: readonly string[],
  declaredHoles: readonly BundleHole[],
): CombatState {
  return createCombatState(bundleOf(corpus, artifactIds, declaredHoles).fight);
}

/** A bundle over committed artifacts, synchronously (the layer-test path). */
export function corpusBundle(
  artifactIds: readonly string[],
  declaredHoles: readonly BundleHole[],
): BundleComposition {
  return bundleOverEvidence(artifactIds.map(committedEvidence), declaredHoles);
}

export function corpusBundleState(
  artifactIds: readonly string[],
  declaredHoles: readonly BundleHole[],
): CombatState {
  return createCombatState(corpusBundle(artifactIds, declaredHoles).fight);
}

export function stateOf(corpus: LoadedCorpus, artifact: LoadedArtifact): CombatState {
  return createCombatState(fightOf(corpus, artifact));
}

/** A fight over a committed artifact, synchronously (the layer-test path). */
export function corpusFight(artifactId: string, premise: FightPremise | null = null): CombatFight {
  return fightOverEvidence(committedEvidence(artifactId), { premise });
}

export function corpusState(artifactId: string, premise: FightPremise | null = null): CombatState {
  return createCombatState(corpusFight(artifactId, premise));
}

/**
 * A fight over caller-supplied events derived from a committed artifact, under
 * a stated premise. The events are still normalized by the real normalizer.
 */
export function corpusFightFrom(
  artifactId: string,
  rawEvents: readonly Record<string, unknown>[],
  premise: FightPremise,
): CombatFight {
  return fightOverEvidence(committedEvidence(artifactId), { rawEvents, premise });
}

export function corpusStateFrom(
  artifactId: string,
  rawEvents: readonly Record<string, unknown>[],
  premise: FightPremise,
): CombatState {
  return createCombatState(corpusFightFrom(artifactId, rawEvents, premise));
}

/** The canonical position of the ONE COMPLETE cast matching the locator, or a reason it is not one. */
export function positionOfCast(
  state: CombatState,
  cast: { readonly actorId: number; readonly reportTimeMs: number; readonly abilityGameId: number },
): { readonly ok: true; readonly position: number } | { readonly ok: false; readonly detail: string } {
  const positions: number[] = [];
  state.fight.events.forEach((event, position) => {
    if (event.kind !== "CAST" || event.castPhase !== "COMPLETE") return;
    if (event.source?.actorId !== cast.actorId) return;
    if (event.abilityGameId !== cast.abilityGameId || event.reportTimeMs !== cast.reportTimeMs) return;
    positions.push(position);
  });
  const position = positions[0];
  if (positions.length !== 1 || position === undefined) {
    return {
      ok: false,
      detail: `expected exactly one COMPLETE cast of ${String(cast.abilityGameId)} by actor ${String(cast.actorId)} at ${String(cast.reportTimeMs)}; found ${String(positions.length)}`,
    };
  }
  return { ok: true, position };
}

/**
 * Builds tests/corpus/manifest.json from the artifact and case definitions
 * below.
 *
 * WHY A GENERATOR EXISTS. Seventeen artifacts share a handful of source
 * captures and one digest policy. Writing every provenance block by hand
 * invites exactly the drift the manifest is supposed to make impossible: a
 * revision copied wrong, a byte length left stale. This script states each
 * shared fact ONCE, measures every digest and byte length from the file, and
 * writes the manifest.
 *
 * THE MANIFEST IS THE ARTIFACT OF RECORD, NOT THIS SCRIPT. The loader validates
 * the committed manifest against the committed bytes on every test run; this
 * script is how the manifest is regenerated after a deliberate change to a
 * case or an artifact. Run it, run Prettier on the output, review the diff.
 *
 * Plain JavaScript with no `src/` imports, like the authority extractors, so
 * `node` runs it with no TypeScript runner and no new dependency. No network,
 * no clock.
 *
 *     node scripts/corpus/build-manifest.mjs
 *     npx prettier --write tests/corpus/manifest.json
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CORPUS = join(ROOT, "tests", "corpus");
/** The evidence archive (M11-C4e): a separate committed root, never loaded by the regression corpus. */
const EVIDENCE = join(ROOT, "tests", "evidence");

const UNAVAILABLE = "UNAVAILABLE";
const NOT_APPLICABLE = "NOT_APPLICABLE";

/** The digest policy: SHA-256 over the file's bytes with CRLF folded to LF. */
function digest(path) {
  const data = readFileSync(path).toString("latin1").replaceAll("\r\n", "\n");
  const bytes = Buffer.from(data, "latin1");
  return { sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length };
}

const tooling = (name, revision, invocation) => ({ name, revision, invocation });

const SANITIZER = "scripts/sanitize-probe.mjs";
// The slicer gained a revision field in M9-B (`SANITIZER_REVISION`); every
// committed slice predates it, so its revision at the time is not recorded.
const SANITIZER_REVISION_AT_CAPTURE = UNAVAILABLE;

const credential_scan = (revision = SANITIZER_REVISION_AT_CAPTURE) => ({
  kind: "CREDENTIAL_SHAPE_SCAN",
  tooling: tooling(SANITIZER, revision, "implicit on every write"),
  detail:
    "The slicer refuses to write output containing a credential-shaped value. Nothing was found and nothing was changed.",
  invalidates: [],
});

const selection = (invocation, detail, invalidates) => ({
  kind: "SUBSET_SELECTION",
  tooling: tooling(SANITIZER, SANITIZER_REVISION_AT_CAPTURE, invocation),
  detail,
  invalidates,
  /** A slice cut after M9-B records the slicer revision that cut it. */
  with_revision(revision) {
    const { with_revision: _drop, ...record } = this;
    return { ...record, tooling: { ...record.tooling, revision } };
  },
});

const legacy_copy = (legacyName, artifactFile) => ({
  kind: "LEGACY_FIXTURE_COPY",
  tooling: tooling(
    "M9-A/M9-B migration (file copy)",
    NOT_APPLICABLE,
    `cp tests/fixtures/wcl/events/${legacyName} tests/corpus/artifacts/wcl-events/${artifactFile}`,
  ),
  detail:
    "Byte-identical copy of the former tests/fixtures/wcl/events slice (same sha256). The corpus copy is now the canonical payload; the legacy file was removed in M9-B once every consumer read from the corpus.",
  invalidates: [],
});

const ALL_SLICE_INVALIDATIONS = [
  "WINDOW_COVERAGE",
  "ABSENCE_PROOF",
  "CROSS_EVENT_CONTINUITY",
  "PAGINATION_BEHAVIOUR",
];

const query = (includeResources, limit, startTimeMs, endTimeMs) => ({
  dataType: "All",
  hostilityType: "OMITTED",
  actorFilter: "NONE",
  includeResources,
  limit,
  startTimeMs,
  endTimeMs,
});

const completeness = (eventsReturned, pagesRetrieved, nextPageTimestamp, state, evidence) => ({
  eventsReturned,
  pagesRetrieved,
  nextPageTimestamp,
  state,
  evidence,
});

// --------------------------------------------------------------------------
// Source captures. Every fact below is transcribed from
// tests/corpus/PROVENANCE-legacy.md (formerly tests/fixtures/wcl/events/PROVENANCE.md).
// --------------------------------------------------------------------------

const PROV_LEGACY = "tests/corpus/PROVENANCE-legacy.md";

const source_q = (captureTooling, rawCaptureLocation, q, comp, capturedOn = "2026-09-11") => ({
  reportCode: "qJ1pgB49ZrRNVmCd",
  fightId: 6,
  reportRevision: 1,
  sourceActorId: 5,
  encounterId: 3420,
  difficulty: 4,
  capturedOn,
  gameVersion: 1,
  logVersion: 17,
  ingestionScope: "PLAYER_CONTEXT",
  query: q,
  completeness: comp,
  captureTooling,
  rawCaptureRetained: false,
  rawCaptureLocation,
});

/**
 * Why the A7R6 fight-7 subjects are in the corpus, in Warcraft Logs' own
 * performance terms. Read from `.probe/m9c-report-rankings.json` (one
 * `report.rankings(fightIDs:[7])` request, 2026-09-15). CONTEXT ONLY: nothing
 * below determines an expected result, and no assertion kind can read it. The
 * two Assassination Rogues on this kill parsed at 58 % and 33 % overall —
 * ordinary, not top-bracket — which is the point: the corpus verdicts are
 * about authority compatibility, never about rank.
 */
const A7R6_PERFORMANCE = {
  source: "reportData.report.rankings(fightIDs:[7]) — the report's own per-fight rankings",
  partition: 1,
  metric: "dps",
  subjects: [
    {
      actorId: 19,
      className: "Rogue",
      specName: "Assassination",
      rankPercent: 58,
      bracketPercent: 63,
      bracket: 16,
      bracketData: 319,
      totalParses: 655,
    },
    {
      actorId: 13,
      className: "Rogue",
      specName: "Assassination",
      rankPercent: 33,
      bracketPercent: 34,
      bracket: 16,
      bracketData: 319,
      totalParses: 655,
    },
  ],
  fightOutcome: "KILL",
  fightDurationMs: 424514,
};

const source_a = (captureTooling, rawCaptureLocation, q, comp, capturedOn, extra = {}) => ({
  reportCode: "A7R6kxPJ1hC8YQ4w",
  fightId: 7,
  reportRevision: 30,
  sourceActorId: 19,
  encounterId: 3445,
  difficulty: 5,
  capturedOn,
  gameVersion: 1,
  logVersion: 17,
  ingestionScope: "PLAYER_CONTEXT",
  query: q,
  completeness: comp,
  captureTooling,
  rawCaptureRetained: false,
  rawCaptureLocation,
  performanceContext: A7R6_PERFORMANCE,
  ...extra,
});

// --------------------------------------------------------------------------
// M9-C bounded captures (2026-09-15). One temporary, gitignored probe drove
// the PRODUCTION token provider, GraphQL client and query documents against
// the same report and fight every A7R6 slice already uses. Ten requests in
// total, each bounded in advance; decoded `data` only was written, never a
// header or token. Sanitized by scripts/corpus/sanitize-payloads.mjs
// (redaction/remap) and scripts/sanitize-probe.mjs (event slicing).
// --------------------------------------------------------------------------

const M9C_PROBE = (question, requests) =>
  tooling(
    ".probe/m9c-capture.probe.ts (temporary, gitignored) driving src/wcl/token-provider.ts, graphql-client.ts and the production query documents",
    UNAVAILABLE,
    `${question}; bounded to ${requests} in advance, run once by hand on 2026-09-15`,
  );

const PAYLOAD_SANITIZER = "scripts/corpus/sanitize-payloads.mjs";
/** Revision 1 wrote the page and rankings artifacts; revision 2 added the player-gameID rule and rewrote the contexts. */
const PAYLOAD_SANITIZER_REVISION_1 = "sanitize-payloads-1";
const PAYLOAD_SANITIZER_REVISION = "sanitize-payloads-2";
/** Revision 2 cut the pet slice (--head); revision 3 added --decision-slice and page-envelope-array input. */
const SLICER_REVISION = "sanitize-probe-2";
const SLICER_REVISION_3 = "sanitize-probe-3";

const payload_credential_scan = (revision = PAYLOAD_SANITIZER_REVISION) => ({
  kind: "CREDENTIAL_SHAPE_SCAN",
  tooling: tooling(PAYLOAD_SANITIZER, revision, "implicit on every write"),
  detail:
    "The sanitizer refuses to write output containing a credential-shaped value. Nothing was found and nothing was changed.",
  invalidates: [],
});

const CONTEXT_REDACTION =
  "rateLimitData removed; every masterData.actors[].name replaced by `Actor<id>`, every server set to null, and every PLAYER's gameID (a stable character identifier) set to null. Report-local actor ids, types, subTypes and petOwner links are untouched, as are NPC and pet gameIDs (creature taxonomy) and the fight, phase, ability and zone fields. Sanitized under sanitize-payloads-2, whose gameID rule is what distinguishes it from revision 1.";

// --------------------------------------------------------------------------
// M9-C correction: ONE high-performance Assassination subject, 4 requests.
// Selected without a request from the Sszorak heroic board page the M8-F
// shape probe had already captured (row 0, the board's top parse), and
// resolved to actor 25 by the M8-F candidate probe. R1 verified the bracket
// (100 % / 100 %, partition 1); R2 captured the fight context; R3–R4 the
// opener window in two pages, the second terminal.
// --------------------------------------------------------------------------

const HIGH_PERFORMANCE = {
  source:
    "reportData.report.rankings(fightIDs:[22]) — the report's own per-fight rankings, one request; the subject was selected as row 0 of the Sszorak heroic Assassination dps board page captured by scripts/probe/wcl-rankings-shape.probe.ts",
  partition: 1,
  metric: "dps",
  subjects: [
    {
      actorId: 25,
      className: "Rogue",
      specName: "Assassination",
      rankPercent: 100,
      bracketPercent: 100,
      bracket: 18,
      bracketData: 325,
      totalParses: 8606,
    },
    {
      actorId: 8,
      className: "Rogue",
      specName: "Assassination",
      rankPercent: 8,
      bracketPercent: 17,
      bracket: 10,
      bracketData: 299,
      totalParses: 8606,
    },
  ],
  fightOutcome: "KILL",
  fightDurationMs: 284791,
};

const M9C2_PROBE = (question, requests) =>
  tooling(
    ".probe/m9c2-capture.probe.ts (temporary, gitignored) driving src/wcl/token-provider.ts, graphql-client.ts and the production query documents",
    UNAVAILABLE,
    `${question}; bounded to ${requests} in advance, run once by hand on 2026-09-15 (4 requests in total for the whole capture, bound 8)`,
  );

const source_g = (captureTooling, rawCaptureLocation, q, comp, extra = {}) => ({
  reportCode: "gtKb2xHn87pNcFfW",
  fightId: 22,
  reportRevision: 22,
  sourceActorId: 25,
  encounterId: 3420,
  difficulty: 4,
  capturedOn: "2026-09-15",
  gameVersion: 1,
  logVersion: 17,
  ingestionScope: "PLAYER_CONTEXT",
  query: q,
  completeness: comp,
  captureTooling,
  rawCaptureRetained: false,
  rawCaptureLocation,
  performanceContext: HIGH_PERFORMANCE,
  ...extra,
});

const [HP_START, HP_END] = [2415041, 2435041];

const HIGH_CONTEXT_SOURCE = source_g(
  M9C2_PROBE(
    "R2 fight context: one FIGHT_CONTEXT_QUERY for fight 22 with talentImportCode for actor 25",
    "1 request",
  ),
  ".probe/m9c2-context.json — gitignored, not retained in the repository",
  { kind: "FIGHT_CONTEXT", fightIds: [22] },
  completeness(
    NOT_APPLICABLE,
    1,
    NOT_APPLICABLE,
    "COMPLETE",
    "A typed, unpaginated GraphQL field: the whole report context arrived in one response (293 actors, 2,039 abilities, 1 fight, 5 phase transitions, none an intermission).",
  ),
  { ingestionScope: "FULL_RAID" },
);

const HIGH_OPENER_SOURCE = source_g(
  M9C2_PROBE(
    "R3–R4 opener window: EVENTS_QUERY over [2,415,041 .. 2,435,041] (the pull's first 20 s) at limit 10,000 with resources",
    "5 pages",
  ),
  ".probe/m9c2-opener-pages.json — gitignored, not retained in the repository",
  query(true, 10000, HP_START, HP_END),
  completeness(
    18318,
    2,
    null,
    "COMPLETE",
    "Two pages (10,004 then 8,314 events), the second terminal (nextPageTimestamp null): the whole 20-second window was retrieved. The fight's first event, the subject's combatantinfo, is at 2,415,041 = the fight start, so coverage runs from the pull.",
  ),
);

const PAGES_SOURCE = source_a(
  M9C_PROBE(
    "Q1 page boundary: five consecutive EVENTS_QUERY pages over a 1,000 ms window at limit 40",
    "5 requests",
  ),
  ".probe/m9c-pages.json — gitignored, not retained in the repository",
  query(false, 40, 2176000, 2177000),
  completeness(
    226,
    5,
    2176472,
    "PARTIAL",
    "The capture plan stopped after five requests by design; page 5 returned nextPageTimestamp 2,176,472, so the window was NOT exhausted. Every cursor equals the next page's first timestamp and exceeds the previous page's last (measured, and pinned by PAGE_ENVELOPE_FACTS).",
  ),
  "2026-09-15",
);

const TERMINAL_PAGE_SOURCE = source_a(
  M9C_PROBE(
    "Q1b terminal page: one EVENTS_QUERY page over the one-millisecond window [2,176,580 .. 2,176,581] at limit 20",
    "1 request",
  ),
  ".probe/m9c-pages-terminal.json — gitignored, not retained in the repository",
  query(false, 20, 2176580, 2176581),
  completeness(
    14,
    1,
    null,
    "COMPLETE",
    "One page, nextPageTimestamp null: Warcraft Logs served the whole window in one response. The 14 events all carry timestamp 2,176,580 — the Garrote cast at Q and its consequences.",
  ),
  "2026-09-15",
);

const CONTEXT_SOURCE = source_a(
  M9C_PROBE(
    "Q2 pets and fight header: one FIGHT_CONTEXT_QUERY for fight 7 with full master data",
    "1 request",
  ),
  ".probe/m9c-context.json — gitignored, not retained in the repository",
  { kind: "FIGHT_CONTEXT", fightIds: [7] },
  completeness(
    NOT_APPLICABLE,
    1,
    NOT_APPLICABLE,
    "COMPLETE",
    "A typed, unpaginated GraphQL field: the whole report context arrived in one response (312 actors, 2,035 abilities, 1 fight, 9 phase transitions).",
  ),
  "2026-09-15",
  { ingestionScope: "FULL_RAID" },
);

const PET_EVENTS_SOURCE = source_a(
  M9C_PROBE(
    "Q4b pet-sourced events: one EVENTS_QUERY page filtered to sourceID 29 (a CAPTURE-ONLY filter) over the C3 window at limit 60",
    "2 requests (the second was not needed)",
  ),
  ".probe/m9c-pet-events-29.json — gitignored, not retained in the repository",
  { ...query(false, 60, 2164325, 2176581), actorFilter: { sourceId: 29 } },
  completeness(
    57,
    1,
    null,
    "COMPLETE",
    "One terminal page. COMPLETE for the FILTERED query only: Warcraft Logs' sourceID filter also returned events targeting the pet and its owner's resource events, so the 57 events are 'what the filter served', not 'every event of anyone'. The analyzer never issues a filtered query.",
  ),
  "2026-09-15",
);

const RANKINGS_SOURCE = {
  reportCode: NOT_APPLICABLE,
  fightId: NOT_APPLICABLE,
  reportRevision: NOT_APPLICABLE,
  sourceActorId: NOT_APPLICABLE,
  encounterId: 3420,
  difficulty: 4,
  capturedOn: "2026-09-15",
  gameVersion: NOT_APPLICABLE,
  logVersion: NOT_APPLICABLE,
  ingestionScope: "UNAVAILABLE",
  query: {
    kind: "ENCOUNTER_CHARACTER_RANKINGS",
    encounterId: 3420,
    difficulty: 4,
    className: "Rogue",
    specName: "Assassination",
    metric: "dps",
    partition: "OMITTED",
    page: 1,
  },
  completeness: completeness(
    100,
    1,
    NOT_APPLICABLE,
    "PARTIAL",
    "One page of a multi-page board (hasMorePages: true, count 100). The board is a Warcraft Logs ranking, not a population, and one page of it is all the analyzer ever requests.",
  ),
  captureTooling: tooling(
    "scripts/probe/wcl-rankings-shape.probe.ts (untracked M8-F schema probe) driving the production GraphQL client",
    UNAVAILABLE,
    'worldData.encounter(id:3420).characterRankings(difficulty:4, className:"Rogue", specName:"Assassination", metric:dps, page:1); one request on 2026-09-15',
  ),
  rawCaptureRetained: false,
  rawCaptureLocation:
    ".probe/m8-rankings-shape.json (key encounterCharacterRankings__data) — gitignored, not retained in the repository",
};

const MIDFIGHT_SOURCE = source_q(
  tooling(
    "live probe follow-up query q1 (hostilityType omitted) run under vitest.probe.config.ts; wrote .probe/followup-q1-omitted.json",
    UNAVAILABLE,
    UNAVAILABLE,
  ),
  ".probe/followup-q1-omitted.json — gitignored, not retained in the repository",
  query(false, 10000, 7550000, 7560000),
  completeness(
    5010,
    1,
    null,
    "COMPLETE",
    `${PROV_LEGACY}, table 'Reproducing the raw captures those indices refer to', column followup-q1-omitted.json: 5,010 events returned, nextPageTimestamp null (terminal page). The full-fight run the window belongs to was COMPLETE: 40 pages, 196,366 events, no failures.`,
  ),
);

const PULL_WINDOW_SOURCE = source_q(
  tooling(
    "scripts/probe/wcl-events.probe.ts (npm run probe); wrote .probe/events-page1-withresources.json",
    UNAVAILABLE,
    "npm.cmd run probe",
  ),
  ".probe/events-page1-withresources.json — gitignored, not retained in the repository",
  query(true, UNAVAILABLE, UNAVAILABLE, UNAVAILABLE),
  completeness(
    UNAVAILABLE,
    1,
    UNAVAILABLE,
    "PARTIAL",
    `${PROV_LEGACY}: the first page of the pull, from a full-fight run that was COMPLETE overall (40 pages, 196,366 events, no failures). The page's own event count and cursor were not recorded; only that it was page 1 of 40, so the capture is a prefix and not the window.`,
  ),
);

const RESOURCES_M4C1_SOURCE = source_a(
  tooling(
    "M4-C1 evidence-investigation probe run under vitest.probe.config.ts; wrote .probe/m4c1-rogue-resources.json",
    UNAVAILABLE,
    UNAVAILABLE,
  ),
  ".probe/m4c1-rogue-resources.json — gitignored, not retained in the repository",
  query(true, 10000, 2174394, 2194394),
  completeness(
    10003,
    1,
    2191432,
    "PARTIAL",
    `${PROV_LEGACY}, table 'Reproducing the raw captures those indices refer to', column m4c1-rogue-resources.json: 10,003 events returned, nextPageTimestamp 2,191,432. The page limit was hit, so the capture covers only the contiguous prefix [2,174,394, 2,191,432). The selected positions sit inside that prefix.`,
  ),
  "2026-09-12",
);

const ENVENOM_SOURCE = source_a(
  tooling(
    "M5-A/M5-B narrow-window probes (.probe/m5b-fixture.config.ts), several single-timestamp and narrow windows assembled into .probe/m5b-fixture-source.json",
    UNAVAILABLE,
    UNAVAILABLE,
  ),
  ".probe/m5b-fixture-source.json — gitignored, not retained in the repository",
  query(true, 10000, UNAVAILABLE, UNAVAILABLE),
  completeness(
    UNAVAILABLE,
    UNAVAILABLE,
    UNAVAILABLE,
    "UNAVAILABLE",
    `${PROV_LEGACY}, 'wcl-assassination-envenom-combo-points.json': assembled from several narrow live windows across a 424-second fight (M5-A) plus two single-timestamp windows (M5-B), each selected by fact. No single query window or page count describes the assembly; the M5-B windows each returned exactly one Envenom cast by actor 19.`,
  ),
  "2026-09-12",
);

const VANISH_SOURCE = source_a(
  tooling(
    ".probe/m5c2-fixture.probe.ts (two ranges) under vitest.probe.config.ts; wrote .probe/m5c2-fixture-source.json",
    UNAVAILABLE,
    UNAVAILABLE,
  ),
  ".probe/m5c2-fixture-source.json — gitignored, not retained in the repository",
  query(true, 10000, UNAVAILABLE, UNAVAILABLE),
  completeness(
    5,
    UNAVAILABLE,
    UNAVAILABLE,
    "UNAVAILABLE",
    `${PROV_LEGACY}, 'wcl-assassination-vanish-ambush-gate.json': two ranges, limit 10,000. The probe itself filtered to the five events of interest; the ranges' own event counts and cursors were not recorded.`,
  ),
  "2026-09-12",
);

const C3A_SOURCE = source_a(
  tooling(
    ".probe/m5c3a-order.probe.ts under vitest.probe.config.ts, filtering IN PLACE to preserve retrieval order; wrote .probe/m5c3a-ordered-source.json",
    UNAVAILABLE,
    UNAVAILABLE,
  ),
  ".probe/m5c3a-ordered-source.json — gitignored, not retained in the repository",
  query(true, 10000, 2164325, 2176581),
  completeness(
    UNAVAILABLE,
    UNAVAILABLE,
    UNAVAILABLE,
    "UNAVAILABLE",
    `${PROV_LEGACY}, 'wcl-assassination-garrote-dot-remains.json': paged ranges over [2,164,325 .. 2,176,581] plus the pull combatantinfo at 2,004,589 from a separate query. Page counts and cursors were not recorded; the probe measured 0 unidentified-ability aura events on target 21 before capture.`,
  ),
  "2026-09-13",
);

const C3C1_SOURCE = source_a(
  tooling(
    ".probe/c3c1-fixture.probe.ts under vitest.probe.config.ts, filtering IN PLACE; wrote .probe/m5c3c1-source.json",
    UNAVAILABLE,
    UNAVAILABLE,
  ),
  ".probe/m5c3c1-source.json — gitignored, not retained in the repository",
  query(true, 10000, 2164325, 2176581),
  completeness(
    UNAVAILABLE,
    UNAVAILABLE,
    UNAVAILABLE,
    "UNAVAILABLE",
    `${PROV_LEGACY}, 'wcl-assassination-kingsbane-cooldown.json': the C3a window with the cast predicate widened to every actor-19 cast. Page counts and cursors were not recorded.`,
  ),
  "2026-09-13",
);

const D2_SOURCE = source_a(
  tooling(
    "M5-D2 capture probe under vitest.probe.config.ts over [2,136,000 .. 2,195,000], filtering IN PLACE; the committed start was chosen by measured cut",
    UNAVAILABLE,
    UNAVAILABLE,
  ),
  ".probe/ (M5-D2 wider capture, 2,777 events) — gitignored, not retained in the repository",
  query(true, 10000, 2136000, 2195000),
  completeness(
    2777,
    UNAVAILABLE,
    UNAVAILABLE,
    "UNAVAILABLE",
    `${PROV_LEGACY}, 'wcl-assassination-d2-decision-corpus.json': a wider capture [2,136,000 .. 2,195,000] of 2,777 events was taken first and cut to the committed start by re-running all seven corpus decisions at four cut points. Page counts and cursors were not recorded.`,
  ),
  "2026-09-13",
);

// --------------------------------------------------------------------------
// M10-B bounded Protection Paladin capture (2026-09-16). Plan recorded in
// .probe/m10b-capture-plan.md BEFORE running: subject actor 7 of A7R6 fight 7
// (masterData subType Paladin, friendlySpecs index Protection — the identity
// wcl-fight-context-a7r6-fight-7 already proved), budget 12 requests, page cap
// 10. Actual: 6 requests — R1 FIGHT_CONTEXT_QUERY (revision 30, identity
// re-verified, master data and header byte-identical to the committed context
// apart from the per-actor talentImportCode), R2–R5 EVENTS_QUERY over the
// pull's first 45 s in four pages (10,007 + 10,000 + 10,009 + 572 = 30,588
// events, the fourth terminal), R6 REPORT_REVISION_QUERY (30, unchanged). No
// rankings, no leaderboard, no second report. Raw pages are gitignored.
// --------------------------------------------------------------------------

const SLICER_REVISION_4 = "sanitize-probe-4";
const SLICER_REVISION_5 = "sanitize-probe-5";
const GAP_TOOL = "scripts/corpus/derive-gap.mjs";
const GAP_TOOL_REVISION = "derive-gap-1";
const SUBSTITUTION_TOOL = "scripts/corpus/derive-substitution.mjs";
const SUBSTITUTION_TOOL_REVISION = "derive-substitution-1";
const [PP_START, PP_WINDOW_END, PP_SLICE_END] = [2004589, 2049589, 2026589];
/**
 * M10-C5 Phase A: the same capture's LAST retained event (2,049,581 = the
 * terminal page's final timestamp; pull-relative +44,992 ms) bounds the
 * rotational slice, and the M10-B opener's bound (2,026,589) is the PREDECLARED
 * gap boundary — fixed by M10-B before any Phase A evaluation, and not chosen
 * from any Phase A result.
 */
const PP45_END = 2049581;
const PP45_GAP_BOUNDARY = PP_SLICE_END;

const M10B_PROBE = (question, requests) =>
  tooling(
    ".probe/m10b-capture.probe.ts (temporary, gitignored) driving src/wcl/token-provider.ts, graphql-client.ts and the production query documents",
    UNAVAILABLE,
    `${question}; bounded to ${requests} in .probe/m10b-capture-plan.md before running, run once by hand on 2026-09-16 (6 requests in total for the whole capture, bound 12)`,
  );

const PROT_OPENER_SOURCE = source_a(
  M10B_PROBE(
    "R2–R5 opener window: EVENTS_QUERY over [2,004,589 .. 2,049,589] (the pull's first 45 s) at limit 10,000 with resources, no actor filter, hostilityType omitted",
    "10 pages",
  ),
  ".probe/m10b-pages.json — gitignored, not retained in the repository",
  query(true, 10000, PP_START, PP_WINDOW_END),
  completeness(
    30588,
    4,
    null,
    "COMPLETE",
    "Four pages (10,007 / 10,000 / 10,009 / 572 events; cursors 2,021,544, 2,034,579, 2,048,380, then null): the whole 45-second window was retrieved inside the 10-page cap. The fight's first event (the encounterstart at 2,004,589 = the fight start) is on page 1, so coverage runs from the pull. REPORT_REVISION_QUERY after the last page read 30, equal to the revision R1 read before the first, so no page straddles two exports (.probe/m10b-request-count.json).",
  ),
  "2026-09-16",
  { sourceActorId: 7, reportRevisionAfterCapture: 30 },
);

const ACTOR_SLICE_INVALIDATIONS = ["ABSENCE_PROOF", "CROSS_EVENT_CONTINUITY", "PAGINATION_BEHAVIOUR"];

// --------------------------------------------------------------------------
// M10-C5 Phase B1 (2026-09-18): ONE bounded steady-state capture of the SAME
// subject, adjoining the M10-B capture. 9 requests (R1 context, 7 event
// pages, R9 revision), revision 30 before and after, terminal.
// --------------------------------------------------------------------------

const SLICER_REVISION_6 = "sanitize-probe-6";
const [PPB_START, PPB_END] = [2049589, 2169589];
const M10C5B_PROBE = (question, requests) =>
  tooling(
    ".probe/m10c5-phase-b-capture.probe.ts (temporary, gitignored; the M10-B probe with the window offsets and output names changed) driving src/wcl/token-provider.ts, graphql-client.ts and the production query documents",
    UNAVAILABLE,
    `${question}; bounded to ${requests} in .probe/m10c5-phase-b-capture-plan.md before running, run once by hand on 2026-09-18 (9 requests in total for the whole capture, bound 12)`,
  );
const PROT_STEADY_SOURCE = source_a(
  M10C5B_PROBE(
    "R2–R8 steady-state window: EVENTS_QUERY over [2,049,589 .. 2,169,589] (the pull's +45 s .. +165 s) at limit 10,000 with resources, no actor filter, hostilityType omitted",
    "10 pages",
  ),
  ".probe/m10c5-phase-b-pages.json — gitignored, not retained in the repository",
  query(true, 10000, PPB_START, PPB_END),
  completeness(
    68870,
    7,
    null,
    "COMPLETE",
    "Seven pages (10,001 / 10,001 / 10,002 / 10,011 / 10,018 / 10,001 / 8,836 events; cursors 2,070,879, 2,085,324, 2,099,918, 2,116,424, 2,134,911, 2,149,639, then null): the whole 120-second window was retrieved inside the 10-page cap. The first event is at 2,049,590 and the last at 2,169,588. REPORT_REVISION_QUERY after the last page read 30, equal to the revision R1 read before the first (.probe/m10c5-phase-b-request-count.json). Together with the M10-B capture's terminal page (last event 2,049,581 under an exclusive end of 2,049,589) this proves no event of the fight lies in [2,049,582 .. 2,049,589].",
  ),
  "2026-09-18",
  { sourceActorId: 7, reportRevisionAfterCapture: 30 },
);
const PPB_FAMILIES =
  "cast,resourcechange,applybuff,refreshbuff,removebuff,applybuffstack,removebuffstack,applydebuff,refreshdebuff,removedebuff,applydebuffstack,removedebuffstack,combatantinfo";
const PPB_CATEGORIES = ["CASTS", "RESOURCES", "AURAS", "COMBATANT_INFO", "GEAR"];
const PPB_SEGMENT_BASIS = (fromMs, toMs) =>
  `The retained families are complete for actor 7 over [${fromMs.toLocaleString("en-US")} .. ${toMs.toLocaleString("en-US")}] by the predicate 'every event actor 7 sources or is targeted by, of a retained family, with timestamp in that range' over a window the capture retrieved COMPLETE (seven pages, terminal, revision 30 before and after). CASTS and RESOURCES are complete as the source of its own casts and the actor its snapshots describe; AURAS as their target; COMBATANT_INFO and GEAR as the subject of the combatantinfo the bundle's first part holds. DAMAGE, HEALING, ABSORBS and SUMMONS are NOT granted. The segment is one part of a bundle: it grants nothing before its own first millisecond, and the bundle composer joins it to its neighbour only where the grants are adjacent.`;
/**
 * One chronological segment of the Phase B capture: (fromMs, toMs] by
 * --from/--actor-slice. Its grant begins at fromMs + 1, or at the capture's
 * own window start when that is later: a segment can never vouch for a
 * millisecond its capture did not request, so the first segment's grant
 * begins at 2,049,589 and the interval before it is CERTIFIED rather than
 * granted.
 */
function ppb_segment(name, fromMs, toMs, facts, extra = {}) {
  const file = `wcl-protection-paladin-a7r6-rotational-165s.seg-${name}`;
  const grantFrom = Math.max(fromMs + 1, PPB_START);
  return artifact(file, wcl(file), {
    kind: "SANITIZED_CAPTURE",
    source: PROT_STEADY_SOURCE,
    transformations: [
      selection(
        `node scripts/sanitize-probe.mjs .probe/m10c5-phase-b-pages.json ${file}.json --actor-slice 7 ${String(toMs)} --from ${String(fromMs)} --families ${PPB_FAMILIES}`,
        `The seven page envelopes concatenated in page order, then the --actor-slice predicate with --from ${String(fromMs)} (exclusive) and the bound ${String(toMs)} (inclusive), restricted by --families to the same thirteen raw types as the Phase A slice. In place and order preserved. ${facts}`,
        ACTOR_SLICE_INVALIDATIONS,
      ).with_revision(SLICER_REVISION_6),
      credential_scan(SLICER_REVISION_6),
    ],
    grants: [
      {
        categories: PPB_CATEGORIES,
        actorScope: [7],
        ranges: [{ fromReportTimeMs: grantFrom, toReportTimeMs: toMs }],
      },
    ],
    coverageBasis: PPB_SEGMENT_BASIS(grantFrom, toMs),
    retainedFor:
      "M10-C5 Phase B: one chronological segment of the same subject's steady state, committed under the 512 KiB limit and composed with its neighbours by the bundle composer (tests/support/corpus/fight.ts bundleOverEvidence). History for every evaluated decision begins at the pull through the Phase A slice; evaluation is fixed to [+120,000 .. +165,000] ms.",
    limitations: [
      "One segment of a longer window: on its own it grants no coverage before its first millisecond and proves nothing about continuity across its boundaries; only a composed bundle does.",
      "No damage, healing, absorb or summon event is retained.",
      "Cooldown state at the pull is outside the log; what a later decision knows comes from observed casts in the bundle's history.",
      NO_NAMES,
      VERSION_SCOPE,
      WHITESPACE,
    ],
    ...extra,
  });
}

// --------------------------------------------------------------------------
// M11-A4 (2026-09-18): the Retribution Paladin subjects, cut from captures
// the corpus already holds. No new request. Actor 6 of A7R6 fight 7 is the
// second Paladin in the M10-B / M10-C5 Phase B unfiltered streams; actor 23
// of gtKb fight 22 is the Retribution Paladin in the M9-C2 opener stream.
// --------------------------------------------------------------------------

const RET = 6;
const RET_GTKB_ACTOR = 23;
const RET45 = "wcl-retribution-paladin-a7r6-rotational-45s";
const RET_45_105 = "wcl-retribution-paladin-a7r6-rotational-165s.seg-45-105";
const RET_105_165 = "wcl-retribution-paladin-a7r6-rotational-165s.seg-105-165";
const RET_GTKB = "wcl-retribution-paladin-gtkb-opener";
const RET_SEGMENT_BASIS = (fromMs, toMs) =>
  `The retained families are complete for actor 6 over [${fromMs.toLocaleString("en-US")} .. ${toMs.toLocaleString("en-US")}] by the predicate 'every event actor 6 sources or is targeted by, of a retained family, with timestamp in that range' over a window the capture retrieved COMPLETE with NO actor filter (seven pages, terminal, revision 30 before and after). CASTS and RESOURCES are complete as the source of its own casts and the actor its snapshots describe; AURAS as their target; COMBATANT_INFO and GEAR as the subject of the combatantinfo the bundle's first part holds. DAMAGE, HEALING, ABSORBS and SUMMONS are NOT granted. The segment is one part of a bundle: it grants nothing before its own first millisecond, and the bundle composer joins it to its neighbour only where the grants are adjacent.`;

/** One chronological segment of the Phase B capture for ACTOR 6: (fromMs, toMs]. Same rule as `ppb_segment`. */
function ret_segment(name, fromMs, toMs, facts, extra = {}) {
  const file = `wcl-retribution-paladin-a7r6-rotational-165s.seg-${name}`;
  const grantFrom = Math.max(fromMs + 1, PPB_START);
  return artifact(file, wcl(file), {
    kind: "SANITIZED_CAPTURE",
    source: PROT_STEADY_SOURCE,
    transformations: [
      selection(
        `node scripts/sanitize-probe.mjs .probe/m10c5-phase-b-pages.json ${file}.json --actor-slice 6 ${String(toMs)} --from ${String(fromMs)} --families ${PPB_FAMILIES}`,
        `The seven page envelopes concatenated in page order, then the --actor-slice predicate for ACTOR 6 with --from ${String(fromMs)} (exclusive) and the bound ${String(toMs)} (inclusive), restricted by --families to the same thirteen raw types. In place and order preserved. ${facts}`,
        ACTOR_SLICE_INVALIDATIONS,
      ).with_revision(SLICER_REVISION_6),
      credential_scan(SLICER_REVISION_6),
    ],
    grants: [
      {
        categories: PPB_CATEGORIES,
        actorScope: [RET],
        ranges: [{ fromReportTimeMs: grantFrom, toReportTimeMs: toMs }],
      },
    ],
    coverageBasis: RET_SEGMENT_BASIS(grantFrom, toMs),
    retainedFor:
      "M11-A4: one chronological segment of the Retribution subject's steady state, committed under the 512 KiB limit and composed with its neighbours by the bundle composer. History for every evaluated decision begins at the pull through the 45 s slice; the whole 165 s bundle is the evaluation window.",
    limitations: [
      "One segment of a longer window: on its own it grants no coverage before its first millisecond and proves nothing about continuity across its boundaries; only a composed bundle does.",
      "No damage, healing, absorb or summon event is retained.",
      "Cooldown state at the pull is outside the log; what a later decision knows comes from observed casts in the bundle's history.",
      NO_NAMES,
      VERSION_SCOPE,
      WHITESPACE,
    ],
    ...extra,
  });
}

// --------------------------------------------------------------------------
// M11-B2 (2026-09-18): the Blood Death Knight subject (ACTOR 14 on both
// reports) cut from the SAME three captures by the SAME predicate as the
// Retribution subject. No new capture was made; no WCL request was issued.
// --------------------------------------------------------------------------

const BLOOD = 14;
const BLOOD_GTKB_ACTOR = 14;
const BLOOD45 = "wcl-blood-death-knight-a7r6-rotational-45s";
const BLOOD_45_105 = "wcl-blood-death-knight-a7r6-rotational-165s.seg-45-105";
const BLOOD_105_165 = "wcl-blood-death-knight-a7r6-rotational-165s.seg-105-165";
const BLOOD_GTKB = "wcl-blood-death-knight-gtkb-opener";

// --------------------------------------------------------------------------
// M11-C2 (2026-09-24): the Brewmaster Monk subject (ACTOR 4 of gtKb fight 22),
// cut from the SAME M9-C2 opener capture by the SAME predicate as the
// Retribution and Blood gtKb subjects. No new capture was made; no WCL
// request was issued.
// --------------------------------------------------------------------------

const BREWMASTER_GTKB_ACTOR = 4;
const BREWMASTER_GTKB = "wcl-brewmaster-monk-gtkb-opener";

// --------------------------------------------------------------------------
// M11-C4 (2026-09-25): ONE bounded extension capture of the SAME report and
// fight, adjoining the M9-C2 opener capture: [+20 s .. +165 s] of gtKb fight
// 22, no actor filter. 14 requests (R1 context for actor 4, 12 event pages,
// R14 revision), revision 22 before and after — the revision the M9-C2
// capture recorded — terminal. The opener capture is reused, never
// re-requested.
// --------------------------------------------------------------------------

const [GTKB_EXT_START, GTKB_EXT_END] = [2435041, 2580041];
const BREWMASTER_GTKB_20_165 = "wcl-brewmaster-monk-gtkb-rotational-165s.seg-20-165";
const M11C4_PROBE = (question, requests) =>
  tooling(
    ".probe/m11c4-capture.probe.ts (temporary, gitignored; the M10-C5 Phase B probe with the report, fight, actor, window offsets, page cap and output names changed) driving src/wcl/token-provider.ts, graphql-client.ts and the production query documents",
    UNAVAILABLE,
    `${question}; bounded to ${requests} in .probe/m11c4-capture-plan.md before running, run once by hand on 2026-09-25 (14 requests in total for the whole capture, bound 22)`,
  );
const GTKB_EXT_SOURCE = source_g(
  M11C4_PROBE(
    "R2–R13 extension window: EVENTS_QUERY over [2,435,041 .. 2,580,041] (the pull's +20 s .. +165 s) at limit 10,000 with resources, no actor filter, hostilityType omitted",
    "20 pages",
  ),
  ".probe/m11c4-pages.json — gitignored, not retained in the repository",
  query(true, 10000, GTKB_EXT_START, GTKB_EXT_END),
  completeness(
    118289,
    12,
    null,
    "COMPLETE",
    "Twelve pages (10,004 / 10,005 / 10,000 / 10,002 / 10,004 / 10,005 / 10,001 / 10,006 / 10,005 / 10,015 / 10,001 / 8,241 events; cursors 2,443,209, 2,452,384, 2,463,779, 2,476,260, 2,488,649, 2,500,416, 2,514,169, 2,528,777, 2,542,603, 2,554,704, 2,568,323, then null): the whole 145-second window was retrieved inside the 20-page cap. The first event is at 2,435,041 and the last at 2,580,038. R1 (FIGHT_CONTEXT_QUERY, actor 4) read revision 22 and REPORT_REVISION_QUERY after the last page read 22 — the revision the M9-C2 opener capture recorded (.probe/m11c4-request-count.json). The seven events at 2,435,041 are returned by BOTH captures, byte-identical and in the same order, and none of them is sourced by or targets actor 4.",
  ),
  {
    sourceActorId: BREWMASTER_GTKB_ACTOR,
    capturedOn: "2026-09-25",
    reportRevisionAfterCapture: 22,
    performanceContext: undefined,
  },
);
// --------------------------------------------------------------------------
// M11-C4b (2026-09-25): ONE bounded full-fight extension capture of the SAME
// report and fight, adjoining the M11-C4 capture: [+165 s .. fight end] of
// gtKb fight 22, no actor filter. 12 requests (R1 context for actor 4, 10
// event pages, R12 revision), revision 22 before and after, terminal. The two
// earlier captures are reused, never re-requested.
// --------------------------------------------------------------------------

const [GTKB_FULL_START, GTKB_FULL_END] = [2580041, 2699832];
const BREWMASTER_GTKB_165_285 = "wcl-brewmaster-monk-gtkb-full-fight.seg-165-285";
const M11C4B_PROBE = (question, requests) =>
  tooling(
    ".probe/m11c4b-capture.probe.ts (temporary, gitignored; the M11-C4 probe with the window start offset, the window end (the fight end) and output names changed) driving src/wcl/token-provider.ts, graphql-client.ts and the production query documents",
    UNAVAILABLE,
    `${question}; bounded to ${requests} in .probe/m11c4b-capture-plan.md before running, run once by hand on 2026-09-25 (12 requests in total for the whole capture, bound 22)`,
  );
const GTKB_FULL_SOURCE = source_g(
  M11C4B_PROBE(
    "R2–R11 full-fight extension window: EVENTS_QUERY over [2,580,041 .. 2,699,832] (the pull's +165 s .. the fight end) at limit 10,000 with resources, no actor filter, hostilityType omitted",
    "20 pages",
  ),
  ".probe/m11c4b-pages.json — gitignored, not retained in the repository",
  query(true, 10000, GTKB_FULL_START, GTKB_FULL_END),
  completeness(
    91236,
    10,
    null,
    "COMPLETE",
    "Ten pages (10,006 / 10,006 / 10,000 / 10,005 / 10,002 / 10,004 / 10,003 / 10,004 / 10,000 / 1,206 events; cursors 2,593,693, 2,607,411, 2,621,052, 2,633,173, 2,645,188, 2,659,438, 2,673,359, 2,685,139, 2,698,114, then null): the whole window through the fight end was retrieved inside the 20-page cap. The first event is at 2,580,050 and the last at 2,699,832, the fight end. R1 (FIGHT_CONTEXT_QUERY, actor 4) read revision 22 and fight bounds [2,415,041 .. 2,699,832]; REPORT_REVISION_QUERY after the last page read 22 — the revision of the M9-C2 and M11-C4 captures (.probe/m11c4b-request-count.json). No event lies at 2,580,041 in this capture, and the M11-C4 capture's last event is 2,580,038, so neither capture holds an event in [2,580,039 .. 2,580,049].",
  ),
  {
    sourceActorId: BREWMASTER_GTKB_ACTOR,
    capturedOn: "2026-09-25",
    reportRevisionAfterCapture: 22,
    performanceContext: undefined,
  },
);
// --------------------------------------------------------------------------
// M11-C4f (2026-09-26): the NEUTRAL SECOND Brewmaster subject. Selected by the
// fixed rule of M11-C4c/C4d — the M8 Sszorak heroic ranking page (canonical
// digest 6b5fd2af…9a50c) minus the gtKb subject, ordered by fight start time,
// walked to the first fight with a Shado-Pan Brewmaster (its own
// combatantinfo) — before any analyzer ran. Candidate 5 of 99: report
// rXAfw9t1q8YpmkKD fight 13, actor 11. ONE capture of the fixed window
// [fight start .. +165 s], no actor filter: 17 pages, terminal, revision 27
// before and after. The walk itself is recorded in
// tests/evidence/selection-frames/brewmaster-second-subject.json.
// --------------------------------------------------------------------------

const RXAF_ACTOR = 11;
const [RXAF_START, RXAF_OPENER_END, RXAF_END] = [2440995, 2460995, 2605995];
const BREWMASTER_RXAF_OPENER = "wcl-brewmaster-monk-rxaf-opener";
const BREWMASTER_RXAF_20_165 = "wcl-brewmaster-monk-rxaf-rotational-165s.seg-20-165";
const RXAF_CONTEXT = "wcl-fight-context-rxaf-fight-13";
const M11C4F_PROBE = (question, requests) =>
  tooling(
    ".probe/m11c4f/candidate-walk.probe.ts (temporary, gitignored; gated on C4e CI GREEN) driving src/wcl/token-provider.ts, graphql-client.ts and the production query documents",
    UNAVAILABLE,
    `${question}; bounded to ${requests} in .probe/m11c4f/capture-plan.md before running, run once by hand on 2026-09-26 (23 requests in total for the walk and the capture, bound 50)`,
  );
const rxaf_source = (captureTooling, rawCaptureLocation, q, comp, extra = {}) => ({
  reportCode: "rXAfw9t1q8YpmkKD",
  fightId: 13,
  reportRevision: 27,
  sourceActorId: RXAF_ACTOR,
  encounterId: 3420,
  difficulty: 4,
  capturedOn: "2026-09-26",
  gameVersion: 1,
  logVersion: 17,
  ingestionScope: "PLAYER_CONTEXT",
  query: q,
  completeness: comp,
  captureTooling,
  rawCaptureRetained: false,
  rawCaptureLocation,
  reportRevisionAfterCapture: 27,
  ...extra,
});
const RXAF_CONTEXT_SOURCE = rxaf_source(
  M11C4F_PROBE(
    "W1 (candidate 5 of the fixed order) fight context: one FIGHT_CONTEXT_QUERY for fight 13 (its actorID argument 1 selects only whose talentImportCode is returned)",
    "20 context requests",
  ),
  ".probe/m11c4f/context-5.json — gitignored, not retained in the repository",
  { kind: "FIGHT_CONTEXT", fightIds: [13] },
  completeness(
    NOT_APPLICABLE,
    1,
    NOT_APPLICABLE,
    "COMPLETE",
    "A typed, unpaginated GraphQL field: the whole report context arrived in one response. It is the walk's eligibility evidence for this candidate: fight 13 present, encounter 3420, difficulty 4, gameVersion 1, logVersion 17, 271,769 ms, one Monk/Brewmaster (actor 11).",
  ),
  { ingestionScope: "FULL_RAID" },
);
const RXAF_EVENTS_SOURCE = rxaf_source(
  M11C4F_PROBE(
    "W2 + A1 fixed evidence window: EVENTS_QUERY over [2,440,995 .. 2,605,995] (fight start .. +165 s) at limit 10,000 with resources, no actor filter, hostilityType omitted — page 1 established actor 11's hero tree, pages 2–17 continued the same window",
    "25 pages",
  ),
  ".probe/m11c4f/pages.json — gitignored, not retained in the repository",
  query(true, 10000, RXAF_START, RXAF_END),
  completeness(
    165448,
    17,
    null,
    "COMPLETE",
    "Seventeen pages (sixteen of 10,000–10,019 events and a terminal 5,330), the last with nextPageTimestamp null: the whole fixed window was retrieved inside the 25-page cap. The first event is at 2,440,995 = the fight start (16 events, 23 combatantinfo in the window) and the last at 2,605,988. The fight-context request read revision 27 before page 1 and REPORT_REVISION_QUERY after the last page read 27 (.probe/m11c4f/request-count.json).",
  ),
);
const RXAF_SEGMENT_BASIS =
  "The retained families are complete for actor 11 over [2,460,996 .. 2,605,995] by the predicate 'every event actor 11 sources or is targeted by, of a retained family, with timestamp in that range' over a window the capture retrieved COMPLETE with NO actor filter (seventeen pages, terminal, revision 27 before and after). CASTS and RESOURCES are complete as the source of its own casts and the actor its snapshots describe; AURAS as their target; COMBATANT_INFO and GEAR as the subject of the combatantinfo the bundle's first part holds. DAMAGE, HEALING, ABSORBS and SUMMONS are NOT granted. The segment is one part of a bundle: it grants nothing before its own first millisecond, and the bundle composer joins it to the opener slice only because the grants are adjacent (the opener's ends at 2,460,995, this one begins at 2,460,996).";
const BLOOD_SEGMENT_BASIS = (fromMs, toMs) =>
  `The retained families are complete for actor 14 over [${fromMs.toLocaleString("en-US")} .. ${toMs.toLocaleString("en-US")}] by the predicate 'every event actor 14 sources or is targeted by, of a retained family, with timestamp in that range' over a window the capture retrieved COMPLETE with NO actor filter (seven pages, terminal, revision 30 before and after). CASTS and RESOURCES are complete as the source of its own casts and the actor its snapshots describe; AURAS as their target; COMBATANT_INFO and GEAR as the subject of the combatantinfo the bundle's first part holds. DAMAGE, HEALING, ABSORBS and SUMMONS are NOT granted. The segment is one part of a bundle: it grants nothing before its own first millisecond, and the bundle composer joins it to its neighbour only where the grants are adjacent.`;

/** One chronological segment of the Phase B capture for ACTOR 14: (fromMs, toMs]. Same rule as `ppb_segment`. */
function blood_segment(name, fromMs, toMs, facts, extra = {}) {
  const file = `wcl-blood-death-knight-a7r6-rotational-165s.seg-${name}`;
  const grantFrom = Math.max(fromMs + 1, PPB_START);
  return artifact(file, wcl(file), {
    kind: "SANITIZED_CAPTURE",
    source: PROT_STEADY_SOURCE,
    transformations: [
      selection(
        `node scripts/sanitize-probe.mjs .probe/m10c5-phase-b-pages.json ${file}.json --actor-slice 14 ${String(toMs)} --from ${String(fromMs)} --families ${PPB_FAMILIES}`,
        `The seven page envelopes concatenated in page order, then the --actor-slice predicate for ACTOR 14 with --from ${String(fromMs)} (exclusive) and the bound ${String(toMs)} (inclusive), restricted by --families to the same thirteen raw types. In place and order preserved. ${facts}`,
        ACTOR_SLICE_INVALIDATIONS,
      ).with_revision(SLICER_REVISION_6),
      credential_scan(SLICER_REVISION_6),
    ],
    grants: [
      {
        categories: PPB_CATEGORIES,
        actorScope: [BLOOD],
        ranges: [{ fromReportTimeMs: grantFrom, toReportTimeMs: toMs }],
      },
    ],
    coverageBasis: BLOOD_SEGMENT_BASIS(grantFrom, toMs),
    retainedFor:
      "M11-B2: one chronological segment of the Blood Death Knight subject's steady state, committed under the 512 KiB limit and composed with its neighbours by the bundle composer. History for every evaluated decision begins at the pull through the 45 s slice; the whole 165 s bundle is the evaluation window.",
    limitations: [
      "One segment of a longer window: on its own it grants no coverage before its first millisecond and proves nothing about continuity across its boundaries; only a composed bundle does.",
      "No damage, healing, absorb or summon event is retained.",
      "Cooldown state at the pull is outside the log; what a later decision knows comes from observed casts in the bundle's history.",
      NO_NAMES,
      VERSION_SCOPE,
      WHITESPACE,
    ],
    ...extra,
  });
}

// --------------------------------------------------------------------------
// Artifacts
// --------------------------------------------------------------------------

const [D2_START, D2_END] = [2164325, 2194928];
const [C3_START, C3_END] = [2164325, 2176581];

const plain = (transformation) => {
  const { with_revision: _drop, ...record } = transformation;
  return record;
};

function artifact(artifactId, path, options) {
  // `root: "EVIDENCE"` measures the bytes under the evidence archive root;
  // everything else is a regression-corpus artifact, as before.
  const { sha256, byteLength } = digest(join(options.root === "EVIDENCE" ? EVIDENCE : CORPUS, path));
  return {
    artifactId,
    path,
    encoding: options.encoding ?? "JSON",
    payloadKind: options.payloadKind ?? "WCL_EVENT_ARRAY",
    sha256,
    byteLength,
    provenance: {
      kind: options.kind,
      parentArtifactId: options.parent ?? null,
      source: options.source ?? null,
      transformations: (options.transformations ?? []).map(plain),
      retainedCoverage: {
        grants: options.grants ?? [],
        basis: options.coverageBasis,
        ...(options.certifiedEmpty === undefined ? {} : { certifiedEmpty: options.certifiedEmpty }),
      },
      retainedFor: options.retainedFor,
      limitations: options.limitations,
    },
  };
}

const wcl = (name) => `artifacts/wcl-events/${name}.json`;

const graphql = (name) => `artifacts/wcl-graphql/${name}.json`;

const synthetic = (name) => `artifacts/synthetic/${name}.json`;

const NO_COVERAGE_SLICE =
  "A property-based selection retains no contiguous range for any category or actor; nothing between or around the retained events is present.";
const WHITESPACE = "Prettier-formatted whitespace; the parsed payload is what the capture returned.";
const VERSION_SCOPE = "gameVersion 1 / logVersion 17 only.";
const NO_NAMES = "No actor or player names are present; identities are numeric ids only.";

const ARTIFACTS = [
  artifact("wcl-pull-window-with-resources", wcl("wcl-pull-window-with-resources"), {
    kind: "SANITIZED_CAPTURE",
    source: PULL_WINDOW_SOURCE,
    transformations: [
      selection(
        "node scripts/sanitize-probe.mjs .probe/events-page1-withresources.json wcl-pull-window-with-resources.json --per-type 3",
        "Kept up to 3 events of EACH distinct raw type, in captured order, from the first page of the pull. 43 events across 16 families.",
        ALL_SLICE_INVALIDATIONS,
      ),
      credential_scan(),
      legacy_copy("wcl-pull-window-with-resources.json", "wcl-pull-window-with-resources.json"),
    ],
    coverageBasis: NO_COVERAGE_SLICE,
    retainedFor:
      "Type strings and field shapes for 16 raw families; the ONLY committed evidence for the flattened `resourceActor` attachment shape and for `combatantinfo` gear and talents. Cited by src/engine/normalization/supported-families.ts and src/wcl/evidence-capability.ts as fixtureId `wcl-pull-window-with-resources`.",
    limitations: [
      WHITESPACE,
      VERSION_SCOPE,
      NO_NAMES,
      "The single name string is the public encounter name on `encounterstart`.",
      "Cannot prove any absence, continuity or pagination behaviour.",
    ],
  }),
  artifact("wcl-midfight-window", wcl("wcl-midfight-window"), {
    kind: "SANITIZED_CAPTURE",
    source: MIDFIGHT_SOURCE,
    transformations: [
      selection(
        "node scripts/sanitize-probe.mjs .probe/followup-q1-omitted.json wcl-midfight-window.json --per-type 3",
        "Kept up to 3 events of EACH distinct raw type, in captured order, from the 5,010-event window. 59 events.",
        ALL_SLICE_INVALIDATIONS,
      ),
      credential_scan(),
      legacy_copy("wcl-midfight-window.json", "wcl-midfight-window.json"),
    ],
    coverageBasis: NO_COVERAGE_SLICE,
    retainedFor:
      "Six families absent from the pull window (absorbed, healabsorbed, removedebuff, applydebuffstack, removedebuffstack, empowerstart/empowerend), 117 targetID -1 and 92 sourceID -1 sentinels in the source window, and stack-bearing transitions. Cited by src as fixtureId `wcl-midfight-window`.",
    limitations: [
      WHITESPACE,
      VERSION_SCOPE,
      NO_NAMES,
      "Cannot prove any absence, continuity or pagination behaviour.",
    ],
  }),
  artifact("wcl-boss-sourced", wcl("wcl-boss-sourced"), {
    kind: "SANITIZED_CAPTURE",
    source: MIDFIGHT_SOURCE,
    transformations: [
      selection(
        "node scripts/sanitize-probe.mjs .probe/followup-q1-omitted.json wcl-boss-sourced.json --where sourceID=160 4",
        "Kept the first 4 events whose sourceID is 160 (the boss), in captured order.",
        ALL_SLICE_INVALIDATIONS,
      ),
      credential_scan(),
      legacy_copy("wcl-boss-sourced.json", "wcl-boss-sourced.json"),
    ],
    coverageBasis: NO_COVERAGE_SLICE,
    retainedFor:
      "Evidence that the unfiltered `All` stream carries enemy-sourced events: actor 160 is the boss. The source window held 202 boss-sourced events alongside 4,339 others.",
    limitations: [
      WHITESPACE,
      VERSION_SCOPE,
      NO_NAMES,
      "Actor 160's identity as the boss comes from master data recorded in the legacy provenance, not from these events.",
    ],
  }),
  artifact("wcl-no-actor-sentinel-source", wcl("wcl-no-actor-sentinel-source"), {
    kind: "SANITIZED_CAPTURE",
    source: MIDFIGHT_SOURCE,
    transformations: [
      selection(
        "node scripts/sanitize-probe.mjs .probe/followup-q1-omitted.json wcl-no-actor-sentinel-source.json --where sourceID=-1 4",
        "Kept the first 4 events whose sourceID is -1, in captured order. The four retained events share timestamp 7,551,049 and ability 1285965; they differ only by target.",
        ALL_SLICE_INVALIDATIONS,
      ),
      credential_scan(),
      legacy_copy("wcl-no-actor-sentinel-source.json", "wcl-no-actor-sentinel-source.json"),
    ],
    coverageBasis: NO_COVERAGE_SLICE,
    retainedFor:
      "Evidence that -1 is the no-actor sentinel on sourceID, not only on targetID, on real enemy-environment damage.",
    limitations: [
      WHITESPACE,
      VERSION_SCOPE,
      NO_NAMES,
      "Cannot prove any absence, continuity or pagination behaviour.",
    ],
  }),
  artifact(
    "wcl-no-actor-sentinel-source.unusable-negative",
    wcl("wcl-no-actor-sentinel-source.unusable-negative"),
    {
      kind: "DERIVED_FROM_CAPTURE",
      parent: "wcl-no-actor-sentinel-source",
      transformations: [
        {
          kind: "VALUE_MUTATION",
          tooling: tooling(
            "M9-A seed (scripted single-token replacement)",
            NOT_APPLICABLE,
            "replace the first occurrence of '\"sourceID\": -1,' with '\"sourceID\": -5,'",
          ),
          detail:
            "Raw index 0: sourceID changed from -1 to -5. Every other byte is identical to the parent; the byte length is unchanged. The value -5 has never been observed in any capture.",
          invalidates: [
            "OBSERVED_BEHAVIOUR",
            "WINDOW_COVERAGE",
            "ABSENCE_PROOF",
            "CROSS_EVENT_CONTINUITY",
            "PAGINATION_BEHAVIOUR",
          ],
        },
      ],
      coverageBasis: "Inherits none from the parent, and a derivation never gains coverage.",
      retainedFor:
        "Constructs the condition the UNUSABLE_VALUE rule exists for — a negative source id that is not the verified sentinel — on otherwise real event shapes, without claiming Warcraft Logs ever emitted it.",
      limitations: [
        "Not evidence that Warcraft Logs emits any negative id other than -1.",
        "Not evidence of anything about actor -5; the id was chosen to match nothing.",
      ],
    },
  ),
  artifact("wcl-aura-stack-absolute", wcl("wcl-aura-stack-absolute"), {
    kind: "SANITIZED_CAPTURE",
    source: MIDFIGHT_SOURCE,
    transformations: [
      selection(
        "node scripts/sanitize-probe.mjs .probe/followup-q1-omitted.json wcl-aura-stack-absolute.json --indices 1801,1827,1836,2372,2373,2378,2913,2914,3162,3385,3386,3770,3771,3867,3876",
        "Kept exactly fifteen capture positions, in the order listed: two COMPLETE aura chains — every event Warcraft Logs returned inside the window for (ability 1297033, actor 9 on itself) and for (ability 1263382, actor 7 on itself). Every other event in the window was dropped, including every OTHER aura on actors 7 and 9.",
        ALL_SLICE_INVALIDATIONS,
      ),
      credential_scan(),
      legacy_copy("wcl-aura-stack-absolute.json", "wcl-aura-stack-absolute.json"),
    ],
    coverageBasis:
      "The two chains are complete for their own (ability, source, target) identities, but other auras on the same targets were dropped, so no category-level coverage survives for actors 7 or 9. Chain completeness is evidence for the stack-value contract; it is not coverage.",
    retainedFor:
      "Establishes that on a stack-change aura event `stack` is the ABSOLUTE RESULTING count after that event (ESTABLISHED_ABSOLUTE_RESULTING), and that a stack removal reporting a positive count is a known-ACTIVE anchor.",
    limitations: [
      WHITESPACE,
      VERSION_SCOPE,
      "A resulting count of ZERO appears in no capture and is deliberately not read as INACTIVE.",
      "Presence carried forward from an anchor needs coverage this slice does not retain; only presence AT an observed transition is provable here.",
    ],
  }),
  artifact("wcl-cast-resource-pre-cost", wcl("wcl-cast-resource-pre-cost"), {
    kind: "SANITIZED_CAPTURE",
    source: RESOURCES_M4C1_SOURCE,
    transformations: [
      selection(
        "node scripts/sanitize-probe.mjs .probe/m4c1-rogue-resources.json wcl-cast-resource-pre-cost.json --indices 464,700,704,4713,4715",
        "Kept exactly five capture positions, in the order listed: a Warlock cast (actor 12), a Rogue resourcechange, the Rogue's costed finisher, a costed Garrote, and an uncosted melee. Positions are meaningful only against report revision 30.",
        ALL_SLICE_INVALIDATIONS,
      ),
      credential_scan(),
      legacy_copy("wcl-cast-resource-pre-cost.json", "wcl-cast-resource-pre-cost.json"),
    ],
    coverageBasis:
      "An --indices selection retains five non-adjacent capture positions; no contiguous range survives.",
    retainedFor:
      "The evidence contract that a costed COMPLETE cast's attached classResources[].amount is the amount BEFORE the cost: it carries amount == max == cost == 7, which is impossible under a post-cost reading.",
    limitations: [
      "Settles one instant per event. amount - cost is arithmetic across an instant nothing observed and is not established.",
      "The melee and the Garrote share a timestamp; same-timestamp retrieval order is not causal order, so that pair is corroboration only.",
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  // M11-D2-A2 (2026-10-01): the wire encodings of Rage (1), Focus (2) and Fury
  // (17), from the SAME M10-B capture the Protection opener slices came from.
  // Six own completed casts, two per resource, each a costed PRE_COST snapshot
  // the caster's own pool carries (resourceActor 1). No resourcechange is
  // retained, and no contract here rests on one: standalone-change pool
  // ownership is M11-D2-A3's, proven by wcl-resource-change-pool-ownership.
  artifact("wcl-rage-fury-focus-pre-cost", wcl("wcl-rage-fury-focus-pre-cost"), {
    kind: "SANITIZED_CAPTURE",
    source: PROT_OPENER_SOURCE,
    transformations: [
      selection(
        "node scripts/sanitize-probe.mjs .probe/m10b-pages.json wcl-rage-fury-focus-pre-cost.json --indices 468,1212,1392,2757,3702,3805",
        "The four page envelopes concatenated in page order, then exactly six capture positions in capture order: per resource, two costed COMPLETE casts by the actor whose pool the snapshot describes (resourceActor 1, the source). Rage: actor 4 (Warrior/Arms) Cleave 845 at 464/1300 costing 200 and Mortal Strike 12294 at 1300/1300 costing 300. Focus: actor 20 (Hunter/BeastMastery) Kill Command 34026 at 100/100 costing 30 and Cobra Shot 193455 at 98/100 costing 35. Fury: actor 18 (DemonHunter/Havoc) Eye Beam 198013 at 44/170 costing 30 and Annihilation 201427 at 109/170 costing 40. Positions are meaningful only against report revision 30.",
        ALL_SLICE_INVALIDATIONS,
      ).with_revision(SLICER_REVISION_6),
      credential_scan(SLICER_REVISION_6),
    ],
    coverageBasis:
      "An --indices selection retains six non-adjacent capture positions; no contiguous range survives.",
    retainedFor:
      "The wire encodings of the Rage, Focus and Fury contracts (M11-D2-A2): every retained cast's wire cost equals the pinned DBC _cost of its spell's power row at SimulationCraft 33622e9d (sc_spell_data.inc sha256 d8e3d197…4c62: Cleave row 99 = 200, Mortal Strike row 9599 = 300, Kill Command row 1470 = 30, Cobra Shot row 10443 = 35, Eye Beam row 10720 = 30, Annihilation row 10809 = 40), so the wire is in the DBC encoding and power_type_data.inc's divisor (Rage 10.0, Focus 1.0, Fury 1.0) converts it. Mortal Strike's 1300/1300 and Kill Command's 100/100 while costed are cap-bounded falsifiers of a post-cost reading.",
    limitations: [
      "Settles one instant per event. Nothing here establishes a resource BETWEEN casts: Rage has hidden melee gains on the wire, Focus regenerates, and no carry or regeneration is modelled.",
      "Standalone resourcechange events are deliberately absent, and no claim here rests on one. Exact own-cast Focus snapshots are sound on their own; since M11-D2-A3 a standalone change is attributed to the pool the event's own evidence names (a Hunter's change to its pet's Focus is the pet's), and a change whose pool the event does not establish stays unresolved and fails closed (wcl-resource-change-pool-ownership).",
      "Actor identities are proven from the committed wcl-fight-context-a7r6-fight-7 master data, not from this slice.",
      VERSION_SCOPE,
    ],
  }),
  artifact("wcl-resource-change-pool-ownership", wcl("wcl-resource-change-pool-ownership"), {
    kind: "SANITIZED_CAPTURE",
    source: PROT_OPENER_SOURCE,
    transformations: [
      selection(
        "node scripts/sanitize-probe.mjs .probe/m10b-pages.json wcl-resource-change-pool-ownership.json --indices 1759,5715,5716,5717,5718",
        "The four page envelopes concatenated in page order, then exactly five resourcechange capture positions in capture order. Position 1759: actor 10 (Shaman) -> actor 16 (Shaman), ability 381931, Mana (type 0) +225 waste 225, resourceActor 2 with a snapshot carrying only Maelstrom (type 11). Positions 5715-5718: one Hunter ability (1264783) at 2,015,438 sourced by actor 20 (Hunter) on four events — targets 38, 30 and 29 (pets, petOwner 20) with resourceActor 2 and each pet's Focus snapshot (100/100; waste 3, 0, 3), and target 20 itself with resourceActor 1 and the Hunter's Focus snapshot (70/100; waste 0). Positions are meaningful only against report revision 30.",
        ALL_SLICE_INVALIDATIONS,
      ).with_revision(SLICER_REVISION_6),
      credential_scan(SLICER_REVISION_6),
    ],
    coverageBasis:
      "An --indices selection retains five capture positions, four of them adjacent; no coverage is granted for any category or actor.",
    retainedFor:
      "Standalone resource-change POOL OWNERSHIP (M11-D2-A3). One Hunter ability changes four Focus pools at one millisecond, all sourced by the Hunter: three pets' (the snapshot on the target side names each pet's pool, two of them reporting waste 3 at 100/100) and the Hunter's own (70/100, waste 0 — so a waste of 3 cannot be the Hunter's pool). Ownership is read from the event's own resourceActor discriminator and changed-type entry, never from source; the Shaman-to-Shaman Mana change, whose snapshot carries no Mana entry, establishes no owner.",
    limitations: [
      "Ownership only. No Focus or Mana state between events is established, no pet resource is modelled, and nothing here is Hunter or pet gameplay.",
      "The changed-type snapshot reads as the changed pool on the strength of the M11-B5 POST_CHANGE contract and of the local A7R6 captures this slice was cut from (every cross-actor resourcechange there carries resourceActor 2, its changed-type entry's max equals maxResourceAmount, and every positive waste sits at that entry's cap); only these five events are committed.",
      "Actor identities and pet ownership are proven from the committed wcl-fight-context-a7r6-fight-7 master data, not from this slice.",
      VERSION_SCOPE,
    ],
  }),
  artifact("wcl-assassination-envenom-combo-points", wcl("wcl-assassination-envenom-combo-points"), {
    kind: "SANITIZED_CAPTURE",
    source: ENVENOM_SOURCE,
    transformations: [
      selection(
        "node scripts/sanitize-probe.mjs .probe/m5b-fixture-source.json wcl-assassination-envenom-combo-points.json --indices 0,1,2,3,4,5,6,7,8,9,10,11,12,13",
        "Kept all fourteen events of a probe-assembled source: two combatantinfo events (actors 13 and 19, both specID 259), seven Envenom casts by actors 13 and 19 selected by fact from narrow windows, and five costed discrete-resource casts from five classes.",
        ALL_SLICE_INVALIDATIONS,
      ),
      credential_scan(),
      legacy_copy(
        "wcl-assassination-envenom-combo-points.json",
        "wcl-assassination-envenom-combo-points.json",
      ),
    ],
    coverageBasis:
      "Assembled from non-adjacent narrow windows; no contiguous range survives for any category.",
    retainedFor:
      "The M5-A Assassination decision surface: the 3-of-7 Envenom that is REJECTED_BY_AUTHORITY, the 7-of-7 Envenoms whose spend gate is satisfiable, and the Envenom at 2,090,898 that carries NO combo-point entry — the negative evidence that a missing entry must never read as zero. Also corroboration for the combo-point and Energy wire contracts.",
    limitations: [
      "Nothing about Darkest Night: the buff appears nowhere in the report.",
      "Nothing about generate-side combo-point state; combo points are reported only on casts that spend them.",
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  artifact("wcl-assassination-vanish-ambush-gate", wcl("wcl-assassination-vanish-ambush-gate"), {
    kind: "SANITIZED_CAPTURE",
    source: VANISH_SOURCE,
    transformations: [
      selection(
        "node scripts/sanitize-probe.mjs .probe/m5c2-fixture-source.json wcl-assassination-vanish-ambush-gate.json --indices 0,1,2,3,4",
        "Kept all five events of the probe-filtered source, in captured order: the pull combatantinfo, the Vanish applybuff and cast at 2,176,120, and the Garrote cast followed by the Vanish removebuff at 2,176,580. The last two share a timestamp and their ORDER is the evidence.",
        ALL_SLICE_INVALIDATIONS,
      ),
      credential_scan(),
      legacy_copy("wcl-assassination-vanish-ambush-gate.json", "wcl-assassination-vanish-ambush-gate.json"),
    ],
    coverageBasis:
      "The probe filtered to five events; whether every aura event targeting actor 19 between 2,176,120 and 2,176,580 was retained is not recorded, so no coverage is granted. Carrying the Vanish buff forward to the Garrote decision point is therefore UNKNOWN here; the C3a and C3c1 slices retain that coverage and prove it.",
    retainedFor:
      "Actor 19's real build through the normalizer's talentTree (improved_ambush NOT_SELECTED, shrouded_suffocation SELECTED, blindside UNKNOWN), and the Vanish BUFF (11327) versus the Vanish ACTION (1856) being different identities.",
    limitations: ["Nothing about `variable.single_target` or ability 8676.", VERSION_SCOPE, WHITESPACE],
  }),
  artifact("wcl-assassination-garrote-dot-remains", wcl("wcl-assassination-garrote-dot-remains"), {
    kind: "SANITIZED_CAPTURE",
    source: C3A_SOURCE,
    transformations: [
      selection(
        "node scripts/sanitize-probe.mjs .probe/m5c3a-ordered-source.json wcl-assassination-garrote-dot-remains.json",
        "In-place filter of the paged capture, order preserved: EVERY aura event in [2,164,325 .. 2,176,581] whose target is actor 19 or actor 21 (no ability or source filter), the two decision casts by actor 19, and the pull combatantinfo at 2,004,589. 270 events. Casts by actor 19 other than the two decision casts were NOT retained.",
        ["ABSENCE_PROOF", "CROSS_EVENT_CONTINUITY", "PAGINATION_BEHAVIOUR"],
      ),
      credential_scan(),
      legacy_copy("wcl-assassination-garrote-dot-remains.json", "wcl-assassination-garrote-dot-remains.json"),
    ],
    grants: [
      {
        categories: ["AURAS"],
        actorScope: [19, 21],
        ranges: [{ fromReportTimeMs: C3_START, toReportTimeMs: C3_END }],
      },
    ],
    coverageBasis:
      "AURAS for targets 19 and 21 over [2,164,325 .. 2,176,581] is complete by the capture predicate (every aura event on either target, nothing filtered by ability or source), measured before capture with 0 unidentified-ability aura events on target 21. CASTS is NOT granted: only two of actor 19's casts were kept.",
    retainedFor:
      "The Garrote remaining-duration derivation at Q: anchor at 2,164,326, a DIFFERENT rogue's Garrote at 2,172,232 that must not become the anchor, and the cast at 2,176,580 sharing its timestamp with its own consequences — with Warcraft Logs returning the cast FIRST.",
    limitations: [
      "The 18,000 ms Garrote duration is pinned DBC data, not derived from this capture.",
      "Nothing about the `cds` list, `talent.razor_wire`, `variable.single_target` or `pmultiplier`.",
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  artifact("wcl-assassination-kingsbane-cooldown", wcl("wcl-assassination-kingsbane-cooldown"), {
    kind: "SANITIZED_CAPTURE",
    source: C3C1_SOURCE,
    transformations: [
      selection(
        "node scripts/sanitize-probe.mjs .probe/m5c3c1-source.json wcl-assassination-kingsbane-cooldown.json --head 310",
        "In-place filter of the paged capture, order preserved: EVERY aura event in [2,164,325 .. 2,176,581] whose target is actor 19 or 21, EVERY cast by actor 19 in that interval (42 casts), and the pull combatantinfo. 310 events; --head 310 kept the whole filtered source.",
        ["ABSENCE_PROOF", "CROSS_EVENT_CONTINUITY", "PAGINATION_BEHAVIOUR"],
      ),
      credential_scan(),
      legacy_copy("wcl-assassination-kingsbane-cooldown.json", "wcl-assassination-kingsbane-cooldown.json"),
    ],
    grants: [
      {
        categories: ["CASTS", "RESOURCES"],
        actorScope: [19],
        ranges: [{ fromReportTimeMs: C3_START, toReportTimeMs: C3_END }],
      },
      {
        categories: ["AURAS"],
        actorScope: [19, 21],
        ranges: [{ fromReportTimeMs: C3_START, toReportTimeMs: C3_END }],
      },
    ],
    coverageBasis:
      "CASTS (and the RESOURCES attached to them) for actor 19 over [2,164,325 .. 2,176,581] is complete by the predicate 'every actor-19 cast'; AURAS for targets 19 and 21 likewise. No other actor's casts were retained.",
    retainedFor:
      "The Kingsbane cooldown derivation at Q: `lastObservedCast(kingsbane, COMPLETE, before Q)` is only meaningful when every candidate is present, so all 42 actor-19 casts are here. Kingsbane at 2,173,778 is the anchor; the 24 melee autos and assorted abilities are what prove an unrelated cast does not anchor a cooldown.",
    limitations: [
      "The 60 s Kingsbane base cooldown is pinned DBC, not derived from this capture; the observed next cast at Q+57,665 corroborates it.",
      "Nothing about DoT ticking, Envenom duration or any predictive value.",
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  artifact("wcl-assassination-d2-decision-corpus", wcl("wcl-assassination-d2-decision-corpus"), {
    kind: "SANITIZED_CAPTURE",
    source: D2_SOURCE,
    transformations: [
      selection(
        "node scripts/sanitize-probe.mjs .probe/<m5d2-cut-source>.json wcl-assassination-d2-decision-corpus.json",
        "In-place filter of the wider capture, order preserved: EVERY cast by actor 19 (131 casts) and EVERY aura event targeting actor 19 or 21 in [2,164,325 .. 2,194,928], plus the pull combatantinfo at 2,004,589. 1,083 events. A strict forward extension of the C3c1 slice. Aura events targeting enemy 22 were captured and deliberately EXCLUDED; including them changed no corpus outcome.",
        ["ABSENCE_PROOF", "CROSS_EVENT_CONTINUITY", "PAGINATION_BEHAVIOUR"],
      ),
      credential_scan(),
      legacy_copy("wcl-assassination-d2-decision-corpus.json", "wcl-assassination-d2-decision-corpus.json"),
    ],
    grants: [
      {
        categories: ["CASTS", "RESOURCES"],
        actorScope: [19],
        ranges: [{ fromReportTimeMs: D2_START, toReportTimeMs: D2_END }],
      },
      {
        categories: ["AURAS"],
        actorScope: [19, 21],
        ranges: [{ fromReportTimeMs: D2_START, toReportTimeMs: D2_END }],
      },
    ],
    coverageBasis:
      "CASTS (and the RESOURCES attached to them) for actor 19 over [2,164,325 .. 2,194,928] is complete by the predicate 'every actor-19 cast'; AURAS for targets 19 and 21 likewise. The window start is MEASURED: cutting later than 2,164,325 drops the Garrote anchor and case 1 degrades to UNKNOWN.",
    retainedFor:
      "The M5-D2 real single-target decision corpus: seven real decisions from one real pull, chosen mechanically from the full-fight cast census. Also the single-fight, raid-night and encounter-context parity subject.",
    limitations: [
      "Verifies OBSERVED decisions only; the only positive usability proof is the observed execution, so this is not next-action prediction.",
      "Every locator matches on a timestamp and asserts uniqueness; index-relative addressing is not safe against a change of predicate.",
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  artifact("synthetic.unsupported-type-event", synthetic("unsupported-type-event"), {
    kind: "SYNTHETIC",
    coverageBasis: "Synthetic; there is no capture to retain coverage from.",
    retainedFor:
      "One event with a valid envelope whose type string no contract recognises, so the unsupported-type path can be pinned without pretending a real family is unsupported.",
    limitations: [
      "The type string is invented so it cannot collide with a real Warcraft Logs family. This proves the unsupported path exists; it proves nothing about any real type.",
      "Hand-authored. Not evidence of any Warcraft Logs behaviour.",
    ],
  }),
  artifact("synthetic.actor-zero-cast", synthetic("actor-zero-cast"), {
    kind: "SYNTHETIC",
    coverageBasis: "Synthetic; there is no capture to retain coverage from.",
    retainedFor:
      "One cast with sourceID 0 and targetID -1. No committed capture contains actor 0, so the rule that 0 is an ordinary actor id — and is never confused with absence or with the sentinel — is pinned on constructed input.",
    limitations: [
      "Hand-authored. Whether Warcraft Logs ever emits actor 0 is not established by this repository; the rule is that nothing rules it out.",
    ],
  }),
  artifact("synthetic.graphql-event-page-null-data", synthetic("graphql-event-page-null-data"), {
    kind: "SYNTHETIC",
    payloadKind: "WCL_GRAPHQL_DATA",
    coverageBasis: "Synthetic; there is no capture to retain coverage from.",
    retainedFor:
      "A well-formed decoded GraphQL data object whose ReportEventPaginator carries data: null. The schema declares data as nullable JSON; this is the shape the decoder must classify as a malformed page and never as an empty one.",
    limitations: [
      "Hand-authored against the documented schema shape. It is not a captured upstream response.",
      "The cursor value 7551050 is arbitrary and carries no meaning.",
    ],
  }),
  artifact("synthetic.graphql-page-sequence-two-pages", synthetic("graphql-page-sequence-two-pages"), {
    kind: "SYNTHETIC",
    payloadKind: "WCL_GRAPHQL_PAGE_SEQUENCE",
    coverageBasis: "Synthetic; there is no capture to retain coverage from.",
    retainedFor:
      "Two decoded page responses: page 1 ends with nextPageTimestamp 1500 and page 2 is terminal. The last event of page 1 and the first of page 2 are identical in every field, so the sequence proves both the verbatim cursor and the no-deduplication rule at once.",
    limitations: [
      "Hand-authored against the documented paginator shape. Real page boundaries in a real report have not been captured into the corpus; see the evidence-gap report.",
    ],
  }),
  artifact(
    "synthetic.graphql-page-sequence-malformed-second-page",
    synthetic("graphql-page-sequence-malformed-second-page"),
    {
      kind: "SYNTHETIC",
      payloadKind: "WCL_GRAPHQL_PAGE_SEQUENCE",
      coverageBasis: "Synthetic; there is no capture to retain coverage from.",
      retainedFor:
        "A well-formed first page followed by a page whose data is null. The stream must end PARTIAL with MALFORMED_PAGE, keeping the first page's events and never reading the second as empty.",
      limitations: ["Hand-authored against the documented paginator shape."],
    },
  ),

  artifact("synthetic.apl-priority-short-circuit", synthetic("apl-priority-short-circuit"), {
    kind: "SYNTHETIC",
    payloadKind: "JSON_VALUE",
    coverageBasis: "Synthetic; there is no capture to retain coverage from.",
    retainedFor:
      "A labelled SYNTHETIC SimulationCraft authority artifact for the shared decision engine: a `default` list whose first entry is gated on a buff, whose second is gated on a talent (`talent.opt`) and whose third is unconditional, plus an `unsupported` list whose first entry names an identifier the shared parser does not support. Loaded through the real loader; exercised by the real one-scan engine under bindings stated in each case.",
    limitations: [
      "Hand-authored. The authority id names no class or specialization and is registered nowhere; it proves the engine's priority semantics, not any rotation.",
      "Every premise (bindings, proven-usable tokens, entry list) is stated in the case parameters, not derived from any log.",
    ],
  }),

  artifact("synthetic.apl-run-action-list", synthetic("apl-run-action-list"), {
    kind: "SYNTHETIC",
    payloadKind: "JSON_VALUE",
    coverageBasis: "Synthetic; there is no capture to retain coverage from.",
    retainedFor:
      "M11-B1. A labelled SYNTHETIC SimulationCraft authority artifact for the shared decision engine's generic `run_action_list` control flow: `default` runs `child` on a buff gate and holds an unconditional `parent_filler` below the run; `call_default` is the same shape with `call_action_list`, for the contrast; `child` holds one talent-gated entry; `nested` runs `middle`, which runs `child`; `cycle_a` and `cycle_b` run each other. Loaded through the real loader; exercised by the real one-scan engine under bindings stated in each case.",
    limitations: [
      "Hand-authored. The authority id names no class or specialization and is registered nowhere; it proves the engine's control-flow semantics, not any rotation.",
      "Every premise (bindings, proven-usable tokens, entry list) is stated in the case parameters, not derived from any log.",
      "Regression evidence only. A SYNTHETIC artifact qualifies nothing for promotion (tests/contracts/m11-promotion-evidence-gate.test.ts).",
    ],
  }),

  // ---- M9-C bounded captures ------------------------------------------
  artifact("wcl-page-sequence-limit-40", graphql("wcl-page-sequence-limit-40"), {
    kind: "SANITIZED_CAPTURE",
    payloadKind: "WCL_GRAPHQL_PAGE_SEQUENCE",
    source: PAGES_SOURCE,
    transformations: [
      {
        kind: "FIELD_REDACTION",
        tooling: tooling(
          PAYLOAD_SANITIZER,
          PAYLOAD_SANITIZER_REVISION_1,
          "node scripts/corpus/sanitize-payloads.mjs pages .probe/m9c-pages.json tests/corpus/artifacts/wcl-graphql/wcl-page-sequence-limit-40.json",
        ),
        detail:
          "rateLimitData removed from each of the five decoded page responses. Events, order and nextPageTimestamp cursors are untouched.",
        invalidates: [],
      },
      payload_credential_scan(PAYLOAD_SANITIZER_REVISION_1),
    ],
    coverageBasis:
      "Page envelopes for the transport layer. No fight is built from a page sequence and no coverage is granted; the five pages are a PARTIAL prefix of a window the capture deliberately did not exhaust.",
    retainedFor:
      "Real page boundaries: five consecutive pages of one real fight with their verbatim cursors, so the paginator's cursor rule, the order across a boundary, the non-terminal ending and the no-deduplication rule are pinned on what Warcraft Logs actually returned rather than on a hand-authored sequence.",
    limitations: [
      "A prefix: the sixth page was never requested. The stream over this artifact must end PARTIAL, and an executor answering the sixth request as not retrieved is modelling the capture bound, not an observed upstream failure.",
      "Page sizes (44/43/42/57/40 at limit 40) are what Warcraft Logs returned; the limit is a hint, not a size, and nothing here explains the overshoot.",
      "Every actor is a numeric id. Nothing in the events was redacted, so the events are what the capture returned.",
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  artifact(
    "wcl-page-sequence-limit-40.page-5-removed",
    graphql("wcl-page-sequence-limit-40.page-5-removed"),
    {
      kind: "DERIVED_FROM_CAPTURE",
      payloadKind: "WCL_GRAPHQL_PAGE_SEQUENCE",
      parent: "wcl-page-sequence-limit-40",
      transformations: [
        {
          kind: "EVENT_REMOVAL",
          tooling: tooling(
            "node -e over the parent, then prettier",
            NOT_APPLICABLE,
            "pages.slice(0, 4) — the fifth page (40 events, cursor 2,176,472) removed whole; verified byte-identical to prettier(JSON.stringify(parent.slice(0, 4)))",
          ),
          detail:
            "The last page of the parent sequence is removed entirely. Pages 1–4 are byte-for-byte the parent's; page 4 still carries its real cursor 2,176,396, so the paginator will ask for page 5 and not receive it. Nothing else changed and no page was reordered.",
          invalidates: ["OBSERVED_BEHAVIOUR"],
        },
      ],
      coverageBasis:
        "Derived; the parent grants no coverage and this removal grants none either. Nothing about completeness is claimed by the artifact — the point is what the paginator REPORTS when a later page is missing.",
      retainedFor:
        "A partial retrieval over real pages: four real pages retained verbatim and in order, then a page that is not there. The stream must end PARTIAL with four pages and 186 events, never COMPLETE and never with the missing interval read as inactivity.",
      limitations: [
        "The missing page is a derivation, not an observed upstream failure; the executor's not-retrieved answer models the failure class, not a specific Warcraft Logs response.",
        VERSION_SCOPE,
        WHITESPACE,
      ],
    },
  ),
  artifact("wcl-page-terminal-one-millisecond", graphql("wcl-page-terminal-one-millisecond"), {
    kind: "SANITIZED_CAPTURE",
    payloadKind: "WCL_GRAPHQL_PAGE_SEQUENCE",
    source: TERMINAL_PAGE_SOURCE,
    transformations: [
      {
        kind: "FIELD_REDACTION",
        tooling: tooling(
          PAYLOAD_SANITIZER,
          PAYLOAD_SANITIZER_REVISION_1,
          "node scripts/corpus/sanitize-payloads.mjs pages .probe/m9c-pages-terminal.json tests/corpus/artifacts/wcl-graphql/wcl-page-terminal-one-millisecond.json",
        ),
        detail:
          "rateLimitData removed from the single decoded page response. Events and the null cursor are untouched.",
        invalidates: [],
      },
      payload_credential_scan(PAYLOAD_SANITIZER_REVISION_1),
    ],
    coverageBasis:
      "Page envelope for the transport layer. No fight is built from it and no coverage is granted, although the source capture itself is COMPLETE for its one-millisecond window.",
    retainedFor:
      "A real TERMINAL page: nextPageTimestamp null on the only page, so the stream ends COMPLETE after one request. Its 14 events share one timestamp (the Garrote at Q and its consequences), which also pins that a page of equal timestamps is retrieved whole and never collapsed.",
    limitations: [
      "One page over one millisecond proves the terminal rule, not that any wider window fits in one page.",
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  artifact("wcl-fight-context-a7r6-fight-7", graphql("wcl-fight-context-a7r6-fight-7"), {
    kind: "SANITIZED_CAPTURE",
    payloadKind: "WCL_GRAPHQL_DATA",
    source: CONTEXT_SOURCE,
    transformations: [
      {
        kind: "FIELD_REDACTION",
        tooling: tooling(
          PAYLOAD_SANITIZER,
          PAYLOAD_SANITIZER_REVISION,
          "node scripts/corpus/sanitize-payloads.mjs context .probe/m9c-context.json tests/corpus/artifacts/wcl-graphql/wcl-fight-context-a7r6-fight-7.json",
        ),
        detail: CONTEXT_REDACTION,
        invalidates: [],
      },
      payload_credential_scan(),
    ],
    coverageBasis:
      "Report context, not events: master data, one fight header, phase transitions, abilities and zone. It grants no event coverage. The actor catalog is complete for the report because master data is unpaginated.",
    retainedFor:
      "The real master data behind every A7R6 slice: 312 actors of which 165 are pets (126 with a petOwner link, 39 without), an NPC entry with id -1, the fight header with its kill, difficulty and 9 phase transitions including 4 intermissions, and the roster and specs identity resolution reads. One artifact answers the pet, intermission-evidence, identity and fight-header questions at once.",
    limitations: [
      "Names are redacted to `Actor<id>`; a case must never depend on a name beyond its being the redacted form.",
      "Phase transitions say when the encounter said a phase began; they do not say the boss was untargetable. Targetability remains uncaptured (see the evidence-gap report).",
      "Talent import code for actor 19 is present but uninterpreted, as in production.",
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  artifact("wcl-pet-sourced-events-hunter-pet-29", wcl("wcl-pet-sourced-events-hunter-pet-29"), {
    kind: "SANITIZED_CAPTURE",
    source: PET_EVENTS_SOURCE,
    transformations: [
      selection(
        "node scripts/sanitize-probe.mjs .probe/m9c-pet-events-29.json wcl-pet-sourced-events-hunter-pet-29.json --head 57",
        "The whole filtered page (57 events) unwrapped from its GraphQL envelope; --head 57 kept every event. Order preserved.",
        ALL_SLICE_INVALIDATIONS,
      ).with_revision(SLICER_REVISION),
      credential_scan(SLICER_REVISION),
    ],
    coverageBasis:
      "The source query carried a CAPTURE-ONLY sourceID filter the analyzer never uses, so this artifact retains no coverage for any category or actor: it holds what the filter served, and absence within it proves nothing.",
    retainedFor:
      "Real events sourced by a pet: 44 events with sourceID 29 (a Hunter's pet, petOwner 20 in master data) alongside its owner's resource events targeting the pet and enemy-sourced events. Normalization must keep the pet as the SOURCE actor and never fold it into its owner; direction is read from the verified field names.",
    limitations: [
      "Filtered capture. The 13 events not sourced by 29 are whatever Warcraft Logs' sourceID filter chose to include (targets and owner resource changes); no claim is made about why.",
      NO_NAMES,
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  artifact("wcl-fight-context-gtkb-fight-22", graphql("wcl-fight-context-gtkb-fight-22"), {
    kind: "SANITIZED_CAPTURE",
    payloadKind: "WCL_GRAPHQL_DATA",
    source: HIGH_CONTEXT_SOURCE,
    transformations: [
      {
        kind: "FIELD_REDACTION",
        tooling: tooling(
          PAYLOAD_SANITIZER,
          PAYLOAD_SANITIZER_REVISION,
          "node scripts/corpus/sanitize-payloads.mjs context .probe/m9c2-context.json tests/corpus/artifacts/wcl-graphql/wcl-fight-context-gtkb-fight-22.json",
        ),
        detail: CONTEXT_REDACTION,
        invalidates: [],
      },
      payload_credential_scan(),
    ],
    coverageBasis:
      "Report context, not events: master data, one fight header, phase transitions, abilities and zone. It grants no event coverage. The actor catalog is complete for the report because master data is unpaginated.",
    retainedFor:
      "The second Assassination report's context, coherent with the opener slice cut from the same report, fight and subject: 293 actors (27 players, 153 pets, 113 NPCs), the Sszorak heroic kill header (284,791 ms, five phase transitions with no intermission), and the roster and specs that identity resolution reads for actors 25 and 8 — the 100 % and the 8 % Assassination Rogue of the same kill.",
    limitations: [
      "Names are redacted to `Actor<id>`, servers and player gameIDs to null; a case must never depend on a name beyond its being the redacted form.",
      "Sszorak's phase transitions carry isIntermission false throughout; this report holds no intermission evidence.",
      "Talent import code for actor 25 is present but uninterpreted, as in production.",
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  artifact("wcl-assassination-high-parse-opener", wcl("wcl-assassination-high-parse-opener"), {
    kind: "SANITIZED_CAPTURE",
    source: HIGH_OPENER_SOURCE,
    transformations: [
      selection(
        "node scripts/sanitize-probe.mjs .probe/m9c2-opener-pages.json wcl-assassination-high-parse-opener.json --decision-slice 25 235",
        "The two page envelopes concatenated in page order, then the --decision-slice predicate, in place and order preserved: EVERY cast by actor 25 (122 casts), EVERY aura event whose target is actor 25 or boss 235, and actor 25's combatantinfo. 1,542 of 18,318 events. No other actor's casts, no damage, healing, resource-change, summon or absorb events were retained.",
        ["ABSENCE_PROOF", "CROSS_EVENT_CONTINUITY", "PAGINATION_BEHAVIOUR"],
      ).with_revision(SLICER_REVISION_3),
      credential_scan(SLICER_REVISION_3),
    ],
    grants: [
      {
        categories: ["CASTS", "RESOURCES"],
        actorScope: [25],
        ranges: [{ fromReportTimeMs: HP_START, toReportTimeMs: HP_END }],
      },
      {
        categories: ["AURAS"],
        actorScope: [25, 235],
        ranges: [{ fromReportTimeMs: HP_START, toReportTimeMs: HP_END }],
      },
    ],
    coverageBasis:
      "CASTS (and the RESOURCES attached to them) for actor 25 over [2,415,041 .. 2,435,041] is complete by the predicate 'every actor-25 cast' over a window the capture retrieved COMPLETE (two pages, terminal); AURAS for targets 25 and 235 likewise. The window begins at the fight start, so an absence claim over any prefix of it is fully covered. Nothing is granted to any other actor or category.",
    retainedFor:
      "The high-performance Assassination subject: the opener of a 100 %-bracket parse (context only — no expectation reads the bracket) on a materially different pull (Sszorak heroic, 284,791 ms) from a different report, cut by the same predicate as the D2 corpus so the same executors run over it. Observed decisions from the pull, combo-point and Energy snapshots on the casts, and the first aura windows on the subject and the boss.",
    limitations: [
      "The first 20 seconds only: nothing about the rest of the pull, its cooldown cycles or its ending.",
      "Actor 8, the 8 % Assassination Rogue of the same kill, is NOT in this slice; the predicate retained actor 25 alone. Performance diversity across subjects is recorded on the source, not proven by events.",
      "Sszorak has adds; events on any target other than 235 were not retained, so multi-target state is unknown here as everywhere in the corpus.",
      NO_NAMES,
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  artifact("wcl-encounter-rankings-sszorak-page-1", graphql("wcl-encounter-rankings-sszorak-page-1"), {
    kind: "SANITIZED_CAPTURE",
    payloadKind: "WCL_GRAPHQL_DATA",
    source: RANKINGS_SOURCE,
    transformations: [
      {
        kind: "IDENTIFIER_REMAP",
        tooling: tooling(
          PAYLOAD_SANITIZER,
          PAYLOAD_SANITIZER_REVISION_1,
          "node scripts/corpus/sanitize-payloads.mjs rankings .probe/m8-rankings-shape.json tests/corpus/artifacts/wcl-graphql/wcl-encounter-rankings-sszorak-page-1.json encounterCharacterRankings__data",
        ),
        detail:
          "Every third-party report.code replaced by a deterministic 16-character code (RANK0001AAAAAAAA …) in first-appearance order; equal real codes map to equal remapped codes. fightID is untouched. No remapped code exists on Warcraft Logs.",
        invalidates: ["ORIGINAL_IDENTIFIERS"],
      },
      {
        kind: "FIELD_REDACTION",
        tooling: tooling(PAYLOAD_SANITIZER, PAYLOAD_SANITIZER_REVISION_1, "same invocation"),
        detail:
          "rateLimitData removed; every row's name replaced by `Candidate<n>` (n = 1-based row position), server set to null, guild removed. amount, duration, startTime, bracketData, size, faction, hardModeLevel and hidden are untouched.",
        invalidates: [],
      },
      payload_credential_scan(PAYLOAD_SANITIZER_REVISION_1),
    ],
    coverageBasis: "A ranking board page. It is not combat evidence and grants no coverage.",
    retainedFor:
      "The real shape of one encounter characterRankings page (100 rows, 8 hidden, 92 with a server, hasMorePages true) so the ranking decoder, candidate pool and qualification run over what Warcraft Logs actually serves. The board is a retrieval filter for external references — context only, never rotational authority and never 'comparable logs' by itself.",
    limitations: [
      "Identities are gone: no name, server, guild or real report code survives. Nothing here can be cross-referenced against Warcraft Logs, which is the intent.",
      "The partition was OMITTED at capture (Warcraft Logs' latest at the time); the analyzer requires an explicit partition, so a case must state one and the artifact does not vouch for it.",
      "Candidate metadata for these rows is NOT captured; an executor that qualifies them does so over a stated SYNTHETIC per-candidate report.",
      WHITESPACE,
    ],
  }),
  artifact("wcl-protection-paladin-a7r6-opener", wcl("wcl-protection-paladin-a7r6-opener"), {
    kind: "SANITIZED_CAPTURE",
    source: PROT_OPENER_SOURCE,
    transformations: [
      selection(
        "node scripts/sanitize-probe.mjs .probe/m10b-pages.json wcl-protection-paladin-a7r6-opener.json --actor-slice 7 2026589",
        "The four page envelopes concatenated in page order, then the --actor-slice predicate, in place and order preserved: EVERY event whose sourceID or targetID is actor 7 with timestamp at or before 2,026,589 (the bound that keeps the slice under the 512 KiB artifact limit; the full 45 s would be 2,552 events / ~1.1 MB). 988 of 30,588 events: 45 casts, 17 resourcechange, 296 aura transitions targeting 7 and 258 sourced by 7 elsewhere, 220 damage (36 targeting 7), 280 heals (61 self, 98 received, 121 given), 74 absorbed (55 targeting 7), 1 summon, actor 7's combatantinfo. No other actor's own events, no death, dispel, drain or interrupt event (none involved actor 7 in the window; the two deaths in the raw window were NPCs).",
        ACTOR_SLICE_INVALIDATIONS,
      ).with_revision(SLICER_REVISION_4),
      credential_scan(SLICER_REVISION_4),
    ],
    grants: [
      {
        categories: [
          "CASTS",
          "RESOURCES",
          "AURAS",
          "DAMAGE",
          "HEALING",
          "ABSORBS",
          "SUMMONS",
          "COMBATANT_INFO",
          "GEAR",
        ],
        actorScope: [7],
        ranges: [{ fromReportTimeMs: PP_START, toReportTimeMs: PP_SLICE_END }],
      },
    ],
    coverageBasis:
      "Every capture-vouched category for actor 7 over [2,004,589 .. 2,026,589] is complete by the predicate 'every event actor 7 sources or is targeted by, at or before the bound' over a window the capture retrieved COMPLETE (four pages, terminal, revision 30 before and after). CASTS and RESOURCES are complete as the source of its own casts and the actor its snapshots describe; AURAS, DAMAGE, HEALING and ABSORBS as their target; SUMMONS as their source; COMBATANT_INFO and GEAR as the subject of its one combatantinfo. The window begins at the fight start, so an absence claim over any prefix of it is fully covered. Nothing is granted to any other actor, and nothing after the bound.",
    retainedFor:
      "The first real Protection Paladin evidence: the subject's opening 22 seconds of a heroic Entombed Sentinels kill as a TANK sees it. Holy Power on the wire (five costed Shield of the Righteous casts at 4, 3, 3, 3, 3 of 5 with cost 3, two more completed Shield of the Righteous casts carrying NO Holy Power entry, and 17 standalone +1 resourcechange events with max 5 and waste 0), the auras applied to the subject and by it, 36 damage events taken with mitigated/unmitigated/absorbed fields populated, self-healing (source = target), healing received, absorbs attributed to the subject's own shields with the attacker recorded, a summon of pet 37 (petOwner 7 in master data), and a combatantinfo with specID 66 and an 80-node talent tree. Observations only — no ability is classified as mitigation, defensive or utility here.",
    limitations: [
      "The first 22 seconds only: nothing about the rest of the pull, its cooldown cycles, later defensives or its ending.",
      "No interrupt, death, dispel or drain event involves actor 7 in the window; INTERRUPTS stays UNVERIFIED and this slice cannot vouch for it.",
      "Pet 37's own events after the summon were NOT retained (its sourceID is 37, not 7); the summon and the master-data petOwner link are the attribution evidence, and no pet action is rolled into the player.",
      "Ability ids are retained as numbers; which of them is 'active mitigation' or a 'defensive' is a game-data/authority classification this artifact does not make.",
      NO_NAMES,
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  artifact(
    "wcl-protection-paladin-a7r6-opener.gap-before-2010000",
    wcl("wcl-protection-paladin-a7r6-opener.gap-before-2010000"),
    {
      kind: "DERIVED_FROM_CAPTURE",
      parent: "wcl-protection-paladin-a7r6-opener",
      transformations: [
        {
          kind: "EVENT_REMOVAL",
          tooling: tooling(
            "M10-B derivation (scripted event removal over the parent's parsed array)",
            NOT_APPLICABLE,
            "kept = events.filter((e) => !(e.timestamp > 2004589 && e.timestamp < 2010000)); written back with JSON.stringify(kept, null, 2)",
          ),
          detail:
            "Every event strictly between the fight start (2,004,589) and 2,010,000 removed: 164 of 988 events, including the subject's first four casts, its first costed Shield of the Righteous (2,009,098) and the first aura transitions on it. The combatantinfo at the fight start and every event from 2,010,059 on are byte-for-byte the parent's, in the parent's order.",
          invalidates: ["OBSERVED_BEHAVIOUR", "WINDOW_COVERAGE", "ABSENCE_PROOF", "CROSS_EVENT_CONTINUITY"],
        },
      ],
      grants: [
        {
          categories: [
            "CASTS",
            "RESOURCES",
            "AURAS",
            "DAMAGE",
            "HEALING",
            "ABSORBS",
            "SUMMONS",
            "COMBATANT_INFO",
            "GEAR",
          ],
          actorScope: [7],
          ranges: [{ fromReportTimeMs: 2010000, toReportTimeMs: PP_SLICE_END }],
        },
      ],
      coverageBasis:
        "The parent's grant clipped to begin at the removal boundary: from 2,010,000 to the parent's bound the retained events are exactly the parent's, so the parent's coverage still holds there; before it, nothing is covered. The window itself still starts at the fight start because the combatantinfo was kept, which is what makes the gap a PARTIAL interval rather than a shorter complete one.",
      retainedFor:
        "The truncated-evidence condition on a real tank slice: a window whose coverage does not begin where the window begins. An absence question over the whole window, or an aura's state before its first retained transition, must answer UNKNOWN / INSUFFICIENT_COVERAGE — never proven absence, never INACTIVE, and never Holy Power zero.",
      limitations: [
        "Not evidence of anything that happened between 2,004,589 and 2,010,000; those events were removed on purpose.",
        "Inherits every limitation of its parent.",
      ],
    },
  ),
  artifact("wcl-protection-paladin-a7r6-rotational-45s", wcl("wcl-protection-paladin-a7r6-rotational-45s"), {
    kind: "SANITIZED_CAPTURE",
    source: PROT_OPENER_SOURCE,
    transformations: [
      selection(
        "node scripts/sanitize-probe.mjs .probe/m10b-pages.json wcl-protection-paladin-a7r6-rotational-45s.json --actor-slice 7 2049581 --families cast,resourcechange,applybuff,refreshbuff,removebuff,applybuffstack,removebuffstack,applydebuff,refreshdebuff,removedebuff,applydebuffstack,removedebuffstack,combatantinfo",
        "The same four page envelopes as the opener, concatenated in page order, then the --actor-slice predicate bounded at the capture's last timestamp (2,049,581) and restricted by --families to thirteen raw types: cast, resourcechange, the ten aura-transition types and combatantinfo. In place and order preserved, 1,093 of 30,588 events: 132 casts (101 by actor 7, 31 targeting it), 43 resourcechange (all targeting 7), 917 aura transitions (502 targeting 7, 415 sourced by 7 on others), actor 7's combatantinfo at the fight start; first event 2,004,589, last 2,049,482. Damage, healing, absorbed and summon events involving actor 7 (1,459 of its 2,552 events in the window) were FILTERED OUT by family, not trimmed within a family, so the whole 45-second window fits under the 512 KiB artifact limit (257,348 bytes) where the unfiltered actor slice would not (~1.1 MB).",
        ACTOR_SLICE_INVALIDATIONS,
      ).with_revision(SLICER_REVISION_5),
      credential_scan(SLICER_REVISION_5),
    ],
    grants: [
      {
        categories: ["CASTS", "RESOURCES", "AURAS", "COMBATANT_INFO", "GEAR"],
        actorScope: [7],
        ranges: [{ fromReportTimeMs: PP_START, toReportTimeMs: PP45_END }],
      },
    ],
    coverageBasis:
      "The retained families are complete for actor 7 over [2,004,589 .. 2,049,581] by the predicate 'every event actor 7 sources or is targeted by, of a retained family, at or before the bound' over a window the capture retrieved COMPLETE (four pages, terminal, revision 30 before and after). CASTS and RESOURCES are complete as the source of its own casts and the actor its snapshots describe; AURAS as their target; COMBATANT_INFO and GEAR as the subject of its one combatantinfo. DAMAGE, HEALING, ABSORBS and SUMMONS are NOT granted: those families were filtered out and this slice cannot vouch for them. The window begins at the fight start, so an absence claim over any prefix of it in a retained family is fully covered. Nothing is granted to any other actor, and nothing after the bound.",
    retainedFor:
      "M10-C5 Phase A: the whole 45-second capture of the same Protection Paladin subject, as the shared decision engine needs it — every cast, every Holy Power change and every aura transition on or by the subject from the pull, with the combatantinfo. It holds what the 22-second opener could not: the subject's Sentinel press at 2,026,241 (+21,652) and the Sentinel aura it applied, the Divine Toll press at 2,026,655 (+22,066), the Voracious Heart of Ula'tek use and the Light's Potential potion, ten Hammer of Wrath casts under the Sentinel-triggered Hammer of Wrath buff, and the later Blessed Hammer, Judgment, Avenger's Shield and Consecration presses whose readiness a 45-second history can or cannot establish. 101 casts by actor 7 in total, the evaluation population being every eligible GCD-lane cast among them; the evaluation window is the whole slice, fixed before any evaluator ran.",
    limitations: [
      "Forty-five seconds of a 424-second kill: nothing about the fight's later cooldown cycles or its ending.",
      "No damage, healing, absorb or summon event is retained; mitigation, survival and pet attribution questions belong to the opener slice, not to this one.",
      "No Holy Armaments hardcast (432459 / 432472) occurs in the window, so the Lightsmith alternation state cannot be anchored from this evidence.",
      "Cooldown state at the pull is outside the log: nothing here says whether any ability was on cooldown when the fight began.",
      NO_NAMES,
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  artifact(
    "wcl-protection-paladin-a7r6-rotational-45s.gap-before-2026589",
    wcl("wcl-protection-paladin-a7r6-rotational-45s.gap-before-2026589"),
    {
      kind: "DERIVED_FROM_CAPTURE",
      parent: "wcl-protection-paladin-a7r6-rotational-45s",
      transformations: [
        {
          kind: "EVENT_REMOVAL",
          tooling: tooling(
            GAP_TOOL,
            GAP_TOOL_REVISION,
            "node scripts/corpus/derive-gap.mjs wcl-protection-paladin-a7r6-rotational-45s.json wcl-protection-paladin-a7r6-rotational-45s.gap-before-2026589.json --remove-between 2004589 2026589",
          ),
          detail:
            "Every event strictly between the fight start (2,004,589) and 2,026,589 removed: 412 of 1,093 events, including 45 of the subject's 101 casts — among them the Sentinel press at 2,026,241 and the Sentinel aura application that press produced. The combatantinfo at the fight start and every event from 2,026,628 on (56 casts by the subject, the Divine Toll press at 2,026,655 first among the GCD-lane ones) are byte-for-byte the parent's, in the parent's order. THE BOUNDARY WAS PREDECLARED: 2,026,589 is the M10-B opener's bound, fixed before this derivative existed and before any Phase A evaluation; it was not chosen from any decision's outcome. The same tool reproduces the committed opener gap derivative byte for byte from the opener (checked by tests/unit/derive-gap.test.ts).",
          invalidates: ["OBSERVED_BEHAVIOUR", "WINDOW_COVERAGE", "ABSENCE_PROOF", "CROSS_EVENT_CONTINUITY"],
        },
      ],
      grants: [
        {
          categories: ["CASTS", "RESOURCES", "AURAS", "COMBATANT_INFO", "GEAR"],
          actorScope: [7],
          ranges: [{ fromReportTimeMs: PP45_GAP_BOUNDARY, toReportTimeMs: PP45_END }],
        },
      ],
      coverageBasis:
        "The parent's grant clipped to begin at the removal boundary: from 2,026,589 to the parent's bound the retained events are exactly the parent's, so the parent's coverage still holds there; before it, nothing is covered. The window itself still starts at the fight start because the combatantinfo was kept, which is what makes the gap a PARTIAL interval rather than a shorter complete one.",
      retainedFor:
        "The truncated-history condition on the Phase A evidence: the same decisions after 2,026,589 as the parent, but with the history that anchors them — the Sentinel press and its aura — removed. A cooldown or aura fact the parent establishes from that history must return to UNKNOWN here, never carry over; and no decision may resolve on this derivative that needed the removed events.",
      limitations: [
        "Not evidence of anything that happened between 2,004,589 and 2,026,589; those events were removed on purpose.",
        "Inherits every limitation of its parent.",
      ],
    },
  ),
  // ---- M10-C5 Phase B: the steady-state segments ---------------------------
  ppb_segment(
    "45-60",
    2049581,
    2064589,
    "202 of 68,870 events (first 2,049,618, last 2,064,581). This segment's --from equals the Phase A slice's grant end (2,049,581): the two share no event, and the millisecond interval between the Phase A grant and this capture's window start is certified empty below.",
    {
      certifiedEmpty: [
        {
          fromReportTimeMs: 2049582,
          toReportTimeMs: 2049588,
          precedingArtifactId: "wcl-protection-paladin-a7r6-rotational-45s",
          basis:
            "The M10-B capture requested [2,004,589 .. 2,049,589) — an EXCLUSIVE end of 2,049,589 — and paginated to a terminal page whose last event is 2,049,581, so every event the report holds before 2,049,589 was retrieved and the Phase A slice (every actor-7 event of the retained families in that capture) retained none in [2,049,582 .. 2,049,588]; this capture begins at 2,049,589 and its first event is 2,049,590. The loader re-checks both captures' recorded windows and completeness and that neither artifact retains an event inside the interval.",
        },
      ],
    },
  ),
  ppb_segment("60-90", 2064589, 2094589, "827 of 68,870 events (first 2,064,705, last 2,094,381)."),
  ppb_segment("90-120", 2094589, 2124589, "723 of 68,870 events (first 2,094,652, last 2,124,573)."),
  ppb_segment(
    "120-165",
    2124589,
    2169589,
    "875 of 68,870 events (first 2,124,603, last 2,169,554): the whole fixed evaluation window [+120,000 .. +165,000] ms, plus nothing after the capture's end.",
  ),
  // ---- M11-A4: the Retribution Paladin subjects (PUBLIC since M11-A5) -------
  //
  // No new Warcraft Logs request. Both subjects are cut from captures the
  // corpus already records: A7R6 fight 7 actor 6 from the M10-B (0–45 s) and
  // M10-C5 Phase B (45–165 s) unfiltered streams, and gtKb fight 22 actor 23
  // from the M9-C2 opener stream. The captures were requested for other
  // subjects (actors 7 and 25); every stream is actor-UNFILTERED, so the
  // --actor-slice predicate over them is complete for a second actor by the
  // same argument that made it complete for the first.
  artifact(RET45, wcl(RET45), {
    kind: "SANITIZED_CAPTURE",
    source: PROT_OPENER_SOURCE,
    transformations: [
      selection(
        `node scripts/sanitize-probe.mjs .probe/m10b-pages.json ${RET45}.json --actor-slice 6 2049581 --families ${PPB_FAMILIES}`,
        "The same four page envelopes as the Protection opener, concatenated in page order, then the --actor-slice predicate for ACTOR 6 bounded at the capture's last timestamp (2,049,581) and restricted by --families to the same thirteen raw types. In place and order preserved, 514 of 30,588 events: 91 casts (84 by actor 6, 7 targeting it), 64 resourcechange (all targeting 6), 458 aura transitions (211 targeting 6, 247 sourced by 6 on others), actor 6's combatantinfo at the fight start; first event 2,004,589, last 2,048,895. Damage, healing, absorb and summon events involving actor 6 were FILTERED OUT by family, not trimmed within a family.",
        ACTOR_SLICE_INVALIDATIONS,
      ).with_revision(SLICER_REVISION_6),
      credential_scan(SLICER_REVISION_6),
    ],
    grants: [
      {
        categories: PPB_CATEGORIES,
        actorScope: [RET],
        ranges: [{ fromReportTimeMs: PP_START, toReportTimeMs: PP45_END }],
      },
    ],
    coverageBasis:
      "The retained families are complete for actor 6 over [2,004,589 .. 2,049,581] by the predicate 'every event actor 6 sources or is targeted by, of a retained family, at or before the bound' over a window the capture retrieved COMPLETE with NO actor filter (four pages, terminal, revision 30 before and after). CASTS and RESOURCES are complete as the source of its own casts and the actor its snapshots describe; AURAS as their target; COMBATANT_INFO and GEAR as the subject of its one combatantinfo. DAMAGE, HEALING, ABSORBS and SUMMONS are NOT granted. The window begins at the fight start. Nothing is granted to any other actor, and nothing after the bound.",
    retainedFor:
      "M11-A4: the first 45 seconds of the Retribution Paladin subject (A7R6 fight 7 actor 6 — Herald of the Sun, Final Verdict, Crusading Strikes, Divine Purpose, Art of War, a two-handed main hand), as the spender slice needs it — every cast, every Holy Power change and every aura transition on or by the subject from the pull, with the combatantinfo. It carries the first Avenging Wrath at 2,005,300, the Empyrean Legacy, Divine Arbiter, Divine Purpose and Hammer of Wrath readiness auras, and 28 Holy Power spender casts; the first part of the 165 s bundle.",
    limitations: [
      "Forty-five seconds of a 424-second kill: nothing about the fight's later cooldown cycles or its ending.",
      "No damage, healing, absorb or summon event is retained.",
      "Cooldown state at the pull is outside the log: nothing here says whether any ability was on cooldown when the fight began.",
      "The subject's race is not in the evidence and is not inferred; racial entries of the pinned list are outside the rotational decision domain (M11-A4 boundary).",
      NO_NAMES,
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  ret_segment(
    "45-105",
    2049581,
    2109589,
    "641 of 68,870 events (first 2,049,747, last 2,109,527). This segment's --from equals the 45 s slice's grant end (2,049,581): the two share no event, and the millisecond interval between that grant and this capture's window start is certified empty below. It holds the second Avenging Wrath at 2,067,930, the Divine Toll at 2,075,677, the Execution Sentence at 2,073,829, the Wake of Ashes at 2,103,923 and the Divine Purpose consumption at 2,105,158; the real MATCH at 2,108,996 and the scan-selected REJECTED at 2,105,158 / 2,106,382 lie in it.",
    {
      certifiedEmpty: [
        {
          fromReportTimeMs: 2049582,
          toReportTimeMs: 2049588,
          precedingArtifactId: RET45,
          basis:
            "The M10-B capture requested [2,004,589 .. 2,049,589) — an EXCLUSIVE end of 2,049,589 — and paginated to a terminal page whose last event is 2,049,581, so every event the report holds before 2,049,589 was retrieved and the 45 s slice (every actor-6 event of the retained families in that capture) retained none in [2,049,582 .. 2,049,588]; this capture begins at 2,049,589 and its first event is 2,049,590. The loader re-checks both captures' recorded windows and completeness and that neither artifact retains an event inside the interval.",
        },
      ],
    },
  ),
  ret_segment(
    "105-165",
    2109589,
    2169589,
    "547 of 68,870 events (first 2,110,024, last 2,169,440): the third Avenging Wrath at 2,127,413 and the last twenty spender decisions of the window, plus nothing after the capture's end.",
  ),
  artifact(RET_GTKB, wcl(RET_GTKB), {
    kind: "SANITIZED_CAPTURE",
    source: HIGH_OPENER_SOURCE,
    transformations: [
      selection(
        `node scripts/sanitize-probe.mjs .probe/m9c2-opener-pages.json ${RET_GTKB}.json --actor-slice 23 --families ${PPB_FAMILIES}`,
        "The two page envelopes concatenated in page order, then the --actor-slice predicate for ACTOR 23 (the second Retribution Paladin subject: same build as actor 6, faction value 0, a different two-handed main hand) unbounded, restricted by --families to the same thirteen raw types. In place and order preserved, 289 of 18,318 events: 50 casts (48 by actor 23, 2 targeting it), 38 resourcechange, 200 aura transitions, actor 23's combatantinfo at 2,415,042; first event 2,415,042, last 2,434,906.",
        ACTOR_SLICE_INVALIDATIONS,
      ).with_revision(SLICER_REVISION_6),
      credential_scan(SLICER_REVISION_6),
    ],
    grants: [
      {
        categories: PPB_CATEGORIES,
        actorScope: [RET_GTKB_ACTOR],
        ranges: [{ fromReportTimeMs: HP_START, toReportTimeMs: HP_END }],
      },
    ],
    coverageBasis:
      "The retained families are complete for actor 23 over [2,415,041 .. 2,435,041] by the predicate 'every event actor 23 sources or is targeted by, of a retained family' over a window the capture retrieved COMPLETE with NO actor filter (two pages, terminal). CASTS and RESOURCES are complete as the source of its own casts and the actor its snapshots describe; AURAS as their target; COMBATANT_INFO and GEAR as the subject of its one combatantinfo. DAMAGE, HEALING, ABSORBS and SUMMONS are NOT granted. The window begins at the fight start.",
    retainedFor:
      "M11-A4: the second Retribution subject on a different report, pull and boss (Sszorak heroic), cut by the same predicate as the A7R6 subject so the same executors run over it. Twenty seconds of opener: every spender decision in it lies inside the first Avenging Wrath or before any cooldown is anchored, so the population is the fail-closed one — 15 eligible, 15 UNKNOWN — with its Holy Power observations and aura bindings recorded.",
    limitations: [
      "The first 20 seconds only: nothing about the rest of the pull, its cooldown cycles or its ending.",
      "No damage, healing, absorb or summon event is retained.",
      "Cooldown state at the pull is outside the log.",
      "Sszorak has adds; nothing about target count is claimed here or anywhere in the corpus.",
      NO_NAMES,
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  // ---- M11-B2: the Blood Death Knight subject, same captures, same predicate ----
  artifact(BLOOD45, wcl(BLOOD45), {
    kind: "SANITIZED_CAPTURE",
    source: PROT_OPENER_SOURCE,
    transformations: [
      selection(
        `node scripts/sanitize-probe.mjs .probe/m10b-pages.json ${BLOOD45}.json --actor-slice 14 2049581 --families ${PPB_FAMILIES}`,
        "The same four page envelopes as the Protection opener, concatenated in page order, then the --actor-slice predicate for ACTOR 14 bounded at the capture's last timestamp (2,049,581) and restricted by --families to the same thirteen raw types. In place and order preserved, 913 of 30,588 events: 136 casts (107 by actor 14, 29 targeting it), 89 resourcechange (all targeting 14), 687 aura transitions (594 targeting 14, 93 sourced by 14 on others), actor 14's combatantinfo at the fight start; first event 2,004,589, last 2,049,534. Damage, healing, absorb and summon events involving actor 14 were FILTERED OUT by family, not trimmed within a family.",
        ACTOR_SLICE_INVALIDATIONS,
      ).with_revision(SLICER_REVISION_6),
      credential_scan(SLICER_REVISION_6),
    ],
    grants: [
      {
        categories: PPB_CATEGORIES,
        actorScope: [BLOOD],
        ranges: [{ fromReportTimeMs: PP_START, toReportTimeMs: PP45_END }],
      },
    ],
    coverageBasis:
      "The retained families are complete for actor 14 over [2,004,589 .. 2,049,581] by the predicate 'every event actor 14 sources or is targeted by, of a retained family, at or before the bound' over a window the capture retrieved COMPLETE with NO actor filter (four pages, terminal, revision 30 before and after). CASTS and RESOURCES are complete as the source of its own casts and the actor its snapshots describe; AURAS as their target; COMBATANT_INFO and GEAR as the subject of its one combatantinfo. DAMAGE, HEALING, ABSORBS and SUMMONS are NOT granted. The window begins at the fight start. Nothing is granted to any other actor, and nothing after the bound.",
    retainedFor:
      "M11-B2: the first 45 seconds of the Blood Death Knight subject (A7R6 fight 7 actor 14 — San'layn, Vampiric Strike, Gift of the San'layn, Visceral Strength, Insatiable Blade, faction 1), as the measurement slice needs it — every cast, every Rune and Runic Power snapshot and every aura transition on or by the subject from the pull, with the combatantinfo. It carries the first Dancing Rune Weapon at 2,007,757 with its Gift of the San'layn window (2,007,757 .. 2,019,763), the first Raise Dead at 2,008,457, the Bone Shield stack stream (17 applybuffstack, 8 removebuffstack, 26 refreshbuff), and 48 supported decisions (16 Death Strike, 12 Heart Strike, 14 Vampiric Strike, 3 Blood Boil, 2 Marrowrend, 1 Death's Caress) plus 4 Death and Decay casts the slice observes and does not judge; the first part of the 165 s bundle. Also the wire corroboration for the RUNES and RUNIC_POWER contracts (src/data/wcl-wire/resource-types.ts).",
    limitations: [
      "Forty-five seconds of a 424-second kill: nothing about the fight's later cooldown cycles or its ending.",
      "No damage, healing, absorb or summon event is retained.",
      "Cooldown state at the pull is outside the log: nothing here says whether any ability was on cooldown when the fight began, and no Vampiric Blood transition occurs in the window, so buff.vampiric_blood.up is UNKNOWN at every decision of this slice on its own.",
      "The subject's race is not in the evidence and is not inferred; racial entries of the pinned list are outside the rotational decision domain (M11-A4 boundary).",
      NO_NAMES,
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  blood_segment(
    "45-105",
    2049581,
    2109589,
    "967 of 68,870 events (first 2,049,819, last 2,109,337): 124 casts (86 by actor 14, 38 targeting it), 89 resourcechange, 754 aura transitions (636 targeting 14, 118 sourced by 14 on others), no combatantinfo. This segment's --from equals the 45 s slice's grant end (2,049,581): the two share no event, and the millisecond interval between that grant and this capture's window start is certified empty below. It holds the first Vampiric Blood at 2,087,109 (aura 55233 applied 2,087,109, removed 2,097,114) and the second Dancing Rune Weapon at 2,099,885 with its Gift application; 36 supported decisions (15 Death Strike, 9 Heart Strike, 7 Vampiric Strike, 3 Blood Boil, 1 Marrowrend, 1 Death's Caress) and 4 Death and Decay casts.",
    {
      certifiedEmpty: [
        {
          fromReportTimeMs: 2049582,
          toReportTimeMs: 2049588,
          precedingArtifactId: BLOOD45,
          basis:
            "The M10-B capture requested [2,004,589 .. 2,049,589) — an EXCLUSIVE end of 2,049,589 — and paginated to a terminal page whose last event is 2,049,581, so every event the report holds before 2,049,589 was retrieved and the 45 s slice (every actor-14 event of the retained families in that capture) retained none in [2,049,582 .. 2,049,588]; this capture begins at 2,049,589 and its first event is 2,049,590. The loader re-checks both captures' recorded windows and completeness and that neither artifact retains an event inside the interval.",
        },
      ],
    },
  ),
  blood_segment(
    "105-165",
    2109589,
    2169589,
    "821 of 68,870 events (first 2,109,652, last 2,169,439): 106 casts (78 by actor 14, 28 targeting it), 67 resourcechange, 648 aura transitions (534 targeting 14, 114 sourced by 14 on others), no combatantinfo. It holds the second Gift removal at 2,111,891, the second Raise Dead at 2,128,448 and the second Vampiric Blood at 2,149,299 (aura removed 2,159,301); 39 supported decisions (13 Death Strike, 11 Heart Strike, 6 Vampiric Strike, 6 Blood Boil, 2 Marrowrend, 1 Death's Caress) and 3 Death and Decay casts, plus nothing after the capture's end.",
  ),
  artifact(BLOOD_GTKB, wcl(BLOOD_GTKB), {
    kind: "SANITIZED_CAPTURE",
    source: HIGH_OPENER_SOURCE,
    transformations: [
      selection(
        `node scripts/sanitize-probe.mjs .probe/m9c2-opener-pages.json ${BLOOD_GTKB}.json --actor-slice 14 --families ${PPB_FAMILIES}`,
        "The two page envelopes concatenated in page order, then the --actor-slice predicate for ACTOR 14 (the second Blood Death Knight subject: the same San'layn build as the A7R6 subject, faction value 0, a different belt and legs) unbounded, restricted by --families to the same thirteen raw types. In place and order preserved, 355 of 18,318 events: 55 casts (51 by actor 14, 4 targeting it), 45 resourcechange, 254 aura transitions (228 targeting 14, 26 sourced by 14 on others), actor 14's combatantinfo at 2,415,042; first event 2,415,042, last 2,435,006.",
        ACTOR_SLICE_INVALIDATIONS,
      ).with_revision(SLICER_REVISION_6),
      credential_scan(SLICER_REVISION_6),
    ],
    grants: [
      {
        categories: PPB_CATEGORIES,
        actorScope: [BLOOD_GTKB_ACTOR],
        ranges: [{ fromReportTimeMs: HP_START, toReportTimeMs: HP_END }],
      },
    ],
    coverageBasis:
      "The retained families are complete for actor 14 over [2,415,041 .. 2,435,041] by the predicate 'every event actor 14 sources or is targeted by, of a retained family' over a window the capture retrieved COMPLETE with NO actor filter (two pages, terminal). CASTS and RESOURCES are complete as the source of its own casts and the actor its snapshots describe; AURAS as their target; COMBATANT_INFO and GEAR as the subject of its one combatantinfo. DAMAGE, HEALING, ABSORBS and SUMMONS are NOT granted. The window begins at the fight start.",
    retainedFor:
      "M11-B2: the second Blood Death Knight subject on a different report, pull and boss (Sszorak heroic), cut by the same predicate as the A7R6 subject so the same executors run over it. Twenty seconds of opener: the Dancing Rune Weapon, Raise Dead and on-use trinket all at 2,417,020 (+1,978 ms), the Gift of the San'layn window 2,417,020 .. 2,429,050, and 21 supported decisions (6 Death Strike, 3 Heart Strike, 7 Vampiric Strike, 4 Blood Boil, 1 Death's Caress) plus 2 Death and Decay casts. It also holds the two Death Strike casts whose attached Runic Power (440, 390) is BELOW the wire's reported cost (450), the evidence that the cost field is the base cost.",
    limitations: [
      "The first 20 seconds only: nothing about the rest of the pull, its cooldown cycles or its ending.",
      "No damage, healing, absorb or summon event is retained.",
      "Cooldown state at the pull is outside the log; no Vampiric Blood transition occurs in the window.",
      "Sszorak has adds; nothing about target count is claimed here or anywhere in the corpus.",
      NO_NAMES,
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  // ---- M11-C2: the Brewmaster Monk subject, same capture, same predicate ----
  artifact(BREWMASTER_GTKB, wcl(BREWMASTER_GTKB), {
    kind: "SANITIZED_CAPTURE",
    source: HIGH_OPENER_SOURCE,
    transformations: [
      selection(
        `node scripts/sanitize-probe.mjs .probe/m9c2-opener-pages.json ${BREWMASTER_GTKB}.json --actor-slice 4 --families ${PPB_FAMILIES}`,
        "The two page envelopes concatenated in page order, then the --actor-slice predicate for ACTOR 4 (the Brewmaster Monk of gtKb fight 22: specID 268, Shado-Pan, faction value 0) unbounded, restricted by --families to the same thirteen raw types. In place and order preserved, 305 of 18,318 events: 44 casts (33 by actor 4, 11 targeting it), no resourcechange (the capture holds none involving actor 4 in the window; Energy rides only on the casts' own resource snapshots), 260 aura transitions (222 targeting 4, 38 sourced by 4 on others), actor 4's combatantinfo at 2,415,041; first event 2,415,041, last 2,434,926.",
        ACTOR_SLICE_INVALIDATIONS,
      ).with_revision(SLICER_REVISION_6),
      credential_scan(SLICER_REVISION_6),
    ],
    grants: [
      {
        categories: PPB_CATEGORIES,
        actorScope: [BREWMASTER_GTKB_ACTOR],
        ranges: [{ fromReportTimeMs: HP_START, toReportTimeMs: HP_END }],
      },
    ],
    coverageBasis:
      "The retained families are complete for actor 4 over [2,415,041 .. 2,435,041] by the predicate 'every event actor 4 sources or is targeted by, of a retained family' over a window the capture retrieved COMPLETE with NO actor filter (two pages, terminal). CASTS and RESOURCES are complete as the source of its own casts and the actor its snapshots describe; AURAS as their target; COMBATANT_INFO and GEAR as the subject of its one combatantinfo. DAMAGE, HEALING, ABSORBS and SUMMONS are NOT granted. The window begins at the fight start.",
    retainedFor:
      "M11-C2: the Brewmaster Monk measurement subject (gtKb fight 22 actor 4 — Shado-Pan, Blackout Combo, Sal'salabim's Strength, Celestial Infusion, all three Bring Me Another tiers), cut by the same predicate as the Retribution and Blood gtKb subjects so the same executors run over it. Twenty seconds of opener: 15 supported decisions (4 Keg Smash, 4 Blackout Kick, 3 Tiger Palm, 3 Breath of Fire, 1 Invoke Niuzao at 2,419,027), 3 Purifying Brew casts, 7 melee swings, the Blackout Combo, Empty Barrel and Invoke Niuzao aura lifecycles that corroborate the pinned Brewmaster aura identities, and no Exploding Keg or Empty the Cellar cast or aura.",
    limitations: [
      "The first 20 seconds only: nothing about the rest of the pull, its cooldown cycles or its ending.",
      "No damage, healing, absorb or summon event is retained.",
      "Cooldown state at the pull is outside the log; no aura present at the pull is observed until its first in-fight transition.",
      "Sszorak has adds; nothing about target count is claimed here or anywhere in the corpus.",
      NO_NAMES,
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  // ---- M11-C4: the Brewmaster extension segment, adjoining the opener ----
  artifact(BREWMASTER_GTKB_20_165, wcl(BREWMASTER_GTKB_20_165), {
    kind: "SANITIZED_CAPTURE",
    source: GTKB_EXT_SOURCE,
    transformations: [
      selection(
        `node scripts/sanitize-probe.mjs .probe/m11c4-pages.json ${BREWMASTER_GTKB_20_165}.json --actor-slice 4 ${String(GTKB_EXT_END)} --from ${String(GTKB_EXT_START)} --families ${PPB_FAMILIES}`,
        `The twelve page envelopes concatenated in page order, then the --actor-slice predicate for ACTOR 4 with --from ${String(GTKB_EXT_START)} (exclusive) and the bound ${String(GTKB_EXT_END)} (inclusive), restricted by --families to the same thirteen raw types as the opener slice. In place and order preserved, 1,436 of 118,289 events: 227 casts (197 by actor 4, 30 targeting it), no resourcechange, 1,209 aura transitions (1,030 targeting 4, 179 sourced by 4 on others), no combatantinfo; first event 2,435,113, last 2,579,843. The --from bound equals the opener slice's grant end (2,435,041, inclusive there), so the two share no event: the seven capture events at 2,435,041 lie in both captures and none involves actor 4. It holds 26 Keg Smash, 24 Breath of Fire, 24 Blackout Kick, 23 Tiger Palm, 11 Purifying Brew, 2 Exploding Keg, 2 Chi Burst, 1 Invoke Niuzao and 1 Fortifying Brew cast by actor 4.`,
        ACTOR_SLICE_INVALIDATIONS,
      ).with_revision(SLICER_REVISION_6),
      credential_scan(SLICER_REVISION_6),
    ],
    grants: [
      {
        categories: PPB_CATEGORIES,
        actorScope: [BREWMASTER_GTKB_ACTOR],
        ranges: [{ fromReportTimeMs: GTKB_EXT_START + 1, toReportTimeMs: GTKB_EXT_END }],
      },
    ],
    coverageBasis: `The retained families are complete for actor 4 over [${(GTKB_EXT_START + 1).toLocaleString("en-US")} .. ${GTKB_EXT_END.toLocaleString("en-US")}] by the predicate 'every event actor 4 sources or is targeted by, of a retained family, with timestamp in that range' over a window the capture retrieved COMPLETE with NO actor filter (twelve pages, terminal, revision 22 before and after, equal to the opener capture's). CASTS and RESOURCES are complete as the source of its own casts and the actor its snapshots describe; AURAS as their target; COMBATANT_INFO and GEAR as the subject of the combatantinfo the bundle's first part holds. DAMAGE, HEALING, ABSORBS and SUMMONS are NOT granted. The segment is one part of a bundle: it grants nothing before its own first millisecond, and the bundle composer joins it to the opener slice only because the grants are adjacent (the opener's ends at 2,435,041, this one begins at 2,435,042).`,
    retainedFor:
      "M11-C4: the Brewmaster Monk evidence closure — the same subject's +20 s .. +165 s, committed under the 512 KiB limit and composed with the M11-C2 opener slice by the bundle composer. History for every evaluated decision begins at the pull through the opener slice; the whole 165 s bundle is the evaluation window. The opener slice stays its own regression case.",
    limitations: [
      "One segment of a longer window: on its own it grants no coverage before its first millisecond and proves nothing about continuity across its boundaries; only a composed bundle does.",
      "No damage, healing, absorb or summon event is retained.",
      "Cooldown state at the pull is outside the log; what a later decision knows comes from observed casts in the bundle's history.",
      "Sszorak has adds; nothing about target count is claimed here or anywhere in the corpus.",
      NO_NAMES,
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  // ---- M11-C4f: the second Brewmaster subject's fixed 20 s opener (regression fixture) ----
  artifact(BREWMASTER_RXAF_OPENER, wcl(BREWMASTER_RXAF_OPENER), {
    kind: "SANITIZED_CAPTURE",
    source: RXAF_EVENTS_SOURCE,
    transformations: [
      selection(
        `node scripts/sanitize-probe.mjs .probe/m11c4f/pages.json ${BREWMASTER_RXAF_OPENER}.json --actor-slice 11 ${String(RXAF_OPENER_END)} --families ${PPB_FAMILIES}`,
        "The seventeen page envelopes concatenated in page order, then the --actor-slice predicate for ACTOR 11 bounded at 2,460,995 (inclusive, fight start + 20 s — fixed by time, before any analyzer ran), restricted by --families to the same thirteen raw types as the first Brewmaster subject. In place and order preserved, 331 of 165,448 events: 57 casts (44 by actor 11, 13 targeting it), no resourcechange, 273 aura transitions (235 targeting 11, 38 sourced by 11 on others), actor 11's combatantinfo at 2,440,995 (specID 268); first event 2,440,995, last 2,460,994.",
        ACTOR_SLICE_INVALIDATIONS,
      ).with_revision(SLICER_REVISION_6),
      credential_scan(SLICER_REVISION_6),
    ],
    grants: [
      {
        categories: PPB_CATEGORIES,
        actorScope: [RXAF_ACTOR],
        ranges: [{ fromReportTimeMs: RXAF_START, toReportTimeMs: RXAF_OPENER_END }],
      },
    ],
    coverageBasis:
      "The retained families are complete for actor 11 over [2,440,995 .. 2,460,995] by the predicate 'every event actor 11 sources or is targeted by, of a retained family' over a window the capture retrieved COMPLETE with NO actor filter (seventeen pages, terminal, revision 27 before and after). CASTS and RESOURCES are complete as the source of its own casts and the actor its snapshots describe; AURAS as their target; COMBATANT_INFO and GEAR as the subject of its one combatantinfo. DAMAGE, HEALING, ABSORBS and SUMMONS are NOT granted. The window begins at the fight start.",
    retainedFor:
      "M11-C4f: the neutral second Brewmaster subject (rXAfw9t1q8YpmkKD fight 13 actor 11 — Shado-Pan), selected by the fixed rule before any analyzer ran. The fixed pull .. +20 s opener is its regression fixture; the rest of the fixed 165 s window, the fight context and the selection frame are retained in the evidence archive.",
    limitations: [
      "The first 20 seconds only: the rest of the subject's fixed 165 s evidence window is in the evidence archive.",
      "No damage, healing, absorb or summon event is retained.",
      "Cooldown state at the pull is outside the log; no aura present at the pull is observed until its first in-fight transition.",
      "Sszorak has adds; nothing about target count is claimed here or anywhere in the corpus.",
      NO_NAMES,
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
];

// --------------------------------------------------------------------------
// Cases
// --------------------------------------------------------------------------

const SIMC = { authorityId: "SIMC_APL_ROGUE_ASSASSINATION", artifactRevision: "simc-33622e9d-1" };
const DOTS = { authorityId: "SIMC_DBC_ROGUE_DOT_DURATIONS", artifactRevision: "simc-33622e9d-1" };

function kase(
  caseId,
  artifactId,
  owningLayer,
  contractUnderTest,
  purpose,
  assertions,
  basis,
  rationale,
  options = {},
) {
  return {
    caseId,
    artifactId,
    owningLayer,
    contractUnderTest,
    purpose,
    assertions,
    rationale: { basis, text: rationale },
    authority: options.authority ?? null,
    limitations: options.limitations ?? [],
    relatedTests: options.related ?? [],
  };
}

const a = (kind, params) => ({ kind, params });

const cast = (actor, t, ability) => ({ actorId: actor, reportTimeMs: t, abilityGameId: ability });

const before_cast = (actor, t, ability) => ({ kind: "BEFORE_CAST", cast: cast(actor, t, ability) });

const end_of = (t) => ({ kind: "END_OF_TIMESTAMP", reportTimeMs: t });

const aura = (target, ability, source, auraClass = "BUFF") => ({
  targetActorId: target,
  abilityGameId: ability,
  auraClass,
  sourceActorId: source,
});

const unknown = (reason) => ({ certainty: "UNKNOWN", reason });

const D2 = "wcl-assassination-d2-decision-corpus";
const [GARROTE, ENVENOM, DEATHMARK, KINGSBANE, VANISH_ACTION, VANISH_BUFF, MELEE] = [
  703, 32645, 360194, 385627, 1856, 11327, 1,
];
const [RUPTURE, SHIV] = [1943, 5938];
const Q = 2176580;

// M10-B: the Protection Paladin opener. Ability ids are retained as numbers and
// named here only so a reviewer can follow the case; no case reads a name.
const PP = "wcl-protection-paladin-a7r6-opener";
const PP_GAP = "wcl-protection-paladin-a7r6-opener.gap-before-2010000";
const A7R6_CONTEXT = "wcl-fight-context-a7r6-fight-7";
const TANK = 7;
/** A7R6 fight 7 actor 4 — Warrior/Arms per the committed fight-context artifact: the canonical UNSUPPORTED identity since M10-D. */
const ARMS = 4;
const PROT_ANALYZER = "paladin-protection-observed-decisions";
const PROT_ANALYZED_ENVELOPE = {
  status: "ANALYZED",
  specId: "paladin/protection",
  analyzerId: PROT_ANALYZER,
  scope: "PLAYER_CONTEXT",
};
const BOSS_21 = 21;
const [SHIELD_OF_THE_RIGHTEOUS, ARDENT_DEFENDER, AVENGING_WRATH] = [53600, 31850, 31884];
const HOLY_POWER_WIRE = 9;
const PP_END_OF_SLICE = 2026421;
const pp_sotr = (t) => cast(TANK, t, SHIELD_OF_THE_RIGHTEOUS);
const pp_hp_pre_cost = (t, amount) =>
  a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
    actorId: TANK,
    abilityGameId: SHIELD_OF_THE_RIGHTEOUS,
    reportTimeMs: t,
    resourceWireType: HOLY_POWER_WIRE,
    expected: {
      certainty: "EXACT",
      observedAmount: amount,
      observedMax: 5,
      observedCost: 3,
      timing: "PRE_COST",
    },
  });
const pp_no_observation = (t, wireType) =>
  a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
    actorId: TANK,
    abilityGameId: SHIELD_OF_THE_RIGHTEOUS,
    reportTimeMs: t,
    resourceWireType: wireType,
    expected: unknown("NO_OBSERVATION"),
  });
const PP_SOURCE_CENSUS = {
  COMBATANT_INFO: 1,
  CAST: 45,
  RESOURCE_CHANGE: 17,
  AURA: 280,
  DAMAGE: 196,
  HEALING: 182,
  ABSORB: 50,
  SUMMON: 1,
};
const PP_TARGET_CENSUS = { CAST: 13, RESOURCE_CHANGE: 17, AURA: 181, DAMAGE: 36, HEALING: 159, ABSORB: 55 };
const PP_RELATED = [
  "tests/unit/m5-runtime-data-provenance.test.ts",
  "tests/regression/m4-resource-state-is-never-simulated.test.ts",
];

// M10-C: the internal Protection Paladin evaluator over the same evidence.
const PROT_SIMC = { authorityId: "SIMC_APL_PALADIN_PROTECTION", artifactRevision: "simc-33622e9d-1" };
const [PP_JUDGMENT, PP_BLESSED_HAMMER, PP_AVENGERS_SHIELD, PP_CONSECRATION] = [275779, 204019, 31935, 26573];
const PP_PROVENANCE = {
  authorityId: "SIMC_APL_PALADIN_PROTECTION",
  artifactRevision: "simc-33622e9d-1",
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/class_modules/apl/apl_paladin.cpp",
  sourceSha256: "ed3fb1ac5b1c6c83bf21abbcaff5afe282678a69d51bdc953cc9897dca94bc02",
};
/**
 * The one answer the real evidence supports for every eligible decision at
 * M10-C4: UNKNOWN because the explored worlds select DIFFERENT first GCD
 * entries. Every NON_GCD entry above the first GCD candidate now transitions
 * — `use_item` NOT_APPLICABLE by pinned identity, `use_items` closed under
 * the dated Warcraft Logs gear contract (WCL_COMBATANT_INFO_GEAR_UI_SEMANTICS_
 * 2026_09_17) with the reviewed Ula'tek contract, potion, wings, fireblood
 * and Shield of the Righteous by reviewed contract — and the scan reaches the
 * GCD candidates whose readiness the 22 s window cannot establish (Divine
 * Toll in the branch where wings fired, Holy Armaments, Hammer of Wrath,
 * Avenger's Shield, Judgment's recharge). The engine's own blocker,
 * DIVERGENT_GCD_OUTCOMES, files under the public DIVERGENT_WORLDS class.
 */
const PP_UNKNOWN_DIVERGENT = {
  outcome: "UNKNOWN",
  basis: "AUTHORITY_SELECTION_UNRESOLVED",
  authorityCoverage: "UNKNOWN",
  authorityToken: null,
  selectionPrecision: null,
  decisiveBlocker: "DIVERGENT_WORLDS",
  rawBlocker: "DIVERGENT_GCD_OUTCOMES",
  observedActionRejected: false,
};
const pp_decision = (t, ability) =>
  a("SPEC_PROTECTION_PALADIN.DECISION_COVERAGE", {
    actorId: TANK,
    targetActorId: null,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    expected: PP_UNKNOWN_DIVERGENT,
  });
const pp_hp_recorded = (t, amount) =>
  a("SPEC_PROTECTION_PALADIN.HOLY_POWER_OBSERVATION", {
    actorId: TANK,
    cast: { reportTimeMs: t, abilityGameId: SHIELD_OF_THE_RIGHTEOUS },
    expected: { state: "EXACT_PRE_COST", amount, max: 5, cost: 3 },
  });
const pp_hp_missing = (t, ability) =>
  a("SPEC_PROTECTION_PALADIN.HOLY_POWER_NOT_OBSERVED", {
    actorId: TANK,
    cast: { reportTimeMs: t, abilityGameId: ability },
  });
const pp_atom = (t, ability, atom, expected) =>
  a("SPEC_PROTECTION_PALADIN.RESOLVED_ATOM", {
    actorId: TANK,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    atom,
    expected,
  });
const pp_domain = (domain, expected) =>
  a("SPEC_PROTECTION_PALADIN.DOMAIN_RESULT", { actorId: TANK, domain, expected });
const PP_NO_AUTHORITY = {
  resolution: "NO_PINNED_AUTHORITY_FOR_DOMAIN",
  authorityId: null,
  offensiveAuthorityGoverns: false,
  evidenceFamily: null,
};
const PP_AUTHORITY = {
  ...PROT_SIMC,
  requiredStateEvidence: [
    "the combatantinfo at 2,004,589 for actor 7 (specID 66, 80-node talent tree)",
    "every COMPLETE cast by actor 7 in the slice, in canonical order",
    "the Holy Power entry on each costed Shield of the Righteous cast",
  ],
};
const PP_C_RELATED = [
  "tests/contracts/m10c-protection-evaluator.test.ts",
  "tests/unit/m10c-protection-resolver.test.ts",
  "tests/regression/m10c-internal-registration-invariance.test.ts",
];

// M10-C5 Phase A: the whole 45-second capture of the same subject, and its
// predeclared gap derivative. Ability ids are named here only for a reader.
const PP45 = "wcl-protection-paladin-a7r6-rotational-45s";
const PP45_GAP = "wcl-protection-paladin-a7r6-rotational-45s.gap-before-2026589";
const [PP_DIVINE_TOLL, PP_HAMMER_OF_WRATH, PP_SENTINEL] = [375576, 1241413, 389539];
const PP45_SOURCE_CENSUS = { COMBATANT_INFO: 1, CAST: 101, RESOURCE_CHANGE: 43, AURA: 801 };
const PP45_TARGET_CENSUS = { CAST: 32, RESOURCE_CHANGE: 43, AURA: 502 };
/** The one real MATCH: the Divine Toll press, selected at default[6] by the exact entry. */
const PP_MATCH_DIVINE_TOLL = {
  outcome: "MATCH",
  basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
  authorityCoverage: "EXACT_ENTRY",
  authorityToken: "divine_toll",
  selectionPrecision: "EXACT_ENTRY",
  decisiveBlocker: null,
  rawBlocker: null,
  observedActionRejected: false,
};
const pp_decision_as = (t, ability, expected) =>
  a("SPEC_PROTECTION_PALADIN.DECISION_COVERAGE", {
    actorId: TANK,
    targetActorId: null,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    expected,
  });
const pp_cooldown = (t, ability, simcToken, expected) =>
  a("SPEC_PROTECTION_PALADIN.COOLDOWN_READINESS_AT", {
    actorId: TANK,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    simcToken,
    expected,
  });
const pp_aura = (t, ability, atomName, expected) =>
  a("SPEC_PROTECTION_PALADIN.AURA_BINDING_AT", {
    actorId: TANK,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    atomName,
    expected,
  });
const pp_not_ready = (provenRemainingAtLeastMs, anchorReportTimeMs, anchorAbilityGameId) => ({
  readiness: "PROVEN_NOT_READY",
  provenRemainingAtLeastMs,
  anchorReportTimeMs,
  anchorAbilityGameId,
  effectiveBaseMs: 60000,
  unknownReason: null,
});
const pp_cd_unknown = (unknownReason) => ({
  readiness: "UNKNOWN",
  provenRemainingAtLeastMs: null,
  anchorReportTimeMs: null,
  anchorAbilityGameId: null,
  effectiveBaseMs: null,
  unknownReason,
});
const PP_WINGS_UNBOUND = {
  state: "UNBOUND",
  up: null,
  abilityGameId: PP_SENTINEL,
  anchorReportTimeMs: null,
  reason: "AURA_STATE_UNKNOWN",
};
const PP45_AUTHORITY = {
  ...PROT_SIMC,
  requiredStateEvidence: [
    "the combatantinfo at 2,004,589 for actor 7 (specID 66, 80-node talent tree)",
    "every COMPLETE cast by actor 7 in the slice, in canonical order",
    "every aura transition on actor 7 sourced by actor 7, in canonical order",
    "the Holy Power entry on each costed Shield of the Righteous cast",
  ],
};
const PP_C5_RELATED = [
  "tests/contracts/m10c5-protection-evaluator.test.ts",
  "tests/unit/m10c5-protection-cooldown-bindings.test.ts",
  "tests/unit/m10c5-protection-aura-bindings.test.ts",
  "tests/regression/m10c-internal-registration-invariance.test.ts",
];

// M10-C5 Phase B2: the steady-state bundle. Five artifacts composed in order
// into ONE fight — Phase A's byte-identical 45 s slice, then the four measured
// segments cut from the Phase B1 capture — and the gap bundle that omits the
// 60–90 and 90–120 segments with its hole declared. Evaluation is confined to
// [+120 s, +165 s]; the history before it is what the decisions there rest on.
const PPB_45_60 = "wcl-protection-paladin-a7r6-rotational-165s.seg-45-60";
const PPB_60_90 = "wcl-protection-paladin-a7r6-rotational-165s.seg-60-90";
const PPB_90_120 = "wcl-protection-paladin-a7r6-rotational-165s.seg-90-120";
const PPB_120_165 = "wcl-protection-paladin-a7r6-rotational-165s.seg-120-165";
const PPB_HISTORY = [PP45, PPB_45_60, PPB_60_90, PPB_90_120];
const PPB_GAP_HISTORY = [PP45, PPB_45_60];
const PPB_HOLE = { fromReportTimeMs: 2064590, toReportTimeMs: 2124589 };
const PPB_WINDOW = { fromReportTimeMs: 2124589, toReportTimeMs: 2169589 };
const PPB_FULL = { historyArtifactIds: PPB_HISTORY, declaredHoles: [] };
const PPB_GAP = { historyArtifactIds: PPB_GAP_HISTORY, declaredHoles: [PPB_HOLE] };
const [PP_HOLY_BULWARK, PP_SACRED_WEAPON, PP_WORD_OF_GLORY] = [432459, 432472, 85673];
const [PP_VANGUARD_BUFF, PP_HOW_READINESS_BUFF] = [1268810, 1277026];
const PPB_AUTHORITY = {
  ...PROT_SIMC,
  requiredStateEvidence: [
    "the combatantinfo at 2,004,589 for actor 7 (specID 66, 80-node talent tree), carried by the first part",
    "every COMPLETE cast by actor 7 across the composed parts, in canonical order",
    "every aura transition on actor 7 sourced by actor 7 across the composed parts, in canonical order",
    "the zero-event certificate over [2,049,582 .. 2,049,588] between the first two parts",
  ],
};
const PPB_RELATED = [
  "tests/contracts/m10c5-protection-evaluator.test.ts",
  "tests/unit/m10c5b-armament-state.test.ts",
  "tests/unit/m10c5b-corpus-bundle.test.ts",
  "tests/unit/m10c5-protection-aura-bindings.test.ts",
  "tests/unit/m10c5-protection-cooldown-bindings.test.ts",
  "tests/regression/m10c-internal-registration-invariance.test.ts",
];
const ppb_decision = (bundle, t, ability, expected = PP_UNKNOWN_DIVERGENT) =>
  a("SPEC_PROTECTION_PALADIN.DECISION_COVERAGE", {
    actorId: TANK,
    ...bundle,
    targetActorId: null,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    expected,
  });
const ppb_cooldown = (bundle, t, ability, simcToken, expected) =>
  a("SPEC_PROTECTION_PALADIN.COOLDOWN_READINESS_AT", {
    actorId: TANK,
    ...bundle,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    simcToken,
    expected,
  });
const ppb_aura = (bundle, t, ability, atomName, expected) =>
  a("SPEC_PROTECTION_PALADIN.AURA_BINDING_AT", {
    actorId: TANK,
    ...bundle,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    atomName,
    expected,
  });
const ppb_atom = (bundle, t, ability, atom, expected) =>
  a("SPEC_PROTECTION_PALADIN.RESOLVED_ATOM", {
    actorId: TANK,
    ...bundle,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    atom,
    expected,
  });
const ppb_armament = (bundle, t, ability, expected) =>
  a("SPEC_PROTECTION_PALADIN.ARMAMENT_STATE_AT", {
    actorId: TANK,
    ...bundle,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    expected,
  });
const ppb_known = (nextArmament, anchorReportTimeMs, anchorAbilityGameId) => ({
  state: "KNOWN",
  nextArmament,
  anchorReportTimeMs,
  anchorAbilityGameId,
  reason: null,
});
const ppb_bound = (up, abilityGameId, anchorReportTimeMs) => ({
  state: "BOUND",
  up,
  abilityGameId,
  anchorReportTimeMs,
  reason: null,
});
const ppb_unbound = (abilityGameId) => ({
  state: "UNBOUND",
  up: null,
  abilityGameId,
  anchorReportTimeMs: null,
  reason: "AURA_STATE_UNKNOWN",
});
const ppb_by_build = (abilityGameId, gate) => ({
  state: "BOUND_BY_BUILD",
  up: false,
  abilityGameId,
  anchorReportTimeMs: null,
  reason: gate,
});
/** A hasted cooldown: the binder refuses the base and readiness stays UNKNOWN by design. */
const PPB_HASTED_UNKNOWN = pp_cd_unknown("MODIFIERS_NOT_PROVEN_ABSENT");
/** The lower bound has elapsed: nothing proves NOT_READY, and nothing proves READY either. */
const PPB_ELAPSED_UNKNOWN = pp_cd_unknown(null);
const PP_MATCH_AVENGERS_SHIELD = { ...PP_MATCH_DIVINE_TOLL, authorityToken: "avengers_shield" };
const PPB_WINDOW_EXCLUSIONS = { MELEE_SWING: 16, NON_GCD_ACTION: 13, EXECUTION_LANE_NOT_ESTABLISHED: 3 };
const ppb_segment_case = (artifactId, label, events, source, target, hardcasts) =>
  kase(
    `normalization.protection-paladin-rotational-165s-${label}-normalizes-whole-and-in-order`,
    artifactId,
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts; supported-families.ts; scripts/sanitize-probe.mjs --actor-slice --from",
    `The ${String(events)}-event family-filtered actor-7 segment normalizes with every raw type recognised and every event kept in capture order: as SOURCE ${String(source.CAST)} casts, ${String(source.RESOURCE_CHANGE)} Holy Power changes, ${String(source.AURA)} aura transitions; as TARGET ${String(target.CAST)} casts, ${String(target.RESOURCE_CHANGE)} resource changes, ${String(target.AURA)} aura transitions. No combatantinfo: the segment starts strictly after the fight start, and the profile is carried by the first part of any bundle it joins. ${hardcasts}`,
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: events }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", { actorId: TANK, side: "SOURCE", expected: source }),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", { actorId: TANK, side: "TARGET", expected: target }),
    ],
    ["VALIDATED_EVIDENCE"],
    "The census is of the segment, never of the fight: exactly the families the --families option retained, between the recorded exclusive --from and inclusive --to bounds, and nothing else. On its own a segment analyzes to PROFILE_NOT_RESOLVED — there is no combatant profile in it — which is the correct refusal, not a smaller population.",
    { related: ["tests/unit/sanitize-probe.test.ts", "tests/unit/m10c5b-corpus-bundle.test.ts"] },
  );
const PPB_CASES = [
  ppb_segment_case(
    PPB_45_60,
    "seg-45-60",
    202,
    { CAST: 16, RESOURCE_CHANGE: 7, AURA: 134 },
    { CAST: 7, RESOURCE_CHANGE: 7, AURA: 123 },
    "No Holy Armaments hardcast lies in this segment.",
  ),
  ppb_segment_case(
    PPB_60_90,
    "seg-60-90",
    827,
    { CAST: 65, RESOURCE_CHANGE: 22, AURA: 601 },
    { CAST: 24, RESOURCE_CHANGE: 22, AURA: 474 },
    "Two Holy Armaments hardcasts lie in it: Sacred Weapon 432472 at 2,066,110 and Holy Bulwark 432459 at 2,075,421.",
  ),
  ppb_segment_case(
    PPB_90_120,
    "seg-90-120",
    723,
    { CAST: 60, RESOURCE_CHANGE: 21, AURA: 508 },
    { CAST: 25, RESOURCE_CHANGE: 21, AURA: 448 },
    "No Holy Armaments hardcast lies in this segment; the Hammer of Wrath readiness aura 1277026 is removed in it at 2,106,345.",
  ),
  ppb_segment_case(
    PPB_120_165,
    "seg-120-165",
    875,
    { CAST: 69, RESOURCE_CHANGE: 25, AURA: 654 },
    { CAST: 27, RESOURCE_CHANGE: 25, AURA: 514 },
    "Two Holy Armaments hardcasts lie in it: Sacred Weapon 432472 at 2,125,600 and Holy Bulwark 432459 at 2,167,398.",
  ),
  kase(
    "normalization.protection-paladin-165s-bundle-composes-five-parts-into-one-complete-fight",
    PPB_120_165,
    "NORMALIZATION",
    "tests/support/corpus/fight.ts bundleOverEvidence; loader.ts certificateErrors; scripts/corpus/build-manifest.mjs certifiedEmpty",
    "The five parts — the Phase A 45 s slice (byte-identical, its grant ending at 2,049,581), then the segments granted from 2,049,589, 2,064,590, 2,094,590 and 2,124,590 — compose into one 3,720-event fight over [2,004,589 .. 2,169,554] with CASTS, AURAS, RESOURCES, COMBATANT_INFO and GEAR each COMPLETE over ONE joined range [2,004,589 .. 2,169,589]. The seven milliseconds [2,049,582 .. 2,049,588] between the first two parts are not silently widened over: the seg-45-60 record carries a zero-event certificate for exactly that interval, validated by the loader against both terminal captures, and the composer joins across it only because the certificate exists.",
    [
      a("NORMALIZATION.BUNDLE_COMPOSITION", {
        historyArtifactIds: PPB_HISTORY,
        declaredHoles: [],
        actorId: TANK,
        expected: {
          events: 3720,
          coverage: {
            CASTS: "COMPLETE",
            AURAS: "COMPLETE",
            RESOURCES: "COMPLETE",
            COMBATANT_INFO: "COMPLETE",
            GEAR: "COMPLETE",
            DAMAGE: "ABSENT",
            HEALING: "ABSENT",
            ABSORBS: "ABSENT",
            SUMMONS: "ABSENT",
          },
          castRanges: [{ fromReportTimeMs: 2004589, toReportTimeMs: 2169589 }],
          windowFromReportTimeMs: 2004589,
          windowToReportTimeMs: 2169554,
        },
      }),
    ],
    ["VALIDATED_EVIDENCE"],
    "Composition is a claim about coverage, and coverage is never inferred from the bytes: two grants join only where adjacent or bridged by a machine-validated certificate, every part must descend from the same capture with the same actor scope, events must not go backwards across a boundary, and no event row may appear on both sides of one. An undeclared hole, an overlap, a reversed segment, a duplicate boundary row, a certificate that does not fit its neighbours or a digest that does not match the record all refuse the composition — the layer tests exercise each refusal. The families the slicer dropped stay ABSENT.",
    { related: ["tests/unit/m10c5b-corpus-bundle.test.ts", "tests/unit/m9b-corpus-loader.test.ts"] },
  ),
  kase(
    "normalization.protection-paladin-165s-gap-bundle-keeps-exactly-the-declared-hole",
    PPB_120_165,
    "NORMALIZATION",
    "tests/support/corpus/fight.ts bundleOverEvidence (declared holes)",
    "With the 60–90 and 90–120 segments omitted and the hole [2,064,590 .. 2,124,589] declared, the three remaining parts compose into a 2,170-event fight over the same window whose CASTS, AURAS, RESOURCES, COMBATANT_INFO and GEAR are PARTIAL: two covered ranges, [2,004,589 .. 2,064,589] and [2,124,590 .. 2,169,589], with exactly the declared hole between them.",
    [
      a("NORMALIZATION.BUNDLE_COMPOSITION", {
        historyArtifactIds: PPB_GAP_HISTORY,
        declaredHoles: [PPB_HOLE],
        actorId: TANK,
        expected: {
          events: 2170,
          coverage: {
            CASTS: "PARTIAL",
            AURAS: "PARTIAL",
            RESOURCES: "PARTIAL",
            COMBATANT_INFO: "PARTIAL",
            GEAR: "PARTIAL",
            DAMAGE: "ABSENT",
          },
          castRanges: [
            { fromReportTimeMs: 2004589, toReportTimeMs: 2064589 },
            { fromReportTimeMs: 2124590, toReportTimeMs: 2169589 },
          ],
          windowFromReportTimeMs: 2004589,
          windowToReportTimeMs: 2169554,
        },
      }),
    ],
    ["VALIDATED_EVIDENCE"],
    "A hole is admissible only when declared exactly: the composer computes the holes from the joined grants and refuses when the declared set and the computed set differ in either direction. Inside the hole the fight is PARTIAL, and every claim that spans it fails its gate downstream — no state carries across a declared hole.",
    { related: ["tests/unit/m10c5b-corpus-bundle.test.ts"] },
  ),
  kase(
    "spec-protection-paladin.steady-state-window-population-is-thirty-seven-with-one-real-match",
    PPB_120_165,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/observed-analysis.ts analyzeObservedProtectionPaladinDecisions; tests/support/corpus/executors/spec-protection-paladin.ts (evaluationWindow)",
    "Over the composed 165 s fight, evaluated only inside [+120 s, +165 s] (report time [2,124,589 .. 2,169,589]), the evaluator finds 37 eligible GCD decisions — 11 Judgments, 13 Blessed Hammers, 5 Avenger's Shields, 4 Word of Glory, 2 Consecrations, 2 Holy Armaments hardcasts — and excludes 32 casts in the window by name: 16 melee swings, 13 NON_GCD presses, 3 abilities with no pinned lane. Of the 37: 1 MATCH, 0 REJECTED, 36 UNKNOWN. The 36 block at five entries: 18 at default[6] divine_toll (from 2,148,837 on, the Divine Toll and wings cooldowns anchored at 2,088,835 / 2,088,344 have elapsed and a hypothetical wings press reopens the branch), 9 at default[15] consecration, 5 at default[13] avengers_shield, 3 at default[14] holy_armaments, 1 at default[9] holy_armaments.",
    [
      a("SPEC_PROTECTION_PALADIN.COVERAGE_SUMMARY", {
        actorId: TANK,
        ...PPB_FULL,
        evaluationWindow: PPB_WINDOW,
        expected: {
          eligibleDecisions: 37,
          match: 1,
          rejected: 0,
          unknown: 36,
          exclusions: PPB_WINDOW_EXCLUSIONS,
        },
      }),
      a("SPEC_PROTECTION_PALADIN.UNKNOWN_BLOCKER_DISTRIBUTION", {
        actorId: TANK,
        ...PPB_FULL,
        evaluationWindow: PPB_WINDOW,
        expected: {
          match: 1,
          rejected: 0,
          blockedAt: {
            "default[6] divine_toll": 18,
            "default[9] holy_armaments": 1,
            "default[13] avengers_shield": 5,
            "default[14] holy_armaments": 3,
            "default[15] consecration": 9,
          },
        },
      }),
      // Over the whole composed history: the two Phase A/B1 Divine Toll presses,
      // and the two Avenger's Shield presses Phase B2's bindings resolve.
      a("SPEC_PROTECTION_PALADIN.COVERAGE_SUMMARY", {
        actorId: TANK,
        ...PPB_FULL,
        expected: {
          eligibleDecisions: 149,
          match: 4,
          rejected: 0,
          unknown: 145,
          exclusions: {
            MELEE_SWING: 88,
            NON_GCD_ACTION: 67,
            EXECUTION_LANE_NOT_ESTABLISHED: 6,
            NO_AUTHORITY_TOKEN_BINDING: 1,
          },
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The population was predeclared at Phase B1 from the raw cast counts (36 by the Phase A token table, 37 once the Sacred Weapon record binds the holy_armaments token) before any Phase B2 semantics ran; nothing was trimmed to isolate the decision that resolves. The window restricts what is COUNTED, never what is ANALYZED: every decision inside it rests on the history before it, and the whole-history summary is disclosed alongside so the window cannot read as the fight.",
    {
      authority: PPB_AUTHORITY,
      limitations: [
        "Avenger's Shield and Consecration cooldowns are hasted by the spec passive (137028) and no haste model exists: their readiness stays UNKNOWN by design, which is what blocks default[13] (when Vanguard is up) and default[15] and default[18].",
        "buff.divine_guidance.stack is a stack count, which no binding field carries: default[15]'s gate is enumerated, and the Judgment at 2,131,157 does NOT converge — its worlds select default[15] consecration or default[17] judgment. The prediction made at Phase B1 is disproved on this evidence, not forced.",
        "Once the Divine Toll and wings lower bounds have elapsed (from 2,148,837), the branch where wings fires hypothetically reopens default[6], and nothing in the log proves the cooldowns still running.",
      ],
      related: PPB_RELATED,
    },
  ),
  kase(
    "spec-protection-paladin.the-avengers-shield-press-under-vanguard-is-a-real-exact-entry-match",
    PPB_120_165,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/aura-bindings.ts; build-absences.ts; armament-state.ts; action-profile.ts (REQUIRED_AURA_INACTIVE); first-gcd-adapter.ts; src/simc/first-gcd-selection.ts",
    "The Avenger's Shield press at 2,139,100 (+134,511 ms) is MATCH by the exact entry default[13] avengers_shield, inside the evaluation window. Every higher entry is resolved by evidence or reviewed contract: default[6] divine_toll is PROVEN_NOT_READY (9,735 ms remain from the press at 2,088,835) and its gate FALSE (wings aura BOUND false from the removal at 2,106,345; Righteous Protector SELECTED); default[7] hammer_of_light, default[10] and default[12] are gated on buff.hammer_of_light_ready, BOUND false by the observed build (Lightsmith, not Templar); default[8] shield_of_the_righteous is a NON_GCD transition explored both ways, its successor forgetting only the atoms it may change; default[9] holy_armaments needs next_armament = sacred_weapon and the alternation is KNOWN holy_bulwark from the Sacred Weapon hardcast at 2,125,600; default[11] hammer_of_wrath is PROVEN_UNUSABLE — its ready() requires aura 1277026, which M4 proved INACTIVE from the removal at 2,106,345 (REQUIRED_AURA_INACTIVE). default[13]'s gate is TRUE from buff.vanguard.up, BOUND true by the Vanguard aura 1268810 applied at 2,131,157 (removed only at 2,139,123, after the press), and Avenger's Shield's own usability is its observed execution. All race worlds and both Shield of the Righteous worlds select the same entry.",
    [
      ppb_decision(PPB_FULL, 2139100, PP_AVENGERS_SHIELD, PP_MATCH_AVENGERS_SHIELD),
      ppb_aura(PPB_FULL, 2139100, PP_AVENGERS_SHIELD, "vanguard", ppb_bound(true, PP_VANGUARD_BUFF, 2131157)),
      ppb_aura(
        PPB_FULL,
        2139100,
        PP_AVENGERS_SHIELD,
        "avenging_wrath",
        ppb_bound(false, PP_SENTINEL, 2106345),
      ),
      ppb_aura(
        PPB_FULL,
        2139100,
        PP_AVENGERS_SHIELD,
        "hammer_of_wrath",
        ppb_bound(false, PP_HOW_READINESS_BUFF, 2106345),
      ),
      ppb_aura(
        PPB_FULL,
        2139100,
        PP_AVENGERS_SHIELD,
        "hammer_of_light_ready",
        ppb_by_build(427441, "HERO_TREE_NOT:templar"),
      ),
      ppb_aura(
        PPB_FULL,
        2139100,
        PP_AVENGERS_SHIELD,
        "blessed_assurance",
        ppb_by_build(433019, "TALENT_NOT_SELECTED:blessed_assurance"),
      ),
      ppb_cooldown(
        PPB_FULL,
        2139100,
        PP_AVENGERS_SHIELD,
        "divine_toll",
        pp_not_ready(9735, 2088835, PP_DIVINE_TOLL),
      ),
      ppb_cooldown(
        PPB_FULL,
        2139100,
        PP_AVENGERS_SHIELD,
        "avenging_wrath",
        pp_not_ready(9244, 2088344, PP_SENTINEL),
      ),
      ppb_cooldown(PPB_FULL, 2139100, PP_AVENGERS_SHIELD, "avengers_shield", PPB_HASTED_UNKNOWN),
      ppb_armament(PPB_FULL, 2139100, PP_AVENGERS_SHIELD, ppb_known(0, 2125600, PP_SACRED_WEAPON)),
      ppb_atom(PPB_FULL, 2139100, PP_AVENGERS_SHIELD, "next_armament", {
        kind: "MAGNITUDE",
        state: "KNOWN_NUMBER",
        value: 0,
        reason: null,
      }),
      ppb_atom(PPB_FULL, 2139100, PP_AVENGERS_SHIELD, "consecration.up", { kind: "TRUTH", value: true }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "A real MATCH needs every higher-priority entry resolved and the selected entry's own gate and usability proven — not assumed. Three Phase B2 facts carry it, each from evidence strictly before the press or from the observed build: the Vanguard aura M4 observed applied; the Hammer of Wrath readiness aura M4 observed removed, which is the ONLY way an aura-gated action becomes PROVEN_UNUSABLE (silence never does); and the Lightsmith alternation anchored on an observed hardcast under complete cast coverage since. Avenger's Shield's own hasted cooldown is UNKNOWN and irrelevant: its press proves usability at its own position and nothing about any other.",
    { authority: PPB_AUTHORITY, related: PPB_RELATED },
  ),
  kase(
    "spec-protection-paladin.the-predicted-judgment-convergence-is-disproved-at-consecration",
    PPB_120_165,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/observed-analysis.ts; cooldown-bindings.ts bindGroundEffectPresence; src/simc/first-gcd-selection.ts",
    "The Judgment at 2,131,157 (+126,568 ms), predicted at Phase B1 to converge on judgment through every higher entry, is UNKNOWN, blocked at default[15] consecration: its worlds select default[15] consecration (divine_guidance.stack >= 5 enumerated TRUE, Consecration ready) or default[17] judgment. consecration.up is BOUND true (the Consecration cast at 2,127,666, 3,491 ms earlier, against a 14,000 ms duration — 12,000 ms plus Consecration in Flame), the Consecration cooldown is UNKNOWN (hasted), and buff.vanguard.up is BOUND false from the removal at 2,082,694: the Vanguard application at the SAME millisecond, 2,131,157, is produced by this very Judgment and sits after it in canonical order, so the press does not see it. At the Blessed Hammer 1,028 ms later it does: BOUND true from 2,131,157.",
    [
      ppb_decision(PPB_FULL, 2131157, PP_JUDGMENT),
      ppb_aura(PPB_FULL, 2131157, PP_JUDGMENT, "vanguard", ppb_bound(false, PP_VANGUARD_BUFF, 2082694)),
      ppb_aura(PPB_FULL, 2132185, PP_BLESSED_HAMMER, "vanguard", ppb_bound(true, PP_VANGUARD_BUFF, 2131157)),
      ppb_atom(PPB_FULL, 2131157, PP_JUDGMENT, "consecration.up", { kind: "TRUTH", value: true }),
      ppb_cooldown(PPB_FULL, 2131157, PP_JUDGMENT, "consecration", PPB_HASTED_UNKNOWN),
      ppb_cooldown(
        PPB_FULL,
        2131157,
        PP_JUDGMENT,
        "divine_toll",
        pp_not_ready(17678, 2088835, PP_DIVINE_TOLL),
      ),
      // consecration.up FALSE only from a complete 14,000 ms lookback: the Sacred
      // Weapon hardcast at 2,125,600 sits 37,787 ms after the previous Consecration.
      ppb_atom(PPB_FULL, 2125600, PP_SACRED_WEAPON, "consecration.up", { kind: "TRUTH", value: false }),
      ppb_atom(PPB_FULL, 2128710, PP_BLESSED_HAMMER, "consecration.up", { kind: "TRUTH", value: true }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The stop rule, honoured: a prediction that the evidence does not bear out is recorded as the blocker distribution, not manufactured. Two honest refusals block the entry — a stack count no binding field carries and a hasted cooldown no model computes — and each is a deferred item, not a guess. The same-millisecond rule is the M4 position rule, not a timestamp comparison: an aura the decision's own cast applies is visible to the next decision and never to the cast that caused it.",
    {
      authority: PPB_AUTHORITY,
      limitations: [
        "consecration.up binds SimulationCraft's `active_consecration != nullptr` — whether the actor's own hardcast ground effect is alive — from the last observed cast and the pinned duration, not whether the actor stands in it.",
      ],
      related: PPB_RELATED,
    },
  ),
  kase(
    "spec-protection-paladin.next-armament-is-anchored-only-on-a-hardcast-strictly-before-the-decision",
    PPB_120_165,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/armament-state.ts armamentStateAt; src/data/game/paladin-protection-armament-authority.ts",
    "At the Sacred Weapon hardcast at 2,125,600 the alternation is KNOWN sacred_weapon (1) from the Holy Bulwark hardcast at 2,075,421 — its own press is not consulted, and neither is anything after it. At the Judgment 1,031 ms later it is KNOWN holy_bulwark (0) from that Sacred Weapon hardcast. The proc-sourced Sacred Weapon application at 2,131,424 (no cast event) does not move it: at the Blessed Hammer at 2,132,185 it is still KNOWN holy_bulwark from 2,125,600. At the Judgment at 2,168,432 it is KNOWN sacred_weapon from the Holy Bulwark hardcast at 2,167,398. Across the whole history the four hardcasts alternate SW -> HB -> SW -> HB, exactly the pinned rule.",
    [
      ppb_armament(PPB_FULL, 2125600, PP_SACRED_WEAPON, ppb_known(1, 2075421, PP_HOLY_BULWARK)),
      ppb_armament(PPB_FULL, 2126631, PP_JUDGMENT, ppb_known(0, 2125600, PP_SACRED_WEAPON)),
      ppb_armament(PPB_FULL, 2132185, PP_BLESSED_HAMMER, ppb_known(0, 2125600, PP_SACRED_WEAPON)),
      ppb_armament(PPB_FULL, 2168432, PP_JUDGMENT, ppb_known(1, 2167398, PP_HOLY_BULWARK)),
      ppb_armament(PPB_FULL, 2066110, PP_SACRED_WEAPON, {
        state: "UNKNOWN",
        nextArmament: null,
        anchorReportTimeMs: null,
        anchorAbilityGameId: null,
        reason: "NO_HARDCAST_IN_EVIDENCE",
      }),
      ppb_armament(PPB_FULL, 2067151, PP_JUDGMENT, ppb_known(0, 2066110, PP_SACRED_WEAPON)),
      ppb_atom(PPB_FULL, 2126631, PP_JUDGMENT, "next_armament", {
        kind: "MAGNITUDE",
        state: "KNOWN_NUMBER",
        value: 0,
        reason: null,
      }),
      ppb_atom(PPB_FULL, 2066110, PP_SACRED_WEAPON, "next_armament", {
        kind: "MAGNITUDE",
        state: "UNKNOWN_NUMBER",
        value: null,
        reason: "STATE_NOT_ESTABLISHED",
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "cast_holy_armaments advances next_armament only when src == LS_HARDCAST (sc_paladin.cpp:2641, 2752); a Divine Inspiration proc advances divine_inspiration_next and a Blessing of the Forge armament advances nothing. The log records a press under the armament it produced, so an observed hardcast fixes the value AFTER it — and only while CASTS coverage is COMPLETE from the hardcast to the decision. The first hardcast in evidence is itself UNKNOWN: the state before the first observed press is outside the log, and a later cast never speaks about an earlier decision.",
    { authority: PPB_AUTHORITY, related: PPB_RELATED },
  ),
  kase(
    "spec-protection-paladin.hammer-of-wrath-is-unusable-only-from-an-observed-removal-of-its-readiness-aura",
    PPB_120_165,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/aura-bindings.ts (hammer_of_wrath readiness identity); action-profile.ts REQUIRED_AURA_INACTIVE; src/data/game/paladin-protection-aura-authority.ts",
    "The Hammer of Wrath readiness aura 1277026 is applied by the Sentinel press at 2,088,344 and removed at 2,106,345. At the Divine Toll press at 2,088,835 the atom is BOUND true from that application (and Divine Toll is the MATCH there, selected at default[6] before the scan reaches Hammer of Wrath). At the Sacred Weapon hardcast at 2,125,600 and at every decision in the window it is BOUND false from the removal, and default[11] hammer_of_wrath — gated only on hero_tree.lightsmith, TRUE — is eliminated as PROVEN_UNUSABLE rather than left to a world in which it fires. Vanguard follows the same rule: BOUND false at 2,125,600 from the removal at 2,082,694, BOUND true at 2,132,185 from the application at 2,131,157, BOUND false again at 2,139,123's successor, the Judgment at 2,140,155.",
    [
      ppb_aura(
        PPB_FULL,
        2088835,
        PP_DIVINE_TOLL,
        "hammer_of_wrath",
        ppb_bound(true, PP_HOW_READINESS_BUFF, 2088344),
      ),
      ppb_decision(PPB_FULL, 2088835, PP_DIVINE_TOLL, PP_MATCH_DIVINE_TOLL),
      ppb_aura(
        PPB_FULL,
        2125600,
        PP_SACRED_WEAPON,
        "hammer_of_wrath",
        ppb_bound(false, PP_HOW_READINESS_BUFF, 2106345),
      ),
      ppb_aura(PPB_FULL, 2125600, PP_SACRED_WEAPON, "vanguard", ppb_bound(false, PP_VANGUARD_BUFF, 2082694)),
      ppb_aura(PPB_FULL, 2140155, PP_JUDGMENT, "vanguard", ppb_bound(false, PP_VANGUARD_BUFF, 2139123)),
      ppb_decision(PPB_FULL, 2140155, PP_JUDGMENT),
      // The earlier Avenger's Shield press under Vanguard, at 2,074,381, resolves the same way.
      ppb_decision(PPB_FULL, 2074381, PP_AVENGERS_SHIELD, PP_MATCH_AVENGERS_SHIELD),
      ppb_aura(PPB_FULL, 2074381, PP_AVENGERS_SHIELD, "vanguard", ppb_bound(true, PP_VANGUARD_BUFF, 2067151)),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "hammer_of_wrath_t::ready() requires the readiness buff outside wings (sc_paladin.cpp:1799-1801, with the Lightsmith path at 3684 and the buff at 3632-3634). An action is PROVEN_UNUSABLE from an OBSERVED removal and from nothing else: before the first observed transition the aura is UNBOUND and the action stays MAY_SELECT — silence is not absence. The Judgment at 2,140,155 blocks at default[15] with Vanguard down: with Vanguard up the same scan would have reached default[13] and stopped on Avenger's Shield's hasted cooldown instead.",
    { authority: PPB_AUTHORITY, related: PPB_RELATED },
  ),
  kase(
    "spec-protection-paladin.gap-bundle-resets-every-claim-that-spans-the-declared-hole",
    PPB_120_165,
    "SPEC_PROTECTION_PALADIN",
    "tests/support/corpus/fight.ts bundleOverEvidence (declared holes); src/specs/paladin/protection/armament-state.ts; cooldown-bindings.ts; aura-bindings.ts; resolver.ts previousGcdCastAt",
    "Over the gap bundle — the same window, with [2,064,590 .. 2,124,589] declared missing — the 37 decisions in the window are all UNKNOWN and all block at default[6] divine_toll: the Divine Toll and wings presses at 2,088,835 / 2,088,344 are not in evidence and every wings, Vanguard and Hammer of Wrath aura transition before the hole cannot be carried across it (UNBOUND, AURA_STATE_UNKNOWN). At the Sacred Weapon hardcast at 2,125,600 the alternation is UNKNOWN (NO_HARDCAST_IN_EVIDENCE — the anchor at 2,075,421 lies in the hole) and consecration.up is UNBOUND (the 14,000 ms lookback crosses the hole); at the Judgment 1,031 ms later the alternation is KNOWN again from the hardcast that survived, and at the Blessed Hammer at 2,128,710 consecration.up is BOUND true from the Consecration cast at 2,127,666 that also survived. The Avenger's Shield press at 2,139,100 that MATCHES on the full bundle is UNKNOWN here — the Vanguard aura is still BOUND true from 2,131,157, but Hammer of Wrath is no longer proven unusable and Divine Toll no longer proven not ready.",
    [
      a("SPEC_PROTECTION_PALADIN.COVERAGE_SUMMARY", {
        actorId: TANK,
        ...PPB_GAP,
        evaluationWindow: PPB_WINDOW,
        expected: {
          eligibleDecisions: 37,
          match: 0,
          rejected: 0,
          unknown: 37,
          exclusions: PPB_WINDOW_EXCLUSIONS,
        },
      }),
      a("SPEC_PROTECTION_PALADIN.UNKNOWN_BLOCKER_DISTRIBUTION", {
        actorId: TANK,
        ...PPB_GAP,
        evaluationWindow: PPB_WINDOW,
        expected: { match: 0, rejected: 0, blockedAt: { "default[6] divine_toll": 37 } },
      }),
      ppb_decision(PPB_GAP, 2139100, PP_AVENGERS_SHIELD),
      ppb_aura(PPB_GAP, 2139100, PP_AVENGERS_SHIELD, "vanguard", ppb_bound(true, PP_VANGUARD_BUFF, 2131157)),
      ppb_aura(PPB_GAP, 2139100, PP_AVENGERS_SHIELD, "hammer_of_wrath", ppb_unbound(PP_HOW_READINESS_BUFF)),
      ppb_aura(PPB_GAP, 2139100, PP_AVENGERS_SHIELD, "avenging_wrath", ppb_unbound(PP_SENTINEL)),
      ppb_cooldown(PPB_GAP, 2139100, PP_AVENGERS_SHIELD, "divine_toll", PPB_ELAPSED_UNKNOWN),
      ppb_armament(PPB_GAP, 2125600, PP_SACRED_WEAPON, {
        state: "UNKNOWN",
        nextArmament: null,
        anchorReportTimeMs: null,
        anchorAbilityGameId: null,
        reason: "NO_HARDCAST_IN_EVIDENCE",
      }),
      ppb_armament(PPB_GAP, 2126631, PP_JUDGMENT, ppb_known(0, 2125600, PP_SACRED_WEAPON)),
      ppb_atom(PPB_GAP, 2125600, PP_SACRED_WEAPON, "consecration.up", { kind: "UNBOUND" }),
      ppb_atom(PPB_GAP, 2128710, PP_BLESSED_HAMMER, "consecration.up", { kind: "TRUTH", value: true }),
      // The whole-history disclosure: only Phase A's Divine Toll press survives as a MATCH.
      a("SPEC_PROTECTION_PALADIN.COVERAGE_SUMMARY", {
        actorId: TANK,
        ...PPB_GAP,
        expected: {
          eligibleDecisions: 93,
          match: 1,
          rejected: 0,
          unknown: 92,
          exclusions: {
            MELEE_SWING: 46,
            NON_GCD_ACTION: 41,
            EXECUTION_LANE_NOT_ESTABLISHED: 5,
            NO_AUTHORITY_TOKEN_BINDING: 1,
          },
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "Every MATCH on the full bundle rests on retained evidence, and removing that evidence removes the MATCH: no state carries across a declared hole — not a cooldown anchor, not an aura transition, not the alternation, not a ground effect's lookback, not the previous GCD press. A claim whose own anchor lies after the hole keeps exactly what that anchor proves. The Divine Toll lower bound from 2,026,655 is still a valid lower bound across the hole (an unretrieved recast could only lengthen it) and has simply elapsed, which proves nothing about readiness.",
    { authority: PPB_AUTHORITY, related: PPB_RELATED },
  ),
];

const SE = "synthetic.apl-priority-short-circuit";
const SE_RELATED = [
  "tests/unit/simc-nested-selection.test.ts",
  "tests/contracts/m5c3c3b-engine-scope.test.ts",
  "tests/contracts/m10c-cross-spec-isolation.test.ts",
];
const se_entry = (listName, priorityOrdinal, actionToken) => ({ listName, priorityOrdinal, actionToken });

/** M11-B1: the synthetic authority for generic `run_action_list` control flow. */
const SER = "synthetic.apl-run-action-list";
const SER_RELATED = [
  "tests/unit/m11b1-run-action-list.test.ts",
  "tests/unit/simc-nested-selection.test.ts",
  "tests/contracts/m10c-cross-spec-isolation.test.ts",
];
const SER_LIMITS = [
  "Synthetic authority; every premise is stated in the parameters. Regression evidence only, never promotion evidence.",
];

// --------------------------------------------------------------------------
// M11-A4: the Retribution Paladin cases. Every SPEC_RETRIBUTION_PALADIN kind
// reaches the analyzer through its registration. The analyzer was
// INTERNAL_ONLY in M11-A4, when the APPLICATION_SERVICE kinds proved the
// public path still answered SPEC_NOT_SUPPORTED for the same subject; since
// M11-A5 it is PUBLIC, and the same kinds plus PUBLIC_PROJECTION and the
// PUBLIC_CONTRACT parity cases prove the public path carries the same
// analysis. Expected values were read from the production facade over the
// same evidence on 2026-09-18 and are pinned here as regression evidence,
// never as a definition of correctness.
// --------------------------------------------------------------------------

const RET_ANALYZER = "paladin-retribution-observed-decisions";
const RET_SIMC = { authorityId: "SIMC_APL_PALADIN_RETRIBUTION", artifactRevision: "simc-33622e9d-1" };
const RET_PROVENANCE = {
  ...RET_SIMC,
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/class_modules/apl/apl_paladin.cpp",
  sourceSha256: "ed3fb1ac5b1c6c83bf21abbcaff5afe282678a69d51bdc953cc9897dca94bc02",
};
const [RET_FV, RET_DS] = [383328, 53385];
const [
  RET_ART_OF_WAR,
  RET_RIGHTEOUS_CAUSE,
  RET_ARBITER_DS,
  RET_ARBITER_VERDICT,
  RET_DIVINE_PURPOSE,
  RET_HOW_READINESS,
] = [406086, 402916, 1306162, 1306161, 408458, 1241410];
const RET_HISTORY = [RET45, RET_45_105];
const RET_FULL = { historyArtifactIds: RET_HISTORY, declaredHoles: [] };
const RET_HOLE = { fromReportTimeMs: 2049582, toReportTimeMs: 2109589 };
const RET_GAP = { historyArtifactIds: [RET45], declaredHoles: [RET_HOLE] };
const RET_GAP_WINDOW = { fromReportTimeMs: 2109590, toReportTimeMs: 2169589 };
const RET_TALENTS = {
  art_of_war: "SELECTED",
  avenging_wrath: "SELECTED",
  blade_of_justice: "SELECTED",
  crusade: "SELECTED",
  crusading_strikes: "SELECTED",
  divine_purpose: "SELECTED",
  divine_storm: "SELECTED",
  divine_toll: "SELECTED",
  empyrean_legacy: "SELECTED",
  execution_sentence: "SELECTED",
  final_verdict: "SELECTED",
  hammer_of_wrath: "SELECTED",
  holy_flames: "SELECTED",
  radiant_glory: "UNKNOWN",
  righteous_cause: "NOT_SELECTED",
  templar_strikes: "NOT_SELECTED",
  wake_of_ashes: "SELECTED",
  walk_into_light: "SELECTED",
};
const RET_NON_DOMAIN = [
  "precombat[6] use_item",
  "cooldowns[0] use_item",
  "cooldowns[1] potion",
  "cooldowns[2] use_item",
  "cooldowns[3] use_item",
  "cooldowns[4] use_item",
  "cooldowns[5] use_item",
  "cooldowns[6] invoke_external_buff",
  "cooldowns[7] lights_judgment",
  "cooldowns[8] fireblood",
  "generators[13] arcane_torrent",
];
const RET_AUTHORITY = {
  ...RET_SIMC,
  requiredStateEvidence: [
    "the combatantinfo at 2,004,589 for actor 6 (specID 70), carried by the first part",
    "every COMPLETE cast by actor 6 across the composed parts, in canonical order",
    "every aura transition on actor 6 sourced by actor 6 across the composed parts, in canonical order",
    "the Holy Power entry on each costed spender cast, and its absence on each Divine Purpose free cast",
    "the zero-event certificate over [2,049,582 .. 2,049,588] between the first two parts",
  ],
};
const RET_GTKB_AUTHORITY = {
  ...RET_SIMC,
  requiredStateEvidence: [
    "the combatantinfo at 2,415,042 for actor 23 (specID 70)",
    "every COMPLETE cast by actor 23 in the slice, in canonical order",
    "every aura transition on actor 23 sourced by actor 23, in canonical order",
  ],
};
const RET_RELATED = [
  "tests/contracts/m11a4-retribution-evaluator.test.ts",
  "tests/contracts/m11a4-retribution-registration.test.ts",
  "tests/unit/m11a4-retribution-bindings.test.ts",
  "tests/contracts/m11a4-known-buff-stacks.test.ts",
];
const ret_decision = (t, ability, expected, extra = {}) =>
  a("SPEC_RETRIBUTION_PALADIN.DECISION_COVERAGE", {
    actorId: RET,
    ...extra,
    targetActorId: null,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    expected,
  });
const ret_unknown_decision = (t, ability, extra = {}) =>
  ret_decision(
    t,
    ability,
    {
      outcome: "UNKNOWN",
      basis: "AUTHORITY_SELECTION_UNRESOLVED",
      authorityCoverage: "UNKNOWN",
      authorityToken: null,
      selectionPrecision: null,
      decisiveBlocker: "OBSERVED_STATE_MISSING",
      rawBlocker: "ONE_SCAN_BLOCKED/NO_DEFINITE_WINNER",
      observedActionRejected: false,
      unselectabilityProven: false,
      unselectabilityRefusal: ability === RET_DS ? "CONDITION_NOT_PROVEN_FALSE" : "UNCONDITIONAL_ENTRY",
    },
    extra,
  );
const ret_stack = (t, ability, atomName, expected, extra = {}) =>
  a("SPEC_RETRIBUTION_PALADIN.STACK_BINDING_AT", {
    actorId: RET,
    ...extra,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    atomName,
    expected,
  });
const ret_aura = (t, ability, atomName, expected, extra = {}) =>
  a("SPEC_RETRIBUTION_PALADIN.AURA_BINDING_AT", {
    actorId: RET,
    ...extra,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    atomName,
    expected,
  });
const ret_bound_aura = (up, abilityGameId, anchorReportTimeMs) => ({
  state: "BOUND",
  up,
  abilityGameId,
  anchorReportTimeMs,
  reason: null,
});
const ret_zero = (proof, abilityGameId) => ({
  state: "BOUND_ZERO",
  stack: 0,
  proof,
  abilityGameId,
  reason: null,
});
const ret_unbound_stack = (reason, abilityGameId) => ({
  state: "UNBOUND",
  stack: null,
  proof: null,
  abilityGameId,
  reason,
});
const ret_cooldown = (t, ability, simcToken, expected, extra = {}) =>
  a("SPEC_RETRIBUTION_PALADIN.COOLDOWN_READINESS_AT", {
    actorId: RET,
    ...extra,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    simcToken,
    expected,
  });
const ret_not_ready = (remaining, anchor, abilityGameId, base) => ({
  readiness: "PROVEN_NOT_READY",
  provenRemainingAtLeastMs: remaining,
  anchorReportTimeMs: anchor,
  anchorAbilityGameId: abilityGameId,
  effectiveBaseMs: base,
  unknownReason: null,
});
const ret_cd_unknown = (reason, base) => ({
  readiness: "UNKNOWN",
  provenRemainingAtLeastMs: null,
  anchorReportTimeMs: null,
  anchorAbilityGameId: null,
  effectiveBaseMs: base,
  unknownReason: reason,
});
const ret_hp = (t, ability, expected, extra = {}) =>
  a("SPEC_RETRIBUTION_PALADIN.HOLY_POWER_OBSERVATION", {
    actorId: RET,
    ...extra,
    cast: { reportTimeMs: t, abilityGameId: ability },
    expected,
  });
const RET_HP_NONE = { state: "NO_OBSERVATION", amount: null, max: null, cost: null };
const ret_ds_castable = (t, ability, expected, extra = {}) =>
  a("SPEC_RETRIBUTION_PALADIN.DS_CASTABLE_AT", {
    actorId: RET,
    ...extra,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    expected,
  });
const RET_BUNDLE_EXCLUSIONS = { MELEE_SWING: 1, NON_GCD_ACTION: 112, OUTSIDE_FIRST_SLICE: 54 };
const ret_segment_case = (artifactId, label, events, source, target, facts) =>
  kase(
    `normalization.retribution-paladin-rotational-165s-${label}-normalizes-whole-and-in-order`,
    artifactId,
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts; supported-families.ts; scripts/sanitize-probe.mjs --actor-slice --from",
    `The ${String(events)}-event family-filtered actor-6 segment normalizes with every raw type recognised and every event kept in capture order: as SOURCE ${String(source.CAST)} casts, ${String(source.RESOURCE_CHANGE)} Holy Power changes, ${String(source.AURA)} aura transitions; as TARGET ${String(target.CAST)} casts, ${String(target.RESOURCE_CHANGE)} resource changes, ${String(target.AURA)} aura transitions. No combatantinfo: the segment starts strictly after the fight start, and the profile is carried by the first part of any bundle it joins. ${facts}`,
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: events }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", { actorId: RET, side: "SOURCE", expected: source }),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", { actorId: RET, side: "TARGET", expected: target }),
    ],
    ["VALIDATED_EVIDENCE"],
    "The census is of the segment, never of the fight: exactly the families the --families option retained, between the recorded exclusive --from and inclusive --to bounds, and nothing else. On its own a segment analyzes to PROFILE_NOT_RESOLVED — there is no combatant profile in it — which is the correct refusal, not a smaller population.",
    { related: ["tests/unit/sanitize-probe.test.ts", "tests/unit/m10c5b-corpus-bundle.test.ts"] },
  );

// --------------------------------------------------------------------------
// M11-B2: the Blood Death Knight cases. Every SPEC_BLOOD_DEATH_KNIGHT kind
// reaches the analyzer through its registration. The analyzer is
// INTERNAL_ONLY: the APPLICATION_SERVICE kinds prove the public path still
// answers SPEC_NOT_SUPPORTED for the same subject while the internal lookup
// resolves it. Expected values were read from the production facade over the
// same evidence on 2026-09-18 and are pinned here as regression evidence —
// the MEASUREMENT this milestone exists to take — never as a definition of
// correctness. Zero MATCH and zero REJECTED is the honest result and is
// pinned as such.
// --------------------------------------------------------------------------

const BLOOD_ANALYZER = "deathknight-blood-observed-decisions";
const BLOOD_SIMC = { authorityId: "SIMC_APL_DEATHKNIGHT_BLOOD", artifactRevision: "simc-33622e9d-1" };
const BLOOD_PROVENANCE = {
  ...BLOOD_SIMC,
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/class_modules/apl/apl_death_knight.cpp",
  sourceSha256: "e381da691875ceecb8357a76e90fef9e01f3a200c67da7024deff1ca7f728df6",
  conditionalCompilationGuards: 12,
};
const [BLOOD_DS, BLOOD_HS, BLOOD_VS, BLOOD_BB, BLOOD_MR, BLOOD_DC] = [
  49998, 206930, 433895, 50842, 195182, 195292,
];
const [
  BLOOD_GIFT,
  BLOOD_BONE_SHIELD,
  BLOOD_VB_AURA,
  BLOOD_EXTERMINATE,
  BLOOD_DRW_AURA,
  BLOOD_EBQ,
  BLOOD_DEBT,
] = [434153, 195181, 55233, 441416, 81256, 433925, 1310372];
const BLOOD_DRW = 49028;
const BLOOD_HISTORY = [BLOOD45, BLOOD_45_105];
const BLOOD_FULL = { historyArtifactIds: BLOOD_HISTORY, declaredHoles: [] };
const BLOOD_TALENTS = {
  blood_boil: "SELECTED",
  consumption: "UNKNOWN",
  dancing_rune_weapon: "SELECTED",
  death_strike: "SELECTED",
  exterminate: "UNKNOWN",
  frenzied_bloodthirst: "SELECTED",
  gift_of_the_sanlayn: "SELECTED",
  heart_strike: "SELECTED",
  marrowrend: "SELECTED",
  raise_dead: "SELECTED",
  reapers_mark: "UNKNOWN",
  vampiric_blood: "SELECTED",
  vampiric_strike: "SELECTED",
  visceral_strength: "SELECTED",
};
const BLOOD_NON_DOMAIN = [
  "default[1] use_items",
  "default[2] use_item",
  "default[3] use_item",
  "default[4] use_item",
  "default[5] use_item",
  "default[6] use_item",
  "default[7] fireblood",
  "default[8] blood_fury",
  "default[9] berserking",
  "default[10] ancestral_call",
  "default[11] potion",
  "deathbringer[11] arcane_torrent",
];
const BLOOD_AUTHORITY = {
  ...BLOOD_SIMC,
  requiredStateEvidence: [
    "the combatantinfo at 2,004,589 for actor 14 (specID 250), carried by the first part",
    "every COMPLETE cast by actor 14 across the composed parts, in canonical order",
    "every aura transition on actor 14 sourced by actor 14 across the composed parts, in canonical order, with the absolute stack count each stack transition carries",
    "the Runes entry on each Rune-costed cast and the Runic Power entry on each Death Strike cast; the uncosted entry of the other resource is read as no observation",
    "the zero-event certificate over [2,049,582 .. 2,049,588] between the first two parts",
  ],
};
const BLOOD_GTKB_AUTHORITY = {
  ...BLOOD_SIMC,
  requiredStateEvidence: [
    "the combatantinfo at 2,415,042 for actor 14 (specID 250)",
    "every COMPLETE cast by actor 14 in the slice, in canonical order",
    "every aura transition on actor 14 sourced by actor 14, in canonical order, with the absolute stack count each stack transition carries",
  ],
};
const BLOOD_RELATED = [
  "tests/contracts/m11b2-blood-evaluator.test.ts",
  "tests/contracts/m11b2-blood-registration.test.ts",
  "tests/unit/m11b2-blood-bindings.test.ts",
  "tests/unit/m11b2-blood-authority-data.test.ts",
];
const BLOOD_UNKNOWN = {
  outcome: "UNKNOWN",
  basis: "AUTHORITY_SELECTION_UNRESOLVED",
  authorityCoverage: "UNKNOWN",
  authorityToken: null,
  selectionPrecision: null,
  decisiveBlocker: "OBSERVED_STATE_MISSING",
  rawBlocker: "ONE_SCAN_BLOCKED/NO_DEFINITE_WINNER",
  observedActionRejected: false,
  unselectabilityProven: false,
};
// M11-B3 admitted decimal literals; the B2 stopping tag
// "UNSUPPORTED_EXPRESSION:UNSUPPORTED_NUMERIC_LITERAL:1." no longer occurs.
const BLOOD_CONSUMPTION_TAG = "APPLICABILITY:consumption";
/** A decision whose branches diverge: the root scan RESOLVED (every candidate undecided), the engine explored the NON_GCD prefixes and the worlds disagreed. */
const BLOOD_DIVERGENT = {
  outcome: "UNKNOWN",
  basis: "AUTHORITY_SELECTION_UNRESOLVED",
  authorityCoverage: "UNKNOWN",
  authorityToken: null,
  selectionPrecision: null,
  decisiveBlocker: "DIVERGENT_WORLDS",
  rawBlocker: "DIVERGENT_GCD_OUTCOMES",
  observedActionRejected: false,
  unselectabilityProven: false,
  stoppingAt: null,
  stoppingAtoms: [],
};
/** M11-B4: a Death Strike the authority selects at the exact entry once the remainders are proven. */
const BLOOD_DS_MATCH = {
  outcome: "MATCH",
  basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
  authorityCoverage: "EXACT_ENTRY",
  authorityToken: "death_strike",
  selectionPrecision: "EXACT_ENTRY",
  decisiveBlocker: null,
  rawBlocker: null,
  observedActionRejected: false,
  unselectabilityProven: false,
  stoppingAt: null,
  stoppingAtoms: [],
};
const BLOOD_WINDOW_TAG = "PRE_DECISION_WINDOW_TRANSITION";
const blood_remains = (t, ability, atomName, expected, extra = {}) =>
  a("SPEC_BLOOD_DEATH_KNIGHT.REMAINS_BINDING_AT", {
    actorId: BLOOD,
    ...extra,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    atomName,
    expected,
  });
const blood_remains_exact = (remainsMs, anchorReportTimeMs) => ({
  state: "BOUND",
  proof: "GAIN_ANCHOR_EXACT",
  bindingState: "KNOWN_NUMBER",
  remainsMs,
  anchorReportTimeMs,
  reason: null,
  windowLeadMs: null,
  windowOrderInvariance: null,
});
const blood_remains_bounded = (atLeastMs, anchorReportTimeMs) => ({
  state: "BOUND",
  proof: "GAIN_ANCHOR_BOUNDED",
  bindingState: "BOUNDED_NUMBER",
  remainsMs: atLeastMs,
  anchorReportTimeMs,
  reason: null,
  windowLeadMs: null,
  windowOrderInvariance: null,
});
const blood_remains_zero = (anchorReportTimeMs) => ({
  state: "BOUND",
  proof: "PROVEN_INACTIVE",
  bindingState: "KNOWN_NUMBER",
  remainsMs: null,
  anchorReportTimeMs,
  reason: null,
  windowLeadMs: null,
  windowOrderInvariance: null,
});
const blood_remains_permanent = (anchorReportTimeMs) => ({
  state: "BOUND",
  proof: "PERMANENT_ACTIVE",
  bindingState: "KNOWN_NUMBER",
  remainsMs: null,
  anchorReportTimeMs,
  reason: null,
  windowLeadMs: null,
  windowOrderInvariance: null,
});
const blood_remains_unbound = (reason, windowLeadMs = null) => ({
  state: "UNBOUND",
  proof: null,
  bindingState: null,
  remainsMs: null,
  anchorReportTimeMs: null,
  reason,
  windowLeadMs,
  windowOrderInvariance: null,
});
/** M11-B8: the order-invariant lower bound inside the pre-decision window, with both orderings pinned. */
const blood_remains_window_bound = (atLeastMs, anchorReportTimeMs, windowOrderInvariance) => ({
  state: "BOUND",
  proof: "WINDOW_ORDER_INVARIANT_BOUNDED",
  bindingState: "BOUNDED_NUMBER",
  remainsMs: atLeastMs,
  anchorReportTimeMs,
  reason: null,
  windowLeadMs: null,
  windowOrderInvariance,
});
const BLOOD_BOILING_POINT = 1265968;
/** M11-B5: a Blood Boil the authority selects at sanlayn[6] once the Runic Power gate above it is exact. */
const BLOOD_BB_MATCH = {
  ...BLOOD_DS_MATCH,
  authorityToken: "blood_boil",
};
const blood_rp_state = (t, ability, expected, extra = {}) =>
  a("SPEC_BLOOD_DEATH_KNIGHT.RUNIC_POWER_STATE_AT", {
    actorId: BLOOD,
    ...extra,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    expected,
  });
const blood_rp_own = (currentWire, deficitPoints, t) => ({
  state: "BOUND",
  proof: "OWN_PRE_COST",
  bindingState: "KNOWN_NUMBER",
  deficitPoints,
  currentWire,
  atMostWire: null,
  maxWire: 1250,
  anchorReportTimeMs: t,
  anchorTiming: "PRE_COST",
  windowLeadsMs: [],
  reason: null,
});
const blood_rp_carried = (currentWire, deficitPoints, anchorReportTimeMs, anchorTiming) => ({
  state: "BOUND",
  proof: "CARRIED_EXACT",
  bindingState: "KNOWN_NUMBER",
  deficitPoints,
  currentWire,
  atMostWire: null,
  maxWire: 1250,
  anchorReportTimeMs,
  anchorTiming,
  windowLeadsMs: [],
  reason: null,
});
const blood_rp_window = (atMostWire, atLeastDeficit, anchorReportTimeMs, windowLeadsMs) => ({
  state: "BOUND",
  proof: "WINDOW_BOUNDED",
  bindingState: "BOUNDED_NUMBER",
  deficitPoints: atLeastDeficit,
  currentWire: null,
  atMostWire,
  maxWire: 1250,
  anchorReportTimeMs,
  anchorTiming: "POST_CHANGE",
  windowLeadsMs,
  reason: null,
});
const blood_rp_unbound = (reason, anchorReportTimeMs = null, anchorTiming = null) => ({
  state: "UNBOUND",
  proof: null,
  bindingState: null,
  deficitPoints: null,
  currentWire: null,
  atMostWire: null,
  maxWire: null,
  anchorReportTimeMs,
  anchorTiming,
  windowLeadsMs: [],
  reason,
});
const blood_decision = (t, ability, expected, extra = {}) =>
  a("SPEC_BLOOD_DEATH_KNIGHT.DECISION_COVERAGE", {
    actorId: BLOOD,
    ...extra,
    targetActorId: null,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    expected,
  });
const blood_dispatch = (t, ability, expected, extra = {}) =>
  a("SPEC_BLOOD_DEATH_KNIGHT.DISPATCH_TRACE_AT", {
    actorId: BLOOD,
    ...extra,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    expected,
  });
const D_CALL = {
  at: "default[13]",
  actionToken: "call_action_list",
  calleeListName: "high_prio_actions",
  outcome: "CALL_MAY_SELECT",
  gate: "UNCONDITIONAL",
};
const D_DEATHBRINGER_SKIPPED = {
  at: "default[14]",
  actionToken: "run_action_list",
  calleeListName: "deathbringer",
  outcome: "RUN_GATE_FALSE_SKIPPED",
  gate: "FALSE",
};
const D_SAN_GIFT_SKIPPED = {
  at: "default[15]",
  actionToken: "run_action_list",
  calleeListName: "san_gift",
  outcome: "RUN_GATE_FALSE_SKIPPED",
  gate: "FALSE",
};
const D_SAN_GIFT_UNDECIDED = {
  at: "default[15]",
  actionToken: "run_action_list",
  calleeListName: "san_gift",
  outcome: "BLOCKED",
  gate: "UNKNOWN_STATE",
};
const D_SANLAYN_ENTERED_BLOCKED = {
  at: "default[16]",
  actionToken: "run_action_list",
  calleeListName: "sanlayn",
  outcome: "BLOCKED",
  gate: "TRUE",
};
const D_SAN_GIFT_ENTERED = {
  at: "default[15]",
  actionToken: "run_action_list",
  calleeListName: "san_gift",
  outcome: "RUN_ENTERED_SCAN_ENDS",
  gate: "TRUE",
};
const D_SANLAYN_ENTERED = {
  at: "default[16]",
  actionToken: "run_action_list",
  calleeListName: "sanlayn",
  outcome: "RUN_ENTERED_SCAN_ENDS",
  gate: "TRUE",
};
/** Inside the Gift window since M11-B3: san_gift is ENTERED and offers candidates; the scan ends there. */
const BLOOD_IN_GIFT_DISPATCH = [D_CALL, D_DEATHBRINGER_SKIPPED, D_SAN_GIFT_ENTERED];
/** Outside the Gift window when sanlayn offers candidates and blocks at nothing before sanlayn[10]. */
const BLOOD_OUT_OF_GIFT_ENTERED_DISPATCH = [
  D_CALL,
  D_DEATHBRINGER_SKIPPED,
  D_SAN_GIFT_SKIPPED,
  D_SANLAYN_ENTERED,
];
const BLOOD_OUT_OF_GIFT_DISPATCH = [
  D_CALL,
  D_DEATHBRINGER_SKIPPED,
  D_SAN_GIFT_SKIPPED,
  D_SANLAYN_ENTERED_BLOCKED,
];
const blood_aura = (t, ability, atomName, expected, extra = {}) =>
  a("SPEC_BLOOD_DEATH_KNIGHT.AURA_BINDING_AT", {
    actorId: BLOOD,
    ...extra,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    atomName,
    expected,
  });
const blood_observed_aura = (up, abilityGameId, anchorReportTimeMs) => ({
  state: "BOUND",
  up,
  abilityGameId,
  proof: "OBSERVED",
  anchorReportTimeMs,
  reason: null,
  auraReason: null,
});
/** M11-B10: the presence M4 proves on BOTH sides of a window stack-gain cluster (ACTIVE before it and at the decision). */
const blood_window_presence = (abilityGameId, anchorReportTimeMs) => ({
  state: "BOUND",
  up: true,
  abilityGameId,
  proof: "WINDOW_ORDER_INVARIANT_PRESENCE",
  anchorReportTimeMs,
  reason: null,
  auraReason: null,
});
const blood_excluded_aura = (abilityGameId) => ({
  state: "BOUND",
  up: false,
  abilityGameId,
  proof: "HERO_TREE_EXCLUDED",
  anchorReportTimeMs: null,
  reason: null,
  auraReason: null,
});
const blood_unbound_aura = (abilityGameId, reason, auraReason) => ({
  state: "UNBOUND",
  up: null,
  abilityGameId,
  proof: null,
  anchorReportTimeMs: null,
  reason,
  auraReason,
});
const blood_stack = (t, ability, atomName, expected, extra = {}) =>
  a("SPEC_BLOOD_DEATH_KNIGHT.STACK_BINDING_AT", {
    actorId: BLOOD,
    ...extra,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    atomName,
    expected,
  });
const blood_exact_stack = (stack) => ({
  state: "BOUND",
  stack,
  proof: "EXACT_STACK_OBSERVATION",
  abilityGameId: BLOOD_BONE_SHIELD,
  reason: null,
  possibleStacks: null,
  windowOrderInvariance: null,
});
const blood_unbound_stack = (abilityGameId, reason) => ({
  state: "UNBOUND",
  stack: null,
  proof: null,
  abilityGameId,
  reason,
  possibleStacks: null,
  windowOrderInvariance: null,
});
/** M11-B6: Blood Debt's exact count, from the last stack-bearing transition (OBSERVATION) or a fresh plain application (APPLICATION, always 1). */
const blood_debt_exact = (stack, proof = "EXACT_STACK_OBSERVATION") => ({
  state: "BOUND",
  stack,
  proof,
  abilityGameId: BLOOD_DEBT,
  reason: null,
  possibleStacks: null,
  windowOrderInvariance: null,
});
/** M11-B9: Essence's exact count from its own transitions (OBSERVATION) or the pinned fresh application (APPLICATION, always 1). */
const blood_ebq_exact = (stack, proof = "EXACT_STACK_OBSERVATION") => ({
  state: "BOUND",
  stack,
  proof,
  abilityGameId: BLOOD_EBQ,
  reason: null,
  possibleStacks: null,
  windowOrderInvariance: null,
});
/** M11-B9: the finite set of exact Essence counts both orderings of the window cluster leave, with both worlds pinned. */
/** M11-B10: Bone Shield's finite set of every exact count the decision's position among its own gains leaves. */
const blood_bs_set = (possibleStacks, windowOrderInvariance) => ({
  state: "BOUND_SET",
  stack: null,
  proof: "WINDOW_ORDER_INVARIANT_SET",
  abilityGameId: BLOOD_BONE_SHIELD,
  reason: null,
  possibleStacks,
  windowOrderInvariance,
});
/** A Marrowrend's own three gains at one millisecond ahead of the cast, as the wire writes them. */
const blood_marrowrend_cluster = (t, leadMs = 0) => [
  { reportTimeMs: t, operation: "APPLIED", isStackChange: true, leadMs },
  { reportTimeMs: t, operation: "APPLIED", isStackChange: true, leadMs },
  { reportTimeMs: t, operation: "REFRESHED", isStackChange: false, leadMs },
  { reportTimeMs: t, operation: "APPLIED", isStackChange: true, leadMs },
  { reportTimeMs: t, operation: "REFRESHED", isStackChange: false, leadMs },
];
const blood_ebq_set = (possibleStacks, windowOrderInvariance) => ({
  state: "BOUND_SET",
  stack: null,
  proof: "WINDOW_ORDER_INVARIANT_SET",
  abilityGameId: BLOOD_EBQ,
  reason: null,
  possibleStacks,
  windowOrderInvariance,
});
const BLOOD_HS_MATCH = {
  ...BLOOD_DS_MATCH,
  authorityToken: "heart_strike",
};
const BLOOD_HS_CONVERGED_MATCH = {
  ...BLOOD_HS_MATCH,
  authorityCoverage: "TOKEN_CONVERGED",
  selectionPrecision: "TOKEN_CONVERGED",
};
const blood_cooldown = (t, ability, expected, extra = {}) =>
  a("SPEC_BLOOD_DEATH_KNIGHT.COOLDOWN_READINESS_AT", {
    actorId: BLOOD,
    ...extra,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    simcToken: "dancing_rune_weapon",
    expected,
  });
const blood_drw_not_ready = (remaining, anchor) => ({
  readiness: "PROVEN_NOT_READY",
  provenRemainingAtLeastMs: remaining,
  anchorReportTimeMs: anchor,
  anchorAbilityGameId: BLOOD_DRW,
  effectiveBaseMs: 90000,
  unknownReason: null,
});
const blood_drw_unknown = (reason) => ({
  readiness: "UNKNOWN",
  provenRemainingAtLeastMs: null,
  anchorReportTimeMs: null,
  anchorAbilityGameId: null,
  effectiveBaseMs: null,
  unknownReason: reason,
});
const blood_resources = (t, ability, expected, extra = {}) =>
  a("SPEC_BLOOD_DEATH_KNIGHT.RESOURCE_OBSERVATION", {
    actorId: BLOOD,
    ...extra,
    cast: { reportTimeMs: t, abilityGameId: ability },
    expected,
  });
const BLOOD_NO_RES = { state: "NO_OBSERVATION", amount: null, max: null, cost: null };
const blood_runes = (amount, cost) => ({ state: "EXACT_PRE_COST", amount, max: 6, cost });
const blood_rp = (amount) => ({ state: "EXACT_PRE_COST", amount, max: 1250, cost: 450 });
/** M11-B7: Marrowrend's Rune affordability at one decision, from the decision cast's own Rune entry. */
const blood_affordability = (t, ability, expected, extra = {}) =>
  a("SPEC_BLOOD_DEATH_KNIGHT.RUNE_AFFORDABILITY_AT", {
    actorId: BLOOD,
    ...extra,
    observedCast: { reportTimeMs: t, abilityGameId: ability },
    expected,
  });
const BLOOD_MARROWREND_PIN = { pinnedRuneCost: 2, pinnedSpellId: BLOOD_MR, cooldownFree: true };
const blood_affordable = (runes, wireCost = 1) => ({
  evidence: "OWN_PRE_COST_AFFORDABLE",
  runes,
  runesMax: 6,
  wireCost,
  ...BLOOD_MARROWREND_PIN,
  costModifiersExcluded: true,
  marrowrendProvenUsable: true,
});
const blood_below_cost = (runes, wireCost = 1) => ({
  evidence: "OWN_PRE_COST_BELOW_COST",
  runes,
  runesMax: 6,
  wireCost,
  ...BLOOD_MARROWREND_PIN,
  costModifiersExcluded: true,
  marrowrendProvenUsable: false,
});
const BLOOD_NO_RUNE_OBSERVATION = {
  evidence: "NO_RUNE_OBSERVATION",
  runes: null,
  runesMax: null,
  wireCost: null,
  ...BLOOD_MARROWREND_PIN,
  costModifiersExcluded: true,
  marrowrendProvenUsable: false,
};
/** M11-B7: the authority selected marrowrend at sanlayn[7] against an observed Heart Strike / Vampiric Strike. */
const BLOOD_MARROWREND_REJECTED = {
  outcome: "REJECTED",
  basis: "AUTHORITY_SELECTED_DIFFERENT_TOKEN",
  authorityCoverage: "EXACT_ENTRY",
  authorityToken: "marrowrend",
  selectionPrecision: "EXACT_ENTRY",
  decisiveBlocker: null,
  rawBlocker: null,
  observedActionRejected: false,
  unselectabilityProven: false,
  unselectabilityRefusal: "UNCONDITIONAL_ENTRY",
  stoppingAt: null,
  stoppingAtoms: [],
};
const blood_domain = (domain, expected, extra = {}) =>
  a("SPEC_BLOOD_DEATH_KNIGHT.DOMAIN_RESULT", { actorId: BLOOD, ...extra, domain, expected });
const BLOOD_NO_AUTHORITY_DOMAIN = {
  resolution: "NO_PINNED_AUTHORITY_FOR_DOMAIN",
  authorityId: null,
  offensiveAuthorityGoverns: false,
  evidenceFamily: null,
  deathStrikeDualRole: null,
  sharesActionWithOffensive: null,
};
const blood_segment_case = (artifactId, label, events, source, target, facts) =>
  kase(
    `normalization.blood-death-knight-rotational-165s-${label}-normalizes-whole-and-in-order`,
    artifactId,
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts; supported-families.ts; scripts/sanitize-probe.mjs --actor-slice --from",
    `The ${String(events)}-event family-filtered actor-14 segment normalizes with every raw type recognised and every event kept in capture order: as SOURCE ${String(source.CAST)} casts, ${String(source.RESOURCE_CHANGE)} Runic Power changes, ${String(source.AURA)} aura transitions; as TARGET ${String(target.CAST)} casts, ${String(target.RESOURCE_CHANGE)} resource changes, ${String(target.AURA)} aura transitions. No combatantinfo: the segment starts strictly after the fight start, and the profile is carried by the first part of any bundle it joins. ${facts}`,
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: events }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", { actorId: BLOOD, side: "SOURCE", expected: source }),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", { actorId: BLOOD, side: "TARGET", expected: target }),
    ],
    ["VALIDATED_EVIDENCE"],
    "The census is of the segment, never of the fight: exactly the families the --families option retained, between the recorded exclusive --from and inclusive --to bounds, and nothing else. On its own a segment analyzes to PROFILE_NOT_RESOLVED — there is no combatant profile in it — which is the correct refusal, not a smaller population.",
    { related: ["tests/unit/sanitize-probe.test.ts", "tests/unit/m10c5b-corpus-bundle.test.ts"] },
  );

const BLOOD_CASES = [
  kase(
    "normalization.blood-death-knight-rotational-45s-normalizes-whole-and-in-order",
    BLOOD45,
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts; supported-families.ts; scripts/sanitize-probe.mjs --actor-slice --families",
    "The 913-event family-filtered actor-14 slice normalizes with every raw type recognised and every event kept in capture order: as SOURCE the combatantinfo, 107 casts, 89 Runic Power changes and 593 aura transitions; as TARGET 29 casts, 89 resource changes and 594 aura transitions.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 913 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", {
        actorId: BLOOD,
        side: "SOURCE",
        expected: { COMBATANT_INFO: 1, CAST: 107, RESOURCE_CHANGE: 89, AURA: 593 },
      }),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", {
        actorId: BLOOD,
        side: "TARGET",
        expected: { CAST: 29, RESOURCE_CHANGE: 89, AURA: 594 },
      }),
    ],
    ["VALIDATED_EVIDENCE"],
    "A census of what the slice holds for the actor, never of the fight: exactly the families the --families option retained, at or before the recorded bound. The same predicate that cut the two Paladin subjects from the same stream cut this one; the stream had no actor filter, so it is complete for all three.",
    { related: ["tests/unit/sanitize-probe.test.ts"] },
  ),
  blood_segment_case(
    BLOOD_45_105,
    "seg-45-105",
    967,
    { CAST: 86, RESOURCE_CHANGE: 89, AURA: 606 },
    { CAST: 38, RESOURCE_CHANGE: 89, AURA: 636 },
    "The first Vampiric Blood (2,087,109) and the second Dancing Rune Weapon (2,099,885) lie in it.",
  ),
  blood_segment_case(
    BLOOD_105_165,
    "seg-105-165",
    821,
    { CAST: 78, RESOURCE_CHANGE: 67, AURA: 542 },
    { CAST: 28, RESOURCE_CHANGE: 67, AURA: 534 },
    "The second Raise Dead (2,128,448) and the second Vampiric Blood (2,149,299) lie in it.",
  ),
  kase(
    "normalization.blood-death-knight-gtkb-opener-normalizes-whole-and-in-order",
    BLOOD_GTKB,
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts; supported-families.ts; scripts/sanitize-probe.mjs --actor-slice --families",
    "The 355-event family-filtered actor-14 opener normalizes with every raw type recognised and every event kept in capture order: as SOURCE the combatantinfo, 51 casts, 45 Runic Power changes and 214 aura transitions; as TARGET 4 casts, 45 resource changes and 228 aura transitions.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 355 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", {
        actorId: BLOOD,
        side: "SOURCE",
        expected: { COMBATANT_INFO: 1, CAST: 51, RESOURCE_CHANGE: 45, AURA: 214 },
      }),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", {
        actorId: BLOOD,
        side: "TARGET",
        expected: { CAST: 4, RESOURCE_CHANGE: 45, AURA: 228 },
      }),
    ],
    ["VALIDATED_EVIDENCE"],
    "A census of what the opener holds for the actor, never of the fight.",
    { related: ["tests/unit/sanitize-probe.test.ts"] },
  ),
  kase(
    "normalization.blood-death-knight-165s-bundle-composes-three-parts-into-one-complete-fight",
    BLOOD_105_165,
    "NORMALIZATION",
    "tests/support/corpus/fight.ts bundleOverEvidence; loader.ts certificateErrors; scripts/corpus/build-manifest.mjs certifiedEmpty",
    "The three parts — the 45 s slice (its grant ending at 2,049,581), then the segments granted from 2,049,589 and 2,109,590 — compose into one 2,701-event fight over [2,004,589 .. 2,169,439] with CASTS, AURAS, RESOURCES, COMBATANT_INFO and GEAR each COMPLETE over ONE joined range [2,004,589 .. 2,169,589]. The seven milliseconds [2,049,582 .. 2,049,588] between the first two parts are bridged only by the seg-45-105 record's zero-event certificate.",
    [
      a("NORMALIZATION.BUNDLE_COMPOSITION", {
        historyArtifactIds: BLOOD_HISTORY,
        declaredHoles: [],
        actorId: BLOOD,
        expected: {
          events: 2701,
          coverage: {
            CASTS: "COMPLETE",
            AURAS: "COMPLETE",
            RESOURCES: "COMPLETE",
            COMBATANT_INFO: "COMPLETE",
            GEAR: "COMPLETE",
            DAMAGE: "ABSENT",
            HEALING: "ABSENT",
            ABSORBS: "ABSENT",
            SUMMONS: "ABSENT",
          },
          castRanges: [{ fromReportTimeMs: 2004589, toReportTimeMs: 2169589 }],
          windowFromReportTimeMs: 2004589,
          windowToReportTimeMs: 2169439,
        },
      }),
    ],
    ["VALIDATED_EVIDENCE"],
    "Composition is a claim about coverage, and coverage is never inferred from the bytes: the same composer, certificate validation and refusals the Paladin bundles proved, over a third subject cut from the same two captures.",
    { related: ["tests/unit/m10c5b-corpus-bundle.test.ts", "tests/unit/m9b-corpus-loader.test.ts"] },
  ),
  kase(
    "spec-blood-death-knight.authority-build-boundary-and-domains-on-the-first-slice",
    BLOOD45,
    "SPEC_BLOOD_DEATH_KNIGHT",
    "src/specs/deathknight/blood/registration.ts; authority-bindings.ts; pinned-authority.ts; observed-analysis.ts (build); action-profile.ts; domain-boundary.ts; domains.ts",
    "Over the 45 s slice the registration analyzes actor 14 under exactly the pinned SIMC_APL_DEATHKNIGHT_BLOOD artifact (twelve client-version guards evaluated for 12.1.0, their pre-12.1 lines dropped), resolves the build from the observed tree (10 of 13 modelled talents SELECTED; Consumption, Exterminate and Reaper's Mark UNKNOWN because their NORMAL nodes are absent — never NOT_SELECTED; hero tree sanlayn by entry membership), classifies exactly twelve pinned entries OUTSIDE the rotational decision domain by the shared token categories (six item uses, five racials including Arcane Torrent, one potion), and represents all six domains: OFFENSIVE_ROTATION under the authority with the Death Strike dual-role marker; the five others declared with no pinned authority, ACTIVE_MITIGATION and SELF_HEALING carrying the shared-button marker for death_strike.",
    [
      a("SPEC_BLOOD_DEATH_KNIGHT.AUTHORITY_PROVENANCE", { actorId: BLOOD, expected: BLOOD_PROVENANCE }),
      a("SPEC_BLOOD_DEATH_KNIGHT.BUILD_RESOLUTION", {
        actorId: BLOOD,
        expected: { talents: BLOOD_TALENTS, heroTree: "sanlayn" },
      }),
      a("SPEC_BLOOD_DEATH_KNIGHT.NON_DOMAIN_ENTRIES", { actorId: BLOOD, expected: BLOOD_NON_DOMAIN }),
      blood_domain("OFFENSIVE_ROTATION", {
        resolution: "AUTHORITY_AVAILABLE",
        authorityId: "SIMC_APL_DEATHKNIGHT_BLOOD",
        offensiveAuthorityGoverns: null,
        evidenceFamily: null,
        deathStrikeDualRole: true,
        sharesActionWithOffensive: null,
      }),
      blood_domain("RESOURCE_SPENDING", BLOOD_NO_AUTHORITY_DOMAIN),
      blood_domain("ACTIVE_MITIGATION", {
        ...BLOOD_NO_AUTHORITY_DOMAIN,
        sharesActionWithOffensive: "death_strike",
      }),
      blood_domain("DEFENSIVE_COOLDOWN", BLOOD_NO_AUTHORITY_DOMAIN),
      blood_domain("SELF_HEALING", {
        ...BLOOD_NO_AUTHORITY_DOMAIN,
        sharesActionWithOffensive: "death_strike",
      }),
      blood_domain("INTERRUPT", { ...BLOOD_NO_AUTHORITY_DOMAIN, evidenceFamily: "UNVERIFIED" }),
    ],
    ["OWNED_CONTRACT", "PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "A tank declares the survival domains and binds nothing to them: the analyzer says it has no standard for Death Strike as mitigation or healing rather than pretending the offensive list's spender verdict is one. The domain boundary is a decision about what the class/spec authority governs, taken by TOKEN CATEGORY before any build fact is read. Consumption stays UNKNOWN by the three-way rule, which is why the two `consumption,empower_to=1` entries would BLOCK a scan that reached them — none does in this evidence, because every San'layn scan stops at the first entry of its list.",
    { authority: BLOOD_AUTHORITY, related: BLOOD_RELATED },
  ),
  kase(
    "spec-blood-death-knight.the-measurement-over-165s-is-one-hundred-twenty-three-decisions-thirty-seven-resolved",
    BLOOD_105_165,
    "SPEC_BLOOD_DEATH_KNIGHT",
    "src/specs/deathknight/blood/observed-analysis.ts analyzeObservedBloodDeathKnightDecisions; first-gcd-adapter.ts (stopping points, dispatch trace, undecided candidates); src/simc/nested-selection.ts (M11-B1 run_action_list semantics)",
    "Over the composed 165 s fight the evaluator finds 123 eligible decisions — every Death Strike, Heart Strike, Vampiric Strike, Blood Boil, Marrowrend and Death's Caress cast — and excludes 148 casts by name: 87 melee swings, 47 NON_GCD presses (Infliction of Sorrow's 36 proc executions, Raise Dead, Vampiric Blood, Dark Command, Anti-Magic Shell, Death's Advance, the potion), 1 GCD cast with no authority token (Anti-Magic Zone), 13 in-domain GCD casts outside the slice (11 Death and Decay, 2 Dancing Rune Weapon). Of the 123: 37 MATCH, 0 REJECTED, 86 UNKNOWN. THE MEASUREMENT AFTER M11-B6 (Blood Debt's exact count read from its own transitions; M11-B5 had 25 MATCH — 21 Death Strikes and 4 Blood Boils — with the first undecided candidate on buff.blood_debt.stack at sanlayn[7] for 45 decisions): the 37 resolved are 27 Death Strikes (san_gift[1] runic_power.deficit<36 at 6, sanlayn[2] runic_power.deficit<20 at 15, and since M11-B6 sanlayn[9] runic_power.deficit<40 at 6 where the Blood Debt count below 10 makes sanlayn[7] FALSE and Vampiric Strike is proven down), 6 Heart Strikes (sanlayn[8] buff.vampiric_strike.up with every higher entry FALSE: 1 EXACT_ENTRY, 5 TOKEN_CONVERGED where sanlayn[1]'s Heart Strike stays undecided on fight_remains and every resolution of it still selects the heart_strike token) and 4 Blood Boils at sanlayn[6] (buff.boiling_point.up). Blood Debt at the 123 decisions: EXACT_STACK_OBSERVATION 107 (the absolute count of the last applybuffstack), EXACT_STACK_APPLICATION 7 (a plain applybuff preceded by a removal or by nothing: 1), PROVEN_INACTIVE 3 (after the Marrowrend consumption), AURA_STATE_UNKNOWN 6 (before the first observed transition); no pre-decision-window refusal, no ambiguous shape. Of the 45 decisions M11-B5 left first-undecided on the Blood Debt stack, 7 resolve to MATCH and 38 advance to a later obstacle — 16 to Marrowrend's USABILITY at sanlayn[7] (the count is exactly 10, the entry is TRUE, and no rune or affordability proof is built for an action that was not cast), 19 to fight_remains at sanlayn[9], 2 to buff.vampiric_strike.up and 1 to Heart Strike's usability at sanlayn[8]; none remains on the stack. Runic Power at the 123 decisions: OWN_PRE_COST 44, CARRIED_EXACT 14, WINDOW_BOUNDED 59 (a Heart Strike's or Vampiric Strike's own Heartbreaker gain sits 0-1 ms AHEAD of it in the log, so only the deficit's lower bound both readings share is bound), POST_SPEND_NOT_OBSERVED 5 (a Blood Boil, Marrowrend or Death's Caress after a Death Strike with no observation between: the amount after the spend is not read), NO_ANCHOR 1 (the pull). The root scan RESOLVES at 81 decisions (37 to a selection, 44 divergent), BLOCKS at sanlayn[10] consumption for 41 and at the default[15] run gate for 1; the B1 dispatch semantics are unchanged from M11-B3. The first undecided GCD candidate in priority order is now sanlayn[9] death_strike on fight_remains at 20 decisions, sanlayn[7] marrowrend on USABILITY:marrowrend at 16, san_gift[0] on buff.essence_of_the_blood_queen.remains at 14 and sanlayn[1] on the same atom plus fight_remains at 11 (Essence window refusals), sanlayn[0] on Bone Shield at 7, sanlayn[5] any_dnd usability at 4, the Dancing Rune Weapon gate at 3, san_gift[3] on Essence's stack at 3, sanlayn[2] on runic_power.deficit at 3 (POST_SPEND) and on Death Strike's USABILITY at 3, sanlayn[8] on buff.vampiric_strike.up at 2 and on Heart Strike's usability at 1, sanlayn[6] Blood Boil usability at 2 and buff.boiling_point.up at 1, san_gift[1] Death Strike usability at 1; the full census is pinned below, and the stack, remains and Runic Power evidence censuses in their own assertions. THE MEASUREMENT AFTER M11-B8 (Essence lone refreshes of unproven cause anchor nothing exact; the order-invariant floor inside the pre-decision window): 37 MATCH / 9 REJECTED / 77 UNKNOWN — the two Vampiric Strikes at 2,087,470 and 2,093,667 join the seven M11-B7 REJECTED (sanlayn[7] marrowrend at Blood Debt 10 once sanlayn[1] is FALSE from the Essence floor), every prior MATCH and REJECTED keeps its outcome and token, and the Vampiric Strike at 2,029,599 becomes EXACT_ENTRY. Essence remainders over the 123: EXACT 24 (a gain or its same-millisecond companion), BOUNDED 40 (a floor past lone refreshes), AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION 32 (the floor has run out), WINDOW_ORDER_INVARIANT_BOUNDED 20, window-refused 6 (two fresh applications, one expiry, three clusters with no floor before them), presence-unknown 1; the 26 remains window refusals of M11-B4 are now 6, the 26 stack refusals are unchanged. The undecided candidates move accordingly: san_gift[0] on Essence 14 to 1, sanlayn[1] on Essence 11 to 4 and on fight_remains 11 to 6, and sanlayn[9] now carries Essence at 15 beside fight_remains at 34 — decisions already UNKNOWN on fight_remains whose sanlayn[9] third disjunct (buff.essence_of_the_blood_queen.remains<8) can no longer be decided from a lone-refresh chain.",
    [
      a("SPEC_BLOOD_DEATH_KNIGHT.COVERAGE_SUMMARY", {
        actorId: BLOOD,
        ...BLOOD_FULL,
        expected: {
          eligibleDecisions: 123,
          match: 42,
          rejected: 9,
          unknown: 72,
          exclusions: {
            MELEE_SWING: 87,
            NON_GCD_ACTION: 47,
            NO_AUTHORITY_TOKEN_BINDING: 1,
            OUTSIDE_FIRST_SLICE: 13,
          },
        },
      }),
      a("SPEC_BLOOD_DEATH_KNIGHT.STOPPING_POINT_DISTRIBUTION", {
        actorId: BLOOD,
        ...BLOOD_FULL,
        expected: {
          match: 42,
          rejected: 9,
          stoppingEntries: {
            "default[15] run_action_list": 1,
            "(root scan resolved)": 88,
            "sanlayn[10] consumption": 34,
          },
          stoppingAtoms: {
            "default[15] run_action_list | buff.gift_of_the_sanlayn.up": 1,
            [`sanlayn[10] consumption | ${BLOOD_CONSUMPTION_TAG}`]: 34,
          },
          dispatchOutcomes: {
            "default[13] -> high_prio_actions : CALL_MAY_SELECT": 123,
            "default[14] -> deathbringer : RUN_GATE_FALSE_SKIPPED": 123,
            "default[15] -> san_gift : BLOCKED": 1,
            "default[15] -> san_gift : RUN_ENTERED_SCAN_ENDS": 24,
            "default[15] -> san_gift : RUN_GATE_FALSE_SKIPPED": 98,
            "default[16] -> sanlayn : BLOCKED": 34,
            "default[16] -> sanlayn : RUN_ENTERED_SCAN_ENDS": 64,
          },
          undecidedGcdCandidates: {
            "high_prio_actions[1] dancing_rune_weapon | debuff.reapers_mark_debuff.up": 3,
            "high_prio_actions[1] dancing_rune_weapon | fight_remains": 3,
            "san_gift[0] heart_strike | buff.essence_of_the_blood_queen.remains": 1,
            "san_gift[1] death_strike | USABILITY:death_strike": 1,
            "san_gift[2] any_dnd | buff.crimson_scourge.remains": 4,
            "san_gift[2] any_dnd | buff.visceral_strength.remains": 5,
            "san_gift[3] heart_strike | buff.essence_of_the_blood_queen.stack": 9,
            "san_gift[3] heart_strike | USABILITY:heart_strike": 2,
            "san_gift[4] death_strike | USABILITY:death_strike": 10,
            "san_gift[5] blood_boil | buff.boiling_point.up": 5,
            "san_gift[6] heart_strike | USABILITY:heart_strike": 1,
            "san_gift[7] blood_boil | USABILITY:blood_boil": 1,
            "sanlayn[1] heart_strike | buff.essence_of_the_blood_queen.remains": 4,
            "sanlayn[1] heart_strike | fight_remains": 6,
            "sanlayn[2] death_strike | runic_power.deficit": 5,
            "sanlayn[2] death_strike | USABILITY:death_strike": 4,
            "sanlayn[5] any_dnd | buff.crimson_scourge.remains": 1,
            "sanlayn[5] any_dnd | USABILITY:any_dnd": 5,
            "sanlayn[6] blood_boil | buff.boiling_point.up": 1,
            "sanlayn[7] marrowrend | USABILITY:marrowrend": 13,
            "sanlayn[8] heart_strike | buff.vampiric_strike.up": 3,
            "sanlayn[9] death_strike | runic_power.deficit": 2,
            "sanlayn[9] death_strike | fight_remains": 34,
            "sanlayn[9] death_strike | buff.essence_of_the_blood_queen.remains": 15,
            "sanlayn[0] deaths_caress | buff.bone_shield.stack": 1,
            "sanlayn[6] blood_boil | USABILITY:blood_boil": 6,
            "san_gift[5] blood_boil | USABILITY:blood_boil": 2,
            "sanlayn[8] heart_strike | USABILITY:heart_strike": 1,
          },
        },
      }),
      a("SPEC_BLOOD_DEATH_KNIGHT.STACK_EVIDENCE_CENSUS", {
        actorId: BLOOD,
        ...BLOOD_FULL,
        expected: {
          stackEvidence: {
            "bone_shield | EXACT_STACK_OBSERVATION": 114,
            "bone_shield | COUNT_AMBIGUOUS_SINCE_OBSERVATION": 1,
            "bone_shield | WINDOW_ORDER_INVARIANT_SET": 7,
            [`bone_shield | ${BLOOD_WINDOW_TAG}`]: 1,
            "essence_of_the_blood_queen | EXACT_STACK_OBSERVATION": 15,
            "essence_of_the_blood_queen | EXACT_STACK_APPLICATION": 9,
            "essence_of_the_blood_queen | WINDOW_ORDER_INVARIANT_SET": 12,
            "essence_of_the_blood_queen | COUNT_AMBIGUOUS_SINCE_OBSERVATION": 72,
            [`essence_of_the_blood_queen | ${BLOOD_WINDOW_TAG}`]: 14,
            "essence_of_the_blood_queen | AURA_STATE_UNKNOWN": 1,
            "blood_debt | EXACT_STACK_OBSERVATION": 107,
            "blood_debt | EXACT_STACK_APPLICATION": 7,
            "blood_debt | PROVEN_INACTIVE": 3,
            "blood_debt | AURA_STATE_UNKNOWN": 6,
          },
          stackValues: {
            "bone_shield | stack 5": 2,
            "bone_shield | stack 6": 6,
            "bone_shield | stack 7": 9,
            "bone_shield | stack 8": 15,
            "bone_shield | stack 9": 27,
            "bone_shield | stack 10": 16,
            "bone_shield | stack 11": 33,
            "bone_shield | stack 12": 6,
            "bone_shield | stack one of {5,6,7,8}": 1,
            "bone_shield | stack one of {7,8,9,10}": 1,
            "bone_shield | stack one of {11,12}": 1,
            "bone_shield | stack one of {8,9,10,11}": 2,
            "bone_shield | stack one of {6,7,8,9}": 1,
            "bone_shield | stack one of {9,11}": 1,
            "essence_of_the_blood_queen | stack 1": 9,
            "essence_of_the_blood_queen | stack 2": 4,
            "essence_of_the_blood_queen | stack 3": 4,
            "essence_of_the_blood_queen | stack 4": 2,
            "essence_of_the_blood_queen | stack 5": 2,
            "essence_of_the_blood_queen | stack 6": 2,
            "essence_of_the_blood_queen | stack 7": 1,
            "essence_of_the_blood_queen | stack one of {0,1}": 1,
            "essence_of_the_blood_queen | stack one of {1,2}": 2,
            "essence_of_the_blood_queen | stack one of {2,3}": 2,
            "essence_of_the_blood_queen | stack one of {3,4}": 1,
            "essence_of_the_blood_queen | stack one of {4,5}": 2,
            "essence_of_the_blood_queen | stack one of {5,6}": 2,
            "essence_of_the_blood_queen | stack one of {6,7}": 2,
            "blood_debt | stack 0": 3,
            "blood_debt | stack 1": 7,
            "blood_debt | stack 2": 11,
            "blood_debt | stack 3": 8,
            "blood_debt | stack 4": 10,
            "blood_debt | stack 5": 8,
            "blood_debt | stack 6": 7,
            "blood_debt | stack 7": 5,
            "blood_debt | stack 8": 10,
            "blood_debt | stack 9": 6,
            "blood_debt | stack 10": 42,
          },
        },
      }),
      a("SPEC_BLOOD_DEATH_KNIGHT.BLOOD_DEBT_TRANSITION_CENSUS", {
        actorId: BLOOD,
        ...BLOOD_FULL,
        expected: {
          transitions: {
            applybuff: 3,
            applybuffstack: 26,
            refreshbuff: 0,
            removebuffstack: 0,
            removebuff: 2,
          },
          stackValues: [
            null,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            null,
            null,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            null,
            null,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
          ],
          sameMillisecondPairs: 0,
          // Every gain follows a Death Strike (49998) by 10-49 ms; both removals follow a Marrowrend (195182).
          // The wire writes Blood Debt AFTER its cause — the opposite of Bone Shield's own-effect lead.
          precedingOwnCast: { 49998: 29, 195182: 2 },
          lagMs: { min: 10, max: 49 },
          // The next eligible decision is at least a GCD away, so nothing sits inside the 50 ms window.
          minGapToNextDecisionMs: 702,
          validation: { points: 30, consistent: 30, inconsistent: 0 },
        },
      }),
      a("SPEC_BLOOD_DEATH_KNIGHT.RUNIC_POWER_EVIDENCE_CENSUS", {
        actorId: BLOOD,
        ...BLOOD_FULL,
        expected: {
          runicPowerEvidence: {
            OWN_PRE_COST: 44,
            CARRIED_EXACT: 14,
            WINDOW_BOUNDED: 59,
            POST_SPEND_NOT_OBSERVED: 5,
            NO_ANCHOR: 1,
          },
          runicPowerWindowLeads: { "lead 0": 72, "lead 1": 7 },
        },
      }),
      a("SPEC_BLOOD_DEATH_KNIGHT.REMAINS_EVIDENCE_CENSUS", {
        actorId: BLOOD,
        ...BLOOD_FULL,
        expected: {
          remainsEvidence: {
            "bone_shield | EXACT": 11,
            "bone_shield | BOUNDED": 104,
            "bone_shield | WINDOW_ORDER_INVARIANT_BOUNDED": 7,
            [`bone_shield | ${BLOOD_WINDOW_TAG}`]: 1,
            "essence_of_the_blood_queen | EXACT": 24,
            "essence_of_the_blood_queen | BOUNDED": 40,
            "essence_of_the_blood_queen | AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION": 32,
            "essence_of_the_blood_queen | WINDOW_ORDER_INVARIANT_BOUNDED": 20,
            [`essence_of_the_blood_queen | ${BLOOD_WINDOW_TAG}`]: 6,
            "essence_of_the_blood_queen | AURA_STATE_UNKNOWN": 1,
            "vampiric_strike | PERMANENT": 15,
            "vampiric_strike | ZERO_BY_PROOF": 88,
            "vampiric_strike | AURA_STATE_UNKNOWN": 20,
            "crimson_scourge | EXACT": 8,
            "crimson_scourge | ZERO_BY_PROOF": 108,
            "crimson_scourge | AURA_STATE_UNKNOWN": 6,
            [`crimson_scourge | ${BLOOD_WINDOW_TAG}`]: 1,
            "visceral_strength | EXACT": 96,
            "visceral_strength | ZERO_BY_PROOF": 20,
            "visceral_strength | AURA_STATE_UNKNOWN": 7,
          },
          preDecisionWindowRefusals: {
            "bone_shield | up | lead 20": 1,
            "bone_shield | stack | lead 20": 1,
            "bone_shield | remains | lead 20": 1,
            "essence_of_the_blood_queen | stack | lead 0": 13,
            "essence_of_the_blood_queen | remains | lead 0": 6,
            "essence_of_the_blood_queen | stack | lead 1": 1,
            "crimson_scourge | remains | lead 38": 1,
            "death_and_decay | up | lead 0": 1,
            "death_and_decay | up | lead 20": 1,
            "death_and_decay | up | lead 21": 1,
            "death_and_decay | up | lead 34": 1,
          },
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The coverage disclosure is the honest measure of the slice: 37 of 123 decisions resolve — 27 Death Strikes the pinned list selects from proven remainders, proven counts and the cast's own or carried Runic Power, 6 Heart Strikes it selects at sanlayn[8] once the Blood Debt count below 10 makes the Marrowrend entry FALSE, and 4 Blood Boils it selects once the carried Runic Power decides the Death Strike gate above them — and every other decision names the entry and the atom the shared machinery could not decide. M11-B6 reads Blood Debt's count from its own transitions only: the absolute count of the last applybuffstack, the pinned 1 of a fresh plain application, zero from an observed removal; never from a Death Strike, the set bonus's cooldown or the combatantinfo's silence, and the 16 decisions at exactly 10 stacks stop on Marrowrend's usability rather than becoming a REJECTED from a guessed rune count. M11-B5 carries Runic Power as a sequence of READ states under RESOURCES and CASTS continuity: a resourcechange replaces the state with its POST_CHANGE attachment, a costed cast leaves it unknown until the next observation, and a gain 0-1 ms ahead of the decision is not attributed — only the deficit's lower bound is bound. M11-B4 derived the remainders from observed gains and the pinned Blood durations (Essence 25 s, not the 20 s table value) under continuity from the gain, bound only the lower bound past a Bone Shield refresh of unpinned cause, refused every transition inside the 50 ms pre-decision window (the 0, 1 and 20 ms own-effect leads the audit measured), and refused nothing on threshold tolerance because no exact value fell within 50 ms of 1.5, 3 or 8 seconds. Nothing here converts an UNKNOWN into a verdict, and nothing here was widened to force one.",
    { authority: BLOOD_AUTHORITY, related: BLOOD_RELATED },
  ),
  kase(
    "spec-blood-death-knight.the-first-slice-population-is-forty-eight-and-the-opener-twenty-one",
    BLOOD_GTKB,
    "SPEC_BLOOD_DEATH_KNIGHT",
    "src/specs/deathknight/blood/observed-analysis.ts; first-gcd-adapter.ts",
    "The second subject (gtKb fight 22, the same San'layn build) yields 21 eligible decisions over its 20 s opener — after M11-B4, 15 inside the Gift window whose root scan RESOLVES (one of them, the Death Strike at 2,421,923, to a MATCH at san_gift[1]; the others with every san_gift candidate undecided, first san_gift[0] on buff.essence_of_the_blood_queen.remains at 8 where the cast's own Essence transition sits inside the window, san_gift[2] on the Crimson Scourge / Visceral Strength remainders at 6 where neither aura has been observed yet) and 6 after it that BLOCK at sanlayn[10] consumption (first undecided since M11-B6: sanlayn[8] on buff.vampiric_strike.up at 5 — the Blood Debt count is exact at every one of them, 4 to 6, so sanlayn[7] is FALSE — and sanlayn[5] any_dnd usability at 1; Blood Debt over the opener: EXACT_STACK_OBSERVATION 14, EXACT_STACK_APPLICATION 1, AURA_STATE_UNKNOWN 6 before the first Death Strike's application; Bone Shield's remainder is EXACT at 20 of 21 decisions from the opener's first stack gain; since M11-B5 Runic Power is exact or bounded at every opener decision — OWN_PRE_COST 6, CARRIED_EXACT 5, WINDOW_BOUNDED 10 — so no runic_power.deficit gate is undecided there) — and 30 excluded casts (16 melee swings, 11 NON_GCD, 3 outside the slice); Dancing Rune Weapon is never a candidate, because the opener's cast at 2,417,020 proves the cooldown active for the whole window.",
    [
      a("SPEC_BLOOD_DEATH_KNIGHT.COVERAGE_SUMMARY", {
        actorId: BLOOD_GTKB_ACTOR,
        expected: {
          eligibleDecisions: 21,
          match: 1,
          rejected: 0,
          unknown: 20,
          exclusions: { MELEE_SWING: 16, NON_GCD_ACTION: 11, OUTSIDE_FIRST_SLICE: 3 },
        },
      }),
      a("SPEC_BLOOD_DEATH_KNIGHT.STOPPING_POINT_DISTRIBUTION", {
        actorId: BLOOD_GTKB_ACTOR,
        expected: {
          match: 1,
          rejected: 0,
          stoppingEntries: { "(root scan resolved)": 15, "sanlayn[10] consumption": 6 },
          stoppingAtoms: { [`sanlayn[10] consumption | ${BLOOD_CONSUMPTION_TAG}`]: 6 },
          dispatchOutcomes: {
            "default[13] -> high_prio_actions : CALL_MAY_SELECT": 21,
            "default[14] -> deathbringer : RUN_GATE_FALSE_SKIPPED": 21,
            "default[15] -> san_gift : RUN_ENTERED_SCAN_ENDS": 15,
            "default[15] -> san_gift : RUN_GATE_FALSE_SKIPPED": 6,
            "default[16] -> sanlayn : BLOCKED": 6,
          },
          undecidedGcdCandidates: {
            "san_gift[0] heart_strike | buff.essence_of_the_blood_queen.remains": 2,
            "san_gift[2] any_dnd | buff.crimson_scourge.remains": 14,
            "san_gift[2] any_dnd | buff.visceral_strength.remains": 14,
            "san_gift[3] heart_strike | buff.essence_of_the_blood_queen.stack": 4,
            "san_gift[3] heart_strike | USABILITY:heart_strike": 5,
            "san_gift[4] death_strike | USABILITY:death_strike": 6,
            "san_gift[5] blood_boil | buff.boiling_point.up": 5,
            "san_gift[6] heart_strike | USABILITY:heart_strike": 3,
            "san_gift[7] blood_boil | USABILITY:blood_boil": 1,
            "sanlayn[5] any_dnd | USABILITY:any_dnd": 1,
            "sanlayn[8] heart_strike | buff.vampiric_strike.up": 6,
            "sanlayn[9] death_strike | fight_remains": 6,
          },
        },
      }),
      a("SPEC_BLOOD_DEATH_KNIGHT.STACK_EVIDENCE_CENSUS", {
        actorId: BLOOD_GTKB_ACTOR,
        expected: {
          stackEvidence: {
            "bone_shield | EXACT_STACK_OBSERVATION": 20,
            "bone_shield | WINDOW_ORDER_INVARIANT_SET": 1,
            "essence_of_the_blood_queen | EXACT_STACK_OBSERVATION": 6,
            "essence_of_the_blood_queen | WINDOW_ORDER_INVARIANT_SET": 5,
            "essence_of_the_blood_queen | COUNT_AMBIGUOUS_SINCE_OBSERVATION": 7,
            [`essence_of_the_blood_queen | ${BLOOD_WINDOW_TAG}`]: 2,
            "essence_of_the_blood_queen | AURA_STATE_UNKNOWN": 1,
            "blood_debt | EXACT_STACK_OBSERVATION": 14,
            "blood_debt | EXACT_STACK_APPLICATION": 1,
            "blood_debt | AURA_STATE_UNKNOWN": 6,
          },
          stackValues: {
            "bone_shield | stack 7": 12,
            "bone_shield | stack 12": 8,
            "bone_shield | stack one of {7,9}": 1,
            "essence_of_the_blood_queen | stack 4": 2,
            "essence_of_the_blood_queen | stack 5": 1,
            "essence_of_the_blood_queen | stack 6": 3,
            "essence_of_the_blood_queen | stack one of {1,2}": 1,
            "essence_of_the_blood_queen | stack one of {2,3}": 1,
            "essence_of_the_blood_queen | stack one of {3,4}": 1,
            "essence_of_the_blood_queen | stack one of {4,5}": 1,
            "essence_of_the_blood_queen | stack one of {5,6}": 1,
            "blood_debt | stack 1": 1,
            "blood_debt | stack 2": 2,
            "blood_debt | stack 3": 2,
            "blood_debt | stack 4": 5,
            "blood_debt | stack 5": 4,
            "blood_debt | stack 6": 1,
          },
        },
      }),
      a("SPEC_BLOOD_DEATH_KNIGHT.BLOOD_DEBT_TRANSITION_CENSUS", {
        actorId: BLOOD_GTKB_ACTOR,
        expected: {
          transitions: { applybuff: 1, applybuffstack: 5, refreshbuff: 0, removebuffstack: 0, removebuff: 0 },
          stackValues: [null, 2, 3, 4, 5, 6],
          sameMillisecondPairs: 0,
          precedingOwnCast: { 49998: 6 },
          lagMs: { min: 18, max: 53 },
          minGapToNextDecisionMs: 711,
          validation: { points: 5, consistent: 5, inconsistent: 0 },
        },
      }),
      a("SPEC_BLOOD_DEATH_KNIGHT.RUNIC_POWER_EVIDENCE_CENSUS", {
        actorId: BLOOD_GTKB_ACTOR,
        expected: {
          runicPowerEvidence: { OWN_PRE_COST: 6, CARRIED_EXACT: 5, WINDOW_BOUNDED: 10 },
          runicPowerWindowLeads: { "lead 0": 8, "lead 1": 2 },
        },
      }),
      a("SPEC_BLOOD_DEATH_KNIGHT.RUNE_AFFORDABILITY_CENSUS", {
        actorId: BLOOD_GTKB_ACTOR,
        expected: {
          runeAffordabilityEvidence: { OWN_PRE_COST_AFFORDABLE: 11, NO_RUNE_OBSERVATION: 10 },
          runeCounts: { "runes 2": 5, "runes 3": 4, "runes 4": 2 },
        },
      }),
      a("SPEC_BLOOD_DEATH_KNIGHT.REMAINS_EVIDENCE_CENSUS", {
        actorId: BLOOD_GTKB_ACTOR,
        expected: {
          remainsEvidence: {
            "bone_shield | EXACT": 20,
            "bone_shield | WINDOW_ORDER_INVARIANT_BOUNDED": 1,
            "essence_of_the_blood_queen | EXACT": 6,
            "essence_of_the_blood_queen | BOUNDED": 7,
            "essence_of_the_blood_queen | WINDOW_ORDER_INVARIANT_BOUNDED": 6,
            [`essence_of_the_blood_queen | ${BLOOD_WINDOW_TAG}`]: 1,
            "essence_of_the_blood_queen | AURA_STATE_UNKNOWN": 1,
            "vampiric_strike | AURA_STATE_UNKNOWN": 21,
            "crimson_scourge | EXACT": 1,
            "crimson_scourge | ZERO_BY_PROOF": 5,
            "crimson_scourge | AURA_STATE_UNKNOWN": 15,
            "visceral_strength | EXACT": 5,
            "visceral_strength | AURA_STATE_UNKNOWN": 16,
          },
          preDecisionWindowRefusals: {
            "essence_of_the_blood_queen | stack | lead 0": 2,
            "essence_of_the_blood_queen | remains | lead 0": 1,
          },
        },
      }),
      a("SPEC_BLOOD_DEATH_KNIGHT.BUILD_RESOLUTION", {
        actorId: BLOOD_GTKB_ACTOR,
        expected: { talents: BLOOD_TALENTS, heroTree: "sanlayn" },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "A second report, pull and boss reproduces the same stopping points from the same list, which is what makes them a property of the shared machinery on this authority rather than of one fight.",
    { authority: BLOOD_GTKB_AUTHORITY, related: BLOOD_RELATED },
  ),
  kase(
    "spec-blood-death-knight.the-first-decision-at-the-pull-stops-at-the-undecided-gift-gate",
    BLOOD45,
    "SPEC_BLOOD_DEATH_KNIGHT",
    "src/specs/deathknight/blood/first-gcd-adapter.ts; aura-bindings.ts; cooldown-bindings.ts; resources.ts; resolver.ts; src/simc/nested-selection.ts (UNDECIDED run gate)",
    "The Death's Caress at 2,004,615 (+26 ms) is UNKNOWN with its root scan stopped at default[15] run_action_list on buff.gift_of_the_sanlayn.up: no Gift transition has been observed yet (AMBIGUOUS_INITIAL_STATE, never 'not up'), so the run gate is undecided and the scan cannot choose between entering san_gift and continuing to sanlayn — the B1 fail-closed edge on real evidence. Runes 6 of 6 (cost 1) bind rune=6; no Runic Power observation on a Rune-costed cast. Bone Shield's application at 2,004,595 is this cast's OWN effect logged 20 ms ahead of it (Bone Shield is absent from the combatantinfo aura snapshot), so since M11-B4 its presence, count and remainder are all REFUSED by the 50 ms pre-decision window (PRE_DECISION_WINDOW_TRANSITION, lead 20) rather than read as pre-pull state; M11-B2 read the presence as UP and the count as unobserved. Exterminate is bound DOWN by hero-tree exclusion — a Deathbringer aura in a resolved San'layn build. Dancing Rune Weapon has no observed cast and is UNKNOWN, so its gate is a competing undecided GCD candidate as well. The unselectability proof refuses on precombat[1] deaths_caress, an unconditional entry of a list that is unreachable in combat — a measured limit of the cross-list proof, recorded rather than repaired.",
    [
      blood_decision(2004615, BLOOD_DC, {
        ...BLOOD_UNKNOWN,
        unselectabilityRefusal: "UNCONDITIONAL_ENTRY",
        stoppingAt: "default[15] run_action_list",
        stoppingAtoms: ["buff.gift_of_the_sanlayn.up"],
      }),
      blood_dispatch(2004615, BLOOD_DC, [D_CALL, D_DEATHBRINGER_SKIPPED, D_SAN_GIFT_UNDECIDED]),
      blood_resources(2004615, BLOOD_DC, {
        runes: blood_runes(6, 1),
        runicPower: BLOOD_NO_RES,
        runicPowerDeficit: null,
        rune: 6,
      }),
      blood_aura(
        2004615,
        BLOOD_DC,
        "gift_of_the_sanlayn",
        blood_unbound_aura(BLOOD_GIFT, "AURA_STATE_UNKNOWN", "AMBIGUOUS_INITIAL_STATE"),
      ),
      blood_aura(2004615, BLOOD_DC, "exterminate", blood_excluded_aura(BLOOD_EXTERMINATE)),
      blood_aura(
        2004615,
        BLOOD_DC,
        "bone_shield",
        blood_unbound_aura(BLOOD_BONE_SHIELD, BLOOD_WINDOW_TAG, null),
      ),
      blood_stack(2004615, BLOOD_DC, "bone_shield", blood_unbound_stack(BLOOD_BONE_SHIELD, BLOOD_WINDOW_TAG)),
      blood_remains(2004615, BLOOD_DC, "bone_shield", blood_remains_unbound(BLOOD_WINDOW_TAG, 20)),
      // No Runic Power observation precedes the pull cast: no anchor, never a value.
      blood_rp_state(2004615, BLOOD_DC, blood_rp_unbound("NO_ANCHOR")),
      blood_cooldown(2004615, BLOOD_DC, blood_drw_unknown("NO_OBSERVED_CAST")),
    ],
    ["OWNED_CONTRACT", "PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "An undecided run gate is not a false one: the scan neither enters the child nor skips it, and the answer is UNKNOWN with the gate named. Silence about the Gift is not evidence it was down.",
    { authority: BLOOD_AUTHORITY, related: BLOOD_RELATED },
  ),
  kase(
    "spec-blood-death-knight.inside-the-gift-window-the-scan-transfers-into-san-gift-and-selects-death-strike",
    BLOOD45,
    "SPEC_BLOOD_DEATH_KNIGHT",
    "src/specs/deathknight/blood/first-gcd-adapter.ts; aura-bindings.ts (exact Bone Shield count); cooldown-bindings.ts; resources.ts",
    "The Death Strike at 2,012,014 (+7,425 ms) sits inside the first Gift window (applied 2,007,757 with the Dancing Rune Weapon cast): the run gate at default[15] is TRUE and the scan TRANSFERS into san_gift (RUN_ENTERED_SCAN_ENDS). Since M11-B4 it is the slice's first MATCH: Essence of the Blood Queen's remainder is EXACT 24,127 ms from the refresh at 2,011,141 under the pinned 25 s, so san_gift[0] (remains<1.5) is FALSE, and san_gift[1] death_strike,if=runic_power.deficit<36 is TRUE from the cast's own PRE_COST Runic Power (990 of 1,250 on the wire, base cost 450, deficit=26 points) — Death Strike at the exact entry, precisely what was cast. Bone Shield's remainder is a LOWER BOUND of 25,742 ms: the last unambiguous gain is the Dancing Rune Weapon's stack at 2,007,756, and the refreshbuff beside the charge consumption at 2,010,192 is of unpinned cause, so only what both readings agree on is bound. Bone Shield is exactly 6 (last stack transition 2,010,192, every later transition a same-millisecond companion). Dancing Rune Weapon is proven on cooldown from its cast at 2,007,757 under the 90,000 ms effective base (Insatiable Blade SELECTED): 85,743 ms remaining. The Marrowrend at 2,015,770 shows the pre-decision hazard: its own three Bone Shield stack gains are logged BEFORE the cast at the same millisecond, so the presence, the count and the remainder are all REFUSED (PRE_DECISION_WINDOW_TRANSITION, lead 0) rather than read post-cast; its Essence remainder is EXACT 24,259 ms and its Visceral Strength 9,761 ms.",
    [
      blood_decision(2012014, BLOOD_DS, {
        ...BLOOD_DS_MATCH,
        unselectabilityRefusal: "UNCONDITIONAL_ENTRY",
      }),
      blood_dispatch(2012014, BLOOD_DS, BLOOD_IN_GIFT_DISPATCH),
      blood_resources(2012014, BLOOD_DS, {
        runes: BLOOD_NO_RES,
        runicPower: blood_rp(990),
        runicPowerDeficit: 26,
        rune: null,
      }),
      blood_aura(2012014, BLOOD_DS, "gift_of_the_sanlayn", blood_observed_aura(true, BLOOD_GIFT, 2007757)),
      blood_aura(
        2012014,
        BLOOD_DS,
        "dancing_rune_weapon",
        blood_observed_aura(true, BLOOD_DRW_AURA, 2007757),
      ),
      blood_aura(
        2012014,
        BLOOD_DS,
        "vampiric_blood",
        blood_unbound_aura(BLOOD_VB_AURA, "AURA_STATE_UNKNOWN", "AMBIGUOUS_INITIAL_STATE"),
      ),
      blood_stack(2012014, BLOOD_DS, "bone_shield", blood_exact_stack(6)),
      blood_remains(2012014, BLOOD_DS, "essence_of_the_blood_queen", blood_remains_exact(24127, 2011141)),
      blood_remains(2012014, BLOOD_DS, "bone_shield", blood_remains_bounded(25742, 2007756)),
      blood_remains(2012014, BLOOD_DS, "vampiric_strike", blood_remains_unbound("AURA_STATE_UNKNOWN")),
      blood_rp_state(2012014, BLOOD_DS, blood_rp_own(990, 26, 2012014)),
      blood_cooldown(2012014, BLOOD_DS, blood_drw_not_ready(85743, 2007757)),
      blood_decision(2015770, BLOOD_MR, {
        ...BLOOD_DIVERGENT,
        unselectabilityRefusal: "CONDITION_NOT_PROVEN_FALSE",
      }),
      // RE-PINNED for M11-B5: the Marrowrend carries no Runic Power entry of its own (NO_OBSERVATION stands), and the
      // resolver's exact deficit (43) now comes from the state CARRIED from the melee swing's attachment 143 ms earlier.
      blood_resources(2015770, BLOOD_MR, {
        runes: blood_runes(3, 2),
        runicPower: BLOOD_NO_RES,
        runicPowerDeficit: 43,
        rune: 3,
      }),
      // RE-POINTED for M11-B10: the Marrowrend's own three gains at its own
      // millisecond bind what every ordering leaves — the presence M4 proves
      // on both sides, the prefix set { 5,6,7,8 }, the B8 floor — never the
      // exact post-cast 8 and never the pre-cast 5 alone.
      blood_aura(2015770, BLOOD_MR, "bone_shield", blood_window_presence(BLOOD_BONE_SHIELD, 2013178)),
      blood_stack(
        2015770,
        BLOOD_MR,
        "bone_shield",
        blood_bs_set([5, 6, 7, 8], {
          cluster: blood_marrowrend_cluster(2015770),
          beforeClusterStack: 5,
          beforeClusterProof: "EXACT_STACK_OBSERVATION",
          afterClusterStack: 8,
        }),
      ),
      blood_remains(
        2015770,
        BLOOD_MR,
        "bone_shield",
        blood_remains_window_bound(21986, 2007756, {
          cluster: blood_marrowrend_cluster(2015770),
          beforeClusterMs: 21986,
          beforeClusterProof: "GAIN_ANCHOR_BOUNDED",
          resetInClusterMs: 30000,
        }),
      ),
      blood_remains(2015770, BLOOD_MR, "essence_of_the_blood_queen", blood_remains_exact(24259, 2015029)),
      blood_remains(2015770, BLOOD_MR, "visceral_strength", blood_remains_exact(9761, 2013531)),
      blood_remains(2015770, BLOOD_MR, "crimson_scourge", blood_remains_zero(2013542)),
      // The Marrowrend's Runic Power is CARRIED EXACT from the melee swing's attachment 143 ms earlier (820 of 1,250).
      blood_rp_state(2015770, BLOOD_MR, blood_rp_carried(820, 43, 2015627, "EVENT_ASSOCIATED")),
    ],
    ["OWNED_CONTRACT", "PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "A TRUE run gate transfers and does not resume: the parent's default[16] is never visited once san_gift is entered, exactly as the pinned loop makes the child the active list. The first Blood MATCH rests on three proven facts and one observed one — an exact Essence remainder, a bounded Bone Shield remainder, an exact count, and the cast's own Runic Power — and on nothing inferred. The Bone Shield count is the number the wire wrote, carried only across same-millisecond companions and refused, with the count and the remainder, when the decision's own effects precede it in the array.",
    { authority: BLOOD_AUTHORITY, related: BLOOD_RELATED },
  ),
  kase(
    "spec-blood-death-knight.outside-the-gift-window-the-scan-skips-san-gift-and-stops-in-sanlayn",
    BLOOD45,
    "SPEC_BLOOD_DEATH_KNIGHT",
    "src/specs/deathknight/blood/first-gcd-adapter.ts; aura-bindings.ts; observed-action-gate.ts",
    "The Heart Strike at 2,020,278 (+15,689 ms) follows the Gift removal at 2,019,763: buff.gift_of_the_sanlayn.up binds FALSE from the observed removal, the run gate at default[15] is FALSE and is SKIPPED, the parent continues to default[16] run sanlayn, whose gate hero_tree.sanlayn is TRUE, and the scan walks the whole San'layn list: since M11-B4 sanlayn[0] is FALSE (Bone Shield up, exactly 11, and its remainder a 25,503 ms lower bound past the refresh of unpinned cause at 2,010,192), sanlayn[1] is FALSE (Essence exactly 24,485 ms, not under 1.5 s), sanlayn[2] death_strike is undecided on runic_power.deficit (a Heart Strike carries no Runic Power observation), and the scan BLOCKS at sanlayn[10] consumption, whose applicability is UNKNOWN (Consumption's NORMAL node absent) and whose entry cannot be stepped past. Runes 1 of 6 bind rune=1; Bone Shield exactly 11. The Death Strike at 2,044,021 shows the other Bone Shield refusal: three LONE refreshes at 2,043,229 (no stack transition beside them) sit between the last count and the decision, so the count is COUNT_AMBIGUOUS_SINCE_OBSERVATION; Blood Debt is bound to exactly zero from its removal at the same instant (PROVEN_INACTIVE); its Runic Power 1,080 binds deficit=17, which makes deathbringer[0]'s gate TRUE and the unselectability proof refuse with CONDITION_NOT_PROVEN_FALSE at an entry of a list the resolved hero tree can never enter — a second measured limit of the cross-list proof. At that decision the sanlayn run is ENTERED and offers candidates (its Blood Boil at sanlayn[6] is usable-unknown ahead of the Consumption entry), so the worlds DIVERGE instead of blocking.",
    [
      blood_decision(2020278, BLOOD_HS, {
        ...BLOOD_UNKNOWN,
        unselectabilityRefusal: "UNCONDITIONAL_ENTRY",
        stoppingAt: "sanlayn[10] consumption",
        stoppingAtoms: [BLOOD_CONSUMPTION_TAG],
      }),
      blood_dispatch(2020278, BLOOD_HS, BLOOD_OUT_OF_GIFT_DISPATCH),
      blood_resources(2020278, BLOOD_HS, {
        runes: blood_runes(1, 1),
        runicPower: BLOOD_NO_RES,
        runicPowerDeficit: null,
        rune: 1,
      }),
      blood_aura(2020278, BLOOD_HS, "gift_of_the_sanlayn", blood_observed_aura(false, BLOOD_GIFT, 2019763)),
      blood_stack(2020278, BLOOD_HS, "bone_shield", blood_exact_stack(11)),
      blood_remains(2020278, BLOOD_HS, "bone_shield", blood_remains_bounded(25503, 2015781)),
      // M11-B8: the lone refresh at the Gift removal (2,019,763) anchors nothing; the floor is the stack gain at 2,017,274.
      blood_remains(2020278, BLOOD_HS, "essence_of_the_blood_queen", blood_remains_bounded(21996, 2017274)),
      blood_remains(2020278, BLOOD_HS, "visceral_strength", blood_remains_exact(5253, 2013531)),
      // The Heart Strike's own Heartbreaker gain (930 after it) is logged at its own millisecond AHEAD of it:
      // the deficit is bound below at 32 — whether the pre-decision amount was 910 or 930, it was at most 930.
      blood_rp_state(2020278, BLOOD_HS, blood_rp_window(930, 32, 2020278, [0])),
      // The Blood Boil at 2,021,775 follows the Death Strike at 2,021,024 (1,110 before its cost) with no observation between.
      blood_rp_state(2021775, BLOOD_BB, blood_rp_unbound("POST_SPEND_NOT_OBSERVED", 2021024, "PRE_COST")),
      blood_decision(2044021, BLOOD_DS, {
        ...BLOOD_DIVERGENT,
        unselectabilityRefusal: "CONDITION_NOT_PROVEN_FALSE",
      }),
      blood_dispatch(2044021, BLOOD_DS, BLOOD_OUT_OF_GIFT_ENTERED_DISPATCH),
      blood_resources(2044021, BLOOD_DS, {
        runes: BLOOD_NO_RES,
        runicPower: blood_rp(1080),
        runicPowerDeficit: 17,
        rune: null,
      }),
      blood_stack(
        2044021,
        BLOOD_DS,
        "bone_shield",
        blood_unbound_stack(BLOOD_BONE_SHIELD, "COUNT_AMBIGUOUS_SINCE_OBSERVATION"),
      ),
      blood_stack(2044021, BLOOD_DS, "blood_debt", {
        state: "BOUND",
        stack: 0,
        proof: "PROVEN_INACTIVE",
        abilityGameId: BLOOD_DEBT,
        reason: null,
        possibleStacks: null,
        windowOrderInvariance: null,
      }),
      // M11-B9: the last count (7 at 2,017,274) lies across lone refreshes; not carried (Q2 declined).
      blood_stack(
        2044021,
        BLOOD_DS,
        "essence_of_the_blood_queen",
        blood_unbound_stack(BLOOD_EBQ, "COUNT_AMBIGUOUS_SINCE_OBSERVATION"),
      ),
      // The three lone refreshes at 2,043,229 are full resets: the remainder is EXACT even though the count is not.
      blood_remains(2044021, BLOOD_DS, "bone_shield", blood_remains_exact(29208, 2043229)),
      blood_remains(2044021, BLOOD_DS, "vampiric_strike", blood_remains_zero(2036707)),
      blood_rp_state(2044021, BLOOD_DS, blood_rp_own(1080, 17, 2044021)),
      // M11-B5's first non-Death-Strike MATCH: the Blood Boil at 2,047,348 carries 780 of 1,250 from the
      // Heartbreaker gain 101 ms earlier (deficit 47, so sanlayn[2] is FALSE) and the list selects Blood Boil at
      // sanlayn[6] on Boiling Point — exactly what was cast.
      blood_decision(2047348, BLOOD_BB, { ...BLOOD_BB_MATCH, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" }),
      blood_rp_state(2047348, BLOOD_BB, blood_rp_carried(780, 47, 2047247, "POST_CHANGE")),
      blood_aura(2047348, BLOOD_BB, "boiling_point", blood_observed_aura(true, BLOOD_BOILING_POINT, 2046415)),
    ],
    ["OWNED_CONTRACT", "PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "A FALSE run gate is a skipped entry, nothing more: the parent walks on. A lone refresh proves the aura alive and says nothing pinned about its count, so the count is refused; a removal proves zero. A Blood Boil resolves only when every entry above it is FALSE from proven state — here the Runic Power carried from the latest read amount — and never from a guess about what a Death Strike cost.",
    { authority: BLOOD_AUTHORITY, related: BLOOD_RELATED },
  ),
  kase(
    "spec-blood-death-knight.blood-debt-is-read-from-its-own-transitions-and-never-from-a-death-strike",
    BLOOD_105_165,
    "SPEC_BLOOD_DEATH_KNIGHT",
    "src/specs/deathknight/blood/aura-bindings.ts (the exact-count rule and its fresh-application clause); src/data/game/deathknight-blood-aura-authority.ts (BLOOD_DEBT, exactCount)",
    "Blood Debt (1310372) is the Blood MID2 two-piece aura: Death Strike triggers it under an internal cooldown, each trigger adds exactly one stack from an initial one up to ten, it never expires, and a Marrowrend at ten removes every stack at once (the pinned claims on the identity). Over the composed bundle the wire shows exactly that shape and nothing else — 3 applybuff, 26 applybuffstack carrying 2..10, 2 removebuff, no refreshbuff, no removebuffstack — so at every decision the count is read from the LAST transition of the identity: the Heart Strike at 2,050,290 reads 3 from the applybuffstack at 2,049,345; the Death Strike at 2,035,940 reads 10 from the applybuffstack at 2,033,650, which makes sanlayn[7] TRUE and the decision stop on Marrowrend's USABILITY rather than resolve, because no rune or affordability proof exists for an action that was not cast; the Heart Strike at 2,044,779 and the Death Strikes at 2,045,618 and 2,129,260 read 1 from the plain applybuff at 2,044,041 / 2,126,260, each preceded by the removebuff of the Marrowrend consumption (EXACT_STACK_APPLICATION); the Death Strike at 2,044,021 reads zero from the removebuff at 2,043,229 (PROVEN_INACTIVE, unchanged since M11-B2); the pull's Death's Caress at 2,004,615 reads nothing, because no transition precedes it and the combatantinfo's silence is not zero. Two of those decisions now MATCH: at 2,045,618 the count 1 makes sanlayn[7] FALSE, Vampiric Strike is proven down, and the list selects Death Strike at sanlayn[9] on the cast's own deficit; at 2,024,020 the count 6 does the same and the list selects Heart Strike at sanlayn[8] on the Vampiric Strike proc — the cast is the Vampiric Strike (433895) the proc turns Heart Strike into, and the slice's heart_strike token. Fifteen of the 44 bundle Death Strikes produce no transition (the internal cooldown, or the maximum); none of them adds a stack here.",
    [
      blood_stack(2050290, BLOOD_HS, "blood_debt", blood_debt_exact(3), BLOOD_FULL),
      blood_stack(2035940, BLOOD_DS, "blood_debt", blood_debt_exact(10), BLOOD_FULL),
      blood_decision(
        2035940,
        BLOOD_DS,
        { ...BLOOD_DIVERGENT, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" },
        BLOOD_FULL,
      ),
      blood_stack(
        2044779,
        BLOOD_HS,
        "blood_debt",
        blood_debt_exact(1, "EXACT_STACK_APPLICATION"),
        BLOOD_FULL,
      ),
      blood_stack(
        2045618,
        BLOOD_DS,
        "blood_debt",
        blood_debt_exact(1, "EXACT_STACK_APPLICATION"),
        BLOOD_FULL,
      ),
      blood_decision(
        2045618,
        BLOOD_DS,
        { ...BLOOD_DS_MATCH, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" },
        BLOOD_FULL,
      ),
      blood_stack(
        2129260,
        BLOOD_DS,
        "blood_debt",
        blood_debt_exact(1, "EXACT_STACK_APPLICATION"),
        BLOOD_FULL,
      ),
      // The unselectability proof refuses at deathbringer[0] (its gate is TRUE on this deficit) before reaching an
      // unconditional entry — the cross-list limit M11-B2 measured at 2,044,021.
      blood_decision(
        2129260,
        BLOOD_DS,
        { ...BLOOD_DS_MATCH, unselectabilityRefusal: "CONDITION_NOT_PROVEN_FALSE" },
        BLOOD_FULL,
      ),
      blood_stack(2024020, BLOOD_VS, "blood_debt", blood_debt_exact(6), BLOOD_FULL),
      blood_decision(
        2024020,
        BLOOD_VS,
        { ...BLOOD_HS_MATCH, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" },
        BLOOD_FULL,
      ),
      blood_stack(2029599, BLOOD_VS, "blood_debt", blood_debt_exact(8), BLOOD_FULL),
      // M11-B8: sanlayn[1] is FALSE from the Essence floor, so the same-token selection is now the exact entry.
      blood_decision(
        2029599,
        BLOOD_VS,
        { ...BLOOD_HS_MATCH, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" },
        BLOOD_FULL,
      ),
      blood_stack(
        2004615,
        BLOOD_DC,
        "blood_debt",
        blood_unbound_stack(BLOOD_DEBT, "AURA_STATE_UNKNOWN"),
        BLOOD_FULL,
      ),
    ],
    ["OWNED_CONTRACT", "PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "A stack count is a number Warcraft Logs wrote on a transition, or the one number the pinned module fixes for a fresh application; it is never previous + 1, never a Death Strike's expected proc, never zero from silence. Where the count is exactly ten the entry is TRUE and the analyzer says it cannot prove Marrowrend usable, which is the truthful stop.",
    { authority: BLOOD_AUTHORITY, related: BLOOD_RELATED },
  ),
  kase(
    "spec-blood-death-knight.marrowrend-is-proven-usable-only-from-the-decision-casts-own-runes",
    BLOOD_105_165,
    "SPEC_BLOOD_DEATH_KNIGHT",
    "src/specs/deathknight/blood/rune-affordability.ts; action-profile.ts (the marrowrend allowlist); src/data/game/deathknight-blood-rune-cost-authority.ts; deathknight-blood-spender-costs.json (row 10513)",
    "M11-B7. Marrowrend's Rune cost is the pinned DBC row 10513 — 2 Runes, no aura condition — on a record with no cooldown, charge, internal or category cooldown and no cast time; the only effect in the pinned client data whose class mask reaches that row is Exterminate (441416 / 447954, -50%), a Deathbringer hero talent, so under the subject's RESOLVED San'layn tree the row IS the cost. At a decision whose observed cast carries an exact PRE_COST Rune entry at or above 2, action_t::ready() cannot fail on cost or cooldown, and its remaining conjuncts (GCD, target, range, movement) are those of the melee GCD cast that fired: Marrowrend is PROVEN_USABLE by name, for no other token. Seven decisions resolve on it, every one at Blood Debt exactly 10 from an applybuffstack 5 to 29 s earlier, every one a REJECTED: the three Heart Strikes at 2,039,813 / 2,040,797 / 2,042,440 (4 Runes each, consecutive GCDs before the Marrowrend at 2,043,209), the Heart Strike at 2,091,626 (3), the Vampiric Strike at 2,113,271 (5) and the Heart Strikes at 2,114,293 (4) and 2,115,379 (3), before the Marrowrend at 2,124,183 — the authority selects marrowrend at sanlayn[7] with no competing undecided GCD candidate, an authority-selected-different-token divergence and not a score. Five decisions whose root scan now selects Marrowrend stay UNKNOWN because a higher entry still diverges (2,036,692, 2,087,470, 2,093,667, 2,097,796, 2,119,480). The nine Marrowrend blockers whose cast carries no Rune entry — seven Death Strikes and the two Dance-of-Midnight-free Heart Strikes at 2,039,056 and 2,117,422 — stay exactly where they were: no Rune value is carried from the Heart Strike at 4 one GCD earlier, no previous-minus-cost, no regeneration. The four decisions at exactly 1 Rune (OWN_PRE_COST_BELOW_COST) are recorded and prove nothing: no INSUFFICIENT_RESOURCE exists for Blood. Over the bundle: OWN_PRE_COST_AFFORDABLE 52, OWN_PRE_COST_BELOW_COST 4, NO_RUNE_OBSERVATION 67; opener 11 / 10, unchanged at 1 MATCH.",
    [
      // The seven REJECTED, each with its own Rune entry, the pinned cost and the Blood Debt anchor.
      blood_decision(2039813, BLOOD_HS, BLOOD_MARROWREND_REJECTED, BLOOD_FULL),
      blood_affordability(2039813, BLOOD_HS, blood_affordable(4), BLOOD_FULL),
      blood_resources(
        2039813,
        BLOOD_HS,
        { runes: blood_runes(4, 1), runicPower: BLOOD_NO_RES, runicPowerDeficit: null, rune: 4 },
        BLOOD_FULL,
      ),
      blood_stack(2039813, BLOOD_HS, "blood_debt", blood_debt_exact(10), BLOOD_FULL),
      blood_decision(2040797, BLOOD_HS, BLOOD_MARROWREND_REJECTED, BLOOD_FULL),
      blood_affordability(2040797, BLOOD_HS, blood_affordable(4), BLOOD_FULL),
      blood_stack(2040797, BLOOD_HS, "blood_debt", blood_debt_exact(10), BLOOD_FULL),
      blood_decision(2042440, BLOOD_HS, BLOOD_MARROWREND_REJECTED, BLOOD_FULL),
      blood_affordability(2042440, BLOOD_HS, blood_affordable(4), BLOOD_FULL),
      blood_stack(2042440, BLOOD_HS, "blood_debt", blood_debt_exact(10), BLOOD_FULL),
      blood_decision(2091626, BLOOD_HS, BLOOD_MARROWREND_REJECTED, BLOOD_FULL),
      blood_affordability(2091626, BLOOD_HS, blood_affordable(3), BLOOD_FULL),
      blood_resources(
        2091626,
        BLOOD_HS,
        { runes: blood_runes(3, 1), runicPower: BLOOD_NO_RES, runicPowerDeficit: null, rune: 3 },
        BLOOD_FULL,
      ),
      blood_stack(2091626, BLOOD_HS, "blood_debt", blood_debt_exact(10), BLOOD_FULL),
      blood_decision(2113271, BLOOD_VS, BLOOD_MARROWREND_REJECTED, BLOOD_FULL),
      blood_affordability(2113271, BLOOD_VS, blood_affordable(5), BLOOD_FULL),
      blood_resources(
        2113271,
        BLOOD_VS,
        { runes: blood_runes(5, 1), runicPower: BLOOD_NO_RES, runicPowerDeficit: null, rune: 5 },
        BLOOD_FULL,
      ),
      blood_stack(2113271, BLOOD_VS, "blood_debt", blood_debt_exact(10), BLOOD_FULL),
      blood_decision(2114293, BLOOD_HS, BLOOD_MARROWREND_REJECTED, BLOOD_FULL),
      blood_affordability(2114293, BLOOD_HS, blood_affordable(4), BLOOD_FULL),
      blood_stack(2114293, BLOOD_HS, "blood_debt", blood_debt_exact(10), BLOOD_FULL),
      blood_decision(2115379, BLOOD_HS, BLOOD_MARROWREND_REJECTED, BLOOD_FULL),
      blood_affordability(2115379, BLOOD_HS, blood_affordable(3), BLOOD_FULL),
      blood_stack(2115379, BLOOD_HS, "blood_debt", blood_debt_exact(10), BLOOD_FULL),
      // Affordable, and still UNKNOWN: a higher entry diverges, and the proof bypasses no priority.
      blood_decision(
        2036692,
        BLOOD_VS,
        { ...BLOOD_DIVERGENT, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" },
        BLOOD_FULL,
      ),
      blood_affordability(2036692, BLOOD_VS, blood_affordable(4), BLOOD_FULL),
      blood_decision(
        2097796,
        BLOOD_HS,
        { ...BLOOD_DIVERGENT, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" },
        BLOOD_FULL,
      ),
      blood_affordability(2097796, BLOOD_HS, blood_affordable(4), BLOOD_FULL),
      // No Rune entry: the Death Strike one GCD after a 4-Rune Heart Strike observes nothing, and stays on Marrowrend's usability.
      blood_affordability(2041571, BLOOD_DS, BLOOD_NO_RUNE_OBSERVATION, BLOOD_FULL),
      blood_decision(
        2041571,
        BLOOD_DS,
        { ...BLOOD_DIVERGENT, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" },
        BLOOD_FULL,
      ),
      blood_affordability(2039056, BLOOD_HS, BLOOD_NO_RUNE_OBSERVATION, BLOOD_FULL),
      blood_resources(
        2039056,
        BLOOD_HS,
        { runes: BLOOD_NO_RES, runicPower: BLOOD_NO_RES, runicPowerDeficit: null, rune: null },
        BLOOD_FULL,
      ),
      // Below the cost: recorded, never a negative proof.
      blood_affordability(2044779, BLOOD_HS, blood_below_cost(1), BLOOD_FULL),
      a("SPEC_BLOOD_DEATH_KNIGHT.RUNE_AFFORDABILITY_CENSUS", {
        actorId: BLOOD,
        ...BLOOD_FULL,
        expected: {
          runeAffordabilityEvidence: {
            OWN_PRE_COST_AFFORDABLE: 52,
            OWN_PRE_COST_BELOW_COST: 4,
            NO_RUNE_OBSERVATION: 67,
          },
          runeCounts: {
            "runes 1": 4,
            "runes 2": 9,
            "runes 3": 20,
            "runes 4": 14,
            "runes 5": 6,
            "runes 6": 3,
          },
        },
      }),
    ],
    ["OWNED_CONTRACT", "PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "Marrowrend is proven usable from exactly three things: a Rune count the decision's own cast wrote, a cost the pinned DBC row states, and a modifier the resolved hero tree excludes. Nothing is carried, regenerated, subtracted or read off the wire's cost field, and a count below the cost proves nothing.",
    { authority: BLOOD_AUTHORITY, related: BLOOD_RELATED },
  ),
  kase(
    "spec-blood-death-knight.essence-lone-refreshes-anchor-nothing-and-the-window-bound-is-the-floor-both-orderings-share",
    BLOOD_105_165,
    "SPEC_BLOOD_DEATH_KNIGHT",
    "src/specs/deathknight/blood/aura-remains.ts (isAmbiguousRefresh under remainsPolicy.loneRefresh; orderInvariantWindowBound); src/data/game/deathknight-blood-aura-authority.ts (BloodRemainsPolicy on the Essence identity)",
    "M11-B8. The pinned module has exactly one producer for Essence of the Blood Queen (433925) — buffs.essence_of_the_blood_queen->trigger() on a Vampiric Strike execution, sc_death_knight.cpp:13808 — and the wire also carries a lone refreshbuff of it at every Gift of the San'layn edge with no Vampiric Strike cast near it (2,019,763 and 2,111,891 at the two Gift removals, 2,099,885 at the second Dancing Rune Weapon; opener 2,429,050). A refresh the model cannot produce is a refresh of unproven cause, and no lone refresh of this aura is assigned one — not by the Vampiric Strike 0-1 ms after it, not by the Gift edge beside it, not by the absence of any other visible producer — so none anchors an exact remainder (identity policy loneRefresh: UNPROVEN_CAUSE). A refresh beside an applybuff / applybuffstack at the same millisecond is that gain's companion and the gain anchors as before. A lone refresh keeps the earlier proven expiry as a lower bound (GAIN_ANCHOR_BOUNDED, walked back through consecutive lone refreshes to the last gain) and, once that has run out, the remainder is UNKNOWN (AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION) — never a 25 s reset. Inside the 50 ms pre-decision window every exact reading stays refused (the window constant is untouched; .up and .stack are unchanged), and for Essence's .remains only the floor both orderings of the cluster share is bound (WINDOW_ORDER_INVARIANT_BOUNDED): H1, the chain before the cluster projected to the decision, had the cluster followed it; H2, the pinned 25,000 ms minus the latest lead, had a reset in it preceded it; atLeast = min(H1, H2), never a KNOWN value, never an ordering chosen, refused whole when the cluster holds a plain application or any removal, when H1 cannot be established, when the floor has run out, or when the edge lies within the 50 ms tolerance of a pinned threshold. Over the bundle the 26 Essence window refusals become 20 floors and 6 refusals (the fresh applications at 2,008,597 and 2,073,540, the expiry at 2,071,379, and three clusters whose chain before them has run out); the 96 exact remainders become 24 exact (a gain or its companion), 40 floors and 32 UNKNOWN. Two decisions resolve, both Vampiric Strikes whose sanlayn[1] heart_strike condition (buff.essence_of_the_blood_queen.remains<1.5) is now FALSE from the floor and whose remaining chain was already exact: 2,087,470 (floor 11,070 ms: the application at 2,073,540 + 25,000 - 2,087,470, or a reset in the cluster; Bone Shield 10 with a 27,882 ms floor, Runic Power deficit at least 28.9, Crimson Scourge and Boiling Point proven down, Blood Debt exactly 10 from the applybuffstack at 2,086,445, Marrowrend PROVEN_USABLE from the cast's own 3 Runes) and 2,093,667 (floor 18,803 ms past a 1 ms lead cluster of applybuffstack 3 and its refresh; Bone Shield 9; deficit at least 46.9; Blood Debt exactly 10; 3 Runes) — each selects sanlayn[7] marrowrend at the exact entry with no competing undecided GCD candidate: 37 MATCH / 9 REJECTED / 77 UNKNOWN. The Vampiric Strike at 2,029,599 stays a MATCH on heart_strike and becomes EXACT_ENTRY at sanlayn[8]: sanlayn[1] is FALSE from the floor (12,675 ms, itself a floor from the stack gain at 2,017,274 through the lone refreshes since) rather than an undecided same-token candidate. Every other MATCH and REJECTED keeps its outcome and token: the twelve MATCH and three REJECTED whose Essence remainder is now a floor or UNKNOWN never read it — sanlayn[1] is FALSE on buff.vampiric_strike.remains = 0 or on a floor above 1.5 s, and the selection sits above sanlayn[9]. Positive Essence stacks stay unbound: the pinned artifact's max_stack 5 is contradicted by the observed 6 and 7 (Frenzied Bloodthirst, 434075, +2 max stacks by label, which the pinned module never applies), so stack<7 is not evaluated from it.",
    [
      // The two new REJECTED, with the complete chain each rests on.
      blood_decision(2087470, BLOOD_VS, BLOOD_MARROWREND_REJECTED, BLOOD_FULL),
      blood_remains(
        2087470,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_remains_window_bound(11070, 2073540, {
          cluster: [{ reportTimeMs: 2087470, operation: "APPLIED", isStackChange: true, leadMs: 0 }],
          beforeClusterMs: 11070,
          beforeClusterProof: "GAIN_ANCHOR_EXACT",
          resetInClusterMs: 25000,
        }),
        BLOOD_FULL,
      ),
      // M11-B9: the count is the set { 1, 2 } both orderings of the stack gain leave, never one of them.
      blood_stack(
        2087470,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_ebq_set([1, 2], {
          cluster: [{ reportTimeMs: 2087470, operation: "APPLIED", isStackChange: true, leadMs: 0 }],
          beforeClusterStack: 1,
          beforeClusterProof: "EXACT_STACK_APPLICATION",
          afterClusterStack: 2,
        }),
        BLOOD_FULL,
      ),
      blood_remains(2087470, BLOOD_VS, "vampiric_strike", blood_remains_permanent(2086414), BLOOD_FULL),
      blood_remains(2087470, BLOOD_VS, "bone_shield", blood_remains_bounded(27882, 2085352), BLOOD_FULL),
      blood_remains(2087470, BLOOD_VS, "crimson_scourge", blood_remains_zero(2072460), BLOOD_FULL),
      blood_stack(2087470, BLOOD_VS, "bone_shield", blood_exact_stack(10), BLOOD_FULL),
      blood_stack(2087470, BLOOD_VS, "blood_debt", blood_debt_exact(10), BLOOD_FULL),
      blood_aura(
        2087470,
        BLOOD_VS,
        "boiling_point",
        blood_observed_aura(false, BLOOD_BOILING_POINT, 2075688),
        BLOOD_FULL,
      ),
      blood_rp_state(2087470, BLOOD_VS, blood_rp_window(961, 28.9, 2087470, [0, 0]), BLOOD_FULL),
      blood_affordability(2087470, BLOOD_VS, blood_affordable(3), BLOOD_FULL),
      blood_resources(
        2087470,
        BLOOD_VS,
        { runes: blood_runes(3, 1), runicPower: BLOOD_NO_RES, runicPowerDeficit: null, rune: 3 },
        BLOOD_FULL,
      ),
      blood_decision(2093667, BLOOD_VS, BLOOD_MARROWREND_REJECTED, BLOOD_FULL),
      blood_remains(
        2093667,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_remains_window_bound(18803, 2087470, {
          cluster: [
            { reportTimeMs: 2093666, operation: "APPLIED", isStackChange: true, leadMs: 1 },
            { reportTimeMs: 2093666, operation: "REFRESHED", isStackChange: false, leadMs: 1 },
          ],
          beforeClusterMs: 18803,
          beforeClusterProof: "GAIN_ANCHOR_EXACT",
          resetInClusterMs: 24999,
        }),
        BLOOD_FULL,
      ),
      blood_stack(
        2093667,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_ebq_set([2, 3], {
          cluster: [
            { reportTimeMs: 2093666, operation: "APPLIED", isStackChange: true, leadMs: 1 },
            { reportTimeMs: 2093666, operation: "REFRESHED", isStackChange: false, leadMs: 1 },
          ],
          beforeClusterStack: 2,
          beforeClusterProof: "EXACT_STACK_OBSERVATION",
          afterClusterStack: 3,
        }),
        BLOOD_FULL,
      ),
      blood_remains(2093667, BLOOD_VS, "vampiric_strike", blood_remains_permanent(2092650), BLOOD_FULL),
      blood_stack(2093667, BLOOD_VS, "bone_shield", blood_exact_stack(9), BLOOD_FULL),
      blood_stack(2093667, BLOOD_VS, "blood_debt", blood_debt_exact(10), BLOOD_FULL),
      blood_rp_state(2093667, BLOOD_VS, blood_rp_window(781, 46.9, 2093666, [1, 1]), BLOOD_FULL),
      blood_affordability(2093667, BLOOD_VS, blood_affordable(3), BLOOD_FULL),
      blood_resources(
        2093667,
        BLOOD_VS,
        { runes: blood_runes(3, 1), runicPower: BLOOD_NO_RES, runicPowerDeficit: null, rune: 3 },
        BLOOD_FULL,
      ),
      // The precision change: sanlayn[1] is now FALSE from a floor that is itself a floor.
      blood_decision(
        2029599,
        BLOOD_VS,
        { ...BLOOD_HS_MATCH, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" },
        BLOOD_FULL,
      ),
      blood_remains(
        2029599,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_remains_window_bound(12675, 2017274, {
          cluster: [{ reportTimeMs: 2029599, operation: "REFRESHED", isStackChange: false, leadMs: 0 }],
          beforeClusterMs: 12675,
          beforeClusterProof: "GAIN_ANCHOR_BOUNDED",
          resetInClusterMs: 25000,
        }),
        BLOOD_FULL,
      ),
      // G1 over the committed evidence: the Gift-edge refreshes anchor nothing.
      blood_remains(
        2020278,
        BLOOD_HS,
        "essence_of_the_blood_queen",
        blood_remains_bounded(21996, 2017274),
        BLOOD_FULL,
      ),
      blood_remains(
        2112377,
        BLOOD_DS,
        "essence_of_the_blood_queen",
        blood_remains_bounded(19261, 2106638),
        BLOOD_FULL,
      ),
      blood_remains(
        2100867,
        BLOOD_BB,
        "essence_of_the_blood_queen",
        blood_remains_bounded(17799, 2093666),
        BLOOD_FULL,
      ),
      // A companion refresh still anchors exactly; a chain past every floor is UNKNOWN, not a reset.
      blood_remains(
        2012014,
        BLOOD_DS,
        "essence_of_the_blood_queen",
        blood_remains_exact(24127, 2011141),
        BLOOD_FULL,
      ),
      blood_remains(
        2042440,
        BLOOD_HS,
        "essence_of_the_blood_queen",
        blood_remains_unbound("AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION"),
        BLOOD_FULL,
      ),
      blood_decision(2042440, BLOOD_HS, BLOOD_MARROWREND_REJECTED, BLOOD_FULL),
      blood_remains(2042440, BLOOD_HS, "vampiric_strike", blood_remains_zero(2036707), BLOOD_FULL),
      // The refusals that remain: a fresh application and an expiry inside the window, and a cluster with no floor before it.
      blood_remains(
        2073540,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_remains_unbound(BLOOD_WINDOW_TAG, 0),
        BLOOD_FULL,
      ),
      blood_remains(
        2071379,
        BLOOD_DS,
        "essence_of_the_blood_queen",
        blood_remains_unbound(BLOOD_WINDOW_TAG, 0),
        BLOOD_FULL,
      ),
      blood_remains(
        2144631,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_remains_unbound(BLOOD_WINDOW_TAG, 0),
        BLOOD_FULL,
      ),
      blood_decision(
        2144631,
        BLOOD_VS,
        { ...BLOOD_HS_CONVERGED_MATCH, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" },
        BLOOD_FULL,
      ),
    ],
    ["OWNED_CONTRACT", "PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "A refresh the pinned model has no producer for is a refresh of unproven cause, and the analyzer names no cause for any lone refresh of the aura — the cast next to it, the Gift edge beside it and the absence of any other producer are circumstantial, and circumstantial attribution is exactly what this project refuses. What a lone refresh cannot do is shorten an expiry already proven, so the earlier proof survives as a floor and runs out honestly. Inside the window the analyzer still chooses no ordering: it binds only what both orderings leave, as a bound, and refuses when they leave nothing in common.",
    { authority: BLOOD_AUTHORITY, related: [...BLOOD_RELATED, "tests/unit/m11b8-blood-ebq-remains.test.ts"] },
  ),
  kase(
    "spec-blood-death-knight.essence-stacks-are-the-wires-absolute-counts-and-a-set-of-two-inside-the-window",
    BLOOD_105_165,
    "SPEC_BLOOD_DEATH_KNIGHT",
    "src/data/game/deathknight-blood-stack-authority.ts (the Frenzied Bloodthirst max-stack modifier, bloodEffectiveMaxStack); src/data/game/deathknight-blood-talents.json (frenzied_bloodthirst, machine-extracted); src/specs/deathknight/blood/aura-bindings.ts (the Essence exact-count rule, the maximum guard, orderInvariantWindowStack); src/simc/expression/evaluate.ts (ONE_OF_NUMBERS)",
    "M11-B9. Essence of the Blood Queen's positive count is read from the wire: the absolute count of the last applybuffstack (EXACT_STACK_OBSERVATION), the pinned 1 of a fresh applybuff (_proc_charges 0 -> buff_t _initial_stack 1; EXACT_STACK_APPLICATION), zero from a removal — never from a Vampiric Strike count, never incremented, and never carried across a lone refreshbuff (Q2 declined: COUNT_AMBIGUOUS_SINCE_OBSERVATION, 72 of 123 bundle decisions, because after the seventh stack every Essence transition until the expiry is a lone refresh). Every count is checked against the effective maximum the Blood stack authority resolves for the build: the DBC _max_stack 5 (the generated artifact's raw value, not reinterpreted) plus Frenzied Bloodthirst's +2 — effect 1123818 of spell 434075, A_ADD_FLAT_LABEL_MODIFIER P_MAX_STACKS on label 3134, which only 433925 carries — exactly when the talent is SELECTED, which both subjects prove by their own trait entry 117662 (node 95065, NORMAL, no alternative) through the machine-extracted talent artifact. The pinned SimulationCraft parses that talent (parse_all_passive_talents) but buff_t never reads the parsed max_stack field, so the sim caps the aura at 5: a runtime omission the wire's observed 6 and 7 corroborate and do not establish — a count above the effective maximum, or above 5 while the modifier is unproven, is COUNT_EXCEEDS_PINNED_MAX. Inside the 50 ms pre-decision window (unchanged) a cluster of exactly one stack gain (with its same-millisecond companion) binds the finite set of exact counts both orderings leave — H1 the exact count before the cluster by the ordinary rule, H2 the wire's count after it — as ONE_OF_NUMBERS, which the generic evaluator decides only when every member decides the comparison alike: { 5,6 } and { 4,5 } make san_gift[3]'s stack<7 TRUE, { 6,7 } leaves it UNRESOLVED, a lone-refresh or removal cluster refuses, an H1 across a lone refresh refuses, and a fresh application is { 0,1 } only when M4 proves the aura inactive before it from an observed removal (2,073,540) — the first application in a track (2,008,597; opener 2,418,659) refuses, because no aura event is not aura inactive. Three Vampiric Strikes resolve, each selected at san_gift[3] heart_strike — the observed action, proven usable by its execution — once san_gift[0] is FALSE from the M11-B8 floor, san_gift[1] FALSE from the Runic Power deficit and san_gift[2] FALSE from Crimson Scourge proven down: 2,015,029 ({ 5,6 }: applybuffstack 5 at 2,012,773 before, applybuffstack 6 at lead 0), 2,103,820 ({ 4,5 }: 4 at 2,101,867, 5 at lead 0) and 2,105,703 ({ 5,6 }: 5 at 2,103,820, 6 at 2,105,702, lead 1): 40 MATCH / 9 REJECTED / 74 UNKNOWN, the 45 s slice 16 / 3 / 29, the opener 1 / 0 / 20 (its six sets all sit behind san_gift[2]). Still UNKNOWN by construction: 2,017,274 and 2,106,638 ({ 6,7 }, the worlds disagree), 2,101,867 (its count before the cluster, 3 at 2,093,666, lies across the Gift-edge lone refresh at 2,099,885 and is not carried), and the exact counts outside the window — 6 at the Marrowrend 2,015,770, 5 at the Death Strike 2,104,758 — that make san_gift[3] TRUE and stop on Heart Strike's usability, an action that was not cast. Every prior MATCH and REJECTED keeps its outcome and token.",
    [
      // The three MATCH, each with the set, both worlds, the evaluator's verdict and no undecided candidate.
      blood_decision(
        2015029,
        BLOOD_VS,
        { ...BLOOD_HS_MATCH, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" },
        BLOOD_FULL,
      ),
      blood_stack(
        2015029,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_ebq_set([5, 6], {
          cluster: [
            { reportTimeMs: 2015029, operation: "APPLIED", isStackChange: true, leadMs: 0 },
            { reportTimeMs: 2015029, operation: "REFRESHED", isStackChange: false, leadMs: 0 },
          ],
          beforeClusterStack: 5,
          beforeClusterProof: "EXACT_STACK_OBSERVATION",
          afterClusterStack: 6,
        }),
        BLOOD_FULL,
      ),
      blood_remains(2015029, BLOOD_VS, "crimson_scourge", blood_remains_zero(2013542), BLOOD_FULL),
      blood_rp_state(2015029, BLOOD_VS, blood_rp_window(670, 58, 2015029, [0]), BLOOD_FULL),
      blood_decision(
        2103820,
        BLOOD_VS,
        { ...BLOOD_HS_MATCH, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" },
        BLOOD_FULL,
      ),
      blood_stack(
        2103820,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_ebq_set([4, 5], {
          cluster: [
            { reportTimeMs: 2103820, operation: "APPLIED", isStackChange: true, leadMs: 0 },
            { reportTimeMs: 2103820, operation: "REFRESHED", isStackChange: false, leadMs: 0 },
          ],
          beforeClusterStack: 4,
          beforeClusterProof: "EXACT_STACK_OBSERVATION",
          afterClusterStack: 5,
        }),
        BLOOD_FULL,
      ),
      blood_remains(2103820, BLOOD_VS, "crimson_scourge", blood_remains_zero(2096763), BLOOD_FULL),
      blood_decision(
        2105703,
        BLOOD_VS,
        { ...BLOOD_HS_MATCH, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" },
        BLOOD_FULL,
      ),
      blood_stack(
        2105703,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_ebq_set([5, 6], {
          cluster: [
            { reportTimeMs: 2105702, operation: "APPLIED", isStackChange: true, leadMs: 1 },
            { reportTimeMs: 2105702, operation: "REFRESHED", isStackChange: false, leadMs: 1 },
          ],
          beforeClusterStack: 5,
          beforeClusterProof: "EXACT_STACK_OBSERVATION",
          afterClusterStack: 6,
        }),
        BLOOD_FULL,
      ),
      blood_remains(2105703, BLOOD_VS, "crimson_scourge", blood_remains_zero(2096763), BLOOD_FULL),
      // Still UNKNOWN: the worlds disagree on stack<7.
      blood_decision(
        2017274,
        BLOOD_VS,
        { ...BLOOD_DIVERGENT, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" },
        BLOOD_FULL,
      ),
      blood_stack(
        2017274,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_ebq_set([6, 7], {
          cluster: [
            { reportTimeMs: 2017274, operation: "APPLIED", isStackChange: true, leadMs: 0 },
            { reportTimeMs: 2017274, operation: "REFRESHED", isStackChange: false, leadMs: 0 },
          ],
          beforeClusterStack: 6,
          beforeClusterProof: "EXACT_STACK_OBSERVATION",
          afterClusterStack: 7,
        }),
        BLOOD_FULL,
      ),
      blood_decision(
        2106638,
        BLOOD_VS,
        { ...BLOOD_DIVERGENT, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" },
        BLOOD_FULL,
      ),
      blood_stack(
        2106638,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_ebq_set([6, 7], {
          cluster: [
            { reportTimeMs: 2106638, operation: "APPLIED", isStackChange: true, leadMs: 0 },
            { reportTimeMs: 2106638, operation: "REFRESHED", isStackChange: false, leadMs: 0 },
          ],
          beforeClusterStack: 6,
          beforeClusterProof: "EXACT_STACK_OBSERVATION",
          afterClusterStack: 7,
        }),
        BLOOD_FULL,
      ),
      // Still UNKNOWN: Q2 declined — the count before the cluster lies across the Gift-edge refresh at 2,099,885.
      blood_decision(
        2101867,
        BLOOD_VS,
        { ...BLOOD_DIVERGENT, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" },
        BLOOD_FULL,
      ),
      blood_stack(
        2101867,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_unbound_stack(BLOOD_EBQ, BLOOD_WINDOW_TAG),
        BLOOD_FULL,
      ),
      // Exact counts outside the window, which make san_gift[3] TRUE and stop on the usability of an action not cast.
      blood_stack(2015770, BLOOD_MR, "essence_of_the_blood_queen", blood_ebq_exact(6), BLOOD_FULL),
      // A Marrowrend: the unselectability walk refuses on a conditional entry it cannot prove FALSE, as before.
      blood_decision(
        2015770,
        BLOOD_MR,
        { ...BLOOD_DIVERGENT, unselectabilityRefusal: "CONDITION_NOT_PROVEN_FALSE" },
        BLOOD_FULL,
      ),
      blood_stack(2104758, BLOOD_DS, "essence_of_the_blood_queen", blood_ebq_exact(5), BLOOD_FULL),
      blood_stack(
        2084304,
        BLOOD_DS,
        "essence_of_the_blood_queen",
        blood_ebq_exact(1, "EXACT_STACK_APPLICATION"),
        BLOOD_FULL,
      ),
      // The lone-refresh rule (Q2 declined) and the lone-refresh cluster refusal.
      blood_stack(
        2100867,
        BLOOD_BB,
        "essence_of_the_blood_queen",
        blood_unbound_stack(BLOOD_EBQ, "COUNT_AMBIGUOUS_SINCE_OBSERVATION"),
        BLOOD_FULL,
      ),
      blood_stack(
        2110550,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_unbound_stack(BLOOD_EBQ, BLOOD_WINDOW_TAG),
        BLOOD_FULL,
      ),
      // The first Essence application in the track, inside the window: NOT
      // { 0, 1 }. No prior transition proves nothing (AMBIGUOUS_INITIAL_STATE
      // before it); the zero world needs an observed removal.
      blood_stack(
        2008597,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_unbound_stack(BLOOD_EBQ, BLOOD_WINDOW_TAG),
        BLOOD_FULL,
      ),
      // A fresh application after an OBSERVED removal (2,071,379) is { 0, 1 }.
      blood_stack(
        2073540,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_ebq_set([0, 1], {
          cluster: [{ reportTimeMs: 2073540, operation: "APPLIED", isStackChange: false, leadMs: 0 }],
          beforeClusterStack: 0,
          beforeClusterProof: "PROVEN_INACTIVE_BEFORE_APPLICATION",
          afterClusterStack: 1,
        }),
        BLOOD_FULL,
      ),
    ],
    ["OWNED_CONTRACT", "PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "A stack count is a number the wire wrote or a number the pinned module fixes for a fresh application; a maximum is the DBC row plus a modifier the observed talent tree proves; and inside the window the count is BOTH of the two exact values the orderings leave, handed to the evaluator as a set it may only decide unanimously. Nothing is counted, incremented, carried across a refresh nobody explained, or read off the very observation it would then be checked against — and the zero world of a fresh application is a state M4 must prove from an observed removal, never the silence before the first transition in the track.",
    {
      authority: BLOOD_AUTHORITY,
      related: [
        ...BLOOD_RELATED,
        "tests/unit/m11b9-blood-ebq-stack.test.ts",
        "tests/unit/simc-expression-one-of-numbers.test.ts",
      ],
    },
  ),
  kase(
    "spec-blood-death-knight.bone-shield-is-every-exact-count-its-own-gains-leave-and-the-presence-proven-on-both-sides",
    BLOOD_105_165,
    "SPEC_BLOOD_DEATH_KNIGHT",
    "src/data/game/deathknight-blood-aura-authority.ts (the Bone Shield identity's window policies); src/specs/deathknight/blood/aura-bindings.ts (windowClusterOf, orderInvariantWindowStack over one or more gains, orderInvariantWindowPresence); src/specs/deathknight/blood/aura-remains.ts (the M11-B8 order-invariant bound, switched on for Bone Shield, algorithm unchanged); src/simc/expression/evaluate.ts (ONE_OF_NUMBERS, unchanged)",
    "M11-B10. Warcraft Logs writes a Marrowrend's three Bone Shield stacks as three applybuffstack — each carrying the absolute resulting count, each after the first beside a same-millisecond refreshbuff — at the cast's own millisecond and AHEAD of it in the array, and a Death's Caress's two as one applybuffstack; on which side of the decision they fell, or between which of them the decision sat, the wire does not say. Inside the 50 ms pre-decision window the count is therefore EVERY exact value the decision's position among those gains leaves — the ordinary exact count immediately before the cluster (H1, by the M11-B2/B6 rule at the cluster's first position: the last applybuffstack or removebuffstack, carried only across same-millisecond companions, never across a lone refresh, never from silence) and each gain's absolute count in order — as ONE_OF_NUMBERS: { 7,8,9,10 } at 2,043,209, never { 7,10 }, never 10, never 7. The presence is M4's reading on BOTH sides of the cluster (EXACT ACTIVE before it, anchored on the removebuffstack, and EXACT ACTIVE at the decision) — WINDOW_ORDER_INVARIANT_PRESENCE, never a count's implication; the remainder is the M11-B8 floor both orderings share, the algorithm untouched. The generic evaluator decides sanlayn[0] (!up | remains<1.5 | stack<=1) FALSE and sanlayn[3]/[4] (stack<6) FALSE for every member; Blood writes no threshold. Two Marrowrends resolve, each selected at sanlayn[7] marrowrend at Blood Debt exactly 10, PROVEN_USABLE from the cast's own Runes, with no undecided candidate: 2,043,209 ({ 7,8,9,10 } from the removebuffstack 7 at 2,038,654; floor 2,572 ms from the gains at 2,015,781 past the refresh of unpinned cause at 2,016,785) and 2,124,183 ({ 8,9,10,11 } from the 8 at 2,120,436; floor 5,702 ms from the Dancing Rune Weapon's gains at 2,099,885): 42 MATCH / 9 REJECTED / 72 UNKNOWN, the 45 s slice 17 / 3 / 28, the opener 1 / 0 / 20. Still UNKNOWN once Bone Shield is passed: 2,057,622 ({ 11,12 }) and 2,085,352 ({ 8,9,10,11 }) on sanlayn[9] fight_remains, 2,151,502 ({ 6,7,8,9 }) and 2,164,444 ({ 9,11 }) on sanlayn[2]'s Runic Power deficit after a spend — and 2,044,021, whose count the three lone refreshes at 2,043,229 break (not a window case; no refresh-count carry). The track's first application (2,004,615, 20 ms ahead) binds nothing: AMBIGUOUS_INITIAL_STATE before it, no application count pinned for Bone Shield, no zero from silence. No removal ever sits inside a window on either subject; the removal rule is untouched. Improved Bone Shield's +2 (374715) is not in the extracted artifact, the guard stays off, and the observed 12 proves nothing. Every prior MATCH and REJECTED keeps its outcome and token.",
    [
      // The two MATCH, each with the set, both ends, the presence, the floor, Blood Debt 10 and the cast's own Runes.
      blood_decision(
        2043209,
        BLOOD_MR,
        {
          ...BLOOD_DS_MATCH,
          authorityToken: "marrowrend",
          unselectabilityRefusal: "CONDITION_NOT_PROVEN_FALSE",
        },
        BLOOD_FULL,
      ),
      blood_dispatch(2043209, BLOOD_MR, BLOOD_OUT_OF_GIFT_ENTERED_DISPATCH, BLOOD_FULL),
      blood_aura(
        2043209,
        BLOOD_MR,
        "bone_shield",
        blood_window_presence(BLOOD_BONE_SHIELD, 2038654),
        BLOOD_FULL,
      ),
      blood_stack(
        2043209,
        BLOOD_MR,
        "bone_shield",
        blood_bs_set([7, 8, 9, 10], {
          cluster: blood_marrowrend_cluster(2043209),
          beforeClusterStack: 7,
          beforeClusterProof: "EXACT_STACK_OBSERVATION",
          afterClusterStack: 10,
        }),
        BLOOD_FULL,
      ),
      blood_remains(
        2043209,
        BLOOD_MR,
        "bone_shield",
        blood_remains_window_bound(2572, 2015781, {
          cluster: blood_marrowrend_cluster(2043209),
          beforeClusterMs: 2572,
          beforeClusterProof: "GAIN_ANCHOR_BOUNDED",
          resetInClusterMs: 30000,
        }),
        BLOOD_FULL,
      ),
      blood_stack(2043209, BLOOD_MR, "blood_debt", blood_debt_exact(10), BLOOD_FULL),
      blood_affordability(2043209, BLOOD_MR, blood_affordable(3, 2), BLOOD_FULL),
      blood_decision(
        2124183,
        BLOOD_MR,
        {
          ...BLOOD_DS_MATCH,
          authorityToken: "marrowrend",
          unselectabilityRefusal: "CONDITION_NOT_PROVEN_FALSE",
        },
        BLOOD_FULL,
      ),
      blood_dispatch(2124183, BLOOD_MR, BLOOD_OUT_OF_GIFT_ENTERED_DISPATCH, BLOOD_FULL),
      blood_aura(
        2124183,
        BLOOD_MR,
        "bone_shield",
        blood_window_presence(BLOOD_BONE_SHIELD, 2120436),
        BLOOD_FULL,
      ),
      blood_stack(
        2124183,
        BLOOD_MR,
        "bone_shield",
        blood_bs_set([8, 9, 10, 11], {
          cluster: blood_marrowrend_cluster(2124183),
          beforeClusterStack: 8,
          beforeClusterProof: "EXACT_STACK_OBSERVATION",
          afterClusterStack: 11,
        }),
        BLOOD_FULL,
      ),
      blood_remains(
        2124183,
        BLOOD_MR,
        "bone_shield",
        blood_remains_window_bound(5702, 2099885, {
          cluster: blood_marrowrend_cluster(2124183),
          beforeClusterMs: 5702,
          beforeClusterProof: "GAIN_ANCHOR_BOUNDED",
          resetInClusterMs: 30000,
        }),
        BLOOD_FULL,
      ),
      blood_stack(2124183, BLOOD_MR, "blood_debt", blood_debt_exact(10), BLOOD_FULL),
      blood_affordability(2124183, BLOOD_MR, blood_affordable(4, 2), BLOOD_FULL),
      // Still UNKNOWN on the next exact blocker, Bone Shield passed.
      blood_decision(
        2057622,
        BLOOD_DC,
        {
          ...BLOOD_UNKNOWN,
          unselectabilityRefusal: "UNCONDITIONAL_ENTRY",
          stoppingAt: "sanlayn[10] consumption",
          stoppingAtoms: [BLOOD_CONSUMPTION_TAG],
        },
        BLOOD_FULL,
      ),
      blood_aura(
        2057622,
        BLOOD_DC,
        "bone_shield",
        blood_window_presence(BLOOD_BONE_SHIELD, 2044077),
        BLOOD_FULL,
      ),
      blood_stack(
        2057622,
        BLOOD_DC,
        "bone_shield",
        blood_bs_set([11, 12], {
          cluster: [{ reportTimeMs: 2057622, operation: "APPLIED", isStackChange: true, leadMs: 0 }],
          beforeClusterStack: 11,
          beforeClusterProof: "EXACT_STACK_OBSERVATION",
          afterClusterStack: 12,
        }),
        BLOOD_FULL,
      ),
      blood_decision(
        2085352,
        BLOOD_MR,
        {
          ...BLOOD_UNKNOWN,
          unselectabilityRefusal: "CONDITION_NOT_PROVEN_FALSE",
          stoppingAt: "sanlayn[10] consumption",
          stoppingAtoms: [BLOOD_CONSUMPTION_TAG],
        },
        BLOOD_FULL,
      ),
      blood_stack(
        2085352,
        BLOOD_MR,
        "bone_shield",
        blood_bs_set([8, 9, 10, 11], {
          cluster: blood_marrowrend_cluster(2085352),
          beforeClusterStack: 8,
          beforeClusterProof: "EXACT_STACK_OBSERVATION",
          afterClusterStack: 11,
        }),
        BLOOD_FULL,
      ),
      blood_stack(2085352, BLOOD_MR, "blood_debt", blood_debt_exact(9), BLOOD_FULL),
      blood_decision(
        2151502,
        BLOOD_MR,
        {
          ...BLOOD_UNKNOWN,
          unselectabilityRefusal: "CONDITION_NOT_PROVEN_FALSE",
          stoppingAt: "sanlayn[10] consumption",
          stoppingAtoms: [BLOOD_CONSUMPTION_TAG],
        },
        BLOOD_FULL,
      ),
      blood_stack(
        2151502,
        BLOOD_MR,
        "bone_shield",
        blood_bs_set([6, 7, 8, 9], {
          cluster: blood_marrowrend_cluster(2151502),
          beforeClusterStack: 6,
          beforeClusterProof: "EXACT_STACK_OBSERVATION",
          afterClusterStack: 9,
        }),
        BLOOD_FULL,
      ),
      blood_decision(
        2164444,
        BLOOD_DC,
        {
          ...BLOOD_UNKNOWN,
          unselectabilityRefusal: "UNCONDITIONAL_ENTRY",
          stoppingAt: "sanlayn[10] consumption",
          stoppingAtoms: [BLOOD_CONSUMPTION_TAG],
        },
        BLOOD_FULL,
      ),
      blood_stack(
        2164444,
        BLOOD_DC,
        "bone_shield",
        blood_bs_set([9, 11], {
          cluster: [
            { reportTimeMs: 2164444, operation: "APPLIED", isStackChange: true, leadMs: 0 },
            { reportTimeMs: 2164444, operation: "REFRESHED", isStackChange: false, leadMs: 0 },
          ],
          beforeClusterStack: 9,
          beforeClusterProof: "EXACT_STACK_OBSERVATION",
          afterClusterStack: 11,
        }),
        BLOOD_FULL,
      ),
      // Not a window case: the lone refreshes at 2,043,229 break the count; the presence is M4's ordinary reading.
      blood_stack(
        2044021,
        BLOOD_DS,
        "bone_shield",
        blood_unbound_stack(BLOOD_BONE_SHIELD, "COUNT_AMBIGUOUS_SINCE_OBSERVATION"),
        BLOOD_FULL,
      ),
      blood_aura(
        2044021,
        BLOOD_DS,
        "bone_shield",
        blood_observed_aura(true, BLOOD_BONE_SHIELD, 2043229),
        BLOOD_FULL,
      ),
      // The track's first application, 20 ms ahead: nothing bound, nothing from silence.
      blood_aura(
        2004615,
        BLOOD_DC,
        "bone_shield",
        blood_unbound_aura(BLOOD_BONE_SHIELD, BLOOD_WINDOW_TAG, null),
        BLOOD_FULL,
      ),
      blood_stack(
        2004615,
        BLOOD_DC,
        "bone_shield",
        blood_unbound_stack(BLOOD_BONE_SHIELD, BLOOD_WINDOW_TAG),
        BLOOD_FULL,
      ),
    ],
    ["OWNED_CONTRACT", "PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "Inside the window a Bone Shield count is every exact value the wire's own gains and the count before them leave, never one chosen; the presence is M4's reading on both sides of the cluster, never a count's implication; the remainder is the floor both orderings share. Nothing is counted, incremented, carried across a lone refresh, read from the silence before a track's first transition, or checked against a maximum the build does not prove.",
    {
      authority: BLOOD_AUTHORITY,
      related: [
        ...BLOOD_RELATED,
        "tests/unit/m11b10-blood-bone-shield-window.test.ts",
        "tests/unit/m11b8-blood-ebq-remains.test.ts",
        "tests/unit/simc-expression-one-of-numbers.test.ts",
      ],
    },
  ),
  kase(
    "spec-blood-death-knight.vampiric-blood-and-the-second-dancing-rune-weapon-over-the-bundle",
    BLOOD_105_165,
    "SPEC_BLOOD_DEATH_KNIGHT",
    "src/specs/deathknight/blood/aura-bindings.ts; cooldown-bindings.ts; first-gcd-adapter.ts (undecided candidates); src/data/game/deathknight-blood-transition-authority.ts",
    "Over the composed bundle: the Vampiric Strike at 2,087,470 lies inside the first Vampiric Blood window (aura applied 2,087,109), so buff.vampiric_blood.up binds TRUE and default[12]'s gate is FALSE — the entry is eliminated, not branched; Bone Shield is exactly 10 with a 27,882 ms lower-bound remainder; the Essence count and remainder are refused because its own stack gain precedes the cast at the same millisecond (PRE_DECISION_WINDOW_TRANSITION, lead 0); Vampiric Strike is ACTIVE and PERMANENT, so its remainder is SimulationCraft's timespan_t::min() sentinel — nonzero, TRUE as the bare truth sanlayn[1] reads. The Heart Strike at 2,097,796 (+93,207 ms) follows the Vampiric Blood removal (2,097,114, so up=FALSE) and sits 39 ms past the first Dancing Rune Weapon's 90,000 ms effective base: readiness is UNKNOWN (neither proven active nor claimed ready), so high_prio_actions[1] is an undecided GCD candidate on debuff.reapers_mark_debuff.up and fight_remains while the scan still runs on to sanlayn[0]. The Blood Boil at 2,100,867 follows the second Dancing Rune Weapon at 2,099,885: the Gift is UP again, the scan re-enters san_gift, and the cooldown is proven active for 89,018 ms from the new anchor.",
    [
      blood_aura(
        2087470,
        BLOOD_VS,
        "vampiric_blood",
        blood_observed_aura(true, BLOOD_VB_AURA, 2087109),
        BLOOD_FULL,
      ),
      blood_stack(2087470, BLOOD_VS, "bone_shield", blood_exact_stack(10), BLOOD_FULL),
      // M11-B9: the count is the set { 1, 2 } both orderings of the stack gain leave, never one of them.
      blood_stack(
        2087470,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_ebq_set([1, 2], {
          cluster: [{ reportTimeMs: 2087470, operation: "APPLIED", isStackChange: true, leadMs: 0 }],
          beforeClusterStack: 1,
          beforeClusterProof: "EXACT_STACK_APPLICATION",
          afterClusterStack: 2,
        }),
        BLOOD_FULL,
      ),
      // M11-B8: the count stays refused; the remainder is the floor both orderings of the stack gain share.
      blood_remains(
        2087470,
        BLOOD_VS,
        "essence_of_the_blood_queen",
        blood_remains_window_bound(11070, 2073540, {
          cluster: [{ reportTimeMs: 2087470, operation: "APPLIED", isStackChange: true, leadMs: 0 }],
          beforeClusterMs: 11070,
          beforeClusterProof: "GAIN_ANCHOR_EXACT",
          resetInClusterMs: 25000,
        }),
        BLOOD_FULL,
      ),
      blood_remains(2087470, BLOOD_VS, "vampiric_strike", blood_remains_permanent(2086414), BLOOD_FULL),
      blood_remains(2087470, BLOOD_VS, "bone_shield", blood_remains_bounded(27882, 2085352), BLOOD_FULL),
      // Two Heartbreaker gains (941, 961) sit at the Vampiric Strike's own millisecond ahead of it: bounded from the last.
      blood_rp_state(2087470, BLOOD_VS, blood_rp_window(961, 28.9, 2087470, [0, 0]), BLOOD_FULL),
      blood_rp_state(2097796, BLOOD_HS, blood_rp_window(751, 49.9, 2097796, [0, 0]), BLOOD_FULL),
      blood_rp_state(2100867, BLOOD_BB, blood_rp_carried(591, 65.9, 2099906, "POST_CHANGE"), BLOOD_FULL),
      blood_cooldown(2087470, BLOOD_VS, blood_drw_not_ready(10287, 2007757), BLOOD_FULL),
      // RE-POINTED for M11-B7: the cast carries 4 Runes and Blood Debt is 10, so the
      // root scan now SELECTS marrowrend at sanlayn[7] and never walks to sanlayn[10];
      // the Dancing Rune Weapon gate above it is still undecided, so the worlds
      // diverge and the decision stays UNKNOWN.
      blood_decision(
        2097796,
        BLOOD_HS,
        { ...BLOOD_DIVERGENT, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" },
        BLOOD_FULL,
      ),
      blood_dispatch(2097796, BLOOD_HS, BLOOD_OUT_OF_GIFT_ENTERED_DISPATCH, BLOOD_FULL),
      blood_aura(
        2097796,
        BLOOD_HS,
        "vampiric_blood",
        blood_observed_aura(false, BLOOD_VB_AURA, 2097114),
        BLOOD_FULL,
      ),
      blood_cooldown(2097796, BLOOD_HS, blood_drw_unknown(null), BLOOD_FULL),
      blood_resources(
        2097796,
        BLOOD_HS,
        { runes: blood_runes(4, 1), runicPower: BLOOD_NO_RES, runicPowerDeficit: null, rune: 4 },
        BLOOD_FULL,
      ),
      blood_decision(
        2100867,
        BLOOD_BB,
        { ...BLOOD_DIVERGENT, unselectabilityRefusal: "UNCONDITIONAL_ENTRY" },
        BLOOD_FULL,
      ),
      blood_dispatch(2100867, BLOOD_BB, BLOOD_IN_GIFT_DISPATCH, BLOOD_FULL),
      blood_aura(
        2100867,
        BLOOD_BB,
        "gift_of_the_sanlayn",
        blood_observed_aura(true, BLOOD_GIFT, 2099885),
        BLOOD_FULL,
      ),
      blood_stack(2100867, BLOOD_BB, "bone_shield", blood_exact_stack(12), BLOOD_FULL),
      blood_cooldown(2100867, BLOOD_BB, blood_drw_not_ready(89018, 2099885), BLOOD_FULL),
    ],
    ["OWNED_CONTRACT", "PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "Vampiric Blood's cooldown is dynamic (Red Thirst) and is never derived: the entry is decided by its observed aura when one is, and branched over under its reviewed contract when none is. A cooldown that has elapsed its base is not thereby READY — nothing here claims it — but it is no longer proven active, and the gate it guards becomes a competing candidate the stopping entry alone would hide.",
    { authority: BLOOD_AUTHORITY, related: BLOOD_RELATED },
  ),
  kase(
    "spec-blood-death-knight.the-opener-subject-and-the-wire-cost-that-is-not-the-cost",
    BLOOD_GTKB,
    "SPEC_BLOOD_DEATH_KNIGHT",
    "src/specs/deathknight/blood/resources.ts; src/data/wcl-wire/resource-types.ts (RUNES, RUNIC_POWER); aura-bindings.ts",
    "The gtKb subject casts Death Strike at 2,425,794 with 440 Runic Power on the wire and at 2,429,596 with 390 — both BELOW the 450 the wire reports as the cost, because the field is the DBC base and this build's reductions are not folded in. The evaluator reads the PRE_COST amount as the observation it is (deficit 81 and 86 points), never the cost field as the cost paid, and makes no affordability claim in either direction. The first Blood Boil at 2,417,826 carries no resource entry of either kind (NO_OBSERVATION twice, never zero) and since M11-B5 its deficit, 103, is carried from the melee swing 355 ms earlier; the Vampiric Strike at 2,418,659 costs 1 Rune of 4. Inside the opener's Gift window (2,417,020 .. 2,429,050) every scan enters san_gift; the Death Strike at 2,429,596 follows the removal and stops in sanlayn with Bone Shield exactly 12 and its remainder EXACT 27,698 ms from the stack gain at 2,427,294 — the opener's Bone Shield is anchored by its first in-fight stack gain, never by the unobserved pre-pull application.",
    [
      blood_resources(2425794, BLOOD_DS, {
        runes: BLOOD_NO_RES,
        runicPower: blood_rp(440),
        runicPowerDeficit: 81,
        rune: null,
      }),
      blood_resources(2429596, BLOOD_DS, {
        runes: BLOOD_NO_RES,
        runicPower: blood_rp(390),
        runicPowerDeficit: 86,
        rune: null,
      }),
      // RE-PINNED for M11-B5: no entry of either kind on the cast itself (NO_OBSERVATION twice, never zero); the exact
      // deficit (103) is CARRIED from the melee swing's attachment 355 ms earlier (220 of 1,250).
      blood_resources(2417826, BLOOD_BB, {
        runes: BLOOD_NO_RES,
        runicPower: BLOOD_NO_RES,
        runicPowerDeficit: 103,
        rune: null,
      }),
      blood_resources(2418659, BLOOD_VS, {
        runes: blood_runes(4, 1),
        runicPower: BLOOD_NO_RES,
        runicPowerDeficit: null,
        rune: 4,
      }),
      blood_decision(2425794, BLOOD_DS, {
        ...BLOOD_DIVERGENT,
        unselectabilityRefusal: "UNCONDITIONAL_ENTRY",
      }),
      blood_dispatch(2425794, BLOOD_DS, BLOOD_IN_GIFT_DISPATCH),
      blood_decision(2429596, BLOOD_DS, {
        ...BLOOD_UNKNOWN,
        unselectabilityRefusal: "UNCONDITIONAL_ENTRY",
        stoppingAt: "sanlayn[10] consumption",
        stoppingAtoms: [BLOOD_CONSUMPTION_TAG],
      }),
      blood_dispatch(2429596, BLOOD_DS, BLOOD_OUT_OF_GIFT_DISPATCH),
      blood_aura(2429596, BLOOD_DS, "gift_of_the_sanlayn", blood_observed_aura(false, BLOOD_GIFT, 2429050)),
      blood_stack(2429596, BLOOD_DS, "bone_shield", blood_exact_stack(12)),
      blood_remains(2429596, BLOOD_DS, "bone_shield", blood_remains_exact(27698, 2427294)),
      blood_remains(2429596, BLOOD_DS, "crimson_scourge", blood_remains_exact(14294, 2428890)),
      blood_rp_state(2429596, BLOOD_DS, blood_rp_own(390, 86, 2429596)),
      blood_rp_state(2425794, BLOOD_DS, blood_rp_own(440, 81, 2425794)),
      // The first Blood Boil carries 220 of 1,250 from the melee swing 355 ms earlier.
      blood_rp_state(2417826, BLOOD_BB, blood_rp_carried(220, 103, 2417471, "EVENT_ASSOCIATED")),
      // M11-B6: the opener's last Heart Strike reads Blood Debt 6 from the applybuffstack at 2,433,963 (31 ms after
      // the Death Strike at 2,433,932 that caused it); the first Death Strike at 2,421,923 reads nothing, because
      // the aura's first transition is its own application 33 ms later.
      blood_stack(2434890, BLOOD_HS, "blood_debt", blood_debt_exact(6)),
      blood_stack(2421923, BLOOD_DS, "blood_debt", blood_unbound_stack(BLOOD_DEBT, "AURA_STATE_UNKNOWN")),
      blood_cooldown(2429596, BLOOD_DS, blood_drw_not_ready(77424, 2417020)),
    ],
    ["OWNED_CONTRACT", "PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "A wire field named cost that is not the cost paid is exactly the kind of fact that must be pinned where the next reader will look. No INSUFFICIENT_RESOURCE proof and no affordability proof exists for any Blood entry, and this evidence is why.",
    { authority: BLOOD_GTKB_AUTHORITY, related: BLOOD_RELATED },
  ),
  kase(
    "spec-blood-death-knight.a-segment-alone-has-no-profile",
    BLOOD_105_165,
    "SPEC_BLOOD_DEATH_KNIGHT",
    "src/specs/deathknight/blood/observed-analysis.ts (profile gate)",
    "Analyzed on its own, the 105–165 s segment holds no combatantinfo for actor 14 and the registration reports PROFILE_NOT_RESOLVED — no build, no applicability, no decisions — rather than a smaller population that would read as clean play.",
    [a("SPEC_BLOOD_DEATH_KNIGHT.ANALYSIS_STATUS", { actorId: BLOOD, expected: "PROFILE_NOT_RESOLVED" })],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Absence of a profile is a refusal, never an empty result.",
    { authority: BLOOD_AUTHORITY, related: BLOOD_RELATED },
  ),
  kase(
    "spec-blood-death-knight.retribution-is-refused-at-the-spec-gate",
    BLOOD45,
    "SPEC_BLOOD_DEATH_KNIGHT",
    "src/specs/deathknight/blood/observed-analysis.ts (spec gate)",
    "Asked about paladin/retribution over this artifact, the Blood facade refuses with SPEC_NOT_SUPPORTED naming that specialization, before any Blood rule, authority load or profile resolution runs.",
    [a("SPEC_BLOOD_DEATH_KNIGHT.SPEC_GATE", { actorId: BLOOD, specId: "paladin/retribution" })],
    ["OWNED_CONTRACT"],
    "A facade owns one specialization and answers for no other. Ownership is also enforced at runtime by the registration and the registry.",
    { related: ["tests/regression/m10a-analyzer-result-ownership.test.ts", ...BLOOD_RELATED] },
  ),
  kase(
    "application-service.blood-death-knight-subject-is-publicly-supported-since-m11-b12",
    BLOOD45,
    "APPLICATION_SERVICE",
    "src/services/analysis-service.ts; src/services/analyzer-registry.ts (publicAnalyzers, internalAnalyzerForSpec); src/services/spec-identity.ts; src/findings/spec-id.ts PUBLIC_SPEC_IDS",
    "RE-PINNED AT M11-B12, INVERTING THE M11-B2 CASE. The real Blood Death Knight subject, over its own captured evidence, is now recognized by the public identity table (DeathKnight/Blood -> deathknight/blood), so the application service retrieves the fight once and dispatches exactly the Blood registration: status ANALYZED, specId deathknight/blood, analyzerId deathknight-blood-observed-decisions, scope PLAYER_CONTEXT (the analyzer's own declared requirement, resources included). Both catalog lookups now answer with the SAME row, whose exposure is PUBLIC. The five public sites moved together in one reviewed edit: the partition, the public contract's specId enum, the identity table, the `satisfies PublicSpecId` on spec.ts, and the registration's exposure.",
    [
      a("APPLICATION_SERVICE.FIGHT_ANALYSIS", {
        subject: { actorId: BLOOD, className: "DeathKnight", specName: "Blood" },
        expected: {
          status: "ANALYZED",
          specId: "deathknight/blood",
          analyzerId: BLOOD_ANALYZER,
          scope: "PLAYER_CONTEXT",
        },
      }),
      a("APPLICATION_SERVICE.INTERNAL_REGISTRATION", {
        specId: "deathknight/blood",
        expected: {
          internalAnalyzerId: BLOOD_ANALYZER,
          publicAnalyzerId: BLOOD_ANALYZER,
          exposure: "PUBLIC",
          identityResolvesPublicly: true,
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "An evaluator has to exist, be registered, be exercised and be AUDITED before it is safe to expose. M11-B2 did the first three for a measurement slice with zero resolved decisions; ten slices resolved 51 of 123 decisions from real evidence, M11-B11 audited the promotion gates, and M11-B12 exposed exactly that slice — narrowed by the San'layn validated-profile gate — and nothing more.",
    {
      related: [
        "tests/contracts/m11b2-blood-registration.test.ts",
        "tests/contracts/m11-promotion-evidence-gate.test.ts",
        "tests/contracts/m10a-spec-partition.test.ts",
        "tests/contracts/m11b12-blood-public-projection.test.ts",
      ],
    },
  ),
];

// --------------------------------------------------------------------------
// M11-C2: Brewmaster Monk (INTERNAL_ONLY measurement slice)
// --------------------------------------------------------------------------

const BREWMASTER = BREWMASTER_GTKB_ACTOR;
const BREWMASTER_ANALYZER = "monk-brewmaster-observed-decisions";
const BREWMASTER_SIMC = { authorityId: "SIMC_APL_MONK_BREWMASTER", artifactRevision: "simc-33622e9d-1" };
const BREWMASTER_AUTHORITY = {
  ...BREWMASTER_SIMC,
  requiredStateEvidence: [
    "the combatantinfo at 2,415,041 for actor 4 (specID 268)",
    "every COMPLETE cast by actor 4 in the slice, in canonical order",
    "every aura transition on actor 4 sourced by actor 4, in canonical order",
  ],
};
const BREWMASTER_RELATED = [
  "tests/contracts/m11c2-brewmaster-registration.test.ts",
  "tests/contracts/m11c2-brewmaster-evaluator.test.ts",
  "tests/unit/m11c2-brewmaster-bindings.test.ts",
];
const BREWMASTER_TALENTS = {
  black_ox_brew: "SELECTED",
  blackout_combo: "SELECTED",
  breath_of_fire: "SELECTED",
  celestial_brew: "NOT_SELECTED",
  celestial_infusion: "SELECTED",
  chi_burst: "SELECTED",
  exploding_keg: "SELECTED",
  fortifying_brew: "SELECTED",
  invoke_niuzao_the_black_ox: "SELECTED",
  keg_smash: "SELECTED",
  press_the_advantage: "NOT_SELECTED",
  purifying_brew: "SELECTED",
  rushing_jade_wind: "NOT_SELECTED",
  salsalabims_strength: "SELECTED",
};
const BREWMASTER_NON_DOMAIN = [
  "precombat[1] potion",
  "default[1] potion",
  "item_actions[0] use_items",
  "race_actions[0] blood_fury",
  "race_actions[1] berserking",
  "race_actions[2] arcane_torrent",
  "race_actions[3] lights_judgment",
  "race_actions[4] fireblood",
  "race_actions[5] ancestral_call",
  "race_actions[6] bag_of_tricks",
];
const BREWMASTER_DISPATCH = [
  {
    at: "default[2]",
    actionToken: "call_action_list",
    calleeListName: "race_actions",
    outcome: "CALL_RETURNED_NO_ACTION_CONTINUE",
    gate: "UNCONDITIONAL",
  },
  {
    at: "default[3]",
    actionToken: "call_action_list",
    calleeListName: "item_actions",
    outcome: "CALL_RETURNED_NO_ACTION_CONTINUE",
    gate: "UNCONDITIONAL",
  },
  {
    at: "default[4]",
    actionToken: "run_action_list",
    calleeListName: "master_of_harmony",
    outcome: "RUN_GATE_FALSE_SKIPPED",
    gate: "FALSE",
  },
  {
    at: "default[5]",
    actionToken: "run_action_list",
    calleeListName: "shado_pan",
    outcome: "RUN_ENTERED_SCAN_ENDS",
    gate: "TRUE",
  },
];
/**
 * An UNKNOWN whose first-GCD query refused a NON_GCD brew branch with no reviewed contract. Since M11-C4i
 * Purifying Brew's transition is reviewed, so the refusal stops at the next unreviewed brew, Black Ox Brew
 * (shado_pan[3]).
 */
const BREWMASTER_BREW_REFUSED = (refusal) => ({
  outcome: "UNKNOWN",
  basis: "AUTHORITY_SELECTION_UNRESOLVED",
  authorityCoverage: "UNKNOWN",
  authorityToken: null,
  selectionPrecision: null,
  decisiveBlocker: "OTHER",
  rawBlocker: "TRANSITION_UNSUPPORTED",
  unresolvedAt: "shado_pan[3] black_ox_brew",
  observedActionRejected: false,
  unselectabilityProven: false,
  unselectabilityRefusal: refusal,
  stoppingAt: null,
  stoppingAtoms: [],
});
/** An UNKNOWN whose worlds diverge at `at`: that entry's readiness is not established, so it may or may not fire. */
const BREWMASTER_DIVERGENT = (refusal, at) => ({
  outcome: "UNKNOWN",
  basis: "AUTHORITY_SELECTION_UNRESOLVED",
  authorityCoverage: "UNKNOWN",
  authorityToken: null,
  selectionPrecision: null,
  decisiveBlocker: "DIVERGENT_WORLDS",
  rawBlocker: "DIVERGENT_GCD_OUTCOMES",
  unresolvedAt: at,
  observedActionRejected: false,
  unselectabilityProven: false,
  unselectabilityRefusal: refusal,
  stoppingAt: null,
  stoppingAtoms: [],
});
/**
 * A REJECTED at EXACT_ENTRY (M11-C4i): the authority DEFINITELY selects `token` — proven usable in every
 * dimension of the positive usability contract — and the player cast something else. Never by
 * unselectability: the observed action's refusal is kept verbatim.
 */
const BREWMASTER_REJECTED_FOR = (token, refusal) => ({
  outcome: "REJECTED",
  basis: "AUTHORITY_SELECTED_DIFFERENT_TOKEN",
  authorityCoverage: "EXACT_ENTRY",
  authorityToken: token,
  selectionPrecision: "EXACT_ENTRY",
  decisiveBlocker: null,
  rawBlocker: null,
  unresolvedAt: null,
  observedActionRejected: false,
  unselectabilityProven: false,
  unselectabilityRefusal: refusal,
  stoppingAt: null,
  stoppingAtoms: [],
});
/** A MATCH at EXACT_ENTRY for `token`. */
const BREWMASTER_MATCH = (token) => ({
  outcome: "MATCH",
  basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
  authorityCoverage: "EXACT_ENTRY",
  authorityToken: token,
  selectionPrecision: "EXACT_ENTRY",
  decisiveBlocker: null,
  rawBlocker: null,
  unresolvedAt: null,
  observedActionRejected: false,
  unselectabilityProven: false,
  unselectabilityRefusal: "UNCONDITIONAL_ENTRY",
  stoppingAt: null,
  stoppingAtoms: [],
});
const bm_cast = (t, ability) => ({ reportTimeMs: t, abilityGameId: ability });
const bm_observed_aura = (up, abilityGameId, anchorReportTimeMs) => ({
  state: "BOUND",
  up,
  abilityGameId,
  proof: "OBSERVED",
  anchorReportTimeMs,
  reason: null,
  auraReason: null,
});
const bm_unknown_aura = (abilityGameId) => ({
  state: "UNBOUND",
  up: null,
  abilityGameId,
  proof: null,
  anchorReportTimeMs: null,
  reason: "AURA_STATE_UNKNOWN",
  auraReason: "AMBIGUOUS_INITIAL_STATE",
});
const [BM_KS, BM_BOK, BM_TP, BM_BOF, BM_NIUZAO] = [121253, 205523, 100780, 115181, 132578];

const BREWMASTER_CASES = [
  kase(
    "normalization.brewmaster-monk-gtkb-opener-normalizes-whole-and-in-order",
    BREWMASTER_GTKB,
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts; supported-families.ts; scripts/sanitize-probe.mjs --actor-slice --families",
    "The 305-event family-filtered actor-4 opener normalizes with every raw type recognised and every event kept in capture order: as SOURCE the combatantinfo, 33 casts and 176 aura transitions; as TARGET 11 casts and 222 aura transitions. No resource change involves actor 4 in the window.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 305 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", {
        actorId: BREWMASTER,
        side: "SOURCE",
        expected: { COMBATANT_INFO: 1, CAST: 33, AURA: 176 },
      }),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", {
        actorId: BREWMASTER,
        side: "TARGET",
        expected: { CAST: 11, AURA: 222 },
      }),
    ],
    ["VALIDATED_EVIDENCE"],
    "A census of what the opener holds for the actor, never of the fight.",
    { related: ["tests/unit/sanitize-probe.test.ts"] },
  ),
  // ---- M11-C4f: the neutral second subject's fixed 20 s opener ----
  kase(
    "normalization.brewmaster-monk-rxaf-opener-normalizes-whole-and-in-order",
    BREWMASTER_RXAF_OPENER,
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts; supported-families.ts; scripts/sanitize-probe.mjs --actor-slice --families",
    "The 331-event family-filtered actor-11 opener of the neutral second Brewmaster subject (rXAfw9t1q8YpmkKD fight 13) normalizes with every raw type recognised and every event kept in capture order: as SOURCE the combatantinfo, 44 casts and 194 aura transitions; as TARGET 14 casts and 235 aura transitions. No resource change involves actor 11 in the window.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 331 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", {
        actorId: RXAF_ACTOR,
        side: "SOURCE",
        expected: { COMBATANT_INFO: 1, CAST: 44, AURA: 194 },
      }),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", {
        actorId: RXAF_ACTOR,
        side: "TARGET",
        expected: { CAST: 14, AURA: 235 },
      }),
    ],
    ["VALIDATED_EVIDENCE"],
    "A census of what the opener holds for the actor, never of the fight. The opener is the second subject's regression fixture, fixed by time (pull .. +20 s) before any analyzer ran; the rest of its fixed window lives in the evidence archive.",
    { related: ["tests/unit/sanitize-probe.test.ts", "tests/unit/m11c4f-selection-frame.test.ts"] },
  ),
  // ---- M11-C4: the 20–165 s extension segment and the composed 165 s fight ----
  kase(
    "normalization.brewmaster-monk-rotational-165s-seg-20-165-normalizes-whole-and-in-order",
    BREWMASTER_GTKB_20_165,
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts; supported-families.ts; scripts/sanitize-probe.mjs --actor-slice --from",
    "The 1,436-event family-filtered actor-4 segment normalizes with every raw type recognised and every event kept in capture order: as SOURCE 197 casts and 891 aura transitions; as TARGET 30 casts and 1,030 aura transitions. No resource change involves actor 4 in the window. No combatantinfo: the segment starts strictly after the fight start, and the profile is carried by the opener slice the bundle begins with.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 1436 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", {
        actorId: BREWMASTER_GTKB_ACTOR,
        side: "SOURCE",
        expected: { CAST: 197, AURA: 891 },
      }),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", {
        actorId: BREWMASTER_GTKB_ACTOR,
        side: "TARGET",
        expected: { CAST: 30, AURA: 1030 },
      }),
    ],
    ["VALIDATED_EVIDENCE"],
    "The census is of the segment, never of the fight: exactly the families the --families option retained, between the recorded exclusive --from and inclusive --to bounds, and nothing else. On its own a segment analyzes to PROFILE_NOT_RESOLVED — there is no combatant profile in it — which is the correct refusal, not a smaller population.",
    { related: ["tests/unit/sanitize-probe.test.ts", "tests/unit/m10c5b-corpus-bundle.test.ts"] },
  ),
  kase(
    "normalization.brewmaster-monk-165s-bundle-composes-two-parts-into-one-complete-fight",
    BREWMASTER_GTKB_20_165,
    "NORMALIZATION",
    "tests/support/corpus/fight.ts bundleOverEvidence; loader.ts; scripts/corpus/build-manifest.mjs",
    "The two parts — the M11-C2 opener slice (its grant ending at 2,435,041, inclusive) and the M11-C4 segment (granted from 2,435,042) — compose into one 1,741-event fight over [2,415,041 .. 2,579,843] with CASTS, AURAS, RESOURCES, COMBATANT_INFO and GEAR each COMPLETE over ONE joined range [2,415,041 .. 2,580,041]. The grants are adjacent, so no certificate is needed: the seven capture events at 2,435,041 are held by both captures, byte-identical, and none involves actor 4.",
    [
      a("NORMALIZATION.BUNDLE_COMPOSITION", {
        historyArtifactIds: [BREWMASTER_GTKB],
        declaredHoles: [],
        actorId: BREWMASTER_GTKB_ACTOR,
        expected: {
          events: 1741,
          coverage: {
            CASTS: "COMPLETE",
            AURAS: "COMPLETE",
            RESOURCES: "COMPLETE",
            COMBATANT_INFO: "COMPLETE",
            GEAR: "COMPLETE",
            DAMAGE: "ABSENT",
            HEALING: "ABSENT",
            ABSORBS: "ABSENT",
            SUMMONS: "ABSENT",
          },
          castRanges: [{ fromReportTimeMs: HP_START, toReportTimeMs: GTKB_EXT_END }],
          windowFromReportTimeMs: HP_START,
          windowToReportTimeMs: 2579843,
        },
      }),
    ],
    ["VALIDATED_EVIDENCE"],
    "Composition is a claim about coverage, and coverage is never inferred from the bytes: the same composer and refusals the Paladin and Blood bundles proved, over two captures of one report and fight taken ten days apart at the SAME report revision (22), which the extension capture re-read before and after its pages.",
    { related: ["tests/unit/m10c5b-corpus-bundle.test.ts", "tests/unit/m9b-corpus-loader.test.ts"] },
  ),
  kase(
    "spec-brewmaster-monk.the-165s-shado-pan-window-measures-one-hundred-thirteen-decisions-seventy-two-resolved",
    BREWMASTER_GTKB_20_165,
    "SPEC_BREWMASTER_MONK",
    "src/specs/monk/brewmaster/observed-analysis.ts; first-gcd-adapter.ts; resolver.ts; tests/support/corpus/fight.ts bundleOverEvidence",
    "M11-C4i RE-MEASUREMENT (pinned): 71 MATCH, 1 REJECTED (the Tiger Palm at 2,424,688, against a proven-usable Keg Smash), 41 UNKNOWN — 15 behind Black Ox Brew (shado_pan[3], no reviewed contract), 16 on Blackout Kick's divergent worlds (shado_pan[7]), 5 on Keg Smash (4 at shado_pan[1], 1 at shado_pan[14]), 3 on Invoke Niuzao (shado_pan[9]), 2 on Breath of Fire (shado_pan[0]). Positive usability (Keg Smash, Blackout Kick, Breath of Fire, Invoke Niuzao: every dimension of the completeness contract proven or not applicable, range STRICT by same-target corroboration) and the Purifying Brew / Empty the Cellar closure (a reviewed Purifying Brew transition: shared internal cooldown, Empty Barrel forgotten, never bound up; Empty the Cellar's wire aura 1262768 corroborated). No earlier resolved outcome changes. BEFORE M11-C4i — THE M11-C4 MEASUREMENT, the unchanged M11-C3a analyzer over the composed 165 s fight of the same subject (gtKb fight 22 actor 4, Shado-Pan). 113 eligible decisions — 30 Keg Smash, 28 Blackout Kick, 27 Breath of Fire, 26 Tiger Palm, 2 Invoke Niuzao — and 117 excluded casts: 57 melee swings; 15 NON_GCD casts (14 Purifying Brew, 1 Fortifying Brew); 38 casts with no pinned lane (27 Gift of the Ox heals, 4 Provoke, 4 Roll, 1 Transcendence, a potion and an on-use item); 7 in-domain GCD casts outside the slice (2 Exploding Keg, 2 Chi Burst, 2 Celestial Infusion, 1 Empty the Cellar). 36 MATCH, all EXACT_ENTRY (19 Blackout Kick, 9 Breath of Fire, 8 Keg Smash), 0 REJECTED, 77 UNKNOWN: 65 because the query must fire a NON_GCD Purifying Brew with no reviewed transition contract (49 at shado_pan[8] while the Niuzao buff is down, 16 at shado_pan[2] while it is up), 12 on divergent worlds (4 at shado_pan[1] Keg Smash readiness, 4 at shado_pan[11] Empty the Cellar, 2 at shado_pan[7] Blackout Kick, 2 at shado_pan[0] Breath of Fire). The 15 opener decisions keep exactly their M11-C3a outcomes inside the bundle. The Empty the Cellar readiness aura stays NOT_CORROBORATED at every decision: the window now holds its wire transitions, and wiring them is a reviewed change this case does not make.",
    [
      a("SPEC_BREWMASTER_MONK.COVERAGE_SUMMARY", {
        actorId: BREWMASTER,
        historyArtifactIds: [BREWMASTER_GTKB],
        declaredHoles: [],
        expected: {
          eligibleDecisions: 113,
          match: 71,
          rejected: 1,
          unknown: 41,
          exclusions: {
            MELEE_SWING: 57,
            NON_GCD_ACTION: 15,
            EXECUTION_LANE_NOT_ESTABLISHED: 38,
            OUTSIDE_FIRST_SLICE: 7,
          },
        },
      }),
      a("SPEC_BREWMASTER_MONK.MEASUREMENT_DISTRIBUTION", {
        actorId: BREWMASTER,
        historyArtifactIds: [BREWMASTER_GTKB],
        declaredHoles: [],
        expected: {
          match: 71,
          rejected: 1,
          exactEntryMatches: 71,
          tokenConvergedMatches: 0,
          eligibleTokens: {
            blackout_kick: 28,
            breath_of_fire: 27,
            invoke_niuzao: 2,
            keg_smash: 30,
            tiger_palm: 26,
          },
          unresolvedAt: {
            "DIVERGENT_GCD_OUTCOMES @ shado_pan[0] breath_of_fire": 2,
            "DIVERGENT_GCD_OUTCOMES @ shado_pan[14] keg_smash": 1,
            "DIVERGENT_GCD_OUTCOMES @ shado_pan[1] keg_smash": 4,
            "DIVERGENT_GCD_OUTCOMES @ shado_pan[7] blackout_kick": 16,
            "DIVERGENT_GCD_OUTCOMES @ shado_pan[9] invoke_niuzao": 3,
            "TRANSITION_UNSUPPORTED @ shado_pan[3] black_ox_brew": 15,
          },
          unknownBlockerClasses: {
            DIVERGENT_WORLDS: 26,
            OTHER: 15,
          },
          stoppingEntries: {
            "(root scan resolved)": 113,
          },
          stoppingAtoms: {},
          dispatchOutcomes: {
            "default[2] -> race_actions : CALL_RETURNED_NO_ACTION_CONTINUE": 113,
            "default[3] -> item_actions : CALL_RETURNED_NO_ACTION_CONTINUE": 113,
            "default[4] -> master_of_harmony : RUN_GATE_FALSE_SKIPPED": 113,
            "default[5] -> shado_pan : RUN_ENTERED_SCAN_ENDS": 113,
          },
          undecidedGcdCandidates: {
            "shado_pan[0] breath_of_fire | USABILITY:breath_of_fire": 3,
            "shado_pan[0] breath_of_fire | buff.invoke_niuzao_the_black_ox.up": 2,
            "shado_pan[10] tiger_palm | USABILITY:tiger_palm": 1,
            "shado_pan[10] tiger_palm | buff.blackout_combo.up": 3,
            "shado_pan[10] tiger_palm | cooldown.blackout_kick.remains": 3,
            "shado_pan[11] empty_the_cellar | buff.empty_the_cellar.remains": 11,
            "shado_pan[12] tiger_palm | USABILITY:tiger_palm": 1,
            "shado_pan[12] tiger_palm | buff.blackout_combo.up": 3,
            "shado_pan[13] breath_of_fire | USABILITY:breath_of_fire": 2,
            "shado_pan[14] keg_smash | USABILITY:keg_smash": 3,
            "shado_pan[15] exploding_keg | USABILITY:exploding_keg": 2,
            "shado_pan[16] celestial_brew | USABILITY:celestial_brew": 3,
            "shado_pan[17] empty_the_cellar | USABILITY:empty_the_cellar": 2,
            "shado_pan[18] chi_burst | USABILITY:chi_burst": 2,
            "shado_pan[1] keg_smash | USABILITY:keg_smash": 16,
            "shado_pan[1] keg_smash | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[21] tiger_palm | energy": 1,
            "shado_pan[21] tiger_palm | energy.regen": 1,
            "shado_pan[22] expel_harm | USABILITY:expel_harm": 1,
            "shado_pan[4] celestial_brew | USABILITY:celestial_brew": 12,
            "shado_pan[4] celestial_brew | buff.empty_barrel.up": 1,
            "shado_pan[4] celestial_brew | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[5] exploding_keg | USABILITY:exploding_keg": 6,
            "shado_pan[5] exploding_keg | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[7] blackout_kick | USABILITY:blackout_kick": 17,
            "shado_pan[7] blackout_kick | buff.blackout_combo.up": 3,
            "shado_pan[9] invoke_niuzao | USABILITY:invoke_niuzao": 8,
          },
          undecidedNonGcdCandidates: {
            "default[0] auto_attack | USABILITY:auto_attack": 113,
            "shado_pan[2] purifying_brew | USABILITY:purifying_brew": 12,
            "shado_pan[2] purifying_brew | buff.empty_barrel.up": 1,
            "shado_pan[2] purifying_brew | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[3] black_ox_brew | buff.empty_barrel.up": 1,
            "shado_pan[3] black_ox_brew | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[3] black_ox_brew | cooldown.celestial_brew.charges_fractional": 15,
            "shado_pan[6] fortifying_brew | USABILITY:fortifying_brew": 12,
            "shado_pan[6] fortifying_brew | buff.empty_barrel.up": 1,
            "shado_pan[6] fortifying_brew | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[8] purifying_brew | USABILITY:purifying_brew": 58,
            "shado_pan[8] purifying_brew | buff.empty_barrel.up": 1,
          },
          gcdDistribution: {
            "GCD_CONSUMING | 1000 ms": 64,
            "GCD_CONSUMING | 1500 ms": 56,
            "NON_GCD | 0 ms": 15,
            "UNKNOWN_LANE | no record": 38,
          },
        },
      }),
      a("SPEC_BREWMASTER_MONK.STATE_EVIDENCE_CENSUS", {
        actorId: BREWMASTER,
        historyArtifactIds: [BREWMASTER_GTKB],
        declaredHoles: [],
        expected: {
          auraEvidence: {
            "blackout_combo | AURA_STATE_UNKNOWN": 3,
            "blackout_combo | up false (OBSERVED)": 82,
            "blackout_combo | up true (OBSERVED)": 28,
            "empty_barrel | AURA_STATE_UNKNOWN": 1,
            "empty_barrel | up false (OBSERVED)": 97,
            "empty_barrel | up true (OBSERVED)": 15,
            "invoke_niuzao_the_black_ox | AURA_STATE_UNKNOWN": 3,
            "invoke_niuzao_the_black_ox | up false (OBSERVED)": 74,
            "invoke_niuzao_the_black_ox | up true (OBSERVED)": 36,
          },
          readinessAuraEvidence: {
            "empty_the_cellar | AURA_ACTIVE": 14,
            "empty_the_cellar | AURA_STATE_UNKNOWN": 18,
            "empty_the_cellar | PROVEN_INACTIVE": 81,
          },
          cooldownReadiness: {
            "blackout_kick | COOLDOWN_STATE_UNKNOWN": 3,
            "blackout_kick | PROVEN_NOT_READY": 55,
            "blackout_kick | WITHIN_QUEUEING_TOLERANCE": 55,
            "breath_of_fire | COOLDOWN_STATE_UNKNOWN": 34,
            "breath_of_fire | PROVEN_NOT_READY": 79,
            "chi_burst | COOLDOWN_STATE_UNKNOWN": 63,
            "chi_burst | PROVEN_NOT_READY": 39,
            "chi_burst | WITHIN_QUEUEING_TOLERANCE": 11,
            "expel_harm | COOLDOWN_STATE_UNKNOWN": 113,
            "exploding_keg | COOLDOWN_STATE_UNKNOWN": 18,
            "exploding_keg | PROVEN_NOT_READY": 81,
            "exploding_keg | WITHIN_QUEUEING_TOLERANCE": 14,
            "invoke_niuzao | COOLDOWN_STATE_UNKNOWN": 4,
            "invoke_niuzao | PROVEN_NOT_READY": 101,
            "invoke_niuzao | WITHIN_QUEUEING_TOLERANCE": 8,
            "rushing_jade_wind | COOLDOWN_STATE_UNKNOWN": 113,
          },
          positiveUsability: {
            "blackout_kick | NOT_PROVEN: COOLDOWN_READINESS(INSIDE_UPPER_BOUND_WINDOW)": 61,
            "blackout_kick | NOT_PROVEN: COOLDOWN_READINESS(POSSIBLE_PRE_PULL_USE)": 2,
            "blackout_kick | NOT_PROVEN: RANGE_TARGET(CORROBORATOR_NOT_ENEMY_UNIT_TARGET)": 13,
            "blackout_kick | NOT_PROVEN: RANGE_TARGET(RANGE_NOT_CONTAINED)": 9,
            "breath_of_fire | NOT_PROVEN: COOLDOWN_READINESS(INSIDE_UPPER_BOUND_WINDOW)": 85,
            "breath_of_fire | NOT_PROVEN: COOLDOWN_READINESS(POSSIBLE_PRE_PULL_USE)": 1,
            "invoke_niuzao | NOT_PROVEN: COOLDOWN_READINESS(INSIDE_UPPER_BOUND_WINDOW)": 108,
            "invoke_niuzao | NOT_PROVEN: COOLDOWN_READINESS(POSSIBLE_PRE_PULL_USE)": 3,
            "keg_smash | NOT_PROVEN: COOLDOWN_READINESS(INSIDE_UPPER_BOUND_WINDOW)": 81,
            "keg_smash | NOT_PROVEN: RESOURCE_AFFORDABILITY(RESOURCE_NOT_OBSERVED_PRE_COST)": 1,
            "keg_smash | PROVEN_USABLE": 1,
          },
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "Evidence closure measures what the CURRENT analyzer learns from a longer real window; it adds no state model. A longer window multiplies MATCH and names the same obstacles — the NON_GCD brew transition first — and surfaces no resolved disagreement: REJECTED stays 0, so the promotion evidence gate stays blocked on real evidence, not on a loosened rule.",
    { authority: BREWMASTER_AUTHORITY, related: BREWMASTER_RELATED },
  ),
  kase(
    "spec-brewmaster-monk.the-shado-pan-opener-measures-fifteen-decisions-six-resolved",
    BREWMASTER_GTKB,
    "SPEC_BREWMASTER_MONK",
    "src/specs/monk/brewmaster/observed-analysis.ts; first-gcd-adapter.ts; resolver.ts",
    "M11-C4i RE-MEASUREMENT (pinned): 5 MATCH, 1 REJECTED, 9 UNKNOWN. Positive usability (Keg Smash, Blackout Kick, Breath of Fire, Invoke Niuzao: every dimension of the completeness contract proven or not applicable, range STRICT by same-target corroboration) and the Purifying Brew / Empty the Cellar closure (a reviewed Purifying Brew transition: shared internal cooldown, Empty Barrel forgotten, never bound up; Empty the Cellar's wire aura 1262768 corroborated). The Tiger Palm at 2,424,688 is REJECTED: shado_pan[1] keg_smash selects a Keg Smash proven usable (its last cast 9,465 ms earlier against an 8,000 ms charge-cooldown upper bound plus the 250 ms tolerance; the Tiger Palm's own PRE_COST 100 Energy against a 40 base cost; the Tiger Palm's target within 5 yd, inside Keg Smash's 15). The 9 UNKNOWN: 7 behind Black Ox Brew (no reviewed contract; shado_pan[3]), 2 on Keg Smash's divergent worlds at shado_pan[1]. BEFORE M11-C4i — THE M11-C2 MEASUREMENT. The Brewmaster subject (gtKb fight 22 actor 4, Shado-Pan) yields 15 eligible decisions over its 20 s opener — 4 Keg Smash, 4 Blackout Kick, 3 Tiger Palm, 3 Breath of Fire, 1 Invoke Niuzao — and 18 excluded casts (7 melee swings, 3 NON_GCD Purifying Brews, 8 casts with no pinned lane: Provoke, five Gift of the Ox heals, a potion and an on-use item). Every root scan RESOLVES through the hero-tree dispatch (Master of Harmony skipped, Shado-Pan entered), so no decision is lost to the dispatch itself; 5 MATCH at EXACT_ENTRY — both later Breath of Fire casts, selected at shado_pan[0] under Sal'salabim's Strength and a proven Invoke Niuzao buff, and since M11-C3a three Keg Smash casts (+10.7 s, +15.2 s, +19.3 s) selected at shado_pan[1] once Breath of Fire's 15,000 ms cooldown is proven running from the previous Breath of Fire with no Keg Smash reset (CAST_BY_ACTOR 121253) in between — 0 REJECTED, 10 UNKNOWN: 8 because the query must fire the NON_GCD Purifying Brew at shado_pan[2] and no reviewed transition contract exists for it, 2 (Blackout Kick +17.3 s, Tiger Palm +18.3 s) because Keg Smash's readiness at shado_pan[1] is not modelled (two charges, a hasted recharge, two reset paths) and its worlds diverge.",
    [
      a("SPEC_BREWMASTER_MONK.COVERAGE_SUMMARY", {
        actorId: BREWMASTER,
        expected: {
          eligibleDecisions: 15,
          match: 5,
          rejected: 1,
          unknown: 9,
          exclusions: {
            MELEE_SWING: 7,
            NON_GCD_ACTION: 3,
            EXECUTION_LANE_NOT_ESTABLISHED: 8,
          },
        },
      }),
      a("SPEC_BREWMASTER_MONK.MEASUREMENT_DISTRIBUTION", {
        actorId: BREWMASTER,
        expected: {
          match: 5,
          rejected: 1,
          exactEntryMatches: 5,
          tokenConvergedMatches: 0,
          eligibleTokens: {
            blackout_kick: 4,
            breath_of_fire: 3,
            invoke_niuzao: 1,
            keg_smash: 4,
            tiger_palm: 3,
          },
          unresolvedAt: {
            "DIVERGENT_GCD_OUTCOMES @ shado_pan[1] keg_smash": 2,
            "TRANSITION_UNSUPPORTED @ shado_pan[3] black_ox_brew": 7,
          },
          unknownBlockerClasses: {
            DIVERGENT_WORLDS: 2,
            OTHER: 7,
          },
          stoppingEntries: {
            "(root scan resolved)": 15,
          },
          stoppingAtoms: {},
          dispatchOutcomes: {
            "default[2] -> race_actions : CALL_RETURNED_NO_ACTION_CONTINUE": 15,
            "default[3] -> item_actions : CALL_RETURNED_NO_ACTION_CONTINUE": 15,
            "default[4] -> master_of_harmony : RUN_GATE_FALSE_SKIPPED": 15,
            "default[5] -> shado_pan : RUN_ENTERED_SCAN_ENDS": 15,
          },
          undecidedGcdCandidates: {
            "shado_pan[0] breath_of_fire | buff.invoke_niuzao_the_black_ox.up": 2,
            "shado_pan[10] tiger_palm | USABILITY:tiger_palm": 1,
            "shado_pan[10] tiger_palm | buff.blackout_combo.up": 3,
            "shado_pan[10] tiger_palm | cooldown.blackout_kick.remains": 3,
            "shado_pan[11] empty_the_cellar | buff.empty_the_cellar.remains": 6,
            "shado_pan[12] tiger_palm | USABILITY:tiger_palm": 1,
            "shado_pan[12] tiger_palm | buff.blackout_combo.up": 3,
            "shado_pan[13] breath_of_fire | USABILITY:breath_of_fire": 1,
            "shado_pan[14] keg_smash | USABILITY:keg_smash": 2,
            "shado_pan[15] exploding_keg | USABILITY:exploding_keg": 2,
            "shado_pan[16] celestial_brew | USABILITY:celestial_brew": 2,
            "shado_pan[17] empty_the_cellar | USABILITY:empty_the_cellar": 2,
            "shado_pan[18] chi_burst | USABILITY:chi_burst": 2,
            "shado_pan[1] keg_smash | USABILITY:keg_smash": 6,
            "shado_pan[1] keg_smash | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[4] celestial_brew | USABILITY:celestial_brew": 4,
            "shado_pan[4] celestial_brew | buff.empty_barrel.up": 1,
            "shado_pan[4] celestial_brew | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[5] exploding_keg | USABILITY:exploding_keg": 6,
            "shado_pan[5] exploding_keg | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[7] blackout_kick | buff.blackout_combo.up": 3,
            "shado_pan[9] invoke_niuzao | USABILITY:invoke_niuzao": 3,
          },
          undecidedNonGcdCandidates: {
            "default[0] auto_attack | USABILITY:auto_attack": 15,
            "shado_pan[2] purifying_brew | USABILITY:purifying_brew": 4,
            "shado_pan[2] purifying_brew | buff.empty_barrel.up": 1,
            "shado_pan[2] purifying_brew | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[3] black_ox_brew | buff.empty_barrel.up": 1,
            "shado_pan[3] black_ox_brew | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[3] black_ox_brew | cooldown.celestial_brew.charges_fractional": 7,
            "shado_pan[6] fortifying_brew | USABILITY:fortifying_brew": 4,
            "shado_pan[6] fortifying_brew | buff.empty_barrel.up": 1,
            "shado_pan[6] fortifying_brew | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[8] purifying_brew | USABILITY:purifying_brew": 5,
            "shado_pan[8] purifying_brew | buff.empty_barrel.up": 1,
          },
          gcdDistribution: {
            "GCD_CONSUMING | 1000 ms": 8,
            "GCD_CONSUMING | 1500 ms": 7,
            "NON_GCD | 0 ms": 3,
            "UNKNOWN_LANE | no record": 8,
          },
        },
      }),
      a("SPEC_BREWMASTER_MONK.STATE_EVIDENCE_CENSUS", {
        actorId: BREWMASTER,
        expected: {
          auraEvidence: {
            "blackout_combo | AURA_STATE_UNKNOWN": 3,
            "blackout_combo | up false (OBSERVED)": 7,
            "blackout_combo | up true (OBSERVED)": 5,
            "empty_barrel | AURA_STATE_UNKNOWN": 1,
            "empty_barrel | up false (OBSERVED)": 11,
            "empty_barrel | up true (OBSERVED)": 3,
            "invoke_niuzao_the_black_ox | AURA_STATE_UNKNOWN": 3,
            "invoke_niuzao_the_black_ox | up true (OBSERVED)": 12,
          },
          readinessAuraEvidence: {
            "empty_the_cellar | AURA_STATE_UNKNOWN": 15,
          },
          cooldownReadiness: {
            "blackout_kick | COOLDOWN_STATE_UNKNOWN": 3,
            "blackout_kick | PROVEN_NOT_READY": 9,
            "blackout_kick | WITHIN_QUEUEING_TOLERANCE": 3,
            "breath_of_fire | COOLDOWN_STATE_UNKNOWN": 4,
            "breath_of_fire | PROVEN_NOT_READY": 11,
            "chi_burst | COOLDOWN_STATE_UNKNOWN": 15,
            "expel_harm | COOLDOWN_STATE_UNKNOWN": 15,
            "exploding_keg | COOLDOWN_STATE_UNKNOWN": 15,
            "invoke_niuzao | COOLDOWN_STATE_UNKNOWN": 4,
            "invoke_niuzao | PROVEN_NOT_READY": 11,
            "rushing_jade_wind | COOLDOWN_STATE_UNKNOWN": 15,
          },
          positiveUsability: {
            "blackout_kick | NOT_PROVEN: COOLDOWN_READINESS(INSIDE_UPPER_BOUND_WINDOW)": 9,
            "blackout_kick | NOT_PROVEN: COOLDOWN_READINESS(POSSIBLE_PRE_PULL_USE)": 2,
            "breath_of_fire | NOT_PROVEN: COOLDOWN_READINESS(INSIDE_UPPER_BOUND_WINDOW)": 11,
            "breath_of_fire | NOT_PROVEN: COOLDOWN_READINESS(POSSIBLE_PRE_PULL_USE)": 1,
            "invoke_niuzao | NOT_PROVEN: COOLDOWN_READINESS(INSIDE_UPPER_BOUND_WINDOW)": 11,
            "invoke_niuzao | NOT_PROVEN: COOLDOWN_READINESS(POSSIBLE_PRE_PULL_USE)": 3,
            "keg_smash | NOT_PROVEN: COOLDOWN_READINESS(INSIDE_UPPER_BOUND_WINDOW)": 10,
            "keg_smash | PROVEN_USABLE": 1,
          },
        },
      }),
      a("SPEC_BREWMASTER_MONK.BUILD_RESOLUTION", {
        actorId: BREWMASTER,
        expected: {
          talents: BREWMASTER_TALENTS,
          heroTree: "shadopan",
          apex1: "SELECTED",
          apex3: "SELECTED",
          buildStaticAtoms: {
            "hero_tree.master_of_harmony": false,
            "hero_tree.shadopan": true,
            "talent.blackout_combo.enabled": true,
            "talent.salsalabims_strength.enabled": true,
            "apex.1": true,
            "apex.3": true,
          },
        },
      }),
      a("SPEC_BREWMASTER_MONK.AUTHORITY_PROVENANCE", {
        actorId: BREWMASTER,
        expected: {
          authorityId: "SIMC_APL_MONK_BREWMASTER",
          artifactRevision: "simc-33622e9d-1",
          commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
          sourcePath: "engine/class_modules/apl/apl_monk.cpp",
          sourceSha256: "a8b7e2afe48425089cdc97a369fc4abe87784a818d0423ba0706fb60f1f53c20",
          regionSelector: {
            kind: "NAMESPACE_FUNCTION",
            enclosingNamespace: "brewmaster",
            functionHeader: "void default_apl( monk_t* player )",
            playerIdentifier: "player",
          },
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The first real traversal of the Brewmaster authority: the hero-tree dispatch holds on every decision, and the residual UNKNOWN population is named — a NON_GCD brew the query may not fire without a reviewed contract, and a Breath of Fire whose cast-reset cooldown is not modelled. Nothing is widened to force a resolved decision.",
    { authority: BREWMASTER_AUTHORITY, related: BREWMASTER_RELATED },
  ),
  kase(
    "spec-brewmaster-monk.breath-of-fire-and-keg-smash-match-and-the-rest-name-their-blocker",
    BREWMASTER_GTKB,
    "SPEC_BREWMASTER_MONK",
    "src/specs/monk/brewmaster/observed-analysis.ts; first-gcd-adapter.ts; observed-action-gate.ts; aura-bindings.ts; cooldown-bindings.ts",
    "Per decision. The Breath of Fire casts at 2,427,076 and 2,431,304 MATCH at shado_pan[0] EXACT_ENTRY: Sal'salabim's Strength is SELECTED and the Invoke Niuzao buff (132578) is proven UP from its application at 2,419,027. The Keg Smash at the pull (2,415,223) is UNKNOWN: no aura has been observed yet, so Niuzao's buff is AMBIGUOUS_INITIAL_STATE, and — since M11-C4i gave Purifying Brew a reviewed transition — the world in which Black Ox Brew fires at shado_pan[3] has no reviewed contract. Since M11-C4i the Tiger Palm at 2,424,688 is REJECTED: shado_pan[1] keg_smash selects a Keg Smash proven usable in every dimension of the positive usability contract. Since M11-C3a the Keg Smash at 2,425,704 MATCHES at shado_pan[1]: Breath of Fire's cooldown is proven running (at least 5,973 ms of 15,000 from the Breath of Fire at 2,416,677, with no Keg Smash reset in between), so shado_pan[0] is skipped; the Breath of Fire at 2,427,076 gets no such proof, because the Keg Smash at 2,425,704 may have reset it — and still MATCHES as the observed cast. The Blackout Kick at 2,432,314 is UNKNOWN by DIVERGENT_WORLDS at shado_pan[1]: Keg Smash's readiness is not modelled. Invoke Niuzao's own cooldown is PROVEN_NOT_READY at 2,423,448 (95,000 ms base: 120,000 less Efficient Training, SELECTED), and Blackout Combo, removed by the Tiger Palm at 2,424,688, is still UP to that Tiger Palm.",
    [
      a("SPEC_BREWMASTER_MONK.DECISION_COVERAGE", {
        actorId: BREWMASTER,
        targetActorId: null,
        observedCast: bm_cast(2427076, BM_BOF),
        expected: BREWMASTER_MATCH("breath_of_fire"),
      }),
      a("SPEC_BREWMASTER_MONK.DECISION_COVERAGE", {
        actorId: BREWMASTER,
        targetActorId: null,
        observedCast: bm_cast(2431304, BM_BOF),
        expected: BREWMASTER_MATCH("breath_of_fire"),
      }),
      a("SPEC_BREWMASTER_MONK.DECISION_COVERAGE", {
        actorId: BREWMASTER,
        targetActorId: null,
        observedCast: bm_cast(2415223, BM_KS),
        expected: BREWMASTER_BREW_REFUSED("CONDITION_NOT_PROVEN_FALSE"),
      }),
      a("SPEC_BREWMASTER_MONK.DECISION_COVERAGE", {
        actorId: BREWMASTER,
        targetActorId: null,
        observedCast: bm_cast(2419027, BM_NIUZAO),
        expected: BREWMASTER_BREW_REFUSED("UNCONDITIONAL_ENTRY"),
      }),
      a("SPEC_BREWMASTER_MONK.DECISION_COVERAGE", {
        actorId: BREWMASTER,
        targetActorId: null,
        observedCast: bm_cast(2424688, BM_TP),
        // M11-C4i: shado_pan[1] keg_smash selects a Keg Smash proven usable in every dimension.
        expected: BREWMASTER_REJECTED_FOR("keg_smash", "CONDITION_NOT_PROVEN_FALSE"),
      }),
      a("SPEC_BREWMASTER_MONK.DECISION_COVERAGE", {
        actorId: BREWMASTER,
        targetActorId: null,
        observedCast: bm_cast(2425704, BM_KS),
        expected: BREWMASTER_MATCH("keg_smash"),
      }),
      a("SPEC_BREWMASTER_MONK.DECISION_COVERAGE", {
        actorId: BREWMASTER,
        targetActorId: null,
        observedCast: bm_cast(2432314, BM_BOK),
        expected: BREWMASTER_DIVERGENT("CONDITION_NOT_PROVEN_FALSE", "shado_pan[1] keg_smash"),
      }),
      a("SPEC_BREWMASTER_MONK.DISPATCH_TRACE_AT", {
        actorId: BREWMASTER,
        observedCast: bm_cast(2427076, BM_BOF),
        expected: BREWMASTER_DISPATCH,
      }),
      a("SPEC_BREWMASTER_MONK.DISPATCH_TRACE_AT", {
        actorId: BREWMASTER,
        observedCast: bm_cast(2415223, BM_KS),
        expected: BREWMASTER_DISPATCH,
      }),
      a("SPEC_BREWMASTER_MONK.AURA_BINDING_AT", {
        actorId: BREWMASTER,
        observedCast: bm_cast(2415223, BM_KS),
        atomName: "invoke_niuzao_the_black_ox",
        expected: bm_unknown_aura(132578),
      }),
      a("SPEC_BREWMASTER_MONK.AURA_BINDING_AT", {
        actorId: BREWMASTER,
        observedCast: bm_cast(2427076, BM_BOF),
        atomName: "invoke_niuzao_the_black_ox",
        expected: bm_observed_aura(true, 132578, 2419027),
      }),
      a("SPEC_BREWMASTER_MONK.AURA_BINDING_AT", {
        actorId: BREWMASTER,
        observedCast: bm_cast(2424688, BM_TP),
        atomName: "blackout_combo",
        expected: bm_observed_aura(true, 228563, 2423494),
      }),
      a("SPEC_BREWMASTER_MONK.AURA_BINDING_AT", {
        actorId: BREWMASTER,
        observedCast: bm_cast(2427076, BM_BOF),
        atomName: "empty_barrel",
        expected: bm_observed_aura(false, 1265307, 2415224),
      }),
      a("SPEC_BREWMASTER_MONK.AURA_BINDING_AT", {
        actorId: BREWMASTER,
        observedCast: bm_cast(2432314, BM_BOK),
        atomName: "empty_barrel",
        expected: bm_observed_aura(true, 1265307, 2431305),
      }),
      a("SPEC_BREWMASTER_MONK.COOLDOWN_READINESS_AT", {
        actorId: BREWMASTER,
        observedCast: bm_cast(2423448, BM_BOK),
        simcToken: "invoke_niuzao",
        expected: {
          readiness: "PROVEN_NOT_READY",
          provenRemainingAtLeastMs: 90579,
          anchorReportTimeMs: 2419027,
          anchorAbilityGameId: 132578,
          effectiveBaseMs: 95000,
          unknownReason: null,
        },
      }),
      a("SPEC_BREWMASTER_MONK.COOLDOWN_READINESS_AT", {
        actorId: BREWMASTER,
        observedCast: bm_cast(2419027, BM_NIUZAO),
        simcToken: "blackout_kick",
        expected: {
          readiness: "PROVEN_NOT_READY",
          provenRemainingAtLeastMs: 2655,
          anchorReportTimeMs: 2417682,
          anchorAbilityGameId: 205523,
          effectiveBaseMs: 4000,
          unknownReason: null,
        },
      }),
      a("SPEC_BREWMASTER_MONK.COOLDOWN_READINESS_AT", {
        actorId: BREWMASTER,
        observedCast: bm_cast(2423448, BM_BOK),
        simcToken: "blackout_kick",
        expected: {
          readiness: "UNKNOWN",
          provenRemainingAtLeastMs: null,
          anchorReportTimeMs: 2417682,
          anchorAbilityGameId: 205523,
          effectiveBaseMs: 4000,
          unknownReason: "WITHIN_QUEUEING_TOLERANCE",
        },
      }),
      a("SPEC_BREWMASTER_MONK.COOLDOWN_READINESS_AT", {
        actorId: BREWMASTER,
        observedCast: bm_cast(2425704, BM_KS),
        simcToken: "breath_of_fire",
        expected: {
          readiness: "PROVEN_NOT_READY",
          provenRemainingAtLeastMs: 5973,
          anchorReportTimeMs: 2416677,
          anchorAbilityGameId: 115181,
          effectiveBaseMs: 15000,
          unknownReason: null,
        },
      }),
      a("SPEC_BREWMASTER_MONK.COOLDOWN_READINESS_AT", {
        actorId: BREWMASTER,
        observedCast: bm_cast(2427076, BM_BOF),
        simcToken: "breath_of_fire",
        expected: {
          readiness: "UNKNOWN",
          provenRemainingAtLeastMs: null,
          anchorReportTimeMs: null,
          anchorAbilityGameId: null,
          effectiveBaseMs: 15000,
          unknownReason: "COOLDOWN_STATE_UNKNOWN",
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "A MATCH here means only that the observed Breath of Fire is the entry the pinned authority selects under proven state; every UNKNOWN names the entry that kept it UNKNOWN, and no decision is REJECTED without a proof.",
    { authority: BREWMASTER_AUTHORITY, related: BREWMASTER_RELATED },
  ),
  kase(
    "spec-brewmaster-monk.domains-and-the-class-spec-boundary",
    BREWMASTER_GTKB,
    "SPEC_BREWMASTER_MONK",
    "src/specs/monk/brewmaster/domains.ts; authority-bindings.ts; domain-boundary.ts",
    "The offensive rotation is the one domain with authority (SIMC_APL_MONK_BREWMASTER). The five other domains a tank asks about are declared and bound to nothing — NO_PINNED_AUTHORITY_FOR_DOMAIN, never DOMAIN_NOT_DECLARED — and the three that share buttons with the offensive list name them (Purifying Brew, Celestial Brew and Black Ox Brew for active mitigation; Fortifying Brew for defensive cooldowns; Expel Harm for self healing). The potions, the item use and the seven racial actions are outside the rotational decision domain.",
    [
      a("SPEC_BREWMASTER_MONK.DOMAIN_RESULT", {
        actorId: BREWMASTER,
        domain: "OFFENSIVE_ROTATION",
        expected: {
          resolution: "AUTHORITY_AVAILABLE",
          authorityId: "SIMC_APL_MONK_BREWMASTER",
          offensiveAuthorityGoverns: null,
          evidenceFamily: null,
          sharesActionsWithOffensive: null,
        },
      }),
      a("SPEC_BREWMASTER_MONK.DOMAIN_RESULT", {
        actorId: BREWMASTER,
        domain: "RESOURCE_SPENDING",
        expected: {
          resolution: "NO_PINNED_AUTHORITY_FOR_DOMAIN",
          authorityId: null,
          offensiveAuthorityGoverns: false,
          evidenceFamily: null,
          sharesActionsWithOffensive: null,
        },
      }),
      a("SPEC_BREWMASTER_MONK.DOMAIN_RESULT", {
        actorId: BREWMASTER,
        domain: "ACTIVE_MITIGATION",
        expected: {
          resolution: "NO_PINNED_AUTHORITY_FOR_DOMAIN",
          authorityId: null,
          offensiveAuthorityGoverns: false,
          evidenceFamily: null,
          sharesActionsWithOffensive: ["purifying_brew", "celestial_brew", "black_ox_brew"],
        },
      }),
      a("SPEC_BREWMASTER_MONK.DOMAIN_RESULT", {
        actorId: BREWMASTER,
        domain: "DEFENSIVE_COOLDOWN",
        expected: {
          resolution: "NO_PINNED_AUTHORITY_FOR_DOMAIN",
          authorityId: null,
          offensiveAuthorityGoverns: false,
          evidenceFamily: null,
          sharesActionsWithOffensive: ["fortifying_brew"],
        },
      }),
      a("SPEC_BREWMASTER_MONK.DOMAIN_RESULT", {
        actorId: BREWMASTER,
        domain: "SELF_HEALING",
        expected: {
          resolution: "NO_PINNED_AUTHORITY_FOR_DOMAIN",
          authorityId: null,
          offensiveAuthorityGoverns: false,
          evidenceFamily: null,
          sharesActionsWithOffensive: ["expel_harm"],
        },
      }),
      a("SPEC_BREWMASTER_MONK.DOMAIN_RESULT", {
        actorId: BREWMASTER,
        domain: "INTERRUPT",
        expected: {
          resolution: "NO_PINNED_AUTHORITY_FOR_DOMAIN",
          authorityId: null,
          offensiveAuthorityGoverns: false,
          evidenceFamily: "UNVERIFIED",
          sharesActionsWithOffensive: null,
        },
      }),
      a("SPEC_BREWMASTER_MONK.NON_DOMAIN_ENTRIES", { actorId: BREWMASTER, expected: BREWMASTER_NON_DOMAIN }),
    ],
    ["PINNED_AUTHORITY", "OWNED_CONTRACT"],
    "NO_AUTHORITY_AVAILABLE and UNKNOWN are different answers: the defensive domains have no standard at all, while an offensive decision the evidence cannot decide is UNKNOWN. Neither is a verdict about the player.",
    { authority: BREWMASTER_AUTHORITY, related: BREWMASTER_RELATED },
  ),
  kase(
    "spec-brewmaster-monk.blood-is-refused-at-the-spec-gate",
    BREWMASTER_GTKB,
    "SPEC_BREWMASTER_MONK",
    "src/specs/monk/brewmaster/observed-analysis.ts (spec gate)",
    "Asked about deathknight/blood over this artifact, the Brewmaster facade refuses with SPEC_NOT_SUPPORTED naming that specialization, before any Brewmaster rule, authority load or profile resolution runs.",
    [a("SPEC_BREWMASTER_MONK.SPEC_GATE", { actorId: BREWMASTER, specId: "deathknight/blood" })],
    ["OWNED_CONTRACT"],
    "A facade owns one specialization and answers for no other. Ownership is also enforced at runtime by the registration and the registry.",
    { related: ["tests/regression/m10a-analyzer-result-ownership.test.ts", ...BREWMASTER_RELATED] },
  ),
  kase(
    "application-service.brewmaster-monk-subject-is-publicly-supported-since-m11-c4j",
    BREWMASTER_GTKB,
    "APPLICATION_SERVICE",
    "src/services/analysis-service.ts; src/services/analyzer-registry.ts (publicAnalyzers, internalAnalyzerForSpec); src/services/spec-identity.ts; src/findings/spec-id.ts PUBLIC_SPEC_IDS",
    "RE-PINNED AT M11-C4j, INVERTING THE M11-C2 CASE. The real Brewmaster Monk subject, over its own captured evidence, is now recognized by the public identity table (Monk/Brewmaster -> monk/brewmaster), so the application service retrieves the fight once and dispatches exactly the Brewmaster registration: status ANALYZED, specId monk/brewmaster, analyzerId monk-brewmaster-observed-decisions, scope PLAYER_CONTEXT (the analyzer's own declared requirement, resources included since M11-C4j declared the ENERGY its positive usability reads). Both catalog lookups now answer with the SAME row, whose exposure is PUBLIC. The five public sites moved together in one reviewed edit: the partition, the public contract's specId enum, the identity table, the `satisfies PublicSpecId` on spec.ts, and the registration's exposure.",
    [
      a("APPLICATION_SERVICE.FIGHT_ANALYSIS", {
        subject: { actorId: BREWMASTER, className: "Monk", specName: "Brewmaster" },
        expected: {
          status: "ANALYZED",
          specId: "monk/brewmaster",
          analyzerId: BREWMASTER_ANALYZER,
          scope: "PLAYER_CONTEXT",
        },
      }),
      a("APPLICATION_SERVICE.INTERNAL_REGISTRATION", {
        specId: "monk/brewmaster",
        expected: {
          internalAnalyzerId: BREWMASTER_ANALYZER,
          publicAnalyzerId: BREWMASTER_ANALYZER,
          exposure: "PUBLIC",
          identityResolvesPublicly: true,
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "An evaluator has to exist, be registered, be exercised and be audited before it is safe to expose. M11-C2 did the first three for a measurement slice; the M11-C3/C4 slices resolved real decisions over two independent subjects, M11-C4i reached a real REJECTED in each, and M11-C4j exposed exactly that slice — narrowed by the Shado-Pan validated-profile gate — and nothing more.",
    {
      related: [
        "tests/contracts/m11c2-brewmaster-registration.test.ts",
        "tests/contracts/m11-promotion-evidence-gate.test.ts",
        "tests/contracts/m10a-spec-partition.test.ts",
        "tests/contracts/m11c4j-brewmaster-public-projection.test.ts",
      ],
    },
  ),
];

const RET_CASES = [
  kase(
    "normalization.retribution-paladin-rotational-45s-normalizes-whole-and-in-order",
    RET45,
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts; supported-families.ts; scripts/sanitize-probe.mjs --actor-slice --families",
    "The 514-event family-filtered actor-6 slice normalizes with every raw type recognised and every event kept in capture order: as SOURCE the combatantinfo, 84 casts, 64 Holy Power changes and 267 aura transitions; as TARGET 7 casts, 64 resource changes and 211 aura transitions.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 514 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", {
        actorId: RET,
        side: "SOURCE",
        expected: { COMBATANT_INFO: 1, CAST: 84, RESOURCE_CHANGE: 64, AURA: 267 },
      }),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", {
        actorId: RET,
        side: "TARGET",
        expected: { CAST: 7, RESOURCE_CHANGE: 64, AURA: 211 },
      }),
    ],
    ["VALIDATED_EVIDENCE"],
    "A census of what the slice holds for the actor, never of the fight: exactly the families the --families option retained, at or before the recorded bound. The same predicate that cut the Protection subject from the same stream cut this one; the stream had no actor filter, so it is complete for both.",
    { related: ["tests/unit/sanitize-probe.test.ts"] },
  ),
  ret_segment_case(
    RET_45_105,
    "seg-45-105",
    641,
    { CAST: 89, RESOURCE_CHANGE: 64, AURA: 377 },
    { CAST: 7, RESOURCE_CHANGE: 64, AURA: 229 },
    "The second Avenging Wrath (2,067,930), the Divine Toll (2,075,677), the Execution Sentence (2,073,829) and the Wake of Ashes (2,103,923) lie in it.",
  ),
  ret_segment_case(
    RET_105_165,
    "seg-105-165",
    547,
    { CAST: 63, RESOURCE_CHANGE: 52, AURA: 321 },
    { CAST: 7, RESOURCE_CHANGE: 52, AURA: 227 },
    "The third Avenging Wrath (2,127,413) lies in it.",
  ),
  kase(
    "normalization.retribution-paladin-165s-bundle-composes-three-parts-into-one-complete-fight",
    RET_105_165,
    "NORMALIZATION",
    "tests/support/corpus/fight.ts bundleOverEvidence; loader.ts certificateErrors; scripts/corpus/build-manifest.mjs certifiedEmpty",
    "The three parts — the 45 s slice (its grant ending at 2,049,581), then the segments granted from 2,049,589 and 2,109,590 — compose into one 1,702-event fight over [2,004,589 .. 2,169,440] with CASTS, AURAS, RESOURCES, COMBATANT_INFO and GEAR each COMPLETE over ONE joined range [2,004,589 .. 2,169,589]. The seven milliseconds [2,049,582 .. 2,049,588] between the first two parts are bridged only by the seg-45-105 record's zero-event certificate.",
    [
      a("NORMALIZATION.BUNDLE_COMPOSITION", {
        historyArtifactIds: RET_HISTORY,
        declaredHoles: [],
        actorId: RET,
        expected: {
          events: 1702,
          coverage: {
            CASTS: "COMPLETE",
            AURAS: "COMPLETE",
            RESOURCES: "COMPLETE",
            COMBATANT_INFO: "COMPLETE",
            GEAR: "COMPLETE",
            DAMAGE: "ABSENT",
            HEALING: "ABSENT",
            ABSORBS: "ABSENT",
            SUMMONS: "ABSENT",
          },
          castRanges: [{ fromReportTimeMs: 2004589, toReportTimeMs: 2169589 }],
          windowFromReportTimeMs: 2004589,
          windowToReportTimeMs: 2169440,
        },
      }),
    ],
    ["VALIDATED_EVIDENCE"],
    "Composition is a claim about coverage, and coverage is never inferred from the bytes: the same composer, certificate validation and refusals the Protection bundle proved, over a second subject cut from the same two captures.",
    { related: ["tests/unit/m10c5b-corpus-bundle.test.ts", "tests/unit/m9b-corpus-loader.test.ts"] },
  ),
  kase(
    "spec-retribution-paladin.authority-build-boundary-and-domains-on-the-first-slice",
    RET45,
    "SPEC_RETRIBUTION_PALADIN",
    "src/specs/paladin/retribution/registration.ts; authority-bindings.ts; pinned-authority.ts; observed-analysis.ts (build); action-profile.ts; domain-boundary.ts; domains.ts",
    "Over the 45 s slice the registration analyzes actor 6 under exactly the pinned SIMC_APL_PALADIN_RETRIBUTION artifact, resolves the build from the observed tree (17 of 18 modelled talents three-way, Radiant Glory UNKNOWN because its NORMAL node is absent — never NOT_SELECTED; hero tree herald_of_the_sun; main hand 251230 pinned two-handed), classifies exactly eleven pinned entries OUTSIDE the rotational decision domain by token category (seven item uses including the precombat one, one potion, one external buff, three racials — Light's Judgment, Fireblood, Arcane Torrent), and represents the six domains: OFFENSIVE_ROTATION under the authority; RESOURCE_SPENDING, DEFENSIVE_COOLDOWN and INTERRUPT declared with no pinned authority; ACTIVE_MITIGATION and SELF_HEALING not declared.",
    [
      a("SPEC_RETRIBUTION_PALADIN.AUTHORITY_PROVENANCE", { actorId: RET, expected: RET_PROVENANCE }),
      a("SPEC_RETRIBUTION_PALADIN.BUILD_RESOLUTION", {
        actorId: RET,
        expected: { talents: RET_TALENTS, heroTree: "herald_of_the_sun", twoHandedWeaponItemId: 251230 },
      }),
      a("SPEC_RETRIBUTION_PALADIN.NON_DOMAIN_ENTRIES", { actorId: RET, expected: RET_NON_DOMAIN }),
      a("SPEC_RETRIBUTION_PALADIN.DOMAIN_RESULT", {
        actorId: RET,
        domain: "OFFENSIVE_ROTATION",
        expected: {
          resolution: "AUTHORITY_AVAILABLE",
          authorityId: "SIMC_APL_PALADIN_RETRIBUTION",
          offensiveAuthorityGoverns: null,
          evidenceFamily: null,
        },
      }),
      a("SPEC_RETRIBUTION_PALADIN.DOMAIN_RESULT", {
        actorId: RET,
        domain: "RESOURCE_SPENDING",
        expected: {
          resolution: "NO_PINNED_AUTHORITY_FOR_DOMAIN",
          authorityId: null,
          offensiveAuthorityGoverns: false,
          evidenceFamily: null,
        },
      }),
      a("SPEC_RETRIBUTION_PALADIN.DOMAIN_RESULT", {
        actorId: RET,
        domain: "ACTIVE_MITIGATION",
        expected: {
          resolution: "DOMAIN_NOT_DECLARED",
          authorityId: null,
          offensiveAuthorityGoverns: false,
          evidenceFamily: null,
        },
      }),
      a("SPEC_RETRIBUTION_PALADIN.DOMAIN_RESULT", {
        actorId: RET,
        domain: "INTERRUPT",
        expected: {
          resolution: "NO_PINNED_AUTHORITY_FOR_DOMAIN",
          authorityId: null,
          offensiveAuthorityGoverns: false,
          evidenceFamily: "UNVERIFIED",
        },
      }),
    ],
    ["OWNED_CONTRACT", "PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The domain boundary is a decision about what the class/spec authority governs, taken by TOKEN CATEGORY before any build fact is read: a racial, a potion, an item use or an external buff cannot preempt a class/spec action, and nothing about race, faction, gear use effects or consumables is read or inferred. Radiant Glory stays UNKNOWN by the three-way rule; the Avenging Wrath entry is settled applicable by the actor's OBSERVED wings casts instead (action-profile.ts), never by reading the absence as false.",
    { authority: RET_AUTHORITY, related: RET_RELATED },
  ),
  kase(
    "spec-retribution-paladin.spender-population-over-165s-is-sixty-nine-with-one-real-match-and-ten-real-rejected",
    RET_105_165,
    "SPEC_RETRIBUTION_PALADIN",
    "src/specs/paladin/retribution/observed-analysis.ts analyzeObservedRetributionPaladinDecisions; first-gcd-adapter.ts; observed-action-gate.ts",
    "Over the composed 165 s fight the evaluator finds 69 eligible spender decisions — every Final Verdict and Divine Storm cast — and excludes 167 casts by name: 1 melee swing, 112 NON_GCD presses (Crusading Strikes' auto-attack strikes, Avenging Wrath, Rebuke, the defensives), 54 in-domain GCD casts outside the first slice (Judgment, Blade of Justice, Hammer of Wrath, Wake of Ashes, Divine Toll, Execution Sentence). Of the 69: 1 MATCH, 10 REJECTED, 58 UNKNOWN. The engine names default[0] auto_attack as every UNKNOWN's earliest unresolved candidate; the root scan itself stopped at generators[0] call_action_list for 46 (the finishers callee ambiguous because variable.ds_castable did not resolve), default[3] call_action_list for 5, cooldowns[10] avenging_wrath for 3 (wings off cooldown, its raid_event gate unreadable), generators[1] wake_of_ashes for 2 and generators[2] divine_toll for 2 (cooldown elapsed, gate unreadable).",
    [
      a("SPEC_RETRIBUTION_PALADIN.COVERAGE_SUMMARY", {
        actorId: RET,
        ...RET_FULL,
        expected: {
          eligibleDecisions: 69,
          match: 1,
          rejected: 10,
          unknown: 58,
          exclusions: RET_BUNDLE_EXCLUSIONS,
        },
      }),
      a("SPEC_RETRIBUTION_PALADIN.UNKNOWN_BLOCKER_DISTRIBUTION", {
        actorId: RET,
        ...RET_FULL,
        expected: {
          match: 1,
          rejected: 10,
          blockedAt: { "default[0] auto_attack": 58 },
          rootScanBlockedAt: {
            "generators[0] call_action_list": 46,
            "default[3] call_action_list": 5,
            "cooldowns[10] avenging_wrath": 3,
            "generators[1] wake_of_ashes": 2,
            "generators[2] divine_toll": 2,
          },
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The coverage disclosure is the honest measure of the slice: 11 of 69 decisions resolve, and every one of the 58 that do not names the entry the evidence could not decide. The Divine Arbiter auras are proven only from their first observed transition, so ds_castable — and with it the finishers callee — is undecided for most of the early window; inside wings the Hammer of Wrath charge count is unbindable by design. Nothing here converts an UNKNOWN into a verdict.",
    { authority: RET_AUTHORITY, related: RET_RELATED },
  ),
  kase(
    "spec-retribution-paladin.the-real-match-final-verdict-at-2108996",
    RET_105_165,
    "SPEC_RETRIBUTION_PALADIN",
    "src/specs/paladin/retribution/first-gcd-adapter.ts; action-profile.ts; aura-bindings.ts (exact-zero stacks); cooldown-bindings.ts; resolver.ts; holy-power.ts",
    "The Final Verdict at 2,108,996 (+104,407 ms) MATCHES by the exact entry finishers[3] templars_verdict: Holy Power 4 of 5 on the wire (cost 3), Divine Purpose proven down (removal 2,105,158), so both spenders are PROVEN usable and cooldown-free; variable.ds_castable BOUND false because divine_arbiter_divine_storm is proven UP (application 2,102,703) — Divine Storm is eliminated by its gate; Art of War proven INACTIVE (removal before the decision) and Righteous Cause disproved at the choice node bind both stack atoms to exactly zero, so blade_of_justice's gate is FALSE; Hammer of Wrath is unusable with its readiness aura proven down (2,091,947); Wake of Ashes, Divine Toll, Execution Sentence and Avenging Wrath are proven on cooldown from their observed casts; Blade of Justice's hasted cooldown is REFUSED and stays UNKNOWN. The unselectability proof does not hold (templars_verdict's entry is unconditional), as it never can for a Verdict.",
    [
      ret_decision(
        2108996,
        RET_FV,
        {
          outcome: "MATCH",
          basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
          authorityCoverage: "EXACT_ENTRY",
          authorityToken: "templars_verdict",
          selectionPrecision: "EXACT_ENTRY",
          decisiveBlocker: null,
          rawBlocker: null,
          observedActionRejected: false,
          unselectabilityProven: false,
          unselectabilityRefusal: "UNCONDITIONAL_ENTRY",
        },
        RET_FULL,
      ),
      ret_hp(2108996, RET_FV, { state: "EXACT_PRE_COST", amount: 4, max: 5, cost: 3 }, RET_FULL),
      ret_ds_castable(2108996, RET_FV, { state: "BOUND", value: false, reason: null }, RET_FULL),
      ret_aura(
        2108996,
        RET_FV,
        "divine_arbiter_divine_storm",
        ret_bound_aura(true, RET_ARBITER_DS, 2102703),
        RET_FULL,
      ),
      ret_aura(
        2108996,
        RET_FV,
        "divine_purpose",
        ret_bound_aura(false, RET_DIVINE_PURPOSE, 2105158),
        RET_FULL,
      ),
      ret_aura(
        2108996,
        RET_FV,
        "hammer_of_wrath",
        ret_bound_aura(false, RET_HOW_READINESS, 2091947),
        RET_FULL,
      ),
      ret_stack(2108996, RET_FV, "art_of_war", ret_zero("PROVEN_INACTIVE", RET_ART_OF_WAR), RET_FULL),
      ret_stack(
        2108996,
        RET_FV,
        "righteous_cause",
        ret_zero("TALENT_NOT_SELECTED", RET_RIGHTEOUS_CAUSE),
        RET_FULL,
      ),
      ret_cooldown(2108996, RET_FV, "wake_of_ashes", ret_not_ready(24927, 2103923, 255937, 30000), RET_FULL),
      ret_cooldown(2108996, RET_FV, "avenging_wrath", ret_not_ready(18934, 2067930, 31884, 60000), RET_FULL),
      ret_cooldown(
        2108996,
        RET_FV,
        "blade_of_justice",
        ret_cd_unknown("MODIFIERS_NOT_PROVEN_ABSENT", null),
        RET_FULL,
      ),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The one real MATCH of the first slice, reproduced through the production path and resting on nothing but observed evidence and pinned facts: the wire's own Holy Power, auras from observed transitions, cooldowns from observed casts, and the two exact-zero stack proofs the M11-A4 amendment authorized. A MATCH means the observed spender is compatible with the pinned class/spec authority after the non-domain exclusion — not that it was the best play.",
    { authority: RET_AUTHORITY, related: RET_RELATED },
  ),
  kase(
    "spec-retribution-paladin.divine-storm-under-the-arbiter-storm-buff-is-rejected-two-ways",
    RET_105_165,
    "SPEC_RETRIBUTION_PALADIN",
    "src/specs/paladin/retribution/observed-action-gate.ts; first-gcd-adapter.ts; holy-power.ts (free-cast route)",
    "Two Divine Storms cast while divine_arbiter_divine_storm was proven UP (application 2,102,703): at 2,105,158 a Divine Purpose FREE cast (no Holy Power on the wire; Divine Purpose proven up from its application at 2,103,923, so the spenders are usable through the free route) and at 2,106,382 a costed cast at 5 Holy Power. At both, variable.ds_castable is BOUND false, so the single entry naming divine_storm (finishers[2]) is gated FALSE in every world and the nested unselectability proof REJECTS the observed action; independently, the first-GCD scan selects finishers[3] templars_verdict by the exact entry. Both routes agree.",
    [
      ret_decision(
        2105158,
        RET_DS,
        {
          outcome: "REJECTED",
          basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
          authorityCoverage: "EXACT_ENTRY",
          authorityToken: "templars_verdict",
          selectionPrecision: "EXACT_ENTRY",
          decisiveBlocker: null,
          rawBlocker: null,
          observedActionRejected: true,
          unselectabilityProven: true,
          unselectabilityRefusal: null,
        },
        RET_FULL,
      ),
      ret_hp(2105158, RET_DS, RET_HP_NONE, RET_FULL),
      ret_aura(
        2105158,
        RET_DS,
        "divine_purpose",
        ret_bound_aura(true, RET_DIVINE_PURPOSE, 2103923),
        RET_FULL,
      ),
      ret_decision(
        2106382,
        RET_DS,
        {
          outcome: "REJECTED",
          basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
          authorityCoverage: "EXACT_ENTRY",
          authorityToken: "templars_verdict",
          selectionPrecision: "EXACT_ENTRY",
          decisiveBlocker: null,
          rawBlocker: null,
          observedActionRejected: true,
          unselectabilityProven: true,
          unselectabilityRefusal: null,
        },
        RET_FULL,
      ),
      ret_hp(2106382, RET_DS, { state: "EXACT_PRE_COST", amount: 5, max: 5, cost: 3 }, RET_FULL),
      ret_ds_castable(2106382, RET_DS, { state: "BOUND", value: false, reason: null }, RET_FULL),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "REJECTED rests on a proof, not on a replacement: the authority could not have selected divine_storm here whatever else it selected. That the scan also selects templars_verdict with the competitor PROVEN usable — Holy Power on the wire or the free route proven — is the second, independent route, and the two are checked against each other (a MATCH and an unselectability proof on the same decision would be INCONSISTENT_AUTHORITY_RESULTS, never a verdict).",
    { authority: RET_AUTHORITY, related: RET_RELATED },
  ),
  kase(
    "spec-retribution-paladin.rejected-by-unselectability-alone-before-any-cooldown-is-anchored",
    RET45,
    "SPEC_RETRIBUTION_PALADIN",
    "src/specs/paladin/retribution/observed-action-gate.ts; aura-bindings.ts; cooldown-bindings.ts",
    "The first Divine Storm of the fight, at 2,006,193 (+1,604 ms, 3 Holy Power on the wire), is REJECTED by the unselectability proof alone: Empyrean Legacy is proven UP from the Avenging Wrath at 2,005,300, so !buff.empyrean_legacy.up is FALSE and variable.ds_castable is BOUND false whatever the arbiter auras are. The scan itself is UNKNOWN — Wake of Ashes, Divine Toll and Execution Sentence have no observed cast yet (NO_OBSERVED_CAST) and inside wings Hammer of Wrath's charges are unbindable — and Art of War's stack atom is UNBOUND (TALENT_NOT_DISPROVED: the talent is taken and no transition has been observed), so no state is invented to reach the verdict.",
    [
      ret_decision(2006193, RET_DS, {
        outcome: "REJECTED",
        basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
        authorityCoverage: "UNKNOWN",
        authorityToken: null,
        selectionPrecision: null,
        decisiveBlocker: null,
        rawBlocker: "ONE_SCAN_BLOCKED/NO_DEFINITE_WINNER",
        observedActionRejected: true,
        unselectabilityProven: true,
        unselectabilityRefusal: null,
      }),
      ret_hp(2006193, RET_DS, { state: "EXACT_PRE_COST", amount: 3, max: 5, cost: 3 }),
      ret_ds_castable(2006193, RET_DS, { state: "BOUND", value: false, reason: null }),
      ret_aura(2006193, RET_DS, "empyrean_legacy", ret_bound_aura(true, 387178, 2005300)),
      ret_aura(2006193, RET_DS, "divine_arbiter_verdict", {
        state: "UNBOUND",
        up: null,
        abilityGameId: RET_ARBITER_VERDICT,
        anchorReportTimeMs: null,
        reason: "AURA_STATE_UNKNOWN",
      }),
      ret_stack(2006193, RET_DS, "art_of_war", ret_unbound_stack("TALENT_NOT_DISPROVED", RET_ART_OF_WAR)),
      ret_cooldown(2006193, RET_DS, "wake_of_ashes", ret_cd_unknown("NO_OBSERVED_CAST", null)),
      ret_cooldown(2006193, RET_DS, "avenging_wrath", ret_not_ready(59107, 2005300, 31884, 60000)),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The unselectability route needs no replacement action and no usability proof for any other entry, so it can hold where the scan cannot. An aura is UNBOUND until its first observed transition and a cooldown UNKNOWN until its first observed cast: silence proves nothing, in either direction.",
    {
      authority: { ...RET_AUTHORITY, requiredStateEvidence: RET_AUTHORITY.requiredStateEvidence.slice(0, 4) },
      related: RET_RELATED,
    },
  ),
  kase(
    "spec-retribution-paladin.an-active-art-of-war-leaves-the-stack-atom-unbound-and-the-decision-unknown",
    RET45,
    "SPEC_RETRIBUTION_PALADIN",
    "src/specs/paladin/retribution/aura-bindings.ts bindRetributionStackZero; src/simc/expression/evaluate.ts knownBuffStacks",
    "At the Final Verdict at 2,043,066 (+38,477 ms, 5 Holy Power, ds_castable BOUND false, every censused cooldown proven running, Hammer of Wrath proven unusable) Art of War is ACTIVE — applied at 2,041,391, removed only at 2,044,554 — so its stack atom is UNBOUND (AURA_ACTIVE): no positive count is ever bound, blade_of_justice's gate stays undecided, and the decision is UNKNOWN. The same decision with the aura proven INACTIVE is the MATCH pattern at 2,108,996.",
    [
      ret_stack(2043066, RET_FV, "art_of_war", ret_unbound_stack("AURA_ACTIVE", RET_ART_OF_WAR)),
      ret_stack(2043066, RET_FV, "righteous_cause", ret_zero("TALENT_NOT_SELECTED", RET_RIGHTEOUS_CAUSE)),
      ret_ds_castable(2043066, RET_FV, { state: "BOUND", value: false, reason: null }),
      ret_unknown_decision(2043066, RET_FV),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The amendment bound exactly zero under two proofs and nothing else. An ACTIVE aura has at least one stack and this project has no stack model, so the atom stays unbound and the shared evaluator enumerates it; a decision that hinges on it is UNKNOWN, not guessed.",
    {
      authority: { ...RET_AUTHORITY, requiredStateEvidence: RET_AUTHORITY.requiredStateEvidence.slice(0, 4) },
      related: RET_RELATED,
    },
  ),
  kase(
    "spec-retribution-paladin.ds-castable-resolves-only-when-the-arbiter-auras-settle-it",
    RET_45_105,
    "SPEC_RETRIBUTION_PALADIN",
    "src/specs/paladin/retribution/resolver.ts resolveDsCastable; vocabulary.ts DS_CASTABLE_VALUE_EXPRESSION",
    "variable.ds_castable is the pinned finishers[0] expression evaluated by the shared evaluator with active_enemies UNKNOWN. At the Divine Storm at 2,074,658 it is BOUND true: divine_arbiter_verdict proven UP (2,072,765) settles the disjunction, Empyrean Legacy and divine_arbiter_divine_storm proven down. At the Final Verdict at 2,009,638 it is UNBOUND (VALUE_EXPRESSION_UNRESOLVED): divine_arbiter_verdict is proven down but divine_arbiter_divine_storm has no observed transition yet, so one enumeration makes the value TRUE and another FALSE.",
    [
      ret_ds_castable(
        2074658,
        RET_DS,
        { state: "BOUND", value: true, reason: null },
        { historyArtifactIds: [RET45], declaredHoles: [] },
      ),
      ret_aura(
        2074658,
        RET_DS,
        "divine_arbiter_verdict",
        ret_bound_aura(true, RET_ARBITER_VERDICT, 2072765),
        {
          historyArtifactIds: [RET45],
          declaredHoles: [],
        },
      ),
      ret_ds_castable(
        2009638,
        RET_FV,
        { state: "UNBOUND", value: null, reason: "VALUE_EXPRESSION_UNRESOLVED" },
        { historyArtifactIds: [RET45], declaredHoles: [] },
      ),
      ret_aura(
        2009638,
        RET_FV,
        "divine_arbiter_divine_storm",
        {
          state: "UNBOUND",
          up: null,
          abilityGameId: RET_ARBITER_DS,
          anchorReportTimeMs: null,
          reason: "AURA_STATE_UNKNOWN",
        },
        { historyArtifactIds: [RET45], declaredHoles: [] },
      ),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "One named variable, one pinned expression, no assignment engine: the value is bound only when every enumeration of the unbound atoms agrees, and active_enemies is never bound, so the disjunction it opens resolves only through the arbiter aura or the conjunction's other members.",
    { authority: RET_AUTHORITY, related: RET_RELATED },
  ),
  kase(
    "spec-retribution-paladin.gap-bundle-carries-no-state-across-the-declared-hole",
    RET_105_165,
    "SPEC_RETRIBUTION_PALADIN",
    "tests/support/corpus/fight.ts bundleOverEvidence (declared holes); src/specs/paladin/retribution/cooldown-bindings.ts; aura-bindings.ts",
    "Over the gap bundle — the 45 s slice and the 105–165 s segment with [2,049,582 .. 2,109,589] declared missing — the 19 decisions in [2,109,590 .. 2,169,589] resolve to 0 MATCH, 5 REJECTED, 14 UNKNOWN: the MATCH at 2,108,996 and the two scan-selected REJECTED lie inside the hole and are not in evidence; no cooldown anchor or aura transition before the hole is carried across it; the five REJECTED are unselectability proofs resting only on arbiter and Empyrean Legacy transitions observed AFTER the hole. The exclusion counts in the window are exactly the segment's own (29 NON_GCD, 15 outside the first slice).",
    [
      a("SPEC_RETRIBUTION_PALADIN.COVERAGE_SUMMARY", {
        actorId: RET,
        ...RET_GAP,
        evaluationWindow: RET_GAP_WINDOW,
        expected: {
          eligibleDecisions: 19,
          match: 0,
          rejected: 5,
          unknown: 14,
          exclusions: { NON_GCD_ACTION: 29, OUTSIDE_FIRST_SLICE: 15 },
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "A hole is admissible only when declared exactly, and inside it the fight is PARTIAL: every claim that spans it fails its gate downstream. No state carries across a declared hole; what an observed transition after it proves, it still proves.",
    { authority: RET_AUTHORITY, related: [...RET_RELATED, "tests/unit/m10c5b-corpus-bundle.test.ts"] },
  ),
  kase(
    "spec-retribution-paladin.a-segment-alone-has-no-profile",
    RET_105_165,
    "SPEC_RETRIBUTION_PALADIN",
    "src/specs/paladin/retribution/observed-analysis.ts (profile gate)",
    "Analyzed on its own, the 105–165 s segment holds no combatantinfo for actor 6 and the registration reports PROFILE_NOT_RESOLVED — no build, no applicability, no decisions — rather than a smaller population that would read as clean play.",
    [a("SPEC_RETRIBUTION_PALADIN.ANALYSIS_STATUS", { actorId: RET, expected: "PROFILE_NOT_RESOLVED" })],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Absence of a profile is a refusal, never an empty result: the correct answer to 'what build was this' with no combatantinfo is that it was not resolved.",
    { authority: RET_AUTHORITY, related: RET_RELATED },
  ),
  kase(
    "spec-retribution-paladin.assassination-is-refused-at-the-spec-gate",
    RET45,
    "SPEC_RETRIBUTION_PALADIN",
    "src/specs/paladin/retribution/observed-analysis.ts (spec gate)",
    "Asked about rogue/assassination over this artifact, the Retribution facade refuses with SPEC_NOT_SUPPORTED naming that specialization, before any Retribution rule, authority load or profile resolution runs.",
    [a("SPEC_RETRIBUTION_PALADIN.SPEC_GATE", { actorId: RET, specId: "rogue/assassination" })],
    ["OWNED_CONTRACT"],
    "A facade owns one specialization and answers for no other. Ownership is also enforced at runtime by the registration and the registry.",
    { related: ["tests/regression/m10a-analyzer-result-ownership.test.ts", ...RET_RELATED] },
  ),
  kase(
    "application-service.retribution-paladin-subject-is-analyzed-under-player-context",
    RET45,
    "APPLICATION_SERVICE",
    "src/services/analysis-service.ts; src/services/analyzer-registry.ts (publicAnalyzers, internalAnalyzerForSpec); src/services/spec-identity.ts; src/findings/spec-id.ts PUBLIC_SPEC_IDS (M11-A5 public catalog)",
    "The real Retribution Paladin subject, over its own captured evidence, is recognized as paladin/retribution, dispatched to the Retribution analyzer, ingested at PLAYER_CONTEXT with resources, and reported ANALYZED; the validated catalog resolves paladin/retribution to the same PUBLIC registration for both lookups, in either catalog order, and the public identity table resolves Paladin/Retribution. (In M11-A4 this case pinned SPEC_NOT_SUPPORTED, a null public lookup and INTERNAL_ONLY exposure; M11-A5 moved the id into the public partition, the public contract, the identity table and the exposure together.)",
    [
      a("APPLICATION_SERVICE.FIGHT_ANALYSIS", {
        subject: { actorId: RET, className: "Paladin", specName: "Retribution" },
        expected: {
          status: "ANALYZED",
          specId: "paladin/retribution",
          analyzerId: RET_ANALYZER,
          scope: "PLAYER_CONTEXT",
        },
      }),
      a("APPLICATION_SERVICE.INTERNAL_REGISTRATION", {
        specId: "paladin/retribution",
        expected: {
          internalAnalyzerId: RET_ANALYZER,
          publicAnalyzerId: RET_ANALYZER,
          exposure: "PUBLIC",
          identityResolvesPublicly: true,
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "An evaluator has to exist, be registered and be exercised BEFORE it is safe to expose; M11-A4 did that internally and M11-A5 exposed it after the promotion evidence gate reported real MATCH and REJECTED evidence. The registry validates that the public set, the identity table and the partition agree, so the three could not have moved separately. ANALYZED maps to the PARTIAL service state: 26 eligible decisions over the 45 s slice, one resolved, is disclosed as coverage rather than read as clean play.",
    {
      related: [
        "tests/contracts/m11a4-retribution-registration.test.ts",
        "tests/contracts/m11-promotion-evidence-gate.test.ts",
        "tests/contracts/m11a5-retribution-public-projection.test.ts",
      ],
    },
  ),
  kase(
    "spec-retribution-paladin.analysis-projects-publicly-with-the-slice-boundary-named",
    RET_105_165,
    "SPEC_RETRIBUTION_PALADIN",
    "src/specs/paladin/retribution/registration.ts (retributionObservedDecisionView, RETRIBUTION_EXCLUSION_VIEW_PROJECTION); src/contracts/analysis-projection.ts; src/contracts/analysis-contract.ts PUBLIC_EXCLUSION_REASONS",
    "The composed 165 s analysis, read through the registration's view and projected by the real public projection, validates under warcraft-logs-coach.analysis/1 with the same totals the internal facade reports (69 eligible: 1 MATCH, 10 REJECTED, 58 UNKNOWN; 167 excluded). The one melee swing and the 112 NON_GCD presses project as 113 NON_GCD_ACTION; the 54 in-domain GCD casts the first slice does not judge project as OUTSIDE_SUPPORTED_SLICE — the public value M11-A5 added under analysis/1 for exactly this: observed, not judged, not an UNKNOWN. The real MATCH (Final Verdict 2,108,996: AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN, EXACT_ENTRY templars_verdict), a REJECTED by both routes (Divine Storm 2,105,158: EXACT_ENTRY templars_verdict), a REJECTED by unselectability alone (Divine Storm 2,006,193: authority coverage UNKNOWN, no token) and an UNKNOWN (Final Verdict 2,008,783: AUTHORITY_SELECTION_UNRESOLVED, OBSERVED_STATE_MISSING) project with exactly the internal outcome and basis. Avenging Wrath 2,005,300 projects NON_GCD_ACTION; Execution Sentence 2,007,120, Wake of Ashes 2,007,870, Divine Toll 2,011,286, Hammer of Wrath 2,012,897, Blade of Justice 2,018,755 and Judgment 2,030,059 project OUTSIDE_SUPPORTED_SLICE. No raw blocker, root-scan stopping entry, domain result, Holy Power observation, build resolution, resolver diagnostic or foreground-execution proof reaches the document.",
    [
      a("SPEC_RETRIBUTION_PALADIN.PUBLIC_PROJECTION", {
        actorId: RET,
        ...RET_FULL,
        expected: {
          specId: "paladin/retribution",
          analyzerId: RET_ANALYZER,
          eligibleDecisions: 69,
          match: 1,
          rejected: 10,
          unknown: 58,
          excludedCastCount: 167,
          exclusions: { NON_GCD_ACTION: 113, OUTSIDE_SUPPORTED_SLICE: 54 },
          decisions: [
            {
              reportTimeMs: 2108996,
              abilityGameId: RET_FV,
              outcome: "MATCH",
              basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
              authorityCoverage: "EXACT_ENTRY",
              authorityToken: "templars_verdict",
              selectionPrecision: "EXACT_ENTRY",
              decisiveBlocker: null,
            },
            {
              reportTimeMs: 2105158,
              abilityGameId: RET_DS,
              outcome: "REJECTED",
              basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
              authorityCoverage: "EXACT_ENTRY",
              authorityToken: "templars_verdict",
              selectionPrecision: "EXACT_ENTRY",
              decisiveBlocker: null,
            },
            {
              reportTimeMs: 2006193,
              abilityGameId: RET_DS,
              outcome: "REJECTED",
              basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
              authorityCoverage: "UNKNOWN",
              authorityToken: null,
              selectionPrecision: null,
              decisiveBlocker: null,
            },
            {
              reportTimeMs: 2008783,
              abilityGameId: RET_FV,
              outcome: "UNKNOWN",
              basis: "AUTHORITY_SELECTION_UNRESOLVED",
              authorityCoverage: "UNKNOWN",
              authorityToken: null,
              selectionPrecision: null,
              decisiveBlocker: "OBSERVED_STATE_MISSING",
            },
          ],
          excluded: [
            { reportTimeMs: 2005300, abilityGameId: 31884, reason: "NON_GCD_ACTION" },
            { reportTimeMs: 2007120, abilityGameId: 343527, reason: "OUTSIDE_SUPPORTED_SLICE" },
            { reportTimeMs: 2007870, abilityGameId: 255937, reason: "OUTSIDE_SUPPORTED_SLICE" },
            { reportTimeMs: 2011286, abilityGameId: 375576, reason: "OUTSIDE_SUPPORTED_SLICE" },
            { reportTimeMs: 2012897, abilityGameId: 24275, reason: "OUTSIDE_SUPPORTED_SLICE" },
            { reportTimeMs: 2018755, abilityGameId: 184575, reason: "OUTSIDE_SUPPORTED_SLICE" },
            { reportTimeMs: 2030059, abilityGameId: 20271, reason: "OUTSIDE_SUPPORTED_SLICE" },
          ],
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Promotion changed reachability, not the analyzer: the public document carries the internal outcomes unchanged and withholds the machinery. OUTSIDE_SUPPORTED_SLICE is the only public value M11-A5 added, spec-neutral, and it is the difference between a narrow honest denominator and a cherry-picked one — a reader sees 54 rotational casts the analyzer observed and did not judge, and cannot mistake them for mistakes, for UNKNOWNs or for absence.",
    {
      authority: RET_AUTHORITY,
      related: [...RET_RELATED, "tests/contracts/m11a5-retribution-public-projection.test.ts"],
    },
  ),
  kase(
    "public-contract.analysis-parity-for-the-blood-death-knight-subject",
    BLOOD45,
    "PUBLIC_CONTRACT",
    "src/contracts/analysis-projection.ts; src/api/worker.ts; src/mcp/tools/analyze-warcraft-log.ts",
    "The real Blood Death Knight subject over its own 45 s evidence is ANALYZED on both transports — one document naming deathknight/blood and the Blood analyzer, identical on REST and MCP (structuredContent and text), schema-valid under warcraft-logs-coach.analysis/1, publishing MATCH as AUTHORITY_COMPATIBLE_ONLY. (Before M11-B12 the same subject answered SPEC_NOT_SUPPORTED on both transports.)",
    [
      a("PUBLIC_CONTRACT.REST_MCP_PARITY", {
        document: "ANALYSIS",
        subject: { actorId: BLOOD, className: "DeathKnight", specName: "Blood" },
        expected: { status: "ANALYZED", specId: "deathknight/blood", analyzerId: BLOOD_ANALYZER },
      }),
    ],
    ["OWNED_CONTRACT"],
    "The schema version is unchanged: M11-B12 widened the public specId enum and nothing else — no outcome, basis, blocker class, exclusion reason, status or capability value moved for the fourth specialization, and no document a consumer had already received changed. Blood's own evidence classes (order-invariant stack sets, presence proofs, remains floors, Rune affordability, Blood Debt counts) stay inside the payload; what the wire carries is the same vocabulary the other three publish.",
    {
      related: [
        "tests/integration/m11b12-blood-public-transports.test.ts",
        "tests/contracts/m11b12-blood-public-projection.test.ts",
        "tests/contracts/m10a-spec-partition.test.ts",
      ],
    },
  ),
  kase(
    "public-contract.analysis-parity-for-the-brewmaster-monk-subject",
    BREWMASTER_GTKB,
    "PUBLIC_CONTRACT",
    "src/contracts/analysis-projection.ts; src/api/worker.ts; src/mcp/tools/analyze-warcraft-log.ts",
    "The real Brewmaster Monk subject over its own 20 s opener is ANALYZED on both transports — one document naming monk/brewmaster and the Brewmaster analyzer, identical on REST and MCP (structuredContent and text), schema-valid under warcraft-logs-coach.analysis/1, publishing MATCH as AUTHORITY_COMPATIBLE_ONLY. (Before M11-C4j the same subject answered SPEC_NOT_SUPPORTED on both transports.)",
    [
      a("PUBLIC_CONTRACT.REST_MCP_PARITY", {
        document: "ANALYSIS",
        subject: { actorId: BREWMASTER, className: "Monk", specName: "Brewmaster" },
        expected: { status: "ANALYZED", specId: "monk/brewmaster", analyzerId: BREWMASTER_ANALYZER },
      }),
    ],
    ["OWNED_CONTRACT"],
    "The schema version is unchanged: M11-C4j widened the public specId enum and nothing else — no outcome, basis, blocker class, exclusion reason, status or capability value moved for the fifth specialization, and no document a consumer had already received changed. Brewmaster's own evidence classes (the positive-usability conclusions and their per-dimension facts, the readiness aura facts, the dispatch trace) stay inside the payload; what the wire carries is the same vocabulary the other four publish.",
    {
      related: [
        "tests/integration/m11c4j-brewmaster-public-transports.test.ts",
        "tests/contracts/m11c4j-brewmaster-public-projection.test.ts",
        "tests/contracts/m10a-spec-partition.test.ts",
      ],
    },
  ),
  kase(
    "public-contract.analysis-parity-for-the-retribution-paladin-subject",
    RET45,
    "PUBLIC_CONTRACT",
    "src/contracts/analysis-projection.ts; src/api/worker.ts; src/mcp/tools/analyze-warcraft-log.ts",
    "The real Retribution Paladin subject over its own 45 s evidence is ANALYZED on both transports — one document naming paladin/retribution and the Retribution analyzer, identical on REST and MCP (structuredContent and text), schema-valid under warcraft-logs-coach.analysis/1, publishing MATCH as AUTHORITY_COMPATIBLE_ONLY. (Before M11-A5 the same subject answered SPEC_NOT_SUPPORTED on both transports.)",
    [
      a("PUBLIC_CONTRACT.REST_MCP_PARITY", {
        document: "ANALYSIS",
        subject: { actorId: RET, className: "Paladin", specName: "Retribution" },
        expected: { status: "ANALYZED", specId: "paladin/retribution", analyzerId: RET_ANALYZER },
      }),
    ],
    ["OWNED_CONTRACT"],
    "The schema version is unchanged: growing the public specId enum, and the exclusion-reason enum by the one spec-neutral value the slice boundary needs, is how supported specializations arrive, and no document a consumer had already received changed. Every decision UNKNOWN is carried as coverage, not hidden.",
    {
      related: [
        "tests/integration/m11a5-retribution-public-transports.test.ts",
        "tests/contracts/m10a-spec-partition.test.ts",
      ],
    },
  ),
  kase(
    "public-contract.raid-night-parity-mixed-roster-with-retribution-over-its-own-evidence",
    RET45,
    "PUBLIC_CONTRACT",
    "src/contracts/raid-night-contract.ts; src/services/raid-night-service.ts; /v1/raid-night; analyze_raid_night",
    "One raid-night request over the Retribution 45 s slice served as ONE core, with a roster of four real participants of A7R6 fight 7: the Retribution Paladin (actor 6) is ANALYZED under paladin/retribution; the Protection Paladin (actor 7) and the Assassination Rogue (actor 19) have none of their evidence in the slice and their analyzers answer PROFILE_NOT_RESOLVED; the Arms Warrior (actor 4) is SPEC_NOT_SUPPORTED. One document on REST and MCP, one ingestion per transport.",
    [
      a("PUBLIC_CONTRACT.REST_MCP_PARITY", {
        document: "RAID_NIGHT",
        fightIds: [7],
        subject: { actorId: RET },
        composition: {
          participants: [
            { sourceId: RET, className: "Paladin", specName: "Retribution", absent: false },
            { sourceId: TANK, className: "Paladin", specName: "Protection", absent: false },
            { sourceId: 19, className: "Rogue", specName: "Assassination", absent: false },
            { sourceId: ARMS, className: "Warrior", specName: "Arms", absent: false },
          ],
        },
        expected: {
          analyzedCells: 1,
          cells: [
            { sourceId: RET, kind: "ANALYZED", specId: "paladin/retribution" },
            { sourceId: TANK, kind: "NOT_ANALYZED", status: "PROFILE_NOT_RESOLVED" },
            { sourceId: 19, kind: "NOT_ANALYZED", status: "PROFILE_NOT_RESOLVED" },
            { sourceId: ARMS, kind: "NOT_ANALYZED", status: "SPEC_NOT_SUPPORTED" },
          ],
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "All three public analyzers dispatch from one ingestion with no Retribution branch in the orchestration: each participant's cell is its own analyzer's truthful answer over a slice that describes actor 6 only, and the unsupported player costs nothing. Nothing is relabelled and no evidence is manufactured for the two Paladins' neighbour.",
    {
      limitations: [
        "The roster identities are the committed fight-context artifact's; the core is the Retribution 45 s slice, which describes actor 6 only, so no other participant can be ANALYZED over it.",
      ],
      related: ["tests/regression/m11a5-mixed-raid-night.test.ts"],
    },
  ),
  kase(
    "spec-retribution-paladin.the-second-subject-opener-is-the-fail-closed-population",
    RET_GTKB,
    "SPEC_RETRIBUTION_PALADIN",
    "src/specs/paladin/retribution/observed-analysis.ts; first-gcd-adapter.ts; holy-power.ts",
    "Over the 20 s opener of the second subject (gtKb fight 22 actor 23 — the same build as actor 6, main hand 237846 pinned two-handed, faction value 0 on the wire and not read) the evaluator finds 15 spender decisions and excludes 33 casts (24 NON_GCD, 9 outside the first slice); all 15 are UNKNOWN. Every decision lies inside the first Avenging Wrath or before Wake of Ashes, Divine Toll and Execution Sentence have an observed cast, so the root scan stops at generators[0] call_action_list for 14 and generators[2] divine_toll for 1. The first Final Verdict at 2,418,608 is a Divine Purpose free cast with no Holy Power on the wire.",
    [
      a("SPEC_RETRIBUTION_PALADIN.COVERAGE_SUMMARY", {
        actorId: RET_GTKB_ACTOR,
        expected: {
          eligibleDecisions: 15,
          match: 0,
          rejected: 0,
          unknown: 15,
          exclusions: { NON_GCD_ACTION: 24, OUTSIDE_FIRST_SLICE: 9 },
        },
      }),
      a("SPEC_RETRIBUTION_PALADIN.UNKNOWN_BLOCKER_DISTRIBUTION", {
        actorId: RET_GTKB_ACTOR,
        expected: {
          match: 0,
          rejected: 0,
          blockedAt: { "default[0] auto_attack": 15 },
          rootScanBlockedAt: { "generators[0] call_action_list": 14, "generators[2] divine_toll": 1 },
        },
      }),
      a("SPEC_RETRIBUTION_PALADIN.BUILD_RESOLUTION", {
        actorId: RET_GTKB_ACTOR,
        expected: { talents: RET_TALENTS, heroTree: "herald_of_the_sun", twoHandedWeaponItemId: 237846 },
      }),
      a("SPEC_RETRIBUTION_PALADIN.HOLY_POWER_OBSERVATION", {
        actorId: RET_GTKB_ACTOR,
        cast: { reportTimeMs: 2418608, abilityGameId: RET_FV },
        expected: RET_HP_NONE,
      }),
      a("SPEC_RETRIBUTION_PALADIN.NON_DOMAIN_ENTRIES", { actorId: RET_GTKB_ACTOR, expected: RET_NON_DOMAIN }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "A second real subject, a different report and boss, and the same rules: every decision the evidence cannot decide is UNKNOWN with its stopping point named, and nothing about the opener is scored. The domain boundary is the same list of entries for both subjects because it reads token categories, not the actor.",
    { authority: RET_GTKB_AUTHORITY, related: RET_RELATED },
  ),
];

// --------------------------------------------------------------------------
// M11-C4h (2026-09-27): the Protection Paladin DISCRIMINATION CONTROL. One
// DERIVED_FROM_CAPTURE copy of the 60–90 s segment with exactly one field of
// exactly one event changed — the Avenger's Shield cast at 2,074,381 re-labelled
// Divine Toll — and nothing else. The loader re-derives that one-field diff from
// the two committed payloads; the promotion gate counts the control's REJECTED
// for discrimination only, never as observed play.
// --------------------------------------------------------------------------

const PPB_CONTROL = "wcl-protection-paladin-a7r6-rotational-165s.seg-60-90.control-2074381-divine-toll";
const PPB_CONTROL_INDEX = 241;
{
  const parent = ARTIFACTS.find((entry) => entry.artifactId === PPB_60_90);
  if (parent === undefined) throw new Error(`no parent ${PPB_60_90}`);
  const control = artifact(PPB_CONTROL, wcl(PPB_CONTROL), {
    kind: "DERIVED_FROM_CAPTURE",
    parent: PPB_60_90,
    transformations: [
      {
        kind: "VALUE_MUTATION",
        tooling: tooling(
          SUBSTITUTION_TOOL,
          SUBSTITUTION_TOOL_REVISION,
          `node scripts/corpus/derive-substitution.mjs ${PPB_60_90}.json ${PPB_CONTROL}.json --substitute ${String(PPB_CONTROL_INDEX)} ${String(PP_AVENGERS_SHIELD)} ${String(PP_DIVINE_TOLL)}`,
        ),
        detail:
          "Event 241 of 827 — actor 7's Avenger's Shield cast at 2,074,381 (31935) — has its abilityGameID changed to Divine Toll (375576). Every other field of that event (its target, its resource snapshot, its position) and every other event are byte-for-byte the parent's, in the parent's order; the Grand Crusader removal the real Avenger's Shield consumed in the same millisecond is kept. The result is a cast that did NOT happen, over state that did.",
        invalidates: ["OBSERVED_BEHAVIOUR"],
      },
    ],
    grants: parent.provenance.retainedCoverage.grants,
    coverageBasis:
      "Exactly the parent's grants: the substitution changes one field of one event, so every retained family is as complete for actor 7 over the parent's range as it was — for the counterfactual cast stream the control describes. The loader refuses a substitution whose coverage differs from its parent's.",
    retainedFor:
      "M11-C4h: the Protection Paladin DISCRIMINATION control. The parent decision is a qualifying real MATCH (Avenger's Shield at 2,074,381 over the full Phase B bundle); with only the action changed, the same analysis over the same observed state must return REJECTED — the analyzer disagrees with an action its authority could not have selected. It is capability evidence for the promotion gate's discrimination half and never observed play.",
    limitations: [
      "Not evidence that actor 7 ever cast Divine Toll at 2,074,381; the cast there was Avenger's Shield.",
      "The world is not internally consistent by design: the Grand Crusader removal and the resource snapshot belong to the real Avenger's Shield. The control's claim rests on the pinned conditions of the substituted action's entries, which read none of them.",
      "Inherits every limitation of its parent.",
    ],
  });
  ARTIFACTS.push({
    ...control,
    provenance: {
      ...control.provenance,
      substitution: {
        kind: "SINGLE_CAST_ABILITY_SUBSTITUTION",
        eventIndex: PPB_CONTROL_INDEX,
        reportTimeMs: 2074381,
        sourceActorId: TANK,
        fromAbilityGameId: PP_AVENGERS_SHIELD,
        toAbilityGameId: PP_DIVINE_TOLL,
        basis:
          "Predeclared rule: over Protection's qualifying real MATCH decisions in report-time order (Divine Toll 2,026,655; Avenger's Shield 2,074,381; Divine Toll 2,088,835; Avenger's Shield 2,139,100), each paired with every other pinned GCD token in a fixed order, the first pair whose substituted token is APPLICABLE under the proven build and whose comparison resolves. At 2,026,655 every applicable substitute stays UNKNOWN (DIVERGENT_WORLDS) and only the build-background Hammer of Light and Hammer of the Righteous reject, which the rule refuses; at 2,074,381 Divine Toll is the first applicable substitute that resolves, and it is REJECTED. The full census is disclosed with the case.",
      },
    },
  });
}
const PPB_CONTROL_BUNDLE = {
  historyArtifactIds: [PP45, PPB_45_60, PPB_CONTROL, PPB_90_120],
  declaredHoles: [],
};
const PP_CONTROL_REJECTED = {
  outcome: "REJECTED",
  basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
  authorityCoverage: "UNKNOWN",
  authorityToken: null,
  selectionPrecision: null,
  decisiveBlocker: null,
  rawBlocker: "DIVERGENT_GCD_OUTCOMES",
  observedActionRejected: true,
};

const CASES = [
  // ---- M11-C4h: the Protection discrimination control ---------------------
  kase(
    "spec-protection-paladin.negative-control-divine-toll-substituted-at-2074381-is-rejected-on-real-state",
    PPB_120_165,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/observed-action-gate.ts proveObservedActionUnselectable; action-profile.ts resolveProtectionApplicability; tests/support/corpus/loader.ts (the substitution rule); tests/support/corpus/promotion-evidence.ts (the discrimination gate)",
    "The Phase B bundle with ONE part swapped for its substitution control: the Avenger's Shield cast at 2,074,381 — a real EXACT_ENTRY MATCH over the unmodified bundle — re-labelled Divine Toll, every other event observed. The only pinned Divine Toll entry, default[6] divine_toll,if=buff.avenging_wrath.up|(!talent.righteous_protector.enabled&cooldown.avenging_wrath.remains>30), is APPLICABLE for this build (not background) and FALSE in every world: the wings (Sentinel) buff is BOUND down from its observed removal at 2,048,248 and Righteous Protector is SELECTED. The unselectability proof therefore holds and the comparison is REJECTED, while the global scan itself stays undecided. Census over the four real MATCH decisions × every other pinned GCD token (36 substitutions): 10 REJECTED, 24 UNKNOWN, 2 MATCH; of the REJECTED, only the two Avenger's Shield → Divine Toll substitutions have an applicable substitute — the other eight are Hammer of Light (Templar-only) and Hammer of the Righteous (Blessed Hammer selected), background for this build.",
    [
      ppb_decision(PPB_CONTROL_BUNDLE, 2074381, PP_DIVINE_TOLL, PP_CONTROL_REJECTED),
      a("SPEC_PROTECTION_PALADIN.OBSERVED_TOKEN_APPLICABILITY", {
        actorId: TANK,
        ...PPB_CONTROL_BUNDLE,
        targetActorId: null,
        observedCast: { reportTimeMs: 2074381, abilityGameId: PP_DIVINE_TOLL },
        expected: {
          observedToken: "divine_toll",
          entries: [{ listName: "default", priorityOrdinal: 6, applicability: "APPLICABLE" }],
        },
      }),
      ppb_aura(
        PPB_CONTROL_BUNDLE,
        2074381,
        PP_DIVINE_TOLL,
        "avenging_wrath",
        ppb_bound(false, PP_SENTINEL, 2048248),
      ),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "A discrimination control, not observed play. MATCH over real state proves the analyzer is compatible with what was done; this proves that, on the SAME observed state, it rejects an action its authority could not have selected — the property a MATCH/UNKNOWN-only analyzer would lack. It rests on real state because the substituted action is applicable for the proven build and is refused by its pinned condition, not by being background.",
    {
      authority: PPB_AUTHORITY,
      related: [...PPB_RELATED, "tests/contracts/m11c4h-discrimination-gate.test.ts"],
    },
  ),
  // ---- SHARED_DECISION_ENGINE (M10-C correction 2) ----------------------
  kase(
    "shared-decision-engine.proven-higher-priority-entry-selects-definitely",
    SE,
    "SHARED_DECISION_ENGINE",
    "src/simc/nested-selection.ts resolveOneForegroundScan; src/simc/list-selection.ts evaluateCondition",
    "With buff.proc bound UP and high_priority proven usable, one foreground scan of `default` resolves DEFINITE to default[0] high_priority. The talent-gated and unconditional entries below it are unreachable and are not consulted.",
    [
      a("SHARED_DECISION_ENGINE.SCAN_SELECTS_DEFINITELY", {
        entryListName: "default",
        knownBuffs: [{ name: "proc", up: true }],
        knownTalents: [],
        provenUsableTokens: ["high_priority"],
        expected: se_entry("default", 0, "high_priority"),
      }),
    ],
    ["OWNED_CONTRACT"],
    "A SimulationCraft list is an ordered priority list: the first entry proven to fire is the answer. DEFINITE requires both a TRUE gate and proven usability, which is why the case states the usable token explicitly rather than letting the engine assume readiness.",
    {
      limitations: ["Synthetic authority; every premise is stated in the parameters."],
      related: SE_RELATED,
    },
  ),
  kase(
    "shared-decision-engine.undecided-higher-priority-entry-is-not-fallen-through",
    SE,
    "SHARED_DECISION_ENGINE",
    "src/simc/nested-selection.ts resolveOneForegroundScan; src/simc/list-selection.ts evaluateCondition (boolean world enumeration)",
    "With buff.proc UNBOUND, talent.opt bound NOT taken, and both high_priority and filler proven usable, the scan is AMBIGUOUS between default[0] high_priority (possible) and default[2] filler (definite). The proven lower-priority filler is NOT promoted to the answer because an undecided entry stands above it; the eliminated talent-gated entry is absent from the candidates.",
    [
      a("SHARED_DECISION_ENGINE.SCAN_UNDECIDED_BY_HIGHER_PRIORITY", {
        entryListName: "default",
        knownBuffs: [],
        knownTalents: [{ name: "opt", taken: false }],
        provenUsableTokens: ["high_priority", "filler"],
        expectedCandidates: [
          { ...se_entry("default", 0, "high_priority"), definite: false },
          { ...se_entry("default", 2, "filler"), definite: true },
        ],
      }),
    ],
    ["OWNED_CONTRACT"],
    "The priority short-circuit rule: uncertainty on a higher-priority line contaminates every lower-priority selection. An unbound buff is enumerated across both truth values, and the scan may only claim what holds in every world — which is that ONE of the two candidates fires, not which.",
    {
      limitations: ["Synthetic authority; every premise is stated in the parameters."],
      related: SE_RELATED,
    },
  ),
  kase(
    "shared-decision-engine.unsupported-expression-refuses-at-the-entry",
    SE,
    "SHARED_DECISION_ENGINE",
    "src/simc/expression/parse.ts (unsupported identifier); src/simc/nested-selection.ts UNSUPPORTED_AUTHORITY_EXPRESSION",
    "A scan of `unsupported` stops at unsupported[0] gated, whose condition names some.identifier.nobody.supports: the parser refuses the identifier, the scan is BLOCKED with UNSUPPORTED_AUTHORITY_EXPRESSION, the blocking entry's gate carries the refused fragment, and the unconditional filler below it is never selected.",
    [
      a("SHARED_DECISION_ENGINE.SCAN_REFUSES_UNSUPPORTED_EXPRESSION", {
        entryListName: "unsupported",
        knownBuffs: [],
        knownTalents: [],
        provenUsableTokens: ["gated", "filler"],
        expectedBlockedAt: se_entry("unsupported", 0, "gated"),
        expectedFragment: "some.identifier.nobody.supports",
      }),
    ],
    ["OWNED_CONTRACT"],
    "Unsupported SimulationCraft state fails closed. UNSUPPORTED never becomes false (which would fall through to filler) or true (which would select gated); the refusal carries the exact entry, and its gate the exact fragment, so the gap is nameable.",
    {
      limitations: ["Synthetic authority; every premise is stated in the parameters."],
      related: SE_RELATED,
    },
  ),

  // ---- SHARED_DECISION_ENGINE: run_action_list (M11-B1) -----------------
  kase(
    "shared-decision-engine.run-gate-false-skips-to-the-parents-next-entry",
    SER,
    "SHARED_DECISION_ENGINE",
    "src/simc/nested-selection.ts scanRunDispatch (RUN_GATE_FALSE_SKIPPED)",
    "With buff.gate bound DOWN, default[0]'s run_action_list gate is proven FALSE: the run entry is skipped like any not-ready entry, `child` is never entered, and the scan continues to default[1] parent_filler, which is proven usable and unconditional, so it is selected DEFINITE.",
    [
      a("SHARED_DECISION_ENGINE.SCAN_SELECTS_DEFINITELY", {
        entryListName: "default",
        knownBuffs: [{ name: "gate", up: false }],
        knownTalents: [{ name: "opt", taken: true }],
        provenUsableTokens: ["child_action", "parent_filler"],
        expected: se_entry("default", 1, "parent_filler"),
      }),
    ],
    ["PINNED_AUTHORITY", "OWNED_CONTRACT"],
    "player.cpp:14235 — an entry whose action_ready() is false is passed over and the loop reads the next ordinal. A run_action_list is no exception: its gate is its if_expr, and a FALSE gate means it is not returned, not executed and not entered.",
    { limitations: SER_LIMITS, related: SER_RELATED },
  ),
  kase(
    "shared-decision-engine.run-gate-true-transfers-selection-into-the-child",
    SER,
    "SHARED_DECISION_ENGINE",
    "src/simc/nested-selection.ts scanRunDispatch (RUN_ENTERED_SCAN_ENDS)",
    "With buff.gate UP and talent.opt taken, default[0]'s run gate is proven TRUE: selection transfers into `child`, whose child[0] child_action is TRUE and proven usable, so the scan resolves DEFINITE to child[0]. default[1] parent_filler — unconditional and usable — is below the run and is not part of this selection.",
    [
      a("SHARED_DECISION_ENGINE.SCAN_SELECTS_DEFINITELY", {
        entryListName: "default",
        knownBuffs: [{ name: "gate", up: true }],
        knownTalents: [{ name: "opt", taken: true }],
        provenUsableTokens: ["child_action", "parent_filler"],
        expected: se_entry("child", 0, "child_action"),
      }),
    ],
    ["PINNED_AUTHORITY", "OWNED_CONTRACT"],
    "player.cpp:14264-14267 returns a ready run_action_list as the selected action (it is not ACTION_CALL); action.cpp:4740-4754 activates the child at zero time; player.cpp:7376-7377 selects the next action from the child and player.cpp:7382-7386 restores the parent only afterwards. The selection that follows the run is the child's.",
    { limitations: SER_LIMITS, related: SER_RELATED },
  ),
  kase(
    "shared-decision-engine.run-child-that-selects-nothing-is-nothing-not-the-parent",
    SER,
    "SHARED_DECISION_ENGINE",
    "src/simc/nested-selection.ts scanRunDispatch (RUN_RETURNED_NO_ACTION_SCAN_ENDS)",
    "With buff.gate UP and talent.opt NOT taken, the run transfers into `child`, whose only entry is eliminated. The scan resolves NO_ACTION: the parent's default[1] parent_filler — unconditional and proven usable — is NOT fallen through to, and the visited entries are exactly default[0] and child[0].",
    [
      a("SHARED_DECISION_ENGINE.SCAN_SELECTS_NOTHING", {
        entryListName: "default",
        knownBuffs: [{ name: "gate", up: true }],
        knownTalents: [{ name: "opt", taken: false }],
        provenUsableTokens: ["child_action", "parent_filler"],
        expectedVisited: [se_entry("default", 0, "run_action_list"), se_entry("child", 0, "child_action")],
      }),
    ],
    ["PINNED_AUTHORITY", "OWNED_CONTRACT"],
    "The critical run/call distinction. After the run executes, the next select_action runs over the CHILD (player.cpp:7376-7377); if the child has no ready entry the selection is null and the player waits — the parent list is restored afterwards (7382-7386) and is not scanned from the run's next ordinal. Reading the parent's later entries would invent a selection the pinned loop never makes.",
    { limitations: SER_LIMITS, related: SER_RELATED },
  ),
  kase(
    "shared-decision-engine.call-child-that-selects-nothing-continues-the-parent",
    SER,
    "SHARED_DECISION_ENGINE",
    "src/simc/nested-selection.ts (CALL_RETURNED_NO_ACTION_CONTINUE) — the contrast to the run case",
    "The same bindings as the run case (buff.gate UP, talent.opt NOT taken) over `call_default`, which differs from `default` only in using call_action_list: the callee returns nothing, the caller CONTINUES at call_default[1] parent_filler, and the scan resolves DEFINITE to it. Same premises, opposite control flow, by construct.",
    [
      a("SHARED_DECISION_ENGINE.SCAN_SELECTS_DEFINITELY", {
        entryListName: "call_default",
        knownBuffs: [{ name: "gate", up: true }],
        knownTalents: [{ name: "opt", taken: false }],
        provenUsableTokens: ["child_action", "parent_filler"],
        expected: se_entry("call_default", 1, "parent_filler"),
      }),
    ],
    ["PINNED_AUTHORITY", "OWNED_CONTRACT"],
    "player.cpp:14255-14260 — ACTION_CALL recurses and returns the callee's action only if there is one; otherwise the loop falls out of the branch and continues. That fall-through belongs to call_action_list alone, and the pair of cases pins that the engine never aliases one construct to the other.",
    { limitations: SER_LIMITS, related: SER_RELATED },
  ),
  kase(
    "shared-decision-engine.undecided-run-gate-blocks-and-explores-no-world",
    SER,
    "SHARED_DECISION_ENGINE",
    "src/simc/nested-selection.ts scanRunDispatch (UNDECIDED_RUN_GATE)",
    "With buff.gate UNBOUND, default[0]'s run gate is neither proven TRUE nor proven FALSE. The scan is BLOCKED with UNDECIDED_RUN_GATE at default[0]; `child` is not entered and default[1] parent_filler is not visited. Neither the parent-continues world nor the child-replaces-parent world is explored.",
    [
      a("SHARED_DECISION_ENGINE.SCAN_BLOCKED_WITH", {
        entryListName: "default",
        knownBuffs: [],
        knownTalents: [{ name: "opt", taken: true }],
        provenUsableTokens: ["child_action", "parent_filler"],
        expectedBlocker: "UNDECIDED_RUN_GATE",
        expectedBlockedAt: se_entry("default", 0, "run_action_list"),
        expectedVisited: [se_entry("default", 0, "run_action_list")],
      }),
    ],
    ["OWNED_CONTRACT"],
    "Fail closed. An undecided run gate is not TRUE (which would select from the child), not FALSE (which would select parent_filler) and not absent. World-union semantics for run gates are deliberately deferred beyond M11-B1; until then the honest answer is that the scan cannot get past the entry.",
    { limitations: SER_LIMITS, related: SER_RELATED },
  ),
  kase(
    "shared-decision-engine.nested-run-transfers-selection-twice",
    SER,
    "SHARED_DECISION_ENGINE",
    "src/simc/nested-selection.ts scanRunDispatch (run -> run)",
    "Scanning `nested` with talent.opt taken: nested[0] runs `middle` unconditionally, middle[0] runs `child` unconditionally, and child[0] child_action is proven to fire. The scan resolves DEFINITE to child[0]; nested[1] parent_filler and middle[1] middle_filler are below their respective runs and are never consulted.",
    [
      a("SHARED_DECISION_ENGINE.SCAN_SELECTS_DEFINITELY", {
        entryListName: "nested",
        knownBuffs: [],
        knownTalents: [{ name: "opt", taken: true }],
        provenUsableTokens: ["child_action", "parent_filler", "middle_filler"],
        expected: se_entry("child", 0, "child_action"),
      }),
    ],
    ["PINNED_AUTHORITY", "OWNED_CONTRACT"],
    "Each run activates its child for the selection that follows (action.cpp:4740-4754; restore_action_list is set only once, to the outermost parent). Two runs in sequence are two transfers; the selection ends in the innermost child.",
    { limitations: SER_LIMITS, related: SER_RELATED },
  ),
  kase(
    "shared-decision-engine.run-cycle-fails-closed-under-the-active-stack-guard",
    SER,
    "SHARED_DECISION_ENGINE",
    "src/simc/nested-selection.ts scanList (CONTROL_FLOW_CYCLE through run lists)",
    "Scanning `cycle_a`: cycle_a[0] runs `cycle_b`, cycle_b[0] runs `cycle_a`, which is still on the active stack. The scan is BLOCKED with CONTROL_FLOW_CYCLE on re-entry (recorded before any entry of the re-entered list is read, so blockedAt is null), having visited cycle_a[0] and cycle_b[0].",
    [
      a("SHARED_DECISION_ENGINE.SCAN_BLOCKED_WITH", {
        entryListName: "cycle_a",
        knownBuffs: [],
        knownTalents: [],
        provenUsableTokens: [],
        expectedBlocker: "CONTROL_FLOW_CYCLE",
        expectedBlockedAt: null,
        expectedVisited: [
          se_entry("cycle_a", 0, "run_action_list"),
          se_entry("cycle_b", 0, "run_action_list"),
        ],
      }),
    ],
    ["OWNED_CONTRACT"],
    "The existing cycle policy, unchanged: a list re-entered while still on the call stack is refused. It applies to run edges exactly as to call edges, so mutually recursive run lists cannot recurse unboundedly. (The pinned swap_action_list_t::ready, action.cpp:4725-4731, would make a run into the already-active list not ready; blocking is the conservative reading of that.)",
    { limitations: SER_LIMITS, related: SER_RELATED },
  ),

  // ---- NORMALIZATION (M3) ------------------------------------------------
  kase(
    "normalization.no-actor-sentinel.source-absence",
    "wcl-no-actor-sentinel-source",
    "NORMALIZATION",
    "src/engine/normalization/raw-event-fields.ts NO_ACTOR_SENTINEL; src/engine/normalization/event-normalizer.ts source reading",
    "Real enemy-environment damage carrying sourceID -1 normalizes to a null source with the NO_ACTOR_SENTINEL reason, and no ActorRef -1 is ever minted. The four events also share one timestamp, so the count check doubles as proof that equal timestamps are not collapsed.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 4 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.TIMESTAMP_RUN_RETAINED", { reportTimeMs: 7551049, count: 4 }),
      a("NORMALIZATION.SOURCE_ABSENCE", { selector: { kind: "EVERY_EVENT" }, absence: "NO_ACTOR_SENTINEL" }),
      a("NORMALIZATION.NO_ACTOR_REF_HOLDS", { actorId: -1 }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "The -1 sentinel contract is owned by the normalization layer and is evidence-backed: the mid-fight window capture carries 92 events with sourceID -1 and 117 with targetID -1, including environment damage with no stated source. Reading -1 as an actor id would mint a well-formed actor that exists nowhere in master data.",
    {
      limitations: [
        "Says nothing about negative values other than -1; that is the derived case's job.",
        "gameVersion 1 / logVersion 17 only.",
      ],
      related: [
        "tests/regression/actor-sentinels-never-become-actors.test.ts",
        "tests/regression/ingestion-preserves-event-order.test.ts",
      ],
    },
  ),
  kase(
    "normalization.unobserved-negative-source-is-unusable-not-sentinel",
    "wcl-no-actor-sentinel-source.unusable-negative",
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts actor-side reading; ActorAbsence UNUSABLE_VALUE",
    "A negative source id that is not the verified sentinel is recorded as UNUSABLE_VALUE — neither an actor nor a 'no actor' statement — while the untouched sentinel events in the same payload keep their NO_ACTOR_SENTINEL meaning.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 4 }),
      a("NORMALIZATION.SOURCE_ABSENCE", {
        selector: { kind: "RAW_INDEX", index: 0 },
        absence: "UNUSABLE_VALUE",
      }),
      a("NORMALIZATION.SOURCE_ABSENCE", {
        selector: { kind: "RAW_INDEX", index: 1 },
        absence: "NO_ACTOR_SENTINEL",
      }),
      a("NORMALIZATION.NO_ACTOR_REF_HOLDS", { actorId: -5 }),
    ],
    ["OWNED_CONTRACT"],
    "No evidence supports generalising -1's meaning. The normalization layer therefore records an unobserved negative as something it cannot interpret, and refuses to build an actor from it. The artifact is DERIVED: the -5 is constructed, and the case claims only how the layer treats it, not that it occurs.",
    {
      limitations: [
        "The mutated event was never observed; this is a rule-of-the-layer claim, not a capture claim.",
      ],
      related: ["tests/regression/actor-sentinels-never-become-actors.test.ts"],
    },
  ),
  kase(
    "normalization.target-sentinel-and-input-order.midfight-window",
    "wcl-midfight-window",
    "NORMALIZATION",
    "src/engine/normalization/supported-families.ts; raw-event-fields.ts VERIFIED_DIRECTION_FIELDS and NO_ACTOR_SENTINEL",
    "Every raw type in the mid-fight window is an evidence-backed contract; captured order and same-millisecond runs survive normalization; a begincast whose targetID is -1 gets a null target with the sentinel reason while its source stays a real actor carrying its sourceInstance (50, instance 28); and a removebuff carries SOURCE 11 and TARGET 18 read from the verified field names, never swapped.",
    [
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 59 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.TIMESTAMP_RUN_RETAINED", { reportTimeMs: 7550085, count: 6 }),
      a("NORMALIZATION.SIDE_REFERENCE", {
        index: 6,
        side: "TARGET",
        expected: { kind: "ABSENT", absence: "NO_ACTOR_SENTINEL" },
      }),
      a("NORMALIZATION.SIDE_REFERENCE", {
        index: 6,
        side: "SOURCE",
        expected: { kind: "ACTOR", actorId: 50, instanceId: 28 },
      }),
      a("NORMALIZATION.SIDE_REFERENCE", {
        index: 16,
        side: "SOURCE",
        expected: { kind: "ACTOR", actorId: 11, instanceId: null },
      }),
      a("NORMALIZATION.SIDE_REFERENCE", {
        index: 16,
        side: "TARGET",
        expected: { kind: "ACTOR", actorId: 18, instanceId: null },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "supported-families.ts recognises only raw types that appear in a committed capture, and this slice is one of the two the registry cites. Direction is read from the verified field names (sourceID/targetID), which the captures established; a removebuff from 11 on 18 is 11's aura leaving 18, and nothing infers the reverse.",
    {
      related: [
        "tests/unit/supported-families.test.ts",
        "tests/regression/actor-sentinels-never-become-actors.test.ts",
        "tests/regression/m4-aura-state-never-inverts-direction.test.ts",
      ],
    },
  ),
  kase(
    "normalization.pull-window.families-and-attached-resource-side",
    "wcl-pull-window-with-resources",
    "NORMALIZATION",
    "src/engine/normalization/supported-families.ts; event-normalizer.ts attached resources (resourceActor)",
    "The pull window — the only committed evidence for the flattened resourceActor attachment — normalizes with every family recognised, and each attached snapshot binds to the side resourceActor names: 2 is the TARGET's snapshot (a boss's health on a player's damage event), 1 is the SOURCE's. An event with no resourceActor carries no attachment.",
    [
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 43 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ATTACHED_RESOURCE_SIDE", { index: 7, expectedSide: "TARGET" }),
      a("NORMALIZATION.ATTACHED_RESOURCE_SIDE", { index: 8, expectedSide: "SOURCE" }),
      a("NORMALIZATION.ATTACHED_RESOURCE_SIDE", { index: 17, expectedSide: "SOURCE" }),
      a("NORMALIZATION.ATTACHED_RESOURCE_SIDE", { index: 0, expectedSide: "NONE" }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "The capture established that resource snapshots are FLATTENED onto the event with resourceActor saying which side they describe (1 = source, 2 = target); there is no sourceResources/targetResources object. Attributing a target-side snapshot to the source would hand a player the boss's health.",
    {
      related: [
        "tests/regression/attached-resources-keep-their-side.test.ts",
        "tests/unit/supported-families.test.ts",
      ],
    },
  ),
  kase(
    "normalization.boss-sourced-events-survive-the-unfiltered-stream",
    "wcl-boss-sourced",
    "NORMALIZATION",
    "src/wcl/retrieval-plan.ts (one dataType: All stream, no actor filter); event-normalizer.ts source reading",
    "Enemy-sourced events are ordinary events with a real source actor. The unfiltered All stream carries them, and normalization binds actor 160 as the source of each without special-casing hostility.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 4 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.SIDE_REFERENCE", {
        index: 0,
        side: "SOURCE",
        expected: { kind: "ACTOR", actorId: 160, instanceId: null },
      }),
      a("NORMALIZATION.SIDE_REFERENCE", {
        index: 3,
        side: "SOURCE",
        expected: { kind: "ACTOR", actorId: 160, instanceId: null },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "M3 ingests exactly one dataType: All stream with no actor filter because environment and enemy evidence is what actionability depends on; the source window held 202 boss-sourced events alongside 4,339 others, and this slice is four of them.",
    { related: ["tests/contracts/retrieval-plan.test.ts"] },
  ),
  kase(
    "normalization.actor-zero-is-an-ordinary-actor",
    "synthetic.actor-zero-cast",
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts actor-side reading",
    "Actor id 0 is a real id: nothing rules it out, so a cast with sourceID 0 binds a source actor 0 rather than reading as absence. Its targetID -1 is still the sentinel.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 1 }),
      a("NORMALIZATION.SIDE_REFERENCE", {
        index: 0,
        side: "SOURCE",
        expected: { kind: "ACTOR", actorId: 0, instanceId: null },
      }),
      a("NORMALIZATION.SIDE_REFERENCE", {
        index: 0,
        side: "TARGET",
        expected: { kind: "ABSENT", absence: "NO_ACTOR_SENTINEL" },
      }),
    ],
    ["OWNED_CONTRACT"],
    "A truthiness check on the actor id would drop actor 0 into absence. The layer's rule is that only the verified -1 sentinel and a missing key mean 'no actor'; every other integer is an id.",
    {
      limitations: ["Synthetic input: no committed capture contains actor 0."],
      related: ["tests/regression/actor-sentinels-never-become-actors.test.ts"],
    },
  ),
  kase(
    "normalization.unrecognised-type-is-counted-not-dropped",
    "synthetic.unsupported-type-event",
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts UNSUPPORTED_TYPE / UNKNOWN_EVENT_TYPE",
    "An event whose type string no evidence-backed contract recognises is preserved as an UNSUPPORTED_TYPE event and counted under its verbatim type string. It is not dropped, and it is not coerced into a known family.",
    [a("NORMALIZATION.UNSUPPORTED_TYPE_COUNTED", { rawType: "synthetic_unsupported_type", count: 1 })],
    ["OWNED_CONTRACT"],
    "Only evidence-backed types are contracted (supported-families.ts). Anything else must fail closed as explicitly unsupported rather than disappear, because a dropped event would read downstream as an event that never happened.",
    {
      limitations: ["Synthetic input. Proves the path, not any real Warcraft Logs type."],
      related: ["tests/unit/supported-families.test.ts", "tests/unit/event-normalizer.test.ts"],
    },
  ),
  kase(
    "normalization.assassination-slices-normalize-cleanly",
    D2,
    "NORMALIZATION",
    "src/engine/normalization/supported-families.ts; event-normalizer.ts",
    "The largest committed slice — 1,083 events including a full combatantinfo with gear and a 76-entry talent tree — normalizes with every family recognised, nothing dropped, and captured order intact, including the eight events sharing Q's millisecond with the Garrote cast FIRST.",
    [
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 1083 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.TIMESTAMP_RUN_RETAINED", { reportTimeMs: Q, count: 8 }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "At Q the cast shares a timestamp with seven consequences and Warcraft Logs returns the cast first; the first C3a capture sorted by timestamp and got the DoT remainder wrong by 12 seconds. Order within a millisecond is evidence, and the normalizer must carry it through unchanged.",
    {
      related: [
        "tests/regression/ingestion-preserves-event-order.test.ts",
        "tests/regression/m5c3a-garrote-remains-and-core-dot.test.ts",
      ],
    },
  ),

  // ---- WCL_TRANSPORT (M3) -------------------------------------------------
  kase(
    "wcl-transport.null-event-data-is-malformed-not-empty",
    "synthetic.graphql-event-page-null-data",
    "WCL_TRANSPORT",
    "src/wcl/events-query.ts decodeEventPage",
    "A ReportEventPaginator whose data is null decodes to MALFORMED_PAGINATOR. 'We could not read your events' must never become 'you produced no events'.",
    [a("WCL_DECODE.EVENT_PAGE_OUTCOME", { expected: "MALFORMED_PAGINATOR" })],
    ["OWNED_CONTRACT"],
    "The decoder owns the classification and documents it in place: data: JSON is nullable upstream, and a null or non-array payload is a malformed page, never an empty one.",
    {
      limitations: [
        "Exercises the decoder over a decoded data object, not a raw HTTP body; transport-level parsing failures are a separate boundary.",
      ],
      related: ["tests/unit/wcl-paginator.test.ts"],
    },
  ),
  kase(
    "wcl-transport.cursor-is-passed-verbatim-and-nothing-is-deduplicated",
    "synthetic.graphql-page-sequence-two-pages",
    "WCL_TRANSPORT",
    "src/wcl/paginator.ts paginateEventStream",
    "The paginator requests page 2 at exactly the nextPageTimestamp page 1 returned (1500, no offset), stops on the terminal page, reports COMPLETE, and retrieves 4 events although two of them are identical in every observable field.",
    [
      a("WCL_PAGINATION.STREAM_OUTCOME", {
        plan: { startTimeMs: 1000, endTimeMs: 5000, limit: 100 },
        expected: {
          state: "COMPLETE",
          reason: "COMPLETED_NORMALLY",
          pagesRetrieved: 2,
          eventsRetrieved: 4,
          requestedStartTimes: [1000, 1500],
        },
      }),
    ],
    ["OWNED_CONTRACT"],
    "The paginator's three rules: the cursor is passed back VERBATIM as the next startTime because the schema documents it as exactly that; nothing is deduplicated because multiple legitimate events can share every field; there is no page-level retry.",
    {
      limitations: ["Synthetic pages. A real report's page boundary has not been captured into the corpus."],
      related: ["tests/unit/wcl-paginator.test.ts"],
    },
  ),
  kase(
    "wcl-transport.malformed-later-page-keeps-earlier-evidence-and-stays-partial",
    "synthetic.graphql-page-sequence-malformed-second-page",
    "WCL_TRANSPORT",
    "src/wcl/paginator.ts paginateEventStream; events-query.ts decodeEventPage",
    "When page 2 carries data: null, the stream ends PARTIAL with MALFORMED_PAGE, the 2 events of page 1 are kept, and nothing is retried.",
    [
      a("WCL_PAGINATION.STREAM_OUTCOME", {
        plan: { startTimeMs: 1000, endTimeMs: 5000, limit: 100 },
        expected: {
          state: "PARTIAL",
          reason: "MALFORMED_PAGE",
          pagesRetrieved: 1,
          eventsRetrieved: 2,
          requestedStartTimes: [1000, 1500],
        },
      }),
    ],
    ["OWNED_CONTRACT"],
    "Every abnormal ending preserves what was already retrieved and records why it stopped. A failed page never becomes an empty period, which is the rule that keeps a 30-second retrieval gap from becoming 'you were idle for 30 seconds'.",
    { related: ["tests/unit/wcl-paginator.test.ts"] },
  ),

  // ---- COMBAT_STATE (M4) --------------------------------------------------
  kase(
    "combat-state.partial-grant-cannot-prove-absence-before-it-begins",
    D2,
    "COMBAT_STATE",
    "src/engine/state/state-result.ts gateAbsenceClaim (classifyCoverage must be COMPLETE, not merely non-ABSENT)",
    "The D2 slice's CASTS grant for actor 19 begins at 2,164,325, but the fight it builds begins at the pull combatantinfo at 2,004,589. Actor 19 never casts Shiv (5938) in the slice. Asked for their last completed Shiv over the whole window, the state layer must answer UNKNOWN for INSUFFICIENT_COVERAGE: the interval [2,004,589 .. 2,164,325) is uncovered, so coverage over the asked range is PARTIAL, and PARTIAL is not enough to say 'never'.",
    [
      a("COMBAT_STATE.LAST_OBSERVED_CAST_UNKNOWN", {
        actorId: 19,
        abilityGameId: 5938,
        reason: "INSUFFICIENT_COVERAGE",
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Added by M9-C's mutation proof: relaxing the absence gate from 'COMPLETE' to 'not ABSENT' passed every other corpus case, because every other absence question over a granted artifact ranged exactly over its grant. This case ranges over a real 160-second uncovered prefix. CLAUDE.md: partial event retrieval does NOT mean the player performed no events during the missing interval.",
    {
      limitations: [
        "Shiv is chosen because actor 19 casts it nowhere in the slice; the case says nothing about whether Shiv was cast in the uncovered interval, which is exactly the point.",
      ],
      related: ["tests/regression/m4-state-never-invents-absence.test.ts"],
    },
  ),
  kase(
    "combat-state.trimmed-slice-cannot-prove-absence",
    "wcl-no-actor-sentinel-source",
    "COMBAT_STATE",
    "src/engine/state/state-result.ts gateAbsenceClaim; src/engine/state/combat-state.ts lastObservedCast",
    "A sanitized slice whose SUBSET_SELECTION retained no coverage cannot prove that an actor never cast anything. Asked for actor 14's last completed cast over the whole window, the state layer must answer UNKNOWN for INSUFFICIENT_COVERAGE — never EXACT null, which would be a proven absence manufactured from trimming.",
    [
      a("COMBAT_STATE.LAST_OBSERVED_CAST_UNKNOWN", {
        actorId: 14,
        abilityGameId: null,
        reason: "INSUFFICIENT_COVERAGE",
      }),
    ],
    ["OWNED_CONTRACT"],
    "Absence claims are gated on COMPLETE coverage of the interval (state-result.ts). The harness grants coverage only from the artifact's retainedCoverage grants, which are empty because the transformation record says so. CLAUDE.md: partial event retrieval does NOT mean the player performed no events during the missing interval.",
    {
      limitations: [
        "Pins the reason INSUFFICIENT_COVERAGE, which presumes the CASTS category is OBSERVABLE from captures. If the harness ever stopped granting capability to captures the reason would move to CAPABILITY_UNVERIFIED, and this case should fail so the change is reviewed.",
      ],
      related: ["tests/regression/m4-state-never-invents-absence.test.ts"],
    },
  ),
  kase(
    "combat-state.costed-cast-resource-is-pre-cost",
    "wcl-cast-resource-pre-cost",
    "COMBAT_STATE",
    "src/engine/resources/resource-observations.ts timing; src/engine/resources/resource-state.ts observationOnEvent",
    "The resource snapshot attached to a costed COMPLETE cast is tagged PRE_COST with amount, max and cost preserved verbatim; an uncosted cast on the same actor stays EVENT_ASSOCIATED with a null cost. The finisher's 7/7 costing 7 is the cap-bounded falsifier of the post-cost reading.",
    [
      a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
        actorId: 19,
        abilityGameId: ENVENOM,
        reportTimeMs: 2175585,
        resourceWireType: 4,
        expected: {
          certainty: "EXACT",
          observedAmount: 7,
          observedMax: 7,
          observedCost: 7,
          timing: "PRE_COST",
        },
      }),
      a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
        actorId: 12,
        abilityGameId: 116858,
        reportTimeMs: 2175128,
        resourceWireType: 7,
        expected: {
          certainty: "EXACT",
          observedAmount: 50,
          observedMax: 50,
          observedCost: 20,
          timing: "PRE_COST",
        },
      }),
      a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
        actorId: 19,
        abilityGameId: GARROTE,
        reportTimeMs: 2182589,
        resourceWireType: 3,
        expected: {
          certainty: "EXACT",
          observedAmount: 195,
          observedMax: 250,
          observedCost: 45,
          timing: "PRE_COST",
        },
      }),
      a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
        actorId: 19,
        abilityGameId: MELEE,
        reportTimeMs: 2182589,
        resourceWireType: 3,
        expected: {
          certainty: "EXACT",
          observedAmount: 150,
          observedMax: 250,
          observedCost: null,
          timing: "EVENT_ASSOCIATED",
        },
      }),
    ],
    ["VALIDATED_EVIDENCE", "OWNED_CONTRACT"],
    "amount == max while cost > 0 is decided from one event with no arithmetic: a post-cost reading would require holding max + cost, above the cap. The wider investigation behind the fixture found 126 cap-bounded falsifiers and zero counterexamples across 423 costed entries in two reports.",
    {
      limitations: [
        "Establishes PRE_COST for costed COMPLETE casts only. resourcechange stays EVENT_ASSOCIATED because its evidence rests on same-timestamp adjacency.",
        "Does not make the post-cost amount knowable.",
        "gameVersion 1 / logVersion 17 only.",
      ],
      related: ["tests/unit/cast-resource-pre-cost-contract.test.ts"],
    },
  ),
  kase(
    "combat-state.rage-focus-and-fury-snapshots-on-costed-casts-are-pre-cost",
    "wcl-rage-fury-focus-pre-cost",
    "COMBAT_STATE",
    "src/engine/resources/resource-observations.ts timing; src/engine/resources/resource-state.ts observationOnEvent; src/data/wcl-wire/resource-types.ts (RAGE, FOCUS, FURY)",
    "Each retained cast's own snapshot is EXACT and PRE_COST with amount, max and cost verbatim, for Rage (wire type 1, tenths), Focus (wire type 2) and Fury (wire type 17). Mortal Strike's 1300/1300 costing 300 and Kill Command's 100/100 costing 30 are the cap-bounded falsifiers of a post-cost reading; every cost equals its spell's pinned DBC _cost.",
    [
      a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
        actorId: 4,
        abilityGameId: 845,
        reportTimeMs: 2006029,
        resourceWireType: 1,
        expected: {
          certainty: "EXACT",
          observedAmount: 464,
          observedMax: 1300,
          observedCost: 200,
          timing: "PRE_COST",
        },
      }),
      a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
        actorId: 4,
        abilityGameId: 12294,
        reportTimeMs: 2012524,
        resourceWireType: 1,
        expected: {
          certainty: "EXACT",
          observedAmount: 1300,
          observedMax: 1300,
          observedCost: 300,
          timing: "PRE_COST",
        },
      }),
      a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
        actorId: 20,
        abilityGameId: 34026,
        reportTimeMs: 2007928,
        resourceWireType: 2,
        expected: {
          certainty: "EXACT",
          observedAmount: 100,
          observedMax: 100,
          observedCost: 30,
          timing: "PRE_COST",
        },
      }),
      a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
        actorId: 20,
        abilityGameId: 193455,
        reportTimeMs: 2010916,
        resourceWireType: 2,
        expected: {
          certainty: "EXACT",
          observedAmount: 98,
          observedMax: 100,
          observedCost: 35,
          timing: "PRE_COST",
        },
      }),
      a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
        actorId: 18,
        abilityGameId: 198013,
        reportTimeMs: 2008277,
        resourceWireType: 17,
        expected: {
          certainty: "EXACT",
          observedAmount: 44,
          observedMax: 170,
          observedCost: 30,
          timing: "PRE_COST",
        },
      }),
      a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
        actorId: 18,
        abilityGameId: 201427,
        reportTimeMs: 2012753,
        resourceWireType: 17,
        expected: {
          certainty: "EXACT",
          observedAmount: 109,
          observedMax: 170,
          observedCost: 40,
          timing: "PRE_COST",
        },
      }),
    ],
    ["VALIDATED_EVIDENCE", "OWNED_CONTRACT"],
    "amount == max while cost > 0 is decided from one event with no arithmetic (a post-cost reading would require holding max + cost, above the cap). The cost-equals-DBC check is what ties each wire encoding to power_type_data.inc's divisor; the contract test re-checks it against the pinned rows.",
    {
      limitations: [
        "Establishes exact own-cast PRE_COST observations only. No Rage, Focus or Fury state between casts is established, and none is modelled.",
        "Focus evidence is own-cast snapshots only; standalone Hunter resource changes are not used (D2-A3).",
        "gameVersion 1 / logVersion 17 only.",
      ],
      related: [
        "tests/unit/m11d2a1-resource-unit-scale.test.ts",
        "tests/unit/m11d2a2-own-cast-rage-fury-focus.test.ts",
      ],
    },
  ),
  kase(
    "combat-state.cross-actor-resource-changes-belong-to-the-pool-they-describe",
    "wcl-resource-change-pool-ownership",
    "COMBAT_STATE",
    "src/engine/resources/resource-observations.ts standaloneChangeOwnershipOf, buildResourceIndexes; src/engine/resources/resource-state.ts standaloneChangePositionsFor",
    "A Hunter-sourced change to each pet's Focus is owned by that pet — read from the target-side Focus snapshot the event carries — and is indexed under the pet, never under the Hunter; the same ability's change to the Hunter's own Focus is the Hunter's. A cross-actor Mana change whose snapshot carries no Mana entry is owned by nobody and indexed under nobody. Every source stays the actor that caused the change.",
    [
      a("COMBAT_STATE.RESOURCE_CHANGE_POOL_OWNER", {
        reportTimeMs: 2015438,
        sourceActorId: 20,
        targetActorId: 38,
        resourceWireType: 2,
        expected: { state: "RESOLVED", ownerActorId: 38, basis: "ATTACHED_CHANGED_POOL" },
      }),
      a("COMBAT_STATE.RESOURCE_CHANGE_POOL_OWNER", {
        reportTimeMs: 2015438,
        sourceActorId: 20,
        targetActorId: 30,
        resourceWireType: 2,
        expected: { state: "RESOLVED", ownerActorId: 30, basis: "ATTACHED_CHANGED_POOL" },
      }),
      a("COMBAT_STATE.RESOURCE_CHANGE_POOL_OWNER", {
        reportTimeMs: 2015438,
        sourceActorId: 20,
        targetActorId: 29,
        resourceWireType: 2,
        expected: { state: "RESOLVED", ownerActorId: 29, basis: "ATTACHED_CHANGED_POOL" },
      }),
      a("COMBAT_STATE.RESOURCE_CHANGE_POOL_OWNER", {
        reportTimeMs: 2015438,
        sourceActorId: 20,
        targetActorId: 20,
        resourceWireType: 2,
        expected: { state: "RESOLVED", ownerActorId: 20, basis: "ATTACHED_CHANGED_POOL" },
      }),
      a("COMBAT_STATE.RESOURCE_CHANGE_POOL_OWNER", {
        reportTimeMs: 2009098,
        sourceActorId: 10,
        targetActorId: 16,
        resourceWireType: 0,
        expected: {
          state: "UNRESOLVED",
          reason: "ATTACHMENT_LACKS_CHANGED_TYPE",
          candidateActorIds: [10, 16],
        },
      }),
    ],
    ["VALIDATED_EVIDENCE", "OWNED_CONTRACT"],
    "The discriminating fact is on the events themselves: the pets' events report waste 3 at a Focus snapshot of 100/100, while the Hunter's own event at the same millisecond reports 70/100 and waste 0, so the pets' changes cannot have been to the Hunter's pool. Before M11-D2-A3 all four were filed under the Hunter by source.",
    {
      limitations: [
        "Ownership of standalone changes only. No resource carry, regeneration or pet state is established.",
        "gameVersion 1 / logVersion 17 only.",
      ],
      related: ["tests/unit/m11d2a3-resource-pool-ownership.test.ts"],
    },
  ),
  kase(
    "combat-state.cross-actor-resource-changes-without-a-snapshot-stay-unowned",
    "wcl-pet-sourced-events-hunter-pet-29",
    "COMBAT_STATE",
    "src/engine/resources/resource-observations.ts standaloneChangeOwnershipOf, buildResourceIndexes",
    "The four Hunter-to-pet Focus changes of a capture taken without resources carry no resourceActor snapshot: nothing on the event names the changed pool, so each is UNRESOLVED and indexed under neither the Hunter nor the pet — never defaulted to the source.",
    [
      a("COMBAT_STATE.RESOURCE_CHANGE_POOL_OWNER", {
        reportTimeMs: 2164982,
        sourceActorId: 20,
        targetActorId: 29,
        resourceWireType: 2,
        expected: { state: "UNRESOLVED", reason: "NO_ATTACHED_POOL", candidateActorIds: [20, 29] },
      }),
      a("COMBAT_STATE.RESOURCE_CHANGE_POOL_OWNER", {
        reportTimeMs: 2167913,
        sourceActorId: 20,
        targetActorId: 29,
        resourceWireType: 2,
        expected: { state: "UNRESOLVED", reason: "NO_ATTACHED_POOL", candidateActorIds: [20, 29] },
      }),
      a("COMBAT_STATE.RESOURCE_CHANGE_POOL_OWNER", {
        reportTimeMs: 2170373,
        sourceActorId: 20,
        targetActorId: 29,
        resourceWireType: 2,
        expected: { state: "UNRESOLVED", reason: "NO_ATTACHED_POOL", candidateActorIds: [20, 29] },
      }),
      a("COMBAT_STATE.RESOURCE_CHANGE_POOL_OWNER", {
        reportTimeMs: 2174904,
        sourceActorId: 20,
        targetActorId: 29,
        resourceWireType: 2,
        expected: { state: "UNRESOLVED", reason: "NO_ATTACHED_POOL", candidateActorIds: [20, 29] },
      }),
    ],
    ["VALIDATED_EVIDENCE", "OWNED_CONTRACT"],
    "Fail closed: the capture's query did not request resources, so the event carries source and target and nothing more. That a pet's owner caused a change is not evidence of whose pool it changed.",
    {
      limitations: ["gameVersion 1 / logVersion 17 only."],
      related: ["tests/unit/m11d2a3-resource-pool-ownership.test.ts"],
    },
  ),
  kase(
    "combat-state.same-actor-resource-changes-keep-their-owner",
    "wcl-midfight-window",
    "COMBAT_STATE",
    "src/engine/resources/resource-observations.ts standaloneChangeOwnershipOf, buildResourceIndexes",
    "A standalone change whose source and target are one actor is that actor's, even with no snapshot on the event: both sides name the same actor. These three changes (Holy Power for actors 1 and 5, type 16 for actor 3) are indexed exactly where the source-keyed index filed them before M11-D2-A3.",
    [
      a("COMBAT_STATE.RESOURCE_CHANGE_POOL_OWNER", {
        reportTimeMs: 7550183,
        sourceActorId: 3,
        targetActorId: 3,
        resourceWireType: 16,
        expected: { state: "RESOLVED", ownerActorId: 3, basis: "SAME_ACTOR_BOTH_SIDES" },
      }),
      a("COMBAT_STATE.RESOURCE_CHANGE_POOL_OWNER", {
        reportTimeMs: 7550183,
        sourceActorId: 1,
        targetActorId: 1,
        resourceWireType: 9,
        expected: { state: "RESOLVED", ownerActorId: 1, basis: "SAME_ACTOR_BOTH_SIDES" },
      }),
      a("COMBAT_STATE.RESOURCE_CHANGE_POOL_OWNER", {
        reportTimeMs: 7550183,
        sourceActorId: 5,
        targetActorId: 5,
        resourceWireType: 9,
        expected: { state: "RESOLVED", ownerActorId: 5, basis: "SAME_ACTOR_BOTH_SIDES" },
      }),
    ],
    ["VALIDATED_EVIDENCE", "OWNED_CONTRACT"],
    "The same-actor control: the correction moves no change whose source and target agree.",
    {
      limitations: ["gameVersion 1 / logVersion 17 only."],
      related: ["tests/unit/m11d2a3-resource-pool-ownership.test.ts"],
    },
  ),
  kase(
    "combat-state.resources-are-observed-never-regenerated",
    "wcl-cast-resource-pre-cost",
    "COMBAT_STATE",
    "src/engine/resources/resource-state.ts latestObservedAtOrBefore",
    "Asked for actor 19's Energy 4.4 seconds after the last observation, the state layer returns that observation STALE with its own amount (250) and its own time — not a regenerated figure, not an interpolation, and not 250 minus the 35 the finisher cost.",
    [
      a("COMBAT_STATE.LATEST_RESOURCE_OBSERVATION", {
        actorId: 19,
        resourceWireType: 3,
        at: end_of(2180000),
        expected: { certainty: "STALE", observedAmount: 250, observedAtReportTimeMs: 2175585 },
      }),
    ],
    ["OWNED_CONTRACT"],
    "The resource surface is an observation layer, not a simulator: no passive regeneration, no interpolation, no replay of a cost or a delta onto an earlier amount. STALE carries the age so a caller can see the gap it is being asked to tolerate.",
    { related: ["tests/regression/m4-resource-state-is-never-simulated.test.ts"] },
  ),
  kase(
    "combat-state.a-resourcechange-attachment-of-the-changed-type-is-the-post-change-amount",
    BLOOD45,
    "COMBAT_STATE",
    "src/engine/resources/resource-observations.ts timingOf (POST_CHANGE); resource-state.ts observationOnEvent, standaloneChangeOnEvent",
    "M11-B5 settled the resourcechange attachment contract by whole-window reconciliation over actor 14's Runic Power (wire type 6, amounts in tenths, deltas in whole points): over the 45 s slice's 172 type-6 observations, carrying the latest READ amount forward — each of the 89 POST_CHANGE attachments REPLACING it, each costed cast leaving it unread until the next observation — reproduces all 16 later Death Strike PRE_COST amounts and all 58 later uncosted attachments with zero hidden changes. The delta is compared beside each attachment only to classify it: 73 integer gains sum exactly, 5 cap events read the reported max (1,250), and 4 Anti-Magic Shell gains show a rounded delta beside an exact attachment (610 + 0 -> 617). A pre-change reading matches none of them.",
    [
      a("COMBAT_STATE.RESOURCE_CHANGE_POST_CHANGE_CONTRACT", {
        actorId: BLOOD,
        resourceWireType: 6,
        deltaScale: 10,
        expected: {
          observations: 172,
          postChange: 89,
          integerReconciled: 73,
          capEvents: 5,
          deltaRoundedAttachmentExact: 4,
          preCostMatches: 16,
          uncostedMatches: 58,
          hiddenChangeMismatches: 0,
          maxValues: [1250],
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "POST_CHANGE is an OBSERVED state, read off the wire, on exactly one attachment shape. The delta beside it is a rounded number where the game moved a fraction; nothing anywhere adds it to a prior amount, and the reconciliation here is validation of the contract from later observations, never an input to an earlier state.",
    {
      related: [
        "tests/unit/m11b5-resource-post-change-contract.test.ts",
        "tests/unit/m11b5-resource-history.test.ts",
      ],
    },
  ),
  kase(
    "combat-state.the-opener-reconciles-the-same-way",
    BLOOD_GTKB,
    "COMBAT_STATE",
    "src/engine/resources/resource-observations.ts timingOf (POST_CHANGE)",
    "A second report, pull and boss: 84 type-6 observations, 45 POST_CHANGE attachments, 38 integer gains, no cap, 5 Anti-Magic Shell gains with a rounded delta and an exact attachment, 6 later PRE_COST and 28 later uncosted amounts reproduced, zero hidden changes.",
    [
      a("COMBAT_STATE.RESOURCE_CHANGE_POST_CHANGE_CONTRACT", {
        actorId: BLOOD_GTKB_ACTOR,
        resourceWireType: 6,
        deltaScale: 10,
        expected: {
          observations: 84,
          postChange: 45,
          integerReconciled: 38,
          capEvents: 0,
          deltaRoundedAttachmentExact: 5,
          preCostMatches: 6,
          uncostedMatches: 28,
          hiddenChangeMismatches: 0,
          maxValues: [1250],
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "The contract is a property of the wire, not of one fight.",
    { related: ["tests/unit/m11b5-resource-post-change-contract.test.ts"] },
  ),
  kase(
    "combat-state.missing-combo-point-entry-is-no-observation-not-zero",
    "wcl-assassination-envenom-combo-points",
    "COMBAT_STATE",
    "src/engine/resources/resource-state.ts observationOnEvent",
    "The real Envenom at 2,090,898 plainly happened — it carries an Energy cost of 35 — yet its classResources omits the combo-point entry entirely. Asked for its combo points, the layer answers UNKNOWN / NO_OBSERVATION. Reading it as zero would manufacture the sharpest possible false rejection.",
    [
      a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
        actorId: 19,
        abilityGameId: ENVENOM,
        reportTimeMs: 2090898,
        resourceWireType: 4,
        expected: unknown("NO_OBSERVATION"),
      }),
      a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
        actorId: 19,
        abilityGameId: ENVENOM,
        reportTimeMs: 2090898,
        resourceWireType: 3,
        expected: {
          certainty: "EXACT",
          observedAmount: 173,
          observedMax: 250,
          observedCost: 35,
          timing: "PRE_COST",
        },
      }),
    ],
    ["VALIDATED_EVIDENCE", "OWNED_CONTRACT"],
    "A second Envenom by the same actor 1,015 ms later carries t4: 6/7 cost 6, so the absence is a gap in the record, not a fact about the pool. NO_OBSERVATION is the layer's word for 'we hold the event and it carries no such snapshot'.",
    { related: ["tests/regression/m5-envenom-unknown-states.test.ts"] },
  ),
  kase(
    "combat-state.aura-stack-is-the-absolute-resulting-count",
    "wcl-aura-stack-absolute",
    "COMBAT_STATE",
    "src/engine/auras/aura-observations.ts stack semantics; src/engine/auras/aura-state.ts latestStackObservation and presenceAt",
    "On a stack-change event `stack` is the absolute resulting count after that event: the ascending chain reads 2, 3, ... 6; the descending chain's removebuffstack reading 1 proves the aura survived it (ACTIVE at that transition) and only the ordinary removebuff ends it (INACTIVE). Between transitions, with no retained coverage, presence is UNKNOWN.",
    [
      a("COMBAT_STATE.AURA_STACK_OBSERVATION", {
        aura: aura(9, 1297033, 9),
        at: end_of(7552998),
        expected: { rawType: "applybuffstack", observedStacks: 2, reportTimeMs: 7552998 },
      }),
      a("COMBAT_STATE.AURA_STACK_OBSERVATION", {
        aura: aura(9, 1297033, 9),
        at: end_of(7556034),
        expected: { rawType: "applybuffstack", observedStacks: 6, reportTimeMs: 7556034 },
      }),
      a("COMBAT_STATE.AURA_STACK_OBSERVATION", {
        aura: aura(7, 1263382, 7),
        at: end_of(7553744),
        expected: { rawType: "removebuffstack", observedStacks: 2, reportTimeMs: 7553744 },
      }),
      a("COMBAT_STATE.AURA_STACK_OBSERVATION", {
        aura: aura(7, 1263382, 7),
        at: end_of(7554996),
        expected: { rawType: "removebuffstack", observedStacks: 1, reportTimeMs: 7554996 },
      }),
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(7, 1263382, 7),
        at: end_of(7554996),
        expected: { certainty: "EXACT", presence: "ACTIVE", anchorReportTimeMs: 7554996 },
      }),
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(7, 1263382, 7),
        at: end_of(7556178),
        expected: { certainty: "EXACT", presence: "INACTIVE", anchorReportTimeMs: 7556178 },
      }),
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(7, 1263382, 7),
        at: end_of(7555000),
        expected: unknown("INSUFFICIENT_COVERAGE"),
      }),
    ],
    ["VALIDATED_EVIDENCE", "OWNED_CONTRACT"],
    "A delta reading would need the first stack application to read 1, which never appears across 1,012 stack applications in two reports; an absolute-before reading would put a PRIOR count of 2 on an application that follows applybuff. The descending chain runs 1.18 s past its removebuffstack 1, which only the absolute-resulting reading allows.",
    {
      limitations: [
        "A resulting count of ZERO appears in no capture and is not read as INACTIVE.",
        "Presence between transitions needs coverage this slice does not retain; the UNKNOWN assertion pins that honestly.",
      ],
      related: ["tests/unit/aura-stack-absolute-contract.test.ts", "tests/unit/aura-state.test.ts"],
    },
  ),
  kase(
    "combat-state.vanish-buff-is-observed-at-its-transitions-and-unknown-between",
    "wcl-assassination-vanish-ambush-gate",
    "COMBAT_STATE",
    "src/engine/auras/aura-state.ts presenceAt; src/engine/state/state-result.ts gateContinuityClaim",
    "The Vanish BUFF (11327) on actor 19 is INACTIVE at the end of 2,176,580 because its removebuff is the last transition on that millisecond — an observation. Immediately before the Garrote cast on the same millisecond, presence would have to be carried forward from the 2,176,120 application, and this five-event slice retains no coverage to carry it, so the answer is UNKNOWN / INSUFFICIENT_COVERAGE. The kingsbane-cooldown and D2 slices retain that coverage and prove ACTIVE.",
    [
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(19, VANISH_BUFF, 19),
        at: end_of(Q),
        expected: { certainty: "EXACT", presence: "INACTIVE", anchorReportTimeMs: Q },
      }),
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(19, VANISH_BUFF, 19),
        at: before_cast(19, Q, GARROTE),
        expected: unknown("INSUFFICIENT_COVERAGE"),
      }),
    ],
    ["OWNED_CONTRACT"],
    "Carrying an anchor forward asserts that nothing in the track contradicted it in between, which needs complete coverage of the interval for the target. The legacy M5-C2 harness granted that coverage by declaration; the corpus grants only what the transformation record retains, and this slice's probe did not record whether every aura event on actor 19 in the interval was kept.",
    {
      limitations: [
        "This is the corpus being stricter than the legacy M5-C2 harness, deliberately. The ACTIVE-at-Q fact is pinned on the two slices whose predicate retains AURAS coverage for target 19.",
      ],
      related: ["tests/regression/m5c2-vanish-stealth-and-ambush-gate.test.ts"],
    },
  ),
  kase(
    "combat-state.vanish-buff-active-before-garrote-with-retained-coverage",
    "wcl-assassination-kingsbane-cooldown",
    "COMBAT_STATE",
    "src/engine/auras/aura-state.ts presenceAt (carry-forward under retained AURAS coverage)",
    "With AURAS coverage retained for target 19 over the window, the Vanish buff applied at 2,176,120 is carried forward to the instant before the Garrote cast at 2,176,580: ACTIVE, anchored on the observed application, no duration invented anywhere. The removebuff that follows the cast on the same millisecond does not reach back.",
    [
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(19, VANISH_BUFF, 19),
        at: before_cast(19, Q, GARROTE),
        expected: { certainty: "EXACT", presence: "ACTIVE", anchorReportTimeMs: 2176120 },
      }),
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(19, VANISH_BUFF, 19),
        at: end_of(Q),
        expected: { certainty: "EXACT", presence: "INACTIVE", anchorReportTimeMs: Q },
      }),
    ],
    ["VALIDATED_EVIDENCE", "OWNED_CONTRACT"],
    "The slice's predicate — every aura event targeting 19 or 21 in the interval, order preserved — is what makes the continuity claim honest; and at Q Warcraft Logs returns the cast BEFORE the removebuff, so BEFORE_EVENT at the cast excludes it.",
    {
      related: [
        "tests/regression/m5c2-vanish-stealth-and-ambush-gate.test.ts",
        "tests/regression/m5c3c1-kingsbane-cooldown.test.ts",
      ],
    },
  ),
  kase(
    "combat-state.kingsbane-anchor-is-the-most-recent-observed-cast",
    "wcl-assassination-kingsbane-cooldown",
    "COMBAT_STATE",
    "src/engine/state/combat-state.ts lastObservedCast",
    "Among all 42 of actor 19's casts before Q, the last COMPLETE Kingsbane is the one at 2,173,778 — an observation, needing no coverage — and the 24 melee autos and assorted abilities around it do not anchor it. The Vanish action likewise anchors at 2,176,120.",
    [
      a("COMBAT_STATE.LAST_OBSERVED_CAST_AT", {
        actorId: 19,
        abilityGameId: KINGSBANE,
        at: before_cast(19, Q, GARROTE),
        expectedReportTimeMs: 2173778,
      }),
      a("COMBAT_STATE.LAST_OBSERVED_CAST_AT", {
        actorId: 19,
        abilityGameId: VANISH_ACTION,
        at: before_cast(19, Q, GARROTE),
        expectedReportTimeMs: 2176120,
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "'Most recent' is only meaningful when every candidate is present, which is why the slice widened the cast predicate to every actor-19 cast. EXACT with a value is an observation and needs no coverage; only the null (proven absence) branch is gated.",
    { related: ["tests/regression/m5c3c1-kingsbane-cooldown.test.ts"] },
  ),

  // ---- SPEC_ASSASSINATION (M5) ------------------------------------------
  kase(
    "spec-assassination.talent-tree-resolves-selected-not-selected-and-unknown",
    "wcl-assassination-vanish-ambush-gate",
    "SPEC_ASSASSINATION",
    "src/data/game/rogue-talents.ts resolveTalentSelection",
    "Actor 19's real build: improved_ambush is NOT_SELECTED because node 90692 carries a different entry (Tight Spender); shrouded_suffocation is SELECTED by its own entry 112669; blindside is UNKNOWN because its node is absent from the tree, and absence is never read as 'not taken'.",
    [
      a("SPEC_ASSASSINATION.TALENT_RESOLUTION", {
        actorId: 19,
        simcName: "improved_ambush",
        expected: "NOT_SELECTED",
      }),
      a("SPEC_ASSASSINATION.TALENT_RESOLUTION", {
        actorId: 19,
        simcName: "shrouded_suffocation",
        expected: "SELECTED",
      }),
      a("SPEC_ASSASSINATION.TALENT_RESOLUTION", { actorId: 19, simcName: "blindside", expected: "UNKNOWN" }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "A node-presence rule would invert improved_ambush. Only two outcomes are decisive and both rest on an entry that IS present: the talent's own entry (SELECTED) or a different entry occupying its node (NOT_SELECTED). Missing talent data does not mean talent=false.",
    {
      related: [
        "tests/regression/m5c2-vanish-stealth-and-ambush-gate.test.ts",
        "tests/unit/rogue-talents.test.ts",
      ],
    },
  ),
  kase(
    "spec-assassination.garrote-remains-derives-from-the-observed-anchor",
    "wcl-assassination-garrote-dot-remains",
    "SPEC_ASSASSINATION",
    "src/specs/rogue/assassination/dot-remains-state.ts bindDotRemains; src/data/game/rogue-dot-durations.json",
    "Immediately before the Garrote cast at Q, actor 19's Garrote on target 21 has 5,746 ms remaining: (2,164,326 + 18,000) - 2,176,580. The anchor is actor 19's own application, not actor 13's independent Garrote at 2,172,232, and not the re-application the cast itself causes.",
    [
      a("SPEC_ASSASSINATION.DOT_REMAINS", {
        actorId: 19,
        targetActorId: 21,
        simcToken: "garrote",
        atCast: cast(19, Q, GARROTE),
        expected: { state: "KNOWN", remainsMs: 5746, anchorReportTimeMs: 2164326 },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The 18,000 ms duration is the pinned SIMC_DBC_ROGUE_DOT_DURATIONS dataset; the anchor is observed. Mistaking actor 13's application yields 13.652 s and the post-decision re-application yields 18.000 s — both plausible, only one right, and the slice contains both wrong answers so the derivation has to reject them.",
    {
      authority: {
        ...DOTS,
        requiredStateEvidence: [
          "applydebuff 703 by 19 on 21 at 2,164,326 (the anchor)",
          "every aura event targeting 19 or 21 in [2,164,325 .. 2,176,581], order preserved",
          "the Garrote cast at 2,176,580 preceding its own removedebuff/applydebuff",
        ],
      },
      related: ["tests/regression/m5c3a-garrote-remains-and-core-dot.test.ts"],
    },
  ),
  kase(
    "spec-assassination.observed-garrote-at-q-is-authority-compatible",
    D2,
    "SPEC_ASSASSINATION",
    "src/specs/rogue/assassination/observed-analysis.ts analyzeObservedAssassinationDecisions; observed-comparison.ts",
    "The real post-Vanish Garrote at Q is the one resolved comparison on the D2 corpus: MATCH at EXACT_ENTRY precision on the garrote token, with no M5-A rejection. MATCH means the pinned authority's selection was compatible with the observed action — verification of an observed decision, not a prediction and not an endorsement.",
    [
      a("SPEC_ASSASSINATION.DECISION_COVERAGE", {
        actorId: 19,
        targetActorId: 21,
        observedCast: { reportTimeMs: Q, abilityGameId: GARROTE },
        expected: {
          outcome: "MATCH",
          basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
          authorityCoverage: "EXACT_ENTRY",
          authorityToken: "garrote",
          selectionPrecision: "EXACT_ENTRY",
          decisiveBlocker: null,
          observedActionRejected: false,
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "Stealth from Vanish makes cds[5]'s !stealthed.rogue FALSE so the unsupported vanish list is never entered; the Garrote DoT anchor makes core_dot[0]'s remainder term derivable; and the observed cast proves usability. Under the pinned artifact simc-33622e9d-1 that selects garrote at core_dot[0] in every enumerated world.",
    {
      authority: {
        ...SIMC,
        requiredStateEvidence: [
          "Vanish buff 11327 ACTIVE at Q from the observed applybuff at 2,176,120",
          "Garrote remains 5,746 ms from the 2,164,326 anchor",
          "Kingsbane cooldown from the observed cast at 2,173,778",
          "combatantinfo for actor 19 (talent tree)",
          "the observed Garrote execution at Q as the usability proof",
        ],
      },
      limitations: [
        "MATCH = AUTHORITY_COMPATIBLE_ONLY. The positive usability came from the observed execution, so this does not claim the selection would have held beforehand.",
      ],
      related: [
        "tests/regression/m5e-real-decision-comparisons.test.ts",
        "tests/regression/m5d2-decision-corpus.test.ts",
      ],
    },
  ),
  kase(
    "spec-assassination.low-combo-point-envenom-is-rejected",
    "wcl-assassination-envenom-combo-points",
    "SPEC_ASSASSINATION",
    "src/specs/rogue/assassination/envenom-decision.ts; observed-comparison.ts (OBSERVED_ACTION_REJECTED_BY_AUTHORITY)",
    "Actor 13's Envenom at 3 of 7 combo points is REJECTED: the spend gate is false under both Darkest Night resolutions. No replacement action is named — the globally ideal action stays UNKNOWN — and the rejection rests on the cast's own PRE_COST snapshot.",
    [
      a("SPEC_ASSASSINATION.DECISION_COVERAGE", {
        actorId: 13,
        targetActorId: null,
        observedCast: { reportTimeMs: 2150252, abilityGameId: ENVENOM },
        expected: {
          outcome: "REJECTED",
          basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
          authorityCoverage: "UNKNOWN",
          authorityToken: null,
          selectionPrecision: null,
          decisiveBlocker: null,
          observedActionRejected: true,
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The pinned spend call condition is `!buff.darkest_night.up&combo_points>=5|buff.darkest_night.up&combo_points.deficit=0`; 3 < 5 and 3 != 7 fail it in every world. The observed 3/7 cost 3 is a cap-bounded PRE_COST observation on the cast itself.",
    {
      authority: {
        ...SIMC,
        requiredStateEvidence: [
          "the Envenom cast at 2,150,252 carrying classResources type 4: 3 / 7 cost 3",
          "combatantinfo for actor 13 (specID 259)",
        ],
      },
      limitations: ["A rejection is not a coaching verdict; nothing here says what should have been cast."],
      related: [
        "tests/regression/m5e-real-decision-comparisons.test.ts",
        "tests/regression/m5-envenom-at-three-combo-points-is-rejected.test.ts",
      ],
    },
  ),
  kase(
    "spec-assassination.deathmark-stays-unknown-on-predictive-state",
    D2,
    "SPEC_ASSASSINATION",
    "src/specs/rogue/assassination/observed-analysis.ts; decision-coverage.ts OBSERVED_STATE_MISSING",
    "The real Deathmark at 2,172,777 is compared and refuses: UNKNOWN because cds[0]'s condition ends in target.time_to_die and fight_remains, which are PREDICTIVE and never bound. A ready major cooldown that was actually used does not become a rejection just because the authority could not resolve.",
    [
      a("SPEC_ASSASSINATION.DECISION_COVERAGE", {
        actorId: 19,
        targetActorId: 21,
        observedCast: { reportTimeMs: 2172777, abilityGameId: DEATHMARK },
        expected: {
          outcome: "UNKNOWN",
          basis: "AUTHORITY_SELECTION_UNRESOLVED",
          authorityCoverage: "UNKNOWN",
          authorityToken: null,
          selectionPrecision: null,
          decisiveBlocker: "OBSERVED_STATE_MISSING",
          observedActionRejected: false,
        },
      }),
    ],
    ["PINNED_AUTHORITY"],
    "Predictive state must not be substituted with the actual fight end. The decisive blocker is the scan's earliest unresolved candidate; the cds[0] entry's own reason is asserted directly by the legacy regression.",
    {
      authority: {
        ...SIMC,
        requiredStateEvidence: [
          "the Deathmark cast at 2,172,777 as the usability proof",
          "no binding for target.time_to_die or fight_remains (PREDICTIVE)",
        ],
      },
      related: [
        "tests/regression/m5e-real-decision-comparisons.test.ts",
        "tests/regression/m5d2-decision-corpus.test.ts",
      ],
    },
  ),
  kase(
    "spec-assassination.envenom-after-q-diverges-rather-than-falling-through",
    D2,
    "SPEC_ASSASSINATION",
    "src/specs/rogue/assassination/first-gcd-selection.ts; decision-coverage.ts DIVERGENT_WORLDS",
    "The max-combo-point Envenom at 2,178,582 reaches spend[1] SELECTED in one world, but core_dot[0] Garrote is still an unresolved candidate ahead of it, so another world plays Garrote. The comparison stays UNKNOWN with DIVERGENT_WORLDS rather than picking the lower-priority entry.",
    [
      a("SPEC_ASSASSINATION.DECISION_COVERAGE", {
        actorId: 19,
        targetActorId: 21,
        observedCast: { reportTimeMs: 2178582, abilityGameId: ENVENOM },
        expected: {
          outcome: "UNKNOWN",
          basis: "AUTHORITY_SELECTION_UNRESOLVED",
          authorityCoverage: "UNKNOWN",
          authorityToken: null,
          selectionPrecision: null,
          decisiveBlocker: "DIVERGENT_WORLDS",
          observedActionRejected: false,
        },
      }),
    ],
    ["PINNED_AUTHORITY"],
    "An UNKNOWN higher-priority APL condition must never fall through to a confident lower-priority recommendation. Divergence is the honest answer and the corpus pins it as such.",
    {
      authority: {
        ...SIMC,
        requiredStateEvidence: [
          "the Envenom cast at 2,178,582 carrying 7 / 7 combo points PRE_COST",
          "the unresolved core_dot[0] Garrote candidate ahead of spend",
        ],
      },
      related: [
        "tests/regression/m5d2-decision-corpus.test.ts",
        "tests/regression/m5b-ordered-selection-never-overclaims.test.ts",
      ],
    },
  ),
  kase(
    "spec-assassination.protection-paladin-is-refused-at-the-spec-gate",
    D2,
    "SPEC_ASSASSINATION",
    "src/specs/rogue/assassination/observed-analysis.ts spec gate",
    "Asked to analyze actor 19 as paladin/protection, the facade returns SPEC_NOT_SUPPORTED before any Assassination rule runs. Protection Paladin remains explicitly unsupported until M10, and an unsupported spec never produces a decision list that could read as clean play.",
    [a("SPEC_ASSASSINATION.SPEC_GATE", { actorId: 19, specId: "paladin/protection" })],
    ["OWNED_CONTRACT"],
    "The facade requires the caller's resolved specialization and checks it first; no default and no inference. A wrong spec must not fall through into Assassination rules.",
    { related: ["tests/unit/analysis-composition-refusals.test.ts"] },
  ),
  kase(
    "spec-assassination.missing-authority-is-not-a-rejection",
    D2,
    "SPEC_ASSASSINATION",
    "src/specs/rogue/assassination/observed-analysis.ts AUTHORITY_NOT_AVAILABLE",
    "With no authority resolvable, the facade reports AUTHORITY_NOT_AVAILABLE and evaluates nothing — including the Garrote at Q that MATCHes under the pinned artifact. A missing standard is NO_AUTHORITY_AVAILABLE, never UNKNOWN and never REJECTED.",
    [a("SPEC_ASSASSINATION.AUTHORITY_UNAVAILABLE_IS_NOT_REJECTION", { actorId: 19, targetActorId: 21 })],
    ["OWNED_CONTRACT"],
    "NO_AUTHORITY_AVAILABLE and UNKNOWN are semantically distinct and neither may produce a player-failure finding. The facade models 'no authority' only when the caller says so explicitly.",
    { related: ["tests/regression/m5-fails-closed-on-version-and-identity.test.ts"] },
  ),

  // ---- PUBLIC_CONTRACT (M6/M7/M8) --------------------------------------
  kase(
    "public-contract.analysis-parity-over-the-d2-corpus",
    D2,
    "PUBLIC_CONTRACT",
    "src/contracts/analysis-contract.ts PublicAnalysisResultSchema; src/api/worker.ts /v1/analysis; src/mcp/tools/analyze-warcraft-log.ts",
    "The single-fight analysis of actor 19 over the D2 corpus is one document on REST and on MCP (structuredContent and text), valid against the frozen public schema, ANALYZED, and publishing MATCH as AUTHORITY_COMPATIBLE_ONLY.",
    [
      a("PUBLIC_CONTRACT.REST_MCP_PARITY", {
        document: "ANALYSIS",
        subject: { actorId: 19, className: "Rogue", specName: "Assassination" },
        expected: { status: "ANALYZED" },
      }),
    ],
    ["OWNED_CONTRACT"],
    "One composition root builds one runner, both adapters receive it, and both call the same projection. Parity is tested rather than argued because a second projection added to one adapter is exactly the kind of change nothing else would notice.",
    { related: ["tests/integration/transport-consistency.test.ts"] },
  ),
  kase(
    "public-contract.analysis-parity-over-the-high-parse-opener",
    "wcl-assassination-high-parse-opener",
    "PUBLIC_CONTRACT",
    "src/contracts/analysis-contract.ts PublicAnalysisResultSchema; src/api/worker.ts /v1/analysis; src/mcp/tools/analyze-warcraft-log.ts",
    "The single-fight analysis of actor 25 over the second report's opener slice is one document on REST and MCP (structuredContent and text), valid against the frozen public schema, ANALYZED, publishing MATCH as AUTHORITY_COMPATIBLE_ONLY — with every decision UNKNOWN, which the document carries as coverage rather than hiding.",
    [
      a("PUBLIC_CONTRACT.REST_MCP_PARITY", {
        document: "ANALYSIS",
        subject: { actorId: 25, className: "Rogue", specName: "Assassination" },
        expected: { status: "ANALYZED" },
      }),
    ],
    ["OWNED_CONTRACT"],
    "Parity over a second report proves the projection is not tuned to one fixture. A document that resolved nothing must still read as 'we could only analyze part of this' — the status is ANALYZED and the coverage says zero resolved, and both transports say it identically.",
    { related: ["tests/integration/transport-consistency.test.ts"] },
  ),
  kase(
    "public-contract.analysis-parity-for-an-unsupported-spec",
    D2,
    "PUBLIC_CONTRACT",
    "src/contracts/analysis-contract.ts (SPEC_NOT_SUPPORTED variant); src/services/analysis-service.ts",
    "Identified as an Arms Warrior, the same actor over the same artifact yields SPEC_NOT_SUPPORTED on both transports — a well-formed document with specialization.specId null and analyzerId null that says gameplay analysis was not attempted, identical on REST and MCP.",
    [
      a("PUBLIC_CONTRACT.REST_MCP_PARITY", {
        document: "ANALYSIS",
        subject: { actorId: 19, className: "Warrior", specName: "Arms" },
        expected: { status: "SPEC_NOT_SUPPORTED", specId: null, analyzerId: null },
      }),
    ],
    ["OWNED_CONTRACT"],
    "An unsupported specialization must not produce an empty report that reads as clean play. The public contract carries SPEC_NOT_SUPPORTED as its own status, with zero coverage and no authority.",
    {
      related: [
        "tests/integration/transport-consistency.test.ts",
        "tests/contracts/m6c-analysis-contract.test.ts",
      ],
    },
  ),
  kase(
    "public-contract.raid-night-parity-over-the-d2-corpus",
    D2,
    "PUBLIC_CONTRACT",
    "src/contracts/raid-night-contract.ts; src/services/raid-night-service.ts; /v1/raid-night; analyze_raid_night",
    "One raid-night request for one fight with one Assassination participant, through the real raid-night service over fake ports carrying the D2 corpus, is one document on REST and MCP with exactly one ANALYZED cell.",
    [
      a("PUBLIC_CONTRACT.REST_MCP_PARITY", {
        document: "RAID_NIGHT",
        fightIds: [1],
        subject: { actorId: 19 },
        expected: {
          analyzedCells: 1,
          cells: [{ sourceId: 19, kind: "ANALYZED", specId: "rogue/assassination" }],
        },
      }),
    ],
    ["OWNED_CONTRACT"],
    "The raid-night service is the production path with only the three Warcraft Logs ports faked; the cell is the real M5 facade's output projected by the real M7 aggregator.",
    {
      limitations: [
        "Without a stated composition the orchestration fixture normalizes the D2 artifact under its own window and fans it per participant; a composition over another artifact serves that artifact as one core (see the A7R6 mixed-roster case).",
      ],
      related: [
        "tests/integration/m7f-raid-night-transports.test.ts",
        "tests/regression/m7f-raid-night-orchestration.test.ts",
      ],
    },
  ),
  kase(
    "public-contract.encounter-context-parity-local-only",
    D2,
    "PUBLIC_CONTRACT",
    "src/contracts/encounter-context-contract.ts; src/services/encounter-context-service.ts; /v1/encounter-context; analyze_encounter_context",
    "A local encounter-context request (no external references) over the same fake ports is one document on REST and MCP, valid against the frozen schema, with the external-reference section reporting NOT_REQUESTED. No rankings transport is wired, so nothing external could have been contacted.",
    [
      a("PUBLIC_CONTRACT.REST_MCP_PARITY", {
        document: "ENCOUNTER_CONTEXT",
        fightIds: [1],
        subjectFightId: 1,
        subject: { actorId: 19 },
        expected: { externalReferenceStatus: "NOT_REQUESTED" },
      }),
    ],
    ["OWNED_CONTRACT"],
    "Encounter context composes the raid-night SERVICE through one port set; a deployment that never enables external references wires no ranking transport at all, and the document says so explicitly rather than by omission.",
    {
      limitations: [
        "External-reference behaviour is not exercised: M9-B runs only what deterministic injected responses can support, and no rankings fixture is committed to the corpus.",
      ],
      related: ["tests/integration/m8h-encounter-context-transports.test.ts"],
    },
  ),

  // ---- M9-C: real page boundaries, pets, identity, header (M3) ----------
  kase(
    "wcl-transport.real-page-boundaries-carry-the-cursor-verbatim",
    "wcl-page-sequence-limit-40",
    "WCL_TRANSPORT",
    "src/wcl/paginator.ts paginateEventStream; src/wcl/events-query.ts decodeEventPage",
    "Five real consecutive pages: each page's nextPageTimestamp equals the next page's first event timestamp and exceeds the previous page's last, and the paginator requests every page at exactly that cursor. The capture stopped after page 5 (cursor 2,176,472); the sixth request is answered as not retrieved, so the stream ends PARTIAL with all 5 pages / 226 events kept, in order, undeduplicated — never COMPLETE.",
    [
      a("WCL_PAGINATION.PAGE_ENVELOPE_FACTS", {
        pages: [
          { eventCount: 44, firstTimestamp: 2176008, lastTimestamp: 2176083, nextPageTimestamp: 2176092 },
          { eventCount: 43, firstTimestamp: 2176092, lastTimestamp: 2176204, nextPageTimestamp: 2176226 },
          { eventCount: 42, firstTimestamp: 2176226, lastTimestamp: 2176278, nextPageTimestamp: 2176287 },
          { eventCount: 57, firstTimestamp: 2176287, lastTimestamp: 2176383, nextPageTimestamp: 2176396 },
          { eventCount: 40, firstTimestamp: 2176396, lastTimestamp: 2176462, nextPageTimestamp: 2176472 },
        ],
        boundaryRule: "CURSOR_IS_NEXT_PAGE_FIRST_TIMESTAMP_AND_EXCEEDS_PREVIOUS_LAST",
      }),
      a("WCL_PAGINATION.STREAM_OUTCOME", {
        plan: { startTimeMs: 2176000, endTimeMs: 2177000, limit: 40 },
        expected: {
          state: "PARTIAL",
          reason: "UPSTREAM_UNAVAILABLE",
          pagesRetrieved: 5,
          eventsRetrieved: 226,
          requestedStartTimes: [2176000, 2176092, 2176226, 2176287, 2176396, 2176472],
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "The cursor rule was documented from the schema and pinned on synthetic pages in M9-B; this case pins it on five real boundaries. The measured boundary fact — cursor = next first timestamp, strictly after the previous last — is exactly what makes passing the cursor back verbatim correct and any 'cursor + 1' or overlap-trimming heuristic wrong. The PARTIAL ending models the capture bound: a page that was never obtained is reported, not filled in.",
    {
      limitations: [
        "The sixth page's absence is the capture bound, not an observed failure; UPSTREAM_UNAVAILABLE is the transport's classification of the executor's not-retrieved answer.",
      ],
      related: ["tests/unit/wcl-paginator.test.ts"],
    },
  ),
  kase(
    "wcl-transport.real-terminal-page-completes-the-stream",
    "wcl-page-terminal-one-millisecond",
    "WCL_TRANSPORT",
    "src/wcl/paginator.ts paginateEventStream terminal rule",
    "One real page whose nextPageTimestamp is null: the paginator issues exactly one request and ends COMPLETE with 14 events. All 14 share timestamp 2,176,580, and all 14 are retrieved.",
    [
      a("WCL_PAGINATION.PAGE_ENVELOPE_FACTS", {
        pages: [{ eventCount: 14, firstTimestamp: 2176580, lastTimestamp: 2176580, nextPageTimestamp: null }],
        boundaryRule: "CURSOR_IS_NEXT_PAGE_FIRST_TIMESTAMP_AND_EXCEEDS_PREVIOUS_LAST",
      }),
      a("WCL_PAGINATION.STREAM_OUTCOME", {
        plan: { startTimeMs: 2176580, endTimeMs: 2176581, limit: 20 },
        expected: {
          state: "COMPLETE",
          reason: "COMPLETED_NORMALLY",
          pagesRetrieved: 1,
          eventsRetrieved: 14,
          requestedStartTimes: [2176580],
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "A null cursor is the only thing that ends a stream COMPLETE. This is the real terminal case the synthetic two-page sequence stood in for, and the fourteen equal timestamps are the real form of the no-deduplication rule.",
    { related: ["tests/unit/wcl-paginator.test.ts"] },
  ),
  kase(
    "wcl-transport.missing-later-page-keeps-four-real-pages-and-stays-partial",
    "wcl-page-sequence-limit-40.page-5-removed",
    "WCL_TRANSPORT",
    "src/wcl/paginator.ts paginateEventStream; retrieval completeness",
    "The parent's page 5 is removed. The paginator retrieves pages 1–4 verbatim (186 events, real cursors), requests page 5 at 2,176,396, does not receive it, and ends PARTIAL with 4 pages. The interval from 2,176,396 on is reported as NOT RETRIEVED — never as a quiet stretch of the fight.",
    [
      a("WCL_PAGINATION.PAGE_ENVELOPE_FACTS", {
        pages: [
          { eventCount: 44, firstTimestamp: 2176008, lastTimestamp: 2176083, nextPageTimestamp: 2176092 },
          { eventCount: 43, firstTimestamp: 2176092, lastTimestamp: 2176204, nextPageTimestamp: 2176226 },
          { eventCount: 42, firstTimestamp: 2176226, lastTimestamp: 2176278, nextPageTimestamp: 2176287 },
          { eventCount: 57, firstTimestamp: 2176287, lastTimestamp: 2176383, nextPageTimestamp: 2176396 },
        ],
        boundaryRule: "CURSOR_IS_NEXT_PAGE_FIRST_TIMESTAMP_AND_EXCEEDS_PREVIOUS_LAST",
      }),
      a("WCL_PAGINATION.STREAM_OUTCOME", {
        plan: { startTimeMs: 2176000, endTimeMs: 2177000, limit: 40 },
        expected: {
          state: "PARTIAL",
          reason: "UPSTREAM_UNAVAILABLE",
          pagesRetrieved: 4,
          eventsRetrieved: 186,
          requestedStartTimes: [2176000, 2176092, 2176226, 2176287, 2176396],
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Partial retrieval over REAL pages: the derivation removes one page and records it; nothing about the four retained pages changed. A 30-second retrieval gap caused by a failed page must never become 'you were idle for 30 seconds', and the only way to pin that on real data is to take a real page away and check what is reported.",
    {
      limitations: [
        "The missing page is a recorded derivation; the failure class it models is a transport failure, not a specific upstream response.",
      ],
      related: ["tests/unit/wcl-paginator.test.ts"],
    },
  ),
  kase(
    "wcl-transport.identity-resolves-over-real-master-data-and-refuses-the-rest",
    "wcl-fight-context-a7r6-fight-7",
    "WCL_TRANSPORT",
    "src/wcl/identity.ts resolveFightIdentity; src/wcl/preflight-query.ts decodePreflight; src/wcl/report-roster-facts.ts",
    "Over the real report context, actor 19 and actor 13 resolve as Rogue/Assassination with the report revision (30), logVersion 17 and gameVersion 1; pet 29 is SOURCE_NOT_A_PLAYER; an id no actor has is SOURCE_NOT_FOUND; a player listed in master data but not in fight 7's friendlyPlayers is SOURCE_NOT_IN_FIGHT; actor -1 — which master data DOES list as an NPC — is SOURCE_NOT_FOUND because the sentinel never resolves; and asking for fight 999 when the served fight is 7 is UPSTREAM_DATA_INVALID.",
    [
      a("WCL_TRANSPORT.FIGHT_IDENTITY", {
        fightId: 7,
        sourceId: 19,
        expected: {
          ok: true,
          className: "Rogue",
          specName: "Assassination",
          playerName: "Actor19",
          reportRevision: 30,
          logVersion: 17,
          gameVersion: 1,
        },
      }),
      a("WCL_TRANSPORT.FIGHT_IDENTITY", {
        fightId: 7,
        sourceId: 13,
        expected: {
          ok: true,
          className: "Rogue",
          specName: "Assassination",
          playerName: "Actor13",
          reportRevision: 30,
          logVersion: 17,
          gameVersion: 1,
        },
      }),
      a("WCL_TRANSPORT.FIGHT_IDENTITY", {
        fightId: 7,
        sourceId: 29,
        expected: { ok: false, reason: "SOURCE_NOT_A_PLAYER" },
      }),
      a("WCL_TRANSPORT.FIGHT_IDENTITY", {
        fightId: 7,
        sourceId: 999,
        expected: { ok: false, reason: "SOURCE_NOT_FOUND" },
      }),
      a("WCL_TRANSPORT.FIGHT_IDENTITY", {
        fightId: 7,
        sourceId: 125,
        expected: { ok: false, reason: "SOURCE_NOT_IN_FIGHT" },
      }),
      a("WCL_TRANSPORT.FIGHT_IDENTITY", {
        fightId: 7,
        sourceId: -1,
        expected: { ok: false, reason: "SOURCE_NOT_FOUND" },
      }),
      a("WCL_TRANSPORT.FIGHT_IDENTITY", {
        fightId: 999,
        sourceId: 19,
        expected: { ok: false, reason: "UPSTREAM_DATA_INVALID" },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Identity safety on real master data: class from subType, spec from friendlySpecs at the player's roster index, and every refusal explicit. The -1 entry is the interesting one — Warcraft Logs lists a boss NPC under the no-actor sentinel id, and the resolver must refuse it as not found rather than let 'the environment' become a player. The wrong-fight refusal proves the preflight trusts the fight it asked for, not the fight it was served.",
    {
      limitations: [
        "A conflict between authoritative identity and OBSERVED behaviour (IDENTITY_CONFLICT) is still not captured; this pins metadata resolution only.",
        "The redacted name `Actor19` is asserted only as the redacted form; the production identity carries whatever Warcraft Logs served.",
      ],
      related: ["tests/unit/wcl-identity.test.ts", "tests/regression/m2-identity-regressions.test.ts"],
    },
  ),
  kase(
    "normalization.real-master-data-catalogs-every-actor-including-pets-and-the-sentinel-entry",
    "wcl-fight-context-a7r6-fight-7",
    "NORMALIZATION",
    "src/engine/normalization/actors.ts normalizeActors; src/engine/normalization/fight-context.ts normalizeFightContext",
    "The real actor catalog: 312 actors — 108 players, 165 pets, 39 NPCs, 0 unknown, 0 unusable entries. Pet 29 links to owner 20 and pet 173 to owner 19 from `petOwner` only; the id -1 entry Warcraft Logs served is catalogued as an NPC with gameID 0, and actor 0 is absent because master data has none.",
    [
      a("NORMALIZATION.ACTOR_CATALOG", {
        fightId: 7,
        expected: {
          actors: 312,
          players: 108,
          pets: 165,
          npcs: 39,
          unknown: 0,
          unusableEntries: 0,
          petOwnerLinks: [
            { actorId: 29, petOwnerActorId: 20 },
            { actorId: 173, petOwnerActorId: 19 },
          ],
          holdsActorIds: [-1, 19, 20, 29, 173],
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Pets and guardians are real, numerous (more than half the catalog) and owner-linked only where Warcraft Logs says so — 39 pets carry no owner and the normalizer invents none. The -1 catalog entry is recorded as what it is (an NPC with that id) while event normalization keeps treating -1 as the no-actor sentinel; the two rules coexist and neither is inferred from the other.",
    {
      limitations: [
        "Counts are for this report's master data; nothing generalizes to other reports.",
        "Whether a pet's events should be attributed to its owner for any analysis is a specialization question and is not decided here.",
      ],
      related: ["tests/unit/normalization-actors.test.ts"],
    },
  ),
  kase(
    "normalization.real-fight-header-carries-kill-difficulty-and-intermission-phases",
    "wcl-fight-context-a7r6-fight-7",
    "NORMALIZATION",
    "src/engine/normalization/fight-context.ts normalizeFightContext; encounter-facts.ts",
    "The real fight header: encounter 3445 at difficulty 5, a kill, [2,004,589 .. 2,429,103], COMPLETED, 20 friendly players, 9 phase transitions alternating Stage One and the Vitriolic Stasis intermission (4 intermissions, verbatim isIntermission flags), lastPhase 1 / absolute index 8, boss and fight percentage 0.01 raw, no wipe time, zone 53, 2,035 abilities.",
    [
      a("NORMALIZATION.FIGHT_HEADER", {
        fightId: 7,
        expected: {
          encounterId: 3445,
          difficulty: 5,
          kill: true,
          startTimeMs: 2004589,
          endTimeMs: 2429103,
          finality: "COMPLETED",
          friendlyPlayerCount: 20,
          phases: [
            { phaseId: 1, isIntermission: false, startTimeMs: 2004589 },
            { phaseId: 2, isIntermission: true, startTimeMs: 2050925 },
            { phaseId: 1, isIntermission: false, startTimeMs: 2061943 },
            { phaseId: 2, isIntermission: true, startTimeMs: 2152925 },
            { phaseId: 1, isIntermission: false, startTimeMs: 2169953 },
            { phaseId: 2, isIntermission: true, startTimeMs: 2260926 },
            { phaseId: 1, isIntermission: false, startTimeMs: 2270944 },
            { phaseId: 2, isIntermission: true, startTimeMs: 2361932 },
            { phaseId: 1, isIntermission: false, startTimeMs: 2376951 },
          ],
          outcome: {
            lastPhase: 1,
            lastPhaseAsAbsoluteIndex: 8,
            lastPhaseIsIntermission: false,
            bossPercentageRaw: 0.01,
            fightPercentageRaw: 0.01,
            wipeCalledReportTimeMs: null,
          },
          zone: { id: 53, name: "The Venomous Abyss" },
          abilities: 2035,
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Real intermission evidence exists in the corpus now: four phase transitions flagged isIntermission by Warcraft Logs, with report-time starts. That is encounter-exposed phase state, preserved verbatim; it is NOT targetability, and no actionability rule is derived from it here. The two phase counters are kept apart (1 within type, 8 absolute) because the schema counts them on different bases.",
    {
      limitations: [
        "Phase transitions are not targetability events; the targetability gap stays open.",
        "bossPercentage/fightPercentage are pinned RAW; their scale and direction are unproven and nothing interprets them.",
      ],
      related: ["tests/unit/normalization-fight-context.test.ts", "tests/unit/m8c-encounter-facts.test.ts"],
    },
  ),
  kase(
    "normalization.pet-sourced-events-keep-the-pet-as-source",
    "wcl-pet-sourced-events-hunter-pet-29",
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts source/target reading; raw-event-fields.ts VERIFIED_DIRECTION_FIELDS",
    "57 real events from a filtered capture normalize 57-for-57, in order, every type recognised. Event 0 (a cast) is sourced by pet 29 with the no-actor sentinel as target; event 6 (a resourcechange) is sourced by owner 20 and targets pet 29. The pet is its own actor on both sides and is never folded into its owner.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 57 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.SIDE_REFERENCE", {
        index: 0,
        side: "SOURCE",
        expected: { kind: "ACTOR", actorId: 29, instanceId: null },
      }),
      a("NORMALIZATION.SIDE_REFERENCE", {
        index: 0,
        side: "TARGET",
        expected: { kind: "ABSENT", absence: "NO_ACTOR_SENTINEL" },
      }),
      a("NORMALIZATION.SIDE_REFERENCE", {
        index: 6,
        side: "SOURCE",
        expected: { kind: "ACTOR", actorId: 20, instanceId: null },
      }),
      a("NORMALIZATION.SIDE_REFERENCE", {
        index: 6,
        side: "TARGET",
        expected: { kind: "ACTOR", actorId: 29, instanceId: null },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Pet-sourced events are the first real pet evidence in the corpus. Direction comes from the verified field names, so a pet's cast is the pet's and an owner's resource event that targets the pet stays owner→pet. Attribution to the owner, if any analysis ever wants it, is a later, explicit decision — not something normalization does silently.",
    {
      limitations: [
        "The capture used a sourceID filter the analyzer never issues; the artifact retains no coverage and proves nothing about absence.",
        "Whether a Hunter pet's damage should count toward the Hunter is unanswered here and is not a Rogue question.",
      ],
      related: ["tests/unit/normalization-event-normalizer.test.ts"],
    },
  ),

  // ---- M9-C correction: the high-performance Assassination subject ------
  kase(
    "wcl-transport.identity-resolves-both-assassination-rogues-of-the-high-parse-kill",
    "wcl-fight-context-gtkb-fight-22",
    "WCL_TRANSPORT",
    "src/wcl/identity.ts resolveFightIdentity; src/wcl/preflight-query.ts decodePreflight",
    "Over the second report's real context, actor 25 (the 100 % parse) and actor 8 (the 8 % parse) both resolve as Rogue/Assassination at revision 22, logVersion 17, gameVersion 1 — identically, because performance is not an identity fact. Boss 235 is SOURCE_NOT_A_PLAYER and an id no actor has is SOURCE_NOT_FOUND.",
    [
      a("WCL_TRANSPORT.FIGHT_IDENTITY", {
        fightId: 22,
        sourceId: 25,
        expected: {
          ok: true,
          className: "Rogue",
          specName: "Assassination",
          playerName: "Actor25",
          reportRevision: 22,
          logVersion: 17,
          gameVersion: 1,
        },
      }),
      a("WCL_TRANSPORT.FIGHT_IDENTITY", {
        fightId: 22,
        sourceId: 8,
        expected: {
          ok: true,
          className: "Rogue",
          specName: "Assassination",
          playerName: "Actor8",
          reportRevision: 22,
          logVersion: 17,
          gameVersion: 1,
        },
      }),
      a("WCL_TRANSPORT.FIGHT_IDENTITY", {
        fightId: 22,
        sourceId: 235,
        expected: { ok: false, reason: "SOURCE_NOT_A_PLAYER" },
      }),
      a("WCL_TRANSPORT.FIGHT_IDENTITY", {
        fightId: 22,
        sourceId: 999,
        expected: { ok: false, reason: "SOURCE_NOT_FOUND" },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Identity is read from subType and friendlySpecs at the roster index and from nothing else. Two subjects at opposite ends of the same board resolve the same way, which is the point of keeping performance context off the identity path.",
    { related: ["tests/unit/wcl-identity.test.ts"] },
  ),
  kase(
    "normalization.high-parse-report-context-normalizes-with-no-intermission",
    "wcl-fight-context-gtkb-fight-22",
    "NORMALIZATION",
    "src/engine/normalization/fight-context.ts normalizeFightContext; actors.ts normalizeActors",
    "The second report's catalog: 293 actors — 27 players, 153 pets (124 owner-linked), 113 NPCs, 0 unknown, 0 unusable; boss 235 and the -1 entry catalogued as NPCs; player gameIDs null after sanitization. The header: Sszorak (3420) heroic (4), a kill, [2,415,041 .. 2,699,832], 25 friendly players, five phase transitions none of them an intermission, lastPhase 1 / absolute index 4, zone 53, 2,039 abilities.",
    [
      a("NORMALIZATION.ACTOR_CATALOG", {
        fightId: 22,
        expected: {
          actors: 293,
          players: 27,
          pets: 153,
          npcs: 113,
          unknown: 0,
          unusableEntries: 0,
          petOwnerLinks: [],
          holdsActorIds: [-1, 8, 25, 235],
        },
      }),
      a("NORMALIZATION.FIGHT_HEADER", {
        fightId: 22,
        expected: {
          encounterId: 3420,
          difficulty: 4,
          kill: true,
          startTimeMs: 2415041,
          endTimeMs: 2699832,
          finality: "COMPLETED",
          friendlyPlayerCount: 25,
          phases: [
            { phaseId: 1, isIntermission: false, startTimeMs: 2415041 },
            { phaseId: 2, isIntermission: false, startTimeMs: 2526152 },
            { phaseId: 1, isIntermission: false, startTimeMs: 2551155 },
            { phaseId: 2, isIntermission: false, startTimeMs: 2664353 },
            { phaseId: 1, isIntermission: false, startTimeMs: 2689362 },
          ],
          outcome: {
            lastPhase: 1,
            lastPhaseAsAbsoluteIndex: 4,
            lastPhaseIsIntermission: false,
            bossPercentageRaw: 0.01,
            fightPercentageRaw: 0.01,
            wipeCalledReportTimeMs: null,
          },
          zone: { id: 53, name: "The Venomous Abyss" },
          abilities: 2039,
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "A second real report through the same normalizer, with a different encounter shape: Sszorak alternates two stages with no intermission flagged, against Entombed Sentinels' four intermissions. Both are preserved verbatim; neither is interpreted as targetability.",
    {
      limitations: ["Phase transitions are not targetability events; the targetability gap stays open."],
      related: ["tests/unit/normalization-fight-context.test.ts"],
    },
  ),
  kase(
    "normalization.high-parse-opener-slice-normalizes-whole-and-in-order",
    "wcl-assassination-high-parse-opener",
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts; supported-families.ts",
    "1,542 real events from the second report normalize 1,542-for-1,542, in capture order, every type recognised. Event 0 is actor 25's combatantinfo at the fight start (the only event on that timestamp); event 1 is another player's debuff landing on boss 235 before the subject acts; event 22 is actor 25's first cast, Garrote on boss 235 at 2,416,180.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 1542 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.TIMESTAMP_RUN_RETAINED", { reportTimeMs: 2415041, count: 1 }),
      a("NORMALIZATION.SIDE_REFERENCE", {
        index: 1,
        side: "SOURCE",
        expected: { kind: "ACTOR", actorId: 29, instanceId: null },
      }),
      a("NORMALIZATION.SIDE_REFERENCE", {
        index: 22,
        side: "SOURCE",
        expected: { kind: "ACTOR", actorId: 25, instanceId: null },
      }),
      a("NORMALIZATION.SIDE_REFERENCE", {
        index: 22,
        side: "TARGET",
        expected: { kind: "ACTOR", actorId: 235, instanceId: null },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "The eleven event families the D2 slice established recur unchanged in a second report; the normalizer's contracts are about Warcraft Logs' wire format, not about one log.",
    { related: ["tests/unit/normalization-event-normalizer.test.ts"] },
  ),

  kase(
    "combat-state.high-parse-opener-pre-pull-stealth-is-ambiguous-until-its-observed-removal",
    "wcl-assassination-high-parse-opener",
    "COMBAT_STATE",
    "src/engine/auras/aura-state.ts presenceAt; src/engine/state/state-result.ts AMBIGUOUS_INITIAL_STATE",
    "Actor 25's Stealth (1784) was applied before the pull, so the slice's first Stealth event is its removal at 2,416,179. At 2,415,500 — inside COMPLETE AURAS coverage but before any observation — presence is UNKNOWN for AMBIGUOUS_INITIAL_STATE; immediately before the Garrote at 2,416,180 it is EXACT INACTIVE anchored on the observed removal. The Garrote debuff on boss 235 is ACTIVE from its 2,416,180 application at the Rupture decision and at the second Garrote; Rupture is ACTIVE from 2,418,188 at the first Envenom and UNKNOWN before it was ever observed.",
    [
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(25, 1784, 25),
        at: end_of(2415500),
        expected: unknown("AMBIGUOUS_INITIAL_STATE"),
      }),
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(25, 1784, 25),
        at: before_cast(25, 2416180, GARROTE),
        expected: { certainty: "EXACT", presence: "INACTIVE", anchorReportTimeMs: 2416179 },
      }),
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(235, GARROTE, 25, "DEBUFF"),
        at: before_cast(25, 2418187, RUPTURE),
        expected: { certainty: "EXACT", presence: "ACTIVE", anchorReportTimeMs: 2416180 },
      }),
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(235, GARROTE, 25, "DEBUFF"),
        at: before_cast(25, 2420190, GARROTE),
        expected: { certainty: "EXACT", presence: "ACTIVE", anchorReportTimeMs: 2416180 },
      }),
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(235, RUPTURE, 25, "DEBUFF"),
        at: before_cast(25, 2421196, ENVENOM),
        expected: { certainty: "EXACT", presence: "ACTIVE", anchorReportTimeMs: 2418188 },
      }),
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(235, RUPTURE, 25, "DEBUFF"),
        at: end_of(2418000),
        expected: unknown("AMBIGUOUS_INITIAL_STATE"),
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Complete coverage from the pull proves what happened inside the window; it says nothing about auras that were already up when the window began. A pre-pull Stealth is the real shape of that rule — the analyzer sees it end without ever seeing it start — and AMBIGUOUS_INITIAL_STATE is the honest answer until the first observation. Nothing about the subject's 100 % parse enters here.",
    { related: ["tests/regression/m4-aura-state-never-invents-windows.test.ts"] },
  ),
  kase(
    "combat-state.high-parse-opener-resource-snapshots-anchors-and-proven-absences",
    "wcl-assassination-high-parse-opener",
    "COMBAT_STATE",
    "src/engine/resources/resource-observations.ts; src/engine/state/combat-state.ts lastObservedCast; state-result.ts gateAbsenceClaim",
    "The opener's own snapshots: the first Garrote at 250/250 Energy costing 45 (PRE_COST); the first Envenom at 5/7 combo points costing 5 with 176/250 Energy costing 35; the 2,424,184 Envenom at 7/7 costing 7. Anchors: the last Deathmark before the window's end is 2,422,192 and the last Kingsbane 2,423,194; the last Garrote before the Rupture decision is the opener at 2,416,180. PROVEN absences, earned by COMPLETE CASTS coverage from the fight start: no Vanish and no Shiv in the first 20 s, and no Deathmark before the first Envenom.",
    [
      a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
        actorId: 25,
        abilityGameId: GARROTE,
        reportTimeMs: 2416180,
        resourceWireType: 3,
        expected: {
          certainty: "EXACT",
          observedAmount: 250,
          observedMax: 250,
          observedCost: 45,
          timing: "PRE_COST",
        },
      }),
      a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
        actorId: 25,
        abilityGameId: ENVENOM,
        reportTimeMs: 2421196,
        resourceWireType: 4,
        expected: {
          certainty: "EXACT",
          observedAmount: 5,
          observedMax: 7,
          observedCost: 5,
          timing: "PRE_COST",
        },
      }),
      a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
        actorId: 25,
        abilityGameId: ENVENOM,
        reportTimeMs: 2421196,
        resourceWireType: 3,
        expected: {
          certainty: "EXACT",
          observedAmount: 176,
          observedMax: 250,
          observedCost: 35,
          timing: "PRE_COST",
        },
      }),
      a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
        actorId: 25,
        abilityGameId: ENVENOM,
        reportTimeMs: 2424184,
        resourceWireType: 4,
        expected: {
          certainty: "EXACT",
          observedAmount: 7,
          observedMax: 7,
          observedCost: 7,
          timing: "PRE_COST",
        },
      }),
      a("COMBAT_STATE.LAST_OBSERVED_CAST_AT", {
        actorId: 25,
        abilityGameId: DEATHMARK,
        at: end_of(2435041),
        expectedReportTimeMs: 2422192,
      }),
      a("COMBAT_STATE.LAST_OBSERVED_CAST_AT", {
        actorId: 25,
        abilityGameId: KINGSBANE,
        at: end_of(2435041),
        expectedReportTimeMs: 2423194,
      }),
      a("COMBAT_STATE.LAST_OBSERVED_CAST_AT", {
        actorId: 25,
        abilityGameId: GARROTE,
        at: before_cast(25, 2418187, RUPTURE),
        expectedReportTimeMs: 2416180,
      }),
      a("COMBAT_STATE.LAST_OBSERVED_CAST_PROVEN_ABSENT", {
        actorId: 25,
        abilityGameId: VANISH_ACTION,
        at: end_of(2435041),
      }),
      a("COMBAT_STATE.LAST_OBSERVED_CAST_PROVEN_ABSENT", {
        actorId: 25,
        abilityGameId: SHIV,
        at: end_of(2435041),
      }),
      a("COMBAT_STATE.LAST_OBSERVED_CAST_PROVEN_ABSENT", {
        actorId: 25,
        abilityGameId: DEATHMARK,
        at: before_cast(25, 2421196, ENVENOM),
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "This is the first artifact whose CASTS grant begins at the fight start, so it is the first place the corpus can say 'never cast' and mean it: the absence gate finds COMPLETE coverage over [fight start .. locator] for actor 25 and answers EXACT null. The same gate answers INSUFFICIENT_COVERAGE on the D2 slice (combat-state.partial-grant-cannot-prove-absence-before-it-begins), whose grant begins 160 s into the pull. Resource facts are the casts' own PRE_COST snapshots, never simulated.",
    {
      related: [
        "tests/regression/m4-state-never-invents-absence.test.ts",
        "tests/regression/m4-resource-state-is-never-simulated.test.ts",
      ],
    },
  ),
  kase(
    "spec-assassination.high-parse-build-resolves-improved-garrote-and-shrouded-suffocation",
    "wcl-assassination-high-parse-opener",
    "SPEC_ASSASSINATION",
    "src/data/game/rogue-talents.ts resolveTalentSelection",
    "Actor 25's real build from the pull combatantinfo: improved_garrote SELECTED by its own entry 112510 and shrouded_suffocation by 112669; improved_ambush NOT_SELECTED because node 90692 carries Tight Spender; blindside and crimson_tempest UNKNOWN because their nodes are absent from the tree, and absence is never read as 'not taken'.",
    [
      a("SPEC_ASSASSINATION.TALENT_RESOLUTION", {
        actorId: 25,
        simcName: "improved_garrote",
        expected: "SELECTED",
      }),
      a("SPEC_ASSASSINATION.TALENT_RESOLUTION", {
        actorId: 25,
        simcName: "shrouded_suffocation",
        expected: "SELECTED",
      }),
      a("SPEC_ASSASSINATION.TALENT_RESOLUTION", {
        actorId: 25,
        simcName: "improved_ambush",
        expected: "NOT_SELECTED",
      }),
      a("SPEC_ASSASSINATION.TALENT_RESOLUTION", { actorId: 25, simcName: "blindside", expected: "UNKNOWN" }),
      a("SPEC_ASSASSINATION.TALENT_RESOLUTION", {
        actorId: 25,
        simcName: "crimson_tempest",
        expected: "UNKNOWN",
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "A second real build, the same three rules. The 100 % subject and the 58 % subject share the same answers on these five talents, which says nothing about either player and everything about the rule resting on entries that are present.",
    { related: ["tests/unit/rogue-talents.test.ts"] },
  ),
  kase(
    "spec-assassination.high-parse-opener-garrote-remains-derives-and-rupture-refuses",
    "wcl-assassination-high-parse-opener",
    "SPEC_ASSASSINATION",
    "src/specs/rogue/assassination/dot-remains-state.ts bindDotRemains; src/data/game/rogue-dot-durations.json",
    "Garrote remaining on boss 235 immediately before the second Garrote at 2,420,190 is 13,990 ms from the 2,416,180 anchor, and 16,994 ms before the first Envenom from the 2,420,190 re-application. Rupture refuses: COMBO_POINTS_AT_APPLICATION_UNKNOWN, because in this report the Rupture cast (2,418,187, 7/7 combo points on the cast) and its applydebuff (2,418,188) sit one millisecond apart, and the derivation only reads combo points from a cast at the application's own instant.",
    [
      a("SPEC_ASSASSINATION.DOT_REMAINS", {
        actorId: 25,
        targetActorId: 235,
        simcToken: "garrote",
        atCast: cast(25, 2420190, GARROTE),
        expected: { state: "KNOWN", remainsMs: 13990, anchorReportTimeMs: 2416180 },
      }),
      a("SPEC_ASSASSINATION.DOT_REMAINS", {
        actorId: 25,
        targetActorId: 235,
        simcToken: "garrote",
        atCast: cast(25, 2421196, ENVENOM),
        expected: { state: "KNOWN", remainsMs: 16994, anchorReportTimeMs: 2420190 },
      }),
      a("SPEC_ASSASSINATION.DOT_REMAINS", {
        actorId: 25,
        targetActorId: 235,
        simcToken: "rupture",
        atCast: cast(25, 2421196, ENVENOM),
        expected: { state: "UNKNOWN", blocker: "COMBO_POINTS_AT_APPLICATION_UNKNOWN" },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The Garrote arithmetic is the D2 derivation on a second report and a second anchor shape (the opener itself). The Rupture refusal is a REAL finding: Warcraft Logs recorded the application one millisecond after the cast, the same-instant rule does not match them, and the derivation fails closed rather than guess the combo points. Whether a bounded cast-to-application tolerance is sound is an M11 question; the corpus records the fact.",
    {
      authority: {
        ...DOTS,
        requiredStateEvidence: [
          "applydebuff 703 by 25 on 235 at 2,416,180 and its re-application at 2,420,190 (the anchors)",
          "the Rupture cast at 2,418,187 carrying classResources type 4: 7 / 7 cost 7, and its applydebuff at 2,418,188",
          "every aura event targeting 25 or 235 in [2,415,041 .. 2,435,041], order preserved",
        ],
      },
      limitations: [
        "The 18,000 ms Garrote base duration is pinned DBC data; nothing here derives it.",
        "The Rupture refusal pins current behaviour, not a verdict on whether it should be refused.",
      ],
      related: ["tests/regression/m5c3a-garrote-remains-and-core-dot.test.ts"],
    },
  ),
  kase(
    "spec-assassination.high-parse-opener-garrote-from-pre-pull-stealth-stays-unknown",
    "wcl-assassination-high-parse-opener",
    "SPEC_ASSASSINATION",
    "src/specs/rogue/assassination/observed-analysis.ts; decision-coverage.ts OBSERVED_STATE_MISSING",
    "The 100 %-bracket subject's opener Garrote at 2,416,180 is UNKNOWN: AUTHORITY_SELECTION_UNRESOLVED with the OBSERVED_STATE_MISSING blocker, no token, no precision, not rejected. The scan has no definite winner because the state it needs is not in the retained evidence — Stealth is AMBIGUOUS at every instant before its observed removal (the case above), and no cooldown or DoT has an anchor before the first cast of the pull.",
    [
      a("SPEC_ASSASSINATION.DECISION_COVERAGE", {
        actorId: 25,
        targetActorId: 235,
        observedCast: { reportTimeMs: 2416180, abilityGameId: GARROTE },
        expected: {
          outcome: "UNKNOWN",
          basis: "AUTHORITY_SELECTION_UNRESOLVED",
          authorityCoverage: "UNKNOWN",
          authorityToken: null,
          selectionPrecision: null,
          decisiveBlocker: "OBSERVED_STATE_MISSING",
          observedActionRejected: false,
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "Performance context is selection context only, and this is the case that shows it: the top parse on the board gets the same UNKNOWN the D2 subject gets when the state is not there. An opener from pre-pull stealth cannot be verified from a window that starts at the pull, whoever is playing, and the facade never falls through a blocked priority list to a confident MATCH.",
    {
      authority: {
        ...SIMC,
        requiredStateEvidence: [
          "Stealth 1784 on 25: only the removebuff at 2,416,179 is observed; application predates the window",
          "combatantinfo for actor 25 (talent tree) at 2,415,041",
          "no observed Deathmark, Kingsbane or Vanish cast before 2,416,180",
        ],
      },
      limitations: [
        "Pins that the selection is unresolved and why the retained state cannot resolve it; it does not enumerate the blocking APL line.",
        "A capture beginning before the pull would retain the Stealth application and might resolve this decision; the corpus does not hold one.",
      ],
      related: ["tests/regression/m5c2-vanish-stealth-and-ambush-gate.test.ts"],
    },
  ),
  kase(
    "spec-assassination.high-parse-opener-envenom-at-five-combo-points-stays-unknown",
    "wcl-assassination-high-parse-opener",
    "SPEC_ASSASSINATION",
    "src/specs/rogue/assassination/observed-analysis.ts; spend-selection.ts NO_DEFINITE_WINNER",
    "The subject's Envenom at 2,433,177 — 5/7 combo points costing 5, 243/250 Energy, after Deathmark (2,422,192) and Kingsbane (2,423,194) were both observed — is still UNKNOWN with OBSERVED_STATE_MISSING and not rejected: the spend gate is not violated (5 >= 5 in the no-Darkest-Night world), but the ordered scan reaches no definite winner, and an unresolved higher-priority line contaminates every lower selection.",
    [
      a("SPEC_ASSASSINATION.DECISION_COVERAGE", {
        actorId: 25,
        targetActorId: 235,
        observedCast: { reportTimeMs: 2433177, abilityGameId: ENVENOM },
        expected: {
          outcome: "UNKNOWN",
          basis: "AUTHORITY_SELECTION_UNRESOLVED",
          authorityCoverage: "UNKNOWN",
          authorityToken: null,
          selectionPrecision: null,
          decisiveBlocker: "OBSERVED_STATE_MISSING",
          observedActionRejected: false,
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "CLAUDE.md's priority short-circuit on a second report: UNKNOWN on a higher-priority line is never laundered into a lower-priority verdict. All eleven eligible decisions in this window resolve UNKNOWN / OBSERVED_STATE_MISSING (0 MATCH, 0 REJECTED), against 1 MATCH of 11 on the D2 window that begins 160 s into its pull with anchors already observed. The difference is evidence, not play.",
    {
      authority: {
        ...SIMC,
        requiredStateEvidence: [
          "the Envenom cast at 2,433,177 carrying classResources type 4: 5 / 7 cost 5 and type 3: 243 / 250 cost 35",
          "Deathmark at 2,422,192 and Kingsbane at 2,423,194 as the only cooldown anchors in the window",
          "combatantinfo for actor 25 (talent tree) at 2,415,041",
        ],
      },
      limitations: [
        "Pins the unresolved selection; which line blocks is not enumerated by the facade's comparison record.",
        "Not a claim that the Envenom was wrong or right: MATCH = AUTHORITY_COMPATIBLE_ONLY and this is not even that.",
      ],
      related: ["tests/regression/m5d2-decision-corpus.test.ts"],
    },
  ),
  kase(
    "application-service.high-parse-subject-is-analyzed-under-player-context",
    "wcl-assassination-high-parse-opener",
    "APPLICATION_SERVICE",
    "src/services/analysis-service.ts analyzeFight; ingestion-scope.ts",
    "Over the second report's opener slice, actor 25 as Rogue/Assassination is ANALYZED by the registered analyzer under the derived PLAYER_CONTEXT scope — the same envelope the D2 subject gets.",
    [
      a("APPLICATION_SERVICE.FIGHT_ANALYSIS", {
        subject: { actorId: 25, className: "Rogue", specName: "Assassination" },
        expected: {
          status: "ANALYZED",
          specId: "rogue/assassination",
          analyzerId: "rogue-assassination-observed-decisions",
          scope: "PLAYER_CONTEXT",
        },
      }),
    ],
    ["OWNED_CONTRACT"],
    "The service's dispatch and scope derivation do not depend on which report the evidence came from, and ANALYZED is a status about the analyzer having run — here it ran and resolved nothing, which the public document discloses as coverage.",
    { related: ["tests/unit/analysis-service.test.ts"] },
  ),
  // ---- APPLICATION_SERVICE (M6) ----------------------------------------
  kase(
    "application-service.derives-player-context-scope-and-selects-the-assassination-analyzer",
    D2,
    "APPLICATION_SERVICE",
    "src/services/analysis-service.ts analyzeFight; ingestion-scope.ts deriveIngestionScope; analyzer-registry.ts",
    "With preflight and ingestion faked over the D2 corpus and everything between them production, actor 19 as Rogue/Assassination is ANALYZED by the registered analyzer under the PLAYER_CONTEXT scope that analyzer's own requirement derives — not a scope any caller chose.",
    [
      a("APPLICATION_SERVICE.FIGHT_ANALYSIS", {
        subject: { actorId: 19, className: "Rogue", specName: "Assassination" },
        expected: {
          status: "ANALYZED",
          specId: "rogue/assassination",
          analyzerId: "rogue-assassination-observed-decisions",
          scope: "PLAYER_CONTEXT",
        },
      }),
    ],
    ["OWNED_CONTRACT"],
    "The service derives ingestion scope from the requirement of THE analyzer that runs; a request cannot narrow it and the registry cannot widen it. The analyzer id and spec id are disclosed so a report can say which evaluator spoke.",
    { related: ["tests/unit/analysis-service.test.ts", "tests/unit/ingestion-scope.test.ts"] },
  ),
  kase(
    "application-service.unsupported-spec-runs-no-analyzer-and-retrieves-nothing",
    D2,
    "APPLICATION_SERVICE",
    "src/services/analysis-service.ts unsupportedSpec; spec-identity.ts",
    "The same actor identified as Warrior/Arms — the canonical unsupported identity, a real participant of the same A7R6 kill — yields SPEC_NOT_SUPPORTED from the service with no spec, no analyzer and a null scope: nothing was retrieved because nothing was going to read it, and the status is explicit rather than an empty report.",
    [
      a("APPLICATION_SERVICE.FIGHT_ANALYSIS", {
        subject: { actorId: 19, className: "Warrior", specName: "Arms" },
        expected: { status: "SPEC_NOT_SUPPORTED", specId: null, analyzerId: null, scope: null },
      }),
    ],
    ["OWNED_CONTRACT"],
    "An unsupported specialization is fully determined by identity, so the service answers before spending a single Warcraft Logs point on events — and it answers with a status, never with a well-formed report of zero findings that reads as clean play. (Until M10-D this case used Paladin/Protection, which is supported now.)",
    { related: ["tests/unit/analysis-service.test.ts", "tests/unit/analysis-composition-refusals.test.ts"] },
  ),

  // ---- PUBLIC_CONTRACT: external references (M8-F/M8-H) -----------------
  kase(
    "public-contract.encounter-context-parity-with-external-references-over-a-real-ranking-page",
    D2,
    "PUBLIC_CONTRACT",
    "src/contracts/encounter-context-contract.ts external references; src/external-context/*; src/wcl/rankings/rankings-decoder.ts",
    "An external-enabled encounter-context request whose ranking port serves the real sanitized Sszorak page and whose candidate metadata is a stated synthetic report per candidate: the discovery COMPLETES on REST and MCP as one document; 8 hidden rows are ineligible; the 5 candidates nearest the subject's 307,910 ms are selected in one ranking request and 5 metadata requests; the one whose report answers null is a candidate-local REPORT_NOT_ACCESSIBLE failure; the other 4 are QUALIFIED, published in ascending coordinate order, and every one carries comparability UNKNOWN. Local progression still carries the subject's pull.",
    [
      a("PUBLIC_CONTRACT.REST_MCP_PARITY", {
        document: "ENCOUNTER_CONTEXT",
        fightIds: [1],
        subjectFightId: 1,
        subject: { actorId: 19 },
        subjectFight: { encounterId: 3420, difficulty: 4, durationMs: 307910 },
        external: {
          rankingsArtifactId: "wcl-encounter-rankings-sszorak-page-1",
          rankingPort: "SERVE",
          metadataUnavailableFor: ["RANK0064AAAAAAAA"],
          className: "Rogue",
          specName: "Assassination",
        },
        expected: {
          externalReferenceStatus: "COMPLETED",
          qualified: 4,
          failures: 1,
          ineligible: 8,
          comparability: "UNKNOWN",
          metadataRequests: 5,
          rankingRequests: 1,
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "External references are context, never authority: the document publishes coordinates and UNKNOWN comparability, no score and no 'better'. The request bound is structural — one ranking page, at most MAX_QUALIFIED_CANDIDATES metadata lookups — and the ordering is identity (reportCode, fightId), so no consumer can recover a merit order. One candidate failing leaves the other four untouched.",
    {
      limitations: [
        "Candidate metadata is SYNTHETIC per candidate (the corpus holds no third-party report); the ranking rows are real and sanitized. The subject's encounter facts are a stated premise on the orchestration fixture: Sszorak heroic, 307,910 ms — a real Sszorak heroic duration, not this fixture's events' own fight.",
        "The partition the request pins (1) is the analyzer's explicit choice; the captured board's partition was OMITTED and is not vouched for.",
      ],
      related: [
        "tests/unit/m8f-external-discovery.test.ts",
        "tests/integration/m8h-encounter-context-transports.test.ts",
      ],
    },
  ),
  kase(
    "public-contract.encounter-context-external-transport-failure-preserves-local-progression",
    D2,
    "PUBLIC_CONTRACT",
    "src/services/encounter-context-service.ts; src/wcl/rankings/external-ports.ts failure classification",
    "The same request with a ranking port that fails as the production adapter fails (PAYLOAD_UNRECOGNISED, never an empty pool): the document reports PAYLOAD_UNRECOGNISED on both transports, issues zero candidate metadata requests, and the local progression half is unchanged and still carries the subject's pull.",
    [
      a("PUBLIC_CONTRACT.REST_MCP_PARITY", {
        document: "ENCOUNTER_CONTEXT",
        fightIds: [1],
        subjectFightId: 1,
        subject: { actorId: 19 },
        subjectFight: { encounterId: 3420, difficulty: 4, durationMs: 307910 },
        external: {
          rankingsArtifactId: "wcl-encounter-rankings-sszorak-page-1",
          rankingPort: "TRANSPORT_FAILURE",
          metadataUnavailableFor: [],
          className: "Rogue",
          specName: "Assassination",
        },
        expected: { externalReferenceStatus: "PAYLOAD_UNRECOGNISED" },
      }),
    ],
    ["OWNED_CONTRACT"],
    "The local half completes before the external half begins and the external half cannot modify it. A failed board is 'we did not obtain a pool', which is distinct from 'the pool is empty' and from 'the subject is not in a sequence'; the status names it and no metadata request is spent on a pool that was never obtained.",
    { related: ["tests/integration/m8h-encounter-context-transports.test.ts"] },
  ),

  // ---- M10-B: Protection Paladin evidence ---------------------------------
  kase(
    "wcl-transport.identity-resolves-the-protection-paladin-of-the-a7r6-kill",
    A7R6_CONTEXT,
    "WCL_TRANSPORT",
    "src/wcl/identity.ts resolveFightIdentity over decodeFightContext",
    "The committed A7R6 context resolves actor 7 as a Paladin whose spec at its roster index is Protection — the machine-verifiable identity M10-B's capture was planned against and re-verified live (revision 30 before and after the capture). The same report's actor 6 resolves as a Retribution Paladin, so the class alone never implies the spec; pet 37, whose petOwner is 7, is not a player.",
    [
      a("WCL_TRANSPORT.FIGHT_IDENTITY", {
        fightId: 7,
        sourceId: TANK,
        expected: {
          ok: true,
          className: "Paladin",
          specName: "Protection",
          playerName: "Actor7",
          reportRevision: 30,
          logVersion: 17,
          gameVersion: 1,
        },
      }),
      a("WCL_TRANSPORT.FIGHT_IDENTITY", {
        fightId: 7,
        sourceId: 6,
        expected: {
          ok: true,
          className: "Paladin",
          specName: "Retribution",
          playerName: "Actor6",
          reportRevision: 30,
          logVersion: 17,
          gameVersion: 1,
        },
      }),
      a("WCL_TRANSPORT.FIGHT_IDENTITY", {
        fightId: 7,
        sourceId: 37,
        expected: { ok: false, reason: "SOURCE_NOT_A_PLAYER" },
      }),
      // M10-D: the canonical UNSUPPORTED identity, machine-pinned from the same capture.
      a("WCL_TRANSPORT.FIGHT_IDENTITY", {
        fightId: 7,
        sourceId: ARMS,
        expected: {
          ok: true,
          className: "Warrior",
          specName: "Arms",
          playerName: "Actor4",
          reportRevision: 30,
          logVersion: 17,
          gameVersion: 1,
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Identity is read from masterData subType and friendlySpecs at the roster index and from nothing else. A Protection Paladin and a Retribution Paladin in one kill resolve to different specializations from one class, and the tank's own pet is refused as a subject. Actor 4 is the Arms Warrior every unsupported-path case names since M10-D: a real participant of this kill, not an invented pair.",
    { related: ["tests/unit/wcl-identity.test.ts", "tests/unit/spec-identity.test.ts"] },
  ),
  kase(
    "normalization.protection-paladin-opener-slice-normalizes-whole-and-in-order",
    PP,
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts; supported-families.ts",
    "The 988-event actor-7 slice normalizes with every raw type recognised, every event kept in capture order, an 11-event millisecond run (2,008,051: four absorbs, two damage, two applydebuff, three removebuff) retained whole, and the first damage taken read as boss 21 → actor 7 from the verified field names.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 988 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.TIMESTAMP_RUN_RETAINED", { reportTimeMs: 2008051, count: 11 }),
      a("NORMALIZATION.SIDE_REFERENCE", {
        index: 77,
        side: "SOURCE",
        expected: { kind: "ACTOR", actorId: BOSS_21, instanceId: null },
      }),
      a("NORMALIZATION.SIDE_REFERENCE", {
        index: 77,
        side: "TARGET",
        expected: { kind: "ACTOR", actorId: TANK, instanceId: null },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "A tank's slice is dominated by events that happen TO the actor; every one of the seventeen raw types it holds is already under contract, and direction is read from sourceID/targetID, never inferred from who the subject is.",
    {
      related: [
        "tests/unit/supported-families.test.ts",
        "tests/regression/ingestion-preserves-event-order.test.ts",
      ],
    },
  ),
  kase(
    "normalization.protection-paladin-slice-census-for-actor-7",
    PP,
    "NORMALIZATION",
    "src/engine/normalization/normalized-events.ts source/target references",
    "What the --actor-slice predicate retained for actor 7, by normalized kind and side, exactly: as SOURCE 45 casts, 17 resource changes, 280 aura transitions, 196 damage, 182 healing, 50 absorbs, 1 summon, 1 combatantinfo; as TARGET 13 casts, 17 resource changes, 181 aura transitions, 36 damage, 159 healing, 55 absorbs. The census is of the slice, never of the fight.",
    [
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", { actorId: TANK, side: "SOURCE", expected: PP_SOURCE_CENSUS }),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", { actorId: TANK, side: "TARGET", expected: PP_TARGET_CENSUS }),
    ],
    ["VALIDATED_EVIDENCE"],
    "Pinning the census is what makes every later count in this milestone checkable against the bytes: a damage-taken view that reported 37 events, or a self-heal classification that produced more than the 159 heals targeting the actor could contain, would be caught here first.",
    { related: ["tests/unit/m9c-sanitize-payloads.test.ts"] },
  ),
  kase(
    "normalization.protection-paladin-damage-taken-is-an-observed-event-with-its-mitigation-fields",
    PP,
    "NORMALIZATION",
    "src/engine/normalization/normalized-events.ts DamageEvent; supported-families.ts decodeDamage",
    "The first damage event targeting the tank (boss 21's melee at 2,008,051) normalizes to DAMAGE with amount 76,501, unmitigatedAmount 1,178,341, mitigatedAmount 731,895, absorbedAmount 369,945, no blocked field, hitType 1, not AoE, not a tick — every value verbatim from the capture and none derived.",
    [
      a("NORMALIZATION.EVENT_FACTS", {
        at: {
          reportTimeMs: 2008051,
          rawType: "damage",
          sourceActorId: BOSS_21,
          targetActorId: TANK,
          abilityGameId: 1,
        },
        expected: {
          kind: "DAMAGE",
          fields: {
            amount: 76501,
            unmitigatedAmount: 1178341,
            mitigatedAmount: 731895,
            absorbedAmount: 369945,
            blockedAmount: null,
            hitType: 1,
            isAoE: false,
            isTick: false,
          },
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Damage intake is an observed event with its mitigation fields, read from the event that carries them. No health continuity, no mitigation effectiveness, no pressure score and no claim that a defensive was needed follows from it — those would be judgments, and this layer forms none.",
    { related: ["tests/unit/supported-families.test.ts"] },
  ),
  kase(
    "normalization.protection-paladin-self-heal-is-source-equals-target-and-received-healing-is-not",
    PP,
    "NORMALIZATION",
    "src/engine/normalization/normalized-events.ts HealingEvent",
    "The tank's first self-heal (ability 469,421 at 2,004,687, source 7 → target 7) normalizes to HEALING with amount 0 and overhealAmount 698 — a fully overhealed tick-less heal, recorded as observed. A heal received from actor 10 (61,295 at 2,005,272) is HEALING with source ≠ target: healing received, not self-healing. Neither carries a judgment of necessity or efficiency.",
    [
      a("NORMALIZATION.EVENT_FACTS", {
        at: {
          reportTimeMs: 2004687,
          rawType: "heal",
          sourceActorId: TANK,
          targetActorId: TANK,
          abilityGameId: 469421,
        },
        expected: {
          kind: "HEALING",
          fields: { amount: 0, overhealAmount: 698, absorbedAmount: null, hitType: 1, isTick: false },
        },
      }),
      a("NORMALIZATION.EVENT_FACTS", {
        at: {
          reportTimeMs: 2005272,
          rawType: "heal",
          sourceActorId: 10,
          targetActorId: TANK,
          abilityGameId: 61295,
        },
        expected: { kind: "HEALING", fields: { amount: 0, overhealAmount: 6340, isTick: true } },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Self-healing is a factual classification — source.actorId === target.actorId on a HEALING event — and nothing more. Overheal is an observed field; a fully overhealed self-heal is not 'wasted', and a heal received is not the tank's decision.",
    { related: ["tests/unit/supported-families.test.ts"] },
  ),
  kase(
    "normalization.protection-paladin-absorb-attributes-the-shield-and-the-attacker",
    PP,
    "NORMALIZATION",
    "src/engine/normalization/normalized-events.ts AbsorbEvent; supported-families.ts decodeAbsorb",
    "At the same millisecond as the first melee taken, an absorbed event (source 7 → target 7, ability 209,388) normalizes to ABSORB of kind DAMAGE_ABSORBED for 12,828 with absorbedAbilityGameId 1 (the melee) and attributedActorId 21 (the attacker): the tank's own shield absorbed the boss's hit. Direction and attribution are three separately preserved facts.",
    [
      a("NORMALIZATION.EVENT_FACTS", {
        at: {
          reportTimeMs: 2008051,
          rawType: "absorbed",
          sourceActorId: TANK,
          targetActorId: TANK,
          abilityGameId: 209388,
        },
        expected: {
          kind: "ABSORB",
          fields: {
            absorbKind: "DAMAGE_ABSORBED",
            amount: 12828,
            absorbedAbilityGameId: 1,
            attributedActorId: BOSS_21,
          },
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "An absorb records what was absorbed, by whose aura, from whom. Nothing infers the shield's remaining strength between observations or whether the shield was the right choice.",
    { related: ["tests/unit/supported-families.test.ts"] },
  ),
  kase(
    "normalization.protection-paladin-holy-power-resourcechange-is-an-observation",
    PP,
    "NORMALIZATION",
    "src/engine/normalization/normalized-events.ts ResourceChangeEvent",
    "The tank's first standalone Holy Power change (ability 220,637 at 2,005,436, source 7 → target 7) normalizes to RESOURCE_CHANGE with resourceType 9, resourceChange 1, maxResourceAmount 5, otherResourceChange 0 and reportedWasteAmount 0 — Warcraft Logs' own fields, verbatim, with `waste` preserved as an observed number and not a verdict.",
    [
      a("NORMALIZATION.EVENT_FACTS", {
        at: {
          reportTimeMs: 2005436,
          rawType: "resourcechange",
          sourceActorId: TANK,
          targetActorId: TANK,
          abilityGameId: 220637,
        },
        expected: {
          kind: "RESOURCE_CHANGE",
          fields: {
            resourceType: HOLY_POWER_WIRE,
            resourceChange: 1,
            maxResourceAmount: 5,
            otherResourceChange: 0,
            reportedWasteAmount: 0,
          },
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "A standalone resource change is structurally distinct from an attached snapshot and is never combined with one. It says a generator reported +1; it does not license adding 1 to any earlier amount.",
    { related: PP_RELATED },
  ),
  kase(
    "normalization.protection-paladin-combatantinfo-carries-spec-66-and-an-80-node-talent-tree",
    PP,
    "NORMALIZATION",
    "src/engine/normalization/normalized-events.ts CombatantSnapshot; supported-families.ts decodeCombatantInfo",
    "The tank's combatantinfo at the fight start normalizes to COMBATANT_INFO for actor 7 with specID 66, an 80-entry talentTree and 18 gear pieces. The identifiers are preserved as facts; which talents they are, and whether they are good, is a pinned game-data question this artifact does not answer.",
    [
      a("NORMALIZATION.EVENT_FACTS", {
        at: {
          reportTimeMs: 2004589,
          rawType: "combatantinfo",
          sourceActorId: TANK,
          targetActorId: null,
          abilityGameId: null,
        },
        expected: {
          kind: "COMBATANT_INFO",
          fields: {
            "snapshot.actorId": TANK,
            "snapshot.specId": 66,
            "snapshot.talentTree.length": 80,
            "snapshot.gear.length": 18,
          },
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Spec and talents are read from combatantinfo's typed fields, never from spell usage. No Paladin talent artifact is pinned yet, so no entry resolves to SELECTED or NOT_SELECTED here — the tree is retained so a later resolution can be checked against it.",
    { related: ["tests/unit/supported-families.test.ts"] },
  ),
  kase(
    "normalization.protection-paladin-summon-keeps-the-pet-as-target",
    PP,
    "NORMALIZATION",
    "src/engine/normalization/normalized-events.ts SummonEvent",
    "The tank's summon at 2,026,241 (ability 434,132) normalizes to SUMMON with source 7 and target 37 (instance 1) — the pet the A7R6 master data links to petOwner 7. The pet's own later events were not retained; the summon and the master-data link are the whole of the attribution evidence, and nothing rolls the pet into the player.",
    [
      a("NORMALIZATION.EVENT_FACTS", {
        at: {
          reportTimeMs: 2026241,
          rawType: "summon",
          sourceActorId: TANK,
          targetActorId: 37,
          abilityGameId: 434132,
        },
        expected: { kind: "SUMMON", fields: { "target.instanceId": 1 } },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Pets and guardians are factual actors. A summon says who summoned whom; ownership of what the pet later does is a pinned attribution rule that does not exist yet, so nothing here attributes it.",
    { related: ["tests/unit/supported-families.test.ts"] },
  ),
  kase(
    "combat-state.holy-power-is-pre-cost-on-costed-shield-of-the-righteous-casts",
    PP,
    "COMBAT_STATE",
    "src/engine/resources/resource-observations.ts timingOf; resource-state.ts observationOnEvent; src/data/wcl-wire/resource-types.ts HOLY_POWER",
    "Five completed Shield of the Righteous casts by the tank carry an attached wire-type-9 entry with a positive cost, so each is an EXACT PRE_COST observation: 4, 3, 3, 3 and 3 of a maximum 5, cost 3 — the Holy Power the tank held BEFORE each spend, verbatim.",
    [
      pp_hp_pre_cost(2009098, 4),
      pp_hp_pre_cost(2010926, 3),
      pp_hp_pre_cost(2013247, 3),
      pp_hp_pre_cost(2016930, 3),
      pp_hp_pre_cost(2019725, 3),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "The PRE_COST contract is the same one established for combo points and Energy: a COMPLETED cast plus a positive cost on THIS resource entry. Holy Power's wire type is corroborated by this capture (type 9 on the two Paladins of the fight only, always max 5, always cost 3 when costed); the enum alone would not have licensed it.",
    { related: PP_RELATED },
  ),
  kase(
    "combat-state.missing-holy-power-entry-is-no-observation-not-zero",
    PP,
    "COMBAT_STATE",
    "src/engine/resources/resource-state.ts observationOnEvent (NO_OBSERVATION)",
    "Two completed Shield of the Righteous casts by the tank (2,013,772 and 2,025,524) carry a mana entry but NO wire-type-9 entry at all. Asked for Holy Power on them, the state layer answers UNKNOWN / NO_OBSERVATION. A real spender cast with no resource snapshot is exactly the shape that would become a false 'cast at zero Holy Power' if absence were read as zero.",
    [pp_no_observation(2013772, HOLY_POWER_WIRE), pp_no_observation(2025524, HOLY_POWER_WIRE)],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "The sharpest negative evidence in the tank slice, and the Paladin counterpart of the Envenom at 2,090,898 with no combo-point entry: absence of an entry is absence of an observation. Nothing may replay the surrounding +1 changes to fill it in.",
    { related: PP_RELATED },
  ),
  kase(
    "combat-state.holy-power-is-isolated-from-combo-points-energy-and-mana",
    PP,
    "COMBAT_STATE",
    "src/engine/resources/resource-state.ts observationOnEvent; src/data/wcl-wire/resource-types.ts",
    "On the tank's first costed Shield of the Righteous, asking for wire type 4 (combo points) or 3 (Energy) yields NO_OBSERVATION: the Holy Power entry answers only a Holy Power question. On the uncosted cast at 2,013,772 the attached mana entry (type 0, 250,000 of 250,000, no cost) is EXACT but EVENT_ASSOCIATED — a snapshot with no established before/after — and still no Holy Power.",
    [
      pp_no_observation(2009098, 4),
      pp_no_observation(2009098, 3),
      a("COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST", {
        actorId: TANK,
        abilityGameId: SHIELD_OF_THE_RIGHTEOUS,
        reportTimeMs: 2013772,
        resourceWireType: 0,
        expected: {
          certainty: "EXACT",
          observedAmount: 250000,
          observedMax: 250000,
          observedCost: null,
          timing: "EVENT_ASSOCIATED",
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Adding a third wire contract must not let one resource answer for another: the lookup is by wire type on the snapshot the event actually carries. Combo Points and Energy keep their contracts and their evidence unchanged.",
    { related: PP_RELATED },
  ),
  kase(
    "combat-state.standalone-holy-power-changes-are-observed-never-replayed",
    PP,
    "COMBAT_STATE",
    "src/engine/resources/resource-state.ts latestObservedAtOrBefore",
    "At the end of 2,012,000 the latest Holy Power observation for the tank is the STALE 3-of-5 snapshot on the Shield of the Righteous at 2,010,926 — although two standalone +1 resourcechange events (2,011,115 and 2,011,924) lie between. At the end of 2,014,000 it is the snapshot at 2,013,247, not the uncosted cast at 2,013,772 that carried no entry. The instant before the cast at 2,010,926 the latest observation is the STALE 4-of-5 on the first costed cast at 2,009,098 — not 5 or more, which replaying the +1 changes at 2,009,535 and 2,010,338 would have produced. Before the first costed cast there is no observation at all: the +1 changes at 2,005,436 and 2,006,478 do not manufacture one.",
    [
      a("COMBAT_STATE.LATEST_RESOURCE_OBSERVATION", {
        actorId: TANK,
        resourceWireType: HOLY_POWER_WIRE,
        at: end_of(2012000),
        expected: { certainty: "STALE", observedAmount: 3, observedAtReportTimeMs: 2010926 },
      }),
      a("COMBAT_STATE.LATEST_RESOURCE_OBSERVATION", {
        actorId: TANK,
        resourceWireType: HOLY_POWER_WIRE,
        at: end_of(2014000),
        expected: { certainty: "STALE", observedAmount: 3, observedAtReportTimeMs: 2013247 },
      }),
      a("COMBAT_STATE.LATEST_RESOURCE_OBSERVATION", {
        actorId: TANK,
        resourceWireType: HOLY_POWER_WIRE,
        at: before_cast(TANK, 2010926, SHIELD_OF_THE_RIGHTEOUS),
        expected: { certainty: "STALE", observedAmount: 4, observedAtReportTimeMs: 2009098 },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "The resource surface is an observation layer, not a simulator. A generator's +1 is reported where it happened and is never added to an earlier amount to produce a later one; between observations Holy Power stays STALE or unknown, never reconstructed.",
    { related: PP_RELATED },
  ),
  kase(
    "combat-state.protection-paladin-absence-is-proven-only-under-complete-coverage",
    PP,
    "COMBAT_STATE",
    "src/engine/state/combat-state.ts lastObservedCast; state-result.ts gateAbsenceClaim",
    "Over the slice's window, which the grant covers COMPLETE from the fight start for actor 7, the tank provably never completed a cast of ability 31,884 — a proven absence, not an inferred one — and the last completed cast of ability 31,850 is at 2,010,252.",
    [
      a("COMBAT_STATE.LAST_OBSERVED_CAST_PROVEN_ABSENT", {
        actorId: TANK,
        abilityGameId: AVENGING_WRATH,
        at: end_of(PP_END_OF_SLICE),
      }),
      a("COMBAT_STATE.LAST_OBSERVED_CAST_AT", {
        actorId: TANK,
        abilityGameId: ARDENT_DEFENDER,
        at: end_of(PP_END_OF_SLICE),
        expectedReportTimeMs: 2010252,
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "'They never cast it' is sayable only when capability is OBSERVABLE, the actor is in scope and coverage is COMPLETE across the interval. The --actor-slice grant is what makes it sayable here; the gap derivation below is what takes it away.",
    { related: ["tests/regression/m4-state-never-invents-absence.test.ts"] },
  ),
  kase(
    "combat-state.protection-paladin-aura-is-observed-at-transitions-and-ambiguous-before-its-first",
    PP,
    "COMBAT_STATE",
    "src/engine/auras/aura-state.ts presenceAt",
    "The buff 31,850 the tank applied to itself is observed APPLIED at 2,010,252 and REMOVED at 2,022,254. Before its first observed transition its state is UNKNOWN / AMBIGUOUS_INITIAL_STATE even though coverage is complete from the pull; at 2,011,000 and 2,020,000 it is ACTIVE on the application; at the end of the slice INACTIVE on the removal.",
    [
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(TANK, ARDENT_DEFENDER, TANK),
        at: end_of(2004600),
        expected: unknown("AMBIGUOUS_INITIAL_STATE"),
      }),
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(TANK, ARDENT_DEFENDER, TANK),
        at: end_of(2011000),
        expected: { certainty: "EXACT", presence: "ACTIVE", anchorReportTimeMs: 2010252 },
      }),
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(TANK, ARDENT_DEFENDER, TANK),
        at: end_of(2020000),
        expected: { certainty: "EXACT", presence: "ACTIVE", anchorReportTimeMs: 2010252 },
      }),
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(TANK, ARDENT_DEFENDER, TANK),
        at: end_of(PP_END_OF_SLICE),
        expected: { certainty: "EXACT", presence: "INACTIVE", anchorReportTimeMs: 2022254 },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Aura state rests on observed transitions only. Silence before the first transition is not INACTIVE, and the source is the one the event named (the tank itself), never inferred. Whether 31,850 is a 'defensive' is a game-data classification no state case makes.",
    { related: ["tests/regression/m4-aura-state-never-inverts-direction.test.ts"] },
  ),
  kase(
    "combat-state.protection-paladin-index-exposes-damage-taken-healing-and-absorbs",
    PP,
    "COMBAT_STATE",
    "src/engine/state/indexes.ts positionsBySourceActor / positionsByTargetActor",
    "M4's target index for actor 7 yields exactly the 36 damage, 159 healing, 55 absorb, 181 aura, 17 resource-change and 13 cast events that name the tank as target, and its source index the 45 casts, 17 resource changes, 280 aura transitions, 196 damage, 182 healing, 50 absorbs, one summon and one combatantinfo it sourced — every position resolving to an event whose named side is the tank. This is the whole of the damage-intake, healing and absorb surface M10-C consumes: observed events with locators, and no view that sums, scores or models them.",
    [
      a("COMBAT_STATE.ACTOR_INDEX_CENSUS", { actorId: TANK, side: "TARGET", expected: PP_TARGET_CENSUS }),
      a("COMBAT_STATE.ACTOR_INDEX_CENSUS", { actorId: TANK, side: "SOURCE", expected: PP_SOURCE_CENSUS }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "The existing indexes already expose everything a tank evaluator needs as facts, so M10-B adds no damage-intake, healing or absorb wrapper: a wrapper would either restate the index or start aggregating, and aggregation is where a 'pressure score' or a health model would creep in.",
    { related: ["tests/unit/combat-state.test.ts"] },
  ),
  kase(
    "normalization.protection-paladin-gap-derivation-keeps-824-events-in-order",
    PP_GAP,
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts",
    "The gap derivation holds exactly 824 of the parent's 988 events — the combatantinfo at the fight start and everything from 2,010,059 on — in the parent's order, every type still recognised.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 824 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
    ],
    ["VALIDATED_EVIDENCE"],
    "A derivation is judged on what it holds, and the count is what ties the recorded removal (164 events) to the bytes.",
    { related: ["tests/unit/m9b-corpus-harness.test.ts"] },
  ),
  kase(
    "combat-state.protection-paladin-gap-before-2010000-fails-closed",
    PP_GAP,
    "COMBAT_STATE",
    "src/engine/state/state-result.ts gateAbsenceClaim; aura-state.ts presenceAt; resource-state.ts latestObservedAtOrBefore",
    "With every event between the fight start and 2,010,000 removed and the grant clipped to begin at 2,010,000, the window still starts at the fight start (the combatantinfo was kept), so coverage is PARTIAL: the absence of ability 31,884 is no longer provable (UNKNOWN / INSUFFICIENT_COVERAGE), the last Shield of the Righteous before 2,009,500 is unknowable rather than 'none', and buff 31,850's state at 2,005,000 is INSUFFICIENT_COVERAGE — while at 2,020,000, inside the retained range, it is still ACTIVE on the retained application.",
    [
      a("COMBAT_STATE.LAST_OBSERVED_CAST_UNKNOWN", {
        actorId: TANK,
        abilityGameId: AVENGING_WRATH,
        reason: "INSUFFICIENT_COVERAGE",
      }),
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(TANK, ARDENT_DEFENDER, TANK),
        at: end_of(2005000),
        expected: unknown("INSUFFICIENT_COVERAGE"),
      }),
      a("COMBAT_STATE.AURA_PRESENCE", {
        aura: aura(TANK, ARDENT_DEFENDER, TANK),
        at: end_of(2020000),
        expected: { certainty: "EXACT", presence: "ACTIVE", anchorReportTimeMs: 2010252 },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Truncated evidence returns UNKNOWN, never a negative fact. The same questions the parent answers with proven absence and observed presence are refused the moment the coverage no longer reaches them, and the retained range keeps its answers.",
    {
      related: [
        "tests/regression/m4-state-never-invents-absence.test.ts",
        "tests/unit/m9b-corpus-harness.test.ts",
      ],
    },
  ),
  kase(
    "application-service.protection-paladin-subject-is-analyzed-under-player-context",
    PP,
    "APPLICATION_SERVICE",
    "src/services/analysis-service.ts; spec-identity.ts; analyzer-registry.ts (M10-D public catalog)",
    "The real Protection Paladin subject, over its own captured evidence, is recognized as paladin/protection, dispatched to the Protection analyzer, ingested at PLAYER_CONTEXT with resources, and reported ANALYZED. (From M10-B to M10-C this case pinned SPEC_NOT_SUPPORTED; M10-D moved the id into the public partition, the identity table and a PUBLIC registration together.)",
    [
      a("APPLICATION_SERVICE.FIGHT_ANALYSIS", {
        subject: { actorId: TANK, className: "Paladin", specName: "Protection" },
        expected: PROT_ANALYZED_ENVELOPE,
      }),
    ],
    ["OWNED_CONTRACT"],
    "The service derives ingestion scope from the requirement of THE analyzer that runs, and discloses the analyzer and spec ids so a report can say which evaluator spoke. ANALYZED maps to the PARTIAL service state: 21 eligible decisions, none resolved, is disclosed as coverage rather than read as clean play.",
    {
      related: [
        "tests/regression/m10d-public-second-registration-invariance.test.ts",
        "tests/contracts/m10d-public-registration.test.ts",
      ],
    },
  ),
  kase(
    "application-service.arms-warrior-subject-is-unsupported-on-the-same-evidence",
    PP,
    "APPLICATION_SERVICE",
    "src/services/analysis-service.ts unsupportedSpec; spec-identity.ts",
    "Actor 4 of the same fight, the Arms Warrior the committed context proves, yields SPEC_NOT_SUPPORTED from the service with no spec, no analyzer and a null scope. The slice holds none of actor 4's events, and none is needed: the answer is fully determined by identity, before any retrieval.",
    [
      a("APPLICATION_SERVICE.FIGHT_ANALYSIS", {
        subject: { actorId: ARMS, className: "Warrior", specName: "Arms" },
        expected: { status: "SPEC_NOT_SUPPORTED", specId: null, analyzerId: null, scope: null },
      }),
    ],
    ["OWNED_CONTRACT"],
    "The unsupported path Protection Paladin used to prove, kept by a real captured identity that remains unsupported. Neither registered analyzer runs and nothing is ingested.",
    {
      related: [
        "tests/regression/m10d-public-second-registration-invariance.test.ts",
        "tests/unit/analysis-composition-refusals.test.ts",
      ],
    },
  ),
  kase(
    "public-contract.analysis-parity-for-the-protection-paladin-subject",
    PP,
    "PUBLIC_CONTRACT",
    "src/contracts/analysis-projection.ts; src/api/worker.ts; src/mcp/tools/analyze-warcraft-log.ts",
    "The real Protection Paladin subject over its own evidence is ANALYZED on both transports — one document naming paladin/protection and the Protection analyzer, identical on REST and MCP (structuredContent and text), schema-valid under warcraft-logs-coach.analysis/1, publishing MATCH as AUTHORITY_COMPATIBLE_ONLY. (From M10-B to M10-C this case pinned SPEC_NOT_SUPPORTED.)",
    [
      a("PUBLIC_CONTRACT.REST_MCP_PARITY", {
        document: "ANALYSIS",
        subject: { actorId: TANK, className: "Paladin", specName: "Protection" },
        expected: { status: "ANALYZED", specId: "paladin/protection", analyzerId: PROT_ANALYZER },
      }),
    ],
    ["OWNED_CONTRACT"],
    "The schema version is unchanged: growing the public specId enum is how supported specializations arrive, and no document a consumer had already received changed. Every decision UNKNOWN is carried as coverage, not hidden.",
    {
      related: [
        "tests/regression/m10d-public-second-registration-invariance.test.ts",
        "tests/contracts/m10a-spec-partition.test.ts",
      ],
    },
  ),
  kase(
    "public-contract.analysis-parity-for-the-arms-warrior-subject",
    PP,
    "PUBLIC_CONTRACT",
    "src/contracts/analysis-contract.ts (SPEC_NOT_SUPPORTED variant); src/api/worker.ts; src/mcp/tools/analyze-warcraft-log.ts",
    "Actor 4 of the same fight, the Arms Warrior, yields SPEC_NOT_SUPPORTED on both transports — one well-formed document with specialization.specId null and analyzerId null, identical on REST and MCP, schema-valid under warcraft-logs-coach.analysis/1.",
    [
      a("PUBLIC_CONTRACT.REST_MCP_PARITY", {
        document: "ANALYSIS",
        subject: { actorId: ARMS, className: "Warrior", specName: "Arms" },
        expected: { status: "SPEC_NOT_SUPPORTED", specId: null, analyzerId: null },
      }),
    ],
    ["OWNED_CONTRACT"],
    "The genuine unsupported article since M10-D: a real captured identity with no analyzer. An unsupported specialization must not produce an empty report that reads as clean play, and both transports say so identically.",
    {
      related: [
        "tests/regression/m10d-public-second-registration-invariance.test.ts",
        "tests/integration/transport-consistency.test.ts",
      ],
    },
  ),
  kase(
    "public-contract.raid-night-parity-mixed-roster-over-the-a7r6-opener",
    PP,
    "PUBLIC_CONTRACT",
    "src/contracts/raid-night-contract.ts; src/services/raid-night-service.ts; /v1/raid-night; analyze_raid_night",
    "One raid-night request over the A7R6 opener served as ONE core, with a roster of four real participants of that fight: the Protection Paladin (actor 7) is ANALYZED under paladin/protection; the Assassination Rogue (actor 19) has none of its evidence in the slice and its analyzer answers PROFILE_NOT_RESOLVED; the Arms Warrior (actor 4) is SPEC_NOT_SUPPORTED; the Blood Death Knight (actor 14) is ABSENT. One document on REST and MCP, one ingestion.",
    [
      a("PUBLIC_CONTRACT.REST_MCP_PARITY", {
        document: "RAID_NIGHT",
        fightIds: [7],
        subject: { actorId: TANK },
        composition: {
          participants: [
            { sourceId: TANK, className: "Paladin", specName: "Protection", absent: false },
            { sourceId: 19, className: "Rogue", specName: "Assassination", absent: false },
            { sourceId: ARMS, className: "Warrior", specName: "Arms", absent: false },
            { sourceId: 14, className: "DeathKnight", specName: "Blood", absent: true },
          ],
        },
        expected: {
          analyzedCells: 1,
          cells: [
            { sourceId: TANK, kind: "ANALYZED", specId: "paladin/protection" },
            { sourceId: 19, kind: "NOT_ANALYZED", status: "PROFILE_NOT_RESOLVED" },
            { sourceId: ARMS, kind: "NOT_ANALYZED", status: "SPEC_NOT_SUPPORTED" },
            { sourceId: 14, kind: "ABSENT" },
          ],
        },
      }),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Nothing is relabelled and no Rogue evidence is manufactured: the Rogue's cell is the analyzer's own truthful answer to a slice that holds none of its events, never an ANALYZED cell built from nothing. Both public analyzers dispatch from one ingestion, and the unsupported and absent players cost nothing.",
    {
      limitations: [
        "The roster identities are the committed fight-context artifact's; the core is the opener slice, which describes actor 7 only, so no other participant can be ANALYZED over it.",
      ],
      related: ["tests/regression/m10d-mixed-raid-night.test.ts"],
    },
  ),

  // ---- SPEC_PROTECTION_PALADIN (M10-C) -------------------------------------
  kase(
    "application-service.protection-paladin-registration-is-public",
    PP,
    "APPLICATION_SERVICE",
    "src/services/analyzer-registry.ts internalAnalyzerForSpec, analyzerForSpec; spec-identity.ts",
    "The validated production catalog carries the Protection Paladin registration for BOTH lookups, PUBLIC, in either catalog order, and the public identity table resolves Paladin/Protection. Assassination resolves on both lookups and its identity resolves, exactly as before. (From M10-C to M10-D the registration was INTERNAL_ONLY: real to the internal lookup, invisible to the public one.)",
    [
      a("APPLICATION_SERVICE.INTERNAL_REGISTRATION", {
        specId: "paladin/protection",
        expected: {
          internalAnalyzerId: PROT_ANALYZER,
          publicAnalyzerId: PROT_ANALYZER,
          exposure: "PUBLIC",
          identityResolvesPublicly: true,
        },
      }),
      a("APPLICATION_SERVICE.INTERNAL_REGISTRATION", {
        specId: "rogue/assassination",
        expected: {
          internalAnalyzerId: "rogue-assassination-observed-decisions",
          publicAnalyzerId: "rogue-assassination-observed-decisions",
          exposure: "PUBLIC",
          identityResolvesPublicly: true,
        },
      }),
    ],
    ["OWNED_CONTRACT"],
    "An evaluator has to exist, be registered and be exercised BEFORE it is safe to expose; M10-C did that internally and M10-D exposed it. The registry validates that the public set, the identity table and the partition agree, so the three could not have moved separately.",
    {
      related: [
        "tests/contracts/m10a-registry-integrity.test.ts",
        "tests/contracts/m10d-public-registration.test.ts",
        ...PP_C_RELATED,
      ],
    },
  ),
  kase(
    "spec-protection-paladin.pinned-authority-loads-with-exact-provenance",
    PP,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/pinned-authority.ts; authority-bindings.ts; registration.ts",
    "Run through its registration, the Protection evaluator analyzes actor 7 under SIMC_APL_PALADIN_PROTECTION at simc-33622e9d-1, citing commit 33622e9d… and the apl_paladin.cpp source digest ed3fb1ac… — read off the loaded artifact, not typed here.",
    [a("SPEC_PROTECTION_PALADIN.AUTHORITY_PROVENANCE", { actorId: TANK, expected: PP_PROVENANCE })],
    ["PINNED_AUTHORITY", "OWNED_CONTRACT"],
    "The registration binds this one authority to OFFENSIVE_ROTATION and delivers it through the M10-A authority-access boundary; the registry re-checks id, revision, commit and specialization against what load() yields. A verdict that cannot say which bytes it rested on is not one this corpus records.",
    { authority: PP_AUTHORITY, related: PP_C_RELATED },
  ),
  kase(
    "spec-protection-paladin.opener-yields-twenty-one-eligible-decisions-all-unknown",
    PP,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/observed-analysis.ts analyzeObservedProtectionPaladinDecisions",
    "Over the subject's 45 completed casts the evaluator finds 21 eligible GCD decisions and excludes 24 by name: 11 melee swings (Warcraft Logs' melee flag), 11 NON_GCD presses (7 Shield of the Righteous, Ardent Defender, Hand of Reckoning, Divine Steed, Sentinel — all _gcd 0 in the pinned dataset), 1 ability with no pinned lane (the on-use trinket effect 1297761), 1 GCD ability with no authority token (Blessing of Spellwarding). Every eligible decision is UNKNOWN; none is MATCH and none is REJECTED.",
    [
      a("SPEC_PROTECTION_PALADIN.COVERAGE_SUMMARY", {
        actorId: TANK,
        expected: {
          eligibleDecisions: 21,
          match: 0,
          rejected: 0,
          unknown: 21,
          exclusions: {
            MELEE_SWING: 11,
            NON_GCD_ACTION: 11,
            EXECUTION_LANE_NOT_ESTABLISHED: 1,
            NO_AUTHORITY_TOKEN_BINDING: 1,
          },
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The denominator is the observed GCD decisions the authority could be asked about and nothing else; every other cast is counted under the reason it was set aside, never dropped. Zero resolved decisions is the truthful measure of M10-C's coverage on this pull, and it is disclosed rather than flattered: Protection's primary spender is off the GCD, and the first unmodelled entry of the pinned list bounds every scan.",
    {
      authority: PP_AUTHORITY,
      limitations: [
        "Shield of the Righteous casts are NON_GCD and therefore not GCD decisions to the shared first-GCD query; their Holy Power is recorded as evidence, not judged.",
        "No decision resolves on this evidence: every NON_GCD entry above the first GCD candidate transitions (use_item NOT_APPLICABLE; use_items, potion, avenging_wrath, fireblood and shield_of_the_righteous by reviewed contract), and the scan then reaches GCD candidates whose readiness the 22 s window cannot establish — Divine Toll (60 s cooldown, no cast in the window, pre-pull state outside the log) in the branch where wings fired, Holy Armaments (Lightsmith alternation state unobservable), Hammer of Wrath, Avenger's Shield and Judgment's recharge — so the explored worlds select different first GCD entries.",
      ],
      related: PP_C_RELATED,
    },
  ),
  kase(
    "spec-protection-paladin.real-decisions-are-unknown-because-the-worlds-diverge-not-rejected",
    PP,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/first-gcd-adapter.ts; src/specs/paladin/protection/action-profile.ts; src/data/game/paladin-protection-transition-authority.ts; src/simc/first-gcd-selection.ts; src/findings/observed-comparison.ts",
    "The first Judgment (2,005,436), the first Blessed Hammer (2,006,478), the first Avenger's Shield (2,013,520) and the first Consecration (2,015,953) are each compared and each stay UNKNOWN: the scan passes default[1] use_item (NOT_APPLICABLE), transitions default[2] use_items (the set closed under the dated Warcraft Logs gear contract; the Ula'tek use is deterministic and writes only a stat buff at the instant), default[3] potion, default[4] avenging_wrath (wings overlaid in that branch), default[5] fireblood and default[8] shield_of_the_righteous (cost 3 from the pinned power table; every atom it may change is unbound), and then explores each GCD candidate with unknown readiness as the one that fires. Those branches select different entries — default[6] divine_toll where wings fired, default[9] holy_armaments otherwise — so the engine reports DIVERGENT_GCD_OUTCOMES, carried under the DIVERGENT_WORLDS class.",
    [
      pp_decision(2005436, PP_JUDGMENT),
      pp_decision(2006478, PP_BLESSED_HAMMER),
      pp_decision(2013520, PP_AVENGERS_SHIELD),
      pp_decision(2015953, PP_CONSECRATION),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "A GCD entry whose readiness the evidence cannot establish is neither assumed ready nor assumed on cooldown: the world where it fires and the world where it does not are both explored, and the decision resolves only if they agree. Here they do not, and the disagreement is reported at its earliest entry. No observed press is REJECTED, because every entry naming these tokens includes an unconditional line the authority could always select; none is MATCH, because a higher-priority candidate might have fired.",
    { authority: PP_AUTHORITY, related: PP_C_RELATED },
  ),
  kase(
    "spec-protection-paladin.exact-holy-power-is-recorded-on-costed-spender-casts",
    PP,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/observed-analysis.ts holyPowerOn; src/engine/resources/resource-state.ts observationOnEvent",
    "The evaluator records the Holy Power the wire carried on each costed Shield of the Righteous cast — 4, 3, 3, 3, 3 of 5 at cost 3 — as EXACT_PRE_COST observations attached to the excluded NON_GCD casts.",
    [
      pp_hp_recorded(2009098, 4),
      pp_hp_recorded(2010926, 3),
      pp_hp_recorded(2013247, 3),
      pp_hp_recorded(2016930, 3),
      pp_hp_recorded(2019725, 3),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "Exact Holy Power exists exactly where the wire observed it. The evaluator reads it through M4's observation accessor and reports it as what it is — an amount before the cast's own cost — with no replay, no regeneration and no post-cost arithmetic. It is recorded as evidence about the fight, not used to judge the spender: no resource-spending authority is pinned.",
    { authority: PP_AUTHORITY, related: PP_C_RELATED },
  ),
  kase(
    "spec-protection-paladin.missing-holy-power-is-no-observation-never-zero",
    PP,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/observed-analysis.ts holyPowerOn",
    "The two completed Shield of the Righteous casts that carry no Holy Power entry (2,013,772 and 2,025,524), and every uncosted press such as the Judgment at 2,005,436 and the Blessed Hammer at 2,006,478, are recorded as NO_OBSERVATION. Their occurrence proves they fired; it proves no amount.",
    [
      pp_hp_missing(2013772, SHIELD_OF_THE_RIGHTEOUS),
      pp_hp_missing(2025524, SHIELD_OF_THE_RIGHTEOUS),
      pp_hp_missing(2005436, PP_JUDGMENT),
      pp_hp_missing(2006478, PP_BLESSED_HAMMER),
    ],
    ["OWNED_CONTRACT", "VALIDATED_EVIDENCE"],
    "A successful spender cast with no attached entry is not evidence of a free proc and not evidence of an exact pre-cast value; the evaluator states NO_OBSERVATION and infers nothing. A future evaluator that needs the amount must treat these as UNKNOWN decisions.",
    { authority: PP_AUTHORITY, related: PP_C_RELATED },
  ),
  kase(
    "spec-protection-paladin.resolver-binds-the-build-facts-the-real-tree-proves",
    PP,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/resolver.ts resolveProtectionAtoms; vocabulary.ts; src/data/game/paladin-protection-talents.json",
    "At the first Judgment, the Protection resolver binds talent.righteous_protector.enabled TRUE (entry 102440 at node 81477), hero_tree.lightsmith TRUE (fourteen observed entries belong to pinned sub-tree 49), apex.3 TRUE (entry 137020, the third tiered trait in table order), the armament constants sacred_weapon = 1 and holy_bulwark = 0, states gcd as UNKNOWN_NUMBER / STATE_NOT_MODELLED and next_armament as UNKNOWN_NUMBER / STATE_NOT_ESTABLISHED (modelled since M10-C5 Phase B, but no Holy Armaments hardcast precedes the first press). consecration.up is left UNBOUND (the 14,000 ms longest duration before the press reaches before the pull), and prev_gcd.1.divine_toll is UNBOUND at the first press because no GCD cast precedes it in the evidence; at the Blessed Hammer that follows it is FALSE, the previous GCD press being that Judgment.",
    [
      pp_atom(2005436, PP_JUDGMENT, "talent.righteous_protector.enabled", { kind: "TRUTH", value: true }),
      pp_atom(2005436, PP_JUDGMENT, "hero_tree.lightsmith", { kind: "TRUTH", value: true }),
      pp_atom(2005436, PP_JUDGMENT, "apex.3", { kind: "TRUTH", value: true }),
      pp_atom(2005436, PP_JUDGMENT, "sacred_weapon", {
        kind: "MAGNITUDE",
        state: "KNOWN_NUMBER",
        value: 1,
        reason: null,
      }),
      pp_atom(2005436, PP_JUDGMENT, "holy_bulwark", {
        kind: "MAGNITUDE",
        state: "KNOWN_NUMBER",
        value: 0,
        reason: null,
      }),
      pp_atom(2005436, PP_JUDGMENT, "next_armament", {
        kind: "MAGNITUDE",
        state: "UNKNOWN_NUMBER",
        value: null,
        reason: "STATE_NOT_ESTABLISHED",
      }),
      pp_atom(2005436, PP_JUDGMENT, "gcd", {
        kind: "MAGNITUDE",
        state: "UNKNOWN_NUMBER",
        value: null,
        reason: "STATE_NOT_MODELLED",
      }),
      pp_atom(2005436, PP_JUDGMENT, "consecration.up", { kind: "UNBOUND" }),
      pp_atom(2005436, PP_JUDGMENT, "prev_gcd.1.divine_toll", { kind: "UNBOUND" }),
      pp_atom(2006478, PP_BLESSED_HAMMER, "prev_gcd.1.divine_toll", { kind: "TRUTH", value: false }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "Each binding is a reading of the pinned source (player.cpp for talent.x.enabled, hero_tree and apex; sc_paladin.cpp for next_armament and the armament constants; action.cpp for prev_gcd) applied to a fact the evidence PROVES. What the evidence cannot prove — whether the tank's own Consecration is still down, the Lightsmith alternation state before any observed hardcast, a GCD length — is left unbound or stated unestablished / unmodelled, never defaulted. The previous-GCD walk steps over the Hand of Reckoning (NON_GCD) and the melee swings, and claims a press only under COMPLETE cast coverage between it and the decision.",
    { authority: PP_AUTHORITY, related: PP_C_RELATED },
  ),
  kase(
    "spec-protection-paladin.use-items-sub-action-set-closes-under-the-dated-gear-contract",
    PP,
    "SPEC_PROTECTION_PALADIN",
    "src/engine/normalization/combatant-info.ts (WCL_COMBATANT_INFO_GEAR_UI_SEMANTICS_2026_09_17); src/specs/paladin/protection/action-profile.ts wornSubActionSet; src/data/game/paladin-protection-item-effects.ts; src/data/game/paladin-protection-enchant-effects.ts",
    "Against the subject's seventeen worn items under the dated Warcraft Logs gear contract: every omitted permanentEnchant, temporaryEnchant and gems key normalises to KNOWN_NONE (38 of them), every present enchant and gem is pinned as not use-producing, and exactly one pinned item-sourced on-use effect remains — Voracious Heart of Ula'tek (270175). No slot is open and the equivalence proof had nothing to close. Had any identity been present-but-null, the M10-C2 census and the M10-C3 equivalence proof would have kept the slot open with its exact blocking candidates (pinned by the unit tests over a null-identity copy of this gear).",
    [
      a("SPEC_PROTECTION_PALADIN.USE_ITEMS_SUB_ACTION_SET", {
        actorId: TANK,
        expected: {
          onUseItemIds: [270175],
          open: [],
          openSlotIndices: [],
          provenIrrelevant: 0,
          divineInspiration: "SELECTED",
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "An omitted gear key means 'none' for exactly one reason: Warcraft Logs stated in writing on 2026-09-17 that omission is how its own UI reads these fields, with no further guarantee. That reading lives in one adapter under one revision identifier; a present-but-null or malformed value is still UNKNOWN everywhere, and payload drift is localised to that adapter.",
    {
      authority: PP_AUTHORITY,
      related: [...PP_C_RELATED, "tests/unit/m10c-protection-meta-actions.test.ts"],
    },
  ),
  kase(
    "spec-protection-paladin.build-resolves-from-the-observed-tree-not-from-casts",
    PP,
    "SPEC_PROTECTION_PALADIN",
    "src/data/game/paladin-protection-talents.ts; src/data/game/talent-selection.ts",
    "The subject's build, from combatantinfo alone: Righteous Protector SELECTED, Sentinel SELECTED, Avenging Wrath SELECTED, Blessed Hammer SELECTED (so Hammer of the Righteous is NOT_SELECTED at the shared choice node), and the Lightsmith hero tree RESOLVED by entry membership.",
    [
      a("SPEC_PROTECTION_PALADIN.BUILD_RESOLUTION", {
        actorId: TANK,
        expected: {
          talents: {
            righteous_protector: "SELECTED",
            sentinel: "SELECTED",
            avenging_wrath: "SELECTED",
            blessed_hammer: "SELECTED",
          },
          heroTree: { state: "RESOLVED", simcName: "lightsmith" },
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "Talent selection is decided by trait ENTRY number against the pinned table, hero tree by sub-tree membership of observed entries. The subject's Sentinel cast at 2,026,241 corroborates nothing here and is not consulted: a cast is not a talent fact.",
    { authority: PP_AUTHORITY, related: PP_C_RELATED },
  ),
  kase(
    "spec-protection-paladin.offensive-authority-governs-no-defensive-domain",
    PP,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/domains.ts; authority-bindings.ts; src/findings/authority-domain.ts",
    "The payload represents all six domains separately: OFFENSIVE_ROTATION is AUTHORITY_AVAILABLE under SIMC_APL_PALADIN_PROTECTION; RESOURCE_SPENDING, ACTIVE_MITIGATION, DEFENSIVE_COOLDOWN and SELF_HEALING resolve NO_PINNED_AUTHORITY_FOR_DOMAIN with the offensive authority explicitly not governing them; INTERRUPT resolves the same AND states the evidence family UNVERIFIED, separately.",
    [
      pp_domain("OFFENSIVE_ROTATION", {
        resolution: "AUTHORITY_AVAILABLE",
        authorityId: "SIMC_APL_PALADIN_PROTECTION",
        offensiveAuthorityGoverns: null,
        evidenceFamily: null,
      }),
      pp_domain("RESOURCE_SPENDING", PP_NO_AUTHORITY),
      pp_domain("ACTIVE_MITIGATION", PP_NO_AUTHORITY),
      pp_domain("DEFENSIVE_COOLDOWN", PP_NO_AUTHORITY),
      pp_domain("SELF_HEALING", PP_NO_AUTHORITY),
      pp_domain("INTERRUPT", { ...PP_NO_AUTHORITY, evidenceFamily: "UNVERIFIED" }),
    ],
    ["OWNED_CONTRACT", "PINNED_AUTHORITY"],
    "NO_PINNED_AUTHORITY_FOR_DOMAIN is a missing standard, not missing evidence; UNVERIFIED is missing evidence, not a missing standard. Both are read from the registration's own authority access and from completeness, never hard-coded, and neither is ever rendered as a defensive verdict or as 'no interrupts were used'. A SimulationCraft binding for any defensive domain is refused by PROVIDER_DOMAIN_COMPATIBILITY before it could reach here.",
    { authority: PP_AUTHORITY, related: ["tests/contracts/m10a-authority-domains.test.ts", ...PP_C_RELATED] },
  ),
  kase(
    "spec-protection-paladin.gap-derivation-evaluates-fewer-decisions-and-binds-no-previous-press",
    PP_GAP,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/observed-analysis.ts; resolver.ts previousGcdCastAt",
    "With the first 5.4 s removed, the evaluator finds 16 eligible decisions (all UNKNOWN) over 20 exclusions, the first Blessed Hammer at 2,010,338 is compared and refuses exactly as on the parent, and prev_gcd.1.divine_toll is UNBOUND there because no GCD cast precedes it in the retained evidence.",
    [
      a("SPEC_PROTECTION_PALADIN.COVERAGE_SUMMARY", {
        actorId: TANK,
        expected: {
          eligibleDecisions: 16,
          match: 0,
          rejected: 0,
          unknown: 16,
          exclusions: {
            MELEE_SWING: 9,
            NON_GCD_ACTION: 9,
            EXECUTION_LANE_NOT_ESTABLISHED: 1,
            NO_AUTHORITY_TOKEN_BINDING: 1,
          },
        },
      }),
      pp_decision(2010338, PP_BLESSED_HAMMER),
      pp_atom(2010338, PP_BLESSED_HAMMER, "prev_gcd.1.divine_toll", { kind: "UNBOUND" }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "Truncated evidence shrinks the population and withholds the previous-press claim; it does not change what a retained decision resolves to, and it never produces a value for a press that was not retained. The removed Shield of the Righteous at 2,009,098 is gone from the payload, not zero.",
    { authority: PP_AUTHORITY, related: PP_C_RELATED },
  ),
  // ---- M10-C5 Phase A: the 45-second population ------------------------
  kase(
    "normalization.protection-paladin-rotational-45s-normalizes-whole-and-in-order",
    PP45,
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts; supported-families.ts",
    "The 1,093-event family-filtered actor-7 slice normalizes with every raw type recognised and every event kept in capture order: as SOURCE 101 casts, 43 Holy Power changes, 801 aura transitions, 1 combatantinfo; as TARGET 32 casts, 43 resource changes, 502 aura transitions. No damage, healing, absorb or summon event is present, by the recorded family filter.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 1093 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", { actorId: TANK, side: "SOURCE", expected: PP45_SOURCE_CENSUS }),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", { actorId: TANK, side: "TARGET", expected: PP45_TARGET_CENSUS }),
    ],
    ["VALIDATED_EVIDENCE"],
    "The census is of the slice, never of the fight: exactly the families the --families option retained, complete for actor 7 over the whole capture, and nothing of the families it dropped. The 101 casts are the raw population every evaluator count below partitions.",
    { related: ["tests/unit/sanitize-probe.test.ts", "tests/unit/derive-gap.test.ts"] },
  ),
  kase(
    "normalization.protection-paladin-rotational-45s-gap-keeps-681-events-in-order",
    PP45_GAP,
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts; scripts/corpus/derive-gap.mjs",
    "The predeclared gap derivation holds exactly 681 of the parent's 1,093 events — the combatantinfo at the fight start and everything from 2,026,628 on — in the parent's order, every type still recognised; 56 of the subject's casts remain as SOURCE.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 681 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", {
        actorId: TANK,
        side: "SOURCE",
        expected: { COMBATANT_INFO: 1, CAST: 56, RESOURCE_CHANGE: 26, AURA: 521 },
      }),
    ],
    ["VALIDATED_EVIDENCE"],
    "The boundary (2,026,589) was fixed by M10-B before this derivative existed and is recorded in the transformation; the count ties the recorded removal (412 events) to the bytes, and the committed tool reproduces the M10-B gap derivative byte for byte from the opener.",
    { related: ["tests/unit/derive-gap.test.ts"] },
  ),
  kase(
    "spec-protection-paladin.rotational-45s-population-is-forty-seven-selected-before-any-outcome",
    PP45,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/observed-analysis.ts analyzeObservedProtectionPaladinDecisions",
    "Over the subject's 101 completed casts the evaluator finds 47 eligible GCD decisions and excludes 54 by name: 28 melee swings, 23 NON_GCD presses (19 Shield of the Righteous, Sentinel, Ardent Defender, Hand of Reckoning, Divine Steed), 2 abilities with no pinned lane (the Ula'tek trinket use 1297761 and the Light's Potential potion 1236616), 1 GCD ability with no authority token (Blessing of Spellwarding). Of the 47: 1 MATCH, 0 REJECTED, 46 UNKNOWN.",
    [
      a("SPEC_PROTECTION_PALADIN.COVERAGE_SUMMARY", {
        actorId: TANK,
        expected: {
          eligibleDecisions: 47,
          match: 1,
          rejected: 0,
          unknown: 46,
          exclusions: {
            MELEE_SWING: 28,
            NON_GCD_ACTION: 23,
            EXECUTION_LANE_NOT_ESTABLISHED: 2,
            NO_AUTHORITY_TOKEN_BINDING: 1,
          },
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The population is every eligible GCD-lane cast in the whole slice, enumerated mechanically from the normalized fight and fixed by the exclusion rules alone — the same rules the opener used, over a longer window. The 47 were predeclared from the raw cast counts before the evaluator ran; nothing was trimmed to isolate the one decision that resolves.",
    {
      authority: PP45_AUTHORITY,
      limitations: [
        "Shield of the Righteous casts are NON_GCD and therefore not GCD decisions to the shared first-GCD query; their Holy Power is recorded as evidence, not judged.",
      ],
      related: PP_C5_RELATED,
    },
  ),
  kase(
    "spec-protection-paladin.the-divine-toll-press-is-a-real-exact-entry-match",
    PP45,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/aura-bindings.ts; cooldown-bindings.ts; action-profile.ts resolveProtectionUsability; first-gcd-adapter.ts; src/simc/first-gcd-selection.ts",
    "The Divine Toll press at 2,026,655 (+22,066 ms; canonical position 418) is MATCH by the exact entry default[6] divine_toll. Every higher entry is handled truthfully: default[0] auto_attack, default[2] use_items, default[3] potion and default[5] fireblood are contract-harmless NON_GCD prefixes explored both ways; default[1] use_item is NOT_APPLICABLE; default[4] avenging_wrath is PROVEN_UNUSABLE — the Sentinel press at 2,026,241 anchors the wings cooldown at a base of 60,000 ms (120,000 ms halved by the SELECTED Righteous Protector, per the censused passive effect) with 414 ms elapsed, so at least 59,586 ms remain against a 250 ms queueing tolerance. default[6]'s condition is TRUE from `buff.avenging_wrath.up`, bound TRUE by the Sentinel aura M4 observed applied at 2,026,241, and Divine Toll's own usability is its observed execution. All three race worlds select the same entry.",
    [
      pp_decision_as(2026655, PP_DIVINE_TOLL, PP_MATCH_DIVINE_TOLL),
      pp_cooldown(2026655, PP_DIVINE_TOLL, "avenging_wrath", pp_not_ready(59586, 2026241, PP_SENTINEL)),
      pp_cooldown(2026655, PP_DIVINE_TOLL, "divine_toll", pp_cd_unknown("NO_OBSERVED_CAST")),
      pp_aura(2026655, PP_DIVINE_TOLL, "avenging_wrath", {
        state: "BOUND",
        up: true,
        abilityGameId: PP_SENTINEL,
        anchorReportTimeMs: 2026241,
        reason: null,
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "A real MATCH needs every higher-priority entry resolved by evidence or reviewed contract and the selected entry's own condition and usability proven — not assumed. Nothing here reads a later event: the aura anchor and the cooldown anchor both precede the decision, and Divine Toll's readiness comes from its own press at this position, which proves usability and nothing about any earlier decision. The pre-pull cooldown state that blocked the opener never enters: Divine Toll's cooldown is UNKNOWN (no observed cast) and irrelevant once its entry is selected by a TRUE gate.",
    { authority: PP45_AUTHORITY, related: PP_C5_RELATED },
  ),
  kase(
    "spec-protection-paladin.every-remaining-unknown-retains-its-blocker-at-two-entries",
    PP45,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/observed-analysis.ts; src/simc/first-gcd-selection.ts",
    "The 46 UNKNOWN decisions block at exactly two entries: 21 at default[6] divine_toll (every decision before the Sentinel press — no wings aura anchor, no cooldown anchor, the pre-pull state outside the log) and 25 at default[9] holy_armaments (every decision after the Divine Toll press — Divine Toll and wings both PROVEN_NOT_READY from their observed casts, and the scan reaches the Lightsmith alternation, whose next_armament no hardcast in the window anchors). The first Hammer of Wrath at 2,027,501 is the first of the 25.",
    [
      a("SPEC_PROTECTION_PALADIN.UNKNOWN_BLOCKER_DISTRIBUTION", {
        actorId: TANK,
        expected: {
          match: 1,
          rejected: 0,
          blockedAt: { "default[6] divine_toll": 21, "default[9] holy_armaments": 25 },
        },
      }),
      pp_decision(2027501, PP_HAMMER_OF_WRATH),
      pp_cooldown(2027501, PP_HAMMER_OF_WRATH, "divine_toll", pp_not_ready(59154, 2026655, PP_DIVINE_TOLL)),
      pp_cooldown(2027501, PP_HAMMER_OF_WRATH, "avenging_wrath", pp_not_ready(58740, 2026241, PP_SENTINEL)),
      pp_decision(2005436, PP_JUDGMENT),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "Complete past history establishes post-cast cooldown state: once Divine Toll has been observed pressed, every later decision knows it cannot fire again for at least 60,000 ms less the elapsed time (Quickened Invocation NOT_SELECTED — its node was spent on Divine Resonance — so the base is exact), and the scan moves past default[6] to the next honest blocker. next_armament stays UNKNOWN throughout Phase A because no identified Holy Armaments hardcast anchors it; a buff transition alone never does.",
    {
      authority: PP45_AUTHORITY,
      limitations: [
        "Decisions before the Sentinel press cannot resolve on this evidence: the wings and Divine Toll cooldown state at the pull is outside the log, and the wings aura has no observed transition before 2,026,241.",
        "Decisions after the Divine Toll press block at default[9] holy_armaments: the Lightsmith alternation state is anchor-only and the window holds no Holy Armaments hardcast.",
      ],
      related: PP_C5_RELATED,
    },
  ),
  kase(
    "spec-protection-paladin.a-later-cast-never-establishes-earlier-state",
    PP45,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/cooldown-bindings.ts; aura-bindings.ts; src/engine/game-state/cooldowns/cooldown-state.ts; src/engine/auras/aura-state.ts",
    "At the Blessed Hammer at 2,025,857 — 384 ms BEFORE the Sentinel press — the wings cooldown is UNKNOWN (NO_OBSERVED_CAST) and the wings aura is UNBOUND (AURA_STATE_UNKNOWN), exactly as at the first Judgment 21 s earlier; the press that follows is not consulted. At the Consecration at 2,048,592, after the Sentinel aura's observed removal at 2,048,248, the atom is BOUND false from that removal.",
    [
      pp_cooldown(2025857, PP_BLESSED_HAMMER, "avenging_wrath", pp_cd_unknown("NO_OBSERVED_CAST")),
      pp_aura(2025857, PP_BLESSED_HAMMER, "avenging_wrath", PP_WINGS_UNBOUND),
      pp_aura(2005436, PP_JUDGMENT, "avenging_wrath", PP_WINGS_UNBOUND),
      pp_aura(2048592, PP_CONSECRATION, "avenging_wrath", {
        state: "BOUND",
        up: false,
        abilityGameId: PP_SENTINEL,
        anchorReportTimeMs: 2048248,
        reason: null,
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The oracle rule, on real evidence: a cooldown is anchored only on a COMPLETE cast strictly before the decision position, and an aura only on a transition M4 observed strictly before it. The same Sentinel press that resolves the Divine Toll decision 414 ms after it proves nothing about the decision 384 ms before it. INACTIVE is a proven state only from an observed removal, never from silence.",
    { authority: PP45_AUTHORITY, related: PP_C5_RELATED },
  ),
  kase(
    "spec-protection-paladin.rotational-45s-gap-restores-unknown-when-the-anchor-is-removed",
    PP45_GAP,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/observed-analysis.ts; cooldown-bindings.ts; aura-bindings.ts",
    "With everything strictly between the fight start and 2,026,589 removed — the Sentinel press and its aura application among it — the same Divine Toll press at 2,026,655 is UNKNOWN again, blocked at default[6] divine_toll: the wings cooldown is UNKNOWN (CAST_STATE_UNKNOWN — the retained evidence no longer covers the interval before the decision) and the wings aura is UNBOUND. The Divine Toll press itself was retained, so at the Hammer of Wrath 846 ms later Divine Toll is still PROVEN_NOT_READY from it. 26 eligible decisions over 30 exclusions; 0 MATCH, 0 REJECTED; 1 blocked at default[6], 25 at default[9].",
    [
      a("SPEC_PROTECTION_PALADIN.COVERAGE_SUMMARY", {
        actorId: TANK,
        expected: {
          eligibleDecisions: 26,
          match: 0,
          rejected: 0,
          unknown: 26,
          exclusions: { MELEE_SWING: 17, NON_GCD_ACTION: 12, EXECUTION_LANE_NOT_ESTABLISHED: 1 },
        },
      }),
      a("SPEC_PROTECTION_PALADIN.UNKNOWN_BLOCKER_DISTRIBUTION", {
        actorId: TANK,
        expected: {
          match: 0,
          rejected: 0,
          blockedAt: { "default[6] divine_toll": 1, "default[9] holy_armaments": 25 },
        },
      }),
      pp_decision(2026655, PP_DIVINE_TOLL),
      pp_cooldown(2026655, PP_DIVINE_TOLL, "avenging_wrath", pp_cd_unknown("CAST_STATE_UNKNOWN")),
      pp_aura(2026655, PP_DIVINE_TOLL, "avenging_wrath", PP_WINGS_UNBOUND),
      pp_cooldown(2027501, PP_HAMMER_OF_WRATH, "divine_toll", pp_not_ready(59154, 2026655, PP_DIVINE_TOLL)),
      pp_cooldown(2027501, PP_HAMMER_OF_WRATH, "avenging_wrath", pp_cd_unknown("CAST_STATE_UNKNOWN")),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The MATCH on the parent rests on retained evidence, and removing that evidence removes the MATCH: no state carries over from a window the derivative does not hold. A decision whose own anchor survived the gap keeps what that anchor proves and nothing more.",
    { authority: PP45_AUTHORITY, related: PP_C5_RELATED },
  ),
  // ---- M10-C5 Phase B2: the steady-state bundle ------------------------
  ...PPB_CASES,
  kase(
    "spec-protection-paladin.assassination-is-refused-at-the-spec-gate",
    PP,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/observed-analysis.ts (spec gate)",
    "Asked about rogue/assassination over this artifact, the Protection facade refuses with SPEC_NOT_SUPPORTED naming that specialization, before any Protection rule, authority load or profile resolution runs.",
    [a("SPEC_PROTECTION_PALADIN.SPEC_GATE", { actorId: TANK, specId: "rogue/assassination" })],
    ["OWNED_CONTRACT"],
    "The mirror of the Assassination spec gate: a facade owns one specialization and answers for no other. Ownership is also enforced at runtime by the registration and the registry, which refuse a result naming another spec or citing a foreign authority.",
    { related: ["tests/regression/m10a-analyzer-result-ownership.test.ts", ...PP_C_RELATED] },
  ),
  kase(
    "spec-protection-paladin.analysis-projects-publicly-with-a-total-reason-mapping",
    PP,
    "SPEC_PROTECTION_PALADIN",
    "src/specs/paladin/protection/registration.ts protectionObservedDecisionView, PROTECTION_EXCLUSION_PUBLIC_PROJECTION; src/contracts/analysis-projection.ts",
    "The analyzed opener result, read through the registration's view and projected by the real public projection, validates against warcraft-logs-coach.analysis/1 and carries 21 eligible / 0 MATCH / 0 REJECTED / 21 UNKNOWN over 24 excluded casts. The internal exclusion tally (11 MELEE_SWING, 11 NON_GCD_ACTION, 1 EXECUTION_LANE_NOT_ESTABLISHED, 1 NO_AUTHORITY_TOKEN_BINDING) projects onto the public vocabulary as NON_GCD_ACTION 22 / EXECUTION_LANE_NOT_ESTABLISHED 1 / NO_AUTHORITY_TOKEN_BINDING 1, summing to the excluded count; no internal-only reason string and no withheld payload field reaches the document. (From M10-C to M10-D this case pinned that the result could NOT be projected.)",
    [
      a("SPEC_PROTECTION_PALADIN.PUBLIC_PROJECTION", {
        actorId: TANK,
        expected: {
          specId: "paladin/protection",
          analyzerId: PROT_ANALYZER,
          eligibleDecisions: 21,
          match: 0,
          rejected: 0,
          unknown: 21,
          excludedCastCount: 24,
          exclusions: {
            NON_GCD_ACTION: 22,
            EXECUTION_LANE_NOT_ESTABLISHED: 1,
            NO_AUTHORITY_TOKEN_BINDING: 1,
          },
        },
      }),
    ],
    ["OWNED_CONTRACT", "PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "A melee swing is positively identified and off the global cooldown, so NON_GCD_ACTION is the truthful public reason for it; the internal payload keeps the finer MELEE_SWING and the public reader loses one bit of precision rather than gaining an untruthful one. The mapping is total by construction and the merged tally still reconciles with the excluded count, which the cell projection re-checks before any aggregate is summed.",
    {
      authority: PP_AUTHORITY,
      related: [
        "tests/contracts/m10d-protection-public-projection.test.ts",
        "tests/contracts/m10a-spec-partition.test.ts",
        ...PP_C_RELATED,
      ],
    },
  ),
  // ---- M11-A4: Retribution Paladin (PUBLIC since M11-A5) ------------------
  ...RET_CASES,
  // ---- M11-B2: Blood Death Knight (PUBLIC since M11-B12) -------------------
  ...BLOOD_CASES,
  // ---- M11-C2: Brewmaster Monk (INTERNAL_ONLY measurement slice) ----------
  ...BREWMASTER_CASES,
];

// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// The evidence archive (M11-C4e)
//
// A SEPARATE committed root, tests/evidence/, for qualifying real evidence
// that does not belong in the executable regression corpus. Same artifact
// and case schema, same provenance vocabulary; different responsibility:
//
//   - its artifacts are SANITIZED_CAPTURE only, 512 KiB each, with a 4 MiB
//     notice line and no total ceiling;
//   - its cases are promotion/evidence verification only — provenance
//     census, bundle composition, decision coverage and the measurement
//     aggregates — and each reads at least one archive artifact;
//   - it may reference regression-corpus artifacts (an archive bundle may
//     begin with a corpus opener); the regression corpus may never reference
//     it, and artifact and case ids are one namespace across both roots;
//   - it is executed by its own command (`npm run test:evidence`) and holds
//     its own committed report; `npm run test:corpus` never loads it.
//
// `node scripts/corpus/build-manifest.mjs --root evidence` writes
// tests/evidence/manifest.json.
// --------------------------------------------------------------------------

const EVIDENCE_ARTIFACTS = [
  // ---- M11-C4f: the second Brewmaster subject's fixed 20–165 s segment ----
  artifact(BREWMASTER_RXAF_20_165, wcl(BREWMASTER_RXAF_20_165), {
    root: "EVIDENCE",
    kind: "SANITIZED_CAPTURE",
    source: RXAF_EVENTS_SOURCE,
    transformations: [
      selection(
        `node scripts/sanitize-probe.mjs .probe/m11c4f/pages.json ../../../evidence/artifacts/wcl-events/${BREWMASTER_RXAF_20_165}.json --actor-slice 11 ${String(RXAF_END)} --from ${String(RXAF_OPENER_END)} --families ${PPB_FAMILIES}`,
        "The seventeen page envelopes concatenated in page order, then the --actor-slice predicate for ACTOR 11 with --from 2,460,995 (exclusive) and the bound 2,605,995 (inclusive, fight start + 165 s — the window fixed before any analyzer ran), restricted by --families to the same thirteen raw types. In place and order preserved, 1,834 of 165,448 events: 286 casts (249 by actor 11, 37 targeting it), no resourcechange, 1,548 aura transitions (1,354 targeting 11, 194 sourced by 11 on others), no combatantinfo; first event 2,461,102, last 2,605,987. It holds 30 Keg Smash, 29 Breath of Fire, 29 Blackout Kick, 33 Tiger Palm, 17 Purifying Brew, 4 Chi Burst, 2 Exploding Keg, 2 Celestial Infusion, 1 Invoke Niuzao and 1 Fortifying Brew cast by actor 11. The output name routes the slicer's write into the evidence archive root.",
        ACTOR_SLICE_INVALIDATIONS,
      ).with_revision(SLICER_REVISION_6),
      credential_scan(SLICER_REVISION_6),
    ],
    grants: [
      {
        categories: PPB_CATEGORIES,
        actorScope: [RXAF_ACTOR],
        ranges: [{ fromReportTimeMs: RXAF_OPENER_END + 1, toReportTimeMs: RXAF_END }],
      },
    ],
    coverageBasis: RXAF_SEGMENT_BASIS,
    retainedFor:
      "M11-C4f: the rest of the neutral second subject's fixed 165 s evidence window, retained regardless of its analyzer outcome and composed with the regression-corpus opener by the bundle composer.",
    limitations: [
      "One segment of a longer window: on its own it grants no coverage before its first millisecond and proves nothing about continuity across its boundaries; only a composed bundle does.",
      "No damage, healing, absorb or summon event is retained.",
      "Cooldown state at the pull is outside the log; what a later decision knows comes from observed casts in the bundle's history.",
      "Sszorak has adds; nothing about target count is claimed here or anywhere in the corpus.",
      NO_NAMES,
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  // ---- M11-C4f: the second subject's fight context (identity for the promotion gate) ----
  artifact(RXAF_CONTEXT, graphql(RXAF_CONTEXT), {
    root: "EVIDENCE",
    kind: "SANITIZED_CAPTURE",
    payloadKind: "WCL_GRAPHQL_DATA",
    source: RXAF_CONTEXT_SOURCE,
    transformations: [
      {
        kind: "FIELD_REDACTION",
        tooling: tooling(
          PAYLOAD_SANITIZER,
          PAYLOAD_SANITIZER_REVISION,
          `node scripts/corpus/sanitize-payloads.mjs context .probe/m11c4f/context-5.json tests/evidence/artifacts/wcl-graphql/${RXAF_CONTEXT}.json`,
        ),
        detail: CONTEXT_REDACTION,
        invalidates: [],
      },
      payload_credential_scan(),
    ],
    coverageBasis:
      "Report context, not events: master data, one fight header, phase transitions, abilities and zone. It grants no event coverage. The actor catalog is complete for the report because master data is unpaginated.",
    retainedFor:
      "M11-C4f: the second Brewmaster subject's report context — the roster and specs the promotion gate's identity proof reads for actor 11 (Player / Monk / Brewmaster) — and the walk's eligibility evidence for candidate 5.",
    limitations: [
      "Names are redacted to `Actor<id>`, servers and player gameIDs to null; a case must never depend on a name beyond its being the redacted form.",
      "The talent import code present is actor 1's (the query argument), uninterpreted; actor 11's build is read from its own combatantinfo in the opener slice.",
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
  artifact(BREWMASTER_GTKB_165_285, wcl(BREWMASTER_GTKB_165_285), {
    root: "EVIDENCE",
    kind: "SANITIZED_CAPTURE",
    source: GTKB_FULL_SOURCE,
    transformations: [
      selection(
        `node scripts/sanitize-probe.mjs .probe/m11c4b-pages.json ${BREWMASTER_GTKB_165_285}.json --actor-slice 4 ${String(GTKB_FULL_END)} --from ${String(GTKB_FULL_START)} --families ${PPB_FAMILIES}`,
        `The ten page envelopes concatenated in page order, then the --actor-slice predicate for ACTOR 4 with --from ${String(GTKB_FULL_START)} (exclusive) and the bound ${String(GTKB_FULL_END)} (inclusive, the fight end), restricted by --families to the same thirteen raw types as the opener slice. In place and order preserved, 1,229 of 91,236 events: 202 casts (169 by actor 4, 33 targeting it), no resourcechange, 1,027 aura transitions (880 targeting 4, 147 sourced by 4 on others), no combatantinfo; first event 2,580,080, last 2,699,831. The --from bound equals the 20–165 s segment's grant end (2,580,041), so the two share no event. It holds 20 Keg Smash, 19 Blackout Kick, 18 Tiger Palm, 18 Breath of Fire, 11 Purifying Brew, 2 Celestial Infusion, 1 Chi Burst and 1 Invoke Niuzao cast by actor 4, and no Exploding Keg, Empty the Cellar, Fortifying Brew or Black Ox Brew cast.`,
        ACTOR_SLICE_INVALIDATIONS,
      ).with_revision(SLICER_REVISION_6),
      credential_scan(SLICER_REVISION_6),
    ],
    grants: [
      {
        categories: PPB_CATEGORIES,
        actorScope: [BREWMASTER_GTKB_ACTOR],
        ranges: [{ fromReportTimeMs: GTKB_FULL_START + 1, toReportTimeMs: GTKB_FULL_END }],
      },
    ],
    coverageBasis: `The retained families are complete for actor 4 over [${(GTKB_FULL_START + 1).toLocaleString("en-US")} .. ${GTKB_FULL_END.toLocaleString("en-US")}] by the predicate 'every event actor 4 sources or is targeted by, of a retained family, with timestamp in that range' over a window the capture retrieved COMPLETE with NO actor filter (ten pages, terminal, revision 22 before and after, equal to the two earlier captures'). CASTS and RESOURCES are complete as the source of its own casts and the actor its snapshots describe; AURAS as their target; COMBATANT_INFO and GEAR as the subject of the combatantinfo the bundle's first part holds. DAMAGE, HEALING, ABSORBS and SUMMONS are NOT granted. The segment is one part of a bundle: it grants nothing before its own first millisecond, and the bundle composer joins it to the 20–165 s segment only because the grants are adjacent (that one's ends at 2,580,041, this one begins at 2,580,042). The window ends at the fight end.`,
    retainedFor:
      "M11-C4b: the Brewmaster Monk full-fight evidence closure — the same subject's +165 s .. fight end, committed under the 512 KiB limit and composed with the opener slice and the 20–165 s segment by the bundle composer. History for every evaluated decision begins at the pull; the whole fight is the evaluation window. The 20 s opener and the 165 s bundle stay their own regression cases.",
    limitations: [
      "One segment of a longer window: on its own it grants no coverage before its first millisecond and proves nothing about continuity across its boundaries; only a composed bundle does.",
      "No damage, healing, absorb or summon event is retained.",
      "Cooldown state at the pull is outside the log; what a later decision knows comes from observed casts in the bundle's history.",
      "Sszorak has adds; nothing about target count is claimed here or anywhere in the corpus.",
      NO_NAMES,
      VERSION_SCOPE,
      WHITESPACE,
    ],
  }),
];

const RXAF_AUTHORITY = {
  ...BREWMASTER_SIMC,
  requiredStateEvidence: [
    "the combatantinfo at 2,440,995 for actor 11 (specID 268)",
    "every COMPLETE cast by actor 11 in the bundle, in canonical order",
    "every aura transition on actor 11 sourced by actor 11, in canonical order",
  ],
};
const RXAF_BUNDLE = { historyArtifactIds: [BREWMASTER_RXAF_OPENER], declaredHoles: [] };

const EVIDENCE_CASES = [
  // ---- M11-C4f: the neutral second subject's fixed 165 s window ----
  kase(
    "normalization.brewmaster-monk-rxaf-seg-20-165-normalizes-whole-and-in-order",
    BREWMASTER_RXAF_20_165,
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts; supported-families.ts; scripts/sanitize-probe.mjs --actor-slice --from",
    "The 1,834-event family-filtered actor-11 segment (fight start + 20 s .. + 165 s) normalizes with every raw type recognised and every event kept in capture order: as SOURCE 249 casts and 1,191 aura transitions; as TARGET 39 casts and 1,354 aura transitions. No resource change involves actor 11. No combatantinfo: the profile is carried by the regression-corpus opener the bundle begins with.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 1834 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", {
        actorId: RXAF_ACTOR,
        side: "SOURCE",
        expected: { CAST: 249, AURA: 1191 },
      }),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", {
        actorId: RXAF_ACTOR,
        side: "TARGET",
        expected: { CAST: 39, AURA: 1354 },
      }),
    ],
    ["VALIDATED_EVIDENCE"],
    "The census is of the segment, never of the fight: exactly the families the --families option retained, between the recorded exclusive --from and inclusive --to bounds, and nothing else.",
    { related: ["tests/unit/sanitize-probe.test.ts", "tests/unit/m11c4f-selection-frame.test.ts"] },
  ),
  kase(
    "normalization.brewmaster-monk-rxaf-165s-bundle-composes-two-parts-across-the-roots",
    BREWMASTER_RXAF_20_165,
    "NORMALIZATION",
    "tests/support/corpus/fight.ts bundleOverEvidence; loader.ts (cross-root references); scripts/corpus/build-manifest.mjs",
    "The two parts of ONE capture — the regression-corpus opener (grant 2,440,995 .. 2,460,995) and the archive segment (granted from 2,460,996) — compose into one 2,165-event fight over [2,440,995 .. 2,605,987] with CASTS, AURAS, RESOURCES, COMBATANT_INFO and GEAR each COMPLETE over ONE joined range [2,440,995 .. 2,605,995]: the whole fixed 165 s window, by adjacency.",
    [
      a("NORMALIZATION.BUNDLE_COMPOSITION", {
        ...RXAF_BUNDLE,
        actorId: RXAF_ACTOR,
        expected: {
          events: 2165,
          coverage: {
            CASTS: "COMPLETE",
            AURAS: "COMPLETE",
            RESOURCES: "COMPLETE",
            COMBATANT_INFO: "COMPLETE",
            GEAR: "COMPLETE",
            DAMAGE: "ABSENT",
            HEALING: "ABSENT",
            ABSORBS: "ABSENT",
            SUMMONS: "ABSENT",
          },
          castRanges: [{ fromReportTimeMs: RXAF_START, toReportTimeMs: RXAF_END }],
          windowFromReportTimeMs: RXAF_START,
          windowToReportTimeMs: 2605987,
        },
      }),
    ],
    ["VALIDATED_EVIDENCE"],
    "Composition is a claim about coverage, never inferred from the bytes: the same composer and refusals as every other bundle, across the two roots.",
    { related: ["tests/unit/m10c5b-corpus-bundle.test.ts", "tests/unit/m11c4e-evidence-archive.test.ts"] },
  ),
  kase(
    "spec-brewmaster-monk.the-second-subjects-fixed-165s-window-measures-one-hundred-thirty-nine-decisions-forty-eight-resolved",
    BREWMASTER_RXAF_20_165,
    "SPEC_BREWMASTER_MONK",
    "src/specs/monk/brewmaster/observed-analysis.ts; first-gcd-adapter.ts; resolver.ts; tests/support/corpus/fight.ts bundleOverEvidence",
    "M11-C4i RE-MEASUREMENT (pinned): 47 MATCH, 1 REJECTED (the Tiger Palm at 2,573,516, against a proven-usable Blackout Kick selected at shado_pan[7]), 91 UNKNOWN — 52 on Empty the Cellar's divergent worlds (shado_pan[11]: its window holds no 1262768 transition, so the corroborated aura is still unanchored), 19 behind Black Ox Brew (shado_pan[3]), 12 on Blackout Kick (shado_pan[7]), 5 on Invoke Niuzao (shado_pan[9]), 2 on Keg Smash (shado_pan[1]), 1 on Tiger Palm (shado_pan[10]). Positive usability (Keg Smash, Blackout Kick, Breath of Fire, Invoke Niuzao: every dimension of the completeness contract proven or not applicable, range STRICT by same-target corroboration) and the Purifying Brew / Empty the Cellar closure (a reviewed Purifying Brew transition: shared internal cooldown, Empty Barrel forgotten, never bound up; Empty the Cellar's wire aura 1262768 corroborated). No earlier resolved outcome changes. BEFORE M11-C4i — THE M11-C4f MEASUREMENT: the unchanged analyzer over the NEUTRAL SECOND subject's fixed 165 s window (rXAfw9t1q8YpmkKD fight 13 actor 11 — Shado-Pan, the same build facts as subject 1), selected by the fixed rule before any analyzer ran and retained regardless of outcome. 139 eligible decisions — 35 Keg Smash, 35 Breath of Fire, 35 Tiger Palm, 32 Blackout Kick, 2 Invoke Niuzao — and 154 excluded casts: 74 melee swings; 22 NON_GCD casts (21 Purifying Brew, 1 Fortifying Brew); 48 casts with no pinned lane; 10 in-domain GCD casts outside the slice (4 Chi Burst, 3 Exploding Keg, 3 Celestial Infusion). 47 MATCH, all EXACT_ENTRY (23 Blackout Kick, 12 Breath of Fire, 12 Keg Smash), 0 REJECTED, 92 UNKNOWN: 82 behind the NON_GCD Purifying Brew with no reviewed transition contract (63 at shado_pan[8], 19 at shado_pan[2]), 10 on divergent worlds (7 at shado_pan[11] Empty the Cellar, 2 at shado_pan[1] Keg Smash, 1 at shado_pan[10] Tiger Palm). The 17 opener decisions keep their outcomes inside the bundle.",
    [
      a("SPEC_BREWMASTER_MONK.COVERAGE_SUMMARY", {
        actorId: RXAF_ACTOR,
        ...RXAF_BUNDLE,
        expected: {
          eligibleDecisions: 139,
          match: 47,
          rejected: 1,
          unknown: 91,
          exclusions: {
            MELEE_SWING: 74,
            NON_GCD_ACTION: 22,
            EXECUTION_LANE_NOT_ESTABLISHED: 48,
            OUTSIDE_FIRST_SLICE: 10,
          },
        },
      }),
      a("SPEC_BREWMASTER_MONK.MEASUREMENT_DISTRIBUTION", {
        actorId: RXAF_ACTOR,
        ...RXAF_BUNDLE,
        expected: {
          match: 47,
          rejected: 1,
          exactEntryMatches: 47,
          tokenConvergedMatches: 0,
          eligibleTokens: {
            blackout_kick: 32,
            breath_of_fire: 35,
            invoke_niuzao: 2,
            keg_smash: 35,
            tiger_palm: 35,
          },
          unresolvedAt: {
            "DIVERGENT_GCD_OUTCOMES @ shado_pan[10] tiger_palm": 1,
            "DIVERGENT_GCD_OUTCOMES @ shado_pan[11] empty_the_cellar": 52,
            "DIVERGENT_GCD_OUTCOMES @ shado_pan[1] keg_smash": 2,
            "DIVERGENT_GCD_OUTCOMES @ shado_pan[7] blackout_kick": 12,
            "DIVERGENT_GCD_OUTCOMES @ shado_pan[9] invoke_niuzao": 5,
            "TRANSITION_UNSUPPORTED @ shado_pan[3] black_ox_brew": 19,
          },
          unknownBlockerClasses: {
            DIVERGENT_WORLDS: 72,
            OTHER: 19,
          },
          stoppingEntries: {
            "(root scan resolved)": 139,
          },
          stoppingAtoms: {},
          dispatchOutcomes: {
            "default[2] -> race_actions : CALL_RETURNED_NO_ACTION_CONTINUE": 139,
            "default[3] -> item_actions : CALL_RETURNED_NO_ACTION_CONTINUE": 139,
            "default[4] -> master_of_harmony : RUN_GATE_FALSE_SKIPPED": 139,
            "default[5] -> shado_pan : RUN_ENTERED_SCAN_ENDS": 139,
          },
          undecidedGcdCandidates: {
            "shado_pan[0] breath_of_fire | USABILITY:breath_of_fire": 1,
            "shado_pan[10] tiger_palm | USABILITY:tiger_palm": 1,
            "shado_pan[10] tiger_palm | buff.blackout_combo.up": 1,
            "shado_pan[10] tiger_palm | cooldown.blackout_kick.remains": 1,
            "shado_pan[11] empty_the_cellar | buff.empty_the_cellar.remains": 81,
            "shado_pan[12] tiger_palm | USABILITY:tiger_palm": 6,
            "shado_pan[12] tiger_palm | buff.blackout_combo.up": 1,
            "shado_pan[14] keg_smash | USABILITY:keg_smash": 8,
            "shado_pan[15] exploding_keg | USABILITY:exploding_keg": 1,
            "shado_pan[16] celestial_brew | USABILITY:celestial_brew": 7,
            "shado_pan[16] celestial_brew | buff.empty_barrel.up": 1,
            "shado_pan[17] empty_the_cellar | USABILITY:empty_the_cellar": 8,
            "shado_pan[18] chi_burst | USABILITY:chi_burst": 2,
            "shado_pan[1] keg_smash | USABILITY:keg_smash": 21,
            "shado_pan[21] tiger_palm | energy": 7,
            "shado_pan[21] tiger_palm | energy.regen": 7,
            "shado_pan[22] expel_harm | USABILITY:expel_harm": 7,
            "shado_pan[4] celestial_brew | USABILITY:celestial_brew": 14,
            "shado_pan[4] celestial_brew | buff.empty_barrel.up": 5,
            "shado_pan[5] exploding_keg | USABILITY:exploding_keg": 5,
            "shado_pan[7] blackout_kick | USABILITY:blackout_kick": 12,
            "shado_pan[7] blackout_kick | buff.blackout_combo.up": 2,
            "shado_pan[9] invoke_niuzao | USABILITY:invoke_niuzao": 5,
          },
          undecidedNonGcdCandidates: {
            "default[0] auto_attack | USABILITY:auto_attack": 139,
            "shado_pan[2] purifying_brew | USABILITY:purifying_brew": 14,
            "shado_pan[2] purifying_brew | buff.empty_barrel.up": 5,
            "shado_pan[3] black_ox_brew | buff.empty_barrel.up": 5,
            "shado_pan[3] black_ox_brew | cooldown.celestial_brew.charges_fractional": 19,
            "shado_pan[6] fortifying_brew | USABILITY:fortifying_brew": 14,
            "shado_pan[6] fortifying_brew | buff.empty_barrel.up": 5,
            "shado_pan[8] purifying_brew | USABILITY:purifying_brew": 70,
            "shado_pan[8] purifying_brew | buff.empty_barrel.up": 4,
          },
          gcdDistribution: {
            "GCD_CONSUMING | 1000 ms": 78,
            "GCD_CONSUMING | 1500 ms": 71,
            "NON_GCD | 0 ms": 22,
            "UNKNOWN_LANE | no record": 48,
          },
        },
      }),
      a("SPEC_BREWMASTER_MONK.STATE_EVIDENCE_CENSUS", {
        actorId: RXAF_ACTOR,
        ...RXAF_BUNDLE,
        expected: {
          auraEvidence: {
            "blackout_combo | AURA_STATE_UNKNOWN": 5,
            "blackout_combo | up false (OBSERVED)": 101,
            "blackout_combo | up true (OBSERVED)": 33,
            "empty_barrel | AURA_STATE_UNKNOWN": 13,
            "empty_barrel | up false (OBSERVED)": 110,
            "empty_barrel | up true (OBSERVED)": 16,
            "invoke_niuzao_the_black_ox | up false (OBSERVED)": 94,
            "invoke_niuzao_the_black_ox | up true (OBSERVED)": 45,
          },
          readinessAuraEvidence: {
            "empty_the_cellar | AURA_STATE_UNKNOWN": 139,
          },
          cooldownReadiness: {
            "blackout_kick | COOLDOWN_STATE_UNKNOWN": 5,
            "blackout_kick | PROVEN_NOT_READY": 80,
            "blackout_kick | WITHIN_QUEUEING_TOLERANCE": 54,
            "breath_of_fire | COOLDOWN_STATE_UNKNOWN": 37,
            "breath_of_fire | PROVEN_NOT_READY": 102,
            "chi_burst | COOLDOWN_STATE_UNKNOWN": 31,
            "chi_burst | PROVEN_NOT_READY": 94,
            "chi_burst | WITHIN_QUEUEING_TOLERANCE": 14,
            "expel_harm | COOLDOWN_STATE_UNKNOWN": 139,
            "exploding_keg | COOLDOWN_STATE_UNKNOWN": 10,
            "exploding_keg | PROVEN_NOT_READY": 127,
            "exploding_keg | WITHIN_QUEUEING_TOLERANCE": 2,
            "invoke_niuzao | COOLDOWN_STATE_UNKNOWN": 1,
            "invoke_niuzao | PROVEN_NOT_READY": 131,
            "invoke_niuzao | WITHIN_QUEUEING_TOLERANCE": 7,
            "rushing_jade_wind | COOLDOWN_STATE_UNKNOWN": 139,
          },
          positiveUsability: {
            "blackout_kick | NOT_PROVEN: COOLDOWN_READINESS(INSIDE_UPPER_BOUND_WINDOW)": 88,
            "blackout_kick | NOT_PROVEN: COOLDOWN_READINESS(POSSIBLE_PRE_PULL_USE)": 4,
            "blackout_kick | NOT_PROVEN: RANGE_TARGET(CORROBORATOR_NOT_ENEMY_UNIT_TARGET)": 10,
            "blackout_kick | NOT_PROVEN: RANGE_TARGET(RANGE_NOT_CONTAINED)": 4,
            "blackout_kick | PROVEN_USABLE": 1,
            "breath_of_fire | NOT_PROVEN: COOLDOWN_READINESS(INSIDE_UPPER_BOUND_WINDOW)": 103,
            "breath_of_fire | NOT_PROVEN: COOLDOWN_READINESS(POSSIBLE_PRE_PULL_USE)": 1,
            "invoke_niuzao | NOT_PROVEN: COOLDOWN_READINESS(INSIDE_UPPER_BOUND_WINDOW)": 137,
            "keg_smash | NOT_PROVEN: COOLDOWN_READINESS(INSIDE_UPPER_BOUND_WINDOW)": 102,
            "keg_smash | NOT_PROVEN: COOLDOWN_READINESS(POSSIBLE_PRE_PULL_USE)": 2,
          },
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The neutral second subject — chosen by a rule fixed before any outcome was known, over a window fixed by time — agrees with the authority wherever a decision resolves: 47 MATCH, 0 REJECTED. That is evidence, retained as such; it does not satisfy the promotion standard, and no third subject is drawn.",
    { authority: RXAF_AUTHORITY, related: BREWMASTER_RELATED },
  ),
  // ---- M11-C4i: the second subject's one resolved REJECTED, pinned over the whole fixed window ----
  kase(
    "spec-brewmaster-monk.the-second-subjects-rejected-tiger-palm-over-its-fixed-165s-bundle",
    BREWMASTER_RXAF_20_165,
    "SPEC_BREWMASTER_MONK",
    "src/specs/monk/brewmaster/positive-usability.ts; src/findings/usability/*; first-gcd-adapter.ts; tests/support/corpus/fight.ts bundleOverEvidence; tests/support/corpus/loader.ts (cross-root references)",
    "M11-C4i. The neutral second subject's ONLY resolved REJECTED over its complete fixed 165 s bundle (the regression-corpus opener + the archive segment of ONE capture): the Tiger Palm at 2,573,516 (+132.5 s) while the authority DEFINITELY selects Blackout Kick at shado_pan[7] (talent.blackout_combo.enabled & !buff.blackout_combo.up: the talent SELECTED, the buff BOUND down from an observed removal). Blackout Kick is proven usable in every dimension: applicable for the build; no ready() override beyond monk_action_t; no Blackout Kick (or its category sibling 100784) in the 4,250 ms before the decision, over complete CASTS coverage, against its 4,000 ms charge cooldown upper bound; no power row; a GCD action at a GCD decision; the Tiger Palm's own target, within Tiger Palm's 5 yd, inside Blackout Kick's 5; and the same not-usable-while-moving restriction the Tiger Palm itself satisfied. The observed Tiger Palm is never proven unselectable. Its identity is proven by the subject's own committed fight context (actor 11: Player / Monk / Brewmaster).",
    [
      a("SPEC_BREWMASTER_MONK.DECISION_COVERAGE", {
        actorId: RXAF_ACTOR,
        targetActorId: null,
        ...RXAF_BUNDLE,
        observedCast: bm_cast(2573516, BM_TP),
        expected: BREWMASTER_REJECTED_FOR("blackout_kick", "CONDITION_NOT_PROVEN_FALSE"),
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "A real, identity-paired, state/authority-driven REJECTED from SANITIZED_CAPTURE across both roots: the second subject's discrimination evidence, found by the real analyzer and pinned only because it reproduced exactly.",
    { authority: RXAF_AUTHORITY, related: BREWMASTER_RELATED },
  ),
  // ---- M11-C4f closeout: the second subject's first resolved MATCH, pinned over the whole fixed window ----
  kase(
    "spec-brewmaster-monk.the-second-subjects-first-resolved-match-over-its-fixed-165s-bundle",
    BREWMASTER_RXAF_20_165,
    "SPEC_BREWMASTER_MONK",
    "src/specs/monk/brewmaster/observed-analysis.ts; first-gcd-adapter.ts; tests/support/corpus/fight.ts bundleOverEvidence; tests/support/corpus/loader.ts (cross-root references)",
    "The FIRST resolved MATCH of the neutral second subject in report-time order — chosen by that rule, not by what it shows — resolves over the complete fixed 165 s bundle (the regression-corpus opener + the archive segment of ONE capture): the Breath of Fire at 2,442,604 (+1.609 s) matches the authority's selected token at EXACT_ENTRY with no blocker, and the nested unselectability proof refuses with CONDITION_NOT_PROVEN_FALSE. Its identity is proven by the subject's own committed fight context (actor 11: Player / Monk / Brewmaster).",
    [
      a("SPEC_BREWMASTER_MONK.DECISION_COVERAGE", {
        actorId: RXAF_ACTOR,
        targetActorId: null,
        ...RXAF_BUNDLE,
        observedCast: bm_cast(2442604, BM_BOF),
        expected: {
          ...BREWMASTER_MATCH("breath_of_fire"),
          unselectabilityRefusal: "CONDITION_NOT_PROVEN_FALSE",
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "Subject 2 contributes real, identity-paired MATCH evidence of its own from SANITIZED_CAPTURE across both roots. One more MATCH is not promotion evidence: the second subject, like the first, has no REJECTED.",
    { authority: RXAF_AUTHORITY, related: BREWMASTER_RELATED },
  ),
  kase(
    "normalization.brewmaster-monk-full-fight-seg-165-285-normalizes-whole-and-in-order",
    BREWMASTER_GTKB_165_285,
    "NORMALIZATION",
    "src/engine/normalization/event-normalizer.ts; supported-families.ts; scripts/sanitize-probe.mjs --actor-slice --from",
    "The 1,229-event family-filtered actor-4 segment normalizes with every raw type recognised and every event kept in capture order: as SOURCE 169 casts and 830 aura transitions; as TARGET 34 casts and 880 aura transitions. No resource change involves actor 4 in the window. No combatantinfo: the segment starts strictly after the fight start, and the profile is carried by the opener slice the bundle begins with.",
    [
      a("NORMALIZATION.EVENT_COUNT_PRESERVED", { expectedEventCount: 1229 }),
      a("NORMALIZATION.INPUT_ORDER_PRESERVED", {}),
      a("NORMALIZATION.ALL_TYPES_RECOGNISED", {}),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", {
        actorId: BREWMASTER_GTKB_ACTOR,
        side: "SOURCE",
        expected: { CAST: 169, AURA: 830 },
      }),
      a("NORMALIZATION.ACTOR_EVENT_CENSUS", {
        actorId: BREWMASTER_GTKB_ACTOR,
        side: "TARGET",
        expected: { CAST: 34, AURA: 880 },
      }),
    ],
    ["VALIDATED_EVIDENCE"],
    "The census is of the segment, never of the fight: exactly the families the --families option retained, between the recorded exclusive --from and inclusive --to bounds (the fight end), and nothing else. On its own a segment analyzes to PROFILE_NOT_RESOLVED — there is no combatant profile in it — which is the correct refusal, not a smaller population.",
    { related: ["tests/unit/sanitize-probe.test.ts", "tests/unit/m10c5b-corpus-bundle.test.ts"] },
  ),
  kase(
    "normalization.brewmaster-monk-full-fight-bundle-composes-three-parts-into-one-complete-fight",
    BREWMASTER_GTKB_165_285,
    "NORMALIZATION",
    "tests/support/corpus/fight.ts bundleOverEvidence; loader.ts; scripts/corpus/build-manifest.mjs",
    "The three parts — the M11-C2 opener slice (grant ending at 2,435,041), the M11-C4 segment (granted 2,435,042 .. 2,580,041) and the M11-C4b segment (granted 2,580,042 .. 2,699,832, the fight end) — compose into one 2,970-event fight over [2,415,041 .. 2,699,831] with CASTS, AURAS, RESOURCES, COMBATANT_INFO and GEAR each COMPLETE over ONE joined range [2,415,041 .. 2,699,832]: the whole of fight 22. Every join is by adjacency; no certificate is needed.",
    [
      a("NORMALIZATION.BUNDLE_COMPOSITION", {
        historyArtifactIds: [BREWMASTER_GTKB, BREWMASTER_GTKB_20_165],
        declaredHoles: [],
        actorId: BREWMASTER_GTKB_ACTOR,
        expected: {
          events: 2970,
          coverage: {
            CASTS: "COMPLETE",
            AURAS: "COMPLETE",
            RESOURCES: "COMPLETE",
            COMBATANT_INFO: "COMPLETE",
            GEAR: "COMPLETE",
            DAMAGE: "ABSENT",
            HEALING: "ABSENT",
            ABSORBS: "ABSENT",
            SUMMONS: "ABSENT",
          },
          castRanges: [{ fromReportTimeMs: HP_START, toReportTimeMs: GTKB_FULL_END }],
          windowFromReportTimeMs: HP_START,
          windowToReportTimeMs: 2699831,
        },
      }),
    ],
    ["VALIDATED_EVIDENCE"],
    "Composition is a claim about coverage, and coverage is never inferred from the bytes: the same composer and refusals as every other bundle, over three captures of one report and fight at the SAME report revision (22), the last two of which re-read it before and after their pages.",
    { related: ["tests/unit/m10c5b-corpus-bundle.test.ts", "tests/unit/m9b-corpus-loader.test.ts"] },
  ),
  kase(
    "spec-brewmaster-monk.the-full-shado-pan-fight-measures-one-hundred-eighty-nine-decisions-one-hundred-nineteen-resolved",
    BREWMASTER_GTKB_165_285,
    "SPEC_BREWMASTER_MONK",
    "src/specs/monk/brewmaster/observed-analysis.ts; first-gcd-adapter.ts; resolver.ts; tests/support/corpus/fight.ts bundleOverEvidence",
    "M11-C4i RE-MEASUREMENT (pinned): 109 MATCH, 10 REJECTED, 70 UNKNOWN. The REJECTED: the Tiger Palms at 2,424,688 and 2,692,690 against a proven-usable Keg Smash, and eight casts between 2,646,042 and 2,683,160 against a proven-usable Invoke Niuzao (one held cooldown). The 70 UNKNOWN: 19 behind Black Ox Brew (shado_pan[3]), 32 on Blackout Kick (shado_pan[7]), 12 on Invoke Niuzao (shado_pan[9]), 5 on Keg Smash (4 at shado_pan[1], 1 at shado_pan[14]), 2 on Breath of Fire (shado_pan[0]). Positive usability (Keg Smash, Blackout Kick, Breath of Fire, Invoke Niuzao: every dimension of the completeness contract proven or not applicable, range STRICT by same-target corroboration) and the Purifying Brew / Empty the Cellar closure (a reviewed Purifying Brew transition: shared internal cooldown, Empty Barrel forgotten, never bound up; Empty the Cellar's wire aura 1262768 corroborated). No earlier resolved outcome changes. BEFORE M11-C4i — THE M11-C4b MEASUREMENT, the unchanged M11-C3a analyzer over the WHOLE of fight 22 for the same subject (actor 4, Shado-Pan). 189 eligible decisions — 50 Keg Smash, 47 Blackout Kick, 45 Breath of Fire, 44 Tiger Palm, 3 Invoke Niuzao — and 210 excluded casts: 105 melee swings; 26 NON_GCD casts (25 Purifying Brew, 1 Fortifying Brew); 69 casts with no pinned lane (49 Gift of the Ox heals, 8 Roll, 5 Provoke, 3 Transcendence, 1 Tiger's Lust, 2 on-use item uses, a potion); 10 in-domain GCD casts outside the slice (4 Celestial Infusion, 3 Chi Burst, 2 Exploding Keg, 1 Empty the Cellar). 55 MATCH, all EXACT_ENTRY (36 Blackout Kick, 10 Breath of Fire, 9 Keg Smash), 0 REJECTED, 134 UNKNOWN: 116 because the query must fire a NON_GCD Purifying Brew with no reviewed transition contract (95 at shado_pan[8], 21 at shado_pan[2]), 18 on divergent worlds (7 at shado_pan[11] Empty the Cellar, 4 at shado_pan[1] Keg Smash, 4 at shado_pan[7] Blackout Kick, 2 at shado_pan[0] Breath of Fire, 1 at shado_pan[9] Invoke Niuzao). The 113 decisions of the 165 s window keep exactly their M11-C4 outcomes inside the full-fight bundle. The complete fixed fight furnishes no resolved disagreement under the supported slice.",
    [
      a("SPEC_BREWMASTER_MONK.COVERAGE_SUMMARY", {
        actorId: BREWMASTER,
        historyArtifactIds: [BREWMASTER_GTKB, BREWMASTER_GTKB_20_165],
        declaredHoles: [],
        expected: {
          eligibleDecisions: 189,
          match: 109,
          rejected: 10,
          unknown: 70,
          exclusions: {
            MELEE_SWING: 105,
            NON_GCD_ACTION: 26,
            EXECUTION_LANE_NOT_ESTABLISHED: 69,
            OUTSIDE_FIRST_SLICE: 10,
          },
        },
      }),
      a("SPEC_BREWMASTER_MONK.MEASUREMENT_DISTRIBUTION", {
        actorId: BREWMASTER,
        historyArtifactIds: [BREWMASTER_GTKB, BREWMASTER_GTKB_20_165],
        declaredHoles: [],
        expected: {
          match: 109,
          rejected: 10,
          exactEntryMatches: 109,
          tokenConvergedMatches: 0,
          eligibleTokens: {
            blackout_kick: 47,
            breath_of_fire: 45,
            invoke_niuzao: 3,
            keg_smash: 50,
            tiger_palm: 44,
          },
          unresolvedAt: {
            "DIVERGENT_GCD_OUTCOMES @ shado_pan[0] breath_of_fire": 2,
            "DIVERGENT_GCD_OUTCOMES @ shado_pan[14] keg_smash": 1,
            "DIVERGENT_GCD_OUTCOMES @ shado_pan[1] keg_smash": 4,
            "DIVERGENT_GCD_OUTCOMES @ shado_pan[7] blackout_kick": 32,
            "DIVERGENT_GCD_OUTCOMES @ shado_pan[9] invoke_niuzao": 12,
            "TRANSITION_UNSUPPORTED @ shado_pan[3] black_ox_brew": 19,
          },
          unknownBlockerClasses: {
            DIVERGENT_WORLDS: 51,
            OTHER: 19,
          },
          stoppingEntries: {
            "(root scan resolved)": 189,
          },
          stoppingAtoms: {},
          dispatchOutcomes: {
            "default[2] -> race_actions : CALL_RETURNED_NO_ACTION_CONTINUE": 189,
            "default[3] -> item_actions : CALL_RETURNED_NO_ACTION_CONTINUE": 189,
            "default[4] -> master_of_harmony : RUN_GATE_FALSE_SKIPPED": 189,
            "default[5] -> shado_pan : RUN_ENTERED_SCAN_ENDS": 189,
          },
          undecidedGcdCandidates: {
            "shado_pan[0] breath_of_fire | USABILITY:breath_of_fire": 3,
            "shado_pan[0] breath_of_fire | buff.invoke_niuzao_the_black_ox.up": 2,
            "shado_pan[10] tiger_palm | USABILITY:tiger_palm": 1,
            "shado_pan[10] tiger_palm | buff.blackout_combo.up": 3,
            "shado_pan[10] tiger_palm | cooldown.blackout_kick.remains": 3,
            "shado_pan[11] empty_the_cellar | buff.empty_the_cellar.remains": 11,
            "shado_pan[12] tiger_palm | USABILITY:tiger_palm": 1,
            "shado_pan[12] tiger_palm | buff.blackout_combo.up": 3,
            "shado_pan[13] breath_of_fire | USABILITY:breath_of_fire": 2,
            "shado_pan[14] keg_smash | USABILITY:keg_smash": 3,
            "shado_pan[15] exploding_keg | USABILITY:exploding_keg": 2,
            "shado_pan[16] celestial_brew | USABILITY:celestial_brew": 3,
            "shado_pan[17] empty_the_cellar | USABILITY:empty_the_cellar": 2,
            "shado_pan[18] chi_burst | USABILITY:chi_burst": 2,
            "shado_pan[1] keg_smash | USABILITY:keg_smash": 20,
            "shado_pan[1] keg_smash | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[21] tiger_palm | energy": 1,
            "shado_pan[21] tiger_palm | energy.regen": 1,
            "shado_pan[22] expel_harm | USABILITY:expel_harm": 1,
            "shado_pan[4] celestial_brew | USABILITY:celestial_brew": 16,
            "shado_pan[4] celestial_brew | buff.empty_barrel.up": 1,
            "shado_pan[4] celestial_brew | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[5] exploding_keg | USABILITY:exploding_keg": 10,
            "shado_pan[5] exploding_keg | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[7] blackout_kick | USABILITY:blackout_kick": 34,
            "shado_pan[7] blackout_kick | buff.blackout_combo.up": 3,
            "shado_pan[9] invoke_niuzao | USABILITY:invoke_niuzao": 24,
          },
          undecidedNonGcdCandidates: {
            "default[0] auto_attack | USABILITY:auto_attack": 189,
            "shado_pan[2] purifying_brew | USABILITY:purifying_brew": 16,
            "shado_pan[2] purifying_brew | buff.empty_barrel.up": 1,
            "shado_pan[2] purifying_brew | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[3] black_ox_brew | buff.empty_barrel.up": 1,
            "shado_pan[3] black_ox_brew | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[3] black_ox_brew | cooldown.celestial_brew.charges_fractional": 19,
            "shado_pan[6] fortifying_brew | USABILITY:fortifying_brew": 16,
            "shado_pan[6] fortifying_brew | buff.empty_barrel.up": 1,
            "shado_pan[6] fortifying_brew | buff.invoke_niuzao_the_black_ox.up": 3,
            "shado_pan[8] purifying_brew | USABILITY:purifying_brew": 106,
            "shado_pan[8] purifying_brew | buff.empty_barrel.up": 1,
          },
          gcdDistribution: {
            "GCD_CONSUMING | 1000 ms": 105,
            "GCD_CONSUMING | 1500 ms": 94,
            "NON_GCD | 0 ms": 26,
            "UNKNOWN_LANE | no record": 69,
          },
        },
      }),
      a("SPEC_BREWMASTER_MONK.STATE_EVIDENCE_CENSUS", {
        actorId: BREWMASTER,
        historyArtifactIds: [BREWMASTER_GTKB, BREWMASTER_GTKB_20_165],
        declaredHoles: [],
        expected: {
          auraEvidence: {
            "blackout_combo | AURA_STATE_UNKNOWN": 3,
            "blackout_combo | up false (OBSERVED)": 138,
            "blackout_combo | up true (OBSERVED)": 48,
            "empty_barrel | AURA_STATE_UNKNOWN": 1,
            "empty_barrel | up false (OBSERVED)": 165,
            "empty_barrel | up true (OBSERVED)": 23,
            "invoke_niuzao_the_black_ox | AURA_STATE_UNKNOWN": 3,
            "invoke_niuzao_the_black_ox | up false (OBSERVED)": 143,
            "invoke_niuzao_the_black_ox | up true (OBSERVED)": 43,
          },
          readinessAuraEvidence: {
            "empty_the_cellar | AURA_ACTIVE": 14,
            "empty_the_cellar | AURA_STATE_UNKNOWN": 18,
            "empty_the_cellar | PROVEN_INACTIVE": 157,
          },
          cooldownReadiness: {
            "blackout_kick | COOLDOWN_STATE_UNKNOWN": 3,
            "blackout_kick | PROVEN_NOT_READY": 94,
            "blackout_kick | WITHIN_QUEUEING_TOLERANCE": 92,
            "breath_of_fire | COOLDOWN_STATE_UNKNOWN": 54,
            "breath_of_fire | PROVEN_NOT_READY": 135,
            "chi_burst | COOLDOWN_STATE_UNKNOWN": 63,
            "chi_burst | PROVEN_NOT_READY": 60,
            "chi_burst | WITHIN_QUEUEING_TOLERANCE": 66,
            "expel_harm | COOLDOWN_STATE_UNKNOWN": 189,
            "exploding_keg | COOLDOWN_STATE_UNKNOWN": 18,
            "exploding_keg | PROVEN_NOT_READY": 81,
            "exploding_keg | WITHIN_QUEUEING_TOLERANCE": 90,
            "invoke_niuzao | COOLDOWN_STATE_UNKNOWN": 4,
            "invoke_niuzao | PROVEN_NOT_READY": 139,
            "invoke_niuzao | WITHIN_QUEUEING_TOLERANCE": 46,
            "rushing_jade_wind | COOLDOWN_STATE_UNKNOWN": 189,
          },
          positiveUsability: {
            "blackout_kick | NOT_PROVEN: COOLDOWN_READINESS(INSIDE_UPPER_BOUND_WINDOW)": 105,
            "blackout_kick | NOT_PROVEN: COOLDOWN_READINESS(POSSIBLE_PRE_PULL_USE)": 2,
            "blackout_kick | NOT_PROVEN: RANGE_TARGET(CORROBORATOR_NOT_ENEMY_UNIT_TARGET)": 21,
            "blackout_kick | NOT_PROVEN: RANGE_TARGET(RANGE_NOT_CONTAINED)": 14,
            "breath_of_fire | NOT_PROVEN: COOLDOWN_READINESS(INSIDE_UPPER_BOUND_WINDOW)": 142,
            "breath_of_fire | NOT_PROVEN: COOLDOWN_READINESS(POSSIBLE_PRE_PULL_USE)": 1,
            "breath_of_fire | NOT_PROVEN: RANGE_TARGET(CANDIDATE_UNTARGETED)": 1,
            "invoke_niuzao | NOT_PROVEN: COOLDOWN_READINESS(INSIDE_UPPER_BOUND_WINDOW)": 160,
            "invoke_niuzao | NOT_PROVEN: COOLDOWN_READINESS(POSSIBLE_PRE_PULL_USE)": 3,
            "invoke_niuzao | NOT_PROVEN: RANGE_TARGET(CORROBORATOR_NOT_ENEMY_UNIT_TARGET)": 6,
            "invoke_niuzao | PROVEN_USABLE": 17,
            "keg_smash | NOT_PROVEN: COOLDOWN_READINESS(INSIDE_UPPER_BOUND_WINDOW)": 133,
            "keg_smash | NOT_PROVEN: RESOURCE_AFFORDABILITY(RESOURCE_NOT_OBSERVED_PRE_COST)": 2,
            "keg_smash | PROVEN_USABLE": 4,
          },
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "The complete fixed fight is the last evidence this subject can give. It multiplies MATCH, names the same obstacles in the same order, and contains no resolved disagreement: REJECTED stays 0, so the promotion evidence gate stays blocked on real evidence — never on a loosened rule — and the next question is which second subject to measure, not which mechanic to add.",
    { authority: BREWMASTER_AUTHORITY, related: BREWMASTER_RELATED },
  ),
  // ---- The cross-tier decision: corpus opener + corpus 20–165 s + archive 165–285 s ----
  kase(
    "spec-brewmaster-monk.the-first-full-fight-segment-match-resolves-over-the-cross-tier-bundle",
    BREWMASTER_GTKB_165_285,
    "SPEC_BREWMASTER_MONK",
    "src/specs/monk/brewmaster/observed-analysis.ts; first-gcd-adapter.ts; tests/support/corpus/fight.ts bundleOverEvidence; tests/support/corpus/loader.ts (cross-root references)",
    "The FIRST MATCH decision of the 165 s–fight-end segment in report-time order — chosen by that rule, not by what it shows — resolves over the full cross-tier bundle exactly as the full-fight measurement counts it: the Blackout Kick at 2,583,094 (+168.053 s) is selected at shado_pan EXACT_ENTRY with every higher entry false or proven unusable, and the nested unselectability proof refuses with CONDITION_NOT_PROVEN_FALSE. Its history is the whole fight from the pull: the M11-C2 opener and the M11-C4 segment live in the regression corpus, the M11-C4b segment in the archive, and all three are SANITIZED_CAPTURE.",
    [
      a("SPEC_BREWMASTER_MONK.DECISION_COVERAGE", {
        actorId: BREWMASTER,
        targetActorId: null,
        historyArtifactIds: [BREWMASTER_GTKB, BREWMASTER_GTKB_20_165],
        declaredHoles: [],
        observedCast: bm_cast(2583094, BM_BOK),
        expected: {
          ...BREWMASTER_MATCH("blackout_kick"),
          unselectabilityRefusal: "CONDITION_NOT_PROVEN_FALSE",
        },
      }),
    ],
    ["PINNED_AUTHORITY", "VALIDATED_EVIDENCE"],
    "Qualifying evidence may live in the archive without weakening what qualifies: the decision's whole evidence set is SANITIZED_CAPTURE across both roots, its identity is proven by the committed gtKb fight context, and the archive's own committed report — re-proven twice under workerd by the evidence gate — records it PASSED. One MATCH more is not promotion evidence: Brewmaster still has no REJECTED.",
    { authority: BREWMASTER_AUTHORITY, related: BREWMASTER_RELATED },
  ),
];

const byId = (key) => (left, right) => (left[key] < right[key] ? -1 : left[key] > right[key] ? 1 : 0);

const rootIndex = process.argv.indexOf("--root");
const rootArgument = rootIndex === -1 ? "corpus" : process.argv[rootIndex + 1];
if (rootArgument !== "corpus" && rootArgument !== "evidence") {
  console.error("usage: node scripts/corpus/build-manifest.mjs [--root corpus|evidence] [--out <path>]");
  process.exit(1);
}
const EVIDENCE_ROOT = rootArgument === "evidence";

const manifest = EVIDENCE_ROOT
  ? {
      contractVersion: 2,
      corpusId: "warcraft-logs-coach-vnext.evidence-archive",
      artifacts: [...EVIDENCE_ARTIFACTS].sort(byId("artifactId")),
      cases: [...EVIDENCE_CASES].sort(byId("caseId")),
    }
  : {
      contractVersion: 2,
      corpusId: "warcraft-logs-coach-vnext.regression-corpus",
      artifacts: [...ARTIFACTS].sort(byId("artifactId")),
      cases: [...CASES].sort(byId("caseId")),
    };

// `--out <path>` writes elsewhere, which is how scripts/corpus/gate.mjs checks
// that the committed manifest is what this generator produces today.
const outIndex = process.argv.indexOf("--out");
const defaultOut = join(EVIDENCE_ROOT ? EVIDENCE : CORPUS, "manifest.json");
const out = outIndex === -1 ? defaultOut : process.argv[outIndex + 1];
if (out === undefined) {
  console.error("usage: node scripts/corpus/build-manifest.mjs [--root corpus|evidence] [--out <path>]");
  process.exit(1);
}
writeFileSync(
  out,
  `${JSON.stringify(manifest, null, 2)}
`,
  "utf8",
);
console.log(
  `wrote ${outIndex === -1 ? (EVIDENCE_ROOT ? "tests/evidence/manifest.json" : "tests/corpus/manifest.json") : out}: ${manifest.artifacts.length} artifacts, ${manifest.cases.length} cases`,
);

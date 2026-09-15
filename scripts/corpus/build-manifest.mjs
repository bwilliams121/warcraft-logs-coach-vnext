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

const credential_scan = () => ({
  kind: "CREDENTIAL_SHAPE_SCAN",
  tooling: tooling(SANITIZER, SANITIZER_REVISION_AT_CAPTURE, "implicit on every write"),
  detail:
    "The slicer refuses to write output containing a credential-shaped value. Nothing was found and nothing was changed.",
  invalidates: [],
});

const selection = (invocation, detail, invalidates) => ({
  kind: "SUBSET_SELECTION",
  tooling: tooling(SANITIZER, SANITIZER_REVISION_AT_CAPTURE, invocation),
  detail,
  invalidates,
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

const source_a = (captureTooling, rawCaptureLocation, q, comp, capturedOn) => ({
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
});

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
// Artifacts
// --------------------------------------------------------------------------

const [D2_START, D2_END] = [2164325, 2194928];
const [C3_START, C3_END] = [2164325, 2176581];

function artifact(artifactId, path, options) {
  const { sha256, byteLength } = digest(join(CORPUS, path));
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
      transformations: options.transformations ?? [],
      retainedCoverage: { grants: options.grants ?? [], basis: options.coverageBasis },
      retainedFor: options.retainedFor,
      limitations: options.limitations,
    },
  };
}

const wcl = (name) => `artifacts/wcl-events/${name}.json`;

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
const Q = 2176580;

const CASES = [
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
    "public-contract.analysis-parity-for-an-unsupported-spec",
    D2,
    "PUBLIC_CONTRACT",
    "src/contracts/analysis-contract.ts (SPEC_NOT_SUPPORTED variant); src/services/analysis-service.ts",
    "Identified as a Protection Paladin, the same actor over the same artifact yields SPEC_NOT_SUPPORTED on both transports — a well-formed document that says gameplay analysis was not attempted, identical on REST and MCP.",
    [
      a("PUBLIC_CONTRACT.REST_MCP_PARITY", {
        document: "ANALYSIS",
        subject: { actorId: 19, className: "Paladin", specName: "Protection" },
        expected: { status: "SPEC_NOT_SUPPORTED" },
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
        expected: { analyzedCells: 1 },
      }),
    ],
    ["OWNED_CONTRACT"],
    "The raid-night service is the production path with only the three Warcraft Logs ports faked; the cell is the real M5 facade's output projected by the real M7 aggregator.",
    {
      limitations: [
        "The orchestration fixture normalizes the D2 artifact under its own window and fans it per participant; parity for other artifacts is not supported by this executor.",
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
];

// --------------------------------------------------------------------------

const byId = (key) => (left, right) => (left[key] < right[key] ? -1 : left[key] > right[key] ? 1 : 0);

const manifest = {
  contractVersion: 2,
  corpusId: "warcraft-logs-coach-vnext.regression-corpus",
  artifacts: [...ARTIFACTS].sort(byId("artifactId")),
  cases: [...CASES].sort(byId("caseId")),
};

const out = join(CORPUS, "manifest.json");
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(
  `wrote tests/corpus/manifest.json: ${manifest.artifacts.length} artifacts, ${manifest.cases.length} cases`,
);

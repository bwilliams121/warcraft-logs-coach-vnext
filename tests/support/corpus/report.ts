/**
 * The corpus coverage and evidence-gap report.
 *
 * COVERAGE IS COUNTED, GAPS ARE DECLARED. The numbers come from the loaded
 * corpus — how many cases and assertions each layer owns, which registered
 * kinds are exercised and which are not, what lineage the artifacts have. The
 * gaps come from a list a human wrote, because an absence cannot be measured
 * from the corpus: the corpus has no death event because no committed capture
 * contains one, and only a person can say that is a gap rather than a fact
 * about the game.
 *
 * Every gap names what would close it. That is the test for whether an entry
 * belongs here at all — a gap with no remedy is a limitation, and those live on
 * the artifacts.
 */

import {
  ASSERTION_KINDS,
  OWNING_LAYER_IDS,
  type AssertionKind,
  type OwningLayer,
  type ProvenanceKind,
} from "./contract.js";
import type { LoadedCorpus } from "./loader.js";

export interface LayerCoverage {
  readonly owningLayer: OwningLayer;
  readonly cases: number;
  readonly assertions: number;
  readonly kindsExercised: readonly AssertionKind[];
  readonly kindsRegisteredButUnused: readonly AssertionKind[];
}

export interface CorpusCoverageReport {
  readonly artifacts: {
    readonly total: number;
    readonly byKind: Readonly<Record<ProvenanceKind, number>>;
    readonly totalBytes: number;
    readonly sourceCaptures: readonly {
      readonly reportCode: string;
      readonly fightId: number | string;
      readonly artifacts: number;
    }[];
    readonly withRetainedCoverage: readonly string[];
  };
  readonly cases: {
    readonly total: number;
    readonly assertions: number;
    readonly executable: number;
    readonly declared: number;
    readonly authorityPinned: number;
  };
  readonly byLayer: readonly LayerCoverage[];
  readonly gaps: readonly EvidenceGap[];
}

/**
 * What M9-C decided about a gap M9-B declared.
 *
 * - `CLOSE_IN_M9`                    closed by committed cases named in `closedBy`.
 * - `PROVEN_BY_EXISTING_EVIDENCE`    the behaviour was already pinned by
 *                                    committed evidence outside the corpus; the
 *                                    entry names it.
 * - `PROVEN_BY_SYNTHETIC_CONTRACT`   pinned by a synthetic contract that a
 *                                    capture would not strengthen; says why.
 * - `CLOSE_IN_M10`                   closed by committed M10 cases named in
 *                                    `closedBy`; same rule as CLOSE_IN_M9.
 * - `DEFER_TO_MILESTONE`             a real gap with a named owner.
 * - `OUTSIDE_CURRENT_CAPABILITY`     no bounded, policy-compliant capture can
 *                                    produce the evidence today; says why.
 * - `BLOCKS_M9_CLOSEOUT`             M9 cannot close with this open.
 */
export type GapDisposition =
  | "CLOSE_IN_M9"
  | "CLOSE_IN_M10"
  | "PROVEN_BY_EXISTING_EVIDENCE"
  | "PROVEN_BY_SYNTHETIC_CONTRACT"
  | "DEFER_TO_MILESTONE"
  | "OUTSIDE_CURRENT_CAPABILITY"
  | "BLOCKS_M9_CLOSEOUT";

export interface EvidenceGap {
  readonly id: string;
  readonly layers: readonly OwningLayer[];
  /** The missing behaviour, as M9-B declared it. Kept verbatim so the triage is auditable. */
  readonly gap: string;
  /** What would put the evidence in the corpus. Never "assume". */
  readonly whatWouldClose: string;
  readonly whyItMatters: string;
  /** What the code does today about the behaviour. */
  readonly currentSupport: string;
  /** Evidence that exists now — corpus cases, tests, fixtures — or "none". */
  readonly existingEvidence: string;
  readonly disposition: GapDisposition;
  /** Who owns the remainder: a milestone, or `M9` for a closed gap. */
  readonly owner: string;
  /** Committed corpus case ids that close the gap. Non-empty iff CLOSE_IN_M9 or CLOSE_IN_M10. */
  readonly closedBy: readonly string[];
}

/**
 * Every gap M9-B declared, with M9-C's disposition of each.
 *
 * Kept as data so the closeout, the README, the machine-readable report and
 * the tests read one list. A CLOSE_IN_M9 entry names the committed cases and
 * a test checks they exist; nothing here is closed by assertion alone.
 */
export const KNOWN_EVIDENCE_GAPS: readonly EvidenceGap[] = [
  {
    id: "no-interrupt-events",
    layers: ["NORMALIZATION", "COMBAT_STATE"],
    gap: "No committed capture contains an interrupt event. INTERRUPTS stays UNVERIFIED and nothing in the corpus can pin how the family normalizes. (M9-B declared this together with deaths and dispels as `no-death-interrupt-dispel-events`; the owners differ, so the entry was split.)",
    whatWouldClose:
      "A sanitized slice from a pull containing an interrupt, with the type string recorded so supported-families.ts can cite it.",
    whyItMatters:
      "An interrupt is a rotational GCD spent on purpose; read as a missed rotational cast it becomes exactly the false finding the analyzer exists to avoid.",
    currentSupport:
      "INTERRUPTS is UNVERIFIED in supported-families.ts: an event of that type is counted unsupported, never interpreted, and the category is degraded rather than silently absent.",
    existingEvidence:
      "Synthetic only: normalization.unsupported-type-is-counted-not-interpreted pins the unsupported path. No capture holds the real type string. M10-B's bounded Protection Paladin capture (A7R6kxPJ1hC8YQ4w fight 7, the pull's first 45 s, 30,588 events, every actor) contained NO interrupt event by any actor, so the wire shape remains unseen; the family stays unsupported and no grant was added.",
    disposition: "DEFER_TO_MILESTONE",
    owner:
      "M10 (Protection Paladin): the first capture milestone whose subject has an interrupt (Rebuke) in its supported decision surface; a later bounded capture must retain every interrupt by the player, from a pull known to contain one.",
    closedBy: [],
  },
  {
    id: "no-death-or-dispel-events",
    layers: ["NORMALIZATION", "COMBAT_STATE"],
    gap: "No committed capture contains a death or dispel event. DEATHS and DISPELS stay UNVERIFIED and nothing in the corpus can pin how they normalize.",
    whatWouldClose:
      "A sanitized slice from a pull containing a player death and a dispel, with the type strings recorded so supported-families.ts can cite them.",
    whyItMatters:
      "A death is actionability evidence (a dead player cannot act) and a dispel is healer triage evidence; a death read as inactivity is the historical failure class.",
    currentSupport:
      "DEATHS and DISPELS are UNVERIFIED in supported-families.ts: counted unsupported, never interpreted, category degraded rather than silently absent.",
    existingEvidence: "None in any capture; the synthetic unsupported-type case pins the unsupported path.",
    disposition: "DEFER_TO_MILESTONE",
    owner:
      "M12 (death-event and dispel/triage behaviour): the milestone that first consumes deaths for actionability and dispels for healer triage owns the capture. Not M10 — a tank capture may happen to contain a dispel, but healer triage semantics are not a tank question.",
    closedBy: [],
  },
  {
    id: "no-targetability-or-intermission",
    layers: ["NORMALIZATION", "COMBAT_STATE"],
    gap: "No committed capture contains a targetability event. Real intermission PHASE evidence is now present; targetability — the encounter-reality input actionability needs — is not.",
    whatWouldClose:
      "A bounded events query over one intermission window of an encounter with an untargetable phase, retaining the targetability event shape alongside the phase transitions the corpus already holds.",
    whyItMatters:
      "ACTIONABLE requires positive evidence; without real targetability data every actionability rule is pinned on constructed state and a real 30-second intermission could still become a dozen rotational findings.",
    currentSupport:
      "Phase transitions are normalized verbatim (fight-context.ts) and encounter outcome facts are carried; no targetability event contract exists and actionability over absent targetability resolves UNKNOWN.",
    existingEvidence:
      "Intermission phases PRESENT: wcl-fight-context-a7r6-fight-7 holds 9 real phase transitions, 4 flagged isIntermission, pinned by normalization.real-fight-header-carries-kill-difficulty-and-intermission-phases; wcl-fight-context-gtkb-fight-22 holds a no-intermission encounter for contrast. Targetability: none.",
    disposition: "DEFER_TO_MILESTONE",
    owner:
      "M14 (targetability and temporal root-cause consumers): the milestone that derives actionability from targetability owns the capture; the phase evidence it will combine with is already committed.",
    closedBy: [],
  },
  {
    id: "no-pet-or-guardian-actor",
    layers: ["NORMALIZATION"],
    gap: "No committed capture includes a pet or guardian class with a petOwner, so pet identity is pinned only synthetically.",
    whatWouldClose:
      "A slice from a pull with a Hunter, Warlock or Death Knight pet, including the master-data actor entries.",
    whyItMatters:
      "Pets are more than half of a real actor catalog; folding a pet into its owner, or its owner into the pet, misattributes casts, damage and resources.",
    currentSupport:
      "normalizeActors reads petOwner from master data only; event direction reads the verified field names; nothing infers ownership.",
    existingEvidence:
      "CLOSED: wcl-fight-context-a7r6-fight-7 (165 real pets, 126 with petOwner) and wcl-pet-sourced-events-hunter-pet-29 (44 real pet-sourced events) — two bounded captures, 2 requests.",
    disposition: "CLOSE_IN_M9",
    owner: "M9",
    closedBy: [
      "normalization.real-master-data-catalogs-every-actor-including-pets-and-the-sentinel-entry",
      "normalization.pet-sourced-events-keep-the-pet-as-source",
    ],
  },
  {
    id: "no-real-page-boundary",
    layers: ["WCL_TRANSPORT"],
    gap: "Pagination behaviour is pinned on synthetic page sequences. The one real truncated-prefix cursor (2,191,432) is recorded as source metadata, not as a page artifact the paginator can be driven over.",
    whatWouldClose:
      "A WCL_GRAPHQL_PAGE_SEQUENCE artifact cut from two consecutive real pages of one report, with the raw cursor preserved.",
    whyItMatters:
      "The verbatim-cursor rule is the difference between a complete stream and one that silently skips or duplicates events at every page boundary.",
    currentSupport: "paginateEventStream passes nextPageTimestamp back verbatim and deduplicates nothing.",
    existingEvidence:
      "CLOSED: wcl-page-sequence-limit-40 (five consecutive real pages, four real boundaries) and wcl-page-terminal-one-millisecond (a real terminal page) — 6 requests.",
    disposition: "CLOSE_IN_M9",
    owner: "M9",
    closedBy: [
      "wcl-transport.real-page-boundaries-carry-the-cursor-verbatim",
      "wcl-transport.real-terminal-page-completes-the-stream",
    ],
  },
  {
    id: "no-real-partial-retrieval",
    layers: ["WCL_TRANSPORT", "COMBAT_STATE"],
    gap: "Partial retrieval (a failed or rate-limited middle page) is pinned synthetically; no real capture of a failed page exists.",
    whatWouldClose: "A recorded live failure response, sanitized, as a page-sequence artifact.",
    whyItMatters:
      "A failed page must become PARTIAL coverage, never an idle interval; the rule is only trustworthy if it holds over real pages with real cursors.",
    currentSupport:
      "The paginator ends PARTIAL with the transport's failure classification and keeps every retrieved page; coverage over the missing range is not granted.",
    existingEvidence:
      "CLOSED for partial retrieval over real pages: wcl-page-sequence-limit-40.page-5-removed is the real five-page capture with page 5 removed (recorded EVENT_REMOVAL, no coverage grant to invalidate). A verbatim upstream failure BODY remains uncaptured: provoking one means spending or exhausting quota, which the capture policy forbids, so that residual is outside current capability and the transport's classification of it is pinned by tests/unit/wcl-graphql-client.test.ts.",
    disposition: "CLOSE_IN_M9",
    owner: "M9",
    closedBy: ["wcl-transport.missing-later-page-keeps-four-real-pages-and-stays-partial"],
  },
  {
    id: "no-identity-conflict-capture",
    layers: ["APPLICATION_SERVICE"],
    gap: "Identity conflicts (class/spec metadata disagreeing with observed abilities) and preflight refusals are pinned by tests/fixtures/wcl/preflight-payloads.ts, which is synthetic TypeScript outside the corpus contract.",
    whatWouldClose:
      "First, an implemented observed-versus-metadata conflict detector (there is none); then a sanitized real report whose friendlySpecs disagree with combatantinfo, which cannot be selected without crawling reports.",
    whyItMatters:
      "A null class, a wrong spec or an unresolved source id must stop specialization analysis; an identity that is half-hydrated is coached as the wrong player.",
    currentSupport:
      "Three distinct things. (1) Real identity RESOLUTION from metadata: implemented, and every refusal explicit (seven reasons). (2) Propagation of an IDENTITY_CONFLICT result: the state exists in src/services/result.ts and NOTHING produces or consumes it — no test presents a synthetic conflict result, so there is no implemented boundary the corpus could execute. (3) DETECTION of a conflict from observed abilities: not implemented.",
    existingEvidence:
      "(1) is corpus-pinned over real master data by wcl-transport.identity-resolves-over-real-master-data-and-refuses-the-rest and wcl-transport.identity-resolves-both-assassination-rogues-of-the-high-parse-kill; the malformed-payload refusals stay on tests/fixtures/wcl/preflight-payloads.ts BY DECISION (a mutable builder, see the README). (2) and (3): no evidence exists and none could — no implemented path produces the result.",
    disposition: "OUTSIDE_CURRENT_CAPABILITY",
    owner:
      "M15 (identity and product maturity): implement conflict detection and its propagation, then own the evidence for both; until then no capture and no synthetic contract can honestly claim the result is proven.",
    closedBy: [],
  },
  {
    id: "no-application-service-cases",
    layers: ["APPLICATION_SERVICE"],
    gap: "APPLICATION_SERVICE owns no corpus case. Its contracts — scope derivation, refusals, batching — are exercised through PUBLIC_CONTRACT parity (which composes the services) and through the existing service tests, not through corpus assertions of their own.",
    whatWouldClose:
      "Assertion kinds for the service layer's own refusal codes and derived ingestion scope, over the existing artifacts.",
    whyItMatters:
      "Scope derivation and SPEC_NOT_SUPPORTED are the service's own rules; a corpus that never asks the service directly cannot say which layer broke when parity fails.",
    currentSupport:
      "analyzeFight derives scope from the selected analyzer's requirement and answers SPEC_NOT_SUPPORTED before retrieval.",
    existingEvidence:
      "CLOSED: APPLICATION_SERVICE.FIGHT_ANALYSIS over the D2 corpus (one case per status) and over the second report's opener slice.",
    disposition: "CLOSE_IN_M9",
    owner: "M9",
    closedBy: [
      "application-service.derives-player-context-scope-and-selects-the-assassination-analyzer",
      "application-service.unsupported-spec-runs-no-analyzer-and-retrieves-nothing",
      "application-service.high-parse-subject-is-analyzed-under-player-context",
    ],
  },
  {
    id: "no-external-reference-fixture",
    layers: ["PUBLIC_CONTRACT"],
    gap: "Encounter-context parity runs local-only. No rankings response is committed to the corpus, so the M8-F external-reference path is not exercised by a corpus case.",
    whatWouldClose:
      "A sanitized rankings response as a corpus artifact, with player names redacted, driven through injected ports.",
    whyItMatters:
      "External references are the one place ranking data enters the product; the corpus must show they stay context — bounded, identity-ordered, UNKNOWN comparability — and never become authority.",
    currentSupport:
      "discoverExternalReferences: one ranking page, at most MAX_QUALIFIED_CANDIDATES metadata lookups, candidate-local failures, identity ordering; the local half completes first.",
    existingEvidence:
      "CLOSED: wcl-encounter-rankings-sszorak-page-1 (a real, sanitized 100-row page from the M8-F probe) served through injected ports with SYNTHETIC per-candidate metadata as a stated premise; two cases cover COMPLETED and transport failure.",
    disposition: "CLOSE_IN_M9",
    owner: "M9",
    closedBy: [
      "public-contract.encounter-context-parity-with-external-references-over-a-real-ranking-page",
      "public-contract.encounter-context-external-transport-failure-preserves-local-progression",
    ],
  },
  {
    id: "no-protection-paladin-evidence",
    layers: ["SPEC_ASSASSINATION"],
    gap: "The only Protection Paladin evidence is the qJ1pgB49ZrRNVmCd window slices, which were cut for type recognition rather than for tank decisions. M10 has no decision-level evidence to start from.",
    whatWouldClose:
      "A capture of a Protection Paladin pull with every actor cast and every aura on the player and the boss retained, under a recorded predicate.",
    whyItMatters:
      "M10 is the second vertical slice; starting it without decision-level evidence repeats the guesswork the corpus exists to prevent.",
    currentSupport:
      "SPEC_NOT_SUPPORTED, pinned at the facade (spec-assassination.protection-paladin-is-refused-at-the-spec-gate), the service (application-service.unsupported-spec-runs-no-analyzer-and-retrieves-nothing) and the public contract (public-contract.analysis-parity-for-an-unsupported-spec).",
    existingEvidence:
      "CLOSED by M10-B's bounded capture — A7R6kxPJ1hC8YQ4w fight 7, actor 7, the pull's first 45 s in four terminal pages at revision 30 before and after, cut by the --actor-slice predicate to the subject's first 22 s (988 events, every event actor 7 sources or is targeted by): real Protection Paladin identity, Holy Power PRE_COST on costed Shield of the Righteous casts, two completed spender casts with no Holy Power entry (NO_OBSERVATION, never zero), standalone Holy Power changes never replayed, aura transitions with ambiguous pre-first state, 36 damage events taken with mitigation fields, self-healing by source = target, absorb attribution, a summon of the subject's pet, combatantinfo with specID 66 and an 80-node talent tree, and a gap derivation that fails closed. The subject remains SPEC_NOT_SUPPORTED at the service and on both transports over its own evidence.",
    disposition: "CLOSE_IN_M10",
    owner: "M10",
    closedBy: [
      "wcl-transport.identity-resolves-the-protection-paladin-of-the-a7r6-kill",
      "normalization.protection-paladin-opener-slice-normalizes-whole-and-in-order",
      "normalization.protection-paladin-slice-census-for-actor-7",
      "combat-state.holy-power-is-pre-cost-on-costed-shield-of-the-righteous-casts",
      "combat-state.missing-holy-power-entry-is-no-observation-not-zero",
      "combat-state.standalone-holy-power-changes-are-observed-never-replayed",
      "combat-state.protection-paladin-aura-is-observed-at-transitions-and-ambiguous-before-its-first",
      "combat-state.protection-paladin-index-exposes-damage-taken-healing-and-absorbs",
      "combat-state.protection-paladin-gap-before-2010000-fails-closed",
      "application-service.protection-paladin-subject-is-still-unsupported-on-its-own-evidence",
      "public-contract.analysis-parity-for-the-protection-paladin-subject",
    ],
  },
  {
    id: "single-report-assassination-corpus",
    layers: ["SPEC_ASSASSINATION"],
    gap: "Every Assassination decision case comes from one report, one fight, one player (A7R6kxPJ1hC8YQ4w fight 7, actor 19, with one rejection from actor 13). No second build, no wipe, no death, no multi-target pull.",
    whatWouldClose:
      "Further sanitized slices from different reports and builds, selected by the same mechanical census rule the D2 corpus documents.",
    whyItMatters:
      "One subject cannot show that verdicts are about authority compatibility rather than about one player's habits; a second subject on a different pull can.",
    currentSupport:
      "Verdicts are MATCH = AUTHORITY_COMPATIBLE_ONLY, REJECTED or UNKNOWN, and no verdict reads performance data.",
    existingEvidence:
      "CLOSED by one COHERENT capture — gtKb2xHn87pNcFfW fight 22, actor 25: the report context (master data, header, roster), the opener slice cut by the D2 predicate from the fight's first 20 s, and the report's own per-fight rankings — all from one report, one fight, one source, 4 requests. The subject is the Sszorak heroic Assassination board's top parse (100 % / 100 %, partition 1), on a 284,791 ms kill against the D2 subject's 424,514 ms; the same kill's other Assassination Rogue (actor 8) parsed 8 % / 17 %. Talents, DoT arithmetic, resource snapshots, proven absences and two observed decisions are pinned on it; every decision resolves UNKNOWN / OBSERVED_STATE_MISSING, which is the honest answer over a window that starts at the pull. Performance context is recorded on the source and read by no assertion.",
    disposition: "CLOSE_IN_M9",
    owner: "M9",
    closedBy: [
      "wcl-transport.identity-resolves-both-assassination-rogues-of-the-high-parse-kill",
      "normalization.high-parse-report-context-normalizes-with-no-intermission",
      "normalization.high-parse-opener-slice-normalizes-whole-and-in-order",
      "combat-state.high-parse-opener-pre-pull-stealth-is-ambiguous-until-its-observed-removal",
      "combat-state.high-parse-opener-resource-snapshots-anchors-and-proven-absences",
      "spec-assassination.high-parse-build-resolves-improved-garrote-and-shrouded-suffocation",
      "spec-assassination.high-parse-opener-garrote-remains-derives-and-rupture-refuses",
      "spec-assassination.high-parse-opener-garrote-from-pre-pull-stealth-stays-unknown",
      "spec-assassination.high-parse-opener-envenom-at-five-combo-points-stays-unknown",
      "application-service.high-parse-subject-is-analyzed-under-player-context",
      "public-contract.analysis-parity-over-the-high-parse-opener",
    ],
  },
  {
    id: "assassination-corpus-breadth",
    layers: ["SPEC_ASSASSINATION"],
    gap: "Two Assassination subjects from two reports, both kills, both on Venomous Abyss bosses; no wipe, no death, no multi-target pull, no capture that begins before the pull (so no opener decision resolves), no full-fight second subject, and the low-bracket subject of the second kill (actor 8, 8 %) has performance provenance but no events. The one-millisecond cast-to-application offset the second report exposed has no tolerance model.",
    whatWouldClose:
      "Bounded captures selected by the D2 census rule: a wipe, a pre-pull window that retains the Stealth application, the low-bracket subject's own slice from the same kill, and a decision on whether a bounded cast-to-application tolerance is sound for combo-point DoTs.",
    whyItMatters:
      "Breadth is what lets the corpus separate 'the rule' from 'this log'; a single opener that resolves nothing cannot show a resolved decision on a second report.",
    currentSupport:
      "Everything the two reports exercise is pinned; the facade fails closed on everything they do not.",
    existingEvidence:
      "Two coherent subjects (A7R6 fight 7 / actor 19; gtKb fight 22 / actor 25) and one report-only low subject (gtKb actor 8, no events).",
    disposition: "DEFER_TO_MILESTONE",
    owner:
      "M11 (broader DPS corpus expansion): the milestone that widens the DPS corpus beyond the first vertical slice owns the second-subject breadth, the pre-pull window and the tolerance decision; not M15, because these are evidence needs of the Assassination analyzer itself, not product-maturity work.",
    closedBy: [],
  },
];

export function corpusCoverageReport(corpus: LoadedCorpus): CorpusCoverageReport {
  const byKind: Record<ProvenanceKind, number> = {
    REAL_CAPTURE: 0,
    SANITIZED_CAPTURE: 0,
    DERIVED_FROM_CAPTURE: 0,
    SYNTHETIC: 0,
  };
  const sources = new Map<string, { reportCode: string; fightId: number | string; artifacts: number }>();
  const withRetainedCoverage: string[] = [];
  for (const artifact of corpus.artifacts) {
    const { provenance } = artifact.record;
    byKind[provenance.kind] += 1;
    if (provenance.source !== null) {
      const { query } = provenance.source;
      // A ranking page is captured per encounter, not per report and fight.
      const [reportCode, fightId]: [string, number | string] =
        "kind" in query && query.kind === "ENCOUNTER_CHARACTER_RANKINGS"
          ? [`encounter ${String(query.encounterId)}`, `difficulty ${String(query.difficulty)}`]
          : [String(provenance.source.reportCode), provenance.source.fightId];
      const key = `${reportCode}/${String(fightId)}`;
      const existing = sources.get(key);
      sources.set(key, { reportCode, fightId, artifacts: (existing?.artifacts ?? 0) + 1 });
    }
    if (provenance.retainedCoverage.grants.length > 0) withRetainedCoverage.push(artifact.record.artifactId);
  }

  const byLayer: LayerCoverage[] = [];
  for (const owningLayer of OWNING_LAYER_IDS) {
    const cases = corpus.cases.filter((entry) => entry.record.owningLayer === owningLayer);
    const exercised = new Set<AssertionKind>();
    for (const entry of cases) for (const assertion of entry.assertions) exercised.add(assertion.kind);
    const registered = (Object.keys(ASSERTION_KINDS) as AssertionKind[]).filter(
      (kind) => ASSERTION_KINDS[kind].owningLayer === owningLayer,
    );
    byLayer.push({
      owningLayer,
      cases: cases.length,
      assertions: cases.reduce((sum, entry) => sum + entry.assertions.length, 0),
      kindsExercised: registered.filter((kind) => exercised.has(kind)),
      kindsRegisteredButUnused: registered.filter((kind) => !exercised.has(kind)),
    });
  }

  return {
    artifacts: {
      total: corpus.artifacts.length,
      byKind,
      totalBytes: corpus.totalArtifactBytes,
      sourceCaptures: [...sources.values()].sort((a, b) => (a.reportCode < b.reportCode ? -1 : 1)),
      withRetainedCoverage,
    },
    cases: {
      total: corpus.cases.length,
      assertions: corpus.cases.reduce((sum, entry) => sum + entry.assertions.length, 0),
      executable: corpus.coverage.executable,
      declared: corpus.coverage.declared,
      authorityPinned: corpus.cases.filter((entry) => entry.record.authority !== null).length,
    },
    byLayer,
    gaps: KNOWN_EVIDENCE_GAPS,
  };
}

/** A fixed-width text rendering for a closeout. Deterministic; no clock. */
export function renderCoverageReport(report: CorpusCoverageReport): string {
  const lines: string[] = [];
  lines.push(
    `artifacts: ${String(report.artifacts.total)} (${String(report.artifacts.totalBytes)} canonical bytes)`,
  );
  for (const [kind, count] of Object.entries(report.artifacts.byKind))
    lines.push(`  ${kind}: ${String(count)}`);
  for (const source of report.artifacts.sourceCaptures) {
    lines.push(
      `  source ${source.reportCode} fight ${String(source.fightId)}: ${String(source.artifacts)} artifacts`,
    );
  }
  lines.push(`  with retained coverage: ${report.artifacts.withRetainedCoverage.join(", ") || "none"}`);
  lines.push(
    `cases: ${String(report.cases.total)}, assertions: ${String(report.cases.assertions)} (executable ${String(report.cases.executable)}, declared ${String(report.cases.declared)}), authority-pinned cases: ${String(report.cases.authorityPinned)}`,
  );
  for (const layer of report.byLayer) {
    lines.push(
      `  ${layer.owningLayer}: ${String(layer.cases)} cases, ${String(layer.assertions)} assertions; kinds exercised ${String(layer.kindsExercised.length)}, registered but unused ${String(layer.kindsRegisteredButUnused.length)}${layer.kindsRegisteredButUnused.length > 0 ? ` (${layer.kindsRegisteredButUnused.join(", ")})` : ""}`,
    );
  }
  lines.push(`evidence gaps: ${String(report.gaps.length)}`);
  for (const gap of report.gaps) {
    lines.push(
      `  - ${gap.id} [${gap.layers.join(", ")}] ${gap.disposition}${gap.closedBy.length > 0 ? ` by ${gap.closedBy.join(", ")}` : ""}`,
    );
  }
  return lines.join("\n");
}

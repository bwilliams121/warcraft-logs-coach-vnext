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

export interface EvidenceGap {
  readonly id: string;
  readonly layers: readonly OwningLayer[];
  readonly gap: string;
  readonly whatWouldClose: string;
}

/**
 * What the corpus does NOT yet contain, and what would put it there.
 *
 * Kept as data so the closeout, the README and the tests read one list. Each
 * entry's remedy is a capture or a fixture, never "assume".
 */
export const KNOWN_EVIDENCE_GAPS: readonly EvidenceGap[] = [
  {
    id: "no-death-interrupt-dispel-events",
    layers: ["NORMALIZATION", "COMBAT_STATE"],
    gap: "No committed capture contains a death, interrupt or dispel event. DEATHS, INTERRUPTS and DISPELS stay UNVERIFIED and nothing in the corpus can pin how they normalize.",
    whatWouldClose:
      "A sanitized slice from a pull containing each, with the type strings recorded so supported-families.ts can cite it.",
  },
  {
    id: "no-targetability-or-intermission",
    layers: ["NORMALIZATION", "COMBAT_STATE"],
    gap: "No committed capture contains a targetability event or an encounter with a real intermission. Actionability evidence cannot be exercised on real data.",
    whatWouldClose:
      "A capture from an encounter with an untargetable phase, ideally with the phase transitions from the typed fight fields alongside.",
  },
  {
    id: "no-pet-or-guardian-actor",
    layers: ["NORMALIZATION"],
    gap: "No committed capture includes a pet or guardian class with a petOwner, so pet identity is pinned only synthetically.",
    whatWouldClose:
      "A slice from a pull with a Hunter, Warlock or Death Knight pet, including the master-data actor entries.",
  },
  {
    id: "no-real-page-boundary",
    layers: ["WCL_TRANSPORT"],
    gap: "Pagination behaviour is pinned on synthetic page sequences. The one real truncated-prefix cursor (2,191,432) is recorded as source metadata, not as a page artifact the paginator can be driven over.",
    whatWouldClose:
      "A WCL_GRAPHQL_PAGE_SEQUENCE artifact cut from two consecutive real pages of one report, with the raw cursor preserved.",
  },
  {
    id: "no-real-partial-retrieval",
    layers: ["WCL_TRANSPORT", "COMBAT_STATE"],
    gap: "Partial retrieval (a failed or rate-limited middle page) is pinned synthetically; no real capture of a failed page exists.",
    whatWouldClose: "A recorded live failure response, sanitized, as a page-sequence artifact.",
  },
  {
    id: "no-identity-conflict-capture",
    layers: ["APPLICATION_SERVICE"],
    gap: "Identity conflicts (class/spec metadata disagreeing with observed abilities) and preflight refusals are pinned by tests/fixtures/wcl/preflight-payloads.ts, which is synthetic TypeScript outside the corpus contract.",
    whatWouldClose:
      "Corpus artifact kinds for preflight payloads, plus a sanitized real report whose friendlySpecs disagree with combatantinfo.",
  },
  {
    id: "no-application-service-cases",
    layers: ["APPLICATION_SERVICE"],
    gap: "APPLICATION_SERVICE owns no corpus case. Its contracts — scope derivation, refusals, batching — are exercised through PUBLIC_CONTRACT parity (which composes the services) and through the existing service tests, not through corpus assertions of their own.",
    whatWouldClose:
      "Assertion kinds for the service layer's own refusal codes and derived ingestion scope, over the existing artifacts.",
  },
  {
    id: "no-external-reference-fixture",
    layers: ["PUBLIC_CONTRACT"],
    gap: "Encounter-context parity runs local-only. No rankings response is committed to the corpus, so the M8-F external-reference path is not exercised by a corpus case.",
    whatWouldClose:
      "A sanitized rankings response as a corpus artifact, with player names redacted, driven through injected ports.",
  },
  {
    id: "no-protection-paladin-evidence",
    layers: ["SPEC_ASSASSINATION"],
    gap: "The only Protection Paladin evidence is the qJ1pgB49ZrRNVmCd window slices, which were cut for type recognition rather than for tank decisions. M10 has no decision-level evidence to start from.",
    whatWouldClose:
      "A capture of a Protection Paladin pull with every actor cast and every aura on the player and the boss retained, under a recorded predicate.",
  },
  {
    id: "single-report-assassination-corpus",
    layers: ["SPEC_ASSASSINATION"],
    gap: "Every Assassination decision case comes from one report, one fight, one player (A7R6kxPJ1hC8YQ4w fight 7, actor 19, with one rejection from actor 13). No second build, no wipe, no death, no multi-target pull.",
    whatWouldClose:
      "Further sanitized slices from different reports and builds, selected by the same mechanical census rule the D2 corpus documents.",
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
      const key = `${String(provenance.source.reportCode)}/${String(provenance.source.fightId)}`;
      const existing = sources.get(key);
      sources.set(key, {
        reportCode: String(provenance.source.reportCode),
        fightId: provenance.source.fightId,
        artifacts: (existing?.artifacts ?? 0) + 1,
      });
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
  for (const gap of report.gaps) lines.push(`  - ${gap.id} [${gap.layers.join(", ")}]`);
  return lines.join("\n");
}

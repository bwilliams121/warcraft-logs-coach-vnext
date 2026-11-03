/**
 * ONB-A1: Havoc Demon Hunter's promotion readiness, reported in INTERNAL_ONLY mode
 * by the same shared reader the PUBLIC gate uses. It authorizes nothing: ONB-A1P is
 * the reviewed promotion. It pins that the two gates are met on real evidence, that
 * no control or derived artifact was needed, and that a public request still cannot
 * reach the row.
 */

import { describe, expect, it } from "vitest";

import { analyzerForSpec, PRODUCTION_CATALOG } from "../../src/services/analyzer-registry.js";
import { resolveSpecIdentity } from "../../src/services/spec-identity.js";
import { HAVOC_DEMON_HUNTER_MODULE } from "../../src/specs/demonhunter/havoc/registration.js";
import { committedEvidenceReport, loadCommittedEvidenceArchive } from "../support/corpus/evidence-archive.js";
import { committedCorpusFiles, loadCorpusOrThrow } from "../support/corpus/loader.js";
import {
  evaluatePromotionReadiness,
  MIN_DISTINCT_OBSERVED_ACTION_TOKENS,
  type CommittedReport,
  type EvidenceTier,
  type WclIdentity,
} from "../support/corpus/promotion-evidence.js";

const REPORT: Record<string, string> = import.meta.glob("../corpus/report.json", {
  eager: true,
  query: "?raw",
  import: "default",
});

async function tiers(): Promise<readonly EvidenceTier[]> {
  const corpus = await loadCorpusOrThrow(committedCorpusFiles());
  const archive = await loadCommittedEvidenceArchive();
  if (!archive.ok) throw new Error("the evidence archive does not validate");
  const report = JSON.parse(REPORT["../corpus/report.json"] ?? "null") as CommittedReport;
  return [
    { rootId: "REGRESSION_CORPUS", corpus, report },
    {
      rootId: "EVIDENCE_ARCHIVE",
      corpus: archive.archive,
      report: committedEvidenceReport() as CommittedReport | null,
    },
  ];
}

const internalPairing = (identity: WclIdentity): boolean =>
  identity.className === HAVOC_DEMON_HUNTER_MODULE.identity.wclClassName &&
  identity.specName === HAVOC_DEMON_HUNTER_MODULE.identity.wclSpecName &&
  !resolveSpecIdentity(identity).ok;

describe("Havoc Demon Hunter's readiness, reported and never authorizing", () => {
  it("meets the observation and discrimination gates on sanitized capture, with no control", async () => {
    const readiness = evaluatePromotionReadiness(
      await tiers(),
      "demonhunter/havoc",
      "INTERNAL_ONLY",
      internalPairing,
    );
    expect(readiness.observationGate.ready).toBe(true);
    expect(readiness.observationGate.realMatches).toBeGreaterThanOrEqual(1);
    expect(readiness.observationGate.distinctResolvedAbilityIds.length).toBeGreaterThanOrEqual(
      MIN_DISTINCT_OBSERVED_ACTION_TOKENS,
    );
    expect(readiness.discriminationGate.ready).toBe(true);
    expect(readiness.discriminationGate.controls).toEqual([]);
    expect(readiness.evidenceReady).toBe(true);
    expect(readiness.observationGate.distinctResolvedAbilityIds).toEqual([162794, 201427, 442294]);
    expect(readiness.qualifyingAssertions.map((q) => `${q.caseId} -> ${q.expectedOutcome}`).sort()).toEqual([
      "spec-havoc-demon-hunter.annihilation-with-reavers-glaive-proven-usable-is-rejected -> REJECTED",
      "spec-havoc-demon-hunter.chaos-strike-with-reavers-glaive-proven-usable-is-rejected -> REJECTED",
      "spec-havoc-demon-hunter.the-first-resolved-reavers-glaive-matches -> MATCH",
    ]);
    for (const q of readiness.qualifyingAssertions) {
      expect(q.evidenceSet.every((entry) => entry.kind === "SANITIZED_CAPTURE")).toBe(true);
      expect(q.evidenceActor).toEqual({ reportCode: "b1PmaKrd6CDfzngc", fightId: 48, actorId: 18 });
      expect(q.evidenceIdentity).toEqual({ className: "DemonHunter", specName: "Havoc" });
      expect(q.reportStatus).toBe("PASSED");
    }
  });

  it("a public request cannot reach the row: the identity table refuses and the public lookup finds nothing", () => {
    expect(resolveSpecIdentity({ className: "DemonHunter", specName: "Havoc" }).ok).toBe(false);
    expect(analyzerForSpec("demonhunter/havoc", PRODUCTION_CATALOG)).toBeNull();
  });
});

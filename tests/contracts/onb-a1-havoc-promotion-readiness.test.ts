/**
 * ONB-A1P: Havoc Demon Hunter's promotion evidence, through the identity table.
 *
 * RE-PINNED AT ONB-A1P, INVERTING ONB-A1. This file reported the readiness in
 * INTERNAL_ONLY mode and pinned that a public request could not reach the row. It
 * now pins the same real assertions in PUBLIC mode, by the same shared reader, with
 * no Havoc branch in the gate. The global gate itself is
 * `m11-promotion-evidence-gate.test.ts`, which fails CI if a PUBLIC specialization
 * stops passing.
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

const publicPairing = (identity: WclIdentity): boolean => {
  const resolved = resolveSpecIdentity(identity);
  return resolved.ok && resolved.specId === "demonhunter/havoc";
};

const internalPairing = (identity: WclIdentity): boolean =>
  identity.className === HAVOC_DEMON_HUNTER_MODULE.identity.wclClassName &&
  identity.specName === HAVOC_DEMON_HUNTER_MODULE.identity.wclSpecName &&
  !resolveSpecIdentity(identity).ok;

describe("Havoc Demon Hunter passes both global gates in PUBLIC mode, on real evidence and no control", () => {
  it("meets the observation and discrimination gates on sanitized capture, paired through the identity table", async () => {
    const readiness = evaluatePromotionReadiness(await tiers(), "demonhunter/havoc", "PUBLIC", publicPairing);
    expect(readiness.exposure).toBe("PUBLIC");
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

  it("a public request reaches the row: the identity table resolves it and the public lookup finds it", () => {
    expect(resolveSpecIdentity({ className: "DemonHunter", specName: "Havoc" })).toEqual({
      ok: true,
      specId: "demonhunter/havoc",
    });
    expect(analyzerForSpec("demonhunter/havoc", PRODUCTION_CATALOG)?.analyzerId).toBe(
      "demonhunter-havoc-observed-decisions",
    );
    expect(HAVOC_DEMON_HUNTER_MODULE.exposure).toBe("PUBLIC");
  });

  it("the internal pairing finds nothing now that the identity table resolves it", async () => {
    const readiness = evaluatePromotionReadiness(
      await tiers(),
      "demonhunter/havoc",
      "INTERNAL_ONLY",
      internalPairing,
    );
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("Vengeance stays unsupported: the class alone never selects a row", () => {
    expect(resolveSpecIdentity({ className: "DemonHunter", specName: "Vengeance" }).ok).toBe(false);
  });
});

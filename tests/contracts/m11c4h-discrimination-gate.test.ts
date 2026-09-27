import { describe, expect, it } from "vitest";

import type { CorpusManifest } from "../support/corpus/contract.js";
import { committedEvidenceReport, loadCommittedEvidenceArchive } from "../support/corpus/evidence-archive.js";
import {
  canonicalBytesOf,
  committedCorpusFiles,
  loadCorpusOrThrow,
  sha256Hex,
  validateCorpus,
  type CorpusErrorCode,
  type CorpusFileTable,
  type LoadedCase,
  type LoadedCorpus,
} from "../support/corpus/loader.js";
import {
  evaluatePromotionReadiness,
  type CommittedReport,
  type EvidenceTier,
  type WclIdentity,
} from "../support/corpus/promotion-evidence.js";

/**
 * M11-C4h: the global observation / discrimination split, and every way the
 * negative-control path must fail closed. The committed gate
 * (`m11-promotion-evidence-gate.test.ts`) runs the same reader over the
 * committed roots; here the manifest, payloads and loaded tiers are edited in
 * memory — the committed bytes are untouched.
 *
 * Two layers refuse a bad control, and each is tested on its own:
 *
 *   LOADER  the substitution is a one-field diff from a SANITIZED_CAPTURE
 *           parent, re-derived from both payloads (CONTROL_SUBSTITUTION_*);
 *   GATE    the control is about the substituted cast, flips a qualifying
 *           real MATCH over the same bundle, rests on an APPLICABLE action,
 *           counts only as REJECTED, and never as observation.
 */

const REPORT: Record<string, string> = import.meta.glob("../corpus/report.json", {
  eager: true,
  query: "?raw",
  import: "default",
});

const PARENT = "wcl-protection-paladin-a7r6-rotational-165s.seg-60-90";
const CONTROL = "wcl-protection-paladin-a7r6-rotational-165s.seg-60-90.control-2074381-divine-toll";
const CONTROL_PATH = `artifacts/wcl-events/${CONTROL}.json`;
const CONTROL_CASE =
  "spec-protection-paladin.negative-control-divine-toll-substituted-at-2074381-is-rejected-on-real-state";
const PARENT_MATCH_CASE =
  "spec-protection-paladin.hammer-of-wrath-is-unusable-only-from-an-observed-removal-of-its-readiness-aura";
const PROTECTION = (identity: WclIdentity): boolean =>
  identity.className === "Paladin" && identity.specName === "Protection";

// ---------------------------------------------------------------------------
// LOADER: the substitution rule
// ---------------------------------------------------------------------------

type ArtifactRecord = CorpusManifest["artifacts"][number];

/** The committed file table with the manifest and/or the control payload edited, digests re-pinned. */
async function edited(
  editManifest: (manifest: CorpusManifest) => void,
  editControl: ((events: Record<string, unknown>[]) => Record<string, unknown>[]) | null = null,
): Promise<CorpusFileTable> {
  const files = committedCorpusFiles();
  const manifest = JSON.parse(files["manifest.json"] ?? "") as CorpusManifest;
  const next: Record<string, string> = { ...files };
  if (editControl !== null) {
    const events = JSON.parse(files[CONTROL_PATH] ?? "") as Record<string, unknown>[];
    const text = `${JSON.stringify(editControl(events), null, 2)}\n`;
    next[CONTROL_PATH] = text;
    const record = manifest.artifacts.find((entry) => entry.artifactId === CONTROL);
    if (record === undefined) throw new Error("no control record");
    const bytes = canonicalBytesOf(text);
    (record as { sha256: string }).sha256 = await sha256Hex(bytes);
    (record as { byteLength: number }).byteLength = bytes.byteLength;
  }
  editManifest(manifest);
  next["manifest.json"] = JSON.stringify(manifest);
  return next;
}

function recordOf(manifest: CorpusManifest, artifactId: string): ArtifactRecord {
  const record = manifest.artifacts.find((entry) => entry.artifactId === artifactId);
  if (record === undefined) throw new Error(`no record ${artifactId}`);
  return record;
}

async function codes(files: CorpusFileTable): Promise<readonly CorpusErrorCode[]> {
  const result = await validateCorpus(files);
  return result.ok ? [] : result.errors.map((error) => error.code);
}

describe("LOADER — a substitution is exactly one field of one cast away from a SANITIZED_CAPTURE parent", () => {
  it("the committed control validates, and its declaration is present", async () => {
    const result = await validateCorpus(committedCorpusFiles());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const control = result.corpus.artifacts.find((entry) => entry.record.artifactId === CONTROL);
    expect(control?.record.provenance.kind).toBe("DERIVED_FROM_CAPTURE");
    expect(control?.record.provenance.parentArtifactId).toBe(PARENT);
    expect(control?.record.provenance.substitution?.kind).toBe("SINGLE_CAST_ABILITY_SUBSTITUTION");
  });

  it("a second field changed on the substituted cast is refused", async () => {
    const files = await edited(
      () => undefined,
      (events) => events.map((event, index) => (index === 241 ? { ...event, targetID: 23 } : event)),
    );
    expect(await codes(files)).toEqual(["CONTROL_SUBSTITUTION_DIFF_INVALID"]);
  });

  it("any other event changed, or an event removed, is refused", async () => {
    const other = await edited(
      () => undefined,
      (events) => events.map((event, index) => (index === 300 ? { ...event, abilityGameID: 1 } : event)),
    );
    expect(await codes(other)).toEqual(["CONTROL_SUBSTITUTION_DIFF_INVALID"]);
    const removed = await edited(
      () => undefined,
      (events) => events.filter((_, index) => index !== 500),
    );
    expect(await codes(removed)).toEqual(["CONTROL_SUBSTITUTION_DIFF_INVALID"]);
  });

  it("a declaration that names another event, another original ability or another substitute is refused", async () => {
    for (const change of [
      { eventIndex: 240 },
      { fromAbilityGameId: 53600 },
      { toAbilityGameId: 427453 },
      { reportTimeMs: 2074380 },
      { sourceActorId: 6 },
    ]) {
      const files = await edited((manifest) => {
        const record = recordOf(manifest, CONTROL);
        const declared = record.provenance.substitution;
        if (declared === undefined) throw new Error("no declaration");
        (record.provenance as { substitution: unknown }).substitution = { ...declared, ...change };
      });
      expect(await codes(files), JSON.stringify(change)).toContain("CONTROL_SUBSTITUTION_DIFF_INVALID");
    }
  });

  it("a substitution declared on a SANITIZED_CAPTURE is refused: a substituted capture is DERIVED", async () => {
    const files = await edited((manifest) => {
      const control = recordOf(manifest, CONTROL);
      const parent = recordOf(manifest, PARENT);
      (parent.provenance as { substitution: unknown }).substitution = control.provenance.substitution;
    });
    expect(await codes(files)).toEqual(["CONTROL_SUBSTITUTION_REQUIRES_DERIVED"]);
  });

  it("a parent that is itself a derivation is refused", async () => {
    const files = await edited((manifest) => {
      (recordOf(manifest, CONTROL).provenance as { parentArtifactId: string }).parentArtifactId =
        "wcl-protection-paladin-a7r6-rotational-45s.gap-before-2026589";
    });
    expect(await codes(files)).toEqual(["CONTROL_SUBSTITUTION_PARENT_NOT_SANITIZED"]);
  });

  it("a second transformation is refused: a control is one VALUE_MUTATION and nothing else", async () => {
    const files = await edited((manifest) => {
      const record = recordOf(manifest, CONTROL);
      const [mutation] = record.provenance.transformations;
      if (mutation === undefined) throw new Error("no mutation");
      (record.provenance as { transformations: unknown[] }).transformations = [
        mutation,
        { ...mutation, kind: "EVENT_REMOVAL" },
      ];
    });
    expect(await codes(files)).toEqual(["CONTROL_SUBSTITUTION_TRANSFORMATION_INVALID"]);
  });

  it("coverage that differs from the parent's is refused", async () => {
    const files = await edited((manifest) => {
      const record = recordOf(manifest, CONTROL);
      const grants = record.provenance.retainedCoverage.grants.map((grant) => ({
        ...grant,
        ranges: grant.ranges.map((range) => ({ ...range, toReportTimeMs: range.toReportTimeMs - 1 })),
      }));
      (record.provenance.retainedCoverage as { grants: unknown }).grants = grants;
    });
    expect(await codes(files)).toEqual(["CONTROL_SUBSTITUTION_COVERAGE_DIFFERS"]);
  });
});

// ---------------------------------------------------------------------------
// GATE: the two readiness halves and the control path
// ---------------------------------------------------------------------------

async function committedTiers(): Promise<{ readonly corpus: EvidenceTier; readonly archive: EvidenceTier }> {
  const corpus = await loadCorpusOrThrow(committedCorpusFiles());
  const archive = await loadCommittedEvidenceArchive();
  if (!archive.ok) throw new Error(archive.errors.map((error) => error.message).join("\n"));
  const archiveReport = committedEvidenceReport() as CommittedReport | null;
  if (archiveReport === null) throw new Error("tests/evidence/report.json is absent");
  return {
    corpus: {
      rootId: "REGRESSION_CORPUS",
      corpus,
      report: JSON.parse(REPORT["../corpus/report.json"] ?? "null") as CommittedReport,
    },
    archive: { rootId: "EVIDENCE_ARCHIVE", corpus: archive.archive, report: archiveReport },
  };
}

/** The corpus tier with one case replaced (or removed, when `edit` returns null). */
function withCase(
  tier: EvidenceTier,
  caseId: string,
  edit: (kase: LoadedCase) => LoadedCase | null,
): EvidenceTier {
  const cases = tier.corpus.cases.flatMap((kase) => {
    if (kase.record.caseId !== caseId) return [kase];
    const next = edit(kase);
    return next === null ? [] : [next];
  });
  return { ...tier, corpus: { ...tier.corpus, cases } as LoadedCorpus };
}

/** A case with assertion `ordinal`'s params rewritten. */
function withParams(
  kase: LoadedCase,
  ordinal: number,
  edit: (params: Record<string, unknown>) => unknown,
): LoadedCase {
  return {
    ...kase,
    assertions: kase.assertions.map((assertion, index) =>
      index === ordinal
        ? { ...assertion, params: edit(assertion.params as Record<string, unknown>) }
        : assertion,
    ),
  };
}

function protection(tiers: readonly EvidenceTier[]) {
  const readiness = evaluatePromotionReadiness(tiers, "paladin/protection", "PUBLIC", PROTECTION);
  return {
    readiness,
    controlDisqualified: readiness.disqualified.filter((d) => d.caseId === CONTROL_CASE).map((d) => d.reason),
  };
}

describe("GATE — the committed roots", () => {
  it("Protection: observation from real MATCH over two supported observed action tokens; discrimination from its one control only", async () => {
    const { corpus, archive } = await committedTiers();
    const { readiness, controlDisqualified } = protection([corpus, archive]);
    expect(controlDisqualified).toEqual([]);
    expect(readiness.observationGate.ready).toBe(true);
    expect(readiness.observationGate.distinctResolvedAbilityIds).toEqual([31935, 375576]);
    expect(readiness.discriminationGate.realRejected).toEqual([]);
    expect(readiness.discriminationGate.controls.map((c) => c.caseId)).toEqual([CONTROL_CASE]);
    expect(readiness.evidenceReady).toBe(true);
  });

  it("a control never counts as observation", async () => {
    const { corpus, archive } = await committedTiers();
    const { readiness } = protection([corpus, archive]);
    expect(readiness.observationGate.qualifyingAssertions.some((q) => q.caseId === CONTROL_CASE)).toBe(false);
    expect(
      readiness.observationGate.qualifyingAssertions.every((q) =>
        q.evidenceSet.every((entry) => entry.kind === "SANITIZED_CAPTURE"),
      ),
    ).toBe(true);
    // Without its control, Protection is still observation-ready and no longer discrimination-ready.
    const without = protection([withCase(corpus, CONTROL_CASE, () => null), archive]).readiness;
    expect(without.observationGate).toEqual(readiness.observationGate);
    expect(without.discriminationGate.ready).toBe(false);
    expect(without.evidenceReady).toBe(false);
  });

  it("a real REJECTED satisfies discrimination with no control (Assassination)", async () => {
    const { corpus, archive } = await committedTiers();
    const readiness = evaluatePromotionReadiness(
      [corpus, archive],
      "rogue/assassination",
      "PUBLIC",
      (identity) => identity.className === "Rogue" && identity.specName === "Assassination",
    );
    expect(readiness.discriminationGate.controls).toEqual([]);
    expect(readiness.discriminationGate.realRejected.length).toBeGreaterThan(0);
    expect(readiness.discriminationGate.ready).toBe(true);
  });

  it("Brewmaster passes observation and (since M11-C4i) discrimination on REAL REJECTED in both subjects — with no control", async () => {
    const { corpus, archive } = await committedTiers();
    const readiness = evaluatePromotionReadiness(
      [corpus, archive],
      "monk/brewmaster",
      "INTERNAL_ONLY",
      (identity) => identity.className === "Monk" && identity.specName === "Brewmaster",
    );
    expect(readiness.observationGate.ready).toBe(true);
    expect(readiness.observationGate.realMatches).toBe(5);
    expect(readiness.discriminationGate.controls).toEqual([]);
    expect(new Set(readiness.discriminationGate.realRejected.map((q) => q.evidenceActor.reportCode))).toEqual(
      new Set(["gtKb2xHn87pNcFfW", "rXAfw9t1q8YpmkKD"]),
    );
    expect(readiness.discriminationGate.ready).toBe(true);
    expect(readiness.evidenceReady).toBe(true);
  });
});

describe("GATE — the observation half fails closed", () => {
  it("real MATCH over a single supported observed action token is not observation-ready", async () => {
    const { corpus } = await committedTiers();
    // Only the Avenger's Shield MATCH case of Protection's real evidence survives.
    const cases = corpus.corpus.cases.filter(
      (kase) =>
        kase.record.owningLayer !== "SPEC_PROTECTION_PALADIN" ||
        kase.record.caseId ===
          "spec-protection-paladin.the-avengers-shield-press-under-vanguard-is-a-real-exact-entry-match",
    );
    const readiness = protection([
      { ...corpus, corpus: { ...corpus.corpus, cases } as LoadedCorpus },
    ]).readiness;
    expect(readiness.observationGate.realMatches).toBe(1);
    expect(readiness.observationGate.distinctResolvedAbilityIds).toEqual([31935]);
    expect(readiness.observationGate.ready).toBe(false);
  });

  it("real REJECTED with no real MATCH is not observation-ready", async () => {
    const { corpus } = await committedTiers();
    const cases = corpus.corpus.cases.filter(
      (kase) =>
        kase.record.owningLayer !== "SPEC_ASSASSINATION" ||
        kase.record.caseId === "spec-assassination.low-combo-point-envenom-is-rejected",
    );
    const readiness = evaluatePromotionReadiness(
      [{ ...corpus, corpus: { ...corpus.corpus, cases } as LoadedCorpus }],
      "rogue/assassination",
      "PUBLIC",
      (identity) => identity.className === "Rogue" && identity.specName === "Assassination",
    );
    expect(readiness.observationGate.realMatches).toBe(0);
    expect(readiness.observationGate.ready).toBe(false);
    expect(readiness.discriminationGate.ready).toBe(true);
    expect(readiness.evidenceReady).toBe(false);
  });
});

describe("GATE — the negative-control path fails closed", () => {
  it("a control expecting anything but REJECTED is disqualified", async () => {
    const { corpus, archive } = await committedTiers();
    const tier = withCase(corpus, CONTROL_CASE, (kase) =>
      withParams(kase, 0, (params) => ({
        ...params,
        expected: { ...(params["expected"] as object), outcome: "MATCH" },
      })),
    );
    const { readiness, controlDisqualified } = protection([tier, archive]);
    expect(controlDisqualified).toEqual([
      `a negative control counts for discrimination only, as REJECTED; this assertion expects MATCH over the substitution ${CONTROL}`,
    ]);
    expect(readiness.discriminationGate.controls).toEqual([]);
    expect(readiness.qualifyingAssertions.some((q) => q.caseId === CONTROL_CASE)).toBe(false);
  });

  it("a substituted action that is background (or unknown) for the build is not discrimination evidence", async () => {
    const { corpus, archive } = await committedTiers();
    for (const applicability of ["NOT_APPLICABLE", "UNKNOWN"]) {
      const tier = withCase(corpus, CONTROL_CASE, (kase) =>
        withParams(kase, 1, (params) => {
          const expected = params["expected"] as { observedToken: string; entries: object[] };
          return {
            ...params,
            expected: {
              ...expected,
              entries: expected.entries.map((entry) => ({ ...entry, applicability })),
            },
          };
        }),
      );
      const { readiness, controlDisqualified } = protection([tier, archive]);
      expect(controlDisqualified, applicability).toEqual([
        "the substituted action is not APPLICABLE at every entry under the proven build: a REJECTED that may rest on the action being background is not discrimination evidence",
      ]);
      expect(readiness.discriminationGate.ready).toBe(false);
    }
  });

  it("a control case that pins no applicability for the substituted cast is disqualified", async () => {
    const { corpus, archive } = await committedTiers();
    const tier = withCase(corpus, CONTROL_CASE, (kase) => ({
      ...kase,
      assertions: kase.assertions.filter(
        (assertion) => !assertion.kind.endsWith(".OBSERVED_TOKEN_APPLICABILITY"),
      ),
    }));
    const { controlDisqualified } = protection([tier, archive]);
    expect(controlDisqualified).toEqual([
      "the control case pins no SPEC_PROTECTION_PALADIN.OBSERVED_TOKEN_APPLICABILITY for the substituted cast",
    ]);
  });

  it("a control with no qualifying real MATCH at the same decision over the same bundle is disqualified", async () => {
    const { corpus, archive } = await committedTiers();
    const { readiness, controlDisqualified } = protection([
      withCase(corpus, PARENT_MATCH_CASE, () => null),
      archive,
    ]);
    expect(controlDisqualified).toEqual([
      `no qualifying real MATCH of ability 31935 at 2074381 over the same bundle with ${PARENT} in place of ${CONTROL}`,
    ]);
    expect(readiness.discriminationGate.ready).toBe(false);
  });

  it("a control over a different bundle than its real MATCH is disqualified", async () => {
    const { corpus, archive } = await committedTiers();
    // Both the decision and its applicability pin move to a bundle with a hole
    // the real MATCH does not declare: the applicability still pairs with the
    // decision, but no real MATCH is over that bundle.
    const hole = [{ fromReportTimeMs: 2100000, toReportTimeMs: 2100001 }];
    const tier = withCase(corpus, CONTROL_CASE, (kase) =>
      withParams(
        withParams(kase, 0, (params) => ({ ...params, declaredHoles: hole })),
        1,
        (params) => ({
          ...params,
          declaredHoles: hole,
        }),
      ),
    );
    const { controlDisqualified } = protection([tier, archive]);
    expect(controlDisqualified).toEqual([
      `no qualifying real MATCH of ability 31935 at 2074381 over the same bundle with ${PARENT} in place of ${CONTROL}`,
    ]);
  });

  it("a control assertion about any other cast than the substituted one is disqualified", async () => {
    const { corpus, archive } = await committedTiers();
    const tier = withCase(corpus, CONTROL_CASE, (kase) =>
      withParams(kase, 0, (params) => ({
        ...params,
        observedCast: { reportTimeMs: 2088835, abilityGameId: 375576 },
      })),
    );
    const { controlDisqualified } = protection([tier, archive]);
    expect(controlDisqualified).toEqual([
      "the control assertion is not about the substituted cast (actor 7 at 2074381, ability 375576)",
    ]);
  });

  it("a derivation without a declared substitution is disqualified exactly as before", async () => {
    const { corpus, archive } = await committedTiers();
    const artifacts = corpus.corpus.artifacts.map((entry) => {
      if (entry.record.artifactId !== CONTROL) return entry;
      const { substitution: _dropped, ...provenance } = entry.record.provenance;
      return { ...entry, record: { ...entry.record, provenance } };
    });
    const tier = { ...corpus, corpus: { ...corpus.corpus, artifacts } as LoadedCorpus };
    const { controlDisqualified } = protection([tier, archive]);
    expect(controlDisqualified).toEqual([
      `evidence set is not all SANITIZED_CAPTURE: ${CONTROL}=DERIVED_FROM_CAPTURE`,
    ]);
  });

  it("a control whose parent is not a committed SANITIZED_CAPTURE is disqualified", async () => {
    const { corpus, archive } = await committedTiers();
    const artifacts = corpus.corpus.artifacts.map((entry) =>
      entry.record.artifactId === PARENT
        ? {
            ...entry,
            record: {
              ...entry.record,
              provenance: { ...entry.record.provenance, kind: "SYNTHETIC" as const },
            },
          }
        : entry,
    );
    const tier = { ...corpus, corpus: { ...corpus.corpus, artifacts } as LoadedCorpus };
    const { controlDisqualified } = protection([tier, archive]);
    expect(controlDisqualified).toEqual([
      `the substitution ${CONTROL}'s parent is not exactly one committed SANITIZED_CAPTURE`,
    ]);
  });

  it("a control the committed report does not record as PASSED is disqualified", async () => {
    const { corpus, archive } = await committedTiers();
    const report = corpus.report;
    if (report === null) throw new Error("no report");
    const failed: CommittedReport = {
      ...report,
      cases: report.cases.map((entry) =>
        entry.caseId === CONTROL_CASE
          ? { ...entry, assertions: entry.assertions.map((a) => ({ ...a, status: "FAILED" })) }
          : entry,
      ),
    };
    const { controlDisqualified } = protection([{ ...corpus, report: failed }, archive]);
    expect(controlDisqualified).toEqual(["the committed report records FAILED"]);
  });

  it("two derived parts in one evidence set is not a control", async () => {
    const { corpus, archive } = await committedTiers();
    const artifacts = corpus.corpus.artifacts.map((entry) =>
      entry.record.artifactId === "wcl-protection-paladin-a7r6-rotational-165s.seg-90-120"
        ? {
            ...entry,
            record: {
              ...entry.record,
              provenance: { ...entry.record.provenance, kind: "DERIVED_FROM_CAPTURE" as const },
            },
          }
        : entry,
    );
    const tier = { ...corpus, corpus: { ...corpus.corpus, artifacts } as LoadedCorpus };
    const { controlDisqualified } = protection([tier, archive]);
    expect(controlDisqualified[0]).toMatch(/^evidence set is not all SANITIZED_CAPTURE: /);
    expect(controlDisqualified[0]).toContain(`${CONTROL}=DERIVED_FROM_CAPTURE`);
  });
});

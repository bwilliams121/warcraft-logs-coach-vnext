/**
 * M11-A2: the TEST-OWNED public-promotion evidence gate.
 *
 * THE RULE
 *
 *     A PUBLIC registration must be backed by at least one REAL-EVIDENCE
 *     resolved decision — a corpus DECISION_COVERAGE assertion expecting
 *     MATCH or REJECTED — whose whole evidence set is sanitized capture,
 *     whose actor is mechanically the registration's specialization, and
 *     which the committed corpus report records as PASSED.
 *
 * Production knows nothing of this. It reads the production catalog for one
 * side of the join and the corpus manifest, artifacts and committed report
 * for the other; the only bridge is the test-owned `SPEC_LAYER_OF`. Nothing
 * here executes an analysis: the evidence that a decision resolved is the
 * corpus's own execution, recorded in `report.json` by the gate that ran it.
 *
 * THE STRICT M11 PROVENANCE RULE
 *
 * Every artifact a qualifying case references — its own, every bundle part,
 * every context artifact — must be `SANITIZED_CAPTURE`. `SYNTHETIC` anywhere
 * disqualifies. `DERIVED_FROM_CAPTURE` anywhere disqualifies: the corpus can
 * prove a derivation's PARENT is real, but it cannot mechanically prove the
 * derivation manufactured no resolved state, and a gate must not lean on
 * what it cannot prove. Derived and synthetic cases remain what they are —
 * fail-closed and mechanics evidence — and count for nothing here.
 *
 * TWO MODES
 *
 *   PUBLIC         zero qualifying assertions is a CI failure. Identity is
 *                  proven THROUGH the identity table: the evidence actor's
 *                  Warcraft Logs class/spec must resolve to this specId.
 *   INTERNAL_ONLY  the same search, reported, never failed. The identity
 *                  table deliberately does not resolve an internal id, so
 *                  the actor's class/spec is compared to the module's own
 *                  canonical `wclClassName` / `wclSpecName`, and the table is
 *                  asserted to REFUSE it. `evidenceReady: true` authorizes
 *                  nothing by itself.
 *
 * No production INTERNAL_ONLY registration existed in M11-A2; Retribution
 * Paladin was one from M11-A4 until M11-A5 promoted it (this gate reported
 * its readiness in INTERNAL_ONLY mode from the same four assertions that now
 * qualify it in PUBLIC mode). The internal branch is exercised over a
 * synthetic, test-built module that never enters a validated catalog and is
 * never listed anywhere in production.
 */

import { describe, expect, it } from "vitest";

import { defineSpecModule, isSpecModule, type SpecModule } from "../../src/findings/spec-module.js";
import { INTERNAL_ONLY_SPEC_IDS, PUBLIC_SPEC_IDS, type SpecId } from "../../src/findings/spec-id.js";
import { PRODUCTION_CATALOG, type AnalyzerRegistration } from "../../src/services/analyzer-registry.js";
import { resolveSpecIdentity } from "../../src/services/spec-identity.js";
import {
  PROTECTION_AUTHORITY_BINDINGS,
  PROTECTION_CAPABILITIES,
} from "../../src/specs/paladin/protection/authority-bindings.js";
import { OWNING_LAYERS, SPEC_LAYER_OF, type OwningLayer } from "../support/corpus/contract.js";
import {
  committedCorpusFiles,
  loadCorpusOrThrow,
  type LoadedCase,
  type LoadedCorpus,
} from "../support/corpus/loader.js";

const REGISTRATION_MODULES: Record<string, Record<string, unknown>> = import.meta.glob(
  "../../src/specs/*/*/registration.ts",
  { eager: true },
);

const REPORT: Record<string, string> = import.meta.glob("../corpus/report.json", {
  eager: true,
  query: "?raw",
  import: "default",
});

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

interface CommittedReport {
  readonly runtime: string;
  readonly totals: { readonly failed: number; readonly notExecuted: number; readonly declared: number };
  readonly cases: readonly {
    readonly caseId: string;
    readonly assertions: readonly {
      readonly kind: string;
      readonly ordinal: number;
      readonly status: string;
    }[];
  }[];
}

function committedReport(): CommittedReport {
  const text = REPORT["../corpus/report.json"];
  if (text === undefined) throw new Error("tests/corpus/report.json not captured");
  return JSON.parse(text) as CommittedReport;
}

const MODULES: readonly SpecModule[] = Object.values(REGISTRATION_MODULES)
  .flatMap((exports) => Object.values(exports).filter(isSpecModule))
  .sort((a, b) => a.identity.specId.localeCompare(b.identity.specId));

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

type ProvenanceKind = "SANITIZED_CAPTURE" | "DERIVED_FROM_CAPTURE" | "SYNTHETIC" | "REAL_CAPTURE";

interface WclIdentity {
  readonly className: string;
  readonly specName: string;
}

interface QualifyingAssertion {
  readonly caseId: string;
  readonly ordinal: number;
  readonly kind: string;
  readonly expectedOutcome: "MATCH" | "REJECTED";
  readonly artifactId: string;
  readonly evidenceSet: readonly { readonly artifactId: string; readonly kind: ProvenanceKind }[];
  readonly evidenceActor: { readonly reportCode: string; readonly fightId: number; readonly actorId: number };
  readonly evidenceIdentity: WclIdentity;
  readonly reportStatus: string;
}

interface Disqualified {
  readonly caseId: string;
  readonly ordinal: number;
  readonly reason: string;
}

interface Readiness {
  readonly specId: string;
  readonly exposure: "PUBLIC" | "INTERNAL_ONLY";
  readonly layer: OwningLayer;
  readonly qualifyingAssertions: readonly QualifyingAssertion[];
  readonly disqualified: readonly Disqualified[];
  readonly evidenceReady: boolean;
}

/** The identity the committed fight-context artifact reports for an actor of a report/fight. */
function committedIdentity(
  corpus: LoadedCorpus,
  reportCode: string,
  fightId: number,
  actorId: number,
): WclIdentity | null {
  for (const artifact of corpus.artifacts) {
    const source = artifact.record.provenance.source as
      { readonly reportCode?: unknown; readonly query?: { readonly kind?: unknown } } | null | undefined;
    if (source?.reportCode !== reportCode || source.query?.kind !== "FIGHT_CONTEXT") continue;
    const json = artifact.json as {
      readonly reportData?: {
        readonly report?: {
          readonly masterData?: {
            readonly actors?: readonly { id: number; type: string; subType: string }[];
          };
          readonly fights?: readonly {
            id: number;
            friendlyPlayers: readonly number[];
            friendlySpecs: readonly string[];
          }[];
        };
      };
    };
    const report = json.reportData?.report;
    const actor = report?.masterData?.actors?.find((candidate) => candidate.id === actorId);
    const fight = report?.fights?.find((candidate) => candidate.id === fightId);
    if (actor === undefined || fight === undefined || actor.type !== "Player") return null;
    const index = fight.friendlyPlayers.indexOf(actorId);
    const specName = fight.friendlySpecs[index];
    if (index < 0 || specName === undefined) return null;
    return { className: actor.subType, specName };
  }
  return null;
}

function evaluate(
  corpus: LoadedCorpus,
  report: CommittedReport,
  specId: SpecId,
  exposure: "PUBLIC" | "INTERNAL_ONLY",
  pairing: (identity: WclIdentity) => boolean,
): Readiness {
  const layer = SPEC_LAYER_OF[specId];
  const decisionKind = `${layer}.DECISION_COVERAGE`;
  const artifactsById = new Map(
    corpus.artifacts.map((artifact) => [artifact.record.artifactId, artifact] as const),
  );
  const qualifying: QualifyingAssertion[] = [];
  const disqualified: Disqualified[] = [];

  const consider = (kase: LoadedCase): void => {
    if (kase.record.owningLayer !== layer) return;
    kase.assertions.forEach((assertion, ordinal) => {
      if (assertion.kind !== decisionKind) return;
      const params = assertion.params as {
        readonly actorId?: unknown;
        readonly expected?: { readonly outcome?: unknown };
      };
      const outcome = params.expected?.outcome;
      const reject = (reason: string): void => {
        disqualified.push({ caseId: kase.record.caseId, ordinal, reason });
      };
      if (outcome !== "MATCH" && outcome !== "REJECTED") return; // an UNKNOWN pin is not promotion evidence
      if (assertion.execution !== "EXECUTABLE") return reject("assertion kind is not EXECUTABLE");

      // Strict provenance over the FULL evidence set.
      const evidenceSet = kase.referencedArtifactIds.map((artifactId) => ({
        artifactId,
        kind: (artifactsById.get(artifactId)?.record.provenance.kind ?? "SYNTHETIC") as ProvenanceKind,
      }));
      const impure = evidenceSet.filter((entry) => entry.kind !== "SANITIZED_CAPTURE");
      if (impure.length > 0) {
        return reject(
          `evidence set is not all SANITIZED_CAPTURE: ${impure.map((e) => `${e.artifactId}=${e.kind}`).join(", ")}`,
        );
      }

      // Identity: the case artifact's source coordinates and the decision's actor.
      const source = kase.artifact.record.provenance.source as {
        readonly reportCode?: unknown;
        readonly fightId?: unknown;
        readonly sourceActorId?: unknown;
      } | null;
      const actorId = typeof params.actorId === "number" ? params.actorId : null;
      if (
        source === null ||
        typeof source.reportCode !== "string" ||
        typeof source.fightId !== "number" ||
        actorId === null
      ) {
        return reject("the case artifact has no capture coordinates or the assertion names no actor");
      }
      // The artifact's `sourceActorId` is the capture SUBJECT the slicer was
      // pointed at; the unfiltered `All` stream legitimately carries other
      // actors' events (the 14-event Envenom slice holds the OTHER
      // Assassination Rogue's rejected cast). Identity is therefore proven
      // per decision actor from the committed master data, never assumed
      // from the capture subject.
      const identity = committedIdentity(corpus, source.reportCode, source.fightId, actorId);
      if (identity === null) return reject("no committed fight-context artifact proves the actor's identity");
      if (!pairing(identity))
        return reject(
          `actor ${String(actorId)} is ${identity.className}/${identity.specName}, not this specialization`,
        );

      // The committed report must record the assertion as PASSED.
      const reported = report.cases
        .find((candidate) => candidate.caseId === kase.record.caseId)
        ?.assertions.find((candidate) => candidate.ordinal === ordinal && candidate.kind === assertion.kind);
      if (reported === undefined) return reject("the committed report has no record of this assertion");
      if (reported.status !== "PASSED") return reject(`the committed report records ${reported.status}`);

      qualifying.push({
        caseId: kase.record.caseId,
        ordinal,
        kind: assertion.kind,
        expectedOutcome: outcome,
        artifactId: kase.record.artifactId,
        evidenceSet,
        evidenceActor: { reportCode: source.reportCode, fightId: source.fightId, actorId },
        evidenceIdentity: identity,
        reportStatus: reported.status,
      });
    });
  };
  for (const kase of corpus.cases) consider(kase);

  return {
    specId,
    exposure,
    layer,
    qualifyingAssertions: qualifying,
    disqualified,
    evidenceReady: qualifying.length > 0,
  };
}

function publicPairing(specId: SpecId): (identity: WclIdentity) => boolean {
  return (identity) => {
    const resolved = resolveSpecIdentity(identity);
    return resolved.ok && resolved.specId === specId;
  };
}

function internalPairing(module: SpecModule): (identity: WclIdentity) => boolean {
  return (identity) =>
    identity.className === module.identity.wclClassName &&
    identity.specName === module.identity.wclSpecName &&
    !resolveSpecIdentity(identity).ok;
}

// ---------------------------------------------------------------------------
// Preconditions
// ---------------------------------------------------------------------------

const corpusPromise = loadCorpusOrThrow(committedCorpusFiles());

describe("the gate's inputs", () => {
  it("the committed report is a complete WORKERD execution", () => {
    const report = committedReport();
    expect(report.runtime).toBe("WORKERD");
    expect(report.totals.failed).toBe(0);
    expect(report.totals.notExecuted).toBe(0);
    expect(report.totals.declared).toBe(0);
  });

  it("SPEC_LAYER_OF is total over every registered specialization and every layer is a SPEC_ layer", () => {
    for (const registration of PRODUCTION_CATALOG.registrations) {
      const layer = SPEC_LAYER_OF[registration.specId];
      expect(layer, registration.specId).toBeDefined();
      expect(layer.startsWith("SPEC_")).toBe(true);
      expect(OWNING_LAYERS[layer]).toEqual([`src/specs/${registration.specId}/`]);
    }
  });

  it("every registered specialization has a module and vice versa", () => {
    expect(MODULES.map((module) => module.identity.specId)).toEqual(
      [...PRODUCTION_CATALOG.registrations].map((row) => row.specId).sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// PUBLIC mode
// ---------------------------------------------------------------------------

describe("PUBLIC mode — every public registration is backed by real, resolved, identity-paired evidence", () => {
  const publicRegistrations: readonly AnalyzerRegistration[] = PRODUCTION_CATALOG.registrations.filter(
    (row) => row.exposure === "PUBLIC",
  );

  it("evaluates exactly the PUBLIC partition", () => {
    expect(publicRegistrations.map((row) => row.specId).sort()).toEqual([...PUBLIC_SPEC_IDS].sort());
  });

  for (const registration of publicRegistrations) {
    it(`${registration.specId}: at least one qualifying MATCH or REJECTED`, async () => {
      const corpus = await corpusPromise;
      const readiness = evaluate(
        corpus,
        committedReport(),
        registration.specId,
        "PUBLIC",
        publicPairing(registration.specId),
      );
      const summary = readiness.qualifyingAssertions.map(
        (q) =>
          `${q.caseId}[${String(q.ordinal)}] ${q.expectedOutcome} over ${q.evidenceSet.length} sanitized artifact(s), actor ${String(q.evidenceActor.actorId)} = ${q.evidenceIdentity.className}/${q.evidenceIdentity.specName}`,
      );
      expect(
        readiness.evidenceReady,
        `${registration.specId} is PUBLIC with no qualifying real-evidence MATCH/REJECTED. Disqualified: ${JSON.stringify(readiness.disqualified, null, 1)}`,
      ).toBe(true);
      // Every qualifying assertion satisfies all six criteria by construction; restate the load-bearing ones.
      for (const q of readiness.qualifyingAssertions) {
        expect(q.kind).toBe(`${readiness.layer}.DECISION_COVERAGE`);
        expect(["MATCH", "REJECTED"]).toContain(q.expectedOutcome);
        expect(q.evidenceSet.every((entry) => entry.kind === "SANITIZED_CAPTURE")).toBe(true);
        expect(resolveSpecIdentity(q.evidenceIdentity)).toEqual({ ok: true, specId: registration.specId });
        expect(q.reportStatus).toBe("PASSED");
      }
      expect(summary.length).toBeGreaterThan(0);
    });
  }

  it("derived and synthetic cases contribute nothing, even when their expectation is a resolved outcome", async () => {
    const corpus = await corpusPromise;
    for (const registration of publicRegistrations) {
      const readiness = evaluate(
        corpus,
        committedReport(),
        registration.specId,
        "PUBLIC",
        publicPairing(registration.specId),
      );
      for (const q of readiness.qualifyingAssertions) {
        for (const entry of q.evidenceSet) {
          expect(entry.kind, `${q.caseId} references ${entry.artifactId}`).toBe("SANITIZED_CAPTURE");
        }
      }
      for (const d of readiness.disqualified) {
        // A disqualification must name its reason; none may be silent.
        expect(d.reason.length, d.caseId).toBeGreaterThan(0);
      }
    }
  });

  it("the reviewed snapshot: which real cases qualify each public specialization today", async () => {
    const corpus = await corpusPromise;
    const snapshot = Object.fromEntries(
      publicRegistrations.map((registration) => [
        registration.specId,
        evaluate(corpus, committedReport(), registration.specId, "PUBLIC", publicPairing(registration.specId))
          .qualifyingAssertions.map((q) => `${q.caseId}[${String(q.ordinal)}] -> ${q.expectedOutcome}`)
          .sort(),
      ]),
    );
    expect(snapshot).toEqual({
      "paladin/protection": [
        "spec-protection-paladin.hammer-of-wrath-is-unusable-only-from-an-observed-removal-of-its-readiness-aura[1] -> MATCH",
        "spec-protection-paladin.hammer-of-wrath-is-unusable-only-from-an-observed-removal-of-its-readiness-aura[6] -> MATCH",
        "spec-protection-paladin.the-avengers-shield-press-under-vanguard-is-a-real-exact-entry-match[0] -> MATCH",
        "spec-protection-paladin.the-divine-toll-press-is-a-real-exact-entry-match[0] -> MATCH",
      ],
      // M11-A5: the same four assertions that reported Retribution's
      // INTERNAL_ONLY readiness in M11-A4 now qualify it in PUBLIC mode,
      // paired THROUGH the identity table.
      "paladin/retribution": [
        "spec-retribution-paladin.divine-storm-under-the-arbiter-storm-buff-is-rejected-two-ways[0] -> REJECTED",
        "spec-retribution-paladin.divine-storm-under-the-arbiter-storm-buff-is-rejected-two-ways[3] -> REJECTED",
        "spec-retribution-paladin.rejected-by-unselectability-alone-before-any-cooldown-is-anchored[0] -> REJECTED",
        "spec-retribution-paladin.the-real-match-final-verdict-at-2108996[0] -> MATCH",
      ],
      "rogue/assassination": [
        "spec-assassination.low-combo-point-envenom-is-rejected[0] -> REJECTED",
        "spec-assassination.observed-garrote-at-q-is-authority-compatible[0] -> MATCH",
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// INTERNAL_ONLY mode
// ---------------------------------------------------------------------------

describe("PUBLIC mode — the M11-A5 promotion standard for Retribution Paladin: real MATCH AND real REJECTED", () => {
  it("Retribution Paladin is PUBLIC, paired THROUGH the identity table, with at least one real MATCH and one real REJECTED", async () => {
    // The generic gate requires one qualifying resolved assertion; M11-A5
    // kept the stronger M11-A4 standard — both outcomes must remain, from
    // genuine Retribution evidence, so a regression that collapsed the
    // analyzer to one-sided outcomes could not be promoted or stay promoted.
    const corpus = await corpusPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "paladin/retribution");
    expect(module).toBeDefined();
    if (module === undefined) return;
    expect(module.exposure).toBe("PUBLIC");
    expect(resolveSpecIdentity({ className: "Paladin", specName: "Retribution" })).toEqual({
      ok: true,
      specId: "paladin/retribution",
    });
    const readiness = evaluate(
      corpus,
      committedReport(),
      "paladin/retribution",
      "PUBLIC",
      publicPairing("paladin/retribution"),
    );
    expect(readiness.exposure).toBe("PUBLIC");
    expect(readiness.layer).toBe("SPEC_RETRIBUTION_PALADIN");
    expect(readiness.evidenceReady).toBe(true);
    const outcomes = readiness.qualifyingAssertions.map((q) => q.expectedOutcome);
    expect(outcomes.filter((outcome) => outcome === "MATCH").length).toBeGreaterThanOrEqual(1);
    expect(outcomes.filter((outcome) => outcome === "REJECTED").length).toBeGreaterThanOrEqual(1);
    for (const q of readiness.qualifyingAssertions) {
      expect(q.kind).toBe("SPEC_RETRIBUTION_PALADIN.DECISION_COVERAGE");
      expect(q.evidenceSet.every((entry) => entry.kind === "SANITIZED_CAPTURE")).toBe(true);
      expect(q.evidenceIdentity).toEqual({ className: "Paladin", specName: "Retribution" });
      expect(q.evidenceActor).toEqual({ reportCode: "A7R6kxPJ1hC8YQ4w", fightId: 7, actorId: 6 });
      expect(q.reportStatus).toBe("PASSED");
    }
    // The gtKb subject (actor 23, all UNKNOWN) contributes nothing, as it must.
    expect(readiness.qualifyingAssertions.some((q) => q.evidenceActor.actorId === 23)).toBe(false);
    expect(PUBLIC_SPEC_IDS as readonly string[]).toContain("paladin/retribution");
  });
});

describe("INTERNAL_ONLY mode — reported, never failed, paired against the module's own WCL identity", () => {
  it("no production INTERNAL_ONLY registration exists since M11-A5 (Retribution Paladin was one from M11-A4)", () => {
    expect([...INTERNAL_ONLY_SPEC_IDS]).toEqual([]);
    expect(
      PRODUCTION_CATALOG.registrations
        .filter((row) => row.exposure === "INTERNAL_ONLY")
        .map((row) => row.specId),
    ).toEqual([]);
  });

  it("the internal pairing finds nothing for a specialization the identity table resolves — Retribution Paladin since M11-A5", async () => {
    // The internal pairing REQUIRES the public table to refuse the identity.
    // Now that it resolves Paladin/Retribution, the internal-mode search over
    // the same evidence qualifies nothing and reports evidenceReady false;
    // that is informational, not a failure, and the PUBLIC mode above is
    // where the same assertions count.
    const corpus = await corpusPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "paladin/retribution");
    if (module === undefined) throw new Error("no Retribution module");
    const readiness = evaluate(
      corpus,
      committedReport(),
      "paladin/retribution",
      "INTERNAL_ONLY",
      internalPairing(module),
    );
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
    expect(readiness.disqualified.length).toBeGreaterThan(0);
    for (const d of readiness.disqualified) expect(d.reason).toContain("not this specialization");
  });

  it("a synthetic internal module's readiness is a report, and its identity is refused by the public table", async () => {
    // Built with the real factory so the identity rules hold, given the
    // Protection facade's capabilities and bindings so it is a coherent row,
    // and NEVER placed in a catalog: its spec id is the public one, so the
    // registry would refuse it as a duplicate — which is the point. It exists
    // only to drive the INTERNAL_ONLY branch of the gate.
    const synthetic = defineSpecModule({
      identity: {
        specId: "paladin/protection",
        analyzerId: "synthetic-internal-for-the-gate",
        displayName: "Protection Paladin",
        wclClassName: "Paladin",
        wclSpecName: "Protection",
      },
      exposure: "INTERNAL_ONLY",
      capabilities: PROTECTION_CAPABILITIES,
      authorityBindings: PROTECTION_AUTHORITY_BINDINGS,
      limitsProse: { analysis: "", raidNight: "" },
      analyze: () => {
        throw new Error("never run");
      },
      observedDecisionView: () => {
        throw new Error("never viewed");
      },
    });
    const corpus = await corpusPromise;

    // The public table resolves Paladin/Protection today, so the internal
    // pairing (which requires the table to REFUSE) finds nothing: readiness
    // is reported false, and that is informational, not a failure.
    const readiness = evaluate(
      corpus,
      committedReport(),
      synthetic.identity.specId,
      "INTERNAL_ONLY",
      internalPairing(synthetic),
    );
    expect(readiness.exposure).toBe("INTERNAL_ONLY");
    expect(readiness.evidenceReady).toBe(false);
    expect(readiness.disqualified.length).toBeGreaterThan(0);
    for (const d of readiness.disqualified) expect(d.reason).toContain("not this specialization");

    // With the table's refusal simulated (as it will be for a real internal
    // id), the same real Protection evidence pairs against the module's own
    // canonical strings and readiness reads true — still authorizing nothing.
    const pairingWithoutTable = (identity: WclIdentity): boolean =>
      identity.className === synthetic.identity.wclClassName &&
      identity.specName === synthetic.identity.wclSpecName;
    const simulated = evaluate(
      corpus,
      committedReport(),
      synthetic.identity.specId,
      "INTERNAL_ONLY",
      pairingWithoutTable,
    );
    expect(simulated.evidenceReady).toBe(true);
    expect(simulated.qualifyingAssertions.map((q) => q.expectedOutcome)).toContain("MATCH");
    expect(simulated.qualifyingAssertions.every((q) => q.evidenceIdentity.className === "Paladin")).toBe(
      true,
    );
  });

  it("an INTERNAL_ONLY readiness with zero qualifying assertions does not throw and does not fail", async () => {
    const corpus = await corpusPromise;
    const readiness = evaluate(
      corpus,
      committedReport(),
      "rogue/assassination",
      "INTERNAL_ONLY",
      () => false,
    );
    expect(readiness.evidenceReady).toBe(false);
    expect(readiness.qualifyingAssertions).toEqual([]);
  });
});

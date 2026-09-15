import { describe, expect, it } from "vitest";

import { CAPABILITY } from "../../src/contracts/analysis-contract.js";
import { PINNED_AUTHORITY_REVISIONS } from "../support/corpus/contract.js";
import { committedManifest } from "../support/corpus/artifacts.js";
import { M5D2_CORPUS, authorityOrThrow, runCase, type CorpusCase } from "../support/m5d2-corpus.js";
import { M5D2_ACTOR, M5D2_TARGET } from "../support/m5d2-fixture.js";

/**
 * Two definitions describe the same real decisions. This file makes sure they
 * cannot silently disagree, and says exactly what each one owns.
 *
 * WHO OWNS WHAT
 *
 *   `tests/support/m5d2-corpus.ts`   owns the AUTHORITY SELECTION at a query
 *                                    point: which entry the pinned APL selects,
 *                                    at what precision, and — when it cannot —
 *                                    which class of blocker stopped it. It is
 *                                    driven directly through the rotational
 *                                    engine (`runCase`), step by step, and is
 *                                    the seven-case census the M5-D2 closeout
 *                                    documented.
 *
 *   `tests/corpus/manifest.json`     owns the COMPARISON of an observed cast
 *                                    against that selection, through the M5
 *                                    facade: MATCH / REJECTED / UNKNOWN, its
 *                                    basis, and the meaning of MATCH.
 *
 * The comparison carries the selection inside it (`authorityCoverage`,
 * `decisiveBlocker`), so where both definitions name the same observed cast
 * the manifest's copy must equal the D2 corpus's — under the same pinned
 * authority revision. That is the drift this file catches. Neither definition
 * may claim the other's verdict: the D2 corpus says nothing about MATCH, and
 * the manifest says nothing about traversal steps.
 */

const D2_ARTIFACT = "wcl-assassination-d2-decision-corpus";
const DECISION_KIND = "SPEC_ASSASSINATION.DECISION_COVERAGE";

interface ManifestDecision {
  readonly caseId: string;
  readonly reportTimeMs: number;
  readonly abilityGameId: number;
  readonly authorityCoverage: string;
  readonly decisiveBlocker: string | null;
  readonly outcome: string;
  readonly authorityToken: string | null;
  readonly artifactRevision: string | null;
}

function manifestDecisionsOnD2(): readonly ManifestDecision[] {
  const decisions: ManifestDecision[] = [];
  for (const kase of committedManifest().cases) {
    if (kase.artifactId !== D2_ARTIFACT) continue;
    for (const assertion of kase.assertions) {
      if (assertion.kind !== DECISION_KIND) continue;
      const params = assertion.params as {
        actorId: number;
        targetActorId: number | null;
        observedCast: { reportTimeMs: number; abilityGameId: number };
        expected: {
          outcome: string;
          authorityCoverage: string;
          decisiveBlocker: string | null;
          authorityToken: string | null;
        };
      };
      expect(params.actorId).toBe(M5D2_ACTOR);
      expect(params.targetActorId).toBe(M5D2_TARGET);
      decisions.push({
        caseId: kase.caseId,
        reportTimeMs: params.observedCast.reportTimeMs,
        abilityGameId: params.observedCast.abilityGameId,
        authorityCoverage: params.expected.authorityCoverage,
        decisiveBlocker: params.expected.decisiveBlocker,
        outcome: params.expected.outcome,
        authorityToken: params.expected.authorityToken,
        artifactRevision: kase.authority?.artifactRevision ?? null,
      });
    }
  }
  return decisions;
}

function d2CaseAt(reportTimeMs: number, abilityGameId: number): CorpusCase | undefined {
  return M5D2_CORPUS.find(
    (kase) =>
      kase.queryPoint.kind === "OBSERVED_CAST" &&
      kase.queryPoint.reportTimeMs === reportTimeMs &&
      kase.queryPoint.abilityGameId === abilityGameId,
  );
}

describe("the shared coordinates", () => {
  const shared = manifestDecisionsOnD2();

  it("exist: the manifest pins comparisons for observed casts the D2 corpus also defines", () => {
    expect(shared.length).toBeGreaterThanOrEqual(3);
    for (const decision of shared) {
      expect(d2CaseAt(decision.reportTimeMs, decision.abilityGameId), decision.caseId).toBeDefined();
    }
  });

  it.each(shared.map((decision) => [decision.caseId, decision] as const))(
    "%s agrees with the D2 corpus on selection coverage and blocker class",
    (_caseId, decision) => {
      const d2 = d2CaseAt(decision.reportTimeMs, decision.abilityGameId);
      if (d2 === undefined) throw new Error("shared coordinate missing");
      expect(decision.authorityCoverage).toBe(d2.expectedCoverage);
      expect(decision.decisiveBlocker).toBe(d2.expectedBlockerClass);
    },
  );

  it.each(shared.map((decision) => [decision.caseId, decision] as const))(
    "%s is pinned to the same authority revision the D2 corpus runs under",
    (_caseId, decision) => {
      const authority = authorityOrThrow();
      expect(decision.artifactRevision).toBe(authority.artifact.artifactRevision);
      expect(decision.artifactRevision).toBe(PINNED_AUTHORITY_REVISIONS["SIMC_APL_ROGUE_ASSASSINATION"]);
    },
  );

  it("agrees with the D2 corpus's own run, not merely with its declared expectation", () => {
    // Both definitions could be wrong together. Executing the D2 case closes
    // that: the manifest's selection fields must equal what the engine produces.
    for (const decision of shared) {
      const d2 = d2CaseAt(decision.reportTimeMs, decision.abilityGameId);
      if (d2 === undefined) throw new Error("shared coordinate missing");
      const run = runCase(d2);
      expect(run.classified.coverage, decision.caseId).toBe(decision.authorityCoverage);
      expect(run.classified.blockerClass ?? null, decision.caseId).toBe(decision.decisiveBlocker);
    }
  });
});

describe("what each definition owns, and what it does not", () => {
  it("the D2 corpus makes no comparison claim: no case carries an outcome, basis or match meaning", () => {
    for (const kase of M5D2_CORPUS) {
      const text = JSON.stringify(kase);
      expect(text).not.toContain('"outcome"');
      expect(text).not.toContain('"basis"');
      expect(text).not.toContain("AUTHORITY_COMPATIBLE_ONLY");
      expect(kase.purpose === "AUTHORITY_VERIFICATION" || kase.purpose === "EPISTEMIC_BOUNDARY").toBe(true);
    }
  });

  it("a manifest MATCH is exactly an EXACT_ENTRY selection whose token is the observed one — and means AUTHORITY_COMPATIBLE_ONLY", () => {
    const matches = manifestDecisionsOnD2().filter((decision) => decision.outcome === "MATCH");
    expect(matches.length).toBeGreaterThan(0);
    for (const match of matches) {
      expect(match.authorityCoverage).toBe("EXACT_ENTRY");
      expect(match.authorityToken).not.toBeNull();
      expect(match.decisiveBlocker).toBeNull();
    }
    // The meaning of MATCH is the frozen public contract's, not the corpus's.
    expect(CAPABILITY.matchMeaning).toBe("AUTHORITY_COMPATIBLE_ONLY");
    expect(CAPABILITY.verifiesObservedDecisionsOnly).toBe(true);
    expect(CAPABILITY.predictsArbitraryNextAction).toBe(false);
  });

  it("every manifest UNKNOWN on the D2 artifact names a blocker the D2 corpus also names", () => {
    for (const decision of manifestDecisionsOnD2().filter((entry) => entry.outcome === "UNKNOWN")) {
      expect(decision.authorityCoverage).toBe("UNKNOWN");
      expect(decision.decisiveBlocker).not.toBeNull();
      expect(d2CaseAt(decision.reportTimeMs, decision.abilityGameId)?.expectedBlockerClass).toBe(
        decision.decisiveBlocker,
      );
    }
  });
});

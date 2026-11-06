/**
 * M6-B — what the composed path refuses, and what it refuses to spend.
 *
 * TWO KINDS OF ASSERTION LIVE HERE AND THEY ARE NOT THE SAME CLAIM.
 *
 *   1. The ANSWER is right — an unsupported spec reports that it is unsupported
 *      rather than being analyzed as a Rogue.
 *   2. The WORK is not done — nothing downstream of the refusal ran.
 *
 * The second matters on its own. Every stage past identity costs Warcraft Logs
 * API points from a finite shared quota, so "we returned the right answer" is
 * only half of correct if we paginated an entire combat log to reach it. Each
 * stage is therefore a spy, and the tests assert call counts of zero.
 *
 * NONE OF THIS EVALUATES GAMEPLAY. A refusal is a statement about this build's
 * coverage, never about how anyone played.
 */

import { describe, expect, it, vi } from "vitest";
import { analyzedAssassinationOf } from "../support/assassination-analysis.js";

import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import { analyzerForSpec } from "../../src/services/analyzer-registry.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import { productionCatalogWith } from "../support/catalog.js";
import type { Env } from "../../src/config/env.js";
import { wclFailure, type FightIdentity, type PreflightPort } from "../../src/wcl/types.js";
import { M5D2_ACTOR, m5d2Fight } from "../support/m5d2-fixture.js";
import { UNSUPPORTED_WCL_IDENTITY } from "../support/unsupported-subject.js";

const ENV: Env = {
  ENVIRONMENT: "test",
  WCL_CLIENT_ID: "fake-client-id-not-real",
  WCL_CLIENT_SECRET: "fake-client-secret-not-real",
};

const FIXTURE_FIGHT = m5d2Fight();

const REQUEST = {
  reportCode: FIXTURE_FIGHT.report.code,
  fightId: FIXTURE_FIGHT.fight.id,
  sourceId: M5D2_ACTOR,
};

function identityFor(className: string, specName: string): FightIdentity {
  return {
    report: {
      code: FIXTURE_FIGHT.report.code,
      revision: FIXTURE_FIGHT.report.revision,
      startTime: FIXTURE_FIGHT.report.startTimeUnixMs,
      endTime: FIXTURE_FIGHT.report.endTimeUnixMs,
    },
    data: FIXTURE_FIGHT.data,
    fight: {
      id: FIXTURE_FIGHT.fight.id,
      name: FIXTURE_FIGHT.fight.name,
      encounterId: FIXTURE_FIGHT.fight.encounterId,
      difficulty: FIXTURE_FIGHT.fight.difficulty,
      startTime: FIXTURE_FIGHT.fight.startTimeMs,
      endTime: FIXTURE_FIGHT.fight.endTimeMs,
    },
    player: { sourceId: M5D2_ACTOR, name: "Fixtureplayer", className, specName },
  };
}

const FIXTURE_INGEST: CombatIngestionPort = async () => ({
  ok: true,
  fight: m5d2Fight(),
  rateLimit: undefined,
});

/**
 * A preflight, an ingestor and the Assassination analyzer, each individually
 * observable. The injected catalog is the COMPLETE production catalog with
 * the Assassination row wrapped (`productionCatalogWith`): since M10-D a
 * catalog carrying only Assassination is an incomplete dispatch table the
 * service refuses, not a way to observe one analyzer.
 */
function spies(className = "Rogue", specName = "Assassination") {
  const real = analyzerForSpec("rogue/assassination");
  if (real === null) throw new Error("the Assassination analyzer is not registered");

  const preflight = vi.fn<PreflightPort>(async () => ({
    ok: true,
    identity: identityFor(className, specName),
    rateLimit: undefined,
  }));
  const ingest = vi.fn(FIXTURE_INGEST);
  const analyze = vi.fn(real.analyze);

  const deps: AnalysisServiceDeps = {
    env: ENV,
    preflight,
    ingest,
    registry: productionCatalogWith({ ...real, analyze }),
  };
  return { preflight, ingest, analyze, deps };
}

describe("an unsupported specialization", () => {
  it("reports SPEC_NOT_SUPPORTED as a successful result", async () => {
    // Success, not an error. The service did its job and answered truthfully.
    // Returning a failure would push callers toward retrying a correct answer.
    const { deps } = spies(UNSUPPORTED_WCL_IDENTITY.className, UNSUPPORTED_WCL_IDENTITY.specName);
    const result = await analyzeFight(REQUEST, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toBe("SPEC_NOT_SUPPORTED");
    expect(result.analysis.analysis.status).toBe("SPEC_NOT_SUPPORTED");
  });

  it("never runs the Assassination analyzer", async () => {
    // THE failure this guards: Rogue rules applied to someone else's fight,
    // producing a confident, well-formed report about the wrong game.
    const { analyze, deps } = spies(UNSUPPORTED_WCL_IDENTITY.className, UNSUPPORTED_WCL_IDENTITY.specName);
    await analyzeFight(REQUEST, deps);

    expect(analyze).not.toHaveBeenCalled();
  });

  it("retrieves the fight once, for the shared preparation producer alone (PREP-2)", async () => {
    // Owner decision PREP-2: every report carries consumable status, so an
    // unsupported specialization's fight is retrieved for preparation alone,
    // with the producer's own requirement (PLAYER_CONTEXT, no resources). It
    // used to retrieve nothing; the analyzer still never runs.
    const { ingest, analyze, deps } = spies(
      UNSUPPORTED_WCL_IDENTITY.className,
      UNSUPPORTED_WCL_IDENTITY.specName,
    );
    const result = await analyzeFight(REQUEST, deps);

    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest.mock.calls[0]?.[0]).toMatchObject({ scope: "PLAYER_CONTEXT", includeResources: false });
    expect(analyze).not.toHaveBeenCalled();
    expect(result.ok && result.analysis.preparation.state).toBe("ASSESSED");
  });

  it("names no supported spec and claims no analyzer", async () => {
    const { deps } = spies(UNSUPPORTED_WCL_IDENTITY.className, UNSUPPORTED_WCL_IDENTITY.specName);
    const result = await analyzeFight(REQUEST, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.specId).toBeNull();
    expect(result.analysis.analyzerId).toBeNull();
    // What was retrieved, for preparation alone (PREP-2); no analyzer claimed it.
    expect(result.analysis.scope).toBe("PLAYER_CONTEXT");
  });

  it("says out loud that no analysis was attempted", async () => {
    // An empty result that reads as clean play is the disclosure failure this
    // detail exists to prevent.
    const { deps } = spies(UNSUPPORTED_WCL_IDENTITY.className, UNSUPPORTED_WCL_IDENTITY.specName);
    const result = await analyzeFight(REQUEST, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const analysis = result.analysis.analysis;
    if (analysis.status === "ANALYZED") throw new Error("an unsupported spec was analyzed");
    expect(analysis.detail).toContain("no gameplay analysis was attempted");
    expect(analysis.detail).toContain("not a");
  });

  it("carries no comparisons or coverage a reader could mistake for findings", async () => {
    const { deps } = spies(UNSUPPORTED_WCL_IDENTITY.className, UNSUPPORTED_WCL_IDENTITY.specName);
    const result = await analyzeFight(REQUEST, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("comparisons" in result.analysis.analysis).toBe(false);
    expect("coverage" in result.analysis.analysis).toBe(false);
  });

  it("refuses every unsupported specialization the same way", async () => {
    // Hunter/BeastMastery is the canonical captured unsupported identity (A7R6 fight 7,
    // actor 20); the others are stated names. Paladin/Protection is NOT in this
    // list: it has been supported since M10-D. Paladin/Retribution is NOT in
    // it either, since M11-A5, and Paladin/Holy is not since HEAL-B1P: every Paladin
    // specialization is supported. Druid/Restoration, registered INTERNAL_ONLY,
    // stands in as the internal-only miss.
    for (const [className, specName] of [
      // Registered INTERNAL_ONLY in ONB-C2, not promoted by ONB-C2P.
      ["Rogue", "Outlaw"],
      ["Rogue", "Subtlety"],
      ["Hunter", "BeastMastery"],
      // Evoker/Augmentation is NOT in this list since M13-F. Devastation is the Evoker miss, registered INTERNAL_ONLY in
      // ONB-X2, not promoted by ONB-X2P.
      ["Evoker", "Devastation"],
      // Registered INTERNAL_ONLY in ONB-A2, not promoted by ONB-A2P, like Rogue/Subtlety above.
      ["Warrior", "Fury"],
      ["Warrior", "Protection"],
      // Registered INTERNAL_ONLY in ONB-B1, not promoted by ONB-B1P.
      ["Warrior", "Arms"],
      // Registered INTERNAL_ONLY in ONB-B2, not promoted by ONB-B2P. "DeathKnight" is the wire's class token,
      // the one that resolves Death Knight/Blood; another spelling would pass here for the wrong reason.
      ["DeathKnight", "Frost"],
      ["Shaman", "Enhancement"],
      // Registered INTERNAL_ONLY in ONB-B3, not promoted by ONB-B3P. "DemonHunter" is the wire's class token,
      // the one that resolves Demon Hunter/Havoc; another spelling would pass here for the wrong reason.
      ["DemonHunter", "Devourer"],
      // Registered INTERNAL_ONLY in ONB-X3, not promoted by ONB-X3P. The same class token as Devourer above.
      ["DemonHunter", "Vengeance"],
      // Registered INTERNAL_ONLY in ONB-C1, not promoted by ONB-C1P. Druid/Restoration below is the same class token.
      ["Druid", "Feral"],
      ["Druid", "Restoration"],
      ["Priest", "Discipline"],
      // Registered INTERNAL_ONLY in ONB-D1, not promoted by ONB-D1P. "Warlock" is the wire's class token, the one its
      // registration names; another spelling would pass here for the wrong reason.
      ["Warlock", "Destruction"],
      // Registered INTERNAL_ONLY in ONB-D2, not promoted by ONB-D2P. Each class token is the one its registration names;
      // another spelling would pass here for the wrong reason.
      ["Shaman", "Elemental"],
      ["Druid", "Balance"],
      ["Priest", "Shadow"],
      // Registered INTERNAL_ONLY in ONB-D3, not promoted by ONB-D3P. "Mage" is the token both registrations name;
      // another spelling would pass here for the wrong reason. Frost is also a Death Knight's row, above.
      ["Mage", "Arcane"],
      ["Mage", "Frost"],
      // Registered INTERNAL_ONLY in ONB-D4, not promoted by ONB-D4P. Each class token is the one its registration names;
      // another spelling would pass here for the wrong reason.
      ["Warlock", "Affliction"],
      ["Hunter", "Marksmanship"],
      // Registered INTERNAL_ONLY in ONB-X1, not promoted by ONB-X1P. "Mage" is the token its registration names; another
      // spelling would pass here for the wrong reason.
      ["Mage", "Fire"],
      // Registered INTERNAL_ONLY in ONB-X4, not promoted by ONB-X4P. The same class token as Warlock/Destruction above.
      ["Warlock", "Demonology"],
      // Registered INTERNAL_ONLY in ONB-X5, not promoted by ONB-X5P. The same class token as DeathKnight/Frost above.
      ["DeathKnight", "Unholy"],
      // Registered INTERNAL_ONLY in ONB-T1, not promoted by ONB-T1P. "Monk" is the token its registration names; another
      // spelling would pass here for the wrong reason. Brewmaster and Mistweaver are public, Windwalker is not.
      ["Monk", "Windwalker"],
      // Registered INTERNAL_ONLY in ONB-T2, not promoted by ONB-T2P. Hunter/BeastMastery, above, is the third of that
      // tranche. "Druid" and "Hunter" are the tokens their registrations name; another spelling would pass for the wrong reason.
      ["Druid", "Guardian"],
      ["Hunter", "Survival"],
    ]) {
      const { analyze, ingest, deps } = spies(className, specName);
      const result = await analyzeFight(REQUEST, deps);

      expect(`${className}/${specName}=${result.ok ? result.state : "FAILED"}`).toBe(
        `${className}/${specName}=SPEC_NOT_SUPPORTED`,
      );
      expect(analyze, `${className}/${specName} reached the Rogue analyzer`).not.toHaveBeenCalled();
      // One retrieval, for preparation alone (PREP-2), never for an analyzer.
      expect(ingest, `${className}/${specName} retrievals`).toHaveBeenCalledTimes(1);
    }
  });

  it("does not treat another Rogue specialization as Assassination", async () => {
    // Sharing a class is the nearest miss, and the one a fuzzy mapper would get
    // wrong. Outlaw is not Assassination.
    const { analyze, deps } = spies("Rogue", "Outlaw");
    const result = await analyzeFight(REQUEST, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toBe("SPEC_NOT_SUPPORTED");
    expect(analyze).not.toHaveBeenCalled();
  });
});

describe("an unusable identity", () => {
  it("fails closed rather than defaulting to a specialization", async () => {
    // Preflight will not resolve an identity without a usable class and spec, so
    // arriving here means the identity cannot be trusted — and an untrustworthy
    // identity must never pick an analyzer.
    const { analyze, ingest, deps } = spies("", "");
    const result = await analyzeFight(REQUEST, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("IDENTITY_UNRESOLVED");
    expect(analyze).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
  });

  it("distinguishes an unusable identity from an unsupported specialization", async () => {
    // Different conditions with different remedies: one is a data problem, the
    // other is a coverage limit. Collapsing them would hide a broken upstream
    // behind a routine "we don't support that spec".
    const blank = await analyzeFight(REQUEST, spies("   ", "Assassination").deps);
    const unsupported = await analyzeFight(
      REQUEST,
      spies(UNSUPPORTED_WCL_IDENTITY.className, UNSUPPORTED_WCL_IDENTITY.specName).deps,
    );

    expect(blank.ok).toBe(false);
    expect(unsupported.ok).toBe(true);
  });
});

describe("failures stop the pipeline where they occur", () => {
  it("an invalid request reaches neither preflight nor ingestion", async () => {
    const { preflight, ingest, deps } = spies();
    const result = await analyzeFight({ reportCode: "too-short" }, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_REQUEST");
    expect(preflight).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
  });

  it("a missing configuration reaches neither preflight nor ingestion", async () => {
    const { preflight, ingest, deps } = spies();
    const result = await analyzeFight(REQUEST, { ...deps, env: { ENVIRONMENT: "test" } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFIGURATION_ERROR");
    expect(preflight).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
  });

  it("a preflight failure never reaches ingestion", async () => {
    const { ingest, analyze, deps } = spies();
    const result = await analyzeFight(REQUEST, {
      ...deps,
      preflight: async () => ({ ok: false, failure: wclFailure("REPORT_NOT_ACCESSIBLE", "DECODE") }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("REPORT_NOT_ACCESSIBLE");
    expect(ingest).not.toHaveBeenCalled();
    expect(analyze).not.toHaveBeenCalled();
  });

  it("an ingestion failure never reaches the analyzer", async () => {
    const { analyze, deps } = spies();
    const result = await analyzeFight(REQUEST, {
      ...deps,
      ingest: async () => ({ ok: false, failure: { reason: "UPSTREAM_RATE_LIMITED" } }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UPSTREAM_RATE_LIMITED");
    expect(analyze).not.toHaveBeenCalled();
  });

  it("maps every ingestion failure to its own service code", async () => {
    // Deliberately NOT flattened into one upstream error. The distinctions M3
    // draws are the ones a reader can act on.
    const expected: Record<string, string> = {
      REPORT_NOT_ACCESSIBLE: "REPORT_NOT_ACCESSIBLE",
      REPORT_ARCHIVED_INACCESSIBLE: "REPORT_ARCHIVED_INACCESSIBLE",
      REPORT_REVISION_CHANGED: "REPORT_REVISION_CHANGED",
      FIGHT_NOT_FOUND: "FIGHT_NOT_FOUND",
      FIGHT_RANGE_INVALID: "UPSTREAM_DATA_INVALID",
      EVENT_RETRIEVAL_ABSENT: "UPSTREAM_DATA_INVALID",
      UPSTREAM_DATA_INVALID: "UPSTREAM_DATA_INVALID",
      UPSTREAM_AUTH_FAILED: "UPSTREAM_AUTH_FAILED",
      UPSTREAM_RATE_LIMITED: "UPSTREAM_RATE_LIMITED",
      UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE",
    };

    for (const [reason, code] of Object.entries(expected)) {
      const { deps } = spies();
      const result = await analyzeFight(REQUEST, {
        ...deps,
        ingest: async () => ({
          ok: false,
          failure: { reason: reason as "UPSTREAM_UNAVAILABLE" },
        }),
      });

      expect(`${reason}=${result.ok ? "OK" : result.error.code}`).toBe(`${reason}=${code}`);
    }
  });

  it("never describes a failed retrieval as an inactive player", async () => {
    // A retrieval that returned nothing is not a fight in which nothing
    // happened, and the message must not let those be confused.
    const { deps } = spies();
    const result = await analyzeFight(REQUEST, {
      ...deps,
      ingest: async () => ({ ok: false, failure: { reason: "EVENT_RETRIEVAL_ABSENT" } }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("retrieval failure");
    expect(result.error.message).not.toContain("idle");
  });

  it("interpolates nothing upstream into a failure message", async () => {
    const { deps } = spies();
    const result = await analyzeFight(REQUEST, {
      ...deps,
      ingest: async () => ({ ok: false, failure: { reason: "UPSTREAM_AUTH_FAILED" } }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    for (const secret of ["fake-client-id-not-real", "fake-client-secret-not-real"]) {
      expect(result.error.message).not.toContain(secret);
    }
  });
});

describe("identity must still describe the fight that was retrieved", () => {
  it("refuses a fight whose report revision changed after preflight", async () => {
    // Preflight and ingestion are two round trips, and a report can be
    // re-uploaded between them. Analyzing the new revision against the old
    // identity would be analyzing one fight while believing it was another.
    const { analyze, deps } = spies();
    const changed = m5d2Fight();
    const result = await analyzeFight(REQUEST, {
      ...deps,
      ingest: async () => ({
        ok: true,
        fight: { ...changed, report: { ...changed.report, revision: changed.report.revision + 1 } },
        rateLimit: undefined,
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("REPORT_REVISION_CHANGED");
    expect(analyze).not.toHaveBeenCalled();
  });

  it("accepts a fight whose revision still matches", async () => {
    const { analyze, deps } = spies();
    const result = await analyzeFight(REQUEST, deps);

    expect(result.ok).toBe(true);
    expect(analyze).toHaveBeenCalledTimes(1);
  });
});

describe("ingestion is a required dependency", () => {
  it("cannot be omitted, so the old not-implemented status is unreachable", () => {
    // M6-B/M6-D made `ingest` optional only so REST could hold its 501. M6-E
    // binds the real ingestor and makes the dependency required, which turns
    // "somebody forgot to wire retrieval" from a runtime status into a compile
    // error. Asserted structurally, because a type-level guarantee has no
    // runtime behaviour to observe.
    const { deps } = spies();
    const withoutIngest: Record<string, unknown> = { ...deps };
    delete withoutIngest["ingest"];

    // @ts-expect-error `ingest` is required: omitting it must not type-check.
    void (withoutIngest as AnalysisServiceDeps satisfies AnalysisServiceDeps);
    expect("ingest" in deps).toBe(true);
  });

  it("changes nothing about gameplay semantics", async () => {
    // The port governs whether retrieval is POSSIBLE, never what an analysis
    // means. Supplying it does not alter a single coverage number.
    const { deps } = spies();
    const withPort = await analyzeFight(REQUEST, deps);

    expect(withPort.ok).toBe(true);
    if (!withPort.ok) return;
    const analysis = analyzedAssassinationOf(withPort.analysis);
    expect(analysis.coverage.eligibleDecisions).toBe(11);
    expect(analysis.coverage.match).toBe(1);
  });
});

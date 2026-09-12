import { describe, expect, it } from "vitest";

import { anySource, fromSource } from "../../src/engine/auras/aura-state.js";
import { sourceRef, targetRef } from "../../src/engine/normalization/normalized-events.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import { afterEvent } from "../../src/engine/state/temporal.js";
import { auraEvent, damageEvent, syntheticFight } from "../support/synthetic-fight.js";

/**
 * Failure this protects against:
 *
 * Two rogues both keep Garrote on the boss. Those are two independent auras in
 * the game, and the log records both — the source is an observed M3 fact on
 * every transition.
 *
 * An implementation that indexes auras by target and ability alone, and then
 * treats source as a filter over the shared history, has thrown that fact away.
 * It then has to treat the OTHER rogue's transitions as contamination, and the
 * question a spec evaluator actually asks —
 *
 *     "was MY Garrote up on this target?"
 *
 * becomes UNKNOWN whenever a teammate happened to refresh theirs. That is a
 * fail-closed answer, so it never produces a wrong finding, but it silently
 * destroys coverage on exactly the decisions the analyzer exists to evaluate:
 * in any real raid another player is almost always touching the same debuff.
 *
 * The fix is structural rather than a smarter filter. `aura-observations.ts`
 * segments the history by source DURING the index scan, so a source-specific
 * query reads one track that no other source ever wrote to. There is nothing
 * left to contaminate.
 *
 * The second failure, which is the mirror of the first:
 *
 * That independence applies to KNOWN sources. A transition whose source
 * Warcraft Logs did not supply is not another independent source — it is
 * AMBIGUITY, and it might belong to the queried source. Treating it as someone
 * else's business would let
 *
 *     10.0  Rogue A applies Garrote
 *     12.0  Garrote REMOVED, source unknown
 *     15.0  query fromSource(Rogue A)
 *
 * report a confident ACTIVE built on the identity evidence we are missing. So
 * the anchor comes from the track alone, while the CONTINUITY claim also has to
 * clear every ambiguously-owned transition in its interval.
 */

const ROGUE_A = 5;
const ROGUE_B = 11;
const BOSS = 160;
const GARROTE = 703;

const ON_BOSS = targetRef(BOSS, null);
const BY_A = sourceRef(ROGUE_A, null);
const BY_B = sourceRef(ROGUE_B, null);

function garrote(
  ordinal: number,
  reportTimeMs: number,
  sourceActorId: number,
  operation: "APPLIED" | "REFRESHED" | "REMOVED",
) {
  return auraEvent({
    ordinal,
    reportTimeMs,
    operation,
    auraClass: "DEBUFF",
    sourceActorId,
    targetActorId: BOSS,
    abilityGameId: GARROTE,
  });
}

/** A matching transition on the same aura whose source Warcraft Logs did not supply. */
function unownedGarrote(
  ordinal: number,
  reportTimeMs: number,
  operation: "APPLIED" | "REFRESHED" | "REMOVED",
) {
  return auraEvent({
    ordinal,
    reportTimeMs,
    operation,
    auraClass: "DEBUFF",
    sourceActorId: null,
    sourceAbsence: "NO_ACTOR_SENTINEL",
    targetActorId: BOSS,
    abilityGameId: GARROTE,
  });
}

function ask(sourceActorId: number, at: number) {
  return {
    target: ON_BOSS,
    abilityGameId: GARROTE,
    auraClass: "DEBUFF" as const,
    source: fromSource(sourceRef(sourceActorId, null)),
    at: afterEvent(at),
  };
}

function askAnySource(at: number) {
  return {
    target: ON_BOSS,
    abilityGameId: GARROTE,
    auraClass: "DEBUFF" as const,
    source: anySource(),
    at: afterEvent(at),
  };
}

describe("one rogue's Garrote is not evidence about the other's", () => {
  /**
   * A applies at 1200 and never touches it again. B then applies, refreshes and
   * removes their own. Every B transition sits inside A's continuity interval,
   * which is precisely the interval a filter-based implementation would have
   * declared contaminated.
   */
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["AURAS"],
      events: [
        garrote(0, 1200, ROGUE_A, "APPLIED"),
        garrote(1, 1400, ROGUE_B, "APPLIED"),
        garrote(2, 1800, ROGUE_B, "REFRESHED"),
        garrote(3, 2200, ROGUE_B, "REMOVED"),
        damageEvent({ ordinal: 4, reportTimeMs: 2600, sourceActorId: ROGUE_A, targetActorId: BOSS }),
      ],
    }),
  );

  it("keeps A's Garrote ACTIVE through B's application", () => {
    const result = state.auras.presenceAt(ask(ROGUE_A, 1));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.presence).toBe("ACTIVE");
    expect(result.value.anchor.source?.actorId).toBe(ROGUE_A);
  });

  it("keeps A's Garrote ACTIVE through B's refresh", () => {
    const result = state.auras.presenceAt(ask(ROGUE_A, 2));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.presence).toBe("ACTIVE");
  });

  it("keeps A's Garrote ACTIVE through B's REMOVAL", () => {
    const result = state.auras.presenceAt(ask(ROGUE_A, 3));

    // The decisive case. B dropping their own Garrote says nothing about A's,
    // and must neither end it nor make it unknowable.
    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.presence).toBe("ACTIVE");
    expect(result.value.anchor.position).toBe(0);
    expect(result.value.anchor.source?.actorId).toBe(ROGUE_A);
  });

  it("keeps A's Garrote ACTIVE after every one of B's transitions", () => {
    const result = state.auras.presenceAt(ask(ROGUE_A, 4));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.presence).toBe("ACTIVE");
    expect(result.value.anchor.position).toBe(0);
  });

  it("reports B's own Garrote as INACTIVE after B removed it", () => {
    const result = state.auras.presenceAt(ask(ROGUE_B, 4));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    // Both answers are exact AND they disagree, at the same instant, about the
    // same ability on the same target. That is only expressible because the two
    // histories are separate.
    expect(result.value.presence).toBe("INACTIVE");
    expect(result.value.anchor.source?.actorId).toBe(ROGUE_B);
  });

  it("never returns UNKNOWN for either source at any position", () => {
    const positions = [0, 1, 2, 3, 4];
    const answers = positions.flatMap((at) => [
      state.auras.presenceAt(ask(ROGUE_A, at)),
      state.auras.presenceAt(ask(ROGUE_B, at)),
    ]);

    // A had no transition before position 0 for B, so B's earliest queries are
    // legitimately unanchored. Everything from B's application onward resolves.
    const resolvable = answers.filter((_, index) => index !== 1);
    for (const answer of resolvable) {
      expect(answer.certainty).toBe("EXACT");
    }
  });

  it("gives each rogue a track no other source ever wrote to", () => {
    const group = state.auras.groupFor({
      target: ON_BOSS,
      abilityGameId: GARROTE,
      auraClass: "DEBUFF",
      source: anySource(),
    });

    expect(group?.tracksBySource.get(`${ROGUE_A}#-`)?.positions).toEqual([0]);
    expect(group?.tracksBySource.get(`${ROGUE_B}#-`)?.positions).toEqual([1, 2, 3]);
    // Source independence is established by the scan, not reconstructed by a
    // filter — so there is no shared list a later query could mis-partition.
    expect(group?.tracks).toHaveLength(2);
    expect(group?.allPositions).toEqual([0, 1, 2, 3]);
  });

  it("uses a different track key per source", () => {
    const group = state.auras.groupFor({
      target: ON_BOSS,
      abilityGameId: GARROTE,
      auraClass: "DEBUFF",
      source: anySource(),
    });
    const keys = group?.tracks.map((track) => track.key) ?? [];

    expect(new Set(keys).size).toBe(keys.length);
    // Every track key still contains the group key, so the target and ability
    // cannot drift apart from the source.
    for (const key of keys) {
      expect(key.startsWith(group?.key ?? "")).toBe(true);
    }
  });
});

describe("the reverse case is equally independent", () => {
  /** B removes first, then A applies. A's application must not be shadowed. */
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["AURAS"],
      events: [
        garrote(0, 1200, ROGUE_B, "APPLIED"),
        garrote(1, 1400, ROGUE_B, "REMOVED"),
        garrote(2, 1600, ROGUE_A, "APPLIED"),
        damageEvent({ ordinal: 3, reportTimeMs: 2000, sourceActorId: ROGUE_A, targetActorId: BOSS }),
      ],
    }),
  );

  it("does not let B's removal suppress A's later application", () => {
    const a = state.auras.presenceAt(ask(ROGUE_A, 3));
    const b = state.auras.presenceAt(ask(ROGUE_B, 3));

    if (a.certainty !== "EXACT" || b.certainty !== "EXACT") return;
    expect(a.value.presence).toBe("ACTIVE");
    expect(b.value.presence).toBe("INACTIVE");
  });

  it("proves the union ACTIVE from A's track", () => {
    const result = state.auras.presenceAt({
      target: ON_BOSS,
      abilityGameId: GARROTE,
      auraClass: "DEBUFF",
      source: anySource(),
      at: afterEvent(3),
    });

    if (result.certainty !== "EXACT") return;
    // One source having it up settles the union in the provable direction.
    expect(result.value.presence).toBe("ACTIVE");
    expect(result.value.anchor.source?.actorId).toBe(ROGUE_A);
  });
});

describe("an unowned transition might be the queried source's", () => {
  /**
   * The distinction this whole block exists for. Same target, same ability, same
   * aura class — the only difference between these two fights is whether
   * Warcraft Logs supplied a source for the middle transition.
   */
  const byKnownOther = createCombatState(
    syntheticFight({
      observedCategories: ["AURAS"],
      events: [
        garrote(0, 1200, ROGUE_A, "APPLIED"),
        garrote(1, 1400, ROGUE_B, "REMOVED"),
        damageEvent({ ordinal: 2, reportTimeMs: 1800, sourceActorId: ROGUE_A, targetActorId: BOSS }),
      ],
    }),
  );

  const byUnknown = createCombatState(
    syntheticFight({
      observedCategories: ["AURAS"],
      events: [
        garrote(0, 1200, ROGUE_A, "APPLIED"),
        unownedGarrote(1, 1400, "REMOVED"),
        damageEvent({ ordinal: 2, reportTimeMs: 1800, sourceActorId: ROGUE_A, targetActorId: BOSS }),
      ],
    }),
  );

  it("keeps A ACTIVE through a KNOWN other source's removal", () => {
    const result = byKnownOther.auras.presenceAt(ask(ROGUE_A, 2));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    // B's removal is a fact about B's Garrote. Independent.
    expect(result.value.presence).toBe("ACTIVE");
  });

  it("refuses to keep A ACTIVE through an UNOWNED removal", () => {
    const result = byUnknown.auras.presenceAt(ask(ROGUE_A, 2));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // The removal at 1400 could have been A's. Reporting ACTIVE here would be a
    // confident state built on the identity evidence we are missing.
    expect(result.reason).toBe("UNSUPPORTED_DERIVATION");
    expect(result).not.toHaveProperty("value");
    // The anchor we found is still cited, so the refusal is explainable.
    expect(result.provenance.locators[0]?.ingestionOrdinal).toBe(0);
  });

  it("turns on nothing but the source field", () => {
    const known = byKnownOther.auras.presenceAt(ask(ROGUE_A, 2));
    const unknown = byUnknown.auras.presenceAt(ask(ROGUE_A, 2));

    // Two fights identical but for one `sourceID`, and two different answers.
    // That is the asymmetry: a known different source is independent, an unknown
    // source is ambiguity.
    expect(known.certainty).toBe("EXACT");
    expect(unknown.certainty).toBe("UNKNOWN");
  });

  it("does not confidently carry an INACTIVE state through an unowned application", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          garrote(0, 1200, ROGUE_A, "REMOVED"),
          unownedGarrote(1, 1400, "APPLIED"),
          damageEvent({ ordinal: 2, reportTimeMs: 1800, sourceActorId: ROGUE_A, targetActorId: BOSS }),
        ],
      }),
    );
    const result = state.auras.presenceAt(ask(ROGUE_A, 2));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // Symmetric to the removal case: the unowned application could have been A
    // re-applying, so A's INACTIVE cannot be carried through it either.
    expect(result.reason).toBe("UNSUPPORTED_DERIVATION");
  });

  it("does not confidently carry INACTIVE through an unowned refresh", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          garrote(0, 1200, ROGUE_A, "REMOVED"),
          unownedGarrote(1, 1400, "REFRESHED"),
          damageEvent({ ordinal: 2, reportTimeMs: 1800, sourceActorId: ROGUE_A, targetActorId: BOSS }),
        ],
      }),
    );
    const result = state.auras.presenceAt(ask(ROGUE_A, 2));

    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("UNSUPPORTED_DERIVATION");
  });

  it("blocks every known source's carried-forward claim, not only A's", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          garrote(0, 1200, ROGUE_A, "APPLIED"),
          garrote(1, 1300, ROGUE_B, "APPLIED"),
          unownedGarrote(2, 1400, "REMOVED"),
          damageEvent({ ordinal: 3, reportTimeMs: 1800, sourceActorId: ROGUE_A, targetActorId: BOSS }),
        ],
      }),
    );

    // The unowned removal could have been either of them.
    expect(state.auras.presenceAt(ask(ROGUE_A, 3)).certainty).toBe("UNKNOWN");
    expect(state.auras.presenceAt(ask(ROGUE_B, 3)).certainty).toBe("UNKNOWN");
  });

  it("still answers exactly at a positive observation of its own", () => {
    // Position 0 IS A's application. A later unowned transition cannot reach
    // backwards and un-observe it, and no coverage is required for it.
    const result = byUnknown.auras.presenceAt(ask(ROGUE_A, 0));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.presence).toBe("ACTIVE");
    expect(result.value.anchorIsQueryPosition).toBe(true);
    expect(result.derivation).toBe("OBSERVED");
  });

  it("resumes answering once the source's own transition supersedes the ambiguity", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          garrote(0, 1200, ROGUE_A, "APPLIED"),
          unownedGarrote(1, 1400, "REMOVED"),
          garrote(2, 1600, ROGUE_A, "APPLIED"),
          damageEvent({ ordinal: 3, reportTimeMs: 1800, sourceActorId: ROGUE_A, targetActorId: BOSS }),
        ],
      }),
    );
    const result = state.auras.presenceAt(ask(ROGUE_A, 3));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    // The ambiguous transition is now BEFORE A's anchor, so it no longer bears
    // on the interval being carried. Failing closed is not sticky.
    expect(result.value.presence).toBe("ACTIVE");
    expect(result.value.anchor.position).toBe(2);
  });

  it("never attributes the unowned transition to A", () => {
    const group = byUnknown.auras.groupFor(askAnySource(2));

    expect(group?.tracksBySource.get(`${ROGUE_A}#-`)?.positions).toEqual([0]);
    expect(group?.sourcelessTrack?.positions).toEqual([1]);
    // Failing closed is about what we may CLAIM. It does not merge the tracks,
    // and it does not give the null source A's identity.
    expect(group?.sourcelessTrack?.source).toBeNull();
    expect(group?.tracks).toHaveLength(2);
  });

  it("still reports A's own last transition observationally", () => {
    const result = byUnknown.auras.lastObservedTransition({
      target: ON_BOSS,
      abilityGameId: GARROTE,
      auraClass: "DEBUFF",
      source: fromSource(BY_A),
      at: afterEvent(2),
    });

    if (result.certainty !== "EXACT" || result.value === null) return;
    // Declining to DERIVE presence does not un-observe anything. The unowned
    // transition is still not A's.
    expect(result.value.position).toBe(0);
    expect(result.value.source?.actorId).toBe(ROGUE_A);
  });
});

describe("any-source proofs are not carried through unowned ambiguity", () => {
  it("does not carry an older ACTIVE proof through an unowned removal", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          garrote(0, 1200, ROGUE_A, "APPLIED"),
          unownedGarrote(1, 1400, "REMOVED"),
          damageEvent({ ordinal: 2, reportTimeMs: 1800, sourceActorId: ROGUE_A, targetActorId: BOSS }),
        ],
      }),
    );
    const result = state.auras.presenceAt(askAnySource(2));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // A's track is blocked by the ambiguity, and the unowned track's own last
    // transition is a removal. Proving the union ACTIVE from A's application
    // would require knowing the 1400 removal was NOT A's.
    expect(result.reason).toBe("UNSUPPORTED_DERIVATION");
  });

  it("lets an unowned application prove that SOME source has it up", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          unownedGarrote(0, 1200, "APPLIED"),
          damageEvent({ ordinal: 1, reportTimeMs: 1400, sourceActorId: ROGUE_A, targetActorId: BOSS }),
        ],
      }),
    );
    const result = state.auras.presenceAt(askAnySource(1));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    // The union question is "is this aura on the target from anyone?", and an
    // unowned application answers exactly that — without attributing it.
    expect(result.value.presence).toBe("ACTIVE");
    expect(result.value.anchor.source).toBeNull();
  });

  it("does not carry an unowned application through a known source's removal", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          unownedGarrote(0, 1200, "APPLIED"),
          garrote(1, 1400, ROGUE_A, "REMOVED"),
          damageEvent({ ordinal: 2, reportTimeMs: 1800, sourceActorId: ROGUE_A, targetActorId: BOSS }),
        ],
      }),
    );
    const result = state.auras.presenceAt(askAnySource(2));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // The mirror of the known-source case. The unowned application may have BEEN
    // A's, in which case A's removal ended it — so the union cannot be reported
    // ACTIVE from it.
    expect(result.reason).toBe("UNSUPPORTED_DERIVATION");
  });

  it("still proves ACTIVE from a source whose own track is unambiguous", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          unownedGarrote(0, 1200, "REMOVED"),
          garrote(1, 1400, ROGUE_A, "APPLIED"),
          damageEvent({ ordinal: 2, reportTimeMs: 1800, sourceActorId: ROGUE_A, targetActorId: BOSS }),
        ],
      }),
    );
    const result = state.auras.presenceAt(askAnySource(2));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    // The ambiguous transition precedes A's application, so it bears on nothing
    // being carried. Conservatism must not become blanket refusal.
    expect(result.value.presence).toBe("ACTIVE");
    expect(result.value.anchor.source?.actorId).toBe(ROGUE_A);
  });
});

describe("source instances are their own identities", () => {
  const PET_INSTANCE_ONE = sourceRef(88, 1);
  const PET_INSTANCE_TWO = sourceRef(88, 2);

  const state = createCombatState(
    syntheticFight({
      observedCategories: ["AURAS"],
      events: [
        auraEvent({
          ordinal: 0,
          reportTimeMs: 1200,
          operation: "APPLIED",
          auraClass: "DEBUFF",
          sourceActorId: 88,
          sourceInstanceId: 1,
          targetActorId: BOSS,
          abilityGameId: GARROTE,
        }),
        auraEvent({
          ordinal: 1,
          reportTimeMs: 1400,
          operation: "REMOVED",
          auraClass: "DEBUFF",
          sourceActorId: 88,
          sourceInstanceId: 2,
          targetActorId: BOSS,
          abilityGameId: GARROTE,
        }),
        damageEvent({ ordinal: 2, reportTimeMs: 1800, sourceActorId: ROGUE_A, targetActorId: BOSS }),
      ],
    }),
  );

  function fromInstance(source: ReturnType<typeof sourceRef>) {
    return {
      target: ON_BOSS,
      abilityGameId: GARROTE,
      auraClass: "DEBUFF" as const,
      source: fromSource(source),
      at: afterEvent(2),
    };
  }

  it("does not let instance 2's removal end instance 1's aura", () => {
    const one = state.auras.presenceAt(fromInstance(PET_INSTANCE_ONE));
    const two = state.auras.presenceAt(fromInstance(PET_INSTANCE_TWO));

    if (one.certainty !== "EXACT" || two.certainty !== "EXACT") return;
    // Two summons of the same creature share an actor id and are different
    // actors. `actorId` and `instanceId` are never collapsed.
    expect(one.value.presence).toBe("ACTIVE");
    expect(two.value.presence).toBe("INACTIVE");
  });

  it("does not collapse an absent source instance into instance 0", () => {
    const instanceless = state.auras.presenceAt(fromInstance(sourceRef(88, null)));
    const instanceZero = state.auras.presenceAt(fromInstance(sourceRef(88, 0)));

    // `null` means "Warcraft Logs supplied none", which is a different fact from
    // instance 0. Neither matches instance 1 or 2.
    expect(instanceless.certainty).toBe("UNKNOWN");
    expect(instanceZero.certainty).toBe("UNKNOWN");
  });
});

describe("a sourceless transition gets no source identity", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["AURAS"],
      events: [
        // Warcraft Logs supplied no source for this application.
        auraEvent({
          ordinal: 0,
          reportTimeMs: 1200,
          operation: "APPLIED",
          auraClass: "DEBUFF",
          sourceActorId: null,
          sourceAbsence: "NO_ACTOR_SENTINEL",
          targetActorId: BOSS,
          abilityGameId: GARROTE,
        }),
        garrote(1, 1400, ROGUE_A, "APPLIED"),
        damageEvent({ ordinal: 2, reportTimeMs: 1800, sourceActorId: ROGUE_A, targetActorId: BOSS }),
      ],
    }),
  );

  const group = state.auras.groupFor({
    target: ON_BOSS,
    abilityGameId: GARROTE,
    auraClass: "DEBUFF",
    source: anySource(),
  });

  it("keeps it in its own track with a null source", () => {
    expect(group?.sourcelessTrack?.source).toBeNull();
    expect(group?.sourcelessTrack?.positions).toEqual([0]);
    // The historical failure: `-1` read as "actor minus one". There is no source
    // key for it, and no actor was invented.
    expect([...(group?.tracksBySource.keys() ?? [])]).toEqual([`${ROGUE_A}#-`]);
  });

  it("does not fold it into a real source's history", () => {
    expect(group?.tracksBySource.get(`${ROGUE_A}#-`)?.positions).toEqual([1]);

    const a = state.auras.presenceAt(ask(ROGUE_A, 2));
    if (a.certainty !== "EXACT") return;
    expect(a.value.anchor.position).toBe(1);
    expect(a.value.anchor.source?.actorId).toBe(ROGUE_A);
  });

  it("cannot be addressed by a source-specific query", () => {
    // There is no `SourceRef` that names "no source", so the sourceless track is
    // reachable only through the group. That is deliberate: a query asking about
    // a specific source must never match transitions whose source was unstated.
    expect(state.auras.presenceAt(ask(-1, 2)).certainty).toBe("UNKNOWN");
    expect(state.auras.presenceAt(ask(0, 2)).certainty).toBe("UNKNOWN");
  });

  it("still counts toward the group's union", () => {
    expect(group?.allPositions).toEqual([0, 1]);
    expect(group?.tracks).toHaveLength(2);
  });
});

describe("actor id 0 is a real source", () => {
  it("gives actor 0 its own track", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          garrote(0, 1200, 0, "APPLIED"),
          garrote(1, 1400, ROGUE_A, "REMOVED"),
          damageEvent({ ordinal: 2, reportTimeMs: 1800, sourceActorId: ROGUE_A, targetActorId: BOSS }),
        ],
      }),
    );

    const zero = state.auras.presenceAt(ask(0, 2));
    expect(zero.certainty).toBe("EXACT");
    if (zero.certainty !== "EXACT") return;
    // A truthiness check on the source id would have merged actor 0 into the
    // sourceless track and lost its history.
    expect(zero.value.presence).toBe("ACTIVE");
    expect(zero.value.anchor.source?.actorId).toBe(0);

    const group = state.auras.groupFor({
      target: ON_BOSS,
      abilityGameId: GARROTE,
      auraClass: "DEBUFF",
      source: anySource(),
    });
    expect(group?.sourcelessTrack).toBeNull();
    expect(group?.tracksBySource.has("0#-")).toBe(true);
  });
});

describe("pets keep their own aura ownership", () => {
  it("does not attribute a pet's aura to its owner", () => {
    const PET = 88;
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          garrote(0, 1200, PET, "APPLIED"),
          garrote(1, 1400, ROGUE_A, "REMOVED"),
          damageEvent({ ordinal: 2, reportTimeMs: 1800, sourceActorId: ROGUE_A, targetActorId: BOSS }),
        ],
      }),
    );

    const pet = state.auras.presenceAt(ask(PET, 2));
    const owner = state.auras.presenceAt(ask(ROGUE_A, 2));

    if (pet.certainty !== "EXACT" || owner.certainty !== "EXACT") return;
    // Whether a pet's contribution should count toward its owner is a gameplay
    // decision for a specialization evaluator. This layer does not pre-empt it.
    expect(pet.value.presence).toBe("ACTIVE");
    expect(owner.value.presence).toBe("INACTIVE");
  });
});

describe("direction still cannot be inverted by the source-specific path", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["AURAS"],
      events: [garrote(0, 1200, ROGUE_A, "APPLIED")],
    }),
  );

  it("refuses to answer about the source as though it were the target", () => {
    const onBoss = state.auras.presenceAt({
      target: ON_BOSS,
      abilityGameId: GARROTE,
      auraClass: "DEBUFF",
      source: fromSource(BY_A),
      at: afterEvent(0),
    });
    const onRogue = state.auras.presenceAt({
      target: targetRef(ROGUE_A, null),
      abilityGameId: GARROTE,
      auraClass: "DEBUFF",
      source: fromSource(BY_A),
      at: afterEvent(0),
    });

    expect(onBoss.certainty).toBe("EXACT");
    // The applier does not carry their own debuff, however the query is
    // refined by source.
    expect(onRogue.certainty).toBe("UNKNOWN");
  });

  it("keeps the two sides branded distinctly at the query surface", () => {
    const _invalid = state.auras.presenceAt({
      // @ts-expect-error a SourceRef is not a TargetRef
      target: BY_A,
      abilityGameId: GARROTE,
      auraClass: "DEBUFF",
      source: fromSource(BY_B),
      at: afterEvent(0),
    });
    void _invalid;

    const _alsoInvalid = state.auras.presenceAt({
      target: ON_BOSS,
      abilityGameId: GARROTE,
      auraClass: "DEBUFF",
      // @ts-expect-error a TargetRef is not a SourceRef
      source: fromSource(ON_BOSS),
      at: afterEvent(0),
    });
    void _alsoInvalid;
  });
});

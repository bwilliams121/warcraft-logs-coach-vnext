import { describe, expect, it } from "vitest";

import { exclusiveRange, inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { anySource, fromSource } from "../../src/engine/auras/aura-state.js";
import { createNormalizer } from "../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../src/engine/normalization/supported-families.js";
import { sourceRef, targetRef } from "../../src/engine/normalization/normalized-events.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import {
  afterEvent,
  beforeEvent,
  endOfTimestamp,
  startOfTimestamp,
} from "../../src/engine/state/temporal.js";
import {
  absentCategory,
  auraEvent,
  damageEvent,
  partialCategory,
  syntheticFight,
  UNVERIFIED_CATEGORY,
  type SyntheticFightOptions,
} from "../support/synthetic-fight.js";
import pullWindowFixture from "../fixtures/wcl/events/wcl-pull-window-with-resources.json";

const PLAYER = 5;
const BOSS = 160;
const ALLY = 11;
const RUPTURE = 1943;
const SLICE_AND_DICE = 315496;

const ON_BOSS = targetRef(BOSS, null);
const ON_PLAYER = targetRef(PLAYER, null);
const BY_PLAYER = sourceRef(PLAYER, null);

/**
 * The player's own Rupture on the boss.
 *
 * Source-specific, because that is the question a spec evaluator actually asks
 * and the only one that can prove both presence directions. `anySource` has its
 * own block below.
 */
function ruptureOnBoss(at: Parameters<typeof afterEvent>[0]) {
  return {
    target: ON_BOSS,
    abilityGameId: RUPTURE,
    auraClass: "DEBUFF" as const,
    source: fromSource(BY_PLAYER),
    at: afterEvent(at),
  };
}

function ruptureFromAnySource(at: Parameters<typeof afterEvent>[0]) {
  return { ...ruptureOnBoss(at), source: anySource() };
}

// --------------------------------------------------------------------------
// Presence from observed transitions
// --------------------------------------------------------------------------

describe("presence is established only by an observed transition", () => {
  const fight = syntheticFight({
    observedCategories: ["AURAS"],
    events: [
      auraEvent({
        ordinal: 0,
        reportTimeMs: 1200,
        operation: "APPLIED",
        auraClass: "DEBUFF",
        sourceActorId: PLAYER,
        targetActorId: BOSS,
        abilityGameId: RUPTURE,
      }),
      damageEvent({ ordinal: 1, reportTimeMs: 1600, sourceActorId: PLAYER, targetActorId: BOSS }),
      auraEvent({
        ordinal: 2,
        reportTimeMs: 2000,
        operation: "REFRESHED",
        auraClass: "DEBUFF",
        sourceActorId: PLAYER,
        targetActorId: BOSS,
        abilityGameId: RUPTURE,
      }),
      damageEvent({ ordinal: 3, reportTimeMs: 2400, sourceActorId: PLAYER, targetActorId: BOSS }),
      auraEvent({
        ordinal: 4,
        reportTimeMs: 2800,
        operation: "REMOVED",
        auraClass: "DEBUFF",
        sourceActorId: PLAYER,
        targetActorId: BOSS,
        abilityGameId: RUPTURE,
      }),
      damageEvent({ ordinal: 5, reportTimeMs: 3200, sourceActorId: PLAYER, targetActorId: BOSS }),
    ],
  });
  const state = createCombatState(fight);

  it("reports ACTIVE at the application itself, with no coverage required", () => {
    const bare = createCombatState(syntheticFight({ events: fight.events }));
    const result = bare.auras.presenceAt(ruptureOnBoss(0));

    // The positive-observation asymmetry: we saw it happen, here. A retrieval
    // deficiency elsewhere does not un-observe it.
    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.presence).toBe("ACTIVE");
    expect(result.derivation).toBe("OBSERVED");
    expect(result.value.anchorIsQueryPosition).toBe(true);
  });

  it("reports ACTIVE at a refresh", () => {
    const result = state.auras.presenceAt(ruptureOnBoss(2));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.presence).toBe("ACTIVE");
    expect(result.value.anchor.operation).toBe("REFRESHED");
  });

  it("carries an application forward as DERIVED_EXACT, not OBSERVED", () => {
    const result = state.auras.presenceAt(ruptureOnBoss(1));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.presence).toBe("ACTIVE");
    // Certainty and derivation origin are separate axes. This answer is exact,
    // and it was calculated from an observation plus a proven absence of later
    // transitions rather than read off an event.
    expect(result.derivation).toBe("DERIVED_EXACT");
    expect(result.value.anchorIsQueryPosition).toBe(false);
    expect(result.value.anchor.position).toBe(0);
  });

  it("reports INACTIVE at an observed removal", () => {
    const result = state.auras.presenceAt(ruptureOnBoss(4));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.presence).toBe("INACTIVE");
    expect(result.value.anchor.operation).toBe("REMOVED");
  });

  it("carries a removal forward as INACTIVE", () => {
    const result = state.auras.presenceAt(ruptureOnBoss(5));

    if (result.certainty !== "EXACT") return;
    expect(result.value.presence).toBe("INACTIVE");
    expect(result.value.anchor.position).toBe(4);
  });

  it("does not expire an aura because some remembered duration elapsed", () => {
    // Rupture's real duration is nothing like 1.6 seconds, and this layer has no
    // duration database. The apply at 1200 remains the anchor at 2400 because
    // nothing observed contradicted it.
    const result = state.auras.presenceAt(ruptureOnBoss(3));

    if (result.certainty !== "EXACT") return;
    expect(result.value.presence).toBe("ACTIVE");
    expect(result.value.anchor.reportTimeMs).toBe(2000);
  });

  it("exposes no duration or expiry anywhere in the result", () => {
    const result = state.auras.presenceAt(ruptureOnBoss(1));
    if (result.certainty !== "EXACT") return;

    const serialized = JSON.stringify(result.value).toLowerCase();
    for (const forbidden of ["duration", "expire", "expiry", "expiresat", "pandemic", "remaining"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

// --------------------------------------------------------------------------
// Absence is not inactivity
// --------------------------------------------------------------------------

describe("no aura event is never read as an inactive aura", () => {
  const fight = syntheticFight({
    observedCategories: ["AURAS"],
    events: [damageEvent({ ordinal: 0, reportTimeMs: 2000, sourceActorId: PLAYER, targetActorId: BOSS })],
  });
  const state = createCombatState(fight);

  it("returns UNKNOWN for an aura no transition was ever seen for", () => {
    const result = state.auras.presenceAt(ruptureOnBoss(0));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // The load-bearing distinction. A pre-pull application leaves no event
    // inside the fight, so even perfect coverage cannot settle the state before
    // the first observation.
    expect(result.reason).toBe("AMBIGUOUS_INITIAL_STATE");
    expect(result).not.toHaveProperty("value");
  });

  it("returns UNKNOWN before the first observed transition of an aura that does appear later", () => {
    const later = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          damageEvent({ ordinal: 0, reportTimeMs: 1200, sourceActorId: PLAYER, targetActorId: BOSS }),
          auraEvent({
            ordinal: 1,
            reportTimeMs: 2000,
            operation: "APPLIED",
            auraClass: "DEBUFF",
            sourceActorId: PLAYER,
            targetActorId: BOSS,
            abilityGameId: RUPTURE,
          }),
        ],
      }),
    );

    const result = later.auras.presenceAt(ruptureOnBoss(0));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // Never looks forward to conclude "it was not up yet". The application at
    // position 1 says nothing about position 0.
    expect(result.reason).toBe("AMBIGUOUS_INITIAL_STATE");
  });

  it("still reports a PROVEN absence of transitions separately, as a fact", () => {
    const result = state.auras.lastObservedTransition(ruptureOnBoss(0));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    // "No transition was observed" is a real observed fact once coverage earns
    // it — and it is a different sentence from "the aura was inactive", which is
    // why it lives on a different method.
    expect(result.value).toBeNull();
  });

  it("refuses even the observational absence claim without coverage", () => {
    const bare = createCombatState(
      syntheticFight({ events: fight.events, categories: { AURAS: UNVERIFIED_CATEGORY } }),
    );
    const result = bare.auras.lastObservedTransition(ruptureOnBoss(0));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("CAPABILITY_UNVERIFIED");
  });
});

// --------------------------------------------------------------------------
// Coverage gates the carried-forward claim
// --------------------------------------------------------------------------

describe("a coverage gap prevents carrying a transition forward", () => {
  function fightWith(auras: SyntheticFightOptions["categories"]) {
    return createCombatState(
      syntheticFight({
        categories: auras,
        events: [
          auraEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            operation: "APPLIED",
            auraClass: "DEBUFF",
            sourceActorId: PLAYER,
            targetActorId: BOSS,
            abilityGameId: RUPTURE,
          }),
          damageEvent({ ordinal: 1, reportTimeMs: 4000, sourceActorId: PLAYER, targetActorId: BOSS }),
          auraEvent({
            ordinal: 2,
            reportTimeMs: 4200,
            operation: "REMOVED",
            auraClass: "DEBUFF",
            sourceActorId: PLAYER,
            targetActorId: BOSS,
            abilityGameId: RUPTURE,
          }),
          damageEvent({ ordinal: 3, reportTimeMs: 4800, sourceActorId: PLAYER, targetActorId: BOSS }),
        ],
      }),
    );
  }

  it("refuses continued ACTIVE across an uncovered stretch after the apply", () => {
    const state = fightWith({ AURAS: partialCategory([exclusiveRange(1000, 2000)]) });
    const result = state.auras.presenceAt(ruptureOnBoss(1));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // A removal could have happened in the 2000-4000 stretch we never retrieved.
    expect(result.reason).toBe("INSUFFICIENT_COVERAGE");
    // The observation we did find is still cited, so the caller can see what we
    // had and could not vouch for.
    expect(result.provenance.locators[0]?.ingestionOrdinal).toBe(0);
  });

  it("refuses continued INACTIVE across an uncovered stretch after the removal", () => {
    const state = fightWith({ AURAS: partialCategory([inclusiveRange(1000, 4200)]) });
    const result = state.auras.presenceAt(ruptureOnBoss(3));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // Symmetry matters: a gap after a removal could hide a re-application just
    // as easily as a gap after an apply could hide a removal.
    expect(result.reason).toBe("INSUFFICIENT_COVERAGE");
  });

  it("still reports the transition itself inside covered time", () => {
    const state = fightWith({ AURAS: partialCategory([inclusiveRange(1000, 2000)]) });
    const result = state.auras.presenceAt(ruptureOnBoss(0));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.presence).toBe("ACTIVE");
  });

  it("returns CAPABILITY_UNVERIFIED rather than a carried-forward guess", () => {
    const state = fightWith({ AURAS: UNVERIFIED_CATEGORY });
    const result = state.auras.presenceAt(ruptureOnBoss(1));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("CAPABILITY_UNVERIFIED");
  });

  it("returns INSUFFICIENT_COVERAGE when coverage is ABSENT entirely", () => {
    const state = fightWith({ AURAS: absentCategory() });
    const result = state.auras.presenceAt(ruptureOnBoss(1));

    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("INSUFFICIENT_COVERAGE");
  });
});

describe("actor scope gates aura state", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["AURAS"],
      actorScope: [PLAYER],
      events: [
        auraEvent({
          ordinal: 0,
          reportTimeMs: 1200,
          operation: "APPLIED",
          auraClass: "BUFF",
          sourceActorId: ALLY,
          targetActorId: ALLY,
          abilityGameId: SLICE_AND_DICE,
        }),
        damageEvent({ ordinal: 1, reportTimeMs: 2000, sourceActorId: ALLY, targetActorId: BOSS }),
      ],
    }),
  );

  it("refuses to carry an out-of-scope actor's aura forward", () => {
    const result = state.auras.presenceAt({
      target: targetRef(ALLY, null),
      abilityGameId: SLICE_AND_DICE,
      auraClass: "BUFF",
      source: anySource(),
      at: afterEvent(1),
    });

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // Under PLAYER_CONTEXT the ally's events may physically sit in the stream.
    // Scope declares what the evidence vouches for.
    expect(result.reason).toBe("INSUFFICIENT_SCOPE");
  });

  it("still reports the out-of-scope actor's observed transition", () => {
    const result = state.auras.presenceAt({
      target: targetRef(ALLY, null),
      abilityGameId: SLICE_AND_DICE,
      auraClass: "BUFF",
      source: anySource(),
      at: afterEvent(0),
    });

    expect(result.certainty).toBe("EXACT");
  });
});

// --------------------------------------------------------------------------
// Identity
// --------------------------------------------------------------------------

describe("aura identity keeps facts apart", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["AURAS"],
      events: [
        // Same ability id, same target, different aura class.
        auraEvent({
          ordinal: 0,
          reportTimeMs: 1200,
          operation: "APPLIED",
          auraClass: "BUFF",
          sourceActorId: PLAYER,
          targetActorId: BOSS,
          abilityGameId: RUPTURE,
        }),
        auraEvent({
          ordinal: 1,
          reportTimeMs: 1300,
          operation: "REMOVED",
          auraClass: "DEBUFF",
          sourceActorId: PLAYER,
          targetActorId: BOSS,
          abilityGameId: RUPTURE,
        }),
        // Same ability, same actor id, different instance.
        auraEvent({
          ordinal: 2,
          reportTimeMs: 1400,
          operation: "APPLIED",
          auraClass: "DEBUFF",
          sourceActorId: PLAYER,
          targetActorId: BOSS,
          targetInstanceId: 3,
          abilityGameId: RUPTURE,
        }),
      ],
    }),
  );

  it("does not let a removebuff answer a debuff question", () => {
    const asBuff = state.auras.presenceAt({
      target: ON_BOSS,
      abilityGameId: RUPTURE,
      auraClass: "BUFF",
      source: fromSource(BY_PLAYER),
      at: afterEvent(1),
    });
    const asDebuff = state.auras.presenceAt({
      target: ON_BOSS,
      abilityGameId: RUPTURE,
      auraClass: "DEBUFF",
      source: fromSource(BY_PLAYER),
      at: afterEvent(1),
    });

    if (asBuff.certainty !== "EXACT" || asDebuff.certainty !== "EXACT") return;
    // Two different facts about the same ability id. Merging them would let a
    // buff removal report a debuff as gone.
    expect(asBuff.value.presence).toBe("ACTIVE");
    expect(asDebuff.value.presence).toBe("INACTIVE");
  });

  it("keeps two instances of the same actor distinct", () => {
    const instanceless = state.auras.presenceAt(ruptureOnBoss(2));
    const instanceThree = state.auras.presenceAt({
      target: targetRef(BOSS, 3),
      abilityGameId: RUPTURE,
      auraClass: "DEBUFF",
      source: fromSource(BY_PLAYER),
      at: afterEvent(2),
    });

    if (instanceless.certainty !== "EXACT" || instanceThree.certainty !== "EXACT") return;
    // Instance 3's application must not resolve the instance-less track, and
    // vice versa. `instanceId: null` is "none supplied", not instance 0.
    expect(instanceless.value.presence).toBe("INACTIVE");
    expect(instanceThree.value.presence).toBe("ACTIVE");
    expect(state.auras.indexes.groups.size).toBe(3);
  });

  it("creates no track for an aura with no target", () => {
    const targetless = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          auraEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            operation: "APPLIED",
            auraClass: "DEBUFF",
            sourceActorId: PLAYER,
            targetActorId: null,
            targetAbsence: "NO_ACTOR_SENTINEL",
            abilityGameId: RUPTURE,
          }),
        ],
      }),
    );

    // The historical failure: `-1` read as "actor minus one", accumulating state
    // belonging to nobody.
    expect(targetless.auras.indexes.groups.size).toBe(0);
    expect(targetless.auras.indexes.targetlessObservationCount).toBe(1);
    expect(targetless.auras.observationAt(0)).toBeNull();
  });

  it("keeps actor id 0 as a real target", () => {
    const zero = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          auraEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            operation: "APPLIED",
            auraClass: "DEBUFF",
            sourceActorId: PLAYER,
            targetActorId: 0,
            abilityGameId: RUPTURE,
          }),
        ],
      }),
    );
    const result = zero.auras.presenceAt({
      target: targetRef(0, null),
      abilityGameId: RUPTURE,
      auraClass: "DEBUFF",
      source: anySource(),
      at: afterEvent(0),
    });

    // A truthiness check on the actor id would silently drop this actor's auras.
    expect(zero.auras.indexes.groups.size).toBe(1);
    expect(result.certainty).toBe("EXACT");
  });
});

describe("source refinement", () => {
  const OTHER = 9;
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["AURAS"],
      events: [
        auraEvent({
          ordinal: 0,
          reportTimeMs: 1200,
          operation: "APPLIED",
          auraClass: "DEBUFF",
          sourceActorId: PLAYER,
          targetActorId: BOSS,
          abilityGameId: RUPTURE,
        }),
        auraEvent({
          ordinal: 1,
          reportTimeMs: 1400,
          operation: "APPLIED",
          auraClass: "DEBUFF",
          sourceActorId: OTHER,
          targetActorId: BOSS,
          abilityGameId: RUPTURE,
        }),
        damageEvent({ ordinal: 2, reportTimeMs: 1600, sourceActorId: PLAYER, targetActorId: BOSS }),
      ],
    }),
  );

  it("finds only the named source's transitions", () => {
    const result = state.auras.lastObservedTransition({
      target: ON_BOSS,
      abilityGameId: RUPTURE,
      auraClass: "DEBUFF",
      source: fromSource(BY_PLAYER),
      at: afterEvent(2),
    });

    if (result.certainty !== "EXACT" || result.value === null) return;
    expect(result.value.position).toBe(0);
    expect(result.value.source?.actorId).toBe(PLAYER);
  });

  it("is unaffected by another source's transition in the interval", () => {
    const result = state.auras.presenceAt({
      target: ON_BOSS,
      abilityGameId: RUPTURE,
      auraClass: "DEBUFF",
      source: fromSource(BY_PLAYER),
      at: afterEvent(2),
    });

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    // The other rogue's Rupture is a different aura. Their application at
    // position 1 is not evidence about this player's, and must not make it
    // UNKNOWN.
    expect(result.value.presence).toBe("ACTIVE");
    expect(result.value.anchor.position).toBe(0);
    expect(result.value.anchor.source?.actorId).toBe(PLAYER);
  });

  it("gives each source its own independent track", () => {
    const group = state.auras.groupFor({
      target: ON_BOSS,
      abilityGameId: RUPTURE,
      auraClass: "DEBUFF",
      source: anySource(),
    });

    expect(group?.tracks).toHaveLength(2);
    expect(group?.tracksBySource.get(`${PLAYER}#-`)?.positions).toEqual([0]);
    expect(group?.tracksBySource.get(`${OTHER}#-`)?.positions).toEqual([1]);
    // The group still knows the union, for any-source questions.
    expect(group?.allPositions).toEqual([0, 1]);
  });

  it("returns no track for a source that never touched the aura", () => {
    expect(
      state.auras.trackFor({
        target: ON_BOSS,
        abilityGameId: RUPTURE,
        auraClass: "DEBUFF",
        source: fromSource(sourceRef(4242, null)),
      }),
    ).toBeNull();
  });

  it("has no single track to return for an any-source query", () => {
    // There is no one history that answers "from anyone", and returning an
    // arbitrary member would invite reading it as the whole picture.
    expect(
      state.auras.trackFor({
        target: ON_BOSS,
        abilityGameId: RUPTURE,
        auraClass: "DEBUFF",
        source: anySource(),
      }),
    ).toBeNull();
  });
});

describe("any-source presence can prove ACTIVE but not INACTIVE", () => {
  const OTHER = 9;

  function fightWith(events: SyntheticFightOptions["events"]) {
    return createCombatState(syntheticFight({ observedCategories: ["AURAS"], events }));
  }

  const appliedBy = (ordinal: number, reportTimeMs: number, sourceActorId: number) =>
    auraEvent({
      ordinal,
      reportTimeMs,
      operation: "APPLIED" as const,
      auraClass: "DEBUFF" as const,
      sourceActorId,
      targetActorId: BOSS,
      abilityGameId: RUPTURE,
    });

  const removedBy = (ordinal: number, reportTimeMs: number, sourceActorId: number) =>
    auraEvent({
      ordinal,
      reportTimeMs,
      operation: "REMOVED" as const,
      auraClass: "DEBUFF" as const,
      sourceActorId,
      targetActorId: BOSS,
      abilityGameId: RUPTURE,
    });

  it("proves ACTIVE when any one source has it up", () => {
    const state = fightWith([
      appliedBy(0, 1200, PLAYER),
      removedBy(1, 1400, PLAYER),
      appliedBy(2, 1600, OTHER),
      damageEvent({ ordinal: 3, reportTimeMs: 1800, sourceActorId: PLAYER, targetActorId: BOSS }),
    ]);
    const result = state.auras.presenceAt(ruptureFromAnySource(3));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    // One source's aura being up means the aura is on the target, whatever the
    // other tracks say. Provenance points at the observation that proves it.
    expect(result.value.presence).toBe("ACTIVE");
    expect(result.value.anchor.source?.actorId).toBe(OTHER);
  });

  it("proves ACTIVE even when another source's history is UNKNOWN", () => {
    const state = createCombatState(
      syntheticFight({
        // Partial coverage, so the earlier track cannot be carried forward.
        categories: { AURAS: partialCategory([inclusiveRange(1000, 1650)]) },
        events: [
          appliedBy(0, 1200, PLAYER),
          appliedBy(1, 1600, OTHER),
          damageEvent({ ordinal: 2, reportTimeMs: 1600, sourceActorId: PLAYER, targetActorId: BOSS }),
        ],
      }),
    );
    const result = state.auras.presenceAt(ruptureFromAnySource(2));

    if (result.certainty !== "EXACT") return;
    expect(result.value.presence).toBe("ACTIVE");
  });

  it("returns UNKNOWN rather than INACTIVE when every known source removed it", () => {
    const state = fightWith([
      appliedBy(0, 1200, PLAYER),
      removedBy(1, 1400, PLAYER),
      damageEvent({ ordinal: 2, reportTimeMs: 1600, sourceActorId: PLAYER, targetActorId: BOSS }),
    ]);
    const result = state.auras.presenceAt(ruptureFromAnySource(2));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // The set of sources that could hold this aura is not observable: a source
    // with a pre-pull application and no transition in the window leaves no
    // track at all. That is the same pre-observation ambiguity a zero-track
    // query reports, applied to the union.
    expect(result.reason).toBe("AMBIGUOUS_INITIAL_STATE");
    expect(result).not.toHaveProperty("value");
  });

  it("answers the same question decidably when asked per source", () => {
    const state = fightWith([
      appliedBy(0, 1200, PLAYER),
      removedBy(1, 1400, PLAYER),
      damageEvent({ ordinal: 2, reportTimeMs: 1600, sourceActorId: PLAYER, targetActorId: BOSS }),
    ]);
    const perSource = state.auras.presenceAt(ruptureOnBoss(2));

    expect(perSource.certainty).toBe("EXACT");
    if (perSource.certainty !== "EXACT") return;
    // Naming the identity makes both directions provable. That is why a spec
    // evaluator should ask this form.
    expect(perSource.value.presence).toBe("INACTIVE");
  });

  it("reports a blocking reason from a member track when nothing is ACTIVE", () => {
    const state = createCombatState(
      syntheticFight({
        categories: { AURAS: UNVERIFIED_CATEGORY },
        events: [
          appliedBy(0, 1200, PLAYER),
          damageEvent({ ordinal: 1, reportTimeMs: 1600, sourceActorId: PLAYER, targetActorId: BOSS }),
        ],
      }),
    );
    const result = state.auras.presenceAt(ruptureFromAnySource(1));

    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("CAPABILITY_UNVERIFIED");
  });

  it("still answers the observational union question", () => {
    const state = fightWith([
      appliedBy(0, 1200, PLAYER),
      removedBy(1, 1400, PLAYER),
      appliedBy(2, 1600, OTHER),
    ]);
    const result = state.auras.lastObservedTransition(ruptureFromAnySource(2));

    if (result.certainty !== "EXACT" || result.value === null) return;
    // `lastObservedTransition` is observational, so the union is exactly
    // answerable: this IS the last transition anyone made.
    expect(result.value.position).toBe(2);
    expect(result.value.source?.actorId).toBe(OTHER);
  });
});

describe("an unidentifiable aura observation blocks a carried-forward claim", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["AURAS"],
      events: [
        auraEvent({
          ordinal: 0,
          reportTimeMs: 1200,
          operation: "APPLIED",
          auraClass: "DEBUFF",
          sourceActorId: PLAYER,
          targetActorId: BOSS,
          abilityGameId: RUPTURE,
        }),
        // An aura event on the same target with no ability id. It cannot be
        // attributed to any identity, so it cannot be ruled out either.
        auraEvent({
          ordinal: 1,
          reportTimeMs: 1600,
          operation: "REMOVED",
          auraClass: "DEBUFF",
          sourceActorId: PLAYER,
          targetActorId: BOSS,
          abilityGameId: null,
        }),
      ],
    }),
  );

  it("keeps it out of every track but does not discard it", () => {
    expect(state.auras.indexes.groups.size).toBe(1);
    expect([...state.auras.indexes.unidentifiedPositionsByTarget.values()].flat()).toEqual([1]);
  });

  it("declines rather than reporting continued ACTIVE across it", () => {
    const result = state.auras.presenceAt(ruptureOnBoss(1));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("UNSUPPORTED_DERIVATION");
  });
});

// --------------------------------------------------------------------------
// Stacks
// --------------------------------------------------------------------------

describe("stack numbers are preserved and never reconstructed", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["AURAS"],
      events: [
        auraEvent({
          ordinal: 0,
          reportTimeMs: 1200,
          operation: "APPLIED",
          auraClass: "BUFF",
          sourceActorId: PLAYER,
          targetActorId: PLAYER,
          abilityGameId: SLICE_AND_DICE,
        }),
        auraEvent({
          ordinal: 1,
          reportTimeMs: 1400,
          operation: "APPLIED",
          auraClass: "BUFF",
          isStackChange: true,
          stacks: 3,
          sourceActorId: PLAYER,
          targetActorId: PLAYER,
          abilityGameId: SLICE_AND_DICE,
        }),
        auraEvent({
          ordinal: 2,
          reportTimeMs: 1600,
          operation: "APPLIED",
          auraClass: "BUFF",
          isStackChange: true,
          stacks: 4,
          sourceActorId: PLAYER,
          targetActorId: PLAYER,
          abilityGameId: SLICE_AND_DICE,
        }),
      ],
    }),
  );

  const sliceQuery = {
    target: ON_PLAYER,
    abilityGameId: SLICE_AND_DICE,
    auraClass: "BUFF" as const,
    source: anySource(),
  };

  it("returns the observation carrying the number, not a reconstructed count", () => {
    const result = state.auras.latestStackObservation({ ...sliceQuery, at: afterEvent(2) });

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.observedStacks).toBe(4);
    // The answer is an OBSERVATION with its own timestamp, so it cannot be read
    // as "the stack count at the query position" without deliberately ignoring
    // the shape.
    expect(result.value.reportTimeMs).toBe(1600);
    expect(result.value.position).toBe(2);
  });

  it("does not add successive stack events together", () => {
    const result = state.auras.latestStackObservation({ ...sliceQuery, at: afterEvent(2) });

    if (result.certainty !== "EXACT") return;
    // 3 then 4 is neither 7 nor anything else derived. `stack` is the absolute
    // resulting count, so 4 is simply the answer — and summing them would be
    // the delta reading that live evidence rules out.
    expect(result.value.observedStacks).not.toBe(7);
    expect(result.value.observedStacks).toBe(4);
  });

  it("exposes no reconstructed stack count anywhere on the view", () => {
    for (const forbidden of ["stacksAt", "stackCount", "currentStacks", "reconstructStacks"]) {
      expect(state.auras).not.toHaveProperty(forbidden);
    }
  });

  it("returns NO_OBSERVATION when no stack number was seen", () => {
    const result = state.auras.latestStackObservation({ ...sliceQuery, at: afterEvent(0) });

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // The question asked for an observation and there provably is none. No state
    // was claimed, so this is not an initial-state ambiguity.
    expect(result.reason).toBe("NO_OBSERVATION");
  });

  it("keeps a non-stack application as a presence anchor regardless", () => {
    const result = state.auras.presenceAt({ ...sliceQuery, at: afterEvent(2) });

    if (result.certainty !== "EXACT") return;
    // A stack APPLICATION cannot have removed the aura, so it stays usable.
    expect(result.value.presence).toBe("ACTIVE");
  });
});

describe("a stack removal with stacks remaining proves the aura is ACTIVE", () => {
  /**
   * `stack` is the absolute count REMAINING after its own event, so a stack
   * removal reporting a positive number is a positive anchor: the aura is
   * observed still holding stacks.
   *
   * Only the positive direction follows. Zero is covered in its own block below.
   */
  function fightEndingInStackRemoval(stacks: number, options: SyntheticFightOptions = {}) {
    return createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        ...options,
        events: [
          auraEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            operation: "APPLIED",
            auraClass: "BUFF",
            sourceActorId: PLAYER,
            targetActorId: PLAYER,
            abilityGameId: SLICE_AND_DICE,
          }),
          auraEvent({
            ordinal: 1,
            reportTimeMs: 1400,
            operation: "REMOVED",
            auraClass: "BUFF",
            isStackChange: true,
            stacks,
            sourceActorId: PLAYER,
            targetActorId: PLAYER,
            abilityGameId: SLICE_AND_DICE,
          }),
          damageEvent({ ordinal: 2, reportTimeMs: 2000, sourceActorId: PLAYER, targetActorId: BOSS }),
        ],
      }),
    );
  }

  const sliceQuery = {
    target: ON_PLAYER,
    abilityGameId: SLICE_AND_DICE,
    auraClass: "BUFF" as const,
  };

  it.each([
    ["two stacks remaining", 2],
    ["one stack remaining", 1],
  ])("is EXACT ACTIVE at the observation itself with %s", (_label, stacks) => {
    const result = fightEndingInStackRemoval(stacks).auras.presenceAt({
      ...sliceQuery,
      source: fromSource(BY_PLAYER),
      at: afterEvent(1),
    });

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.presence).toBe("ACTIVE");
    // The anchor IS the instant asked about, so this is an OBSERVATION rather
    // than a derivation carried across an interval.
    expect(result.derivation).toBe("OBSERVED");
    expect(result.value.anchorIsQueryPosition).toBe(true);
    expect(result.value.anchor.observedStacks).toBe(stacks);
  });

  it("does not read a stack removal as INACTIVE", () => {
    const result = fightEndingInStackRemoval(2).auras.presenceAt({
      ...sliceQuery,
      source: fromSource(BY_PLAYER),
      at: afterEvent(1),
    });

    if (result.certainty !== "EXACT") return;
    // The historical shape of this mistake: treating any `REMOVED` operation as
    // the end of the aura, when the stack variants report what SURVIVED.
    expect(result.value.presence).not.toBe("INACTIVE");
  });

  it("still reports it as an observed transition", () => {
    const result = fightEndingInStackRemoval(1).auras.lastObservedTransition({
      ...sliceQuery,
      source: anySource(),
      at: afterEvent(1),
    });

    if (result.certainty !== "EXACT" || result.value === null) return;
    expect(result.value.isStackChange).toBe(true);
    expect(result.value.observedStacks).toBe(1);
  });
});

describe("ACTIVE from a stack removal carries forward under the ordinary rules", () => {
  const sliceQuery = {
    target: ON_PLAYER,
    abilityGameId: SLICE_AND_DICE,
    auraClass: "BUFF" as const,
    source: fromSource(BY_PLAYER),
  };

  function fightWith(categories: SyntheticFightOptions["categories"]) {
    return createCombatState(
      syntheticFight({
        categories,
        events: [
          auraEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            operation: "REMOVED",
            auraClass: "BUFF",
            isStackChange: true,
            stacks: 3,
            sourceActorId: PLAYER,
            targetActorId: PLAYER,
            abilityGameId: SLICE_AND_DICE,
          }),
          damageEvent({ ordinal: 1, reportTimeMs: 4000, sourceActorId: PLAYER, targetActorId: BOSS }),
        ],
      }),
    );
  }

  it("derives ACTIVE later when coverage is complete", () => {
    const result = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: fightWith({}).fight.events,
      }),
    ).auras.presenceAt({ ...sliceQuery, at: afterEvent(1) });

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.presence).toBe("ACTIVE");
    // Carried across an interval rather than observed at it, which is a
    // different derivation even though the certainty matches.
    expect(result.derivation).toBe("DERIVED_EXACT");
    expect(result.value.anchorIsQueryPosition).toBe(false);
  });

  it("returns UNKNOWN when the interval is not covered", () => {
    const result = fightWith({
      AURAS: partialCategory([exclusiveRange(1000, 2000)]),
    }).auras.presenceAt({ ...sliceQuery, at: afterEvent(1) });

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // Carrying the anchor forward is a continuity claim, and a positive stack
    // anchor earns no exemption from it.
    expect(result.reason).toBe("INSUFFICIENT_COVERAGE");
  });

  it("returns UNKNOWN when the category was never verified", () => {
    const result = fightWith({ AURAS: UNVERIFIED_CATEGORY }).auras.presenceAt({
      ...sliceQuery,
      at: afterEvent(1),
    });

    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("CAPABILITY_UNVERIFIED");
  });

  it("lets an ordinary removal end it normally", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          auraEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            operation: "REMOVED",
            auraClass: "BUFF",
            isStackChange: true,
            stacks: 2,
            sourceActorId: PLAYER,
            targetActorId: PLAYER,
            abilityGameId: SLICE_AND_DICE,
          }),
          auraEvent({
            ordinal: 1,
            reportTimeMs: 1600,
            operation: "REMOVED",
            auraClass: "BUFF",
            sourceActorId: PLAYER,
            targetActorId: PLAYER,
            abilityGameId: SLICE_AND_DICE,
          }),
        ],
      }),
    );

    const atStackRemoval = state.auras.presenceAt({ ...sliceQuery, at: afterEvent(0) });
    const atFullRemoval = state.auras.presenceAt({ ...sliceQuery, at: afterEvent(1) });

    if (atStackRemoval.certainty !== "EXACT" || atFullRemoval.certainty !== "EXACT") return;
    // Two stacks remained, then the aura ended. Only the NON-stack removal
    // proves INACTIVE.
    expect(atStackRemoval.value.presence).toBe("ACTIVE");
    expect(atFullRemoval.value.presence).toBe("INACTIVE");
  });
});

describe("the new anchor changes nothing about ownership or the union", () => {
  /**
   * A positive stack removal is a new kind of ACTIVE anchor. It is NOT a new
   * kind of exemption: source identity, sourceless ambiguity and the one-way
   * union all apply to it exactly as they do to an application.
   */
  const ruptureOn = (source: ReturnType<typeof anySource>) => ({
    target: ON_BOSS,
    abilityGameId: RUPTURE,
    auraClass: "DEBUFF" as const,
    source,
  });

  it("keeps two sources' stack removals independent", () => {
    // The player's Rupture is still on the boss at two stacks. An ALLY's own
    // Rupture dropping to one stack is a fact about a different aura.
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          auraEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            operation: "REMOVED",
            auraClass: "DEBUFF",
            isStackChange: true,
            stacks: 2,
            sourceActorId: PLAYER,
            targetActorId: BOSS,
            abilityGameId: RUPTURE,
          }),
          auraEvent({
            ordinal: 1,
            reportTimeMs: 1400,
            operation: "REMOVED",
            auraClass: "DEBUFF",
            sourceActorId: ALLY,
            targetActorId: BOSS,
            abilityGameId: RUPTURE,
          }),
        ],
      }),
    );

    const mine = state.auras.presenceAt({ ...ruptureOn(fromSource(BY_PLAYER)), at: afterEvent(1) });

    expect(mine.certainty).toBe("EXACT");
    if (mine.certainty !== "EXACT") return;
    // The ally's full removal must not end the player's aura.
    expect(mine.value.presence).toBe("ACTIVE");
    expect(mine.value.anchor.observedStacks).toBe(2);
  });

  it("still fails closed through a sourceless transition", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          auraEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            operation: "REMOVED",
            auraClass: "DEBUFF",
            isStackChange: true,
            stacks: 2,
            sourceActorId: PLAYER,
            targetActorId: BOSS,
            abilityGameId: RUPTURE,
          }),
          auraEvent({
            ordinal: 1,
            reportTimeMs: 1400,
            operation: "REMOVED",
            auraClass: "DEBUFF",
            sourceActorId: null,
            sourceAbsence: "NOT_SUPPLIED",
            targetActorId: BOSS,
            abilityGameId: RUPTURE,
          }),
          damageEvent({ ordinal: 2, reportTimeMs: 1600, sourceActorId: PLAYER, targetActorId: BOSS }),
        ],
      }),
    );

    const mine = state.auras.presenceAt({ ...ruptureOn(fromSource(BY_PLAYER)), at: afterEvent(2) });

    expect(mine.certainty).toBe("UNKNOWN");
    if (mine.certainty !== "UNKNOWN") return;
    // The unowned removal might have been the player's own. A positive stack
    // anchor earns no right to be carried through that ambiguity.
    expect(mine.reason).toBe("UNSUPPORTED_DERIVATION");
  });

  it("lets an any-source query prove ACTIVE from a positive stack removal", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          auraEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            operation: "REMOVED",
            auraClass: "DEBUFF",
            sourceActorId: ALLY,
            targetActorId: BOSS,
            abilityGameId: RUPTURE,
          }),
          auraEvent({
            ordinal: 1,
            reportTimeMs: 1400,
            operation: "REMOVED",
            auraClass: "DEBUFF",
            isStackChange: true,
            stacks: 1,
            sourceActorId: PLAYER,
            targetActorId: BOSS,
            abilityGameId: RUPTURE,
          }),
        ],
      }),
    );

    const union = state.auras.presenceAt({ ...ruptureOn(anySource()), at: afterEvent(1) });

    expect(union.certainty).toBe("EXACT");
    if (union.certainty !== "EXACT") return;
    // One source still holds it at one stack, which settles the union even
    // though another source's copy is gone.
    expect(union.value.presence).toBe("ACTIVE");
    expect(union.value.anchor.observedStacks).toBe(1);
  });

  it("does not make aggregate INACTIVE newly provable", () => {
    // Every anchored track resolves INACTIVE, and the union STILL cannot say the
    // aura is absent: a source with a pre-pull application leaves no track at
    // all. Adding a new ACTIVE anchor did not change that one-way shape.
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          auraEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            operation: "REMOVED",
            auraClass: "DEBUFF",
            sourceActorId: PLAYER,
            targetActorId: BOSS,
            abilityGameId: RUPTURE,
          }),
          auraEvent({
            ordinal: 1,
            reportTimeMs: 1400,
            operation: "REMOVED",
            auraClass: "DEBUFF",
            sourceActorId: ALLY,
            targetActorId: BOSS,
            abilityGameId: RUPTURE,
          }),
        ],
      }),
    );

    const union = state.auras.presenceAt({ ...ruptureOn(anySource()), at: afterEvent(1) });

    expect(union.certainty).toBe("UNKNOWN");
    if (union.certainty !== "UNKNOWN") return;
    expect(union.reason).toBe("AMBIGUOUS_INITIAL_STATE");
  });
});

describe("a stack removal reporting zero proves nothing", () => {
  /**
   * No capture contains a stack removal reading 0 — full removal arrives through
   * the ordinary `removebuff` / `removedebuff` family instead. So "the stack
   * removal that ends the aura" has no established form, and a synthetic or
   * future zero must fail closed rather than invent one.
   */
  function fightEndingInZeroStacks(stacks: number | null) {
    return createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          auraEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            operation: "APPLIED",
            auraClass: "BUFF",
            sourceActorId: PLAYER,
            targetActorId: PLAYER,
            abilityGameId: SLICE_AND_DICE,
          }),
          auraEvent({
            ordinal: 1,
            reportTimeMs: 1400,
            operation: "REMOVED",
            auraClass: "BUFF",
            isStackChange: true,
            stacks,
            sourceActorId: PLAYER,
            targetActorId: PLAYER,
            abilityGameId: SLICE_AND_DICE,
          }),
        ],
      }),
    );
  }

  it("does not establish INACTIVE from a zero resulting count", () => {
    const result = fightEndingInZeroStacks(0).auras.presenceAt({
      target: ON_PLAYER,
      abilityGameId: SLICE_AND_DICE,
      auraClass: "BUFF",
      source: fromSource(BY_PLAYER),
      at: afterEvent(1),
    });

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("UNSUPPORTED_DERIVATION");
    // Not INACTIVE, and not ACTIVE either. Reading zero as "the aura ended"
    // would be a new evidence contract nothing has established.
    expect(JSON.stringify(result)).not.toContain("INACTIVE");
  });

  it("fails closed on a missing stack count too", () => {
    // M3 rejects a stack event with no `stack` as a malformed family event, so
    // this shape cannot arrive from a real capture. The guard is still explicit
    // rather than relying on that.
    const result = fightEndingInZeroStacks(null).auras.presenceAt({
      target: ON_PLAYER,
      abilityGameId: SLICE_AND_DICE,
      auraClass: "BUFF",
      source: fromSource(BY_PLAYER),
      at: afterEvent(1),
    });

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("UNSUPPORTED_DERIVATION");
  });

  it("still reports the zero observation verbatim", () => {
    const result = fightEndingInZeroStacks(0).auras.lastObservedTransition({
      target: ON_PLAYER,
      abilityGameId: SLICE_AND_DICE,
      auraClass: "BUFF",
      source: anySource(),
      at: afterEvent(1),
    });

    // Declining to derive presence from it does not un-observe it.
    if (result.certainty !== "EXACT" || result.value === null) return;
    expect(result.value.observedStacks).toBe(0);
  });
});

// --------------------------------------------------------------------------
// Temporal semantics
// --------------------------------------------------------------------------

describe("same-timestamp transitions resolve by canonical position", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["AURAS"],
      events: [
        auraEvent({
          ordinal: 0,
          reportTimeMs: 2000,
          operation: "REMOVED",
          auraClass: "DEBUFF",
          sourceActorId: PLAYER,
          targetActorId: BOSS,
          abilityGameId: RUPTURE,
        }),
        auraEvent({
          ordinal: 1,
          reportTimeMs: 2000,
          operation: "APPLIED",
          auraClass: "DEBUFF",
          sourceActorId: PLAYER,
          targetActorId: BOSS,
          abilityGameId: RUPTURE,
        }),
      ],
    }),
  );

  it("distinguishes the two orderings a timestamp cannot", () => {
    const afterRemoval = state.auras.presenceAt(ruptureOnBoss(0));
    const afterApply = state.auras.presenceAt(ruptureOnBoss(1));

    if (afterRemoval.certainty !== "EXACT" || afterApply.certainty !== "EXACT") return;
    // A refresh-by-reapplication lands both events in one millisecond. Collapsing
    // the question into "start of this millisecond" would lose the answer.
    expect(afterRemoval.value.presence).toBe("INACTIVE");
    expect(afterApply.value.presence).toBe("ACTIVE");
  });

  it("takes the last event of the millisecond for END_OF_TIMESTAMP", () => {
    const result = state.auras.presenceAt({
      target: ON_BOSS,
      abilityGameId: RUPTURE,
      auraClass: "DEBUFF",
      source: anySource(),
      at: endOfTimestamp(2000),
    });

    if (result.certainty !== "EXACT") return;
    expect(result.value.presence).toBe("ACTIVE");
    expect(result.value.anchor.position).toBe(1);
  });

  it("has nothing to anchor on at the start of that millisecond", () => {
    const result = state.auras.presenceAt({
      target: ON_BOSS,
      abilityGameId: RUPTURE,
      auraClass: "DEBUFF",
      source: anySource(),
      at: startOfTimestamp(2000),
    });

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("AMBIGUOUS_INITIAL_STATE");
  });

  it("excludes the anchor event itself for BEFORE_EVENT", () => {
    const result = state.auras.presenceAt({
      target: ON_BOSS,
      abilityGameId: RUPTURE,
      auraClass: "DEBUFF",
      source: anySource(),
      at: beforeEvent(1),
    });

    if (result.certainty !== "EXACT") return;
    expect(result.value.anchor.position).toBe(0);
    expect(result.value.presence).toBe("INACTIVE");
  });
});

describe("aura queries fail closed on disordered time", () => {
  const events = [
    auraEvent({
      ordinal: 0,
      reportTimeMs: 4000,
      operation: "APPLIED",
      auraClass: "DEBUFF",
      sourceActorId: PLAYER,
      targetActorId: BOSS,
      abilityGameId: RUPTURE,
    }),
    damageEvent({ ordinal: 1, reportTimeMs: 1200, sourceActorId: PLAYER, targetActorId: BOSS }),
  ];
  const state = createCombatState(syntheticFight({ observedCategories: ["AURAS"], events }));

  it("refuses a timestamp-addressed query", () => {
    const result = state.auras.presenceAt({
      target: ON_BOSS,
      abilityGameId: RUPTURE,
      auraClass: "DEBUFF",
      source: anySource(),
      at: endOfTimestamp(3000),
    });

    expect(state.temporalIntegrity.state).toBe("NON_MONOTONIC");
    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("NON_MONOTONIC_TIME");
  });

  it("refuses a carried-forward claim even from an event anchor", () => {
    const result = state.auras.presenceAt(ruptureOnBoss(1));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // The interval was derived from canonical POSITIONS. Reading it as a time
    // interval to check coverage is only valid when the orders agree.
    expect(result.reason).toBe("NON_MONOTONIC_TIME");
  });

  it("still reports the transition it actually observed", () => {
    const result = state.auras.presenceAt(ruptureOnBoss(0));

    // Disordered time does not un-observe an event; it disqualifies reasoning
    // that depends on the ordering.
    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.presence).toBe("ACTIVE");
  });

  it("refuses an unresolvable position", () => {
    const result = state.auras.presenceAt(ruptureOnBoss(99));

    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("UNSUPPORTED_DERIVATION");
  });
});

// --------------------------------------------------------------------------
// Real normalized input
// --------------------------------------------------------------------------

describe("aura indexes over a committed capture", () => {
  const CAPTURE_START = 7_381_097;
  const CAPTURE_END = 7_383_000;

  const normalizer = createNormalizer({
    fightStartTimeMs: CAPTURE_START,
    requestedRange: inclusiveRange(CAPTURE_START, CAPTURE_END),
    contracts: indexContracts(SUPPORTED_TYPE_CONTRACTS),
    directionFields: VERIFIED_DIRECTION_FIELDS,
  });
  normalizer.accept({
    streamId: "all",
    pageOrdinal: 0,
    requestedStartTimeMs: CAPTURE_START,
    nextPageTimestamp: null,
    events: pullWindowFixture as Record<string, unknown>[],
  });
  const normalized = normalizer.finish();
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["AURAS"],
      events: normalized.events,
      startTimeMs: CAPTURE_START,
      endTimeMs: CAPTURE_END,
    }),
  );

  it("has real captured aura evidence to index", () => {
    expect(state.positionsOfKind("AURA").length).toBeGreaterThan(0);
    expect(state.auras.indexes.groups.size).toBeGreaterThan(0);
  });

  it("indexes every identifiable aura observation exactly once", () => {
    const tracked = [...state.auras.indexes.groups.values()].reduce(
      (total, group) => total + group.allPositions.length,
      0,
    );
    const unidentified = [...state.auras.indexes.unidentifiedPositionsByTarget.values()].reduce(
      (total, positions) => total + positions.length,
      0,
    );

    expect(tracked + unidentified + state.auras.indexes.targetlessObservationCount).toBe(
      state.positionsOfKind("AURA").length,
    );
  });

  it("partitions every group's transitions across its source tracks", () => {
    for (const group of state.auras.indexes.groups.values()) {
      const fromTracks = group.tracks.flatMap((track) => track.positions).sort((a, b) => a - b);

      // Exactly a partition: every transition in one track, none in two, none
      // lost. That is what makes each source's history independently searchable.
      expect(fromTracks).toEqual([...group.allPositions]);
      expect(new Set(fromTracks).size).toBe(fromTracks.length);
    }
  });

  it("agrees with a direct scan of the fight for each source track", () => {
    let checked = 0;
    for (const group of state.auras.indexes.groups.values()) {
      for (const track of group.tracks) {
        const expected = state.fight.events
          .map((event, position) => ({ event, position }))
          .filter(
            (entry) =>
              entry.event.kind === "AURA" &&
              entry.event.target?.actorId === track.target.actorId &&
              entry.event.target?.instanceId === track.target.instanceId &&
              entry.event.abilityGameId === track.abilityGameId &&
              entry.event.auraClass === track.auraClass &&
              entry.event.source?.actorId === track.source?.actorId &&
              entry.event.source?.instanceId === track.source?.instanceId,
          )
          .map((entry) => entry.position);

        expect(track.positions).toEqual(expected);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("preserves the captured stack value without interpreting it", () => {
    // The capture contains a `removebuffstack` with `stack: 59`.
    const stacked = state.fight.events.find(
      (event) => event.kind === "AURA" && event.isStackChange && event.stacks !== null,
    );
    if (stacked?.kind !== "AURA" || stacked.target === null || stacked.abilityGameId === null) return;

    const result = state.auras.latestStackObservation({
      target: stacked.target,
      abilityGameId: stacked.abilityGameId,
      auraClass: stacked.auraClass,
      source: anySource(),
      at: endOfTimestamp(CAPTURE_END),
    });

    if (result.certainty !== "EXACT") return;
    expect(result.value.observedStacks).toBe(stacked.stacks);
  });
});

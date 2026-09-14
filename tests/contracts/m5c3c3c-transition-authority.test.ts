/**
 * Every transition claim C3c3c rests on, checked rather than trusted.
 *
 * THE SHAPE OF THE ARGUMENT
 *
 * The first-GCD query lets a NON_GCD action fire and asks the authority again.
 * That is sound only if, for every action it lets fire:
 *
 *     the lane says it is a STEP and not the answer
 *     it cannot fire again immediately, so the search is finite
 *     it advances no simulated time
 *     every state it writes is NAMED, and none of the named ones is read on the
 *       path to the answer
 *
 * The last is the one that can be got wrong silently. `writes: []` is the most
 * dangerous thing a contract can say, because it is what licenses "this action
 * does not matter" — so no contract here is allowed an empty write set, and each
 * one's writes are checked against the projection the real decision reads.
 *
 * WHAT IS NOT CLAIMED
 *
 * That any of these actions fired. These are counterfactuals about the pinned
 * authority, and the milestone keeps them structurally separate from anything
 * observed.
 */

import { describe, expect, it } from "vitest";

import {
  ASSASSINATION_NON_GCD_TRANSITIONS,
  CLAIM_METHODS,
  CPP_SEMANTICS_METHOD,
  CPP_TIMING_METHOD,
  DBC_FACT_METHOD,
  GCD_RELEVANT_PROJECTION,
  PINNED_COMMIT_SHA,
  PROJECTION_RELEVANT_WRITES,
  TRANSITION_SOURCE_HASHES,
  TRANSITION_WRITES,
  transitionAbilityIdsFor,
  transitionContractFor,
} from "../../src/data/game/assassination-transition-authority.js";
import { executionLaneForToken } from "../../src/data/game/ability-gcd-semantics.js";
import {
  MAX_THISTLE_TEA_EXECUTIONS,
  RACE_WORLDS,
  RACIAL_TOKENS,
  RACIAL_TOKEN_BY_WORLD,
} from "../../src/specs/rogue/assassination/first-gcd-state.js";

const SIMC_COMMIT = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";
const SUPPORTED_TOKENS = [
  "kick",
  "thistle_tea",
  "potion",
  "blood_fury",
  "berserking",
  "fireblood",
  "ancestral_call",
] as const;

function contractOrThrow(simcToken: string) {
  const contract = transitionContractFor(simcToken);
  if (contract === null) throw new Error(`no transition contract for ${simcToken}`);
  return contract;
}

describe("the contracts cover exactly the reachable NON_GCD actions", () => {
  it("names the seven this milestone reviewed", () => {
    expect(ASSASSINATION_NON_GCD_TRANSITIONS.map((entry) => entry.simcToken).sort()).toEqual(
      [...SUPPORTED_TOKENS].sort(),
    );
  });

  it("refuses a token nobody reviewed", () => {
    // Fails CLOSED. An unreviewed NON_GCD action makes the branch UNKNOWN rather
    // than being skipped as though it did nothing.
    expect(transitionContractFor("shadowstep")).toBeNull();
    expect(transitionContractFor("")).toBeNull();
  });

  it("agrees with the pinned lane data that every one is NON_GCD", () => {
    // Two independent sources. If the contract said NON_GCD and the artifact
    // said otherwise, the query would be executing the answer.
    for (const token of SUPPORTED_TOKENS) {
      expect(contractOrThrow(token).baseGcdMs, token).toBe(0);
      expect(executionLaneForToken(token), token).toBe("NON_GCD");
    }
  });
});

describe("every transition advances zero simulated time", () => {
  it("pins timeAdvanceMs at zero for all seven", () => {
    // The engine refuses anything else. This asserts the contracts never ask.
    for (const token of SUPPORTED_TOKENS) {
      expect(contractOrThrow(token).timeAdvanceMs, token).toBe(0);
    }
  });
});

describe("every transition proves progress, by a named mechanism", () => {
  it("gives each one a finite, tolerance-clearing mechanism", () => {
    for (const token of SUPPORTED_TOKENS) {
      const progress = contractOrThrow(token).progress;
      if (progress.kind === "COOLDOWN") {
        // Far beyond the 250 ms queueing tolerance, so one execution settles it.
        expect(progress.baseCooldownMs, token).toBeGreaterThan(10_000);
        continue;
      }
      expect(progress.maxCharges, token).toBeGreaterThan(0);
      expect(progress.chargeCooldownMs, token).toBeGreaterThan(0);
    }
  });

  it("bounds Thistle Tea by CHARGES rather than by a cooldown", () => {
    // The one action where a single execution is not enough. Three charges means
    // three executions, and modelling it as self-disabling would explore fewer
    // worlds than really exist.
    const progress = contractOrThrow("thistle_tea").progress;
    expect(progress.kind).toBe("CHARGES");
    if (progress.kind !== "CHARGES") return;
    expect(progress.maxCharges).toBe(3);
    expect(progress.maxCharges).toBe(MAX_THISTLE_TEA_EXECUTIONS);
    // 60 s to recover one, and no simulated time passes. So three is a ceiling.
    expect(progress.chargeCooldownMs).toBe(60_000);
  });

  it("records WHY both Tea talent branches reach the 3-charge record", () => {
    // The fact that turns an unbounded action into a bounded one. Without it the
    // auto-talent branch would bind to a record with no charges and no cooldown.
    const claim = contractOrThrow("thistle_tea").claims.find(
      (entry) => entry.claim === "BOTH_TALENT_BRANCHES_REACH_THE_SAME_RECORD",
    );
    expect(claim?.finding).toContain("_trigger_spell_id");
    expect(claim?.finding).toContain("3 charges");
  });
});

describe("no contract claims an empty write set", () => {
  it("names at least one write for every action", () => {
    // An empty set would be the strongest possible claim and the easiest to make
    // carelessly. Every action at minimum writes its own availability.
    for (const token of SUPPORTED_TOKENS) {
      const writes = contractOrThrow(token).writes;
      expect(writes.length, token).toBeGreaterThan(0);
      expect(writes, token).toContain("OWN_PREFIX_AVAILABILITY");
    }
  });

  it("uses only writes from the closed vocabulary", () => {
    for (const token of SUPPORTED_TOKENS) {
      for (const write of contractOrThrow(token).writes) {
        expect(TRANSITION_WRITES as readonly string[], `${token} writes ${write}`).toContain(write);
      }
    }
  });

  it("lists the writes each action actually makes", () => {
    // Spelled out per action, so a future change to one shows up as a diff here
    // rather than as a silently different answer.
    expect([...contractOrThrow("kick").writes].sort()).toEqual([
      "DELAYED_STEALTH_EXPIRY",
      "OWN_PREFIX_AVAILABILITY",
      "TARGET_CAST_INTERRUPT",
    ]);
    expect([...contractOrThrow("thistle_tea").writes].sort()).toEqual([
      "OWN_PREFIX_AVAILABILITY",
      "PLAYER_ENERGY",
      "PLAYER_STAT_BUFF",
    ]);
    expect([...contractOrThrow("potion").writes].sort()).toEqual([
      "OWN_PREFIX_AVAILABILITY",
      "PLAYER_STAT_BUFF",
    ]);
    expect([...contractOrThrow("fireblood").writes].sort()).toEqual([
      "OWN_PREFIX_AVAILABILITY",
      "PLAYER_DEBUFF_REMOVAL",
      "PLAYER_STAT_BUFF",
    ]);
    for (const token of ["blood_fury", "berserking", "ancestral_call"]) {
      expect([...contractOrThrow(token).writes].sort(), token).toEqual([
        "OWN_PREFIX_AVAILABILITY",
        "PLAYER_STAT_BUFF",
      ]);
    }
  });

  it("keeps PLAYER_STAT_BUFF out of the load-bearing projection", () => {
    // THE claim that makes six of the seven noninterfering, and it is not "stats
    // do not matter". A stat change moves haste, regeneration and future
    // snapshots — all quantities over ELAPSED TIME, and every transition here
    // advances none.
    expect(PROJECTION_RELEVANT_WRITES as readonly string[]).not.toContain("PLAYER_STAT_BUFF");
    expect(PROJECTION_RELEVANT_WRITES as readonly string[]).not.toContain("PLAYER_DEBUFF_REMOVAL");
    expect(PROJECTION_RELEVANT_WRITES as readonly string[]).not.toContain("TARGET_CAST_INTERRUPT");
  });

  it("keeps the projection itself free of any stat atom", () => {
    // The other side of the same claim: nothing the real decision reads is a
    // stat. Checked against the projection rather than asserted in prose.
    for (const atom of GCD_RELEVANT_PROJECTION) {
      expect(atom).not.toMatch(/haste|crit|mastery|versatility|agility|stat/i);
    }
  });
});

describe("resource stability: Garrote stays affordable after any prefix", () => {
  it("proves no supported transition spends a resource", () => {
    // Garrote costs 45 Energy and the decision point starts at 250/250. If any
    // prefix action spent Energy, that would have to be subtracted here rather
    // than waved past.
    for (const token of SUPPORTED_TOKENS) {
      expect(contractOrThrow(token).energySpent, token).toBe(0);
    }
  });

  it("has Thistle Tea grant Energy rather than spend it", () => {
    expect(contractOrThrow("thistle_tea").energyGranted).toBe(100);
    expect(contractOrThrow("thistle_tea").energySpent).toBe(0);
  });

  it("leaves every other action Energy-neutral", () => {
    for (const token of SUPPORTED_TOKENS) {
      if (token === "thistle_tea") continue;
      expect(contractOrThrow(token).energyGranted, token).toBe(0);
    }
  });

  it("means the minimum possible post-prefix Energy is the starting Energy", () => {
    // Arithmetic rather than prose. Every spend is zero and every grant is
    // non-negative, so Energy after any prefix is at least what it started at.
    const worstCaseDelta = SUPPORTED_TOKENS.reduce((total, token) => {
      const contract = contractOrThrow(token);
      return total - contract.energySpent;
    }, 0);
    expect(worstCaseDelta).toBe(0);
  });
});

describe("stealth stability across the prefix", () => {
  it("has exactly one action that reaches the stealth-break path", () => {
    const breaking = SUPPORTED_TOKENS.filter((token) => contractOrThrow(token).breaksStealthImmediately);
    expect(breaking).toEqual(["kick"]);
  });

  it("establishes the racials from the CALL GRAPH, not the DBC flag", () => {
    // Berserking's SX_NO_STEALTH_BREAK bit is CLEAR, and it still cannot break
    // stealth — because break_stealth() is reachable only from
    // rogue_action_t::execute and a racial_spell_t is not one. Relying on the
    // flag would have got this wrong.
    for (const token of RACIAL_TOKENS) {
      const claim = contractOrThrow(token).claims.find(
        (entry) => entry.claim === "IT_CANNOT_REACH_THE_ROGUE_STEALTH_BREAK_PATH",
      );
      expect(claim?.finding, token).toContain("racial_spell_t");
      expect(claim?.finding, token).toContain("CALL GRAPH");
    }
  });

  it("proves the potion the same way", () => {
    const claim = contractOrThrow("potion").claims.find(
      (entry) => entry.claim === "IT_CANNOT_REACH_THE_ROGUE_STEALTH_BREAK_PATH",
    );
    expect(claim?.finding).toContain("not a rogue_action_t");
  });

  it("proves Thistle Tea from its DBC flag, which IS set", () => {
    const claim = contractOrThrow("thistle_tea").claims.find(
      (entry) => entry.claim === "IT_DOES_NOT_BREAK_STEALTH",
    );
    expect(claim?.finding).toContain("SX_NO_STEALTH_BREAK");
    expect(contractOrThrow("thistle_tea").breaksStealthImmediately).toBe(false);
  });
});

describe("the Kick timing proof, which is the most delicate claim here", () => {
  const kick = () => contractOrThrow("kick");

  it("admits that Kick DOES break stealth", () => {
    // Not hidden. The proof is about ORDERING, not about the break not happening.
    expect(kick().breaksStealthImmediately).toBe(true);
    expect(kick().writes).toContain("DELAYED_STEALTH_EXPIRY");
  });

  it("pins the 1 ms expiry delay", () => {
    const claim = kick().claims.find(
      (entry) => entry.claim === "STEALTH_AND_VANISH_EXPIRE_ONE_MILLISECOND_LATER",
    );
    expect(claim?.method).toBe(CPP_TIMING_METHOD);
    expect(claim?.finding).toContain("expire( 1_ms )");
    expect(claim?.sourcePath).toBe("engine/class_modules/sc_rogue.cpp");
  });

  it("pins the zero-delay rescan, from both halves of it", () => {
    const claims = new Map(kick().claims.map((entry) => [entry.claim, entry]));
    const scheduled = claims.get("THE_REPLACEMENT_SCAN_HAPPENS_AT_ZERO_DELAY");
    expect(scheduled?.finding).toContain("schedule_ready( timespan_t::zero() )");
    expect(scheduled?.sourcePath).toBe("engine/action/action.cpp");

    const noLag = claims.get("A_ZERO_GCD_ACTION_ADDS_NO_LAG_TO_THAT_SCAN");
    expect(noLag?.finding).toContain("lag = 0_ms");
    expect(noLag?.sourcePath).toBe("engine/player/player.cpp");
  });

  it("states the conclusion AND its scope", () => {
    // 0 ms < 1 ms, so the scan that follows a Kick still sees stealth. The claim
    // is explicitly scoped to zero-elapsed-time queries: generalising it to a
    // query where time passes would be false.
    const claim = kick().claims.find((entry) => entry.claim === "SO_THE_NEXT_SCAN_PRECEDES_THE_EXPIRY");
    expect(claim?.finding).toContain("t+0");
    expect(claim?.finding).toContain("t+1ms");
    expect(claim?.finding).toContain("must not be generalised");
  });

  it("costs no resource, looked up rather than assumed", () => {
    expect(kick().energySpent).toBe(0);
    expect(kick().energyGranted).toBe(0);
  });

  it("self-disables on a 15 s cooldown", () => {
    const progress = kick().progress;
    expect(progress.kind).toBe("COOLDOWN");
    if (progress.kind !== "COOLDOWN") return;
    expect(progress.baseCooldownMs).toBe(15_000);
  });

  it("interrupts a target cast, and nothing on the path reads that", () => {
    // Modelled as a WRITE rather than dropped, and then shown irrelevant because
    // no supported atom on the path to Garrote reads target cast state.
    expect(kick().writes).toContain("TARGET_CAST_INTERRUPT");
    expect(PROJECTION_RELEVANT_WRITES as readonly string[]).not.toContain("TARGET_CAST_INTERRUPT");
    for (const atom of GCD_RELEVANT_PROJECTION) {
      expect(atom).not.toMatch(/cast|interrupt/i);
    }
  });
});

describe("Fireblood is not summarised as a stat buff", () => {
  it("records its dispel as a write", () => {
    expect(contractOrThrow("fireblood").writes).toContain("PLAYER_DEBUFF_REMOVAL");
  });

  it("proves the dispel acts on the PLAYER, and Deathmark is on the TARGET", () => {
    // The terminology trap. `debuff.deathmark.up` in this APL is an aura actor 19
    // applied to the enemy; no dispel on the player can touch it.
    const claim = contractOrThrow("fireblood").claims.find(
      (entry) => entry.claim === "ITS_DISPEL_ACTS_ON_THE_PLAYER_NOT_THE_TARGET",
    );
    expect(claim?.finding).toContain("FROM THE PLAYER");
    expect(claim?.finding).toContain("ENEMY");
    expect(claim?.finding).toContain("No other atom on the supported path reads a player debuff");
  });

  it("gives the other three racials no dispel", () => {
    for (const token of ["blood_fury", "berserking", "ancestral_call"]) {
      expect(contractOrThrow(token).writes, token).not.toContain("PLAYER_DEBUFF_REMOVAL");
    }
  });
});

describe("potion identity is not required, and is not claimed", () => {
  it("binds to no spell id at all", () => {
    expect(transitionAbilityIdsFor("potion")).toEqual([]);
  });

  it("reads every claim off the shared consumable base class", () => {
    // The pinned default potion is chosen by player level, and Warcraft Logs
    // supplies no level. A base-class reading holds for every identity, which is
    // what makes the missing level irrelevant rather than merely inconvenient.
    const lane = contractOrThrow("potion").claims.find((entry) => entry.claim === "EVERY_POTION_IS_NON_GCD");
    expect(lane?.sourcePath).toBe("engine/player/consumable.cpp");
    expect(lane?.finding).toContain("dbc_consumable_base_t");
    expect(lane?.finding).toContain("every potion identity");
  });

  it("proves it self-disables by a mechanism every potion shares", () => {
    const claim = contractOrThrow("potion").claims.find(
      (entry) => entry.claim === "IT_STARTS_A_SHARED_NAMED_COOLDOWN",
    );
    expect(claim?.finding).toContain('get_cooldown( "potion" )');
    expect(claim?.finding).toContain("THROWING if no");
  });
});

describe("identity numbers are derived, never transcribed", () => {
  it("resolves every spell-backed token through the pinned binding", () => {
    expect(transitionAbilityIdsFor("kick")).toEqual([1766]);
    // CORRECTED AT M5-E: 469779 is a talent record that triggers 381623 and is
    // never itself executed, so the transition contract now addresses exactly
    // the spell that can fire.
    expect(transitionAbilityIdsFor("thistle_tea")).toEqual([381_623]);
    expect(transitionAbilityIdsFor("blood_fury")).toEqual([20_572, 33_697, 33_702]);
    expect(transitionAbilityIdsFor("berserking")).toEqual([26_297]);
  });

  it("returns nothing for a token the artifact does not bind", () => {
    expect(transitionAbilityIdsFor("not_a_token")).toEqual([]);
  });
});

describe("provenance drift breaks this contract rather than an answer", () => {
  it("pins one commit", () => {
    expect(PINNED_COMMIT_SHA).toBe(SIMC_COMMIT);
  });

  it("carries a measured hash for every file a reading cites", () => {
    for (const contract of ASSASSINATION_NON_GCD_TRANSITIONS) {
      for (const claim of contract.claims) {
        expect(
          Object.keys(TRANSITION_SOURCE_HASHES),
          `${contract.simcToken}: ${claim.claim} cites ${claim.sourcePath}`,
        ).toContain(claim.sourcePath);
        expect(TRANSITION_SOURCE_HASHES[claim.sourcePath]).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  it("uses the same Rogue-module hash every other milestone pins", () => {
    // Cross-checked so the artifacts cannot drift apart silently.
    expect(TRANSITION_SOURCE_HASHES["engine/class_modules/sc_rogue.cpp"]).toBe(
      "209e95265aae4168cf7cda57d1b241dda6361971ba6849a9262bd933bff3e13e",
    );
    expect(TRANSITION_SOURCE_HASHES["engine/player/player.cpp"]).toBe(
      "50a804d0f63d7bffd7b9eeb89a6de054b1767c3202133c765b1b893987940a5c",
    );
  });

  it("labels every claim with one of the three grades", () => {
    for (const contract of ASSASSINATION_NON_GCD_TRANSITIONS) {
      for (const claim of contract.claims) {
        expect(CLAIM_METHODS as readonly string[], `${contract.simcToken}: ${claim.claim}`).toContain(
          claim.method,
        );
      }
    }
  });

  it("keeps the DBC grade for DBC facts and the C++ grades for readings", () => {
    // A C++ reading labelled as machine extraction would present a human's
    // judgement as a parser's output.
    const kickTiming = contractOrThrow("kick").claims.filter((entry) => entry.method === CPP_TIMING_METHOD);
    expect(kickTiming.length).toBeGreaterThanOrEqual(3);
    for (const claim of kickTiming) {
      expect(claim.method).not.toBe(DBC_FACT_METHOD);
      expect(claim.startLine).toBeGreaterThan(0);
      expect(claim.endLine).toBeGreaterThanOrEqual(claim.startLine);
    }

    const dbcClaims = ASSASSINATION_NON_GCD_TRANSITIONS.flatMap((contract) =>
      contract.claims.filter((entry) => entry.method === DBC_FACT_METHOD),
    );
    expect(dbcClaims.length).toBeGreaterThan(0);
    for (const claim of dbcClaims) {
      // A generated TABLE, not a source line.
      expect(claim.sourcePath).toContain("generated/");
      expect(claim.method).not.toBe(CPP_SEMANTICS_METHOD);
    }
  });
});

describe("race is one unknown with five settings, not four booleans", () => {
  it("enumerates five correlated worlds", () => {
    expect([...RACE_WORLDS]).toEqual(["ORC", "TROLL", "DARK_IRON_DWARF", "MAGHAR_ORC", "OTHER"]);
  });

  it("gives each world at most ONE applicable racial", () => {
    // THE chimera this prevents: four independent unknowns would admit a player
    // who is simultaneously an Orc, a Troll, a Dark Iron Dwarf and a Mag'har Orc
    // and can fire four racials in one prefix.
    for (const world of RACE_WORLDS) {
      const token = RACIAL_TOKEN_BY_WORLD[world];
      const applicable = RACIAL_TOKENS.filter((candidate) => candidate === token);
      expect(applicable.length, world).toBeLessThanOrEqual(1);
    }
  });

  it("gives the OTHER world none of them", () => {
    expect(RACIAL_TOKEN_BY_WORLD.OTHER).toBeNull();
  });

  it("maps each racial to exactly one world", () => {
    for (const token of RACIAL_TOKENS) {
      const worlds = RACE_WORLDS.filter((world) => RACIAL_TOKEN_BY_WORLD[world] === token);
      expect(worlds.length, token).toBe(1);
    }
  });
});

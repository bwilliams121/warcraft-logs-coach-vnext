import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { createNormalizer } from "../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  resurrectionContractFor,
  SUPPORTED_TYPE_CONTRACTS,
  type SupportedTypeContract,
} from "../../src/engine/normalization/supported-families.js";
import { deathEventRetrieval, deathStateAt, observedDeathsOf } from "../../src/engine/state/death-state.js";
import { EVIDENCE_CAPABILITY_REGISTRY } from "../../src/wcl/evidence-capability.js";
import { loadCommittedEvidenceArchive } from "../support/corpus/evidence-archive.js";
import { bundleOf } from "../support/corpus/fight.js";
import { observableCategory, syntheticFight, UNVERIFIED_CATEGORY } from "../support/synthetic-fight.js";

/**
 * M11-F: POSITIVE-ONLY death facts. Every raw shape below is copied from the
 * M11-E2 capture audit (report b1PmaKrd6CDfzngc fight 48); the E2 cases read
 * the committed archive fixture itself.
 */

type Raw = Record<string, unknown>;
const START = 1_000;
const END = 100_000;

function fightOf(
  raw: readonly Raw[],
  extra: readonly SupportedTypeContract[] = [],
  deathsCovered = false,
): CombatFight {
  const normalizer = createNormalizer({
    fightStartTimeMs: START,
    requestedRange: inclusiveRange(START, END),
    contracts: indexContracts([...SUPPORTED_TYPE_CONTRACTS, ...extra]),
    directionFields: VERIFIED_DIRECTION_FIELDS,
  });
  normalizer.accept({
    streamId: "all",
    pageOrdinal: 0,
    requestedStartTimeMs: START,
    nextPageTimestamp: null,
    events: raw,
  });
  const output = normalizer.finish();
  return syntheticFight({
    events: output.events,
    malformedObservations: output.malformedObservations,
    startTimeMs: START,
    endTimeMs: END,
    categories: {
      DEATHS: deathsCovered ? observableCategory(inclusiveRange(START, END), null) : UNVERIFIED_CATEGORY,
    },
  });
}

/** The audited NPC death shape (180#3 in E2): source -1, ability 0, no killer. */
const npcDeath = (timestamp: number, instance: number): Raw => ({
  timestamp,
  type: "death",
  sourceID: -1,
  targetID: 180,
  targetInstance: instance,
  abilityGameID: 0,
  fight: 48,
});
/** Damage the dead NPC SOURCES after its death (E2: 162 such events from 180#3). */
const sourcedByDead = (timestamp: number, instance: number): Raw => ({
  timestamp,
  type: "damage",
  sourceID: 180,
  sourceInstance: instance,
  targetID: 5,
  abilityGameID: 1285979,
  fight: 48,
  hitType: 1,
  amount: 12000,
});
/** Damage the NPC RECEIVES, with its own TARGET-side health snapshot. */
const hitWithSnapshot = (timestamp: number, instance: number, hitPoints: number): Raw => ({
  timestamp,
  type: "damage",
  sourceID: 15,
  targetID: 180,
  targetInstance: instance,
  abilityGameID: 49998,
  fight: 48,
  hitType: 1,
  amount: 5000,
  resourceActor: 2,
  classResources: [],
  hitPoints,
  maxHitPoints: 8_000_000,
});
const auraOn = (timestamp: number, instance: number, type: string): Raw => ({
  timestamp,
  type,
  sourceID: 15,
  targetID: 180,
  targetInstance: instance,
  abilityGameID: 55078,
  fight: 48,
});
/** The audited player death and resurrection (actor 5 in E2). */
const playerDeath: Raw = {
  timestamp: 7_749,
  type: "death",
  sourceID: -1,
  targetID: 5,
  abilityGameID: 0,
  fight: 48,
  killerID: 161,
  killingAbilityGameID: 1295173,
};
const playerResurrect: Raw = {
  timestamp: 7_753,
  type: "resurrect",
  sourceID: 19,
  targetID: 5,
  abilityGameID: 61999,
  fight: 48,
};
const playerHit = (timestamp: number): Raw => ({
  timestamp,
  type: "damage",
  sourceID: 161,
  targetID: 5,
  abilityGameID: 1295173,
  fight: 48,
  hitType: 1,
  amount: 40_000,
  resourceActor: 2,
  classResources: [],
  hitPoints: 611_499,
  maxHitPoints: 1_300_000,
});
const TEST_ONLY_RESURRECT = resurrectionContractFor({
  kind: "SANITIZED_CAPTURE",
  fixtureId: "test-only",
  capturedOn: "2026-10-06",
});

// ---------------------------------------------------------------------------

describe("the E2 archive fixture: positive death facts only", () => {
  let fight: CombatFight;
  beforeAll(async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error("archive does not load");
    const segments = ["0-45", "45-113", "113-151", "151-214", "214-263", "263-311", "311-345"].map(
      (name) => `wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-${name}`,
    );
    fight = bundleOf(loaded.archive, segments, [], {
      catalogArtifactId: "wcl-fight-context-b1pm-fight-48",
    }).fight;
  });

  it("A: boss 161 of a KILL has no death event -> NO_POSITIVE_DEATH_EVIDENCE, never alive or survived", () => {
    expect(fight.fight.kill).toBe(true);
    expect(observedDeathsOf(fight).observed.some((death) => death.actor.actorId === 161)).toBe(false);
    expect(deathStateAt(fight, { actorId: 161, instanceId: null }, 7_781_469)).toEqual({
      state: "NO_POSITIVE_DEATH_EVIDENCE",
    });
  });

  it("B: a death of 45#1 is DEAD_SINCE for 45#1 only; 45#2 is unaffected until its own death", () => {
    const deaths = observedDeathsOf(fight);
    expect(deaths.absenceSemantics).toBe("NONE");
    expect(
      deaths.observed.map((death) => [death.actor.actorId, death.actor.instanceId, death.reportTimeMs]),
    ).toEqual([
      [45, 1, 7_449_399],
      [45, 2, 7_559_744],
      [45, 3, 7_659_417],
      [45, 4, 7_750_936],
    ]);
    expect(deathStateAt(fight, { actorId: 45, instanceId: 1 }, 7_449_400)).toMatchObject({
      state: "DEAD_SINCE",
      death: { reportTimeMs: 7_449_399, killer: "NOT_SUPPLIED", killingAbilityGameId: "NOT_SUPPLIED" },
    });
    expect(deathStateAt(fight, { actorId: 45, instanceId: 2 }, 7_449_400)).toEqual({
      state: "NO_POSITIVE_DEATH_EVIDENCE",
    });
    expect(deathStateAt(fight, { actorId: 45, instanceId: 2 }, 7_559_745)).toMatchObject({
      state: "DEAD_SINCE",
      death: { reportTimeMs: 7_559_744 },
    });
    // `null` is not instance 1, and the owner's pets are not the owner.
    expect(deathStateAt(fight, { actorId: 45, instanceId: null }, 7_781_469).state).toBe(
      "NO_POSITIVE_DEATH_EVIDENCE",
    );
    expect(deathStateAt(fight, { actorId: 15, instanceId: null }, 7_781_469).state).toBe(
      "NO_POSITIVE_DEATH_EVIDENCE",
    );
    // Every one stays dead to the end of the fight: nothing after it is decisive.
    for (const instance of [1, 2, 3, 4]) {
      expect(deathStateAt(fight, { actorId: 45, instanceId: instance }, 7_781_469).state).toBe("DEAD_SINCE");
    }
  });

  it("a death at the query millisecond itself is ORDERING_AMBIGUOUS, not dead and not alive", () => {
    expect(deathStateAt(fight, { actorId: 45, instanceId: 1 }, 7_449_399)).toMatchObject({
      state: "ORDERING_AMBIGUOUS",
      reason: "DEATH_AT_QUERY_TIME",
    });
  });

  it("G: the composed fight has no death-retrieval coverage, and that changes no state", () => {
    expect(deathEventRetrieval(fight, 161, 7_436_292, 7_781_469)).toBe(
      "DEATH_EVENT_RETRIEVAL_NOT_ESTABLISHED",
    );
  });
});

describe("post-death evidence", () => {
  it("C: a dead NPC that keeps SOURCING delayed damage stays DEAD_SINCE", () => {
    const fight = fightOf([npcDeath(2_000, 3), sourcedByDead(2_300, 3), sourcedByDead(5_000, 3)]);
    expect(deathStateAt(fight, { actorId: 180, instanceId: 3 }, 6_000)).toMatchObject({
      state: "DEAD_SINCE",
      death: { reportTimeMs: 2_000 },
    });
  });

  it("D: a strictly later hit carrying the SAME key's positive health snapshot is EVIDENCE_CONTRADICTION", () => {
    const fight = fightOf([npcDeath(2_000, 3), hitWithSnapshot(3_000, 3, 120_000)]);
    expect(deathStateAt(fight, { actorId: 180, instanceId: 3 }, 2_999).state).toBe("DEAD_SINCE");
    expect(deathStateAt(fight, { actorId: 180, instanceId: 3 }, 3_000)).toMatchObject({
      state: "EVIDENCE_CONTRADICTION",
      rule: "TARGET_SIDE_POSITIVE_HEALTH_SNAPSHOT",
      contradiction: { reportTimeMs: 3_000, rawType: "damage" },
    });
  });

  it("D-: aura removals, aura applications, a zero-health snapshot and another instance's hit do not contradict", () => {
    const fight = fightOf([
      npcDeath(2_000, 3),
      auraOn(2_000, 3, "removedebuff"),
      auraOn(2_500, 3, "applydebuff"),
      auraOn(2_600, 3, "removedebuff"),
      hitWithSnapshot(2_700, 3, 0),
      hitWithSnapshot(2_800, 4, 90_000),
    ]);
    expect(deathStateAt(fight, { actorId: 180, instanceId: 3 }, 6_000).state).toBe("DEAD_SINCE");
    expect(deathStateAt(fight, { actorId: 180, instanceId: 4 }, 6_000).state).toBe(
      "NO_POSITIVE_DEATH_EVIDENCE",
    );
  });

  it("E: a decisive event in the death's own millisecond is ORDERING_AMBIGUOUS in either retrieval order", () => {
    for (const raw of [
      [npcDeath(2_000, 3), hitWithSnapshot(2_000, 3, 50_000)],
      [hitWithSnapshot(2_000, 3, 50_000), npcDeath(2_000, 3)],
    ]) {
      expect(deathStateAt(fightOf(raw), { actorId: 180, instanceId: 3 }, 6_000)).toMatchObject({
        state: "ORDERING_AMBIGUOUS",
        reason: "DECISIVE_EVENT_AT_DEATH_TIME",
      });
    }
  });

  it("F: a decoded resurrection is RESURRECTION_OBSERVED, never alive, and later life evidence does not override it", () => {
    const fight = fightOf([playerDeath, playerResurrect, playerHit(7_760)], [TEST_ONLY_RESURRECT]);
    expect(deathStateAt(fight, { actorId: 5, instanceId: null }, 7_750).state).toBe("DEAD_SINCE");
    expect(deathStateAt(fight, { actorId: 5, instanceId: null }, 7_800)).toMatchObject({
      state: "RESURRECTION_OBSERVED",
      death: {
        reportTimeMs: 7_749,
        killer: { actorId: 161, instanceId: null },
        killingAbilityGameId: 1295173,
      },
      resurrection: { reportTimeMs: 7_753, rawType: "resurrect" },
    });
  });

  it("F (production): `resurrect` is not a recognised type, so it is UNREVIEWED after a death, never ignored", () => {
    expect(SUPPORTED_TYPE_CONTRACTS.some((contract) => contract.rawType === "resurrect")).toBe(false);
    const fight = fightOf([playerDeath, playerResurrect, playerHit(7_760)]);
    expect(deathStateAt(fight, { actorId: 5, instanceId: null }, 7_800)).toMatchObject({
      state: "UNREVIEWED_EVENT_AFTER_DEATH",
      event: { rawType: "resurrect", reportTimeMs: 7_753 },
    });
  });

  it("G: COMPLETE death-event retrieval with no death event is still NO_POSITIVE_DEATH_EVIDENCE", () => {
    const fight = fightOf([sourcedByDead(2_000, 3)], [], true);
    expect(deathEventRetrieval(fight, 180, START, END)).toBe("DEATH_EVENTS_RETRIEVED_COMPLETE");
    expect(deathStateAt(fight, { actorId: 180, instanceId: 3 }, END)).toEqual({
      state: "NO_POSITIVE_DEATH_EVIDENCE",
    });
    expect(deathEventRetrieval(fightOf([], [], false), 180, START, END)).toBe(
      "DEATH_EVENT_RETRIEVAL_NOT_ESTABLISHED",
    );
  });

  it("no future evidence: a death or a contradiction after the query time cannot change the answer", () => {
    const fight = fightOf([npcDeath(2_000, 3), hitWithSnapshot(4_000, 3, 1)]);
    expect(deathStateAt(fight, { actorId: 180, instanceId: 3 }, 1_999).state).toBe(
      "NO_POSITIVE_DEATH_EVIDENCE",
    );
    expect(deathStateAt(fight, { actorId: 180, instanceId: 3 }, 3_999).state).toBe("DEAD_SINCE");
  });
});

describe("the death event contract", () => {
  it("decodes killer fields verbatim when supplied and NOT_SUPPLIED when absent", () => {
    const fight = fightOf([
      npcDeath(2_000, 3),
      { ...npcDeath(2_100, 4), killerID: 121, killerInstance: 2, killingAbilityGameID: 7268 },
    ]);
    expect(
      observedDeathsOf(fight).observed.map((death) => [death.killer, death.killingAbilityGameId]),
    ).toEqual([
      ["NOT_SUPPLIED", "NOT_SUPPLIED"],
      [{ actorId: 121, instanceId: 2 }, 7268],
    ]);
  });

  it("refuses a death without a dying actor, or a killer instance without a killer, as MALFORMED (DEATHS degraded)", () => {
    const { targetID: _dropped, ...noTarget } = npcDeath(2_000, 3);
    const fight = fightOf([noTarget, { ...npcDeath(2_100, 4), killerInstance: 2 }]);
    expect(fight.events.map((event) => event.kind)).toEqual(["MALFORMED_FAMILY", "MALFORMED_FAMILY"]);
    expect(observedDeathsOf(fight).observed).toEqual([]);
  });

  it("promotes DEATHS as OBSERVABLE from the archived capture, positively and only from it", () => {
    const record = EVIDENCE_CAPABILITY_REGISTRY.DEATHS;
    expect(record).toMatchObject({
      capability: "OBSERVABLE",
      retrievalSource: "EVENTS_ALL_STREAM",
      evidence: { kind: "ARCHIVED_CAPTURE", evidenceRoot: "EVIDENCE_ARCHIVE" },
    });
    expect(EVIDENCE_CAPABILITY_REGISTRY.TARGETABILITY.capability).toBe("UNVERIFIED");
  });
});

describe("the absence-safety API", () => {
  const code = readFileSync("src/engine/state/death-state.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("has no state, field or literal that could mean alive", () => {
    for (const word of [
      "ALIVE",
      "SURVIVED",
      "DID_NOT_DIE",
      "PRESENT",
      "TARGETABLE",
      "ACTIVE",
      "isAlive",
      "alive",
    ]) {
      expect(code, word).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
  });

  it("names retrieval completeness apart from any death state", () => {
    expect(code).toContain('"DEATH_EVENTS_RETRIEVED_COMPLETE"');
    expect(code).not.toMatch(/state:\s*"DEATH_EVENTS_RETRIEVED_COMPLETE"/);
  });
});

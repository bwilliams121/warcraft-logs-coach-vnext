/**
 * M12-B: damage episodes (src/healing/damage-episodes.ts).
 *
 * The negative cases matter most:
 * - without a declared FULL_RAID roster there is no episode list at all, never
 *   an empty one that reads as "the raid took no damage";
 * - an episode is COMPLETE only when DAMAGE coverage holds for EVERY roster
 *   player over the episode and its gap margin; one uncovered player, or a
 *   margin past the fight's edge, makes it UNKNOWN and says which;
 * - damage dealt BY the raid is never an episode; another actor's snapshot is
 *   never a target's health; nothing is summed.
 *
 * The last block reads the committed real evidence: three friendly-players
 * segments of report b1PmaKrd6CDfzngc fight 48 in the evidence archive. Its
 * expected values were derived from the raw bytes independently of this
 * primitive (see agent/review-request.md).
 */

import { beforeAll, describe, expect, it } from "vitest";

import { inclusiveRange } from "../../../src/engine/evidence/coverage.js";
import type { CombatFight } from "../../../src/engine/normalization/combat-fight.js";
import type { CategoryEvidence } from "../../../src/engine/normalization/completeness.js";
import { createNormalizer } from "../../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../../src/engine/normalization/supported-families.js";
import {
  DAMAGE_EPISODES_REVISION,
  DEFAULT_DAMAGE_EPISODE_GAP_MS,
  damageEpisodesOf,
  type DamageEpisode,
  type DamageEpisodeReport,
} from "../../../src/healing/damage-episodes.js";
import type { EvidenceCategory } from "../../../src/wcl/evidence-capability.js";
import { loadCommittedEvidenceArchive } from "../../support/corpus/evidence-archive.js";
import { bundleOf } from "../../support/corpus/fight.js";
import { observableCategory, partialCategory, syntheticFight } from "../../support/synthetic-fight.js";

type Raw = Record<string, unknown>;
const START = 1_000;
const END = 100_000;
const BOSS = 161;
const ROSTER = [2, 5, 9] as const;

function fightOf(
  raw: readonly Raw[],
  options: {
    readonly roster?: readonly number[];
    readonly scope?: "PLAYER_CONTEXT" | "FULL_RAID";
    readonly damage?: CategoryEvidence;
  } = {},
): CombatFight {
  const normalizer = createNormalizer({
    fightStartTimeMs: START,
    requestedRange: inclusiveRange(START, END),
    contracts: indexContracts(SUPPORTED_TYPE_CONTRACTS),
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
  const categories: Partial<Record<EvidenceCategory, CategoryEvidence>> = {
    DAMAGE: options.damage ?? observableCategory(inclusiveRange(START, END), null),
  };
  return syntheticFight({
    events: output.events,
    malformedObservations: output.malformedObservations,
    startTimeMs: START,
    endTimeMs: END,
    categories,
    scope: options.scope ?? "FULL_RAID",
    friendlyActorsInScope: options.roster ?? ROSTER,
  });
}

const hp = (hitPoints: number, side: 1 | 2 = 2): Raw => ({
  resourceActor: side,
  classResources: [{ amount: 100, max: 100, type: 0 }],
  hitPoints,
  maxHitPoints: 1_000_000,
  attackPower: 1,
  spellPower: 1,
  armor: 1,
  absorb: 0,
  x: 1,
  y: 1,
  facing: 0,
  mapID: 2608,
  versatility: 0,
  avoidance: 0,
  itemLevel: 328,
});
const hit = (timestamp: number, target: number, ability: number, extra: Raw = {}): Raw => ({
  timestamp,
  type: "damage",
  sourceID: BOSS,
  targetID: target,
  abilityGameID: ability,
  fight: 48,
  hitType: 1,
  amount: 10_000,
  isAoE: true,
  ...extra,
});

function reconstructed(report: DamageEpisodeReport) {
  if (report.state !== "RECONSTRUCTED") throw new Error(`expected episodes, got ${report.state}`);
  return report;
}

describe("the roster is declared, never assumed", () => {
  it("without FULL_RAID there is no episode list at all, not an empty one", () => {
    const report = damageEpisodesOf(fightOf([hit(10_000, 5, 100)], { scope: "PLAYER_CONTEXT" }));
    expect(report).toEqual({
      revision: DAMAGE_EPISODES_REVISION,
      authority: "WCL_OBSERVED_FACT",
      state: "ROSTER_NOT_IN_SCOPE",
      scope: "PLAYER_CONTEXT",
    });
    expect("episodes" in report).toBe(false);
  });

  it("an empty declared roster is not in scope either", () => {
    expect(damageEpisodesOf(fightOf([hit(10_000, 5, 100)], { roster: [] })).state).toBe(
      "ROSTER_NOT_IN_SCOPE",
    );
  });

  it("counts only hits ON roster players: damage the raid deals, or an outsider takes, is no episode", () => {
    const raw = [
      hit(10_000, 5, 100),
      { ...hit(10_100, BOSS, 200), sourceID: 5 }, // dealt by a roster player
      hit(10_200, 77, 100), // a non-roster target
    ];
    const report = reconstructed(damageEpisodesOf(fightOf(raw)));
    expect(report.roster).toEqual([2, 5, 9]);
    expect(report.episodes.map((episode) => [episode.abilityGameId, episode.hits])).toEqual([[100, 1]]);
  });
});

describe("grouping is by ability and gap, a parameter and not a judgement", () => {
  const raw = [
    hit(10_000, 2, 100),
    hit(10_500, 5, 100),
    hit(11_000, 9, 100),
    hit(12_000, 5, 300), // another ability, same moment: its own episode
    hit(13_000, 2, 100), // exactly gapMs after 11_000: same episode
    hit(15_001, 9, 100), // 2_001 after 13_000: a new episode
  ];
  const report = reconstructed(damageEpisodesOf(fightOf(raw)));

  it("uses the default gap and orders episodes by first hit", () => {
    expect(report.gapMs).toBe(DEFAULT_DAMAGE_EPISODE_GAP_MS);
    expect(
      report.episodes.map((episode) => [episode.abilityGameId, episode.firstHitMs, episode.lastHitMs]),
    ).toEqual([
      [100, 10_000, 13_000],
      [300, 12_000, 12_000],
      [100, 15_001, 15_001],
    ]);
  });

  it("counts hits per target, and reports sources as stated", () => {
    const [first] = report.episodes;
    expect(first?.hits).toBe(4);
    expect(
      first?.targets.map((target) => [target.actorId, target.hits, target.firstHitMs, target.lastHitMs]),
    ).toEqual([
      [2, 2, 10_000, 13_000],
      [5, 1, 10_500, 10_500],
      [9, 1, 11_000, 11_000],
    ]);
    expect(first?.sources).toEqual([{ actorId: BOSS, instanceId: null }]);
    expect(first?.hitsWithoutSource).toBe(0);
  });

  it("a wider gap merges what a narrower one splits", () => {
    const wide = reconstructed(damageEpisodesOf(fightOf(raw), 5_000));
    expect(wide.episodes.filter((episode) => episode.abilityGameId === 100)).toHaveLength(1);
    expect(() => damageEpisodesOf(fightOf(raw), -1)).toThrow(RangeError);
  });

  it("computes no total from raw amounts (follow-up M1)", () => {
    const keys = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === "object") {
        for (const [key, inner] of Object.entries(value)) {
          keys.add(key);
          walk(inner);
        }
      }
    };
    walk(report);
    for (const key of keys) expect(key, key).not.toMatch(/total|sum|amount|effective|dps|hps/i);
  });
});

describe("a target's lowest health is its own snapshot only", () => {
  it("takes the lowest same-target snapshot and ignores another actor's", () => {
    const raw = [
      hit(10_000, 5, 100, hp(800_000)),
      hit(10_500, 5, 100, hp(300_000)),
      hit(11_000, 5, 100, hp(5, 1)), // resourceActor 1: the BOSS's health, not the target's
      hit(11_500, 9, 100),
    ];
    const [episode] = reconstructed(damageEpisodesOf(fightOf(raw))).episodes;
    const low = (actorId: number) =>
      episode?.targets.find((target) => target.actorId === actorId)?.lowestObservedHealth;
    expect(low(5)).toMatchObject({ hitPoints: 300_000, maxHitPoints: 1_000_000, reportTimeMs: 10_500 });
    expect(low(9)).toBeNull();
  });
});

describe("COMPLETE needs every roster player covered over the episode and its margin", () => {
  const raw = [hit(50_000, 5, 100), hit(50_500, 9, 100)];

  it("is COMPLETE under whole-raid coverage", () => {
    const [episode] = reconstructed(damageEpisodesOf(fightOf(raw))).episodes;
    expect(episode?.coverage).toEqual({ state: "COMPLETE" });
  });

  it("is UNKNOWN when one roster player's evidence is out of scope, and names that player", () => {
    // A listed scope of the two players hit: player 2, never hit, is not vouched for — so "2 was not hit" is unknown.
    const damage = observableCategory(inclusiveRange(START, END), [5, 9]);
    const [episode] = reconstructed(damageEpisodesOf(fightOf(raw, { damage }))).episodes;
    expect(episode?.coverage).toEqual({
      state: "UNKNOWN",
      beyondFightEdge: false,
      uncoveredActors: [{ actorId: 2, reason: "INSUFFICIENT_SCOPE" }],
      unidentifiedHitsInSpan: 0,
    });
    expect(episode?.targets.map((target) => target.actorId)).toEqual([5, 9]);
  });

  it("is UNKNOWN when a gap in coverage falls inside the margin", () => {
    const damage = partialCategory([inclusiveRange(START, 49_000), inclusiveRange(51_000, END)]);
    const [episode] = reconstructed(damageEpisodesOf(fightOf(raw, { damage }))).episodes;
    expect(episode?.coverage.state).toBe("UNKNOWN");
    if (episode?.coverage.state !== "UNKNOWN") return;
    expect(episode.coverage.uncoveredActors.map((entry) => entry.reason)).toEqual([
      "INSUFFICIENT_COVERAGE",
      "INSUFFICIENT_COVERAGE",
      "INSUFFICIENT_COVERAGE",
    ]);
  });

  it("is UNKNOWN when the margin runs past the fight's edge: a hit just outside could have extended it", () => {
    const early = [hit(START + 500, 5, 100)];
    const [episode] = reconstructed(damageEpisodesOf(fightOf(early))).episodes;
    expect(episode?.coverage).toEqual({
      state: "UNKNOWN",
      beyondFightEdge: true,
      uncoveredActors: [],
      unidentifiedHitsInSpan: 0,
    });
  });
});

describe("a hit with no ability id could belong to any nearby episode", () => {
  const noAbility = (timestamp: number, target: number): Raw => {
    const raw = hit(timestamp, target, 0);
    delete raw["abilityGameID"];
    return raw;
  };

  it("makes an episode UNKNOWN when it lies inside the episode", () => {
    const raw = [hit(50_000, 5, 100), noAbility(50_500, 9), hit(51_000, 5, 100)];
    const report = reconstructed(damageEpisodesOf(fightOf(raw)));
    expect(report.hitsWithoutAbility).toBe(1);
    const [episode] = report.episodes;
    expect(episode?.coverage).toEqual({
      state: "UNKNOWN",
      beyondFightEdge: false,
      uncoveredActors: [],
      unidentifiedHitsInSpan: 1,
    });
  });

  it("makes an episode UNKNOWN when it lies within the grouping margin (the reviewed reproduction)", () => {
    // Ability 100 on player 5 at 50 s; an unidentified hit on player 9 one second later.
    const raw = [hit(50_000, 5, 100), noAbility(51_000, 9)];
    const [episode] = reconstructed(damageEpisodesOf(fightOf(raw))).episodes;
    expect([episode?.hits, episode?.targets.length]).toEqual([1, 1]);
    expect(episode?.coverage).toMatchObject({ state: "UNKNOWN", unidentifiedHitsInSpan: 1 });
  });

  it("leaves an episode COMPLETE when the unidentified hit is beyond its margin", () => {
    const raw = [hit(50_000, 5, 100), noAbility(52_001, 9), noAbility(47_999, 2)];
    const report = reconstructed(damageEpisodesOf(fightOf(raw)));
    expect(report.hitsWithoutAbility).toBe(2);
    expect(report.episodes[0]?.coverage).toEqual({ state: "COMPLETE" });
  });
});

describe("the real raid damage in the evidence archive (b1PmaKrd6CDfzngc fight 48, +69.5 s .. +77.0 s)", () => {
  const SEGMENTS = [
    "wcl-b1pm-fight-48-friendly-players.seg-69500-72500",
    "wcl-b1pm-fight-48-friendly-players.seg-72500-75500",
    "wcl-b1pm-fight-48-friendly-players.seg-75500-77000",
  ];
  const ROSTER_48 = [1, 2, 3, 5, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 121, 122, 164, 170];
  let report: Extract<DamageEpisodeReport, { state: "RECONSTRUCTED" }>;
  let fight: CombatFight;
  const episode = (ability: number, minHits: number): DamageEpisode => {
    const found = report.episodes.find((entry) => entry.abilityGameId === ability && entry.hits >= minHits);
    if (found === undefined) throw new Error(`no episode of ${String(ability)}`);
    return found;
  };

  beforeAll(async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
    fight = bundleOf(loaded.archive, SEGMENTS, []).fight;
    report = reconstructed(damageEpisodesOf(fight));
  });

  it("composes the three segments into one FULL_RAID fight over the derived roster", () => {
    expect(fight.breadth.scope).toBe("FULL_RAID");
    expect(fight.breadth.friendlyActorsInScope).toEqual(ROSTER_48);
    expect(fight.events).toHaveLength(2474);
    expect(report.roster).toEqual(ROSTER_48);
  });

  it("finds fifteen episodes, five of them COMPLETE over the whole roster", () => {
    expect(report.episodes).toHaveLength(15);
    expect(report.hitsWithoutAbility).toBe(0);
    expect(
      report.episodes
        .filter((entry) => entry.coverage.state === "COMPLETE")
        .map((entry) => [entry.abilityGameId, entry.firstHitMs, entry.hits, entry.targets.length]),
    ).toEqual([
      [1285979, 7_508_081, 80, 20],
      [1284561, 7_508_242, 20, 20],
      [1284561, 7_510_250, 20, 20],
      [1282525, 7_510_308, 20, 20],
      [210380, 7_510_334, 1, 1],
    ]);
  });

  it("keeps the four-tick raid-wide episode whole: twenty players, one source, each target's lowest health", () => {
    const ticks = episode(1285979, 80);
    expect([ticks.firstHitMs, ticks.lastHitMs]).toEqual([7_508_081, 7_511_098]);
    expect(ticks.sources).toEqual([{ actorId: 180, instanceId: 1 }]);
    expect(ticks.targets.map((target) => target.actorId)).toEqual(ROSTER_48);
    expect(ticks.targets.every((target) => target.hits === 4)).toBe(true);
    const lowest = (actorId: number) =>
      ticks.targets.find((target) => target.actorId === actorId)?.lowestObservedHealth;
    expect(lowest(16)).toMatchObject({ hitPoints: 560_336, maxHitPoints: 907_160, reportTimeMs: 7_511_096 });
    expect(lowest(5)).toMatchObject({ hitPoints: 664_759, maxHitPoints: 940_940, reportTimeMs: 7_511_095 });
  });

  it("keeps a one-hit raid-wide episode, with no health where no own snapshot was attached", () => {
    const burst = episode(1282525, 20);
    expect([burst.firstHitMs, burst.lastHitMs, burst.hits]).toEqual([7_510_308, 7_510_313, 20]);
    expect(burst.sources).toEqual([{ actorId: BOSS, instanceId: null }]);
    expect(burst.targets.filter((target) => target.lowestObservedHealth === null)).toHaveLength(1);
  });

  it("leaves the episode at the window's start UNKNOWN: its margin runs past the evidence", () => {
    // The raid-wide tick 0.44 s after the window opens: as whole-raid as the COMPLETE ticks, but its
    // 2 s margin starts before the evidence does, so a hit just before it cannot be ruled out.
    const edge = report.episodes.find((entry) => entry.abilityGameId === 1284561);
    expect([edge?.firstHitMs, edge?.hits, edge?.targets.length]).toEqual([7_506_237, 20, 20]);
    expect(edge?.coverage).toEqual({
      state: "UNKNOWN",
      beyondFightEdge: true,
      uncoveredActors: [],
      unidentifiedHitsInSpan: 0,
    });
    // So is every episode that starts within 2 s of the window's first event.
    expect(
      report.episodes
        .filter((entry) => entry.firstHitMs - DEFAULT_DAMAGE_EPISODE_GAP_MS < fight.fight.startTimeMs)
        .every((entry) => entry.coverage.state === "UNKNOWN"),
    ).toBe(true);
  });
});

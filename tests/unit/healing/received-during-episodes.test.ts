/**
 * M12-C: healing and absorbs received during damage episodes
 * (src/healing/received-during-episodes.ts).
 *
 * The negative cases matter most:
 * - without a declared FULL_RAID roster there is no report of episodes at all;
 * - an empty list is "nothing was received" ONLY under COMPLETE coverage of
 *   that category, for that player, over that window; otherwise UNKNOWN names
 *   the gate's reason;
 * - a source is reported verbatim: a pet is not folded into its owner, a
 *   missing source is kept, a heal absorb is not a damage absorb;
 * - healing outside the window, or on a player the episode did not hit, is
 *   not listed; nothing is summed.
 *
 * The last block reads the committed real evidence (the three M12-B
 * friendly-players segments of b1PmaKrd6CDfzngc fight 48). Its expected
 * values were derived from the raw segment bytes independently of this
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
  DEFAULT_RECEIVED_TRAILING_MS,
  RECEIVED_DURING_EPISODES_REVISION,
  receivedDuringEpisodesOf,
  type EpisodeReceived,
  type ReceivedDuringEpisodesReport,
} from "../../../src/healing/received-during-episodes.js";
import type { EvidenceCategory } from "../../../src/wcl/evidence-capability.js";
import { loadCommittedEvidenceArchive } from "../../support/corpus/evidence-archive.js";
import { bundleOf } from "../../support/corpus/fight.js";
import { observableCategory, partialCategory, syntheticFight } from "../../support/synthetic-fight.js";

type Raw = Record<string, unknown>;
const START = 1_000;
const END = 100_000;
const BOSS = 161;
const ROSTER = [2, 5, 9] as const;
const WHOLE = inclusiveRange(START, END);

function fightOf(
  raw: readonly Raw[],
  options: {
    readonly scope?: "PLAYER_CONTEXT" | "FULL_RAID";
    readonly categories?: Partial<Record<EvidenceCategory, CategoryEvidence>>;
    readonly endTimeMs?: number;
  } = {},
): CombatFight {
  const endTimeMs = options.endTimeMs ?? END;
  const normalizer = createNormalizer({
    fightStartTimeMs: START,
    requestedRange: inclusiveRange(START, endTimeMs),
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
  const whole = inclusiveRange(START, endTimeMs);
  return syntheticFight({
    events: output.events,
    malformedObservations: output.malformedObservations,
    startTimeMs: START,
    endTimeMs,
    categories: {
      DAMAGE: observableCategory(whole, null),
      HEALING: observableCategory(whole, null),
      ABSORBS: observableCategory(whole, null),
      ...options.categories,
    },
    scope: options.scope ?? "FULL_RAID",
    friendlyActorsInScope: ROSTER,
  });
}

const hit = (timestamp: number, target: number, ability = 100): Raw => ({
  timestamp,
  type: "damage",
  sourceID: BOSS,
  targetID: target,
  abilityGameID: ability,
  fight: 48,
  hitType: 1,
  amount: 10_000,
});
const heal = (timestamp: number, source: number | null, target: number, extra: Raw = {}): Raw => {
  const raw: Raw = {
    timestamp,
    type: "heal",
    sourceID: source,
    targetID: target,
    abilityGameID: 425804,
    fight: 48,
    hitType: 1,
    amount: 5_000,
    overheal: 1_200,
    ...extra,
  };
  if (source === null) delete raw["sourceID"];
  return raw;
};
const absorbed = (timestamp: number, source: number, target: number, type = "absorbed"): Raw => ({
  timestamp,
  type,
  sourceID: source,
  targetID: target,
  abilityGameID: 17,
  fight: 48,
  amount: 3_000,
  extraAbilityGameID: 100,
  ...(type === "absorbed" ? { attackerID: BOSS } : { healerID: 2 }),
});

function reconstructed(report: ReceivedDuringEpisodesReport) {
  if (report.state !== "RECONSTRUCTED") throw new Error(`expected episodes, got ${report.state}`);
  return report;
}

function only(report: ReceivedDuringEpisodesReport): EpisodeReceived {
  const [first, ...rest] = reconstructed(report).episodes;
  if (first === undefined || rest.length > 0) throw new Error("expected exactly one episode");
  return first;
}

const player = (episode: EpisodeReceived, actorId: number) => {
  const found = episode.players.find((entry) => entry.actorId === actorId);
  if (found === undefined) throw new Error(`no player ${String(actorId)}`);
  return found;
};

describe("the roster is declared, never assumed", () => {
  it("without FULL_RAID there is no episode report at all, not an empty one", () => {
    const report = receivedDuringEpisodesOf(
      fightOf([hit(10_000, 5), heal(10_100, 2, 5)], { scope: "PLAYER_CONTEXT" }),
    );
    expect(report).toEqual({
      revision: RECEIVED_DURING_EPISODES_REVISION,
      authority: "WCL_OBSERVED_FACT",
      state: "ROSTER_NOT_IN_SCOPE",
      scope: "PLAYER_CONTEXT",
    });
    expect("episodes" in report).toBe(false);
  });
});

describe("what one episode's players received, by reported source", () => {
  const raw = [
    heal(9_999, 2, 5), // before the first hit: not in the window
    hit(10_000, 5),
    hit(10_500, 9),
    heal(10_000, 9, 5), // same millisecond as the first hit: in
    heal(10_200, 2, 5),
    { ...heal(10_300, 170, 5), sourceInstance: 3 }, // a pet: its own source, never its owner
    heal(10_400, null, 5), // no stated source: kept, under null
    heal(10_600, 5, 5), // the player's own heal
    absorbed(10_700, 2, 5),
    absorbed(10_800, 161, 5, "healabsorbed"), // a heal absorb: its own kind
    heal(12_500, 2, 5), // exactly the trailing edge: in
    heal(12_501, 2, 5), // past it: out
    heal(11_000, 2, 2), // player 2 was not hit: not listed
  ];
  const report = reconstructed(receivedDuringEpisodesOf(fightOf(raw)));
  const episode = only(report);

  it("windows from the first hit to the last hit plus the trailing span", () => {
    expect(report.trailingMs).toBe(DEFAULT_RECEIVED_TRAILING_MS);
    expect(episode.window).toEqual({ fromReportTimeMs: 10_000, toReportTimeMs: 12_500, clampedBy: null });
    expect(episode.players.map((entry) => entry.actorId)).toEqual([5, 9]);
  });

  it("groups by source verbatim, in actor then instance order, the null source last", () => {
    const five = player(episode, 5);
    expect(
      five.bySource.map((group) => [group.source, group.entries.map((entry) => entry.reportTimeMs)]),
    ).toEqual([
      [{ actorId: 2, instanceId: null }, [10_200, 10_700, 12_500]],
      [{ actorId: 5, instanceId: null }, [10_600]],
      [{ actorId: 9, instanceId: null }, [10_000]],
      [{ actorId: 161, instanceId: null }, [10_800]],
      [{ actorId: 170, instanceId: 3 }, [10_300]],
      [null, [10_400]],
    ]);
  });

  it("keeps raw fields verbatim and absorb kinds apart", () => {
    const fromTwo = player(episode, 5).bySource[0]?.entries ?? [];
    expect(fromTwo[0]).toMatchObject({
      kind: "HEALING_RECEIVED",
      abilityGameId: 425804,
      raw: { amount: 5_000, overhealAmount: 1_200, absorbedAmount: null, hitType: 1 },
    });
    expect(fromTwo[1]).toMatchObject({
      kind: "DAMAGE_ABSORBED",
      raw: { amount: 3_000, absorbedAbilityGameId: 100, attributedActorId: BOSS },
    });
    const fromBoss = player(episode, 5).bySource[3]?.entries ?? [];
    expect(fromBoss[0]).toMatchObject({ kind: "HEAL_ABSORBED", raw: { attributedActorId: 2 } });
  });

  it("an empty list under COMPLETE coverage is an observed nothing", () => {
    expect(player(episode, 9)).toEqual({
      actorId: 9,
      bySource: [],
      coverage: { HEALING: { state: "COMPLETE" }, ABSORBS: { state: "COMPLETE" } },
    });
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
    for (const key of keys) expect(key, key).not.toMatch(/total|sum|effective|hps|dps/i);
  });
});

describe("an empty list is never 'nothing was received' without coverage", () => {
  const raw = [hit(50_000, 5), hit(50_500, 9), heal(50_600, 2, 9)];

  it("is UNKNOWN with INSUFFICIENT_SCOPE when the player's evidence is out of scope", () => {
    const categories = { HEALING: observableCategory(WHOLE, [9]) };
    const episode = only(receivedDuringEpisodesOf(fightOf(raw, { categories })));
    expect(player(episode, 5).bySource).toEqual([]);
    expect(player(episode, 5).coverage).toEqual({
      HEALING: { state: "UNKNOWN", reason: "INSUFFICIENT_SCOPE" },
      ABSORBS: { state: "COMPLETE" },
    });
    expect(player(episode, 9).coverage.HEALING).toEqual({ state: "COMPLETE" });
  });

  it("is UNKNOWN with INSUFFICIENT_COVERAGE when a retrieval gap falls inside the window", () => {
    const categories = {
      ABSORBS: partialCategory([inclusiveRange(START, 51_000), inclusiveRange(52_000, END)]),
    };
    const episode = only(receivedDuringEpisodesOf(fightOf(raw, { categories })));
    for (const actorId of [5, 9]) {
      expect(player(episode, actorId).coverage).toEqual({
        HEALING: { state: "COMPLETE" },
        ABSORBS: { state: "UNKNOWN", reason: "INSUFFICIENT_COVERAGE" },
      });
    }
  });

  it("a gap outside the window leaves the lists COMPLETE", () => {
    const categories = {
      HEALING: partialCategory([inclusiveRange(START, 49_000), inclusiveRange(49_999, END)]),
    };
    const episode = only(receivedDuringEpisodesOf(fightOf(raw, { categories })));
    expect(player(episode, 5).coverage.HEALING).toEqual({ state: "COMPLETE" });
  });
});

describe("the window and the episode's own coverage", () => {
  it("cuts the trailing span at the fight's end and says so", () => {
    const raw = [hit(99_000, 5), heal(99_900, 2, 5)];
    const episode = only(receivedDuringEpisodesOf(fightOf(raw)));
    expect(episode.window).toEqual({ fromReportTimeMs: 99_000, toReportTimeMs: END, clampedBy: "FIGHT_END" });
    expect(player(episode, 5).bySource).toHaveLength(1);
  });

  it("a wider trailing span lists what a narrower one leaves out", () => {
    const raw = [hit(50_000, 5), heal(53_000, 2, 5)];
    const narrow = only(receivedDuringEpisodesOf(fightOf(raw)));
    const wide = only(receivedDuringEpisodesOf(fightOf(raw), { trailingMs: 5_000 }));
    expect(player(narrow, 5).bySource).toEqual([]);
    expect(player(wide, 5).bySource).toHaveLength(1);
    expect(() => receivedDuringEpisodesOf(fightOf(raw), { trailingMs: -1 })).toThrow(RangeError);
    expect(() => receivedDuringEpisodesOf(fightOf(raw), { gapMs: -1 })).toThrow(RangeError);
  });

  it("carries the episode's DAMAGE coverage: an UNKNOWN episode's player set is not complete", () => {
    const raw = [hit(50_000, 5)];
    const categories = { DAMAGE: observableCategory(WHOLE, [5]) };
    const episode = only(receivedDuringEpisodesOf(fightOf(raw, { categories })));
    expect(episode.episode.coverage.state).toBe("UNKNOWN");
    expect(episode.players.map((entry) => entry.actorId)).toEqual([5]);
  });

  it("lists one heal under every overlapping episode whose window holds it", () => {
    const raw = [hit(50_000, 5, 100), hit(50_200, 5, 300), heal(50_500, 2, 5)];
    const report = reconstructed(receivedDuringEpisodesOf(fightOf(raw)));
    expect(report.episodes.map((entry) => player(entry, 5).bySource[0]?.entries.length)).toEqual([1, 1]);
  });
});

describe("the real raid healing in the evidence archive (b1PmaKrd6CDfzngc fight 48, +69.5 s .. +77.0 s)", () => {
  const SEGMENTS = [
    "wcl-b1pm-fight-48-friendly-players.seg-69500-72500",
    "wcl-b1pm-fight-48-friendly-players.seg-72500-75500",
    "wcl-b1pm-fight-48-friendly-players.seg-75500-77000",
  ];
  let report: Extract<ReceivedDuringEpisodesReport, { state: "RECONSTRUCTED" }>;
  const episodeOf = (ability: number, firstHitMs: number): EpisodeReceived => {
    const found = report.episodes.find(
      (entry) => entry.episode.abilityGameId === ability && entry.episode.firstHitMs === firstHitMs,
    );
    if (found === undefined) throw new Error(`no episode of ${String(ability)}`);
    return found;
  };
  const kinds = (episode: EpisodeReceived): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const entry of episode.players.flatMap((each) => each.bySource.flatMap((group) => group.entries))) {
      counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
    }
    return counts;
  };
  const bySource = (episode: EpisodeReceived, actorId: number): Record<string, number> =>
    Object.fromEntries(
      player(episode, actorId).bySource.map((group) => [
        group.source === null
          ? "none"
          : `${String(group.source.actorId)}${group.source.instanceId === null ? "" : `#${String(group.source.instanceId)}`}`,
        group.entries.length,
      ]),
    );

  beforeAll(async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
    report = reconstructed(receivedDuringEpisodesOf(bundleOf(loaded.archive, SEGMENTS, []).fight));
  });

  it("reports the fifteen M12-B episodes", () => {
    expect(report.episodes).toHaveLength(15);
  });

  it("the one-hit raid-wide burst (1,282,525): twenty players, every list COMPLETE", () => {
    const burst = episodeOf(1282525, 7_510_308);
    expect(burst.window).toEqual({ fromReportTimeMs: 7_510_308, toReportTimeMs: 7_512_313, clampedBy: null });
    expect(burst.players).toHaveLength(20);
    expect(kinds(burst)).toEqual({ HEALING_RECEIVED: 356, DAMAGE_ABSORBED: 44, HEAL_ABSORBED: 1 });
    expect(
      burst.players.every(
        (entry) => entry.coverage.HEALING.state === "COMPLETE" && entry.coverage.ABSORBS.state === "COMPLETE",
      ),
    ).toBe(true);
    expect(bySource(burst, 5)).toEqual({ "1": 8, "2": 6, "5": 4, "9": 2, "122": 3 });
    expect(bySource(burst, 3)).toEqual({ "1": 3, "2": 7, "3": 6, "9": 2, "122": 7 });
  });

  it("the four-tick raid episode (1,285,979): a guardian's heal stays under its own instance", () => {
    const ticks = episodeOf(1285979, 7_508_081);
    expect(ticks.window).toEqual({ fromReportTimeMs: 7_508_081, toReportTimeMs: 7_513_098, clampedBy: null });
    expect(kinds(ticks)).toEqual({ HEALING_RECEIVED: 779, DAMAGE_ABSORBED: 127, HEAL_ABSORBED: 2 });
    expect(bySource(ticks, 3)).toEqual({ "1": 7, "2": 14, "3": 13, "9": 11, "122": 17, "129#4": 1 });
    expect(bySource(ticks, 16)).toEqual({ "1": 2, "2": 12, "3": 3, "9": 16, "16": 3, "122": 6 });
  });
});

/**
 * M13-A: the Augmentation Evoker evaluator (src/specs/evoker/augmentation/).
 *
 * The negative cases matter most:
 * - recipient quality is NO_AUTHORITY_AVAILABLE with no model, and UNKNOWN —
 *   never NO_AUTHORITY_AVAILABLE — when a declared model's ally state is
 *   missing; neither ever names a "wrong" recipient;
 * - support timing has no standard: NO_AUTHORITY_AVAILABLE, facts only;
 * - the support-cast list is complete only under the Evoker's COMPLETE CASTS
 *   coverage and with no unidentified cast;
 * - the Evoker's own Ebon Might is not support to an ally;
 * - a wrong or contradictory identity stops evaluation.
 *
 * The last block reads the committed real evidence: the one M13-A capture
 * (pseudonym M13AAUGAAAAAAAAA fight 1, actor 1), whose server-filtered
 * streams grant nothing, so every listing there is OBSERVED_ONLY. Its
 * expected values were derived from the raw artifact bytes independently of
 * the evaluator.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { inclusiveRange } from "../../../src/engine/evidence/coverage.js";
import type { CombatActor } from "../../../src/engine/normalization/actors.js";
import type { CombatFight } from "../../../src/engine/normalization/combat-fight.js";
import type { CategoryEvidence } from "../../../src/engine/normalization/completeness.js";
import { createNormalizer } from "../../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../../src/engine/normalization/supported-families.js";
import {
  parseAugmentationSupportAbilities,
  pinnedAugmentationSupportAbilities,
} from "../../../src/data/game/evoker-augmentation-support-abilities.js";
import artifactJson from "../../../src/data/game/evoker-augmentation-support-abilities.json";
import {
  evaluateAugmentationEvoker,
  supportTargetingStatus,
  type AugmentationEvokerEvaluation,
} from "../../../src/specs/evoker/augmentation/evaluator.js";
import { supportAuraWindowsOf } from "../../../src/support/support-aura-windows.js";
import type { EvidenceCategory } from "../../../src/wcl/evidence-capability.js";
import type { FightIdentity } from "../../../src/wcl/types.js";
import { loadCommittedEvidenceArchive } from "../../support/corpus/evidence-archive.js";
import { bundleOf } from "../../support/corpus/fight.js";
import { absentCategory, observableCategory, syntheticFight } from "../../support/synthetic-fight.js";

type Raw = Record<string, unknown>;
const START = 1_000;
const END = 100_000;
const WHOLE = inclusiveRange(START, END);
const EVOKER = 1;
const ALLY = 4;
const OTHER_ALLY = 6;
const BOSS = 21;
const EBON_MIGHT = 395152;
const EBON_MIGHT_SELF = 395296;
const PRESCIENCE_CAST = 409311;
const PRESCIENCE = 410089;
const BREATH = 403631;

const actor = (actorId: number, subType: string, rawType = "Player") =>
  ({
    actorId,
    gameId: null,
    name: null,
    server: null,
    actorType: rawType === "Player" ? "PLAYER" : rawType === "Pet" ? "PET" : "NPC",
    rawType,
    subType,
    petOwnerActorId: null,
  }) satisfies CombatActor;

const ACTORS = new Map<number, CombatActor>([
  [EVOKER, actor(EVOKER, "Evoker")],
  [ALLY, actor(ALLY, "Warrior")],
  [OTHER_ALLY, actor(OTHER_ALLY, "Mage")],
  [BOSS, actor(BOSS, "Boss", "NPC")],
]);

function fightOf(
  raw: readonly Raw[],
  options: {
    readonly categories?: Partial<Record<EvidenceCategory, CategoryEvidence>>;
    readonly actors?: ReadonlyMap<number, CombatActor>;
  } = {},
): CombatFight {
  const normalizer = createNormalizer({
    fightStartTimeMs: START,
    requestedRange: WHOLE,
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
  return syntheticFight({
    events: output.events,
    malformedObservations: output.malformedObservations,
    startTimeMs: START,
    endTimeMs: END,
    categories: {
      CASTS: observableCategory(WHOLE, null),
      AURAS: observableCategory(WHOLE, null),
      DEATHS: observableCategory(WHOLE, null),
      ...options.categories,
    },
    actors: options.actors ?? ACTORS,
    scope: "FULL_RAID",
    friendlyActorsInScope: [EVOKER, ALLY, OTHER_ALLY],
  });
}

function identityFor(fight: CombatFight, overrides: Partial<FightIdentity["player"]> = {}): FightIdentity {
  return {
    report: { code: fight.report.code, revision: 1, startTime: 0, endTime: 0 },
    data: { logVersion: 17, gameVersion: 1 },
    fight: {
      id: fight.fight.id,
      name: fight.fight.name,
      encounterId: fight.fight.encounterId,
      difficulty: fight.fight.difficulty,
      startTime: fight.fight.startTimeMs,
      endTime: fight.fight.endTimeMs,
    },
    player: {
      sourceId: EVOKER,
      name: "Subject",
      className: "Evoker",
      specName: "Augmentation",
      ...overrides,
    },
  };
}

const cast = (timestamp: number, source: number, ability: number | null): Raw => ({
  timestamp,
  type: "cast",
  sourceID: source,
  targetID: -1,
  ...(ability === null ? {} : { abilityGameID: ability }),
  fight: 1,
});
const aura = (timestamp: number, type: string, target: number, ability: number): Raw => ({
  timestamp,
  type,
  sourceID: EVOKER,
  targetID: target,
  abilityGameID: ability,
  fight: 1,
});

function evaluated(result: AugmentationEvokerEvaluation) {
  if (result.state !== "EVALUATED") throw new Error(`expected EVALUATED, got ${result.state}`);
  return result;
}

const SYNTHETIC = [
  cast(5_000, EVOKER, EBON_MIGHT),
  aura(5_000, "applybuff", EVOKER, EBON_MIGHT_SELF),
  aura(5_000, "applybuff", ALLY, EBON_MIGHT),
  aura(5_000, "applybuff", OTHER_ALLY, EBON_MIGHT),
  cast(6_000, EVOKER, PRESCIENCE_CAST),
  aura(6_000, "applybuff", ALLY, PRESCIENCE),
  cast(8_000, EVOKER, BREATH),
  cast(9_000, ALLY, 777),
  aura(15_000, "removebuff", ALLY, EBON_MIGHT),
  aura(15_000, "removebuff", OTHER_ALLY, EBON_MIGHT),
  aura(15_000, "removebuff", EVOKER, EBON_MIGHT_SELF),
  aura(24_000, "removebuff", ALLY, PRESCIENCE),
];

describe("the pinned Augmentation support-ability dataset", () => {
  it("loads, and every identity is its pinned row or module line", () => {
    const loaded = pinnedAugmentationSupportAbilities();
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(
      [...loaded.abilities.values()].map((ability) => [
        ability.key,
        ability.castAbilityGameIds,
        ability.allyAura?.abilityGameId ?? null,
        ability.selfAura?.abilityGameId ?? null,
      ]),
    ).toEqual([
      ["EBON_MIGHT", [EBON_MIGHT], EBON_MIGHT, EBON_MIGHT_SELF],
      ["PRESCIENCE", [PRESCIENCE_CAST], PRESCIENCE, null],
      ["BREATH_OF_EONS", [BREATH, 442204], null, null],
    ]);
  });

  it("fails closed on a row that is not the identity it claims, or a line that does not name its id", () => {
    const tampered = structuredClone(artifactJson) as { supportAbilities: Record<string, unknown>[] };
    const prescience = tampered.supportAbilities[1];
    if (prescience === undefined) throw new Error("no entry");
    prescience["castAbilityGameIds"] = [409312];
    expect(parseAugmentationSupportAbilities(tampered)).toEqual({ ok: false, reason: "PINNED_ROW_MISMATCH" });
    const badLine = structuredClone(artifactJson) as { supportAbilities: Record<string, unknown>[] };
    const ebon = badLine.supportAbilities[0];
    if (ebon === undefined) throw new Error("no entry");
    ebon["selfAura"] = {
      abilityGameId: 395297,
      moduleLine: "talent.ebon_might_self_buff = find_spell( 395296 );",
    };
    expect(parseAugmentationSupportAbilities(badLine)).toEqual({ ok: false, reason: "PINNED_LINE_MISMATCH" });
    const wrongSpec = structuredClone(artifactJson) as { provenance: Record<string, unknown> };
    wrongSpec.provenance["specId"] = 1467;
    expect(parseAugmentationSupportAbilities(wrongSpec)).toEqual({
      ok: false,
      reason: "SPECIALIZATION_MISMATCH",
    });
  });
});

describe("the Augmentation evaluator (synthetic)", () => {
  it("reports the support facts and gives no verdict: targeting and timing have no authority", () => {
    const fight = fightOf(SYNTHETIC);
    const result = evaluated(evaluateAugmentationEvoker({ fight, identity: identityFor(fight) }));
    expect(result.supportTargeting).toEqual({
      category: "SUPPORT_TARGETING",
      status: "NO_AUTHORITY_AVAILABLE",
      reason: "NO_APPROVED_RECIPIENT_QUALITY_MODEL",
    });
    expect(result.supportTiming).toMatchObject({
      category: "SUPPORT_TIMING",
      status: "NO_AUTHORITY_AVAILABLE",
      authorityForFacts: "WCL_OBSERVED_FACT",
      listing: { state: "COMPLETE" },
    });
    expect(result.supportTiming.casts.map((entry) => [entry.ability, entry.reportTimeMs])).toEqual([
      ["EBON_MIGHT", 5_000],
      ["PRESCIENCE", 6_000],
      ["BREATH_OF_EONS", 8_000],
    ]);
    const [ebon, prescience] = result.allyBuffs;
    expect(
      ebon?.windows.map((entry) => [entry.window.recipient.actorId, entry.window.boundsDistanceMs]),
    ).toEqual([
      [ALLY, 10_000],
      [OTHER_ALLY, 10_000],
    ]);
    expect(ebon?.supportTime.anyRecipient).toEqual({
      bound: "AT_LEAST",
      ms: 10_000,
      why: ["INITIAL_STATE_NOT_RESOLVED"],
    });
    expect(
      prescience?.windows.map((entry) => [entry.window.recipient.actorId, entry.window.boundsDistanceMs]),
    ).toEqual([[ALLY, 18_000]]);
    // The Evoker's own Ebon Might is its self buff, never support to an ally.
    expect(ebon?.windows.some((entry) => entry.window.recipient.actorId === EVOKER)).toBe(false);
    expect(result.selfBuffs[0]?.windows.windows.map((window) => window.boundsDistanceMs)).toEqual([10_000]);
    // No cooldown identity supplied: never an empty overlap.
    for (const entry of [...(ebon?.windows ?? []), ...(prescience?.windows ?? [])]) {
      expect(entry.cooldownOverlap).toEqual({ state: "NO_COOLDOWN_IDENTITY" });
    }
    expect(JSON.stringify(result)).not.toMatch(/WRONG|INCORRECT|MISSED|SHOULD/);
  });

  it("a caller-supplied cooldown identity lists the recipient's own cast inside the span", () => {
    const fight = fightOf(SYNTHETIC);
    const result = evaluated(
      evaluateAugmentationEvoker({
        fight,
        identity: identityFor(fight),
        recipientCooldownIdentity: new Map([[ALLY, [777]]]),
      }),
    );
    expect(result.allyBuffs[0]?.windows[0]?.cooldownOverlap).toMatchObject({
      state: "LISTED",
      casts: [{ abilityGameId: 777, reportTimeMs: 9_000 }],
      listing: { state: "COMPLETE" },
    });
  });

  it("the support-cast list is UNKNOWN without CASTS coverage, or with an unidentified Evoker cast", () => {
    const uncovered = fightOf(SYNTHETIC, { categories: { CASTS: absentCategory() } });
    expect(
      evaluated(evaluateAugmentationEvoker({ fight: uncovered, identity: identityFor(uncovered) }))
        .supportTiming.listing,
    ).toEqual({
      state: "UNKNOWN",
      reason: "INSUFFICIENT_COVERAGE",
      unidentifiedCasts: 0,
      unattributedCasts: 0,
    });
    const unidentified = fightOf([...SYNTHETIC, cast(30_000, EVOKER, null)]);
    expect(
      evaluated(evaluateAugmentationEvoker({ fight: unidentified, identity: identityFor(unidentified) }))
        .supportTiming.listing,
    ).toEqual({
      state: "UNKNOWN",
      reason: "UNIDENTIFIED_SUBJECT_CAST",
      unidentifiedCasts: 1,
      unattributedCasts: 0,
    });
    // A source-less Breath of Eons cast could be the Evoker's; a source-less unrelated cast could not.
    const { sourceID: _dropped, ...sourceless } = cast(31_000, EVOKER, BREATH);
    const unattributed = fightOf([...SYNTHETIC, sourceless]);
    expect(
      evaluated(evaluateAugmentationEvoker({ fight: unattributed, identity: identityFor(unattributed) }))
        .supportTiming.listing,
    ).toEqual({ state: "UNKNOWN", reason: "UNATTRIBUTED_CAST", unidentifiedCasts: 0, unattributedCasts: 1 });
    const unrelated = fightOf([...SYNTHETIC, { ...sourceless, abilityGameID: 1 }]);
    expect(
      evaluated(evaluateAugmentationEvoker({ fight: unrelated, identity: identityFor(unrelated) }))
        .supportTiming.listing,
    ).toEqual({ state: "COMPLETE" });
  });

  it("a wrong or contradictory identity stops evaluation", () => {
    const fight = fightOf(SYNTHETIC);
    const refused = (identity: FightIdentity, actors?: ReadonlyMap<number, CombatActor>) => {
      const subject = actors === undefined ? fight : fightOf(SYNTHETIC, { actors });
      return evaluateAugmentationEvoker({ fight: subject, identity });
    };
    expect(refused(identityFor(fight, { specName: "Devastation" }))).toMatchObject({
      state: "IDENTITY_REFUSED",
      reason: "NOT_THIS_SPECIALIZATION",
    });
    expect(refused(identityFor(fight, { sourceId: 77 }))).toMatchObject({
      state: "IDENTITY_REFUSED",
      reason: "IDENTITY_UNRESOLVED",
    });
    expect(refused(identityFor(fight), new Map([[EVOKER, actor(EVOKER, "Priest")]]))).toMatchObject({
      state: "IDENTITY_REFUSED",
      reason: "IDENTITY_CONFLICT",
    });
    expect(refused({ ...identityFor(fight), fight: { ...identityFor(fight).fight, id: 99 } })).toMatchObject({
      state: "IDENTITY_REFUSED",
      reason: "IDENTITY_MISMATCH",
    });
  });

  it("an unusable runtime dataset is RUNTIME_DATA_UNAVAILABLE, never an empty report", () => {
    const fight = fightOf(SYNTHETIC);
    expect(
      evaluateAugmentationEvoker({
        fight,
        identity: identityFor(fight),
        dataset: { ok: false, reason: "NO_ENTRIES" },
      }),
    ).toEqual({
      revision: "augmentation-evoker-evaluator/2",
      state: "RUNTIME_DATA_UNAVAILABLE",
      reason: "NO_ENTRIES",
    });
  });
});

describe("SUPPORT_TARGETING: the two failure states are never substituted", () => {
  const fight = fightOf(SYNTHETIC);
  const windows = supportAuraWindowsOf(fight, {
    supporterActorId: EVOKER,
    auraAbilityGameIds: [PRESCIENCE],
  }).windows;
  const MODEL = {
    modelId: "hypothetical-recipient-quality/0",
    requiredAllyCategories: ["CASTS", "DAMAGE"] as const,
  };

  it("case A — no model: NO_AUTHORITY_AVAILABLE, whatever ally state exists", () => {
    expect(supportTargetingStatus(fight, windows, null).status).toBe("NO_AUTHORITY_AVAILABLE");
  });

  it("case B — a declared model whose ally state was not retrieved: UNKNOWN, naming what is missing", () => {
    // DAMAGE was never retrieved for the recipient.
    expect(
      supportTargetingStatus(fight, windows, {
        ...MODEL,
        requiredAllyCategories: [...MODEL.requiredAllyCategories],
      }),
    ).toEqual({
      category: "SUPPORT_TARGETING",
      status: "UNKNOWN",
      modelId: MODEL.modelId,
      missing: { recipientActorId: ALLY, category: "DAMAGE", reason: "CAPABILITY_UNVERIFIED" },
    });
  });

  it("a declared model with the ally state it needs is applicable — no v1 caller declares one", () => {
    expect(
      supportTargetingStatus(fight, windows, { modelId: MODEL.modelId, requiredAllyCategories: ["CASTS"] }),
    ).toEqual({
      category: "SUPPORT_TARGETING",
      status: "ALLY_STATE_SUFFICIENT",
      modelId: MODEL.modelId,
    });
  });
});

describe("the real Augmentation Evoker in the evidence archive (M13AAUGAAAAAAAAA fight 1, actor 1)", () => {
  const SEGMENTS = ["wcl-m13a-aug1-fight-1-support.seg-0-75", "wcl-m13a-aug1-fight-1-support.seg-75-151"];
  const CONTEXT = "wcl-m13a-fight-context-aug1-fight-1";
  const [FIGHT_START, FIGHT_END] = [165_857, 316_612];
  let fight: CombatFight;
  let identity: FightIdentity;
  let raw: readonly Raw[];

  beforeAll(async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
    const find = (id: string) => {
      const found = loaded.archive.referenceableArtifacts.find((entry) => entry.record.artifactId === id);
      if (found === undefined) throw new Error(`no artifact ${id}`);
      return found;
    };
    raw = SEGMENTS.flatMap((id) => find(id).json as readonly Raw[]);
    const composed = bundleOf(loaded.archive, SEGMENTS, [], { catalogArtifactId: CONTEXT });
    // The filtered capture grants nothing: CASTS and AURAS are ABSENT, and DEATHS
    // (which no capture vouches for) stays UNVERIFIED. Nothing is COMPLETE.
    expect(composed.coveredRanges).toEqual({});
    const stateOf = (category: EvidenceCategory) => {
      const evidence = composed.fight.completeness.categories[category];
      return evidence.capability === "OBSERVABLE" ? evidence.coverage.state : evidence.capability;
    };
    expect([stateOf("CASTS"), stateOf("AURAS"), stateOf("DEATHS")]).toEqual([
      "ABSENT",
      "ABSENT",
      "UNVERIFIED",
    ]);
    const context = find(CONTEXT).json as {
      reportData: {
        report: {
          code: string;
          fights: {
            startTime: number;
            endTime: number;
            encounterID: number;
            difficulty: number;
            kill: boolean;
            friendlyPlayers: number[];
            friendlySpecs: string[];
          }[];
        };
      };
    };
    expect(context.reportData.report.code).toBe("M13AAUGAAAAAAAAA");
    const fightRow = context.reportData.report.fights[0];
    if (fightRow === undefined) throw new Error("no fight");
    expect([
      fightRow.startTime,
      fightRow.endTime,
      fightRow.encounterID,
      fightRow.difficulty,
      fightRow.kill,
    ]).toEqual([FIGHT_START, FIGHT_END, 3429, 5, false]);
    fight = {
      ...composed.fight,
      fight: {
        ...composed.fight.fight,
        encounterId: fightRow.encounterID,
        difficulty: fightRow.difficulty,
        startTimeMs: fightRow.startTime,
        endTimeMs: fightRow.endTime,
        durationMs: fightRow.endTime - fightRow.startTime,
      },
    };
    identity = {
      ...identityFor(fight),
      player: {
        sourceId: EVOKER,
        name: "Subject",
        className: fight.actors.get(EVOKER)?.subType ?? "",
        specName: fightRow.friendlySpecs[fightRow.friendlyPlayers.indexOf(EVOKER)] ?? "",
      },
    };
  });

  /** Raw transitions of one aura id sourced by the Evoker, by type. */
  const rawCount = (ability: number, type: string, target?: (id: number) => boolean) =>
    raw.filter(
      (event) =>
        event["sourceID"] === EVOKER &&
        event["abilityGameID"] === ability &&
        event["type"] === type &&
        (target === undefined || target(event["targetID"] as number)),
    ).length;

  it("the committed context establishes the subject as an Augmentation Evoker", () => {
    expect([identity.player.className, identity.player.specName]).toEqual(["Evoker", "Augmentation"]);
  });

  it("lists the 22 support casts the raw bytes hold, OBSERVED ONLY: the capture grants no coverage", () => {
    const expected = raw
      .filter(
        (event) =>
          event["type"] === "cast" &&
          event["sourceID"] === EVOKER &&
          [EBON_MIGHT, PRESCIENCE_CAST, BREATH, 442204].includes(event["abilityGameID"] as number),
      )
      .map((event) => [event["abilityGameID"], event["timestamp"]]);
    expect(expected).toHaveLength(22);
    const result = evaluated(evaluateAugmentationEvoker({ fight, identity }));
    expect(result.supportTiming.casts.map((entry) => [entry.abilityGameId, entry.reportTimeMs])).toEqual(
      expected,
    );
    expect(
      result.supportTiming.casts
        .filter((entry) => entry.ability === "BREATH_OF_EONS")
        .map((entry) => entry.reportTimeMs),
    ).toEqual([170_941, 256_625]);
    expect(result.supportTiming.listing).toEqual({
      state: "UNKNOWN",
      reason: "INSUFFICIENT_COVERAGE",
      unidentifiedCasts: 0,
      unattributedCasts: 0,
    });
    expect(result.supportTargeting.status).toBe("NO_AUTHORITY_AVAILABLE");
  });

  it("every observed Ebon Might and Prescience application is a window start, and every listing is OBSERVED_ONLY", () => {
    const result = evaluated(evaluateAugmentationEvoker({ fight, identity }));
    const [ebon, prescience] = result.allyBuffs;
    if (ebon === undefined || prescience === undefined) throw new Error("missing ability");
    const notSelf = (id: number) => id !== EVOKER;
    for (const [observation, id] of [
      [ebon, EBON_MIGHT],
      [prescience, PRESCIENCE],
    ] as const) {
      expect(observation.listing).toEqual({ state: "OBSERVED_ONLY", reason: "INSUFFICIENT_COVERAGE" });
      expect(observation.windows.filter((entry) => entry.window.start.kind === "OBSERVED")).toHaveLength(
        rawCount(id, "applybuff", notSelf),
      );
      expect(observation.windows.filter((entry) => entry.window.end.kind === "OBSERVED")).toHaveLength(
        rawCount(id, "removebuff", notSelf),
      );
      // No coverage: no window has established continuity, so no support time is proven.
      expect(observation.supportTime.anyRecipient).toEqual({
        bound: "UNKNOWN",
        why: ["INITIAL_STATE_NOT_RESOLVED", "LISTING_OBSERVED_ONLY", "CONTINUITY_NOT_ESTABLISHED"],
      });
      for (const entry of observation.windows) expect(entry.window.activeSpan).toBeNull();
    }
    expect([rawCount(EBON_MIGHT, "applybuff", notSelf), rawCount(PRESCIENCE, "applybuff", notSelf)]).toEqual([
      173, 57,
    ]);
    // Ebon Might reached the thirteen non-tank DPS recipients the raw bytes name.
    expect(
      [...new Set(ebon.windows.map((entry) => entry.window.recipient.actorId))].sort((a, b) => a - b),
    ).toEqual([3, 4, 6, 7, 10, 11, 14, 15, 16, 17, 18, 19, 20]);
  });

  it("recipient identity: pets keep their WCL owner, and a pet without one is OWNER_NOT_STATED", () => {
    const result = evaluated(evaluateAugmentationEvoker({ fight, identity }));
    const ownership = new Map(
      (result.allyBuffs[1]?.windows ?? []).map((entry) => [
        entry.window.recipient.actorId,
        entry.window.recipientIdentity.catalog === "LISTED" ? entry.window.recipientIdentity.ownership : null,
      ]),
    );
    expect(ownership.get(50)).toEqual({ kind: "OWNED_BY", ownerActorId: 17 });
    expect(ownership.get(27)).toEqual({ kind: "OWNED_BY", ownerActorId: 20 });
    expect(ownership.get(52)).toEqual({ kind: "OWNER_NOT_STATED" });
    expect(ownership.get(18)).toEqual({ kind: "NOT_A_PET" });
  });

  it("M13-B: every Ebon Might recipient carries the specialization the fight context states, never one from class", () => {
    const result = evaluated(evaluateAugmentationEvoker({ fight, identity }));
    const stated = new Map(
      (result.allyBuffs[0]?.windows ?? []).map((entry) => {
        const specialization = entry.recipientSpecialization;
        return [
          entry.window.recipient.actorId,
          specialization.state === "STATED" ? `${specialization.specName} ${specialization.className}` : null,
        ];
      }),
    );
    expect([...stated.entries()].sort(([a], [b]) => a - b)).toEqual([
      [3, "Balance Druid"],
      [4, "Arms Warrior"],
      [6, "Frost Mage"],
      [7, "Enhancement Shaman"],
      [10, "Shadow Priest"],
      [11, "Arcane Mage"],
      [14, "Marksmanship Hunter"],
      [15, "Havoc DemonHunter"],
      [16, "Havoc DemonHunter"],
      [17, "Subtlety Rogue"],
      [18, "Marksmanship Hunter"],
      [19, "Demonology Warlock"],
      [20, "Affliction Warlock"],
    ]);
    // A Prescience pet recipient is not a roster player: UNKNOWN, not its owner's (17, Subtlety).
    const pet = (result.allyBuffs[1]?.windows ?? []).find((entry) => entry.window.recipient.actorId === 50);
    expect(pet?.window.recipientIdentity).toMatchObject({ catalog: "LISTED", actorType: "PET" });
    expect(pet?.recipientSpecialization).toEqual({ state: "UNKNOWN", reason: "NOT_IN_FRIENDLY_ROSTER" });
  });

  it("recipient deaths: none lies inside a proven span, and each ended window's next death is the raw one", () => {
    const result = evaluated(evaluateAugmentationEvoker({ fight, identity }));
    const deaths = raw.filter((event) => event["type"] === "death");
    for (const observation of result.allyBuffs) {
      for (const entry of observation.windows) {
        const { fromReportTimeMs: from, toReportTimeMs: to } = entry.window.observedSpan;
        const expected = deaths
          .filter(
            (event) =>
              event["targetID"] === entry.window.recipient.actorId &&
              (event["targetInstance"] ?? null) === entry.window.recipient.instanceId &&
              (event["timestamp"] as number) >= from &&
              (event["timestamp"] as number) <= to,
          )
          .map((event) => event["timestamp"]);
        // Warcraft Logs removes the buff before the death event: no death is inside a span.
        expect(expected).toEqual([]);
        expect(entry.survival.inSpan).toEqual({ state: "NO_DEATH_OBSERVED" });
        const { end } = entry.window;
        if (end.kind !== "OBSERVED") {
          expect(entry.survival.nextDeathAfterEnd).toEqual({ state: "END_NOT_OBSERVED" });
          continue;
        }
        const next = deaths
          .filter(
            (event) =>
              event["targetID"] === entry.window.recipient.actorId &&
              (event["targetInstance"] ?? null) === entry.window.recipient.instanceId &&
              (event["timestamp"] as number) > end.reportTimeMs,
          )
          .map((event) => event["timestamp"] as number)
          .sort((a, b) => a - b)[0];
        expect(entry.survival.nextDeathAfterEnd).toEqual(
          next === undefined
            ? { state: "NONE_OBSERVED" }
            : expect.objectContaining({
                state: "OBSERVED",
                reportTimeMs: next,
                msAfterObservedEnd: next - end.reportTimeMs,
              }),
        );
      }
    }
    // The recipient of the last Ebon Might before the wipe: removed at 298,966, dead at 299,003.
    const ended = result.allyBuffs[0]?.windows.find(
      (entry) =>
        entry.window.recipient.actorId === 19 &&
        entry.window.end.kind === "OBSERVED" &&
        entry.window.end.reportTimeMs === 298_966,
    );
    expect(ended?.survival.nextDeathAfterEnd).toMatchObject({
      state: "OBSERVED",
      reportTimeMs: 299_003,
      msAfterObservedEnd: 37,
    });
  });

  it("cooldown overlap: NO_COOLDOWN_IDENTITY by default; with a supplied id, a real cast between the observed bounds is still not 'during the buff' without coverage", () => {
    const plain = evaluated(evaluateAugmentationEvoker({ fight, identity }));
    const first = plain.allyBuffs[0]?.windows.find((entry) => entry.window.boundsDistanceMs !== null);
    if (first === undefined) throw new Error("no bounded window");
    expect(first.cooldownOverlap).toEqual({ state: "NO_COOLDOWN_IDENTITY" });
    const { fromReportTimeMs: from, toReportTimeMs: to } = first.window.observedSpan;
    // The raw bytes do hold a cast by this recipient between the window's observed bounds.
    const recipientCast = raw.find(
      (event) =>
        event["type"] === "cast" &&
        event["sourceID"] === first.window.recipient.actorId &&
        (event["timestamp"] as number) > from &&
        (event["timestamp"] as number) < to,
    );
    if (recipientCast === undefined) throw new Error("no recipient cast in the first window");
    const supplied = evaluated(
      evaluateAugmentationEvoker({
        fight,
        identity,
        recipientCooldownIdentity: new Map([
          [first.window.recipient.actorId, [recipientCast["abilityGameID"] as number]],
        ]),
      }),
    );
    const same = supplied.allyBuffs[0]?.windows.find(
      (entry) =>
        entry.window.recipient.actorId === first.window.recipient.actorId &&
        entry.window.observedSpan.fromReportTimeMs === from,
    );
    // The filtered capture grants no AURAS coverage, so a removal and re-application
    // between the bounds cannot be excluded: no overlap is claimed.
    expect(same?.cooldownOverlap).toEqual({
      state: "CONTINUITY_NOT_ESTABLISHED",
      reason: "INSUFFICIENT_COVERAGE",
    });
  });

  it("the Evoker's own Ebon Might and Breath of Eons auras are observations of the Evoker only", () => {
    const result = evaluated(evaluateAugmentationEvoker({ fight, identity }));
    const self = result.selfBuffs[0];
    expect(self?.windows.windows.filter((window) => window.start.kind === "OBSERVED")).toHaveLength(
      rawCount(EBON_MIGHT_SELF, "applybuff"),
    );
    const breath = supportAuraWindowsOf(fight, { supporterActorId: EVOKER, auraAbilityGameIds: [BREATH] });
    expect(
      breath.windows.map((window) => [window.recipient.actorId, window.start.kind, window.end.kind]),
    ).toEqual([
      [EVOKER, "OBSERVED", "OBSERVED"],
      [EVOKER, "OBSERVED", "OBSERVED"],
    ]);
    expect(breath.listing.state).toBe("OBSERVED_ONLY");
  });
});

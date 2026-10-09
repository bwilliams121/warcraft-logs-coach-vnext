import { beforeAll, describe, expect, it } from "vitest";

import {
  actorsWithRetainedEvents,
  deriveOwnedPetScope,
  ownedPetSlice,
  serializeSlice,
} from "../../scripts/sanitize-probe.mjs";
import { observedActivityOf } from "../../src/combat-facts/activity.js";
import {
  actorsOwnedBy,
  bossSubtypeOf,
  describeActor,
  describeTarget,
} from "../../src/combat-facts/descriptors.js";
import { observationsOf, type ActorKey } from "../../src/combat-facts/observations.js";
import {
  evaluateWindowQuery,
  MEASURES,
  type Measure,
  type MeasureResult,
  type MeasureValue,
  type SourceScope,
  type WindowQuery,
} from "../../src/combat-facts/window-query.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import type { CorpusArtifactRecord } from "../support/corpus/contract.js";
import {
  committedEvidenceArchiveFiles,
  loadCommittedEvidenceArchive,
} from "../support/corpus/evidence-archive.js";
import { bundleOf, type BundleComposition } from "../support/corpus/fight.js";
import {
  canonicalBytesOf,
  committedCorpusFiles,
  sha256Hex,
  validateEvidenceArchive,
  type CorpusFileTable,
  type LoadedCorpus,
} from "../support/corpus/loader.js";

/**
 * M11-E2.1: the canonical full-fight Blood Death Knight fixture — report
 * b1PmaKrd6CDfzngc fight 48, focus 15 and the actors whose WCL petOwner is 15
 * — committed to the evidence archive as seven compact owned-pet segments and
 * their fight context, and re-proven here through the observed combat facts
 * substrate (E1). Every number below is a RAW fact the M11-E2 production
 * replay of the full capture reported before any slicing; the fixture must
 * reproduce it exactly. No analyzer runs and no verdict is formed.
 */

const FOCUS = 15;
const OWNED = [44, 45, 47, 224] as const;
const SCOPE = [FOCUS, ...OWNED];
const [FIGHT_START, FIGHT_END] = [7436292, 7781469];
const CONTEXT_ID = "wcl-fight-context-b1pm-fight-48";
const SEGMENT_NAMES = ["0-45", "45-113", "113-151", "151-214", "214-263", "263-311", "311-345"] as const;
const SEGMENT_IDS = SEGMENT_NAMES.map(
  (name) => `wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-${name}`,
);

type Raw = Record<string, unknown>;
type Json = Record<string, unknown>;

let archive: LoadedCorpus;
let composition: BundleComposition;
let fight: CombatFight;
let rawEvents: Raw[];

beforeAll(async () => {
  const loaded = await loadCommittedEvidenceArchive();
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
  archive = loaded.archive;
  composition = bundleOf(archive, SEGMENT_IDS, [], { catalogArtifactId: CONTEXT_ID });
  fight = composition.fight;
  rawEvents = SEGMENT_IDS.flatMap((id) => artifactJson(id) as Raw[]);
});

function artifactJson(artifactId: string): unknown {
  const entry = archive.referenceableArtifacts.find(
    (candidate) => candidate.record.artifactId === artifactId,
  );
  if (entry === undefined) throw new Error(`no artifact ${artifactId}`);
  return entry.json;
}

function recordOf(artifactId: string): CorpusArtifactRecord {
  const entry = archive.artifacts.find((candidate) => candidate.record.artifactId === artifactId);
  if (entry === undefined) throw new Error(`no artifact ${artifactId}`);
  return entry.record;
}

function query(sourceScope: SourceScope, extra: Partial<WindowQuery> = {}) {
  const result = evaluateWindowQuery(fight, {
    startMs: FIGHT_START,
    endMs: FIGHT_END,
    sourceScope,
    measures: MEASURES,
    ...extra,
  });
  if (!result.ok) throw new Error(result.reason);
  return result;
}

function measure(result: { readonly measures: readonly MeasureResult[] }, name: Measure): MeasureResult {
  const found = result.measures.find((entry) => entry.measure === name);
  if (found === undefined) throw new Error(`no measure ${name}`);
  return found;
}

/** The EXACT value of a scalar measure, or a loud failure. */
function exact(value: MeasureValue): unknown {
  if (value.shape !== "EVENT_COUNT" && value.shape !== "RAW_FIELD_SUM")
    throw new Error(`${value.shape} is not scalar`);
  if (value.value.kind !== "EXACT") throw new Error(`not EXACT: ${JSON.stringify(value.value)}`);
  return value.value.value;
}

const rawSum = (sum: number, events: number) => ({
  sumOfSuppliedValues: sum,
  eventsSupplyingField: events,
  eventsNotSupplyingField: 0,
});
const DIRECT: SourceScope = { kind: "DIRECT_PLAYER", playerActorId: FOCUS };
const ROLLUP: SourceScope = { kind: "OWNER_ROLLUP", ownerActorId: FOCUS };
const key = (target: ActorKey) =>
  `${String(target.actorId)}#${target.instanceId === null ? "-" : String(target.instanceId)}`;

// ---------------------------------------------------------------------------
// A–D: interval, derived scope, ownership
// ---------------------------------------------------------------------------

describe("the committed fixture's interval, scope and ownership", () => {
  it("A: represents the whole capture interval [7,436,292 .. 7,781,469] as one joined range, with no hole", () => {
    const records = SEGMENT_IDS.map(recordOf);
    for (const record of records) {
      expect(record.provenance.source?.query).toMatchObject({
        startTimeMs: FIGHT_START,
        endTimeMs: FIGHT_END,
      });
      expect(record.provenance.source?.completeness).toMatchObject({
        state: "COMPLETE",
        pagesRetrieved: 28,
        nextPageTimestamp: null,
        eventsReturned: 271011,
      });
      expect(record.provenance.source?.reportRevision).toBe(51);
      expect(record.provenance.source?.reportRevisionAfterCapture).toBe(51);
    }
    const ranges = records.map((record) => record.provenance.retainedCoverage.grants[0]?.ranges[0]);
    expect(ranges[0]?.fromReportTimeMs).toBe(FIGHT_START);
    expect(ranges[ranges.length - 1]?.toReportTimeMs).toBe(FIGHT_END);
    for (let index = 1; index < ranges.length; index += 1) {
      expect(ranges[index]?.fromReportTimeMs).toBe((ranges[index - 1]?.toReportTimeMs ?? 0) + 1);
    }
    expect(composition.holes).toEqual([]);
    for (const category of [
      "CASTS",
      "AURAS",
      "RESOURCES",
      "DAMAGE",
      "SUMMONS",
      "COMBATANT_INFO",
      "GEAR",
    ] as const) {
      const covered = composition.coveredRanges[category] ?? [];
      expect(covered, category).toHaveLength(1);
      expect(covered[0], category).toMatchObject({
        fromReportTimeMs: FIGHT_START,
        toReportTimeMs: FIGHT_END,
      });
      expect(fight.completeness.categories[category]).toMatchObject({ coverage: { state: "COMPLETE" } });
    }
    expect(rawEvents[0]).toMatchObject({ type: "encounterstart", timestamp: FIGHT_START, encounterID: 3455 });
    expect(rawEvents[rawEvents.length - 1]).toMatchObject({
      type: "encounterend",
      timestamp: FIGHT_END,
      kill: true,
    });
    expect(composition.events).toBe(11869);
  });

  it("B: the scope is DERIVED — focus 15 plus the catalog's petOwner-15 actors — in every grant and declaration", () => {
    const derived = deriveOwnedPetScope(artifactJson(CONTEXT_ID), FOCUS);
    expect(derived).toEqual({ ok: true, focusActorId: FOCUS, ownedActorIds: [...OWNED], actorScope: SCOPE });
    expect(actorsOwnedBy(fight, FOCUS)).toEqual([...OWNED]);
    for (const id of SEGMENT_IDS) {
      const record = recordOf(id);
      expect(record.provenance.actorSlice).toMatchObject({
        mode: "FOCUS_WITH_OWNED_PETS",
        focusActorId: FOCUS,
        ownedActorIds: [...OWNED],
        ownershipAuthority: "WCL_PET_OWNER",
        catalogArtifactId: CONTEXT_ID,
        actorlessFamilies: ["encounterstart", "encounterend"],
      });
      expect(record.provenance.retainedCoverage.grants.map((grant) => grant.actorScope)).toEqual([SCOPE]);
    }
    // Activity: 224 has no retained event anywhere; 47 has none in the last segment.
    expect(actorsWithRetainedEvents(rawEvents, SCOPE)).toEqual([15, 44, 45, 47]);
    expect(recordOf(SEGMENT_IDS[6] ?? "").provenance.actorSlice?.actorsWithoutRetainedEvents).toEqual([
      47, 224,
    ]);
  });

  it("C: 44, 45, 47 and 224 are owned by 15 by WCL master data, and their creature ids survive", () => {
    const gameIds = new Map([
      [44, 27893],
      [45, 217228],
      [47, 26125],
      [224, 218381],
    ]);
    for (const actorId of OWNED) {
      const descriptor = describeActor(fight, actorId);
      expect(descriptor.ownership, String(actorId)).toEqual({
        status: "OWNER_STATED_BY_WCL",
        ownerActorId: FOCUS,
      });
      expect(descriptor.catalogKind).toBe("PET");
      expect(fight.actors.get(actorId)?.gameId).toBe(gameIds.get(actorId));
    }
    expect(describeActor(fight, FOCUS)).toMatchObject({
      catalogKind: "PLAYER",
      subType: "DeathKnight",
      ownership: { status: "NO_OWNER_STATED", ownerActorId: null },
    });
  });

  it("D: actor 224 is an EXACT zero, not an unknown — a stated owner is not combat relevance", () => {
    const own = query({ kind: "SOURCE_ACTORS", actorIds: [224] });
    expect(own.memberActorIds).toEqual([224]);
    expect(measure(own, "DAMAGE_EVENT_COUNT").total).toMatchObject({ value: { kind: "EXACT", value: 0 } });
    expect(measure(own, "CAST_COMPLETE_EVENT_COUNT").total).toMatchObject({
      value: { kind: "EXACT", value: 0 },
    });
    expect(exact(measure(own, "RAW_AMOUNT_FIELD_SUM").total)).toEqual(rawSum(0, 0));
    const member = measure(query(ROLLUP), "RAW_AMOUNT_FIELD_SUM").byMember.find(
      (entry) => entry.actorId === 224,
    );
    expect(member?.coverage.state).toBe("COMPLETE");
    expect(member === undefined ? null : exact(member.value)).toEqual(rawSum(0, 0));
    expect(describeActor(fight, 224).summonEvidence.items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// H (report section): the E1 factual regression pins
// ---------------------------------------------------------------------------

describe("the E1 facts the production replay reported, reproduced from committed bytes", () => {
  it("focus DIRECT_PLAYER: 2,324 damage events, 668 COMPLETE / 0 BEGIN cast events, amount sum 37,386,630, 46 distinct targets", () => {
    const direct = query(DIRECT);
    expect(direct.memberActorIds).toEqual([FOCUS]);
    expect(exact(measure(direct, "DAMAGE_EVENT_COUNT").total)).toBe(2324);
    expect(exact(measure(direct, "CAST_COMPLETE_EVENT_COUNT").total)).toBe(668);
    expect(exact(measure(direct, "CAST_BEGIN_EVENT_COUNT").total)).toBe(0);
    expect(exact(measure(direct, "RAW_AMOUNT_FIELD_SUM").total)).toEqual(rawSum(37386630, 2324));
    const targets = measure(direct, "DISTINCT_TARGETS_OBSERVED").total;
    expect(targets.shape === "OBSERVED_TARGETS" ? targets.targets.items.length : null).toBe(46);
    expect(targets.shape === "OBSERVED_TARGETS" ? targets.targets.completeness.kind : null).toBe(
      "EXHAUSTIVE",
    );
  });

  it("focus filtered to WCL_BOSS_SUBTYPE targets: 1,449 damage events, amount sum 26,512,012, one target", () => {
    const boss = query(DIRECT, { targetMetadata: "WCL_BOSS_SUBTYPE" });
    expect(exact(measure(boss, "DAMAGE_EVENT_COUNT").total)).toBe(1449);
    expect(exact(measure(boss, "RAW_AMOUNT_FIELD_SUM").total)).toEqual(rawSum(26512012, 1449));
    const targets = measure(boss, "DISTINCT_TARGETS_OBSERVED").total;
    expect(targets.shape === "OBSERVED_TARGETS" ? targets.targets.items.map(key) : null).toEqual(["161#-"]);
  });

  it("OWNER_ROLLUP of 15: amount sum 45,709,411 = 37,386,630 + 7,060,330 + 1,014,118 + 248,333 + 0", () => {
    const rollup = query(ROLLUP);
    expect(rollup.memberActorIds).toEqual(SCOPE);
    const amount = measure(rollup, "RAW_AMOUNT_FIELD_SUM");
    expect(exact(amount.total)).toEqual(rawSum(45709411, 3761));
    expect(amount.byMember.map((member) => [member.actorId, exact(member.value)])).toEqual([
      [15, rawSum(37386630, 2324)],
      [44, rawSum(7060330, 1090)],
      [45, rawSum(1014118, 110)],
      [47, rawSum(248333, 237)],
      [224, rawSum(0, 0)],
    ]);
  });
});

// ---------------------------------------------------------------------------
// E–M: identities, views, raw fields
// ---------------------------------------------------------------------------

describe("identities and views survive the slice", () => {
  const instancesIn = (events: readonly Raw[], actorId: number): number[] =>
    [
      ...new Set(
        events
          .filter(
            (event) =>
              event["sourceID"] === actorId && (event["type"] === "damage" || event["type"] === "cast"),
          )
          .map((event) => event["sourceInstance"] as number),
      ),
    ].sort((a, b) => a - b);

  it("E: Rune Weapon (44) keeps its source and its 33 instance identities, each its own bySource entry", () => {
    const rune = query({ kind: "SOURCE_ACTORS", actorIds: [44] });
    const amount = measure(rune, "RAW_AMOUNT_FIELD_SUM");
    const sources = amount.bySource.map((entry) => entry.source);
    expect(sources.every((source) => source.actorId === 44 && source.instanceId !== null)).toBe(true);
    const fromRaw = instancesIn(rawEvents, 44);
    expect(fromRaw).toHaveLength(33);
    expect(
      [
        ...new Set(
          observationsOf(fight).damage.flatMap((event) =>
            event.source.kind === "ACTOR" && event.source.key.actorId === 44
              ? [event.source.key.instanceId]
              : [],
          ),
        ),
      ].sort((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual(
      fromRaw.filter((instance) =>
        rawEvents.some(
          (event) =>
            event["type"] === "damage" && event["sourceID"] === 44 && event["sourceInstance"] === instance,
        ),
      ),
    );
    expect(describeActor(fight, 44).summonEvidence.items).toHaveLength(35);
  });

  it("F: Blood Beast (45) keeps 4 instances and Risen Ghoul (47) keeps 3", () => {
    expect(instancesIn(rawEvents, 45)).toEqual([1, 2, 3, 4]);
    expect(instancesIn(rawEvents, 47)).toHaveLength(3);
    expect(describeActor(fight, 45).summonEvidence.items).toHaveLength(4);
    expect(describeActor(fight, 47).summonEvidence.items).toHaveLength(3);
  });

  it("G: OWNER_ROLLUP keeps its per-instance breakdown and its per-member totals", () => {
    const amount = measure(query(ROLLUP), "RAW_AMOUNT_FIELD_SUM");
    expect(amount.bySource).toHaveLength(41);
    const members = new Set(amount.bySource.map((entry) => entry.source.actorId));
    expect([...members].sort((a, b) => a - b)).toEqual([15, 44, 45, 47]);
    let total = 0;
    for (const entry of amount.bySource)
      total += (exact(entry.value) as { sumOfSuppliedValues: number }).sumOfSuppliedValues;
    expect(total).toBe(45709411);
  });

  it("H: DIRECT_PLAYER is distinct from OWNER_ROLLUP — it never folds a pet into the player", () => {
    const direct = measure(query(DIRECT), "RAW_AMOUNT_FIELD_SUM");
    expect(direct.bySource.map((entry) => entry.source.actorId)).toEqual([FOCUS]);
    expect(exact(direct.total)).not.toEqual(exact(measure(query(ROLLUP), "RAW_AMOUNT_FIELD_SUM").total));
  });

  it("I: every raw damage field round-trips exactly, by its v2 key", () => {
    const rawDamage = rawEvents.filter((event) => event["type"] === "damage");
    const observed = observationsOf(fight).damage;
    expect(observed).toHaveLength(rawDamage.length);
    observed.forEach((event, index) => {
      const raw = rawDamage[index] ?? {};
      const field = (name: string) => (typeof raw[name] === "number" ? raw[name] : null);
      expect(event.reportTimeMs).toBe(raw["timestamp"]);
      expect(event.abilityGameId).toBe(raw["abilityGameID"]);
      expect(event.raw.amountField).toBe(raw["amount"]);
      expect(event.raw.absorbedField).toBe(field("absorbed"));
      expect(event.raw.mitigatedField).toBe(field("mitigated"));
      expect(event.raw.unmitigatedAmountField).toBe(field("unmitigatedAmount"));
      expect(event.raw.blockedField).toBe(field("blocked"));
      expect(event.raw.overkillField).toBe(field("overkill"));
      expect(event.hitTypeRaw).toBe(field("hitType"));
    });
    // The one overkill blow by the focus keeps raw amount and raw overkill apart.
    const overkill = observed.filter((event) => event.raw.overkillField !== null);
    expect(
      overkill.map((event) => [event.reportTimeMs, event.raw.amountField, event.raw.overkillField]),
    ).toContainEqual([7555518, 82987, 116341]);
  });

  it("J: a key the event did not supply stays null / NOT_SUPPLIED, never 0 or false", () => {
    const rawDamage = rawEvents.filter((event) => event["type"] === "damage");
    const observed = observationsOf(fight).damage;
    let checkedAbsorbed = 0;
    let checkedTick = 0;
    observed.forEach((event, index) => {
      const raw = rawDamage[index] ?? {};
      if (!("absorbed" in raw)) {
        expect(event.raw.absorbedField).toBeNull();
        checkedAbsorbed += 1;
      }
      if (!("tick" in raw)) {
        expect(event.tickField).toBe("NOT_SUPPLIED");
        checkedTick += 1;
      }
    });
    expect(checkedAbsorbed).toBeGreaterThan(0);
    expect(checkedTick).toBeGreaterThan(0);
    const direct = query(DIRECT);
    expect(exact(measure(direct, "TICK_TRUE_COUNT").total)).toBe(474);
    expect(exact(measure(direct, "TICK_NOT_SUPPLIED_COUNT").total)).toBe(1850);
  });

  it("K: hitType stays the raw number — no crit/hit/miss label exists", () => {
    const distribution = measure(query(DIRECT), "HITTYPE_RAW_DISTRIBUTION").total;
    expect(distribution.shape).toBe("HITTYPE_RAW_DISTRIBUTION");
    if (distribution.shape !== "HITTYPE_RAW_DISTRIBUTION") return;
    expect(distribution.buckets.items).toEqual([
      { hitTypeRaw: 1, observedEventCount: 1781 },
      { hitTypeRaw: 2, observedEventCount: 531 },
      { hitTypeRaw: 10, observedEventCount: 12 },
    ]);
    expect(Object.keys(distribution.buckets.items[0] ?? {}).sort()).toEqual([
      "hitTypeRaw",
      "observedEventCount",
    ]);
  });

  it("L: BEGIN and COMPLETE cast events stay separate; begincast is retained, so 0 BEGIN is EXACT", () => {
    const direct = query(DIRECT);
    expect(measure(direct, "CAST_BEGIN_EVENT_COUNT").total).toMatchObject({
      castPhase: "BEGIN",
      value: { kind: "EXACT", value: 0 },
    });
    const sequence = measure(direct, "CAST_EVENT_SEQUENCE").total;
    if (sequence.shape !== "CAST_EVENT_SEQUENCE") throw new Error("not a sequence");
    expect(sequence.events.items).toHaveLength(668);
    expect(new Set(sequence.events.items.map((entry) => entry.phase))).toEqual(new Set(["COMPLETE"]));
    expect(recordOf(SEGMENT_IDS[0] ?? "").provenance.actorSlice?.families).toContain("begincast");
  });

  it("M: target collections are evidence only — instance keys, never a hostility or targetability claim", () => {
    const targets = measure(query(DIRECT), "DISTINCT_TARGETS_OBSERVED").total;
    if (targets.shape !== "OBSERVED_TARGETS") throw new Error("not targets");
    for (const target of targets.targets.items) {
      expect(Object.keys(target).sort()).toEqual(["actorId", "instanceId"]);
      expect(describeTarget(fight, target.actorId)).toMatchObject({
        hostility: "UNKNOWN",
        targetability: "UNKNOWN",
      });
    }
  });

  it("N: the focus's WCL_BOSS_SUBTYPE target is actor 161 alone, and the -1 sentinel is never a boss", () => {
    expect(describeTarget(fight, 161)).toMatchObject({ subType: "Boss", bossSubtype: "WCL_BOSS_SUBTYPE" });
    expect(bossSubtypeOf(fight, -1)).toBe("NO_ACTOR_SENTINEL");
    // The catalog lists six Boss-subtype actors; the focus damaged exactly one of them.
    const catalogued = [...fight.actors.values()].filter(
      (actor) => bossSubtypeOf(fight, actor.actorId) === "WCL_BOSS_SUBTYPE",
    );
    expect(catalogued.map((actor) => actor.actorId).sort((a, b) => a - b)).toEqual([
      23, 101, 102, 161, 222, 223,
    ]);
    const all = measure(query(DIRECT), "DISTINCT_TARGETS_OBSERVED").total;
    if (all.shape !== "OBSERVED_TARGETS") throw new Error("not targets");
    expect(
      all.targets.items
        .filter((target) => bossSubtypeOf(fight, target.actorId) === "WCL_BOSS_SUBTYPE")
        .map(key),
    ).toEqual(["161#-"]);
    expect(all.targets.items.some((target) => target.actorId === -1)).toBe(false);
  });

  it("O: the friendly Paladin (3) the focus 'damaged' through ability 6940 is a target, not an enemy", () => {
    const viaSacrifice = observationsOf(fight).damage.filter(
      (event) =>
        event.source.kind === "ACTOR" && event.source.key.actorId === FOCUS && event.abilityGameId === 6940,
    );
    expect(viaSacrifice).toHaveLength(44);
    expect(
      new Set(viaSacrifice.map((event) => (event.target.kind === "ACTOR" ? event.target.key.actorId : null))),
    ).toEqual(new Set([3]));
    expect(describeTarget(fight, 3)).toMatchObject({
      catalogKind: "PLAYER",
      subType: "Paladin",
      bossSubtype: "NOT_WCL_BOSS_SUBTYPE",
      hostility: "UNKNOWN",
    });
    const boss = measure(
      query(DIRECT, { targetMetadata: "WCL_BOSS_SUBTYPE" }),
      "DISTINCT_TARGETS_OBSERVED",
    ).total;
    expect(
      boss.shape === "OBSERVED_TARGETS" ? boss.targets.items.some((target) => target.actorId === 3) : true,
    ).toBe(false);
  });

  it("P: no presence interval is produced — activity is first/last observation only, and none is not absence", () => {
    for (const actorId of SCOPE) {
      const activity = observedActivityOf(fight, actorId);
      expect(Object.keys(activity).sort()).toEqual(["actorId", "observationExtremes", "observations"]);
      expect(activity.observations.completeness).toEqual({ kind: "OBSERVED_ONLY", coverage: null });
    }
    expect(observedActivityOf(fight, 224).observationExtremes).toBeNull();
    expect(observedActivityOf(fight, 44).observationExtremes).toMatchObject({
      firstObservedAtMs: 7438781,
      lastObservedAtMs: 7781463,
    });
  });
});

// ---------------------------------------------------------------------------
// Q, T: deaths and excluded families
// ---------------------------------------------------------------------------

describe("raw deaths and excluded families", () => {
  // M11-F promoted DEATHS to a POSITIVE event capability (owner-approved): the
  // four deaths now normalize as DEATH facts. What Q protected in E2.1 still
  // holds: the raw facts survive verbatim, nothing is invented about killers,
  // and this composed fight grants no death-retrieval coverage at all.
  it("Q: the four raw deaths in scope survive verbatim as positive DEATH facts, with no coverage granted", () => {
    const deaths = rawEvents.filter((event) => event["type"] === "death");
    expect(
      deaths.map((event) => [
        event["timestamp"],
        event["sourceID"],
        event["targetID"],
        event["targetInstance"],
      ]),
    ).toEqual([
      [7449399, -1, 45, 1],
      [7559744, -1, 45, 2],
      [7659417, -1, 45, 3],
      [7750936, -1, 45, 4],
    ]);
    // None of these four carries a killer field; its absence is preserved, not invented.
    expect(deaths.some((event) => "killerID" in event || "killingAbilityGameID" in event)).toBe(false);
    const normalized = fight.events.filter((event) => event.locator.rawType === "death");
    expect(normalized).toHaveLength(4);
    expect(normalized.map((event) => event.kind)).toEqual(["DEATH", "DEATH", "DEATH", "DEATH"]);
    for (const event of normalized) {
      if (event.kind !== "DEATH") continue;
      expect(event.killer).toBe("NOT_SUPPLIED");
      expect(event.killingAbilityGameId).toBe("NOT_SUPPLIED");
    }
    // The archive grants never named DEATHS, so the composed fight holds no
    // death-retrieval coverage: positive facts only.
    expect(fight.completeness.categories.DEATHS).toEqual({ capability: "UNVERIFIED" });
  });

  it("T: excluded healing and absorbs are never COMPLETE — no grant names them, and none is inferred", () => {
    for (const id of SEGMENT_IDS) {
      const granted = recordOf(id).provenance.retainedCoverage.grants.flatMap((grant) => grant.categories);
      expect(granted).not.toContain("HEALING");
      expect(granted).not.toContain("ABSORBS");
    }
    expect(fight.completeness.categories.HEALING).toMatchObject({ coverage: { state: "ABSENT" } });
    expect(fight.completeness.categories.ABSORBS).toMatchObject({ coverage: { state: "ABSENT" } });
    expect(fight.completeness.categories.TARGETABILITY).toEqual({ capability: "UNVERIFIED" });
    expect(
      rawEvents.some((event) => ["heal", "absorbed", "healabsorbed"].includes(event["type"] as string)),
    ).toBe(false);
  });

  it("decodes cleanly: every retained event normalizes, nothing malformed, no category degraded", () => {
    expect(fight.events).toHaveLength(rawEvents.length);
    expect(fight.malformedObservations).toEqual([]);
    expect(fight.events.some((event) => event.kind === "MALFORMED_FAMILY")).toBe(false);
    expect(fight.completeness.categories.ACTORS).toMatchObject({
      capability: "OBSERVABLE",
      coverage: { state: "COMPLETE" },
    });
  });
});

// ---------------------------------------------------------------------------
// Independent sources and an externally supplied window
// ---------------------------------------------------------------------------

describe("pets as independent sources, without OWNER_ROLLUP", () => {
  it.each([
    [44, 7060330, 1090],
    [45, 1014118, 110],
  ])("SOURCE_ACTORS [%i] answers on its own, with its own breakdown", (actorId, amount, events) => {
    const own = query({ kind: "SOURCE_ACTORS", actorIds: [actorId] });
    expect(own.memberActorIds).toEqual([actorId]);
    const sum = measure(own, "RAW_AMOUNT_FIELD_SUM");
    expect(exact(sum.total)).toEqual(rawSum(amount, events));
    expect(sum.bySource.every((entry) => entry.source.actorId === actorId)).toBe(true);
    // An independent raw tally from the committed JSON agrees.
    const raw = rawEvents.filter(
      (event) =>
        event["type"] === "damage" &&
        event["sourceID"] === actorId &&
        (event["timestamp"] as number) >= FIGHT_START &&
        (event["timestamp"] as number) < FIGHT_END,
    );
    expect(raw.reduce((total, event) => total + (event["amount"] as number), 0)).toBe(amount);
  });

  it("a window supplied by the CALLER (the first Dancing Rune Weapon buff on 15, read here from raw auras) returns casts, raw sums and targets — the substrate does not define it", () => {
    // The test, not combat-facts, decides what the window is.
    const auras = rawEvents.filter(
      (event) => event["abilityGameID"] === 81256 && event["targetID"] === FOCUS,
    );
    const start = auras.find((event) => event["type"] === "applybuff")?.["timestamp"] as number;
    const end = auras.find(
      (event) => event["type"] === "removebuff" && (event["timestamp"] as number) > start,
    )?.["timestamp"] as number;
    expect([start, end]).toEqual([7438780, 7457435]);
    const window = { startMs: start, endMs: end + 1 };
    const result = query({ kind: "SOURCE_ACTORS", actorIds: [44] }, window);
    const inWindow = (event: Raw) =>
      event["sourceID"] === 44 &&
      (event["timestamp"] as number) >= window.startMs &&
      (event["timestamp"] as number) < window.endMs;
    const rawCasts = rawEvents.filter((event) => event["type"] === "cast" && inWindow(event));
    const rawDamage = rawEvents.filter((event) => event["type"] === "damage" && inWindow(event));
    const sequence = measure(result, "CAST_EVENT_SEQUENCE").total;
    if (sequence.shape !== "CAST_EVENT_SEQUENCE") throw new Error("not a sequence");
    expect(sequence.events.completeness.kind).toBe("EXHAUSTIVE");
    expect(sequence.events.items.map((entry) => [entry.reportTimeMs, entry.abilityGameId])).toEqual(
      rawCasts.map((event) => [event["timestamp"], event["abilityGameID"]]),
    );
    expect(exact(measure(result, "RAW_AMOUNT_FIELD_SUM").total)).toEqual(
      rawSum(
        rawDamage.reduce((total, event) => total + (event["amount"] as number), 0),
        rawDamage.length,
      ),
    );
    const targets = measure(result, "DISTINCT_TARGETS_OBSERVED").total;
    if (targets.shape !== "OBSERVED_TARGETS") throw new Error("not targets");
    expect(targets.targets.items.map(key).sort()).toEqual(
      [
        ...new Set(
          rawDamage.map(
            (event) =>
              `${String(event["targetID"])}#${event["targetInstance"] === undefined ? "-" : String(event["targetInstance"])}`,
          ),
        ),
      ].sort(),
    );
    expect(rawCasts.length).toBeGreaterThan(0);
    expect(rawDamage.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// R: determinism
// ---------------------------------------------------------------------------

describe("compact re-slicing", () => {
  it("R: re-cutting the committed events at the recorded bounds reproduces every segment byte for byte", () => {
    const files = committedEvidenceArchiveFiles();
    const derived = deriveOwnedPetScope(artifactJson(CONTEXT_ID), FOCUS);
    if (!derived.ok) throw new Error(derived.error);
    for (const id of SEGMENT_IDS) {
      const record = recordOf(id);
      const slice = record.provenance.actorSlice;
      const range = record.provenance.retainedCoverage.grants[0]?.ranges[0];
      if (slice === undefined || range === undefined) throw new Error(id);
      const recut = ownedPetSlice(rawEvents, derived.actorScope, {
        fromMs: range.fromReportTimeMs - 1,
        untilMs: range.toReportTimeMs,
        families: slice.families,
        actorlessFamilies: slice.actorlessFamilies,
      });
      expect(serializeSlice(recut, true), id).toBe(files[record.path]);
      // Twice, to the same bytes.
      expect(serializeSlice(recut, true)).toBe(serializeSlice(recut, true));
    }
  });

  it("the default serialization is unchanged, so every earlier artifact stays byte-identical", () => {
    const files = committedEvidenceArchiveFiles();
    const path = "artifacts/wcl-events/wcl-brewmaster-monk-gtkb-full-fight.seg-165-285.json";
    const text = files[path] ?? "";
    expect(serializeSlice(JSON.parse(text) as unknown[])).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// S: the loader and the slicer fail closed
// ---------------------------------------------------------------------------

describe("S: an owned-pet declaration that disagrees with its catalog or its bytes is refused", () => {
  const SEGMENT_PATH = `artifacts/wcl-events/${SEGMENT_IDS[0] ?? ""}.json`;
  const CONTEXT_PATH = `artifacts/wcl-graphql/${CONTEXT_ID}.json`;

  function manifestOf(files: CorpusFileTable): Json & { artifacts: Json[] } {
    return JSON.parse(files["manifest.json"] ?? "null") as Json & { artifacts: Json[] };
  }

  async function errorsAfter(
    edit: (manifest: Json & { artifacts: Json[] }, files: Record<string, string>) => Promise<void> | void,
  ) {
    const files: Record<string, string> = { ...committedEvidenceArchiveFiles() };
    const manifest = manifestOf(files);
    await edit(manifest, files);
    files["manifest.json"] = JSON.stringify(manifest);
    const result = await validateEvidenceArchive(files, committedCorpusFiles());
    return result.ok ? [] : result.errors;
  }

  function record(
    manifest: { artifacts: Json[] },
    artifactId: string,
  ): Json & { provenance: Json & { actorSlice: Json; retainedCoverage: { grants: Json[] } } } {
    const found = manifest.artifacts.find((entry) => entry["artifactId"] === artifactId);
    if (found === undefined) throw new Error(artifactId);
    return found as Json & { provenance: Json & { actorSlice: Json; retainedCoverage: { grants: Json[] } } };
  }

  async function rewrite(
    manifest: { artifacts: Json[] },
    files: Record<string, string>,
    artifactId: string,
    path: string,
    text: string,
  ) {
    files[path] = text;
    const entry = record(manifest, artifactId);
    entry["sha256"] = await sha256Hex(canonicalBytesOf(text));
    entry["byteLength"] = canonicalBytesOf(text).byteLength;
  }

  const sliceCodes = (errors: readonly { readonly code: string }[]) => [
    ...new Set(errors.map((error) => error.code)),
  ];

  it("the committed archive itself passes", async () => {
    expect(await errorsAfter(() => undefined)).toEqual([]);
  });

  it("refuses a declared owned set the catalog does not state", async () => {
    const errors = await errorsAfter((manifest) => {
      record(manifest, SEGMENT_IDS[0] ?? "").provenance.actorSlice["ownedActorIds"] = [44, 45, 47];
    });
    expect(sliceCodes(errors)).toEqual(["ACTOR_SLICE_INVALID"]);
    expect(errors[0]?.message).toContain("petOwner links give [44, 45, 47, 224]");
  });

  it("refuses a grant whose actor scope is not focus + owned", async () => {
    const errors = await errorsAfter((manifest) => {
      const grant = record(manifest, SEGMENT_IDS[1] ?? "").provenance.retainedCoverage.grants[0];
      if (grant !== undefined) grant["actorScope"] = [15];
    });
    expect(sliceCodes(errors)).toContain("ACTOR_SLICE_INVALID");
  });

  it("refuses a grant for an excluded family (HEALING) — T at the loader", async () => {
    const errors = await errorsAfter((manifest) => {
      const grant = record(manifest, SEGMENT_IDS[2] ?? "").provenance.retainedCoverage.grants[0];
      if (grant !== undefined) grant["categories"] = [...(grant["categories"] as string[]), "HEALING"];
    });
    expect(sliceCodes(errors)).toEqual(["ACTOR_SLICE_INVALID"]);
    expect(errors[0]?.message).toContain("HEALING");
  });

  it("refuses a focus the catalog cannot resolve", async () => {
    const errors = await errorsAfter((manifest) => {
      record(manifest, SEGMENT_IDS[0] ?? "").provenance.actorSlice["focusActorId"] = 99999;
    });
    expect(sliceCodes(errors)).toEqual(["ACTOR_SLICE_INVALID"]);
    expect(errors[0]?.message).toContain("not in the catalog");
  });

  it("refuses contradictory catalog ownership (an actor id listed twice)", async () => {
    const errors = await errorsAfter(async (manifest, files) => {
      const context = JSON.parse(files[CONTEXT_PATH] ?? "null") as {
        reportData: { report: { masterData: { actors: Json[] } } };
      };
      const actors = context.reportData.report.masterData.actors;
      actors.push({ ...(actors.find((actor) => actor["id"] === 44) ?? {}), petOwner: 3 });
      await rewrite(manifest, files, CONTEXT_ID, CONTEXT_PATH, JSON.stringify(context));
    });
    expect(sliceCodes(errors)).toEqual(["ACTOR_SLICE_INVALID"]);
    expect(errors[0]?.message).toContain("listed more than once");
  });

  it("refuses a catalog whose petOwner links no longer give the declared set", async () => {
    const errors = await errorsAfter(async (manifest, files) => {
      const context = JSON.parse(files[CONTEXT_PATH] ?? "null") as {
        reportData: { report: { masterData: { actors: Json[] } } };
      };
      const pet = context.reportData.report.masterData.actors.find((actor) => actor["id"] === 224);
      if (pet !== undefined) pet["petOwner"] = null;
      await rewrite(manifest, files, CONTEXT_ID, CONTEXT_PATH, JSON.stringify(context));
    });
    expect(sliceCodes(errors)).toEqual(["ACTOR_SLICE_INVALID"]);
  });

  it("refuses an event whose source and target are outside the declared scope", async () => {
    const errors = await errorsAfter(async (manifest, files) => {
      const events = JSON.parse(files[SEGMENT_PATH] ?? "[]") as Json[];
      events.splice(5, 0, {
        timestamp: 7440000,
        type: "damage",
        sourceID: 3,
        targetID: 161,
        abilityGameID: 1,
        amount: 1,
      });
      await rewrite(manifest, files, SEGMENT_IDS[0] ?? "", SEGMENT_PATH, serializeSlice(events, true));
    });
    expect(sliceCodes(errors)).toEqual(["ACTOR_SLICE_INVALID"]);
    expect(errors[0]?.message).toContain("source 3, target 161");
  });

  it("refuses an activity split the events do not show", async () => {
    const errors = await errorsAfter((manifest) => {
      const slice = record(manifest, SEGMENT_IDS[0] ?? "").provenance.actorSlice;
      slice["actorsWithRetainedEvents"] = SCOPE;
      slice["actorsWithoutRetainedEvents"] = [];
    });
    expect(sliceCodes(errors)).toEqual(["ACTOR_SLICE_INVALID"]);
  });

  it("the slicer's derivation refuses the same catalogs, and never recurses or reads summons", () => {
    const catalog = (actors: readonly Json[]) => ({ reportData: { report: { masterData: { actors } } } });
    const player = { id: 15, type: "Player", petOwner: null };
    expect(deriveOwnedPetScope(catalog([{ id: 2, type: "Pet", petOwner: 15 }]), 15)).toMatchObject({
      ok: false,
    });
    expect(deriveOwnedPetScope(catalog([player, player]), 15)).toMatchObject({ ok: false });
    expect(deriveOwnedPetScope(catalog([player, { id: 3, type: "Player", petOwner: 15 }]), 15)).toMatchObject(
      { ok: false },
    );
    expect(deriveOwnedPetScope(catalog([{ id: 15, type: "Player", petOwner: 15 }]), 15)).toMatchObject({
      ok: false,
    });
    expect(deriveOwnedPetScope(catalog([player, { id: 4, type: "Pet", petOwner: "15" }]), 15)).toMatchObject({
      ok: false,
    });
    expect(deriveOwnedPetScope({}, 15)).toMatchObject({ ok: false });
    // A pet of a pet is not owned by the focus; a null owner is nobody's.
    expect(
      deriveOwnedPetScope(
        catalog([
          player,
          { id: 4, type: "Pet", petOwner: 15 },
          { id: 5, type: "Pet", petOwner: 4 },
          { id: 6, type: "Pet", petOwner: null },
        ]),
        15,
      ),
    ).toEqual({ ok: true, focusActorId: 15, ownedActorIds: [4], actorScope: [4, 15] });
    // The predicate keeps an actorless event only when its family is listed AND it carries no actor key.
    const events = [
      { type: "encounterstart", timestamp: 1 },
      { type: "encounterend", timestamp: 2, sourceID: 99 },
      { type: "phasestart", timestamp: 3 },
      { type: "damage", timestamp: 4, sourceID: 4, targetID: 161 },
    ];
    expect(ownedPetSlice(events, [4, 15], { actorlessFamilies: ["encounterstart", "encounterend"] })).toEqual(
      [events[0], events[3]],
    );
  });
});

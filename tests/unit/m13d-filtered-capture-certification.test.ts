/**
 * M13-D: completeness certificates for a server-filtered capture, proven
 * against trusted Warcraft Logs tables (owner decision 2026-11-02,
 * agent/autopilot-queue.md "M13-D").
 *
 * The synthetic blocks pin every refusal rule — each is a way a table could
 * "agree" without proving the same facts. The last block reads the committed
 * real evidence: the M13-A segments and the M13-D table artifact, and pins
 * which streams are certified, which are refused, and what that changes (and
 * does not change) in the Augmentation facts.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  certifiedCoverageCovers,
  type CertifiedCoverage,
} from "../../src/engine/evidence/certified-coverage.js";
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import {
  certifyFilteredCapture,
  withCertifiedCoverage,
} from "../../src/engine/evidence/filtered-capture-certification.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { createNormalizer } from "../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../src/engine/normalization/supported-families.js";
import { gateAbsenceClaim, gateCertifiedAbsenceClaim } from "../../src/engine/state/state-result.js";
import {
  evaluateAugmentationEvoker,
  type AugmentationEvokerEvaluation,
} from "../../src/specs/evoker/augmentation/evaluator.js";
import { supportAuraWindowsOf } from "../../src/support/support-aura-windows.js";
import {
  decodeCertificationTables,
  type AuraTargetTable,
  type CastTableLeaf,
  type CertificationTables,
  type TableArguments,
} from "../../src/wcl/filtered-capture-tables.js";
import type { EvidenceCategory } from "../../src/wcl/evidence-capability.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import { loadCommittedEvidenceArchive } from "../support/corpus/evidence-archive.js";
import { bundleOf } from "../support/corpus/fight.js";
import { absentCategory, syntheticFight } from "../support/synthetic-fight.js";

type Raw = Record<string, unknown>;
const START = 1_000;
const END = 100_000;
const WHOLE = inclusiveRange(START, END);
const EVOKER = 1;
const ALLY = 4;
const OTHER = 6;
const EBON = 395152;
const PRESCIENCE = 410089;

function fightOf(raw: readonly Raw[]): CombatFight {
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
  // A filtered capture: nothing granted, as the corpus loader enforces.
  return syntheticFight({
    events: output.events,
    startTimeMs: START,
    endTimeMs: END,
    categories: { CASTS: absentCategory(), AURAS: absentCategory() },
    scope: "FULL_RAID",
  });
}

const aura = (timestamp: number, type: string, target: number, ability = EBON, extra: Raw = {}): Raw => ({
  timestamp,
  type,
  sourceID: EVOKER,
  targetID: target,
  abilityGameID: ability,
  fight: 1,
  ...extra,
});
const cast = (timestamp: number, source: number | null, ability: number | null, type = "cast"): Raw => ({
  timestamp,
  type,
  ...(source === null ? {} : { sourceID: source }),
  targetID: -1,
  ...(ability === null ? {} : { abilityGameID: ability }),
  fight: 1,
});

const buffsArgs = (abilityId: number): TableArguments => ({
  dataType: "Buffs",
  startTimeMs: START,
  endTimeMs: END,
  hostilityType: "Friendlies",
  abilityId,
  sourceId: null,
});
const castsArgs = (sourceId: number): TableArguments => ({
  dataType: "Casts",
  startTimeMs: START,
  endTimeMs: END,
  hostilityType: "Friendlies",
  abilityId: null,
  sourceId,
});
const auraTable = (
  abilityId: number,
  targets: readonly { id: number; uses: number; bands: readonly (readonly [number, number])[] }[],
): AuraTargetTable => ({
  arguments: buffsArgs(abilityId),
  startTimeMs: START,
  endTimeMs: END,
  targets: targets.map((target) => ({
    targetActorId: target.id,
    totalUses: target.uses,
    bands: target.bands.map(([from, to]) => ({ startTimeMs: from, endTimeMs: to })),
  })),
});
const abilityTable = (
  rows: readonly { ability: number; total: number; actor?: number | null }[],
): readonly CastTableLeaf[] =>
  rows.map((row) => ({
    abilityGameId: row.ability,
    actorId: row.actor === undefined ? EVOKER : row.actor,
    total: row.total,
  }));

function tablesFor(
  fight: CombatFight,
  parts: {
    auras?: readonly AuraTargetTable[];
    casts?: readonly (readonly [number, readonly CastTableLeaf[]])[];
    override?: Partial<CertificationTables>;
  },
): CertificationTables {
  return {
    reportCode: fight.report.code,
    revision: fight.report.revision,
    fight: { id: fight.fight.id, startTimeMs: START, endTimeMs: END },
    auraTargetTables: new Map((parts.auras ?? []).map((table) => [table.arguments.abilityId ?? -1, table])),
    castTables: new Map(
      (parts.casts ?? []).map(
        ([actor, table]) => [actor, { arguments: castsArgs(actor), leaves: table }] as const,
      ),
    ),
    ...parts.override,
  };
}

const EBON_EVENTS = [
  aura(5_000, "applybuff", ALLY),
  aura(5_000, "applybuff", OTHER),
  aura(9_000, "refreshbuff", ALLY),
  aura(15_000, "removebuff", ALLY),
  aura(15_000, "removebuff", OTHER),
];
const EBON_TABLE = auraTable(EBON, [
  { id: ALLY, uses: 2, bands: [[5_000, 15_000]] },
  { id: OTHER, uses: 1, bands: [[5_000, 15_000]] },
]);

describe("certified coverage: a claim is admitted only inside its stated predicate", () => {
  const range = inclusiveRange(START, END);
  const auraCoverage = {
    kind: "AURA_WINDOWS",
    abilityGameId: EBON,
    targetHostility: "FRIENDLIES",
    excludedTargetActorIds: [OTHER],
    provenTargetActorIds: [ALLY],
    range,
    certificateId: "aura-windows:395152",
  } as const satisfies CertifiedCoverage;
  const castCoverage: CertifiedCoverage = {
    kind: "COMPLETED_CASTS",
    sourceActorId: EVOKER,
    abilityGameIds: [EBON],
    range,
    certificateId: "completed-casts:1",
  };
  const every = { kind: "EVERY_FRIENDLY_TARGET" } as const;

  it("proves one target's track, never a listing over an excluded target", () => {
    const one = (actorId: number) => ({ kind: "ONE_TARGET", actorId }) as const;
    expect(
      certifiedCoverageCovers(
        [auraCoverage],
        { kind: "AURA_WINDOWS", abilityGameIds: [EBON], targets: one(ALLY) },
        range,
      ),
    ).toBe(true);
    expect(
      certifiedCoverageCovers(
        [auraCoverage],
        { kind: "AURA_WINDOWS", abilityGameIds: [EBON], targets: one(OTHER) },
        range,
      ),
    ).toBe(false);
    expect(
      certifiedCoverageCovers(
        [auraCoverage],
        { kind: "AURA_WINDOWS", abilityGameIds: [EBON], targets: every },
        range,
      ),
    ).toBe(false);
    expect(
      certifiedCoverageCovers(
        [{ ...auraCoverage, excludedTargetActorIds: [] }],
        { kind: "AURA_WINDOWS", abilityGameIds: [EBON], targets: every },
        range,
      ),
    ).toBe(true);
    // An actor neither excluded nor proven (never examined: hostile, unresolved,
    // or a holder of nothing) is never proven one at a time, even under an
    // otherwise clean listing.
    for (const actorId of [21, 999]) {
      expect(
        certifiedCoverageCovers(
          [{ ...auraCoverage, excludedTargetActorIds: [] }],
          { kind: "AURA_WINDOWS", abilityGameIds: [EBON], targets: one(actorId) },
          range,
        ),
      ).toBe(false);
    }
  });

  it("never widens to another ability, a longer range, an empty ability list or the other kind", () => {
    const clean = { ...auraCoverage, excludedTargetActorIds: [] };
    expect(
      certifiedCoverageCovers(
        [clean],
        { kind: "AURA_WINDOWS", abilityGameIds: [EBON, PRESCIENCE], targets: every },
        range,
      ),
    ).toBe(false);
    expect(
      certifiedCoverageCovers(
        [clean],
        { kind: "AURA_WINDOWS", abilityGameIds: [EBON], targets: every },
        inclusiveRange(START, END + 1),
      ),
    ).toBe(false);
    expect(
      certifiedCoverageCovers([clean], { kind: "AURA_WINDOWS", abilityGameIds: [], targets: every }, range),
    ).toBe(false);
    expect(
      certifiedCoverageCovers(
        [clean],
        { kind: "COMPLETED_CASTS", sourceActorId: EVOKER, abilityGameIds: [EBON] },
        range,
      ),
    ).toBe(false);
    expect(
      certifiedCoverageCovers(
        [castCoverage],
        { kind: "COMPLETED_CASTS", sourceActorId: EVOKER, abilityGameIds: [EBON, 409311] },
        range,
      ),
    ).toBe(false);
    expect(
      certifiedCoverageCovers(
        [castCoverage],
        { kind: "COMPLETED_CASTS", sourceActorId: ALLY, abilityGameIds: [EBON] },
        range,
      ),
    ).toBe(false);
    expect(
      certifiedCoverageCovers(
        [castCoverage],
        { kind: "COMPLETED_CASTS", sourceActorId: EVOKER, abilityGameIds: [EBON] },
        inclusiveRange(START + 10, END - 10),
      ),
    ).toBe(true);
  });

  it("the certified gate is the category gate unless coverage proves exactly the predicate, and never crosses categories", () => {
    const fight = fightOf([]);
    const plain = {
      completeness: fight.completeness,
      category: "CASTS" as EvidenceCategory,
      range,
      actorId: EVOKER,
    };
    const predicate = { kind: "COMPLETED_CASTS", sourceActorId: EVOKER, abilityGameIds: [EBON] } as const;
    expect(gateCertifiedAbsenceClaim({ ...plain, predicate })).toEqual(gateAbsenceClaim(plain));
    const certified = { ...fight.completeness, certifiedCoverage: [castCoverage] };
    expect(gateCertifiedAbsenceClaim({ ...plain, completeness: certified, predicate })).toEqual({ ok: true });
    // A CASTS predicate never admits an AURAS claim.
    expect(
      gateCertifiedAbsenceClaim({ ...plain, completeness: certified, category: "AURAS", predicate }),
    ).toEqual(gateAbsenceClaim({ ...plain, category: "AURAS" }));
    // Category coverage itself is unchanged by certification.
    expect(gateAbsenceClaim({ ...plain, completeness: certified })).toEqual(gateAbsenceClaim(plain));
  });
});

describe("aura-window certificates", () => {
  it("certifies exact windows and uses on every target, and proves the listing", () => {
    const fight = fightOf(EBON_EVENTS);
    const result = certifyFilteredCapture(fight, tablesFor(fight, { auras: [EBON_TABLE] }), {
      auraAbilityGameIds: [EBON],
      castSourceActorIds: [],
    });
    expect(result.refusal).toBeNull();
    expect(result.auraWindows[0]).toMatchObject({ outcome: "CERTIFIED", excludedTargetActorIds: [] });
    expect(result.coverage).toEqual([
      expect.objectContaining({ kind: "AURA_WINDOWS", abilityGameId: EBON, excludedTargetActorIds: [] }),
    ]);
    const attached = withCertifiedCoverage(fight, tablesFor(fight, { auras: [EBON_TABLE] }), {
      auraAbilityGameIds: [EBON],
      castSourceActorIds: [],
    }).fight;
    // Category coverage is untouched; the certified claim is what changes.
    expect(attached.completeness.categories.AURAS).toEqual(fight.completeness.categories.AURAS);
    const before = supportAuraWindowsOf(
      fight,
      { supporterActorId: EVOKER, auraAbilityGameIds: [EBON] },
      WHOLE,
    );
    const after = supportAuraWindowsOf(
      attached,
      { supporterActorId: EVOKER, auraAbilityGameIds: [EBON] },
      WHOLE,
    );
    expect(before.listing).toEqual({ state: "OBSERVED_ONLY", reason: "INSUFFICIENT_COVERAGE" });
    expect(after.listing).toEqual({ state: "COMPLETE" });
    expect(after.windows.map((window) => window.continuity.state)).toEqual(["ESTABLISHED", "ESTABLISHED"]);
    // A different ability is not proven by this certificate.
    expect(
      supportAuraWindowsOf(attached, { supporterActorId: EVOKER, auraAbilityGameIds: [PRESCIENCE] }, WHOLE)
        .listing,
    ).toEqual({ state: "OBSERVED_ONLY", reason: "INSUFFICIENT_COVERAGE" });
  });

  const certify = (raw: readonly Raw[], table: AuraTargetTable) => {
    const fight = fightOf(raw);
    return certifyFilteredCapture(fight, tablesFor(fight, { auras: [table] }), {
      auraAbilityGameIds: [table.arguments.abilityId ?? -1],
      castSourceActorIds: [],
    }).auraWindows[0];
  };
  const statusOf = (raw: readonly Raw[], table: AuraTargetTable, target: number) =>
    certify(raw, table)?.targets.find((entry) => entry.targetActorId === target)?.status;

  it("excludes a target whose bands differ — a merged band, a missing window, or a window the table never saw", () => {
    const merged = auraTable(EBON, [
      { id: ALLY, uses: 2, bands: [[5_000, 15_000]] },
      { id: OTHER, uses: 1, bands: [[5_000, 16_000]] },
    ]);
    expect(statusOf(EBON_EVENTS, merged, OTHER)).toBe("BANDS_DIFFER");
    expect(certify(EBON_EVENTS, merged)).toMatchObject({
      outcome: "CERTIFIED_EXCEPT_TARGETS",
      excludedTargetActorIds: [OTHER],
    });
    // The table holds a target the events never show: a window the capture missed.
    const extra = auraTable(EBON, [
      ...EBON_TABLE.targets.map((t) => ({
        id: t.targetActorId,
        uses: t.totalUses,
        bands: t.bands.map((b) => [b.startTimeMs, b.endTimeMs] as const),
      })),
      { id: 9, uses: 1, bands: [[20_000, 30_000]] },
    ]);
    expect(certify(EBON_EVENTS, extra)?.excludedTargetActorIds).toEqual([9]);
    // The events show a target the table does not list.
    const missing = auraTable(EBON, [{ id: ALLY, uses: 2, bands: [[5_000, 15_000]] }]);
    expect(certify(EBON_EVENTS, missing)?.excludedTargetActorIds).toEqual([OTHER]);
  });

  it("excludes a target whose uses differ, even when every band agrees", () => {
    const uses = auraTable(EBON, [
      { id: ALLY, uses: 3, bands: [[5_000, 15_000]] },
      { id: OTHER, uses: 1, bands: [[5_000, 15_000]] },
    ]);
    expect(statusOf(EBON_EVENTS, uses, ALLY)).toBe("USES_DIFFER");
  });

  it("excludes a target with a stated instance, a stack change or a window that is not strict", () => {
    const instanced = [
      aura(5_000, "applybuff", ALLY, EBON, { targetInstance: 2 }),
      aura(15_000, "removebuff", ALLY, EBON, { targetInstance: 2 }),
    ];
    expect(
      statusOf(instanced, auraTable(EBON, [{ id: ALLY, uses: 1, bands: [[5_000, 15_000]] }]), ALLY),
    ).toBe("INSTANCE_STATED");
    const stacked = [
      aura(5_000, "applybuff", ALLY),
      aura(6_000, "applybuffstack", ALLY, EBON, { stack: 2 }),
      aura(15_000, "removebuff", ALLY),
    ];
    expect(statusOf(stacked, auraTable(EBON, [{ id: ALLY, uses: 1, bands: [[5_000, 15_000]] }]), ALLY)).toBe(
      "STACK_CHANGE_PRESENT",
    );
    // Open at the end: the table would render the band to the fight end, never reconciled.
    const open = [aura(5_000, "applybuff", ALLY)];
    expect(statusOf(open, auraTable(EBON, [{ id: ALLY, uses: 1, bands: [[5_000, END]] }]), ALLY)).toBe(
      "WINDOW_NOT_STRICT",
    );
    // Removed without an observed application: a carried-in buff.
    const carried = [aura(15_000, "removebuff", ALLY)];
    expect(statusOf(carried, auraTable(EBON, [{ id: ALLY, uses: 0, bands: [[START, 15_000]] }]), ALLY)).toBe(
      "WINDOW_NOT_STRICT",
    );
  });

  it("refuses the ability outright on an ability-less or target-less buff, a missing table, or a different interval", () => {
    const abilityless = [
      ...EBON_EVENTS,
      { timestamp: 7_000, type: "applybuff", sourceID: EVOKER, targetID: ALLY, fight: 1 },
    ];
    expect(certify(abilityless, EBON_TABLE)).toMatchObject({
      outcome: "REFUSED",
      refusal: "AMBIGUOUS_EVENT",
    });
    const targetless = [
      ...EBON_EVENTS,
      { timestamp: 7_000, type: "refreshbuff", sourceID: EVOKER, abilityGameID: EBON, fight: 1 },
    ];
    expect(certify(targetless, EBON_TABLE)).toMatchObject({ outcome: "REFUSED", refusal: "AMBIGUOUS_EVENT" });
    const fight = fightOf(EBON_EVENTS);
    expect(
      certifyFilteredCapture(fight, tablesFor(fight, {}), {
        auraAbilityGameIds: [EBON],
        castSourceActorIds: [],
      }).auraWindows[0],
    ).toMatchObject({ outcome: "REFUSED", refusal: "TABLE_MISSING" });
    const shifted = { ...EBON_TABLE, arguments: { ...EBON_TABLE.arguments, endTimeMs: END - 1 } };
    expect(certify(EBON_EVENTS, shifted)).toMatchObject({
      outcome: "REFUSED",
      refusal: "TABLE_INTERVAL_DIFFERS",
    });
    // A refused certificate attaches no coverage.
    expect(
      certifyFilteredCapture(fight, tablesFor(fight, { auras: [shifted] }), {
        auraAbilityGameIds: [EBON],
        castSourceActorIds: [],
      }).coverage,
    ).toEqual([]);
  });

  it("refuses everything when the tables are not of this report revision, fight or bounds", () => {
    const fight = fightOf(EBON_EVENTS);
    for (const [override, refusal] of [
      [{ reportCode: "OTHERREPORT00000" }, "REPORT_CODE_DIFFERS"],
      [{ revision: fight.report.revision + 1 }, "REPORT_REVISION_DIFFERS"],
      [{ fight: { id: fight.fight.id + 1, startTimeMs: START, endTimeMs: END } }, "FIGHT_DIFFERS"],
      [{ fight: { id: fight.fight.id, startTimeMs: START, endTimeMs: END + 1 } }, "FIGHT_BOUNDS_DIFFER"],
    ] as const) {
      const result = certifyFilteredCapture(fight, tablesFor(fight, { auras: [EBON_TABLE], override }), {
        auraAbilityGameIds: [EBON],
        castSourceActorIds: [],
      });
      expect(result.refusal).toBe(refusal);
      expect(result.coverage).toEqual([]);
    }
  });
});

describe("single-target proof needs the Friendlies table's own listing", () => {
  const BOSS = 21;
  it("a hostile target's events are excluded and never proven; an unlisted, unexamined actor is never proven", () => {
    // The capture holds X on the boss; the Friendlies table cannot list it.
    const raw = [...EBON_EVENTS, aura(6_000, "applybuff", BOSS), aura(8_000, "removebuff", BOSS)].sort(
      (left, right) => (left["timestamp"] as number) - (right["timestamp"] as number),
    );
    const fight = fightOf(raw);
    const { certification, fight: attached } = withCertifiedCoverage(
      fight,
      tablesFor(fight, { auras: [EBON_TABLE] }),
      {
        auraAbilityGameIds: [EBON],
        castSourceActorIds: [],
      },
    );
    expect(certification.auraWindows[0]).toMatchObject({
      outcome: "CERTIFIED_EXCEPT_TARGETS",
      excludedTargetActorIds: [BOSS],
      provenTargetActorIds: [ALLY, OTHER],
    });
    const windows = supportAuraWindowsOf(
      attached,
      { supporterActorId: EVOKER, auraAbilityGameIds: [EBON] },
      WHOLE,
    );
    expect(windows.listing).toEqual({ state: "OBSERVED_ONLY", reason: "INSUFFICIENT_COVERAGE" });
    expect(windows.windows.map((window) => [window.recipient.actorId, window.continuity.state])).toEqual([
      [ALLY, "ESTABLISHED"],
      [OTHER, "ESTABLISHED"],
      [BOSS, "NOT_ESTABLISHED"],
    ]);
    const claim = (actorId: number) =>
      gateCertifiedAbsenceClaim({
        completeness: attached.completeness,
        category: "AURAS",
        range: WHOLE,
        actorId: EVOKER,
        predicate: { kind: "AURA_WINDOWS", abilityGameIds: [EBON], targets: { kind: "ONE_TARGET", actorId } },
      }).ok;
    expect([claim(ALLY), claim(BOSS), claim(999)]).toEqual([true, false, false]);
  });
});

describe("certification fills a coverage gap only, never declared scope", () => {
  // The same exact tables and the same present events, under two declared scopes.
  const scoped = (actorScope: readonly number[] | null) => {
    const base = fightOf([cast(4_000, ALLY, 777), ...EBON_EVENTS]);
    const fight: CombatFight = {
      ...base,
      completeness: {
        ...base.completeness,
        categories: {
          ...base.completeness.categories,
          CASTS: absentCategory(actorScope),
          AURAS: absentCategory(actorScope),
        },
      },
    };
    return withCertifiedCoverage(
      fight,
      tablesFor(fight, {
        auras: [EBON_TABLE],
        casts: [[ALLY, abilityTable([{ ability: 777, total: 1, actor: ALLY }])]],
      }),
      { auraAbilityGameIds: [EBON], castSourceActorIds: [ALLY] },
    ).fight;
  };
  const listing = (fight: CombatFight) =>
    supportAuraWindowsOf(fight, { supporterActorId: EVOKER, auraAbilityGameIds: [EBON] }, WHOLE);
  const allyCasts = (fight: CombatFight) =>
    gateCertifiedAbsenceClaim({
      completeness: fight.completeness,
      category: "CASTS",
      range: WHOLE,
      actorId: ALLY,
      predicate: { kind: "COMPLETED_CASTS", sourceActorId: ALLY, abilityGameIds: [777] },
    });

  it("PLAYER_CONTEXT (scope: the Evoker): no ally listing, no ally track, no ally casts", () => {
    const fight = scoped([EVOKER]);
    expect(fight.completeness.certifiedCoverage?.length).toBe(2);
    const windows = listing(fight);
    expect(windows.listing).toEqual({ state: "OBSERVED_ONLY", reason: "INSUFFICIENT_SCOPE" });
    expect(windows.windows.map((window) => window.continuity)).toEqual([
      { state: "NOT_ESTABLISHED", reason: "INSUFFICIENT_SCOPE" },
      { state: "NOT_ESTABLISHED", reason: "INSUFFICIENT_SCOPE" },
    ]);
    expect(allyCasts(fight)).toEqual({ ok: false, reason: "INSUFFICIENT_SCOPE" });
  });

  it("FULL_RAID (actor-global scope): the same evidence proves all three", () => {
    const fight = scoped(null);
    expect(listing(fight).listing).toEqual({ state: "COMPLETE" });
    expect(listing(fight).windows.map((window) => window.continuity.state)).toEqual([
      "ESTABLISHED",
      "ESTABLISHED",
    ]);
    expect(allyCasts(fight)).toEqual({ ok: true });
  });

  it("an unverified category is never certified, whatever the tables say", () => {
    const base = scoped(null);
    const fight: CombatFight = {
      ...base,
      completeness: {
        ...base.completeness,
        categories: { ...base.completeness.categories, CASTS: { capability: "UNVERIFIED" } },
      },
    };
    expect(allyCasts(fight)).toEqual({ ok: false, reason: "CAPABILITY_UNVERIFIED" });
  });
});

describe("re-certification never inherits coverage", () => {
  const request = { auraAbilityGameIds: [EBON], castSourceActorIds: [EVOKER] };
  const casts = [cast(5_000, EVOKER, EBON)];
  const castLeaves = abilityTable([{ ability: EBON, total: 1 }]);
  const certifiedOnce = () => {
    const fight = fightOf([...casts, ...EBON_EVENTS]);
    return withCertifiedCoverage(
      fight,
      tablesFor(fight, { auras: [EBON_TABLE], casts: [[EVOKER, castLeaves]] }),
      request,
    ).fight;
  };
  const listing = (fight: CombatFight) =>
    supportAuraWindowsOf(fight, { supporterActorId: EVOKER, auraAbilityGameIds: [EBON] }, WHOLE);
  const castClaim = (fight: CombatFight) =>
    gateCertifiedAbsenceClaim({
      completeness: fight.completeness,
      category: "CASTS",
      range: WHOLE,
      actorId: EVOKER,
      predicate: { kind: "COMPLETED_CASTS", sourceActorId: EVOKER, abilityGameIds: [EBON] },
    });

  it("a copy that lost events, re-certified with its old completeness, keeps none of the old coverage", () => {
    const first = certifiedOnce();
    expect(listing(first).listing).toEqual({ state: "COMPLETE" });
    expect(castClaim(first)).toEqual({ ok: true });
    // The copy drops one ally removal and the cast, but keeps the certified completeness object.
    const dropped = first.events.filter(
      (event) =>
        !(event.kind === "AURA" && event.target?.actorId === OTHER && event.operation === "REMOVED") &&
        event.kind !== "CAST",
    );
    const copy: CombatFight = { ...first, events: dropped };
    const again = withCertifiedCoverage(
      copy,
      tablesFor(copy, { auras: [EBON_TABLE], casts: [[EVOKER, castLeaves]] }),
      request,
    ).fight;
    expect(again.completeness.certifiedCoverage).toEqual([
      expect.objectContaining({ kind: "AURA_WINDOWS", excludedTargetActorIds: [OTHER] }),
    ]);
    expect(listing(again).listing).toEqual({ state: "OBSERVED_ONLY", reason: "INSUFFICIENT_COVERAGE" });
    expect(
      listing(again)
        .windows.filter((window) => window.recipient.actorId === OTHER)
        .map((w) => w.continuity.state),
    ).toEqual(["NOT_ESTABLISHED"]);
    expect(castClaim(again).ok).toBe(false);
  });

  it("re-certifying against tables of another revision removes every inherited coverage", () => {
    const first = certifiedOnce();
    const again = withCertifiedCoverage(
      first,
      tablesFor(first, {
        auras: [EBON_TABLE],
        casts: [[EVOKER, castLeaves]],
        override: { revision: first.report.revision + 1 },
      }),
      request,
    );
    expect(again.certification.refusal).toBe("REPORT_REVISION_DIFFERS");
    expect(again.fight.completeness.certifiedCoverage).toEqual([]);
    expect(listing(again.fight).listing).toEqual({ state: "OBSERVED_ONLY", reason: "INSUFFICIENT_COVERAGE" });
    expect(castClaim(again.fight).ok).toBe(false);
  });

  it("a narrower re-certification keeps only what it requested", () => {
    const first = certifiedOnce();
    const again = withCertifiedCoverage(
      first,
      tablesFor(first, { auras: [EBON_TABLE], casts: [[EVOKER, castLeaves]] }),
      { auraAbilityGameIds: [EBON], castSourceActorIds: [] },
    ).fight;
    expect(again.completeness.certifiedCoverage?.map((coverage) => coverage.kind)).toEqual(["AURA_WINDOWS"]);
    expect(listing(again).listing).toEqual({ state: "COMPLETE" });
    expect(castClaim(again).ok).toBe(false);
  });
});

describe("completed-cast certificates", () => {
  const certifyCasts = (raw: readonly Raw[], table: readonly CastTableLeaf[]) => {
    const fight = fightOf(raw);
    return certifyFilteredCapture(fight, tablesFor(fight, { casts: [[EVOKER, table]] }), {
      auraAbilityGameIds: [],
      castSourceActorIds: [EVOKER],
    }).completedCasts[0];
  };

  it("certifies only abilities the table lists with an equal count — a zero is never certified", () => {
    const raw = [
      cast(5_000, EVOKER, EBON),
      cast(6_000, EVOKER, 409311),
      cast(7_000, EVOKER, 409311),
      cast(8_000, EVOKER, 1),
    ];
    const result = certifyCasts(
      raw,
      abilityTable([
        { ability: EBON, total: 1 },
        { ability: 409311, total: 1 },
      ]),
    );
    expect(result?.certifiedAbilityGameIds).toEqual([EBON]);
    expect(result?.abilities).toEqual([
      { abilityGameId: 1, eventCount: 1, tableCount: null, status: "NOT_LISTED_BY_TABLE" },
      { abilityGameId: EBON, eventCount: 1, tableCount: 1, status: "MATCH" },
      { abilityGameId: 409311, eventCount: 2, tableCount: 1, status: "COUNT_DIFFERS" },
    ]);
    // A never-cast support id is not listed, so not proven: the support-cast listing stays UNKNOWN.
    const fight = fightOf(raw);
    const attached = withCertifiedCoverage(
      fight,
      tablesFor(fight, {
        casts: [
          [
            EVOKER,
            abilityTable([
              { ability: EBON, total: 1 },
              { ability: 409311, total: 2 },
              { ability: 403631, total: 0 },
            ]),
          ],
        ],
      }),
      {
        auraAbilityGameIds: [],
        castSourceActorIds: [EVOKER],
      },
    ).fight;
    const range = inclusiveRange(START, END);
    const claim = {
      completeness: attached.completeness,
      category: "CASTS" as EvidenceCategory,
      range,
      actorId: EVOKER,
    };
    expect(
      gateCertifiedAbsenceClaim({
        ...claim,
        predicate: { kind: "COMPLETED_CASTS", sourceActorId: EVOKER, abilityGameIds: [EBON, 409311] },
      }),
    ).toEqual({ ok: true });
    expect(
      gateCertifiedAbsenceClaim({
        ...claim,
        predicate: { kind: "COMPLETED_CASTS", sourceActorId: EVOKER, abilityGameIds: [EBON, 442204] },
      }).ok,
    ).toBe(false);
    // A LISTED ability with a zero total and no casts is a zero too: never certified.
    expect(attached.completeness.certifiedCoverage).toEqual([
      expect.objectContaining({ kind: "COMPLETED_CASTS", abilityGameIds: [EBON, 409311] }),
    ]);
    expect(
      gateCertifiedAbsenceClaim({
        ...claim,
        predicate: { kind: "COMPLETED_CASTS", sourceActorId: EVOKER, abilityGameIds: [403631] },
      }).ok,
    ).toBe(false);
    expect(
      certifyCasts(raw, abilityTable([{ ability: 403631, total: 0 }]))?.abilities.find(
        (entry) => entry.abilityGameId === 403631,
      ),
    ).toEqual({ abilityGameId: 403631, eventCount: 0, tableCount: 0, status: "ZERO_TOTAL" });
  });

  it("ignores a leaf naming another actor, and never counts a begincast", () => {
    const raw = [cast(5_000, EVOKER, EBON), cast(4_000, EVOKER, EBON, "begincast")];
    const result = certifyCasts(
      raw,
      abilityTable([
        { ability: EBON, total: 1 },
        { ability: EBON, total: 4, actor: 46 },
      ]),
    );
    expect(result?.certifiedAbilityGameIds).toEqual([EBON]);
  });

  it("refuses the actor on an unidentified or instanced cast, and an ability with a source-less cast", () => {
    expect(certifyCasts([cast(5_000, EVOKER, null)], abilityTable([]))).toMatchObject({
      outcome: "REFUSED",
      refusal: "UNIDENTIFIED_CAST",
    });
    expect(
      certifyCasts(
        [{ ...cast(5_000, EVOKER, EBON), sourceInstance: 2 }],
        abilityTable([{ ability: EBON, total: 1 }]),
      ),
    ).toMatchObject({ outcome: "REFUSED", refusal: "INSTANCED_CAST" });
    expect(certifyCasts([cast(5_000, null, null)], abilityTable([]))).toMatchObject({
      outcome: "REFUSED",
      refusal: "SOURCELESS_UNIDENTIFIED_CAST",
    });
    const sourceless = certifyCasts(
      [cast(5_000, EVOKER, EBON), cast(6_000, null, EBON)],
      abilityTable([{ ability: EBON, total: 1 }]),
    );
    expect(sourceless?.abilities).toEqual([
      { abilityGameId: EBON, eventCount: 1, tableCount: 1, status: "SOURCELESS_CAST_PRESENT" },
    ]);
    expect(sourceless?.certifiedAbilityGameIds).toEqual([]);
  });
});

describe("the certification table decoder fails closed", () => {
  const args = {
    dataType: "Buffs",
    startTime: START,
    endTime: END,
    hostilityType: "Friendlies",
    abilityID: EBON,
    sourceID: null,
  };
  const good = {
    reportData: {
      report: {
        code: "M13AAUGAAAAAAAAA",
        revision: 10,
        fights: [{ id: 1, startTime: START, endTime: END }],
        tableArguments: { [`buffs_${String(EBON)}`]: args },
        [`buffs_${String(EBON)}`]: {
          data: {
            startTime: START,
            endTime: END,
            totalTime: END - START,
            auras: [
              {
                id: ALLY,
                type: "Warrior",
                totalUses: 1,
                totalUptime: 10,
                bands: [{ startTime: 5_000, endTime: 15_000 }],
              },
            ],
          },
        },
      },
    },
  };
  const withReport = (patch: Record<string, unknown>) => ({
    reportData: { report: { ...good.reportData.report, ...patch } },
  });

  it("decodes the sanitized shape", () => {
    const decoded = decodeCertificationTables(good);
    expect(decoded.ok).toBe(true);
  });

  it("refuses a table without recorded arguments, with arguments for another predicate, a dropped table, a repeated target or an unknown field", () => {
    expect(decodeCertificationTables(withReport({ tableArguments: {} }))).toEqual({
      ok: false,
      defect: `TABLE_ARGUMENTS_UNUSABLE:buffs_${String(EBON)}`,
    });
    expect(
      decodeCertificationTables(
        withReport({ tableArguments: { [`buffs_${String(EBON)}`]: { ...args, abilityID: PRESCIENCE } } }),
      ).ok,
    ).toBe(false);
    expect(
      decodeCertificationTables(
        withReport({ tableArguments: { [`buffs_${String(EBON)}`]: { ...args, hostilityType: "Enemies" } } }),
      ).ok,
    ).toBe(false);
    expect(
      decodeCertificationTables(
        withReport({
          tableArguments: {
            [`buffs_${String(EBON)}`]: args,
            casts_4: { ...args, dataType: "Casts", abilityID: null, sourceID: 4 },
          },
        }),
      ),
    ).toEqual({ ok: false, defect: "TABLE_MISSING:casts_4" });
    const repeated = (good.reportData.report as unknown as Record<string, { data: { auras: unknown[] } }>)[
      `buffs_${String(EBON)}`
    ]?.data ?? { auras: [] };
    expect(
      decodeCertificationTables(
        withReport({
          [`buffs_${String(EBON)}`]: { data: { ...repeated, auras: [...repeated.auras, ...repeated.auras] } },
        }),
      ).ok,
    ).toBe(false);
    expect(decodeCertificationTables(withReport({ damageDone: {} }))).toEqual({
      ok: false,
      defect: "UNEXPECTED_FIELD:damageDone",
    });
  });
});

describe("the real M13-A fight, certified against the M13-D tables (M13AAUGAAAAAAAAA fight 1)", () => {
  const SEGMENTS = ["wcl-m13a-aug1-fight-1-support.seg-0-75", "wcl-m13a-aug1-fight-1-support.seg-75-151"];
  const CONTEXT = "wcl-m13a-fight-context-aug1-fight-1";
  const TABLES = "wcl-m13d-certification-tables-aug1-fight-1";
  const [FIGHT_START, FIGHT_END] = [165_857, 316_612];
  const PLAYERS = Array.from({ length: 20 }, (_, index) => index + 1);
  let fight: CombatFight;
  let certified: CombatFight;
  let tables: CertificationTables;
  let identity: FightIdentity;

  beforeAll(async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
    const find = (id: string) => {
      const found = loaded.archive.referenceableArtifacts.find((entry) => entry.record.artifactId === id);
      if (found === undefined) throw new Error(`no artifact ${id}`);
      return found;
    };
    const composed = bundleOf(loaded.archive, SEGMENTS, [], { catalogArtifactId: CONTEXT });
    const context = find(CONTEXT).json as {
      reportData: {
        report: {
          fights: {
            startTime: number;
            endTime: number;
            encounterID: number;
            difficulty: number;
            friendlyPlayers: number[];
            friendlySpecs: string[];
          }[];
        };
      };
    };
    const row = context.reportData.report.fights[0];
    if (row === undefined) throw new Error("no fight");
    // The harness composes a synthetic shell; its report identity is bound here
    // from the segments' committed provenance, never typed in.
    const sources = SEGMENTS.map((id) => find(id).record.provenance.source);
    const source = sources[0];
    if (source === null || source === undefined) throw new Error("no source");
    for (const other of sources) {
      expect([other?.reportCode, other?.reportRevision, other?.fightId]).toEqual([
        source.reportCode,
        source.reportRevision,
        source.fightId,
      ]);
    }
    if (typeof source.reportRevision !== "number" || typeof source.fightId !== "number")
      throw new Error("unrecorded identity");
    fight = {
      ...composed.fight,
      report: { ...composed.fight.report, code: source.reportCode, revision: source.reportRevision },
      fight: {
        ...composed.fight.fight,
        id: source.fightId,
        encounterId: row.encounterID,
        difficulty: row.difficulty,
        startTimeMs: row.startTime,
        endTimeMs: row.endTime,
        durationMs: row.endTime - row.startTime,
      },
    };
    const decoded = decodeCertificationTables(find(TABLES).json);
    if (!decoded.ok) throw new Error(decoded.defect);
    tables = decoded.tables;
    certified = withCertifiedCoverage(fight, tables, {
      auraAbilityGameIds: [395152, 410089, 395296],
      castSourceActorIds: PLAYERS,
    }).fight;
    identity = {
      report: { code: fight.report.code, revision: 10, startTime: 0, endTime: 0 },
      data: { logVersion: 17, gameVersion: 1 },
      fight: {
        id: fight.fight.id,
        name: fight.fight.name,
        encounterId: row.encounterID,
        difficulty: row.difficulty,
        startTime: row.startTime,
        endTime: row.endTime,
      },
      player: {
        sourceId: EVOKER,
        name: "Subject",
        className: "Evoker",
        specName: row.friendlySpecs[row.friendlyPlayers.indexOf(EVOKER)] ?? "",
      },
    };
  });

  const certification = () =>
    certifyFilteredCapture(fight, tables, {
      auraAbilityGameIds: [395152, 410089, 395296],
      castSourceActorIds: PLAYERS,
    });

  it("the tables bind to the capture: same pseudonymous report, revision 10, fight 1 and its exact bounds", () => {
    expect([tables.reportCode, tables.revision, tables.fight]).toEqual([
      "M13AAUGAAAAAAAAA",
      10,
      { id: 1, startTimeMs: FIGHT_START, endTimeMs: FIGHT_END },
    ]);
    expect(certification().refusal).toBeNull();
    // The manifest records revision 10 for the events capture, and the tables read 10 too.
    expect(fight.report.code).toBe("M13AAUGAAAAAAAAA");
  });

  it("certifies Ebon Might and the Evoker's own Ebon Might on every friendly target; Prescience on all but three pets", () => {
    const byAbility = new Map(certification().auraWindows.map((entry) => [entry.abilityGameId, entry]));
    const ebon = byAbility.get(395152);
    expect(ebon?.outcome).toBe("CERTIFIED");
    expect(ebon?.targets.map((entry) => entry.targetActorId)).toEqual([
      3, 4, 6, 7, 10, 11, 14, 15, 16, 17, 18, 19, 20,
    ]);
    expect(ebon?.targets.every((entry) => entry.status === "MATCH")).toBe(true);
    expect(ebon?.targets.reduce((sum, entry) => sum + entry.eventWindows.length, 0)).toBe(173);
    expect(byAbility.get(395296)).toMatchObject({ outcome: "CERTIFIED", excludedTargetActorIds: [] });
    const prescience = byAbility.get(410089);
    // The table is per ACTOR: pets whose events state an instance cannot be proven per instance.
    expect(prescience).toMatchObject({
      outcome: "CERTIFIED_EXCEPT_TARGETS",
      excludedTargetActorIds: [36, 50, 52],
    });
    expect(
      prescience?.targets
        .filter((entry) => entry.status !== "MATCH")
        .map((entry) => [entry.targetActorId, entry.status]),
    ).toEqual([
      [36, "INSTANCE_STATED"],
      [50, "INSTANCE_STATED"],
      [52, "INSTANCE_STATED"],
    ]);
  });

  it("certifies each player's listed completed casts, never an omitted ability, an empowered spell or a zero", () => {
    const casts = new Map(certification().completedCasts.map((entry) => [entry.sourceActorId, entry]));
    const evoker = casts.get(EVOKER);
    expect(evoker?.outcome).toBe("CERTIFIED_ABILITIES");
    expect(evoker?.certifiedAbilityGameIds).toEqual(expect.arrayContaining([395152, 409311, 403631]));
    expect(evoker?.certifiedAbilityGameIds).not.toContain(442204);
    // Fire Breath and Upheaval: the table counts cast AND empowerend; a completed cast is `cast` only.
    expect(evoker?.abilities.filter((entry) => entry.status !== "MATCH")).toEqual([
      { abilityGameId: 357208, eventCount: 6, tableCount: 10, status: "COUNT_DIFFERS" },
      { abilityGameId: 361195, eventCount: 1, tableCount: null, status: "NOT_LISTED_BY_TABLE" },
      { abilityGameId: 396286, eventCount: 9, tableCount: 16, status: "COUNT_DIFFERS" },
    ]);
    const differing = [...casts.values()].flatMap((entry) =>
      entry.abilities.filter((ability) => ability.status !== "MATCH"),
    );
    expect(
      differing.every((entry) => entry.status === "COUNT_DIFFERS" || entry.status === "NOT_LISTED_BY_TABLE"),
    ).toBe(true);
    expect(differing).toHaveLength(28);
    expect([...casts.values()].reduce((sum, entry) => sum + entry.certifiedAbilityGameIds.length, 0)).toBe(
      303,
    );
  });

  it("what changes: Ebon Might listings are COMPLETE and their windows proven; support time is a real lower bound", () => {
    const before = evaluated(evaluateAugmentationEvoker({ fight, identity }));
    const after = evaluated(evaluateAugmentationEvoker({ fight: certified, identity }));
    const [ebonBefore, prescienceBefore] = before.allyBuffs;
    const [ebon, prescience] = after.allyBuffs;
    expect(ebonBefore?.listing).toEqual({ state: "OBSERVED_ONLY", reason: "INSUFFICIENT_COVERAGE" });
    expect(ebon?.listing).toEqual({ state: "COMPLETE" });
    expect(ebon?.windows.every((entry) => entry.window.continuity.state === "ESTABLISHED")).toBe(true);
    // Never exact: a carried-in buff is never excluded.
    expect(ebon?.supportTime.anyRecipient).toMatchObject({
      bound: "AT_LEAST",
      why: ["INITIAL_STATE_NOT_RESOLVED"],
    });
    expect(after.selfBuffs[0]?.windows.listing).toEqual({ state: "COMPLETE" });
    // Prescience: the three uncertified pets keep the listing OBSERVED_ONLY.
    expect(prescienceBefore?.listing).toEqual({ state: "OBSERVED_ONLY", reason: "INSUFFICIENT_COVERAGE" });
    expect(prescience?.listing).toEqual({ state: "OBSERVED_ONLY", reason: "INSUFFICIENT_COVERAGE" });
    const unproven = new Set([36, 50, 52]);
    for (const entry of prescience?.windows ?? []) {
      expect(entry.window.continuity.state, String(entry.window.recipient.actorId)).toBe(
        unproven.has(entry.window.recipient.actorId) ? "NOT_ESTABLISHED" : "ESTABLISHED",
      );
    }
    expect(prescience?.supportTime.anyRecipient).toMatchObject({
      bound: "AT_LEAST",
      why: ["INITIAL_STATE_NOT_RESOLVED", "LISTING_OBSERVED_ONLY", "CONTINUITY_NOT_ESTABLISHED"],
    });
  });

  it("what does not change: the support-cast list (442204 is never proven), deaths, and every authority", () => {
    const after = evaluated(evaluateAugmentationEvoker({ fight: certified, identity }));
    expect(after.supportTiming.listing).toEqual({
      state: "UNKNOWN",
      reason: "INSUFFICIENT_COVERAGE",
      unidentifiedCasts: 0,
      unattributedCasts: 0,
    });
    expect(after.supportTiming.status).toBe("NO_AUTHORITY_AVAILABLE");
    expect(after.supportTargeting).toEqual({
      category: "SUPPORT_TARGETING",
      status: "NO_AUTHORITY_AVAILABLE",
      reason: "NO_APPROVED_RECIPIENT_QUALITY_MODEL",
    });
    // No deaths certificate was requested: nothing consumes death completeness.
    expect(certified.completeness.categories.DEATHS).toEqual(fight.completeness.categories.DEATHS);
    for (const category of ["CASTS", "AURAS"] as const) {
      expect(certified.completeness.categories[category]).toEqual(fight.completeness.categories[category]);
    }
    // Every real recipient still has no reviewed cooldown identity, so overlap is unchanged.
    for (const entry of after.allyBuffs.flatMap((buff) => buff.windows)) {
      expect(entry.cooldownOverlap.state).toBe("NO_COOLDOWN_IDENTITY");
    }
  });
});

function evaluated(result: AugmentationEvokerEvaluation) {
  if (result.state !== "EVALUATED") throw new Error(`expected EVALUATED, got ${result.state}`);
  return result;
}

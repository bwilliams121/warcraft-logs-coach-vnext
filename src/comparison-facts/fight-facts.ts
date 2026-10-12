/**
 * One fight's post-hoc comparison facts (M11-G2), assembled from the generic
 * primitives under a specialization's post-hoc definition.
 *
 * Inputs are already-normalized evidence: a CombatFight, its evidence basis,
 * the fight's enemy list (or why it is not held) and whatever Warcraft Logs
 * table surfaces exist for it. Nothing here requests anything.
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type { AbilityTable, ComparisonTables, RaidDamageEntry } from "../wcl/comparison/comparison-tables.js";
import { actorsOwnedBy } from "../combat-facts/descriptors.js";
import { summarizeCasts, type CastSummary } from "./cast-facts.js";
import {
  observeCooldownWindows,
  observedBounds,
  type CooldownWindow,
  type CooldownWindowDefinition,
  type CooldownWindowFacts,
} from "./cooldown-windows.js";
import {
  buildDamageLedger,
  damageFrom,
  summarizeDamage,
  type DamageSummary,
  type ObservedDamageLedger,
} from "./damage-ledger.js";
import {
  buildEnvironmentProfile,
  type EnemyNpcEntry,
  type EnvironmentProfile,
} from "./environment-profile.js";
import { countUnder, factStateOf, type EvidenceBasis } from "./evidence-basis.js";
import { buildSubActorTree, type SubActorKindDefinition, type SubActorTree } from "./sub-actor-tree.js";
import type { EnemyNpcList } from "./target-classification.js";
import type { Proven } from "../combat-facts/coverage.js";

export interface PostHocDefinition {
  readonly specId: string;
  readonly cooldownWindows: readonly CooldownWindowDefinition[];
  readonly subActorKinds: readonly SubActorKindDefinition[];
}

/** Warcraft Logs-computed surfaces held for a fight. The subject has the raid entry only (G1). */
export interface WclSurfaces {
  readonly raidEntry: RaidDamageEntry | null;
  readonly raidTotalTimeMs: number | null;
  readonly tables: ComparisonTables | null;
}

export interface ComparisonFightInput {
  readonly fightRef: string;
  readonly fight: CombatFight;
  readonly focusActorId: number;
  readonly basis: EvidenceBasis;
  readonly enemyNpcs: EnemyNpcList;
  readonly enemyEntries: readonly EnemyNpcEntry[] | null;
  readonly wcl: WclSurfaces;
}

export interface WclComputedAmount {
  readonly amountAuthority: "WCL_DAMAGE_DONE_TABLE" | "WCL_RAID_DAMAGE_DONE_TABLE";
  readonly actorId: number;
  readonly total: number;
  readonly interval: { readonly fromMs: number; readonly toMs: number; readonly endInclusive: boolean };
}

export interface SubActorWindowActivity {
  readonly actorId: number;
  readonly kind: string;
  /** Instances with any damage or cast event inside the window. Observed only. */
  readonly instancesWithEvents: number;
  readonly damageEventCount: Proven<number>;
  readonly castCompleteEventCount: Proven<number>;
}

export interface WindowFacts {
  readonly windowIndex: number;
  readonly bounds: { readonly startMs: number; readonly endMs: number } | null;
  readonly focusCasts: CastSummary | null;
  readonly focusDamage: DamageSummary | null;
  readonly ownedDamage: DamageSummary | null;
  readonly subActors: readonly SubActorWindowActivity[];
  /** No post-hoc resource primitive exists: never guessed. */
  readonly resourceAtStart: { readonly kind: "UNKNOWN"; readonly reason: "NO_POST_HOC_RESOURCE_PRIMITIVE" };
  /** Per actor, only when a window table's recorded bounds equal this window's. */
  readonly wclComputed: readonly WclComputedAmount[] | "NO_MATCHING_WINDOW_TABLE";
}

export interface CooldownFacts {
  readonly windows: CooldownWindowFacts;
  readonly windowFacts: readonly WindowFacts[];
}

export interface FightFacts {
  readonly fightRef: string;
  readonly focusActorId: number;
  readonly basis: EvidenceBasis;
  readonly environment: EnvironmentProfile;
  readonly focusCasts: CastSummary;
  readonly ledger: ObservedDamageLedger;
  readonly cooldowns: readonly CooldownFacts[];
  readonly subActors: SubActorTree;
  readonly wclComputed: {
    /** The raid-wide entry for the focus (G1's ACTUAL_DPS surface): includes its pets. */
    readonly focusRaidEntry: WclComputedAmount | null;
    readonly petsInRaidEntry: readonly WclComputedAmount[];
    readonly targetTypesInRaidEntry: readonly { readonly type: string; readonly total: number }[];
    /** Per actor in scope: the leaves of its own DamageDone table naming it. */
    readonly perActor: readonly WclComputedAmount[] | "NO_PER_ACTOR_TABLES";
  };
}

const sumLeaves = (table: AbilityTable, actorId: number): number =>
  table.leaves
    .filter((leaf) => leaf.actorId === null || leaf.actorId === actorId)
    .reduce((sum, leaf) => sum + leaf.total, 0);

function windowFactsOf(
  input: ComparisonFightInput,
  window: CooldownWindow,
  owned: readonly number[],
  kinds: readonly SubActorKindDefinition[],
): WindowFacts {
  const { fight, basis, focusActorId, enemyNpcs } = input;
  const bounds = observedBounds(window);
  const unknown = { kind: "UNKNOWN", reason: "NO_POST_HOC_RESOURCE_PRIMITIVE" } as const;
  if (bounds === null) {
    return {
      windowIndex: window.index,
      bounds: null,
      focusCasts: null,
      focusDamage: null,
      ownedDamage: null,
      subActors: [],
      resourceAtStart: unknown,
      wclComputed: "NO_MATCHING_WINDOW_TABLE",
    };
  }
  const subActors = owned.map((actorId): SubActorWindowActivity => {
    const gameId = fight.actors.get(actorId)?.gameId ?? null;
    const kind =
      kinds.find((entry) => gameId !== null && entry.gameIds.includes(gameId))?.kind ??
      "UNCLASSIFIED_OWNED_ACTOR";
    const state = factStateOf(fight, basis, ["DAMAGE", "CASTS"], bounds, [actorId]);
    const damage = damageFrom(fight, [actorId], bounds);
    const casts = summarizeCasts(fight, basis, [actorId], bounds);
    const instances = new Set(
      damage.flatMap((event) =>
        event.source.kind === "ACTOR" ? [`${String(event.source.key.instanceId)}`] : [],
      ),
    );
    for (const entry of casts.sequence.items) instances.add(String(entry.source.instanceId));
    return {
      actorId,
      kind,
      instancesWithEvents: instances.size,
      damageEventCount: countUnder(state, damage.length),
      castCompleteEventCount: casts.completeEventCount,
    };
  });
  const table =
    input.wcl.tables === null
      ? undefined
      : [...input.wcl.tables.windows.values()].find(
          (entry) => entry.fromMs === bounds.startMs && entry.toMs === bounds.endMs,
        );
  return {
    windowIndex: window.index,
    bounds,
    focusCasts: summarizeCasts(fight, basis, [focusActorId], bounds),
    focusDamage: summarizeDamage(fight, basis, [focusActorId], bounds, enemyNpcs),
    ownedDamage: summarizeDamage(fight, basis, owned, bounds, enemyNpcs),
    subActors,
    resourceAtStart: unknown,
    wclComputed:
      table === undefined
        ? "NO_MATCHING_WINDOW_TABLE"
        : [...table.byActor]
            .map(([actorId, actorTable]) => ({
              amountAuthority: "WCL_DAMAGE_DONE_TABLE" as const,
              actorId,
              total: sumLeaves(actorTable, actorId),
              interval: { fromMs: table.fromMs, toMs: table.toMs, endInclusive: true },
            }))
            .sort((left, right) => left.actorId - right.actorId),
  };
}

export function comparisonFightFacts(input: ComparisonFightInput, definition: PostHocDefinition): FightFacts {
  const { fight, basis, focusActorId, enemyNpcs } = input;
  const window = { startMs: fight.fight.startTimeMs, endMs: fight.fight.endTimeMs };
  const owned = actorsOwnedBy(fight, focusActorId);
  const cooldowns = definition.cooldownWindows.map((cooldown): CooldownFacts => {
    const windows = observeCooldownWindows(fight, basis, focusActorId, cooldown);
    return {
      windows,
      windowFacts: windows.windows.items.map((entry) =>
        windowFactsOf(input, entry, owned, definition.subActorKinds),
      ),
    };
  });
  const firstWindows = cooldowns[0]?.windows.windows.items ?? [];
  const slices = [
    { sliceId: "FIGHT", ...window },
    ...firstWindows.flatMap((entry) => {
      const bounds = observedBounds(entry);
      return bounds === null
        ? []
        : [{ sliceId: `WINDOW_${String(entry.index).padStart(2, "0")}`, ...bounds }];
    }),
  ];
  const raid = input.wcl.raidEntry;
  const raidInterval =
    input.wcl.raidTotalTimeMs === null
      ? null
      : { fromMs: fight.fight.startTimeMs, toMs: fight.fight.endTimeMs, endInclusive: true };
  return {
    fightRef: input.fightRef,
    focusActorId,
    basis,
    environment: buildEnvironmentProfile(fight, basis, focusActorId, enemyNpcs, input.enemyEntries),
    focusCasts: summarizeCasts(fight, basis, [focusActorId], window),
    ledger: buildDamageLedger(fight, basis, [focusActorId, ...owned], slices, enemyNpcs),
    cooldowns,
    subActors: buildSubActorTree(
      fight,
      basis,
      focusActorId,
      definition.subActorKinds,
      firstWindows,
      enemyNpcs,
    ),
    wclComputed: {
      focusRaidEntry:
        raid === null || raidInterval === null
          ? null
          : {
              amountAuthority: "WCL_RAID_DAMAGE_DONE_TABLE",
              actorId: raid.actorId,
              total: raid.total,
              interval: raidInterval,
            },
      petsInRaidEntry:
        raid === null || raidInterval === null
          ? []
          : raid.pets
              .map((pet) => ({
                amountAuthority: "WCL_RAID_DAMAGE_DONE_TABLE" as const,
                actorId: pet.actorId,
                total: pet.total,
                interval: raidInterval,
              }))
              .sort((left, right) => left.actorId - right.actorId),
      targetTypesInRaidEntry: raid?.targetTypes ?? [],
      perActor:
        input.wcl.tables === null
          ? "NO_PER_ACTOR_TABLES"
          : [...input.wcl.tables.damageDone]
              .map(([actorId, table]) => ({
                amountAuthority: "WCL_DAMAGE_DONE_TABLE" as const,
                actorId,
                total: sumLeaves(table, actorId),
                interval: {
                  fromMs: fight.fight.startTimeMs,
                  toMs: fight.fight.endTimeMs,
                  endInclusive: true,
                },
              }))
              .sort((left, right) => left.actorId - right.actorId),
    },
  };
}

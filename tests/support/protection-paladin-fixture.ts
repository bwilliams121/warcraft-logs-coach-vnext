/**
 * SYNTHETIC Protection Paladin evidence and authorities for M10-C tests.
 *
 * EVERYTHING HERE IS SYNTHETIC and labelled so. No fixture in this file is a
 * capture, none carries a coverage grant from a capture, and none may appear
 * in the corpus. They exist to exercise branches the real M10-B evidence does
 * not reach — a MATCH, a REJECTED, a Templar tree, a previous Divine Toll —
 * under premises a test states in full.
 *
 * The real evidence is `wcl-protection-paladin-a7r6-opener` (and its gap
 * derivation), reached through `tests/support/corpus/fight.ts`; tests about
 * what the evaluator concludes on REAL evidence use that, not this.
 */

import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import {
  sourceRef,
  WCL_GEAR_UI_SEMANTICS_REVISION,
  type CombatantInfoEvent,
  type GearEnchantState,
  type GearGemsState,
  type GearPiece,
  type CombatEvent,
} from "../../src/engine/normalization/normalized-events.js";
import type { EvidenceCategory } from "../../src/wcl/evidence-capability.js";
import { loadAplAuthority, type AplAuthority } from "../../src/simc/apl-authority.js";
import {
  attachedResources,
  castEvent,
  classResource,
  locatorFor,
  syntheticFight,
  type EventOptions,
} from "./synthetic-fight.js";

export const PROT_ACTOR = 7;
export const BOSS_ACTOR = 21;

/** Pinned ability ids, restated here for readability. Every one is in the GCD artifact. */
export const JUDGMENT = 275779;
export const BLESSED_HAMMER = 204019;
export const SHIELD_OF_THE_RIGHTEOUS = 53600;
export const WORD_OF_GLORY = 85673;
export const DIVINE_TOLL = 375576;
export const CONSECRATION = 26573;
export const AVENGERS_SHIELD = 31935;
export const HAND_OF_RECKONING = 62124;
export const HOLY_POWER_WIRE = 9;

// ---------------------------------------------------------------------------
// Talent trees (trait entry / node ids from paladin-protection-talents.json)
// ---------------------------------------------------------------------------

export interface TreeEntry {
  readonly id: number;
  readonly rank: number | null;
  readonly nodeId: number | null;
}

const entry = (id: number, nodeId: number, rank = 1): TreeEntry => ({ id, rank, nodeId });

/** The spec-tree facts the real subject exhibits, minus the hero tree. */
export const SPEC_TREE_BASE: readonly TreeEntry[] = [
  entry(102440, 81477), // Righteous Protector
  entry(102466, 81497), // Sentinel
  entry(102448, 81483), // Avenging Wrath
  entry(102430, 81469), // Blessed Hammer (choice node with Hammer of the Righteous)
  entry(136496, 110006), // Divine Toll (class tree, Protection row)
  entry(137022, 110418), // Glory of the Vanguard tier 1 (apex.1)
  entry(137021, 110418, 2), // tier 2 (apex.2)
  entry(137020, 110418), // tier 3 (apex.3)
];

export const LIGHTSMITH_ENTRIES: readonly TreeEntry[] = [
  entry(117882, 95234), // Holy Armaments
  entry(117884, 95235), // Divine Guidance
];

export const TEMPLAR_ENTRIES: readonly TreeEntry[] = [
  entry(117822, 95186), // Undisputed Ruling
  entry(117818, 95184), // Hammerfall
];

export const LIGHTSMITH_TREE: readonly TreeEntry[] = [...SPEC_TREE_BASE, ...LIGHTSMITH_ENTRIES];
export const TEMPLAR_TREE: readonly TreeEntry[] = [...SPEC_TREE_BASE, ...TEMPLAR_ENTRIES];
export const NO_HERO_TREE: readonly TreeEntry[] = SPEC_TREE_BASE;

/** A tree that reached only tier 2 of the apex node. */
export const APEX_TIER_TWO_TREE: readonly TreeEntry[] = SPEC_TREE_BASE.filter((e) => e.id !== 137020);

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * A SYNTHETIC gear row in NORMALIZED form. An option left out is KNOWN_NONE —
 * the state an omitted key takes under the dated Warcraft Logs contract; a
 * number (or list) is KNOWN; the literal "UNKNOWN" is a present-but-unreadable
 * value, which is what keeps the M10-C3 candidate analysis exercisable.
 */
export function protGear(
  slotIndex: number,
  itemId: number,
  options: {
    readonly permanentEnchantId?: number | "UNKNOWN";
    readonly temporaryEnchantId?: number | "UNKNOWN";
    readonly gemIds?: readonly number[] | "UNKNOWN";
    readonly itemLevel?: number | null;
  } = {},
): GearPiece {
  const enchant = (value: number | "UNKNOWN" | undefined): GearEnchantState =>
    value === undefined
      ? { state: "KNOWN_NONE", contract: WCL_GEAR_UI_SEMANTICS_REVISION }
      : value === "UNKNOWN"
        ? { state: "UNKNOWN", reason: "NULL_VALUE" }
        : { state: "KNOWN", enchantId: value };
  const gems: GearGemsState =
    options.gemIds === undefined
      ? { state: "KNOWN_NONE", contract: WCL_GEAR_UI_SEMANTICS_REVISION }
      : options.gemIds === "UNKNOWN"
        ? { state: "UNKNOWN", reason: "NULL_VALUE" }
        : { state: "KNOWN", gemIds: options.gemIds };
  return {
    slotIndex,
    itemId,
    itemLevel: options.itemLevel ?? (itemId === 0 ? 0 : 300),
    quality: null,
    permanentEnchant: enchant(options.permanentEnchantId),
    temporaryEnchant: enchant(options.temporaryEnchantId),
    gems,
    bonusIds: null,
    setId: null,
  };
}

export function protCombatantInfo(
  options: Omit<EventOptions, "sourceActorId"> & {
    readonly talentTree: readonly TreeEntry[];
    readonly gear?: readonly GearPiece[];
  },
): CombatantInfoEvent {
  const rawType = "combatantinfo";
  return {
    locator: locatorFor({ ...options, sourceActorId: PROT_ACTOR }, rawType),
    ingestionOrdinal: options.ordinal,
    reportTimeMs: options.reportTimeMs,
    fightTimeMs: options.reportTimeMs - 1000,
    rawType,
    source: sourceRef(PROT_ACTOR, null),
    target: null,
    sourceAbsence: null,
    targetAbsence: "NOT_SUPPLIED",
    abilityGameId: null,
    attachedResources: null,
    outsideRequestedRange: false,
    kind: "COMBATANT_INFO",
    snapshot: {
      actorId: PROT_ACTOR,
      specId: 66,
      gear: options.gear ?? [],
      malformedGearRows: [],
      talentTree: options.talentTree.map((e) => ({ id: e.id, rank: e.rank, nodeId: e.nodeId })),
    },
  };
}

/** A COMPLETE cast by the subject, optionally carrying a Holy Power PRE_COST entry. */
export function protCast(options: {
  readonly ordinal: number;
  readonly reportTimeMs: number;
  readonly abilityGameId: number;
  readonly targetActorId?: number | null;
  readonly holyPower?: { readonly amount: number; readonly max: number; readonly cost: number } | undefined;
  readonly melee?: boolean;
}): CombatEvent {
  const cast = castEvent({
    ordinal: options.ordinal,
    reportTimeMs: options.reportTimeMs,
    sourceActorId: PROT_ACTOR,
    targetActorId: options.targetActorId === undefined ? BOSS_ACTOR : options.targetActorId,
    abilityGameId: options.abilityGameId,
    castPhase: "COMPLETE",
    attachedResources:
      options.holyPower === undefined
        ? null
        : attachedResources({
            side: "SOURCE",
            actorId: PROT_ACTOR,
            classResources: [
              classResource(HOLY_POWER_WIRE, options.holyPower.amount, {
                max: options.holyPower.max,
                cost: options.holyPower.cost,
              }),
            ],
          }),
  });
  return options.melee === true ? { ...cast, isMelee: true } : cast;
}

/**
 * A fully observed synthetic fight for the subject: every named category
 * COMPLETE for actor 7 over the whole window, so absence claims are
 * supportable and the test is about the evaluator, not the evidence.
 */
export function protState(
  events: readonly CombatEvent[],
  options: {
    readonly observedCategories?: readonly EvidenceCategory[];
    readonly actorScope?: readonly number[] | null;
  } = {},
): CombatState {
  return createCombatState(
    syntheticFight({
      focusActorId: PROT_ACTOR,
      events,
      observedCategories: options.observedCategories ?? [
        "CASTS",
        "RESOURCES",
        "AURAS",
        "COMBATANT_INFO",
        "GEAR",
      ],
      actorScope: options.actorScope === undefined ? [PROT_ACTOR] : options.actorScope,
    }),
  );
}

// ---------------------------------------------------------------------------
// Authorities
// ---------------------------------------------------------------------------

const FAKE_COMMIT = "0".repeat(40);
const FAKE_SOURCE_HASH = "1".repeat(64);

/** A SYNTHETIC Protection artifact. Labelled by id; never registered. */
export function syntheticProtectionArtifact(defaultLines: readonly string[]): Record<string, unknown> {
  return {
    artifactVersion: 1,
    authorityId: "SIMC_APL_TEST_PALADIN_PROTECTION_SYNTHETIC",
    artifactRevision: "synthetic-1",
    spec: { className: "paladin", specName: "protection" },
    entryListName: "default",
    provenance: {
      repository: "https://example.invalid/simc",
      branch: "test",
      commitSha: FAKE_COMMIT,
      commitDate: "2026-01-01",
      sourcePath: "engine/class_modules/apl/apl_paladin.cpp",
      sourceSha256: FAKE_SOURCE_HASH,
      sourceByteLength: 1,
      regionStartMarker: "//protection_apl_start",
      regionEndMarker: "//protection_apl_end",
      extractedOn: "2026-01-01",
      extractorVersion: 1,
    },
    lists: [
      {
        listName: "default",
        receiverIdentifier: "default",
        actions: defaultLines.map((actionStringVerbatim, index) => ({
          priorityOrdinal: index,
          actionStringVerbatim,
          comment: null,
          sourceLine: 100 + index,
        })),
      },
    ],
  };
}

export function syntheticProtectionAuthority(defaultLines: readonly string[]): AplAuthority {
  const loaded = loadAplAuthority(syntheticProtectionArtifact(defaultLines));
  if (!loaded.ok) throw new Error(`synthetic authority failed to load: ${loaded.reason}: ${loaded.detail}`);
  return loaded.authority;
}

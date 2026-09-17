/**
 * M10-C correction 1: the meta-actions before the first ordinary GCD
 * candidate of the pinned Protection list — `use_item`, `use_items`,
 * `potion`, `avenging_wrath`, `fireblood` — and what the evaluator may and
 * may not do with them.
 *
 * Real-evidence cases run over the committed M10-B opener; every other
 * premise is SYNTHETIC and says so.
 */

import { describe, expect, it } from "vitest";

import { corpusState } from "../support/corpus/fight.js";
import {
  JUDGMENT,
  LIGHTSMITH_TREE,
  PROT_ACTOR,
  protGear,
  syntheticProtectionAuthority,
} from "../support/protection-paladin-fixture.js";
import { pinnedProtectionPaladinAuthority } from "../../src/specs/paladin/protection/pinned-authority.js";
import {
  resolveProtectionApplicability,
  resolveProtectionUsability,
  wornSubActionSet,
  type ProtectionBuildFacts,
} from "../../src/specs/paladin/protection/action-profile.js";
import {
  hasExecutedToken,
  forgetAtoms,
  overlayWings,
  protectionContractForSelected,
} from "../../src/specs/paladin/protection/first-gcd-adapter.js";
import {
  initialProtectionState,
  protectionStateKey,
  withExecution,
  withForgottenAtoms,
} from "../../src/specs/paladin/protection/first-gcd-state.js";
import {
  resolveProtectionHeroTree,
  resolveProtectionTalent,
} from "../../src/data/game/paladin-protection-talents.js";
import {
  protectionItemEffectForItemId,
  protectionItemEffectForToken,
  pinnedProtectionPaladinItemEffects,
} from "../../src/data/game/paladin-protection-item-effects.js";
import {
  pinnedProtectionPaladinEnchantEffects,
  protectionEnchantCreatesUseEffect,
  protectionGemCreatesUseEffect,
  protectionOmittedKeyVerdicts,
} from "../../src/data/game/paladin-protection-enchant-effects.js";
import {
  omittedKeyVerdictsOf,
  validateEnchantEffectArtifact,
} from "../../src/data/game/enchant-effect-artifact.js";
import enchantArtifactJson from "../../src/data/game/paladin-protection-enchant-effects.json";
import {
  DIVINE_INSPIRATION_DISPLAY_NAME,
  candidateFromUniverseRow,
  candidateRowsFor,
  protectionSubactionPolicy,
  resolveProtectionHeroEntry,
  subactionCandidateMatrix,
} from "../../src/specs/paladin/protection/subaction-candidates.js";
import { proveSubactionIdentityIrrelevant } from "../../src/simc/subaction-equivalence.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import {
  PROTECTION_NON_GCD_TRANSITIONS,
  protectionItemUseContractFor,
  protectionTransitionContractFor,
  REVIEWED_ON_USE_DRIVER_SPELL_ID,
  WINGS_BASE_COOLDOWN_MS,
} from "../../src/data/game/paladin-protection-transition-authority.js";
import { protectionSpenderCostFor } from "../../src/data/game/paladin-protection-spender-costs.js";
import { isEmptyGearSlot } from "../../src/engine/normalization/combatant-info.js";
import { unknownNumber, type AtomBindings } from "../../src/simc/expression/evaluate.js";
import type { GearPiece } from "../../src/engine/normalization/normalized-events.js";
import type { TalentSelection } from "../../src/data/game/talent-selection.js";
import type { SelectedNonGcdAction } from "../../src/simc/first-gcd-selection.js";
import type { AplAction } from "../../src/simc/apl-authority.js";

const OPENER = "wcl-protection-paladin-a7r6-opener";
const VORACIOUS_HEART = 270_175;
const PUZZLE_BOX = 193_701;
const PUZZLE_BOX_DRIVER = 383_781;
const SENTINEL = 389_539;

const authority = pinnedProtectionPaladinAuthority();
if (!authority.ok) throw new Error("pinned authority");
const pinnedAction = (token: string): AplAction => {
  const found = authority.authority.actions.find((a) => a.actionToken === token);
  if (found === undefined) throw new Error(`no ${token} in the pinned list`);
  return found;
};

function realGear(): readonly GearPiece[] {
  const state = corpusState(OPENER);
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event?.kind === "COMBATANT_INFO" && event.snapshot.actorId === PROT_ACTOR) return event.snapshot.gear;
  }
  throw new Error("no combatant info for actor 7");
}

/**
 * The real gear with every KNOWN_NONE identity turned into an UNKNOWN one
 * (present-but-null). This is the shape a payload that DID carry the keys with
 * null values would normalise to, and it is what keeps the M10-C2/C3 census
 * and equivalence machinery exercised now that the real subject closes.
 */
function withUnknownIdentities(gear: readonly GearPiece[]): readonly GearPiece[] {
  return gear.map((piece) => ({
    ...piece,
    permanentEnchant:
      piece.permanentEnchant.state === "KNOWN_NONE"
        ? { state: "UNKNOWN", reason: "NULL_VALUE" }
        : piece.permanentEnchant,
    temporaryEnchant:
      piece.temporaryEnchant.state === "KNOWN_NONE"
        ? { state: "UNKNOWN", reason: "NULL_VALUE" }
        : piece.temporaryEnchant,
    gems: piece.gems.state === "KNOWN_NONE" ? { state: "UNKNOWN", reason: "NULL_VALUE" } : piece.gems,
  }));
}

function facts(
  wornGear: readonly GearPiece[],
  divineInspiration: TalentSelection = "SELECTED",
): ProtectionBuildFacts {
  return {
    blessedHammer: resolveProtectionTalent(LIGHTSMITH_TREE, "blessed_hammer"),
    sentinel: resolveProtectionTalent(LIGHTSMITH_TREE, "sentinel"),
    avengingWrath: resolveProtectionTalent(LIGHTSMITH_TREE, "avenging_wrath"),
    heroTree: resolveProtectionHeroTree(LIGHTSMITH_TREE),
    wornGear,
    malformedGearRows: [],
    divineInspiration,
  };
}

/** SYNTHETIC: a closed row — every enchant/gem key reported with a pinned non-use id. */
const closed = (slotIndex: number, itemId: number): GearPiece =>
  protGear(slotIndex, itemId, { permanentEnchantId: 7967, temporaryEnchantId: 7967, gemIds: [] });

function selected(action: AplAction): SelectedNonGcdAction {
  return {
    actionToken: action.actionToken,
    step: {
      path: [
        { listName: "default", priorityOrdinal: action.priorityOrdinal, actionToken: action.actionToken },
      ],
      listName: "default",
      priorityOrdinal: action.priorityOrdinal,
      actionToken: action.actionToken,
      actionStringVerbatim: action.actionStringVerbatim,
      sourceLine: action.sourceLine,
      entryKind: "PLAYER_ACTION",
      gate: { kind: "UNCONDITIONAL" },
      usability: "UNKNOWN",
      applicability: { kind: "APPLICABLE" },
      usabilityVerdict: null,
      targetingRefusal: null,
      gateIrrelevance: null,
      outcome: "MAY_SELECT",
    },
  };
}

const neutral = initialProtectionState("OTHER");

describe("the pinned item and enchant datasets (REAL artifacts)", () => {
  it("pin the subject's seventeen worn items plus the puzzle box, with exactly one item-sourced on-use effect", () => {
    const load = pinnedProtectionPaladinItemEffects();
    expect(load.ok).toBe(true);
    if (!load.ok) return;
    expect(load.artifact.datasetId).toBe("SIMC_DBC_PALADIN_PROTECTION_ITEM_USE_EFFECTS");
    expect(load.artifact.items).toHaveLength(18);
    const onUse = load.artifact.items.filter((item) => item.onUseEffect !== null);
    expect(onUse.map((item) => item.itemId).sort()).toEqual([PUZZLE_BOX, VORACIOUS_HEART]);
    const heart = protectionItemEffectForItemId(VORACIOUS_HEART)?.onUseEffect;
    expect(heart).toMatchObject({
      effectSpellId: REVIEWED_ON_USE_DRIVER_SPELL_ID,
      baseGcdMs: 0,
      baseCooldownMs: 90_000,
      writeClassification: "OTHER",
    });
    expect(protectionItemEffectForToken("algethar_puzzle_box")?.itemId).toBe(PUZZLE_BOX);
    // The Rogue-only cooldown-modifier review is NOT carried into the Paladin artifact.
    expect(load.artifact.actionSemantics.checks.map((c) => c.claim)).not.toContain(
      "NO_ROGUE_MODIFIER_APPLIES_TO_AN_ITEM_USE_COOLDOWN",
    );
  });

  it("pin every enchant and gem the subject's gear reports as NOT creating a use effect, and nothing else", () => {
    const load = pinnedProtectionPaladinEnchantEffects();
    expect(load.ok).toBe(true);
    if (!load.ok) return;
    expect(load.artifact.provenance.useSpellEnchantType).toBe(7);
    expect(load.artifact.enchants.map((e) => e.enchantId)).toEqual([
      7961, 8031, 7987, 8159, 8019, 7967, 7981, 7143,
    ]);
    expect(load.artifact.gems.map((g) => [g.itemId, g.enchant.enchantId])).toEqual([
      [240_890, 8117],
      [240_983, 8552],
    ]);
    for (const row of [...load.artifact.enchants, ...load.artifact.gems.map((g) => g.enchant)]) {
      expect(row.createsUseEffect).toBe(false);
      expect(row.enchTypes).not.toContain(7);
    }
    expect(protectionEnchantCreatesUseEffect(7143)).toBe(false);
    expect(protectionGemCreatesUseEffect(240_890)).toBe(false);
    // An unpinned id is null: neither "use" nor "no use".
    expect(protectionEnchantCreatesUseEffect(1)).toBeNull();
    expect(protectionGemCreatesUseEffect(1)).toBeNull();
  });

  it("carries the EXHAUSTIVE use-effect universe of the pinned build, machine-derived and re-validated (M10-C2)", () => {
    const load = pinnedProtectionPaladinEnchantEffects();
    if (!load.ok) throw new Error(load.reason);
    const universe = load.artifact.useEffectUniverse;
    // The census ran over the whole table, not a wanted list.
    expect(universe.totalEnchantRows).toBe(5334);
    expect(universe.temporaryEnchantRows).toBe(116);
    expect(universe.permanentEnchantIds).toBe(1043);
    expect(universe.useProducingRows).toHaveLength(39);
    for (const row of universe.useProducingRows) {
      expect(row.enchTypes.some((type, index) => type === 7 && row.enchProps[index] !== 0)).toBe(true);
    }
    // Zero temporary enchants create a use effect: an omitted temporaryEnchant key cannot hide one.
    expect(universe.temporaryUseProducingCount).toBe(0);
    // Nineteen are gem-borne (seven by their own id_gem, twelve more reached from a gem
    // property row); eighteen are permanent enchants restricted to waist, back and head
    // (bits 6, 16 and 1); THREE have NO pinned placement at all.
    expect(universe.gemBorneUseProducingCount).toBe(19);
    expect(universe.useProducingRows.filter((row) => row.gemItemId !== null)).toHaveLength(7);
    expect(universe.permanentUseProducingInventoryTypeMask).toBe((1 << 6) | (1 << 16) | (1 << 1));
    expect(universe.useProducingRows.filter((row) => row.permanent !== null)).toHaveLength(18);
    expect(universe.unplacedUseProducingCount).toBe(3);
    expect(
      universe.useProducingRows.filter((row) => !row.placementKnown).map((row) => row.enchantId),
    ).toEqual([3290, 3291, 3859]);
    // M10-C3: every row's USE spell resolved against the pinned spell table, or recorded absent.
    expect(universe.unresolvedDriverCount).toBe(5);
    expect(universe.scriptedDriverCount).toBe(6);
    expect(
      universe.useProducingRows
        .filter((row) => row.drivers.some((driver) => !driver.resolved))
        .map((row) => row.enchantId),
    ).toEqual([3290, 3291, 3605, 3859, 5000]);
    expect(
      universe.useProducingRows
        .filter((row) => row.drivers.some((driver) => driver.resolved && driver.scriptedIn.length > 0))
        .map((row) => row.enchantId),
    ).toEqual([4188, 4223, 6098, 6099, 6499, 6508]);
    expect(universe.genericRuleEnumerators).toMatchObject({
      E_APPLY_AURA: 6,
      E_DUMMY: 3,
      A_MOD_STAT: 29,
      A_MOD_RATING: 189,
    });
    for (const path of [
      "engine/dbc/generated/sc_spell_data.inc",
      "engine/item/special_effect.cpp",
      "engine/player/unique_gear.cpp",
    ]) {
      expect(load.artifact.provenance.sources.map((source) => source.path)).toContain(path);
    }
    // The sources behind the census are hashed in provenance.
    for (const path of [
      "engine/dbc/generated/spell_item_enchantment.inc",
      "engine/dbc/generated/temporary_enchant.inc",
      "engine/dbc/generated/permanent_enchant.inc",
    ]) {
      expect(load.artifact.provenance.sources.map((source) => source.path)).toContain(path);
    }
  });

  it("refuses an artifact whose shipped driver reading disagrees with its own effect rows", () => {
    const tampered = JSON.parse(JSON.stringify(enchantArtifactJson)) as {
      useEffectUniverse: {
        useProducingRows: { drivers: { resolved: boolean; generic?: { actionType: string } }[] }[];
      };
    };
    const driver = tampered.useEffectUniverse.useProducingRows.find((row) => row.drivers[0]?.resolved)
      ?.drivers[0];
    if (driver === undefined || driver.generic === undefined) throw new Error("no resolved driver");
    driver.generic.actionType = driver.generic.actionType === "NONE" ? "SPELL" : "NONE";
    expect(validateEnchantEffectArtifact(tampered)).toMatchObject({
      ok: false,
      reason: "DRIVER_READING_MISMATCH",
    });
  });

  it("refuses an artifact whose universe summary disagrees with its rows", () => {
    const tampered = JSON.parse(JSON.stringify(enchantArtifactJson)) as {
      useEffectUniverse: { unplacedUseProducingCount: number; temporaryUseProducingCount: number };
    };
    tampered.useEffectUniverse.unplacedUseProducingCount = 0;
    expect(validateEnchantEffectArtifact(tampered)).toMatchObject({
      ok: false,
      reason: "UNIVERSE_SUMMARY_MISMATCH",
    });
    const tampered2 = JSON.parse(JSON.stringify(enchantArtifactJson)) as {
      useEffectUniverse: { temporaryUseProducingCount: number };
    };
    tampered2.useEffectUniverse.temporaryUseProducingCount = 1;
    expect(validateEnchantEffectArtifact(tampered2)).toMatchObject({
      ok: false,
      reason: "UNIVERSE_SUMMARY_MISMATCH",
    });
  });

  it("verdicts on omitted keys: temporary EXCLUDED; permanent POSSIBLE everywhere (unplaced rows); gems POSSIBLE", () => {
    const verdicts = protectionOmittedKeyVerdicts();
    if (verdicts === null) throw new Error("universe");
    expect(verdicts.temporaryUseEnchantPossible).toBe(false);
    expect(verdicts.gemBorneUseEffectPossible).toBe(true);
    // Waist (6) and back (16) are admitted by real permanent tinker rows; neck (2) only by the unplaced rows.
    expect(verdicts.permanentUseEnchantPossible(6)).toEqual({
      possible: true,
      detail:
        "3 use-producing enchant row(s) carry no pinned placement and 15 permanent row(s) admit inventory type 6",
    });
    expect(verdicts.permanentUseEnchantPossible(2).possible).toBe(true);
    expect(verdicts.permanentUseEnchantPossible(2).detail).toContain(
      "0 permanent row(s) admit inventory type 2",
    );
    // The SAME universe with the unplaced rows removed would close the neck but not the waist:
    // the exclusion is by pinned placement, never by assumption.
    const load = pinnedProtectionPaladinEnchantEffects();
    if (!load.ok) throw new Error(load.reason);
    const placedOnly = {
      ...load.artifact.useEffectUniverse,
      useProducingRows: load.artifact.useEffectUniverse.useProducingRows.filter((row) => row.placementKnown),
      unplacedUseProducingCount: 0,
    };
    const hypothetical = omittedKeyVerdictsOf(placedOnly);
    expect(hypothetical.permanentUseEnchantPossible(2).possible).toBe(false);
    expect(hypothetical.permanentUseEnchantPossible(6).possible).toBe(true);
    expect(hypothetical.permanentUseEnchantPossible(16).possible).toBe(true);
  });
});

describe("the worn sub-action set over the REAL M10-B gear", () => {
  const realClosed = realGear();
  const gear = withUnknownIdentities(realClosed);

  it("CLOSES under the dated contract (M10-C4): one on-use item, no open slot, nothing proved by equivalence", () => {
    const set = wornSubActionSet(realClosed, "SELECTED");
    expect(set.onUse.map((item) => item.itemId)).toEqual([VORACIOUS_HEART]);
    expect(set.open).toEqual([]);
    expect(set.provenIrrelevant).toEqual([]);
    // Derived, not hard-coded: every omitted identity on the worn rows is KNOWN_NONE under the contract.
    const worn = realClosed.filter((piece) => !isEmptyGearSlot(piece));
    const knownNone = worn.flatMap((piece) =>
      [piece.permanentEnchant, piece.temporaryEnchant, piece.gems].filter(
        (field) => field.state === "KNOWN_NONE",
      ),
    );
    expect(knownNone.length).toBeGreaterThan(0);
    for (const field of knownNone) {
      expect(field).toEqual({
        state: "KNOWN_NONE",
        contract: "WCL_COMBATANT_INFO_GEAR_UI_SEMANTICS_2026_09_17",
      });
    }
    // The matrix has nothing to ask about: no identity is UNKNOWN.
    expect(subactionCandidateMatrix(realClosed, "SELECTED")).toEqual([]);
    // And the contract is admitted for use_items.
    const resolved = protectionContractForSelected(selected(pinnedAction("use_items")), facts(realClosed));
    expect("contract" in resolved && resolved.contract.simcToken).toBe("use_items");
  });

  it("with the SAME gear carrying null identities, finds the one on-use item, treats the empty shirt slot as nothing, and leaves 22 facts OPEN", () => {
    const set = wornSubActionSet(gear);
    expect(set.onUse.map((item) => item.itemId)).toEqual([VORACIOUS_HEART]);
    const shirt = gear.find((piece) => piece.slotIndex === 3);
    expect(shirt).toMatchObject({ itemId: 0, itemLevel: 0 });
    expect(isEmptyGearSlot(shirt as GearPiece)).toBe(true);
    expect(set.open.some((slot) => slot.slotIndex === 3)).toBe(false);
    // Every open fact is an UNREPORTED key, never an unpinned item, enchant or gem.
    // The 16 omitted temporaryEnchant keys are CLOSED by the universe (no temporary
    // enchant creates a use effect); the 9 omitted permanentEnchant keys and 13
    // omitted gems keys stay open, each naming what the pinned build admits.
    const counts = new Map<string, number>();
    for (const slot of set.open) counts.set(slot.reason, (counts.get(slot.reason) ?? 0) + 1);
    expect([...counts.entries()]).toEqual([
      ["ENCHANT_STATE_NOT_REPORTED", 9],
      ["GEM_STATE_NOT_REPORTED", 13],
    ]);
    expect(
      set.open.filter((slot) => slot.reason === "ENCHANT_STATE_NOT_REPORTED").map((slot) => slot.slotIndex),
    ).toEqual([1, 5, 8, 9, 12, 13, 14, 16, 17]);
    for (const slot of set.open) {
      expect(slot.detail).not.toContain("temporaryEnchant");
      if (slot.reason === "ENCHANT_STATE_NOT_REPORTED") {
        expect(slot.detail).toContain("3 use-producing enchant row(s) carry no pinned placement");
        expect(slot.detail).toContain("are not observationally equivalent");
      }
    }
    // M10-C3: the proof closed NOTHING on the real gear, and every omission is accounted for:
    // 38 omitted keys = 16 temporary (excluded by the universe) + 22 open. Nothing was read as none.
    expect(set.provenIrrelevant).toEqual([]);
    const omitted = gear
      .filter((piece) => !isEmptyGearSlot(piece))
      .reduce(
        (n, piece) =>
          n +
          (piece.permanentEnchant.state === "UNKNOWN" ? 1 : 0) +
          (piece.temporaryEnchant.state === "UNKNOWN" ? 1 : 0) +
          (piece.gems.state === "UNKNOWN" ? 1 : 0),
        0,
      );
    expect(omitted).toBe(38);
    expect(set.open.length + set.provenIrrelevant.length + 16).toBe(38);
    // The waist (slot 5, inventory type 6) is admitted by real permanent tinker rows too.
    expect(
      set.open.find((slot) => slot.slotIndex === 5 && slot.reason === "ENCHANT_STATE_NOT_REPORTED")?.detail,
    ).toContain("15 permanent row(s) admit inventory type 6");
  });

  it("M10-C3 matrix over the null-identity copy: every one of the 22 open facts has a deterministic candidate set and every set is decision-relevant", () => {
    const state = corpusState(OPENER);
    let talents: { id: number; nodeId: number | null }[] = [];
    for (const position of state.positionsOfKind("COMBATANT_INFO")) {
      const event = state.eventAt(position);
      if (event?.kind === "COMBATANT_INFO" && event.snapshot.actorId === PROT_ACTOR) {
        talents = event.snapshot.talentTree.map((e) => ({ id: e.id, nodeId: e.nodeId }));
      }
    }
    // The subject took Divine Inspiration (entry 117877): generic damage/heal procs are observable.
    expect(resolveProtectionHeroEntry(talents, DIVINE_INSPIRATION_DISPLAY_NAME)).toEqual({
      selection: "SELECTED",
      traitEntryId: 117_877,
    });
    const matrix = subactionCandidateMatrix(gear, "SELECTED");
    expect(subactionCandidateMatrix(gear, "SELECTED")).toEqual(matrix);
    expect(matrix).toHaveLength(22);
    expect(matrix.every((row) => row.verdict.kind === "IDENTITY_DECISION_RELEVANT")).toBe(true);
    expect(matrix.every((row) => row.lanes.length === 1 && row.lanes[0] === "NON_GCD")).toBe(true);
    const byKey = (slot: number, field: "permanentEnchant" | "gems") =>
      matrix.find((row) => row.slotIndex === slot && row.unknownField === field);
    // Neck (inventory type 2): only the three unplaced rows, all with an absent driver spell.
    expect(byKey(1, "permanentEnchant")?.candidateEnchantIds).toEqual([3290, 3291, 3859]);
    expect(byKey(1, "permanentEnchant")?.verdict).toMatchObject({
      blocking: [
        {
          id: "enchant:3290",
          defects: ["TRANSITION_UNKNOWN", "COOLDOWN_UNKNOWN", "OBSERVABLE_WRITE:UNRESOLVED"],
        },
        {
          id: "enchant:3291",
          defects: ["TRANSITION_UNKNOWN", "COOLDOWN_UNKNOWN", "OBSERVABLE_WRITE:UNRESOLVED"],
        },
        {
          id: "enchant:3859",
          defects: ["TRANSITION_UNKNOWN", "COOLDOWN_UNKNOWN", "OBSERVABLE_WRITE:UNRESOLVED"],
        },
      ],
    });
    // Waist (6): the unplaced rows plus fifteen permanent tinker rows; Frag Belt (3601) advances time
    // and deals damage, the healing injector (4750) heals, two are scripted, one more driver is absent.
    expect(byKey(5, "permanentEnchant")?.candidateEnchantIds).toEqual([
      3290, 3291, 3599, 3601, 3859, 4187, 4188, 4214, 4222, 4223, 4750, 5000, 5952, 5953, 5967, 6192, 6193,
      6194,
    ]);
    expect(byKey(5, "permanentEnchant")?.verdict).toMatchObject({
      blocking: expect.arrayContaining([
        { id: "enchant:3601", defects: ["TIME_ADVANCE", "OBSERVABLE_WRITE:DAMAGE_ACTION"] },
        { id: "enchant:4750", defects: ["OBSERVABLE_WRITE:HEAL_ACTION"] },
        { id: "enchant:4188", defects: ["OBSERVABLE_WRITE:SCRIPTED_UNREVIEWED"] },
      ]),
    });
    // Back (16): the unplaced rows plus the two back tinkers; the Flexweave driver (3605) is absent.
    expect(byKey(14, "permanentEnchant")?.candidateEnchantIds).toEqual([3290, 3291, 3605, 3859, 4897]);
    // Every omitted gems key: the nineteen gem-borne rows; the same eight block each time.
    const gemBlocking = [
      "enchant:4223",
      "enchant:6098",
      "enchant:6099",
      "enchant:6499",
      "enchant:6506",
      "enchant:6508",
      "enchant:6519",
      "enchant:8705",
    ];
    for (const row of matrix.filter((entry) => entry.unknownField === "gems")) {
      expect(row.candidateEnchantIds).toHaveLength(19);
      expect(
        row.verdict.kind === "IDENTITY_DECISION_RELEVANT" && row.verdict.blocking.map((b) => b.id),
      ).toEqual(gemBlocking);
    }
    // The inert majority converges on their own: the eleven quiet gem-borne rows pass the proof.
    const quiet = candidateRowsFor("gems", 0)
      .map(candidateFromUniverseRow)
      .filter((candidate) => !gemBlocking.includes(candidate.id));
    expect(quiet).toHaveLength(11);
    expect(proveSubactionIdentityIrrelevant(quiet, protectionSubactionPolicy("SELECTED")).kind).toBe(
      "UNKNOWN_SUBACTION_IDENTITY_OBSERVATIONALLY_IRRELEVANT",
    );
    // Under a NOT_SELECTED Divine Inspiration the damage-only 6506 would pass, but the scripted,
    // absent-driver and zero-cooldown rows still would not: the identity stays relevant either way.
    const relaxed = proveSubactionIdentityIrrelevant(
      candidateRowsFor("gems", 0).map(candidateFromUniverseRow),
      protectionSubactionPolicy("NOT_SELECTED"),
    );
    expect(relaxed.kind === "IDENTITY_DECISION_RELEVANT" && relaxed.blocking.map((b) => b.id)).toEqual(
      gemBlocking.filter((id) => id !== "enchant:6506"),
    );
  });

  it("no consumer under src/ turns an UNKNOWN identity into a known value: only the adapter's KNOWN_NONE means none", () => {
    const files = readdirSync("src", { recursive: true, withFileTypes: false })
      .map((entry) => `src/${String(entry).replace(/\\/g, "/")}`)
      .filter((path) => path.endsWith(".ts") && statSync(path).isFile());
    expect(files.length).toBeGreaterThan(100);
    // The dated contract is applied in exactly one module.
    const appliers = files.filter((file) =>
      /KNOWN_NONE", contract: WCL_GEAR_UI_SEMANTICS_REVISION/.test(readFileSync(file, "utf8")),
    );
    expect(appliers).toEqual(["src/engine/normalization/combatant-info.ts"]);
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/state === "UNKNOWN"[^\n]*\?\s*(0|\[\]|null)\b/);
    }
  });

  it("default[1] use_item,name=algethar_puzzle_box is NOT_APPLICABLE: the item is pinned and not worn", () => {
    expect(resolveProtectionApplicability(facts(gear), neutral, pinnedAction("use_item"))).toMatchObject({
      kind: "NOT_APPLICABLE",
      reason: "ITEM_NOT_EQUIPPED",
      evidence: { itemId: PUZZLE_BOX },
    });
  });

  it("default[2] use_items over the null-identity copy is APPLICABLE (a pinned on-use item is worn), but has NO contract while the set is open", () => {
    expect(resolveProtectionApplicability(facts(gear), neutral, pinnedAction("use_items")).kind).toBe(
      "APPLICABLE",
    );
    expect(resolveProtectionUsability(neutral, pinnedAction("use_items"), JUDGMENT).kind).toBe("UNKNOWN");
    const resolved = protectionContractForSelected(selected(pinnedAction("use_items")), facts(gear));
    expect("refusal" in resolved).toBe(true);
    if (!("refusal" in resolved)) return;
    expect(resolved.refusal).toContain("not closed");
    expect(resolved.refusal).toContain("ENCHANT_STATE_NOT_REPORTED");
    expect(resolved.refusal).toContain("21 more");
  });
});

describe("item applicability and contracts over SYNTHETIC gear", () => {
  it("use_item is APPLICABLE when the named item is worn, and stays live for an unpinned name", () => {
    const worn = [protGear(12, PUZZLE_BOX)];
    expect(resolveProtectionApplicability(facts(worn), neutral, pinnedAction("use_item")).kind).toBe(
      "APPLICABLE",
    );
    const synthetic = syntheticProtectionAuthority(["use_item,name=not_a_pinned_item", "judgment"]);
    const unpinned = synthetic.actions.find((a) => a.actionToken === "use_item");
    if (unpinned === undefined) throw new Error("synthetic use_item");
    expect(resolveProtectionApplicability(facts([]), neutral, unpinned).kind).toBe("APPLICABLE");
  });

  it("use_items: UNKNOWN when nothing on-use is pinned and a slot is open; NO_ON_USE_EFFECT only when every slot is closed", () => {
    const openOnly = [protGear(0, 271_465, { permanentEnchantId: "UNKNOWN" })];
    expect(resolveProtectionApplicability(facts(openOnly), neutral, pinnedAction("use_items")).kind).toBe(
      "UNKNOWN",
    );
    const unpinnedItem = [closed(0, 1)];
    expect(resolveProtectionApplicability(facts(unpinnedItem), neutral, pinnedAction("use_items")).kind).toBe(
      "UNKNOWN",
    );
    const closedNoUse = [closed(0, 271_465), closed(13, 270_173), protGear(3, 0)];
    expect(
      resolveProtectionApplicability(facts(closedNoUse), neutral, pinnedAction("use_items")),
    ).toMatchObject({
      kind: "NOT_APPLICABLE",
      reason: "NO_ON_USE_EFFECT",
    });
    // A worn item whose identities are UNKNOWN (present but null) leaves the slot open for the
    // permanent enchant and the gems; only the temporary key is closed, by the universe. A worn
    // item whose keys were OMITTED is KNOWN_NONE under the dated contract and opens nothing.
    const bare = wornSubActionSet([
      protGear(0, 271_465, {
        permanentEnchantId: "UNKNOWN",
        temporaryEnchantId: "UNKNOWN",
        gemIds: "UNKNOWN",
      }),
    ]).open;
    expect(bare.map((s) => s.reason)).toEqual(["ENCHANT_STATE_NOT_REPORTED", "GEM_STATE_NOT_REPORTED"]);
    expect(bare[0]?.detail).toContain("permanentEnchant is UNKNOWN (NULL_VALUE)");
    expect(wornSubActionSet([protGear(0, 271_465)]).open).toEqual([]);
    // A malformed raw row makes the equipment not whole.
    expect(wornSubActionSet([protGear(0, 271_465)], "SELECTED", [4]).open).toEqual([
      { slotIndex: 4, reason: "GEAR_ROW_MALFORMED", detail: "the raw gear row could not be read" },
    ]);
    // An unpinned enchant or gem is open too — and named as unpinned, not as unreported.
    expect(
      wornSubActionSet([
        protGear(0, 271_465, { permanentEnchantId: 1, temporaryEnchantId: 7967, gemIds: [2] }),
      ]).open.map((s) => s.reason),
    ).toEqual(["ENCHANT_NOT_PINNED", "GEM_NOT_PINNED"]);
  });

  it("use_items gets the reviewed contract ONLY for a closed set holding exactly the reviewed driver", () => {
    const closedHeart = [closed(12, VORACIOUS_HEART), closed(13, 270_173)];
    const resolved = protectionContractForSelected(selected(pinnedAction("use_items")), facts(closedHeart));
    expect("contract" in resolved).toBe(true);
    if (!("contract" in resolved)) return;
    expect(resolved.contract).toMatchObject({
      simcToken: "use_items",
      baseGcdMs: 0,
      timeAdvanceMs: 0,
      writes: ["OWN_PREFIX_AVAILABILITY", "PLAYER_STAT_BUFF", "DEFERRED_PROC_CALLBACK_ARMED"],
    });
    expect(resolved.contract.claims.map((c) => c.sourcePath)).toContain(
      "engine/player/unique_gear_midnight.cpp",
    );

    // Two on-use items: which fires is not established, so no contract.
    const two = [closed(12, VORACIOUS_HEART), closed(13, PUZZLE_BOX)];
    const twoResolved = protectionContractForSelected(selected(pinnedAction("use_items")), facts(two));
    expect("refusal" in twoResolved && twoResolved.refusal).toContain("2 on-use item(s)");

    // Only the puzzle box: pinned, on-use, but its driver is a GCD action and is not the reviewed one.
    const box = [closed(12, PUZZLE_BOX)];
    const boxResolved = protectionContractForSelected(selected(pinnedAction("use_items")), facts(box));
    expect("refusal" in boxResolved && boxResolved.refusal).toContain("no reviewed Protection contract");
    const boxEffect = protectionItemEffectForItemId(PUZZLE_BOX)?.onUseEffect;
    if (boxEffect === null || boxEffect === undefined) throw new Error("puzzle box on-use");
    expect(boxEffect.effectSpellId).toBe(PUZZLE_BOX_DRIVER);
    expect(protectionItemUseContractFor("use_item", boxEffect)).toBeNull();
    // A `use_item` naming the worn heart would also be admitted; naming an unworn item is refused.
    const heartEffect = protectionItemEffectForItemId(VORACIOUS_HEART)?.onUseEffect;
    if (heartEffect === null || heartEffect === undefined) throw new Error("heart on-use");
    expect(protectionItemUseContractFor("use_item", heartEffect)?.simcToken).toBe("use_item");
    expect(protectionItemUseContractFor("use_item", { ...heartEffect, baseGcdMs: 1000 })).toBeNull();
    expect(
      protectionItemUseContractFor("use_item", { ...heartEffect, effectShape: [{ type: 6, subtype: 29 }] }),
    ).toBeNull();
    const nameResolved = protectionContractForSelected(
      selected(pinnedAction("use_item")),
      facts(closedHeart),
    );
    expect("refusal" in nameResolved && nameResolved.refusal).toContain("names no pinned, worn, on-use item");
  });
});

describe("the reviewed NON_GCD contracts and the wings overlay", () => {
  it("exactly auto_attack, potion, fireblood, avenging_wrath and shield_of_the_righteous carry token contracts; word_of_glory is refused", () => {
    expect(PROTECTION_NON_GCD_TRANSITIONS.map((c) => c.simcToken)).toEqual([
      "auto_attack",
      "potion",
      "fireblood",
      "avenging_wrath",
      "shield_of_the_righteous",
    ]);
    for (const contract of PROTECTION_NON_GCD_TRANSITIONS) {
      expect(contract.baseGcdMs).toBe(0);
      expect(contract.timeAdvanceMs).toBe(0);
      expect(contract.writes).toContain("OWN_PREFIX_AVAILABILITY");
      for (const claim of contract.claims) expect(claim.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(protectionTransitionContractFor("avenging_wrath")?.writes).toContain("WINGS_BUFF_AND_COOLDOWN");
    for (const token of ["word_of_glory", "arcane_torrent", "use_items", "use_item"]) {
      expect(protectionTransitionContractFor(token)).toBeNull();
    }
    const wog = protectionContractForSelected(selected(pinnedAction("word_of_glory")), facts([]));
    expect("refusal" in wog && wog.refusal).toContain("no reviewed transition contract");
  });

  it("Ula'tek's contract states the deterministic use, the deferred proc channel and the 90 s + 20 s cooldowns", () => {
    const heartEffect = protectionItemEffectForItemId(VORACIOUS_HEART)?.onUseEffect;
    if (heartEffect === null || heartEffect === undefined) throw new Error("heart on-use");
    const contract = protectionItemUseContractFor("use_items", heartEffect);
    if (contract === null) throw new Error("contract");
    expect(contract.writes).toEqual([
      "OWN_PREFIX_AVAILABILITY",
      "PLAYER_STAT_BUFF",
      "DEFERRED_PROC_CALLBACK_ARMED",
    ]);
    expect(contract.claims.map((claim) => claim.sourcePath)).toEqual([
      "engine/dbc/data_enums.hh",
      "engine/player/unique_gear_midnight.cpp",
      "engine/player/player.cpp",
      "engine/buff/buff.cpp",
      "engine/action/dbc_proc_callback.cpp",
      "engine/dbc/generated/sc_spell_data.inc",
      "engine/player/player.cpp",
    ]);
    const text = contract.claims.map((claim) => claim.claim).join(" ");
    expect(text).toContain("DETERMINISTIC");
    expect(text).toContain("does NOT call action_t::execute");
    expect(text).toContain("only on a LATER hit");
    expect(text).toContain("MODIFIERS_POSSIBLE");
    expect(heartEffect.baseCooldownMs).toBe(90_000);
  });

  it("a fired use_items cannot be selected again in its branch, and readiness is UNKNOWN before and after the observed use", () => {
    const useItems = pinnedAction("use_items");
    const fired = withExecution(neutral, {
      listName: "default",
      priorityOrdinal: useItems.priorityOrdinal,
      actionToken: "use_items",
      sourceLine: useItems.sourceLine,
    });
    expect(resolveProtectionUsability(fired, useItems, JUDGMENT)).toMatchObject({
      kind: "PROVEN_UNUSABLE",
      reason: "SIMULATED_PREFIX_EXECUTION",
    });
    // The subject pressed the trinket (1297761) inside the window. That press is not an
    // oracle for readiness at any other position, and no cooldown-modifier review exists
    // for a Paladin, so usability stays UNKNOWN everywhere else.
    expect(resolveProtectionUsability(neutral, useItems, JUDGMENT).kind).toBe("UNKNOWN");
    expect(resolveProtectionUsability(neutral, useItems, 1_297_761).kind).toBe("UNKNOWN");
  });

  it("shield_of_the_righteous: pinned cost 3, 1 s cooldown, and a successor that forgets exactly the atoms it may change", () => {
    const cost = protectionSpenderCostFor("shield_of_the_righteous");
    expect(cost).toMatchObject({
      spellId: 53_600,
      holyPowerCost: 3,
      cooldownMs: 1_000,
      gcdMs: 0,
      charges: 0,
    });
    expect(cost?.powerRows.map((row) => [row.powerType, row.cost, row.auraSpellId])).toEqual([
      [9, 3, 0],
      [9, 3, 1_277_162],
    ]);
    expect(protectionSpenderCostFor("word_of_glory")?.holyPowerCost).toBe(3);
    const contract = protectionTransitionContractFor("shield_of_the_righteous");
    expect(contract).toMatchObject({
      writes: ["OWN_PREFIX_AVAILABILITY", "HOLY_POWER_SPEND", "UNBOUND_ATOMS_MAY_CHANGE"],
      holyPowerCost: 3,
    });
    // CORRECTED AT M10-C5 PHASE B: `next_armament` is no longer listed. A
    // Divine Inspiration proc advances divine_inspiration_next, not
    // next_armament (sc_paladin.cpp:2641, 2752-2753); only an LS_HARDCAST
    // flips the alternation, and a Shield of the Righteous execution is not one.
    expect(contract?.requiresUnbound?.map((atom) => atom.name)).toEqual([
      "shining_light_free",
      "divine_guidance",
      "blessed_assurance",
      "sacred_weapon",
    ]);
    expect(contract?.requiresUnbound?.some((atom) => atom.name === "next_armament")).toBe(false);
    const sotr = selected(pinnedAction("shield_of_the_righteous"));
    const unbound: AtomBindings = {
      comboPoints: unknownNumber("STATE_NOT_MODELLED"),
      comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
      energyPct: unknownNumber("STATE_NOT_MODELLED"),
      knownBuffs: [{ name: "avenging_wrath", up: true }],
    };
    expect("contract" in protectionContractForSelected(sotr, facts([]), unbound)).toBe(true);
    // A caller's binding of an atom the execution may change is NOT a
    // refusal (M10-C5 Phase B): the branch proceeds and its SUCCESSOR forgets
    // exactly that atom, so the shared evaluator enumerates it again.
    const bound: AtomBindings = {
      ...unbound,
      knownBuffs: [
        { name: "blessed_assurance", up: false },
        { name: "avenging_wrath", up: true },
      ],
    };
    expect("contract" in protectionContractForSelected(sotr, facts([]), bound)).toBe(true);
    const forgotten = (contract?.requiresUnbound ?? []).map((atom) => ({ kind: atom.kind, name: atom.name }));
    const widened = forgetAtoms(bound, forgotten);
    // Selective: the atom the contract names is gone; the one it does not name stays bound.
    expect(widened.knownBuffs).toEqual([{ name: "avenging_wrath", up: true }]);
    expect(forgetAtoms(unbound, forgotten)).toEqual(unbound);
    // The successor state records the forgetting, and its key differs from the plain successor.
    const executed = withExecution(neutral, {
      listName: "default",
      priorityOrdinal: pinnedAction("shield_of_the_righteous").priorityOrdinal,
      actionToken: "shield_of_the_righteous",
      sourceLine: pinnedAction("shield_of_the_righteous").sourceLine,
    });
    const successor = withForgottenAtoms(executed, forgotten);
    expect(successor.forgottenAtoms.map((atom) => atom.name)).toEqual([
      "shining_light_free",
      "divine_guidance",
      "blessed_assurance",
      "sacred_weapon",
    ]);
    expect(protectionStateKey(successor)).not.toBe(protectionStateKey(executed));
    expect(protectionStateKey(successor)).toContain("forgot[");
    // Forgetting is idempotent: the same atoms again change nothing.
    expect(withForgottenAtoms(successor, forgotten)).toBe(successor);
    // A fired Shield of the Righteous is unusable in its branch (1 s cooldown, prefix rule).
    const fired = withExecution(neutral, {
      listName: "default",
      priorityOrdinal: pinnedAction("shield_of_the_righteous").priorityOrdinal,
      actionToken: "shield_of_the_righteous",
      sourceLine: pinnedAction("shield_of_the_righteous").sourceLine,
    });
    expect(resolveProtectionUsability(fired, pinnedAction("shield_of_the_righteous"), JUDGMENT).kind).toBe(
      "PROVEN_UNUSABLE",
    );
  });

  it("shield_of_the_righteous usability: paid, proven-free-possible and unknown Holy Power", () => {
    const sotr = pinnedAction("shield_of_the_righteous");
    const known = (value: number, freeCastExcluded: boolean) => ({
      holyPower: { state: "KNOWN_NUMBER" as const, value },
      freeCastExcluded,
    });
    // KNOWN 2 with every free route excluded: unaffordable, proven.
    expect(resolveProtectionUsability(neutral, sotr, JUDGMENT, known(2, true))).toMatchObject({
      kind: "PROVEN_UNUSABLE",
      reason: "INSUFFICIENT_RESOURCE",
    });
    // KNOWN 2 but a free cast (Divine Purpose) is not disproved: nothing is proved.
    expect(resolveProtectionUsability(neutral, sotr, JUDGMENT, known(2, false)).kind).toBe("UNKNOWN");
    // KNOWN 3: affordable, but the cooldown and shield requirement are not modelled: UNKNOWN.
    expect(resolveProtectionUsability(neutral, sotr, JUDGMENT, known(3, true)).kind).toBe("UNKNOWN");
    // UNKNOWN pool: UNKNOWN. A bounded pool at or above the cost proves nothing either.
    expect(resolveProtectionUsability(neutral, sotr, JUDGMENT).kind).toBe("UNKNOWN");
    expect(
      resolveProtectionUsability(neutral, sotr, JUDGMENT, {
        holyPower: { state: "BOUNDED_NUMBER", atLeast: 1, reason: "STATE_NOT_ESTABLISHED" },
        freeCastExcluded: true,
      }).kind,
    ).toBe("UNKNOWN");
    // The observed SotR cast proves usability only at its own position.
    expect(resolveProtectionUsability(neutral, sotr, 53_600).kind).toBe("PROVEN_USABLE");
  });

  it("hammer_of_wrath is PROVEN_UNUSABLE only from an aura-gate fact, which only an observed removal produces", () => {
    const hammerOfWrath = pinnedAction("hammer_of_wrath");
    // No gate fact: nothing is proved.
    expect(resolveProtectionUsability(neutral, hammerOfWrath, JUDGMENT).kind).toBe("UNKNOWN");
    // The observed-analysis wiring produces a gate fact only from a BOUND
    // `up: false` reading of the readiness aura; here it is supplied directly.
    const verdict = resolveProtectionUsability(neutral, hammerOfWrath, JUDGMENT, undefined, undefined, [
      { simcToken: "hammer_of_wrath", requiredAuraAbilityGameId: 1_277_026, anchorReportTimeMs: 2_106_345 },
    ]);
    expect(verdict).toMatchObject({
      kind: "PROVEN_UNUSABLE",
      reason: "REQUIRED_AURA_INACTIVE",
      evidence: { abilityGameId: 1_277_026 },
    });
    // A gate for another token does not touch this one.
    expect(
      resolveProtectionUsability(neutral, pinnedAction("avengers_shield"), JUDGMENT, undefined, undefined, [
        { simcToken: "hammer_of_wrath", requiredAuraAbilityGameId: 1_277_026, anchorReportTimeMs: 2_106_345 },
      ]).kind,
    ).toBe("UNKNOWN");
    // The observed press proves usability at its own position, whatever the gate says.
    expect(
      resolveProtectionUsability(neutral, hammerOfWrath, 1_241_413, undefined, undefined, [
        { simcToken: "hammer_of_wrath", requiredAuraAbilityGameId: 1_277_026, anchorReportTimeMs: 2_106_345 },
      ]).kind,
    ).toBe("PROVEN_USABLE");
  });

  it("the overlay binds the wings buff TRUE and the cooldown bounded BELOW by the caller's effective base, replacing any caller entry", () => {
    const base: AtomBindings = {
      comboPoints: unknownNumber("STATE_NOT_MODELLED"),
      comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
      energyPct: unknownNumber("STATE_NOT_MODELLED"),
      knownBuffs: [
        { name: "avenging_wrath", up: false },
        { name: "sacred_weapon", up: true },
      ],
      knownCooldownRemainsSeconds: [
        { name: "avenging_wrath", remainsSeconds: unknownNumber("STATE_NOT_ESTABLISHED") },
      ],
    };
    // The synthetic premise states the unmodified DBC base as the actor's
    // effective base; the real evaluator supplies the censused value instead.
    const overlaid = overlayWings(base, WINGS_BASE_COOLDOWN_MS);
    expect(overlaid.knownBuffs).toEqual([
      { name: "sacred_weapon", up: true },
      { name: "avenging_wrath", up: true },
    ]);
    expect(overlaid.knownCooldownRemainsSeconds).toEqual([
      {
        name: "avenging_wrath",
        remainsSeconds: {
          state: "BOUNDED_NUMBER",
          atLeast: WINGS_BASE_COOLDOWN_MS / 1000,
          reason: "STATE_NOT_ESTABLISHED",
        },
      },
    ]);
    expect(overlaid.energyPct).toEqual(base.energyPct);
    // The input is untouched.
    expect(base.knownBuffs[0]).toEqual({ name: "avenging_wrath", up: false });
    // With no established effective base the buff is still overlaid and the
    // cooldown atom is left UNBOUND — never defaulted to the raw DBC value.
    const unbounded = overlayWings(base, null);
    expect(unbounded.knownBuffs).toEqual(overlaid.knownBuffs);
    expect(unbounded.knownCooldownRemainsSeconds).toEqual([]);
    // The real evaluator's value for this subject: 120 s halved by Righteous Protector.
    expect(overlayWings(base, 60_000).knownCooldownRemainsSeconds).toEqual([
      {
        name: "avenging_wrath",
        remainsSeconds: { state: "BOUNDED_NUMBER", atLeast: 60, reason: "STATE_NOT_ESTABLISHED" },
      },
    ]);
  });

  it("the overlay is keyed off the PREFIX, never off a later observed cast (the oracle rule)", () => {
    // The real opener contains a Sentinel press at 2026241, after every eligible decision.
    // That press proves nothing about an earlier position: the initial state has no wings
    // execution, so the real bindings are used and `avenging_wrath` stays UNKNOWN.
    const wings = pinnedAction("avenging_wrath");
    expect(hasExecutedToken(neutral, "avenging_wrath")).toBe(false);
    expect(resolveProtectionUsability(neutral, wings, JUDGMENT).kind).toBe("UNKNOWN");
    // Only the observed ability at THIS position is positive evidence, and only for its own token.
    expect(resolveProtectionUsability(neutral, wings, SENTINEL).kind).toBe("PROVEN_USABLE");
    const fired = withExecution(neutral, {
      listName: "default",
      priorityOrdinal: wings.priorityOrdinal,
      actionToken: "avenging_wrath",
      sourceLine: wings.sourceLine,
    });
    expect(hasExecutedToken(fired, "avenging_wrath")).toBe(true);
    expect(hasExecutedToken(fired, "potion")).toBe(false);
  });
});

/**
 * PROFILE FIDELITY (M11-G3-2): did the approved engine build the character the
 * logged evidence describes?
 *
 * Compares the engine's own echo (`extractProfileEcho`, after `parseSimcJson`
 * accepted the report) with the reconstructed profile, check by check:
 *
 *   spec       echoed specialization + role are the binding's
 *   talents    echoed talent string is the import code AND the import decodes
 *              to exactly the WCL talent facts
 *   heroTree   the import's hero selection is the WCL-resolved hero tree
 *   gear       every stat-bearing equipped item echoed, nothing extra; a
 *              stat-less shirt/tabard need not be echoed but must match if it is
 *   itemLevels the engine's decoded item level == the WCL item level
 *   bonusIds   multiset equality (the engine reorders)
 *   gems       multiset equality; KNOWN_NONE == no echoed gem
 *   enchants   echoed enchant == WCL permanent enchant (KNOWN_NONE == none)
 *   race       KNOWN and echoed — or UNRESOLVED
 *   setBonus   WCL set membership (>= 2 / >= 4 pieces) vs the engine's
 *              set-bonus-only spells (binding markers)
 *   stats      DIAGNOSTIC ONLY: WCL pull stats are buffed (consumables, raid
 *              buffs) while a fidelity probe controls those off, so the two
 *              surfaces are not comparable; residuals are reported, never gated
 *
 * MATCH requires every gated check to MATCH; any MISMATCH is FAILED; anything
 * open (UNRESOLVED / NOT_PROVEN) without a mismatch is PARTIAL. Only MATCH on a
 * blocker-free profile is SIMULATION_READY. No DPS is part of this result.
 */

import type { ProfileEcho } from "../simulation/profile-echo.js";
import type { CharacterSpecBinding } from "./binding.js";
import type { CharacterProfile, Evidenced } from "./profile.js";
import type { CombatantPullFacts } from "./pull-facts.js";

export type FidelityCheckState = "MATCH" | "MISMATCH" | "UNRESOLVED" | "NOT_PROVEN";

export interface FidelityCheck {
  readonly state: FidelityCheckState;
  readonly details: readonly string[];
}

export const GATED_CHECKS = [
  "spec",
  "talents",
  "heroTree",
  "gear",
  "itemLevels",
  "bonusIds",
  "gems",
  "enchants",
  "race",
  "setBonus",
] as const;

export type GatedCheck = (typeof GATED_CHECKS)[number];

export interface StatResidual {
  readonly field: string;
  readonly wcl: number | null;
  readonly engine: number;
  readonly wclMinusEngine: number | null;
}

export interface ProfileFidelityResult {
  readonly schemaVersion: "profile-fidelity/1";
  readonly status: "MATCH" | "PARTIAL" | "FAILED";
  readonly readiness: "SIMULATION_READY" | "NOT_SIMULATION_READY";
  readonly checks: Readonly<Record<GatedCheck, FidelityCheck>> & {
    readonly stats: {
      readonly state: "STAT_RECONCILIATION_NOT_PROVEN";
      readonly residuals: readonly StatResidual[];
      readonly reason: string;
    };
  };
  readonly blockers: readonly string[];
  readonly diagnostics: readonly string[];
  readonly evidence: CharacterProfile["evidence"];
}

const sortedIds = (ids: readonly number[]): number[] => [...ids].sort((a, b) => a - b);
const sameIds = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && sortedIds(a).every((value, index) => value === sortedIds(b)[index]);
const check = (details: string[], open: string[] = []): FidelityCheck =>
  details.length > 0
    ? { state: "MISMATCH", details }
    : open.length > 0
      ? { state: "UNRESOLVED", details: open }
      : { state: "MATCH", details: [] };

function idsOf(state: Evidenced<readonly number[]>): number[] | null {
  if (state.state === "KNOWN") return [...state.value];
  if (state.state === "KNOWN_NONE") return [];
  return null;
}

export function assessProfileFidelity(
  profile: CharacterProfile,
  binding: CharacterSpecBinding,
  echo: ProfileEcho,
  pullFacts: CombatantPullFacts | null,
): ProfileFidelityResult {
  const spec: string[] = [];
  if (echo.specialization !== binding.simulation.reportedSpecialization)
    spec.push(`engine built ${echo.specialization}`);
  if (echo.role !== binding.simulation.simcRole) spec.push(`engine role ${echo.role}`);
  const specId = profile.identity.specId;
  if (specId.state !== "KNOWN" || specId.value !== binding.specId)
    spec.push("logged specialization is not the binding's");

  const talents: string[] = [];
  const importCode = profile.talents.importCode;
  if (importCode.state !== "KNOWN") talents.push("no import code");
  else if (echo.talents !== importCode.value) talents.push("engine echoed a different talent string");
  if (profile.talents.reconciliation.state !== "RECONCILED")
    talents.push(`import vs WCL talent facts: ${profile.talents.reconciliation.state}`);

  const hero: string[] = [];
  const heroTree = profile.talents.heroTree;
  const decode = profile.talents.decode;
  if (heroTree.state !== "KNOWN") hero.push("hero tree not resolved from WCL");
  else if (decode.state !== "DECODED" || !sameIds(decode.selectedSubTreeIds, [heroTree.value.subTreeId])) {
    hero.push(
      `import selects ${decode.state === "DECODED" ? decode.selectedSubTreeIds.join(",") : "nothing"}`,
    );
  }

  const gear: string[] = [];
  const itemLevels: string[] = [];
  const bonusIds: string[] = [];
  const gems: string[] = [];
  const enchants: string[] = [];
  const echoed = new Map(echo.items.map((item) => [item.slot, item]));
  const equipped = profile.equipment.filter((record) => record.occupancy === "EQUIPPED");
  for (const record of equipped) {
    const item = echoed.get(record.slot);
    if (item === undefined) {
      if (!record.statless) gear.push(`${record.slot}: not built by the engine`);
      continue;
    }
    if (record.itemId.state !== "KNOWN" || item.itemId !== record.itemId.value) {
      gear.push(`${record.slot}: engine item ${String(item.itemId)}`);
      continue;
    }
    if (record.itemLevel.state !== "KNOWN" || item.itemLevel !== record.itemLevel.value) {
      itemLevels.push(
        `${record.slot}: engine ${String(item.itemLevel)} vs logged ${record.itemLevel.state === "KNOWN" ? String(record.itemLevel.value) : "UNKNOWN"}`,
      );
    }
    const loggedBonus = record.bonusIds.state === "KNOWN" ? [...record.bonusIds.value] : null;
    if (loggedBonus === null || !sameIds(loggedBonus, item.bonusIds))
      bonusIds.push(`${record.slot}: engine ${item.bonusIds.join("/")}`);
    const loggedGems = idsOf(record.gems);
    if (loggedGems === null || !sameIds(loggedGems, item.gemIds))
      gems.push(`${record.slot}: engine ${item.gemIds.join("/") || "none"}`);
    const enchant = record.permanentEnchant;
    const loggedEnchant =
      enchant.state === "KNOWN" ? enchant.value : enchant.state === "KNOWN_NONE" ? null : undefined;
    if (loggedEnchant === undefined || item.enchantId !== loggedEnchant)
      enchants.push(`${record.slot}: engine ${String(item.enchantId)}`);
  }
  const equippedSlots = new Set(equipped.map((record) => record.slot));
  for (const item of echo.items) {
    if (!equippedSlots.has(item.slot as never))
      gear.push(`${item.slot}: engine built an item the log does not have`);
  }

  const raceState = profile.identity.race;
  const race =
    raceState.state === "KNOWN"
      ? check(echo.race === raceState.value ? [] : [`engine race ${echo.race}`])
      : {
          state: "UNRESOLVED" as const,
          details: [
            "race is not established by evidence; the probe ran with the explicit engine race 'none'",
          ],
        };

  const setBonus = setBonusCheck(profile, binding, echo);

  const checks = {
    spec: check(spec),
    talents: check(talents),
    heroTree: check(hero),
    gear: check(gear),
    itemLevels: check(itemLevels),
    bonusIds: check(bonusIds),
    gems: check(gems),
    enchants: check(enchants),
    race,
    setBonus,
    stats: statDiagnostic(echo, pullFacts),
  };
  const states = GATED_CHECKS.map((name) => checks[name].state);
  const status = states.includes("MISMATCH")
    ? "FAILED"
    : states.every((state) => state === "MATCH")
      ? "MATCH"
      : "PARTIAL";
  return {
    schemaVersion: "profile-fidelity/1",
    status,
    readiness:
      status === "MATCH" && profile.blockers.length === 0 ? "SIMULATION_READY" : "NOT_SIMULATION_READY",
    checks,
    blockers: [
      ...profile.blockers.map((blocker) => `${blocker.code}: ${blocker.detail}`),
      ...GATED_CHECKS.filter((name) => checks[name].state === "MISMATCH").map(
        (name) => `FIDELITY_${name}_MISMATCH`,
      ),
    ],
    diagnostics: profile.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.detail}`),
    evidence: profile.evidence,
  };
}

function setBonusCheck(
  profile: CharacterProfile,
  binding: CharacterSpecBinding,
  echo: ProfileEcho,
): FidelityCheck {
  const pieces = new Map<number, number>();
  for (const record of profile.equipment) {
    if (record.occupancy === "EQUIPPED" && record.setId !== null && record.setId > 0) {
      pieces.set(record.setId, (pieces.get(record.setId) ?? 0) + 1);
    }
  }
  const expected2 = [...pieces.values()].filter((count) => count >= 2).length;
  const expected4 = [...pieces.values()].filter((count) => count >= 4).length;
  const observed = new Set(echo.observedSpellIds);
  const active = (count: 2 | 4) =>
    new Set(
      binding.setBonusMarkers
        .filter((marker) => marker.pieces === count && marker.spellIds.some((id) => observed.has(id)))
        .map((marker) => marker.tier),
    );
  const tiers2 = active(2);
  const tiers4 = active(4);
  const summary = `logged sets ${[...pieces.entries()].map(([id, n]) => `${String(id)}x${String(n)}`).join(" ") || "none"}; engine 2pc ${[...tiers2].join(",") || "none"}, 4pc ${[...tiers4].join(",") || "none"}`;
  if (tiers2.size > expected2 || tiers4.size > expected4)
    return { state: "MISMATCH", details: [`engine activated more than the log supports: ${summary}`] };
  if (tiers2.size === expected2 && tiers4.size === expected4) return { state: "MATCH", details: [summary] };
  // Fewer markers than expected: a mismatch only if every expected tier has a marker to show.
  const tiersWithout4pcMarker = [...tiers2].filter(
    (tier) => !binding.setBonusMarkers.some((marker) => marker.tier === tier && marker.pieces === 4),
  );
  if (tiers4.size < expected4 && tiersWithout4pcMarker.length > 0) {
    return {
      state: "NOT_PROVEN",
      details: [`no engine-reported 4pc marker for ${tiersWithout4pcMarker.join(",")}: ${summary}`],
    };
  }
  return { state: "MISMATCH", details: [`the log's set pieces did not activate in the engine: ${summary}`] };
}

function statDiagnostic(
  echo: ProfileEcho,
  pullFacts: CombatantPullFacts | null,
): ProfileFidelityResult["checks"]["stats"] {
  const wcl = pullFacts?.stats ?? null;
  const pairs: [string, number | null, number][] = [
    ["strength", wcl?.strength ?? null, echo.pullStats.strength],
    ["stamina", wcl?.stamina ?? null, echo.pullStats.stamina],
    ["critRating", wcl?.critRating ?? null, echo.pullStats.critRating],
    ["hasteRating", wcl?.hasteRating ?? null, echo.pullStats.hasteRating],
    ["masteryRating", wcl?.masteryRating ?? null, echo.pullStats.masteryRating],
    ["versatilityRating", wcl?.versatilityRating ?? null, echo.pullStats.versatilityRating],
    ["armor", wcl?.armor ?? null, echo.pullStats.armor],
  ];
  return {
    state: "STAT_RECONCILIATION_NOT_PROVEN",
    reason:
      "Warcraft Logs pull stats are buffed stats (active consumables and raid buffs), while the fidelity probe controls those off; the food's effect is not in the pinned data and the pull carried auras the pinned model does not know, so no field can be attributed exactly",
    residuals: pairs.map(([field, logged, engine]) => ({
      field,
      wcl: logged,
      engine,
      wclMinusEngine: logged === null ? null : Math.round((logged - engine) * 1000) / 1000,
    })),
  };
}

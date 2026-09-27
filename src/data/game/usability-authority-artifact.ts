/**
 * The class-neutral parser for a pinned POSITIVE-USABILITY authority artifact
 * (M11-C4i), produced by `scripts/authority/extract-simc-usability-authority.mjs`.
 *
 * It validates the SHAPE and derives nothing a consumer could get wrong on its
 * own: the one derived fact, whether a spell's real cost can exceed its DBC
 * base cost, is decided here from the machine census and the recorded formula
 * checks, and FAILS CLOSED — any INCREASES row on the spell's power row, or a
 * missing formula check, makes it `false`.
 */

export type UsabilityTargetMode = "ENEMY_UNIT_TARGET" | "ENEMY_TARGET_DESTINATION" | "UNTARGETED";
export type UsabilityMovementRestriction = "NOT_USABLE_WHILE_MOVING" | "USABLE_WHILE_MOVING";

export interface UsabilityPowerRow {
  readonly powerRowIndex: number;
  readonly powerType: number;
  readonly cost: number;
  readonly costMax: number;
}

export interface UsabilityCostModifier {
  readonly spellId: number;
  readonly displayNameEn: string | null;
  readonly powerRowIndex: number;
  readonly kind: string;
  readonly value: number;
  readonly direction: "DECREASES" | "INCREASES" | "NONE";
}

export interface UsabilityAuthoritySpell {
  readonly simcToken: string;
  readonly spellId: number;
  readonly minRangeYd: number;
  readonly maxRangeYd: number;
  readonly castTimeMs: number;
  readonly channeled: boolean;
  readonly targetMode: UsabilityTargetMode;
  readonly movementRestriction: UsabilityMovementRestriction;
  readonly categorySiblingSpellIds: readonly number[];
  readonly powerRows: readonly UsabilityPowerRow[];
  readonly costModifiers: readonly UsabilityCostModifier[];
}

export type UsabilityAuthorityLoad =
  | {
      readonly ok: true;
      readonly datasetId: string;
      readonly artifactRevision: string;
      readonly spells: readonly UsabilityAuthoritySpell[];
      /** The mechanical cost-formula claims the extractor verified. */
      readonly costFormulaClaims: readonly string[];
    }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

/** Every claim a base-cost upper bound rests on; all must have been verified at extraction. */
export const REQUIRED_COST_FORMULA_CLAIMS = Object.freeze([
  "ACTION_COST_FORMULA",
  "BASE_COST_FLAT_MODIFIER_ONLY_SUBTRACTS_A_REDUCTION",
  "BASE_COST_PCT_MULTIPLIER_IS_ONE",
  "RESOURCE_REDUCTION_CHANGES_ONLY_IN_NON_NEGATIVE_AMOUNTS",
  "CLASS_MODULE_OVERRIDES_NO_COST",
  "CLASS_MODULE_OVERRIDES_NO_COST_FLAT_MODIFIER",
  "CLASS_MODULE_OVERRIDES_NO_COST_PCT_MULTIPLIER",
  "CLASS_MODULE_CALLS_NO_APPLY_AFFECTING_AURA",
] as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const TARGET_MODES = new Set<string>(["ENEMY_UNIT_TARGET", "ENEMY_TARGET_DESTINATION", "UNTARGETED"]);
const MOVEMENT = new Set<string>(["NOT_USABLE_WHILE_MOVING", "USABLE_WHILE_MOVING"]);
const DIRECTIONS = new Set<string>(["DECREASES", "INCREASES", "NONE"]);

export function parseUsabilityAuthorityArtifact(
  raw: unknown,
  expectedDatasetId: string,
): UsabilityAuthorityLoad {
  const refuse = (detail: string): UsabilityAuthorityLoad => ({
    ok: false,
    reason: "ARTIFACT_INVALID",
    detail,
  });
  if (!isRecord(raw)) return refuse("the artifact is not an object");
  if (raw["datasetId"] !== expectedDatasetId) return refuse(`datasetId is not ${expectedDatasetId}`);
  if (typeof raw["artifactRevision"] !== "string") return refuse("artifactRevision is missing");
  const checks = raw["costFormulaChecks"];
  if (!Array.isArray(checks)) return refuse("costFormulaChecks is missing");
  const costFormulaClaims = checks.flatMap((check) =>
    isRecord(check) && typeof check["claim"] === "string" ? [check["claim"]] : [],
  );
  const rawSpells = raw["spells"];
  if (!Array.isArray(rawSpells)) return refuse("spells is missing");
  const spells: UsabilityAuthoritySpell[] = [];
  for (const entry of rawSpells) {
    if (!isRecord(entry)) return refuse("a spell entry is not an object");
    const {
      simcToken,
      spellId,
      minRangeYd,
      maxRangeYd,
      castTimeMs,
      channeled,
      targetMode,
      movementRestriction,
    } = entry;
    if (
      typeof simcToken !== "string" ||
      !isNumber(spellId) ||
      !isNumber(minRangeYd) ||
      !isNumber(maxRangeYd) ||
      !isNumber(castTimeMs) ||
      typeof channeled !== "boolean" ||
      typeof targetMode !== "string" ||
      !TARGET_MODES.has(targetMode) ||
      typeof movementRestriction !== "string" ||
      !MOVEMENT.has(movementRestriction)
    ) {
      return refuse(`spell ${String(spellId)} has an invalid field`);
    }
    const siblings = entry["categorySiblingSpellIds"];
    const rows = entry["powerRows"];
    const census = entry["costModifierCensus"];
    if (!Array.isArray(siblings) || !siblings.every(isNumber))
      return refuse(`spell ${String(spellId)} siblings invalid`);
    if (!Array.isArray(rows)) return refuse(`spell ${String(spellId)} powerRows invalid`);
    if (!isRecord(census) || !Array.isArray(census["modifiers"])) {
      return refuse(`spell ${String(spellId)} costModifierCensus invalid`);
    }
    const powerRows: UsabilityPowerRow[] = [];
    for (const row of rows) {
      if (
        !isRecord(row) ||
        !isNumber(row["powerRowIndex"]) ||
        !isNumber(row["powerType"]) ||
        !isNumber(row["cost"]) ||
        !isNumber(row["costMax"])
      ) {
        return refuse(`spell ${String(spellId)} has an invalid power row`);
      }
      powerRows.push({
        powerRowIndex: row["powerRowIndex"],
        powerType: row["powerType"],
        cost: row["cost"],
        costMax: row["costMax"],
      });
    }
    const costModifiers: UsabilityCostModifier[] = [];
    for (const modifier of census["modifiers"] as unknown[]) {
      if (
        !isRecord(modifier) ||
        !isNumber(modifier["spellId"]) ||
        !isNumber(modifier["powerRowIndex"]) ||
        typeof modifier["kind"] !== "string" ||
        !isNumber(modifier["value"]) ||
        typeof modifier["direction"] !== "string" ||
        !DIRECTIONS.has(modifier["direction"])
      ) {
        return refuse(`spell ${String(spellId)} has an invalid cost modifier`);
      }
      costModifiers.push({
        spellId: modifier["spellId"],
        displayNameEn: typeof modifier["displayNameEn"] === "string" ? modifier["displayNameEn"] : null,
        powerRowIndex: modifier["powerRowIndex"],
        kind: modifier["kind"],
        value: modifier["value"],
        direction: modifier["direction"] as UsabilityCostModifier["direction"],
      });
    }
    spells.push({
      simcToken,
      spellId,
      minRangeYd,
      maxRangeYd,
      castTimeMs,
      channeled,
      targetMode: targetMode as UsabilityTargetMode,
      movementRestriction: movementRestriction as UsabilityMovementRestriction,
      categorySiblingSpellIds: siblings,
      powerRows,
      costModifiers,
    });
  }
  return {
    ok: true,
    datasetId: expectedDatasetId,
    artifactRevision: raw["artifactRevision"],
    spells,
    costFormulaClaims,
  };
}

/**
 * Whether the pinned mechanics prove a spell's real cost on one power row
 * cannot exceed that row's base cost: every required formula claim was
 * verified at extraction, the row carries no secondary (max) cost, and no
 * census modifier on the row INCREASES it. Fails closed.
 */
export function costCannotExceedBase(
  load: Extract<UsabilityAuthorityLoad, { ok: true }>,
  spell: UsabilityAuthoritySpell,
  powerRowIndex: number,
): { readonly holds: boolean; readonly basis: string } {
  const missing = REQUIRED_COST_FORMULA_CLAIMS.filter((claim) => !load.costFormulaClaims.includes(claim));
  if (missing.length > 0)
    return { holds: false, basis: `formula claim(s) not verified: ${missing.join(", ")}` };
  const row = spell.powerRows.find((entry) => entry.powerRowIndex === powerRowIndex);
  if (row === undefined)
    return {
      holds: false,
      basis: `spell ${String(spell.spellId)} has no power row ${String(powerRowIndex)}`,
    };
  if (row.costMax !== 0)
    return { holds: false, basis: `power row ${String(powerRowIndex)} carries a secondary cost` };
  const increases = spell.costModifiers.filter(
    (modifier) => modifier.powerRowIndex === powerRowIndex && modifier.direction === "INCREASES",
  );
  if (increases.length > 0) {
    return {
      holds: false,
      basis: `the census holds cost-increasing row(s): ${increases.map((m) => `${String(m.spellId)} ${String(m.displayNameEn)} ${String(m.value)}`).join("; ")}`,
    };
  }
  return {
    holds: true,
    basis: `the pinned cost formula only reduces the base cost, and all ${String(spell.costModifiers.filter((m) => m.powerRowIndex === powerRowIndex).length)} censused modifier row(s) of power row ${String(powerRowIndex)} decrease it or leave it unchanged`,
  };
}

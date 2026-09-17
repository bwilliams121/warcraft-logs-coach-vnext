/**
 * Protection Paladin's pinned spender costs (M10-C4): the `SpellPower` rows
 * of Shield of the Righteous and Word of Glory from the same SimulationCraft
 * commit as every other Paladin dataset, with the spell's own cooldown, GCD
 * and charge scalars.
 *
 * THE COST RULE IS THE AUTHORITY'S. `spell_data_t::cost( pt )` returns the
 * FIRST power row of the requested type in table order (spell_data.hpp), so
 * the aura-conditioned variant of Shield of the Righteous (aura 1277162,
 * Instrument of the Divine) is recorded but is not what `cost()` returns;
 * the pinned Paladin module reads that talent through `cost() > 3.0` in a
 * damage multiplier, not through the base cost.
 *
 * NO MODIFIER IS APPLIED HERE. A free cast (Divine Purpose, Shining Light on
 * Word of Glory) is a specialization reading, recorded in the transition
 * authority with its source; this module states the base.
 */

import artifact from "./paladin-protection-spender-costs.json";

export const PROTECTION_PALADIN_SPENDER_DATASET_ID = "SIMC_DBC_PALADIN_PROTECTION_SPENDER_COSTS";

export interface SpenderPowerRow {
  readonly powerRowId: number;
  readonly auraSpellId: number;
  readonly powerType: number;
  readonly cost: number;
  readonly costMax: number;
  readonly costPerTick: number;
  readonly pctCost: number;
  readonly pctCostMax: number;
  readonly pctCostPerTick: number;
}

export interface SpenderCostIdentity {
  readonly simcToken: string;
  readonly spellId: number;
  readonly displayNameEn: string;
  readonly cooldownMs: number;
  readonly gcdMs: number;
  readonly categoryCooldownMs: number;
  readonly charges: number;
  readonly chargeCooldownMs: number;
  readonly internalCooldownMs: number;
  readonly castTimeMs: number;
  readonly powerRows: readonly SpenderPowerRow[];
  /** `spell_data_t::cost( POWER_HOLY_POWER )`: the first Holy Power row's cost, or `null` when none. */
  readonly holyPowerCost: number | null;
}

export type SpenderCostLoad =
  | {
      readonly ok: true;
      readonly artifactRevision: string;
      readonly commitSha: string;
      readonly holyPowerType: number;
      readonly spells: readonly SpenderCostIdentity[];
    }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function int(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

let cached: SpenderCostLoad | null = null;

function load(): SpenderCostLoad {
  if (cached !== null) return cached;
  const fail = (reason: string, detail: string): SpenderCostLoad => (cached = { ok: false, reason, detail });
  const raw: unknown = artifact;
  if (
    !isRecord(raw) ||
    raw.artifactVersion !== 1 ||
    raw.datasetId !== PROTECTION_PALADIN_SPENDER_DATASET_ID
  ) {
    return fail("INVALID_ARTIFACT", "root, version or dataset id");
  }
  const provenance = raw.provenance;
  if (
    !isRecord(provenance) ||
    typeof provenance.commitSha !== "string" ||
    !/^[0-9a-f]{40}$/.test(provenance.commitSha) ||
    !isRecord(provenance.powerTypes) ||
    provenance.costRule !== "FIRST_ROW_OF_POWER_TYPE_IN_TABLE_ORDER" ||
    !Array.isArray(provenance.sources) ||
    !provenance.sources.every(
      (source) =>
        isRecord(source) && typeof source.sha256 === "string" && /^[0-9a-f]{64}$/.test(source.sha256),
    )
  ) {
    return fail("INVALID_PROVENANCE", "provenance is incomplete");
  }
  const holyPowerType = int(provenance.powerTypes.POWER_HOLY_POWER);
  if (holyPowerType === null || typeof raw.artifactRevision !== "string") {
    return fail("INVALID_PROVENANCE", "POWER_HOLY_POWER is not recorded");
  }
  if (!Array.isArray(raw.spells) || raw.spells.length === 0) return fail("INVALID_SPELLS", "no spells");
  const spells: SpenderCostIdentity[] = [];
  for (const entry of raw.spells) {
    if (!isRecord(entry) || typeof entry.simcToken !== "string" || typeof entry.displayNameEn !== "string") {
      return fail("INVALID_SPELLS", "spell row shape");
    }
    const scalars = {
      spellId: int(entry.spellId),
      cooldownMs: int(entry.cooldownMs),
      gcdMs: int(entry.gcdMs),
      categoryCooldownMs: int(entry.categoryCooldownMs),
      charges: int(entry.charges),
      chargeCooldownMs: int(entry.chargeCooldownMs),
      internalCooldownMs: int(entry.internalCooldownMs),
      castTimeMs: int(entry.castTimeMs),
    };
    if (Object.values(scalars).some((value) => value === null) || !Array.isArray(entry.powerRows)) {
      return fail("INVALID_SPELLS", `spell ${entry.simcToken} scalars`);
    }
    const powerRows: SpenderPowerRow[] = [];
    for (const row of entry.powerRows) {
      if (!isRecord(row)) return fail("INVALID_SPELLS", `spell ${entry.simcToken} power row`);
      const read = {
        powerRowId: int(row.powerRowId),
        auraSpellId: int(row.auraSpellId),
        powerType: int(row.powerType),
        cost: num(row.cost),
        costMax: num(row.costMax),
        costPerTick: num(row.costPerTick),
        pctCost: num(row.pctCost),
        pctCostMax: num(row.pctCostMax),
        pctCostPerTick: num(row.pctCostPerTick),
      };
      if (Object.values(read).some((value) => value === null)) {
        return fail("INVALID_SPELLS", `spell ${entry.simcToken} power row fields`);
      }
      powerRows.push(read as SpenderPowerRow);
    }
    const first = powerRows.find((row) => row.powerType === holyPowerType);
    spells.push({
      simcToken: entry.simcToken,
      displayNameEn: entry.displayNameEn,
      ...(scalars as { [K in keyof typeof scalars]: number }),
      powerRows,
      holyPowerCost: first === undefined ? null : first.cost,
    });
  }
  cached = {
    ok: true,
    artifactRevision: raw.artifactRevision,
    commitSha: provenance.commitSha,
    holyPowerType,
    spells,
  };
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedProtectionPaladinSpenderCosts(): SpenderCostLoad {
  return load();
}

/** Test seam. */
export function resetProtectionPaladinSpenderCostCache(): void {
  cached = null;
}

/** The pinned cost identity for an APL token, or `null` when the token is not pinned. */
export function protectionSpenderCostFor(simcToken: string): SpenderCostIdentity | null {
  const loaded = load();
  if (!loaded.ok) return null;
  return loaded.spells.find((spell) => spell.simcToken === simcToken) ?? null;
}

/**
 * Blood Death Knight's pinned Rune-cost authority for Marrowrend (M11-B7):
 * where the cost comes from, what `action_t::ready()` tests it against, and
 * the ONE effect in the pinned client data that can change it.
 *
 * WHAT THIS RECORDS, AND WHY IT IS NARROW
 *
 * The base cost is a machine-extracted DBC row in
 * `deathknight-blood-spender-costs.json` (`SIMC_DBC_DEATHKNIGHT_BLOOD_SPENDER_COSTS`);
 * this module does not restate the number. What the artifact cannot say is
 * whether anything MODIFIES that row for the actor, and that is the question a
 * usability proof has to close before it may compare an observed count to the
 * pinned cost. The M11-B7 pre-flight scanned every family-15 effect in the
 * pinned `sc_spell_data.inc` — `A_ADD_FLAT_MODIFIER` (107) and
 * `A_ADD_PCT_MODIFIER` (108) on `P_RESOURCE_COST_1/2/3` (14 / 34 / 39), the
 * school power-cost auras (72 / 73) and the label modifiers (218 / 219) —
 * against Marrowrend's class-family mask `{ 0, 2048, 0, 2149580800 }`, and
 * found exactly two hits, both Exterminate. The same scan reproduces every
 * modifier the wire already showed on Death Strike (Ossuary −50, Improved
 * Death Strike −100, Blood Draw −100: the 450 → 350 → 250 of `resources.ts`),
 * Crimson Scourge's free Death and Decay and Dance of Midnight's free Heart
 * Strike (the 11 uncosted Heart Strikes of the A7R6 subject, each followed
 * 19–29 ms later by `removebuff 1264568`), which is why its silence on
 * everything else is believed.
 *
 * THE EXCLUSION IS A BUILD FACT, NEVER SILENCE. Exterminate is a Deathbringer
 * hero talent; its buff is a `make_fallback` that never triggers unless
 * `talent.deathbringer.exterminate` or `echoing_fury` is taken, and one hero
 * tree is active at a time. So the modifier is PROVEN absent exactly when the
 * observed talent tree RESOLVES to a sub-tree other than Deathbringer — the
 * same fact `action-profile.ts` already uses to background `reapers_mark`. An
 * UNKNOWN or CONTRADICTORY tree, or a RESOLVED Deathbringer tree, leaves the
 * cost UNPROVEN and the proof is withheld. No aura event is consulted: the
 * absence of an Exterminate buff on the wire proves nothing about the build.
 *
 * NO COST-INCREASING EFFECT EXISTS. Every hit is a reduction, so a count at
 * or above the base row would stay affordable under any build; the proof
 * still requires the exclusion, because "the pinned cost is the cost" is the
 * claim the evidence chain makes, and a claim that holds by accident is not
 * one this project records.
 *
 * NOT A FRAMEWORK. This is one spell's one modifier, recorded so the proof
 * in `rune-affordability.ts` cites something a reviewer can check against
 * the pinned bytes. A second spender wants its own review, not a lookup.
 */

import { SC_DEATH_KNIGHT_CPP_SHA256, type BloodAuraClaim } from "./deathknight-blood-aura-authority.js";
import type { HeroTreeResolution } from "./talent-selection.js";

/** The pinned `engine/dbc/generated/sc_spell_data.inc`, as the spender-cost artifact's provenance records it. */
export const SC_SPELL_DATA_INC_SHA256 = "d8e3d1970520f2161de6d5a59aa5ea0e7c81eaef14c6bc980d5a208ed33b4c62";

/** Marrowrend's spell id, the identity the spender-cost record must carry. */
export const MARROWREND_SPELL_ID = 195182;

/** The pinned power-type enumerator for Runes, as the spender-cost artifact's provenance names it. */
export const POWER_RUNE_KEY = "POWER_RUNE";

export type BloodHeroTreeSimcName = "sanlayn" | "deathbringer";

/** One effect that can change Marrowrend's Rune cost, and the build fact that excludes it. */
export interface BloodRuneCostModifier {
  readonly displayNameEn: string;
  /** The spells carrying the effect: the talent and the buff it triggers. */
  readonly spellIds: readonly number[];
  /** The `__spelleffect_data` rows, one per spell above, in the same order. */
  readonly effectIds: readonly number[];
  /** `A_ADD_PCT_MODIFIER` on `P_RESOURCE_COST_1`: the percent applied to the base row. */
  readonly costPercent: number;
  /** The hero sub-tree that owns the talent. A build RESOLVED elsewhere cannot hold it. */
  readonly ownedByHeroTree: BloodHeroTreeSimcName;
  readonly claims: readonly BloodAuraClaim[];
}

const MODULE = "engine/class_modules/sc_death_knight.cpp";
const SPELL_DATA = "engine/dbc/generated/sc_spell_data.inc";

const moduleClaim = (symbol: string, lines: string, text: string): BloodAuraClaim => ({
  sourcePath: MODULE,
  sourceSha256: SC_DEATH_KNIGHT_CPP_SHA256,
  symbol,
  lines,
  claim: text,
});

const dataClaim = (symbol: string, lines: string, text: string): BloodAuraClaim => ({
  sourcePath: SPELL_DATA,
  sourceSha256: SC_SPELL_DATA_INC_SHA256,
  symbol,
  lines,
  claim: text,
});

/** Exterminate: the only pinned effect whose class mask reaches Marrowrend's cost. */
export const EXTERMINATE_RUNE_COST_MODIFIER: BloodRuneCostModifier = {
  displayNameEn: "Exterminate",
  spellIds: [441416, 447954],
  effectIds: [1136665, 1146159],
  costPercent: -50,
  ownedByHeroTree: "deathbringer",
  claims: [
    dataClaim(
      "__spelleffect_data 1136665 (spell 441416); 1146159 (spell 447954)",
      "effect rows of 441416 / 447954",
      "Type 6 (E_APPLY_AURA), subtype 108 (A_ADD_PCT_MODIFIER), misc value 14 (P_RESOURCE_COST_1), base value " +
        "-50, class flags { 32768 | 0, 131072, 0, 2097152 }: bit 21 of the fourth word is set on Marrowrend's " +
        "own mask { 0, 2048, 0, 2149580800 } = 2^31 | 2^21, so the -50% reaches the base Rune row 10513.",
    ),
    moduleClaim(
      "death_knight_t::init_spells (hero talents)",
      "15098-15099",
      '`talent.deathbringer.exterminate = find_talent_spell( talent_tree::HERO, "Exterminate" )` and ' +
        '`talent.deathbringer.echoing_fury = find_talent_spell( talent_tree::HERO, "Echoing Fury" )`: both are ' +
        "Deathbringer hero-tree entries, not found for a build resolved to San'layn.",
    ),
    moduleClaim(
      "death_knight_t::create_buffs",
      "15859-15860",
      '`buffs.exterminate = make_fallback( talent.deathbringer.exterminate.ok() || talent.deathbringer.echoing_fury.ok(), this, "exterminate", spell.exterminate_buff )`: ' +
        "without either talent the buff is a fallback that never triggers, and the modifier it carries is inert.",
    ),
    moduleClaim(
      "death_knight_t::apply_action_effects",
      "16855-16920",
      "Blood's parsed buffs are blood_draw, coagulopathy, blood_shield, boiling_point, dance_of_midnight_1/2, consumption, " +
        "crimson_scourge, sanguine_ground, sanguinary_burst, hemostasis, ossuary and, under San'layn, essence_of_the_blood_queen; " +
        "buffs.exterminate is parsed only in the HERO_DEATHBRINGER branch. None of the Blood or San'layn auras carries a " +
        "resource-cost effect whose class mask reaches Marrowrend.",
    ),
  ],
};

/**
 * The mechanical path from the base row to `ready()`, cited once so the proof
 * in `rune-affordability.ts` can say what it is reproducing.
 */
export const MARROWREND_RUNE_COST_CLAIMS: readonly BloodAuraClaim[] = [
  dataClaim(
    "__spellpower_data 10513 (spell 195182)",
    "power row 10513",
    "Marrowrend's ONLY row of power type 5 (Runes): cost 2, no aura condition, no percent cost. Row 10671 on the " +
      "same spell is power type 6 with cost -200: the Runic Power GAIN, not a cost. `spell_data_t::cost( POWER_RUNE )` " +
      "returns the first type-5 row in table order, which is 10513.",
  ),
  moduleClaim(
    "marrowrend_t",
    "11662-11715",
    "Built on `p->talent.blood.marrowrend`; overrides execute() and impact() only. No cost() or ready() override, " +
      "no set_replacement_action (the module's replacement users are Blightfall, Necrotic Coil, Graveyard and " +
      "Festering Scythe, none of them Blood), so death_knight_action_t::cost()/ready() (:6176-6195) fall through to " +
      "action_t.",
  ),
  moduleClaim(
    "death_knight_t::resource_loss; replenish_rune callers",
    "13009-13020; 7119, 8959, 10861, 11150, 11586, 13357, 13380, 13390",
    "Runes are consumed through `_runes.consume` with `runes_full() == resources.current[ RESOURCE_RUNE ]` asserted, " +
      "so the count `cost_affordable()` tests is the count of fully recharged runes. Every instantaneous replenish " +
      "path is Frost-owned (Breath of Sindragosa, Obliteration, Murderous Efficiency, Runic Empowerment) or Army of " +
      "the Dead's precombat regeneration: no Blood cast gains a Rune on its own execution.",
  ),
];

/**
 * Whether the observed build PROVES Marrowrend's Rune cost is its base row:
 * the hero tree RESOLVED to a sub-tree that does not own the modifier.
 *
 * The only positive answer this module gives. UNKNOWN and CONTRADICTORY are
 * not "probably San'layn", and a RESOLVED Deathbringer tree holds the
 * modifier's owner even when the specific talent is not observed.
 */
export function marrowrendRuneCostModifiersExcluded(heroTree: HeroTreeResolution): boolean {
  return (
    heroTree.state === "RESOLVED" && heroTree.simcName !== EXTERMINATE_RUNE_COST_MODIFIER.ownedByHeroTree
  );
}

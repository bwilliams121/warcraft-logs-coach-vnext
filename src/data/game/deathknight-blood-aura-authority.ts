/**
 * Blood Death Knight's pinned AURA identities for the atoms the M11-B2
 * measurement slice reads — hand-reviewed against the same pinned
 * SimulationCraft commit as every other dataset, with the measured hash of
 * the class module each reading was made against.
 *
 * THREE KINDS OF FACT:
 *
 *   - an OBSERVED aura identity read as `buff.<name>.up` — bound from M4
 *     transitions strictly before the decision (`aura-bindings.ts`);
 *   - an EXACT STACK reading (`buff.<name>.stack`): exact zero under the two
 *     authorized proofs (PROVEN_INACTIVE, or the producing talent /
 *     hero tree disproved), and — for Bone Shield ONLY — the exact count the
 *     last stack-bearing transition reported, under the Blood-owned
 *     reconstruction rule in `aura-bindings.ts`;
 *   - a HERO-TREE OWNERSHIP fact: an aura every producer of which is a
 *     talent of ONE hero sub-tree, so a build resolved to the OTHER sub-tree
 *     cannot hold it (one hero tree is active at a time —
 *     `talent-selection.ts`, `resolveHeroTree`).
 *
 * WHAT IS NOT HERE. `buff.<name>.remains` has no binding field in the shared
 * evaluator and none is added; `debuff.reapers_mark_debuff.up` is a DEBUFF
 * atom the evaluator enumerates (no `knownDebuffs` field exists); both are
 * recorded below as identities so the measurement can name them, and neither
 * is bound.
 */

/** Measured at M11-B2 from the pinned file (engine/class_modules/sc_death_knight.cpp at 33622e9d); recorded, never typed from memory. */
export const SC_DEATH_KNIGHT_CPP_SHA256 = "beed4d7cffad6a548dc1791eef6f4208c308d53836b46d644e4e9c9c95058d39";

export interface BloodAuraClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export type BloodHeroTreeName = "sanlayn" | "deathbringer";

export interface BloodAuraIdentity {
  /** The buff name as the pinned APL writes it after `buff.` / `debuff.`. */
  readonly atomName: string;
  readonly auraClass: "BUFF" | "DEBUFF";
  /** The aura's spell id on the wire. */
  readonly abilityGameId: number;
  /** Applied by the actor to themself (BUFF), or by the actor to the target (DEBUFF). */
  readonly selfApplied: boolean;
  /**
   * The talent that PRODUCES the aura, when exact-zero-by-build is admissible
   * through the three-way talent rule. `null` when no single pinned talent does.
   */
  readonly producedByTalent: string | null;
  /**
   * The hero sub-tree that owns EVERY producer of the aura, when one does:
   * a build resolved to the other sub-tree cannot hold it. `null` otherwise.
   */
  readonly ownedByHeroTree: BloodHeroTreeName | null;
  readonly claims: readonly BloodAuraClaim[];
}

const MODULE = "engine/class_modules/sc_death_knight.cpp";

const claim = (symbol: string, lines: string, text: string): BloodAuraClaim => ({
  sourcePath: MODULE,
  sourceSha256: SC_DEATH_KNIGHT_CPP_SHA256,
  symbol,
  lines,
  claim: text,
});

/** `buff.gift_of_the_sanlayn`: 434153, triggered by Dancing Rune Weapon under the San'layn hero talent. */
export const GIFT_OF_THE_SANLAYN_BUFF_SPELL_ID = 434153;
const GIFT_OF_THE_SANLAYN: BloodAuraIdentity = {
  atomName: "gift_of_the_sanlayn",
  auraClass: "BUFF",
  abilityGameId: GIFT_OF_THE_SANLAYN_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: "gift_of_the_sanlayn",
  ownedByHeroTree: "sanlayn",
  claims: [
    claim(
      "death_knight_t::init_spells; create_buffs",
      "15375; 15879-15880",
      "`spell.gift_of_the_sanlayn_buff = conditional_spell_lookup( talent.sanlayn.gift_of_the_sanlayn.ok(), 434153 )` and " +
        '`buffs.gift_of_the_sanlayn = make_fallback( talent.sanlayn.gift_of_the_sanlayn.ok(), this, "gift_of_the_sanlayn", spell.gift_of_the_sanlayn_buff )`.',
    ),
    claim(
      "dancing_rune_weapon_t::execute",
      "9513-9514",
      "Triggers buffs.gift_of_the_sanlayn on the actor for the Dancing Rune Weapon duration: a self-applied aura, " +
        "so the M4 question is a from-source query on the actor as target.",
    ),
  ],
};

/** `buff.dancing_rune_weapon`: 81256. */
export const DANCING_RUNE_WEAPON_BUFF_SPELL_ID = 81256;
const DANCING_RUNE_WEAPON: BloodAuraIdentity = {
  atomName: "dancing_rune_weapon",
  auraClass: "BUFF",
  abilityGameId: DANCING_RUNE_WEAPON_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: "dancing_rune_weapon",
  ownedByHeroTree: null,
  claims: [
    claim(
      "death_knight_t::init_spells; create_buffs",
      "15236; 15967",
      "`spell.dancing_rune_weapon_buff = conditional_spell_lookup( talent.blood.dancing_rune_weapon.ok(), 81256 )` and " +
        '`make_buff( this, "dancing_rune_weapon", spell.dancing_rune_weapon_buff )`. The log shows the aura applied ' +
        "without a Dancing Rune Weapon cast as well (other summoning sources); presence is read from the aura stream, " +
        "never inferred from the cast.",
    ),
  ],
};

/** `buff.death_and_decay`: 188290, the standing-in-it buff. */
export const DEATH_AND_DECAY_BUFF_SPELL_ID = 188290;
const DEATH_AND_DECAY: BloodAuraIdentity = {
  atomName: "death_and_decay",
  auraClass: "BUFF",
  abilityGameId: DEATH_AND_DECAY_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: null,
  ownedByHeroTree: null,
  claims: [
    claim(
      "death_knight_t::init_spells; create_buffs",
      "15176; 15804",
      "`spell.dnd_buff = conditional_spell_lookup( spec.death_and_decay->ok(), 188290 )` and " +
        '`make_fallback<death_and_decay_buff_t>( spec.death_and_decay->ok(), this, "death_and_decay", spell.dnd_buff )`.',
    ),
  ],
};

/** `buff.bone_shield`: 195181, the specialization aura Marrowrend and Death's Caress stack. */
export const BONE_SHIELD_BUFF_SPELL_ID = 195181;
const BONE_SHIELD: BloodAuraIdentity = {
  atomName: "bone_shield",
  auraClass: "BUFF",
  abilityGameId: BONE_SHIELD_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: null,
  ownedByHeroTree: null,
  claims: [
    claim(
      "death_knight_t::init_spells; create_buffs",
      "15222; 15906",
      "`spell.bone_shield = conditional_spell_lookup( spec.blood_death_knight->ok(), 195181 )` and " +
        '`make_buff( this, "bone_shield", spell.bone_shield )`. A specialization aura, present for every Blood build.',
    ),
    claim(
      "marrowrend_t / deaths_caress_t / dancing_rune_weapon_t execute",
      "11662-11720; 9767-9773; 9495-9499",
      "Every stack gain is `buffs.bone_shield->trigger( n )` on the actor, which Warcraft Logs reports as an " +
        "`applybuffstack` carrying the absolute resulting count; every consumption is a `removebuffstack` carrying " +
        "the resulting count. The Blood reconstruction reads exactly those numbers and nothing between them.",
    ),
  ],
};

/** `buff.vampiric_strike`: 433899, the San'layn proc that turns Heart Strike into Vampiric Strike. */
export const VAMPIRIC_STRIKE_BUFF_SPELL_ID = 433899;
const VAMPIRIC_STRIKE: BloodAuraIdentity = {
  atomName: "vampiric_strike",
  auraClass: "BUFF",
  abilityGameId: VAMPIRIC_STRIKE_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: "vampiric_strike",
  ownedByHeroTree: "sanlayn",
  claims: [
    claim(
      "death_knight_t::init_spells; create_buffs",
      "15373; 15882-15883",
      "`spell.vampiric_strike_buff = conditional_spell_lookup( talent.sanlayn.vampiric_strike.ok(), 433899 )` and " +
        '`make_fallback( talent.sanlayn.vampiric_strike.ok(), this, "vampiric_strike", spell.vampiric_strike_buff )`.',
    ),
  ],
};

/** `buff.essence_of_the_blood_queen`: 433925, the San'layn stacking haste buff. */
export const ESSENCE_OF_THE_BLOOD_QUEEN_BUFF_SPELL_ID = 433925;
const ESSENCE_OF_THE_BLOOD_QUEEN: BloodAuraIdentity = {
  atomName: "essence_of_the_blood_queen",
  auraClass: "BUFF",
  abilityGameId: ESSENCE_OF_THE_BLOOD_QUEEN_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: "vampiric_strike",
  ownedByHeroTree: "sanlayn",
  claims: [
    claim(
      "death_knight_t::init_spells; create_buffs",
      "15374; 15876-15877",
      "`spell.essence_of_the_blood_queen_buff = conditional_spell_lookup( talent.sanlayn.vampiric_strike.ok(), 433925 )` and " +
        '`buffs.essence_of_the_blood_queen = make_fallback<essence_of_the_blood_queen_buff_t>( talent.sanlayn.vampiric_strike.ok(), this, "essence_of_the_blood_queen", … )`.',
    ),
  ],
};

/** `buff.crimson_scourge`: 81141, the free Death and Decay proc. */
export const CRIMSON_SCOURGE_BUFF_SPELL_ID = 81141;
const CRIMSON_SCOURGE: BloodAuraIdentity = {
  atomName: "crimson_scourge",
  auraClass: "BUFF",
  abilityGameId: CRIMSON_SCOURGE_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: null,
  ownedByHeroTree: null,
  claims: [
    claim(
      "death_knight_t::init_spells; create_buffs",
      "15229; 15963-15964",
      "`spell.crimson_scourge_buff = conditional_spell_lookup( spec.crimson_scourge->ok(), 81141 )` and " +
        '`make_buff( this, "crimson_scourge", spell.crimson_scourge_buff )->set_trigger_spell( spec.crimson_scourge )`. ' +
        "The pinned list reads only `buff.crimson_scourge.remains`, which is never bound; the identity is recorded so " +
        "the measurement can name the stopping atom.",
    ),
  ],
};

/** `buff.boiling_point`: 1265968. */
export const BOILING_POINT_BUFF_SPELL_ID = 1265968;
const BOILING_POINT: BloodAuraIdentity = {
  atomName: "boiling_point",
  auraClass: "BUFF",
  abilityGameId: BOILING_POINT_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: null,
  ownedByHeroTree: null,
  claims: [
    claim(
      "death_knight_t::init_spells; create_buffs",
      "15220; 15899",
      "`spell.boiling_point_buff = conditional_spell_lookup( talent.blood.boiling_point.ok(), 1265968 )` and " +
        '`buffs.boiling_point = make_buff( this, "boiling_point", spell.boiling_point_buff )`. The Boiling Point talent ' +
        "is not in the M11-B2 talent dataset, so no impossible-by-build proof is made: an unobserved aura stays UNKNOWN.",
    ),
  ],
};

/** `buff.blood_debt`: 1310372, the Midnight season 2 two-piece aura. */
export const BLOOD_DEBT_BUFF_SPELL_ID = 1310372;
const BLOOD_DEBT: BloodAuraIdentity = {
  atomName: "blood_debt",
  auraClass: "BUFF",
  abilityGameId: BLOOD_DEBT_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: null,
  ownedByHeroTree: null,
  claims: [
    claim(
      "death_knight_t::init_spells; create_buffs",
      "15246; 16250",
      "`spell.blood_debt_buff = conditional_spell_lookup( sets->has_set_bonus( DEATH_KNIGHT_BLOOD, MID2, B2 ), 1310372 )` and " +
        '`buffs.blood_debt = make_fallback( sets->has_set_bonus( DEATH_KNIGHT_BLOOD, MID2, B2 ), this, "blood_debt", spell.blood_debt_buff )`. ' +
        "Set-bonus ownership is not resolved by this slice; the stack atom binds only under PROVEN_INACTIVE.",
    ),
  ],
};

/** `buff.visceral_strength`: 461130 for Blood. */
export const VISCERAL_STRENGTH_BUFF_SPELL_ID = 461130;
const VISCERAL_STRENGTH: BloodAuraIdentity = {
  atomName: "visceral_strength",
  auraClass: "BUFF",
  abilityGameId: VISCERAL_STRENGTH_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: "visceral_strength",
  ownedByHeroTree: "sanlayn",
  claims: [
    claim(
      "death_knight_t::init_spells; create_buffs",
      "15383-15384; 15886",
      "`spell.visceral_strength_buff = conditional_spell_lookup( talent.sanlayn.visceral_strength.ok(), specialization() == DEATH_KNIGHT_BLOOD ? 461130 : 434159 )`. " +
        "The pinned list reads only `buff.visceral_strength.remains`, never bound.",
    ),
  ],
};

/** `buff.exterminate`: 441416, a Deathbringer aura. */
export const EXTERMINATE_BUFF_SPELL_ID = 441416;
const EXTERMINATE: BloodAuraIdentity = {
  atomName: "exterminate",
  auraClass: "BUFF",
  abilityGameId: EXTERMINATE_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: null,
  ownedByHeroTree: "deathbringer",
  claims: [
    claim(
      "death_knight_t::init_spells; create_buffs",
      "15403-15404; 15859-15860",
      "`spell.exterminate_buff = conditional_spell_lookup( talent.deathbringer.exterminate.ok() || talent.deathbringer.echoing_fury.ok(), 441416 )`: " +
        "BOTH producers are Deathbringer hero talents, so a build resolved to the San'layn sub-tree cannot hold the aura. " +
        "No single talent proves it absent (two producers), hence `producedByTalent` is null and the hero-tree fact carries the proof.",
    ),
  ],
};

/** `buff.vampiric_blood`: 55233, the talent's own spell. */
export const VAMPIRIC_BLOOD_BUFF_SPELL_ID = 55233;
const VAMPIRIC_BLOOD: BloodAuraIdentity = {
  atomName: "vampiric_blood",
  auraClass: "BUFF",
  abilityGameId: VAMPIRIC_BLOOD_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: "vampiric_blood",
  ownedByHeroTree: null,
  claims: [
    claim(
      "death_knight_t::create_buffs; vampiric_blood_t::execute",
      "15992; 12797-12802",
      '`make_buff( this, "vampiric_blood", talent.blood.vampiric_blood )` — the buff is the talent spell 55233 itself — ' +
        "and vampiric_blood_t::execute triggers it on the actor.",
    ),
  ],
};

/** `debuff.reapers_mark_debuff`: 434765 on the target, a Deathbringer aura. Recorded; never bound (no debuff binding field). */
export const REAPERS_MARK_DEBUFF_SPELL_ID = 434765;
const REAPERS_MARK_DEBUFF: BloodAuraIdentity = {
  atomName: "reapers_mark_debuff",
  auraClass: "DEBUFF",
  abilityGameId: REAPERS_MARK_DEBUFF_SPELL_ID,
  selfApplied: false,
  producedByTalent: "reapers_mark",
  ownedByHeroTree: "deathbringer",
  claims: [
    claim(
      "death_knight_t::init_spells",
      "15391",
      "`spell.reapers_mark_debuff = conditional_spell_lookup( talent.deathbringer.reapers_mark.ok(), 434765 )`. A debuff on " +
        "the target; the shared evaluator has no debuff binding field, so `debuff.reapers_mark_debuff.up` is always enumerated. " +
        "Recorded so the measurement names it.",
    ),
  ],
};

/** Every pinned aura identity, by atom name. */
export const BLOOD_AURA_IDENTITIES: readonly BloodAuraIdentity[] = [
  GIFT_OF_THE_SANLAYN,
  DANCING_RUNE_WEAPON,
  DEATH_AND_DECAY,
  BONE_SHIELD,
  VAMPIRIC_STRIKE,
  ESSENCE_OF_THE_BLOOD_QUEEN,
  CRIMSON_SCOURGE,
  BOILING_POINT,
  BLOOD_DEBT,
  VISCERAL_STRENGTH,
  EXTERMINATE,
  VAMPIRIC_BLOOD,
  REAPERS_MARK_DEBUFF,
];

/** The identity pinned for one atom name, or `null`. */
export function bloodAuraIdentityFor(atomName: string): BloodAuraIdentity | null {
  return BLOOD_AURA_IDENTITIES.find((identity) => identity.atomName === atomName) ?? null;
}

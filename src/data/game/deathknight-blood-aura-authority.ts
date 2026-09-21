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
 *     hero tree disproved), and — for the identities carrying an
 *     `exactCount` rule (Bone Shield since M11-B2, Blood Debt since M11-B6)
 *     — the exact count the last stack-bearing transition reported, under
 *     the Blood-owned reconstruction rule in `aura-bindings.ts`. The rule's
 *     one pinned number, `applicationStack`, is the count a PLAIN application
 *     (an `applybuff` carrying no `stack`) establishes: 1 for Blood Debt
 *     (`buff_t::trigger()` from zero applies `_initial_stack`, which is 1 —
 *     the claims below), and `null` for Bone Shield, whose applications
 *     carry a count the pinned module does not fix (Marrowrend and Death's
 *     Caress trigger different numbers);
 *   - a HERO-TREE OWNERSHIP fact: an aura every producer of which is a
 *     talent of ONE hero sub-tree, so a build resolved to the OTHER sub-tree
 *     cannot hold it (one hero tree is active at a time —
 *     `talent-selection.ts`, `resolveHeroTree`);
 *   - a REMAINS POLICY (M11-B8): what a lone `refreshbuff` of the identity
 *     proves about its expiry, and whether `buff.<name>.remains` may bind
 *     the order-invariant lower bound inside the Blood pre-decision window.
 *     Both are Blood-owned readings of the pinned producer set against the
 *     observed wire, applied by `aura-remains.ts`; see `BloodRemainsPolicy`.
 *
 * WHAT IS NOT HERE. Durations: `buff.<name>.remains` is derived (M11-B4) in
 * `aura-remains.ts` from these identities plus the pinned duration artifact
 * `deathknight-blood-aura-durations.json`, never from a number typed here.
 * `debuff.reapers_mark_debuff.up` is a DEBUFF atom the evaluator enumerates
 * (no `knownDebuffs` field exists); it is recorded below as an identity so
 * the measurement can name it, and it is not bound.
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

/**
 * The Blood-owned exact-count rule for one stack atom (M11-B6). Its presence
 * on an identity is what admits the exact POSITIVE count; its one number is
 * the count a plain application establishes, or `null` when the pinned
 * module fixes none. Nothing here says how stacks are gained or lost between
 * observed transitions: no transition is ever synthesized from it.
 */
export interface BloodExactCountRule {
  readonly applicationStack: number | null;
}

/**
 * The Blood-owned policy `aura-remains.ts` applies to one identity's
 * `buff.<name>.remains` (M11-B8).
 *
 * `loneRefresh` says what a `refreshbuff` with NO same-millisecond `applybuff`
 * / `applybuffstack` companion proves about the expiry:
 *
 *     PINNED_TRIGGER_RESET   the M11-B4 reading: the pinned module's only way
 *                            to refresh the aura is a `buff_t::trigger`, a
 *                            DURATION refresh to the full duration, so a lone
 *                            refresh anchors an exact remainder — unless it
 *                            sits beside a stack REMOVAL, the one shape the
 *                            pinned decrement does not produce (Bone Shield).
 *     UNPROVEN_CAUSE         the aura is observed to be refreshed by a cause
 *                            the pinned module has no producer for, so a lone
 *                            refresh is never assigned a cause and never
 *                            anchors an exact remainder: it can only keep the
 *                            earlier proven expiry as a lower bound. A refresh
 *                            beside an exact gain is that gain's companion,
 *                            and the gain anchors, as before.
 *
 * `windowOrderInvariantBound` admits, for `.remains` only, the lower bound
 * that holds under BOTH orderings of a duration-resetting transition inside
 * the pre-decision window (`aura-remains.ts`). Exact reads inside the window
 * stay refused for every identity; `.up` and `.stack` read neither field.
 */
export interface BloodRemainsPolicy {
  readonly loneRefresh: "PINNED_TRIGGER_RESET" | "UNPROVEN_CAUSE";
  readonly windowOrderInvariantBound: boolean;
}

/** The M11-B4 reading, kept for every identity with no observed refresh of unmodelled cause. */
export const B4_REMAINS_POLICY: BloodRemainsPolicy = {
  loneRefresh: "PINNED_TRIGGER_RESET",
  windowOrderInvariantBound: false,
};

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
  /** The exact-count rule for `buff.<name>.stack`, or `null`: an ACTIVE aura without one binds no positive count. */
  readonly exactCount: BloodExactCountRule | null;
  /** How `aura-remains.ts` reads this identity's lone refreshes and the pre-decision window (M11-B8). */
  readonly remainsPolicy: BloodRemainsPolicy;
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
  exactCount: null,
  remainsPolicy: B4_REMAINS_POLICY,
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
  exactCount: null,
  remainsPolicy: B4_REMAINS_POLICY,
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
  exactCount: null,
  remainsPolicy: B4_REMAINS_POLICY,
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
  exactCount: { applicationStack: null },
  remainsPolicy: B4_REMAINS_POLICY,
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
  exactCount: null,
  remainsPolicy: B4_REMAINS_POLICY,
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
  exactCount: null,
  // M11-B8. The pinned module has exactly ONE producer (below), and every
  // corpus subject's wire also carries a lone `refreshbuff` of this aura at
  // each Gift of the San'layn edge with no Vampiric Strike cast anywhere
  // near it — a refresh the pinned module has no producer for. A lone
  // refresh is therefore of unproven cause and anchors nothing exact; a
  // refresh beside an `applybuffstack` is that gain's companion. The
  // pinned `_max_stack` 5 is also contradicted by the observed 6 and 7
  // (Frenzied Bloodthirst, 434075 effect 1, +2 P_MAX_STACKS by label 3134,
  // which the pinned module never applies): no positive `.stack` is bound.
  remainsPolicy: { loneRefresh: "UNPROVEN_CAUSE", windowOrderInvariantBound: true },
  claims: [
    claim(
      "death_knight_t::init_spells; create_buffs",
      "15374; 15876-15877",
      "`spell.essence_of_the_blood_queen_buff = conditional_spell_lookup( talent.sanlayn.vampiric_strike.ok(), 433925 )` and " +
        '`buffs.essence_of_the_blood_queen = make_fallback<essence_of_the_blood_queen_buff_t>( talent.sanlayn.vampiric_strike.ok(), this, "essence_of_the_blood_queen", … )`.',
    ),
    claim(
      "death_knight_t::trigger_sanlayn_execute_talents",
      "13802-13808",
      "`buffs.essence_of_the_blood_queen->trigger()` on a Vampiric Strike execution is the ONLY call site that starts, " +
        "stacks or refreshes the aura in the pinned module; `essence_of_the_blood_queen_buff_t` (:7382-7411) overrides " +
        "`value()` / `check_value()` only, and no `expire()`, `extend_duration()` or `set_max_stack()` exists for it. " +
        "The corpus shows a `refreshbuff` at every Gift of the San'layn application and removal with no Vampiric Strike " +
        "cast (2,019,763 / 2,099,885 / 2,111,891; opener 2,429,050), so the wire refreshes the aura for a cause this " +
        "module does not model: a lone refresh is never assigned a cause (M11-B8, `remainsPolicy.loneRefresh`).",
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
  exactCount: null,
  remainsPolicy: B4_REMAINS_POLICY,
  claims: [
    claim(
      "death_knight_t::init_spells; create_buffs",
      "15229; 15963-15964",
      "`spell.crimson_scourge_buff = conditional_spell_lookup( spec.crimson_scourge->ok(), 81141 )` and " +
        '`make_buff( this, "crimson_scourge", spell.crimson_scourge_buff )->set_trigger_spell( spec.crimson_scourge )`. ' +
        "The pinned list reads only `buff.crimson_scourge.remains`, derived since M11-B4 (`aura-remains.ts`) from " +
        "this identity and the pinned 15,000 ms duration.",
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
  exactCount: null,
  remainsPolicy: B4_REMAINS_POLICY,
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
/** Blood Debt's maximum stack, from the pinned spell data (`_max_stack` of 1310372). The only count the pinned list asks about. */
export const BLOOD_DEBT_MAX_STACK = 10;
const BLOOD_DEBT: BloodAuraIdentity = {
  atomName: "blood_debt",
  auraClass: "BUFF",
  abilityGameId: BLOOD_DEBT_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: null,
  ownedByHeroTree: null,
  exactCount: { applicationStack: 1 },
  remainsPolicy: B4_REMAINS_POLICY,
  claims: [
    claim(
      "death_knight_t::init_spells; create_buffs",
      "15246; 16250",
      "`spell.blood_debt_buff = conditional_spell_lookup( sets->has_set_bonus( DEATH_KNIGHT_BLOOD, MID2, B2 ), 1310372 )` and " +
        '`buffs.blood_debt = make_fallback( sets->has_set_bonus( DEATH_KNIGHT_BLOOD, MID2, B2 ), this, "blood_debt", spell.blood_debt_buff )`. ' +
        "A SET-BONUS aura: no talent and no hero sub-tree produces it, so neither build proof applies and set-bonus " +
        "ownership is not resolved by this slice (no equipped-item reading is made). Exact zero comes only from an " +
        "observed removal (PROVEN_INACTIVE).",
    ),
    claim(
      "death_strike_t::execute",
      "10120-10123",
      "`if ( p()->sets->has_set_bonus( DEATH_KNIGHT_BLOOD, MID2, B2 ) && p()->cooldown.mid2_2pc->up() ) { p()->buffs.blood_debt->trigger(); " +
        "p()->cooldown.mid2_2pc->start(); }` — Death Strike is the ONLY producer, under an internal cooldown " +
        "(`cooldown.mid2_2pc->duration = sets->set( DEATH_KNIGHT_BLOOD, MID2, B2 )->internal_cooldown()`, 15499-15500). " +
        "The Blood rule reads the transitions Warcraft Logs reports and never infers a gain from a Death Strike cast or " +
        "from the cooldown: 15 of the corpus bundle's 44 Death Strikes produce no transition.",
    ),
    claim(
      "buff_t::trigger / _resolve_stacks / set_initial_stack / bump (engine/buff.cpp at the same commit)",
      "buff.cpp 2082-2085, 2075-2080, 1043-1054, 2649-2659",
      "`trigger()` passes `stacks = -1`, which `_resolve_stacks` maps to `_initial_stack`; `_initial_stack` is 1 because " +
        "the spell's `_proc_charges` (initial_stacks) is 0; `bump` adds the stacks and caps at `max_stack()`, discarding " +
        "the overflow. So a plain application establishes EXACTLY 1 stack, every further trigger adds exactly 1 up to " +
        "the maximum, and a trigger at the maximum changes nothing. The count is read from each transition's absolute " +
        "`stack`, never computed as previous + 1.",
    ),
    claim(
      "spell data 1310372 (sc_spell_data.inc); buff_t::set_max_stack; buff_t::set_duration",
      "sc_spell_data.inc 31624; buff.cpp 970-976; buff.cpp 877-880",
      "`_max_stack = 10` (read by `set_max_stack` from `data().max_stacks()`), `_duration = -1` (a negative duration " +
        "becomes `base_buff_duration = zero`: the aura is PERMANENT, with no expiry event and no decay), " +
        "`_proc_charges = 0`. No stack is lost one at a time, nothing ties the count to a duration, and no talent or the " +
        "four-piece bonus (11707-11711, which adds Bone Shield and Bloody Demise on consumption) changes the stack behaviour.",
    ),
    claim(
      "marrowrend_t::execute",
      "11703-11705",
      "`if ( p()->sets->has_set_bonus( DEATH_KNIGHT_BLOOD, MID2, B2 ) && p()->buffs.blood_debt->at_max_stacks() ) { " +
        "p()->buffs.blood_debt->expire(); p()->buffs.relentless_riders_strength->trigger(); … }` — Marrowrend is the ONLY " +
        "consumer, only at the maximum (`at_max_stacks` is `check() + mod >= max_stack()`, buff.hpp:255), and it removes " +
        "EVERY stack at once; Warcraft Logs reports that as a plain `removebuff`. A Marrowrend below the maximum leaves " +
        "the aura untouched (the corpus's Marrowrends at 2,015,770, 2,085,352 and 2,151,502, at 2, 9 and 8 stacks, did).",
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
  exactCount: null,
  remainsPolicy: B4_REMAINS_POLICY,
  claims: [
    claim(
      "death_knight_t::init_spells; create_buffs",
      "15383-15384; 15886",
      "`spell.visceral_strength_buff = conditional_spell_lookup( talent.sanlayn.visceral_strength.ok(), specialization() == DEATH_KNIGHT_BLOOD ? 461130 : 434159 )`. " +
        "The pinned list reads only `buff.visceral_strength.remains`, derived since M11-B4 from this identity and " +
        "the pinned 12,000 ms duration.",
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
  exactCount: null,
  remainsPolicy: B4_REMAINS_POLICY,
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
  exactCount: null,
  remainsPolicy: B4_REMAINS_POLICY,
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
  exactCount: null,
  remainsPolicy: B4_REMAINS_POLICY,
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

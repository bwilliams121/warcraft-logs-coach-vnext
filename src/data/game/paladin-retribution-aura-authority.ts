/**
 * Retribution Paladin's pinned AURA identities for the atoms the spender
 * slice reads (M11-A4) — hand-reviewed against the same pinned
 * SimulationCraft commit as every other Paladin dataset, with the measured
 * hashes of the files each reading was made against.
 *
 * FOUR KINDS OF FACT:
 *
 *   - an OBSERVED aura identity read as `buff.<name>.up` — bound from M4
 *     transitions strictly before the decision (`aura-bindings.ts`);
 *   - a READINESS gate: an action whose `action_ready()` requires an aura, so
 *     M4 proving that aura INACTIVE proves the action unusable (Hammer of
 *     Wrath), and one whose `action_ready()` requires the SAME aura ABSENT
 *     (Judgment);
 *   - a FREE-CAST route: an aura that makes a Holy Power spender cost nothing
 *     (Divine Purpose), read by `holy-power.ts`;
 *   - an EXACT-ZERO STACK proof (M11-A4): an aura read as `buff.<name>.stack`
 *     whose count is bound to exactly zero when M4 proves it INACTIVE, or
 *     when the pinned build proves the talent that produces it absent. No
 *     positive count is ever bound.
 *
 * THE READINESS AURA AND ITS TWO IDS, stated plainly. SimulationCraft builds
 * `buffs.hammer_of_wrath` from spell 1277026 (sc_paladin.cpp:3684) for every
 * Paladin. The Warcraft Logs stream of BOTH M11-A4 subjects carries aura
 * 1241410 "Hammer of Wrath" (DBC: duration −1, no cooldown, no stacks)
 * applied at the millisecond of every Avenging Wrath cast and removed at the
 * millisecond of every Avenging Wrath removal — A7R6 fight 7 actor 6 at
 * +0.710/+24.725, +63.341/+87.358, +127.413/+151.420 s; gtKb fight 22 actor 23
 * at +1.213 s — exactly the lifecycle the module gives 1277026 (triggered by
 * avenging_wrath_t::execute at :315, expired by the wings expire callback at
 * :3633). The identity below is therefore EVIDENCE-BACKED: it names the aura
 * the game emits, records the module's own id beside it, and is refused —
 * the atom stays unbound and Hammer of Wrath's usability UNKNOWN — the day a
 * capture shows neither.
 */

/** Measured at M10-C / M11-A3 from the pinned files; recorded, never typed from memory. */
export const SC_PALADIN_CPP_SHA256 = "519e69485c0efa9c9b51b2828a13c944b622c0c42f3f170b39e30b6ea5b36a85";
export const SC_PALADIN_HPP_SHA256 = "51fa0abc7fab5e433325c83a4115a7a73a2e57d93276265cf892abb894f56af1";
export const SC_PALADIN_RETRIBUTION_CPP_SHA256 =
  "ea2e9c704ff6b5f1d67b9d5017a1362a3f8bd6e9d9cf96ebcf571dc43f70cfd9";

export interface RetributionAuraClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

/** A build fact that must hold for an identity to be the one the atom reads. */
export interface RetributionAuraGate {
  readonly simcName: string;
  readonly selection: "SELECTED" | "NOT_SELECTED";
}

export interface RetributionAuraIdentity {
  /** The buff name as the pinned APL writes it after `buff.`, or the readiness/free-cast role. */
  readonly atomName: string;
  /** Build facts that must hold for this identity to apply; empty when it holds for every build. */
  readonly requires: readonly RetributionAuraGate[];
  /** The aura's spell id on the wire. */
  readonly abilityGameId: number;
  /** Applied by the actor to themself: a from-source query on the actor as target. */
  readonly selfApplied: true;
  /**
   * The talent that PRODUCES the aura, when exact-zero-by-build is admissible:
   * with it NOT_SELECTED the aura is impossible in the analyzed build and
   * `buff.<name>.stack` is exactly 0. `null` when no such single talent exists.
   */
  readonly producedByTalent: string | null;
  readonly claims: readonly RetributionAuraClaim[];
}

const CLASS = "engine/class_modules/paladin/sc_paladin.cpp";
const HEADER = "engine/class_modules/paladin/sc_paladin.hpp";
const SPEC = "engine/class_modules/paladin/sc_paladin_retribution.cpp";

const claim = (
  sourcePath: string,
  sourceSha256: string,
  symbol: string,
  lines: string,
  text: string,
): RetributionAuraClaim => ({ sourcePath, sourceSha256, symbol, lines, claim: text });

/** `buff.avenging_wrath`: the wings buff, 31884 unless Radiant Glory (under which the action is background anyway). */
export const AVENGING_WRATH_BUFF_SPELL_ID = 31884;
const AVENGING_WRATH: RetributionAuraIdentity = {
  atomName: "avenging_wrath",
  requires: [{ simcName: "radiant_glory", selection: "NOT_SELECTED" }],
  abilityGameId: AVENGING_WRATH_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: null,
  claims: [
    claim(
      CLASS,
      SC_PALADIN_CPP_SHA256,
      "paladin_t::init_spells; create_buffs",
      "4314-4317; 3626",
      "`spells.avenging_wrath = talents.radiant_glory->ok() ? find_spell( 454351 ) : find_spell( 31884 )`, and " +
        '`buffs.avenging_wrath = make_buff( this, "avenging_wrath", spells.avenging_wrath )`. Under Radiant Glory ' +
        "the avenging_wrath ACTION is background (:290-291), so the 31884 identity is the one every castable " +
        "build reads. Crusade (3637-3643) changes the buff's stacking and haste, not its spell.",
    ),
    claim(
      CLASS,
      SC_PALADIN_CPP_SHA256,
      "avenging_wrath_t::execute",
      "305-316",
      "Triggers buffs.avenging_wrath on the actor: a self-applied aura, so the M4 question is a " +
        "from-source query on the actor as target.",
    ),
  ],
};

/** `buff.empyrean_legacy`: 387178, triggered on Avenging Wrath execute under the talent, consumed by a Verdict. */
export const EMPYREAN_LEGACY_BUFF_SPELL_ID = 387178;
const EMPYREAN_LEGACY: RetributionAuraIdentity = {
  atomName: "empyrean_legacy",
  requires: [],
  abilityGameId: EMPYREAN_LEGACY_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: "empyrean_legacy",
  claims: [
    claim(
      SPEC,
      SC_PALADIN_RETRIBUTION_CPP_SHA256,
      "paladin_t::create_buffs_retribution",
      "1156",
      '`buffs.empyrean_legacy = make_buff( this, "empyrean_legacy", find_spell( 387178 ) )`.',
    ),
    claim(
      CLASS,
      SC_PALADIN_CPP_SHA256,
      "avenging_wrath_t::execute",
      "311-312",
      "`if ( p()->talents.empyrean_legacy->ok() ) p()->buffs.empyrean_legacy->trigger();` — the only trigger, " +
        "gated on the talent: a build without Empyrean Legacy never holds the aura.",
    ),
    claim(
      SPEC,
      SC_PALADIN_RETRIBUTION_CPP_SHA256,
      "templars_verdict_t::execute",
      "712-717",
      "Expired by a Verdict execute (`p()->buffs.empyrean_legacy->expire()` after scheduling the free Divine " +
        "Storm), which is why `finishers[0]` gates Divine Storm on `!buff.empyrean_legacy.up`.",
    ),
  ],
};

/** `buff.divine_arbiter_verdict`: 1306161, the Midnight season-2 four-piece buff a VERDICT grants. */
export const DIVINE_ARBITER_VERDICT_BUFF_SPELL_ID = 1306161;
/** `buff.divine_arbiter_divine_storm`: 1306162, the four-piece buff a DIVINE STORM grants. */
export const DIVINE_ARBITER_DIVINE_STORM_BUFF_SPELL_ID = 1306162;
const DIVINE_ARBITER_CLAIMS: readonly RetributionAuraClaim[] = [
  claim(
    CLASS,
    SC_PALADIN_CPP_SHA256,
    "paladin_t::init_spells; create_buffs",
    "4320-4322; 3646-3650",
    "`spells.divine_arbiter_divine_storm = find_spell( 1306162 )`, `spells.divine_arbiter_verdict = find_spell( 1306161 )`; " +
      '`buffs.divine_arbiter_divine_storm = make_buff( this, "divine_arbiter_divine_storm", … )` and ' +
      '`buffs.divine_arbiter_verdict = make_buff( this, "divine_arbiter_verdict", … )`.',
  ),
  claim(
    HEADER,
    SC_PALADIN_HPP_SHA256,
    "holy_power_consumer_t::execute (set bonus MID2 B4)",
    "1666-1716",
    "When a spender consumes Divine Purpose under the four-piece and no arbiter buff is up, the buff NAMED " +
      "AFTER THE SPENDER triggers (a Verdict → divine_arbiter_verdict, a Divine Storm → " +
      "divine_arbiter_divine_storm); a later DIFFERENT spender expires it. Both are self-applied.",
  ),
];
const DIVINE_ARBITER_VERDICT: RetributionAuraIdentity = {
  atomName: "divine_arbiter_verdict",
  requires: [],
  abilityGameId: DIVINE_ARBITER_VERDICT_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: null,
  claims: DIVINE_ARBITER_CLAIMS,
};
const DIVINE_ARBITER_DIVINE_STORM: RetributionAuraIdentity = {
  atomName: "divine_arbiter_divine_storm",
  requires: [],
  abilityGameId: DIVINE_ARBITER_DIVINE_STORM_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: null,
  claims: DIVINE_ARBITER_CLAIMS,
};

/** Divine Purpose: 408458 for Retribution, the free-cast route for a Holy Power spender. */
export const DIVINE_PURPOSE_BUFF_SPELL_ID = 408458;
const DIVINE_PURPOSE: RetributionAuraIdentity = {
  atomName: "divine_purpose",
  requires: [],
  abilityGameId: DIVINE_PURPOSE_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: "divine_purpose",
  claims: [
    claim(
      CLASS,
      SC_PALADIN_CPP_SHA256,
      "paladin_t::init_spells; create_buffs",
      "4324; 3653",
      "`spells.divine_purpose_buff = find_spell( specialization() == PALADIN_RETRIBUTION ? 408458 : 223819 )`; " +
        '`buffs.divine_purpose = make_buff( this, "divine_purpose", spells.divine_purpose_buff )`.',
    ),
    claim(
      HEADER,
      SC_PALADIN_HPP_SHA256,
      "holy_power_consumer_t::cost / execute",
      "1665-1676; 1720-1728",
      "A spender executed with the buff up costs no Holy Power and expires it (`p->buffs.divine_purpose->expire()`); " +
        "a hit rolls the talent's chance to trigger it again (1720-1728). The observed spender cast carries NO " +
        "Holy Power entry on the wire when the cast was free — the evidence pattern `holy-power.ts` reads.",
    ),
  ],
};

/**
 * The Hammer of Wrath READINESS aura as the game emits it. See the module
 * header: SimulationCraft's own object is built from 1277026; the wire carries
 * 1241410 on both subjects with the identical lifecycle.
 */
export const HAMMER_OF_WRATH_READINESS_AURA_SPELL_ID = 1241410;
export const HAMMER_OF_WRATH_READINESS_SIMC_SPELL_ID = 1277026;
const HAMMER_OF_WRATH_READINESS: RetributionAuraIdentity = {
  atomName: "hammer_of_wrath",
  requires: [],
  abilityGameId: HAMMER_OF_WRATH_READINESS_AURA_SPELL_ID,
  selfApplied: true,
  producedByTalent: null,
  claims: [
    claim(
      CLASS,
      SC_PALADIN_CPP_SHA256,
      "hammer_of_wrath_t::action_ready; judgment_t::action_ready",
      "1799-1802; 1536-1539",
      "`return judgment_base_t::action_ready() && p()->buffs.hammer_of_wrath->up();` and " +
        "`return judgment_base_t::action_ready() && !p()->buffs.hammer_of_wrath->up();` — Hammer of Wrath cannot " +
        "fire while the buff is down and Judgment cannot fire while it is up, whatever either cooldown says.",
    ),
    claim(
      CLASS,
      SC_PALADIN_CPP_SHA256,
      "paladin_t::create_buffs; avenging_wrath_t::execute; wings expire callback",
      "3684; 313-315; 3631-3634",
      '`buffs.hammer_of_wrath = make_buff( this, "hammer_of_wrath", find_spell( 1277026 ) )`, triggered by ' +
        "avenging_wrath_t::execute when talents.hammer_of_wrath is taken, and expired in the wings buff's expire " +
        "callback. The wire aura 1241410 follows exactly that lifecycle on both M11-A4 subjects (module header).",
    ),
  ],
};

/** `buff.art_of_war.stack`: 406086, a one-stack proc; exact zero when INACTIVE or when the talent is not taken. */
export const ART_OF_WAR_BUFF_SPELL_ID = 406086;
const ART_OF_WAR: RetributionAuraIdentity = {
  atomName: "art_of_war",
  requires: [],
  abilityGameId: ART_OF_WAR_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: "art_of_war",
  claims: [
    claim(
      SPEC,
      SC_PALADIN_RETRIBUTION_CPP_SHA256,
      "paladin_t::create_buffs_retribution",
      "1164",
      '`buffs.art_of_war = make_buff( this, "art_of_war", find_spell( 406086 ) )`.',
    ),
    claim(
      CLASS,
      SC_PALADIN_CPP_SHA256,
      "melee_t::execute (auto-attack Art of War proc)",
      "1005-1015",
      "Triggered only `if ( p()->talents.art_of_war->ok() && … )` on an auto-attack hit; the only trigger in the " +
        "pinned modules. A build without the talent never holds the aura, so its stack is exactly 0 by build; a " +
        "build with it holds exactly 0 stacks whenever M4 proves the aura INACTIVE.",
    ),
  ],
};

/** `buff.righteous_cause.stack`: 402916, the alternative of the same choice node as Art of War. */
export const RIGHTEOUS_CAUSE_BUFF_SPELL_ID = 402916;
const RIGHTEOUS_CAUSE: RetributionAuraIdentity = {
  atomName: "righteous_cause",
  requires: [],
  abilityGameId: RIGHTEOUS_CAUSE_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: "righteous_cause",
  claims: [
    claim(
      SPEC,
      SC_PALADIN_RETRIBUTION_CPP_SHA256,
      "paladin_t::create_buffs_retribution",
      "1165",
      '`buffs.righteous_cause = make_buff( this, "righteous_cause", find_spell( 402916 ) )->set_chance( 1.0 )`.',
    ),
    claim(
      SPEC,
      SC_PALADIN_RETRIBUTION_CPP_SHA256,
      "trigger sites gated on triggers_righteous_cause / talents.righteous_cause",
      "455-602",
      "Every trigger of the buff in the module is gated on the Righteous Cause talent, which shares choice node " +
        "81523 with Art of War (paladin-retribution-talents.json). A build that took Art of War cannot hold the " +
        "aura, so its stack is exactly 0 by build.",
    ),
  ],
};

/** Every pinned aura identity, by atom name. */
export const RETRIBUTION_AURA_IDENTITIES: readonly RetributionAuraIdentity[] = [
  AVENGING_WRATH,
  EMPYREAN_LEGACY,
  DIVINE_ARBITER_VERDICT,
  DIVINE_ARBITER_DIVINE_STORM,
  DIVINE_PURPOSE,
  HAMMER_OF_WRATH_READINESS,
  ART_OF_WAR,
  RIGHTEOUS_CAUSE,
];

/** The identities pinned for one atom name (possibly several, each under its own build gate). */
export function retributionAuraIdentitiesFor(atomName: string): readonly RetributionAuraIdentity[] {
  return RETRIBUTION_AURA_IDENTITIES.filter((identity) => identity.atomName === atomName);
}

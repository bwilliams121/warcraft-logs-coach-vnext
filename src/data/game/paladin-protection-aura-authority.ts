/**
 * Protection Paladin's pinned AURA identities for the atoms the first-GCD
 * question reads (M10-C5 Phase A) — hand-reviewed against the same pinned
 * SimulationCraft commit as every other Paladin dataset, with the file hashes
 * the review was made against.
 *
 * FOUR KINDS OF FACT (Phase A + Phase B):
 *
 *   - an OBSERVED aura identity (`buff.avenging_wrath` under Sentinel,
 *     `buff.vanguard`, and the Hammer of Wrath readiness aura) — bound from
 *     M4 transitions strictly before the decision;
 *   - a BUILD-IMPLIED absence: a buff whose every trigger in the pinned
 *     module is gated on a talent or hero tree the observed build does not
 *     have, so it is FALSE by the build (the Templar buffs under Lightsmith;
 *     Blessed Assurance when its choice node was spent elsewhere);
 *   - a READINESS gate: an action whose `action_ready()` requires an aura, so
 *     M4 proving that aura INACTIVE proves the action unusable.
 *
 * `buff.avenging_wrath.up` is the Phase A identity, listed with the two facts
 * that make it answerable from a Warcraft Logs aura stream:
 *
 *   - WHICH SPELL the atom reads: under the Sentinel talent, SimulationCraft
 *     rewrites every `buff.avenging_wrath` expression to `buff.sentinel`
 *     (sc_paladin.cpp:5296-5299 for Protection; 5067-5076 in the class
 *     module), and `buffs.sentinel` is built from `talents.sentinel` — spell
 *     389539 — so the aura the log shows as 389539 on the actor IS the buff
 *     the atom asks about;
 *   - WHO applies it: the actor, to themself (`sentinel_t::execute` triggers
 *     `p()->buffs.sentinel`, sc_paladin_protection.cpp:729-747), so the M4
 *     question is a `fromSource(actor)` query on `target = actor`.
 *
 * The non-Sentinel path is deliberately NOT pinned here: without Sentinel the
 * atom reads `buffs.avenging_wrath`, whose spell is 31884 OR 454351 depending
 * on the Radiant Glory talent (sc_paladin.cpp:4313-4317), and Radiant Glory is
 * not a modelled talent at Phase A. A build without Sentinel therefore leaves
 * the atom unbound rather than guessing which record to read.
 */

import {
  SC_PALADIN_CPP_SHA256,
  SC_PALADIN_PROTECTION_CPP_SHA256,
} from "./paladin-protection-transition-authority.js";

export interface PaladinAuraClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface ProtectionAuraIdentity {
  /** The buff name as the pinned APL writes it after `buff.`. */
  readonly atomName: string;
  /** The build fact whose selection makes this identity the one the atom reads; `null` when the identity holds for every build. */
  readonly requiresTalent: { readonly simcName: string; readonly selection: "SELECTED" } | null;
  /** The aura's spell id on the wire. */
  readonly abilityGameId: number;
  /** Applied by the actor to themself: a `fromSource(actor)` query on `target = actor`. */
  readonly selfApplied: true;
  readonly claims: readonly PaladinAuraClaim[];
}

export const SENTINEL_BUFF_SPELL_ID = 389539;

const WINGS_UNDER_SENTINEL: ProtectionAuraIdentity = {
  atomName: "avenging_wrath",
  requiresTalent: { simcName: "sentinel", selection: "SELECTED" },
  abilityGameId: SENTINEL_BUFF_SPELL_ID,
  selfApplied: true,
  claims: [
    {
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "paladin_t::create_expression (Protection branch)",
      lines: "5296-5299",
      claim:
        "For PALADIN_PROTECTION, any expression whose second segment is `avenging_wrath` has that segment " +
        "rewritten to `sentinel` when talents.sentinel->ok(), so `buff.avenging_wrath.up` evaluates " +
        "`buff.sentinel.up`. The class-wide rewrite at 5067-5076 does the same for buff/talent/cooldown.",
    },
    {
      sourcePath: "engine/class_modules/paladin/sc_paladin_protection.cpp",
      sourceSha256: SC_PALADIN_PROTECTION_CPP_SHA256,
      symbol: "buffs::sentinel_buff_t::sentinel_buff_t",
      lines: "15-17",
      claim:
        '`buff_t( p, "sentinel", p->talents.sentinel )`: the buff\'s spell data IS the Sentinel talent ' +
        'spell, 389539 (talents.sentinel = find_talent_spell( SPECIALIZATION, "Sentinel" ) at 1074; the ' +
        "pinned talent artifact records talentSpellId 389539 for that entry).",
    },
    {
      sourcePath: "engine/class_modules/paladin/sc_paladin_protection.cpp",
      sourceSha256: SC_PALADIN_PROTECTION_CPP_SHA256,
      symbol: "sentinel_t::execute",
      lines: "729-747",
      claim:
        "The actor's own Sentinel press triggers `p()->buffs.sentinel` on the actor; no other actor applies " +
        "it, so the M4 presence question is the actor's own aura on themself.",
    },
  ],
};

/** `buff.vanguard`: Glory of the Vanguard's proc on Judgment (sc_paladin.cpp:1518-1522), applied by the actor to themself. */
export const VANGUARD_BUFF_SPELL_ID = 1268810;
const VANGUARD: ProtectionAuraIdentity = {
  atomName: "vanguard",
  requiresTalent: { simcName: "glory_of_the_vanguard", selection: "SELECTED" },
  abilityGameId: VANGUARD_BUFF_SPELL_ID,
  selfApplied: true,
  claims: [
    {
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "paladin_t::create_buffs / judgment impact",
      lines: "3791; 1518-1522",
      claim:
        '`buffs.vanguard = make_buff( this, "vanguard", find_spell( 1268810 ) )`; triggered on the actor by ' +
        "judgment_t::impact under talents.glory_of_the_vanguard_1 with a 20 % roll. `buff.vanguard.up` " +
        "(default[13]) reads this buff. The gating identity is the first Glory of the Vanguard tier " +
        "(`apex.1`), whose selection the resolver already establishes.",
    },
  ],
};

/** The Hammer of Wrath readiness aura (sc_paladin.cpp:3684), triggered by wings and expired with them. */
export const HAMMER_OF_WRATH_BUFF_SPELL_ID = 1277026;
const HAMMER_OF_WRATH_READINESS: ProtectionAuraIdentity = {
  atomName: "hammer_of_wrath",
  // No build gate: the buff's identity does not depend on a talent, and an
  // untalented Hammer of Wrath is background regardless of the buff.
  requiresTalent: null,
  abilityGameId: HAMMER_OF_WRATH_BUFF_SPELL_ID,
  selfApplied: true,
  claims: [
    {
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "hammer_of_wrath_t::action_ready",
      lines: "1799-1801",
      claim:
        "`return judgment_base_t::action_ready() && p()->buffs.hammer_of_wrath->up();` — the action cannot " +
        "fire while the buff is down, whatever the shared Judgment cooldown says.",
    },
    {
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "paladin_t::create_buffs; sentinel_t::execute; avenging_wrath buff expire callback",
      lines: "3684; 3632-3634",
      claim:
        '`buffs.hammer_of_wrath = make_buff( this, "hammer_of_wrath", find_spell( 1277026 ) )`, triggered by ' +
        "sentinel_t::execute (sc_paladin_protection.cpp:747) and avenging_wrath_t::execute (sc_paladin.cpp:315) " +
        "on the actor, and expired when the wings buff expires (3632-3634). The Phase A/B evidence shows it " +
        "applied at each Sentinel press and removed with the Sentinel aura.",
    },
  ],
};

/** Every pinned aura identity, by atom name. */
export const PROTECTION_AURA_IDENTITIES: readonly ProtectionAuraIdentity[] = [
  WINGS_UNDER_SENTINEL,
  VANGUARD,
  HAMMER_OF_WRATH_READINESS,
];

/**
 * A buff that is FALSE by the observed BUILD: every trigger of it in the
 * pinned module is gated on a talent or hero tree the build does not have.
 * Bound `up: false` without consulting the aura stream — and only under the
 * stated gate; an unresolved gate leaves the atom unbound.
 */
export interface ProtectionBuildImpliedAbsence {
  readonly atomName: string;
  readonly gate:
    | { readonly kind: "HERO_TREE_NOT"; readonly simcName: string }
    | { readonly kind: "TALENT_NOT_SELECTED"; readonly simcName: string };
  readonly abilityGameId: number;
  readonly claims: readonly PaladinAuraClaim[];
}

const TEMPLAR_ONLY = (
  atomName: string,
  abilityGameId: number,
  symbol: string,
  lines: string,
  claim: string,
): ProtectionBuildImpliedAbsence => ({
  atomName,
  gate: { kind: "HERO_TREE_NOT", simcName: "templar" },
  abilityGameId,
  claims: [
    {
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol,
      lines,
      claim,
    },
  ],
});

export const PROTECTION_BUILD_IMPLIED_ABSENCES: readonly ProtectionBuildImpliedAbsence[] = [
  TEMPLAR_ONLY(
    "hammer_of_light_ready",
    427441,
    "buffs.templar.hammer_of_light_ready triggers",
    "1913-1916; 2381-2396",
    "Triggered only under `p()->specialization() == PALADIN_PROTECTION && p()->templar()` (1913) and in " +
      "trigger_lights_deliverance, which returns unless talents.templar.lights_deliverance->ok() (2383). A " +
      "build whose hero tree resolves to Lightsmith has neither, so the buff is never up.",
  ),
  TEMPLAR_ONLY(
    "hammer_of_light_free",
    433732,
    "paladin_t::trigger_lights_deliverance",
    "2381-2396",
    "Executed only inside trigger_lights_deliverance, gated on talents.templar.lights_deliverance->ok(); " +
      "never under Lightsmith.",
  ),
  TEMPLAR_ONLY(
    "undisputed_ruling",
    432629,
    "hammer_of_light impact",
    "2252-2255",
    "Executed only `if ( p()->talents.templar.undisputed_ruling->ok() )`; never under Lightsmith.",
  ),
  {
    atomName: "blessed_assurance",
    gate: { kind: "TALENT_NOT_SELECTED", simcName: "blessed_assurance" },
    abilityGameId: 433019,
    claims: [
      {
        sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
        sourceSha256: SC_PALADIN_CPP_SHA256,
        symbol: "buffs.lightsmith.blessed_assurance",
        lines: "3709-3710",
        claim:
          '`make_buff( this, "blessed_assurance", find_spell( 433019 ) )`, triggered only under ' +
          "talents.lightsmith.blessed_assurance->ok(); the pinned talent artifact resolves that choice node " +
          "(95235: Blessed Assurance 117883 / Divine Guidance 117884) by the three-way rule.",
      },
    ],
  },
];

/** The identities pinned for one atom name (possibly several, each gated on a talent). */
export function protectionAuraIdentitiesFor(atomName: string): readonly ProtectionAuraIdentity[] {
  return PROTECTION_AURA_IDENTITIES.filter((identity) => identity.atomName === atomName);
}

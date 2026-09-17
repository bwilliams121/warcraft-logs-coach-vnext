/**
 * Protection Paladin's pinned AURA identities for the atoms the first-GCD
 * question reads (M10-C5 Phase A) — hand-reviewed against the same pinned
 * SimulationCraft commit as every other Paladin dataset, with the file hashes
 * the review was made against.
 *
 * ONE ATOM AT PHASE A. `buff.avenging_wrath.up` is the only buff atom a real
 * Protection decision needed; it is listed here with the two facts that make
 * it answerable from a Warcraft Logs aura stream:
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
  /** The talent whose selection makes this identity the one the atom reads. */
  readonly requiresTalent: { readonly simcName: string; readonly selection: "SELECTED" };
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

/** Every pinned aura identity, by atom name. */
export const PROTECTION_AURA_IDENTITIES: readonly ProtectionAuraIdentity[] = [WINGS_UNDER_SENTINEL];

/** The identities pinned for one atom name (possibly several, each gated on a talent). */
export function protectionAuraIdentitiesFor(atomName: string): readonly ProtectionAuraIdentity[] {
  return PROTECTION_AURA_IDENTITIES.filter((identity) => identity.atomName === atomName);
}

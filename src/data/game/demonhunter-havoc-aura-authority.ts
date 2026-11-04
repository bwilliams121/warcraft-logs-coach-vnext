/**
 * Havoc Demon Hunter's pinned AURA identities for the buff atoms the slice reads
 * (ONB-A1), hand-reviewed against the same pinned SimulationCraft commit as every
 * other Havoc dataset, and corroborated against the retained capture of
 * b1PmaKrd6CDfzngc fight 48, actor 18.
 *
 * ONE KIND OF FACT: the spell id the log emits for a buff the pinned list names,
 * bound from M4 transitions strictly before the decision. Nothing here is a
 * duration or a stack count.
 *
 *   reavers_glaive   444686  removed at the millisecond of each Reaver's Glaive
 *                            cast (+3,896, +18,149, +56,221, +62,716, +68,420)
 *   rending_strike   442442  applied with each Reaver's Glaive, removed by the
 *                            Annihilation that consumes it (+8,077)
 *   glaive_flurry    442435  applied with each Reaver's Glaive, 27 of each
 *   initiative       391215  applied after Vengeful Retreat, 13 of each
 *   inertia_trigger  (none)  the retained subject took Exergy at Inertia's node, so
 *                            no wire id is corroborated: never queried
 *
 * `producedByTalent` is the talent whose absence makes the aura impossible. A day a
 * capture shows the buff under a different id, the identity is wrong and must be
 * revisited; the binding never falls back to a guess.
 */

/** Measured from the pinned file these readings were made against. */
export const SC_DEMON_HUNTER_CPP_SHA256 = "62a1b4ace1d7e658ad293023fbb67c2b669a3c52415ee2d5a1c08d5b63c867b0";

export interface HavocAuraClaim {
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface HavocAuraIdentity {
  /** The buff name as the pinned APL writes it after `buff.`. */
  readonly atomName: string;
  /** The aura's spell id on the wire. */
  readonly abilityGameId: number;
  /** Applied by the actor to themself: a from-source query on the actor as target. */
  readonly selfApplied: true;
  /** The talent whose absence makes the aura impossible, or `null`. */
  readonly producedByTalent: string | null;
  readonly claims: readonly HavocAuraClaim[];
}

export const REAVERS_GLAIVE_BUFF_SPELL_ID = 444686;
export const RENDING_STRIKE_BUFF_SPELL_ID = 442442;
export const GLAIVE_FLURRY_BUFF_SPELL_ID = 442435;
export const INITIATIVE_BUFF_SPELL_ID = 391215;

/** Every pinned observed-aura identity, in the order the slice binds them. */
export const HAVOC_AURA_IDENTITIES: readonly HavocAuraIdentity[] = Object.freeze([
  {
    atomName: "reavers_glaive",
    abilityGameId: REAVERS_GLAIVE_BUFF_SPELL_ID,
    selfApplied: true,
    producedByTalent: "art_of_the_glaive",
    claims: [
      {
        symbol: "demon_hunter_t::create_buffs; reavers_glaive_t::ready; reavers_glaive_t::execute",
        lines: "10110; 8459-8464; 8436-8438",
        claim:
          "buff.reavers_glaive is built on hero_spec.reavers_glaive_buff; the action is ready only while it is up, and its execute expires it. The module sets it quiet, which hides it from SimulationCraft's report, not from the game's log.",
      },
      {
        symbol: "buff.art_of_the_glaive stack change callback; two other named executes",
        lines: "10125-10145; 5495; 5571",
        claim:
          "It comes up when Art of the Glaive reaches its stack target (the stacks soul consumption builds) and on two other named executes. So consuming a soul can raise it.",
      },
    ],
  },
  {
    atomName: "rending_strike",
    abilityGameId: RENDING_STRIKE_BUFF_SPELL_ID,
    selfApplied: true,
    producedByTalent: "art_of_the_glaive",
    claims: [
      {
        symbol: "reavers_glaive_t::execute",
        lines: "8447-8448",
        claim: "Every Reaver's Glaive execute triggers buff.glaive_flurry and buff.rending_strike.",
      },
    ],
  },
  {
    atomName: "glaive_flurry",
    abilityGameId: GLAIVE_FLURRY_BUFF_SPELL_ID,
    selfApplied: true,
    producedByTalent: "art_of_the_glaive",
    claims: [
      {
        symbol: "reavers_glaive_t::execute",
        lines: "8447-8448",
        claim: "Every Reaver's Glaive execute triggers buff.glaive_flurry and buff.rending_strike.",
      },
    ],
  },
  {
    atomName: "initiative",
    abilityGameId: INITIATIVE_BUFF_SPELL_ID,
    selfApplied: true,
    producedByTalent: "initiative",
    claims: [
      {
        symbol: "trigger_initiative; demon_hunter_t::create_buffs",
        lines: "2608-2619; 10007",
        claim:
          "buff.initiative is built on spec.initiative_buff and triggered on impact against a target its tracker does not mark, which Vengeful Retreat's damage expires.",
      },
    ],
  },
]);

/** The identity for an atom name, or `null` when it is not pinned. */
export function havocAuraIdentityFor(atomName: string): HavocAuraIdentity | null {
  return HAVOC_AURA_IDENTITIES.find((identity) => identity.atomName === atomName) ?? null;
}

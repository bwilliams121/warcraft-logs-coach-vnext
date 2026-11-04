/**
 * Feral Druid's pinned AURA identities for the buff atoms the slice reads (ONB-C1),
 * hand-reviewed against the same pinned SimulationCraft commit as every other Feral
 * dataset, and corroborated against the retained captures of b1PmaKrd6CDfzngc fight 48
 * actor 170 and A7R6kxPJ1hC8YQ4w fight 7 actor 1.
 *
 * ONE KIND OF FACT: the spell id the log emits for a buff the pinned list names. Nothing
 * here is a duration or a stack count.
 *
 *   cat_form                768     applied and removed around Cat Form and Bear Form casts
 *   prowl                   5215    removed once, at actor 170's opening Rake
 *   shadowmeld              58984   applied by each of the 4 Shadowmeld casts, then removed
 *   berserk_cat             106951  applied by each of actor 1's 2 Berserk casts
 *   incarnation_cat         102543  applied by each of actor 170's 4 Incarnation casts
 *   apex_predators_craving  391882  on actor 1: 4 applied and 4 removed
 *
 * `buff.bs_inc` IS AN ALIAS, resolved by the build: Incarnation's buff when that talent is
 * taken, otherwise Berserk's (sc_druid.cpp:13607-13613). `feralBsIncAuraFor` answers it
 * only from a resolved talent.
 *
 * `producedByTalent` is the talent whose absence makes the aura impossible.
 */

import type { TalentSelection } from "./talent-selection.js";

/** Measured from the pinned file these readings were made against. */
export const SC_DRUID_CPP_SHA256 = "59227a2f687a9fe5229964f797fa2623040e3915dd6daec18b434ca4730a8fb0";

export interface FeralAuraIdentity {
  /** The buff name as the pinned APL writes it after `buff.`. */
  readonly atomName: string;
  /** The aura's spell id on the wire. */
  readonly abilityGameId: number;
  /** The talent whose absence makes the aura impossible, or `null`. */
  readonly producedByTalent: string | null;
}

export const CAT_FORM_BUFF_SPELL_ID = 768;
export const PROWL_BUFF_SPELL_ID = 5215;
export const SHADOWMELD_BUFF_SPELL_ID = 58984;
export const BERSERK_BUFF_SPELL_ID = 106951;
export const INCARNATION_BUFF_SPELL_ID = 102543;
export const APEX_PREDATORS_CRAVING_BUFF_SPELL_ID = 391882;

/** `buff.bs_inc` by the build. `null` while the Incarnation node is unresolved: never a guess. */
export function feralBsIncAuraFor(incarnation: TalentSelection | undefined): FeralAuraIdentity | null {
  if (incarnation === "SELECTED") {
    return {
      atomName: "bs_inc",
      abilityGameId: INCARNATION_BUFF_SPELL_ID,
      producedByTalent: "incarnation_cat",
    };
  }
  if (incarnation === "NOT_SELECTED") {
    return { atomName: "bs_inc", abilityGameId: BERSERK_BUFF_SPELL_ID, producedByTalent: "berserk_cat" };
  }
  return null;
}

/** Every directly named observed-aura identity, in the order the slice binds them. */
export const FERAL_AURA_IDENTITIES: readonly FeralAuraIdentity[] = Object.freeze([
  { atomName: "cat_form", abilityGameId: CAT_FORM_BUFF_SPELL_ID, producedByTalent: null },
  { atomName: "prowl", abilityGameId: PROWL_BUFF_SPELL_ID, producedByTalent: null },
  { atomName: "shadowmeld", abilityGameId: SHADOWMELD_BUFF_SPELL_ID, producedByTalent: null },
  {
    atomName: "apex_predators_craving",
    abilityGameId: APEX_PREDATORS_CRAVING_BUFF_SPELL_ID,
    producedByTalent: "apex_predators_craving",
  },
]);

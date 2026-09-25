/**
 * Brewmaster Monk's pinned AURA identities for the `buff.<name>.up` atoms the
 * Shado-Pan measurement slice reads (M11-C2) — hand-reviewed against the same
 * pinned SimulationCraft commit as every other Brewmaster dataset, with the
 * measured hash of the file each reading was made against, and corroborated
 * against the committed capture (`wcl-brewmaster-monk-gtkb-opener`, actor 4).
 *
 * ONE KIND OF FACT. An OBSERVED aura identity: the spell id the log emits for
 * the buff the pinned list names, bound from M4 transitions strictly before
 * the decision (`src/specs/monk/brewmaster/aura-bindings.ts`). Nothing here is
 * a duration, a stack count or a readiness gate; Empty the Cellar's readiness
 * aura lives in `monk-brewmaster-readiness-authority.ts`, uncorroborated.
 *
 * EACH IDENTITY IS EVIDENCE-BACKED, NOT ONLY SOURCE-BACKED. The module builds
 * each buff from a spell record, and the capture shows that same id on the
 * actor with the lifecycle the module gives it:
 *
 *   blackout_combo              228563: applied 22 ms after each Blackout Kick
 *                               (+2,663 / +8,453 refresh / +13,213 / +17,291),
 *                               removed at the millisecond of the Tiger Palm
 *                               that consumes it (+9,647 / +14,183 / +18,270)
 *   empty_barrel                1265307: removed 1 ms after a Keg Smash
 *                               (+183 / +19,272), applied 1 ms after a
 *                               Purifying Brew (+16,264)
 *   invoke_niuzao_the_black_ox  132578: applied at the millisecond of the
 *                               Invoke Niuzao cast (+3,986)
 *
 * (offsets from the fight start, 2,415,041). A day a capture shows the buff
 * under a different id, the identity is wrong and must be revisited; the
 * binding never falls back to a guess.
 */

/** Measured from the pinned file M11-C1 and M11-C2 read; recorded, never typed from memory. */
export const SC_MONK_CPP_SHA256_FOR_AURAS =
  "61dae19dac3135925bafac351bd624a60fb710d01ff1a37802f43a9c68484aad";

/** The pinned spell-data table the trigger readings were made against. */
export const SC_SPELL_DATA_INC_PATH = "engine/dbc/generated/sc_spell_data.inc";

export interface BrewmasterAuraClaim {
  readonly sourcePath: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface BrewmasterAuraIdentity {
  /** The buff name as the pinned APL writes it after `buff.`. */
  readonly atomName: string;
  /** The aura's spell id on the wire. */
  readonly abilityGameId: number;
  /** Applied by the actor to themself: a from-source query on the actor as target. */
  readonly selfApplied: true;
  /**
   * The talent whose absence makes the aura impossible (its buff is a
   * `make_buff_fallback` gated on that talent), or `null` when no single
   * modelled talent gates it.
   */
  readonly producedByTalent: string | null;
  readonly claims: readonly BrewmasterAuraClaim[];
}

const MODULE = "engine/class_modules/monk/sc_monk.cpp";

const claim = (sourcePath: string, symbol: string, lines: string, text: string): BrewmasterAuraClaim => ({
  sourcePath,
  symbol,
  lines,
  claim: text,
});

export const BLACKOUT_COMBO_BUFF_SPELL_ID = 228563;
const BLACKOUT_COMBO: BrewmasterAuraIdentity = {
  atomName: "blackout_combo",
  abilityGameId: BLACKOUT_COMBO_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: "blackout_combo",
  claims: [
    claim(
      MODULE,
      "monk_t::create_buffs",
      "6267-6268",
      '`buff.blackout_combo = make_buff_fallback( talent.brewmaster.blackout_combo->ok(), this, "blackout_combo", ' +
        "talent.brewmaster.blackout_combo->effectN( 5 ).trigger() )` — without the talent the buff is a fallback " +
        "that never comes up.",
    ),
    claim(
      SC_SPELL_DATA_INC_PATH,
      "spell 196736 effect index 4",
      "effect row 344195",
      "Blackout Combo (196736) effect #5 (index 4) is a trigger-spell effect whose trigger is 228563: the buff " +
        "spell the module builds.",
    ),
    claim(
      MODULE,
      "blackout_kick_t::execute; tiger_palm_t::execute; keg_smash_t::execute",
      "1390; 865; 2605",
      "Triggered by every Blackout Kick execute; expired by the Tiger Palm and the Keg Smash that follow.",
    ),
  ],
};

export const EMPTY_BARREL_BUFF_SPELL_ID = 1265307;
const EMPTY_BARREL: BrewmasterAuraIdentity = {
  atomName: "empty_barrel",
  abilityGameId: EMPTY_BARREL_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: null,
  claims: [
    claim(
      MODULE,
      "monk_t::create_buffs; empty_barrel_buff_t::empty_barrel_buff_t",
      "6285-6286; 4501-4508",
      '`buff.empty_barrel = make_buff_fallback<buffs::empty_barrel_buff_t>( talent.brewmaster.bring_me_another_1->ok(), this, "empty_barrel" )`, ' +
        "whose constructor builds the buff from `bring_me_another_1->effectN( 1 ).trigger()`.",
    ),
    claim(
      SC_SPELL_DATA_INC_PATH,
      "spells 1265129 / 1265138 / 1265141 effect index 0",
      "effect rows 1276915 / 1276930 / 1276935",
      '`bring_me_another_1` is `_ST( "Bring Me Another" )`, a by-name lookup over three tier rows sharing the ' +
        "name (sc_monk.cpp:5774-5776). Only the tier-1 row's effect #1 (1265129, index 0) carries a trigger, " +
        "1265307; the tier-2 and tier-3 rows' effect #1 trigger nothing. The wire shows 1265307, so the identity " +
        "is corroborated whichever row the lookup resolves — the id is the one the log emits.",
    ),
    claim(
      MODULE,
      "keg_smash_t::execute; monk_t::init_special_effects",
      "2612-2615; 6911-6919, 6921-6937",
      "Expired (and its damage executed) by a Keg Smash while up; triggered by a proc on a successful brew cast " +
        "and, under the third tier, on Celestial Brew, Celestial Infusion or Fortifying Brew.",
    ),
  ],
};

export const INVOKE_NIUZAO_BUFF_SPELL_ID = 132578;
const INVOKE_NIUZAO: BrewmasterAuraIdentity = {
  atomName: "invoke_niuzao_the_black_ox",
  abilityGameId: INVOKE_NIUZAO_BUFF_SPELL_ID,
  selfApplied: true,
  producedByTalent: "invoke_niuzao_the_black_ox",
  claims: [
    claim(
      MODULE,
      "monk_t::create_buffs",
      "6315-6319",
      '`buff.invoke_niuzao = make_buff_fallback( talent.brewmaster.invoke_niuzao_the_black_ox->ok(), this, "invoke_niuzao_the_black_ox", ' +
        "talent.brewmaster.invoke_niuzao_the_black_ox )` — the buff is the talent spell itself, 132578.",
    ),
    claim(
      MODULE,
      "niuzao_spell_t::execute",
      "3746-3753",
      "Every Invoke Niuzao execute spawns the pet and triggers the buff.",
    ),
  ],
};

/** Every pinned observed-aura identity, in the order the slice binds them. */
export const BREWMASTER_AURA_IDENTITIES: readonly BrewmasterAuraIdentity[] = Object.freeze([
  BLACKOUT_COMBO,
  EMPTY_BARREL,
  INVOKE_NIUZAO,
]);

/** The identity for an atom name, or `null` when it is not pinned. */
export function brewmasterAuraIdentityFor(atomName: string): BrewmasterAuraIdentity | null {
  return BREWMASTER_AURA_IDENTITIES.find((identity) => identity.atomName === atomName) ?? null;
}

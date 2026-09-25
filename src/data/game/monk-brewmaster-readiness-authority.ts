/**
 * Brewmaster Monk's pinned READINESS facts (M11-C1) — every C++ `ready()`
 * override on an action of the pinned Brewmaster list, hand-reviewed against
 * the same pinned SimulationCraft commit as the other Brewmaster datasets,
 * with the measured hash of the file each reading was made against.
 *
 * AUTHORITY DATA. M11-C1 recorded the facts in the established hand-reviewed
 * form (the readiness gate records beside the other specializations' aura
 * authorities, and `stealth-readiness-authority.ts`, are the precedents) so
 * the milestone that builds the analyzer rests on a reviewed reading rather
 * than on memory. Since M11-C2 the Brewmaster action profile
 * (`src/specs/monk/brewmaster/action-profile.ts`) reads them: the Tiger Palm
 * gate as a build-static STATIC_READY_FALSE proof, and the Empty the Cellar
 * gate as a REQUIRED_AURA_INACTIVE proof that stays DISABLED while the wire
 * identity is uncorroborated.
 *
 * WHY THE EMPTY THE CELLAR FACT IS LOAD-BEARING. Both hero-tree lists name
 * `empty_the_cellar,if=buff.empty_the_cellar.remains<1.5` (Shado-Pan) or
 * `empty_the_cellar,if=cooldown.celestial_brew.remains>15` (Master of
 * Harmony) and an unconditional `empty_the_cellar` further down. SimC's
 * `buff.<x>.remains` of an INACTIVE buff is 0, so the Shado-Pan gate is TRUE
 * whenever the buff is down, and the action carries no DBC cooldown. Read
 * without its `ready()` override, the entry would look selectable at almost
 * every decision — and an observed Keg Smash or Tiger Palm would look
 * REJECTED in its favour. The override makes it unusable unless its enabling
 * aura is up.
 *
 * WHAT IS NOT CLAIMED. The aura's identity ON THE WIRE. SimulationCraft
 * builds the buff from spell 1262768, and a readiness aura pinned for an
 * earlier specialization is emitted as a DIFFERENT id from the one its module
 * builds. The one committed Brewmaster capture (M11-C2,
 * `wcl-brewmaster-monk-gtkb-opener`) holds no Exploding Keg cast, no Empty
 * the Cellar cast and no aura transition of 1262768, so it corroborates
 * nothing. `wireAuraIdentity` is therefore still `NOT_YET_CORROBORATED`, and
 * a consumer must treat the gate as unusable-when-proven-inactive only after
 * evidence corroborates the id.
 */

/** Measured from the pinned file this milestone read; recorded, never typed from memory. */
export const SC_MONK_CPP_SHA256 = "61dae19dac3135925bafac351bd624a60fb710d01ff1a37802f43a9c68484aad";

/** The pinned commit every Brewmaster dataset of M11-C1 was generated from. */
export const BREWMASTER_READINESS_COMMIT_SHA = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";

/** How these records were established. A human reading C++; weaker than DBC extraction, and labelled. */
export const BREWMASTER_READINESS_METHOD = "HAND_REVIEWED_CPP_READY_OVERRIDE";

const MONK_MODULE = "engine/class_modules/monk/sc_monk.cpp";

export interface BrewmasterReadinessClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

/**
 * What the override requires. Each kind names a DIFFERENT sort of state, and
 * only the first two are facts a consumer could ever bind from committed data.
 */
export type BrewmasterReadinessGate =
  /** `ready()` is false unless the named SimC buff is up. */
  | {
      readonly kind: "REQUIRES_AURA_ACTIVE";
      readonly simcBuffName: string;
      readonly simcBuffSpellId: number;
      readonly wireAuraIdentity: "NOT_YET_CORROBORATED";
    }
  /** `ready()` is false while the named talent is selected: build-static. */
  | { readonly kind: "NOT_READY_WHILE_TALENT_SELECTED"; readonly talentSimcName: string }
  /** `ready()` reads module state no pinned dataset models. */
  | { readonly kind: "REQUIRES_UNMODELLED_MODULE_STATE"; readonly state: string }
  /** The override exists but adds no gate for Brewmaster. */
  | { readonly kind: "NO_BREWMASTER_GATE" };

export interface BrewmasterReadinessFact {
  /** The APL token as the pinned Brewmaster list writes it. */
  readonly simcToken: string;
  /** The records the token executes (the GCD dataset's candidates). */
  readonly executedAbilityGameIds: readonly number[];
  /** The executed records' `_gcd`, from the GCD dataset: 0 means the gate cannot compete for a GCD decision. */
  readonly baseGcdMs: number;
  readonly gate: BrewmasterReadinessGate;
  readonly claims: readonly BrewmasterReadinessClaim[];
}

const claim = (symbol: string, lines: string, text: string): BrewmasterReadinessClaim => ({
  sourcePath: MONK_MODULE,
  sourceSha256: SC_MONK_CPP_SHA256,
  symbol,
  lines,
  claim: text,
});

/** `empty_the_cellar`: usable only while the Empty the Cellar buff is up. */
export const EMPTY_THE_CELLAR_BUFF_SIMC_SPELL_ID = 1262768;
const EMPTY_THE_CELLAR: BrewmasterReadinessFact = {
  simcToken: "empty_the_cellar",
  executedAbilityGameIds: [1263438],
  baseGcdMs: 1000,
  gate: {
    kind: "REQUIRES_AURA_ACTIVE",
    simcBuffName: "empty_the_cellar",
    simcBuffSpellId: EMPTY_THE_CELLAR_BUFF_SIMC_SPELL_ID,
    wireAuraIdentity: "NOT_YET_CORROBORATED",
  },
  claims: [
    claim(
      "empty_the_cellar_t::ready",
      "3447-3450",
      "`bool ready() override { return p()->buff.empty_the_cellar->up(); }` — the whole override. The base " +
        "readiness path is never consulted, so the action is unusable whenever the buff is down, whatever its " +
        "APL gate evaluates to.",
    ),
    claim(
      "monk_t::init_spells; monk_t::create_buffs",
      "5767; 6288-6289",
      "`talent.brewmaster.empty_the_cellar_buff = find_spell( 1262768 )`, and `buff.empty_the_cellar = " +
        'make_buff_fallback( talent.brewmaster.empty_the_cellar->ok(), this, "empty_the_cellar", ' +
        "talent.brewmaster.empty_the_cellar_buff )` — without the talent the buff is a fallback that never " +
        "comes up, so the action is never ready.",
    ),
    claim(
      "exploding_keg_t::execute; empty_the_cellar_t::execute",
      "3400; 3454",
      "The buff is triggered by an Exploding Keg execute and expired by the Empty the Cellar execute: the " +
        "action is usable once per Exploding Keg, in the window between them.",
    ),
  ],
};

/** `tiger_palm`: never ready while Press the Advantage is taken. */
const TIGER_PALM: BrewmasterReadinessFact = {
  simcToken: "tiger_palm",
  executedAbilityGameIds: [100780],
  baseGcdMs: 1500,
  gate: { kind: "NOT_READY_WHILE_TALENT_SELECTED", talentSimcName: "press_the_advantage" },
  claims: [
    claim(
      "tiger_palm_t::ready",
      "848-853",
      "`if ( p()->talent.brewmaster.press_the_advantage->ok() ) return false; return base_t::ready();` — a " +
        "build-static gate. Press the Advantage is the alternative entry of Blackout Combo's choice node, so " +
        "the talent dataset's entry-level resolution decides it.",
    ),
  ],
};

/** `purifying_brew`: ready only while Stagger ticks. NON_GCD, so it never competes for a GCD decision. */
const PURIFYING_BREW: BrewmasterReadinessFact = {
  simcToken: "purifying_brew",
  executedAbilityGameIds: [119582],
  baseGcdMs: 0,
  gate: { kind: "REQUIRES_UNMODELLED_MODULE_STATE", state: 'find_stagger( "Stagger" )->is_ticking()' },
  claims: [
    claim(
      "purifying_brew_t::ready",
      "3497-3502",
      '`if ( p()->find_stagger( "Stagger" )->is_ticking() ) return monk_spell_t::ready(); return false;`. ' +
        "Whether the log's Light/Moderate/Heavy Stagger auras correspond to `is_ticking()` is NOT established " +
        "here (sc_stagger.hpp was not reviewed for it); the gate stays unmodelled.",
    ),
  ],
};

/** `chi_burst`: the override gates Windwalker only. */
const CHI_BURST: BrewmasterReadinessFact = {
  simcToken: "chi_burst",
  executedAbilityGameIds: [123986],
  baseGcdMs: 1500,
  gate: { kind: "NO_BREWMASTER_GATE" },
  claims: [
    claim(
      "chi_burst_t::ready",
      "3036-3043",
      "`if ( p()->specialization() != MONK_WINDWALKER ) return monk_spell_t::ready();` precedes the buff " +
        "check, so the buff gate applies to Windwalker only and a Brewmaster Chi Burst takes the base path.",
    ),
  ],
};

/**
 * Every `ready()` override on an action of the pinned Brewmaster list, in
 * APL-token order. The review read all seventeen `ready(`/`target_ready(`
 * definitions in the pinned module; the remaining ones belong to Windwalker,
 * Conduit of the Celestials, background children or the auto-attack swing,
 * and the shared base `monk_action_t::ready()` (:234-242) only sets
 * `usable_while_casting` for Spinning Crane Kick channels before deferring
 * to the base.
 */
export const BREWMASTER_READINESS_FACTS: readonly BrewmasterReadinessFact[] = [
  CHI_BURST,
  EMPTY_THE_CELLAR,
  PURIFYING_BREW,
  TIGER_PALM,
];

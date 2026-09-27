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
 * THE WIRE IDENTITY, CORROBORATED (M11-C4i). SimulationCraft builds the buff
 * from spell 1262768, and a readiness aura pinned for an earlier
 * specialization was emitted as a DIFFERENT id from the one its module
 * builds, so the SimC id is never assumed to be the wire id. The M11-C2
 * opener held no evidence either way. The M11-C4 extension of the same
 * subject (`wcl-brewmaster-monk-gtkb-rotational-165s.seg-20-165`, committed)
 * holds the whole life cycle SimulationCraft describes, on the wire, under
 * 1262768: an Exploding Keg cast (325153) at 2,438,549 followed by
 * `applybuff 1262768` on the actor at 2,438,567; `removebuff 1262768` at
 * 2,439,541 with the Empty the Cellar cast (1263438) at 2,439,542; and a second
 * Exploding Keg at 2,516,886, `applybuff` at 2,516,900, and an unconsumed
 * `removebuff` at 2,536,906 — 20,006 ms later, the buff's duration. The gate
 * is therefore CORROBORATED under 1262768, and a consumer may read it through
 * M4 presence (still PROVEN_INACTIVE only from an OBSERVED removal).
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
/**
 * Whether committed evidence ties the SimC buff to the id the log emits.
 * Only a CORROBORATED identity may be queried; the SimC id is never a stand-in.
 */
export type BrewmasterWireAuraIdentity =
  | "NOT_YET_CORROBORATED"
  | {
      readonly state: "CORROBORATED";
      readonly wireAuraId: number;
      readonly fixtureId: string;
      readonly observation: string;
    };

export type BrewmasterReadinessGate =
  /** `ready()` is false unless the named SimC buff is up. */
  | {
      readonly kind: "REQUIRES_AURA_ACTIVE";
      readonly simcBuffName: string;
      readonly simcBuffSpellId: number;
      readonly wireAuraIdentity: BrewmasterWireAuraIdentity;
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
    wireAuraIdentity: {
      state: "CORROBORATED",
      wireAuraId: EMPTY_THE_CELLAR_BUFF_SIMC_SPELL_ID,
      fixtureId: "wcl-brewmaster-monk-gtkb-rotational-165s.seg-20-165",
      observation:
        "gtKb2xHn87pNcFfW fight 22, actor 4: Exploding Keg (325153) cast at 2,438,549 -> applybuff 1262768 on the actor at 2,438,567; removebuff 1262768 at 2,439,541 -> Empty the Cellar (1263438) cast at 2,439,542; Exploding Keg at 2,516,886 -> applybuff at 2,516,900 -> removebuff at 2,536,906 with no Empty the Cellar cast (20,006 ms: the expiry). Every 1262768 transition in the committed Brewmaster evidence belongs to one of these two windows.",
    },
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
/**
 * M11-C4i: the READY_OVERRIDE dimension of a positive usability proof, for
 * the four actions it is wired for. A hand review of the pinned module
 * (hash `SC_MONK_CPP_SHA256`) against every `bool ready() override` in it:
 * none of the four action structs, and none of the wrapper templates
 * Blackout Kick is built from, declares one. Every monk action inherits
 * `monk_action_t<Base>::ready()`, which only permits the action while
 * Spinning Crane Kick is being channelled and then defers to
 * `action_t::ready()` — so the remaining readiness is the base checks the
 * other positive-usability dimensions discharge.
 */
export interface BrewmasterNoReadyOverride {
  readonly simcToken: string;
  readonly actionStruct: string;
  readonly claims: readonly BrewmasterReadinessClaim[];
}

const MONK_ACTION_READY = claim(
  "monk_action_t<Base>::ready",
  "234-241",
  "The one ready() every monk action inherits: when the action lists cast-during ids it sets usable_while_casting while Spinning Crane Kick is channelled, then returns base_t::ready(). It only widens readiness; it adds no gate.",
);

export const BREWMASTER_NO_READY_OVERRIDE: readonly BrewmasterNoReadyOverride[] = [
  {
    simcToken: "keg_smash",
    actionStruct: "keg_smash_t",
    claims: [
      claim("keg_smash_t", "2328-2642", "keg_smash_t : monk_melee_attack_t declares no ready() override."),
      MONK_ACTION_READY,
    ],
  },
  {
    simcToken: "blackout_kick",
    actionStruct: "blackout_kick_t",
    claims: [
      claim(
        "blackout_kick_t; overwhelming_force_t; charred_passions_t; teachings_of_the_monastery_t; base_blackout_kick_t",
        "788-833; 1209-1270; 1271-1316; 1318-1365; 1366-1452",
        "blackout_kick_t is overwhelming_force_t<charred_passions_t<teachings_of_the_monastery_t<base_blackout_kick_t>>>; none of the four declares a ready() override (the override at :848 belongs to tiger_palm_t, :834).",
      ),
      MONK_ACTION_READY,
    ],
  },
  {
    simcToken: "breath_of_fire",
    actionStruct: "breath_of_fire_t",
    claims: [
      claim("breath_of_fire_t", "3233-3317", "breath_of_fire_t : monk_spell_t declares no ready() override."),
      MONK_ACTION_READY,
    ],
  },
  {
    simcToken: "invoke_niuzao",
    actionStruct: "niuzao_spell_t",
    claims: [
      claim(
        "niuzao_spell_t",
        "3732-3755",
        "niuzao_spell_t : monk_spell_t declares no ready() override (the override at :3767 belongs to unity_within_t, :3756).",
      ),
      MONK_ACTION_READY,
    ],
  },
];

export const BREWMASTER_READINESS_FACTS: readonly BrewmasterReadinessFact[] = [
  CHI_BURST,
  EMPTY_THE_CELLAR,
  PURIFYING_BREW,
  TIGER_PALM,
];

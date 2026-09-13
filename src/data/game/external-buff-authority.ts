/**
 * The pinned SimulationCraft external-buff configuration, and why an empty pool
 * is an authoritative answer rather than a missing one.
 *
 * WHY THIS IS HAND-WRITTEN AND NOT EXTRACTED
 *
 * Every other pinned artifact in this project parses a generated DBC table. This
 * one cannot: the fact it records is the SHAPE OF AN INITIALIZATION SEQUENCE
 * across three C++ files. No table contains it. So it is written down, labelled
 * as a human's reading, and pinned to measured file hashes — a future commit
 * that changes the sequence changes those hashes and fails the contract test.
 *
 * THE SEQUENCE, END TO END
 *
 * 1. The PRIEST MODULE registers an actor initializer at `INIT_ACTOR_CREATE_BUFFS`
 *    which runs for EVERY player, not only priests:
 *
 *        // Always create PI as it's a commonly simmed external
 *        auto pi_buff = make_buff( p, "power_infusion", p->find_spell( 10060 ) )
 *
 *    (sc_priest.cpp:4546-4570). It is a MODULE-level registration, so it happens
 *    because the Priest module is compiled in — not because a Priest is present.
 *
 * 2. Buffs are created before actions. `sim.cpp:2979` says so in as many words:
 *    "Buffs are created before actions, as typically action constructors tends
 *    to be more customized than buff constructors."
 *
 * 3. `invoke_external_buff_t::init_finished` therefore FINDS the buff. It does
 *    not throw. `use_pool` defaults true and the pinned APL line does not pass
 *    `use_pool=0`, so the pool is consulted.
 *
 * 4. `external_buffs.pool` is a plain `std::string`, value-initialised EMPTY,
 *    set only by the `external_buffs.pool=` option (player.cpp:13485). Neither
 *    the pinned Assassination APL nor the Rogue module sets it.
 *
 * 5. With no pool entry for the buff, SimulationCraft nulls the pointer, in its
 *    own words: "External buffs initialied and buffs not found - set buff to
 *    nullptr, this action will never be used."
 *
 * 6. `ready()` opens with `if ( !buff ) return false;`. Permanently.
 *
 * WHY THIS IS APPLICABLE AND NOT BACKGROUND
 *
 * At no point does `invoke_external_buff_t` set `background = true`. It remains
 * a fully-initialized foreground action that the scan reaches and asks about. So
 * the honest classification is APPLICABLE with a proven-false readiness — not
 * "this action does not exist for this player". The distinction matters: the
 * remedy for the first is configuring an external-buff source, and there is no
 * remedy for the second.
 *
 * WHAT IS EMPHATICALLY NOT EVIDENCE HERE
 *
 * That no Power Infusion was observed in the log. Whether a Priest was in the
 * raid. Those are facts about a historical fight; this is a fact about the
 * authority's configuration. Confusing the two would let raid composition
 * silently change what the authority recommends.
 */

/** How this record was established. Weaker than DBC extraction, and labelled. */
export const EXTERNAL_BUFF_AUTHORITY_METHOD = "HAND_REVIEWED_CPP_INITIALIZATION";

export interface ExternalBuffAuthorityCheck {
  readonly claim: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly finding: string;
}

export interface ExternalBuffAuthority {
  readonly method: typeof EXTERNAL_BUFF_AUTHORITY_METHOD;
  readonly commitSha: string;
  /** The default value of `external_buffs.pool` with no override supplied. */
  readonly defaultPoolIsEmpty: true;
  /** What `ready()` does under that default. Quoted into negative-usability evidence. */
  readonly readyBehaviour: string;
  /** Measured, so a sequence change fails loudly. */
  readonly rogueModuleSha256: string;
  readonly checks: readonly ExternalBuffAuthorityCheck[];
}

const PRIEST_MODULE_SHA256 = "520c2ad3599926a3f8c4a0620c78edd61c006685ae8dd855ccae1b80e00db76d";
const PLAYER_MODULE_SHA256 = "50a804d0f63d7bffd7b9eeb89a6de054b1767c3202133c765b1b893987940a5c";
const SIM_MODULE_SHA256 = "519bd104d02ec675dfbbe7b392ad51f2dcb8e858d6dd860ad5167303ccf574de";

export const EXTERNAL_BUFF_AUTHORITY: ExternalBuffAuthority = {
  method: EXTERNAL_BUFF_AUTHORITY_METHOD,
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  defaultPoolIsEmpty: true,
  readyBehaviour:
    "invoke_external_buff_t nulls its buff pointer at initialization and ready() returns false for the " +
    "rest of the simulation",
  rogueModuleSha256: "209e95265aae4168cf7cda57d1b241dda6361971ba6849a9262bd933bff3e13e",
  checks: [
    {
      claim: "PI_BUFF_IS_REGISTERED_ON_EVERY_PLAYER",
      sourcePath: "engine/class_modules/priest/sc_priest.cpp",
      sourceSha256: PRIEST_MODULE_SHA256,
      finding:
        "sc_priest.cpp:4546-4570 registers an actor initializer at INIT_ACTOR_CREATE_BUFFS that runs for " +
        "every player and creates a buff named 'power_infusion'. Its own comment: 'Always create PI as " +
        "it's a commonly simmed external.' So buff_t::find succeeds and init_finished does not throw.",
    },
    {
      claim: "BUFFS_ARE_CREATED_BEFORE_ACTIONS",
      sourcePath: "engine/sim/sim.cpp",
      sourceSha256: SIM_MODULE_SHA256,
      finding:
        "sim.cpp:2979-2982 registers create_buffs at INIT_ACTOR_CREATE_BUFFS ahead of create_actions, " +
        "with the comment 'Buffs are created before actions'. The buff therefore exists before the APL " +
        "action initializes.",
    },
    {
      claim: "POOL_DEFAULTS_EMPTY_AND_IS_NOT_SET_BY_THE_PINNED_AUTHORITY",
      sourcePath: "engine/player/player.cpp",
      sourceSha256: PLAYER_MODULE_SHA256,
      finding:
        "external_buffs.pool is a value-initialised std::string set only by the 'external_buffs.pool=' " +
        "option (player.cpp:13485). Neither apl_rogue.cpp nor sc_rogue.cpp sets it, so an empty pool is " +
        "the authority's own default rather than a missing input.",
    },
    {
      claim: "EMPTY_POOL_MAKES_READY_PERMANENTLY_FALSE",
      sourcePath: "engine/player/player.cpp",
      sourceSha256: PLAYER_MODULE_SHA256,
      finding:
        "With use_pool true and no pool entry, init_finished sets buff = nullptr — commented 'this " +
        "action will never be used' — and ready() opens with 'if ( !buff ) return false'.",
    },
    {
      claim: "THE_ACTION_IS_NEVER_MARKED_BACKGROUND",
      sourcePath: "engine/player/player.cpp",
      sourceSha256: PLAYER_MODULE_SHA256,
      finding:
        "invoke_external_buff_t assigns background nowhere. It stays a foreground action the scan " +
        "reaches, which is why the verdict is APPLICABLE + proven-unready rather than NOT_APPLICABLE.",
    },
  ],
};

/**
 * The pinned default cooldown-queueing tolerance, in MILLISECONDS.
 *
 * `player_t::cooldown_tolerance()` (player.cpp:14335) returns the per-player
 * override when set and `sim->default_cooldown_tolerance` otherwise; that
 * default is 250 ms (sim.cpp:1426). Both are configurable options, and neither
 * the pinned Rogue module nor the pinned APL overrides either — so 250 ms is the
 * authority's own answer for this profile.
 *
 * Exported as a NAMED authority fact rather than inlined in the readiness bridge,
 * because it is a configuration value that a different profile could legitimately
 * change. A bridge with 250 baked in would silently outlive that change.
 */
export const PINNED_DEFAULT_COOLDOWN_TOLERANCE_MS = 250;

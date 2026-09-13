/**
 * Why `stealthed.rogue = TRUE` is, by itself, a proof that `default[0] stealth`
 * could not have fired.
 *
 * THE CHEAPEST PROOF IN THE MILESTONE, AND WHY IT IS EXACT
 *
 * SimulationCraft guards the Stealth action with:
 *
 *     bool stealth_t::ready() override {
 *       if ( p()->stealthed( STEALTH_BASIC | STEALTH_ROGUE ) )
 *         return false;                                    // sc_rogue.cpp:6086
 *
 * and resolves the APL expression `stealthed.rogue` with:
 *
 *     return stealthed( STEALTH_BASIC | STEALTH_ROGUE );   // sc_rogue.cpp:9661
 *
 * The MASK IS THE SAME ONE, character for character. Not an equivalent mask, not
 * a superset — the identical expression, passed to the identical function. So
 * the two questions are not merely correlated, they are the same question:
 *
 *     stealthed.rogue == TRUE   <=>   stealth_t::ready() == false
 *
 * M5-C2 already established `stealthed.rogue = TRUE` at the analysed decision
 * point, from observed aura evidence. That fact is therefore ALSO a readiness
 * proof, and no new combat state, no cooldown model and no extra observation is
 * needed to use it that way.
 *
 * WHAT THIS RECORD IS FOR
 *
 * The equivalence is the whole load-bearing claim, and it lives in C++ that no
 * table contains. So it is written down, labelled as a human's reading, and
 * pinned to the measured hash of the file both readings come from. A future
 * commit that changes either mask changes that hash and fails the contract test.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM
 *
 * That Stealth is unusable in general — only under a proven-TRUE
 * `stealthed.rogue`. An UNKNOWN stealth state proves nothing here and must
 * produce UNKNOWN usability, because `ready()` has further guards below the one
 * quoted above and this record models none of them.
 *
 * It also claims nothing about what Stealth would DO if it fired. It cannot
 * fire, so there is no transition to model, and M5-C3c3a deliberately models
 * none.
 */

/** How this record was established. Weaker than DBC extraction, and labelled. */
export const STEALTH_READINESS_METHOD = "HAND_REVIEWED_CPP_MASK_EQUIVALENCE";

export interface StealthReadinessCheck {
  readonly claim: string;
  readonly symbol: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly finding: string;
}

export interface StealthReadinessAuthority {
  readonly method: typeof STEALTH_READINESS_METHOD;
  readonly commitSha: string;
  readonly sourcePath: string;
  /** Measured, so a change to either mask fails loudly. */
  readonly sourceSha256: string;
  /**
   * The mask expression BOTH sites pass, verbatim.
   *
   * A single string rather than two, because the claim is that there is only
   * one. Two fields would make a future drift between them expressible.
   */
  readonly sharedMaskExpression: string;
  /** The SimulationCraft mask bits the shared expression expands to. */
  readonly sharedMaskBits: readonly string[];
  readonly checks: readonly StealthReadinessCheck[];
}

export const STEALTH_READINESS_AUTHORITY: StealthReadinessAuthority = {
  method: STEALTH_READINESS_METHOD,
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/class_modules/sc_rogue.cpp",
  sourceSha256: "209e95265aae4168cf7cda57d1b241dda6361971ba6849a9262bd933bff3e13e",
  sharedMaskExpression: "STEALTH_BASIC | STEALTH_ROGUE",
  sharedMaskBits: ["STEALTH_NORMAL", "STEALTH_VANISH", "STEALTH_SUBTERFUGE", "STEALTH_SHADOW_DANCE"],
  checks: [
    {
      claim: "STEALTH_READY_IS_GUARDED_ON_THE_MASK",
      symbol: "stealth_t::ready",
      startLine: 6084,
      endLine: 6087,
      finding:
        "stealth_t::ready opens with 'if ( p()->stealthed( STEALTH_BASIC | STEALTH_ROGUE ) ) return false;'. " +
        "It is the FIRST statement, so no other condition can rescue the action once the mask matches.",
    },
    {
      claim: "STEALTHED_ROGUE_EXPRESSION_USES_THE_SAME_MASK",
      symbol: "rogue_t::create_expression, stealthed.rogue",
      startLine: 9658,
      endLine: 9663,
      finding:
        "The 'stealthed.rogue' branch returns stealthed( STEALTH_BASIC | STEALTH_ROGUE ) — the identical " +
        "argument passed to the identical function. The APL expression and the readiness guard are the " +
        "same query.",
    },
    {
      claim: "THE_MASK_EXPANDS_TO_FOUR_BITS",
      symbol: "stealth_type_e",
      startLine: 34,
      endLine: 50,
      finding:
        "STEALTH_BASIC = ( STEALTH_NORMAL | STEALTH_VANISH ) and STEALTH_ROGUE = ( STEALTH_SUBTERFUGE | " +
        "STEALTH_SHADOW_DANCE ). Shadowmeld and Improved Garrote are NOT in the union, which is why an " +
        "Improved Garrote aura alone can never make Stealth unready.",
    },
    {
      claim: "STEALTHED_CHECKS_BUFFS_NOT_COOLDOWNS",
      symbol: "rogue_t::stealthed",
      startLine: 11731,
      endLine: 11754,
      finding:
        "rogue_t::stealthed tests buff presence bit by bit and reads no cooldown, no resource and no " +
        "target state. So the equivalence holds regardless of Stealth's own cooldown, which this record " +
        "therefore does not model.",
    },
    {
      claim: "THE_ACTION_IS_NEVER_MARKED_BACKGROUND",
      symbol: "stealth_t::stealth_t",
      startLine: 6061,
      endLine: 6069,
      finding:
        "stealth_t's constructor assigns harmful = false and a self target, and never sets background. " +
        "The entry stays a foreground action the scan reaches, which is why the verdict is APPLICABLE " +
        "plus proven-unusable rather than NOT_APPLICABLE.",
    },
  ],
};

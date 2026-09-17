/**
 * Execution lane — does performing this action consume the player's rotational
 * GCD slot?
 *
 * THE PINNED PREDICATE, AND NOTHING ELSE
 *
 * SimulationCraft partitions executed foreground actions with exactly one test:
 *
 *     player.cpp:7397   if ( action->trigger_gcd > timespan_t::zero() )
 *                         prev_gcd_actions.push_back( action );
 *                       else
 *                         off_gcdactions.push_back( action );
 *
 * For a spell-backed action `trigger_gcd` is `spell_data_t::_gcd` in
 * milliseconds (`action.cpp:645`). So the lane is `baseGcdMs > 0`, and this
 * module computes precisely that. It models no haste, no cooldown, no charges
 * and no readiness.
 *
 * WHY BASE GCD IS ENOUGH FOR THE LANE, THOUGH NOT FOR THE DURATION
 *
 * `action_t::gcd()` returns zero the instant `trigger_gcd` is zero
 * (`action.cpp:1278`), before any modifier runs. Every modifier downstream is
 * either multiplicative on a non-zero base (haste), a floor that only raises
 * (`min_gcd`), or explicitly guarded on `!= zero`. The Rogue module's own
 * override is guarded the same way (`sc_rogue.cpp:2303`) and caps at 200ms off a
 * 1000ms base. `parse_effects`' GCD path — the one engine route that scales a
 * GCD from an aura — also early-returns on zero (`parse_effects.hpp:1114`) and
 * is not used by the Rogue module at all.
 *
 * So for this supported slice the zero/non-zero split is invariant under runtime
 * state, which is what makes a static table sound. Haste turning 1.0s into 0.8s
 * changes the DURATION and not the LANE, and this module deliberately cannot
 * express the duration.
 *
 * A TOKEN IS NOT A SPELL
 *
 * `thistle_tea` binds through a talent branch (`sc_rogue.cpp:10237`), so the
 * token reaches two different spell records. The lane of a TOKEN is therefore
 * only established when every reachable candidate agrees. If they disagreed, or
 * if the binding is absent, the answer is `UNKNOWN_LANE` — never a guess at
 * which talent branch was taken.
 *
 * The two halves have DIFFERENT provenance, and the artifact says so:
 *
 *     token    -> candidate spell ids   HAND_REVIEWED_CPP_CONTROL_FLOW
 *     spell id -> baseGcdMs             MACHINE_EXTRACTED_DBC_RECORD
 *
 * Nothing in this project parses C++. The binding half is a human reading
 * `sc_rogue.cpp`, recorded with the file's measured hash and a line range so the
 * reading can be re-checked; the generator verifies only that each id the
 * reading names is a real record in the machine-extracted table.
 *
 * SOME TOKENS ARE NOT SPELLS AT ALL
 *
 * `potion`, `use_item`, `use_items` and `invoke_external_buff` have no DBC row,
 * so `_gcd` cannot answer the question for them even in principle. Their
 * `trigger_gcd` is assigned literally in a C++ constructor, and M5-C3c3a records
 * those four readings in a THIRD artifact section with its own method:
 *
 *     token    -> candidate spell ids   HAND_REVIEWED_CPP_CONTROL_FLOW
 *     spell id -> baseGcdMs             MACHINE_EXTRACTED_DBC_RECORD
 *     token    -> trigger_gcd           HAND_REVIEWED_CPP_TRIGGER_GCD
 *
 * The predicate is the same in both cases — milliseconds, `> 0` — so there is
 * still exactly one lane rule. What differs is the evidence behind the number,
 * and the validator refuses any token that carries both kinds.
 *
 * `use_off_gcd=1` IS NOT THE LANE, AND MUST NEVER BE READ AS IT
 *
 * That option ADDS an action to a list — `off_gcd_actions.push_back( action )`
 * (player.cpp:4340-4342), a push_back that erases nothing — for a separate
 * polling pass that `select_action` reaches only through
 * `execute_type::OFF_GCD`, which is set solely while a GCD is already running
 * (action.cpp:301-306). The action stays in `foreground_action_list` either way.
 * So `use_off_gcd` describes an EXTRA scheduling opportunity, never the lane,
 * and nothing in this module reads it.
 *
 * A TOKEN WITH NO BINDING HAS NO LANE
 *
 * Most SimulationCraft tokens are absent from this dataset entirely. They
 * resolve to `UNKNOWN`, and therefore to `UNKNOWN_LANE`. Being a structurally
 * ordinary APL entry confers nothing here.
 *
 * UNKNOWN_LANE IS NOT A LANE
 *
 * There is no default. An ability this dataset does not carry resolves to
 * `UNKNOWN_LANE`, which must never be read as "off the GCD" or as "on the GCD".
 * Absence of a record is absence of knowledge.
 */

import artifact from "./rogue-gcd-semantics.json";
import {
  baseGcdMsForAbilityIn,
  executionLaneForAbilityIn,
  executionLaneForTokenIn,
  invariantLaneAcrossIn,
  loadGcdSemantics,
  metaActionLaneProvenanceIn,
  metaActionLaneRecordIn,
  resolveTokenBindingIn,
  type ExecutionLane,
  type GcdSemanticsLoad,
  type LoadedGcdSemantics,
  type TokenBinding,
} from "./gcd-semantics-index.js";
import type { MetaActionLaneProvenance, MetaActionLaneRecord } from "./gcd-semantics-artifact.js";

/**
 * THE ROGUE BINDING OF THE CLASS-NEUTRAL INDEX (M10-C).
 *
 * The lane rule, the token-invariance rule and the meta-action rule moved to
 * `gcd-semantics-index.ts` so a second specialization can apply the identical
 * rule over its own artifact. This module is that rule bound to the Rogue
 * dataset, memoised exactly as before, with every export it had. Nothing a
 * Rogue caller sees has changed.
 */

export {
  EXECUTION_LANES,
  laneForBaseGcdMs,
  type ExecutionLane,
  type GcdSemanticsLoad,
  type TokenBinding,
} from "./gcd-semantics-index.js";

let cached: LoadedGcdSemantics | null = null;

function load(): LoadedGcdSemantics {
  cached ??= loadGcdSemantics(artifact);
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedRogueGcdSemantics(): GcdSemanticsLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetGcdSemanticsCache(): void {
  cached = null;
}

/**
 * The base GCD of one ability, by NUMBER.
 *
 * `null` means this dataset carries no record for that id. It does not mean the
 * ability has no GCD, and a caller must not read it as one.
 */
export function baseGcdMsForAbility(abilityGameId: number): number | null {
  return baseGcdMsForAbilityIn(load().index, abilityGameId);
}

/**
 * The execution lane of one ability, by NUMBER.
 *
 * Never takes a name. Warcraft Logs ability names are localized, nullable, and
 * not unique — this very dataset carries two distinct spells both named
 * "Thistle Tea" — so a name could not identify a record even in principle.
 */
export function executionLaneForAbility(abilityGameId: number): ExecutionLane {
  return executionLaneForAbilityIn(load().index, abilityGameId);
}

/** What the pinned sources establish about a SimulationCraft token's identity. */
export function resolveTokenBinding(simcToken: string): TokenBinding {
  return resolveTokenBindingIn(load().index, simcToken);
}

/**
 * The hand-reviewed `trigger_gcd` reading for a token with no DBC row.
 *
 * `null` for every ordinary spell-backed token, which is the common case. A
 * caller must not read `null` as "no meta record, therefore NON_GCD" — it means
 * this section has nothing to say, and the spell-id path answers instead.
 */
export function metaActionLaneRecordFor(simcToken: string): MetaActionLaneRecord | null {
  return metaActionLaneRecordIn(load().index, simcToken);
}

/** The provenance behind a meta-action lane, or `null` when there is none. */
export function metaActionLaneProvenanceFor(simcToken: string): MetaActionLaneProvenance | null {
  return metaActionLaneProvenanceIn(load().index, simcToken);
}

/**
 * The execution lane of a TOKEN, proven only when every candidate agrees.
 *
 * This is the invariance rule that lets `thistle_tea` have a lane at all without
 * anyone deciding which talent was taken: both records it can reach are zero, so
 * the lane holds under either resolution. One disagreeing candidate collapses the
 * answer to `UNKNOWN_LANE`, because then the lane genuinely depends on state this
 * build does not establish.
 */
export function executionLaneForToken(simcToken: string): ExecutionLane {
  return executionLaneForTokenIn(load().index, simcToken);
}

/**
 * The invariant lane of an ARBITRARY candidate set.
 *
 * Exported so the agreement rule itself is testable against a synthetic set that
 * disagrees, without needing a pinned dataset that contains one.
 */
export function invariantLaneAcross(abilityGameIds: readonly number[]): ExecutionLane {
  return invariantLaneAcrossIn(load().index, abilityGameIds);
}

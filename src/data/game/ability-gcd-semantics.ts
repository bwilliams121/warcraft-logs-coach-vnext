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
 * A TOKEN WITH NO BINDING HAS NO LANE
 *
 * Most SimulationCraft tokens are absent from this dataset, including ones that
 * are not spells at all — `potion`, `use_item`, `invoke_external_buff`. They
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
  validateGcdSemanticsArtifact,
  type AbilityGcdRecord,
  type GcdSemanticsArtifact,
  type TokenBindingProvenance,
  type TokenBindingRecord,
} from "./gcd-semantics-artifact.js";

/**
 * Whether performing an action consumes the rotational GCD slot.
 *
 * Three members, and the third is a refusal rather than a value. Nothing may
 * collapse `UNKNOWN_LANE` into either of the other two.
 */
export type ExecutionLane = "GCD_CONSUMING" | "NON_GCD" | "UNKNOWN_LANE";

export const EXECUTION_LANES = [
  "GCD_CONSUMING",
  "NON_GCD",
  "UNKNOWN_LANE",
] as const satisfies readonly ExecutionLane[];

/**
 * The lane of a known base GCD.
 *
 * Takes a number that was actually read from the dataset, so there is no way to
 * ask this question about an ability we have no record for — that path returns
 * `UNKNOWN_LANE` at the lookup, not here.
 */
export function laneForBaseGcdMs(baseGcdMs: number): Extract<ExecutionLane, "GCD_CONSUMING" | "NON_GCD"> {
  return baseGcdMs > 0 ? "GCD_CONSUMING" : "NON_GCD";
}

/**
 * What a SimulationCraft token is known to bind to.
 *
 * `KNOWN_SET` is a real answer, not a degraded one: it says we know exactly
 * which records the token can reach and that there is more than one. It is kept
 * distinct from `KNOWN_ONE` so a caller cannot treat a two-branch binding as a
 * settled single identity.
 */
export type TokenBinding =
  | {
      readonly kind: "KNOWN_ONE";
      readonly abilityGameId: number;
      /** How a human established this, and from which pinned bytes. */
      readonly provenance: TokenBindingProvenance;
    }
  | {
      readonly kind: "KNOWN_SET";
      readonly abilityGameIds: readonly number[];
      readonly provenance: TokenBindingProvenance;
    }
  | { readonly kind: "UNKNOWN"; readonly simcToken: string };

export type GcdSemanticsLoad =
  | { readonly ok: true; readonly artifact: GcdSemanticsArtifact }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

interface LoadedIndex {
  readonly artifact: GcdSemanticsArtifact;
  readonly byAbilityId: ReadonlyMap<number, AbilityGcdRecord>;
  readonly byToken: ReadonlyMap<string, TokenBindingRecord>;
}

let cached: { readonly load: GcdSemanticsLoad; readonly index: LoadedIndex | null } | null = null;

function load(): { readonly load: GcdSemanticsLoad; readonly index: LoadedIndex | null } {
  if (cached !== null) return cached;

  const validation = validateGcdSemanticsArtifact(artifact);
  if (!validation.ok) {
    cached = { load: { ok: false, reason: validation.reason, detail: validation.detail }, index: null };
    return cached;
  }

  const byAbilityId = new Map<number, AbilityGcdRecord>();
  for (const record of validation.artifact.abilities) {
    byAbilityId.set(record.abilityGameId, record);
  }
  const byToken = new Map<string, TokenBindingRecord>();
  for (const binding of validation.artifact.tokenBindings) {
    byToken.set(binding.simcToken, binding);
  }

  cached = {
    load: { ok: true, artifact: validation.artifact },
    index: { artifact: validation.artifact, byAbilityId, byToken },
  };
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
  return load().index?.byAbilityId.get(abilityGameId)?.baseGcdMs ?? null;
}

/**
 * The execution lane of one ability, by NUMBER.
 *
 * Never takes a name. Warcraft Logs ability names are localized, nullable, and
 * not unique — this very dataset carries two distinct spells both named
 * "Thistle Tea" — so a name could not identify a record even in principle.
 */
export function executionLaneForAbility(abilityGameId: number): ExecutionLane {
  const baseGcdMs = baseGcdMsForAbility(abilityGameId);
  return baseGcdMs === null ? "UNKNOWN_LANE" : laneForBaseGcdMs(baseGcdMs);
}

/** What the pinned sources establish about a SimulationCraft token's identity. */
export function resolveTokenBinding(simcToken: string): TokenBinding {
  const binding = load().index?.byToken.get(simcToken);
  if (binding === undefined) return { kind: "UNKNOWN", simcToken };
  const ids = binding.candidateAbilityGameIds;
  const only = ids.length === 1 ? ids[0] : undefined;
  if (only !== undefined) {
    return { kind: "KNOWN_ONE", abilityGameId: only, provenance: binding.binding };
  }
  return { kind: "KNOWN_SET", abilityGameIds: ids, provenance: binding.binding };
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
  const binding = resolveTokenBinding(simcToken);
  if (binding.kind === "UNKNOWN") return "UNKNOWN_LANE";

  const ids = binding.kind === "KNOWN_ONE" ? [binding.abilityGameId] : binding.abilityGameIds;
  let settled: ExecutionLane | null = null;
  for (const abilityGameId of ids) {
    const lane = executionLaneForAbility(abilityGameId);
    if (lane === "UNKNOWN_LANE") return "UNKNOWN_LANE";
    if (settled === null) {
      settled = lane;
      continue;
    }
    if (settled !== lane) return "UNKNOWN_LANE";
  }
  return settled ?? "UNKNOWN_LANE";
}

/**
 * The invariant lane of an ARBITRARY candidate set.
 *
 * Exported so the agreement rule itself is testable against a synthetic set that
 * disagrees, without needing a pinned dataset that contains one.
 */
export function invariantLaneAcross(abilityGameIds: readonly number[]): ExecutionLane {
  if (abilityGameIds.length === 0) return "UNKNOWN_LANE";
  let settled: ExecutionLane | null = null;
  for (const abilityGameId of abilityGameIds) {
    const lane = executionLaneForAbility(abilityGameId);
    if (lane === "UNKNOWN_LANE") return "UNKNOWN_LANE";
    if (settled !== null && settled !== lane) return "UNKNOWN_LANE";
    settled = lane;
  }
  return settled ?? "UNKNOWN_LANE";
}

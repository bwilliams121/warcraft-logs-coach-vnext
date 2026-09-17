/**
 * The class-neutral GCD-semantics index (M10-C).
 *
 * `ability-gcd-semantics.ts` bound the lane rule to ONE committed artifact —
 * the Rogue dataset — through a module-level cache. The rule itself never
 * named a class: `baseGcdMs > 0`, token-lane invariance across every reachable
 * candidate, and the meta-action lane for tokens no DBC row backs. A second
 * specialization needs the identical rule over its OWN artifact, so the rule
 * lives here, over an index a caller builds from whichever validated artifact
 * it owns. The Rogue module now wraps this over its dataset; the Paladin
 * module wraps it over its own. Neither imports the other's data.
 *
 * Every lane statement below is the pinned predicate from
 * `ability-gcd-semantics.ts`'s header and nothing more. See that header for
 * why the zero/non-zero split is invariant under runtime state, why a token's
 * lane needs every candidate to agree, and why `use_off_gcd` is never read.
 */

import {
  validateGcdSemanticsArtifact,
  type AbilityGcdRecord,
  type GcdSemanticsArtifact,
  type MetaActionLaneProvenance,
  type MetaActionLaneRecord,
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

export interface GcdSemanticsIndex {
  readonly artifact: GcdSemanticsArtifact;
  readonly byAbilityId: ReadonlyMap<number, AbilityGcdRecord>;
  readonly byToken: ReadonlyMap<string, TokenBindingRecord>;
  readonly byMetaToken: ReadonlyMap<string, MetaActionLaneRecord>;
}

export interface LoadedGcdSemantics {
  readonly load: GcdSemanticsLoad;
  /** `null` exactly when `load.ok` is false. */
  readonly index: GcdSemanticsIndex | null;
}

/**
 * Validates one artifact and indexes it. Pure: no cache, no module state. A
 * caller that wants memoisation owns it (and its test seam) itself.
 */
export function loadGcdSemantics(rawArtifact: unknown): LoadedGcdSemantics {
  const validation = validateGcdSemanticsArtifact(rawArtifact);
  if (!validation.ok) {
    return { load: { ok: false, reason: validation.reason, detail: validation.detail }, index: null };
  }

  const byAbilityId = new Map<number, AbilityGcdRecord>();
  for (const record of validation.artifact.abilities) {
    byAbilityId.set(record.abilityGameId, record);
  }
  const byToken = new Map<string, TokenBindingRecord>();
  for (const binding of validation.artifact.tokenBindings) {
    byToken.set(binding.simcToken, binding);
  }
  const byMetaToken = new Map<string, MetaActionLaneRecord>();
  for (const meta of validation.artifact.metaActionLanes) {
    byMetaToken.set(meta.simcToken, meta);
  }

  return {
    load: { ok: true, artifact: validation.artifact },
    index: { artifact: validation.artifact, byAbilityId, byToken, byMetaToken },
  };
}

/**
 * The base GCD of one ability, by NUMBER.
 *
 * `null` means this dataset carries no record for that id. It does not mean the
 * ability has no GCD, and a caller must not read it as one.
 */
export function baseGcdMsForAbilityIn(index: GcdSemanticsIndex | null, abilityGameId: number): number | null {
  return index?.byAbilityId.get(abilityGameId)?.baseGcdMs ?? null;
}

/**
 * The execution lane of one ability, by NUMBER.
 *
 * Never takes a name. Warcraft Logs ability names are localized, nullable, and
 * not unique, so a name could not identify a record even in principle.
 */
export function executionLaneForAbilityIn(
  index: GcdSemanticsIndex | null,
  abilityGameId: number,
): ExecutionLane {
  const baseGcdMs = baseGcdMsForAbilityIn(index, abilityGameId);
  return baseGcdMs === null ? "UNKNOWN_LANE" : laneForBaseGcdMs(baseGcdMs);
}

/** What the pinned sources establish about a SimulationCraft token's identity. */
export function resolveTokenBindingIn(index: GcdSemanticsIndex | null, simcToken: string): TokenBinding {
  const binding = index?.byToken.get(simcToken);
  if (binding === undefined) return { kind: "UNKNOWN", simcToken };
  const ids = binding.candidateAbilityGameIds;
  const only = ids.length === 1 ? ids[0] : undefined;
  if (only !== undefined) {
    return { kind: "KNOWN_ONE", abilityGameId: only, provenance: binding.binding };
  }
  return { kind: "KNOWN_SET", abilityGameIds: ids, provenance: binding.binding };
}

/**
 * The hand-reviewed `trigger_gcd` reading for a token with no DBC row.
 *
 * `null` for every ordinary spell-backed token, which is the common case. A
 * caller must not read `null` as "no meta record, therefore NON_GCD" — it means
 * this section has nothing to say, and the spell-id path answers instead.
 */
export function metaActionLaneRecordIn(
  index: GcdSemanticsIndex | null,
  simcToken: string,
): MetaActionLaneRecord | null {
  return index?.byMetaToken.get(simcToken) ?? null;
}

/** The provenance behind a meta-action lane, or `null` when there is none. */
export function metaActionLaneProvenanceIn(
  index: GcdSemanticsIndex | null,
  simcToken: string,
): MetaActionLaneProvenance | null {
  return metaActionLaneRecordIn(index, simcToken)?.binding ?? null;
}

/**
 * The execution lane of a TOKEN, proven only when every candidate agrees.
 *
 * The invariance rule: a token whose reachable records all share a lane has
 * that lane without anyone deciding which record executes. One disagreeing
 * candidate collapses the answer to `UNKNOWN_LANE`, because then the lane
 * genuinely depends on state this build does not establish.
 */
export function executionLaneForTokenIn(index: GcdSemanticsIndex | null, simcToken: string): ExecutionLane {
  const binding = resolveTokenBindingIn(index, simcToken);
  if (binding.kind === "UNKNOWN") {
    // No spell-id binding. The token may still be a META ACTION, whose lane is a
    // hand-reviewed `trigger_gcd` rather than a DBC `_gcd`. Same field semantics,
    // same units, same `> 0` predicate — different evidence, and the artifact
    // validator guarantees a token cannot be in both places.
    const meta = metaActionLaneRecordIn(index, simcToken);
    return meta === null ? "UNKNOWN_LANE" : laneForBaseGcdMs(meta.triggerGcdMs);
  }

  const ids = binding.kind === "KNOWN_ONE" ? [binding.abilityGameId] : binding.abilityGameIds;
  return invariantLaneAcrossIn(index, ids);
}

/**
 * The invariant lane of an ARBITRARY candidate set.
 *
 * Exported so the agreement rule itself is testable against a synthetic set that
 * disagrees, without needing a pinned dataset that contains one.
 */
export function invariantLaneAcrossIn(
  index: GcdSemanticsIndex | null,
  abilityGameIds: readonly number[],
): ExecutionLane {
  if (abilityGameIds.length === 0) return "UNKNOWN_LANE";
  let settled: ExecutionLane | null = null;
  for (const abilityGameId of abilityGameIds) {
    const lane = executionLaneForAbilityIn(index, abilityGameId);
    if (lane === "UNKNOWN_LANE") return "UNKNOWN_LANE";
    if (settled !== null && settled !== lane) return "UNKNOWN_LANE";
    settled = lane;
  }
  return settled ?? "UNKNOWN_LANE";
}

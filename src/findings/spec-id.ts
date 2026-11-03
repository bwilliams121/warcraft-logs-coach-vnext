/**
 * Specialization identity — what this build KNOWS versus what it PUBLISHES.
 *
 * TWO DIFFERENT QUESTIONS, KEPT APART BY CONSTRUCTION
 *
 *     SpecId          every specialization this build has an internal name for
 *     PublicSpecId    the subset a public transport may name as its own
 *
 * Until M10-A the two were the same one-member union, and a compile-time guard
 * in the public contract forced every `SpecId` into the public enum. That was
 * correct while there was one specialization, and it is exactly wrong for a
 * second one being built behind the public surface: the internal name must
 * exist so the architecture can be exercised, and it must NOT be publishable
 * until its evaluator is real, registered and activated. Protection Paladin
 * lived in the internal-only half from M10-A through M10-C and moved to the
 * public half in M10-D.
 *
 * So the vocabulary is partitioned, and the partition is checked twice:
 *
 *   - at compile time, below, so the union of the two sets IS `SpecId` and the
 *     sets share no member
 *   - at runtime, by `tests/contracts/m10a-spec-partition.test.ts`, over the
 *     exported arrays, so a rebuilt array cannot drift from the type
 *
 * WHAT `INTERNAL_ONLY` MEANS, AND WHAT IT DOES NOT
 *
 * An internal-only id is a name the engine may use in registrations, findings
 * and tests. It says nothing about support: an internal-only specialization
 * remains `SPEC_NOT_SUPPORTED` on every public path because the identity table
 * (`src/services/spec-identity.ts`) does not resolve to it and no PUBLIC
 * analyzer is registered for it.
 *
 * THE INTERNAL-ONLY SET IS EMPTY AGAIN SINCE M13-F, which promoted Augmentation
 * Evoker (it held that one member from M13-E). Before that it held one member from M11-C2. It was empty
 * from M10-D (Protection public) until M11-A4 (Retribution arrived internal),
 * empty again from M11-A5 until M11-B2 (Blood Death Knight arrived internal),
 * and empty again from M11-B12 (Blood moved to the public half after ten
 * measurement slices and the M11-B11 promotion-readiness audit) until M11-C2,
 * when Brewmaster Monk arrived here first, as all three of its predecessors
 * did. The partition, the narrowing boundary and the registry's exposure
 * rules are live over that one member, and the compile-time proofs below hold
 * over any number of members, including none.
 *
 * THE NARROWING BOUNDARY, AND WHY IT THROWS
 *
 * `specId: null` on a public document already has a meaning: the request did
 * not resolve to a publicly supported analyzer. It must not acquire a second
 * one — "an analyzer ran internally but its name is hidden". So there is no
 * helper here that maps an internal id to `null`. A public projector narrows
 * through `requirePublicSpecId`, and an internal-only id reaching it is an
 * orchestration defect that fails closed as an error, never as a quieter
 * document.
 */

/** Every specialization this build has an internal name for. */
export type SpecId =
  | "rogue/assassination"
  | "paladin/protection"
  | "paladin/retribution"
  | "deathknight/blood"
  | "monk/brewmaster"
  | "evoker/augmentation";

export const SPEC_IDS = Object.freeze([
  "rogue/assassination",
  "paladin/protection",
  "paladin/retribution",
  "deathknight/blood",
  "monk/brewmaster",
  "evoker/augmentation",
] as const satisfies readonly SpecId[]);

/** The specializations a public transport may name. */
export const PUBLIC_SPEC_IDS = Object.freeze([
  "rogue/assassination",
  "paladin/protection",
  "paladin/retribution",
  "deathknight/blood",
  "monk/brewmaster",
  "evoker/augmentation",
] as const satisfies readonly SpecId[]);

export type PublicSpecId = (typeof PUBLIC_SPEC_IDS)[number];

/**
 * Known internally, never named publicly.
 *
 * Protection Paladin arrived here in M10-A as an ARCHITECTURE PROOF id and
 * moved to `PUBLIC_SPEC_IDS` in M10-D, when its analyzer was activated. That
 * move was one reviewed edit to five places that must agree: this partition,
 * the public contract's own `specId` enum, the identity table, the
 * `satisfies` on the specialization's id constant, and the registration's
 * exposure.
 *
 * Retribution Paladin arrived here in M11-A4 as the first M11 analyzer: a
 * real, registered, INTERNAL_ONLY evaluator of one bounded slice (observed
 * Holy Power spender decisions), reachable only through the internal
 * lookup and the test/corpus seams. M11-A5 moved it to `PUBLIC_SPEC_IDS` by
 * the same five-site edit after the test-owned promotion evidence gate
 * reported real MATCH and REJECTED evidence for it. The slice it publishes
 * is exactly the slice it had: promotion changed reachability, not the
 * analyzer.
 *
 * Blood Death Knight arrived here in M11-B2 as the representative vertical
 * slice for the `run_action_list` dispatch cohort: a real, registered,
 * INTERNAL_ONLY evaluator whose purpose was MEASUREMENT — where the shared
 * engine's traversal of a dispatch-heavy tank authority stops, and on which
 * atom. Ten slices (M11-B2 … M11-B10) made that measurement an evidence-backed
 * decision surface, and M11-B12 moved the id to `PUBLIC_SPEC_IDS` by the same
 * five-site edit after the test-owned promotion evidence gate reported real
 * MATCH and REJECTED evidence for it. Promotion changed REACHABILITY, not the
 * analyzer: the slice it publishes is exactly the slice it had, narrowed by
 * one PUBLIC validation gate (San'layn hero tree — see the Blood module).
 *
 * Brewmaster Monk arrived here in M11-C2 as the representative slice of the
 * next cohort: a real, registered, INTERNAL_ONLY evaluator whose purpose is
 * MEASUREMENT — where the shared engine's traversal of a hero-tree-dispatched
 * tank authority with brew and Energy state stops, and on which atom. Slices
 * M11-C3a … M11-C4i made that measurement an evidence-backed decision surface
 * over two independent subjects, and M11-C4j moved the id to
 * `PUBLIC_SPEC_IDS` by the same five-site edit after the global observation
 * and discrimination gates reported real MATCH and real REJECTED evidence for
 * it. Promotion changed REACHABILITY, not the analyzer: the slice it publishes
 * is exactly the slice it had, narrowed by one PUBLIC validation gate
 * (Shado-Pan hero tree — see the Brewmaster module). The set was empty again
 * from M11-C4j until M13-E.
 *
 * Augmentation Evoker arrived here in M13-E as the first registration that
 * binds NO decision authority: its declared families, SUPPORT_TARGETING and
 * SUPPORT_TIMING, are provider-less (`authority-domain.ts`), so every
 * analysis it returns is AUTHORITY_NOT_AVAILABLE (or INSUFFICIENT_EVIDENCE)
 * carrying its observable support facts, never ANALYZED. It is registered so
 * its FULL_RAID requirement is derived like every other analyzer's. M13-F
 * moved it to `PUBLIC_SPEC_IDS` by the same five-site edit, together with the
 * reviewed public shape of those facts (`supportObservations`). It is the
 * first public row that is never ANALYZED, so the decision-evidence promotion
 * gates do not apply to it: it publishes no decision. The set is empty again.
 */
export const INTERNAL_ONLY_SPEC_IDS = Object.freeze([] as const satisfies readonly SpecId[]);

export type InternalOnlySpecId = (typeof INTERNAL_ONLY_SPEC_IDS)[number];

// ---------------------------------------------------------------------------
// Compile-time partition proof
// ---------------------------------------------------------------------------

type Listed = PublicSpecId | InternalOnlySpecId;
/** Fails when a `SpecId` exists that neither set lists. */
const _everySpecIdIsPartitioned: [Exclude<SpecId, Listed>] extends [never] ? true : never = true;
void _everySpecIdIsPartitioned;
/** Fails when the two sets share a member. */
const _partitionIsDisjoint: [PublicSpecId & InternalOnlySpecId] extends [never] ? true : never = true;
void _partitionIsDisjoint;

// ---------------------------------------------------------------------------
// Runtime narrowing
// ---------------------------------------------------------------------------

/** Whether an id is one this build recognizes at all. */
export function isSpecId(value: string): value is SpecId {
  return (SPEC_IDS as readonly string[]).includes(value);
}

export function isPublicSpecId(specId: SpecId): specId is PublicSpecId {
  return (PUBLIC_SPEC_IDS as readonly string[]).includes(specId);
}

/**
 * Raised when an internal-only specialization reaches a public boundary.
 *
 * A distinct class so a transport can recognize an orchestration defect for
 * what it is. The message is author-written and names the id, which is an
 * internal constant and never upstream data.
 */
export class InternalSpecExposureError extends Error {
  readonly specId: SpecId;

  constructor(specId: SpecId) {
    super(
      `Specialization '${specId}' is internal-only and cannot be published. An internal-only analysis ` +
        `reached a public projection, which is an orchestration defect, not an unsupported specialization.`,
    );
    this.name = "InternalSpecExposureError";
    this.specId = specId;
  }
}

/**
 * Narrows to a publishable id, or fails closed.
 *
 * Never returns `null` and never returns a substitute. See the module header
 * for why the internal-only case is an error rather than a quieter document.
 */
export function requirePublicSpecId(specId: SpecId): PublicSpecId {
  if (isPublicSpecId(specId)) return specId;
  throw new InternalSpecExposureError(specId);
}

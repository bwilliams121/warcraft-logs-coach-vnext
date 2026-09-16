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
 * until its evaluator is real, registered and activated.
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
 * and tests. It says nothing about support: Protection Paladin is listed here so
 * the second-spec architecture can be proven against a real id, and it remains
 * `SPEC_NOT_SUPPORTED` on every public path because the identity table
 * (`src/services/spec-identity.ts`) does not resolve to it and no PUBLIC
 * analyzer is registered for it.
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
export type SpecId = "rogue/assassination" | "paladin/protection";

export const SPEC_IDS = Object.freeze([
  "rogue/assassination",
  "paladin/protection",
] as const satisfies readonly SpecId[]);

/** The specializations a public transport may name. */
export const PUBLIC_SPEC_IDS = Object.freeze(["rogue/assassination"] as const satisfies readonly SpecId[]);

export type PublicSpecId = (typeof PUBLIC_SPEC_IDS)[number];

/**
 * Known internally, never named publicly.
 *
 * Protection Paladin arrives here in M10-A as an ARCHITECTURE PROOF id. It moves
 * to `PUBLIC_SPEC_IDS` only when M10-D activates its analyzer, and that move is
 * a reviewed edit to three places that must agree: this partition, the identity
 * table, and the registration's exposure.
 */
export const INTERNAL_ONLY_SPEC_IDS = Object.freeze([
  "paladin/protection",
] as const satisfies readonly SpecId[]);

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

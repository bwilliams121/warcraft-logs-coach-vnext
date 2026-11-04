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
 * THE INTERNAL-ONLY SET HOLDS TWO MEMBERS SINCE ONB-A1P (Restoration Druid and
 * Discipline Priest), which promoted Havoc Demon Hunter. It held those three from
 * ONB-A1. It held the first two from HEAL-B4P,
 * which promoted Preservation Evoker. It held those two and Preservation Evoker
 * from HEAL-B4, and the first two from HEAL-B3. It held Restoration Druid alone from HEAL-B2P, which
 * promoted Holy Priest. It held two from HEAL-B2 (Restoration Druid and
 * Holy Priest), and Restoration Druid alone from HEAL-B1P, which promoted
 * Holy Paladin and Mistweaver Monk. It held three from HEAL-B1
 * (Holy Paladin, Restoration Druid and Mistweaver Monk), the first time it
 * held more than one. It was empty from HEAL-AP, which promoted Restoration Shaman (it held
 * that one member from HEAL-A). It was empty from
 * M13-F, which promoted Augmentation Evoker (it held that one member from
 * M13-E). Before that it held one member from M11-C2. It was empty
 * from M10-D (Protection public) until M11-A4 (Retribution arrived internal),
 * empty again from M11-A5 until M11-B2 (Blood Death Knight arrived internal),
 * and empty again from M11-B12 (Blood moved to the public half after ten
 * measurement slices and the M11-B11 promotion-readiness audit) until M11-C2,
 * when Brewmaster Monk arrived here first, as all three of its predecessors
 * did. The partition, the narrowing boundary and the registry's exposure
 * rules are live over its members, and the compile-time proofs below hold
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
  | "evoker/augmentation"
  | "shaman/restoration"
  | "paladin/holy"
  | "druid/restoration"
  | "monk/mistweaver"
  | "priest/holy"
  | "priest/discipline"
  | "evoker/preservation"
  | "demonhunter/havoc"
  | "rogue/subtlety"
  | "warrior/fury"
  | "warrior/protection";

export const SPEC_IDS = Object.freeze([
  "rogue/assassination",
  "paladin/protection",
  "paladin/retribution",
  "deathknight/blood",
  "monk/brewmaster",
  "evoker/augmentation",
  "shaman/restoration",
  "paladin/holy",
  "druid/restoration",
  "monk/mistweaver",
  "priest/holy",
  "priest/discipline",
  "evoker/preservation",
  "demonhunter/havoc",
  "rogue/subtlety",
  "warrior/fury",
  "warrior/protection",
] as const satisfies readonly SpecId[]);

/** The specializations a public transport may name. */
export const PUBLIC_SPEC_IDS = Object.freeze([
  "rogue/assassination",
  "paladin/protection",
  "paladin/retribution",
  "deathknight/blood",
  "monk/brewmaster",
  "evoker/augmentation",
  "shaman/restoration",
  "paladin/holy",
  "monk/mistweaver",
  "priest/holy",
  "evoker/preservation",
  "demonhunter/havoc",
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
 * gates do not apply to it: it publishes no decision. The set was empty again
 * from M13-F until HEAL-A.
 *
 * Restoration Shaman arrived here in HEAL-A as the first healer registration.
 * Like Augmentation it binds no pinned decision authority: its declared
 * families (COOLDOWN_ASSIGNMENT, HEALING_COOLDOWN, HEALING_DECISION) are
 * provider-less, so it is never ANALYZED. Its assignment execution is judged
 * only against a caller-supplied raid cooldown plan, and its results take the
 * shared healer finding shape (`healer-finding.ts`). HEAL-AP moved it to
 * `PUBLIC_SPEC_IDS` by the same five-site edit, together with the reviewed
 * healer public result shape (`healerFindings`) and after the healer
 * promotion gate passed on real evidence. The set was empty again from
 * HEAL-AP until HEAL-B1.
 *
 * Holy Paladin, Restoration Druid and Mistweaver Monk arrived here together in
 * HEAL-B1, three healer registrations on Restoration Shaman's architecture:
 * provider-less families, never ANALYZED, assignments judged only against a
 * supplied plan, cooldown uses as observed facts, each with its own reviewed
 * healing-cooldown identity data. HEAL-B1P moved Holy Paladin and Mistweaver
 * Monk to `PUBLIC_SPEC_IDS` by the same five-site edit, with the shared healer
 * view, after each passed the healer promotion gate on real evidence (their
 * whole-fight casts in the canonical fight). Restoration Druid stays here: no
 * retained, authorized capture holds one of its events, so it cannot meet the
 * gate (agent/spec-onboarding-inventory.md; its evidence gap is ONB-EV's).
 *
 * Holy Priest arrived here in HEAL-B2, a fourth healer registration on the
 * same architecture with its own reviewed healing-cooldown identity data
 * (Divine Hymn and Apotheosis). HEAL-B2P moved it to `PUBLIC_SPEC_IDS` by
 * the same five-site edit, with the shared healer view, after it passed the
 * healer promotion gate on real evidence (its whole-fight casts in the
 * canonical fight, cut from the retained capture).
 *
 * Discipline Priest arrived here in HEAL-B3, a healer registration on the same
 * architecture and its own representative: besides its reviewed
 * healing-cooldown identity data (Power Word: Barrier, Ultimate Penitence,
 * Evangelism) it reports its observed Atonement as facts. Its public shape
 * and promotion are HEAL-B3P's; HEAL-B3P could not promote it (no committed or
 * retained capture holds its whole-fight casts), so the id stays here.
 *
 * Preservation Evoker arrived here in HEAL-B4, a healer registration on the
 * same architecture and its own representative: its reviewed healing-cooldown
 * identity data (Rewind, Dream Flight, Stasis) names no empowered spell, and
 * its evaluator refuses to read a cast as a use when the evidence shows the
 * ability empowered. Its roster role stays UNKNOWN, as pinned. HEAL-B4P moved
 * it to `PUBLIC_SPEC_IDS` by the same five-site edit, with the shared healer
 * view, after it passed the healer promotion gate on real evidence (its
 * whole-fight casts in gtKb2xHn87pNcFfW fight 22, cut from the retained
 * captures).
 *
 * Havoc Demon Hunter arrived here in ONB-A1, the first rotational specialization of
 * full onboarding and Cohort A's representative. ONB-A1P moved it to
 * `PUBLIC_SPEC_IDS` by the same five-site edit, for Aldrachi Reaver builds only
 * (`supported-profile.ts`), after it passed both rotational gates on real evidence.
 *
 * Subtlety Rogue, Fury Warrior and Protection Warrior arrived here in ONB-A2, Cohort A's
 * followers. No retained capture can validate any of them, and no decision of any of them
 * resolves today, so their public shape waits on evidence (ONB-A2P, ONB-EV).
 */
export const INTERNAL_ONLY_SPEC_IDS = Object.freeze([
  "druid/restoration",
  "priest/discipline",
  "rogue/subtlety",
  "warrior/fury",
  "warrior/protection",
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

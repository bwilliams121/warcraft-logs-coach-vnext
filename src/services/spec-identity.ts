/**
 * Warcraft Logs class/spec strings -> the analyzer's internal specialization id.
 *
 * WHAT THIS IS
 *
 * A translation between two naming systems, and nothing else. Warcraft Logs
 * reports a player's class and specialization as display strings (`"Rogue"`,
 * `"Assassination"`); specialization evaluators are keyed by an internal id
 * (`"rogue/assassination"`). Something has to join them, and doing it here keeps
 * the join in one auditable place instead of at every call site.
 *
 * WHAT THIS IS NOT
 *
 * Not gameplay logic. It reads no combat events, makes no judgement, and cannot
 * tell whether a spec was played well. It also does not decide whether an
 * analyzer EXISTS for a spec — that is the registry's job. This module answers
 * only "which specialization is this, in our vocabulary".
 *
 * IT FAILS CLOSED, AND THE FAILURE MODE IT EXISTS TO PREVENT IS SPECIFIC
 *
 * The dangerous outcome is not returning an error. It is returning
 * `rogue/assassination` for a player who was not an Assassination Rogue — which
 * would run Rogue rules over someone else's fight and produce a confident,
 * well-formed report about the wrong game. So there is no default, no fallback,
 * no nearest-match and no substring test. An identity either matches an entry
 * exactly or it does not resolve.
 *
 * WHY THE TABLE IS TWO ROWS
 *
 * Two specializations have PUBLIC evaluators today: Assassination Rogue and,
 * since M10-D, Protection Paladin. Enumerating the other thirty-eight would be
 * writing down claims we cannot honour — a table entry reads as "we know about
 * this", and for an unsupported spec the honest answer is the same whether or
 * not we could spell its name. Rows arrive with evaluators, and the registry
 * validates that this table, the public spec partition and the PUBLIC
 * registrations name exactly the same set.
 */

import type { SpecId } from "../findings/finding.js";

/** Why a Warcraft Logs identity did not become a `SpecId`. */
export type SpecIdentityFailure =
  /**
   * The class and spec are both well-formed, and together they name no
   * specialization this build knows.
   *
   * The ordinary case for the thirty-eight specializations without an evaluator.
   * A truthful, expected answer — not a malfunction.
   */
  | "UNSUPPORTED_SPECIALIZATION"
  /**
   * The class or spec string is missing or blank, so there is nothing to match.
   *
   * Distinct from the above because it is a DATA problem rather than a coverage
   * one: we cannot say which specialization this is, let alone whether we
   * support it. Preflight already refuses to resolve an identity without a
   * usable name, class and spec, so reaching this means something upstream
   * changed — and it must not be quietly folded into "unsupported".
   */
  | "IDENTITY_NOT_USABLE";

export type SpecIdentityResolution =
  | { readonly ok: true; readonly specId: SpecId }
  | {
      readonly ok: false;
      readonly reason: SpecIdentityFailure;
      /** The normalized pair that failed, for disclosure. Never a credential. */
      readonly observed: { readonly className: string; readonly specName: string };
    };

/**
 * The supported identities, keyed by normalized `class/spec`.
 *
 * Exported so a test can assert its exact contents: this table is the entire
 * definition of "which specializations this build recognizes", and it should be
 * impossible to grow it by accident.
 */
export const SUPPORTED_SPEC_IDENTITIES: Readonly<Record<string, SpecId>> = Object.freeze({
  "rogue/assassination": "rogue/assassination",
  "paladin/protection": "paladin/protection",
});

/**
 * Normalizes one Warcraft Logs display string for lookup.
 *
 * Trims surrounding whitespace and lowercases. Both are deliberate and both are
 * narrow:
 *
 * - CASE is normalized because Warcraft Logs' capitalisation of these fields is
 *   a presentation choice, not a contract, and `"rogue"` and `"Rogue"` are the
 *   same class by any reading.
 * - SURROUNDING WHITESPACE is trimmed because it carries no meaning.
 *
 * Nothing else is touched. Interior whitespace, punctuation and spelling are
 * left exactly as received, so `"Assasination"`, `"Assassination "` with an
 * interior double space, or `"Assassination Rogue"` all fail to match rather
 * than being repaired into a supported spec. A typo that silently resolved would
 * be the fallback this module exists to refuse, wearing a friendlier name.
 */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolves a Warcraft Logs class/spec pair to an internal `SpecId`.
 *
 * Total and deterministic. Callers must branch on `ok` — there is no variant
 * that returns a usable id alongside a failure.
 */
export function resolveSpecIdentity(identity: {
  readonly className: string;
  readonly specName: string;
}): SpecIdentityResolution {
  const className = normalize(identity.className);
  const specName = normalize(identity.specName);

  if (className.length === 0 || specName.length === 0) {
    return { ok: false, reason: "IDENTITY_NOT_USABLE", observed: { className, specName } };
  }

  // `Object.prototype.hasOwnProperty` rather than a truthiness check on the
  // lookup: a key like `"constructor"` would otherwise find an inherited member
  // and hand back something that is not a SpecId at all.
  const key = `${className}/${specName}`;
  if (!Object.prototype.hasOwnProperty.call(SUPPORTED_SPEC_IDENTITIES, key)) {
    return { ok: false, reason: "UNSUPPORTED_SPECIALIZATION", observed: { className, specName } };
  }

  return { ok: true, specId: SUPPORTED_SPEC_IDENTITIES[key] as SpecId };
}

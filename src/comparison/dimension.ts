/**
 * The tri-state every hard comparison dimension answers in.
 *
 * WHY NOT REUSE M7's `Comparability`
 *
 * `src/aggregation/raid-night.ts` already exports
 * `Comparability = "SAME" | "DIFFERENT" | "UNKNOWN"`, and it means something
 * genuinely different: whether two adjacent points in a player's series share a
 * property. SAME and DIFFERENT are statements about VALUES.
 *
 * These three are statements about what the values ESTABLISH, which is not the
 * same question and does not have the same answers. Two pulls with equal
 * `partition` have the SAME partition and still establish nothing about patch
 * compatibility, because the semantics of that field have not been verified —
 * see `version-evidence.ts`. Reusing M7's type would have made that distinction
 * unsayable, and the first person to need it would have written `SAME` and moved
 * on.
 *
 * THE ASYMMETRY THAT MATTERS
 *
 * INCOMPATIBLE is a positive claim and requires observed evidence on both sides.
 * UNKNOWN is what missing evidence produces. Nothing in this domain may turn an
 * absence into an INCOMPATIBLE — that would be "we did not retrieve the
 * difficulty, therefore these are different difficulties", which is the
 * missing-data-becomes-negative-evidence failure this project exists to avoid.
 *
 * Each dimension function enforces that itself, by testing for the unresolved
 * case BEFORE testing for inequality.
 */

export type DimensionCompatibility = "COMPATIBLE" | "INCOMPATIBLE" | "UNKNOWN";

/** Canonical, for parity assertions against any later vocabulary. */
export const DIMENSION_COMPATIBILITY_VALUES = [
  "COMPATIBLE",
  "INCOMPATIBLE",
  "UNKNOWN",
] as const satisfies readonly DimensionCompatibility[];

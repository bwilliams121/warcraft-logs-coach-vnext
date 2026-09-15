/**
 * Contextual differences a comparison must disclose but must never act on.
 *
 * A CAVEAT IS NOT A DEMOTION
 *
 * Caveats and hard dimensions are separated at the type level, and the
 * separation is load-bearing. `assessPullComparability` reads the hard
 * dimensions to decide COMPATIBLE / INCOMPATIBLE / UNKNOWN, and reads caveats
 * only to decide whether the word `_WITH_CAVEATS` appears. There is no code path
 * by which a caveat can make a comparison NOT_COMPARABLE, and no numeric weight
 * anywhere that could accumulate into one.
 *
 * That matters most for raid size. M8-A measured our pull at 24 and three
 * comparable top pulls at 25, 27 and 30, on the same encounter and difficulty.
 * A model that let size differences reject comparability would reject every
 * flexible-raid comparison in the game.
 *
 * NO THRESHOLD, ANYWHERE
 *
 * `DIFFERENT_FIGHT_DURATION` fires on any observed inequality. Deciding that
 * eleven seconds is "close enough" and twelve is not would be a judgement, and
 * judgements are what this domain is built to keep out. The raw durations stay
 * on the two `PullContext` values the caller already holds, so a consumer that
 * genuinely needs a neighbourhood computes it deliberately and in the open.
 *
 * A consequence, stated so nobody reads it as a bug: two different pulls almost
 * always differ in duration, so `COMPARABLE_WITH_CAVEATS` is the ordinary
 * answer and a bare `COMPARABLE` means something strong and rare — not one
 * contextual difference was observed at all.
 *
 * WHY THE `_UNRESOLVED` MEMBERS EXIST
 *
 * Because silence would read as sameness. If a raid size is not held, emitting
 * nothing leaves a consumer to assume the sizes matched. The absence is itself a
 * fact about the comparison and is disclosed as one.
 */

import type { PullContext } from "./pull-identity.js";

/**
 * The supported contextual differences.
 *
 * DECLARATION ORDER IS THE CANONICAL ORDER. Every array this module returns is
 * a filtered copy of `COMPARISON_CAVEATS`, so ordering can never depend on the
 * order differences happened to be detected in — nor on the iteration order of
 * an untyped Warcraft Logs payload.
 *
 * The list is short on purpose. Each member corresponds to a fact some type in
 * this domain can actually carry today. M8-A named several more — item level,
 * composition, build context, phase reached — and none of them is here, because
 * a caveat whose input is permanently absent would fire on every comparison and
 * disclose nothing.
 */
export const COMPARISON_CAVEATS = [
  "DIFFERENT_ENCOUNTER_OUTCOME",
  "ENCOUNTER_OUTCOME_UNRESOLVED",
  "DIFFERENT_FIGHT_DURATION",
  "FIGHT_DURATION_UNRESOLVED",
  "DIFFERENT_RAID_SIZE",
  "RAID_SIZE_UNRESOLVED",
  "EXTERNAL_REPORT",
] as const;

export type ComparisonCaveat = (typeof COMPARISON_CAVEATS)[number];

/**
 * Canonical ordering, with duplicates removed.
 *
 * Implemented as a filter over the canonical list rather than a sort over the
 * input, so the result cannot inherit anything from the caller's ordering.
 */
export function orderCaveats(caveats: Iterable<ComparisonCaveat>): readonly ComparisonCaveat[] {
  const present = new Set(caveats);
  return COMPARISON_CAVEATS.filter((caveat) => present.has(caveat));
}

/**
 * The contextual differences between two pulls.
 *
 * Symmetric in its arguments by construction: every test below is an equality
 * or a null check, and none distinguishes which side is the subject.
 */
export function deriveCaveats(subject: PullContext, reference: PullContext): readonly ComparisonCaveat[] {
  const found: ComparisonCaveat[] = [];

  // Outcome. Unresolved is tested first, so a pull whose kill flag Warcraft
  // Logs did not supply is never reported as having a DIFFERENT outcome.
  if (subject.outcome === "UNRESOLVED" || reference.outcome === "UNRESOLVED") {
    found.push("ENCOUNTER_OUTCOME_UNRESOLVED");
  } else if (subject.outcome !== reference.outcome) {
    found.push("DIFFERENT_ENCOUNTER_OUTCOME");
  }

  if (subject.durationMs === null || reference.durationMs === null) {
    found.push("FIGHT_DURATION_UNRESOLVED");
  } else if (subject.durationMs !== reference.durationMs) {
    found.push("DIFFERENT_FIGHT_DURATION");
  }

  if (subject.raidSize === null || reference.raidSize === null) {
    found.push("RAID_SIZE_UNRESOLVED");
  } else if (subject.raidSize !== reference.raidSize) {
    found.push("DIFFERENT_RAID_SIZE");
  }

  // Provenance disclosure, not a difference in the fights themselves. A
  // comparison drawn from a report we did not analyse carries risks a
  // same-report comparison does not, and the reader is told which they have.
  if (subject.identity.reportCode !== reference.identity.reportCode) {
    found.push("EXTERNAL_REPORT");
  }

  return orderCaveats(found);
}

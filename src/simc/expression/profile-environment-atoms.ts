/**
 * What the pinned SimulationCraft environment makes of a declared atom (SIMC-FB-A).
 *
 * Pure and gameplay-neutral. It knows no class, action or encounter and reads no event: it turns an
 * environment someone proved into the value the pinned engine would give each identifier. Whether
 * that environment may be read at all is the precedence in `src/findings/simc-profile-fallback.ts`.
 * These are facts of the pinned profile and never of a real fight.
 *
 * Pinned semantics, with the citations the dataset carries:
 *
 *   fight_style.<name>            a case-insensitive comparison with the fight style's name
 *                                 (FIGHT_STYLE_IS_A_NAME_COMPARISON)
 *   raid_event.<type>.<filter>    with no raid event, a constant: `in` and `cooldown` are the largest
 *                                 timespan, and every other filter is 0
 *                                 (RAID_EVENT_EXPRESSION_IS_CONSTANT_WHEN_NONE_MATCH,
 *                                 RAID_EVENT_ABSENT_VALUES, TIMESPAN_MAXIMUM)
 *   spell_targets[.<ability>]     with distance targeting off, one target and no `adds` or `pull`
 *                                 event, the constant 1 for every ability
 *                                 (SPELL_TARGETS_WITHOUT_DISTANCE_TARGETING)
 *
 * Any other identifier, or any other environment, answers nothing.
 */

import { knownNumber } from "./evaluate.js";
import type { SpecAtomBinding, SpecAtomDeclaration, SpecAtomValue } from "./spec-vocabulary.js";

/** The environment the pinned engine runs when a profile sets none of it. */
export interface ProfileEnvironment {
  readonly fightStyle: string;
  readonly targetCount: number;
  readonly raidEventCount: number;
  readonly distanceTargetingEnabled: boolean;
}

export type ProfileAtomFact =
  "FIGHT_STYLE" | "ADD_AND_PULL_SCHEDULE" | "OTHER_RAID_EVENT_SCHEDULE" | "SPELL_TARGETS";

/** `timespan_t::max().total_seconds()`: the largest int64 of milliseconds, in seconds, as a double. */
export const TIMESPAN_MAX_SECONDS = 2 ** 63 * (1 / 1000);

function valueOf(declaration: SpecAtomDeclaration, value: number): SpecAtomValue {
  return declaration.shape === "BOOLEAN"
    ? { kind: "TRUTH", value: value !== 0 }
    : { kind: "MAGNITUDE", binding: knownNumber(value) };
}

/** The fact an identifier asks about, or `null` for one the environment does not answer. */
export function profileAtomFactOf(identifier: string): ProfileAtomFact | null {
  const parts = identifier.split(".");
  if (parts[0] === "fight_style" && parts.length === 2 && (parts[1] ?? "").length > 0) return "FIGHT_STYLE";
  if (parts[0] === "raid_event" && parts.length === 3) {
    return parts[1] === "adds" || parts[1] === "pull" ? "ADD_AND_PULL_SCHEDULE" : "OTHER_RAID_EVENT_SCHEDULE";
  }
  if (parts[0] === "spell_targets" && parts.length <= 2) return "SPELL_TARGETS";
  return null;
}

/**
 * The binding for one declared atom in this environment, or `null` when the environment does not
 * establish it. A self-addressing declaration is left alone: its binding is keyed by action, and a
 * reader of the shared environment holds none.
 */
export function profileAtomBinding(
  declaration: SpecAtomDeclaration,
  environment: ProfileEnvironment,
): SpecAtomBinding | null {
  if (declaration.selfAddressing) return null;
  const { identifier } = declaration;
  const fact = profileAtomFactOf(identifier);
  if (fact === null) return null;
  const parts = identifier.split(".");
  const bind = (value: number): SpecAtomBinding => ({
    key: identifier,
    actionToken: null,
    value: valueOf(declaration, value),
  });
  switch (fact) {
    case "FIGHT_STYLE":
      return bind((parts[1] ?? "").toLowerCase() === environment.fightStyle.toLowerCase() ? 1 : 0);
    case "ADD_AND_PULL_SCHEDULE":
    case "OTHER_RAID_EVENT_SCHEDULE": {
      if (environment.raidEventCount !== 0) return null;
      const filter = parts[2] ?? "";
      return bind(filter === "in" || filter === "cooldown" ? TIMESPAN_MAX_SECONDS : 0);
    }
    case "SPELL_TARGETS":
      if (
        environment.distanceTargetingEnabled ||
        environment.targetCount !== 1 ||
        environment.raidEventCount !== 0
      ) {
        return null;
      }
      return bind(1);
  }
}

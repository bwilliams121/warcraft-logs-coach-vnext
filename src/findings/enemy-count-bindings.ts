/**
 * The enemy count one observed decision reads (ONB-S3).
 *
 * The one place the shared enemy set (`src/engine`) meets the evaluator's bindings (`src/simc`), so
 * a specialization adds one call and no rule of its own. It reads only what the shared layers say:
 * `active_enemies` is the positive-evidence count at the decision, and a list whose vocabulary does
 * not declare `active_enemies` is unchanged.
 *
 * `spell_targets.<ability>` IS NOT HERE. It is never aliased to this count, and it binds only
 * through an action's own registration (`src/simc/expression/enemy-count.ts`).
 *
 * WHERE THE DECISION IS. The query is `BEFORE_EVENT` at the decision's position, so nothing at or
 * after the decision reaches it (O2). For a cast-time spell the decision is the begin, not the
 * completion: reading the state at the completion would admit evidence from after the player
 * decided. A decision whose position is not established reads no count, so it stays UNKNOWN.
 */

import type { CastDecisionAnchorState } from "../engine/game-state/casting/cast-decision-anchor.js";
import { enemySetAt } from "../engine/game-state/enemies/enemy-set.js";
import type { CombatState } from "../engine/state/combat-state.js";
import { withActiveEnemies } from "../simc/expression/enemy-count.js";
import type { AtomBindings } from "../simc/expression/evaluate.js";

/**
 * The position an anchored decision was made at, by the anchor's SOURCE. A shared timestamp is not a
 * shared position: a begin and its completion can fall in one millisecond with evidence between them.
 *
 *     OBSERVED_BEGINCAST       the paired begin
 *     INSTANT_COMPLETION       the completion, even with a begin in its millisecond
 *     CHANNEL_START            the completion: a channel's `cast` is its start
 *     DERIVED_FROM_COMPLETION  none: a computed instant, which no event marks
 *     not established          none
 */
export function decisionPositionOfAnchor(
  anchor: CastDecisionAnchorState,
  completionPosition: number,
): number | null {
  if (anchor.state !== "ESTABLISHED") return null;
  switch (anchor.source) {
    case "OBSERVED_BEGINCAST":
      return anchor.beginPosition;
    case "INSTANT_COMPLETION":
    case "CHANNEL_START":
      return completionPosition;
    case "DERIVED_FROM_COMPLETION":
      return null;
  }
}

/** `bindings` with `active_enemies` read at `position`, for the decision of `subjectActorId`. */
export function withEnemyCountAt(
  bindings: AtomBindings,
  state: CombatState,
  subjectActorId: number,
  position: number | null,
): AtomBindings {
  if (bindings.specAtoms === undefined || position === null) return bindings;
  const enemySet = enemySetAt(state, { subjectActorId, at: { anchor: "BEFORE_EVENT", position } });
  return { ...bindings, specAtoms: withActiveEnemies(bindings.specAtoms, enemySet.count) };
}

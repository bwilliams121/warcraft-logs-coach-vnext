/**
 * Blood Death Knight's EXECUTION FACTS (M11-G3-3): what the shared execution
 * profile can act on for Blood. Spec knowledge decides which shared options are
 * active here; it never redefines a shared option.
 *
 * - APL facts are read from the pinned built-in Blood APL itself
 *   (engine/class_modules/apl/apl_death_knight.cpp `blood_apl` region, the
 *   committed artifact): no `buff.<x>.react`, no `cast_delay`.
 * - Channels: Consumption is Blood's only channeled action — an empowered
 *   channel (sc_death_knight.cpp:5694 `channeled = true` in
 *   death_knight_empowered_charge_t, :9325 consumption_t). It is cast only when
 *   the Consumption talent (trait entry 126300) is taken.
 * - Cast times: every other Blood APL action is instant; the only Death Knight
 *   execute-time override is the auto attack's first swing
 *   (sc_death_knight.cpp:7661), not a foreground cast.
 */

import {
  aplExecutionFacts,
  type AplExecutionFacts,
  type SpecExecutionFacts,
} from "../../../simulation/execution-activity.js";
import apl from "../../../simc/data/deathknight-blood.apl.json";

export const BLOOD_APL_ACTION_STRINGS: readonly string[] = apl.lists.flatMap((list) =>
  list.actions.map((action) => action.actionStringVerbatim),
);

export const BLOOD_APL_EXECUTION_FACTS: AplExecutionFacts = aplExecutionFacts(BLOOD_APL_ACTION_STRINGS);

export const BLOOD_SPEC_EXECUTION_FACTS: SpecExecutionFacts = {
  channeledActions: [{ action: "consumption", condition: "Consumption talent (trait entry 126300) taken" }],
  castTimeActions: [],
  basis:
    "pinned sc_death_knight.cpp at 33622e9d: consumption_t is the only channeled (empowered) action; no other Blood APL action has a cast time",
};

/**
 * What Outlaw's pooling means: the at-maximum question on its two pool lines (ONB-C2).
 *
 * THE PINNED LINES (`outlaw` in `apl_rogue.cpp`):
 *
 *     build[6]   pool_resource,for_next=1
 *     build[7]   ambush,if=talent.hidden_opportunity
 *
 *     finish[1]  pool_resource,for_next=1
 *     finish[2]  killing_spree,if=buff.supercharge_1.up|cooldown.adrenaline_rush.remains>120|!talent.supercharger
 *
 * `pool_resource` with no `resource=` pools the primary resource (player.cpp:10640-10816), and Outlaw's
 * is Energy (`rogue_t::primary_resource`, sc_rogue.cpp:1220). The shared engine holds the pool's own
 * semantics (`src/simc/pooling.ts`). The at-maximum question is this specialization's.
 *
 * NEITHER GUARDED CONDITION READS ENERGY. So with Energy raised to its maximum each condition is what the
 * scan already has. Feral's pool is on an extra Energy requirement, `max_energy=1`, so a Bite pressed
 * below its line proves the pool. Outlaw has no such option: a press of either guarded action proves the
 * line ready NOW, and the scan answers that without asking here (`settlePendingPool`).
 *
 * THE ANSWER, THEN, IS ONE-SIDED:
 *
 *     condition FALSE    NOT_READY_AT_MAX: the pool line is not resource limited, so it does not stop the scan
 *     anything else      UNKNOWN
 *
 * Why never READY_AT_MAX. It asks whether an action nobody pressed would be usable at full Energy. Ambush
 * needs stealth, Audacity or Blindside (`requires_stealth`, sc_rogue.cpp:2199-2208, :2783), and Killing Spree
 * needs its cooldown and at least one Combo Point. This slice binds none of them, and no retained capture
 * could check a binding. Nor would it decide anything: a POOLS selection is UNKNOWN against any observed cast
 * (`agent/follow-ups.md` "After ONB-S5"), so UNKNOWN here loses no verdict.
 *
 * WHAT IT REFUSES. A `resource=`, and any guarded line but the pinned two. Each is UNKNOWN, never assumed.
 */

import { unknownUsability } from "../../../simc/action-applicability.js";
import { guardedReadinessUnder, type PoolingResolver } from "../../../simc/pooling.js";

/** The two lines a pool guards, by token, with the one condition each is reviewed for. Neither reads Energy. */
export const OUTLAW_GUARDED_LINES: Readonly<Record<string, string>> = Object.freeze({
  ambush: "talent.hidden_opportunity",
  killing_spree: "buff.supercharge_1.up|cooldown.adrenaline_rush.remains>120|!talent.supercharger",
});

/** Outlaw's answer to the shared at-maximum question. Never assumes readiness. */
export function outlawPoolingResolver(): PoolingResolver {
  return ({ guardedLine, resourceOption, bindings }) => {
    if (resourceOption !== null) {
      return { kind: "UNKNOWN", detail: `no Outlaw model of pooling '${resourceOption}'` };
    }
    if (OUTLAW_GUARDED_LINES[guardedLine.actionToken] !== guardedLine.conditionRaw) {
      return {
        kind: "UNKNOWN",
        detail: "the guarded line is not a pinned one, so its readiness at the maximum is not modelled",
      };
    }
    // The condition reads no Energy, so the scan's own bindings are what it sees at the maximum.
    return guardedReadinessUnder(guardedLine, bindings, unknownUsability());
  };
}

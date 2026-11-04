/**
 * What Feral's pooling means: `max_energy=1` and the at-maximum question (ONB-C1).
 *
 * THE PINNED LINES (`finisher` in `apl/druid/feral_apl.inc`):
 *
 *     finisher[1]  pool_resource,for_next=1
 *     finisher[2]  ferocious_bite,max_energy=1,if=combo_points>=5
 *
 * `pool_resource` with no `resource=` pools the primary resource (player.cpp:10640-10816), and
 * Feral's is Energy (`druid_t::primary_resource`, sc_druid.cpp:13729-13741). The shared engine holds
 * the pool's own semantics (`src/simc/pooling.ts`). Two things are this specialization's.
 *
 * 1. `max_energy=1` IS A READINESS REQUIREMENT, NOT TARGETING. It is an option of
 *    `ferocious_bite_base_t` alone, and it adds one test to `ready()` (sc_druid.cpp:4267-4273):
 *
 *        current Energy < maximum_energy()  ->  not ready
 *
 *    The shared engine rightly refuses an option it cannot read, so `feralScanAuthority` removes this
 *    one key from the refusal list, and `resolveFeralDruidUsability` answers it. The line's text is
 *    untouched, and no other option is read past.
 *
 * 2. `maximum_energy()` (:4255-4265) IS READ AS BOUNDS.
 *
 *        ( base cost + excess ) x incarnation factor x apex factor
 *
 *    Pinned spell data: cost 25 (spell power row 939), excess 25 (effect 12791, `E_POWER_BURN`), so 50.
 *    Incarnation's `P_RESOURCE_COST_1` effect (471804) is -25%, so 37.5 while it is up. Apex
 *    Predator's Craving's effect 1 (1029647) is -100%, so 0 while it is up. Each factor is at most 1,
 *    so 50 is the most it can be in any state, and a value this slice cannot establish widens the
 *    bound rather than being guessed.
 *
 * THE AT-MAXIMUM QUESTION. With Energy raised to its maximum, `ready()` no longer depends on Energy,
 * because the observed maximum is at least 50. What is left is the line's `combo_points>=5` and the
 * action's other readiness. So:
 *
 *     condition FALSE              NOT_READY_AT_MAX: the pool line is not resource limited
 *     condition TRUE, Bite observed READY_AT_MAX: this press proves the rest of its readiness
 *     condition TRUE, anything else UNKNOWN: nothing proves Bite usable at this instant
 *     condition unknown            UNKNOWN
 *
 * The pool line is ready only when the guarded line is not ready now and is ready at the maximum, and a
 * POOLS selection is UNKNOWN against any observed cast (`agent/follow-ups.md` "After ONB-S5"). The
 * third row therefore loses nothing: it could only ever have produced that same UNKNOWN.
 *
 * WHAT IT REFUSES. Any pool line but the pinned shape: a `resource=`, another guarded token, another
 * condition, or an unobserved maximum. Each is UNKNOWN, never assumed.
 */

import type { ActionUsabilityVerdict } from "../../../simc/action-applicability.js";
import { provenUsable, unknownUsability } from "../../../simc/action-applicability.js";
import {
  parseAplLine,
  type AplAction,
  type AplAuthority,
  type ListLookup,
} from "../../../simc/apl-authority.js";
import type { NumericBinding } from "../../../simc/expression/evaluate.js";
import { guardedReadinessUnder, type PoolingResolver } from "../../../simc/pooling.js";

export const MAX_ENERGY_OPTION = "max_energy";
export const FEROCIOUS_BITE_TOKEN = "ferocious_bite";
export const FEROCIOUS_BITE_SPELL_ID = 22568;

/** Base cost 25 plus the most excess Energy Ferocious Bite can burn, 25: spell power row 939, effect 12791. */
export const FEROCIOUS_BITE_FULL_ENERGY = 50;
/** Incarnation's -25% on both terms: effect 471804. */
export const FEROCIOUS_BITE_INCARNATION_ENERGY = 37.5;

/** The one condition the at-maximum reading is reviewed for. It reads no Energy. */
const PINNED_GUARDED_CONDITION = "combo_points>=5";

/** Whether a line asks for `max_energy=1`, read structurally. */
export function asksMaxEnergy(action: AplAction): boolean {
  if (action.actionToken !== FEROCIOUS_BITE_TOKEN) return false;
  if (!action.actionOptionKeys.includes(MAX_ENERGY_OPTION)) return false;
  const written = parseAplLine(action.actionStringVerbatim).options.filter(
    (option) => option.key === MAX_ENERGY_OPTION,
  );
  return written.length === 1 && written[0]?.value === "1";
}

/**
 * The pinned authority with `max_energy=1` no longer in the refusal list of the line that asks for it.
 * Every other option, and any other value of this one, is refused exactly as before.
 */
export function feralScanAuthority(authority: AplAuthority): AplAuthority {
  const read = (action: AplAction): AplAction =>
    asksMaxEnergy(action)
      ? {
          ...action,
          unsupportedOptions: action.unsupportedOptions.filter(
            (option) => option.optionKey !== MAX_ENERGY_OPTION,
          ),
        }
      : action;
  return {
    artifact: authority.artifact,
    actions: authority.actions.map(read),
    listsContainingAction: (actionToken) => authority.listsContainingAction(actionToken),
    actionsInList: (listName): ListLookup => {
      const lookup = authority.actionsInList(listName);
      return lookup.found ? { ...lookup, actions: lookup.actions.map(read) } : lookup;
    },
    proveSoleGateTo: (actionToken) => authority.proveSoleGateTo(actionToken),
  };
}

/** The state `maximum_energy()` reads. `null` is not established, never false. */
export interface MaxEnergyFacts {
  readonly energy: NumericBinding;
  readonly bsIncUp: boolean | null;
  readonly apexUp: boolean | null;
  readonly incarnationSelected: boolean | null;
}

export type MaxEnergyReadiness = "MET" | "NOT_MET" | "NOT_ESTABLISHED";

/**
 * Whether Incarnation's factor applies. Berserk has none: only Incarnation's buff does (:4257), and
 * `bs_inc` is Berserk's buff when Incarnation is not taken. `null` is not established.
 */
function incarnationFactorApplies(facts: MaxEnergyFacts): boolean | null {
  if (facts.incarnationSelected === false || facts.bsIncUp === false) return false;
  return facts.incarnationSelected === true && facts.bsIncUp === true ? true : null;
}

/** The bounds of `maximum_energy()` in the worlds these facts leave. */
export function maximumEnergyBounds(facts: MaxEnergyFacts): { readonly low: number; readonly high: number } {
  if (facts.apexUp === true) return { low: 0, high: 0 };
  const incarnationUp = incarnationFactorApplies(facts);
  const high = incarnationUp === true ? FEROCIOUS_BITE_INCARNATION_ENERGY : FEROCIOUS_BITE_FULL_ENERGY;
  const withoutApex =
    incarnationUp === false ? FEROCIOUS_BITE_FULL_ENERGY : FEROCIOUS_BITE_INCARNATION_ENERGY;
  return { low: facts.apexUp === null ? 0 : withoutApex, high };
}

/** `current Energy >= maximum_energy()`, from the decision cast's own observed Energy. */
export function maxEnergyReadiness(facts: MaxEnergyFacts): MaxEnergyReadiness {
  if (facts.energy.state !== "KNOWN_NUMBER") return "NOT_ESTABLISHED";
  const { low, high } = maximumEnergyBounds(facts);
  if (facts.energy.value >= high) return "MET";
  if (facts.energy.value < low) return "NOT_MET";
  return "NOT_ESTABLISHED";
}

export interface FeralPoolingInput {
  /** The Energy maximum on the decision cast's own observation, or `null`. */
  readonly energyMaximum: number | null;
  readonly observedAbilityGameId: number;
}

/** Feral's answer to the shared at-maximum question. Never assumes readiness. */
export function feralPoolingResolver(input: FeralPoolingInput): PoolingResolver {
  return ({ guardedLine, resourceOption, bindings }) => {
    if (resourceOption !== null) {
      return { kind: "UNKNOWN", detail: `no Feral model of pooling '${resourceOption}'` };
    }
    if (!asksMaxEnergy(guardedLine) || guardedLine.conditionRaw !== PINNED_GUARDED_CONDITION) {
      return {
        kind: "UNKNOWN",
        detail: "the guarded line is not the pinned finisher, so its readiness is not modelled",
      };
    }
    if (input.energyMaximum === null || input.energyMaximum < FEROCIOUS_BITE_FULL_ENERGY) {
      return { kind: "UNKNOWN", detail: "the Energy maximum is not established on this decision's own cast" };
    }
    const usabilityAtMax: ActionUsabilityVerdict =
      input.observedAbilityGameId === FEROCIOUS_BITE_SPELL_ID ? provenUsable() : unknownUsability();
    // The line's condition reads no Energy, so the scan's own bindings are what it sees at the maximum.
    return guardedReadinessUnder(guardedLine, bindings, usabilityAtMax);
  };
}

/**
 * `cooldown.<token>.remains` and cooldown READINESS — the Havoc-owned reading of
 * cooldown state (ONB-A1).
 *
 * ONE TOKEN: `metamorphosis`, through the class-neutral derivation over the pinned
 * record anchored on the impact the log reports, with the margin
 * (`demonhunter-havoc-cooldowns.ts`). The bound is a LOWER bound, and only
 * PROVEN_NOT_READY is ever acted on.
 *
 * THE MARGIN IS EARNED, LEAP BY LEAP. A derivation stands only when the buff the leap
 * gains at its start has an observed application within the margin before the impact
 * it anchors on. A leap without one could have been pressed earlier than the margin
 * allows, so its cooldown is refused rather than bounded. Missing aura data refuses
 * the same way: nothing here reads silence as a short delay.
 *
 * WHAT IS REFUSED, BY OMISSION, AND WHY. The derivation returns nothing for any
 * other token, so its readiness is UNKNOWN:
 *
 *   the_hunt   the census's 75,000 ms contradicts real gaps of 61 s on the wire
 *   eye_beam, blade_dance, essence_break, immolation_aura, felblade, vengeful_retreat
 *              each shortened or reset in combat: see the extractor's target notes
 *
 * `cooldown.blade_dance.up` and `cooldown.eye_beam.up` therefore stay unbound here,
 * and so `default[4]` is never decided by its gate on a Chaotic Transformation
 * build: it is stepped past only by Metamorphosis's own readiness.
 */

import {
  deriveTokenCooldowns,
  tokenCooldownBindingsFrom,
  type TokenCooldown,
  type TokenCooldownDataset,
  type TokenCooldownInput,
} from "../../../findings/cooldowns/token-cooldown-derivation.js";
import {
  havocMetamorphosisImpactAnchoredRecord,
  METAMORPHOSIS_BUFF_WIRE_ABILITY_ID,
  METAMORPHOSIS_IMPACT_ANCHOR_MARGIN_MS,
} from "../../../data/game/demonhunter-havoc-cooldowns.js";
import { targetRef } from "../../../engine/normalization/normalized-events.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import type { NumericBinding } from "../../../simc/expression/evaluate.js";

export const SUPPORTED_HAVOC_COOLDOWN_TOKENS = ["metamorphosis"] as const;

export type HavocTokenCooldown = TokenCooldown;

const HAVOC_COOLDOWN_DATASET: TokenCooldownDataset = Object.freeze({
  abilitiesFor: (simcToken: string) =>
    simcToken === "metamorphosis" ? havocMetamorphosisImpactAnchoredRecord() : [],
  fallbackSourcePath: "engine/class_modules/sc_demon_hunter.cpp",
});

/** Whether an application of the leap's buff sits within the margin before this impact. */
export function metamorphosisLeapEdgeObserved(
  state: CombatState,
  actorId: number,
  impactPosition: number,
): boolean {
  const impact = state.eventAt(impactPosition);
  if (impact === null) return false;
  const group = state.auras.groupFor({
    target: targetRef(actorId, null),
    abilityGameId: METAMORPHOSIS_BUFF_WIRE_ABILITY_ID,
    auraClass: "BUFF",
    source: { kind: "ANY_SOURCE" },
  });
  return (group?.allPositions ?? []).some((position) => {
    const event = state.eventAt(position);
    return (
      event?.kind === "AURA" &&
      event.source?.actorId === actorId &&
      event.operation === "APPLIED" &&
      position < impactPosition &&
      impact.reportTimeMs - event.reportTimeMs <= METAMORPHOSIS_IMPACT_ANCHOR_MARGIN_MS
    );
  });
}

/** Refuses a token whose anchor is a leap with no observed edge inside the margin. */
function withLeapDelayEstablished(input: TokenCooldownInput, entry: HavocTokenCooldown): HavocTokenCooldown {
  const anchored = entry.perAbility.flatMap((derived) =>
    derived.cooldown.state === "UNKNOWN" || derived.cooldown.anchor === null ? [] : [derived.cooldown.anchor],
  );
  if (
    anchored.every((anchor) => metamorphosisLeapEdgeObserved(input.state, input.actorId, anchor.position))
  ) {
    return entry;
  }
  return {
    ...entry,
    readiness: { state: "UNKNOWN", reason: "COOLDOWN_STATE_UNKNOWN" },
    readinessAbilityGameId: null,
    remainsSeconds: null,
  };
}

/** Every supported token at one decision, in declaration order. */
export function deriveSupportedHavocCooldowns(input: TokenCooldownInput): readonly HavocTokenCooldown[] {
  return deriveTokenCooldowns(HAVOC_COOLDOWN_DATASET, input, SUPPORTED_HAVOC_COOLDOWN_TOKENS).map((entry) =>
    withLeapDelayEstablished(input, entry),
  );
}

/** The `knownCooldownRemainsSeconds` shape, from the tokens that derived a remainder. */
export function havocCooldownBindingsFrom(
  cooldowns: readonly HavocTokenCooldown[],
): readonly { readonly name: string; readonly remainsSeconds: NumericBinding }[] {
  return tokenCooldownBindingsFrom(cooldowns);
}

/** `cooldown.<token>.up` is FALSE only under a proven lower bound. Never TRUE. */
export function havocCooldownsProvenDown(
  cooldowns: readonly HavocTokenCooldown[],
): Readonly<Record<string, boolean | undefined>> {
  const byToken: Record<string, boolean | undefined> = {};
  for (const entry of cooldowns) {
    if (entry.readiness.state === "PROVEN_NOT_READY") byToken[entry.simcToken] = true;
  }
  return byToken;
}

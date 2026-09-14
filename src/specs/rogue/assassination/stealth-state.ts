/**
 * `stealthed.rogue` — the Assassination-owned reading of M4 aura facts.
 *
 * WHAT THE EXPRESSION ACTUALLY MEANS
 *
 * The pinned APL token `stealthed.rogue` binds to `stealthed( STEALTH_BASIC |
 * STEALTH_ROGUE )` (sc_rogue.cpp:9658-9662), which `rogue_t::stealthed`
 * (sc_rogue.cpp:11731-11754) resolves against four buffs:
 *
 *     STEALTH_NORMAL        buffs.stealth        Stealth        1784
 *     STEALTH_VANISH        buffs.vanish         Vanish buff   11327
 *     STEALTH_SUBTERFUGE    buffs.subterfuge     Subterfuge   115192
 *     STEALTH_SHADOW_DANCE  buffs.shadow_dance   Shadow Dance  (Subtlety)
 *
 * THE NAME IS A TRAP. The ENUM CONSTANT `STEALTH_ROGUE` is only Subterfuge +
 * Shadow Dance (sc_rogue.cpp:44). The EXPRESSION `stealthed.rogue` is that plus
 * `STEALTH_BASIC`. Binding the constant instead of the expression would silently
 * drop Vanish — the one contributor this milestone actually proves.
 *
 * IT EXCLUDES TWO THINGS THAT LOOK LIKE STEALTH.
 *
 *     Shadowmeld         STEALTH_SHADOWMELD is not in this mask
 *     Improved Garrote   STEALTH_IMPROVED_GARROTE is not in this mask
 *
 * Improved Garrote matters in practice: the real Vanish → Garrote sequence
 * applies it at the same instant the Vanish buff drops, so a mask that included
 * it would keep reporting "stealthed" after the window genuinely closed.
 *
 * THE ANSWER IS ASYMMETRIC, ON PURPOSE.
 *
 * `TRUE` is returned when a contributor is PROVEN ACTIVE by M4. Otherwise the
 * answer is `UNKNOWN` — never `FALSE`.
 *
 * Proving FALSE would require proving every contributor inactive, and M4's
 * `presenceAt` can only prove a specific source's aura INACTIVE from an observed
 * removal. A pre-pull application leaves no event, an unverified capability
 * leaves no event, and a failed page leaves no event, so silence across four
 * auras cannot establish "not stealthed". M5-C2 does not need FALSE, so it does
 * not manufacture one.
 *
 * VANISH THE ACTION IS NOT VANISH THE BUFF. 1856 is the spell the player casts;
 * 11327 is the buff it applies (`spell.vanish_buff = find_spell( 11327 )`,
 * sc_rogue.cpp:10239). Only the buff answers this question.
 *
 * M4 IS NOT EXTENDED. This module asks the committed `presenceAt` the same
 * questions any caller could. The Rogue-specific part — that THESE four aura
 * identities are what the expression means — lives here, in the specialization,
 * exactly as the role-module boundary requires.
 */

import { fromSource, type AuraPresenceState } from "../../../engine/auras/aura-state.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import { sourceRef, targetRef } from "../../../engine/normalization/normalized-events.js";
import type { UnknownReason } from "../../../engine/state/state-result.js";

/**
 * The aura identities `stealthed.rogue` is true for.
 *
 * Shadow Dance is deliberately absent: it is a Subtlety buff, this slice is
 * Assassination, and adding an id nothing in the supported surface can produce
 * would be speculative data. Its absence cannot cause a false TRUE, and the
 * asymmetric answer means it cannot cause a false FALSE either.
 */
/**
 * The Vanish BUFF's ability id, named once.
 *
 * 11327, never 1856. The action the player presses and the aura it applies are
 * different identities, and `vanish_t::ready()` tests the AURA. Exported so the
 * usability rule that reads it cannot re-type the number.
 */
export const VANISH_BUFF_ABILITY_ID = 11_327;

export const STEALTHED_ROGUE_CONTRIBUTORS: readonly {
  readonly abilityGameId: number;
  readonly displayNameEn: string;
  readonly simcMaskBit: string;
}[] = [
  { abilityGameId: 1_784, displayNameEn: "Stealth", simcMaskBit: "STEALTH_NORMAL" },
  { abilityGameId: VANISH_BUFF_ABILITY_ID, displayNameEn: "Vanish", simcMaskBit: "STEALTH_VANISH" },
  { abilityGameId: 115_192, displayNameEn: "Subterfuge", simcMaskBit: "STEALTH_SUBTERFUGE" },
];

/** Aura ids that must NEVER satisfy this expression, recorded so a test can assert it. */
export const STEALTHED_ROGUE_EXCLUSIONS: readonly {
  readonly abilityGameId: number;
  readonly displayNameEn: string;
  readonly whyExcluded: string;
}[] = [
  {
    abilityGameId: 58_984,
    displayNameEn: "Shadowmeld",
    whyExcluded: "STEALTH_SHADOWMELD is not in STEALTH_BASIC | STEALTH_ROGUE",
  },
  {
    abilityGameId: 392_401,
    displayNameEn: "Improved Garrote",
    whyExcluded: "STEALTH_IMPROVED_GARROTE is not in STEALTH_BASIC | STEALTH_ROGUE",
  },
];

export interface StealthedRogueInput {
  readonly state: CombatState;
  readonly actorId: number;
  /** Canonical index into `CombatFight.events`. Never an ingestion ordinal. */
  readonly position: number;
}

/** The contributor that settled a TRUE answer. A reference, never a copy. */
export interface StealthContributorProof {
  readonly abilityGameId: number;
  readonly displayNameEn: string;
  readonly simcMaskBit: string;
  /** The observed transition the aura state rests on. */
  readonly anchorPosition: number;
  readonly anchorOperation: AuraPresenceState["anchor"]["operation"];
  readonly locator: EvidenceLocator;
}

/**
 * `TRUE` with the contributor that proved it, or `UNKNOWN` with what was asked.
 *
 * There is no `FALSE` member. That is the module's asymmetry made structural, so
 * a caller cannot read "we could not prove stealth" as "the player was not
 * stealthed".
 */
export type StealthedRogueBinding =
  | { readonly value: "TRUE"; readonly provenBy: StealthContributorProof }
  | {
      readonly value: "UNKNOWN";
      /** Every contributor queried, and why each failed to settle it. */
      readonly checked: readonly {
        readonly abilityGameId: number;
        readonly outcome: "INACTIVE" | "UNKNOWN";
        readonly reason: UnknownReason | null;
      }[];
    };

/**
 * Binds `stealthed.rogue` at one decision position.
 *
 * Queries each contributor with `fromSource` — the actor's own aura on
 * themselves — because that names ONE identity and is the question M4 can answer
 * in both directions. The first contributor proven ACTIVE settles it; SimC's own
 * `stealthed` short-circuits the same way.
 */
export function bindStealthedRogue(input: StealthedRogueInput): StealthedRogueBinding {
  const { state, actorId, position } = input;
  const checked: {
    abilityGameId: number;
    outcome: "INACTIVE" | "UNKNOWN";
    reason: UnknownReason | null;
  }[] = [];

  for (const contributor of STEALTHED_ROGUE_CONTRIBUTORS) {
    const result = state.auras.presenceAt({
      target: targetRef(actorId, null),
      abilityGameId: contributor.abilityGameId,
      auraClass: "BUFF",
      source: fromSource(sourceRef(actorId, null)),
      at: { anchor: "BEFORE_EVENT", position },
    });

    if (result.certainty !== "EXACT") {
      checked.push({
        abilityGameId: contributor.abilityGameId,
        outcome: "UNKNOWN",
        reason: "reason" in result ? result.reason : null,
      });
      continue;
    }
    if (result.value.presence !== "ACTIVE") {
      checked.push({ abilityGameId: contributor.abilityGameId, outcome: "INACTIVE", reason: null });
      continue;
    }

    return {
      value: "TRUE",
      provenBy: {
        abilityGameId: contributor.abilityGameId,
        displayNameEn: contributor.displayNameEn,
        simcMaskBit: contributor.simcMaskBit,
        anchorPosition: result.value.anchor.position,
        anchorOperation: result.value.anchor.operation,
        locator: result.value.anchor.locator,
      },
    };
  }

  // Every contributor came back INACTIVE or UNKNOWN. That is NOT "not
  // stealthed" — see the module header.
  return { value: "UNKNOWN", checked };
}

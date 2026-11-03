/**
 * The Havoc Demon Hunter reading of applicability and usability (ONB-A1).
 *
 * APPLICABILITY, IN THE PINNED ORDER. The domain boundary first
 * (`domain-boundary.ts`). Then the constructor readings: an action built on
 * `spell_data_t::not_found()` is background (action.cpp:541-549), and an untaken
 * talent yields exactly that.
 *
 *     eye_beam           talent.havoc.eye_beam (:4095-4096)
 *     essence_break      talent.havoc.essence_break (:7804-7805)
 *     the_hunt           talent.havoc.the_hunt (:5612, :11290)
 *     felblade           talent.demon_hunter.felblade (:7875-7876)
 *     vengeful_retreat   talent.demon_hunter.vengeful_retreat (:8588-8589)
 *     reavers_glaive     looked up through Art of the Glaive (:8431-8432, :11317)
 *
 * Baseline spells have no guard. A talent proven not taken by the resolved hero
 * tree is background too. An UNKNOWN build fact never excludes anything.
 *
 * USABILITY: THE PROOFS, AND NOTHING IN BETWEEN
 *
 *     SIMULATED_PREFIX_EXECUTION  this branch already fired the entry, or its token
 *     PROVEN_USABLE               the observed cast itself
 *     ACTIVE_COOLDOWN             Metamorphosis's derived cooldown, proven past tolerance
 *     REQUIRED_AURA_INACTIVE      reavers_glaive with its buff proven down, unless this
 *                                 branch consumed a soul that could have raised it
 *     PROVEN_USABLE               reavers_glaive's positive conclusion
 *                                 (`positive-usability.ts`), last
 *
 * NOTHING ELSE. No Fury is reconstructed, so no INSUFFICIENT_RESOURCE is claimed. The
 * `ready()` gates on Metamorphosis's buff (Annihilation, Death Sweep, Blade Dance, Chaos
 * Strike) are not read, because no decision the slice resolves depends on them.
 */

import type { AplAction } from "../../../simc/apl-authority.js";
import {
  applicable,
  notApplicable,
  provenUnusable,
  provenUsable,
  unknownApplicability,
  unknownUsability,
  type ActionApplicability,
  type ActionUsabilityVerdict,
} from "../../../simc/action-applicability.js";
import type { CooldownReadiness } from "../../../engine/game-state/cooldowns/cooldown-usability.js";
import type { TalentResolution } from "../../../data/game/talent-selection.js";
import { havocTokenBinding } from "../../../data/game/demonhunter-havoc-gcd-semantics.js";
import type { PositiveUsability } from "../../../findings/usability/usability-completeness.js";
import type { ReaversGlaiveReadinessFact } from "./aura-bindings.js";
import { havocNonDomainApplicabilityFor } from "./domain-boundary.js";
import { hasExecuted, type ExecutedEntry, type HavocFirstGcdState } from "./first-gcd-state.js";

/** Token → the pinned talent whose absence makes the action `not_found()`-background. */
export const TALENT_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  eye_beam: "eye_beam",
  essence_break: "essence_break",
  the_hunt: "the_hunt",
  felblade: "felblade",
  vengeful_retreat: "vengeful_retreat",
  reavers_glaive: "art_of_the_glaive",
});

export const REAVERS_GLAIVE_TOKEN = "reavers_glaive";

/** The proven build facts the applicability rules read. Resolved once per actor. */
export interface HavocBuildFacts {
  /** Every modelled talent's three-way resolution, by SimulationCraft name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

/** Whether an APL entry is a selectable foreground action for this player. */
export function resolveHavocApplicability(facts: HavocBuildFacts, action: AplAction): ActionApplicability {
  const nonDomain = havocNonDomainApplicabilityFor(action);
  if (nonDomain !== null) return nonDomain;

  const talentBuilt = TALENT_BUILT_TOKENS[action.actionToken];
  if (talentBuilt === undefined) return applicable();
  if (facts.talents[talentBuilt]?.selection === "SELECTED") return applicable();
  if (facts.talentsProvenAbsent.has(talentBuilt)) {
    return background(
      `the action is built on talent '${talentBuilt}', which is proven not taken; an action built on ` +
        "spell_data_t::not_found() is background (action.cpp:541-549)",
    );
  }
  return unknownApplicability(
    `the action is built on talent '${talentBuilt}', and the observed talent tree does not resolve it`,
  );
}

/** Only PROVEN_NOT_READY is ever acted on. */
export interface HavocReadinessFact {
  readonly simcToken: string;
  readonly readiness: CooldownReadiness;
  readonly abilityGameId: number | null;
}

export const NO_READINESS_FACTS: readonly HavocReadinessFact[] = [];

export interface HavocUsabilityInput {
  readonly state: HavocFirstGcdState;
  readonly action: AplAction;
  readonly observedAbilityGameId: number;
  readonly readiness: readonly HavocReadinessFact[];
  readonly reaversGlaive: ReaversGlaiveReadinessFact;
  /** Per-token positive usability conclusions for this decision. */
  readonly positiveUsability?: ReadonlyMap<string, PositiveUsability>;
}

function simulated(detail: string): ActionUsabilityVerdict {
  return provenUnusable("SIMULATED_PREFIX_EXECUTION", {
    abilityGameId: null,
    itemId: null,
    provenRemainingAtLeastMs: null,
    cooldownToleranceMs: null,
    detail,
  });
}

export function resolveHavocUsability(input: HavocUsabilityInput): ActionUsabilityVerdict {
  const { state, action, observedAbilityGameId, readiness, reaversGlaive } = input;
  const entry: ExecutedEntry = {
    listName: action.listName,
    priorityOrdinal: action.priorityOrdinal,
    actionToken: action.actionToken,
    sourceLine: action.sourceLine,
  };

  // HYPOTHETICAL FIRST, under its own reason.
  if (hasExecuted(state, entry)) {
    return simulated(
      "HYPOTHETICAL, not observed: in this explored branch this authority entry has already been selected " +
        "once, and nothing returns it at zero elapsed time. This says nothing about what the player did.",
    );
  }
  if (state.sharedCooldownTokens.includes(action.actionToken)) {
    return simulated(
      "HYPOTHETICAL, not observed: in this explored branch an entry naming this token has already fired, and " +
        "nothing returns it at zero elapsed time. This says nothing about what the player did.",
    );
  }

  // OBSERVED SECOND. The cast that demonstrably fired demonstrably was usable.
  const binding = havocTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  // A DERIVED cooldown proven to exceed the queueing tolerance.
  const fact = readiness.find((row) => row.simcToken === action.actionToken);
  if (fact !== undefined && fact.readiness.state === "PROVEN_NOT_READY") {
    return provenUnusable("ACTIVE_COOLDOWN", {
      abilityGameId: fact.abilityGameId,
      itemId: null,
      provenRemainingAtLeastMs: fact.readiness.provenRemainingAtLeastMs,
      cooldownToleranceMs: fact.readiness.cooldownToleranceMs,
      detail:
        "the ability's own cooldown, anchored on the actor's last OBSERVED cast before this decision under the " +
        "pinned base, is proven to exceed the queueing tolerance, so action_t::ready cannot succeed. The bound " +
        "is a LOWER bound and is compared as one.",
    });
  }

  if (action.actionToken === REAVERS_GLAIVE_TOKEN) {
    if (reaversGlaive.state === "PROVEN_DOWN") {
      // A branch that consumed a soul may have raised the buff, so the proof, about
      // the real decision, says nothing about this branch. A buff proven UP stays up:
      // nothing a contract names removes it, and 40 yards covers the retreat.
      if (state.forgottenBuffs.includes("reavers_glaive")) return unknownUsability();
      return provenUnusable("REQUIRED_AURA_INACTIVE", {
        abilityGameId: reaversGlaive.wireAuraId,
        itemId: null,
        provenRemainingAtLeastMs: null,
        cooldownToleranceMs: null,
        detail:
          "reavers_glaive_t::ready requires buff.reavers_glaive up (sc_demon_hunter.cpp:8459-8464), and it is proven " +
          "down at this decision, by an observed removal or by a build that cannot produce it.",
      });
    }
  }

  // POSITIVE, LAST: every usability dimension proven or not applicable.
  if (input.positiveUsability?.get(action.actionToken)?.kind === "PROVEN_USABLE") return provenUsable();

  return unknownUsability();
}

/**
 * `buff.<name>.up` and form state: the Feral-owned reading of aura presence (ONB-C1).
 *
 * FOUR PROOFS, AND ONLY FOUR:
 *
 *     OBSERVED               M4 answers EXACT at the decision: ACTIVE binds `up: true`; INACTIVE,
 *                            a removal M4 observed and proved nothing reversed since, binds
 *                            `up: false`
 *     TALENT_NOT_SELECTED    the talent producing the buff is proven not taken
 *     OWN_CAT_FORM_CAST      Cat Form only, from this decision's own cast. See below
 *     BROKEN_BY_OWN_ACTION   Prowl and Shadowmeld only, from an earlier harmful cast of the actor's.
 *                            See below
 *
 * Anything else leaves the atom unbound and the shared evaluator enumerates it. A buff that was up
 * at the pull produces no event, and the combatant snapshot this project normalizes carries no
 * auras, so M4's answer before the first transition is UNKNOWN.
 *
 * FORM STATE IS WHY THE LAST TWO EXIST. Feral plays in Cat Form from before the pull, so the log
 * holds no Cat Form transition until the first shift (23.6 s into one retained subject, and 114.7 s
 * into the other). Without them `default[1] cat_form` would stay open for that whole
 * stretch.
 *
 * OWN_CAT_FORM_CAST. Every ability in `CAT_ONLY_TOKENS` has `_stance_mask` 0x1 in the pinned spell
 * data, which is `form_mask` (sc_druid.cpp:1763), and `ready()` is false in another form unless the
 * action autoshifts (:1843). It autoshifts only with Fluid Form (:2094-2105). So an observed cast
 * of one proves Cat Form was up before it, or that Fluid Form is taken. Either way the one line
 * that reads this atom, `cat_form,if=!buff.cat_form.up&!talent.fluid_form`, is FALSE, and that holds
 * with Fluid Form unresolved. It is bound only where M4 has no answer: an EXACT M4 answer is never
 * overridden. A test pins that the list reads this atom on that one line only, so a second reader
 * has to revisit this.
 *
 * BROKEN_BY_OWN_ACTION. Stealth has no transition before the first decision of many pulls, and
 * retained subjects hold no Prowl event at all. But a foreground action without `ALLOWSTEALTH`
 * expires both buffs (sc_druid.cpp:1874-1881), and every `FERAL_HARMFUL_TOKENS` spell clears
 * `SX_NO_STEALTH_BREAK`. So M4 saying the state is ambiguous only because no transition exists, under
 * coverage that could have shown one (`AMBIGUOUS_INITIAL_STATE`), plus a harmful cast strictly before
 * the decision, proves the buff down. Any later application is a transition, which M4 answers first.
 *
 * NO FUTURE ORACLE, AND ONE MILLISECOND OF SKEW. The query is `BEFORE_EVENT` at the decision, the state
 * SimulationCraft evaluates before executing. The log can place a cast's own effect 0 or 1 ms ahead of
 * the cast, so an edge within `AURA_EDGE_SKEW_MS` proves nothing, except the one edge the decision's
 * own action is pinned to write, in the direction it writes it (`OWN_ACTION_AURA_EDGES`), which is read
 * from before that edge. This is the rule Havoc's slice earned on its own subject.
 */

import { fromSource } from "../../../engine/auras/aura-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import { sourceRef, targetRef } from "../../../engine/normalization/normalized-events.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import type { UnknownReason } from "../../../engine/state/state-result.js";
import {
  FERAL_AURA_IDENTITIES,
  feralBsIncAuraFor,
  type FeralAuraIdentity,
} from "../../../data/game/druid-feral-aura-authority.js";
import type { TalentResolution } from "../../../data/game/talent-selection.js";
import { engagedBefore, FERAL_HARMFUL_TOKENS, type FeralCastFacts } from "./combat-engagement.js";

/** How far before its cause the retained logs place a cast's own aura effect. */
export const AURA_EDGE_SKEW_MS = 2;

/** The abilities with `_stance_mask` 0x1 in the pinned spell data: Cat Form only. */
export const CAT_ONLY_TOKENS: readonly string[] = FERAL_HARMFUL_TOKENS;

const STEALTH_BROKEN_BY_THE_CAST = { prowl: "REMOVED", shadowmeld: "REMOVED" } as const;

/** The edges each action writes as part of its own execute, from the pinned module. */
export const OWN_ACTION_AURA_EDGES: Readonly<
  Record<string, Readonly<Record<string, "APPLIED" | "REMOVED">>>
> = Object.freeze({
  // druid_form_t's set_form (sc_druid.cpp:3603 and the form's buff).
  cat_form: { cat_form: "APPLIED" },
  // :1874-1881, for every harmful token.
  rake: STEALTH_BROKEN_BY_THE_CAST,
  rip: STEALTH_BROKEN_BY_THE_CAST,
  shred: STEALTH_BROKEN_BY_THE_CAST,
  swipe_cat: STEALTH_BROKEN_BY_THE_CAST,
  primal_wrath: STEALTH_BROKEN_BY_THE_CAST,
  moonfire_cat: STEALTH_BROKEN_BY_THE_CAST,
  feral_frenzy: STEALTH_BROKEN_BY_THE_CAST,
  frantic_frenzy: STEALTH_BROKEN_BY_THE_CAST,
  chomp: STEALTH_BROKEN_BY_THE_CAST,
  // Ferocious Bite also consumes the proc it is free under (ferocious_bite_base_t::execute).
  ferocious_bite: { ...STEALTH_BROKEN_BY_THE_CAST, apex_predators_craving: "REMOVED" },
});

export interface FeralAuraInput {
  readonly state: CombatState;
  readonly actorId: number;
  /** Canonical index of the decision point. Never an ingestion ordinal. */
  readonly position: number;
  readonly talents: Readonly<Record<string, TalentResolution>>;
  readonly talentsProvenAbsent: ReadonlySet<string>;
  readonly castFacts: FeralCastFacts;
  readonly decisionReportTimeMs: number;
  readonly observedToken: string;
}

export type FeralAuraBinding =
  | {
      readonly atomName: string;
      readonly state: "BOUND";
      readonly up: boolean;
      readonly abilityGameId: number;
      readonly proof: "OBSERVED";
      readonly anchorPosition: number;
      readonly anchorLocator: EvidenceLocator;
    }
  | {
      readonly atomName: string;
      readonly state: "BOUND";
      readonly up: false;
      readonly abilityGameId: number;
      readonly proof: "TALENT_NOT_SELECTED";
      readonly basis: string;
    }
  | {
      readonly atomName: "cat_form";
      readonly state: "BOUND";
      readonly up: true;
      readonly abilityGameId: number;
      readonly proof: "OWN_CAT_FORM_CAST";
      readonly observedToken: string;
    }
  | {
      readonly atomName: string;
      readonly state: "BOUND";
      readonly up: false;
      readonly abilityGameId: number;
      readonly proof: "BROKEN_BY_OWN_ACTION";
      readonly brokenByCastAtMs: number;
    }
  | {
      readonly atomName: string;
      readonly state: "UNBOUND";
      readonly reason: "AURA_STATE_UNKNOWN" | "AURA_EDGE_WITHIN_SKEW" | "BUILD_NOT_RESOLVED";
      readonly abilityGameId: number | null;
      readonly auraReason: UnknownReason | null;
    };

/** Binds one pinned identity's PRESENCE at a decision position. */
function bindIdentity(input: FeralAuraInput, identity: FeralAuraIdentity): FeralAuraBinding {
  const { atomName, abilityGameId } = identity;
  if (identity.producedByTalent !== null && input.talentsProvenAbsent.has(identity.producedByTalent)) {
    return {
      atomName,
      state: "BOUND",
      up: false,
      abilityGameId,
      proof: "TALENT_NOT_SELECTED",
      basis: `talent '${identity.producedByTalent}' is proven not taken, so the buff never comes up in this build`,
    };
  }
  const presenceBefore = (position: number) =>
    input.state.auras.presenceAt({
      target: targetRef(input.actorId, null),
      abilityGameId,
      auraClass: "BUFF",
      source: fromSource(sourceRef(input.actorId, null)),
      at: { anchor: "BEFORE_EVENT", position },
    });
  let result = presenceBefore(input.position);
  if (
    result.certainty === "EXACT" &&
    input.decisionReportTimeMs - result.value.anchor.locator.reportTimeMs <= AURA_EDGE_SKEW_MS
  ) {
    const withinSkew: FeralAuraBinding = {
      atomName,
      state: "UNBOUND",
      reason: "AURA_EDGE_WITHIN_SKEW",
      abilityGameId,
      auraReason: null,
    };
    const edge = input.state.eventAt(result.value.anchor.position);
    const expected = OWN_ACTION_AURA_EDGES[input.observedToken]?.[atomName];
    if (edge?.kind !== "AURA" || expected === undefined || edge.operation !== expected) return withinSkew;
    result = presenceBefore(result.value.anchor.position);
    if (
      result.certainty === "EXACT" &&
      input.decisionReportTimeMs - result.value.anchor.locator.reportTimeMs <= AURA_EDGE_SKEW_MS
    ) {
      return withinSkew;
    }
  }
  if (result.certainty === "EXACT") {
    return {
      atomName,
      state: "BOUND",
      up: result.value.presence === "ACTIVE",
      abilityGameId,
      proof: "OBSERVED",
      anchorPosition: result.value.anchor.position,
      anchorLocator: result.value.anchor.locator,
    };
  }
  const auraReason = "reason" in result ? result.reason : null;
  if (atomName === "cat_form" && CAT_ONLY_TOKENS.includes(input.observedToken)) {
    return {
      atomName: "cat_form",
      state: "BOUND",
      up: true,
      abilityGameId,
      proof: "OWN_CAT_FORM_CAST",
      observedToken: input.observedToken,
    };
  }
  const brokenBy = input.castFacts.harmfulCastMs[0];
  if (
    (atomName === "prowl" || atomName === "shadowmeld") &&
    auraReason === "AMBIGUOUS_INITIAL_STATE" &&
    brokenBy !== undefined &&
    engagedBefore(input.castFacts, input.decisionReportTimeMs)
  ) {
    return {
      atomName,
      state: "BOUND",
      up: false,
      abilityGameId,
      proof: "BROKEN_BY_OWN_ACTION",
      brokenByCastAtMs: brokenBy,
    };
  }
  return { atomName, state: "UNBOUND", reason: "AURA_STATE_UNKNOWN", abilityGameId, auraReason };
}

/** Every observed-aura atom of the slice, `bs_inc` included, at one decision. */
export function bindSupportedFeralAuras(input: FeralAuraInput): readonly FeralAuraBinding[] {
  const named = FERAL_AURA_IDENTITIES.map((identity) => bindIdentity(input, identity));
  const bsInc = feralBsIncAuraFor(input.talents["incarnation_cat"]?.selection);
  return [
    ...named,
    bsInc === null
      ? {
          atomName: "bs_inc",
          state: "UNBOUND",
          reason: "BUILD_NOT_RESOLVED",
          abilityGameId: null,
          auraReason: null,
        }
      : bindIdentity(input, bsInc),
  ];
}

/** The `knownBuffs` shape, from the bindings that bound. */
export function feralBuffBindingsFrom(
  bindings: readonly FeralAuraBinding[],
): readonly { readonly name: string; readonly up: boolean }[] {
  const known: { name: string; up: boolean }[] = [];
  for (const binding of bindings) {
    if (binding.state === "BOUND") known.push({ name: binding.atomName, up: binding.up });
  }
  return known;
}

/** `buff.<name>.up` by name: `null` while it is unbound, never false. */
export function feralBuffUp(bindings: readonly FeralAuraBinding[], atomName: string): boolean | null {
  const binding = bindings.find((entry) => entry.atomName === atomName);
  return binding?.state === "BOUND" ? binding.up : null;
}

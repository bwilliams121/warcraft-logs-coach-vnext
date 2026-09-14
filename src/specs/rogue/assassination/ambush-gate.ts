/**
 * The pinned `default[4]` Ambush gate, evaluated at one decision point.
 *
 * ONE QUESTION, STATED AS NARROWLY AS IT IS ANSWERED
 *
 *     does the authority's `default[4]` CONDITION hold here?
 *
 * That is all. It is emphatically NOT:
 *
 *   - "should Ambush be cast?"           — that needs global traversal, which
 *                                          this milestone does not implement
 *   - "is Ambush executable?"            — that is action readiness, a different
 *                                          question with a different answer
 *   - "what did the APL select?"         — `default[0..3]` are not evaluated
 *
 * DESIRABILITY IS NOT READINESS.
 *
 * SimulationCraft asks both, separately. The APL condition says an action is
 * WANTED; `action_ready()` says it is POSSIBLE. For Ambush the two use different
 * stealth masks — the condition reads `stealthed.rogue` (`STEALTH_BASIC |
 * STEALTH_ROGUE`), while `rogue_action_t::ready` reads `STEALTH_STANCE`, which
 * additionally includes Shadowmeld (sc_rogue.cpp:2783). They can disagree, and a
 * Blindside proc waives the readiness requirement entirely
 * (sc_rogue.cpp:2199-2208) without touching the condition. This module answers
 * only the first.
 *
 * WHY A FALSE GATE IS WORTH COMPUTING AT ALL
 *
 * A FALSE condition is exact knowledge: the authority does not want this action
 * here, whatever else is true. It is what lets a later traversal skip the line
 * soundly, and it is reached in the real fight through TWO independent talent
 * facts rather than through any stealth reasoning — which is precisely why
 * `stealthed.rogue` being TRUE does not make Ambush selected.
 *
 * NOTHING IS SPECIAL-CASED.
 *
 * The condition is parsed from the pinned artifact and handed to the shared
 * evaluator. The FALSE comes out of ordinary Kleene AND — `FALSE & UNKNOWN =
 * FALSE` — and not from any rule written about Ambush.
 */

import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import { resolveTalentSelection, type TalentResolution } from "../../../data/game/rogue-talents.js";
import type { AplAuthority } from "../../../simc/apl-authority.js";
import { parseSimcExpression } from "../../../simc/expression/parse.js";
import {
  evaluateSimcExpression,
  type AtomBindings,
  type ExpressionTrace,
} from "../../../simc/expression/evaluate.js";
import type { AuthorityRef, ResolvedAuthority } from "../../../findings/authority.js";
import { bindStealthedRogue, type StealthedRogueBinding } from "./stealth-state.js";

/** The entry this module evaluates. Pinned by ordinal, verified by token. */
export const AMBUSH_GATE_LIST_NAME = "default";
export const AMBUSH_GATE_PRIORITY_ORDINAL = 4;
export const AMBUSH_GATE_ACTION_TOKEN = "ambush";

/** The talents the pinned condition names. Read from the expression, not guessed. */
export const AMBUSH_GATE_TALENTS = ["blindside", "improved_ambush", "shrouded_suffocation"] as const;

/** Why the gate could not be decided. */
export type AmbushGateBlocker =
  /** The authority does not contain `default[4]`, or it is not an ambush line. */
  | "AUTHORITY_LINE_ABSENT"
  /** The condition is outside the supported expression subset. */
  | "UNSUPPORTED_AUTHORITY_EXPRESSION"
  /** More unresolved boolean atoms than the evaluator will enumerate. */
  | "TOO_MANY_UNRESOLVED_ATOMS"
  /** Supported syntax, but the state it depends on was not established. */
  | "UNRESOLVED_AUTHORITY_STATE";

export const AMBUSH_GATE_BLOCKERS = [
  "AUTHORITY_LINE_ABSENT",
  "UNSUPPORTED_AUTHORITY_EXPRESSION",
  "TOO_MANY_UNRESOLVED_ATOMS",
  "UNRESOLVED_AUTHORITY_STATE",
] as const satisfies readonly AmbushGateBlocker[];

/** The state the gate consumed, recorded so the answer is auditable. */
export interface AmbushGateEvidence {
  readonly stealthedRogue: StealthedRogueBinding;
  readonly talents: readonly TalentResolution[];
  /**
   * `variable.single_target` is always unbound.
   *
   * Its value is `spell_targets.fan_of_knives=1`, a per-scan count of Fan of
   * Knives' live target list (action.cpp:3832-3842). Warcraft Logs supplies no
   * enemy positional state, so the count is not historically reconstructible.
   * Recorded as a stated fact rather than an omission.
   */
  readonly variableSingleTarget: "UNKNOWN";
  /** Every locator the answer rests on, deduplicated, in canonical order. */
  readonly stateEvidence: readonly EvidenceLocator[];
}

export type AmbushGateResult =
  | {
      readonly kind: "AMBUSH_GATE";
      readonly status: "RESOLVED_TRUE" | "RESOLVED_FALSE";
      readonly authority: ResolvedAuthority;
      readonly conditionRaw: string;
      readonly trace: ExpressionTrace;
      readonly evidence: AmbushGateEvidence;
    }
  | {
      readonly kind: "AMBUSH_GATE";
      readonly status: "UNKNOWN";
      readonly blocker: AmbushGateBlocker;
      readonly authority: ResolvedAuthority | null;
      readonly conditionRaw: string | null;
      /** Present when the condition was actually evaluated. */
      readonly trace: ExpressionTrace | null;
      readonly evidence: AmbushGateEvidence | null;
      /** Safe, author-written detail. Never interpolated from upstream data. */
      readonly detail: string;
    };

export interface AmbushGateInput {
  readonly state: CombatState;
  readonly authority: AplAuthority;
  readonly actorId: number;
  /** Canonical index into `CombatFight.events`. The decision point Q. */
  readonly position: number;
  /** `combatantinfo.talentTree`, verbatim. Empty is honest and yields UNKNOWN talents. */
  readonly observedTalentEntries: readonly { readonly id: number; readonly nodeId: number | null }[];
}

function refFrom(
  authority: AplAuthority,
  line: { listName: string; priorityOrdinal: number; actionStringVerbatim: string; sourceLine: number },
): AuthorityRef {
  const { artifact } = authority;
  return {
    kind: "SIMC_APL",
    authorityId: artifact.authorityId,
    artifactRevision: artifact.artifactRevision,
    listName: line.listName,
    priorityOrdinal: line.priorityOrdinal,
    actionStringVerbatim: line.actionStringVerbatim,
    sourceLine: line.sourceLine,
  };
}

function resolvedFrom(authority: AplAuthority, ref: AuthorityRef): ResolvedAuthority {
  const { provenance } = authority.artifact;
  return {
    ref,
    provenance: {
      repository: provenance.repository,
      commitSha: provenance.commitSha,
      commitDate: provenance.commitDate,
      sourcePath: provenance.sourcePath,
      sourceSha256: provenance.sourceSha256,
      extractedOn: provenance.extractedOn,
    },
  };
}

/**
 * Evaluates the pinned `default[4]` condition at one decision point.
 *
 * Never returns nothing: an unreachable or unparseable line is an explicit
 * UNKNOWN with a blocker, so a silently skipped gate cannot look like a decided
 * one.
 */
export function evaluateDefaultAmbushGate(input: AmbushGateInput): AmbushGateResult {
  const { state, authority, actorId, position, observedTalentEntries } = input;

  const lookup = authority.actionsInList(AMBUSH_GATE_LIST_NAME);
  const action = lookup.found
    ? lookup.actions.find((entry) => entry.priorityOrdinal === AMBUSH_GATE_PRIORITY_ORDINAL)
    : undefined;

  // Verified by TOKEN as well as ordinal. A re-pin that reorders `default` must
  // not silently move this evaluation onto a different action.
  if (action === undefined || action.actionToken !== AMBUSH_GATE_ACTION_TOKEN) {
    return {
      kind: "AMBUSH_GATE",
      status: "UNKNOWN",
      blocker: "AUTHORITY_LINE_ABSENT",
      authority: null,
      conditionRaw: null,
      trace: null,
      evidence: null,
      detail: "the pinned authority has no ambush action at the expected default-list position",
    };
  }

  const ref = refFrom(authority, action);
  const resolved = resolvedFrom(authority, ref);
  const conditionRaw = action.conditionRaw;
  if (conditionRaw === null) {
    return {
      kind: "AMBUSH_GATE",
      status: "UNKNOWN",
      blocker: "AUTHORITY_LINE_ABSENT",
      authority: resolved,
      conditionRaw: null,
      trace: null,
      evidence: null,
      detail: "the pinned ambush line carries no condition, so there is no gate to evaluate",
    };
  }

  // ---- state, gathered before anything is decided ----

  const stealthedRogue = bindStealthedRogue({ state, actorId, position });
  const talents = AMBUSH_GATE_TALENTS.map((simcName) =>
    resolveTalentSelection(observedTalentEntries, simcName),
  );

  const stateEvidence: EvidenceLocator[] = [];
  if (stealthedRogue.value === "TRUE") stateEvidence.push(stealthedRogue.provenBy.locator);

  const evidence: AmbushGateEvidence = {
    stealthedRogue,
    talents,
    variableSingleTarget: "UNKNOWN",
    stateEvidence,
  };

  // ---- bindings: only what is POSITIVELY established ----
  //
  // An unbound boolean atom becomes an enumerated world, not `false`. A talent
  // that resolved UNKNOWN is therefore left out entirely rather than bound to a
  // value nobody proved.
  const knownTalents = talents
    .filter((talent) => talent.selection !== "UNKNOWN")
    .map((talent) => ({ name: talent.simcName, taken: talent.selection === "SELECTED" }));

  const bindings: AtomBindings = {
    // The gate names no resource atom, and this module establishes none. Stated
    // unknown rather than given a placeholder: until M5-C3b these were a literal
    // zero on the reasoning that the expression could not reach them, which was
    // true and still put an invented magnitude where a fact belongs.
    comboPoints: { state: "UNKNOWN_NUMBER", reason: "STATE_NOT_ESTABLISHED" },
    comboPointsDeficit: { state: "UNKNOWN_NUMBER", reason: "STATE_NOT_ESTABLISHED" },
    energyPct: { state: "UNKNOWN_NUMBER", reason: "STATE_NOT_ESTABLISHED" },
    // This gate reconstructs no DoT state, so no action is keyed. Since M5-D1 the
    // per-action map is what states that: an absent key resolves UNKNOWN_NUMBER,
    // so a module that never established a remaining duration still cannot
    // present one. An EMPTY LIST is the explicit form of "nothing established" —
    // omitting the field entirely would mean the same thing, and writing it makes
    // the claim visible.
    dotRemainsSecondsByAction: [],
    knownBuffs: [],
    knownTalents,
    ...(stealthedRogue.value === "TRUE" ? { stealthedRogue: true } : {}),
  };

  const parsed = parseSimcExpression(conditionRaw);
  if (!parsed.ok) {
    return {
      kind: "AMBUSH_GATE",
      status: "UNKNOWN",
      blocker: "UNSUPPORTED_AUTHORITY_EXPRESSION",
      authority: resolved,
      conditionRaw,
      trace: null,
      evidence,
      detail: "the pinned ambush condition is outside the supported expression subset",
    };
  }

  const evaluated = evaluateSimcExpression(parsed.ast, conditionRaw, bindings);
  if (evaluated.outcome === "UNSUPPORTED") {
    return {
      kind: "AMBUSH_GATE",
      status: "UNKNOWN",
      blocker: "TOO_MANY_UNRESOLVED_ATOMS",
      authority: resolved,
      conditionRaw,
      trace: null,
      evidence,
      detail:
        "the condition carries more unresolved boolean atoms than the evaluator will enumerate, so no world set was built",
    };
  }
  if (evaluated.outcome === "UNRESOLVED") {
    return {
      kind: "AMBUSH_GATE",
      status: "UNKNOWN",
      blocker: "UNRESOLVED_AUTHORITY_STATE",
      authority: resolved,
      conditionRaw,
      trace: evaluated.trace,
      evidence,
      detail: "the condition's value depends on authority state we did not establish",
    };
  }

  return {
    kind: "AMBUSH_GATE",
    status: evaluated.value ? "RESOLVED_TRUE" : "RESOLVED_FALSE",
    authority: resolved,
    conditionRaw,
    trace: evaluated.trace,
    evidence,
  };
}

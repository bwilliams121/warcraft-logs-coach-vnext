/**
 * Execution-option ACTIVITY (M11-G3-3): which execution-profile fields can
 * actually affect a given APL, from the pinned engine's semantics — not from
 * whether DPS happened to move.
 *
 *   ACTIVE_FOR_THIS_APL    the engine applies it on this APL's normal path
 *   INACTIVE_FOR_THIS_APL  the engine reads it only through a construct this
 *                          APL/spec does not have (e.g. no `.react`)
 *   ENGINE_GLOBAL          applied by the engine to every actor regardless of APL
 *   CONDITIONAL            applied only under a condition this profile or spec
 *                          state may or may not meet (named in `reason`)
 *
 * The APL facts are read from the APL's own action strings; the spec facts
 * (which of its actions are channeled or have cast times) are supplied by the
 * specialization. Pinned source locations are at commit 33622e9d.
 */

import type {
  ExecutionPlayerSettings,
  ExecutionProfile,
  ExecutionSimSettings,
} from "./execution-profiles.js";

export type ExecutionActivity =
  "ACTIVE_FOR_THIS_APL" | "INACTIVE_FOR_THIS_APL" | "ENGINE_GLOBAL" | "CONDITIONAL";

export interface AplExecutionFacts {
  /** Some action string uses `buff.<x>.react` or `react_pct` (makes buffs reactable, buff.cpp:480-530). */
  readonly usesReact: boolean;
  /** Some action string uses the `cast_delay` expression (action.cpp:3370). */
  readonly usesCastDelay: boolean;
}

export interface SpecExecutionFacts {
  /** APL actions that are channels, with the condition under which they are cast (e.g. a talent). */
  readonly channeledActions: readonly { readonly action: string; readonly condition: string }[];
  /** APL foreground actions with a cast time longer than the spell-queue window. */
  readonly castTimeActions: readonly string[];
  /** Where these facts come from (pinned class module / spell data). */
  readonly basis: string;
}

export function aplExecutionFacts(actionStrings: readonly string[]): AplExecutionFacts {
  return {
    usesReact: actionStrings.some((action) => /\.react\b|\.react_pct\b/.test(action)),
    usesCastDelay: actionStrings.some((action) => /\bcast_delay\b/.test(action)),
  };
}

export type ExecutionField = keyof ExecutionSimSettings | keyof ExecutionPlayerSettings;

export interface FieldActivity {
  readonly field: ExecutionField;
  readonly activity: ExecutionActivity;
  readonly reason: string;
}

export function classifyExecutionActivity(
  profile: ExecutionProfile,
  apl: AplExecutionFacts,
  spec: SpecExecutionFacts,
): readonly FieldActivity[] {
  const strict = profile.sim.strictGcdQueue;
  const channels = spec.channeledActions;
  const out: FieldActivity[] = [];
  const add = (field: ExecutionField, activity: ExecutionActivity, reason: string) =>
    out.push({ field, activity, reason });

  add(
    "strictGcdQueue",
    "ENGINE_GLOBAL",
    "selects the queued vs post-GCD scheduling branch for every GCD action (player.cpp:6942-6990)",
  );
  for (const field of ["queueLagMs", "queueLagStddevMs"] as const) {
    add(
      field,
      strict ? "CONDITIONAL" : "ACTIVE_FOR_THIS_APL",
      strict
        ? "applied only when the next action is queued before gcd_ready + gcd_lag"
        : "applied after every GCD foreground action while strict_gcd_queue is off (player.cpp:6979-6987)",
    );
  }
  for (const field of ["gcdLagMs", "gcdLagStddevMs", "queueGcdReductionMs"] as const) {
    add(
      field,
      strict ? "ACTIVE_FOR_THIS_APL" : "INACTIVE_FOR_THIS_APL",
      strict
        ? "strict_gcd_queue is on"
        : "read only when strict_gcd_queue is on (player.cpp:6982, action.cpp:2222)",
    );
  }
  for (const field of ["channelLagMs", "channelLagStddevMs"] as const) {
    add(
      field,
      channels.length === 0 ? "INACTIVE_FOR_THIS_APL" : "CONDITIONAL",
      channels.length === 0
        ? "applied only after a completed channel (player.cpp:6962); this spec's APL has none"
        : `applied after a completed channel: ${channels.map((c) => `${c.action} (${c.condition})`).join(", ")}`,
    );
  }
  for (const field of ["worldLagMs", "worldLagStddevMs"] as const) {
    add(
      field,
      "CONDITIONAL",
      "delays a cooldown finish only above 400 ms (action.cpp:2350), the GCD reset after an interrupted cast, and a channel's auto-attack reset",
    );
  }
  add(
    "cooldownToleranceMs",
    "ACTIVE_FOR_THIS_APL",
    "cooldown actions may be queued this long before they come off cooldown (cooldown.cpp:655)",
  );
  for (const field of ["auraDelayMs", "auraDelayStddevMs"] as const) {
    add(
      field,
      "ENGINE_GLOBAL",
      "every in-combat buff trigger is delayed by the aura delay (buff.cpp:295, :2138)",
    );
  }
  add(
    "simReactionTimeMs",
    "ENGINE_GLOBAL",
    "reaction for reactable buffs on actors without a player (buff.cpp:2699): enemies, not this player",
  );
  for (const field of [
    "reactionTimeMeanMs",
    "reactionTimeStddevMs",
    "reactionTimeNuMs",
    "reactionTimeOffsetMs",
    "reactionTimeMaxMs",
  ] as const) {
    add(
      field,
      apl.usesReact ? "ACTIVE_FOR_THIS_APL" : "INACTIVE_FOR_THIS_APL",
      apl.usesReact
        ? "the APL reads buff.<x>.react, so buffs are reactable and the player's reaction gates them"
        : "sampled only for reactable buffs, which only buff.<x>.react / react_pct makes reactable; this APL has neither",
    );
  }
  for (const field of ["brainLagMs", "brainLagStddevMs"] as const) {
    add(
      field,
      apl.usesCastDelay ? "ACTIVE_FOR_THIS_APL" : "INACTIVE_FOR_THIS_APL",
      "consumed only by the cast_delay APL expression (player.cpp:7013, action.cpp:3370)",
    );
  }
  add(
    "defaultSkill",
    "ENGINE_GLOBAL",
    "seeds every player's skill (player.cpp:1166); at 1 no action-failure roll happens",
  );
  add(
    "skill",
    "ENGINE_GLOBAL",
    "at 1 (and no skill debuff) no false-positive/negative action roll happens (action.cpp:1326-1365)",
  );
  add("travelVariance", "CONDITIONAL", "applies only to projectiles with travel time");
  for (const field of ["enableSpellQueue", "spellQueueWindowMs"] as const) {
    add(
      field,
      profile.player.enableSpellQueue && spec.castTimeActions.length > 0
        ? "CONDITIONAL"
        : "INACTIVE_FOR_THIS_APL",
      profile.player.enableSpellQueue
        ? `early selection applies only to casts longer than the window: ${spec.castTimeActions.join(", ") || "none in this APL"}`
        : "spell queue is off (action.cpp:2277)",
    );
  }
  add(
    "readyTrigger",
    "ENGINE_GLOBAL",
    "selects how a waiting player re-checks the APL: poll ~100 ± 10 ms (player.cpp:7130) or event triggers",
  );
  return out;
}

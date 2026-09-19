/**
 * Blood Death Knight's reviewed NON_GCD transition contracts (M11-B2).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD
 * entry fire hypothetically and rescans from the root; it does that only
 * under a contract that names what the execution WRITES, in words a reviewer
 * can check against the pinned source. No contract, no branch: the query
 * refuses rather than guessing what the action would have changed.
 *
 * WHY THESE THREE. Under the class/spec authority boundary every racial,
 * potion and item-use entry of the pinned list is OUTSIDE the rotational
 * decision domain and is classified non-applicable BEFORE selection
 * (`domain-boundary.ts`), so none of them ever needs a contract. Of the
 * in-domain entries, three are `_gcd` 0 in the pinned dataset —
 * `auto_attack` (default[0]), `vampiric_blood` (default[12]) and
 * `raise_dead` (high_prio_actions[0]) — and each writes nothing any LATER
 * entry of the pinned list reads, so a branch that fires one continues
 * against the caller's bindings untouched. Dancing Rune Weapon is `_gcd`
 * 1500 and is an ANSWER, never a step; it has no contract and needs none.
 *
 * ONE THING EACH CONTRACT DOES NOT SAY: that the entry was USABLE. Vampiric
 * Blood's cooldown is dynamic (Red Thirst, sc_death_knight.cpp:13143-13147)
 * and Raise Dead's `ready()` reads pet state this project does not model, so
 * both are UNKNOWN in both directions unless the decision's own cast proves
 * one; the query explores the world in which the entry fires and the world
 * in which it does not, and the answer stands only when both agree.
 */

import { SC_DEATH_KNIGHT_CPP_SHA256, type BloodAuraClaim } from "./deathknight-blood-aura-authority.js";

export type BloodTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface BloodNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly BloodTransitionWrite[];
  readonly claims: readonly BloodAuraClaim[];
}

const MODULE = "engine/class_modules/sc_death_knight.cpp";

const claim = (symbol: string, lines: string, text: string): BloodAuraClaim => ({
  sourcePath: MODULE,
  sourceSha256: SC_DEATH_KNIGHT_CPP_SHA256,
  symbol,
  lines,
  claim: text,
});

const AUTO_ATTACK: BloodNonGcdTransitionContract = {
  simcToken: "auto_attack",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY"],
  claims: [
    claim(
      "auto_attack_t::auto_attack_t",
      "7728-7754",
      'Built with no spell record (death_knight_melee_attack_t( "auto_attack", p )) and trigger_gcd = 0_ms: ' +
        "no GCD, no cost, no cooldown.",
    ),
    claim(
      "auto_attack_t::execute",
      "7756-7763",
      "Schedules main_hand_attack->schedule_execute() (and the off-hand's) and does nothing else: no buff is " +
        "triggered, no resource is gained, no cooldown is started, and no APL atom the pinned Blood list reads " +
        "is written. The swing itself is a later event the log reports separately, never a write of this entry.",
    ),
    claim(
      "auto_attack_t::ready",
      "7765-7771",
      "Ready only while not moving and no swing is scheduled. Once executed in a branch the swing IS " +
        "scheduled, so the entry cannot be selected again at zero elapsed time — SIMULATED_PREFIX_EXECUTION.",
    ),
  ],
};

const VAMPIRIC_BLOOD: BloodNonGcdTransitionContract = {
  simcToken: "vampiric_blood",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY"],
  claims: [
    claim(
      "vampiric_blood_t::vampiric_blood_t",
      "12785-12795",
      'death_knight_spell_t( "vampiric_blood", p, p->talent.blood.vampiric_blood ) — spell 55233, `_gcd` 0, ' +
        "cooldown 90,000 ms, duration 10,000 ms — harmful = false, target = p. Its cooldown is adjusted " +
        "dynamically by Runic Power spent under Red Thirst (13143-13147), which is why the Blood cooldown " +
        "dataset does not pin it and its readiness is UNKNOWN unless the decision's own cast proves it.",
    ),
    claim(
      "vampiric_blood_t::execute",
      "12797-12802",
      "Calls the base execute and triggers buffs.vampiric_blood on the actor. The base " +
        "death_knight_action_t::execute (6220-6244) runs Blood Draw only for a non-Blood specialization; the " +
        "base impact (6246-6290) records last_target only for a hostile target and increments Reaper's Mark " +
        "only on non-zero damage, and this spell deals none. The ONE atom written is `buff.vampiric_blood.up`, " +
        "which the pinned list reads at this entry's own gate (default[12] `if=!buff.vampiric_blood.up`) and " +
        "nowhere later; a branch that fires it steps past the entry under SIMULATED_PREFIX_EXECUTION, so the " +
        "written aura never has to be overlaid on the caller's bindings.",
    ),
    claim(
      "Vampiric Blood DBC record",
      "sc_spell_data.inc row 55233",
      "cooldown 90,000 ms, far longer than the queueing tolerance, so a fired Vampiric Blood is not " +
        "selectable again at zero elapsed time.",
    ),
  ],
};

const RAISE_DEAD: BloodNonGcdTransitionContract = {
  simcToken: "raise_dead",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY"],
  claims: [
    claim(
      "raise_dead_t::raise_dead_t",
      "12216-12225",
      'death_knight_summon_spell_t( "raise_dead", p, p->spec.raise_dead->ok() ? p->spec.raise_dead : ' +
        "p->talent.raise_dead ): for a Blood actor spec.raise_dead (46584, Unholy) is not found and the class " +
        "talent spell 46585 is used — `_gcd` 0, cooldown 120,000 ms, duration 60,000 ms. harmful, may_crit " +
        "and may_miss are false (death_knight_summon_spell_t, 6601-6608).",
    ),
    claim(
      "raise_dead_t::execute",
      "12240-12254",
      "Spawns the ghoul pet for the spell's duration; resets its own cooldown only when is_precombat with " +
        "spec.raise_dead (never in combat, never for Blood); All Will Serve is an Unholy talent. Pet state is " +
        "written and NOTHING in the pinned Blood list reads pet state, a cooldown of this entry, or any atom " +
        "this execution changes.",
    ),
    claim(
      "raise_dead_t::ready",
      "12256-12264",
      "Returns false while the ghoul pet is active. Once executed in a branch the pet IS active, so the entry " +
        "cannot be selected again at zero elapsed time. In the other direction the pet's state is NOT modelled " +
        "here: the entry's usability is UNKNOWN unless the decision's own cast proves it, and both worlds are " +
        "explored.",
    ),
  ],
};

export const BLOOD_NON_GCD_TRANSITIONS: readonly BloodNonGcdTransitionContract[] = Object.freeze([
  AUTO_ATTACK,
  VAMPIRIC_BLOOD,
  RAISE_DEAD,
]);

/** The contract for a token, or `null` when this milestone reviewed none. */
export function bloodTransitionContractFor(simcToken: string): BloodNonGcdTransitionContract | null {
  return BLOOD_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}

/**
 * Executing the precombat list for VARIABLE assignment only (ONB-S1).
 *
 * THE PINNED SEMANTICS (SimulationCraft 33622e9d1662ff0e451691edf85a6b49cc9d11d9)
 *
 *   reset        at every iteration reset each variable takes its
 *                `default_value_` (player.cpp:6727-6728) — the `default=` of
 *                the first `variable` action constructed for its name
 *                (`establishedVariableDefaults`)
 *   precombat    `combat_begin` walks the precombat list once, in order, and
 *                executes every action whose `action_ready()` holds
 *                (player.cpp:6150-6183). A variable line is ready when its
 *                `if=` holds (variable.cpp:355-367) and executes inline, exactly
 *                as in a combat scan
 *   the break    once a HARMFUL action has executed (it enters combat,
 *                action.cpp:1841-1842), the walk stops after the first action
 *                that is channelled or has no travel time (player.cpp:6180-6181)
 *                — so a line after a harmful action may never run
 *   persistence  nothing but a variable action or the next iteration reset
 *                writes a variable, so a value assigned in precombat is what
 *                every combat scan reads until a combat line writes it
 *
 * WHAT IS MODELLED
 *
 * The walk starts from the established defaults and executes each precombat
 * `variable` line with the same `executeVariableLine` combat scans use. Every
 * other precombat line is an action this module does not execute; it changes
 * no variable, but unless it is one of the pinned NON-HARMFUL core actions
 * (`PROVEN_NON_HARMFUL_PRECOMBAT_ACTIONS`) it may be the harmful action that
 * stops the walk. Every variable line after such a line therefore either ran
 * or did not: its effect is joined with the state before it — the same join an
 * undecided `if=` gets. A `call_action_list` or `run_action_list` in precombat
 * is not modelled: no value is carried.
 *
 * THE EVIDENCE BOUNDARY
 *
 * Precombat expressions read the state BEFORE THE PULL, which the evidence
 * does not establish. They are evaluated under `precombatBindings`: the build
 * (talents) and the specialization's vocabulary, and NOTHING the combat
 * decision observed — resources are UNKNOWN, no buff, DoT or cooldown state is
 * known, and no specialization atom carries a value. So a value that depends on
 * pre-pull buffs or resources stays UNKNOWN (or a join), and a talent-, constant-
 * or default-derived value resolves.
 *
 * WHAT IS CARRIED INTO COMBAT
 *
 * Only variables NO combat list writes. A combat write means the value a scan
 * starts with is an earlier scan's, which this project does not have, so those
 * stay UNKNOWN exactly as before. A combat `variable` line that cannot be
 * attributed to one name (malformed structure) could write any variable, so
 * then nothing is carried; a malformed precombat line taints every value, so
 * nothing is carried either.
 */

import { parseAplLine, type AplAuthority } from "./apl-authority.js";
import { evaluateCondition } from "./list-selection.js";
import {
  initialScanVariables,
  joinScanVariables,
  unknownNumber,
  type AtomBindings,
  type NumericBinding,
  type ScanVariables,
} from "./expression/evaluate.js";
import {
  establishedVariableDefaults,
  executeVariableLine,
  neverFoldedVariables,
  type VariableExecutionRecord,
} from "./variable-execution.js";

export const PRECOMBAT_LIST_NAME = "precombat";

/**
 * Core precombat actions pinned NON-HARMFUL, so they can never stop the walk:
 *
 *   snapshot_stats   `harmful = false` (engine/action/snapshot_stats.cpp:16-25;
 *                    created by player.cpp:11105-11106)
 *   flask, food,     `dbc_consumable_base_t` sets `harmful = false`
 *   augmentation,    (consumable.cpp:791-808); created by consumable.cpp:1013-1040
 *   potion
 */
export const PROVEN_NON_HARMFUL_PRECOMBAT_ACTIONS: readonly string[] = [
  "snapshot_stats",
  "flask",
  "food",
  "augmentation",
  "potion",
];

/** What one precombat line did, in list order. */
export type PrecombatStep =
  | {
      readonly kind: "VARIABLE";
      readonly priorityOrdinal: number;
      /** True when an earlier line may have stopped the walk: the effect was joined with the state before it. */
      readonly mayNotHaveRun: boolean;
      readonly execution: VariableExecutionRecord;
    }
  | {
      readonly kind: "ACTION";
      readonly priorityOrdinal: number;
      readonly actionToken: string;
      /** False only for a pinned non-harmful core action. */
      readonly mayStopWalk: boolean;
    }
  | { readonly kind: "LIST_DISPATCH"; readonly priorityOrdinal: number; readonly actionToken: string };

export type PrecombatCarry =
  | { readonly kind: "NO_PRECOMBAT_VARIABLES" }
  | {
      readonly kind: "NOT_CARRIED";
      readonly reason: "PRECOMBAT_TAINTED" | "PRECOMBAT_LIST_DISPATCH" | "UNATTRIBUTED_COMBAT_WRITE";
    }
  | {
      readonly kind: "CARRIED";
      /** Lower-cased name -> the value every combat scan starts with. */
      readonly values: ReadonlyMap<string, NumericBinding>;
      /** Precombat-assigned names a combat list also writes: not carried, they read UNKNOWN. */
      readonly writtenInCombat: readonly string[];
    };

export interface PrecombatVariableExecution {
  readonly carry: PrecombatCarry;
  readonly steps: readonly PrecombatStep[];
}

/**
 * The bindings precombat expressions are evaluated under: the build and the
 * vocabulary, nothing observed at a combat decision. See the module header.
 */
export function precombatBindings(bindings: AtomBindings): AtomBindings {
  const unknown = unknownNumber("STATE_NOT_ESTABLISHED");
  return {
    comboPoints: unknown,
    comboPointsDeficit: unknown,
    energyPct: unknown,
    knownBuffs: [],
    ...(bindings.knownTalents === undefined ? {} : { knownTalents: bindings.knownTalents }),
    ...(bindings.specAtoms === undefined
      ? {}
      : { specAtoms: { vocabulary: bindings.specAtoms.vocabulary, bound: [] } }),
  };
}

/** Executes the precombat list's variable lines under `precombatBindings(bindings)`. */
export function executePrecombatVariables(
  authority: AplAuthority,
  bindings: AtomBindings,
): PrecombatVariableExecution {
  const lookup = authority.actionsInList(PRECOMBAT_LIST_NAME);
  const precombat = lookup.found ? lookup.actions : [];
  if (!precombat.some((action) => action.entryKind === "VARIABLE_ASSIGNMENT")) {
    return { carry: { kind: "NO_PRECOMBAT_VARIABLES" }, steps: [] };
  }

  const defaults = establishedVariableDefaults(authority);
  const neverFolded = neverFoldedVariables(authority);
  const base = precombatBindings(bindings);
  const steps: PrecombatStep[] = [];
  let state: ScanVariables = { values: new Map(defaults), tainted: false };
  let mayHaveStopped = false;
  const named = new Set<string>();

  for (const action of precombat) {
    if (action.entryKind === "LIST_DISPATCH") {
      steps.push({
        kind: "LIST_DISPATCH",
        priorityOrdinal: action.priorityOrdinal,
        actionToken: action.actionToken,
      });
      return { carry: { kind: "NOT_CARRIED", reason: "PRECOMBAT_LIST_DISPATCH" }, steps };
    }
    if (action.entryKind === "PLAYER_ACTION") {
      const mayStopWalk = !PROVEN_NON_HARMFUL_PRECOMBAT_ACTIONS.includes(action.actionToken);
      if (mayStopWalk) mayHaveStopped = true;
      steps.push({
        kind: "ACTION",
        priorityOrdinal: action.priorityOrdinal,
        actionToken: action.actionToken,
        mayStopWalk,
      });
      continue;
    }
    const lineBindings: AtomBindings = { ...base, scanVariables: state };
    const gate = evaluateCondition(action, lineBindings);
    const execution = executeVariableLine(action, gate, lineBindings, state, defaults, neverFolded);
    // Either the walk reached this line, or an earlier harmful action stopped it.
    const next = mayHaveStopped ? joinScanVariables(state, execution.state, lineBindings) : execution.state;
    // A line that did not run still names a precombat variable: its value is
    // whatever the walk left, the default included.
    const record = execution.record;
    if (record.kind !== "INERT" && record.name !== null) named.add(record.name);
    state = next;
    steps.push({
      kind: "VARIABLE",
      priorityOrdinal: action.priorityOrdinal,
      mayNotHaveRun: mayHaveStopped,
      execution: execution.record,
    });
  }

  if (state.tainted) return { carry: { kind: "NOT_CARRIED", reason: "PRECOMBAT_TAINTED" }, steps };
  const combatWrites = namesWrittenInCombat(authority);
  if (combatWrites === null)
    return { carry: { kind: "NOT_CARRIED", reason: "UNATTRIBUTED_COMBAT_WRITE" }, steps };

  const values = new Map<string, NumericBinding>();
  const writtenInCombat: string[] = [];
  for (const name of [...named].sort()) {
    if (combatWrites.has(name)) {
      writtenInCombat.push(name);
      continue;
    }
    values.set(name, state.values.get(name) ?? unknownNumber("STATE_NOT_ESTABLISHED"));
  }
  return { carry: { kind: "CARRIED", values, writtenInCombat }, steps };
}

/**
 * Every variable name a `variable` or `cycling_variable` line OUTSIDE the
 * precombat list names, lower-cased — or `null` when such a line's structure
 * is malformed, so it could write any variable.
 */
function namesWrittenInCombat(authority: AplAuthority): ReadonlySet<string> | null {
  const names = new Set<string>();
  for (const action of authority.actions) {
    if (action.listName === PRECOMBAT_LIST_NAME || action.entryKind !== "VARIABLE_ASSIGNMENT") continue;
    const structure = parseAplLine(action.actionStringVerbatim);
    const named = structure.options.filter((option) => option.key === "name");
    if (!structure.balanced || structure.malformedSegments.length > 0 || named.length > 1) return null;
    const name = named[0]?.value;
    if (name !== undefined && name.length > 0) names.add(name.toLowerCase());
  }
  return names;
}

/**
 * The variables a combat scan starts with: the carried precombat values, or
 * nothing (every variable at its unknown incoming value). Memoised per
 * authority, talent list and vocabulary, which are all it reads.
 */
export function incomingScanVariables(authority: AplAuthority, bindings: AtomBindings): ScanVariables {
  const byTalents = getOrCreate(incomingCache, authority, () => new WeakMap());
  const byVocabulary = getOrCreate(byTalents, bindings.knownTalents ?? NO_TALENTS, () => new WeakMap());
  const vocabularyKey: object = bindings.specAtoms?.vocabulary ?? NO_VOCABULARY;
  const cached = byVocabulary.get(vocabularyKey);
  if (cached !== undefined) return cached;
  const execution = executePrecombatVariables(authority, bindings);
  const incoming: ScanVariables =
    execution.carry.kind === "CARRIED" && execution.carry.values.size > 0
      ? { values: execution.carry.values, tainted: false }
      : initialScanVariables();
  byVocabulary.set(vocabularyKey, incoming);
  return incoming;
}

const NO_TALENTS: object = Object.freeze({});
const NO_VOCABULARY: object = Object.freeze({});
const incomingCache = new WeakMap<AplAuthority, WeakMap<object, WeakMap<object, ScanVariables>>>();

function getOrCreate<K extends object, V>(map: WeakMap<K, V>, key: K, create: () => V): V {
  const existing = map.get(key);
  if (existing !== undefined) return existing;
  const created = create();
  map.set(key, created);
  return created;
}

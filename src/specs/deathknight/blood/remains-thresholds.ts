/**
 * The numeric thresholds the pinned Blood authority compares each
 * `buff.<name>.remains` atom against (M11-B4).
 *
 * READ FROM THE PARSED AUTHORITY, NEVER TYPED. `aura-remains.ts` refuses an
 * exact remainder that lies within `BLOOD_REMAINS_THRESHOLD_TOLERANCE_MS` of a
 * threshold the list actually compares that atom against; the thresholds are
 * therefore a fact ABOUT THE LIST, and this module derives them from the same
 * parsed conditions the traversal evaluates, so the two cannot disagree. At
 * the pinned revision they are:
 *
 *     buff.bone_shield.remains                 < 1.5 (sanlayn[0]), < 3 (deathbringer[4], [5])
 *     buff.essence_of_the_blood_queen.remains  < 1.5 (san_gift[0], sanlayn[1]), < 8 (sanlayn[9])
 *
 * WHAT COUNTS. A COMPARISON node whose one operand is the `BUFF_REMAINS` atom
 * and whose other operand is a NUMBER literal. `fight_remains>x.remains+10`
 * is NOT a threshold on `x.remains` — the atom sits inside arithmetic and the
 * other side is not a literal — and a bare-truth use has no threshold at all
 * (zero is the only value that changes it, and zero is never an exact
 * derivation, only a proof). Both are left out on purpose.
 *
 * A LIST FACT, NOT A GLOBAL TOLERANCE. Nothing here applies to any other
 * magnitude, any other atom or any other specialization.
 */

import type { ExpressionNode } from "../../../simc/expression/ast.js";
import { parseSimcExpression } from "../../../simc/expression/parse.js";
import type { AplAuthority } from "../../../simc/apl-authority.js";
import { pinnedBloodDeathKnightAuthority } from "./pinned-authority.js";
import { BLOOD_ATOM_VOCABULARY } from "./vocabulary.js";

/** One threshold, with the entry it was read from. */
export interface BloodRemainsThreshold {
  readonly atomName: string;
  /** The literal, in SECONDS as the list writes it. */
  readonly thresholdSeconds: number;
  readonly operator: string;
  /** `list[ordinal]` of the entry carrying the comparison. */
  readonly at: string;
}

function collect(node: ExpressionNode, at: string, into: BloodRemainsThreshold[]): void {
  switch (node.kind) {
    case "COMPARISON": {
      const { left, right } = node;
      if (left.kind === "BUFF_REMAINS" && right.kind === "NUMBER") {
        into.push({ atomName: left.buffName, thresholdSeconds: right.value, operator: node.operator, at });
      } else if (right.kind === "BUFF_REMAINS" && left.kind === "NUMBER") {
        into.push({ atomName: right.buffName, thresholdSeconds: left.value, operator: node.operator, at });
      }
      collect(left, at, into);
      collect(right, at, into);
      return;
    }
    case "AND":
    case "OR":
    case "ADD":
    case "SUBTRACT":
    case "MULTIPLY":
    case "EXTREMUM":
      collect(node.left, at, into);
      collect(node.right, at, into);
      return;
    case "NOT":
      collect(node.operand, at, into);
      return;
    default:
      return;
  }
}

/** Every remains threshold in an authority, in list order. Conditions that do not parse contribute nothing. */
export function remainsThresholdsOf(authority: AplAuthority): readonly BloodRemainsThreshold[] {
  const found: BloodRemainsThreshold[] = [];
  for (const action of authority.actions) {
    if (action.conditionRaw === null) continue;
    const parsed = parseSimcExpression(action.conditionRaw, BLOOD_ATOM_VOCABULARY);
    if (!parsed.ok) continue;
    collect(parsed.ast, `${action.listName}[${String(action.priorityOrdinal)}]`, found);
  }
  return found;
}

let cached: readonly BloodRemainsThreshold[] | null = null;

/** The pinned authority's thresholds, computed once. Empty when the authority did not load. */
export function pinnedBloodRemainsThresholds(): readonly BloodRemainsThreshold[] {
  if (cached !== null) return cached;
  const loaded = pinnedBloodDeathKnightAuthority();
  cached = loaded.ok ? remainsThresholdsOf(loaded.authority) : [];
  return cached;
}

/** The distinct thresholds (SECONDS) the pinned list compares one atom against, ascending. */
export function pinnedRemainsThresholdSecondsFor(atomName: string): readonly number[] {
  const values = new Set<number>();
  for (const threshold of pinnedBloodRemainsThresholds()) {
    if (threshold.atomName === atomName) values.add(threshold.thresholdSeconds);
  }
  return [...values].sort((a, b) => a - b);
}

/** Test seam. */
export function resetBloodRemainsThresholdCache(): void {
  cached = null;
}

/**
 * M11-D3-0 — a hypothetical transition's declared writes invalidate the
 * observed bindings they make stale, branch-locally, and nothing else.
 *
 * Before D3-0 every scan of every explored branch reused the decision's
 * bindings. Thistle Tea's contract declares PLAYER_ENERGY, yet the scans after
 * a hypothetical Tea read the pre-Tea PRE_COST `energy.pct`. The fix records,
 * per declared write, which bindings it invalidates
 * (`ATOMS_INVALIDATED_BY_WRITE`, exhaustive over `TransitionWrite`); a branch
 * that executes such a write reads those atoms as not established, and its
 * siblings keep the observed values. No post-transition value is inferred.
 *
 * The committed evidence is driven through the REAL Assassination analyzer:
 * its first-GCD queries and every scan they run are recorded (the wrappers
 * return the original results unchanged) so each scan can be tied to the
 * branch state it evaluated.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  TRANSITION_WRITES,
  transitionContractFor,
  type TransitionWrite,
} from "../../src/data/game/assassination-transition-authority.js";
import type { RotationalGcdResult } from "../../src/simc/first-gcd-selection.js";
import type { AtomBindings, NumericBinding } from "../../src/simc/expression/evaluate.js";
import { evaluateSimcExpression, knownNumber } from "../../src/simc/expression/evaluate.js";
import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import { ANALYZER_REGISTRATIONS } from "../../src/services/analyzer-registry.js";
import { SUPPORTED_COOLDOWN_TOKENS } from "../../src/specs/rogue/assassination/cooldown-bindings.js";
import { branchBindings } from "../../src/specs/rogue/assassination/first-gcd-adapter.js";
import {
  ATOMS_INVALIDATED_BY_WRITE,
  firstGcdStateKey,
  initialFirstGcdState,
  withExecution,
  withTransitionWrites,
  type AssassinationFirstGcdState,
} from "../../src/specs/rogue/assassination/first-gcd-state.js";
import { committedManifest } from "../support/corpus/artifacts.js";
import { corpusState } from "../support/corpus/fight.js";

// ---------------------------------------------------------------------------
// Recording the real queries
// ---------------------------------------------------------------------------

interface Scan {
  readonly state: AssassinationFirstGcdState;
  readonly bindings: AtomBindings;
}
interface Query {
  readonly artifactId: string;
  readonly actorId: number;
  readonly position: number;
  readonly bindings: AtomBindings;
  readonly result: RotationalGcdResult;
  readonly scans: Scan[];
}

const recorder = vi.hoisted(() => ({
  artifactId: "",
  query: null as null | { scans: { state: unknown; bindings: unknown }[] },
  scanState: null as unknown,
  queries: [] as unknown[],
}));

vi.mock("../../src/specs/rogue/assassination/first-gcd-adapter.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/specs/rogue/assassination/first-gcd-adapter.js")>();
  return {
    ...m,
    firstGcdSelectionAt: (input: Parameters<typeof m.firstGcdSelectionAt>[0]) => {
      const query = { scans: [] as { state: unknown; bindings: unknown }[] };
      recorder.query = query;
      const outcome = m.firstGcdSelectionAt(input);
      recorder.query = null;
      recorder.queries.push({
        artifactId: recorder.artifactId,
        actorId: input.actorId,
        position: input.position,
        bindings: input.bindings,
        result: outcome.result,
        scans: query.scans,
      });
      return outcome;
    },
  };
});
vi.mock("../../src/simc/first-gcd-selection.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/simc/first-gcd-selection.js")>();
  return {
    ...m,
    firstGcdSelectionAcrossRescans: (input: Parameters<typeof m.firstGcdSelectionAcrossRescans>[0]) =>
      m.firstGcdSelectionAcrossRescans({
        ...input,
        scanFor: (state) => {
          recorder.scanState = state;
          return input.scanFor(state);
        },
      }),
  };
});
vi.mock("../../src/simc/nested-selection.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/simc/nested-selection.js")>();
  return {
    ...m,
    resolveOneForegroundScan: (input: Parameters<typeof m.resolveOneForegroundScan>[0]) => {
      if (recorder.query !== null && recorder.scanState !== null) {
        recorder.query.scans.push({ state: recorder.scanState, bindings: input.bindings });
      }
      return m.resolveOneForegroundScan(input);
    },
  };
});

const queries = (): readonly Query[] => recorder.queries as Query[];

beforeAll(() => {
  const registration = ANALYZER_REGISTRATIONS.find((r) => r.specId === "rogue/assassination");
  if (registration === undefined) throw new Error("no Assassination registration");
  const artifacts = committedManifest()
    .artifacts.filter((a) => a.payloadKind === "WCL_EVENT_ARRAY" && a.artifactId.includes("assassination"))
    .map((a) => a.artifactId)
    .sort();
  for (const artifactId of artifacts) {
    recorder.artifactId = artifactId;
    const state = corpusState(artifactId);
    const actors = new Set<number>();
    for (const event of state.fight.events) {
      if (event.kind === "CAST" && event.castPhase === "COMPLETE" && event.source !== null) {
        actors.add(event.source.actorId);
      }
    }
    for (const actorId of [...actors].sort((a, b) => a - b)) {
      registration.analyze({ state, actorId, specId: registration.specId, targetActorId: null } as never);
    }
  }
}, 120_000);

const executed = (state: AssassinationFirstGcdState, token: string): boolean =>
  state.executedEntries.some((entry) => entry.actionToken === token);

function finalOf(result: RotationalGcdResult): string {
  if (result.kind === "ROTATIONAL_GCD_SELECTED") return `SELECTED ${result.actionToken}`;
  if (result.kind === "ROTATIONAL_GCD_UNKNOWN") {
    return result.scanBlocker === null ? result.blocker : `${result.blocker}/${result.scanBlocker}`;
  }
  return result.kind;
}

// ---------------------------------------------------------------------------
// A. Every declared write has an explicit invalidation decision
// ---------------------------------------------------------------------------

describe("the invalidation map is exhaustive over the declared writes", () => {
  it("names every TransitionWrite, and nothing else", () => {
    expect(Object.keys(ATOMS_INVALIDATED_BY_WRITE).sort()).toEqual([...TRANSITION_WRITES].sort());
  });

  it("invalidates energy.pct for PLAYER_ENERGY, and records every other write as invalidating nothing", () => {
    expect(ATOMS_INVALIDATED_BY_WRITE).toEqual({
      OWN_PREFIX_AVAILABILITY: [],
      PLAYER_ENERGY: ["energy.pct"],
      PLAYER_STAT_BUFF: [],
      PLAYER_DEBUFF_REMOVAL: [],
      DELAYED_STEALTH_EXPIRY: [],
      TARGET_CAST_INTERRUPT: [],
    } satisfies Record<TransitionWrite, readonly string[]>);
  });
});

// ---------------------------------------------------------------------------
// B. Every reusable observed binding is either invalidated or proven unchanged
// ---------------------------------------------------------------------------

/**
 * The observed fields `rotationalBindingsAt` supplies, and why each stays
 * sound across a hypothetical transition. A NEW field fails the test below
 * until it is added here with a reason.
 */
const BOUND_FIELD_COVERAGE: Readonly<
  Record<string, { readonly invalidatedBy: readonly TransitionWrite[]; readonly why: string }>
> = {
  comboPoints: { invalidatedBy: [], why: "no write in the closed set changes combo points" },
  comboPointsDeficit: { invalidatedBy: [], why: "no write in the closed set changes combo points" },
  energyPct: { invalidatedBy: ["PLAYER_ENERGY"], why: "the grant changes Energy and observes nothing" },
  dotRemainsSecondsByAction: { invalidatedBy: [], why: "no write touches a target DoT, and no time elapses" },
  dotRefreshableByAction: { invalidatedBy: [], why: "no write touches a target DoT, and no time elapses" },
  knownBuffs: { invalidatedBy: [], why: "always empty: no buff is bound" },
  knownTalents: { invalidatedBy: [], why: "the build; no transition changes a talent" },
  knownCooldownRemainsSeconds: {
    invalidatedBy: [],
    why: "derived only for kingsbane, deathmark and vanish, none of which has a transition contract",
  },
  stealthedRogue: {
    invalidatedBy: [],
    why: "DELAYED_STEALTH_EXPIRY: the pinned expiry is t+1ms and the query ends at t+0",
  },
};

const ATOM_OF_FIELD: Readonly<Record<string, string>> = { energyPct: "energy.pct" };

describe("every observed binding is accounted for", () => {
  it("the analyzer binds no field the coverage table does not name", () => {
    expect(queries().length).toBeGreaterThan(0);
    const fields = new Set(queries().flatMap((query) => Object.keys(query.bindings)));
    for (const field of fields) expect(BOUND_FIELD_COVERAGE, field).toHaveProperty(field);
  });

  it("each field's invalidating writes are exactly the ones the map names", () => {
    for (const [field, coverage] of Object.entries(BOUND_FIELD_COVERAGE)) {
      const atom = ATOM_OF_FIELD[field];
      const mapped = TRANSITION_WRITES.filter((write) =>
        atom === undefined ? false : (ATOMS_INVALIDATED_BY_WRITE[write] as readonly string[]).includes(atom),
      );
      expect(mapped, field).toEqual(coverage.invalidatedBy);
    }
  });

  it("no buff is ever bound, and no derived cooldown belongs to a transition", () => {
    for (const query of queries()) expect(query.bindings.knownBuffs).toEqual([]);
    for (const token of SUPPORTED_COOLDOWN_TOKENS) expect(transitionContractFor(token), token).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// C. Energy is forgotten exactly where PLAYER_ENERGY was written
// ---------------------------------------------------------------------------

const ENTRY = { listName: "default", priorityOrdinal: 3, actionToken: "thistle_tea", sourceLine: 83 };
const KICK = { listName: "default", priorityOrdinal: 1, actionToken: "kick", sourceLine: 81 };
const OBSERVED: NumericBinding = knownNumber(20);
const BINDINGS = {
  comboPoints: knownNumber(3),
  comboPointsDeficit: knownNumber(4),
  energyPct: OBSERVED,
  knownBuffs: [],
} as unknown as AtomBindings;

describe("branch-local, monotonic invalidation", () => {
  const root = initialFirstGcdState("OTHER");
  const tea = withTransitionWrites(withExecution(root, ENTRY), [
    "OWN_PREFIX_AVAILABILITY",
    "PLAYER_ENERGY",
    "PLAYER_STAT_BUFF",
  ]);
  const kick = withTransitionWrites(withExecution(root, KICK), [
    "OWN_PREFIX_AVAILABILITY",
    "TARGET_CAST_INTERRUPT",
    "DELAYED_STEALTH_EXPIRY",
  ]);

  it("a PLAYER_ENERGY write forgets energy.pct in that branch; the parent and the sibling keep it", () => {
    expect(tea.forgottenAtoms).toEqual(["energy.pct"]);
    expect(root.forgottenAtoms).toEqual([]);
    expect(kick.forgottenAtoms).toEqual([]);
    expect(branchBindings(BINDINGS, root)).toBe(BINDINGS);
    expect(branchBindings(BINDINGS, kick)).toBe(BINDINGS);
    expect(branchBindings(BINDINGS, tea).energyPct).toEqual({
      state: "UNKNOWN_NUMBER",
      reason: "STATE_NOT_ESTABLISHED",
    });
    expect(branchBindings(BINDINGS, tea).comboPoints).toBe(BINDINGS.comboPoints);
  });

  it("a later expression reading energy.pct never receives the stale pre-transition value", () => {
    const parsed = parseSimcExpression("energy.pct<30");
    if (!parsed.ok) throw new Error("parse");
    const before = evaluateSimcExpression(parsed.ast, "energy.pct<30", branchBindings(BINDINGS, root));
    const after = evaluateSimcExpression(parsed.ast, "energy.pct<30", branchBindings(BINDINGS, tea));
    expect(before.outcome === "RESOLVED" && before.value).toBe(true);
    expect(after.outcome).toBe("UNRESOLVED");
  });

  it("nothing brings the forgotten value back: later executions, repeated writes, repeated scans", () => {
    const later = withTransitionWrites(withExecution(tea, KICK), [
      "OWN_PREFIX_AVAILABILITY",
      "DELAYED_STEALTH_EXPIRY",
    ]);
    expect(later.forgottenAtoms).toEqual(["energy.pct"]);
    const again = withTransitionWrites(withExecution(tea, ENTRY), ["PLAYER_ENERGY"]);
    expect(again.forgottenAtoms).toEqual(["energy.pct"]);
    expect(withTransitionWrites(tea, ["PLAYER_ENERGY"])).toBe(tea);
    expect(branchBindings(BINDINGS, later).energyPct).toEqual(branchBindings(BINDINGS, tea).energyPct);
    expect(firstGcdStateKey(tea)).toContain("|forgot=[energy.pct]|");
    expect(firstGcdStateKey(kick)).not.toContain("forgot");
  });

  it("over the committed evidence, every scan after a PLAYER_ENERGY write reads Energy as not established, and every other scan reads the observed value", () => {
    let forgotten = 0;
    let kept = 0;
    for (const query of queries()) {
      for (const scan of query.scans) {
        if (executed(scan.state, "thistle_tea")) {
          expect(scan.bindings.energyPct).toEqual({
            state: "UNKNOWN_NUMBER",
            reason: "STATE_NOT_ESTABLISHED",
          });
          forgotten += 1;
        } else {
          expect(scan.bindings.energyPct).toBe(query.bindings.energyPct);
          kept += 1;
        }
      }
    }
    expect(forgotten).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// D + the committed regression: all 36 decisions
// ---------------------------------------------------------------------------

/**
 * Every committed decision the analyzer runs the first-GCD query for, with its
 * final result after D3-0 and whether its explored branches execute Thistle
 * Tea. The four marked CHANGED were DIVERGENT_GCD_OUTCOMES before D3-0: the
 * post-Tea branch reused the pre-Tea PRE_COST Energy, kept
 * `thistle_tea,if=energy.pct<30|fight_remains<10` true, fired Tea again and
 * diverged. With Energy forgotten that rescan blocks on the unobserved Energy.
 */
const B = "ONE_SCAN_BLOCKED/NO_DEFINITE_WINNER";
const DECISIONS: readonly (readonly [string, number, number, string, boolean])[] = [
  ["d2-decision-corpus", 19, 139, B, false],
  ["d2-decision-corpus", 19, 168, B, false],
  ["d2-decision-corpus", 19, 199, B, false],
  ["d2-decision-corpus", 19, 274, B, false],
  ["d2-decision-corpus", 19, 302, "SELECTED garrote", true],
  ["d2-decision-corpus", 19, 386, B, true], // CHANGED: was DIVERGENT_GCD_OUTCOMES
  ["d2-decision-corpus", 19, 537, B, true], // CHANGED: was DIVERGENT_GCD_OUTCOMES
  ["d2-decision-corpus", 19, 582, B, false],
  ["d2-decision-corpus", 19, 759, B, true], // CHANGED: was DIVERGENT_GCD_OUTCOMES
  ["d2-decision-corpus", 19, 928, B, true], // CHANGED: was DIVERGENT_GCD_OUTCOMES
  ["d2-decision-corpus", 19, 1077, B, false],
  ["envenom-combo-points", 13, 13, B, false],
  ["envenom-combo-points", 19, 2, B, false],
  ["envenom-combo-points", 19, 3, B, false],
  ["envenom-combo-points", 19, 4, B, false],
  ["envenom-combo-points", 19, 5, B, false],
  ["envenom-combo-points", 19, 6, B, false],
  ["envenom-combo-points", 19, 7, B, false],
  ["garrote-dot-remains", 19, 262, "DIVERGENT_GCD_OUTCOMES", true],
  ["high-parse-opener", 25, 22, B, false],
  ["high-parse-opener", 25, 94, B, false],
  ["high-parse-opener", 25, 196, B, false],
  ["high-parse-opener", 25, 266, B, false],
  ["high-parse-opener", 25, 350, B, false],
  ["high-parse-opener", 25, 428, B, false],
  ["high-parse-opener", 25, 528, B, false],
  ["high-parse-opener", 25, 741, B, false],
  ["high-parse-opener", 25, 913, B, false],
  ["high-parse-opener", 25, 1214, B, false],
  ["high-parse-opener", 25, 1411, B, false],
  ["kingsbane-cooldown", 19, 139, B, false],
  ["kingsbane-cooldown", 19, 168, B, false],
  ["kingsbane-cooldown", 19, 199, B, false],
  ["kingsbane-cooldown", 19, 274, B, false],
  ["kingsbane-cooldown", 19, 302, "SELECTED garrote", true],
  ["vanish-ambush-gate", 19, 3, B, false],
];

describe("the 36 committed Assassination decisions", () => {
  const actual = () =>
    queries()
      .map((q) => [
        q.artifactId.replace("wcl-assassination-", ""),
        q.actorId,
        q.position,
        finalOf(q.result),
        q.scans.some((scan) => executed(scan.state, "thistle_tea")),
      ])
      .sort((a, b) =>
        `${String(a[0])}|${String(a[1]).padStart(4)}|${String(a[2]).padStart(6)}`.localeCompare(
          `${String(b[0])}|${String(b[1]).padStart(4)}|${String(b[2]).padStart(6)}`,
        ),
      );

  it("keep exactly their pinned final results: 34 UNKNOWN, 2 SELECTED garrote, 7 exploring Thistle Tea", () => {
    expect(actual()).toEqual(DECISIONS);
    expect(DECISIONS.filter((d) => d[3] === "SELECTED garrote")).toHaveLength(2);
    expect(DECISIONS.filter((d) => d[4])).toHaveLength(7);
  });

  it("DELAYED_STEALTH_EXPIRY is not an immediate expiry: stealth stays bound through every Kick branch", () => {
    // Pinned in the Kick contract: break_stealth expires stealth and vanish at
    // t+1ms; the rescan and the selected GCD are at t+0; a non-zero time
    // advance is refused. So a TRUE `stealthed.rogue` holds at every scan.
    const stealthed = [
      ["d2-decision-corpus", 302, "SELECTED garrote"],
      ["kingsbane-cooldown", 302, "SELECTED garrote"],
      ["garrote-dot-remains", 262, "DIVERGENT_GCD_OUTCOMES"],
    ] as const;
    for (const [artifact, position, final] of stealthed) {
      const query = queries().find(
        (q) => q.artifactId === `wcl-assassination-${artifact}` && q.position === position,
      );
      expect(query, `${artifact} ${String(position)}`).toBeDefined();
      if (query === undefined) continue;
      expect(query.bindings.stealthedRogue).toBe(true);
      const afterKick = query.scans.filter((scan) => executed(scan.state, "kick"));
      expect(afterKick.length).toBeGreaterThan(0);
      for (const scan of afterKick) expect(scan.bindings.stealthedRogue).toBe(true);
      expect(finalOf(query.result)).toBe(final);
    }
  });
});

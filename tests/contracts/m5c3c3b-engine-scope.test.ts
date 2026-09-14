/**
 * What M5-C3c3b is, and — more importantly — what it is not allowed to be.
 *
 * The rescan engine is generic. It must not learn the game, and it must not be
 * quietly pointed at the real Rogue authority to produce a global Garrote
 * answer, because the transitions that answer would depend on do not exist:
 *
 *     Kick        readiness depends on enemy cast state; not modelled
 *     Thistle Tea condition depends on predictive `fight_remains`; not modelled
 *     potion      identity, readiness and effects; not modelled
 *     racials     race is unknowable from Warcraft Logs; not modelled
 *
 * All four are M5-C3c3c. Until then the engine is correct and unapplied, and
 * these assertions exist so that stays true by accident-proofing rather than by
 * good intentions.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ROTATIONAL_GCD_BLOCKERS,
  firstGcdSelectionAcrossRescans,
} from "../../src/simc/first-gcd-selection.js";
import {
  resolveOneForegroundScan,
  selectAcrossLists,
  TRAVERSAL_BLOCKERS,
} from "../../src/simc/nested-selection.js";

const ENGINE_PATH = "src/simc/first-gcd-selection.ts";

function filesUnder(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: false })
    .map((entry) => `${root}/${String(entry).replace(/\\/g, "/")}`)
    .filter((path) => statSync(path).isFile() && path.endsWith(".ts"));
}

/** Source with comments stripped: the prohibition is on CODE, not on prose. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the engine knows nothing about the game", () => {
  it("names no gameplay concept in its code", () => {
    // WORD-BOUNDARY matched, not substring. `race` is a substring of `trace`,
    // and a blunt check here would either fail on the trace model or have to be
    // exempted — and an exempted rule is not a rule.
    const code = codeOf(ENGINE_PATH);
    for (const forbidden of [
      "energy",
      "stealth",
      "combo",
      "cooldown",
      "garrote",
      "potion",
      "race",
      "racial",
      "talent",
      "aura",
      "buff",
      "abilityGameId",
      "spellId",
      "itemId",
    ]) {
      const pattern = new RegExp(`\\b${forbidden}`, "i");
      expect(pattern.test(code), `${ENGINE_PATH} names '${forbidden}'`).toBe(false);
    }
  });

  it("imports no specialization, Warcraft Logs or findings module", () => {
    const code = codeOf(ENGINE_PATH);
    expect(code).not.toContain("/specs/");
    expect(code).not.toContain("/wcl/");
    expect(code).not.toContain("/findings/");
    expect(code).not.toContain("/engine/");
  });

  it("reads no game DATA, only the lane vocabulary as a type", () => {
    const raw = readFileSync(ENGINE_PATH, "utf8");
    // A type-only import of the three-member lane union. No value import, so no
    // artifact is loaded and no ability record is read: the LANE ITSELF arrives
    // through a caller-supplied resolver.
    expect(raw).toContain('import type { ExecutionLane } from "../data/game/ability-gcd-semantics.js"');
    expect(codeOf(ENGINE_PATH)).not.toContain("executionLaneForToken");
    expect(codeOf(ENGINE_PATH)).not.toContain("pinnedRogue");
  });

  it("uses no depth cap, and no counter standing in for a cycle check", () => {
    const code = codeOf(ENGINE_PATH);
    for (const forbidden of ["maxDepth", "MAX_DEPTH", "depth", "iterations", "maxSteps"]) {
      expect(code, `${ENGINE_PATH} uses '${forbidden}'`).not.toContain(forbidden);
    }
    expect(code).toContain("NO_PROGRESS_CYCLE");
  });
});

describe("the Rogue adapter lives in the spec layer, and only there", () => {
  // UPDATED AT M5-C3c3c. This block used to assert that NO adapter existed,
  // which was the right claim while the engine was unapplied. C3c3c supplies
  // one, so the claim becomes the one that outlives it: the adapter adapts
  // Rogue state TO the engine, and the direction of that dependency never
  // reverses.
  const ADAPTER_PATH = "src/specs/rogue/assassination/first-gcd-adapter.ts";

  it("wires the engine into exactly one specialization module", () => {
    const wiring = filesUnder("src/specs").filter((path) =>
      codeOf(path).includes("firstGcdSelectionAcrossRescans"),
    );
    expect(wiring).toEqual([ADAPTER_PATH]);
  });

  it("keeps the dependency pointing one way", () => {
    // The engine must not learn the spec. Re-asserted here because an adapter is
    // exactly the change that would make a back-import look convenient.
    const engine = codeOf(ENGINE_PATH);
    expect(engine).not.toContain("/specs/");
    expect(engine).not.toContain("assassination");
    expect(engine).not.toContain("rogue");
  });

  it("declares every Rogue transition in the spec layer, never in the engine", () => {
    expect(codeOf(ENGINE_PATH)).not.toContain("transitionContractFor");
    const declaring = filesUnder("src").filter((path) =>
      codeOf(path).includes("ASSASSINATION_NON_GCD_TRANSITIONS"),
    );
    expect(declaring).toEqual(["src/data/game/assassination-transition-authority.ts"]);
  });

  it("produces a rotational-GCD result in the engine and the adapter only", () => {
    const producing = filesUnder("src").filter((path) => codeOf(path).includes("ROTATIONAL_GCD_SELECTED"));
    expect(producing.sort()).toEqual([ADAPTER_PATH, ENGINE_PATH].sort());
  });
});

describe("the two queries keep separate vocabularies", () => {
  it("shares no blocker member between them", () => {
    // A one-scan refusal and a rescan refusal are different facts. Forcing them
    // into one union would let a reader mistake "the parser refused" for
    // "the worlds disagreed".
    const overlap = (ROTATIONAL_GCD_BLOCKERS as readonly string[]).filter((blocker) =>
      (TRAVERSAL_BLOCKERS as readonly string[]).includes(blocker),
    );
    expect(overlap).toEqual([]);
  });

  it("admits exactly the eight rescan blockers", () => {
    expect([...ROTATIONAL_GCD_BLOCKERS]).toEqual([
      "ONE_SCAN_BLOCKED",
      "UNKNOWN_EXECUTION_LANE",
      "TRANSITION_UNSUPPORTED",
      "TRANSITION_UNKNOWN",
      "UNSUPPORTED_TIME_ADVANCE",
      "NO_PROGRESS_CYCLE",
      "DIVERGENT_GCD_OUTCOMES",
      // M5-D1. The structural half of the gate-irrelevance guard: a
      // GCD-consuming candidate whose condition was never read can never be the
      // answer, whatever a resolver claims about it.
      "UNREAD_CONDITION_ON_GCD_ACTION",
    ]);
  });

  it("keeps both entry points exported and distinct", () => {
    // `selectAcrossLists` did not become a rescan query, and the new one-scan
    // primitive did not replace it. Three functions, three jobs.
    expect(typeof selectAcrossLists).toBe("function");
    expect(typeof resolveOneForegroundScan).toBe("function");
    expect(typeof firstGcdSelectionAcrossRescans).toBe("function");
    expect(selectAcrossLists).not.toBe(resolveOneForegroundScan);
  });

  it("documents that one scan is not the first-GCD query", () => {
    const raw = readFileSync("src/simc/nested-selection.ts", "utf8");
    expect(raw).toContain("ONE FOREGROUND SCAN");
    expect(raw).toContain("firstGcdSelectionAcrossRescans");
  });
});

describe("the OFF_GCD pass is out of scope, and stays that way", () => {
  it("models no off-GCD pass", () => {
    const code = codeOf(ENGINE_PATH);
    expect(code).not.toContain("OFF_GCD");
    expect(code).not.toContain("offGcd");
    expect(code).not.toContain("use_off_gcd");
  });

  it("records WHY it is out of scope", () => {
    // The query begins at a ready foreground point, where the off-GCD pass is
    // unreachable, and ends at the first GCD selection, which is when it first
    // becomes reachable. Structural, not an omission.
    const raw = readFileSync(ENGINE_PATH, "utf8");
    expect(raw).toContain("OFF_GCD PASS IS OUT OF SCOPE");
    expect(raw).toContain("execute_type::OFF_GCD");
  });
});

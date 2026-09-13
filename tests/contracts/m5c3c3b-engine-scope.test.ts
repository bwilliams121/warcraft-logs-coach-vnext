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

describe("no Rogue transition adapter exists yet", () => {
  it("wires the engine into no specialization", () => {
    for (const path of filesUnder("src/specs")) {
      const code = codeOf(path);
      expect(code, `${path} imports the rescan engine`).not.toContain("first-gcd-selection");
      expect(code, `${path} calls the rescan engine`).not.toContain("firstGcdSelectionAcrossRescans");
    }
  });

  it("declares no NON_GCD transition for any Rogue action", () => {
    for (const path of filesUnder("src/specs")) {
      const code = codeOf(path);
      expect(code, `${path} declares a transition`).not.toContain("NonGcdTransition");
      expect(code, `${path} declares a transition resolver`).not.toContain("transitionFor");
    }
  });

  it("claims no global first-GCD result anywhere in src/", () => {
    for (const path of filesUnder("src")) {
      if (path === ENGINE_PATH) continue;
      expect(codeOf(path), `${path} produces a rotational-GCD result`).not.toContain(
        "ROTATIONAL_GCD_SELECTED",
      );
    }
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

  it("admits exactly the seven rescan blockers", () => {
    expect([...ROTATIONAL_GCD_BLOCKERS]).toEqual([
      "ONE_SCAN_BLOCKED",
      "UNKNOWN_EXECUTION_LANE",
      "TRANSITION_UNSUPPORTED",
      "TRANSITION_UNKNOWN",
      "UNSUPPORTED_TIME_ADVANCE",
      "NO_PROGRESS_CYCLE",
      "DIVERGENT_GCD_OUTCOMES",
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

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
  // M10-C: the second specialization supplies its own adapter, in ITS tree,
  // adapting Protection state TO the same engine. Still one adapter per
  // specialization, still one direction.
  const PALADIN_ADAPTER_PATH = "src/specs/paladin/protection/first-gcd-adapter.ts";
  /** M11-A4: the Retribution Paladin adapter, the third wiring of the engine. */
  const RETRIBUTION_ADAPTER_PATH = "src/specs/paladin/retribution/first-gcd-adapter.ts";
  /** M11-B2: the Blood Death Knight adapter, the fourth wiring of the engine. */
  const BLOOD_ADAPTER_PATH = "src/specs/deathknight/blood/first-gcd-adapter.ts";
  /** M11-C2: the Brewmaster Monk adapter, the fifth and only other wiring of the engine. */
  const BREWMASTER_ADAPTER_PATH = "src/specs/monk/brewmaster/first-gcd-adapter.ts";
  /** ONB-A1: the Havoc Demon Hunter adapter. */
  const HAVOC_ADAPTER_PATH = "src/specs/demonhunter/havoc/first-gcd-adapter.ts";
  /** ONB-A2: Cohort A's followers. */
  const SUBTLETY_ADAPTER_PATH = "src/specs/rogue/subtlety/first-gcd-adapter.ts";
  const FURY_WARRIOR_ADAPTER_PATH = "src/specs/warrior/fury/first-gcd-adapter.ts";
  const PROTECTION_WARRIOR_ADAPTER_PATH = "src/specs/warrior/protection/first-gcd-adapter.ts";
  const ARMS_WARRIOR_ADAPTER_PATH = "src/specs/warrior/arms/first-gcd-adapter.ts";
  const FROST_DEATH_KNIGHT_ADAPTER_PATH = "src/specs/deathknight/frost/first-gcd-adapter.ts";
  const DEVOURER_DEMON_HUNTER_ADAPTER_PATH = "src/specs/demonhunter/devourer/first-gcd-adapter.ts";
  const FERAL_DRUID_ADAPTER_PATH = "src/specs/druid/feral/first-gcd-adapter.ts";
  const DESTRUCTION_WARLOCK_ADAPTER_PATH = "src/specs/warlock/destruction/first-gcd-adapter.ts";
  const ELEMENTAL_SHAMAN_ADAPTER_PATH = "src/specs/shaman/elemental/first-gcd-adapter.ts";
  const BALANCE_DRUID_ADAPTER_PATH = "src/specs/druid/balance/first-gcd-adapter.ts";
  const SHADOW_PRIEST_ADAPTER_PATH = "src/specs/priest/shadow/first-gcd-adapter.ts";
  const ARCANE_MAGE_ADAPTER_PATH = "src/specs/mage/arcane/first-gcd-adapter.ts";
  const FROST_MAGE_ADAPTER_PATH = "src/specs/mage/frost/first-gcd-adapter.ts";
  const OUTLAW_ROGUE_ADAPTER_PATH = "src/specs/rogue/outlaw/first-gcd-adapter.ts";
  const ENHANCEMENT_SHAMAN_ADAPTER_PATH = "src/specs/shaman/enhancement/first-gcd-adapter.ts";

  it("wires the engine into exactly one adapter module per specialization tree", () => {
    const wiring = filesUnder("src/specs").filter((path) =>
      codeOf(path).includes("firstGcdSelectionAcrossRescans"),
    );
    expect(wiring.sort()).toEqual(
      [
        PALADIN_ADAPTER_PATH,
        RETRIBUTION_ADAPTER_PATH,
        BLOOD_ADAPTER_PATH,
        BREWMASTER_ADAPTER_PATH,
        HAVOC_ADAPTER_PATH,
        SUBTLETY_ADAPTER_PATH,
        FURY_WARRIOR_ADAPTER_PATH,
        PROTECTION_WARRIOR_ADAPTER_PATH,
        ARMS_WARRIOR_ADAPTER_PATH,
        FROST_DEATH_KNIGHT_ADAPTER_PATH,
        DEVOURER_DEMON_HUNTER_ADAPTER_PATH,
        FERAL_DRUID_ADAPTER_PATH,
        DESTRUCTION_WARLOCK_ADAPTER_PATH,
        ELEMENTAL_SHAMAN_ADAPTER_PATH,
        BALANCE_DRUID_ADAPTER_PATH,
        SHADOW_PRIEST_ADAPTER_PATH,
        ARCANE_MAGE_ADAPTER_PATH,
        FROST_MAGE_ADAPTER_PATH,
        OUTLAW_ROGUE_ADAPTER_PATH,
        ENHANCEMENT_SHAMAN_ADAPTER_PATH,
        ADAPTER_PATH,
      ].sort(),
    );
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

  it("CONSTRUCTS a rotational-GCD result in the engine and nowhere else", () => {
    // TIGHTENED AT M5-D2. This used to match any MENTION of the member name,
    // which conflated building one of these results with reading one. That was
    // weaker than it looked: the adapter it named never constructed a result
    // either, so the real claim was only "two files say the words".
    //
    // Constructing means writing the discriminant. Only the engine may.
    const constructing = filesUnder("src").filter((path) =>
      codeOf(path).includes('kind: "ROTATIONAL_GCD_SELECTED"'),
    );
    expect(constructing).toEqual([ENGINE_PATH]);
  });

  it("keeps the set of modules that READ the result vocabulary small and declared", () => {
    // Reading is legitimate — an adapter must inspect what it forwards, and
    // M5-D2's coverage classifier must inspect what it counts. But the set is
    // enumerated, so a new reader is a deliberate change rather than a drift.
    // M10-C: the classifier moved to shared SimC code so a second
    // specialization can use the identical classification.
    const COVERAGE_PATH = "src/simc/decision-coverage.ts";
    const reading = filesUnder("src").filter((path) => codeOf(path).includes("ROTATIONAL_GCD_SELECTED"));
    expect(reading.sort()).toEqual([ADAPTER_PATH, COVERAGE_PATH, ENGINE_PATH].sort());
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

  it("admits exactly the nine rescan blockers", () => {
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
      // ONB-S5. The scan selected a pool or wait: the authority casts nothing
      // now, and the next selection needs simulated time this engine does not
      // advance. Never a lane question, never a GCD selection.
      "APL_WAIT_SELECTED",
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

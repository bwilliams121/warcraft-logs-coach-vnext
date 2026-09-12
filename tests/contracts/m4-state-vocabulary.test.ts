import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { UNKNOWN_REASONS } from "../../src/engine/state/state-result.js";

/**
 * A vocabulary contract over the M4 state layer.
 *
 * `tests/contracts/normalization-boundary.test.ts` does this for M3: it bans the
 * words that would mean the normalizer had started coaching. The state layer
 * needs the same treatment for a different reason. M4 DERIVES, and a derived
 * value is allowed to be exact — so the risk here is not gameplay adjectives but
 * NAMES THAT CLAIM AN UNESTABLISHED CONTRACT.
 *
 * Three evidence contracts are deliberately open:
 *
 * 1. whether an aura `stack` value is an absolute count or a delta
 * 2. when an attached `classResources[].amount` is sampled relative to a cast
 * 3. whether a `resourcechange` snapshot is pre-change or post-change
 *
 * An API named `resourceBeforeCast` or `stacksAt` would settle one of them by
 * fiat. That is much harder to spot in review than a `wasWasted` field, because
 * it reads like ordinary infrastructure — hence a mechanical sweep.
 *
 * The sweep runs over CODE with comments stripped. The doc comments necessarily
 * name what they forbid.
 */

function filesUnder(root: string): readonly string[] {
  return readdirSync(root, { recursive: true, withFileTypes: false })
    .map((entry) => `${root}/${String(entry).replace(/\\/g, "/")}`)
    .filter((path) => statSync(path).isFile() && path.endsWith(".ts"));
}

const ENGINE_FILES = filesUnder("src/engine");

function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the state layer claims no unestablished evidence contract", () => {
  /** Names that only make sense once a NOT-ESTABLISHED contract has been decided. */
  const FORBIDDEN = [
    // Contract 2 and 3: snapshot sampling order.
    "resourceBeforeCast",
    "resourceAfterCast",
    "resourceBeforeSpend",
    "resourceAfterSpend",
    "preCastAmount",
    "postCastAmount",
    "preChangeAmount",
    "postChangeAmount",
    "amountAfterCost",
    // Contract 1: absolute-vs-delta stacks.
    "stacksAt",
    "currentStacks",
    "absoluteStacks",
    "stackDelta",
    "reconstructStacks",
  ];

  it("scans a non-empty set of engine sources, so the sweep cannot pass vacuously", () => {
    expect(ENGINE_FILES.length).toBeGreaterThan(0);
    expect(ENGINE_FILES.some((path) => path.includes("engine/resources/"))).toBe(true);
    expect(ENGINE_FILES.some((path) => path.includes("engine/auras/"))).toBe(true);
    expect(ENGINE_FILES.some((path) => path.includes("engine/state/"))).toBe(true);
  });

  it.each(FORBIDDEN)("declares no %s anywhere in the engine", (name) => {
    for (const path of ENGINE_FILES) {
      expect(codeOf(path), `${path} declares ${name}`).not.toContain(name);
    }
  });
});

describe("the state layer models no resource generation", () => {
  const FORBIDDEN = [
    "regenRate",
    "regenerationRate",
    "regenerationModel",
    "energyPerSecond",
    "focusPerSecond",
    "manaPerSecond",
    "interpolateAmount",
    "projectedAmount",
  ];

  it.each(FORBIDDEN)("declares no %s anywhere in the engine", (name) => {
    // Continuous-resource bounds are deferred until an evidence-backed,
    // versioned game-data model exists. Until then there is no rate to model
    // with, and a hard-coded one would be the fabrication this project exists
    // to prevent.
    for (const path of ENGINE_FILES) {
      expect(codeOf(path), `${path} declares ${name}`).not.toContain(name);
    }
  });
});

describe("resource queries are named for evidence, not for state", () => {
  /**
   * The distinction the names have to carry:
   *
   *     "the latest observation we hold is 43, made at 10.000s"   — true, ungated
   *     "Energy was 43 at 12.000s"                                — not said
   *
   * The first is a report about our evidence and needs no coverage. The second
   * is a state claim this layer cannot make. A name like `resourceAt` or
   * `currentEnergy` promises the second, so the accessor carries "observed"
   * instead — and the result is STALE rather than EXACT, which is the structural
   * half of the same refusal.
   */
  const FORBIDDEN = [
    "resourceAt(",
    "energyAt(",
    "currentResource",
    "currentAmount",
    "resourceStateAt",
    "amountAt(",
  ];

  it.each(FORBIDDEN)("declares no %s anywhere in the engine", (name) => {
    for (const path of ENGINE_FILES) {
      expect(codeOf(path), `${path} declares ${name}`).not.toContain(name);
    }
  });

  it("names the latest-observation accessor observationally", () => {
    const code = codeOf("src/engine/resources/resource-state.ts");

    expect(code).toContain("latestObservedAtOrBefore");
    // The on-event accessor is named for the event it reads, not for a phase of
    // that event — the cast-attachment timing contract is NOT ESTABLISHED.
    expect(code).toContain("observationOnEvent");
  });
});

describe("the state layer forms no gameplay or actionability verdict", () => {
  /**
   * M4-B is gameplay-neutral. Actionability, cooldown readiness, targetability
   * and death state are all explicitly out of scope, and each of them is a place
   * where a fail-open default would be easy to introduce and hard to see.
   */
  const FORBIDDEN = [
    "isActionable",
    "actionabilityAt",
    "NOT_ACTIONABLE",
    "targetableAt",
    "isTargetable",
    "cooldownReadyAt",
    "chargesAt",
    "isAlive",
    "wasAlive",
    "deathAt",
    "wasWasted",
    "wastedResource",
    "atCap",
    "mistake",
    "shouldHave",
  ];

  it.each(FORBIDDEN)("declares no %s anywhere in the engine", (name) => {
    for (const path of ENGINE_FILES) {
      expect(codeOf(path), `${path} declares ${name}`).not.toContain(name);
    }
  });

  it("never mentions the decision-authority states M5 owns", () => {
    // `NO_AUTHORITY_AVAILABLE` means "no trustworthy standard exists for this
    // question", which is a decision-authority judgement. Everything in M4 is
    // an EVIDENCE condition, and evidence conditions resolve to UNKNOWN. The two
    // are never interchangeable, so the state layer must not be able to produce
    // the other one at all.
    for (const path of ENGINE_FILES) {
      expect(codeOf(path), `${path} mentions NO_AUTHORITY_AVAILABLE`).not.toContain("NO_AUTHORITY_AVAILABLE");
    }
    expect(UNKNOWN_REASONS).not.toContain("NO_AUTHORITY_AVAILABLE");
  });
});

describe("the state layer has exactly one temporal system", () => {
  const TEMPORAL_OWNERS = ["src/engine/state/temporal.ts", "src/engine/state/combat-state.ts"];

  it("resolves temporal positions only through M4-A's resolver", () => {
    // A second timestamp walker is the failure mode here: the canonical event
    // array is NOT contractually ordered by time, so any module that searches it
    // by timestamp on its own would answer over an order that may not hold.
    for (const path of ENGINE_FILES) {
      if (TEMPORAL_OWNERS.includes(path)) {
        continue;
      }
      expect(codeOf(path), `${path} calls resolveTemporalPosition directly`).not.toContain(
        "resolveTemporalPosition(context",
      );
    }
  });

  it("keeps every consumer off the canonical array's own time search", () => {
    for (const path of ENGINE_FILES) {
      if (path === "src/engine/state/temporal.ts") {
        continue;
      }
      const code = codeOf(path);
      // No module may sort, reverse, or binary-search `events` by timestamp.
      expect(code, `${path} sorts the canonical event array`).not.toContain("events.sort");
      expect(code, `${path} reverses the canonical event array`).not.toContain("events.reverse");
      expect(code, `${path} searches events by time`).not.toContain(
        "events.find((event) => event.reportTimeMs",
      );
    }
  });

  it("defines the containment rules in exactly one place", () => {
    // `rangeContains` and the coverage classification live in M3's coverage
    // primitives. A second inclusive/exclusive rule elsewhere would drift from
    // the first, and the bound handling is precisely what is easy to get wrong.
    const definers = ENGINE_FILES.filter((path) =>
      /export function (rangeContains|classifyCoverage|intersectRangeLists)\b/.test(codeOf(path)),
    );
    expect(definers).toEqual(["src/engine/evidence/coverage.ts"]);
  });

  it("gates every absence claim through the one gate", () => {
    const definers = ENGINE_FILES.filter((path) => /export function gateAbsenceClaim\b/.test(codeOf(path)));
    expect(definers).toEqual(["src/engine/state/state-result.ts"]);
  });
});

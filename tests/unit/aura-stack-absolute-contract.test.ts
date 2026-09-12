import { describe, expect, it } from "vitest";

import { anySource } from "../../src/engine/auras/aura-state.js";
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { createNormalizer } from "../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../src/engine/normalization/supported-families.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import { afterEvent } from "../../src/engine/state/temporal.js";
import { syntheticFight } from "../support/synthetic-fight.js";
import stackFixture from "../fixtures/wcl/events/wcl-aura-stack-absolute.json";

/**
 * EVIDENCE CONTRACT A — the aura `stack` field.
 *
 * For `gameVersion` 1 / `logVersion` 17, `stack` on a stack-change aura event is
 * the ABSOLUTE RESULTING STACK COUNT AFTER that event.
 *
 * The fixture holds two COMPLETE chains — every event Warcraft Logs returned for
 * that (ability, source, target) inside the capture window, nothing dropped:
 *
 *     ability 1297033, actor 9 on itself
 *       applybuff -> 2 -> 3 -> 4 -> 5 -> 6 -> removebuff
 *
 *     ability 1263382, actor 7 on itself
 *       applybuff -> 2 -> 1 -> removebuff
 *
 * Completeness is what makes them evidence. A sliced chain could be made to fit
 * almost any reading; these cannot.
 *
 * The two competing readings and what kills each:
 *
 *     DELTA            the first stack application would have to read 1, the
 *                      commonest value a delta can take. Across both chains it
 *                      never appears, and the ascending run would mean gaining
 *                      2 then 3 then 4 stacks one at a time.
 *
 *     ABSOLUTE-BEFORE  `applybuff` establishes the aura, so a following
 *                      application claiming a PRIOR count of 2 is impossible.
 *                      And a removal reading 1 would mean the aura hit zero —
 *                      yet chain two keeps running for another 1.18 seconds
 *                      before its own `removebuff`.
 *
 * These tests read the contract; they do not RECONSTRUCT a count. The number is
 * known at a transition that reported one, and nowhere else.
 */

const WINDOW_START = 7_550_000;
const WINDOW_END = 7_560_000;

const ASCENDING_CHAIN = 1_297_033;
const DESCENDING_CHAIN = 1_263_382;

const normalizer = createNormalizer({
  fightStartTimeMs: WINDOW_START,
  requestedRange: inclusiveRange(WINDOW_START, WINDOW_END),
  contracts: indexContracts(SUPPORTED_TYPE_CONTRACTS),
  directionFields: VERIFIED_DIRECTION_FIELDS,
});
normalizer.accept({
  streamId: "all",
  pageOrdinal: 0,
  requestedStartTimeMs: WINDOW_START,
  nextPageTimestamp: null,
  events: stackFixture as Record<string, unknown>[],
});
const normalized = normalizer.finish();
const state = createCombatState(
  syntheticFight({
    observedCategories: ["AURAS"],
    events: normalized.events,
    startTimeMs: WINDOW_START,
    endTimeMs: WINDOW_END,
  }),
);

/** Every normalized aura event of one chain, in canonical order, with its position. */
function chain(abilityGameId: number) {
  return state.fight.events
    .map((event, position) => ({ event, position }))
    .filter((entry) => entry.event.kind === "AURA" && entry.event.abilityGameId === abilityGameId)
    .map((entry) => {
      if (entry.event.kind !== "AURA") throw new Error("filtered above");
      return {
        position: entry.position,
        rawType: entry.event.rawType,
        isStackChange: entry.event.isStackChange,
        stacks: entry.event.stacks,
        reportTimeMs: entry.event.reportTimeMs,
      };
    });
}

describe("the fixture carries the evidence the contract rests on", () => {
  it("normalizes every fixture event without a malformed family", () => {
    expect(normalized.events.length).toBe(stackFixture.length);
    expect(normalized.events.some((event) => event.kind === "MALFORMED_FAMILY")).toBe(false);
    expect(normalized.malformedObservations.length).toBe(0);
    expect(normalized.malformedEnvelopeCount).toBe(0);
    expect(normalized.degradedCategories.size).toBe(0);
  });

  it("holds both complete chains", () => {
    expect(chain(ASCENDING_CHAIN).map((entry) => entry.rawType)).toEqual([
      "applybuff",
      "applybuffstack",
      "applybuffstack",
      "refreshbuff",
      "applybuffstack",
      "refreshbuff",
      "applybuffstack",
      "refreshbuff",
      "applybuffstack",
      "refreshbuff",
      "removebuff",
    ]);
    expect(chain(DESCENDING_CHAIN).map((entry) => entry.rawType)).toEqual([
      "applybuff",
      "removebuffstack",
      "removebuffstack",
      "removebuff",
    ]);
  });

  it("carries a stack number on exactly the stack-change events", () => {
    for (const entry of [...chain(ASCENDING_CHAIN), ...chain(DESCENDING_CHAIN)]) {
      if (entry.isStackChange) {
        expect(entry.stacks, `${entry.rawType} carried no stack`).not.toBeNull();
      } else {
        // A plain application or refresh carries no `stack` at all. Null here is
        // an ABSENCE, and must never be read as a count of zero.
        expect(entry.stacks, `${entry.rawType} carried a stack`).toBeNull();
      }
    }
  });
});

describe("a stack value is the absolute count resulting from its own event", () => {
  it("reads 2 on the first stack application after a plain application", () => {
    const [application, firstStack] = chain(ASCENDING_CHAIN);

    expect(application?.rawType).toBe("applybuff");
    expect(application?.stacks).toBeNull();
    // The decisive number. `applybuff` establishes one stack, so the first
    // stack application RESULTS in two. Under absolute-before it would read 1;
    // under a delta it would read 1 as well.
    expect(firstStack?.rawType).toBe("applybuffstack");
    expect(firstStack?.stacks).toBe(2);
    expect(firstStack?.stacks).not.toBe(1);
  });

  it("climbs by exactly one per stack application", () => {
    const values = chain(ASCENDING_CHAIN)
      .filter((entry) => entry.isStackChange)
      .map((entry) => entry.stacks);

    expect(values).toEqual([2, 3, 4, 5, 6]);
  });

  it("descends by exactly one per stack removal", () => {
    const values = chain(DESCENDING_CHAIN)
      .filter((entry) => entry.isStackChange)
      .map((entry) => entry.stacks);

    expect(values).toEqual([2, 1]);
    // Never 0. A removal that would empty the aura is reported as `removebuff`,
    // so the smallest resulting count a stack removal can report is 1.
    expect(values).not.toContain(0);
  });

  it("never reports 1 on a stack application anywhere in the evidence", () => {
    // The single sharpest delta falsifier, stated over the whole fixture rather
    // than one chain: under a delta reading, +1 is the value that should
    // dominate.
    const applications = [...chain(ASCENDING_CHAIN), ...chain(DESCENDING_CHAIN)].filter(
      (entry) => entry.isStackChange && entry.rawType.startsWith("apply"),
    );

    expect(applications.length).toBeGreaterThan(0);
    for (const entry of applications) {
      expect(entry.stacks, `${entry.rawType} read 1`).not.toBe(1);
    }
  });
});

describe("the delta reading is untenable against this evidence", () => {
  it("does not sum the ascending chain", () => {
    const values = chain(ASCENDING_CHAIN)
      .filter((entry) => entry.isStackChange)
      .map((entry) => entry.stacks ?? 0);
    const deltaTotal = values.reduce((total, value) => total + value, 0);

    // 2+3+4+5+6 = 20 stacks gained from five single applications, on an aura
    // that was applied once. The final observed value is 6, not 20, and nothing
    // in M4 computes either.
    expect(deltaTotal).toBe(20);
    expect(values.at(-1)).toBe(6);

    const result = state.auras.latestStackObservation({
      ...identityOf(ASCENDING_CHAIN),
      at: afterEvent(chain(ASCENDING_CHAIN).at(-1)?.position ?? 0),
    });
    if (result.certainty !== "EXACT") return;
    expect(result.value.observedStacks).toBe(6);
    expect(result.value.observedStacks).not.toBe(20);
  });

  it("keeps a removal reading 1 meaning one stack REMAINS", () => {
    const events = chain(DESCENDING_CHAIN);
    const lastStackRemoval = events.filter((entry) => entry.isStackChange).at(-1);
    const fullRemoval = events.at(-1);

    expect(lastStackRemoval?.stacks).toBe(1);
    expect(fullRemoval?.rawType).toBe("removebuff");
    // Under absolute-BEFORE, `stack: 1` would mean the count reached zero at
    // that instant. The aura instead ran for another 1.18 seconds and was then
    // removed by its own event — which only the absolute-AFTER reading explains.
    const gapMs = (fullRemoval?.reportTimeMs ?? 0) - (lastStackRemoval?.reportTimeMs ?? 0);
    expect(gapMs).toBeGreaterThan(1000);
  });
});

describe("M4 exposes the observed resulting count and derives nothing from it", () => {
  it("returns the exact number the transition reported", () => {
    const events = chain(ASCENDING_CHAIN).filter((entry) => entry.isStackChange);

    for (const entry of events) {
      const observation = state.auras.observationAt(entry.position);
      expect(observation?.observedStacks).toBe(entry.stacks);
      expect(observation?.isStackChange).toBe(true);
    }
  });

  it("answers with the observation, carrying its own instant", () => {
    const third = chain(ASCENDING_CHAIN).filter((entry) => entry.isStackChange)[1];
    if (third === undefined) return;

    const result = state.auras.latestStackObservation({
      ...identityOf(ASCENDING_CHAIN),
      at: afterEvent(third.position),
    });

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.observedStacks).toBe(3);
    // An OBSERVATION with its own position and timestamp, not "the count at the
    // query instant". Knowing what the number means did not turn this into a
    // state claim.
    expect(result.value.position).toBe(third.position);
    expect(result.value.reportTimeMs).toBe(third.reportTimeMs);
  });

  it("proves the aura ACTIVE at a real stack removal that left stacks behind", () => {
    // The contract's one behavioural consequence, exercised against COMMITTED
    // evidence rather than a synthetic event: `removebuffstack` reading 2 means
    // two stacks remained, so the aura is observed still up.
    const removals = chain(DESCENDING_CHAIN).filter((entry) => entry.isStackChange);

    expect(removals.map((entry) => entry.stacks)).toEqual([2, 1]);
    for (const removal of removals) {
      const result = state.auras.presenceAt({
        ...identityOf(DESCENDING_CHAIN),
        at: afterEvent(removal.position),
      });

      expect(result.certainty, `stack ${removal.stacks}`).toBe("EXACT");
      if (result.certainty !== "EXACT") continue;
      expect(result.value.presence, `stack ${removal.stacks}`).toBe("ACTIVE");
      expect(result.derivation).toBe("OBSERVED");
      expect(result.value.anchor.observedStacks).toBe(removal.stacks);
    }
  });

  it("lets the chain's own final removal end it", () => {
    const fullRemoval = chain(DESCENDING_CHAIN).at(-1);
    if (fullRemoval === undefined) return;

    const result = state.auras.presenceAt({
      ...identityOf(DESCENDING_CHAIN),
      at: afterEvent(fullRemoval.position),
    });

    expect(fullRemoval.rawType).toBe("removebuff");
    if (result.certainty !== "EXACT") return;
    // Real evidence for both directions in one chain: stacks remaining keep it
    // ACTIVE, and only the ordinary removal family ends it.
    expect(result.value.presence).toBe("INACTIVE");
  });

  it("still offers no reconstructed count at an arbitrary instant", () => {
    // The contract settled what the NUMBER means. It did not settle what a plain
    // `applybuff` establishes, what `refreshbuff` does to a count, or when
    // stacks decay unobserved — so there is still no `stacksAt`.
    for (const forbidden of ["stacksAt", "stackCount", "currentStacks", "reconstructStacks"]) {
      expect(state.auras).not.toHaveProperty(forbidden);
    }
  });

  it("reports NO_OBSERVATION before any stack number was seen", () => {
    const application = chain(ASCENDING_CHAIN)[0];
    if (application === undefined) return;

    const result = state.auras.latestStackObservation({
      ...identityOf(ASCENDING_CHAIN),
      at: afterEvent(application.position),
    });

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // The aura is up and its count is one. That is an INFERENCE from the plain
    // application, not an observation, so this layer does not supply it.
    expect(result.reason).toBe("NO_OBSERVATION");
  });
});

function identityOf(abilityGameId: number) {
  const first = state.fight.events.find(
    (event) => event.kind === "AURA" && event.abilityGameId === abilityGameId,
  );
  if (first === undefined || first.kind !== "AURA" || first.target === null) {
    throw new Error(`fixture is missing ability ${abilityGameId}`);
  }
  return {
    target: first.target,
    abilityGameId,
    auraClass: first.auraClass,
    source: anySource(),
  };
}

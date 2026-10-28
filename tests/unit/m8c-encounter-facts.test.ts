/**
 * M8-C: the typed encounter facts are retrieved, and not one of them is
 * interpreted.
 *
 * The risk here is not that a value fails to arrive. It is that a value arrives
 * and quietly acquires a meaning — a null becoming a zero, a percentage being
 * rescaled because its name says "percentage", two differently-counted phase
 * fields being reconciled into one "phase reached". Every case below is aimed at
 * one of those.
 */

import { describe, expect, it } from "vitest";

import {
  normalizeEncounterOutcome,
  normalizeZone,
  type EncounterOutcomeFacts,
} from "../../src/engine/normalization/encounter-facts.js";
import { normalizeFightContext } from "../../src/engine/normalization/fight-context.js";
import { decodeFightContext, FIGHT_CONTEXT_QUERY } from "../../src/wcl/fight-context-query.js";
import type { RawFightContextReport } from "../../src/wcl/fight-context-query.js";

/** The six fight-level outcome fields M8-C selects. */
const OUTCOME_FIELDS = [
  "lastPhase",
  "lastPhaseAsAbsoluteIndex",
  "lastPhaseIsIntermission",
  "bossPercentage",
  "fightPercentage",
  "wipeCalledTime",
] as const;

/** Exact, whole-line selections in the query document. */
function selectionCount(field: string): number {
  return FIGHT_CONTEXT_QUERY.split("\n").filter((line) => line.trim() === field).length;
}

// The values M8-A measured on report qJ1pgB49ZrRNVmCd fight 6, a real kill.
const MEASURED_FIGHT: Record<string, unknown> = {
  id: 6,
  name: "Sszorak",
  encounterID: 3420,
  difficulty: 4,
  size: 24,
  kill: true,
  inProgress: false,
  startTime: 7_381_097,
  endTime: 7_689_007,
  friendlyPlayers: [5],
  friendlySpecs: ["Assassination"],
  talentImportCode: "MEASURED",
  lastPhase: 1,
  lastPhaseAsAbsoluteIndex: 4,
  lastPhaseIsIntermission: false,
  bossPercentage: 0.04,
  fightPercentage: 0.04,
  wipeCalledTime: null,
  phaseTransitions: [],
};

function report(overrides: Partial<RawFightContextReport> = {}): RawFightContextReport {
  return {
    code: "aBcDeFgH12345678",
    revision: 3,
    startTimeUnixMs: 1_700_000_000_000,
    endTimeUnixMs: 1_700_000_900_000,
    region: { state: "NOT_RETRIEVED" },
    logVersion: 17,
    gameVersion: 1,
    actors: [],
    abilities: [],
    phases: [],
    fights: [MEASURED_FIGHT],
    archiveStatus: null,
    zone: null,
    ...overrides,
  };
}

function headerOf(overrides: Partial<RawFightContextReport> = {}) {
  const outcome = normalizeFightContext(report(overrides), 6);
  if (!outcome.ok) throw new Error(`normalization failed: ${outcome.reason}`);
  return outcome;
}

// ---------------------------------------------------------------------------
// Query shape
// ---------------------------------------------------------------------------

describe("the fight-context query selects the M8-C fields exactly once", () => {
  it.each(OUTCOME_FIELDS)("selects %s exactly once", (field) => {
    // Whole-line matching, because `lastPhase` is a prefix of two other field
    // names and a substring count would report three selections for one.
    expect(selectionCount(field)).toBe(1);
  });

  it("selects the report zone and its expansion", () => {
    expect(FIGHT_CONTEXT_QUERY).toContain("zone {");
    expect(FIGHT_CONTEXT_QUERY).toContain("expansion {");
    expect(selectionCount("frozen")).toBe(1);
  });

  it("keeps the previously selected fight fields", () => {
    // Guards against an edit that adds the new selections by replacing old ones.
    for (const field of ["id", "encounterID", "difficulty", "size", "kill", "inProgress"]) {
      expect(selectionCount(field), field).toBeGreaterThanOrEqual(1);
    }
  });

  it("selects no ranking, percentile or combatant-info surface", () => {
    // M8-A proved these are cheap and available. They are excluded on purpose:
    // parse rankings are not decision-quality evidence, and combatant info was
    // measured at a 19x payload multiplier.
    for (const banned of [
      "rankings",
      "characterRankings",
      "fightRankings",
      "rankPercent",
      "bracketPercent",
      "percentile",
      "includeCombatantInfo",
      "combatantInfo",
      "gear",
      "talents",
    ]) {
      expect(FIGHT_CONTEXT_QUERY, `query selects ${banned}`).not.toContain(banned);
    }
  });
});

// ---------------------------------------------------------------------------
// Outcome parsing
// ---------------------------------------------------------------------------

describe("encounter outcome facts are read verbatim", () => {
  it("preserves every measured value exactly", () => {
    expect(normalizeEncounterOutcome(MEASURED_FIGHT)).toEqual({
      lastPhase: 1,
      lastPhaseAsAbsoluteIndex: 4,
      lastPhaseIsIntermission: false,
      // NOT rescaled. 0.04 stays 0.04 — not 4, not 0.0004, not 96.
      bossPercentageRaw: 0.04,
      fightPercentageRaw: 0.04,
      wipeCalledReportTimeMs: null,
    } satisfies EncounterOutcomeFacts);
  });

  it("keeps the two phase fields apart even when they disagree", () => {
    // The real measured pair: a kill reporting lastPhase 1 and absolute index 4.
    // The schema counts them on different bases, so nothing may reconcile them
    // into a single "phase reached".
    const facts = normalizeEncounterOutcome(MEASURED_FIGHT);
    expect(facts.lastPhase).toBe(1);
    expect(facts.lastPhaseAsAbsoluteIndex).toBe(4);
    expect(facts.lastPhase).not.toBe(facts.lastPhaseAsAbsoluteIndex);
  });

  it.each(OUTCOME_FIELDS)("preserves an explicit null in %s", (field) => {
    const facts = normalizeEncounterOutcome({ ...MEASURED_FIGHT, [field]: null });
    // Nothing became 0, 1, false or a fight-end timestamp.
    expect(Object.values(facts).filter((value) => value === null).length).toBeGreaterThanOrEqual(1);
    expect(Object.values(facts)).not.toContain(undefined);
  });

  it("resolves every field to null when Warcraft Logs supplied none at all", () => {
    expect(normalizeEncounterOutcome({ id: 6 })).toEqual({
      lastPhase: null,
      lastPhaseAsAbsoluteIndex: null,
      lastPhaseIsIntermission: null,
      bossPercentageRaw: null,
      fightPercentageRaw: null,
      wipeCalledReportTimeMs: null,
    } satisfies EncounterOutcomeFacts);
  });

  it("preserves numeric zero as zero, never as absence", () => {
    const facts = normalizeEncounterOutcome({
      ...MEASURED_FIGHT,
      lastPhase: 0,
      lastPhaseAsAbsoluteIndex: 0,
      bossPercentage: 0,
      fightPercentage: 0,
      wipeCalledTime: 0,
    });
    expect(facts.lastPhase).toBe(0);
    expect(facts.lastPhaseAsAbsoluteIndex).toBe(0);
    expect(facts.bossPercentageRaw).toBe(0);
    expect(facts.fightPercentageRaw).toBe(0);
    // A report-relative 0 is the first millisecond of the report, not "no wipe".
    expect(facts.wipeCalledReportTimeMs).toBe(0);
  });

  it("preserves false as false, never as absence", () => {
    const withFalse = normalizeEncounterOutcome({ ...MEASURED_FIGHT, lastPhaseIsIntermission: false });
    const withNull = normalizeEncounterOutcome({ ...MEASURED_FIGHT, lastPhaseIsIntermission: null });
    expect(withFalse.lastPhaseIsIntermission).toBe(false);
    expect(withNull.lastPhaseIsIntermission).toBeNull();
    expect(withFalse.lastPhaseIsIntermission).not.toBe(withNull.lastPhaseIsIntermission);
  });

  it("preserves a fractional percentage rather than truncating it to an integer", () => {
    // Reading these through the integer reader would silently discard the
    // ordinary case: M8-A measured 0.04 on a live fight.
    const facts = normalizeEncounterOutcome({ ...MEASURED_FIGHT, bossPercentage: 12.4 });
    expect(facts.bossPercentageRaw).toBe(12.4);
  });

  it("records a fractional phase index as no value rather than truncating it", () => {
    // The schema types both phase fields as Int. A fractional one is not a phase
    // that was reported, and rounding it would invent one.
    const facts = normalizeEncounterOutcome({ ...MEASURED_FIGHT, lastPhase: 2.5 });
    expect(facts.lastPhase).toBeNull();
  });

  describe("wipeCalledReportTimeMs converges on null without carrying a reason", () => {
    // The normalized field supports exactly two readings:
    //
    //     number  WCL supplied a usable value, as report-relative milliseconds
    //     null    no usable wipe-called timestamp is available
    //
    // The upstream schema fact — that a GENUINE WCL null indicates no wipe was
    // explicitly called through the Companion app — is true of the RAW field and
    // is deliberately not asserted below, because after normalization the two
    // inputs are indistinguishable.
    it.each([
      ["a genuine upstream null", null],
      ["a malformed string", "later"],
      ["a malformed object", {}],
      ["a non-finite number", Number.NaN],
    ])("normalizes %s to null", (_label, raw) => {
      expect(
        normalizeEncounterOutcome({ ...MEASURED_FIGHT, wipeCalledTime: raw }).wipeCalledReportTimeMs,
      ).toBeNull();
    });

    it("makes a genuine null and a malformed value indistinguishable", () => {
      // The convergence is intentional at this layer. A consumer that tried to
      // recover WHY the value is missing would be reading a reason that is not
      // there — so nothing downstream may treat null as "no wipe was called".
      const fromNull = normalizeEncounterOutcome({ ...MEASURED_FIGHT, wipeCalledTime: null });
      const fromMalformed = normalizeEncounterOutcome({ ...MEASURED_FIGHT, wipeCalledTime: "later" });
      expect(fromMalformed).toEqual(fromNull);
    });

    it("keeps a usable value, including one that coincides with a kill", () => {
      // The positive side of the contract: a number is preserved verbatim, and
      // whether the pull was a kill is `kill`'s question, not this field's.
      const facts = normalizeEncounterOutcome({ ...MEASURED_FIGHT, wipeCalledTime: 123_456 });
      expect(facts.wipeCalledReportTimeMs).toBe(123_456);
      expect(MEASURED_FIGHT["kill"]).toBe(true);
    });

    it("does not fail ingestion over a malformed wipe time", () => {
      const outcome = normalizeFightContext(
        report({ fights: [{ ...MEASURED_FIGHT, wipeCalledTime: "later" }] }),
        6,
      );
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.fight.outcome.wipeCalledReportTimeMs).toBeNull();
      // Everything else survived intact.
      expect(outcome.fight.kill).toBe(true);
      expect(outcome.fight.outcome.lastPhase).toBe(1);
    });
  });

  it("records a malformed value as no value rather than failing ingestion", () => {
    const facts = normalizeEncounterOutcome({
      ...MEASURED_FIGHT,
      bossPercentage: "12.4",
      lastPhaseIsIntermission: "false",
    });
    expect(facts.bossPercentageRaw).toBeNull();
    expect(facts.lastPhaseIsIntermission).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Zone
// ---------------------------------------------------------------------------

describe("zone metadata", () => {
  const MEASURED_ZONE = {
    id: 53,
    name: "The Venomous Abyss",
    frozen: false,
    expansion: { id: 7, name: "Midnight" },
  };

  it("preserves the measured zone exactly", () => {
    expect(normalizeZone(MEASURED_ZONE)).toEqual({
      id: 53,
      name: "The Venomous Abyss",
      frozen: false,
      expansion: { id: 7, name: "Midnight" },
    });
  });

  it("preserves frozen=false as false", () => {
    expect(normalizeZone(MEASURED_ZONE)?.frozen).toBe(false);
    expect(normalizeZone({ ...MEASURED_ZONE, frozen: true })?.frozen).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a non-record", 7],
  ])("returns null for %s rather than inventing a zone", (_label, raw) => {
    // The schema documents the null case: "null if no supported zone exists".
    expect(normalizeZone(raw)).toBeNull();
  });

  it("keeps a zone whose expansion is absent, with a null expansion", () => {
    const zone = normalizeZone({ id: 53, name: "The Venomous Abyss", frozen: false });
    expect(zone).toEqual({ id: 53, name: "The Venomous Abyss", frozen: false, expansion: null });
  });

  it("keeps a zone whose expansion is unreadable, with a null expansion", () => {
    const zone = normalizeZone({ ...MEASURED_ZONE, expansion: { id: 7 } });
    expect(zone?.expansion).toBeNull();
    expect(zone?.id).toBe(53);
  });

  it.each(["id", "name", "frozen"])("returns null when the non-nullable field %s is unusable", (field) => {
    // All three are non-null in the schema, so their absence means the payload
    // is not the zone the schema describes. A partly invented zone would be
    // worse than none.
    expect(normalizeZone({ ...MEASURED_ZONE, [field]: null })).toBeNull();
  });

  it("preserves zone id 0 as a real id", () => {
    expect(normalizeZone({ ...MEASURED_ZONE, id: 0 })?.id).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Propagation through normalizeFightContext
// ---------------------------------------------------------------------------

describe("the facts reach the normalized fight context", () => {
  it("carries the outcome facts onto the fight header", () => {
    expect(headerOf().fight.outcome).toEqual({
      lastPhase: 1,
      lastPhaseAsAbsoluteIndex: 4,
      lastPhaseIsIntermission: false,
      bossPercentageRaw: 0.04,
      fightPercentageRaw: 0.04,
      wipeCalledReportTimeMs: null,
    } satisfies EncounterOutcomeFacts);
  });

  it("carries the zone as a report-level fact", () => {
    const zone = { id: 53, name: "The Venomous Abyss", frozen: false, expansion: { id: 7, name: "M" } };
    expect(headerOf({ zone }).zone).toEqual({
      id: 53,
      name: "The Venomous Abyss",
      frozen: false,
      expansion: { id: 7, name: "M" },
    });
  });

  it("normalizes a report with no zone rather than failing", () => {
    const outcome = headerOf({ zone: null });
    expect(outcome.zone).toBeNull();
    expect(outcome.fight.id).toBe(6);
  });

  it("does not fail normalization when every outcome field is malformed", () => {
    // Context must never be able to break an ingestion whose combat evidence is
    // sound.
    const outcome = normalizeFightContext(
      report({
        fights: [
          {
            ...MEASURED_FIGHT,
            lastPhase: "x",
            lastPhaseAsAbsoluteIndex: {},
            lastPhaseIsIntermission: 1,
            bossPercentage: [],
            fightPercentage: "0.04",
            wipeCalledTime: "later",
          },
        ],
      }),
      6,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.fight.outcome.lastPhase).toBeNull();
    expect(outcome.fight.outcome.bossPercentageRaw).toBeNull();
  });

  it("leaves the pre-existing fight header fields untouched", () => {
    const header = headerOf().fight;
    expect(header.encounterId).toBe(3420);
    expect(header.difficulty).toBe(4);
    expect(header.size).toBe(24);
    expect(header.kill).toBe(true);
    expect(header.durationMs).toBe(7_689_007 - 7_381_097);
    expect(header.finality).toBe("COMPLETED");
  });
});

// ---------------------------------------------------------------------------
// Raw decode
// ---------------------------------------------------------------------------

describe("the raw context decoder carries the zone through untouched", () => {
  function decoded(zone: unknown) {
    const outcome = decodeFightContext({
      reportData: {
        report: {
          code: "aBcDeFgH12345678",
          revision: 3,
          startTime: 1,
          endTime: 2,
          masterData: { logVersion: 17, gameVersion: 1, actors: [], abilities: [] },
          phases: [],
          fights: [],
          zone,
        },
      },
    });
    if (!outcome.ok || outcome.value.report === null) throw new Error("decode failed");
    return outcome.value.report;
  }

  it("passes a zone object through without interpreting it", () => {
    expect(decoded({ id: 53, name: "Z", frozen: false })).toHaveProperty("zone", {
      id: 53,
      name: "Z",
      frozen: false,
    });
  });

  it("treats an absent zone as a decodable report", () => {
    const outcome = decodeFightContext({
      reportData: {
        report: {
          code: "aBcDeFgH12345678",
          revision: 3,
          startTime: 1,
          endTime: 2,
          masterData: { logVersion: 17, gameVersion: 1, actors: [], abilities: [] },
          phases: [],
          fights: [],
        },
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.value.report === null) return;
    expect(outcome.value.report.zone).toBeUndefined();
    expect(normalizeZone(outcome.value.report.zone)).toBeNull();
  });
});

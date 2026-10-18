/**
 * M11-G3-2: the profile-fidelity gate, against the GOLDEN exact-pin echo.
 *
 * tests/fixtures/simulation/simc-33622e9d-blood-subject-fidelity.json is the
 * approved engine's own report for the canonical subject's LOGGED_FIDELITY_PROBE
 * (scripts/bench/m11g32-profile-fidelity.bench.ts), projected to the fields the
 * parser and the profile echo read. These tests need no Docker.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { RUNNER_CHARACTER_BINDINGS } from "../../../runner/character-bindings.js";
import { APPROVED_ENGINE_ARTIFACTS } from "../../../runner/approved-artifacts.js";
import { assessProfileFidelity, GATED_CHECKS } from "../../../src/character-profile/fidelity.js";
import type { CharacterProfile } from "../../../src/character-profile/profile.js";
import {
  readCombatantPullFacts,
  type CombatantPullFacts,
} from "../../../src/character-profile/pull-facts.js";
import { reconstructCharacterProfile } from "../../../src/character-profile/reconstruct.js";
import { fidelityProbeJob } from "../../../src/character-profile/simulation-character.js";
import { prepareSimulation } from "../../../src/simulation/prepare.js";
import {
  extractProfileEcho,
  parseEncodedItem,
  type ProfileEcho,
} from "../../../src/simulation/profile-echo.js";
import { parseSimcJson } from "../../../src/simulation/result-parser.js";
import { BLOOD_CHARACTER_BINDING } from "../../../src/specs/deathknight/blood/character-binding.js";
import golden from "../../fixtures/simulation/simc-33622e9d-blood-subject-fidelity.json";
import { reconstructionInputOf, subjectEvidence } from "../../support/character/subject.js";
import { jsonBytes } from "../../support/simulation/dev-blood-job.js";

const binding = BLOOD_CHARACTER_BINDING;
const text = JSON.stringify(golden);
let profile: CharacterProfile;
let echo: ProfileEcho;
let pull: CombatantPullFacts | null;

beforeAll(async () => {
  const evidence = await subjectEvidence();
  profile = reconstructCharacterProfile(reconstructionInputOf(evidence), binding);
  pull = readCombatantPullFacts(evidence.rawCombatantInfo);
  const extracted = extractProfileEcho(text);
  if (!extracted.ok) throw new Error(extracted.failure.detail);
  echo = extracted.value;
});

/** A deliberately mutable copy of the echo, for injecting faults. */
type MutableItem = {
  slot: string;
  itemId: number;
  itemLevel: number;
  bonusIds: number[];
  gemIds: number[];
  enchantId: number | null;
};
type MutableEcho = {
  items: MutableItem[];
  observedSpellIds: number[];
  talents: string;
  specialization: string;
};
const mutate = (change: (copy: MutableEcho) => void): ProfileEcho => {
  const copy = structuredClone(echo) as unknown as MutableEcho;
  change(copy);
  return copy as unknown as ProfileEcho;
};
const item = (copy: MutableEcho, slot: string): MutableItem => {
  const found = copy.items.find((entry) => entry.slot === slot);
  if (found === undefined) throw new Error(slot);
  return found;
};

describe("M11-G3-2 profile fidelity on the exact-pin golden echo", () => {
  it("the golden report is the approved engine running the subject's own probe job", async () => {
    const artifact = APPROVED_ENGINE_ARTIFACTS[0];
    if (artifact === undefined) throw new Error("no artifact");
    expect(RUNNER_CHARACTER_BINDINGS).toContain(binding);
    const job = fidelityProbeJob(profile, binding);
    if (!job.ok) throw new Error(job.failure.detail);
    const prepared = await prepareSimulation(job.value, jsonBytes(job.value), artifact, [binding.simulation]);
    if (!prepared.ok) throw new Error(prepared.failure.detail);
    expect(prepared.value.keys.profileHash).toBe(golden._golden.jobProfileHash);
    const parsed = parseSimcJson(text, text.length, {
      job: prepared.value.job,
      binding: prepared.value.binding,
      profile: prepared.value.profile,
      policy: prepared.value.policy,
      approved: artifact,
      executedBinarySha256: artifact.binarySha256,
      profileHash: prepared.value.keys.profileHash,
      environmentHash: prepared.value.keys.environmentHash,
      executionProfileRevision: prepared.value.keys.executionProfileRevision,
    });
    expect(parsed.ok).toBe(true);
    expect(echo.race).toBe("none");
    expect(echo.talents).toBe(job.value.character.talents.importString);
  });

  it("Q-pin. the subject reconstructs faithfully: every gated check MATCHes except race", () => {
    const result = assessProfileFidelity(profile, binding, echo, pull);
    for (const name of GATED_CHECKS) {
      expect(result.checks[name].state, name).toBe(name === "race" ? "UNRESOLVED" : "MATCH");
    }
    expect(result.status).toBe("PARTIAL");
    expect(result.readiness).toBe("NOT_SIMULATION_READY");
    expect(result.blockers).toEqual([expect.stringMatching(/^RACE_UNRESOLVED/)]);
  });

  it("S. set bonuses: five pieces of one set activate the engine's 2pc and 4pc, and absence is a mismatch", () => {
    const result = assessProfileFidelity(profile, binding, echo, pull);
    expect(result.checks.setBonus.details[0]).toMatch(/2055x5.*2pc MID2, 4pc MID2/);
    const noSet = mutate((copy) => {
      copy.observedSpellIds = copy.observedSpellIds.filter((id) => ![1310372, 1300369, 1310571].includes(id));
    });
    expect(assessProfileFidelity(profile, binding, noSet, pull).checks.setBonus.state).toBe("MISMATCH");
    expect(assessProfileFidelity(profile, binding, noSet, pull).status).toBe("FAILED");
  });

  it("O/P/Q/R/G. a changed item, item level, gem, enchant or dropped bonus id is a FAILED fidelity", () => {
    const cases: [string, (copy: MutableEcho) => void, string][] = [
      ["item", (copy) => (item(copy, "trinket2").itemId = 250246), "gear"],
      ["item level", (copy) => (item(copy, "head").itemLevel = 324), "itemLevels"],
      ["gem", (copy) => (item(copy, "neck").gemIds = [240916, 240916]), "gems"],
      ["enchant", (copy) => (item(copy, "main_hand").enchantId = 3368), "enchants"],
      ["runeforge dropped", (copy) => (item(copy, "main_hand").enchantId = null), "enchants"],
      [
        "dropped bonus id",
        (copy) => (item(copy, "feet").bonusIds = item(copy, "feet").bonusIds.slice(1)),
        "bonusIds",
      ],
      ["missing item", (copy) => (copy.items = copy.items.filter((entry) => entry.slot !== "back")), "gear"],
      [
        "extra item",
        (copy) =>
          copy.items.push({
            slot: "off_hand",
            itemId: 1,
            itemLevel: 1,
            bonusIds: [],
            gemIds: [],
            enchantId: null,
          }),
        "gear",
      ],
    ];
    for (const [label, change, checkName] of cases) {
      const result = assessProfileFidelity(profile, binding, mutate(change), pull);
      expect(result.checks[checkName as (typeof GATED_CHECKS)[number]].state, label).toBe("MISMATCH");
      expect(result.status, label).toBe("FAILED");
      expect(result.readiness, label).toBe("NOT_SIMULATION_READY");
    }
  });

  it("N/M. a changed talent string or a wrong spec is a FAILED fidelity", () => {
    const talents = assessProfileFidelity(
      profile,
      binding,
      mutate((copy) => (copy.talents = "CoPAAAAAAAAAAAAAAAAAAAAAAwYW")),
      pull,
    );
    expect(talents.checks.talents.state).toBe("MISMATCH");
    const spec = assessProfileFidelity(
      profile,
      binding,
      mutate((copy) => (copy.specialization = "Frost Death Knight")),
      pull,
    );
    expect(spec.checks.spec.state).toBe("MISMATCH");
  });

  it("M. the import's hero selection must be the WCL hero tree", () => {
    const decode = profile.talents.decode;
    if (decode.state !== "DECODED") throw new Error("decode");
    const wrongHero: CharacterProfile = {
      ...profile,
      talents: { ...profile.talents, decode: { ...decode, selectedSubTreeIds: [33] } },
    };
    const result = assessProfileFidelity(wrongHero, binding, echo, pull);
    expect(result.checks.heroTree.state).toBe("MISMATCH");
    expect(result.status).toBe("FAILED");
  });

  it("bonus ids compare as a multiset: the engine's reordering is not a mismatch, duplication is", () => {
    const reordered = mutate((copy) => item(copy, "feet").bonusIds.reverse());
    expect(assessProfileFidelity(profile, binding, reordered, pull).checks.bonusIds.state).toBe("MATCH");
    const doubled = mutate((copy) => item(copy, "feet").bonusIds.push(8790));
    expect(assessProfileFidelity(profile, binding, doubled, pull).checks.bonusIds.state).toBe("MISMATCH");
  });

  it("K. shirt/tabard need not be echoed, but a wrong one is a mismatch", () => {
    expect(echo.items.map((entry) => entry.slot)).not.toContain("shirt");
    const wrongShirt = mutate((copy) =>
      copy.items.push({ slot: "shirt", itemId: 1, itemLevel: 1, bonusIds: [], gemIds: [], enchantId: null }),
    );
    expect(assessProfileFidelity(profile, binding, wrongShirt, pull).checks.gear.state).toBe("MISMATCH");
  });

  it("race: a KNOWN race the engine did not build is a mismatch", () => {
    const withRace = {
      ...profile,
      identity: {
        ...profile.identity,
        race: {
          state: "KNOWN" as const,
          value: "human" as const,
          source: { kind: "WCL_COMBATANTINFO" as const, field: "test" },
        },
      },
    };
    expect(assessProfileFidelity(withRace, binding, echo, pull).checks.race.state).toBe("MISMATCH");
  });

  it("P. stat reconciliation is a diagnostic, never a gate: WCL pull stats are buffed", () => {
    const stats = assessProfileFidelity(profile, binding, echo, pull).checks.stats;
    expect(stats.state).toBe("STAT_RECONCILIATION_NOT_PROVEN");
    const byField = Object.fromEntries(
      stats.residuals.map((residual) => [residual.field, residual.wclMinusEngine]),
    );
    expect(byField["armor"]).toBeCloseTo(0.274, 3);
    expect(byField["masteryRating"]).toBe(-231);
    expect(GATED_CHECKS).not.toContain("stats");
  });

  it("AC. a fidelity result carries no simulation number and never becomes SIMULATION_READY while blocked", () => {
    const result = assessProfileFidelity(profile, binding, echo, pull);
    expect(JSON.stringify(result)).not.toMatch(/"dps"|"mean"|ceiling/i);
    const unblocked = { ...profile, blockers: [] };
    const known = {
      ...unblocked,
      identity: {
        ...unblocked.identity,
        race: {
          state: "KNOWN" as const,
          value: "human" as const,
          source: { kind: "WCL_COMBATANTINFO" as const, field: "test" },
        },
      },
    };
    // Even with every blocker removed, a race the engine did not build cannot pass.
    expect(assessProfileFidelity(known, binding, echo, pull).readiness).toBe("NOT_SIMULATION_READY");
  });

  it("the golden echo carries no host path, user, timestamp or report identity, and is size-reviewed", () => {
    expect(text).not.toMatch(
      /[A-Za-z]:\\\\|\/work\/|\/tmp\/|\/home\/|Users|b1PmaKrd6CDfzngc|"timestamp"|"build_date"|"build_time"/,
    );
    expect(text.length).toBeLessThan(32 * 1024);
  });

  it("the encoded-item reader fails closed", () => {
    expect(parseEncodedItem("head", "x,id=12,bonus_id=1/2,enchant_id=3", 10)).toEqual({
      slot: "head",
      itemId: 12,
      itemLevel: 10,
      bonusIds: [1, 2],
      gemIds: [],
      enchantId: 3,
    });
    expect(parseEncodedItem("head", "x,id=abc", 10)).toBeNull();
    expect(parseEncodedItem("head", "x,id=12,bonus_id=1/-2", 10)).toBeNull();
    expect(parseEncodedItem("head", "x,id=12,junk", 10)).toBeNull();
  });
});

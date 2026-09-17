/**
 * M10-C5 Phase A: the Protection-owned aura bindings and the pinned aura
 * identity they read, over the committed 45-second slice, its gap derivative
 * and a synthetic build without Sentinel.
 *
 * M10-C5 Phase B2 adds the Vanguard and Hammer of Wrath readiness identities,
 * the build-implied absences, and the same-millisecond position rule over
 * the composed 165-second fight.
 */

import { describe, expect, it } from "vitest";

import {
  HAMMER_OF_WRATH_BUFF_SPELL_ID,
  PROTECTION_AURA_IDENTITIES,
  PROTECTION_BUILD_IMPLIED_ABSENCES,
  protectionAuraIdentitiesFor,
  SENTINEL_BUFF_SPELL_ID,
  VANGUARD_BUFF_SPELL_ID,
} from "../../src/data/game/paladin-protection-aura-authority.js";
import {
  SC_PALADIN_CPP_SHA256,
  SC_PALADIN_PROTECTION_CPP_SHA256,
} from "../../src/data/game/paladin-protection-transition-authority.js";
import type { TalentResolution } from "../../src/data/game/talent-selection.js";
import {
  bindProtectionAura,
  bindSupportedProtectionAuras,
  protectionBuffBindingsFrom,
  SUPPORTED_PROTECTION_AURA_ATOMS,
} from "../../src/specs/paladin/protection/aura-bindings.js";
import { bindBuildImpliedAbsence } from "../../src/specs/paladin/protection/build-absences.js";
import { corpusBundleState, corpusState, positionOfCast } from "../support/corpus/fight.js";

const ROTATIONAL = "wcl-protection-paladin-a7r6-rotational-45s";
const GAP = "wcl-protection-paladin-a7r6-rotational-45s.gap-before-2026589";
const TANK = 7;
const [DIVINE_TOLL, BLESSED_HAMMER, CONSECRATION, JUDGMENT] = [375576, 204019, 26573, 275779];
const [HAMMER_OF_WRATH, AVENGERS_SHIELD, SACRED_WEAPON] = [1241413, 31935, 432472];
const SEG = "wcl-protection-paladin-a7r6-rotational-165s";
const BUNDLE = [
  ROTATIONAL,
  `${SEG}.seg-45-60`,
  `${SEG}.seg-60-90`,
  `${SEG}.seg-90-120`,
  `${SEG}.seg-120-165`,
];

const selected = (simcName: string): TalentResolution => ({
  simcName,
  selection: "SELECTED",
  reason: "OWN_ENTRY_SELECTED",
  identity: null,
  decidedByEntryId: 1,
});
const notSelected = (simcName: string): TalentResolution => ({
  simcName,
  selection: "NOT_SELECTED",
  reason: "ALTERNATIVE_ENTRY_SELECTED",
  identity: null,
  decidedByEntryId: 2,
});
const unknownTalent = (simcName: string): TalentResolution => ({
  simcName,
  selection: "UNKNOWN",
  reason: "NODE_ABSENT",
  identity: null,
  decidedByEntryId: null,
});

function at(state: ReturnType<typeof corpusState>, reportTimeMs: number, abilityGameId: number) {
  const found = positionOfCast(state, { actorId: TANK, reportTimeMs, abilityGameId });
  if (!found.ok) throw new Error(found.detail);
  return found.position;
}

describe("the pinned aura identity", () => {
  it("pins buff.avenging_wrath to the Sentinel aura 389539 under the Sentinel talent, with claims against the reviewed module hashes", () => {
    expect(SUPPORTED_PROTECTION_AURA_ATOMS).toEqual(["avenging_wrath", "vanguard", "hammer_of_wrath"]);
    expect(PROTECTION_AURA_IDENTITIES).toHaveLength(3);
    const [identity] = protectionAuraIdentitiesFor("avenging_wrath");
    expect(identity).toMatchObject({
      atomName: "avenging_wrath",
      requiresTalent: { simcName: "sentinel", selection: "SELECTED" },
      abilityGameId: SENTINEL_BUFF_SPELL_ID,
      selfApplied: true,
    });
    expect(SENTINEL_BUFF_SPELL_ID).toBe(389539);
    const hashes = new Set(identity?.claims.map((claim) => claim.sourceSha256));
    expect(hashes).toEqual(new Set([SC_PALADIN_CPP_SHA256, SC_PALADIN_PROTECTION_CPP_SHA256]));
    expect(identity?.claims.some((claim) => claim.lines === "5296-5299")).toBe(true);
    expect(protectionAuraIdentitiesFor("sacred_weapon")).toEqual([]);
  });

  it("pins buff.vanguard to 1268810 under apex.1 (Glory of the Vanguard) and the Hammer of Wrath readiness aura to 1277026 with no build gate", () => {
    expect(VANGUARD_BUFF_SPELL_ID).toBe(1268810);
    expect(HAMMER_OF_WRATH_BUFF_SPELL_ID).toBe(1277026);
    const [vanguard] = protectionAuraIdentitiesFor("vanguard");
    expect(vanguard).toMatchObject({
      atomName: "vanguard",
      requiresTalent: { simcName: "glory_of_the_vanguard", selection: "SELECTED" },
      abilityGameId: 1268810,
    });
    const [hammerOfWrath] = protectionAuraIdentitiesFor("hammer_of_wrath");
    expect(hammerOfWrath).toMatchObject({
      atomName: "hammer_of_wrath",
      requiresTalent: null,
      abilityGameId: 1277026,
    });
    expect(hammerOfWrath?.claims.some((claim) => claim.lines.includes("1799-1801"))).toBe(true);
    // The build-implied absences and their gates.
    expect(
      PROTECTION_BUILD_IMPLIED_ABSENCES.map((entry) => [entry.atomName, entry.abilityGameId, entry.gate]),
    ).toEqual([
      ["hammer_of_light_ready", 427441, { kind: "HERO_TREE_NOT", simcName: "templar" }],
      ["hammer_of_light_free", 433732, { kind: "HERO_TREE_NOT", simcName: "templar" }],
      ["undisputed_ruling", 432629, { kind: "HERO_TREE_NOT", simcName: "templar" }],
      ["blessed_assurance", 433019, { kind: "TALENT_NOT_SELECTED", simcName: "blessed_assurance" }],
    ]);
  });
});

describe("the build-implied absences (M10-C5 Phase B)", () => {
  const lightsmith = {
    state: "RESOLVED" as const,
    simcName: "lightsmith",
    subTreeId: 49,
    decidedByEntryIds: [],
  };
  const templar = { state: "RESOLVED" as const, simcName: "templar", subTreeId: 48, decidedByEntryIds: [] };

  it("bind FALSE only behind a gate the observed build establishes, and never from the aura stream", () => {
    const talents = { blessed_assurance: notSelected("blessed_assurance") };
    expect(bindBuildImpliedAbsence({ talents, heroTree: lightsmith }, "hammer_of_light_ready")).toEqual({
      atomName: "hammer_of_light_ready",
      state: "BOUND_BY_BUILD",
      up: false,
      abilityGameId: 427441,
      gate: "HERO_TREE_NOT:templar",
    });
    expect(bindBuildImpliedAbsence({ talents, heroTree: lightsmith }, "blessed_assurance")).toMatchObject({
      state: "BOUND_BY_BUILD",
      up: false,
      gate: "TALENT_NOT_SELECTED:blessed_assurance",
    });
    // A Templar build, an unresolved tree, a SELECTED or UNKNOWN talent: no gate, no FALSE.
    expect(bindBuildImpliedAbsence({ talents, heroTree: templar }, "hammer_of_light_ready")).toMatchObject({
      state: "UNBOUND",
      reason: "BUILD_GATE_NOT_ESTABLISHED",
      abilityGameId: 427441,
    });
    expect(bindBuildImpliedAbsence({ talents }, "undisputed_ruling")).toMatchObject({
      state: "UNBOUND",
      reason: "BUILD_GATE_NOT_ESTABLISHED",
    });
    for (const gate of [selected("blessed_assurance"), unknownTalent("blessed_assurance")]) {
      expect(
        bindBuildImpliedAbsence(
          { talents: { blessed_assurance: gate }, heroTree: lightsmith },
          "blessed_assurance",
        ),
      ).toMatchObject({ state: "UNBOUND", reason: "BUILD_GATE_NOT_ESTABLISHED" });
    }
    expect(bindBuildImpliedAbsence({ talents, heroTree: lightsmith }, "no_such_atom")).toMatchObject({
      state: "UNBOUND",
      reason: "IDENTITY_NOT_ESTABLISHED_FOR_BUILD",
    });
    // The knownBuffs shape carries BOUND_BY_BUILD as an ordinary FALSE binding.
    expect(
      protectionBuffBindingsFrom([
        bindBuildImpliedAbsence({ talents, heroTree: lightsmith }, "hammer_of_light_free"),
      ]),
    ).toEqual([{ name: "hammer_of_light_free", up: false }]);
  });
});

describe("the Hammer of Wrath readiness aura over the REAL 45-second slice", () => {
  const state = corpusState(ROTATIONAL);
  const talents = { sentinel: selected("sentinel") };

  it("is BOUND true after the Sentinel press applies it, BOUND false after its observed removal, and UNBOUND before either", () => {
    expect(
      bindProtectionAura(
        { state, actorId: TANK, position: at(state, 2025857, BLESSED_HAMMER), talents },
        "hammer_of_wrath",
      ),
    ).toMatchObject({ state: "UNBOUND", reason: "AURA_STATE_UNKNOWN", abilityGameId: 1277026 });
    const up = bindProtectionAura(
      { state, actorId: TANK, position: at(state, 2027501, HAMMER_OF_WRATH), talents },
      "hammer_of_wrath",
    );
    expect(up).toMatchObject({ state: "BOUND", up: true, abilityGameId: 1277026 });
    if (up.state === "BOUND") expect(up.anchorLocator.reportTimeMs).toBe(2026241);
    const down = bindProtectionAura(
      { state, actorId: TANK, position: at(state, 2048592, CONSECRATION), talents },
      "hammer_of_wrath",
    );
    expect(down).toMatchObject({ state: "BOUND", up: false, abilityGameId: 1277026 });
    if (down.state === "BOUND") expect(down.anchorLocator.reportTimeMs).toBe(2048248);
    // A readiness aura, not an APL buff atom: never exported to knownBuffs.
    expect(protectionBuffBindingsFrom([up, down])).toEqual([]);
  });

  it("vanguard needs apex.1 SELECTED for its identity, and has no transition in the first 45 seconds", () => {
    const position = at(state, 2048592, CONSECRATION);
    expect(bindProtectionAura({ state, actorId: TANK, position, talents }, "vanguard")).toMatchObject({
      state: "UNBOUND",
      reason: "IDENTITY_NOT_ESTABLISHED_FOR_BUILD",
    });
    expect(
      bindProtectionAura(
        {
          state,
          actorId: TANK,
          position,
          talents: { ...talents, glory_of_the_vanguard: selected("apex.1") },
        },
        "vanguard",
      ),
    ).toMatchObject({ state: "UNBOUND", reason: "AURA_STATE_UNKNOWN", abilityGameId: 1268810 });
  });
});

describe("the same-millisecond position rule over the composed 165-second fight", () => {
  const state = corpusBundleState(BUNDLE, []);
  const talents = { sentinel: selected("sentinel"), glory_of_the_vanguard: selected("apex.1") };

  it("an aura the decision's own cast applies at the same millisecond is not visible to that cast, and is to the next", () => {
    // The Judgment at 2,131,157 applies Vanguard at 2,131,157; the application
    // sits AFTER the cast in canonical order. BEFORE_EVENT at the cast's
    // position sees the removal at 2,082,694 as the last transition.
    const atJudgment = bindProtectionAura(
      { state, actorId: TANK, position: at(state, 2131157, JUDGMENT), talents },
      "vanguard",
    );
    expect(atJudgment).toMatchObject({ state: "BOUND", up: false, abilityGameId: 1268810 });
    if (atJudgment.state === "BOUND") expect(atJudgment.anchorLocator.reportTimeMs).toBe(2082694);
    const next = bindProtectionAura(
      { state, actorId: TANK, position: at(state, 2132185, BLESSED_HAMMER), talents },
      "vanguard",
    );
    expect(next).toMatchObject({ state: "BOUND", up: true });
    if (next.state === "BOUND") expect(next.anchorLocator.reportTimeMs).toBe(2131157);
    // The Avenger's Shield at 2,139,100 sees Vanguard up; it is removed at 2,139,123.
    const atShield = bindProtectionAura(
      { state, actorId: TANK, position: at(state, 2139100, AVENGERS_SHIELD), talents },
      "vanguard",
    );
    expect(atShield).toMatchObject({ state: "BOUND", up: true });
    expect(
      bindProtectionAura(
        { state, actorId: TANK, position: at(state, 2140155, JUDGMENT), talents },
        "vanguard",
      ),
    ).toMatchObject({ state: "BOUND", up: false });
  });

  it("every supported atom at the Sacred Weapon hardcast at 2,125,600, from evidence strictly before it", () => {
    const bindings = bindSupportedProtectionAuras({
      state,
      actorId: TANK,
      position: at(state, 2125600, SACRED_WEAPON),
      talents: { ...talents, blessed_assurance: notSelected("blessed_assurance") },
      heroTree: { state: "RESOLVED", simcName: "lightsmith", subTreeId: 49, decidedByEntryIds: [] },
    });
    expect(
      bindings.map((binding) => [
        binding.atomName,
        binding.state,
        binding.state === "UNBOUND" ? null : binding.up,
        binding.state === "BOUND" ? binding.anchorLocator.reportTimeMs : null,
      ]),
    ).toEqual([
      ["avenging_wrath", "BOUND", false, 2106345],
      ["vanguard", "BOUND", false, 2082694],
      ["hammer_of_wrath", "BOUND", false, 2106345],
      ["hammer_of_light_ready", "BOUND_BY_BUILD", false, null],
      ["hammer_of_light_free", "BOUND_BY_BUILD", false, null],
      ["undisputed_ruling", "BOUND_BY_BUILD", false, null],
      ["blessed_assurance", "BOUND_BY_BUILD", false, null],
    ]);
    expect(protectionBuffBindingsFrom(bindings).map((entry) => entry.name)).toEqual([
      "avenging_wrath",
      "vanguard",
      "hammer_of_light_ready",
      "hammer_of_light_free",
      "undisputed_ruling",
      "blessed_assurance",
    ]);
  });
});

describe("over the REAL 45-second slice", () => {
  const state = corpusState(ROTATIONAL);
  const talents = { sentinel: selected("sentinel") };

  it("binds TRUE at the Divine Toll press from the Sentinel aura M4 observed applied 414 ms earlier", () => {
    const binding = bindProtectionAura(
      { state, actorId: TANK, position: at(state, 2026655, DIVINE_TOLL), talents },
      "avenging_wrath",
    );
    expect(binding).toMatchObject({ state: "BOUND", up: true, abilityGameId: 389539 });
    if (binding.state === "BOUND") expect(binding.anchorLocator.reportTimeMs).toBe(2026241);
    expect(protectionBuffBindingsFrom([binding])).toEqual([{ name: "avenging_wrath", up: true }]);
  });

  it("leaves the atom UNBOUND before the first observed transition — never inactive from silence, never from the later press", () => {
    for (const [t, ability] of [
      [2005436, JUDGMENT],
      [2025857, BLESSED_HAMMER],
    ] as const) {
      const binding = bindProtectionAura(
        { state, actorId: TANK, position: at(state, t, ability), talents },
        "avenging_wrath",
      );
      expect(binding).toMatchObject({
        state: "UNBOUND",
        reason: "AURA_STATE_UNKNOWN",
        abilityGameId: 389539,
      });
      expect(protectionBuffBindingsFrom([binding])).toEqual([]);
    }
  });

  it("binds FALSE after the observed removal at 2,048,248", () => {
    const binding = bindProtectionAura(
      { state, actorId: TANK, position: at(state, 2048592, CONSECRATION), talents },
      "avenging_wrath",
    );
    expect(binding).toMatchObject({ state: "BOUND", up: false, abilityGameId: 389539 });
    if (binding.state === "BOUND") expect(binding.anchorLocator.reportTimeMs).toBe(2048248);
  });

  it("without the Sentinel talent the identity is not established for the build, and nothing is read", () => {
    for (const gate of [notSelected("sentinel"), unknownTalent("sentinel")]) {
      const binding = bindProtectionAura(
        { state, actorId: TANK, position: at(state, 2026655, DIVINE_TOLL), talents: { sentinel: gate } },
        "avenging_wrath",
      );
      expect(binding).toEqual({
        atomName: "avenging_wrath",
        state: "UNBOUND",
        reason: "IDENTITY_NOT_ESTABLISHED_FOR_BUILD",
        abilityGameId: null,
        auraReason: null,
      });
    }
    expect(
      bindSupportedProtectionAuras({
        state,
        actorId: TANK,
        position: at(state, 2026655, DIVINE_TOLL),
        talents: {},
      })[0]?.state,
    ).toBe("UNBOUND");
  });
});

describe("over the gap derivative", () => {
  it("the application was removed, so the same press is UNBOUND; the retained removal still binds FALSE later", () => {
    const state = corpusState(GAP);
    const talents = { sentinel: selected("sentinel") };
    expect(
      bindProtectionAura(
        { state, actorId: TANK, position: at(state, 2026655, DIVINE_TOLL), talents },
        "avenging_wrath",
      ),
    ).toMatchObject({
      state: "UNBOUND",
      reason: "AURA_STATE_UNKNOWN",
    });
    expect(
      bindProtectionAura(
        { state, actorId: TANK, position: at(state, 2048592, CONSECRATION), talents },
        "avenging_wrath",
      ),
    ).toMatchObject({
      state: "BOUND",
      up: false,
    });
  });
});

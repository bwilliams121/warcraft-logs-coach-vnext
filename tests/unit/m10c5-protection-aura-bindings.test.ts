/**
 * M10-C5 Phase A: the Protection-owned aura bindings and the pinned aura
 * identity they read, over the committed 45-second slice, its gap derivative
 * and a synthetic build without Sentinel.
 */

import { describe, expect, it } from "vitest";

import {
  PROTECTION_AURA_IDENTITIES,
  protectionAuraIdentitiesFor,
  SENTINEL_BUFF_SPELL_ID,
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
import { corpusState, positionOfCast } from "../support/corpus/fight.js";

const ROTATIONAL = "wcl-protection-paladin-a7r6-rotational-45s";
const GAP = "wcl-protection-paladin-a7r6-rotational-45s.gap-before-2026589";
const TANK = 7;
const [DIVINE_TOLL, BLESSED_HAMMER, CONSECRATION, JUDGMENT] = [375576, 204019, 26573, 275779];

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
    expect(SUPPORTED_PROTECTION_AURA_ATOMS).toEqual(["avenging_wrath"]);
    expect(PROTECTION_AURA_IDENTITIES).toHaveLength(1);
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

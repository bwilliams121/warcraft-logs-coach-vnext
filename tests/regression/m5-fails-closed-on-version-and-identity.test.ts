import { describe, expect, it } from "vitest";

import { createCombatState } from "../../src/engine/state/combat-state.js";
import { resourceWireTypeFor } from "../../src/data/wcl-wire/resource-types.js";
import { ROGUE_ABILITIES, abilityIdentityFor } from "../../src/data/game/rogue-abilities.js";
import { evaluateAssassinationEnvenom } from "../../src/specs/rogue/assassination/evaluator.js";
import { attachedResources, castEvent, classResource, syntheticFight } from "../support/synthetic-fight.js";
import type { CombatAbility } from "../../src/engine/normalization/abilities.js";
import {
  ASSASSINATION_ACTOR_B,
  ENVENOM_SPELL_ID,
  m5aState,
  m5aStateWithVersions,
} from "../support/m5a-fixture.js";

/**
 * Two fail-closed guarantees, on real and synthetic evidence.
 *
 * 1. The combo-point wire contract applies to ONE parser version pair. Outside
 *    it, the run declines entirely rather than reading type 4 as combo points on
 *    faith.
 * 2. Ability identity is a NUMBER. Warcraft Logs names are localized display
 *    strings, nullable, and not even unique — the captured catalog for this very
 *    fight contains two distinct ids both named "Mutilate".
 */

const ROGUE = 19;
const COMBO_POINTS_WIRE_TYPE = 4;

describe("the combo-point wire contract is version gated", () => {
  it("applies at the established gameVersion 1 / logVersion 17", () => {
    const run = evaluateAssassinationEnvenom(m5aState(), { actorId: ASSASSINATION_ACTOR_B });
    expect(run.outcome).toBe("EVALUATED");
  });

  it.each([
    ["a different logVersion", { logVersion: 18 }],
    ["a different gameVersion", { gameVersion: 2 }],
    ["an absent gameVersion", { gameVersion: null }],
  ])("declines the whole run under %s", (_label, overrides) => {
    const run = evaluateAssassinationEnvenom(m5aStateWithVersions(overrides), {
      actorId: ASSASSINATION_ACTOR_B,
    });

    expect(run.outcome).toBe("NOT_EVALUATED");
    if (run.outcome !== "NOT_EVALUATED") return;
    expect(run.reason).toBe("INCOMPATIBLE_RESOURCE_WIRE_VERSION");
    // NOT_EVALUATED carries no findings field at all, so "zero findings" cannot
    // be mistaken for "nothing to report".
    expect(run).not.toHaveProperty("findings");
    expect(run).not.toHaveProperty("coverage");
  });

  it("never resolves a wire type outside the declared scope", () => {
    expect(resourceWireTypeFor("COMBO_POINTS", { gameVersion: 1, logVersion: 17 })).toMatchObject({
      ok: true,
      wireType: 4,
    });
    for (const keys of [
      { gameVersion: 1, logVersion: 18 },
      { gameVersion: 2, logVersion: 17 },
      { gameVersion: null, logVersion: 17 },
    ]) {
      const resolution = resourceWireTypeFor("COMBO_POINTS", keys);
      expect(resolution.ok).toBe(false);
      if (resolution.ok) continue;
      expect(resolution.reason).toBe("INCOMPATIBLE_VERSION");
    }
  });

  it("declares the mapping with BOTH kinds of evidence", () => {
    const resolution = resourceWireTypeFor("COMBO_POINTS", { gameVersion: 1, logVersion: 17 });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    // A game enum says what the GAME means. It cannot establish what a
    // third-party parser put on the wire, so a capture must corroborate.
    expect(resolution.contract.evidence.gameEnum.enumName).toBe("Enum.PowerType");
    expect(resolution.contract.evidence.gameEnum.memberName).toBe("ComboPoints");
    expect(resolution.contract.evidence.gameEnum.value).toBe(4);
    expect(resolution.contract.evidence.wireCorroboration.fixtureId).toBe(
      "wcl-assassination-envenom-combo-points",
    );
    expect(resolution.contract.evidence.wireCorroboration.reportRevision).toBe(30);
  });
});

describe("the observed ability is matched by numeric game id", () => {
  it("resolves the SimulationCraft token to a canonical spell id", () => {
    const resolution = abilityIdentityFor("envenom");
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.identity.spellId).toBe(ENVENOM_SPELL_ID);
  });

  it("keeps the dataset minimal rather than becoming a spell database", () => {
    // Enumerated, not counted: each entry exists because a supported sub-list
    // selection has to NAME what it selected. `envenom` for M5-A's `spend`,
    // `garrote` for M5-C3a's `core_dot`. A third requires a third decision.
    expect(ROGUE_ABILITIES.map((ability) => ability.simcToken)).toEqual(["envenom", "garrote"]);
  });

  it("ignores a different ability that Warcraft Logs happens to name 'Envenom'", () => {
    const IMPOSTER = 999_999;
    // The real captured catalog for this fight contains two distinct ids both
    // named "Mutilate", so name -> id is not even a function upstream.
    const abilities = new Map<number, CombatAbility>([
      [IMPOSTER, { gameId: IMPOSTER, name: "Envenom", school: "8" }],
      [ENVENOM_SPELL_ID, { gameId: ENVENOM_SPELL_ID, name: "Totally Different Localized Name", school: "8" }],
    ]);

    const state = createCombatState(
      syntheticFight({
        observedCategories: ["CASTS", "RESOURCES"],
        abilities,
        events: [
          castEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            castPhase: "COMPLETE",
            sourceActorId: ROGUE,
            abilityGameId: IMPOSTER,
            attachedResources: attachedResources({
              side: "SOURCE",
              actorId: ROGUE,
              classResources: [classResource(COMBO_POINTS_WIRE_TYPE, 3, { max: 7, cost: 3 })],
            }),
          }),
        ],
      }),
    );

    const run = evaluateAssassinationEnvenom(state, { actorId: ROGUE });
    expect(run.outcome).toBe("EVALUATED");
    if (run.outcome !== "EVALUATED") return;
    // The imposter is at 3/7 and would have been rejected had the evaluator
    // matched on the display name.
    expect(run.findings).toHaveLength(0);
    expect(run.coverage.observedEnvenomCastsInScope).toBe(0);
  });

  it("finds the real ability even when its catalog name is wrong or absent", () => {
    const abilities = new Map<number, CombatAbility>([
      [ENVENOM_SPELL_ID, { gameId: ENVENOM_SPELL_ID, name: null, school: null }],
    ]);
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["CASTS", "RESOURCES"],
        abilities,
        events: [
          castEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            castPhase: "COMPLETE",
            sourceActorId: ROGUE,
            abilityGameId: ENVENOM_SPELL_ID,
            attachedResources: attachedResources({
              side: "SOURCE",
              actorId: ROGUE,
              classResources: [classResource(COMBO_POINTS_WIRE_TYPE, 3, { max: 7, cost: 3 })],
            }),
          }),
        ],
      }),
    );

    const run = evaluateAssassinationEnvenom(state, { actorId: ROGUE });
    if (run.outcome !== "EVALUATED") return;
    expect(run.findings).toHaveLength(1);
    expect(run.findings[0]?.judgment.status).toBe("REJECTED_BY_AUTHORITY");
  });

  it("only considers COMPLETE casts, never begincast", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["CASTS", "RESOURCES"],
        events: [
          castEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            castPhase: "BEGIN",
            sourceActorId: ROGUE,
            abilityGameId: ENVENOM_SPELL_ID,
            attachedResources: attachedResources({
              side: "SOURCE",
              actorId: ROGUE,
              classResources: [classResource(COMBO_POINTS_WIRE_TYPE, 3, { max: 7, cost: 3 })],
            }),
          }),
        ],
      }),
    );
    const run = evaluateAssassinationEnvenom(state, { actorId: ROGUE });
    if (run.outcome !== "EVALUATED") return;
    expect(run.findings).toHaveLength(0);
  });
});

/**
 * M11-E1 / owner decision M5: the focus player's OWN pets may be vouched for
 * under PLAYER_CONTEXT — when an analyzer declares it, and only them.
 */

import { describe, expect, it } from "vitest";

import { focusedFightFor } from "../../src/engine/normalization/fight-core.js";
import type { CombatActor } from "../../src/engine/normalization/actors.js";
import {
  requirementFromCapabilities,
  type DecisionCapability,
} from "../../src/findings/decision-capability.js";
import { deriveIngestionScope } from "../../src/services/ingestion-scope.js";
import { deriveEvidenceActorScope } from "../../src/wcl/evidence-actor-scope.js";
import { syntheticFightCore } from "../support/synthetic-fight.js";

const FOCUS = 7;
const ALLY = 8;
const FOCUS_PET = 40;
const ALLY_PET = 41;
const UNOWNED_PET = 42;
const BOSS = 21;

function actor(actorId: number, actorType: CombatActor["actorType"], petOwner: number | null): CombatActor {
  return {
    actorId,
    gameId: null,
    name: null,
    server: null,
    actorType,
    rawType: null,
    subType: null,
    petOwnerActorId: petOwner,
  };
}

const ACTORS: ReadonlyMap<number, CombatActor> = new Map([
  [FOCUS, actor(FOCUS, "PLAYER", null)],
  [ALLY, actor(ALLY, "PLAYER", null)],
  [FOCUS_PET, actor(FOCUS_PET, "PET", FOCUS)],
  [ALLY_PET, actor(ALLY_PET, "PET", ALLY)],
  [UNOWNED_PET, actor(UNOWNED_PET, "PET", null)],
  [BOSS, actor(BOSS, "NPC", null)],
]);

const base = { focusActorId: FOCUS, friendlyPlayerActorIds: [FOCUS, ALLY], actors: ACTORS } as const;

describe("the PLAYER_CONTEXT evidence scope", () => {
  it("is unchanged without the declaration: the focus player's own pet stays fenced off", () => {
    expect(deriveEvidenceActorScope({ ...base, scope: "PLAYER_CONTEXT" })).toEqual([
      FOCUS,
      BOSS,
      UNOWNED_PET,
    ]);
    expect(
      deriveEvidenceActorScope({ ...base, scope: "PLAYER_CONTEXT", includeFocusOwnedPets: false }),
    ).toEqual([FOCUS, BOSS, UNOWNED_PET]);
  });

  it("widens to exactly the focus player's WCL-stated pets when declared", () => {
    expect(
      deriveEvidenceActorScope({ ...base, scope: "PLAYER_CONTEXT", includeFocusOwnedPets: true }),
    ).toEqual([FOCUS, BOSS, FOCUS_PET, UNOWNED_PET]);
  });

  it("never widens to another player's pet, and leaves FULL_RAID as every actor", () => {
    const widened = deriveEvidenceActorScope({
      ...base,
      scope: "PLAYER_CONTEXT",
      includeFocusOwnedPets: true,
    });
    expect(widened).not.toContain(ALLY_PET);
    expect(widened).not.toContain(ALLY);
    expect(deriveEvidenceActorScope({ ...base, scope: "FULL_RAID", includeFocusOwnedPets: true })).toBeNull();
  });

  it("reaches the focused view only through the declared option", () => {
    const core = syntheticFightCore({ actors: ACTORS, friendlyPlayers: [FOCUS, ALLY] });
    const scopeOf = (fight: ReturnType<typeof focusedFightFor>) => {
      const damage = fight.completeness.categories.DAMAGE;
      return damage.capability === "OBSERVABLE" ? damage.coverage.actorScope : "not observable";
    };
    expect(scopeOf(focusedFightFor(core, FOCUS, "PLAYER_CONTEXT"))).not.toContain(FOCUS_PET);
    expect(scopeOf(focusedFightFor(core, FOCUS, "PLAYER_CONTEXT", { ownedPetEvidence: true }))).toContain(
      FOCUS_PET,
    );
    expect(scopeOf(focusedFightFor(core, ALLY, "PLAYER_CONTEXT", { ownedPetEvidence: true }))).toEqual(
      expect.not.arrayContaining([FOCUS_PET]),
    );
  });
});

describe("the declaration is derived, never chosen", () => {
  const capability = (ownedPetEvidence: boolean): DecisionCapability => ({
    capabilityId: "c",
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS"],
      targetModel: "PER_OBSERVED_CAST",
      ...(ownedPetEvidence ? { ownedPetEvidence: true as const } : {}),
    },
  });

  it("is absent from every requirement that does not declare it, so no existing shape changes", () => {
    expect(requirementFromCapabilities("a", [capability(false)])).toEqual({
      analyzerId: "a",
      requiredScope: "PLAYER_CONTEXT",
      includeResources: false,
    });
    expect(deriveIngestionScope([requirementFromCapabilities("a", [capability(false)])])).toEqual({
      ok: true,
      scope: "PLAYER_CONTEXT",
      contributingAnalyzers: ["a"],
    });
  });

  it("is unioned across the selected analyzers", () => {
    const declared = requirementFromCapabilities("b", [capability(false), capability(true)]);
    expect(declared.ownedPetEvidence).toBe(true);
    expect(
      deriveIngestionScope([requirementFromCapabilities("a", [capability(false)]), declared]),
    ).toMatchObject({ ok: true, ownedPetEvidence: true });
  });
});

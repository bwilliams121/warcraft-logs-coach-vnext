import { describe, expect, it } from "vitest";

import {
  EXECUTION_LANES,
  baseGcdMsForAbility,
  executionLaneForAbility,
  executionLaneForToken,
  invariantLaneAcross,
  laneForBaseGcdMs,
  pinnedRogueGcdSemantics,
  resolveTokenBinding,
} from "../../src/data/game/ability-gcd-semantics.js";
import { validateGcdSemanticsArtifact } from "../../src/data/game/gcd-semantics-artifact.js";
import artifact from "../../src/data/game/rogue-gcd-semantics.json";

/**
 * Execution lane, and the two things it must never become.
 *
 * The lane is `baseGcdMs > 0`, which is SimulationCraft's own predicate
 * (`player.cpp:7397`) applied to the number it derives `trigger_gcd` from
 * (`action.cpp:645`). Everything here is that one rule plus the refusals around
 * it:
 *
 *   - an ability with no record is UNKNOWN_LANE, never a default
 *   - a token whose candidates disagree is UNKNOWN_LANE, never a chosen branch
 */

const KICK = 1766;
const STEALTH = 1784;
const VANISH = 1856;
const AMBUSH = 8676;
const ENVENOM = 32645;
const DEATHMARK = 360194;
const THISTLE_TEA = 381623;
const KINGSBANE = 385627;
const THISTLE_TEA_ALTERNATE = 469779;

describe("the pinned dataset loads", () => {
  it("validates and exposes exactly the supported slice", () => {
    const loaded = pinnedRogueGcdSemantics();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.artifact.datasetId).toBe("SIMC_DBC_ROGUE_GCD_SEMANTICS");
    expect(loaded.artifact.abilities).toHaveLength(9);
  });

  it("permits exactly three execution lanes", () => {
    expect([...EXECUTION_LANES]).toEqual(["GCD_CONSUMING", "NON_GCD", "UNKNOWN_LANE"]);
  });
});

describe("the lane is derived from the base GCD", () => {
  it.each([
    [0, "NON_GCD"],
    [1, "GCD_CONSUMING"],
    [1000, "GCD_CONSUMING"],
    [1500, "GCD_CONSUMING"],
  ] as const)("maps %ims to %s", (baseGcdMs, lane) => {
    expect(laneForBaseGcdMs(baseGcdMs)).toBe(lane);
  });

  it.each([
    [KICK, 0, "NON_GCD"],
    [STEALTH, 0, "NON_GCD"],
    [VANISH, 0, "NON_GCD"],
    [AMBUSH, 1000, "GCD_CONSUMING"],
    [ENVENOM, 1000, "GCD_CONSUMING"],
    [DEATHMARK, 1000, "GCD_CONSUMING"],
    [THISTLE_TEA, 0, "NON_GCD"],
    [THISTLE_TEA_ALTERNATE, 0, "NON_GCD"],
    [KINGSBANE, 1000, "GCD_CONSUMING"],
  ] as const)("reads ability %i as %ims -> %s", (abilityGameId, baseGcdMs, lane) => {
    expect(baseGcdMsForAbility(abilityGameId)).toBe(baseGcdMs);
    expect(executionLaneForAbility(abilityGameId)).toBe(lane);
  });

  it("models a DURATION for nothing at all", () => {
    // Haste turns 1.0s into 0.8s and does not change the lane. Storing or
    // deriving a haste-adjusted duration would invite exactly the timing
    // precision this milestone has no evidence for.
    const loaded = pinnedRogueGcdSemantics();
    if (!loaded.ok) return;
    for (const record of loaded.artifact.abilities) {
      expect(Object.keys(record).sort()).toEqual(["abilityGameId", "baseGcdMs", "displayNameEn"]);
    }
  });
});

describe("an unknown ability is UNKNOWN_LANE, never a default", () => {
  it.each([
    ["an ability this dataset does not carry", 1329],
    ["a plausible but absent Rogue spell", 703],
    ["an id that is not a spell at all", 999_999_999],
    ["zero", 0],
    ["a negative id", -1],
  ])("refuses to classify %s", (_label, abilityGameId) => {
    expect(baseGcdMsForAbility(abilityGameId)).toBeNull();
    expect(executionLaneForAbility(abilityGameId)).toBe("UNKNOWN_LANE");
  });

  it("never resolves an absent record to either real lane", () => {
    const lane = executionLaneForAbility(1329);
    expect(lane).not.toBe("NON_GCD");
    expect(lane).not.toBe("GCD_CONSUMING");
  });
});

describe("identity is the number, never the name", () => {
  it("carries two DISTINCT spells sharing the name Thistle Tea", () => {
    // The dataset itself contains the collision, so "look it up by name" is not
    // merely discouraged here — it is not a well-defined operation.
    const loaded = pinnedRogueGcdSemantics();
    if (!loaded.ok) return;
    const named = loaded.artifact.abilities.filter((entry) => entry.displayNameEn === "Thistle Tea");
    expect(named.map((entry) => entry.abilityGameId).sort((left, right) => left - right)).toEqual([
      THISTLE_TEA,
      THISTLE_TEA_ALTERNATE,
    ]);
  });

  it("exposes no name-keyed lookup at all", () => {
    // A name-keyed accessor could not be given a correct answer for the two
    // records above, so the module offers none.
    const api = { baseGcdMsForAbility, executionLaneForAbility, executionLaneForToken, resolveTokenBinding };
    for (const name of Object.keys(api)) {
      expect(name).not.toMatch(/ByName|ForName|displayName/i);
    }
  });

  it("does not let a name collision change a lane", () => {
    // Both records are NON_GCD today. If one ever moved, the token rule below
    // would collapse to UNKNOWN_LANE rather than silently picking one.
    expect(executionLaneForAbility(THISTLE_TEA)).toBe(executionLaneForAbility(THISTLE_TEA_ALTERNATE));
  });
});

describe("a token binds to a SET of spell ids", () => {
  it.each([
    ["kick", KICK],
    ["stealth", STEALTH],
    ["vanish", VANISH],
    ["ambush", AMBUSH],
    ["envenom", ENVENOM],
  ] as const)("resolves %s to exactly one id", (simcToken, abilityGameId) => {
    const binding = resolveTokenBinding(simcToken);
    expect(binding.kind).toBe("KNOWN_ONE");
    if (binding.kind !== "KNOWN_ONE") return;
    expect(binding.abilityGameId).toBe(abilityGameId);
    expect(binding.provenance.method).toBe("HAND_REVIEWED_CPP_CONTROL_FLOW");
    expect(binding.provenance.sourceNote.length).toBeGreaterThan(0);
  });

  it("resolves ambush to 8676, the class ability", () => {
    // Four spells in this build are named "Ambush"; only one is the class
    // ability, and `class_spells.inc` is what settles which.
    const binding = resolveTokenBinding("ambush");
    if (binding.kind !== "KNOWN_ONE") throw new Error("ambush must bind to one id");
    expect(binding.abilityGameId).toBe(8676);
  });

  it("resolves thistle_tea to BOTH reachable records", () => {
    const binding = resolveTokenBinding("thistle_tea");
    expect(binding.kind).toBe("KNOWN_SET");
    if (binding.kind !== "KNOWN_SET") return;
    expect([...binding.abilityGameIds].sort((left, right) => left - right)).toEqual([
      THISTLE_TEA,
      THISTLE_TEA_ALTERNATE,
    ]);
    expect(binding.provenance.sourceNote).toContain("thistle_tea_auto");
  });

  it("records WHY thistle_tea has two candidates", () => {
    const binding = resolveTokenBinding("thistle_tea");
    if (binding.kind !== "KNOWN_SET") return;
    expect(binding.provenance.sourceNote).toContain("talent");
  });

  it("labels EVERY binding as hand-reviewed C++, never as machine-extracted", () => {
    // The two halves of this dataset have different provenance. A binding that
    // could claim to be machine-extracted would assert that this project parses
    // C++, which it does not and must not appear to.
    for (const simcToken of ["kick", "stealth", "vanish", "ambush", "envenom", "thistle_tea"]) {
      const binding = resolveTokenBinding(simcToken);
      if (binding.kind === "UNKNOWN") throw new Error(`${simcToken} must be bound`);
      expect(binding.provenance.method, simcToken).toBe("HAND_REVIEWED_CPP_CONTROL_FLOW");
      expect(binding.provenance.method, simcToken).not.toBe("MACHINE_EXTRACTED_DBC_RECORD");
    }
  });

  it("cites pinned sc_rogue.cpp bytes and a line range for thistle_tea", () => {
    const binding = resolveTokenBinding("thistle_tea");
    if (binding.kind !== "KNOWN_SET") return;
    const { provenance } = binding;
    expect(provenance.sourcePath).toBe("engine/class_modules/sc_rogue.cpp");
    expect(provenance.sourceSha256).toBe("209e95265aae4168cf7cda57d1b241dda6361971ba6849a9262bd933bff3e13e");
    expect(provenance.symbol).toBe("rogue_t::init_spells");
    expect(provenance.startLine).toBe(10_237);
    expect(provenance.endLine).toBe(10_238);
  });

  it.each(["potion", "use_item", "use_items", "invoke_external_buff"])(
    "gives the non-spell pseudo-action '%s' no id and no lane",
    (simcToken) => {
      // These are ordinary selectable APL entries — `PLAYER_ACTION` structurally
      // — and none of them is a spell. Being structurally ordinary confers
      // nothing here: no binding, no id, no lane.
      expect(resolveTokenBinding(simcToken).kind).toBe("UNKNOWN");
      expect(executionLaneForToken(simcToken)).toBe("UNKNOWN_LANE");
    },
  );

  it.each(["mutilate", "garrote", "rupture", "variable", "call_action_list", ""])(
    "reports an unbound token '%s' as UNKNOWN",
    (simcToken) => {
      expect(resolveTokenBinding(simcToken).kind).toBe("UNKNOWN");
      expect(executionLaneForToken(simcToken)).toBe("UNKNOWN_LANE");
    },
  );
});

describe("a token's lane holds only when every candidate agrees", () => {
  it.each([
    ["kick", "NON_GCD"],
    ["stealth", "NON_GCD"],
    ["vanish", "NON_GCD"],
    ["thistle_tea", "NON_GCD"],
    ["ambush", "GCD_CONSUMING"],
    ["envenom", "GCD_CONSUMING"],
  ] as const)("proves %s is %s", (simcToken, lane) => {
    expect(executionLaneForToken(simcToken)).toBe(lane);
  });

  it("proves thistle_tea WITHOUT choosing a talent branch", () => {
    // Both records are zero, so the lane holds under either resolution. That is
    // what makes the answer available at all — not a decision about the talent.
    expect(executionLaneForAbility(THISTLE_TEA)).toBe("NON_GCD");
    expect(executionLaneForAbility(THISTLE_TEA_ALTERNATE)).toBe("NON_GCD");
    expect(executionLaneForToken("thistle_tea")).toBe("NON_GCD");
  });

  it("COLLAPSES to UNKNOWN_LANE when candidates disagree", () => {
    // Synthetic: Envenom is GCD_CONSUMING, Kick is NON_GCD. A token reaching
    // both would have a lane that genuinely depends on unresolved state.
    expect(invariantLaneAcross([ENVENOM, KICK])).toBe("UNKNOWN_LANE");
    expect(invariantLaneAcross([KICK, ENVENOM])).toBe("UNKNOWN_LANE");
  });

  it("COLLAPSES to UNKNOWN_LANE when any candidate is unknown", () => {
    expect(invariantLaneAcross([THISTLE_TEA, 1329])).toBe("UNKNOWN_LANE");
    expect(invariantLaneAcross([1329])).toBe("UNKNOWN_LANE");
  });

  it("refuses an empty candidate set rather than vacuously agreeing", () => {
    // "All zero candidates agree" is true and useless. It must not become a lane.
    expect(invariantLaneAcross([])).toBe("UNKNOWN_LANE");
  });

  it("agrees across a set that genuinely agrees", () => {
    expect(invariantLaneAcross([THISTLE_TEA, THISTLE_TEA_ALTERNATE])).toBe("NON_GCD");
    expect(invariantLaneAcross([AMBUSH, ENVENOM, DEATHMARK, KINGSBANE])).toBe("GCD_CONSUMING");
  });
});

describe("the artifact validator fails closed", () => {
  function mutate(change: (draft: Record<string, unknown>) => void): unknown {
    const draft = JSON.parse(JSON.stringify(artifact)) as Record<string, unknown>;
    change(draft);
    return draft;
  }

  it("accepts the committed artifact", () => {
    expect(validateGcdSemanticsArtifact(artifact).ok).toBe(true);
  });

  it.each([
    ["a non-object", () => 42 as unknown],
    ["a wrong schema version", () => mutate((draft) => void (draft["artifactVersion"] = 2))],
    ["no abilities", () => mutate((draft) => void (draft["abilities"] = []))],
    ["no token bindings", () => mutate((draft) => void (draft["tokenBindings"] = []))],
    [
      "a commit sha that is not a sha",
      () =>
        mutate((draft) => {
          (draft["provenance"] as Record<string, unknown>)["commitSha"] = "midnight";
        }),
    ],
    [
      "a GCD field in seconds",
      () =>
        mutate((draft) => {
          (draft["provenance"] as Record<string, unknown>)["gcdFieldUnits"] = "SECONDS";
        }),
    ],
    [
      "a negative base GCD",
      () =>
        mutate((draft) => {
          (draft["abilities"] as Record<string, unknown>[])[0]!["baseGcdMs"] = -1;
        }),
    ],
    [
      "a duplicated ability id",
      () =>
        mutate((draft) => {
          const abilities = draft["abilities"] as Record<string, unknown>[];
          abilities.push({ ...abilities[0]! });
        }),
    ],
    [
      "a token with no candidates",
      () =>
        mutate((draft) => {
          (draft["tokenBindings"] as Record<string, unknown>[])[0]!["candidateAbilityGameIds"] = [];
        }),
    ],
    [
      "a token naming an ability with no GCD record",
      () =>
        mutate((draft) => {
          (draft["tokenBindings"] as Record<string, unknown>[])[0]!["candidateAbilityGameIds"] = [12345];
        }),
    ],
    [
      "a STORED execution lane",
      () =>
        mutate((draft) => {
          (draft["abilities"] as Record<string, unknown>[])[0]!["executionLane"] = "NON_GCD";
        }),
    ],
  ])("rejects %s", (_label, make) => {
    expect(validateGcdSemanticsArtifact(make()).ok).toBe(false);
  });

  it("names the derived field it refuses to read", () => {
    const result = validateGcdSemanticsArtifact(
      mutate((draft) => {
        (draft["abilities"] as Record<string, unknown>[])[0]!["executionLane"] = "NON_GCD";
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toContain("executionLane");
    expect(result.detail).toContain("derived from baseGcdMs");
  });
});

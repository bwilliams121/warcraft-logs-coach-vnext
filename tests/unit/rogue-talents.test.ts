import { describe, expect, it } from "vitest";

import {
  TALENT_SELECTIONS,
  pinnedRogueTalents,
  resolveTalentSelection,
  talentIdentityFor,
  type ObservedTalentEntry,
} from "../../src/data/game/rogue-talents.js";
import {
  FORBIDDEN_DERIVED_TALENT_KEYS,
  validateTalentArtifact,
} from "../../src/data/game/talent-artifact.js";
import artifact from "../../src/data/game/rogue-talents.json";

/**
 * Talent selection, and the two mistakes it exists to prevent.
 *
 *   1. NODE PRESENCE IS NOT SELECTION. A choice node offers several entries. The
 *      real build this milestone rests on has the Improved Ambush NODE with the
 *      Tight Spender ENTRY, so matching on nodeId would invert the answer.
 *
 *   2. ABSENCE IS NOT `NOT_SELECTED`. A node missing from the observed tree is
 *      UNKNOWN, because nothing here contracts that `combatantinfo.talentTree`
 *      enumerates unselected nodes.
 */

/** Actor 19's real entries at the four modelled nodes, from the committed fixture build. */
const ACTOR_19_ENTRIES: readonly ObservedTalentEntry[] = [
  { id: 112_510, nodeId: 90_625 }, // Improved Garrote — its own entry
  { id: 112_669, nodeId: 90_776 }, // Shrouded Suffocation — its own entry
  { id: 117_152, nodeId: 90_692 }, // Tight Spender — the Improved Ambush choice node
];

describe("the pinned talent dataset", () => {
  it("loads and carries only the narrow slice M5-C2 needs", () => {
    const loaded = pinnedRogueTalents();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.artifact.talents.map((t) => t.simcName).sort()).toEqual([
      "blindside",
      "improved_ambush",
      "improved_garrote",
      "shrouded_suffocation",
    ]);
  });

  it("permits exactly three selections", () => {
    expect([...TALENT_SELECTIONS]).toEqual(["SELECTED", "NOT_SELECTED", "UNKNOWN"]);
  });

  it("records the Improved Ambush CHOICE node with its alternative", () => {
    const identity = talentIdentityFor("improved_ambush");
    expect(identity).not.toBeNull();
    expect(identity?.tree).toBe("CLASS");
    expect(identity?.traitNodeId).toBe(90_692);
    expect(identity?.traitEntryId).toBe(112_580);
    expect(identity?.nodeType).toBe("CHOICE");
    expect(identity?.alternativeEntries.map((a) => a.traitEntryId)).toEqual([117_152]);
    expect(identity?.alternativeEntries[0]?.displayNameEn).toBe("Tight Spender");
  });

  it("records Shrouded Suffocation as a NORMAL node with no alternatives", () => {
    const identity = talentIdentityFor("shrouded_suffocation");
    expect(identity?.tree).toBe("SPECIALIZATION");
    expect(identity?.traitNodeId).toBe(90_776);
    expect(identity?.traitEntryId).toBe(112_669);
    expect(identity?.nodeType).toBe("NORMAL");
    expect(identity?.alternativeEntries).toEqual([]);
  });

  it("keeps the Blindside TALENT distinct from the Blindside PROC BUFF", () => {
    // Different facts, different ids. The talent is a static build selection;
    // the proc is dynamic combat state this milestone does not model at all.
    const identity = talentIdentityFor("blindside");
    expect(identity?.traitEntryId).toBe(112_507);
    expect(identity?.talentSpellId).toBe(328_085);
    expect(identity?.talentSpellId).not.toBe(121_153);
    // And nothing in the dataset mentions the proc id.
    expect(JSON.stringify(artifact)).not.toContain("121153");
  });
});

describe("selection is decided by ENTRY, never by node presence", () => {
  it("resolves a talent whose own entry is selected", () => {
    const resolution = resolveTalentSelection(ACTOR_19_ENTRIES, "shrouded_suffocation");
    expect(resolution.selection).toBe("SELECTED");
    expect(resolution.reason).toBe("OWN_ENTRY_SELECTED");
    expect(resolution.decidedByEntryId).toBe(112_669);
  });

  it("resolves NOT_SELECTED from a known alternative at the same node", () => {
    // THE case. Node 90692 is present; the entry is Tight Spender, not Improved
    // Ambush. A node-presence rule would have said SELECTED here.
    const resolution = resolveTalentSelection(ACTOR_19_ENTRIES, "improved_ambush");
    expect(resolution.selection).toBe("NOT_SELECTED");
    expect(resolution.reason).toBe("ALTERNATIVE_ENTRY_SELECTED");
    expect(resolution.decidedByEntryId).toBe(117_152);
  });

  it("does NOT resolve SELECTED from node presence alone", () => {
    const identity = talentIdentityFor("improved_ambush");
    const nodePresent: ObservedTalentEntry[] = [{ id: 999_999, nodeId: identity?.traitNodeId ?? 0 }];
    const resolution = resolveTalentSelection(nodePresent, "improved_ambush");
    expect(resolution.selection).not.toBe("SELECTED");
    expect(resolution.selection).toBe("UNKNOWN");
    expect(resolution.reason).toBe("NODE_PRESENT_WITH_UNKNOWN_ENTRY");
  });

  it("resolves UNKNOWN — never NOT_SELECTED — when the node is absent", () => {
    // Actor 19's tree genuinely lacks the Blindside node. M5-C2 does NOT read
    // that as "not taken", because nothing contracts that the tree enumerates
    // unselected nodes. The Ambush verdict must not depend on this.
    const resolution = resolveTalentSelection(ACTOR_19_ENTRIES, "blindside");
    expect(resolution.selection).toBe("UNKNOWN");
    expect(resolution.reason).toBe("NODE_ABSENT");
    expect(resolution.selection).not.toBe("NOT_SELECTED");
  });

  it("resolves UNKNOWN for a talent this dataset does not model", () => {
    const resolution = resolveTalentSelection(ACTOR_19_ENTRIES, "scent_of_blood");
    expect(resolution.selection).toBe("UNKNOWN");
    expect(resolution.reason).toBe("TALENT_NOT_MODELLED");
    expect(resolution.identity).toBeNull();
  });

  it("resolves UNKNOWN for an empty tree rather than failing", () => {
    for (const name of ["improved_ambush", "shrouded_suffocation", "blindside"]) {
      expect(resolveTalentSelection([], name).selection).toBe("UNKNOWN");
    }
  });

  it("ignores rank entirely", () => {
    // Rank says how far a SELECTED talent was pushed. It cannot make a different
    // entry at the same node into this one.
    const withRank = [{ id: 112_669, nodeId: 90_776 }];
    expect(resolveTalentSelection(withRank, "shrouded_suffocation").selection).toBe("SELECTED");
  });

  it("matches on the entry id even when nodeId is absent", () => {
    // WCL supplies `nodeId` today, but the entry id is the identity. A null node
    // must not prevent a positive match.
    const noNode: ObservedTalentEntry[] = [{ id: 112_669, nodeId: null }];
    expect(resolveTalentSelection(noNode, "shrouded_suffocation").selection).toBe("SELECTED");
  });
});

describe("the talent artifact validator fails closed", () => {
  function mutate(change: (draft: Record<string, unknown>) => void): unknown {
    const draft = JSON.parse(JSON.stringify(artifact)) as Record<string, unknown>;
    change(draft);
    return draft;
  }

  function talentNamed(draft: Record<string, unknown>, simcName: string): Record<string, unknown> {
    const talents = draft["talents"] as Record<string, unknown>[];
    const found = talents.find((t) => t["simcName"] === simcName);
    if (found === undefined) throw new Error(`no talent ${simcName}`);
    return found;
  }

  it("accepts the committed artifact", () => {
    expect(validateTalentArtifact(artifact).ok).toBe(true);
  });

  it("REJECTS a choice node that lost its alternatives", () => {
    // The exact degradation that would turn this into a node-presence rule.
    const result = validateTalentArtifact(
      mutate((draft) => {
        talentNamed(draft, "improved_ambush")["alternativeEntries"] = [];
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("CHOICE_NODE_WITHOUT_ALTERNATIVES");
  });

  it("REJECTS a normal node that gained alternatives", () => {
    const result = validateTalentArtifact(
      mutate((draft) => {
        talentNamed(draft, "shrouded_suffocation")["alternativeEntries"] = [
          { traitEntryId: 1, displayNameEn: "x", talentSpellId: 2 },
        ];
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("NORMAL_NODE_WITH_ALTERNATIVES");
  });

  it("REJECTS a talent listed as its own alternative", () => {
    const result = validateTalentArtifact(
      mutate((draft) => {
        const talent = talentNamed(draft, "improved_ambush");
        talent["alternativeEntries"] = [
          { traitEntryId: talent["traitEntryId"], displayNameEn: "self", talentSpellId: 1 },
        ];
      }),
    );
    expect(result.ok).toBe(false);
  });

  it.each([...FORBIDDEN_DERIVED_TALENT_KEYS])("REJECTS an artifact storing '%s'", (forbidden) => {
    // Selection is decided per-fight from observed evidence. Baking it into the
    // dataset would make one player's build everyone's.
    const result = validateTalentArtifact(
      mutate((draft) => {
        talentNamed(draft, "blindside")[forbidden] = true;
      }),
    );
    expect(result.ok).toBe(false);
  });

  it.each([
    ["a wrong schema version", (d: Record<string, unknown>) => void (d["artifactVersion"] = 2)],
    ["no talents", (d: Record<string, unknown>) => void (d["talents"] = [])],
    [
      "a commit sha that is not a sha",
      (d: Record<string, unknown>) => {
        (d["provenance"] as Record<string, unknown>)["commitSha"] = "midnight";
      },
    ],
    [
      "an unknown tree",
      (d: Record<string, unknown>) => {
        (d["talents"] as Record<string, unknown>[])[0]!["tree"] = "PVP";
      },
    ],
    [
      "a duplicated simcName",
      (d: Record<string, unknown>) => {
        const talents = d["talents"] as Record<string, unknown>[];
        talents.push({ ...talents[0]! });
      },
    ],
  ])("rejects %s", (_label, change) => {
    expect(validateTalentArtifact(mutate(change)).ok).toBe(false);
  });
});

describe("provenance", () => {
  it("pins the SimulationCraft commit and the client build", () => {
    const loaded = pinnedRogueTalents();
    if (!loaded.ok) return;
    const { provenance } = loaded.artifact;
    expect(provenance.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(provenance.clientDataWowVersion).toBe("12.1.0.69587");
    expect(provenance.talentDataMethod).toBe("MACHINE_EXTRACTED_TRAIT_RECORD");
    for (const source of provenance.sources) {
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("scopes the Warcraft Logs id-space claim to the capture it was observed in", () => {
    // The equivalence `id == id_trait_node_entry` / `nodeId == id_node` was
    // corroborated against one report. The note must say so rather than claiming
    // it holds for Warcraft Logs generally.
    const loaded = pinnedRogueTalents();
    if (!loaded.ok) return;
    const note = loaded.artifact.provenance.wclIdSpaceNote;
    expect(note).toContain("A7R6kxPJ1hC8YQ4w");
    expect(note).toContain("id_trait_node_entry");
    expect(note).toContain("id_node");
    expect(note).toContain("not claimed for Warcraft Logs in general");
  });

  it("states why it carries no fight-derived applicability gate", () => {
    const loaded = pinnedRogueTalents();
    if (!loaded.ok) return;
    expect(loaded.artifact.provenance.applicabilityNote).toContain("CombatFight");
  });
});

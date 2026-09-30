import { describe, expect, it } from "vitest";

import {
  deriveActionToken,
  deriveCallsListName,
  deriveConditionRaw,
  loadAplAuthority,
} from "../../src/simc/apl-authority.js";
import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import { syntheticArtifact } from "../support/m5a-authority.js";

/**
 * The authority loader, its derivations, and the list call graph.
 *
 * Reachability is proved over EDGES, not over "the action only appears in one
 * list". A second caller of `spend` would make a false gate prove nothing at
 * all, because the action could still be reached the other way.
 */

const loaded = pinnedAssassinationAuthority();

describe("the pinned artifact loads", () => {
  it("validates", () => {
    expect(loaded.ok).toBe(true);
  });

  it("carries a real pinned commit and source hash", () => {
    if (!loaded.ok) return;
    const { provenance } = loaded.authority.artifact;
    expect(provenance.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(provenance.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(provenance.sourcePath).toBe("engine/class_modules/apl/apl_rogue.cpp");
    expect(provenance.branch).toBe("midnight");
  });

  it("holds every Assassination list, so membership is provable by enumeration", () => {
    if (!loaded.ok) return;
    const names = loaded.authority.artifact.lists.map((list) => list.listName);
    expect(names).toEqual([
      "default",
      "precombat",
      "cds",
      "core_dot",
      "generate",
      "items",
      "misc_cds",
      "spend",
      "vanish",
    ]);
  });
});

describe("derivations are computed from the verbatim string", () => {
  it.each([
    ["stealth", "stealth", null, null],
    ["kick", "kick", null, null],
    ["call_action_list,name=core_dot", "call_action_list", null, "core_dot"],
    ["call_action_list,name=spend,if=combo_points>=5", "call_action_list", "combo_points>=5", "spend"],
    [
      "envenom,if=buff.envenom.remains<=1|buff.deathmark.up",
      "envenom",
      "buff.envenom.remains<=1|buff.deathmark.up",
      null,
    ],
    [
      "garrote,cycle_targets=1,if=!talent.crimson_tempest&combo_points.deficit>=1",
      "garrote",
      "!talent.crimson_tempest&combo_points.deficit>=1",
      null,
    ],
  ])("derives %s", (actionString, token, condition, callsList) => {
    expect(deriveActionToken(actionString)).toBe(token);
    expect(deriveConditionRaw(actionString)).toBe(condition);
    expect(deriveCallsListName(actionString)).toBe(callsList);
  });

  it("does not mistake target_if= for the condition", () => {
    const action = "crimson_tempest,target_if=max:dot.rupture.remains,if=!variable.single_target";
    expect(deriveConditionRaw(action)).toBe("!variable.single_target");
  });

  it("refuses an ambiguous condition rather than picking one", () => {
    // Two `,if=` segments cannot be resolved to a single condition, and an
    // arbitrary pick would silently become a definite authority claim.
    //
    // Until M11-D1C this pinned `null` — which every consumer of `conditionRaw`
    // reads as UNCONDITIONAL, so a malformed `call_action_list` became a
    // CERTAIN list entry. The ambiguous text is now kept: neither condition is
    // picked, and no parser accepts it, so it is refused wherever it is read.
    const derived = deriveConditionRaw("x,if=a,if=b");
    expect(derived).not.toBeNull();
    expect(derived).not.toBe("a");
    expect(derived).not.toBe("b");
    expect(parseSimcExpression(derived ?? "a").ok).toBe(false);
  });
});

describe("the call graph proves a sole gate to envenom", () => {
  it("finds envenom in exactly one list", () => {
    if (!loaded.ok) return;
    expect(loaded.authority.listsContainingAction("envenom")).toEqual(["spend"]);
  });

  it("proves the spend call in default is the only path", () => {
    if (!loaded.ok) return;
    const proof = loaded.authority.proveSoleGateTo("envenom");
    expect(proof.kind).toBe("PROVEN_SOLE_GATE");
    if (proof.kind !== "PROVEN_SOLE_GATE") return;
    expect(proof.gate.fromListName).toBe("default");
    expect(proof.gate.targetListName).toBe("spend");
    expect(proof.gate.conditionRaw).toBe(
      "!buff.darkest_night.up&combo_points>=5|buff.darkest_night.up&combo_points.deficit=0",
    );
  });

  it("places the gate after the cooldown and dot lists, as the source does", () => {
    if (!loaded.ok) return;
    const defaultList = loaded.authority.artifact.lists.find((list) => list.listName === "default");
    const calls = (defaultList?.actions ?? [])
      .map((action) => deriveCallsListName(action.actionStringVerbatim))
      .filter((name): name is string => name !== null);
    expect(calls).toEqual(["cds", "core_dot", "generate", "spend"]);
  });

  it("keeps crimson_tempest in the generate list, not the spend list", () => {
    if (!loaded.ok) return;
    // A cast that consumes combo points is not the same thing as membership of
    // the spend list. Crimson Tempest is the standing counterexample, and it is
    // why mechanical resource consumption cannot stand in for ability identity.
    expect(loaded.authority.listsContainingAction("crimson_tempest")).toEqual(["generate"]);
  });
});

describe("reachability fails closed", () => {
  it.each([
    [
      "a second incoming edge",
      {
        lists: [
          {
            listName: "default",
            actions: ["call_action_list,name=cds", "call_action_list,name=spend,if=combo_points>=5"],
          },
          { listName: "cds", actions: ["call_action_list,name=spend"] },
          { listName: "spend", actions: ["envenom"] },
        ],
      },
      "MULTIPLE_INCOMING_EDGES",
    ],
    [
      "an unconditional gate",
      {
        lists: [
          { listName: "default", actions: ["call_action_list,name=spend"] },
          { listName: "spend", actions: ["envenom"] },
        ],
      },
      "GATE_EDGE_HAS_NO_CONDITION",
    ],
    [
      "run_action_list anywhere",
      {
        lists: [
          {
            listName: "default",
            actions: ["run_action_list,name=cds", "call_action_list,name=spend,if=combo_points>=5"],
          },
          { listName: "cds", actions: ["kick"] },
          { listName: "spend", actions: ["envenom"] },
        ],
      },
      "UNMODELLED_DISPATCH",
    ],
    [
      "a dangling list reference",
      {
        lists: [
          {
            listName: "default",
            actions: ["call_action_list,name=ghost", "call_action_list,name=spend,if=combo_points>=5"],
          },
          { listName: "spend", actions: ["envenom"] },
        ],
      },
      "UNKNOWN_LIST_REFERENCE",
    ],
    [
      "the action in the entry list",
      { lists: [{ listName: "default", actions: ["envenom"] }] },
      "ACTION_IN_ENTRY_LIST",
    ],
    [
      "the action in two lists",
      {
        lists: [
          { listName: "default", actions: ["call_action_list,name=spend,if=combo_points>=5"] },
          { listName: "spend", actions: ["envenom"] },
          { listName: "cds", actions: ["envenom"] },
        ],
      },
      "ACTION_IN_MULTIPLE_LISTS",
    ],
    [
      "the action absent entirely",
      {
        lists: [
          { listName: "default", actions: ["call_action_list,name=spend,if=combo_points>=5"] },
          { listName: "spend", actions: ["rupture"] },
        ],
      },
      "ACTION_ABSENT_FROM_AUTHORITY",
    ],
  ])("declines on %s", (_label, spec, reason) => {
    const result = loadAplAuthority(syntheticArtifact(spec));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const proof = result.authority.proveSoleGateTo("envenom");
    expect(proof.kind).toBe("NOT_PROVABLE");
    if (proof.kind !== "NOT_PROVABLE") return;
    expect(proof.reason).toBe(reason);
  });
});

describe("artifact validation fails closed", () => {
  it.each([
    ["not an object", 42, "NOT_AN_OBJECT"],
    [
      "a future artifact version",
      { ...syntheticArtifact({ lists: [] }), artifactVersion: 2 },
      "UNSUPPORTED_ARTIFACT_VERSION",
    ],
  ])("rejects %s", (_label, artifact, reason) => {
    const result = loadAplAuthority(artifact);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(reason);
  });

  it("rejects a placeholder commit sha", () => {
    const artifact = syntheticArtifact({ lists: [{ listName: "default", actions: ["kick"] }] });
    const provenance = artifact["provenance"] as Record<string, unknown>;
    provenance["commitSha"] = "midnight";
    const result = loadAplAuthority(artifact);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // A branch name here would mean the authority is not actually pinned.
    expect(result.reason).toBe("MALFORMED_PROVENANCE");
  });

  it("rejects an artifact that stores derived fields", () => {
    const artifact = syntheticArtifact({ lists: [{ listName: "default", actions: ["kick"] }] });
    const lists = artifact["lists"] as { actions: Record<string, unknown>[] }[];
    const action = lists[0]?.actions[0];
    if (action !== undefined) action["actionToken"] = "kick";
    const result = loadAplAuthority(artifact);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // One source of truth: derived fields are computed, never stored, so they
    // cannot drift away from the verbatim string.
    expect(result.reason).toBe("MALFORMED_ACTION");
    expect(result.detail).toContain("actionToken");
  });
});

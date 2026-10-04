import { describe, expect, it } from "vitest";

import {
  deriveActionOptionKeys,
  deriveConditionRaw,
  isMalformedAuthorityLine,
  parseAplLine,
  type AplAction,
} from "../../src/simc/apl-authority.js";
import { evaluateCondition, selectWithinList } from "../../src/simc/list-selection.js";
import { selectAcrossLists, type TraversalResult } from "../../src/simc/nested-selection.js";
import { knownNumber, unknownNumber, type AtomBindings } from "../../src/simc/expression/evaluate.js";
import { isBuiltinIdentifier, parseSimcExpression } from "../../src/simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
} from "../../src/simc/expression/spec-vocabulary.js";
import { syntheticAuthority, type SyntheticListSpec } from "../support/m5a-authority.js";

/**
 * M11-D1-C — an APL line's condition ends at the next top-level option, and a
 * `cycling_variable` is never a selectable action.
 *
 * Every pinned line below is verbatim from the SimulationCraft APL sources at
 * 33622e9d1662ff0e451691edf85a6b49cc9d11d9 (engine/class_modules/apl/), file
 * sha256 as recorded in agent/m11-a3-authority-audit.md §3:
 *
 *     apl_warrior.cpp       bc9473e51e3d4d233793d6d165eb0165183f61eebde5c119ddd8aaa7b1202ec1
 *     apl_monk.cpp          a8b7e2afe48425089cdc97a369fc4abe87784a818d0423ba0706fb60f1f53c20
 *     warlock.cpp           09f2bb54304a3886a87aae18931bf2214f56882a88c074c7e77f730ed3e51bda
 *     apl_demon_hunter.cpp  c95ab0af6cfce46c64304903a7e8c65417beb01ff69f661beb727b9e23b4b389
 *
 * None of these specializations is onboarded. The vocabulary below is
 * TEST-ONLY and exists purely so the pinned condition parses whole.
 */

/** apl_warrior.cpp:361, Protection Warrior `default[15]`. */
const PROT_WARRIOR_IGNORE_PAIN =
  "ignore_pain,if=target.health.pct>=20&(rage.deficit<=15&cooldown.shield_slam.ready|rage.deficit<=20&cooldown.shield_charge.ready|rage.deficit<=20&cooldown.demoralizing_shout.ready&talent.booming_voice.enabled|rage.deficit<=15|rage.deficit<=40&cooldown.shield_slam.ready&buff.violent_outburst.up&talent.heavy_repercussions.enabled&talent.practiced_strikes.enabled|rage.deficit<=17&cooldown.shield_slam.ready&talent.heavy_repercussions.enabled|rage.deficit<=18&cooldown.shield_slam.ready&talent.practiced_strikes.enabled)|(rage>=70|buff.seeing_red.stack=7&rage>=35)&cooldown.shield_slam.remains<=1&buff.shield_block.remains,use_off_gcd=1";
const PROT_WARRIOR_IGNORE_PAIN_CONDITION = PROT_WARRIOR_IGNORE_PAIN.slice(
  "ignore_pain,if=".length,
  -",use_off_gcd=1".length,
);

/** apl_monk.cpp:263, Windwalker: `target_if` before the condition, `cancel_if` after it. */
const WINDWALKER_CELESTIAL_CONDUIT =
  "celestial_conduit,target_if=max:target.time_to_die,if=!buff.heart_of_the_jade_serpent.remains&!buff.heart_of_the_jade_serpent_yulons_avatar.remains&(!buff.whirling_dragon_punch.up|cooldown.whirling_dragon_punch.remains|cooldown.strike_of_the_windlord.remains&talent.strike_of_the_windlord)|fight_remains<4|active_enemies>1+1*talent.drinking_horn_cover&(fight_style.dungeonslice|buff.bloodlust.up),cancel_if=(!cooldown.rising_sun_kick.remains|!cooldown.fists_of_fury.remains|!buff.heart_of_the_jade_serpent.up)&(!talent.zenith_stomp|!buff.bloodlust.up|buff.zenith_stomp.stack=0|chi>4)";

/** warlock.cpp:193, Affliction `variables[2]`. */
const AFFLICTION_MIN_AGONY =
  "cycling_variable,name=min_agony,op=min,value=dot.agony.remains+(99*!dot.agony.remains)";
/** apl_demon_hunter.cpp:358, Vengeance `default[4]` — unconditional. */
const VENGEANCE_DUNG_PULL_RESET = "cycling_variable,name=dung_pull_ttd,op=reset";

const PROT_WARRIOR_TEST_DECLARATIONS: readonly SpecAtomDeclaration[] = [
  { identifier: "target.health.pct", shape: "NUMERIC", scope: "TARGET_SCOPED", selfAddressing: false },
  { identifier: "rage", shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
  { identifier: "rage.deficit", shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
  ...[
    "cooldown.shield_slam.ready",
    "cooldown.shield_charge.ready",
    "cooldown.demoralizing_shout.ready",
    "talent.booming_voice.enabled",
    "talent.heavy_repercussions.enabled",
    "talent.practiced_strikes.enabled",
  ].map((identifier): SpecAtomDeclaration => ({
    identifier,
    shape: "BOOLEAN",
    scope: "PLAYER_SCOPED",
    selfAddressing: false,
  })),
];

const PROT_WARRIOR_TEST_VOCABULARY = defineSpecAtomVocabulary(
  "test/m11d1-line-structure",
  PROT_WARRIOR_TEST_DECLARATIONS,
  isBuiltinIdentifier,
);

const BINDINGS: AtomBindings = {
  comboPoints: unknownNumber("STATE_NOT_MODELLED"),
  comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
  energyPct: unknownNumber("STATE_NOT_MODELLED"),
  dotRemainsSecondsByAction: [],
  knownBuffs: [],
};

/**
 * Every TRUTH atom of the Ignore Pain condition bound, so its evaluation stays
 * under the evaluator's four-atom enumeration cap; every MAGNITUDE left unbound
 * except the one given. Arbitrary values: the question is only whether the
 * condition text is EVALUATED, and what an unresolved magnitude does to it.
 */
function ignorePainBindings(rage: number | null): AtomBindings {
  const truths = [
    "cooldown.shield_slam.ready",
    "cooldown.shield_charge.ready",
    "cooldown.demoralizing_shout.ready",
    "talent.booming_voice.enabled",
    "talent.heavy_repercussions.enabled",
    "talent.practiced_strikes.enabled",
  ].map((key) => ({ key, actionToken: null, value: { kind: "TRUTH" as const, value: true } }));
  return {
    ...BINDINGS,
    knownBuffs: [{ name: "violent_outburst", up: false }],
    specAtoms: {
      vocabulary: PROT_WARRIOR_TEST_VOCABULARY,
      bound:
        rage === null
          ? truths
          : [
              ...truths,
              { key: "rage", actionToken: null, value: { kind: "MAGNITUDE", binding: knownNumber(rage) } },
            ],
    },
  };
}

function actionIn(line: string): AplAction {
  const authority = syntheticAuthority({ lists: [{ listName: "default", actions: [line] }] });
  const [action] = authority.actions;
  if (action === undefined) throw new Error("no action");
  return action;
}

function traverse(lists: readonly SyntheticListSpec[], bindings: AtomBindings = BINDINGS): TraversalResult {
  return selectAcrossLists({
    authority: syntheticAuthority({ lists: lists as SyntheticListSpec[] }),
    entryListName: "default",
    bindings,
    // The worst case for the negative tests: EVERY entry is taken as proven
    // usable, so nothing but classification and conditions can stop a line.
    usabilityFor: () => ({ kind: "PROVEN_USABLE" as const }),
  });
}

describe("the pinned Protection Warrior Ignore Pain line", () => {
  it("splits into the token, the condition and the option after it", () => {
    const structure = parseAplLine(PROT_WARRIOR_IGNORE_PAIN);
    expect(structure.actionToken).toBe("ignore_pain");
    expect(structure.options.map((option) => option.key)).toEqual(["if", "use_off_gcd"]);
    expect(structure.options[1]).toEqual({ key: "use_off_gcd", value: "1" });
    expect(structure.malformedSegments).toEqual([]);
  });

  it("derives a condition that ends before ,use_off_gcd=1", () => {
    expect(deriveConditionRaw(PROT_WARRIOR_IGNORE_PAIN)).toBe(PROT_WARRIOR_IGNORE_PAIN_CONDITION);
    expect(deriveConditionRaw(PROT_WARRIOR_IGNORE_PAIN)).not.toContain("use_off_gcd");
  });

  it("parses whole under a vocabulary — the text that failed with the option glued on", () => {
    const parsed = parseSimcExpression(PROT_WARRIOR_IGNORE_PAIN_CONDITION, PROT_WARRIOR_TEST_VOCABULARY);
    expect(parsed.ok).toBe(true);
    // The pre-D1 condition text, for contrast: the same vocabulary refuses it.
    expect(
      parseSimcExpression(`${PROT_WARRIOR_IGNORE_PAIN_CONDITION},use_off_gcd=1`, PROT_WARRIOR_TEST_VOCABULARY)
        .ok,
    ).toBe(false);
  });

  it("is evaluated as a condition by the authority path, with use_off_gcd kept as a supported option", () => {
    const action = actionIn(PROT_WARRIOR_IGNORE_PAIN);
    expect(action.conditionRaw).toBe(PROT_WARRIOR_IGNORE_PAIN_CONDITION);
    expect(action.actionOptionKeys).toEqual(["if", "use_off_gcd"]);
    expect(action.unsupportedOptions).toEqual([]);
    expect(action.entryKind).toBe("PLAYER_ACTION");
    const condition = evaluateCondition(action, ignorePainBindings(null));
    expect(condition.kind).toBe("EVALUATED");
  });

  it("decides nothing it cannot: with target health and the magnitudes unbound it is UNKNOWN, not TRUE or FALSE", () => {
    const condition = evaluateCondition(actionIn(PROT_WARRIOR_IGNORE_PAIN), ignorePainBindings(80));
    expect(condition.kind === "EVALUATED" ? condition.truth : condition.kind).toBe("UNKNOWN_STATE");
  });
});

describe("options around the condition keep their meaning, and unsupported ones still refuse", () => {
  it("reads a trailing unrecognised option as an option, and refuses the line for it", () => {
    const action = actionIn(WINDWALKER_CELESTIAL_CONDUIT);
    expect(action.actionOptionKeys).toEqual(["target_if", "if", "cancel_if"]);
    expect(action.conditionRaw).not.toContain("cancel_if");
    expect(action.conditionRaw?.endsWith("(fight_style.dungeonslice|buff.bloodlust.up)")).toBe(true);
    expect(action.unsupportedOptions).toEqual([
      { optionKey: "target_if", support: "UNSUPPORTED_TARGETING" },
      { optionKey: "cancel_if", support: "UNRECOGNISED" },
    ]);
  });

  it("does not let a trailing unrecognised option be skipped: the scan blocks at it", () => {
    // RE-POINTED at M11-D3-C3, which made `line_cd=` a recognised readiness
    // option (without history its timer is UNKNOWN, never ready). `moving=` is
    // a pinned action option this project still does not model.
    const result = traverse([{ listName: "default", actions: ["kick,if=buff.x.up,moving=1", "slam"] }], {
      ...BINDINGS,
      knownBuffs: [{ name: "x", up: true }],
    });
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNSUPPORTED_ACTION_OPTION");
    expect(result.blockedAt?.actionToken).toBe("kick");
  });

  it("keeps commas inside parentheses and quotes with their value, never inventing an option", () => {
    const parenthesised = parseAplLine("slam,if=(a,b)");
    expect(parenthesised.options).toEqual([{ key: "if", value: "(a,b)" }]);
    expect(parenthesised.malformedSegments).toEqual([]);
    // The value is not an expression this project reads, so it fails closed.
    expect(parseSimcExpression("(a,b)").ok).toBe(false);
    const quoted = parseAplLine('use_item,name="a,b=c",if=buff.x.up');
    expect(quoted.options).toEqual([
      { key: "name", value: '"a,b=c"' },
      { key: "if", value: "buff.x.up" },
    ]);
  });

  it("never lets an unbalanced quote or parenthesis swallow the condition", () => {
    // An apostrophe left open would otherwise make `,if=…` part of `name`'s
    // value, and a swallowed condition reads as NONE — unconditional.
    const apostrophe = "use_item,name=x's_y,if=buff.x.up";
    expect(parseAplLine(apostrophe).balanced).toBe(false);
    // Exactly the pre-M11-D1 reading, never a shorter or missing condition.
    expect(deriveConditionRaw(apostrophe)).toBe("buff.x.up");
    expect(deriveConditionRaw("slam,if=(buff.x.up,use_off_gcd=1")).toBe("(buff.x.up,use_off_gcd=1");
    expect(parseAplLine("slam,if=buff.x.up),use_off_gcd=1").balanced).toBe(false);
    // And the line is refused, whatever its condition says.
    expect(actionIn(apostrophe).unsupportedOptions).toEqual([
      { optionKey: "(unbalanced quote or parenthesis)", support: "MALFORMED_STRUCTURE" },
    ]);
    const result = traverse([{ listName: "default", actions: [apostrophe, "kick"] }], {
      ...BINDINGS,
      knownBuffs: [{ name: "x", up: true }],
    });
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind === "UNKNOWN") expect(result.blockedAt?.actionToken).toBe("use_item");
  });

  it("refuses a segment that is not key=value instead of dropping it", () => {
    const action = actionIn("slam,if=buff.x.up,bogus");
    expect(action.conditionRaw).toBe("buff.x.up");
    expect(action.unsupportedOptions).toEqual([{ optionKey: "bogus", support: "MALFORMED_STRUCTURE" }]);
    const result = traverse([{ listName: "default", actions: ["slam,if=buff.x.up,bogus", "kick"] }], {
      ...BINDINGS,
      knownBuffs: [{ name: "x", up: true }],
    });
    expect(result.kind).toBe("UNKNOWN");
  });

  it("refuses a player action with two if= options instead of reading it as unconditional", () => {
    const line = "slam,if=buff.x.up,if=buff.y.up";
    // Malformed, so no condition is picked and none is read as absent (M11-D1C).
    expect(deriveConditionRaw(line)).not.toBeNull();
    expect(parseSimcExpression(deriveConditionRaw(line) ?? "buff.x.up").ok).toBe(false);
    expect(actionIn(line).unsupportedOptions).toEqual([{ optionKey: "if", support: "MALFORMED_STRUCTURE" }]);
    const result = traverse([{ listName: "default", actions: [line, "kick"] }]);
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind === "UNKNOWN") expect(result.blockedAt?.actionToken).toBe("slam");
  });

  it("leaves every pinned public-authority line's derivation as it was", () => {
    // Every public line ends with its `if=`, if it has one, and holds no comma
    // inside parentheses or quotes; the structural split agrees with the
    // pre-D1 "everything after ,if=" reading on all of them. Pinned in the
    // public artifacts' own contract tests; restated here on a sample.
    expect(deriveConditionRaw("envenom,if=combo_points>=5&energy.pct>70")).toBe(
      "combo_points>=5&energy.pct>70",
    );
    expect(deriveActionOptionKeys("garrote,cycle_targets=1,if=refreshable")).toEqual(["cycle_targets", "if"]);
    expect(deriveConditionRaw("auto_attack")).toBeNull();
  });
});

describe("cycling_variable is an execute-and-continue variable, never a selected action", () => {
  it("is classified as a variable assignment, like variable", () => {
    expect(actionIn(AFFLICTION_MIN_AGONY).entryKind).toBe("VARIABLE_ASSIGNMENT");
    expect(actionIn(VENGEANCE_DUNG_PULL_RESET).entryKind).toBe("VARIABLE_ASSIGNMENT");
    expect(actionIn("variable,name=x,value=1").entryKind).toBe("VARIABLE_ASSIGNMENT");
  });

  it("is stepped over by the nested scan even when every entry is taken as usable", () => {
    const result = traverse([{ listName: "default", actions: [VENGEANCE_DUNG_PULL_RESET, "fracture"] }]);
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("fracture");
    expect(result.steps[0]?.actionToken).toBe("cycling_variable");
    expect(result.steps[0]?.outcome).toBe("VARIABLE_EXECUTED_CONTINUE");
  });

  it("without op= (OPERATION_SET is the default, variable.cpp:18) it is still never the selected action", () => {
    // The pinned lines above carry `op=`, an option the loader does not
    // recognise, so before M11-D1 they happened to REFUSE the scan. Without
    // `op=` every option is supported, and a player-action classification let
    // an unconditional, "usable" `cycling_variable` be returned as the action.
    const line = "cycling_variable,name=x,value=1";
    const nested = traverse([{ listName: "default", actions: [line, "fracture"] }]);
    expect(nested.kind).toBe("SELECTED");
    if (nested.kind === "SELECTED") expect(nested.actionToken).toBe("fracture");
  });

  it("alone in a list selects nothing — it is not an action the list can return", () => {
    const result = traverse([{ listName: "default", actions: [AFFLICTION_MIN_AGONY] }]);
    expect(result.kind).toBe("NO_ACTION_SELECTED");
  });

  it("produces no value a later line can read: the read is refused, or unresolved, never decided", () => {
    const lists = (reader: string): SyntheticListSpec[] => [
      { listName: "default", actions: [AFFLICTION_MIN_AGONY, reader, "shadow_bolt"] },
    ];
    // Undeclared: the whole condition is refused and the scan blocks there.
    const refused = traverse(lists("drain_soul,if=variable.min_agony<5"));
    expect(refused.kind).toBe("UNKNOWN");
    if (refused.kind === "UNKNOWN") expect(refused.blockedAt?.actionToken).toBe("drain_soul");
    // Declared but unbound: UNKNOWN, so the line stays possible and the lower
    // action is not confidently selected over it.
    const vocabulary = defineSpecAtomVocabulary(
      "test/m11d1-line-structure",
      [{ identifier: "variable.min_agony", shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false }],
      isBuiltinIdentifier,
    );
    const unresolved = traverse(lists("drain_soul,if=variable.min_agony<5"), {
      ...BINDINGS,
      specAtoms: { vocabulary, bound: [] },
    });
    expect(unresolved.kind).toBe("UNKNOWN");
    if (unresolved.kind === "UNKNOWN") expect(unresolved.blockedAt?.actionToken).toBe("drain_soul");
  });
});

describe("a duplicated if= never makes a list-dispatch entry certain (M11-D1C)", () => {
  // Every line here is fully established apart from its structure: both
  // conditions are TRUE and every action is taken as usable, so the only thing
  // that can stop a selection is the malformed dispatch itself.
  const allUp: AtomBindings = {
    ...BINDINGS,
    knownBuffs: [
      { name: "x", up: true },
      { name: "y", up: true },
    ],
  };
  const MALFORMED_CALL = "call_action_list,name=burst,if=buff.x.up,if=buff.y.up";
  const WELL_FORMED_CALL = "call_action_list,name=burst,if=buff.x.up";

  it("is malformed for player, run and call entries alike", () => {
    for (const line of [
      "kick,if=buff.x.up,if=buff.y.up",
      "run_action_list,name=burst,if=buff.x.up,if=buff.y.up",
      MALFORMED_CALL,
    ]) {
      const action = actionIn(line);
      expect(isMalformedAuthorityLine(action), line).toBe(true);
      expect(action.conditionRaw, line).not.toBeNull();
    }
    expect(isMalformedAuthorityLine(actionIn(WELL_FORMED_CALL))).toBe(false);
  });

  it("control: the well-formed call is entered and its action selected", () => {
    const result = traverse(
      [
        { listName: "default", actions: [WELL_FORMED_CALL, "slam"] },
        { listName: "burst", actions: ["kick"] },
      ],
      allUp,
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind === "SELECTED") expect(result.actionToken).toBe("kick");
  });

  it("blocks at the malformed call: the list is not entered and nothing is selected", () => {
    const result = traverse(
      [
        { listName: "default", actions: [MALFORMED_CALL, "slam"] },
        { listName: "burst", actions: ["kick"] },
      ],
      allUp,
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNSUPPORTED_ACTION_OPTION");
    expect(result.blockedAt?.actionToken).toBe("call_action_list");
    // The callee was never scanned: its entry appears in no step.
    expect(result.steps.some((step) => step.actionToken === "kick")).toBe(false);
    // And the scan did not fall through to the lower action either.
    expect(result.steps.some((step) => step.actionToken === "slam")).toBe(false);
  });

  it("blocks even when the malformed call's callee is provably empty", () => {
    // The convergence rule for an empty callee is not applied: a malformed
    // dispatch is refused before anything about its callee is read.
    const result = traverse(
      [
        { listName: "default", actions: [MALFORMED_CALL, "slam"] },
        { listName: "burst", actions: ["kick,if=buff.z.up&!buff.z.up"] },
      ],
      allUp,
    );
    expect(result.kind).toBe("UNKNOWN");
  });

  it("blocks at a malformed run_action_list the same way", () => {
    const result = traverse(
      [
        { listName: "default", actions: ["run_action_list,name=burst,if=buff.x.up,if=buff.y.up", "slam"] },
        { listName: "burst", actions: ["kick"] },
      ],
      allUp,
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind === "UNKNOWN") expect(result.blocker).toBe("UNSUPPORTED_ACTION_OPTION");
  });

  it("cannot be a proven sole gate", () => {
    const authority = syntheticAuthority({
      lists: [
        { listName: "default", actions: ["call_action_list,name=spend,if=combo_points>=5,if=energy.pct>50"] },
        { listName: "spend", actions: ["envenom"] },
      ],
    });
    const proof = authority.proveSoleGateTo("envenom");
    expect(proof.kind).toBe("NOT_PROVABLE");
    if (proof.kind === "NOT_PROVABLE") expect(proof.reason).toBe("MALFORMED_GATE_EDGE");
  });
});

describe("the single-list walker never returns a variable entry (M11-D1C)", () => {
  function selectIn(actions: readonly string[], bindings: AtomBindings = BINDINGS) {
    const authority = syntheticAuthority({
      lists: [
        { listName: "default", actions: ["call_action_list,name=variables"] },
        { listName: "variables", actions: [...actions] },
      ],
    });
    // The worst case: every line is taken as usable.
    return selectWithinList(authority, "variables", bindings, () => "PROVEN_USABLE");
  }

  it("steps over the pinned Affliction cycling_variable to the foreground action", () => {
    const selection = selectIn([AFFLICTION_MIN_AGONY, "shadow_bolt"]);
    expect(selection.kind).toBe("SELECTED");
    if (selection.kind !== "SELECTED") return;
    expect(selection.actionToken).toBe("shadow_bolt");
    expect(selection.lines.map((line) => line.actionToken)).toEqual(["shadow_bolt"]);
  });

  it("never returns an op-less cycling_variable or a plain variable", () => {
    for (const variable of [
      "cycling_variable,name=x,value=1",
      "variable,name=x,value=1",
      VENGEANCE_DUNG_PULL_RESET,
    ]) {
      const selection = selectIn([variable, "shadow_bolt"]);
      expect(selection.kind === "SELECTED" ? selection.actionToken : selection.kind, variable).toBe(
        "shadow_bolt",
      );
    }
  });

  it("alone in a list selects nothing", () => {
    expect(selectIn([AFFLICTION_MIN_AGONY]).kind).toBe("NO_ACTION_SELECTED");
  });

  it("invents no value: a later read is refused, or stays unresolved and blocks the lower action", () => {
    // Undeclared: RE-POINTED for M11-D3-C2. The read parses as a generic
    // variable, and this single-list walker executes no variable line, so it
    // reads the UNKNOWN incoming value — Drain Soul stays possible, exactly as
    // when declared but unbound, and Shadow Bolt is not selected over it.
    const undeclared = selectIn([AFFLICTION_MIN_AGONY, "drain_soul,if=variable.min_agony<5", "shadow_bolt"]);
    expect(undeclared.kind).toBe("INDETERMINATE");
    if (undeclared.kind === "INDETERMINATE") {
      expect(undeclared.blocker).toBe("COMPETING_POSSIBLE_ACTION");
      expect(undeclared.lines[0]?.actionToken).toBe("drain_soul");
      expect(undeclared.lines[0]?.outcome).toBe("POSSIBLE");
    }
    // Declared but unbound: UNKNOWN, so Drain Soul stays possible and Shadow
    // Bolt is not selected over it.
    const vocabulary = defineSpecAtomVocabulary(
      "test/m11d1-line-structure",
      [{ identifier: "variable.min_agony", shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false }],
      isBuiltinIdentifier,
    );
    const unresolved = selectIn([AFFLICTION_MIN_AGONY, "drain_soul,if=variable.min_agony<5", "shadow_bolt"], {
      ...BINDINGS,
      specAtoms: { vocabulary, bound: [] },
    });
    expect(unresolved.kind).toBe("INDETERMINATE");
    if (unresolved.kind === "INDETERMINATE") {
      expect(unresolved.blocker).toBe("COMPETING_POSSIBLE_ACTION");
      expect(unresolved.lines[0]?.actionToken).toBe("drain_soul");
      expect(unresolved.lines[0]?.outcome).toBe("POSSIBLE");
    }
  });

  it("derives executesAndContinues from the entry kind and nothing else", () => {
    const cases: readonly (readonly [string, boolean])[] = [
      [AFFLICTION_MIN_AGONY, true],
      ["variable,name=x,value=1", true],
      ["shadow_bolt", false],
      ["call_action_list,name=x", false],
      ["run_action_list,name=x", false],
    ];
    for (const [line, expected] of cases) {
      const action = actionIn(line);
      expect(action.executesAndContinues, line).toBe(expected);
      expect(action.executesAndContinues, line).toBe(action.entryKind === "VARIABLE_ASSIGNMENT");
    }
  });
});

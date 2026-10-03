/**
 * The three atoms M5-C3c3c recognised, and the knowledge none of them gained.
 *
 * RECOGNITION IS NOT KNOWLEDGE, and this file exists to keep the two apart.
 *
 * The pinned `misc_cds` lines carry `buff.bloodlust.react` and
 * `debuff.deathmark.up`, and the `cds` call gate carries
 * `buff.scent_of_blood.stack`. An expression containing an unrecognised
 * fragment is refused WHOLE, so until C3c3c the scan stopped at those entries
 * rather than deciding them.
 *
 * Recognising them lets the scan BRANCH over those entries. It supplies no
 * value for any of them: all three resolve UNKNOWN, and the tests below pin
 * that as hard as they pin the parsing.
 *
 * THE ONE THAT WOULD HAVE BEEN EASY TO GET WRONG
 *
 * `.react` is not `.up`. SimulationCraft's `.react` gates on whether the actor
 * has had time to react to an aura, which `.up` does not. Equating them would
 * let a reaction-delay model this project does not have collapse into a plain
 * presence check — so they get different atom keys and never correlate.
 */

import { describe, expect, it } from "vitest";

import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import { atomOf } from "../../src/simc/expression/ast.js";
import {
  evaluateSimcExpression,
  knownNumber,
  unknownNumber,
  type AtomBindings,
} from "../../src/simc/expression/evaluate.js";

const BINDINGS: AtomBindings = {
  comboPoints: knownNumber(7),
  comboPointsDeficit: unknownNumber("STATE_NOT_ESTABLISHED"),
  energyPct: unknownNumber("STATE_NOT_ESTABLISHED"),
  // No action's own DoT is established here. An empty per-action map is the
  // M5-D1 shape of that, and an unkeyed `remains` resolves UNKNOWN_NUMBER.
  dotRemainsSecondsByAction: [],
  knownBuffs: [],
};

function astOf(source: string) {
  const parsed = parseSimcExpression(source);
  if (!parsed.ok) throw new Error(`${source} was refused: ${parsed.reason} at ${parsed.fragment}`);
  return parsed.ast;
}

function evaluate(source: string, bindings: AtomBindings = BINDINGS) {
  const result = evaluateSimcExpression(astOf(source), source, bindings);
  if (result.outcome === "UNSUPPORTED") throw new Error(`${source} was refused: ${result.reason}`);
  return result;
}

/** The evaluator's three-valued answer, in the vocabulary these tests read in. */
function truthOf(source: string, bindings: AtomBindings = BINDINGS): string {
  const result = evaluate(source, bindings);
  if (result.outcome === "UNRESOLVED") return "UNKNOWN_STATE";
  return result.value ? "TRUE" : "FALSE";
}

describe("buff.<name>.stack parses as a MAGNITUDE", () => {
  it("parses, and is numeric-shaped", () => {
    const atom = atomOf(astOf("buff.scent_of_blood.stack"));
    expect(atom?.key).toBe("buff.scent_of_blood.stack");
    expect(atom?.shape).toBe("NUMERIC");
  });

  it("resolves UNKNOWN_NUMBER, and emphatically not zero", () => {
    // THE failure this prevents. `buff.x.stack>=2` with a fabricated zero would
    // come out FALSE, and an absent aura would silently become an observed one
    // at zero stacks. Absence of an observation is not an observation.
    expect(truthOf("buff.scent_of_blood.stack>=2")).toBe("UNKNOWN_STATE");
    const result = evaluate("buff.scent_of_blood.stack>=2");
    const atom = result.trace.atoms.find((entry) => entry.key === "buff.scent_of_blood.stack");
    expect(atom?.binding).toBe("UNKNOWN_NUMBER");
    expect(atom?.value).toBeNull();
  });

  it("is never enumerated, because a magnitude has no two worlds", () => {
    const result = evaluate("buff.scent_of_blood.stack>=2");
    expect(result.trace.worlds).toHaveLength(1);
  });

  it("does NOT unblock the real cds gate, which needs three more forms", () => {
    // Worth stating plainly. The pinned `default[5]` condition also contains a
    // talent RANK and a spell-target count, both still refused (its `>?` — a
    // MINIMUM — parses since M11-D3-C1) — and it does not need to parse: an
    // unsupported gate on a `call_action_list` already branches over both worlds.
    const real =
      "variable.single_target|!talent.scent_of_blood|buff.scent_of_blood.stack>=" +
      "(2*talent.scent_of_blood.rank*spell_targets.fan_of_knives>?20)";
    expect(parseSimcExpression(real).ok).toBe(false);
  });
});

describe("buff.<name>.react parses as a TRUTH, and is not buff.<name>.up", () => {
  it("parses, and is boolean-shaped", () => {
    const atom = atomOf(astOf("buff.bloodlust.react"));
    expect(atom?.key).toBe("buff.bloodlust.react");
    expect(atom?.shape).toBe("BOOLEAN");
  });

  it("gets a DIFFERENT key from .up, so the two never correlate", () => {
    expect(atomOf(astOf("buff.bloodlust.react"))?.key).not.toBe(atomOf(astOf("buff.bloodlust.up"))?.key);
  });

  it("is NOT satisfied by a known .up binding", () => {
    // The sharpest form. Bind `buff.bloodlust.up` as definitely TRUE and ask
    // about `.react`: it must stay unresolved, because nothing pinned says the
    // two are the same question.
    const bindings: AtomBindings = { ...BINDINGS, knownBuffs: [{ name: "bloodlust", up: true }] };
    expect(truthOf("buff.bloodlust.up", bindings)).toBe("TRUE");
    expect(truthOf("buff.bloodlust.react", bindings)).toBe("UNKNOWN_STATE");

    const reactResult = evaluate("buff.bloodlust.react", bindings);
    const atom = reactResult.trace.atoms.find((entry) => entry.key === "buff.bloodlust.react");
    expect(atom?.binding).toBe("UNRESOLVED_BOOLEAN");
  });

  it("enumerates both worlds rather than defaulting to false", () => {
    const result = evaluate("buff.bloodlust.react");
    expect(result.trace.worlds).toHaveLength(2);
    expect(result.trace.worlds.map((world) => world.result).sort()).toEqual(["FALSE", "TRUE"]);
  });
});

describe("debuff.<name>.up parses as a TRUTH on the TARGET", () => {
  it("parses, and is boolean-shaped", () => {
    const atom = atomOf(astOf("debuff.deathmark.up"));
    expect(atom?.key).toBe("debuff.deathmark.up");
    expect(atom?.shape).toBe("BOOLEAN");
  });

  it("gets a DIFFERENT key from the player-side buff of the same name", () => {
    // Buff/debuff direction. `buff.deathmark.up` is an aura on the player;
    // `debuff.deathmark.up` is one the player applied to the enemy. Folding them
    // together would be the direction error this project keeps a rule about.
    expect(atomOf(astOf("debuff.deathmark.up"))?.key).toBe("debuff.deathmark.up");
    expect(atomOf(astOf("buff.deathmark.up"))?.key).toBe("buff.deathmark.up");
  });

  it("is NOT satisfied by a known player-side buff binding", () => {
    const bindings: AtomBindings = { ...BINDINGS, knownBuffs: [{ name: "deathmark", up: true }] };
    expect(truthOf("debuff.deathmark.up", bindings)).toBe("UNKNOWN_STATE");
  });

  it("resolves UNKNOWN with no binding, and enumerates both worlds", () => {
    expect(truthOf("debuff.deathmark.up")).toBe("UNKNOWN_STATE");
    expect(evaluate("debuff.deathmark.up").trace.worlds).toHaveLength(2);
  });
});

describe("recognising three forms opened no namespace", () => {
  it.each([
    "buff.darkest_night.duration",
    "buff.darkest_night.value",
    "buff.darkest_night.remains_expected",
    "debuff.deathmark.remains",
    "debuff.deathmark.stack",
    "debuff.deathmark.react",
    "debuff.deathmark.ticking",
  ])("still refuses '%s'", (source) => {
    const parsed = parseSimcExpression(source);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe("UNSUPPORTED_IDENTIFIER");
  });

  it.each(["spell_targets.fan_of_knives", "talent.scent_of_blood.rank", "energy.regen_combined"])(
    "still refuses the unrelated identifier '%s'",
    (source) => {
      expect(parseSimcExpression(source).ok).toBe(false);
    },
  );

  it("reads >? and <? as extremum operators, never as comparisons (RE-POINTED for M11-D3-C1)", () => {
    for (const operator of [">?", "<?"] as const) {
      const parsed = parseSimcExpression(`combo_points${operator}5`);
      expect(parsed.ok && parsed.ast.kind, operator).toBe("EXTREMUM");
      expect(parsed.ok && parsed.ast.kind === "EXTREMUM" && parsed.ast.operator, operator).toBe(operator);
    }
  });
});

describe("the real pinned potion condition now evaluates", () => {
  const POTION_CONDITION = "dot.rupture.ticking&(buff.bloodlust.react|fight_remains<30|debuff.deathmark.up)";

  it("parses whole", () => {
    expect(parseSimcExpression(POTION_CONDITION).ok).toBe(true);
  });

  it("comes out UNKNOWN_STATE with every operand unresolved", () => {
    expect(truthOf(POTION_CONDITION)).toBe("UNKNOWN_STATE");
    const result = evaluate(POTION_CONDITION);
    const byKey = new Map(result.trace.atoms.map((atom) => [atom.key, atom]));
    expect(byKey.get("dot.rupture.ticking")?.binding).toBe("UNRESOLVED_BOOLEAN");
    expect(byKey.get("buff.bloodlust.react")?.binding).toBe("UNRESOLVED_BOOLEAN");
    expect(byKey.get("debuff.deathmark.up")?.binding).toBe("UNRESOLVED_BOOLEAN");
  });

  it("uses no hindsight to get there", () => {
    // `fight_remains` stays predictive. Widening the parser did not quietly
    // admit knowledge of how the fight turned out.
    const result = evaluate(POTION_CONDITION);
    const atom = result.trace.atoms.find((entry) => entry.key === "fight_remains");
    expect(atom?.unknownNumberReason).toBe("PREDICTIVE_NOT_PLAYER_KNOWABLE");
  });

  it("is FALSE when the leading conjunct is proven false", () => {
    // Kleene still applies: `FALSE & anything` is FALSE, whatever the three
    // unresolved atoms do. Recognition did not weaken the evaluator.
    const bindings: AtomBindings = {
      ...BINDINGS,
      knownDotsTicking: [{ name: "rupture", ticking: false }],
    };
    expect(truthOf(POTION_CONDITION, bindings)).toBe("FALSE");
  });
});

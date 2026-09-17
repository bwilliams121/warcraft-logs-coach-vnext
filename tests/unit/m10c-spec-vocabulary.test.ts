/**
 * M10-C: the specialization-owned atom seam in the shared parser/evaluator.
 *
 * The shared code learns no identifier from this test. The vocabulary below
 * is a TEST vocabulary with made-up names, so the seam is proven on its own
 * terms: declared identifiers parse to one generic node, undeclared ones are
 * refused exactly as before, built-ins keep precedence, and values arrive
 * only through the bindings a specialization supplies.
 */

import { describe, expect, it } from "vitest";

import { atomOf, collectAtoms } from "../../src/simc/expression/ast.js";
import {
  evaluateSimcExpression,
  knownNumber,
  boundedBelowNumber,
  unknownNumber,
  type AtomBindings,
} from "../../src/simc/expression/evaluate.js";
import { isBuiltinIdentifier, parseSimcExpression } from "../../src/simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  specAtomValueFor,
  SpecVocabularyError,
  type SpecAtomBindings,
} from "../../src/simc/expression/spec-vocabulary.js";
import { evaluateCondition } from "../../src/simc/list-selection.js";
import { proveTargetIndependentFalsehood } from "../../src/simc/target-independence.js";
import { syntheticAuthority } from "../support/m5a-authority.js";

const TEST_VOCABULARY = defineSpecAtomVocabulary(
  "test/spec",
  [
    { identifier: "widget.ready", shape: "BOOLEAN", scope: "PLAYER_SCOPED", selfAddressing: false },
    { identifier: "widget.count", shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
    { identifier: "target.widget.up", shape: "BOOLEAN", scope: "TARGET_SCOPED", selfAddressing: false },
    { identifier: "own_charges", shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: true },
  ],
  isBuiltinIdentifier,
);

function base(overrides: Partial<AtomBindings> = {}): AtomBindings {
  return {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    knownBuffs: [],
    ...overrides,
  };
}

function withSpec(bound: SpecAtomBindings["bound"]): AtomBindings {
  return base({ specAtoms: { vocabulary: TEST_VOCABULARY, bound } });
}

describe("defining a vocabulary", () => {
  it("freezes the declarations and answers lookups by exact identifier", () => {
    expect(Object.isFrozen(TEST_VOCABULARY)).toBe(true);
    expect(Object.isFrozen(TEST_VOCABULARY.declarations)).toBe(true);
    expect(TEST_VOCABULARY.ownerSpecId).toBe("test/spec");
    expect(TEST_VOCABULARY.lookup("widget.ready")?.shape).toBe("BOOLEAN");
    expect(TEST_VOCABULARY.lookup("widget.read")).toBeNull();
    expect(TEST_VOCABULARY.lookup("widget.ready.up")).toBeNull();
  });

  it("refuses a duplicate identifier", () => {
    expect(() =>
      defineSpecAtomVocabulary(
        "test/spec",
        [
          { identifier: "x", shape: "BOOLEAN", scope: "PLAYER_SCOPED", selfAddressing: false },
          { identifier: "x", shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
        ],
        isBuiltinIdentifier,
      ),
    ).toThrow(SpecVocabularyError);
  });

  it.each([
    "combo_points",
    "energy.pct",
    "buff.avenging_wrath.up",
    "cooldown.divine_toll.remains",
    "talent.x",
  ])("refuses to shadow the built-in identifier %s", (identifier) => {
    expect(() =>
      defineSpecAtomVocabulary(
        "test/spec",
        [{ identifier, shape: "BOOLEAN", scope: "PLAYER_SCOPED", selfAddressing: false }],
        isBuiltinIdentifier,
      ),
    ).toThrow(/SHADOWS_BUILTIN_IDENTIFIER/);
  });

  it("refuses a malformed identifier and an empty owner", () => {
    expect(() =>
      defineSpecAtomVocabulary(
        "test/spec",
        [{ identifier: "1bad", shape: "BOOLEAN", scope: "PLAYER_SCOPED", selfAddressing: false }],
        isBuiltinIdentifier,
      ),
    ).toThrow(/MALFORMED_IDENTIFIER/);
    expect(() => defineSpecAtomVocabulary("", [], isBuiltinIdentifier)).toThrow(/NO_OWNER/);
  });
});

describe("parsing with and without a vocabulary", () => {
  it("without a vocabulary, a declared-elsewhere identifier is still refused whole", () => {
    const result = parseSimcExpression("widget.ready&combo_points>=5");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("UNSUPPORTED_IDENTIFIER");
    expect(result.fragment).toBe("widget.ready");
  });

  it("with the vocabulary, the identifier parses to ONE generic node carrying its declaration", () => {
    const result = parseSimcExpression("widget.ready", TEST_VOCABULARY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ast).toEqual({
      kind: "SPEC_ATOM",
      identifier: "widget.ready",
      shape: "BOOLEAN",
      scope: "PLAYER_SCOPED",
      selfAddressing: false,
    });
    expect(atomOf(result.ast)).toEqual({ key: "widget.ready", shape: "BOOLEAN", scope: "PLAYER_SCOPED" });
  });

  it("an undeclared identifier is still refused, and the vocabulary opens no namespace", () => {
    for (const expression of ["widget.other", "widget", "widget.ready.remains"]) {
      const result = parseSimcExpression(expression, TEST_VOCABULARY);
      expect(result.ok, expression).toBe(false);
      if (!result.ok) expect(result.reason).toBe("UNSUPPORTED_IDENTIFIER");
    }
  });

  it("built-ins keep precedence and mix freely with declared atoms", () => {
    const result = parseSimcExpression("!buff.x.up&widget.count>=2|talent.y", TEST_VOCABULARY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(collectAtoms(result.ast).map((atom) => atom.key)).toEqual([
      "buff.x.up",
      "widget.count",
      "talent.y",
    ]);
  });

  it("scope travels with the declaration, so target-independence sees it", () => {
    const result = parseSimcExpression("target.widget.up", TEST_VOCABULARY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(atomOf(result.ast)?.scope).toBe("TARGET_SCOPED");
  });
});

describe("evaluating declared atoms", () => {
  function evaluate(expression: string, bindings: AtomBindings, actionToken: string | null = null) {
    const parsed = parseSimcExpression(expression, TEST_VOCABULARY);
    if (!parsed.ok) throw new Error(`expected parse: ${parsed.reason} ${parsed.fragment}`);
    return evaluateSimcExpression(
      parsed.ast,
      expression,
      bindings,
      actionToken === null ? undefined : { currentActionToken: actionToken },
    );
  }

  it("a bound TRUTH is KNOWN and decides the expression", () => {
    const yes = evaluate(
      "widget.ready",
      withSpec([{ key: "widget.ready", actionToken: null, value: { kind: "TRUTH", value: true } }]),
    );
    expect(yes.outcome).toBe("RESOLVED");
    if (yes.outcome === "RESOLVED") expect(yes.value).toBe(true);
    const no = evaluate(
      "widget.ready",
      withSpec([{ key: "widget.ready", actionToken: null, value: { kind: "TRUTH", value: false } }]),
    );
    expect(no.outcome).toBe("RESOLVED");
    if (no.outcome === "RESOLVED") expect(no.value).toBe(false);
    if (no.outcome === "RESOLVED") expect(no.trace.atoms[0]?.binding).toBe("KNOWN");
  });

  it("an unbound TRUTH is enumerated, never false: the answer survives only if both worlds agree", () => {
    const undecided = evaluate("widget.ready", withSpec([]));
    expect(undecided.outcome).toBe("UNRESOLVED");
    if (undecided.outcome === "UNRESOLVED") {
      expect(undecided.trace.atoms[0]?.binding).toBe("UNRESOLVED_BOOLEAN");
      expect(undecided.trace.worlds).toHaveLength(2);
    }
    // FALSE & unknown is FALSE in every world — the same Kleene rule built-ins get.
    const decided = evaluate("widget.ready&1>2", withSpec([]));
    expect(decided.outcome).toBe("RESOLVED");
    if (decided.outcome === "RESOLVED") expect(decided.value).toBe(false);
  });

  it("a bound MAGNITUDE is KNOWN, BOUNDED or UNKNOWN exactly as the resolver stated", () => {
    const known = evaluate(
      "widget.count>=2",
      withSpec([
        { key: "widget.count", actionToken: null, value: { kind: "MAGNITUDE", binding: knownNumber(3) } },
      ]),
    );
    expect(known.outcome).toBe("RESOLVED");
    if (known.outcome === "RESOLVED") expect(known.value).toBe(true);

    const bounded = evaluate(
      "widget.count>=2",
      withSpec([
        {
          key: "widget.count",
          actionToken: null,
          value: { kind: "MAGNITUDE", binding: boundedBelowNumber(5, "STATE_NOT_ESTABLISHED") },
        },
      ]),
    );
    expect(bounded.outcome).toBe("RESOLVED");
    if (bounded.outcome === "RESOLVED") expect(bounded.value).toBe(true);

    const stated = evaluate(
      "widget.count>=2",
      withSpec([
        {
          key: "widget.count",
          actionToken: null,
          value: { kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") },
        },
      ]),
    );
    expect(stated.outcome).toBe("UNRESOLVED");
    if (stated.outcome === "UNRESOLVED")
      expect(stated.trace.atoms[0]?.unknownNumberReason).toBe("STATE_NOT_MODELLED");
  });

  it("an unbound MAGNITUDE is UNKNOWN_NUMBER / STATE_NOT_ESTABLISHED, never zero and never enumerated", () => {
    const result = evaluate("widget.count>=0", withSpec([]));
    // `count >= 0` would be TRUE for a zero; it is UNRESOLVED because nobody stated a count.
    expect(result.outcome).toBe("UNRESOLVED");
    if (result.outcome === "UNRESOLVED") {
      expect(result.trace.atoms[0]?.binding).toBe("UNKNOWN_NUMBER");
      expect(result.trace.atoms[0]?.unknownNumberReason).toBe("STATE_NOT_ESTABLISHED");
      expect(result.trace.worlds).toHaveLength(1);
    }
  });

  it("a self-addressing atom is read only through the acting action's own binding", () => {
    const bound: SpecAtomBindings["bound"] = [
      { key: "own_charges", actionToken: "judgment", value: { kind: "MAGNITUDE", binding: knownNumber(2) } },
    ];
    const own = evaluate("own_charges=2", withSpec(bound), "judgment");
    expect(own.outcome).toBe("RESOLVED");
    if (own.outcome === "RESOLVED") expect(own.value).toBe(true);
    // Another action asking the same question does not receive Judgment's charges.
    const other = evaluate("own_charges=2", withSpec(bound), "consecration");
    expect(other.outcome).toBe("UNRESOLVED");
    // No acting action at all: nothing answers.
    const none = evaluate("own_charges=2", withSpec(bound));
    expect(none.outcome).toBe("UNRESOLVED");
    expect(specAtomValueFor(withSpec(bound).specAtoms, "own_charges", null)).toBeUndefined();
  });

  it("the trace and the world evaluator agree about which binding was read", () => {
    const result = evaluate(
      "widget.ready&widget.count>1",
      withSpec([
        { key: "widget.ready", actionToken: null, value: { kind: "TRUTH", value: true } },
        { key: "widget.count", actionToken: null, value: { kind: "MAGNITUDE", binding: knownNumber(4) } },
      ]),
    );
    expect(result.outcome).toBe("RESOLVED");
    if (result.outcome !== "RESOLVED") return;
    expect(result.value).toBe(true);
    expect(result.trace.atoms.map((atom) => [atom.key, atom.binding, atom.value])).toEqual([
      ["widget.ready", "KNOWN", 1],
      ["widget.count", "KNOWN", 4],
    ]);
  });
});

describe("the shared walkers parse with the vocabulary the bindings carry", () => {
  const authority = syntheticAuthority({
    lists: [
      { listName: "default", actions: ["kick,if=widget.ready", "stealth,if=widget.count>3&buff.x.up"] },
    ],
  });

  it("evaluateCondition reads the vocabulary from the bindings and evaluates the declared atom", () => {
    const [kick, stealth] = authority.actions;
    if (kick === undefined || stealth === undefined) throw new Error("fixture");
    const noVocabulary = evaluateCondition(kick, base());
    expect(noVocabulary.kind).toBe("UNSUPPORTED");
    if (noVocabulary.kind === "UNSUPPORTED") expect(noVocabulary.fragment).toBe("widget.ready");

    const withTruth = evaluateCondition(
      kick,
      withSpec([{ key: "widget.ready", actionToken: null, value: { kind: "TRUTH", value: false } }]),
    );
    expect(withTruth.kind).toBe("EVALUATED");
    if (withTruth.kind === "EVALUATED") expect(withTruth.truth).toBe("FALSE");

    const stealthLine = evaluateCondition(
      stealth,
      withSpec([
        { key: "widget.count", actionToken: null, value: { kind: "MAGNITUDE", binding: knownNumber(1) } },
      ]),
    );
    expect(stealthLine.kind).toBe("EVALUATED");
    // `1>3` is FALSE, so the enumerated buff cannot rescue the line.
    if (stealthLine.kind === "EVALUATED") expect(stealthLine.truth).toBe("FALSE");
  });

  it("target-independence proves a player-scoped declared conjunct false through the same vocabulary", () => {
    const [, stealth] = authority.actions;
    if (stealth === undefined) throw new Error("fixture");
    const proof = proveTargetIndependentFalsehood(
      stealth,
      withSpec([
        { key: "widget.count", actionToken: null, value: { kind: "MAGNITUDE", binding: knownNumber(1) } },
      ]),
    );
    expect(proof.kind).toBe("ELIMINATED_FOR_EVERY_TARGET");
    const refused = proveTargetIndependentFalsehood(stealth, base());
    expect(refused.kind).toBe("NOT_PROVEN");
  });
});

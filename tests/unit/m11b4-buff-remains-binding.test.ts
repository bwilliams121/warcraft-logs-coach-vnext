/**
 * M11-B4: the generic `buff.<name>.remains` binding seam.
 *
 * WHAT IS PINNED HERE
 *
 * `knownBuffRemainsSeconds` is a SEAM with the same shape and the same rule as
 * `knownCooldownRemainsSeconds`: a name-keyed list of `NumericBinding`s a
 * specialization ESTABLISHED. The evaluator reads it and nothing else — no
 * duration, no refresh rule, no default. An absent name is exactly what it
 * was before the seam existed (UNKNOWN, `STATE_NOT_MODELLED`, byte-identical
 * trace); an explicit UNKNOWN entry carries the spec's own reason; zero is
 * falsy only when a spec supplied it; a bound flows through
 * `compareWithBounds` unchanged; a bounded bare truth stays UNKNOWN; the
 * permanent sentinel is one shared constant with SimulationCraft's exact
 * representation.
 *
 * Negative first: nothing here manufactures a value the caller did not state.
 */

import { describe, expect, it } from "vitest";

import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import {
  boundedBelowNumber,
  evaluateSimcExpression,
  knownNumber,
  SIMC_PERMANENT_BUFF_REMAINS_SECONDS,
  unknownNumber,
  type AtomBindings,
} from "../../src/simc/expression/evaluate.js";

const NOT_MODELLED = unknownNumber("STATE_NOT_MODELLED");

function bindings(remains: AtomBindings["knownBuffRemainsSeconds"]): AtomBindings {
  return {
    comboPoints: NOT_MODELLED,
    comboPointsDeficit: NOT_MODELLED,
    energyPct: NOT_MODELLED,
    knownBuffs: [],
    ...(remains === undefined ? {} : { knownBuffRemainsSeconds: remains }),
  };
}

function evaluate(expression: string, atoms: AtomBindings) {
  const parsed = parseSimcExpression(expression);
  if (!parsed.ok) throw new Error(`expected ${expression} to parse, got ${parsed.reason}`);
  return evaluateSimcExpression(parsed.ast, expression, atoms);
}

function truthOf(expression: string, atoms: AtomBindings): boolean | "UNRESOLVED" | "UNSUPPORTED" {
  const result = evaluate(expression, atoms);
  return result.outcome === "RESOLVED" ? result.value : result.outcome;
}

function traceAtom(expression: string, atoms: AtomBindings, key: string) {
  const result = evaluate(expression, atoms);
  if (result.outcome === "UNSUPPORTED") throw new Error("unsupported");
  const atom = result.trace.atoms.find((entry) => entry.key === key);
  if (atom === undefined) throw new Error(`no trace atom ${key}`);
  return atom;
}

describe("unbound remains is exactly what it was before the seam", () => {
  it("resolves UNKNOWN with STATE_NOT_MODELLED, whether the field is absent or present without the name", () => {
    for (const atoms of [
      bindings(undefined),
      bindings([]),
      bindings([{ name: "other", remainsSeconds: knownNumber(3) }]),
    ]) {
      expect(truthOf("buff.envenom.remains<=1", atoms)).toBe("UNRESOLVED");
      expect(traceAtom("buff.envenom.remains<=1", atoms, "buff.envenom.remains")).toEqual({
        key: "buff.envenom.remains",
        shape: "NUMERIC",
        binding: "UNKNOWN_NUMBER",
        value: null,
        atLeast: null,
        unknownNumberReason: "STATE_NOT_MODELLED",
      });
    }
  });

  it("produces a byte-identical trace with and without the field for an unbound name", () => {
    const without = evaluate("buff.envenom.remains<=1|energy.pct>70", bindings(undefined));
    const withEmpty = evaluate("buff.envenom.remains<=1|energy.pct>70", bindings([]));
    const withOther = evaluate(
      "buff.envenom.remains<=1|energy.pct>70",
      bindings([{ name: "bone_shield", remainsSeconds: knownNumber(12) }]),
    );
    expect(JSON.stringify(withEmpty)).toBe(JSON.stringify(without));
    expect(JSON.stringify(withOther)).toBe(JSON.stringify(without));
  });

  it("never defaults to zero: an unbound remains as a bare truth is UNRESOLVED, not FALSE", () => {
    expect(truthOf("buff.crimson_scourge.remains", bindings([]))).toBe("UNRESOLVED");
    expect(truthOf("!buff.crimson_scourge.remains", bindings([]))).toBe("UNRESOLVED");
  });
});

describe("a bound remains is read exactly as supplied", () => {
  const exact = bindings([{ name: "bone_shield", remainsSeconds: knownNumber(12.5) }]);

  it("compares exactly against decimal and integer thresholds", () => {
    expect(truthOf("buff.bone_shield.remains<1.5", exact)).toBe(false);
    expect(truthOf("buff.bone_shield.remains<3", exact)).toBe(false);
    expect(truthOf("buff.bone_shield.remains<=12.5", exact)).toBe(true);
    expect(truthOf("buff.bone_shield.remains=12.5", exact)).toBe(true);
    expect(truthOf("buff.bone_shield.remains>12.5", exact)).toBe(false);
    expect(truthOf("buff.bone_shield.remains>=12.5", exact)).toBe(true);
    expect(traceAtom("buff.bone_shield.remains<1.5", exact, "buff.bone_shield.remains")).toMatchObject({
      binding: "KNOWN",
      value: 12.5,
    });
  });

  it("supports exact arithmetic — the pinned `fight_remains>x.remains+10` shape, minus the predictive side", () => {
    expect(truthOf("buff.bone_shield.remains+10>22", exact)).toBe(true);
    expect(truthOf("buff.bone_shield.remains+10>23", exact)).toBe(false);
    // The pinned line itself stays UNRESOLVED on fight_remains, never on the remains.
    expect(truthOf("fight_remains>buff.bone_shield.remains+10", exact)).toBe("UNRESOLVED");
  });

  it("is TRUE as a bare truth when positive, FALSE when the spec supplied zero", () => {
    expect(truthOf("buff.bone_shield.remains", exact)).toBe(true);
    const zero = bindings([{ name: "crimson_scourge", remainsSeconds: knownNumber(0) }]);
    expect(truthOf("buff.crimson_scourge.remains", zero)).toBe(false);
    expect(truthOf("!buff.crimson_scourge.remains", zero)).toBe(true);
    expect(truthOf("buff.crimson_scourge.remains<1.5", zero)).toBe(true);
    // The pinned san_gift[0] gate with an INACTIVE Essence: `0<1.5 & 0` is FALSE.
    expect(
      truthOf(
        "buff.essence_of_the_blood_queen.remains<1.5&buff.essence_of_the_blood_queen.remains",
        bindings([{ name: "essence_of_the_blood_queen", remainsSeconds: knownNumber(0) }]),
      ),
    ).toBe(false);
  });

  it("answers ONLY the named atom — a bone_shield entry never answers essence_of_the_blood_queen", () => {
    expect(truthOf("buff.essence_of_the_blood_queen.remains<1.5", exact)).toBe("UNRESOLVED");
    expect(
      traceAtom(
        "buff.essence_of_the_blood_queen.remains<1.5",
        exact,
        "buff.essence_of_the_blood_queen.remains",
      ),
    ).toMatchObject({ binding: "UNKNOWN_NUMBER", unknownNumberReason: "STATE_NOT_MODELLED" });
  });

  it("does not enumerate: a bound or unbound remains contributes no world", () => {
    const result = evaluate("buff.bone_shield.remains<1.5|buff.x.up", exact);
    if (result.outcome === "UNSUPPORTED") throw new Error("unsupported");
    // One enumerated atom (buff.x.up) -> two worlds; the remains adds none.
    expect(result.trace.worlds).toHaveLength(2);
  });
});

describe("an explicit UNKNOWN entry carries the specialization's reason", () => {
  it("resolves UNKNOWN with STATE_NOT_ESTABLISHED and is never zero", () => {
    const atoms = bindings([{ name: "bone_shield", remainsSeconds: unknownNumber("STATE_NOT_ESTABLISHED") }]);
    expect(truthOf("buff.bone_shield.remains<1.5", atoms)).toBe("UNRESOLVED");
    expect(truthOf("buff.bone_shield.remains", atoms)).toBe("UNRESOLVED");
    expect(traceAtom("buff.bone_shield.remains<1.5", atoms, "buff.bone_shield.remains")).toMatchObject({
      binding: "UNKNOWN_NUMBER",
      unknownNumberReason: "STATE_NOT_ESTABLISHED",
    });
  });
});

describe("a BOUNDED remains keeps the existing bound semantics unchanged", () => {
  const bounded = bindings([
    { name: "bone_shield", remainsSeconds: boundedBelowNumber(3.318, "STATE_NOT_ESTABLISHED") },
  ]);

  it("decides only in the proven direction", () => {
    expect(truthOf("buff.bone_shield.remains<1.5", bounded)).toBe(false);
    expect(truthOf("buff.bone_shield.remains<3", bounded)).toBe(false);
    expect(truthOf("buff.bone_shield.remains>=3", bounded)).toBe(true);
    expect(truthOf("buff.bone_shield.remains<8", bounded)).toBe("UNRESOLVED");
    expect(truthOf("buff.bone_shield.remains=3.318", bounded)).toBe("UNRESOLVED");
    expect(traceAtom("buff.bone_shield.remains<1.5", bounded, "buff.bone_shield.remains")).toMatchObject({
      binding: "BOUNDED",
      atLeast: 3.318,
      value: null,
    });
  });

  it("stays UNRESOLVED as a bare truth and under arithmetic — no new bound rule was added", () => {
    expect(truthOf("buff.bone_shield.remains", bounded)).toBe("UNRESOLVED");
    expect(truthOf("buff.bone_shield.remains+10>5", bounded)).toBe("UNRESOLVED");
  });

  it("lets the pinned sanlayn[0] gate resolve FALSE from a bound plus presence and count", () => {
    const atoms: AtomBindings = {
      ...bounded,
      knownBuffs: [{ name: "bone_shield", up: true }],
      knownBuffStacks: [{ name: "bone_shield", stack: 9 }],
    };
    expect(
      truthOf("!buff.bone_shield.up|buff.bone_shield.remains<1.5|buff.bone_shield.stack<=1", atoms),
    ).toBe(false);
  });
});

describe("the permanent sentinel", () => {
  it("is SimulationCraft's timespan_t::min().total_seconds(): int64 minimum milliseconds over one thousand", () => {
    expect(SIMC_PERMANENT_BUFF_REMAINS_SECONDS).toBe(-9223372036854775808 / 1000);
    expect(SIMC_PERMANENT_BUFF_REMAINS_SECONDS).toBeLessThan(0);
    expect(Number.isFinite(SIMC_PERMANENT_BUFF_REMAINS_SECONDS)).toBe(true);
    expect(SIMC_PERMANENT_BUFF_REMAINS_SECONDS).not.toBe(Number.NEGATIVE_INFINITY);
    expect(Math.abs(SIMC_PERMANENT_BUFF_REMAINS_SECONDS)).toBeGreaterThan(9.2e15);
  });

  it("is nonzero, so TRUE as a bare truth, and compares as the negative number it is — with no evaluator special case", () => {
    const atoms = bindings([
      { name: "vampiric_strike", remainsSeconds: knownNumber(SIMC_PERMANENT_BUFF_REMAINS_SECONDS) },
    ]);
    expect(truthOf("buff.vampiric_strike.remains", atoms)).toBe(true);
    expect(truthOf("!buff.vampiric_strike.remains", atoms)).toBe(false);
    // Faithful to buff.cpp:2018-2029 through the expression path: the raw sentinel is compared.
    expect(truthOf("buff.vampiric_strike.remains<1.5", atoms)).toBe(true);
    expect(truthOf("buff.vampiric_strike.remains>0", atoms)).toBe(false);
    expect(traceAtom("buff.vampiric_strike.remains", atoms, "buff.vampiric_strike.remains")).toMatchObject({
      binding: "KNOWN",
      value: SIMC_PERMANENT_BUFF_REMAINS_SECONDS,
    });
  });
});

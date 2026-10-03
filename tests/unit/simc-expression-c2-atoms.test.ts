import { describe, expect, it } from "vitest";

import { atomOf, collectAtoms, collectAtomKeys } from "../../src/simc/expression/ast.js";
import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import { evaluateSimcExpression, knownNumber, unknownNumber } from "../../src/simc/expression/evaluate.js";
import type { AtomBindings } from "../../src/simc/expression/evaluate.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";

/**
 * The three atoms M5-C2 added, and the boundaries around them.
 *
 * Each is TRUTH-shaped, so each may be enumerated when unresolved. What matters
 * as much as recognising them is how narrowly they were recognised:
 *
 *     stealthed.rogue         ONE scope. The other masks are different sets.
 *     talent.<name>           dot-free. A talent RANK is a magnitude.
 *     variable.single_target  ONE variable. `trinket_sync_slot` is a magnitude.
 */

const NO_ENERGY = unknownNumber("STATE_NOT_ESTABLISHED");

function bindings(overrides: Partial<AtomBindings> = {}): AtomBindings {
  return {
    comboPoints: knownNumber(0),
    comboPointsDeficit: knownNumber(7),
    energyPct: NO_ENERGY,
    // No action's own DoT is established here. An empty per-action map is the
    // M5-D1 shape of that, and an unkeyed `remains` resolves UNKNOWN_NUMBER.
    dotRemainsSecondsByAction: [],
    knownBuffs: [],
    ...overrides,
  };
}

function parse(source: string) {
  const parsed = parseSimcExpression(source);
  if (!parsed.ok) throw new Error(`expected ${source} to parse, got ${parsed.reason}: ${parsed.fragment}`);
  return parsed.ast;
}

describe("the new atoms parse, and are TRUTH-shaped", () => {
  it.each([
    ["stealthed.rogue", "stealthed.rogue"],
    ["talent.blindside", "talent.blindside"],
    ["talent.improved_ambush", "talent.improved_ambush"],
    ["talent.shrouded_suffocation", "talent.shrouded_suffocation"],
    ["variable.single_target", "variable.single_target"],
  ])("parses %s as a BOOLEAN atom keyed %s", (source, key) => {
    const ast = parse(source);
    const atom = atomOf(ast);
    expect(atom).not.toBeNull();
    expect(atom?.shape).toBe("BOOLEAN");
    expect(atom?.key).toBe(key);
  });

  it("parses the real pinned default[4] condition whole", () => {
    const loaded = pinnedAssassinationAuthority();
    if (!loaded.ok) return;
    const lookup = loaded.authority.actionsInList("default");
    if (!lookup.found) return;
    const ambush = lookup.actions.find((a) => a.priorityOrdinal === 4);
    expect(ambush?.actionToken).toBe("ambush");

    const condition = ambush?.conditionRaw ?? "";
    const ast = parse(condition);
    // Five distinct atoms, all boolean, in first-seen order.
    expect(collectAtomKeys(ast)).toEqual([
      "stealthed.rogue",
      "variable.single_target",
      "talent.blindside",
      "talent.improved_ambush",
      "talent.shrouded_suffocation",
    ]);
    expect(collectAtoms(ast).every((a) => a.shape === "BOOLEAN")).toBe(true);
  });
});

describe("the namespaces did NOT open", () => {
  it.each([
    // A talent RANK is a magnitude, not a truth.
    "talent.scent_of_blood.rank",
    "talent.scent_of_blood.rank>=2",
    // Other variables are not booleans. `trinket_sync_slot` is compared to 1/2.
    // RE-POINTED for M11-D3-C2: `variable.<name>` now reads the stored value
    // as a MAGNITUDE; a dotted property of one is still refused.
    "variable.trinket_sync_slot.value",
    "variable.trinket_sync_slot.value=1",
    "variable.base_trinket_condition.up",
    // Other stealth scopes denote DIFFERENT masks.
    "stealthed.all",
    "stealthed.basic",
    "stealthed.mantle",
    "stealthed.improved_garrote",
    // Adjacent identifiers that must stay refused.
    "spell_targets.fan_of_knives",
    // M5-C3a made BARE `pmultiplier` and BARE `remains` recognised — the acting
    // action's own DoT. The DOTTED forms name some OTHER action's DoT, which is
    // a different fact with no adapter behind it, and stay refused.
    "dot.garrote.pmultiplier",
    "dot.rupture.remains",
    "talent.",
    "variable.",
    "stealthed.",
  ])("still refuses %s", (source) => {
    const parsed = parseSimcExpression(source);
    expect(parsed.ok, `${source} should be refused`).toBe(false);
  });

  it("refuses the whole expression when one conjunct is a talent rank", () => {
    // Fail-closed is unchanged: a supported neighbour does not rescue it.
    const parsed = parseSimcExpression("talent.blindside&talent.scent_of_blood.rank>=2");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe("UNSUPPORTED_IDENTIFIER");
    expect(parsed.fragment).toBe("talent.scent_of_blood.rank");
  });
});

describe("correlation: the same fact gets the same world", () => {
  it("correlates repeated stealthed.rogue", () => {
    const ast = parse("stealthed.rogue&!stealthed.rogue");
    expect(collectAtomKeys(ast)).toEqual(["stealthed.rogue"]);
    const evaluated = evaluateSimcExpression(ast, "x", bindings());
    // `A & !A` is FALSE under BOTH assignments precisely because they correlate.
    expect(evaluated.outcome).toBe("RESOLVED");
    if (evaluated.outcome !== "RESOLVED") return;
    expect(evaluated.value).toBe(false);
    expect(evaluated.trace.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");
    expect(evaluated.trace.worlds).toHaveLength(2);
  });

  it("correlates repeated variable.single_target", () => {
    const ast = parse("variable.single_target&!variable.single_target");
    expect(collectAtomKeys(ast)).toEqual(["variable.single_target"]);
    const evaluated = evaluateSimcExpression(ast, "x", bindings());
    expect(evaluated.outcome).toBe("RESOLVED");
    if (evaluated.outcome !== "RESOLVED") return;
    expect(evaluated.value).toBe(false);
  });

  it("correlates the same talent and keeps different talents independent", () => {
    const same = parse("talent.blindside&!talent.blindside");
    expect(collectAtomKeys(same)).toEqual(["talent.blindside"]);
    const evaluatedSame = evaluateSimcExpression(same, "x", bindings());
    expect(evaluatedSame.outcome).toBe("RESOLVED");

    // Two DIFFERENT talents are two atoms and four worlds. If they shared a key,
    // `A & !B` would be unsatisfiable and come out FALSE.
    const different = parse("talent.blindside&!talent.improved_ambush");
    expect(collectAtomKeys(different)).toEqual(["talent.blindside", "talent.improved_ambush"]);
    const evaluatedDifferent = evaluateSimcExpression(different, "x", bindings());
    expect(evaluatedDifferent.outcome).toBe("UNRESOLVED");
    if (evaluatedDifferent.outcome === "UNSUPPORTED") return;
    expect(evaluatedDifferent.trace.worlds).toHaveLength(4);
  });

  it("keeps a talent atom distinct from a BUFF atom of the same name", () => {
    // `talent.blindside` is a static build fact; `buff.blindside.up` would be the
    // proc. Different spell ids, different facts, and they must not share a world.
    const ast = parse("talent.blindside&!buff.blindside.up");
    expect(collectAtomKeys(ast)).toEqual(["talent.blindside", "buff.blindside.up"]);
    const evaluated = evaluateSimcExpression(ast, "x", bindings());
    expect(evaluated.outcome).toBe("UNRESOLVED");
    if (evaluated.outcome === "UNSUPPORTED") return;
    expect(evaluated.trace.worlds).toHaveLength(4);
  });

  it("keeps stealthed.rogue distinct from every buff atom", () => {
    const ast = parse("stealthed.rogue&!buff.vanish.up");
    expect(collectAtomKeys(ast)).toEqual(["stealthed.rogue", "buff.vanish.up"]);
    expect(evaluateSimcExpression(ast, "x", bindings()).outcome).toBe("UNRESOLVED");
  });
});

describe("binding rules", () => {
  it("binds stealthed.rogue when it is established", () => {
    const ast = parse("stealthed.rogue");
    const evaluated = evaluateSimcExpression(ast, "x", bindings({ stealthedRogue: true }));
    expect(evaluated.outcome).toBe("RESOLVED");
    if (evaluated.outcome !== "RESOLVED") return;
    expect(evaluated.value).toBe(true);
    expect(evaluated.trace.aggregateRule).toBe("NO_UNRESOLVED_ATOMS");
  });

  it("enumerates stealthed.rogue when it is NOT established", () => {
    const evaluated = evaluateSimcExpression(parse("stealthed.rogue"), "x", bindings());
    expect(evaluated.outcome).toBe("UNRESOLVED");
    if (evaluated.outcome === "UNSUPPORTED") return;
    expect(evaluated.trace.atoms[0]?.binding).toBe("UNRESOLVED_BOOLEAN");
  });

  describe("stealthed.rogue is positive-only, structurally", () => {
    /**
     * Stealth is provable in ONE direction. A contributor observed ACTIVE proves
     * TRUE; nothing proves FALSE, because that needs four auras proven inactive
     * and silence across them establishes nothing.
     *
     * So `stealthedRogue` is typed `true`, not `boolean`. These tests pin both
     * locks: the type, and the `=== true` runtime guard behind it.
     */

    it("accepts the positive binding and marks the atom KNOWN", () => {
      const evaluated = evaluateSimcExpression(
        parse("stealthed.rogue"),
        "x",
        bindings({ stealthedRogue: true }),
      );
      expect(evaluated.outcome).toBe("RESOLVED");
      if (evaluated.outcome !== "RESOLVED") return;
      expect(evaluated.value).toBe(true);
      expect(evaluated.trace.atoms[0]?.binding).toBe("KNOWN");
      expect(evaluated.trace.atoms[0]?.value).toBe(1);
      expect(evaluated.trace.worlds).toHaveLength(1);
    });

    it("CANNOT express a false binding through the supported API", () => {
      // A compile-time guarantee, asserted where a reader will see it. The
      // declared type is the single literal `true`, so `{ stealthedRogue: false }`
      // does not type-check and `@ts-expect-error` is what proves it: if the type
      // were ever widened back to `boolean`, this line would become an UNUSED
      // expect-error and TypeScript would fail the build.
      // @ts-expect-error stealthedRogue is `true`, never `boolean` — FALSE is unrepresentable
      const illegal: AtomBindings = bindings({ stealthedRogue: false });
      expect(illegal).toBeDefined();
    });

    it("treats a cast-in false as UNBOUND, never as an authoritative FALSE", () => {
      // Defense in depth. The type already forbids this; the runtime guard is
      // what holds if an untyped caller or an unsafe cast gets past it.
      const forced = { ...bindings(), stealthedRogue: false } as unknown as AtomBindings;
      const evaluated = evaluateSimcExpression(parse("stealthed.rogue"), "x", forced);

      // Unbound, so enumerated — NOT resolved FALSE.
      expect(evaluated.outcome).toBe("UNRESOLVED");
      if (evaluated.outcome === "UNSUPPORTED") return;
      expect(evaluated.trace.atoms[0]?.binding).toBe("UNRESOLVED_BOOLEAN");
      expect(evaluated.trace.atoms[0]?.value).toBeNull();
      expect(evaluated.trace.worlds).toHaveLength(2);
      expect(evaluated.trace.worlds.map((world) => world.result).sort()).toEqual(["FALSE", "TRUE"]);
    });

    it("keeps the trace and the answer in agreement under a forced false", () => {
      // The two runtime sites — `resolveAtom` and `evaluateInWorld` — must use
      // the SAME test. If one accepted a cast-in false as KNOWN while the other
      // enumerated it, the trace would claim KNOWN while the worlds disagreed.
      const forced = { ...bindings(), stealthedRogue: false } as unknown as AtomBindings;
      const evaluated = evaluateSimcExpression(parse("stealthed.rogue&!stealthed.rogue"), "x", forced);
      // One correlated atom, two worlds, and `A & !A` is FALSE in both.
      expect(evaluated.outcome).toBe("RESOLVED");
      if (evaluated.outcome !== "RESOLVED") return;
      expect(evaluated.value).toBe(false);
      expect(evaluated.trace.atoms).toHaveLength(1);
      expect(evaluated.trace.atoms[0]?.binding).toBe("UNRESOLVED_BOOLEAN");
      expect(evaluated.trace.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");
    });

    it("does not let a forced false turn a conjunction FALSE on its own", () => {
      // The concrete danger: if `stealthedRogue: false` were honoured, this
      // conjunction would resolve FALSE from a claim nobody proved. It must stay
      // undecided instead.
      const forced = { ...bindings(), stealthedRogue: false } as unknown as AtomBindings;
      const evaluated = evaluateSimcExpression(parse("stealthed.rogue&talent.improved_ambush"), "x", {
        ...forced,
        knownTalents: [{ name: "improved_ambush", taken: true }],
      });
      expect(evaluated.outcome).toBe("UNRESOLVED");
    });
  });

  it("binds a known talent and enumerates an unknown one", () => {
    const known = evaluateSimcExpression(
      parse("talent.blindside"),
      "x",
      bindings({ knownTalents: [{ name: "blindside", taken: false }] }),
    );
    expect(known.outcome).toBe("RESOLVED");
    if (known.outcome !== "RESOLVED") return;
    expect(known.value).toBe(false);

    const unknown = evaluateSimcExpression(parse("talent.improved_ambush"), "x", bindings());
    expect(unknown.outcome).toBe("UNRESOLVED");
  });

  it("has NO binding field for variable.single_target at all", () => {
    // Structural, like `fight_remains`. Its value is a per-scan count of Fan of
    // Knives' target list, which Warcraft Logs cannot reconstruct. There is no
    // field to fill in, so no caller can supply a guess.
    const keys = Object.keys(bindings());
    expect(keys).not.toContain("variableSingleTarget");
    expect(keys).not.toContain("singleTarget");
    expect(keys).not.toContain("spellTargets");

    const evaluated = evaluateSimcExpression(parse("variable.single_target"), "x", bindings());
    expect(evaluated.outcome).toBe("UNRESOLVED");
    if (evaluated.outcome === "UNSUPPORTED") return;
    expect(evaluated.trace.atoms[0]?.binding).toBe("UNRESOLVED_BOOLEAN");
  });

  it("lets ONE false operand decide the whole conjunction despite an unknown", () => {
    // The rule the Ambush verdict rests on, tested directly rather than through
    // the gate. Nothing about Ambush is special-cased.
    const ast = parse("variable.single_target&talent.improved_ambush");
    const evaluated = evaluateSimcExpression(
      ast,
      "x",
      bindings({ knownTalents: [{ name: "improved_ambush", taken: false }] }),
    );
    expect(evaluated.outcome).toBe("RESOLVED");
    if (evaluated.outcome !== "RESOLVED") return;
    expect(evaluated.value).toBe(false);
    expect(evaluated.trace.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");
  });

  it("requires every operand TRUE for the conjunction to be TRUE", () => {
    const ast = parse("stealthed.rogue&talent.blindside&talent.improved_ambush");
    const allTrue = evaluateSimcExpression(
      ast,
      "x",
      bindings({
        stealthedRogue: true,
        knownTalents: [
          { name: "blindside", taken: true },
          { name: "improved_ambush", taken: true },
        ],
      }),
    );
    expect(allTrue.outcome).toBe("RESOLVED");
    if (allTrue.outcome !== "RESOLVED") return;
    expect(allTrue.value).toBe(true);
  });
});

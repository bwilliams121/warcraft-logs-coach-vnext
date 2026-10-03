/**
 * M11-A1: the shared parser's built-in identifier surface is FROZEN.
 *
 * WHY THIS LIST IS PINNED, AND WHY IT IS NOT BEING CLEANED UP
 *
 * `src/simc/expression/parse.ts` recognises a fixed set of identifiers as
 * built-in atoms. Several of them are historically Assassination-shaped —
 * `combo_points`, `energy.pct`, `stealthed.rogue`, `variable.single_target`,
 * the bare `remains` / `pmultiplier` / `refreshable` of the acting action's
 * own DoT — because the first vertical slice grew the parser one pinned line
 * at a time before the specialization vocabulary seam existed. They are NOT
 * being moved into a Rogue vocabulary here: every one of them sits on a path
 * an Assassination verdict rests on, and M11 requires Assassination to remain
 * byte-identical. Moving them would be a behaviour-risking refactor with no
 * gameplay benefit.
 *
 * What M11 requires instead is that the surface stop growing by accident. A
 * new specialization's identifiers enter through `SpecAtomVocabulary`
 * (`spec-vocabulary.ts`), declared by the specialization that owns them,
 * matched only after every built-in has been tried, and unable to shadow one.
 * Teaching the shared parser a new name — `holy_power`, `rage`,
 * `active_enemies`, `variable.<anything else>` — is how a shared engine quietly
 * learns what a class is, and it is refused here rather than in review.
 *
 * TWO INDEPENDENT PINS
 *
 *   1. BEHAVIOURAL. Every built-in identifier is parsed and its node kind is
 *      asserted; every pattern family is probed with an arbitrary name; and a
 *      long list of plausible neighbours — the identifiers later specs will
 *      want — is asserted to be REFUSED whole. Adding a built-in makes a
 *      refusal pass; removing one makes a parse fail.
 *   2. STRUCTURAL. The source of `builtinIdentifier` in `parse.ts` is read
 *      and the set of node kinds it can return, and the set of anchored
 *      pattern constants it consults, are pinned exactly. A built-in added
 *      without a probe above still fails this pin, so the two lists cannot
 *      drift apart silently.
 *
 * WHAT THIS DOES NOT DO
 *
 * It changes no parser behaviour, adds no atom, moves no identifier and does
 * not touch evaluation. Recognition never conferred knowledge (an unbound
 * built-in is enumerated or UNKNOWN_NUMBER), and that is unchanged too.
 */

import { describe, expect, it } from "vitest";

import { isBuiltinIdentifier, parseSimcExpression } from "../../src/simc/expression/parse.js";
import { defineSpecAtomVocabulary } from "../../src/simc/expression/spec-vocabulary.js";

const PARSE_SOURCE: Record<string, string> = import.meta.glob("../../src/simc/expression/parse.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

// ---------------------------------------------------------------------------
// The frozen surface
// ---------------------------------------------------------------------------

/** Exact-match built-ins: identifier -> node kind. Reviewed; not derived. */
const EXACT_BUILTINS = Object.freeze({
  combo_points: "COMBO_POINTS",
  "combo_points.deficit": "COMBO_POINTS_DEFICIT",
  "energy.pct": "ENERGY_PCT",
  fight_remains: "FIGHT_REMAINS",
  "target.time_to_die": "TARGET_TIME_TO_DIE",
  "stealthed.rogue": "STEALTHED_ROGUE",
  "variable.single_target": "VARIABLE_SINGLE_TARGET",
  pmultiplier: "DOT_PMULTIPLIER",
  remains: "DOT_REMAINS",
  refreshable: "DOT_REFRESHABLE",
} as const);

/**
 * Pattern built-ins: family -> [probe identifier, node kind, captured-name
 * field]. The probe name is arbitrary so the test proves the PATTERN, not a
 * pinned aura or talent.
 */
const PATTERN_BUILTINS = Object.freeze({
  TALENT: ["talent.zz_probe_talent", "TALENT", "talentName", "zz_probe_talent"],
  BUFF_UP: ["buff.zz_probe_buff.up", "BUFF_UP", "buffName", "zz_probe_buff"],
  BUFF_REMAINS: ["buff.zz_probe_buff.remains", "BUFF_REMAINS", "buffName", "zz_probe_buff"],
  BUFF_STACK: ["buff.zz_probe_buff.stack", "BUFF_STACK", "buffName", "zz_probe_buff"],
  BUFF_REACT: ["buff.zz_probe_buff.react", "BUFF_REACT", "buffName", "zz_probe_buff"],
  DEBUFF_UP: ["debuff.zz_probe_debuff.up", "DEBUFF_UP", "debuffName", "zz_probe_debuff"],
  DOT_TICKING: ["dot.zz_probe_dot.ticking", "DOT_TICKING", "dotName", "zz_probe_dot"],
  COOLDOWN_REMAINS: ["cooldown.zz_probe_cd.remains", "COOLDOWN_REMAINS", "cooldownName", "zz_probe_cd"],
} as const);

/** Every atom kind the built-in reader can produce. Exact and exhaustive. */
const BUILTIN_NODE_KINDS = Object.freeze(
  [...Object.values(EXACT_BUILTINS), ...Object.values(PATTERN_BUILTINS).map((entry) => entry[1])].sort(),
);

/**
 * Identifiers that are NOT built-ins and must stay that way. Each is either a
 * neighbour of a built-in (a namespace the built-in deliberately does not
 * open) or an identifier a later specialization will want — which must arrive
 * through that specialization's vocabulary, never here.
 */
const FROZEN_NON_BUILTINS = Object.freeze([
  // namespaces the built-ins do not open
  "combo_points.max",
  "energy",
  "energy.regen",
  "energy.base_deficit",
  "energy.time_to_max",
  "stealthed.all",
  "stealthed.basic",
  "stealthed.mantle",
  "buff.zz_probe_buff.down",
  "buff.zz_probe_buff.duration",
  "buff.zz_probe_buff.max_stack",
  "buff.zz_probe_buff.value",
  "debuff.zz_probe_debuff.remains",
  "debuff.zz_probe_debuff.stack",
  "debuff.zz_probe_debuff.react",
  "dot.zz_probe_dot.remains",
  "dot.zz_probe_dot.refreshable",
  "dot.zz_probe_dot.pmultiplier",
  "cooldown.zz_probe_cd.ready",
  "cooldown.zz_probe_cd.up",
  "cooldown.zz_probe_cd.charges",
  "cooldown.zz_probe_cd.duration",
  "cooldown.zz_probe_cd.full_recharge_time",
  "talent.zz_probe_talent.rank",
  "talent.zz_probe_talent.enabled",
  "target.health.pct",
  "target.time_to_pct_20",
  // resources and state other specializations read
  "holy_power",
  "holy_power.deficit",
  "rage",
  "rage.deficit",
  "runic_power",
  "rune",
  "focus",
  "fury",
  "maelstrom",
  "maelstrom_weapon",
  "soul_shard",
  "insanity",
  "astral_power",
  "chi",
  "essence",
  "arcane_charges",
  "mana.pct",
  // engine concepts M11 must gate separately, never admit here
  "active_enemies",
  "spell_targets.zz_probe_spell",
  "raid_event.adds.exists",
  "raid_event.adds.in",
  "desired_targets",
  "cycle_enemies",
  "prev_gcd.1.zz_probe",
  "prev.1.zz_probe",
  "charges",
  "charges_fractional",
  "full_recharge_time",
  "gcd",
  "gcd.max",
  "gcd.remains",
  "time",
  "action.zz_probe.execute_time",
  "equipped.zz_probe_item",
  "trinket.1.has_buff.strength",
  "set_bonus.tww3_4pc",
  "hero_tree.zz_probe",
  "pet.main.buff.zz_probe.up",
  "cp_max_spend",
  "rtb_buffs",
  "consecration.up",
  "next_armament",
] as const);

// ---------------------------------------------------------------------------
// 1. Behavioural pin
// ---------------------------------------------------------------------------

describe("every exact built-in parses to its pinned node kind", () => {
  it.each(Object.entries(EXACT_BUILTINS))("%s -> %s", (identifier, kind) => {
    expect(isBuiltinIdentifier(identifier)).toBe(true);
    const parsed = parseSimcExpression(identifier);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.ast.kind).toBe(kind);
  });
});

describe("every pattern built-in parses an arbitrary name to its pinned node kind", () => {
  it.each(Object.entries(PATTERN_BUILTINS))("%s", (_family, [identifier, kind, field, name]) => {
    expect(isBuiltinIdentifier(identifier)).toBe(true);
    const parsed = parseSimcExpression(identifier);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.ast.kind).toBe(kind);
      expect((parsed.ast as unknown as Record<string, unknown>)[field]).toBe(name);
    }
  });
});

describe("a generic variable read is not a built-in (M11-D3-C2)", () => {
  // RE-POINTED from the frozen list below. These two were frozen as
  // identifiers "a later specialization will want, through its vocabulary".
  // M11-D3-C2 executes the authority's own `variable` lines, so a read of a
  // variable nobody owns parses as a VARIABLE_READ — and it is STILL not a
  // built-in, so a specialization can still declare, and then own, either one.
  it.each(["variable.finish_condition", "variable.trinket_priority"])("%s", (identifier) => {
    expect(isBuiltinIdentifier(identifier)).toBe(false);
    const parsed = parseSimcExpression(identifier);
    expect(parsed.ok && parsed.ast.kind).toBe("VARIABLE_READ");
    // A dotted property of one is still refused.
    expect(parseSimcExpression(`${identifier}.value`).ok).toBe(false);
  });
});

describe("the frozen non-built-ins stay refused, whole", () => {
  it.each(FROZEN_NON_BUILTINS)("%s", (identifier) => {
    expect(isBuiltinIdentifier(identifier)).toBe(false);
    const parsed = parseSimcExpression(identifier);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reason).toBe("UNSUPPORTED_IDENTIFIER");
      expect(parsed.fragment).toBe(identifier);
    }
    // And inside a conjunction: an unrecognised fragment refuses the WHOLE
    // expression, so a built-in beside it does not rescue it.
    const inside = parseSimcExpression(`combo_points>=5&${identifier}`);
    expect(inside.ok).toBe(false);
  });

  it("the two lists are disjoint, so a probe cannot be pinned both ways", () => {
    const builtins = new Set<string>([
      ...Object.keys(EXACT_BUILTINS),
      ...Object.values(PATTERN_BUILTINS).map((entry) => entry[0]),
    ]);
    for (const identifier of FROZEN_NON_BUILTINS) expect(builtins.has(identifier), identifier).toBe(false);
  });
});

describe("the only door for a new identifier is a specialization vocabulary", () => {
  it("a vocabulary may declare an identifier the parser refuses, and the parse then succeeds", () => {
    const vocabulary = defineSpecAtomVocabulary(
      "test/frozen-surface",
      [{ identifier: "holy_power", shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false }],
      isBuiltinIdentifier,
    );
    expect(parseSimcExpression("holy_power>=3").ok).toBe(false);
    const declared = parseSimcExpression("holy_power>=3", vocabulary);
    expect(declared.ok).toBe(true);
  });

  it("a vocabulary cannot shadow any built-in, exact or patterned", () => {
    for (const identifier of [
      ...Object.keys(EXACT_BUILTINS),
      ...Object.values(PATTERN_BUILTINS).map((entry) => entry[0]),
    ]) {
      expect(
        () =>
          defineSpecAtomVocabulary(
            "test/frozen-surface",
            [{ identifier, shape: "BOOLEAN", scope: "PLAYER_SCOPED", selfAddressing: false }],
            isBuiltinIdentifier,
          ),
        identifier,
      ).toThrow(/SHADOWS_BUILTIN_IDENTIFIER/);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Structural pin, read from the parser's own source
// ---------------------------------------------------------------------------

function builtinReaderSource(): string {
  const source = PARSE_SOURCE["../../src/simc/expression/parse.ts"];
  if (source === undefined) throw new Error("parse.ts source was not captured");
  const start = source.indexOf("function builtinIdentifier(");
  const end = source.indexOf("export function isBuiltinIdentifier(");
  if (start < 0 || end < 0 || end <= start) throw new Error("builtinIdentifier block not found in parse.ts");
  // Comments stripped: the pin is on what the reader RETURNS, not on prose.
  return source
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the built-in reader in parse.ts returns exactly the pinned kinds", () => {
  it("the set of node kinds it can construct equals the frozen list", () => {
    const kinds = [...builtinReaderSource().matchAll(/kind:\s*"([A-Z_]+)"/g)]
      .map((match) => match[1] ?? "")
      .filter((kind) => kind.length > 0);
    expect([...new Set(kinds)].sort()).toEqual(BUILTIN_NODE_KINDS);
  });

  it("the set of anchored pattern constants it consults equals the frozen families", () => {
    const consulted = [...builtinReaderSource().matchAll(/\b([A-Z_]+)\.exec\(raw\)/g)]
      .map((match) => match[1] ?? "")
      .filter((name) => name.length > 0);
    expect([...new Set(consulted)].sort()).toEqual([...Object.keys(PATTERN_BUILTINS)].sort());
  });

  it("every exact built-in is compared literally, once", () => {
    const body = builtinReaderSource();
    for (const identifier of Object.keys(EXACT_BUILTINS)) {
      const occurrences = body.split(`raw === "${identifier}"`).length - 1;
      expect(occurrences, identifier).toBe(1);
    }
    // And no OTHER literal comparison exists: the exact list is the whole list.
    const literals = [...body.matchAll(/raw === "([^"]+)"/g)].map((match) => match[1] ?? "");
    expect([...literals].sort()).toEqual([...Object.keys(EXACT_BUILTINS)].sort());
  });
});

// ---------------------------------------------------------------------------
// The literal grammar (M11-B3)
// ---------------------------------------------------------------------------
//
// M11-B3 admitted ONE literal form — digits '.' digits — as a reviewed
// exception for SYNTAX, not a built-in. This block pins that the exception is
// exactly that wide: an integer and a decimal are the same NUMBER node, no
// identifier, operator, node kind or vocabulary door moved, and every other
// numeric shape (empty fraction, leading point, second point, exponent,
// negative) is still refused whole. Widening any of these is a visible
// change to this file, reviewed like a built-in addition.

describe("the literal grammar is frozen at digits '.' digits (M11-B3)", () => {
  it("an integer and a decimal both parse to NUMBER, and NUMBER is not a built-in identifier kind", () => {
    for (const [source, value] of [
      ["42", 42],
      ["1.5", 1.5],
    ] as const) {
      const parsed = parseSimcExpression(source);
      expect(parsed.ok && parsed.ast).toEqual({ kind: "NUMBER", value });
    }
    expect(BUILTIN_NODE_KINDS).not.toContain("NUMBER");
    expect(isBuiltinIdentifier("1.5")).toBe(false);
  });

  it("every other numeric shape is refused whole under an existing reason", () => {
    for (const [source, reason] of [
      ["1.", "UNSUPPORTED_NUMERIC_LITERAL"],
      ["1.5.5", "UNSUPPORTED_NUMERIC_LITERAL"],
      [".5", "UNEXPECTED_CHARACTER"],
      ["1e3", "TRAILING_INPUT"],
      ["-1.5", "UNSUPPORTED_OPERATOR"],
    ] as const) {
      const parsed = parseSimcExpression(source);
      expect(parsed.ok, source).toBe(false);
      if (!parsed.ok) expect(parsed.reason, source).toBe(reason);
    }
  });

  it("the number reader consults only digits and one point: no exponent, sign or hex branch exists in it", () => {
    const source = Object.values(PARSE_SOURCE)[0] ?? "";
    const start = source.indexOf("function parseNumber(");
    const end = source.indexOf("function parsePrimary(");
    expect(start).toBeGreaterThan(0);
    const body = source.slice(start, end);
    expect(body).not.toMatch(/[eE]xponent|"e"|"E"|"x"|"X"|"-"|"\+"|parseFloat\(.*[eE]/);
    expect(body.split('=== "."').length - 1).toBeGreaterThanOrEqual(1);
  });
});

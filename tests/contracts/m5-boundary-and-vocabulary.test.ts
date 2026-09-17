import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ACTIONABILITY_STATUSES } from "../../src/findings/actionability.js";

/**
 * The M5 layer boundary, swept mechanically.
 *
 * M4 has `tests/contracts/m4-state-vocabulary.test.ts`, which bans
 * decision-authority vocabulary across ALL of `src/engine`. That contract is
 * deliberately left intact and unexempted: findings live in `src/findings`
 * precisely so the engine sweep never needs a hole cut in it.
 *
 * What this file protects is the other direction — the ways M5 could quietly
 * undo an M3/M4 guarantee or reintroduce a rejected shortcut:
 *
 *     name-based ability matching        the identity failure
 *     a hard-coded resource wire type    the magic-constant failure
 *     delta replay or stale state        the invented-state failure
 *     an actionability default           the fail-open failure
 *     a positive gameplay verdict        the unearned-certainty failure
 *     engine depending on findings       the layering failure
 */

function filesUnder(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: false })
    .map((entry) => `${root}/${String(entry).replace(/\\/g, "/")}`)
    .filter((path) => statSync(path).isFile() && path.endsWith(".ts"));
}

/** Source with comments stripped: the prohibition is on CODE, and the doc comments must name what they forbid. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const M5_ROOTS = ["src/findings", "src/simc", "src/specs", "src/data"];
const M5_FILES = M5_ROOTS.flatMap(filesUnder);
const ENGINE_FILES = filesUnder("src/engine");

describe("the sweep has something to sweep", () => {
  it("finds M5 sources under every declared root", () => {
    expect(M5_FILES.length).toBeGreaterThan(0);
    for (const root of M5_ROOTS) {
      expect(filesUnder(root).length, `${root} is empty`).toBeGreaterThan(0);
    }
  });

  it("keeps findings out of the engine tree", () => {
    // src/engine owns factual and derived state. Findings are downstream
    // interpretive judgments, and separating them is what lets the M4
    // vocabulary contract stay absolute.
    expect(existsSync("src/engine/findings")).toBe(false);
    expect(existsSync("src/findings")).toBe(true);
  });
});

describe("layering is one-way", () => {
  it("never lets the engine depend on M5", () => {
    for (const path of ENGINE_FILES) {
      const code = codeOf(path);
      for (const forbidden of ["/findings/", "/simc/", "/specs/", "/data/game/", "/data/wcl-wire/"]) {
        expect(code, `${path} imports ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("never lets shared findings depend on a specialization", () => {
    for (const path of filesUnder("src/findings")) {
      expect(codeOf(path), `${path} imports a spec`).not.toContain("/specs/");
    }
  });

  it("never lets SimulationCraft code depend on Warcraft Logs or a specialization", () => {
    for (const path of filesUnder("src/simc")) {
      const code = codeOf(path);
      expect(code, `${path} imports a spec`).not.toContain("/specs/");
      expect(code, `${path} imports the WCL layer`).not.toContain("/wcl/");
    }
  });

  it("never lets M5 reach raw Warcraft Logs payloads", () => {
    for (const path of M5_FILES) {
      const code = codeOf(path);
      expect(code, `${path} imports raw retrieval types`).not.toContain("retrieval-types.js");
      expect(code, `${path} imports the events query`).not.toContain("events-query.js");
      expect(code, `${path} imports the paginator`).not.toContain("paginator.js");
    }
  });
});

describe("ability identity is numeric, never a name", () => {
  it("declares the Envenom spell id in exactly one module", () => {
    const declaring = filesUnder("src").filter((path) => codeOf(path).includes("32645"));
    expect(declaring).toEqual(["src/data/game/rogue-abilities.ts"]);
  });

  it("never compares a Warcraft Logs ability name", () => {
    for (const path of M5_FILES) {
      const code = codeOf(path);
      for (const forbidden of [
        "ability.name ===",
        '.name === "Envenom"',
        // Compared against a STRING LITERAL. `displayNameEn === null` is a
        // validator null-check, not a name lookup, and banning it would have
        // pushed artifact validation into accepting an unvalidated field.
        'displayNameEn === "',
        "abilities.get(",
        "nameToAbility",
      ]) {
        expect(code, `${path} matches on a name`).not.toContain(forbidden);
      }
      expect(code, `${path} regex-matches an ability name`).not.toMatch(/\/envenom\/i/);
    }
  });
});

describe("the resource wire type is never a magic constant", () => {
  it("declares the wire contract in exactly one module", () => {
    const declaring = filesUnder("src").filter((path) => /RESOURCE_WIRE_CONTRACTS\s*:/.test(codeOf(path)));
    expect(declaring).toEqual(["src/data/wcl-wire/resource-types.ts"]);
  });

  it("never passes a numeric literal as a resource type", () => {
    for (const path of M5_FILES) {
      expect(codeOf(path), `${path} calls observationOnEvent with a literal resource type`).not.toMatch(
        /observationOnEvent\([^)]*,\s*\d+\s*\)/,
      );
    }
  });

  it("resolves the wire type through the gated accessor", () => {
    const evaluator = codeOf("src/specs/rogue/assassination/evaluator.ts");
    expect(evaluator).toContain("resourceWireTypeFor");
  });
});

describe("M5 invents no combat state", () => {
  it("never replays resource changes or reads stale values", () => {
    for (const path of M5_FILES) {
      const code = codeOf(path);
      // Identifier names, not substrings: a provenance note is allowed to use
      // an English word that happens to contain a banned identifier.
      for (const forbidden of [
        "latestObservedAtOrBefore",
        "standaloneChangeOnEvent",
        "standaloneChangePositionsFor",
        "resourceChange",
        "replayChanges",
        "regenRate",
        "regenerationModel",
        "energyPerSecond",
        "interpolateAmount",
        "projectedAmount",
      ]) {
        expect(code, `${path} mentions ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  /**
   * NARROWED for M5-C2, WIDENED BY ONE MODULE for M5-C3a, invariant unchanged.
   *
   * M5-B banned every aura read outright, with the stated purpose "so no absence
   * can become inactivity". M5-C2 has to read aura state — `stealthed.rogue` is
   * a positive fact about four specific buffs — so a blanket ban would have had
   * to be deleted. Deleting it would have thrown away the guarantee along with
   * the mechanism.
   *
   * So the ban is narrowed to its purpose instead:
   *
   *   1. only DECLARED modules may query aura state
   *   2. each declared module must be structurally incapable of converting an
   *      absence into the claim its own expression makes
   *
   * M5-C3a adds the second declared module. `remains` is a MAGNITUDE, so its
   * failure mode is different in kind from stealth's: the danger is not a false
   * FALSE but a fabricated NUMBER. Each module therefore gets its own structural
   * test below, matched to what it could actually get wrong.
   *
   * Adding a module here is meant to be deliberate. The list is short, every
   * entry must still read aura state, and each needs a companion test — so
   * growing it is work rather than a one-line exemption.
   */
  const AURA_READING_MODULES = [
    "src/specs/rogue/assassination/stealth-state.ts",
    // Renamed at M5-D1 from `garrote-dot-state.ts` when the derivation became
    // per-action. Same module, same exemption, same companion test below.
    "src/specs/rogue/assassination/dot-remains-state.ts",
    // M5-D1. Reads ONE aura fact — is a debuff this player applied ACTIVE on the
    // enemy right now — to establish that a living enemy is engaged. It cannot
    // produce a duration or a count; its companion test below pins that.
    "src/specs/rogue/assassination/combat-engagement.ts",
    // M10-C5 Phase A. The Protection Paladin's ONE buff atom, read from a
    // single pinned identity through `presenceAt`. Unlike stealth it may bind
    // FALSE — but only from M4's EXACT INACTIVE, which rests on an OBSERVED
    // removal under coverage, never from silence; its companion test below
    // pins that the UNKNOWN branch binds nothing.
    "src/specs/paladin/protection/aura-bindings.ts",
  ] as const;

  const AURA_READING_MODULE = AURA_READING_MODULES[0];

  it("reads aura state only in declared modules", () => {
    const declared = new Set<string>(AURA_READING_MODULES);
    for (const path of M5_FILES) {
      if (declared.has(path)) continue;
      const code = codeOf(path);
      for (const forbidden of ["presenceAt", "lastObservedTransition", "anySource(", "fromSource("]) {
        expect(code, `${path} queries aura state`).not.toContain(forbidden);
      }
    }
    // Every exemption must be load-bearing, not stale: a declared module that
    // stops reading aura state should be removed from the list rather than left
    // as a hole someone else can grow into.
    for (const path of AURA_READING_MODULES) {
      expect(codeOf(path), `${path} no longer reads aura state`).toContain("presenceAt");
    }
  });

  it("constructs no placeholder magnitude for an unestablished resource", () => {
    // M5-C3b's hardening rule, swept across every M5 source.
    //
    // `AtomBindings` carries every magnitude as a `NumericBinding`, so an
    // unavailable one has an honest representation and nothing needs to invent a
    // number. The prohibition is on the two shapes that would put one back: a
    // bare zero bound to a resource field, and a `?? 0` fallback behind one.
    //
    // The rule this enforces is stronger than "the result is discarded if the
    // fake value mattered". An unestablished fact must never ENTER authority
    // evaluation as a magnitude at all, because by the time a post-hoc check
    // runs it has already participated in control flow.
    for (const path of M5_FILES) {
      const code = codeOf(path);
      for (const forbidden of [
        "comboPoints: 0",
        "comboPointsDeficit: 0",
        "comboPoints: 5",
        "comboPoints: 7",
        "UNESTABLISHED_COMBO_POINTS",
      ]) {
        expect(code, `${path} binds a placeholder magnitude (${forbidden})`).not.toContain(forbidden);
      }
    }
  });

  it("keeps every magnitude binding a NumericBinding, so unknown is always sayable", () => {
    // Structural: if a magnitude field were a plain number again, a caller with
    // no observation would be forced to invent one. This is what makes the
    // prohibition above enforceable rather than merely stated.
    const evaluate = codeOf("src/simc/expression/evaluate.ts");
    for (const field of ["comboPoints", "comboPointsDeficit", "energyPct"]) {
      expect(evaluate, `${field} is not a NumericBinding`).toContain(`readonly ${field}: NumericBinding;`);
    }
    // M5-D1 replaced the scalar `dotRemainsSeconds` with a per-action map, so the
    // magnitude now sits one level in. The guarantee is unchanged and the shape
    // is checked in its new place: still a `NumericBinding`, never a number.
    expect(evaluate).toContain("readonly remainsSeconds: NumericBinding;");
    expect(evaluate).not.toContain("readonly remainsSeconds: number;");
    // And the scalar must not come back: one shared remainder is what let
    // Rupture's `remains` read Garrote's.
    expect(evaluate).not.toContain("readonly dotRemainsSeconds:");
    expect(evaluate).not.toContain("readonly comboPoints: number;");
    expect(evaluate).not.toContain("readonly comboPointsDeficit: number;");
  });

  it("still lets no absence become a duration: the DoT reader cannot invent a number", () => {
    // The magnitude counterpart to the stealth test below. `presenceAt` can
    // return INACTIVE and can return UNKNOWN, and NEITHER may become a
    // remaining duration — a DoT that is absent has no remainder, and clamping
    // one to zero would satisfy every `remains<=` threshold in the pinned APL.
    const code = codeOf("src/specs/rogue/assassination/dot-remains-state.ts");

    // The number lives on the KNOWN variant alone. The UNKNOWN variant has no
    // field that could carry one.
    expect(code).toContain('readonly state: "KNOWN"');
    expect(code).toContain('readonly state: "UNKNOWN"');
    expect(code).toContain("readonly remainsSeconds: number;");
    // No default, no clamp, no fallback.
    expect(code).not.toContain("remainsSeconds: 0");
    expect(code).not.toContain("remainsMs: 0");
    expect(code).not.toContain("Math.max(0");
    expect(code).not.toContain("?? 0");
  });

  it("still lets no absence become an enemy claim: the engagement reader proves only presence", () => {
    // M5-D1's companion test for the third declared aura reader. The danger here
    // is neither a false FALSE nor a fabricated number — it is a COUNT. An
    // engagement proof that could say "there are N enemies" would be
    // `spell_targets.fan_of_knives` by another name, which M5-D deliberately
    // does not support.
    const code = codeOf("src/specs/rogue/assassination/combat-engagement.ts");

    // It reports ONE enemy id, and only from a PROVEN ACTIVE presence.
    expect(code).toContain('presence.value.presence !== "ACTIVE"');
    expect(code).toContain("readonly enemyActorId: number;");
    // No count, no list, no target enumeration.
    expect(code).not.toContain("enemyCount");
    expect(code).not.toContain("activeEnemies");
    expect(code).not.toContain("spell_targets");
    // And the negative direction is unspellable: the union has ENGAGED and
    // UNKNOWN, and no member that asserts an absence of enemies.
    expect(code).toContain('readonly state: "ENGAGED"');
    expect(code).toContain('readonly state: "UNKNOWN"');
    expect(code).not.toContain('"NO_ENEMY"');
    expect(code).not.toContain('state: "DISENGAGED"');
  });

  it("still lets no silence become inactivity: the Protection aura reader binds only from an EXACT M4 answer", () => {
    // M10-C5's companion test for the fourth declared aura reader. It reads
    // ONE pinned identity per atom and binds `up` from M4's presence, which is
    // ACTIVE or INACTIVE only from an observed transition. Anything short of
    // EXACT is UNBOUND — there is no path from "no transition seen" to FALSE.
    const code = codeOf("src/specs/paladin/protection/aura-bindings.ts");
    expect(code).toContain('if (result.certainty !== "EXACT")');
    expect(code).toContain('state: "UNBOUND"');
    expect(code).toContain('up: result.value.presence === "ACTIVE"');
    // FALSE is never spelled as a literal binding; it only ever comes from the
    // EXACT presence comparison above.
    expect(code).not.toMatch(/up:\s*false/);
    // One identity, one anchor; no count, no enumeration of contributors.
    expect(code).toContain("readonly anchorPosition: number;");
    expect(code).not.toContain("contributors");
    expect(code).not.toContain("spell_targets");
  });

  it("still lets no absence become inactivity: the aura reader cannot say FALSE", () => {
    const code = codeOf(AURA_READING_MODULE);
    // The binding union has TRUE and UNKNOWN and no third member. A negative
    // stealth claim is unspellable rather than merely discouraged.
    expect(code).toContain('readonly value: "TRUE"');
    expect(code).toContain('readonly value: "UNKNOWN"');
    expect(code).not.toContain('value: "FALSE"');
    expect(code).not.toContain('"NOT_STEALTHED"');
    // And it never binds the expression atom from a non-proof.
    expect(code).not.toContain("stealthedRogue: false");
  });

  it("types the stealth binding as `true`, so FALSE is unrepresentable downstream", () => {
    // The reader above cannot PRODUCE a negative claim. This is the other half:
    // the expression binding surface cannot ACCEPT one either, from any caller.
    //
    // `stealthedRogue?: boolean` would compile and would be honoured as a KNOWN
    // FALSE — a claim nothing in this project can evidence. The single-literal
    // type makes it a compile error instead.
    const evaluate = codeOf("src/simc/expression/evaluate.ts");
    expect(evaluate).toContain("readonly stealthedRogue?: true;");
    expect(evaluate).not.toContain("readonly stealthedRogue?: boolean");

    // Defense in depth: both runtime sites test `=== true` rather than
    // `!== undefined`, so a value forced through an unsafe cast falls through to
    // the enumerated world instead of becoming authoritative.
    expect(evaluate).not.toContain("bindings.stealthedRogue !== undefined");
    expect(evaluate.match(/bindings\.stealthedRogue === true/g) ?? []).toHaveLength(2);
  });

  it("never lets an INACTIVE aura reading escape as a bound expression atom", () => {
    // `presenceAt` CAN return INACTIVE. The binder must treat that exactly like
    // UNKNOWN — one contributor being off proves nothing about the other three.
    const code = codeOf(AURA_READING_MODULE);
    expect(code).toContain('outcome: "INACTIVE"');
    // INACTIVE appears only as a recorded observation in the UNKNOWN branch,
    // never as a value the binding resolves to.
    expect(code).not.toMatch(/value:\s*"INACTIVE"/);
  });

  it("never indexes the canonical event array by an ingestion ordinal", () => {
    for (const path of M5_FILES) {
      const code = codeOf(path);
      expect(code, `${path} indexes events directly`).not.toMatch(/events\[/);
      expect(code, `${path} uses an ingestion ordinal as an index`).not.toMatch(
        /\[\s*\w*[iI]ngestionOrdinal\s*\]/,
      );
    }
  });
});

describe("M5 forms no unearned verdict", () => {
  it("declares no positive gameplay status", () => {
    // NARROWED AT M5-E, and narrowed in exactly one place. `"MATCH"` is now a
    // legitimate member of the OBSERVED-ACTION COMPARISON vocabulary, which is a
    // different claim from a gameplay verdict: it says the authority selection
    // agreed with the observed token, and it is defined and tested as carrying
    // no correctness meaning.
    //
    // Everything else stays absolute everywhere, and `"MATCH"` stays banned
    // outside the two comparison modules — including in the judgment layer,
    // which the block below re-asserts on its own terms.
    const COMPARISON_LAYER = [
      "src/specs/rogue/assassination/observed-comparison.ts",
      "src/specs/rogue/assassination/observed-analysis.ts",
      // M10-C: the comparison rule is shared, and the second specialization's
      // facade and domain vocabulary carry the same defined-and-tested word.
      "src/findings/observed-comparison.ts",
      "src/specs/paladin/protection/observed-analysis.ts",
      "src/specs/paladin/protection/domains.ts",
    ];
    for (const path of M5_FILES) {
      const code = codeOf(path);
      const forbidden = [
        '"CORRECT"',
        '"OPTIMAL"',
        '"APPROVED"',
        "wasCorrect",
        "isOptimal",
        "expectedAction",
        "idealAction",
      ];
      if (!COMPARISON_LAYER.includes(path)) forbidden.push('"MATCH"');
      for (const word of forbidden) {
        expect(code, `${path} declares ${word}`).not.toContain(word);
      }
    }
  });

  it("keeps the observed-action JUDGMENT free of any positive verdict", () => {
    // The rule M5-A rests on, restated so narrowing the sweep above cannot
    // erode it. A false gate proves unreachability; a satisfiable one proves
    // almost nothing, so this layer has no positive status to offer.
    const judgment = codeOf("src/findings/judgment.ts");
    for (const forbidden of ['"MATCH"', '"CORRECT"', '"OPTIMAL"', '"APPROVED"', '"COMPATIBLE"']) {
      expect(judgment, `judgment.ts declares ${forbidden}`).not.toContain(forbidden);
    }
    expect(judgment).toContain('"REJECTED_BY_AUTHORITY" | "UNKNOWN" | "NO_AUTHORITY_AVAILABLE"');
  });

  it("introduces no subjective confidence scale", () => {
    for (const path of M5_FILES) {
      const code = codeOf(path);
      for (const forbidden of ["confidence", "severity", '"HIGH"', '"MEDIUM"', '"LOW"']) {
        expect(code, `${path} declares ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  /**
   * RE-POINTED for M5-B, and deliberately no longer load-bearing on a substring.
   *
   * The previous version asserted that no M5 file contained the literal
   * `"ACTIONABLE"`. That would have passed for
   * `"PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION"` only because the character before
   * `ACTIONABLE` is an underscore rather than a quote — an accident of spelling,
   * not a decision. The same accident would have let `"NEVER_ACTIONABLE"` and
   * `"NOT_YET_ACTIONABLE"` through, which is exactly what the rule exists to
   * stop.
   *
   * So the guarantee is asserted STRUCTURALLY over the exported union, which no
   * prefix can evade. The substring sweeps are kept underneath as a cheap
   * backstop against the bare literals, and neither of them needs an exception.
   */
  it("permits exactly the authorized actionability statuses", () => {
    expect([...ACTIONABILITY_STATUSES]).toEqual(["NOT_EVALUATED", "PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION"]);
  });

  it("declares no negative actionability state at all", () => {
    // Absence of an observed restriction is not evidence of availability, and
    // absence of an observed cast is not evidence of unavailability. This guards
    // the second: there is no member to infer into.
    for (const status of ACTIONABILITY_STATUSES) {
      expect(status, `${status} reads as a negative claim`).not.toMatch(
        /NOT_ACTIONABLE|UNAVAILABLE|IMPOSSIBLE|UNUSABLE|BLOCKED/,
      );
    }
  });

  it("names the evidence in every positive actionability status", () => {
    // A positive member must say what proved it, so a future member cannot mean
    // "we assumed it was actionable".
    for (const status of ACTIONABILITY_STATUSES) {
      if (status === "NOT_EVALUATED") continue;
      expect(status, `${status} claims actionability without naming evidence`).toMatch(
        /^PROVEN_ACTIONABLE_BY_/,
      );
    }
  });

  it("never declares a bare ACTIONABLE or NOT_ACTIONABLE literal", () => {
    for (const path of M5_FILES) {
      const code = codeOf(path);
      expect(code, `${path} declares ACTIONABLE`).not.toContain('"ACTIONABLE"');
      expect(code, `${path} declares NOT_ACTIONABLE`).not.toContain('"NOT_ACTIONABLE"');
    }
  });

  it("makes the honest actionability default explicit rather than implied", () => {
    // `createFinding` requires the field, so "fine by omission" is unreachable.
    const finding = codeOf("src/findings/finding.ts");
    expect(finding).toContain("readonly actionability: ActionabilityEvidence");
    expect(finding).not.toContain('actionability: "NOT_EVALUATED"');
    // And the M5-A producer states it at the call site.
    expect(codeOf("src/specs/rogue/assassination/evaluator.ts")).toContain("notEvaluatedActionability()");
  });

  it("uses no comparable-log or top-log input at all", () => {
    // RETARGETED AT M5-E. The rule is about COMPARABLE LOGS — other players'
    // parses becoming rotational authority or moving confidence. It was written
    // as a ban on the bare substring "comparison", which M5-E's observed-action
    // comparison collides with by name while being the opposite thing: a
    // comparison against the PINNED AUTHORITY, using no other player's data.
    //
    // The terms below name the actual concept, so the guard still catches a real
    // comparable-log input and no longer catches an unrelated word.
    for (const path of M5_FILES) {
      const code = codeOf(path);
      for (const forbidden of [
        "topLog",
        "comparisonLog",
        "comparableLog",
        "comparisonParse",
        "topParse",
        "consensus",
        "percentile",
        "ranking",
      ]) {
        expect(code, `${path} mentions ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

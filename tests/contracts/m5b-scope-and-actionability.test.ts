import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ACTIONABILITY_STATUSES } from "../../src/findings/actionability.js";
import {
  COMMON_EVALUATION_BLOCKERS,
  JUDGMENT_FAMILIES,
  OBSERVED_ACTION_BLOCKERS,
  OBSERVED_ACTION_JUDGMENT_STATUSES,
} from "../../src/findings/judgment.js";
import {
  DECISION_SCOPE_KINDS,
  NOT_APPLICABLE_REASONS,
  SCOPED_SELECTION_BLOCKERS,
  SCOPED_SELECTION_STATUSES,
} from "../../src/findings/scoped-selection.js";
import { NO_AUTHORITY_REASONS } from "../../src/findings/authority.js";
import { NOT_EVALUATED_REASONS } from "../../src/findings/run-result.js";
import { UNKNOWN_REASONS, STATE_CERTAINTIES } from "../../src/engine/state/state-result.js";
import { ACTION_USABILITIES, LIST_SELECTION_BLOCKERS } from "../../src/simc/list-selection.js";
import { TRUTH_VALUES, UNKNOWN_NUMBER_REASONS } from "../../src/simc/expression/evaluate.js";
import { ATOM_SHAPES } from "../../src/simc/expression/ast.js";

/**
 * M5-B's vocabularies, pinned STRUCTURALLY.
 *
 * Every assertion here is over an exported union rather than over source text.
 * That is the lesson of the actionability sweep this milestone replaced: a
 * substring check on `"ACTIONABLE"` happened to pass for
 * `"PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION"` because the preceding character is
 * an underscore, and would equally have passed `"NEVER_ACTIONABLE"`. Membership
 * assertions cannot be evaded by a prefix.
 */

function filesUnder(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: false })
    .map((entry) => `${root}/${String(entry).replace(/\\/g, "/")}`)
    .filter((path) => statSync(path).isFile() && path.endsWith(".ts"));
}

function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the scoped decision scope is a sub-list, and only a sub-list", () => {
  it("declares exactly one scope kind", () => {
    expect([...DECISION_SCOPE_KINDS]).toEqual(["APL_SUBLIST"]);
  });

  it("declares no GLOBAL_APL vocabulary anywhere in src", () => {
    // Global selection is a later milestone. Declaring the vocabulary before the
    // capability exists would let a scoped result be widened by a one-word edit.
    for (const path of filesUnder("src")) {
      expect(codeOf(path), `${path} declares GLOBAL_APL`).not.toContain("GLOBAL_APL");
    }
  });

  it("names no global-selection concepts in the findings layer", () => {
    for (const path of filesUnder("src/findings")) {
      const code = codeOf(path);
      for (const forbidden of ["globalSelection", "idealAction", "expectedAction", "globallyOptimal"]) {
        expect(code, `${path} declares ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe("scoped selection statuses are exactly the authorized five", () => {
  it("declares them, and no positive verdict beyond selection", () => {
    expect([...SCOPED_SELECTION_STATUSES]).toEqual([
      "SELECTED_BY_AUTHORITY",
      "NO_ACTION_SELECTED",
      "NOT_APPLICABLE",
      "UNKNOWN",
      "NO_AUTHORITY_AVAILABLE",
    ]);
    for (const forbidden of ["CORRECT", "OPTIMAL", "IDEAL", "MATCH"]) {
      expect([...SCOPED_SELECTION_STATUSES]).not.toContain(forbidden);
    }
  });

  it("keeps NOT_APPLICABLE out of every uncertainty vocabulary", () => {
    // A provably false gate is knowledge. It must not be expressible as a
    // shortfall in any layer.
    expect([...SCOPED_SELECTION_BLOCKERS]).not.toContain("NOT_APPLICABLE");
    expect([...UNKNOWN_REASONS]).not.toContain("NOT_APPLICABLE");
    expect([...NOT_EVALUATED_REASONS]).not.toContain("NOT_APPLICABLE");
    expect([...NO_AUTHORITY_REASONS]).not.toContain("NOT_APPLICABLE");
    expect([...NOT_APPLICABLE_REASONS]).toEqual(["ENTRY_GATE_FALSE"]);
  });

  it("retired SUBLIST_NOT_ENTERED rather than keeping it as an UNKNOWN blocker", () => {
    // An unentered list is applicability, not uncertainty. The blocker that
    // expressed it as uncertainty must not exist anywhere.
    expect([...SCOPED_SELECTION_BLOCKERS]).not.toContain("SUBLIST_NOT_ENTERED");
    for (const path of filesUnder("src")) {
      expect(codeOf(path), `${path} declares SUBLIST_NOT_ENTERED`).not.toContain("SUBLIST_NOT_ENTERED");
    }
  });

  it("keeps NO_ACTION_SELECTED out of every uncertainty vocabulary too", () => {
    // An entered list that eliminated every line is also exact knowledge.
    expect([...SCOPED_SELECTION_BLOCKERS]).not.toContain("NO_ACTION_SELECTED");
    expect([...UNKNOWN_REASONS]).not.toContain("NO_ACTION_SELECTED");
    expect([...NOT_EVALUATED_REASONS]).not.toContain("NO_ACTION_SELECTED");
    expect([...NO_AUTHORITY_REASONS]).not.toContain("NO_ACTION_SELECTED");
  });
});

describe("blocker vocabularies are family-safe, without synonyms", () => {
  it("shares the common reasons by name, because a name means one thing", () => {
    for (const blocker of COMMON_EVALUATION_BLOCKERS) {
      expect([...OBSERVED_ACTION_BLOCKERS], `${blocker} missing from the observed family`).toContain(blocker);
      expect([...SCOPED_SELECTION_BLOCKERS], `${blocker} missing from the scoped family`).toContain(blocker);
    }
  });

  it("keeps ANALYZER_SURFACE_INCOMPLETE out of the scoped family", () => {
    // It means "the gate is satisfiable and we evaluate too little to say what
    // fires" — which is precisely what a scoped selection DOES evaluate, so it
    // can never apply there.
    expect([...OBSERVED_ACTION_BLOCKERS]).toContain("ANALYZER_SURFACE_INCOMPLETE");
    expect([...SCOPED_SELECTION_BLOCKERS]).not.toContain("ANALYZER_SURFACE_INCOMPLETE");
  });

  it("keeps the ordered-walk reasons out of the observed-action family", () => {
    for (const blocker of [
      "COMPETING_POSSIBLE_ACTION",
      "NO_DEFINITE_WINNER",
      "NESTED_CALL_NOT_MODELLED",
      "UNMODELLED_DISPATCH_IN_LIST",
      "SELECTED_ACTION_IDENTITY_UNAVAILABLE",
    ]) {
      expect([...SCOPED_SELECTION_BLOCKERS]).toContain(blocker);
      expect([...OBSERVED_ACTION_BLOCKERS]).not.toContain(blocker);
    }
  });

  it("reuses the SimC walk's reason names verbatim rather than translating them", () => {
    // The selector's blockers ARE scoped-selection blockers. Spelling them
    // differently across the layer boundary would mean a reader has to learn
    // that two words mean one thing, and a fix has to be applied twice.
    for (const blocker of LIST_SELECTION_BLOCKERS) {
      expect([...SCOPED_SELECTION_BLOCKERS], `${blocker} has no scoped counterpart`).toContain(blocker);
    }
  });

  it("shares nothing with M4's evidence vocabulary or the run-level reasons", () => {
    for (const blocker of SCOPED_SELECTION_BLOCKERS) {
      expect([...UNKNOWN_REASONS], `${blocker} leaks into M4`).not.toContain(blocker);
      expect([...NOT_EVALUATED_REASONS], `${blocker} leaks into run reasons`).not.toContain(blocker);
      expect([...NO_AUTHORITY_REASONS], `${blocker} leaks into no-authority`).not.toContain(blocker);
      expect([...STATE_CERTAINTIES], `${blocker} leaks into certainty`).not.toContain(blocker);
    }
  });
});

describe("the judgment families are distinct and exhaustive", () => {
  it("declares exactly two families", () => {
    expect([...JUDGMENT_FAMILIES]).toEqual(["OBSERVED_ACTION_JUDGMENT", "SCOPED_ACTION_SELECTION"]);
  });

  it("shares only UNKNOWN and NO_AUTHORITY_AVAILABLE between the two status unions", () => {
    // Each family genuinely has both of those answers. Everything else is
    // family-specific, and a shared positive verdict in particular would let a
    // selection be read as an endorsement of an observed cast.
    const shared = OBSERVED_ACTION_JUDGMENT_STATUSES.filter((status) =>
      (SCOPED_SELECTION_STATUSES as readonly string[]).includes(status),
    );
    expect(shared).toEqual(["UNKNOWN", "NO_AUTHORITY_AVAILABLE"]);
    expect([...SCOPED_SELECTION_STATUSES]).not.toContain("REJECTED_BY_AUTHORITY");
    expect([...OBSERVED_ACTION_JUDGMENT_STATUSES]).not.toContain("SELECTED_BY_AUTHORITY");
  });

  it("shares only UNKNOWN with M4's certainty vocabulary", () => {
    const overlap = STATE_CERTAINTIES.filter((value) =>
      (SCOPED_SELECTION_STATUSES as readonly string[]).includes(value),
    );
    expect(overlap).toEqual(["UNKNOWN"]);
  });
});

describe("actionability admits exactly the authorized members", () => {
  it("declares two statuses and no negative one", () => {
    expect([...ACTIONABILITY_STATUSES]).toEqual(["NOT_EVALUATED", "PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION"]);
  });

  it("names the evidence in every positive status", () => {
    for (const status of ACTIONABILITY_STATUSES) {
      if (status === "NOT_EVALUATED") continue;
      expect(status).toMatch(/^PROVEN_ACTIONABLE_BY_/);
    }
  });

  it("keeps actionability vocabulary out of the SimC layer entirely", () => {
    // The generic selector must not depend on finding evidence. It asks about
    // usability, which is a smaller and layer-appropriate concept.
    for (const path of filesUnder("src/simc")) {
      const code = codeOf(path);
      expect(code, `${path} imports findings`).not.toContain("/findings/");
      expect(code, `${path} declares actionability`).not.toContain("ActionabilityEvidence");
    }
    // WIDENED at M5-C3c2 from two members to three. `PROVEN_UNUSABLE` is
    // evidence-backed negative usability — a claim that SimulationCraft's
    // `ready()` could not have succeeded — and is NOT negative actionability,
    // which still admits no negative member (asserted immediately above).
    expect([...ACTION_USABILITIES]).toEqual(["PROVEN_USABLE", "PROVEN_UNUSABLE", "UNKNOWN"]);
  });

  it("keeps game identity out of SELECTION control flow, not merely out of the layer", () => {
    // TIGHTENED at M5-C3c2, and the tightening is the point.
    //
    // The original sweep banned the string `abilityGameId` anywhere under
    // src/simc. C3c2's negative-usability verdict carries numeric identities as
    // EVIDENCE — which ability, which item the refusal is about — because a
    // finding that cannot say what it refused is not traceable.
    //
    // Banning the declaration would have forced that identity out of the
    // evidence record while proving nothing about behaviour. What actually
    // matters is that the SELECTOR never READS one: identity is payload it
    // carries, never input it branches on. That is asserted directly below, and
    // it is a STRONGER claim than the string ban it replaces — `itemId` and
    // evidence member access are now covered too, and neither was before.
    for (const path of ["src/simc/list-selection.ts", "src/simc/nested-selection.ts"]) {
      const code = codeOf(path);
      expect(code, `${path} names an ability id`).not.toContain("abilityGameId");
      expect(code, `${path} names an item id`).not.toContain("itemId");
      expect(code, `${path} reads a verdict's evidence`).not.toContain(".evidence");
      // Nor the named reasons. (`parsed.reason` in list-selection is a PARSER
      // refusal reason, which predates C3c2 and is not evidence.)
      expect(code, `${path} branches on an applicability reason`).not.toContain("ITEM_NOT_EQUIPPED");
      expect(code, `${path} branches on a usability reason`).not.toContain("ACTIVE_COOLDOWN");
      expect(code, `${path} branches on a usability reason`).not.toContain("STATIC_READY_FALSE");
    }

    // And nowhere in the layer is an identity read off a value at all. The
    // profile module is the one legitimate exception: answering "is this item
    // equipped" IS its job, and it is not part of selection.
    for (const path of filesUnder("src/simc")) {
      if (path === "src/simc/authority-profile.ts") continue;
      expect(codeOf(path), `${path} reads an ability id`).not.toContain(".abilityGameId");
      expect(codeOf(path), `${path} reads an item id`).not.toContain(".itemId");
    }
  });

  it("keeps the SimC layer free of Warcraft Logs and specialization imports", () => {
    for (const path of filesUnder("src/simc")) {
      const code = codeOf(path);
      expect(code, `${path} imports a spec`).not.toContain("/specs/");
      expect(code, `${path} imports the WCL layer`).not.toContain("/wcl/");
    }
  });
});

describe("the unknown-state vocabulary stays separate from unsupported syntax", () => {
  it("declares the three-valued truth domain", () => {
    expect([...TRUTH_VALUES]).toEqual(["TRUE", "FALSE", "UNKNOWN_STATE"]);
  });

  it("declares atom shapes, so enumeration is decided by syntax", () => {
    expect([...ATOM_SHAPES]).toEqual(["BOOLEAN", "NUMERIC"]);
  });

  it("gives every unknown magnitude a reason that is not a parse failure", () => {
    expect([...UNKNOWN_NUMBER_REASONS]).toEqual([
      "PREDICTIVE_NOT_PLAYER_KNOWABLE",
      "STATE_NOT_MODELLED",
      "STATE_NOT_ESTABLISHED",
    ]);
    for (const reason of UNKNOWN_NUMBER_REASONS) {
      expect(reason).not.toMatch(/UNSUPPORTED|UNPARSE|SYNTAX/);
    }
  });

  it("never lets UNKNOWN_STATE appear in a parse-failure vocabulary", () => {
    const parser = codeOf("src/simc/expression/parse.ts");
    expect(parser).not.toContain("UNKNOWN_STATE");
    expect(parser).not.toContain("UNKNOWN_NUMBER");
  });

  it("never binds fight_remains from encounter or hindsight state", () => {
    // M4's `observedFightEndDelta` is the RETROSPECTIVE outcome and is documented
    // as explicitly not `fight_remains`. No M5 module may reach for it.
    for (const root of ["src/simc", "src/specs", "src/findings", "src/data"]) {
      for (const path of filesUnder(root)) {
        const code = codeOf(path);
        expect(code, `${path} reads the observed fight end`).not.toContain("observedFightEndDelta");
        expect(code, `${path} binds fight_remains`).not.toContain("fightRemains");
      }
    }
  });
});

describe("numeric identity remains authoritative in the scoped path", () => {
  it("still declares the Envenom spell id in exactly one module", () => {
    const declaring = filesUnder("src").filter((path) => codeOf(path).includes("32645"));
    expect(declaring).toEqual(["src/data/game/rogue-abilities.ts"]);
  });

  it("resolves the selected action's id through runtime game data, never the token", () => {
    const spendSelection = codeOf("src/specs/rogue/assassination/spend-selection.ts");
    expect(spendSelection).toContain("tryAbilityIdentityFor");
    expect(spendSelection).toContain("identity.spellId");
    // The comparison is numeric, against the observed cast's id.
    expect(spendSelection).toContain("identity.spellId === observedAbilityGameId");
  });

  it("compares no ability name anywhere in the scoped path", () => {
    for (const path of ["src/specs/rogue/assassination/spend-selection.ts", "src/simc/list-selection.ts"]) {
      const code = codeOf(path);
      expect(code).not.toContain("displayNameEn");
      expect(code).not.toContain("abilities.get(");
      expect(code).not.toMatch(/\/envenom\/i/);
    }
  });
});

/**
 * M11-A3: the deep-dive coaching inventory covers every ordinary M11
 * specialization exactly once, claims nothing production contradicts, and
 * records the Ritual Clipping requirement without assigning it from memory.
 *
 * WHAT THE INVENTORY IS
 *
 * `tests/support/m11/coaching-inventory.json` is a TEST/DOCS-OWNED backlog
 * of candidate coaching questions per specialization — what a supplemental
 * analysis might one day answer, what evidence and authority it would need,
 * and what makes its answer unknowable. Nothing in `src/` reads it; the
 * last test here proves that. A candidate question is not an authorized
 * conclusion, and a `READY_FOR_SPEC_MILESTONE` readiness is a statement
 * about inputs, not a promise of output.
 *
 * WHAT IS PROVEN MECHANICALLY
 *
 *   1. POPULATION. The ordinary M11 population is DERIVED from the pinned
 *      roster: every playable row whose DBC role is DPS or TANK, minus the
 *      specializations that were public BEFORE M11 (Assassination Rogue,
 *      Protection Paladin — M11 onboards the rest, and a specialization
 *      M11 itself promotes stays in its population), plus whichever
 *      role-UNKNOWN Evoker rows the inventory's own declared classification
 *      places in M11. The inventory must list exactly that set — no healer,
 *      no Augmentation, no duplicate, no missing Devourer — and the declared
 *      Evoker classification must cover exactly the three role-UNKNOWN rows
 *      and nothing else.
 *   2. NO STALE CLAIM. Each row's `currentAnalyzerStatus` must agree with
 *      the production partition (`PUBLIC_SPEC_IDS`, `INTERNAL_ONLY_SPEC_IDS`,
 *      `SPEC_IDS`). The day a milestone registers one of these
 *      specializations, its row must change or this fails.
 *   3. COHORTS. Every ordinary specialization sits in exactly one cohort,
 *      the SELECTED cohort holds exactly the selected first spec, and each
 *      row's `cohort` names the cohort that lists it.
 *   4. QUESTION SHAPE. Ids are `<specId>.<slug>` and unique; enumerations
 *      are closed; a `SPECIFIC_QUESTIONS_IDENTIFIED` row has questions, an
 *      `UNASSESSED` row has none; only the selected specialization's
 *      questions carry an A4 classification.
 *   5. RITUAL CLIPPING. The requirement is recorded under BOTH candidate
 *      Warlock owners with ownership UNRESOLVED and readiness
 *      NEEDS_AUTHORITY, and under no other specialization — the mechanic
 *      was located in the pinned Destruction and Demonology lists and in
 *      Demonology evidence, and nothing else may claim it until a pinned
 *      mechanics read decides.
 */

import { describe, expect, it } from "vitest";

import inventory from "../support/m11/coaching-inventory.json";
import { pinnedSpecRoster } from "../../src/data/game/spec-roster.js";
import { INTERNAL_ONLY_SPEC_IDS, PUBLIC_SPEC_IDS, SPEC_IDS } from "../../src/findings/spec-id.js";

const SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.{ts,json}", {
  eager: true,
  query: "?raw",
  import: "default",
});

const ANALYZER_STATUSES = ["PUBLIC", "INTERNAL_ONLY", "UNREGISTERED"] as const;
const EVIDENCE_STATUSES = [
  "REAL_SANITIZED_EVIDENCE_AVAILABLE",
  "LOCAL_RAW_EVIDENCE_ONLY",
  "NO_KNOWN_REAL_EVIDENCE",
] as const;
const AUTHORITY_STATUSES = ["AUTHORITY_AUDITED", "AUTHORITY_NOT_YET_AUDITED", "AUTHORITY_BLOCKED"] as const;
const INVENTORY_STATUSES = ["SPECIFIC_QUESTIONS_IDENTIFIED", "PARTIAL", "UNASSESSED"] as const;
const SCOPES = [
  "OBSERVED_DECISION",
  "TEMPORAL_WINDOW",
  "WHOLE_FIGHT",
  "RESOURCE_MANAGEMENT",
  "COOLDOWN_ALIGNMENT",
  "MECHANIC_CLIPPING",
  "UPTIME_MAINTENANCE",
  "ATTRIBUTION_SENSITIVE",
  "PREPARATION",
] as const;
const TIME_HORIZONS = [
  "ONE_DECISION",
  "SHORT_WINDOW",
  "REPEATED_CYCLES",
  "WHOLE_FIGHT",
  "PRE_PULL_AND_COMBAT",
  "CROSS_PLAYER",
] as const;
/**
 * The specializations that were PUBLIC when M11 began. M11's population is
 * everything ordinary except these; a specialization M11 promotes (Retribution
 * Paladin, M11-A5) remains an M11 row with its status updated, never removed.
 */
const PRE_M11_PUBLIC: readonly string[] = ["rogue/assassination", "paladin/protection"];

const READINESS = [
  "READY_FOR_SPEC_MILESTONE",
  // M11-A4: the selected specialization's A4_REQUIRED question, landed as an
  // INTERNAL_ONLY analyzer with committed sanitized evidence. Not public.
  "IMPLEMENTED_INTERNAL_ONLY",
  // M11-A5: the same question, now reachable publicly through the rotational
  // analyzer — implemented as part of the analyzer, not as a supplemental
  // analysis. Its row's `currentAnalyzerStatus` must be PUBLIC.
  "IMPLEMENTED_PUBLIC",
  "NEEDS_AUTHORITY",
  "NEEDS_EVIDENCE",
  "NEEDS_ENGINE_CAPABILITY",
  "NEEDS_REPORT_CONTRACT",
  "UNASSESSED",
] as const;
const OUTPUT_NEEDS = [
  "EXISTING_INTERNAL_FINDINGS",
  "SUPPLEMENTAL_RESULT_ONLY",
  "REPORT_PROJECTION",
  "PUBLIC_CONTRACT_EVOLUTION",
  "UNASSESSED",
] as const;
const A4_CLASSIFICATIONS = ["A4_REQUIRED", "A4_OPTIONAL", "LATER_M11", "BLOCKED"] as const;
const RITUAL_OWNERSHIP = "UNRESOLVED_DIABOLIST_HERO_TREE";

function roster() {
  const loaded = pinnedSpecRoster();
  if (!loaded.ok) throw new Error(`${loaded.reason}: ${loaded.detail}`);
  return loaded;
}

/** The ordinary M11 population, derived — never listed — from the roster. */
function derivedOrdinaryM11(): readonly string[] {
  const rows = roster().specializations;
  const evoker = inventory.evokerClassification as Record<string, string>;
  const ordinary = rows
    .filter((row) => {
      if (PRE_M11_PUBLIC.includes(row.rosterKey)) return false;
      if (row.role === "DPS" || row.role === "TANK") return true;
      if (row.role === "UNKNOWN") return evoker[row.rosterKey] === "M11";
      return false;
    })
    .map((row) => row.rosterKey);
  return [...ordinary].sort();
}

describe("the inventory is pinned to the roster's commit and declares the three Evoker rows", () => {
  it("names the pinned SimulationCraft commit the roster was extracted from", () => {
    expect(inventory.pinnedSimcCommit).toBe(roster().provenance.commitSha);
    expect(inventory.inventoryVersion).toBe(1);
  });

  it("classifies exactly the role-UNKNOWN roster rows, into M11 / M12 / M13, and nothing else", () => {
    const unknownRows = roster()
      .specializations.filter((row) => row.role === "UNKNOWN")
      .map((row) => row.rosterKey)
      .sort();
    const declared = Object.keys(inventory.evokerClassification).sort();
    expect(declared).toEqual(unknownRows);
    expect(inventory.evokerClassification).toEqual({
      "evoker/devastation": "M11",
      "evoker/preservation": "M12",
      "evoker/augmentation": "M13",
    });
  });
});

describe("population: every ordinary M11 specialization exactly once, no healer, no Augmentation", () => {
  const listed = inventory.specs.map((spec) => spec.specId);

  it("lists exactly the derived ordinary population (thirty at this pin, Devourer included)", () => {
    const expected = derivedOrdinaryM11();
    expect(expected).toHaveLength(30);
    expect(expected).toContain("demonhunter/devourer");
    expect([...listed].sort()).toEqual(expected);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("lists no HEALER row, no Preservation, no Augmentation, and no specialization public before M11", () => {
    const healers = roster()
      .specializations.filter((row) => row.role === "HEALER")
      .map((row) => row.rosterKey);
    expect(healers).toHaveLength(6);
    for (const key of [...healers, "evoker/preservation", "evoker/augmentation", ...PRE_M11_PUBLIC]) {
      expect(listed, key).not.toContain(key);
    }
    // The pre-M11 public set is exactly the production public set minus what
    // M11 has promoted so far, Augmentation Evoker (M13-F, outside this
    // inventory) and Restoration Shaman (HEAL-AP, a healer, outside it too),
    // so this constant cannot silently drift.
    for (const key of PRE_M11_PUBLIC) expect(PUBLIC_SPEC_IDS as readonly string[]).toContain(key);
    expect((PUBLIC_SPEC_IDS as readonly string[]).filter((id) => !PRE_M11_PUBLIC.includes(id))).toEqual([
      "paladin/retribution",
      "deathknight/blood",
      "monk/brewmaster",
      "evoker/augmentation",
      "shaman/restoration",
    ]);
  });

  it("holds thirty ordinary + seven healers + one Augmentation + two pre-M11 public = the forty-row roster", () => {
    const healerCount = roster().specializations.filter((row) => row.role === "HEALER").length + 1;
    expect(listed.length + healerCount + 1 + PRE_M11_PUBLIC.length).toBe(roster().specializations.length);
  });
});

describe("no stale claim: analyzer status agrees with the production partition", () => {
  it.each(inventory.specs.map((spec) => [spec.specId, spec.currentAnalyzerStatus] as const))(
    "%s is %s in production",
    (specId, status) => {
      expect(ANALYZER_STATUSES).toContain(status);
      const isPublic = (PUBLIC_SPEC_IDS as readonly string[]).includes(specId);
      const isInternal = (INTERNAL_ONLY_SPEC_IDS as readonly string[]).includes(specId);
      const isKnown = (SPEC_IDS as readonly string[]).includes(specId);
      const expected = isPublic ? "PUBLIC" : isInternal ? "INTERNAL_ONLY" : "UNREGISTERED";
      expect(status, `${specId}: update the inventory row when the production partition changes`).toBe(
        expected,
      );
      if (status === "UNREGISTERED") expect(isKnown).toBe(false);
    },
  );
});

describe("cohorts: every ordinary specialization in exactly one cohort, the selection in SELECTED", () => {
  const cohorts = inventory.cohorts as Record<string, readonly string[]>;

  it("partitions the population", () => {
    const members = Object.values(cohorts).flat();
    expect([...members].sort()).toEqual(derivedOrdinaryM11());
    expect(new Set(members).size).toBe(members.length);
  });

  it("SELECTED holds exactly the selected first specialization, which is one of the thirty and is PUBLIC since M11-A5", () => {
    expect(cohorts["SELECTED"]).toEqual([inventory.selectedFirstSpec]);
    expect(derivedOrdinaryM11()).toContain(inventory.selectedFirstSpec);
    expect(inventory.selectedFirstSpec).toBe("paladin/retribution");
    const selected = inventory.specs.find((spec) => spec.specId === inventory.selectedFirstSpec);
    expect(selected?.currentAnalyzerStatus).toBe("PUBLIC");
    expect(
      selected?.questions.map((question) => [question.id, question.implementationReadiness]),
    ).toContainEqual(["paladin/retribution.spender-choice", "IMPLEMENTED_PUBLIC"]);
    // A5 is exposure only: no other Retribution question moved.
    for (const question of selected?.questions ?? []) {
      if (question.id !== "paladin/retribution.spender-choice") {
        expect(question.implementationReadiness, question.id).not.toMatch(/^IMPLEMENTED/);
      }
    }
  });

  it("each row names the cohort that lists it, and 29 remain after selection", () => {
    for (const spec of inventory.specs) {
      expect(cohorts[spec.cohort], spec.specId).toContain(spec.specId);
    }
    const remaining = Object.entries(cohorts)
      .filter(([name]) => name !== "SELECTED")
      .flatMap(([, members]) => members);
    expect(remaining).toHaveLength(29);
  });
});

describe("question shape", () => {
  const questions = inventory.specs.flatMap((spec) => spec.questions.map((question) => ({ spec, question })));

  it("has at least one question and unique, spec-prefixed ids", () => {
    expect(questions.length).toBeGreaterThan(0);
    const ids = questions.map(({ question }) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { spec, question } of questions) {
      expect(question.id.startsWith(`${spec.specId}.`), question.id).toBe(true);
      expect(question.id.slice(spec.specId.length + 1)).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it.each(questions.map(({ question }) => [question.id, question] as const))(
    "%s uses closed vocabularies",
    (_id, q) => {
      expect(SCOPES).toContain(q.scope);
      expect(TIME_HORIZONS).toContain(q.timeHorizon);
      expect(READINESS).toContain(q.implementationReadiness);
      expect(OUTPUT_NEEDS).toContain(q.outputNeed);
      expect(q.question.length).toBeGreaterThan(20);
      expect(q.evidenceNeeded.length).toBeGreaterThan(0);
      expect(q.authorityNeeded.length).toBeGreaterThan(0);
      expect(q.normalizedStateNeeded.length).toBeGreaterThan(0);
      expect(q.unknownConditions.length).toBeGreaterThan(0);
      expect(typeof q.notes).toBe("string");
    },
  );

  it("row statuses agree with their question lists and use closed vocabularies", () => {
    for (const spec of inventory.specs) {
      expect(EVIDENCE_STATUSES, spec.specId).toContain(spec.realEvidenceStatus);
      expect(AUTHORITY_STATUSES, spec.specId).toContain(spec.authorityAuditStatus);
      expect(INVENTORY_STATUSES, spec.specId).toContain(spec.deepDiveInventoryStatus);
      if (spec.deepDiveInventoryStatus === "UNASSESSED") {
        expect(spec.questions, `${spec.specId} is UNASSESSED and must carry no question`).toHaveLength(0);
      } else {
        expect(
          spec.questions.length,
          `${spec.specId} claims questions and must carry at least one`,
        ).toBeGreaterThan(0);
      }
      if (spec.realEvidenceStatus === "REAL_SANITIZED_EVIDENCE_AVAILABLE") {
        // Only a REGISTERED specialization may claim committed sanitized
        // evidence, and the claim is checked against the production
        // partition rather than taken from the row (M11-A4: Retribution).
        expect(
          (INTERNAL_ONLY_SPEC_IDS as readonly string[]).includes(spec.specId) ||
            (PUBLIC_SPEC_IDS as readonly string[]).includes(spec.specId),
          `${spec.specId}: no committed sanitized evidence exists for an unregistered M11 spec`,
        ).toBe(true);
      }
    }
  });

  it("only the selected specialization's questions carry an A4 classification", () => {
    for (const { spec, question } of questions) {
      const classification = (question as { a4Classification?: string }).a4Classification;
      if (spec.specId === inventory.selectedFirstSpec) {
        expect(A4_CLASSIFICATIONS, question.id).toContain(classification);
      } else {
        expect(classification, question.id).toBeUndefined();
      }
    }
    const selected = inventory.specs.find((spec) => spec.specId === inventory.selectedFirstSpec);
    const required = selected?.questions.filter(
      (question) => (question as { a4Classification?: string }).a4Classification === "A4_REQUIRED",
    );
    // Exactly one A4_REQUIRED item: the first truthful rotational slice. A4 is
    // not a deep-dive milestone.
    expect(required?.map((question) => question.id)).toEqual(["paladin/retribution.spender-choice"]);
  });
});

describe("Ritual Clipping is recorded, unowned, and not implementable from memory", () => {
  const carriers = inventory.specs.filter((spec) =>
    spec.questions.some((question) => question.id.endsWith(".ritual-clipping")),
  );

  it("is carried by both Warlock candidate owners the pinned lists name, and by no one else", () => {
    expect(carriers.map((spec) => spec.specId).sort()).toEqual(["warlock/demonology", "warlock/destruction"]);
  });

  it.each(carriers.map((spec) => [spec.specId, spec] as const))(
    "%s records it as unresolved and needing authority",
    (_id, spec) => {
      const question = spec.questions.find((candidate) => candidate.id.endsWith(".ritual-clipping"));
      expect(question).toBeDefined();
      expect((question as { ownership?: string } | undefined)?.ownership).toBe(RITUAL_OWNERSHIP);
      expect(question?.scope).toBe("MECHANIC_CLIPPING");
      expect(question?.implementationReadiness).toBe("NEEDS_AUTHORITY");
      expect(question?.question).toContain(
        "report UNKNOWN when the required temporal state cannot be reconstructed",
      );
    },
  );

  it("no other question claims a ritual ownership", () => {
    for (const spec of inventory.specs) {
      for (const question of spec.questions) {
        if (question.id.endsWith(".ritual-clipping")) continue;
        expect((question as { ownership?: string }).ownership, question.id).toBeUndefined();
      }
    }
  });
});

describe("the inventory is test/docs-owned", () => {
  it("no production module under src/ names the inventory", () => {
    for (const [path, source] of Object.entries(SOURCES)) {
      expect(source.includes("coaching-inventory"), path).toBe(false);
    }
  });
});

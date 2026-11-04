/**
 * M12-E: the raid cooldown plan as public input, through the one application
 * service.
 *
 * - The MCP input schema is a SHAPE: every example it accepts, the shared
 *   application parser accepts too, and REST reaches that same parser.
 * - A request without a plan produces exactly the document it produced
 *   before: no `raidCooldownPlan` key at all.
 * - A supplied plan is disclosed on every status (unsupported
 *   specializations included) as input facts, and its assignments are never
 *   evaluated by this build: `NOT_EVALUATED`, never a met/missed reading.
 * - A plan for another encounter or difficulty is disclosed MISMATCHED.
 * - An invalid plan rejects the request; it is never silently dropped.
 * - `src/raid-plan/` is shared input: no specialization branch, no import of
 *   a specialization, the service, a contract or a transport.
 */

import { describe, expect, it } from "vitest";

import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import { PublicAnalysisResultSchema } from "../../src/contracts/analysis-contract.js";
import { RaidCooldownPlanInputSchema } from "../../src/contracts/raid-cooldown-plan-input-contract.js";
import { raidCooldownPlanDigest } from "../../src/raid-plan/digest.js";
import { analyzeToolDescription } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { PUBLIC_SPECIALIZATION_DESCRIPTIONS } from "../../src/services/analyzer-registry.js";
import { parseRaidCooldownPlanField } from "../../src/services/raid-cooldown-plan-request.js";
import { D2_REQUEST, fixtureAnalysisRunner } from "../support/analysis-transports.js";
import { m5d2Fight } from "../support/m5d2-fixture.js";

const FIGHT = m5d2Fight();
const BOUND = { encounterId: FIGHT.fight.encounterId, difficulty: FIGHT.fight.difficulty ?? 0 };

const NOTE_PLAN = {
  format: "TIMELINE_NOTE",
  ...BOUND,
  defaultToleranceMs: 3_000,
  label: "healer CDs",
  text: [
    "time:3;ph:2;tag:Jymblu;spellid:98008;",
    "time:34;ph:2.5;tag:Jymblu;spellid:98008;",
    "time:10;ph:2;tag:everyone;text:Soak orbs;",
  ].join("\n"),
} as const;

const STRUCTURED_PLAN = {
  format: "STRUCTURED",
  ...BOUND,
  assignments: [
    {
      player: { name: "Jymblu", realm: "Area52" },
      abilityId: 98008,
      plannedTime: { kind: "FIGHT_RELATIVE", offsetMs: 60_000 },
      toleranceMs: 2_000,
    },
  ],
} as const;

async function analyzed(input: unknown, options: Parameters<typeof fixtureAnalysisRunner>[0] = {}) {
  const result = await fixtureAnalysisRunner(options)(input);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result;
}

describe("the MCP input schema and the application parser agree", () => {
  it("every example the schema accepts, the parser accepts", () => {
    for (const example of [NOTE_PLAN, STRUCTURED_PLAN]) {
      expect(RaidCooldownPlanInputSchema.safeParse(example).success).toBe(true);
      expect(parseRaidCooldownPlanField(example).ok).toBe(true);
    }
  });

  it("the schema refuses a numeric phase and a note without tolerance, as the parser does", () => {
    const numericPhase = {
      ...STRUCTURED_PLAN,
      assignments: [
        { ...STRUCTURED_PLAN.assignments[0], plannedTime: { kind: "PHASE_RELATIVE", phase: 2, offsetMs: 0 } },
      ],
    };
    const { defaultToleranceMs: _omit, ...untolerant } = NOTE_PLAN;
    for (const example of [numericPhase, untolerant]) {
      expect(RaidCooldownPlanInputSchema.safeParse(example).success).toBe(false);
      expect(parseRaidCooldownPlanField(example).ok).toBe(false);
    }
  });
});

describe("the service discloses a supplied plan and evaluates none of it", () => {
  it("no plan: no key on the analysis or the document, exactly as before M12-E", async () => {
    const result = await analyzed(D2_REQUEST);
    expect("raidCooldownPlan" in result.analysis).toBe(false);
    expect("raidCooldownPlan" in projectAnalysisResult(result.analysis)).toBe(false);
  });

  it("a plan adds its disclosure and changes nothing else in the document", async () => {
    const without = projectAnalysisResult((await analyzed(D2_REQUEST)).analysis);
    const withPlan = projectAnalysisResult(
      (await analyzed({ ...D2_REQUEST, raidCooldownPlan: NOTE_PLAN })).analysis,
    );
    expect(PublicAnalysisResultSchema.safeParse(withPlan).success).toBe(true);
    const { raidCooldownPlan, tldr, report, ...rest } = withPlan;
    const { tldr: tldrWithout, report: reportWithout, ...restWithout } = without;
    expect(rest).toEqual(restWithout);
    // M15-F: the TLDR and the report differ only by saying the plan was not
    // evaluated: one disclosure code, and one sentence each.
    const code = "RAID_COOLDOWN_PLAN_NOT_EVALUATED";
    const sentence =
      "The supplied raid cooldown plan was not evaluated; nothing is claimed about any assignment.";
    if (tldr?.assessment !== "ASSESSED" || tldrWithout?.assessment !== "ASSESSED") throw new Error("no TLDR");
    expect(tldr.disclosures).toContain(code);
    expect(tldr.lines).toContain(sentence);
    expect({
      ...tldr,
      disclosures: tldr.disclosures.filter((held) => held !== code),
      lines: tldr.lines.filter((line) => line !== sentence),
    }).toEqual(tldrWithout);
    if (report?.assessment !== "ASSESSED" || reportWithout?.assessment !== "ASSESSED")
      throw new Error("no report");
    expect(report.coverage.disclosures).toContain(code);
    expect({
      ...report,
      coverage: {
        ...report.coverage,
        disclosures: report.coverage.disclosures.filter((held) => held !== code),
      },
      markdown: report.markdown
        .replace(`, \`${code}\`.`, ".")
        .replace(`- Not in this report: ${sentence}\n`, ""),
    }).toEqual(reportWithout);
    expect(raidCooldownPlan).toEqual({
      authority: "USER_PROVIDED_RAID_PLAN",
      schema: "raid-cooldown-plan/1",
      format: "TIMELINE_NOTE",
      label: "healer CDs",
      digest: expect.stringMatching(/^[0-9a-f]{64}$/),
      encounter: BOUND,
      encounterBinding: "MATCHED",
      assignmentCount: 2,
      importDiagnostics: [{ key: "NO_SPELL_ID", count: 1 }],
      assignmentEvaluation: { state: "NOT_EVALUATED", reason: "NO_PUBLIC_ASSIGNMENT_EVALUATOR" },
    });
  });

  it("the same plan has the same digest; a different plan a different one", async () => {
    // The digest the service discloses, over the parser's normalized plan; no analysis needed.
    const digestOf = async (plan: unknown) => {
      const parsed = parseRaidCooldownPlanField(plan);
      if (!parsed.ok || parsed.plan === null) throw new Error("expected a plan");
      return await raidCooldownPlanDigest(parsed.plan);
    };
    expect(await digestOf(NOTE_PLAN)).toBe(await digestOf({ ...NOTE_PLAN }));
    expect(await digestOf(NOTE_PLAN)).not.toBe(await digestOf({ ...NOTE_PLAN, defaultToleranceMs: 2_000 }));
  });

  it("a plan for another encounter or difficulty is disclosed MISMATCHED and not applied", async () => {
    for (const encounter of [
      { encounterId: BOUND.encounterId + 1, difficulty: BOUND.difficulty },
      { encounterId: BOUND.encounterId, difficulty: BOUND.difficulty + 1 },
    ]) {
      const result = await analyzed({
        ...D2_REQUEST,
        raidCooldownPlan: { ...STRUCTURED_PLAN, ...encounter },
      });
      expect(result.analysis.raidCooldownPlan).toMatchObject({
        encounter,
        encounterBinding: "MISMATCHED",
        assignmentEvaluation: { state: "NOT_EVALUATED", reason: "PLAN_NOT_FOR_THIS_FIGHT" },
      });
    }
  });

  it("an unsupported specialization still discloses the plan, beside SPEC_NOT_SUPPORTED", async () => {
    const result = await analyzed(
      { ...D2_REQUEST, raidCooldownPlan: STRUCTURED_PLAN },
      { className: "Mage", specName: "Fire" },
    );
    expect(result.state).toBe("SPEC_NOT_SUPPORTED");
    const document = projectAnalysisResult(result.analysis);
    expect(document.status).toBe("SPEC_NOT_SUPPORTED");
    expect(document.raidCooldownPlan?.assignmentEvaluation).toEqual({
      state: "NOT_EVALUATED",
      reason: "NO_PUBLIC_ASSIGNMENT_EVALUATOR",
    });
  });

  it("an invalid plan rejects the request with its issues; it is never dropped to 'no plan'", async () => {
    const result = await fixtureAnalysisRunner()({
      ...D2_REQUEST,
      raidCooldownPlan: { ...STRUCTURED_PLAN, difficulty: "MYTHIC" },
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        issues: [{ code: "INVALID_REQUEST_SHAPE", field: "raidCooldownPlan.difficulty" }],
      },
    });
  });

  it("the tool description says a plan is never inferred, and is judged only in healerFindings (HEAL-AP)", () => {
    const description = analyzeToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS);
    expect(description).toContain("none is ever inferred when it is absent");
    expect(description).toContain("Its assignmentEvaluation is NOT_EVALUATED, with the reason, unless");
    expect(description).toContain("then it is EVALUATED_IN_HEALER_FINDINGS and");
    expect(description).toContain("every result is in healerFindings, citing the plan");
    expect(description).toContain("Only a plan bound to this fight is applied");
    expect(description).toContain(
      "the disclosure itself never says whether an assignment was met, missed, early or late",
    );
    expect(description).not.toContain("assignmentEvaluation is always NOT_EVALUATED");
  });
});

describe("src/raid-plan is shared input, not a gameplay evaluator", () => {
  const SOURCES: Record<string, string> = import.meta.glob("../../src/raid-plan/**/*.ts", {
    eager: true,
    query: "?raw",
    import: "default",
  });

  it("imports only itself and the normalized combat model", () => {
    const files = Object.keys(SOURCES);
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const [file, source] of Object.entries(SOURCES)) {
      const specifiers = [...source.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);
      for (const specifier of specifiers) {
        expect(
          specifier?.startsWith("./") || specifier === "../engine/normalization/combat-fight.js",
          `${file} imports ${String(specifier)}`,
        ).toBe(true);
      }
    }
  });

  it("names no class or specialization and branches on none", () => {
    for (const [file, source] of Object.entries(SOURCES)) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code, file).not.toMatch(
        /\bspec(Id|Name)?\b|className|shaman|restoration|paladin|priest|druid|monk|evoker/i,
      );
    }
  });
});

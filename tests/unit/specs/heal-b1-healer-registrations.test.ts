/**
 * HEAL-B1: the Holy Paladin, Restoration Druid and Mistweaver Monk
 * registrations, INTERNAL_ONLY; Holy Paladin and Mistweaver Monk PUBLIC since
 * HEAL-B1P; and the Holy Priest registration, INTERNAL_ONLY from HEAL-B2 and
 * PUBLIC since HEAL-B2P (its real-evidence checks are
 * tests/unit/specs/heal-b2-holy-priest.test.ts); and, since HEAL-B3, the
 * INTERNAL_ONLY Discipline Priest registration (its real-evidence and
 * Atonement checks are tests/unit/specs/heal-b3-discipline-priest.test.ts);
 * and, since HEAL-B4, the INTERNAL_ONLY Preservation Evoker registration (its
 * real-evidence and empowered-cast checks are
 * tests/unit/specs/heal-b4-preservation-evoker.test.ts).
 *
 * What is pinned per registration:
 * - Restoration Druid, Discipline Priest and Preservation Evoker are listed INTERNAL_ONLY rows; the public lookup, the
 *   public identity table and a public request never reach it. Holy Paladin,
 *   Mistweaver Monk and Holy Priest are listed PUBLIC rows: both lookups find the same
 *   row, the identity table resolves them, a public request dispatches them
 *   once, and they carry public prose and a healer view;
 * - it declares the three provider-less healer families from its own
 *   REQUIRED_INPUTS, binds nothing, derives FULL_RAID, and is never ANALYZED;
 * - a subject with no stated specialization is INSUFFICIENT_EVIDENCE, never
 *   a default identity;
 * - its healer finding set takes the shared shape, under the spec's own id.
 *
 * And over committed real evidence (no new Warcraft Logs request):
 * - the Holy Paladin of the M13-A capture (actor 5): its two observed healing
 *   cooldown casts, Avenging Wrath at 184,987 and Aura Mastery at 272,367,
 *   checked against the raw segment bytes; the capture is filtered, so the
 *   listing is UNKNOWN (INSUFFICIENT_COVERAGE), never "these were all";
 * - the Holy Paladin (actor 1) and the Mistweaver Monk (actor 9) of
 *   b1PmaKrd6CDfzngc fight 48, over the friendly-players window that carries
 *   no cast of theirs: no use is listed, and the listing is UNKNOWN, never
 *   "no cooldown was used". The Mistweaver's sources are its four
 *   Warcraft Logs-stated pets (55, 58, 60, 214, per the committed context).
 */

import { beforeAll, describe, expect, it } from "vitest";

import { PREPARATION_REQUIREMENT } from "../../../src/analysis/preparation/requirement.js";
import type { CombatFight } from "../../../src/engine/normalization/combat-fight.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import type { SpecAnalysisInput } from "../../../src/findings/analysis-envelope.js";
import type { AnalyzerRegistration } from "../../../src/findings/analyzer-registration.js";
import { validateCapabilities } from "../../../src/findings/decision-capability.js";
import type { HealerFindingSet } from "../../../src/findings/healer-finding.js";
import type { SpecId } from "../../../src/findings/spec-id.js";
import type { RaidCooldownPlan } from "../../../src/raid-plan/raid-cooldown-plan.js";
import { analyzeFight } from "../../../src/services/analysis-service.js";
import {
  analyzerForSpec,
  ANALYZER_REGISTRATIONS,
  internalAnalyzerForSpec,
  PRODUCTION_CATALOG,
  runAnalyzer,
} from "../../../src/services/analyzer-registry.js";
import { deriveIngestionScopeFor } from "../../../src/services/ingestion-scope.js";
import { resolveSpecIdentity } from "../../../src/services/spec-identity.js";
import { RESTORATION_DRUID_REGISTRATION } from "../../../src/specs/druid/restoration/registration.js";
import { RESTORATION_DRUID_REQUIRED_INPUTS } from "../../../src/specs/druid/restoration/spec.js";
import { PRESERVATION_EVOKER_REGISTRATION } from "../../../src/specs/evoker/preservation/registration.js";
import { PRESERVATION_EVOKER_REQUIRED_INPUTS } from "../../../src/specs/evoker/preservation/spec.js";
import { MISTWEAVER_MONK_REGISTRATION } from "../../../src/specs/monk/mistweaver/registration.js";
import { MISTWEAVER_MONK_REQUIRED_INPUTS } from "../../../src/specs/monk/mistweaver/spec.js";
import { HOLY_PALADIN_REGISTRATION } from "../../../src/specs/paladin/holy/registration.js";
import { HOLY_PALADIN_REQUIRED_INPUTS } from "../../../src/specs/paladin/holy/spec.js";
import { DISCIPLINE_PRIEST_REGISTRATION } from "../../../src/specs/priest/discipline/registration.js";
import { DISCIPLINE_PRIEST_REQUIRED_INPUTS } from "../../../src/specs/priest/discipline/spec.js";
import { HOLY_PRIEST_REGISTRATION } from "../../../src/specs/priest/holy/registration.js";
import { HOLY_PRIEST_REQUIRED_INPUTS } from "../../../src/specs/priest/holy/spec.js";
import type { FightIdentity } from "../../../src/wcl/types.js";
import { D2_REQUEST, MCP_TEST_ENV } from "../../support/analysis-transports.js";
import { countedProductionCatalog } from "../../support/catalog.js";
import { loadCommittedEvidenceArchive } from "../../support/corpus/evidence-archive.js";
import { bundleOf } from "../../support/corpus/fight.js";
import { M5D2_ACTOR, m5d2Fight } from "../../support/m5d2-fixture.js";

/** The payload fields every HEAL-B1 registration returns. */
interface HealerAnalysis {
  readonly status: string;
  readonly specId: string;
  readonly domains: readonly { readonly domain: string; readonly resolution: string }[];
  readonly subjectSpecialization: { readonly state: string; readonly reason?: string };
  readonly planSupplied: boolean;
  readonly evaluation: {
    readonly state: string;
    readonly cooldowns?: {
      readonly listing: unknown;
      readonly uses: readonly {
        readonly cast: { readonly abilityGameId: number; readonly reportTimeMs: number };
        readonly overlap: { readonly state: string };
      }[];
      readonly subjectSources: readonly number[];
    };
  } | null;
  readonly healerFindings:
    | { readonly assessment: "ASSESSED"; readonly set: HealerFindingSet }
    | { readonly assessment: "NOT_ASSESSED"; readonly reason: string };
}

interface Case {
  readonly label: string;
  readonly specId: SpecId;
  readonly registration: AnalyzerRegistration;
  readonly analyzerId: string;
  readonly className: string;
  readonly specName: string;
  readonly required: { readonly scope: string; readonly categories: readonly string[] };
  /** HEAL-B1P promoted the two healers that passed the healer promotion gate. */
  readonly exposure: "PUBLIC" | "INTERNAL_ONLY";
}

const CASES: readonly Case[] = [
  {
    label: "Holy Paladin",
    specId: "paladin/holy",
    registration: HOLY_PALADIN_REGISTRATION,
    analyzerId: "paladin-holy-healer-findings",
    className: "Paladin",
    specName: "Holy",
    required: HOLY_PALADIN_REQUIRED_INPUTS,
    exposure: "PUBLIC",
  },
  {
    label: "Restoration Druid",
    specId: "druid/restoration",
    registration: RESTORATION_DRUID_REGISTRATION,
    analyzerId: "druid-restoration-healer-findings",
    className: "Druid",
    specName: "Restoration",
    required: RESTORATION_DRUID_REQUIRED_INPUTS,
    exposure: "INTERNAL_ONLY",
  },
  {
    label: "Mistweaver Monk",
    specId: "monk/mistweaver",
    registration: MISTWEAVER_MONK_REGISTRATION,
    analyzerId: "monk-mistweaver-healer-findings",
    className: "Monk",
    specName: "Mistweaver",
    required: MISTWEAVER_MONK_REQUIRED_INPUTS,
    exposure: "PUBLIC",
  },
  {
    label: "Holy Priest",
    specId: "priest/holy",
    registration: HOLY_PRIEST_REGISTRATION,
    analyzerId: "priest-holy-healer-findings",
    className: "Priest",
    specName: "Holy",
    required: HOLY_PRIEST_REQUIRED_INPUTS,
    exposure: "PUBLIC",
  },
  {
    label: "Discipline Priest",
    specId: "priest/discipline",
    registration: DISCIPLINE_PRIEST_REGISTRATION,
    analyzerId: "priest-discipline-healer-findings",
    className: "Priest",
    specName: "Discipline",
    required: DISCIPLINE_PRIEST_REQUIRED_INPUTS,
    exposure: "INTERNAL_ONLY",
  },
  {
    label: "Preservation Evoker",
    specId: "evoker/preservation",
    registration: PRESERVATION_EVOKER_REGISTRATION,
    analyzerId: "evoker-preservation-healer-findings",
    className: "Evoker",
    specName: "Preservation",
    required: PRESERVATION_EVOKER_REQUIRED_INPUTS,
    exposure: "INTERNAL_ONLY",
  },
];

function registrationOf(specId: SpecId): AnalyzerRegistration {
  const found = internalAnalyzerForSpec(specId, PRODUCTION_CATALOG);
  if (found === null) throw new Error(`no ${specId} registration`);
  return found;
}

function internalRun(
  specId: SpecId,
  fight: CombatFight,
  actorId: number,
  plan: RaidCooldownPlan | null = null,
) {
  const input: SpecAnalysisInput = {
    state: createCombatState(fight),
    actorId,
    specId,
    targetActorId: null,
    raidCooldownPlan: plan,
  };
  const run = runAnalyzer(registrationOf(specId), input);
  if (!run.ok) throw new Error(run.detail);
  expect(run.analysis.status).not.toBe("ANALYZED");
  return run.analysis as unknown as HealerAnalysis;
}

function setOf(analysis: HealerAnalysis): HealerFindingSet {
  if (analysis.healerFindings.assessment !== "ASSESSED") {
    throw new Error(`not assessed: ${analysis.healerFindings.reason}`);
  }
  return analysis.healerFindings.set;
}

describe.each(CASES)("the $label registration row", (testCase) => {
  it("is the listed row with its exposure: only a PUBLIC row is reached by the public lookup and identity table", () => {
    const registration = registrationOf(testCase.specId);
    expect(ANALYZER_REGISTRATIONS.filter((row) => row === testCase.registration)).toHaveLength(1);
    expect(registration.analyzerId).toBe(testCase.analyzerId);
    expect(registration.exposure).toBe(testCase.exposure);
    const resolved = resolveSpecIdentity({ className: testCase.className, specName: testCase.specName });
    if (testCase.exposure === "INTERNAL_ONLY") {
      expect(analyzerForSpec(testCase.specId, PRODUCTION_CATALOG)).toBeNull();
      expect(resolved.ok).toBe(false);
      expect(registration.publicLimits).toEqual({ analysis: "", raidNight: "" });
      expect(registration.healerView).toBeUndefined();
      return;
    }
    expect(analyzerForSpec(testCase.specId, PRODUCTION_CATALOG)).toBe(registration);
    expect(resolved).toEqual({ ok: true, specId: testCase.specId });
    expect(registration.publicLimits.analysis).toContain(
      `${testCase.label} analysis reports HEALER FINDINGS ONLY`,
    );
    expect(registration.publicLimits.raidNight).toContain(
      `${testCase.label} cells evaluate no gameplay decision`,
    );
    expect(registration.healerView).toBeTypeOf("function");
  });

  it("declares the three provider-less healer families from REQUIRED_INPUTS, binds nothing, and derives FULL_RAID", () => {
    const registration = registrationOf(testCase.specId);
    expect(validateCapabilities(registration.capabilities)).toEqual([]);
    expect(registration.capabilities.map((capability) => capability.domain)).toEqual([
      "COOLDOWN_ASSIGNMENT",
      "HEALING_COOLDOWN",
      "HEALING_DECISION",
    ]);
    for (const capability of registration.capabilities) {
      expect(capability.requirements.scope).toBe(testCase.required.scope);
      expect(capability.requirements.evidenceCategories).toEqual([...testCase.required.categories]);
      expect(capability.requirements.resources).toEqual([]);
      expect(capability.requirements.targetModel).toBe("NO_TARGET");
    }
    expect(registration.authorityBindings).toEqual([]);
    expect(registration.requirement).toEqual({
      analyzerId: testCase.analyzerId,
      requiredScope: "FULL_RAID",
      includeResources: false,
    });
    expect(deriveIngestionScopeFor([registration, { requirement: PREPARATION_REQUIREMENT }])).toEqual({
      ok: true,
      scope: "FULL_RAID",
      contributingAnalyzers: [testCase.analyzerId],
    });
    for (const domain of ["COOLDOWN_ASSIGNMENT", "HEALING_COOLDOWN", "HEALING_DECISION"] as const) {
      expect(registration.authority.forDomain(domain).outcome).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    }
  });

  it("has no observed-decision view: asking for one throws rather than returning an empty one", () => {
    expect(() =>
      testCase.registration.observedDecisionView({
        status: "ANALYZED",
        specId: testCase.specId,
        authority: { authorityId: "SIMC_APL_FORGED" },
      } as never),
    ).toThrow();
  });

  it("a subject with no stated specialization is INSUFFICIENT_EVIDENCE: no identity is assumed", () => {
    const analysis = internalRun(testCase.specId, m5d2Fight(), M5D2_ACTOR);
    expect(analysis.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(analysis.evaluation).toBeNull();
    expect(analysis.healerFindings).toEqual({
      assessment: "NOT_ASSESSED",
      reason: "SUBJECT_SPECIALIZATION_NOT_STATED",
    });
  });

  it("a public request dispatches the row exactly once when PUBLIC, and is SPEC_NOT_SUPPORTED with no dispatch when INTERNAL_ONLY", async () => {
    const fight = m5d2Fight();
    const identity: FightIdentity = {
      report: { code: fight.report.code, revision: fight.report.revision, startTime: 0, endTime: 1 },
      data: fight.data,
      fight: {
        id: fight.fight.id,
        name: fight.fight.name,
        encounterId: fight.fight.encounterId,
        difficulty: fight.fight.difficulty,
        startTime: fight.fight.startTimeMs,
        endTime: fight.fight.endTimeMs,
      },
      player: {
        sourceId: M5D2_ACTOR,
        name: "Fixtureplayer",
        className: testCase.className,
        specName: testCase.specName,
      },
    };
    const counted = countedProductionCatalog();
    const result = await analyzeFight(D2_REQUEST, {
      env: MCP_TEST_ENV,
      registry: counted.registry,
      preflight: async () => ({ ok: true, identity, rateLimit: undefined }),
      ingest: async () => ({ ok: true, fight: m5d2Fight(), rateLimit: undefined }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (testCase.exposure === "INTERNAL_ONLY") {
      expect(result.analysis.analysis.status).toBe("SPEC_NOT_SUPPORTED");
      expect(result.analysis.specId).toBeNull();
      for (const [analyzerId, calls] of Object.entries(counted.calls)) expect(calls, analyzerId).toBe(0);
      return;
    }
    // The fixture states no specialization for the subject: the dispatched row
    // refuses to assume one, never a SPEC_NOT_SUPPORTED and never ANALYZED.
    expect(result.analysis.analysis.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.analysis.specId).toBe(testCase.specId);
    for (const [analyzerId, calls] of Object.entries(counted.calls)) {
      expect(calls, analyzerId).toBe(analyzerId === testCase.analyzerId ? 1 : 0);
    }
  });
});

describe("the internal path over committed real evidence", () => {
  let m13a: CombatFight;
  let b1pm: CombatFight;

  beforeAll(async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
    m13a = bundleOf(
      loaded.archive,
      ["wcl-m13a-aug1-fight-1-support.seg-0-75", "wcl-m13a-aug1-fight-1-support.seg-75-151"],
      [],
      { catalogArtifactId: "wcl-m13a-fight-context-aug1-fight-1" },
    ).fight;
    b1pm = bundleOf(
      loaded.archive,
      [
        "wcl-b1pm-fight-48-friendly-players.seg-69500-72500",
        "wcl-b1pm-fight-48-friendly-players.seg-72500-75500",
        "wcl-b1pm-fight-48-friendly-players.seg-75500-77000",
      ],
      [],
      { catalogArtifactId: "wcl-fight-context-b1pm-fight-48" },
    ).fight;
  });

  it("the M13-A Holy Paladin (actor 5): its two observed casts, as facts, with an UNKNOWN listing", () => {
    const analysis = internalRun("paladin/holy", m13a, 5);
    expect(analysis.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(analysis.subjectSpecialization).toMatchObject({
      state: "STATED",
      className: "Paladin",
      specName: "Holy",
    });
    const cooldowns = analysis.evaluation?.cooldowns;
    if (cooldowns === undefined) throw new Error("not evaluated");
    // Checked against the raw segments: actor 5's only casts of identified ids.
    expect(cooldowns.uses.map((use) => [use.cast.abilityGameId, use.cast.reportTimeMs])).toEqual([
      [31884, 184_987],
      [31821, 272_367],
    ]);
    // The capture is filtered: the uses it holds are facts, not every use.
    expect(cooldowns.listing).toEqual({
      state: "UNKNOWN",
      reason: "INSUFFICIENT_COVERAGE",
      unidentifiedCasts: 0,
    });
    // The capture is no FULL_RAID retrieval: no overlap list is claimed.
    expect(cooldowns.uses.map((use) => use.overlap.state)).toEqual([
      "ROSTER_NOT_IN_SCOPE",
      "ROSTER_NOT_IN_SCOPE",
    ]);
    const set = setOf(analysis);
    expect(set.spec).toBe("paladin/holy");
    expect(set.categories).toEqual([
      { category: "ASSIGNMENT", resolution: "NO_AUTHORITY_AVAILABLE", reason: "NO_RAID_COOLDOWN_PLAN" },
      {
        category: "COOLDOWN",
        resolution: "OBSERVED",
        authority: "WCL_OBSERVED_FACT",
        listing: { completeness: "UNKNOWN", reason: "INSUFFICIENT_COVERAGE" },
      },
      {
        category: "HEALING_DECISION",
        resolution: "NO_AUTHORITY_AVAILABLE",
        reason: "NO_APPROVED_PER_CAST_HEALER_MODEL",
      },
    ]);
    expect(set.findings.map((finding) => [finding.findingId, finding.category, finding.authority])).toEqual([
      ["paladin/holy:COOLDOWN:705", "COOLDOWN", "WCL_OBSERVED_FACT"],
      ["paladin/holy:COOLDOWN:3315", "COOLDOWN", "WCL_OBSERVED_FACT"],
    ]);
    expect(JSON.stringify(analysis)).not.toMatch(/MISSED|wrong|incorrect|mistake|should/i);
  });

  it("a stated Holy Paladin run as another healer is refused, never evaluated as that one", () => {
    for (const specId of [
      "druid/restoration",
      "monk/mistweaver",
      "priest/holy",
      "priest/discipline",
      "evoker/preservation",
    ] as const) {
      const analysis = internalRun(specId, m13a, 5);
      expect(analysis.status).toBe("INSUFFICIENT_EVIDENCE");
      expect(analysis.evaluation).toMatchObject({
        state: "IDENTITY_REFUSED",
        reason: "NOT_THIS_SPECIALIZATION",
      });
      expect(analysis.healerFindings).toEqual({ assessment: "NOT_ASSESSED", reason: "IDENTITY_REFUSED" });
    }
  });

  it.each([
    ["paladin/holy", 1, [1]],
    ["monk/mistweaver", 9, [9, 55, 58, 60, 214]],
  ] as const)(
    "b1pm fight 48 %s (actor %i): a window with none of its casts lists no use and says UNKNOWN, never 'none used'",
    (specId, actorId, sources) => {
      const analysis = internalRun(specId, b1pm, actorId);
      expect(analysis.status).toBe("AUTHORITY_NOT_AVAILABLE");
      expect(analysis.evaluation?.state).toBe("EVALUATED");
      expect(analysis.evaluation?.cooldowns?.uses).toEqual([]);
      expect(analysis.evaluation?.cooldowns?.listing).toEqual({
        state: "UNKNOWN",
        reason: "INSUFFICIENT_COVERAGE",
        unidentifiedCasts: 0,
      });
      expect(analysis.evaluation?.cooldowns?.subjectSources).toEqual([...sources]);
      expect(setOf(analysis).findings).toEqual([]);
      expect(setOf(analysis).categories[1]).toMatchObject({ listing: { completeness: "UNKNOWN" } });
    },
  );
});

/**
 * HEAL-A: the Restoration Shaman registration (INTERNAL_ONLY), the healer
 * provider-less domains it is the first to declare, and its results in the
 * shared healer finding shape.
 *
 * What must hold, and what must NOT happen:
 * - the FULL_RAID requirement is DERIVED from the declared capabilities,
 *   which are read from `RESTORATION_SHAMAN_REQUIRED_INPUTS`;
 * - COOLDOWN_ASSIGNMENT, HEALING_COOLDOWN and HEALING_DECISION resolve
 *   NO_PINNED_AUTHORITY_FOR_DOMAIN from the registration's own access, nothing
 *   can bind them, and the result is never ANALYZED;
 * - the public lookup never selects it: a public request for a Restoration
 *   Shaman is SPEC_NOT_SUPPORTED and dispatches nothing;
 * - over the real M12-D subject, the internal path yields exactly the
 *   evaluator's result under the preflight identity, and its finding set:
 *   - no plan: ASSIGNMENT is NO_AUTHORITY_AVAILABLE and there is no
 *     assignment finding, never an inferred one;
 *   - a plan for this fight: one finding per entry for this player, each
 *     citing the plan; MET carries its cast as evidence and positive
 *     actionability; an undecided entry is UNKNOWN, never an outcome;
 *   - another fight's plan is NO_AUTHORITY_AVAILABLE, an unprovable binding
 *     UNKNOWN; the two are never interchanged;
 *   - COOLDOWN is observed facts (WCL_OBSERVED_FACT) with their listing
 *     completeness, and HEALING_DECISION is NO_AUTHORITY_AVAILABLE;
 * - a subject whose identity is not established yields no finding set;
 * - no HPS, ranking, score or cooldown-quality verdict appears anywhere.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { PREPARATION_REQUIREMENT } from "../../../src/analysis/preparation/requirement.js";
import type { RestorationShamanHealingCooldownLoad } from "../../../src/data/game/shaman-restoration-healing-cooldowns.js";
import type { CombatFight } from "../../../src/engine/normalization/combat-fight.js";
import { statedSpecializationOf } from "../../../src/engine/normalization/friendly-specializations.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import type { SpecAnalysisInput } from "../../../src/findings/analysis-envelope.js";
import {
  resolveAuthorityForDomain,
  type AuthorityDomainBinding,
} from "../../../src/findings/authority-domain.js";
import { validateCapabilities } from "../../../src/findings/decision-capability.js";
import type { HealerFinding, HealerFindingSet } from "../../../src/findings/healer-finding.js";
import type { RaidCooldownAssignment, RaidCooldownPlan } from "../../../src/raid-plan/raid-cooldown-plan.js";
import { analyzeFight } from "../../../src/services/analysis-service.js";
import {
  ANALYZER_REGISTRATIONS,
  analyzerForSpec,
  internalAnalyzerForSpec,
  PRODUCTION_CATALOG,
  runAnalyzer,
  validateAnalyzerCatalog,
  type AnalyzerRegistration,
} from "../../../src/services/analyzer-registry.js";
import { deriveIngestionScopeFor } from "../../../src/services/ingestion-scope.js";
import { resolveSpecIdentity } from "../../../src/services/spec-identity.js";
import { evaluateRestorationShaman } from "../../../src/specs/shaman/restoration/evaluator.js";
import {
  analyzeRestorationShaman,
  RESTORATION_SHAMAN_AUTHORITY_BINDINGS,
  RESTORATION_SHAMAN_CAPABILITIES,
  RESTORATION_SHAMAN_REGISTRATION,
  type RestorationShamanAnalysis,
} from "../../../src/specs/shaman/restoration/registration.js";
import {
  RESTORATION_SHAMAN_ANALYZER_ID,
  RESTORATION_SHAMAN_REQUIRED_INPUTS,
  RESTORATION_SHAMAN_SPEC_ID,
} from "../../../src/specs/shaman/restoration/spec.js";
import type { FightIdentity } from "../../../src/wcl/types.js";
import { D2_REQUEST, MCP_TEST_ENV } from "../../support/analysis-transports.js";
import { countedProductionCatalog, productionCatalogWith } from "../../support/catalog.js";
import { loadCommittedEvidenceArchive } from "../../support/corpus/evidence-archive.js";
import { bundleOf } from "../../support/corpus/fight.js";
import { M5D2_ACTOR, m5d2Fight } from "../../support/m5d2-fixture.js";

const SHAMAN = 122;
const SLT = 98008;
const ASCENDANCE = 114052;
const CHAIN_HEAL = 1064;
const FIGHT_START = 7_436_292;
const FIGHT_END = 7_781_469;

function registrationOf(): AnalyzerRegistration {
  const found = internalAnalyzerForSpec(RESTORATION_SHAMAN_SPEC_ID, PRODUCTION_CATALOG);
  if (found === null) throw new Error("no Restoration Shaman registration");
  return found;
}

function internalRun(
  fight: CombatFight,
  actorId: number,
  plan: RaidCooldownPlan | null = null,
): RestorationShamanAnalysis {
  const input: SpecAnalysisInput = {
    state: createCombatState(fight),
    actorId,
    specId: RESTORATION_SHAMAN_SPEC_ID,
    targetActorId: null,
    raidCooldownPlan: plan,
  };
  const run = runAnalyzer(registrationOf(), input);
  if (!run.ok) throw new Error(run.detail);
  expect(run.analysis.status).not.toBe("ANALYZED");
  return run.analysis as unknown as RestorationShamanAnalysis;
}

function setOf(analysis: RestorationShamanAnalysis): HealerFindingSet {
  if (analysis.healerFindings.assessment !== "ASSESSED") {
    throw new Error(`not assessed: ${analysis.healerFindings.reason}`);
  }
  return analysis.healerFindings.set;
}

const findingsOf = <C extends HealerFinding["category"]>(
  set: HealerFindingSet,
  category: C,
): Extract<HealerFinding, { category: C }>[] =>
  set.findings.filter(
    (finding): finding is Extract<HealerFinding, { category: C }> => finding.category === category,
  );

const assign = (
  assignmentId: string,
  plannedReportTimeMs: number,
  name: string,
  toleranceMs = 2_000,
  abilityId = SLT,
): RaidCooldownAssignment => ({
  assignmentId,
  player: { name, realm: null },
  abilityId,
  plannedTime: { kind: "FIGHT_RELATIVE", offsetMs: plannedReportTimeMs - FIGHT_START },
  toleranceMs,
  toleranceSource: "ASSIGNMENT",
  source: { lineNumber: null, index: 0, rawLine: null },
  context: { bossSpellId: null },
});

const planOf = (
  encounter: RaidCooldownPlan["encounter"],
  assignments: readonly RaidCooldownAssignment[],
): RaidCooldownPlan => ({
  schema: "raid-cooldown-plan/1",
  authority: "USER_PROVIDED_RAID_PLAN",
  encounter,
  source: { format: "STRUCTURED", label: "heal-a test plan" },
  tolerance: { defaultToleranceMs: null },
  assignments,
  importDiagnostics: [],
});

const PLAN_AUTHORITY = { kind: "USER_PROVIDED_RAID_PLAN", format: "STRUCTURED", label: "heal-a test plan" };

describe("the registration row", () => {
  it("is the listed INTERNAL_ONLY row: the public lookup and the public identity table never reach it", () => {
    const registration = registrationOf();
    expect(ANALYZER_REGISTRATIONS.filter((row) => row === RESTORATION_SHAMAN_REGISTRATION)).toHaveLength(1);
    expect(registration.analyzerId).toBe(RESTORATION_SHAMAN_ANALYZER_ID);
    expect(registration.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec(RESTORATION_SHAMAN_SPEC_ID, PRODUCTION_CATALOG)).toBeNull();
    expect(resolveSpecIdentity({ className: "Shaman", specName: "Restoration" }).ok).toBe(false);
    expect(registration.publicLimits).toEqual({ analysis: "", raidNight: "" });
  });

  it("declares the three provider-less healer families from REQUIRED_INPUTS, and binds nothing", () => {
    const registration = registrationOf();
    expect(validateCapabilities(registration.capabilities)).toEqual([]);
    expect(registration.capabilities.map((capability) => capability.domain)).toEqual([
      "COOLDOWN_ASSIGNMENT",
      "HEALING_COOLDOWN",
      "HEALING_DECISION",
    ]);
    for (const capability of registration.capabilities) {
      expect(capability.requirements.scope).toBe(RESTORATION_SHAMAN_REQUIRED_INPUTS.scope);
      expect(capability.requirements.evidenceCategories).toEqual([
        ...RESTORATION_SHAMAN_REQUIRED_INPUTS.categories,
      ]);
      expect(capability.requirements.resources).toEqual([]);
      expect(capability.requirements.targetModel).toBe("NO_TARGET");
    }
    expect(registration.authorityBindings).toEqual([]);
    expect(RESTORATION_SHAMAN_AUTHORITY_BINDINGS).toEqual([]);
    expect(Object.isFrozen(RESTORATION_SHAMAN_CAPABILITIES)).toBe(true);
  });

  it("its FULL_RAID requirement is derived, and widens scope derivation alongside preparation", () => {
    const registration = registrationOf();
    expect(registration.requirement).toEqual({
      analyzerId: RESTORATION_SHAMAN_ANALYZER_ID,
      requiredScope: "FULL_RAID",
      includeResources: false,
    });
    expect(deriveIngestionScopeFor([registration, { requirement: PREPARATION_REQUIREMENT }])).toEqual({
      ok: true,
      scope: "FULL_RAID",
      contributingAnalyzers: [RESTORATION_SHAMAN_ANALYZER_ID],
    });
  });

  it("resolves every healer family NO_PINNED_AUTHORITY_FOR_DOMAIN, and an undeclared domain DOMAIN_NOT_DECLARED", () => {
    const { authority } = registrationOf();
    for (const domain of ["COOLDOWN_ASSIGNMENT", "HEALING_COOLDOWN", "HEALING_DECISION"] as const) {
      expect(authority.forDomain(domain).outcome, domain).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    }
    expect(authority.forDomain("OFFENSIVE_ROTATION").outcome).toBe("DOMAIN_NOT_DECLARED");
    expect(authority.forDomain("SUPPORT_TARGETING").outcome).toBe("DOMAIN_NOT_DECLARED");
  });

  it("a healer family cannot be bound: a forged binding is refused by the catalog and ignored by resolution", () => {
    const blood = ANALYZER_REGISTRATIONS.find((row) => row.specId === "deathknight/blood");
    if (blood === undefined) throw new Error("no Blood row");
    const forged = {
      ...(blood.authorityBindings[0] as AuthorityDomainBinding),
      domain: "COOLDOWN_ASSIGNMENT",
    } as unknown as AuthorityDomainBinding;
    const forgedRow = { ...RESTORATION_SHAMAN_REGISTRATION, authorityBindings: [forged] };
    const validation = validateAnalyzerCatalog(
      ANALYZER_REGISTRATIONS.map((row) => (row === RESTORATION_SHAMAN_REGISTRATION ? forgedRow : row)),
    );
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.defects.map((defect) => defect.defect)).toContain("PROVIDER_DOMAIN_INCOMPATIBLE");
    expect(resolveAuthorityForDomain(["COOLDOWN_ASSIGNMENT"], [forged], "COOLDOWN_ASSIGNMENT").outcome).toBe(
      "NO_PINNED_AUTHORITY_FOR_DOMAIN",
    );
  });

  it("has no observed-decision view: asking for one throws rather than returning an empty one", () => {
    expect(() =>
      RESTORATION_SHAMAN_REGISTRATION.observedDecisionView({
        status: "ANALYZED",
        specId: RESTORATION_SHAMAN_SPEC_ID,
        authority: { authorityId: "SIMC_APL_FORGED" },
      } as never),
    ).toThrow();
    expect(RESTORATION_SHAMAN_REGISTRATION.supportObservationView).toBeUndefined();
  });
});

describe("the public path never reaches it", () => {
  const fight = m5d2Fight();
  const identity = (className: string, specName: string): FightIdentity => ({
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
    player: { sourceId: M5D2_ACTOR, name: "Fixtureplayer", className, specName },
  });

  it("a public request for a Restoration Shaman is SPEC_NOT_SUPPORTED and dispatches no analyzer", async () => {
    const counted = countedProductionCatalog();
    const result = await analyzeFight(D2_REQUEST, {
      env: MCP_TEST_ENV,
      registry: counted.registry,
      preflight: async () => ({
        ok: true,
        identity: identity("Shaman", "Restoration"),
        rateLimit: undefined,
      }),
      ingest: async () => ({ ok: true, fight: m5d2Fight(), rateLimit: undefined }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.analysis.status).toBe("SPEC_NOT_SUPPORTED");
    expect(result.analysis.specId).toBeNull();
    for (const [analyzerId, calls] of Object.entries(counted.calls)) expect(calls, analyzerId).toBe(0);
  });

  it("the service hands the selected analyzer the request's plan untouched, and null without one", async () => {
    const seen: (RaidCooldownPlan | null | undefined)[] = [];
    const rogue = ANALYZER_REGISTRATIONS.find((row) => row.specId === "rogue/assassination");
    if (rogue === undefined) throw new Error("no Assassination row");
    const observing: AnalyzerRegistration = {
      ...rogue,
      analyze: (input) => {
        seen.push(input.raidCooldownPlan);
        return rogue.analyze(input);
      },
    };
    const deps = {
      env: MCP_TEST_ENV,
      registry: productionCatalogWith(observing),
      preflight: async () => ({
        ok: true as const,
        identity: identity("Rogue", "Assassination"),
        rateLimit: undefined,
      }),
      ingest: async () => ({ ok: true as const, fight: m5d2Fight(), rateLimit: undefined }),
    };
    const encounter = { encounterId: fight.fight.encounterId, difficulty: fight.fight.difficulty ?? 0 };
    const supplied = {
      format: "STRUCTURED",
      ...encounter,
      assignments: [
        {
          player: { name: "Jymblu", realm: null },
          abilityId: SLT,
          plannedTime: { kind: "FIGHT_RELATIVE", offsetMs: 60_000 },
          toleranceMs: 2_000,
        },
      ],
    };
    expect((await analyzeFight(D2_REQUEST, deps)).ok).toBe(true);
    expect((await analyzeFight({ ...D2_REQUEST, raidCooldownPlan: supplied }, deps)).ok).toBe(true);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBeNull();
    expect(seen[1]).toMatchObject({
      authority: "USER_PROVIDED_RAID_PLAN",
      encounter,
      assignments: [{ abilityId: SLT, player: { name: "Jymblu" } }],
    });
  });
});

describe("the internal path over the real Restoration Shaman (b1PmaKrd6CDfzngc fight 48, actor 122)", () => {
  const SEGMENTS = [
    "wcl-b1pm-fight-48-restoration-shaman-122-casts.seg-0-180",
    "wcl-b1pm-fight-48-restoration-shaman-122-casts.seg-180-345",
  ];
  const CONTEXT = "wcl-fight-context-b1pm-fight-48";
  /** The composed fight, with the encounter bounds and binding the committed context states. */
  let fight: CombatFight;
  /** The same fight with the committed context's roster declared in scope. */
  let rostered: CombatFight;
  let name: string;
  let bound: RaidCooldownPlan["encounter"];

  beforeAll(async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
    const context = loaded.archive.referenceableArtifacts.find(
      (entry) => entry.record.artifactId === CONTEXT,
    );
    if (context === undefined) throw new Error("no context");
    const row = (
      context.json as {
        reportData: {
          report: {
            fights: {
              startTime: number;
              endTime: number;
              encounterID: number;
              difficulty: number;
              friendlyPlayers: number[];
            }[];
          };
        };
      }
    ).reportData.report.fights[0];
    if (row === undefined) throw new Error("no fight row");
    const composed = bundleOf(loaded.archive, SEGMENTS, [], { catalogArtifactId: CONTEXT }).fight;
    expect([row.startTime, row.endTime]).toEqual([FIGHT_START, FIGHT_END]);
    fight = {
      ...composed,
      fight: {
        ...composed.fight,
        encounterId: row.encounterID,
        difficulty: row.difficulty,
        startTimeMs: row.startTime,
        endTimeMs: row.endTime,
        durationMs: row.endTime - row.startTime,
      },
    };
    rostered = {
      ...fight,
      breadth: { ...fight.breadth, scope: "FULL_RAID", friendlyActorsInScope: row.friendlyPlayers },
    };
    const stated = fight.actors.get(SHAMAN)?.name;
    if (stated === null || stated === undefined) throw new Error("no name for 122");
    name = stated;
    bound = { encounterId: row.encounterID, difficulty: row.difficulty };
  });

  it("no plan: AUTHORITY_NOT_AVAILABLE, the evaluator's exact result, and no assignment finding", () => {
    const analysis = internalRun(fight, SHAMAN);
    expect(analysis.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(analysis.specId).toBe(RESTORATION_SHAMAN_SPEC_ID);
    expect(analysis.planSupplied).toBe(false);
    expect(analysis.domains).toEqual([
      { domain: "COOLDOWN_ASSIGNMENT", resolution: "NO_PINNED_AUTHORITY_FOR_DOMAIN" },
      { domain: "HEALING_COOLDOWN", resolution: "NO_PINNED_AUTHORITY_FOR_DOMAIN" },
      { domain: "HEALING_DECISION", resolution: "NO_PINNED_AUTHORITY_FOR_DOMAIN" },
    ]);
    expect(analysis.subjectSpecialization).toMatchObject({
      state: "STATED",
      className: "Shaman",
      specName: "Restoration",
    });

    // The facade's identity reads the same friendlySpecs entry preflight does,
    // and the actor catalog's name, so its result is the evaluator's under a
    // preflight identity.
    expect(analysis.evaluation).toEqual(
      evaluateRestorationShaman({
        fight,
        identity: {
          report: { code: fight.report.code },
          fight: { id: fight.fight.id },
          player: { sourceId: SHAMAN, name, className: "Shaman", specName: "Restoration" },
        },
        plan: null,
      }),
    );

    const set = setOf(analysis);
    expect(set.revision).toBe("healer-findings/1");
    expect(set.categories).toEqual([
      { category: "ASSIGNMENT", resolution: "NO_AUTHORITY_AVAILABLE", reason: "NO_RAID_COOLDOWN_PLAN" },
      {
        category: "COOLDOWN",
        resolution: "OBSERVED",
        authority: "WCL_OBSERVED_FACT",
        listing: { completeness: "COMPLETE" },
      },
      {
        category: "HEALING_DECISION",
        resolution: "NO_AUTHORITY_AVAILABLE",
        reason: "NO_APPROVED_PER_CAST_HEALER_MODEL",
      },
    ]);
    // Never an inferred assignment.
    expect(findingsOf(set, "ASSIGNMENT")).toEqual([]);
    // The four real healing-cooldown casts, each an observed fact with its cast as evidence.
    const cooldowns = findingsOf(set, "COOLDOWN");
    expect(cooldowns.map((finding) => [finding.subject.abilityGameId, finding.subject.reportTimeMs])).toEqual(
      [
        [ASCENDANCE, 7_469_039],
        [SLT, 7_543_726],
        [ASCENDANCE, 7_666_386],
        [SLT, 7_776_617],
      ],
    );
    for (const finding of cooldowns) {
      expect(finding.authority).toBe("WCL_OBSERVED_FACT");
      expect(finding.result).toEqual({ resolution: "OBSERVED" });
      expect(finding.evidence).toHaveLength(1);
      expect(finding.findingId).toBe(`shaman/restoration:COOLDOWN:${String(finding.subject.position)}`);
    }
  });

  it("a plan for this fight: one finding per entry for this player, each citing the plan", () => {
    const plan = planOf(bound, [
      assign("slt-1", 7_544_000, name),
      assign("slt-200s", 7_636_292, name, 3_000),
      assign("after-kill", 7_790_000, name),
      assign("chain-heal", 7_500_000, name, 2_000, CHAIN_HEAL),
      assign("someone-else", 7_544_000, "Notinthisraid"),
    ]);
    const analysis = internalRun(rostered, SHAMAN, plan);
    expect(analysis.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(analysis.planSupplied).toBe(true);
    const set = setOf(analysis);
    expect(set.categories[0]).toEqual({
      category: "ASSIGNMENT",
      resolution: "EVALUATED_AGAINST_PLAN",
      authority: PLAN_AUTHORITY,
      assignmentsForOtherPlayers: 1,
    });
    const assignments = findingsOf(set, "ASSIGNMENT");
    expect(
      assignments.map((finding) => [
        finding.findingId,
        finding.result.resolution,
        "outcome" in finding.result ? finding.result.outcome : finding.result.reason,
      ]),
    ).toEqual([
      ["shaman/restoration:ASSIGNMENT:slt-1", "OUTCOME", "ASSIGNMENT_MET"],
      ["shaman/restoration:ASSIGNMENT:slt-200s", "UNKNOWN", "READINESS_NOT_ESTABLISHED"],
      ["shaman/restoration:ASSIGNMENT:after-kill", "OUTCOME", "ASSIGNMENT_NOT_ACTIONABLE"],
      ["shaman/restoration:ASSIGNMENT:chain-heal", "UNKNOWN", "ABILITY_NOT_REGISTERED"],
    ]);
    for (const finding of assignments) expect(finding.authority).toEqual(PLAN_AUTHORITY);

    const [met, unknown, ended] = assignments;
    if (met?.result.resolution !== "OUTCOME") throw new Error("expected MET");
    // MET rests on the player's own cast, which is its positive actionability evidence.
    expect(met.result.actionability).toMatchObject({
      status: "PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION",
      abilityGameId: SLT,
    });
    expect(met.evidence).toHaveLength(1);
    // An undecided entry is UNKNOWN, carries no outcome, and is never an early or late claim.
    expect(unknown?.result).toEqual({ resolution: "UNKNOWN", reason: "READINESS_NOT_ESTABLISHED" });
    // The encounter ended before the window: an outcome resting on the fight's end, not on a cast.
    expect(ended?.result).toMatchObject({
      resolution: "OUTCOME",
      actionability: { status: "NOT_EVALUATED" },
    });
    expect(ended?.evidence).toEqual([]);
  });

  it("another fight's plan is NO_AUTHORITY_AVAILABLE; an unprovable binding is UNKNOWN; neither yields a finding", () => {
    const elsewhere = internalRun(
      rostered,
      SHAMAN,
      planOf({ ...bound, encounterId: bound.encounterId + 1 }, [assign("x", 7_544_000, name)]),
    );
    expect(setOf(elsewhere).categories[0]).toEqual({
      category: "ASSIGNMENT",
      resolution: "NO_AUTHORITY_AVAILABLE",
      reason: "PLAN_NOT_FOR_THIS_FIGHT",
    });
    expect(findingsOf(setOf(elsewhere), "ASSIGNMENT")).toEqual([]);

    const undated: CombatFight = { ...rostered, fight: { ...rostered.fight, difficulty: null } };
    const unknown = internalRun(undated, SHAMAN, planOf(bound, [assign("x", 7_544_000, name)]));
    expect(setOf(unknown).categories[0]).toEqual({
      category: "ASSIGNMENT",
      resolution: "UNKNOWN",
      authority: PLAN_AUTHORITY,
      reason: "ENCOUNTER_BINDING_UNKNOWN",
    });
    expect(findingsOf(setOf(unknown), "ASSIGNMENT")).toEqual([]);
  });

  it("a subject with no stated name keeps every unresolved plan entry as possibly its own", () => {
    // Without the roster no name resolves. With the subject's name known, an
    // entry naming someone else is another player's; with no name stated it
    // may be this one, so it is UNKNOWN, never silently someone else's.
    const plan = planOf(bound, [assign("other-name", 7_544_000, "Notinthisraid")]);
    const named = setOf(internalRun(fight, SHAMAN, plan));
    expect(named.categories[0]).toMatchObject({
      resolution: "EVALUATED_AGAINST_PLAN",
      assignmentsForOtherPlayers: 1,
    });
    expect(findingsOf(named, "ASSIGNMENT")).toEqual([]);

    const actors = new Map(fight.actors);
    const subject = actors.get(SHAMAN);
    if (subject === undefined) throw new Error("no subject actor");
    actors.set(SHAMAN, { ...subject, name: null });
    const unnamed = setOf(internalRun({ ...fight, actors }, SHAMAN, plan));
    expect(unnamed.categories[0]).toMatchObject({
      resolution: "EVALUATED_AGAINST_PLAN",
      assignmentsForOtherPlayers: 0,
    });
    expect(findingsOf(unnamed, "ASSIGNMENT").map((finding) => finding.result)).toEqual([
      { resolution: "UNKNOWN", reason: "PLAYER_NOT_RESOLVED" },
    ]);
  });

  it("refuses another stated specialization: no finding set, never an assumed Restoration Shaman", () => {
    const other = [...fight.friendlySpecializations.byActorId.entries()].find(
      ([actorId, stated]) =>
        actorId !== SHAMAN && stated.state === "STATED" && stated.specName !== "Restoration",
    );
    if (other === undefined) throw new Error("no other stated player");
    const analysis = internalRun(fight, other[0]);
    expect(analysis.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(analysis.evaluation).toMatchObject({
      state: "IDENTITY_REFUSED",
      reason: "NOT_THIS_SPECIALIZATION",
    });
    expect(analysis.healerFindings).toEqual({ assessment: "NOT_ASSESSED", reason: "IDENTITY_REFUSED" });
  });

  it("a pet has no stated specialization: INSUFFICIENT_EVIDENCE, nothing evaluated", () => {
    const pet = [...fight.actors.values()].find((actor) => actor.petOwnerActorId === SHAMAN);
    if (pet === undefined) throw new Error("no pet of the subject");
    expect(statedSpecializationOf(fight.friendlySpecializations, pet.actorId)).toEqual({
      state: "UNKNOWN",
      reason: "NOT_IN_FRIENDLY_ROSTER",
    });
    const analysis = internalRun(fight, pet.actorId);
    expect(analysis.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(analysis.evaluation).toBeNull();
    expect(analysis.healerFindings).toEqual({
      assessment: "NOT_ASSESSED",
      reason: "SUBJECT_SPECIALIZATION_NOT_STATED",
    });
  });

  it("unusable runtime data is INSUFFICIENT_EVIDENCE, never an empty finding set", () => {
    const unusable = {
      ok: false,
      reason: "PINNED_ROW_MISMATCH",
    } as unknown as RestorationShamanHealingCooldownLoad;
    const analysis = analyzeRestorationShaman(
      {
        state: createCombatState(fight),
        actorId: SHAMAN,
        specId: RESTORATION_SHAMAN_SPEC_ID,
        targetActorId: null,
      },
      RESTORATION_SHAMAN_REGISTRATION.authority,
      { dataset: unusable },
    );
    expect(analysis.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(analysis.evaluation?.state).toBe("RUNTIME_DATA_UNAVAILABLE");
    expect(analysis.healerFindings).toEqual({
      assessment: "NOT_ASSESSED",
      reason: "RUNTIME_DATA_UNAVAILABLE",
    });
  });

  it("negative controls: no HPS, ranking, score, or cooldown-quality verdict anywhere in the result", () => {
    const plan = planOf(bound, [assign("slt-1", 7_544_000, name)]);
    for (const analysis of [internalRun(fight, SHAMAN), internalRun(rostered, SHAMAN, plan)]) {
      const text = JSON.stringify(analysis);
      expect(text).not.toMatch(/\b(hps|dps|score|ranking|rank|wrong|incorrect|mistake|missed|wasted)\b/i);
      expect(text).not.toMatch(/should/i);
      // A COOLDOWN finding has an observed result and nothing else.
      for (const finding of findingsOf(setOf(analysis), "COOLDOWN")) {
        expect(Object.keys(finding.result)).toEqual(["resolution"]);
      }
    }
  });
});

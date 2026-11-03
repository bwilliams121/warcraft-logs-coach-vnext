/**
 * HEAL-AP: the TEST-OWNED healer public-promotion gate.
 *
 * WHY A SECOND GATE
 *
 * The rotational gates (`m11-promotion-evidence-gate.test.ts`) measure
 * observed DECISIONS against a pinned SimulationCraft authority: a real MATCH
 * and real discrimination. A healer has no such authority (agent/
 * autopilot-queue.md, onboarding rule 3): HEALING_DECISION is
 * NO_AUTHORITY_AVAILABLE, ASSIGNMENT is judged only against a caller-supplied
 * plan, and COOLDOWN is observational. Those gates stay unchanged and exempt
 * a registration that binds no authority. This gate is the healer bar, and it
 * holds the same standard: real evidence, a published outcome set that is not
 * one-sided, identity and completeness that fail closed, and negative
 * controls, all measured on the PUBLIC document the service publishes.
 *
 * THE RULE: every PUBLIC registration that publishes a healer view must have
 * a pinned gate subject below (real, already-authorized evidence), and on it:
 *
 *   OBSERVATIONS   with no plan, COOLDOWN is OBSERVED with a COMPLETE listing
 *                  and at least one observed use, each use's evidence the
 *                  subject's own completed cast in the real capture;
 *   ASSIGNMENT     against a supplied plan bound to the fight: at least one
 *                  ASSIGNMENT_MET, resting on positive actionability proven by
 *                  the subject's own cast in the window; and DISCRIMINATION:
 *                  on the same evidence, at least one entry of an identified
 *                  cooldown is NOT met (another outcome or UNKNOWN), so the
 *                  outcome set is not one-sided; every result cites the plan,
 *                  and the plan disclosure says EVALUATED_IN_HEALER_FINDINGS;
 *   MISSING PLAN   no plan is ASSIGNMENT NO_AUTHORITY_AVAILABLE with no
 *                  assignment result, never an inferred one; another fight's
 *                  plan is NO_AUTHORITY_AVAILABLE too, an unprovable binding
 *                  UNKNOWN, and the two never trade places;
 *   IDENTITY       another stated specialization in the same fight, and a
 *                  subject with no stated specialization, are NOT_ASSESSED
 *                  with the reason, never an empty finding set;
 *   COMPLETENESS   with the subject's CASTS coverage withdrawn, the cooldown
 *                  listing is UNKNOWN and an entry with no observed cast is
 *                  UNKNOWN with the coverage reason, never a readiness claim;
 *                  at PLAYER_CONTEXT breadth the healing context is
 *                  ROSTER_NOT_IN_SCOPE, never an empty overlap;
 *   NEGATIVE       no HPS, amount, total, ranking or score key; no verdict
 *   CONTROLS       vocabulary; no cooldown-quality field; HEALING_DECISION
 *                  NO_AUTHORITY_AVAILABLE; quality flags pinned false.
 *
 * A healer that cannot pass stays INTERNAL_ONLY. Followers meet this gate;
 * none meets a weakened one. HEAL-B1P added Holy Paladin and Mistweaver Monk,
 * each on its own whole-fight casts in the same canonical fight, driven by the
 * same checks; Restoration Druid has no retained evidence and stays
 * INTERNAL_ONLY.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  PublicAnalysisResultSchema,
  type PublicAnalysisResult,
  type PublicHealerFindings,
} from "../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { PRODUCTION_CATALOG } from "../../src/services/analyzer-registry.js";
import {
  ASCENDANCE,
  AURA_MASTERY,
  AVENGING_WRATH,
  CHAIN_HEAL,
  HOLY_PALADIN_SUBJECT_ACTOR,
  HOLY_SHOCK,
  INVOKE_YULON,
  loadHolyPaladinSubject,
  loadMistweaverSubject,
  loadRestorationSubject,
  MISTWEAVER_SUBJECT_ACTOR,
  requestPlan,
  RESTORAL,
  RESTORATION_SUBJECT_ACTOR,
  restorationIdentityFor,
  restorationRunner,
  SPIRIT_LINK_TOTEM,
  VIVIFY,
  type RestorationSubject,
} from "../support/heal-ap-restoration-subject.js";

type PlanEntry = Parameters<typeof requestPlan>[2][number];

/**
 * One healer specialization's pinned gate subject: real evidence and the
 * inputs the gate drives it with. The gate checks properties of what comes
 * back; a subject states no expected outcome.
 */
interface HealerGateSubject {
  readonly specId: string;
  readonly className: string;
  readonly specName: string;
  readonly actorId: number;
  /** The identified healing cooldowns the subject's plan entries name. */
  readonly identified: readonly number[];
  readonly load: () => Promise<{
    readonly fight: CombatFight;
    readonly rostered: CombatFight;
    readonly name: string;
    readonly encounter: { readonly encounterId: number; readonly difficulty: number };
    /** Plan entries for the subject, of identified cooldowns, near and away from its real casts. */
    readonly entries: readonly PlanEntry[];
  }>;
}

const HEALER_GATE_SUBJECTS: readonly HealerGateSubject[] = [
  {
    specId: "shaman/restoration",
    className: "Shaman",
    specName: "Restoration",
    actorId: RESTORATION_SUBJECT_ACTOR,
    identified: [SPIRIT_LINK_TOTEM, ASCENDANCE],
    load: async () => {
      const subject: RestorationSubject = await loadRestorationSubject();
      return {
        ...subject,
        entries: [
          // Around the real Spirit Link Totem cast at 7,543,726.
          { name: subject.name, abilityId: SPIRIT_LINK_TOTEM, atReportTimeMs: 7_544_000, toleranceMs: 2_000 },
          // Ascendance, where the subject did not cast it.
          { name: subject.name, abilityId: ASCENDANCE, atReportTimeMs: 7_600_000, toleranceMs: 3_000 },
          // After the completed encounter's end (7,781,469).
          { name: subject.name, abilityId: SPIRIT_LINK_TOTEM, atReportTimeMs: 7_790_000, toleranceMs: 2_000 },
          // An ability the specialization does not identify.
          { name: subject.name, abilityId: CHAIN_HEAL, atReportTimeMs: 7_500_000, toleranceMs: 2_000 },
        ],
      };
    },
  },
  {
    specId: "paladin/holy",
    className: "Paladin",
    specName: "Holy",
    actorId: HOLY_PALADIN_SUBJECT_ACTOR,
    identified: [AURA_MASTERY, AVENGING_WRATH],
    load: async () => {
      const subject: RestorationSubject = await loadHolyPaladinSubject();
      return {
        ...subject,
        entries: [
          // Around the real Aura Mastery cast at 7,480,036.
          { name: subject.name, abilityId: AURA_MASTERY, atReportTimeMs: 7_480_000, toleranceMs: 2_000 },
          // Aura Mastery, where the subject did not cast it (its casts: 7,480,036 and 7,723,719).
          { name: subject.name, abilityId: AURA_MASTERY, atReportTimeMs: 7_600_000, toleranceMs: 3_000 },
          // After the completed encounter's end (7,781,469).
          { name: subject.name, abilityId: AVENGING_WRATH, atReportTimeMs: 7_790_000, toleranceMs: 2_000 },
          // An ability the specialization does not identify.
          { name: subject.name, abilityId: HOLY_SHOCK, atReportTimeMs: 7_500_000, toleranceMs: 2_000 },
        ],
      };
    },
  },
  {
    specId: "monk/mistweaver",
    className: "Monk",
    specName: "Mistweaver",
    actorId: MISTWEAVER_SUBJECT_ACTOR,
    identified: [RESTORAL, INVOKE_YULON],
    load: async () => {
      const subject: RestorationSubject = await loadMistweaverSubject();
      return {
        ...subject,
        entries: [
          // Around the real Restoral cast at 7,461,179.
          { name: subject.name, abilityId: RESTORAL, atReportTimeMs: 7_461_000, toleranceMs: 2_000 },
          // Invoke Yu'lon, where the subject did not cast it (its casts: 7,438,004, 7,558,042 and 7,678,725).
          { name: subject.name, abilityId: INVOKE_YULON, atReportTimeMs: 7_600_000, toleranceMs: 3_000 },
          // After the completed encounter's end (7,781,469).
          { name: subject.name, abilityId: RESTORAL, atReportTimeMs: 7_790_000, toleranceMs: 2_000 },
          // An ability the specialization does not identify.
          { name: subject.name, abilityId: VIVIFY, atReportTimeMs: 7_500_000, toleranceMs: 2_000 },
        ],
      };
    },
  },
];

/** Every property name anywhere in a JSON value. */
function keysOf(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) keysOf(item, into);
  else if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      into.push(key);
      keysOf(nested, into);
    }
  }
  return into;
}

function healerOf(document: PublicAnalysisResult): PublicHealerFindings {
  if (document.status !== "AUTHORITY_NOT_AVAILABLE" && document.status !== "INSUFFICIENT_EVIDENCE") {
    throw new Error(`expected an unanalyzed healer document, got ${document.status}`);
  }
  if (document.healerFindings === undefined) throw new Error("no healerFindings");
  return document.healerFindings;
}

describe("the gate covers every public healer registration", () => {
  it("every PUBLIC row with a healer view has a pinned gate subject, and every subject is such a row", () => {
    const healers = PRODUCTION_CATALOG.registrations
      .filter((row) => row.exposure === "PUBLIC" && row.healerView !== undefined)
      .map((row) => row.specId)
      .sort();
    expect(healers).toEqual(HEALER_GATE_SUBJECTS.map((subject) => subject.specId).sort());
    expect(healers.length).toBeGreaterThan(0);
  });
});

for (const gate of HEALER_GATE_SUBJECTS) {
  describe(`${gate.specId}: the healer promotion gate, on real evidence through the public service`, () => {
    let loaded: Awaited<ReturnType<HealerGateSubject["load"]>>;
    const identityOf = (of: CombatFight, actorId = gate.actorId) =>
      restorationIdentityFor(of, actorId, {
        name: loaded.name,
        className: gate.className,
        specName: gate.specName,
      });
    const publish = async (of: CombatFight, plan?: unknown, actorId = gate.actorId) => {
      const runner = restorationRunner(of, identityOf(of, actorId));
      const result = await runner.analyze(
        plan === undefined ? runner.ids : { ...runner.ids, raidCooldownPlan: plan },
      );
      if (!result.ok) throw new Error(`the service failed: ${JSON.stringify(result.error)}`);
      return { document: PublicAnalysisResultSchema.parse(projectAnalysisResult(result.analysis)), runner };
    };
    const planFor = (entries: readonly PlanEntry[], encounter = loaded.encounter) =>
      requestPlan(encounter, loaded.fight.fight.startTimeMs, entries);

    beforeAll(async () => {
      loaded = await gate.load();
    });

    it("OBSERVATIONS: COOLDOWN is observed and COMPLETE, every use the subject's own real cast", async () => {
      const { document, runner } = await publish(loaded.fight);
      expect(runner.scopes).toEqual(["FULL_RAID"]);
      expect(document.status).toBe("AUTHORITY_NOT_AVAILABLE");
      const healer = healerOf(document);
      if (healer.assessment !== "ASSESSED") throw new Error("not assessed");
      expect(healer.categories[1]).toEqual({
        category: "COOLDOWN",
        resolution: "OBSERVED",
        authority: "WCL_OBSERVED_FACT",
        listing: { completeness: "COMPLETE" },
      });
      expect(healer.cooldownUses.length).toBeGreaterThan(0);
      for (const use of healer.cooldownUses) {
        const event = loaded.fight.events[use.position];
        expect(event?.kind, use.findingId).toBe("CAST");
        if (event?.kind !== "CAST") continue;
        expect(event.source?.actorId).toBe(gate.actorId);
        expect(event.castPhase).toBe("COMPLETE");
        expect(event.abilityGameId).toBe(use.abilityGameId);
        expect(use.evidence).toEqual([
          {
            streamId: event.locator.streamId,
            pageOrdinal: event.locator.pageOrdinal,
            indexInPage: event.locator.indexInPage,
            ingestionOrdinal: event.locator.ingestionOrdinal,
            rawType: event.locator.rawType,
            reportTimeMs: event.locator.reportTimeMs,
          },
        ]);
      }
    });

    it("ASSIGNMENT: a real ASSIGNMENT_MET on positive actionability, and a not-met entry on the same evidence", async () => {
      const { document } = await publish(loaded.rostered, planFor(loaded.entries));
      if (document.status !== "AUTHORITY_NOT_AVAILABLE") throw new Error(document.status);
      expect(document.raidCooldownPlan?.assignmentEvaluation).toEqual({
        state: "EVALUATED_IN_HEALER_FINDINGS",
      });
      const healer = healerOf(document);
      if (healer.assessment !== "ASSESSED") throw new Error("not assessed");
      const [assignment] = healer.categories;
      expect(assignment).toMatchObject({
        resolution: "EVALUATED_AGAINST_PLAN",
        authority: { kind: "USER_PROVIDED_RAID_PLAN", format: "STRUCTURED", label: "heal-ap test plan" },
      });
      expect(healer.assignments).toHaveLength(loaded.entries.length);

      const met = healer.assignments.filter(
        (entry) => entry.result.resolution === "OUTCOME" && entry.result.outcome === "ASSIGNMENT_MET",
      );
      expect(met.length).toBeGreaterThan(0);
      const uses = new Map(healer.cooldownUses.map((use) => [use.position, use]));
      for (const entry of met) {
        if (entry.result.resolution !== "OUTCOME" || entry.result.outcome !== "ASSIGNMENT_MET") continue;
        const proof = entry.result.actionability;
        // The proof is one of the subject's own observed uses of that ability, inside the window.
        const use = uses.get(proof.position);
        expect(use?.abilityGameId).toBe(entry.abilityGameId);
        expect(proof.abilityGameId).toBe(entry.abilityGameId);
        expect(use?.reportTimeMs).toBeGreaterThanOrEqual(entry.result.window.fromReportTimeMs);
        expect(use?.reportTimeMs).toBeLessThanOrEqual(entry.result.window.toReportTimeMs);
        expect(entry.evidence).toEqual([proof.evidence]);
      }

      // DISCRIMINATION: an identified cooldown's entry the evidence does not meet.
      const identified = new Set(healer.cooldownUses.map((use) => use.abilityGameId));
      const notMet = healer.assignments.filter(
        (entry) =>
          identified.has(entry.abilityGameId) &&
          !(entry.result.resolution === "OUTCOME" && entry.result.outcome === "ASSIGNMENT_MET"),
      );
      expect(notMet.length).toBeGreaterThan(0);
      // No published outcome claims what the evidence cannot: a not-actionable
      // outcome evaluates no actionability, and nothing is a miss.
      for (const entry of healer.assignments) {
        if (entry.result.resolution === "OUTCOME" && entry.result.outcome !== "ASSIGNMENT_MET") {
          expect(entry.result.actionability).toEqual({ actionability: "NOT_EVALUATED" });
          expect(entry.evidence).toEqual([]);
        }
      }
    });

    it("MISSING PLAN: NO_AUTHORITY_AVAILABLE with no assignment result; another fight's plan likewise; an unprovable binding UNKNOWN", async () => {
      const none = healerOf((await publish(loaded.rostered)).document);
      if (none.assessment !== "ASSESSED") throw new Error("not assessed");
      expect(none.categories[0]).toEqual({
        category: "ASSIGNMENT",
        resolution: "NO_AUTHORITY_AVAILABLE",
        reason: "NO_RAID_COOLDOWN_PLAN",
      });
      expect(none.assignments).toEqual([]);

      const elsewhere = await publish(
        loaded.rostered,
        planFor(loaded.entries, { ...loaded.encounter, encounterId: loaded.encounter.encounterId + 1 }),
      );
      const other = healerOf(elsewhere.document);
      if (other.assessment !== "ASSESSED") throw new Error("not assessed");
      expect(other.categories[0]).toEqual({
        category: "ASSIGNMENT",
        resolution: "NO_AUTHORITY_AVAILABLE",
        reason: "PLAN_NOT_FOR_THIS_FIGHT",
      });
      expect(other.assignments).toEqual([]);
      if (elsewhere.document.status !== "AUTHORITY_NOT_AVAILABLE") throw new Error("unexpected status");
      expect(elsewhere.document.raidCooldownPlan?.assignmentEvaluation).toEqual({
        state: "NOT_EVALUATED",
        reason: "PLAN_NOT_FOR_THIS_FIGHT",
      });

      const undated: CombatFight = {
        ...loaded.rostered,
        fight: { ...loaded.rostered.fight, difficulty: null },
      };
      const unknown = healerOf((await publish(undated, planFor(loaded.entries))).document);
      if (unknown.assessment !== "ASSESSED") throw new Error("not assessed");
      expect(unknown.categories[0]).toMatchObject({
        category: "ASSIGNMENT",
        resolution: "UNKNOWN",
        reason: "ENCOUNTER_BINDING_UNKNOWN",
      });
      expect(unknown.assignments).toEqual([]);
    });

    it("IDENTITY: another stated specialization and an unstated subject are NOT_ASSESSED, never an empty set", async () => {
      const other = [...loaded.fight.friendlySpecializations.byActorId.entries()].find(
        ([actorId, stated]) =>
          actorId !== gate.actorId && stated.state === "STATED" && stated.specName !== gate.specName,
      );
      if (other === undefined) throw new Error("no other stated player");
      const refused = await publish(loaded.rostered, planFor(loaded.entries), other[0]);
      expect(refused.document.status).toBe("INSUFFICIENT_EVIDENCE");
      expect(healerOf(refused.document)).toEqual({
        assessment: "NOT_ASSESSED",
        revision: "healer-view/1",
        reason: "IDENTITY_REFUSED",
      });
      if (refused.document.status !== "INSUFFICIENT_EVIDENCE") throw new Error("unexpected status");
      expect(refused.document.raidCooldownPlan?.assignmentEvaluation).toEqual({
        state: "NOT_EVALUATED",
        reason: "SUBJECT_NOT_ASSESSED",
      });

      const unstated: CombatFight = {
        ...loaded.fight,
        friendlySpecializations: {
          ...loaded.fight.friendlySpecializations,
          byActorId: new Map(
            [...loaded.fight.friendlySpecializations.byActorId].filter(
              ([actorId]) => actorId !== gate.actorId,
            ),
          ),
        },
      };
      const blank = await publish(unstated);
      expect(blank.document.status).toBe("INSUFFICIENT_EVIDENCE");
      expect(healerOf(blank.document)).toMatchObject({
        assessment: "NOT_ASSESSED",
        reason: "SUBJECT_SPECIALIZATION_NOT_STATED",
      });
    });

    it("COMPLETENESS: withdrawn CASTS coverage is UNKNOWN, and PLAYER_CONTEXT breadth is ROSTER_NOT_IN_SCOPE", async () => {
      const castsUnverified: CombatFight = {
        ...loaded.rostered,
        completeness: {
          ...loaded.rostered.completeness,
          categories: { ...loaded.rostered.completeness.categories, CASTS: { capability: "UNVERIFIED" } },
        },
      };
      const healer = healerOf((await publish(castsUnverified, planFor(loaded.entries))).document);
      if (healer.assessment !== "ASSESSED") throw new Error("not assessed");
      expect(healer.categories[1]).toMatchObject({
        listing: { completeness: "UNKNOWN", reason: "CAPABILITY_UNVERIFIED" },
      });
      const identified = new Set(gate.identified);
      for (const entry of healer.assignments) {
        if (!identified.has(entry.abilityGameId)) continue;
        if (entry.result.resolution === "UNKNOWN") {
          // Never a readiness claim over evidence the gate cannot vouch for.
          expect(entry.result.reason, entry.findingId).not.toBe("READINESS_NOT_ESTABLISHED");
        }
      }
      expect(
        healer.assignments.some(
          (entry) => entry.result.resolution === "UNKNOWN" && entry.result.reason === "CAPABILITY_UNVERIFIED",
        ),
      ).toBe(true);

      const narrow = healerOf((await publish(loaded.fight)).document);
      if (narrow.assessment !== "ASSESSED") throw new Error("not assessed");
      for (const use of narrow.cooldownUses) {
        expect(use.healingContext).toEqual({ context: "ROSTER_NOT_IN_SCOPE" });
      }
      const wide = healerOf((await publish(loaded.rostered)).document);
      if (wide.assessment !== "ASSESSED") throw new Error("not assessed");
      for (const use of wide.cooldownUses) {
        expect(use.healingContext.context).toBe("RECONSTRUCTED");
        // The committed capture carries no roster DAMAGE coverage: never COMPLETE.
        if (use.healingContext.context === "RECONSTRUCTED") {
          expect(use.healingContext.listing.completeness).toBe("UNKNOWN");
        }
      }
    });

    it("NEGATIVE CONTROLS: no HPS, amount, ranking, score, verdict word or cooldown-quality field", async () => {
      for (const { document } of [
        await publish(loaded.fight),
        await publish(loaded.rostered, planFor(loaded.entries)),
      ]) {
        const healer = healerOf(document);
        if (healer.assessment !== "ASSESSED") throw new Error("not assessed");
        expect(healer.evaluatesHealingQuality).toBe(false);
        expect(healer.evaluatesPlanQuality).toBe(false);
        expect(healer.categories[2]).toEqual({
          category: "HEALING_DECISION",
          resolution: "NO_AUTHORITY_AVAILABLE",
          reason: "NO_APPROVED_PER_CAST_HEALER_MODEL",
        });
        const keys = new Set(keysOf(healer));
        for (const banned of [
          "hps",
          "amount",
          "total",
          "overheal",
          "rank",
          "ranking",
          "score",
          "severity",
          "confidence",
          "quality",
          "state",
          "status",
        ]) {
          expect([...keys], banned).not.toContain(banned);
        }
        // A cooldown use carries facts only: no outcome, no result, no verdict.
        for (const use of healer.cooldownUses) {
          expect(Object.keys(use).sort()).toEqual(
            ["abilityGameId", "evidence", "findingId", "healingContext", "position", "reportTimeMs"].sort(),
          );
        }
        const text = JSON.stringify(healer).toLowerCase();
        for (const word of [
          "wrong",
          "incorrect",
          "mistake",
          "missed",
          "wasted",
          "should",
          "optimal",
          "hps",
        ]) {
          expect(text, word).not.toContain(word);
        }
      }
    });
  });
}

/**
 * M11-A2: the TEST-OWNED public-promotion evidence gate, split into two
 * global gates in M11-C4h.
 *
 * THE RULE (M11-C4h)
 *
 *     A PUBLIC registration must pass BOTH gates, with no specialization
 *     exempt and none held to a private variant:
 *
 *     OBSERVATION     at least one REAL-EVIDENCE MATCH, and real resolved
 *                     decisions (MATCH or REJECTED) over at least
 *                     MIN_DISTINCT_OBSERVED_ACTION_TOKENS distinct supported
 *                     observed action tokens (identified by the observed
 *                     cast's ability id; not authority entries) —
 *                     each a DECISION_COVERAGE assertion whose whole evidence
 *                     set is sanitized capture, whose actor is mechanically the
 *                     registration's specialization, and which the committed
 *                     report of its root records as PASSED;
 *     DISCRIMINATION  at least one such REAL REJECTED, or at least one
 *                     qualifying NEGATIVE CONTROL: the same real decision with
 *                     only the cast's ability substituted (loader-checked, one
 *                     field), an action APPLICABLE under the proven build, and
 *                     the verdict flipping from a qualifying real MATCH to
 *                     REJECTED (`tests/support/corpus/promotion-evidence.ts`).
 *
 * WHY TWO GATES
 *
 * The M11-A2 rule was "one qualifying MATCH or REJECTED"; M11-A4/A5 and M11-B12
 * added "a real MATCH AND a real REJECTED" for Retribution and Blood only, so
 * that "a regression that collapsed the analyzer to one-sided outcomes could
 * not be promoted". Protection, promoted at M10-D, had no REJECTED. The one
 * rule conflated honest handling of real play (observation) with the ability
 * to disagree on real state (discrimination), and made the second depend on
 * whether the sampled players happened to err. M11-C4h states both globally;
 * the stricter Retribution and Blood real-REJECTED pins below stay.
 *
 * Production knows nothing of this. It reads the production catalog for one
 * side of the join and the corpus manifest, artifacts and committed report
 * for the other; the only bridge is the test-owned `SPEC_LAYER_OF`. Nothing
 * here executes an analysis: the evidence that a decision resolved is the
 * corpus's own execution, recorded in `report.json` by the gate that ran it.
 *
 * THE STRICT M11 PROVENANCE RULE
 *
 * Every artifact a qualifying OBSERVATION case references — its own, every
 * bundle part, every context artifact — must be `SANITIZED_CAPTURE`.
 * `SYNTHETIC` anywhere disqualifies. `DERIVED_FROM_CAPTURE` anywhere
 * disqualifies it as observation: a derivation is not what the player did.
 * The ONE derivation the gate reads is a negative control, and only for
 * discrimination: a `SINGLE_CAST_ABILITY_SUBSTITUTION` whose one-field diff
 * from its SANITIZED_CAPTURE parent the loader re-derives, so the gate can
 * prove it manufactured no state beyond the one action. Every other derived
 * or synthetic case remains fail-closed and mechanics evidence and counts for
 * nothing here.
 *
 * TWO MODES
 *
 *   PUBLIC         zero qualifying assertions is a CI failure. Identity is
 *                  proven THROUGH the identity table: the evidence actor's
 *                  Warcraft Logs class/spec must resolve to this specId.
 *   INTERNAL_ONLY  the same search, reported, never failed. The identity
 *                  table deliberately does not resolve an internal id, so
 *                  the actor's class/spec is compared to the module's own
 *                  canonical `wclClassName` / `wclSpecName`, and the table is
 *                  asserted to REFUSE it. `evidenceReady: true` authorizes
 *                  nothing by itself.
 *
 * Since M13-F, PUBLIC mode covers the PUBLIC registrations that bind a
 * decision authority. One that binds none (Augmentation Evoker; Restoration
 * Shaman since HEAL-AP) can publish no decision, so there is nothing for these
 * gates to measure; each is pinned as exempt below, by name, domains and view.
 * A healer row is instead held to the healer promotion gate
 * (`heal-ap-healer-promotion-gate.test.ts`), unchanged rules here.
 *
 * TWO EVIDENCE ROOTS (M11-C4e)
 *
 * Qualifying assertions may live in the regression corpus or in the evidence
 * archive (tests/evidence/). The reader is shared
 * (`tests/support/corpus/promotion-evidence.ts`) so the negative tests in
 * `m11c4e-promotion-archive.test.ts` exercise exactly this code. Nothing is
 * relaxed: the evidence set is resolved across both roots and must be all
 * SANITIZED_CAPTURE, identity is proven from a committed fight context in
 * either root, and PASSED comes from the case's own root's committed report.
 * The archive is loaded against the corpus it depends on; if it fails to
 * validate, or holds cases with no committed report, this file fails.
 *
 * No production INTERNAL_ONLY registration existed in M11-A2; Retribution
 * Paladin was one from M11-A4 until M11-A5 promoted it (this gate reported
 * its readiness in INTERNAL_ONLY mode from the same four assertions that now
 * qualify it in PUBLIC mode). The internal branch is exercised over a
 * synthetic, test-built module that never enters a validated catalog and is
 * never listed anywhere in production.
 */

import { describe, expect, it } from "vitest";

import { defineSpecModule, isSpecModule, type SpecModule } from "../../src/findings/spec-module.js";
import { INTERNAL_ONLY_SPEC_IDS, PUBLIC_SPEC_IDS, type SpecId } from "../../src/findings/spec-id.js";
import { PRODUCTION_CATALOG, type AnalyzerRegistration } from "../../src/services/analyzer-registry.js";
import { resolveSpecIdentity } from "../../src/services/spec-identity.js";
import {
  PROTECTION_AUTHORITY_BINDINGS,
  PROTECTION_CAPABILITIES,
} from "../../src/specs/paladin/protection/authority-bindings.js";
import { OWNING_LAYERS, SPEC_LAYER_OF } from "../support/corpus/contract.js";
import { committedEvidenceReport, loadCommittedEvidenceArchive } from "../support/corpus/evidence-archive.js";
import { committedCorpusFiles, loadCorpusOrThrow } from "../support/corpus/loader.js";
import {
  evaluatePromotionReadiness,
  MIN_DISTINCT_OBSERVED_ACTION_TOKENS,
  type CommittedReport,
  type EvidenceTier,
  type WclIdentity,
} from "../support/corpus/promotion-evidence.js";

const REGISTRATION_MODULES: Record<string, Record<string, unknown>> = import.meta.glob(
  "../../src/specs/*/*/registration.ts",
  { eager: true },
);

const REPORT: Record<string, string> = import.meta.glob("../corpus/report.json", {
  eager: true,
  query: "?raw",
  import: "default",
});

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function committedReport(): CommittedReport {
  const text = REPORT["../corpus/report.json"];
  if (text === undefined) throw new Error("tests/corpus/report.json not captured");
  return JSON.parse(text) as CommittedReport;
}

const MODULES: readonly SpecModule[] = Object.values(REGISTRATION_MODULES)
  .flatMap((exports) => Object.values(exports).filter(isSpecModule))
  .sort((a, b) => a.identity.specId.localeCompare(b.identity.specId));

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/** The shared reader, over every committed evidence root. */
const evaluate = evaluatePromotionReadiness;

/**
 * The committed evidence roots, loaded FAIL-CLOSED: a regression corpus that
 * does not validate, an archive that does not validate against it (a digest,
 * a missing or duplicated id, a forbidden reference), or an archive that holds
 * cases with no committed report, throws here and fails every test below.
 */
async function loadTiers(): Promise<readonly EvidenceTier[]> {
  const corpus = await loadCorpusOrThrow(committedCorpusFiles());
  const archive = await loadCommittedEvidenceArchive();
  if (!archive.ok) {
    throw new Error(
      `the evidence archive does not validate:\n${archive.errors.map((error) => `  [${error.code}] ${error.message}`).join("\n")}`,
    );
  }
  const archiveReport = committedEvidenceReport() as CommittedReport | null;
  if (archiveReport === null && archive.archive.cases.length > 0) {
    throw new Error("tests/evidence/report.json is absent; run `npm run test:evidence -- --write-report`");
  }
  return [
    { rootId: "REGRESSION_CORPUS", corpus, report: committedReport() },
    { rootId: "EVIDENCE_ARCHIVE", corpus: archive.archive, report: archiveReport },
  ];
}

function publicPairing(specId: SpecId): (identity: WclIdentity) => boolean {
  return (identity) => {
    const resolved = resolveSpecIdentity(identity);
    return resolved.ok && resolved.specId === specId;
  };
}

function internalPairing(module: SpecModule): (identity: WclIdentity) => boolean {
  return (identity) =>
    identity.className === module.identity.wclClassName &&
    identity.specName === module.identity.wclSpecName &&
    !resolveSpecIdentity(identity).ok;
}

// ---------------------------------------------------------------------------
// Preconditions
// ---------------------------------------------------------------------------

const tiersPromise = loadTiers();

describe("the gate's inputs", () => {
  it("the committed report is a complete WORKERD execution", () => {
    const report = committedReport();
    expect(report.runtime).toBe("WORKERD");
    expect(report.totals.failed).toBe(0);
    expect(report.totals.notExecuted).toBe(0);
    expect(report.totals.declared).toBe(0);
  });

  it("SPEC_LAYER_OF is total over every registered specialization and every layer is a SPEC_ layer", () => {
    for (const registration of PRODUCTION_CATALOG.registrations) {
      const layer = SPEC_LAYER_OF[registration.specId];
      expect(layer, registration.specId).toBeDefined();
      expect(layer.startsWith("SPEC_")).toBe(true);
      expect(OWNING_LAYERS[layer]).toEqual([`src/specs/${registration.specId}/`]);
    }
  });

  it("every registered specialization has a module and vice versa", () => {
    expect(MODULES.map((module) => module.identity.specId)).toEqual(
      [...PRODUCTION_CATALOG.registrations].map((row) => row.specId).sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// PUBLIC mode
// ---------------------------------------------------------------------------

/**
 * M13-F: the gates measure observed DECISIONS, so they apply to a public
 * registration that can publish one — one that binds a decision authority.
 * A registration that binds none can never return an ANALYZED result that
 * passes ownership (an ANALYZED envelope must cite an authority its
 * registration binds: RESULT_CITES_FOREIGN_AUTHORITY), so it publishes no
 * decision and has nothing for these gates to measure. Six such rows exist
 * (Augmentation Evoker since M13-F; Restoration Shaman since HEAL-AP, Holy
 * Paladin and Mistweaver Monk since HEAL-B1P, Holy Priest since HEAL-B2P, and Preservation Evoker since HEAL-B4P,
 * which the separate healer promotion gate governs); see the describe block
 * after PUBLIC mode.
 */
const bindsDecisionAuthority = (row: AnalyzerRegistration): boolean => row.authorityBindings.length > 0;

describe("PUBLIC mode — every public registration is backed by real, resolved, identity-paired evidence", () => {
  const publicRegistrations: readonly AnalyzerRegistration[] = PRODUCTION_CATALOG.registrations.filter(
    (row) => row.exposure === "PUBLIC" && bindsDecisionAuthority(row),
  );

  it("evaluates exactly the PUBLIC partition, less the six registrations that bind no decision authority", () => {
    const exempt: readonly string[] = [
      "evoker/augmentation",
      "shaman/restoration",
      "paladin/holy",
      "monk/mistweaver",
      "priest/holy",
      "evoker/preservation",
    ];
    expect(publicRegistrations.map((row) => row.specId).sort()).toEqual(
      [...PUBLIC_SPEC_IDS].filter((id) => !exempt.includes(id)).sort(),
    );
  });

  for (const registration of publicRegistrations) {
    it(`${registration.specId}: passes the observation gate AND the discrimination gate`, async () => {
      const tiers = await tiersPromise;
      const readiness = evaluate(tiers, registration.specId, "PUBLIC", publicPairing(registration.specId));
      const summary = readiness.qualifyingAssertions.map(
        (q) =>
          `${q.caseId}[${String(q.ordinal)}] ${q.expectedOutcome} over ${q.evidenceSet.length} sanitized artifact(s), actor ${String(q.evidenceActor.actorId)} = ${q.evidenceIdentity.className}/${q.evidenceIdentity.specName}`,
      );
      expect(
        readiness.observationGate.ready,
        `${registration.specId} is PUBLIC without observation evidence: ${String(readiness.observationGate.realMatches)} real MATCH over ${String(readiness.observationGate.distinctResolvedAbilityIds.length)} distinct supported observed action token(s). Disqualified: ${JSON.stringify(readiness.disqualified, null, 1)}`,
      ).toBe(true);
      expect(
        readiness.discriminationGate.ready,
        `${registration.specId} is PUBLIC without discrimination evidence: no qualifying real REJECTED and no qualifying negative control. Disqualified: ${JSON.stringify(readiness.disqualified, null, 1)}`,
      ).toBe(true);
      expect(readiness.evidenceReady).toBe(true);
      expect(readiness.observationGate.realMatches).toBeGreaterThanOrEqual(1);
      expect(readiness.observationGate.distinctResolvedAbilityIds.length).toBeGreaterThanOrEqual(
        MIN_DISTINCT_OBSERVED_ACTION_TOKENS,
      );
      // A control is never observation: no qualifying real assertion reads a derived artifact.
      for (const control of readiness.discriminationGate.controls) {
        expect(readiness.qualifyingAssertions.some((q) => q.caseId === control.caseId)).toBe(false);
        expect(control.expectedOutcome).toBe("REJECTED");
        expect(control.reportStatus).toBe("PASSED");
        expect(resolveSpecIdentity(control.evidenceIdentity)).toEqual({
          ok: true,
          specId: registration.specId,
        });
      }
      // Every qualifying assertion satisfies all six criteria by construction; restate the load-bearing ones.
      for (const q of readiness.qualifyingAssertions) {
        expect(q.kind).toBe(`${readiness.layer}.DECISION_COVERAGE`);
        expect(["MATCH", "REJECTED"]).toContain(q.expectedOutcome);
        expect(q.evidenceSet.every((entry) => entry.kind === "SANITIZED_CAPTURE")).toBe(true);
        expect(resolveSpecIdentity(q.evidenceIdentity)).toEqual({ ok: true, specId: registration.specId });
        expect(q.reportStatus).toBe("PASSED");
      }
      expect(summary.length).toBeGreaterThan(0);
    });
  }

  it("derived and synthetic cases contribute nothing, even when their expectation is a resolved outcome", async () => {
    const tiers = await tiersPromise;
    for (const registration of publicRegistrations) {
      const readiness = evaluate(tiers, registration.specId, "PUBLIC", publicPairing(registration.specId));
      for (const q of readiness.qualifyingAssertions) {
        for (const entry of q.evidenceSet) {
          expect(entry.kind, `${q.caseId} references ${entry.artifactId}`).toBe("SANITIZED_CAPTURE");
        }
      }
      for (const d of readiness.disqualified) {
        // A disqualification must name its reason; none may be silent.
        expect(d.reason.length, d.caseId).toBeGreaterThan(0);
      }
    }
  });

  it("the reviewed snapshot: which real cases qualify each public specialization today", async () => {
    const tiers = await tiersPromise;
    const snapshot = Object.fromEntries(
      publicRegistrations.map((registration) => [
        registration.specId,
        evaluate(tiers, registration.specId, "PUBLIC", publicPairing(registration.specId))
          .qualifyingAssertions.map((q) => `${q.caseId}[${String(q.ordinal)}] -> ${q.expectedOutcome}`)
          .sort(),
      ]),
    );
    expect(snapshot).toEqual({
      // M11-B12: Blood Death Knight's promotion evidence — twenty-three
      // qualifying assertions across six sanitized-capture cases, MATCH and
      // REJECTED both, every one recorded PASSED in the committed report and
      // paired THROUGH the identity table (DeathKnight/Blood -> the id).
      "deathknight/blood": [
        "spec-blood-death-knight.blood-debt-is-read-from-its-own-transitions-and-never-from-a-death-strike[11] -> MATCH",
        "spec-blood-death-knight.blood-debt-is-read-from-its-own-transitions-and-never-from-a-death-strike[5] -> MATCH",
        "spec-blood-death-knight.blood-debt-is-read-from-its-own-transitions-and-never-from-a-death-strike[7] -> MATCH",
        "spec-blood-death-knight.blood-debt-is-read-from-its-own-transitions-and-never-from-a-death-strike[9] -> MATCH",
        "spec-blood-death-knight.bone-shield-is-every-exact-count-its-own-gains-leave-and-the-presence-proven-on-both-sides[0] -> MATCH",
        "spec-blood-death-knight.bone-shield-is-every-exact-count-its-own-gains-leave-and-the-presence-proven-on-both-sides[7] -> MATCH",
        "spec-blood-death-knight.essence-lone-refreshes-anchor-nothing-and-the-window-bound-is-the-floor-both-orderings-share[0] -> REJECTED",
        "spec-blood-death-knight.essence-lone-refreshes-anchor-nothing-and-the-window-bound-is-the-floor-both-orderings-share[12] -> REJECTED",
        "spec-blood-death-knight.essence-lone-refreshes-anchor-nothing-and-the-window-bound-is-the-floor-both-orderings-share[21] -> MATCH",
        "spec-blood-death-knight.essence-lone-refreshes-anchor-nothing-and-the-window-bound-is-the-floor-both-orderings-share[28] -> REJECTED",
        "spec-blood-death-knight.essence-lone-refreshes-anchor-nothing-and-the-window-bound-is-the-floor-both-orderings-share[33] -> MATCH",
        "spec-blood-death-knight.essence-stacks-are-the-wires-absolute-counts-and-a-set-of-two-inside-the-window[0] -> MATCH",
        "spec-blood-death-knight.essence-stacks-are-the-wires-absolute-counts-and-a-set-of-two-inside-the-window[4] -> MATCH",
        "spec-blood-death-knight.essence-stacks-are-the-wires-absolute-counts-and-a-set-of-two-inside-the-window[7] -> MATCH",
        "spec-blood-death-knight.inside-the-gift-window-the-scan-transfers-into-san-gift-and-selects-death-strike[0] -> MATCH",
        "spec-blood-death-knight.marrowrend-is-proven-usable-only-from-the-decision-casts-own-runes[0] -> REJECTED",
        "spec-blood-death-knight.marrowrend-is-proven-usable-only-from-the-decision-casts-own-runes[10] -> REJECTED",
        "spec-blood-death-knight.marrowrend-is-proven-usable-only-from-the-decision-casts-own-runes[14] -> REJECTED",
        "spec-blood-death-knight.marrowrend-is-proven-usable-only-from-the-decision-casts-own-runes[18] -> REJECTED",
        "spec-blood-death-knight.marrowrend-is-proven-usable-only-from-the-decision-casts-own-runes[21] -> REJECTED",
        "spec-blood-death-knight.marrowrend-is-proven-usable-only-from-the-decision-casts-own-runes[4] -> REJECTED",
        "spec-blood-death-knight.marrowrend-is-proven-usable-only-from-the-decision-casts-own-runes[7] -> REJECTED",
        "spec-blood-death-knight.outside-the-gift-window-the-scan-skips-san-gift-and-stops-in-sanlayn[19] -> MATCH",
      ],
      // M11-C4j: Brewmaster Monk's promotion evidence — seven qualifying
      // assertions over two independent Shado-Pan subjects, five MATCH and two
      // REJECTED, every one over SANITIZED_CAPTURE, recorded PASSED in its
      // root's committed report and paired THROUGH the identity table
      // (Monk/Brewmaster -> the id). The same seven the INTERNAL_ONLY report
      // counted at M11-C4i; promotion added none.
      "monk/brewmaster": [
        "spec-brewmaster-monk.breath-of-fire-and-keg-smash-match-and-the-rest-name-their-blocker[0] -> MATCH",
        "spec-brewmaster-monk.breath-of-fire-and-keg-smash-match-and-the-rest-name-their-blocker[1] -> MATCH",
        "spec-brewmaster-monk.breath-of-fire-and-keg-smash-match-and-the-rest-name-their-blocker[4] -> REJECTED",
        "spec-brewmaster-monk.breath-of-fire-and-keg-smash-match-and-the-rest-name-their-blocker[5] -> MATCH",
        "spec-brewmaster-monk.the-first-full-fight-segment-match-resolves-over-the-cross-tier-bundle[0] -> MATCH",
        "spec-brewmaster-monk.the-second-subjects-first-resolved-match-over-its-fixed-165s-bundle[0] -> MATCH",
        "spec-brewmaster-monk.the-second-subjects-rejected-tiger-palm-over-its-fixed-165s-bundle[0] -> REJECTED",
      ],
      // ONB-A1P: Havoc Demon Hunter's promotion evidence, the same three the
      // INTERNAL_ONLY report counted at ONB-A1, over one Aldrachi Reaver subject.
      "demonhunter/havoc": [
        "spec-havoc-demon-hunter.annihilation-with-reavers-glaive-proven-usable-is-rejected[0] -> REJECTED",
        "spec-havoc-demon-hunter.chaos-strike-with-reavers-glaive-proven-usable-is-rejected[0] -> REJECTED",
        "spec-havoc-demon-hunter.the-first-resolved-reavers-glaive-matches[0] -> MATCH",
      ],
      "paladin/protection": [
        "spec-protection-paladin.hammer-of-wrath-is-unusable-only-from-an-observed-removal-of-its-readiness-aura[1] -> MATCH",
        "spec-protection-paladin.hammer-of-wrath-is-unusable-only-from-an-observed-removal-of-its-readiness-aura[6] -> MATCH",
        "spec-protection-paladin.the-avengers-shield-press-under-vanguard-is-a-real-exact-entry-match[0] -> MATCH",
        "spec-protection-paladin.the-divine-toll-press-is-a-real-exact-entry-match[0] -> MATCH",
      ],
      // M11-A5: the same four assertions that reported Retribution's
      // INTERNAL_ONLY readiness in M11-A4 now qualify it in PUBLIC mode,
      // paired THROUGH the identity table.
      "paladin/retribution": [
        "spec-retribution-paladin.divine-storm-under-the-arbiter-storm-buff-is-rejected-two-ways[0] -> REJECTED",
        "spec-retribution-paladin.divine-storm-under-the-arbiter-storm-buff-is-rejected-two-ways[3] -> REJECTED",
        "spec-retribution-paladin.rejected-by-unselectability-alone-before-any-cooldown-is-anchored[0] -> REJECTED",
        "spec-retribution-paladin.the-real-match-final-verdict-at-2108996[0] -> MATCH",
      ],
      "rogue/assassination": [
        "spec-assassination.low-combo-point-envenom-is-rejected[0] -> REJECTED",
        "spec-assassination.observed-garrote-at-q-is-authority-compatible[0] -> MATCH",
      ],
    });
  });

  it("the reviewed snapshot (M11-C4h): how each public specialization passes the discrimination gate", async () => {
    const tiers = await tiersPromise;
    const routes = Object.fromEntries(
      publicRegistrations.map((registration) => {
        const gate = evaluate(
          tiers,
          registration.specId,
          "PUBLIC",
          publicPairing(registration.specId),
        ).discriminationGate;
        return [
          registration.specId,
          {
            realRejected: gate.realRejected.length,
            controls: gate.controls.map(
              (c) =>
                `${c.caseId}[${String(c.ordinal)}] -> REJECTED; ${c.controlArtifactId} substitutes ${String(c.substitution.fromAbilityGameId)} -> ${String(c.substitution.toAbilityGameId)} at ${String(c.substitution.reportTimeMs)}, flipping ${c.parentMatch.caseId}[${String(c.parentMatch.ordinal)}]`,
            ),
          },
        ];
      }),
    );
    expect(routes).toEqual({
      "deathknight/blood": { realRejected: 10, controls: [] },
      // ONB-A1P: Havoc passes by its two qualifying real REJECTEDs, with no control.
      "demonhunter/havoc": { realRejected: 2, controls: [] },
      // M11-C4j: Brewmaster passes by its two real REJECTEDs, one per
      // independent subject, with no control.
      "monk/brewmaster": { realRejected: 2, controls: [] },
      // Protection has no real REJECTED (0 over 149 decisions); it passes by
      // its one negative control, migrated atomically with the split.
      "paladin/protection": {
        realRejected: 0,
        controls: [
          "spec-protection-paladin.negative-control-divine-toll-substituted-at-2074381-is-rejected-on-real-state[0] -> REJECTED; wcl-protection-paladin-a7r6-rotational-165s.seg-60-90.control-2074381-divine-toll substitutes 31935 -> 375576 at 2074381, flipping spec-protection-paladin.hammer-of-wrath-is-unusable-only-from-an-observed-removal-of-its-readiness-aura[6]",
        ],
      },
      "paladin/retribution": { realRejected: 3, controls: [] },
      "rogue/assassination": { realRejected: 1, controls: [] },
    });
  });

  it("the reviewed snapshot (M11-C4h): the distinct supported observed action tokens (by ability id) each public specialization resolves on real evidence", async () => {
    const tiers = await tiersPromise;
    const spans = Object.fromEntries(
      publicRegistrations.map((registration) => [
        registration.specId,
        evaluate(tiers, registration.specId, "PUBLIC", publicPairing(registration.specId)).observationGate
          .distinctResolvedAbilityIds,
      ]),
    );
    expect(spans).toEqual({
      "deathknight/blood": [49998, 50842, 195182, 206930, 433895],
      // Chaos Strike, Annihilation, Reaver's Glaive.
      "demonhunter/havoc": [162794, 201427, 442294],
      // Tiger Palm, Breath of Fire, Keg Smash, Blackout Kick.
      "monk/brewmaster": [100780, 115181, 121253, 205523],
      "paladin/protection": [31935, 375576],
      "paladin/retribution": [53385, 383328],
      "rogue/assassination": [703, 32645],
    });
  });
});

describe("M11-C4h: Protection Paladin passes discrimination by a negative control, never by observed play", () => {
  it("the control is a one-field substitution of a qualifying real MATCH, APPLICABLE for the build, and counted only for discrimination", async () => {
    const tiers = await tiersPromise;
    const readiness = evaluate(tiers, "paladin/protection", "PUBLIC", publicPairing("paladin/protection"));
    expect(readiness.observationGate.ready).toBe(true);
    expect(readiness.observationGate.realMatches).toBe(4);
    expect(readiness.discriminationGate.realRejected).toEqual([]);
    expect(readiness.discriminationGate.controls).toHaveLength(1);
    const control = readiness.discriminationGate.controls[0];
    expect(control?.parentArtifactId).toBe("wcl-protection-paladin-a7r6-rotational-165s.seg-60-90");
    expect(control?.substitution).toMatchObject({
      kind: "SINGLE_CAST_ABILITY_SUBSTITUTION",
      sourceActorId: 7,
      reportTimeMs: 2074381,
      fromAbilityGameId: 31935,
      toAbilityGameId: 375576,
    });
    expect(control?.applicability.observedToken).toBe("divine_toll");
    expect(control?.evidenceActor).toEqual({ reportCode: "A7R6kxPJ1hC8YQ4w", fightId: 7, actorId: 7 });
    expect(control?.evidenceIdentity).toEqual({ className: "Paladin", specName: "Protection" });
    // Exactly one derived part, the control; every other part observed.
    expect(control?.evidenceSet.filter((entry) => entry.kind !== "SANITIZED_CAPTURE")).toEqual([
      { artifactId: control?.controlArtifactId, rootId: "REGRESSION_CORPUS", kind: "DERIVED_FROM_CAPTURE" },
    ]);
    // The flipped real MATCH is observation evidence in its own right.
    const flipped = readiness.qualifyingAssertions.find(
      (q) => q.caseId === control?.parentMatch.caseId && q.ordinal === control.parentMatch.ordinal,
    );
    expect(flipped?.expectedOutcome).toBe("MATCH");
    expect(flipped?.observedCast).toEqual({ reportTimeMs: 2074381, abilityGameId: 31935 });
    // The control never appears as observed play.
    expect(readiness.qualifyingAssertions.some((q) => q.caseId === control?.caseId)).toBe(false);
    expect(readiness.qualifyingAssertions.every((q) => q.expectedOutcome === "MATCH")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// INTERNAL_ONLY mode
// ---------------------------------------------------------------------------

describe("PUBLIC mode — the M11-A5 promotion standard for Retribution Paladin: real MATCH AND real REJECTED", () => {
  it("Retribution Paladin is PUBLIC, paired THROUGH the identity table, with at least one real MATCH and one real REJECTED", async () => {
    // The generic gate requires one qualifying resolved assertion; M11-A5
    // kept the stronger M11-A4 standard — both outcomes must remain, from
    // genuine Retribution evidence, so a regression that collapsed the
    // analyzer to one-sided outcomes could not be promoted or stay promoted.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "paladin/retribution");
    expect(module).toBeDefined();
    if (module === undefined) return;
    expect(module.exposure).toBe("PUBLIC");
    expect(resolveSpecIdentity({ className: "Paladin", specName: "Retribution" })).toEqual({
      ok: true,
      specId: "paladin/retribution",
    });
    const readiness = evaluate(tiers, "paladin/retribution", "PUBLIC", publicPairing("paladin/retribution"));
    expect(readiness.exposure).toBe("PUBLIC");
    expect(readiness.layer).toBe("SPEC_RETRIBUTION_PALADIN");
    expect(readiness.evidenceReady).toBe(true);
    const outcomes = readiness.qualifyingAssertions.map((q) => q.expectedOutcome);
    expect(outcomes.filter((outcome) => outcome === "MATCH").length).toBeGreaterThanOrEqual(1);
    expect(outcomes.filter((outcome) => outcome === "REJECTED").length).toBeGreaterThanOrEqual(1);
    for (const q of readiness.qualifyingAssertions) {
      expect(q.kind).toBe("SPEC_RETRIBUTION_PALADIN.DECISION_COVERAGE");
      expect(q.evidenceSet.every((entry) => entry.kind === "SANITIZED_CAPTURE")).toBe(true);
      expect(q.evidenceIdentity).toEqual({ className: "Paladin", specName: "Retribution" });
      expect(q.evidenceActor).toEqual({ reportCode: "A7R6kxPJ1hC8YQ4w", fightId: 7, actorId: 6 });
      expect(q.reportStatus).toBe("PASSED");
    }
    // The gtKb subject (actor 23, all UNKNOWN) contributes nothing, as it must.
    expect(readiness.qualifyingAssertions.some((q) => q.evidenceActor.actorId === 23)).toBe(false);
    expect(PUBLIC_SPEC_IDS as readonly string[]).toContain("paladin/retribution");
  });
});

describe("M11-B12: Blood Death Knight's promotion evidence, through the identity table", () => {
  it("is PUBLIC with real MATCH and real REJECTED evidence from sanitized captures, each recorded PASSED", async () => {
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "deathknight/blood");
    expect(module).toBeDefined();
    if (module === undefined) return;
    expect(module.exposure).toBe("PUBLIC");
    expect(resolveSpecIdentity({ className: "DeathKnight", specName: "Blood" })).toEqual({
      ok: true,
      specId: "deathknight/blood",
    });
    const readiness = evaluate(tiers, "deathknight/blood", "PUBLIC", publicPairing("deathknight/blood"));
    expect(readiness.exposure).toBe("PUBLIC");
    expect(readiness.layer).toBe("SPEC_BLOOD_DEATH_KNIGHT");
    expect(readiness.evidenceReady).toBe(true);
    const outcomes = readiness.qualifyingAssertions.map((q) => q.expectedOutcome);
    expect(outcomes.filter((outcome) => outcome === "MATCH").length).toBeGreaterThanOrEqual(1);
    expect(outcomes.filter((outcome) => outcome === "REJECTED").length).toBeGreaterThanOrEqual(1);
    for (const q of readiness.qualifyingAssertions) {
      expect(q.kind).toBe("SPEC_BLOOD_DEATH_KNIGHT.DECISION_COVERAGE");
      expect(q.evidenceSet.every((entry) => entry.kind === "SANITIZED_CAPTURE")).toBe(true);
      expect(q.evidenceIdentity).toEqual({ className: "DeathKnight", specName: "Blood" });
      expect(q.reportStatus).toBe("PASSED");
    }
    // Every qualifying assertion is the A7R6 subject, actor 14: the opener
    // capture (gtKb, actor 25) carries Blood evidence too, but its one
    // resolved decision is not pinned as a DECISION_COVERAGE MATCH/REJECTED,
    // so it contributes nothing HERE and is not claimed to.
    const reports = new Set(readiness.qualifyingAssertions.map((q) => q.evidenceActor.reportCode));
    expect([...reports]).toEqual(["A7R6kxPJ1hC8YQ4w"]);
    for (const q of readiness.qualifyingAssertions) {
      expect(q.evidenceActor.actorId).toBe(14);
      expect(q.evidenceActor.fightId).toBe(7);
    }
    expect(PUBLIC_SPEC_IDS as readonly string[]).toContain("deathknight/blood");
  });
});

describe("M11-C4j: Brewmaster Monk passes BOTH global gates in PUBLIC mode, on the same real evidence and no control", () => {
  it("seven qualifying assertions over two independent subjects, paired through the identity table; two real REJECTED; evidenceReady", async () => {
    // The same global rules as every public specialization (M11-C4h): no
    // Brewmaster branch in the gate. At M11-C4i the INTERNAL_ONLY report
    // already counted these seven through the module's own WCL identity;
    // PUBLIC mode now counts them through the identity table, and a PUBLIC
    // specialization that failed either gate would fail CI.
    const tiers = await tiersPromise;
    expect(resolveSpecIdentity({ className: "Monk", specName: "Brewmaster" })).toEqual({
      ok: true,
      specId: "monk/brewmaster",
    });
    const readiness = evaluate(tiers, "monk/brewmaster", "PUBLIC", publicPairing("monk/brewmaster"));
    expect(readiness.exposure).toBe("PUBLIC");
    const bySubject = readiness.qualifyingAssertions.map(
      (q) =>
        `${q.rootId}:${q.expectedOutcome}:${q.evidenceActor.reportCode}/${q.evidenceActor.fightId}/${q.evidenceActor.actorId}`,
    );
    expect([...bySubject].sort()).toEqual([
      "EVIDENCE_ARCHIVE:MATCH:gtKb2xHn87pNcFfW/22/4",
      "EVIDENCE_ARCHIVE:MATCH:rXAfw9t1q8YpmkKD/13/11",
      "EVIDENCE_ARCHIVE:REJECTED:rXAfw9t1q8YpmkKD/13/11",
      "REGRESSION_CORPUS:MATCH:gtKb2xHn87pNcFfW/22/4",
      "REGRESSION_CORPUS:MATCH:gtKb2xHn87pNcFfW/22/4",
      "REGRESSION_CORPUS:MATCH:gtKb2xHn87pNcFfW/22/4",
      "REGRESSION_CORPUS:REJECTED:gtKb2xHn87pNcFfW/22/4",
    ]);
    for (const q of readiness.qualifyingAssertions) {
      expect(q.kind).toBe("SPEC_BREWMASTER_MONK.DECISION_COVERAGE");
      expect(q.evidenceSet.every((entry) => entry.kind === "SANITIZED_CAPTURE")).toBe(true);
      expect(q.evidenceIdentity).toEqual({ className: "Monk", specName: "Brewmaster" });
      expect(q.reportStatus).toBe("PASSED");
    }
    expect(readiness.observationGate.ready).toBe(true);
    expect(readiness.observationGate.distinctResolvedAbilityIds.length).toBeGreaterThanOrEqual(
      MIN_DISTINCT_OBSERVED_ACTION_TOKENS,
    );
    expect(readiness.discriminationGate.controls).toEqual([]);
    expect(
      readiness.discriminationGate.realRejected
        .map((q) => [q.evidenceActor.reportCode, q.observedCast.reportTimeMs])
        .sort(),
    ).toEqual([
      ["gtKb2xHn87pNcFfW", 2424688],
      ["rXAfw9t1q8YpmkKD", 2573516],
    ]);
    expect(readiness.discriminationGate.ready).toBe(true);
    expect(readiness.evidenceReady).toBe(true);
    expect(PUBLIC_SPEC_IDS as readonly string[]).toContain("monk/brewmaster");
  });
});

describe("M13-F / HEAL-AP / HEAL-B1P / HEAL-B2P / HEAL-B4P: a PUBLIC registration that binds no decision authority publishes no decision, so these gates do not apply", () => {
  const exempt = PRODUCTION_CATALOG.registrations.filter(
    (row) => row.exposure === "PUBLIC" && !bindsDecisionAuthority(row),
  );
  const rowOf = (specId: string): AnalyzerRegistration => {
    const row = exempt.find((candidate) => candidate.specId === specId);
    if (row === undefined) throw new Error(`no exempt row for ${specId}`);
    return row;
  };

  it("is exactly Augmentation Evoker and the five public healers, each declaring only provider-less domains", () => {
    expect(exempt.map((row) => row.specId)).toEqual([
      "evoker/augmentation",
      "shaman/restoration",
      "paladin/holy",
      "monk/mistweaver",
      "priest/holy",
      "evoker/preservation",
    ]);
    expect(
      rowOf("evoker/augmentation")
        .capabilities.map((capability) => capability.domain)
        .sort(),
    ).toEqual(["SUPPORT_TARGETING", "SUPPORT_TIMING"]);
    for (const healer of [
      "shaman/restoration",
      "paladin/holy",
      "monk/mistweaver",
      "priest/holy",
      "evoker/preservation",
    ]) {
      expect(rowOf(healer).capabilities.map((capability) => capability.domain)).toEqual([
        "COOLDOWN_ASSIGNMENT",
        "HEALING_COOLDOWN",
        "HEALING_DECISION",
      ]);
    }
    for (const row of exempt) {
      // Every declared domain resolves to no authority from the row's own access.
      for (const capability of row.capabilities) {
        expect(row.authority.forDomain(capability.domain).outcome).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
      }
    }
    // Each publishes its own unanalyzed view instead: support observations for
    // Augmentation, healer findings for each healer, never both.
    expect(typeof rowOf("evoker/augmentation").supportObservationView).toBe("function");
    expect(rowOf("evoker/augmentation").healerView).toBeUndefined();
    for (const healer of [
      "shaman/restoration",
      "paladin/holy",
      "monk/mistweaver",
      "priest/holy",
      "evoker/preservation",
    ]) {
      expect(typeof rowOf(healer).healerView, healer).toBe("function");
      expect(rowOf(healer).supportObservationView, healer).toBeUndefined();
    }
  });

  it("a healer row is exempt from THESE gates only: the healer promotion gate governs it", () => {
    // HEAL-AP: tests/contracts/heal-ap-healer-promotion-gate.test.ts holds
    // every PUBLIC row with a healer view to its own real-evidence gate, and
    // fails when one has no pinned gate subject. Exemption here is never
    // exemption from evidence. HEAL-B1P: Holy Paladin and Mistweaver Monk each
    // have a pinned gate subject there; HEAL-B2P: Holy Priest too; HEAL-B4P: Preservation Evoker too.
    expect(exempt.filter((candidate) => candidate.healerView !== undefined).map((row) => row.specId)).toEqual(
      ["shaman/restoration", "paladin/holy", "monk/mistweaver", "priest/holy", "evoker/preservation"],
    );
  });

  it("an ANALYZED result from either could never pass ownership: it binds no authority to cite", () => {
    for (const row of exempt) {
      const forged = {
        status: "ANALYZED",
        specId: row.specId,
        authority: { authorityId: "SIMC_APL_FORGED", artifactRevision: "forged" },
      } as unknown as Parameters<AnalyzerRegistration["observedDecisionView"]>[0];
      expect(() => row.observedDecisionView(forged), row.specId).toThrow();
    }
  });

  it("their decision readiness is empty by design, and that is not a gate failure", async () => {
    // The same search as PUBLIC mode, reported: no corpus case can show either
    // a decision coverage, because neither has a decision. Their public content
    // is `supportObservations` (M13-F tests) and `healerFindings` (HEAL-AP tests).
    const tiers = await tiersPromise;
    for (const specId of [
      "evoker/augmentation",
      "shaman/restoration",
      "paladin/holy",
      "monk/mistweaver",
      "priest/holy",
      "evoker/preservation",
    ] as const) {
      const readiness = evaluate(tiers, specId, "PUBLIC", publicPairing(specId));
      expect(readiness.qualifyingAssertions, specId).toEqual([]);
      expect(readiness.evidenceReady, specId).toBe(false);
    }
  });
});

describe("INTERNAL_ONLY mode — reported, never failed, paired against the module's own WCL identity", () => {
  it("the production INTERNAL_ONLY registrations are exactly Restoration Druid, Discipline Priest and Cohort A's three followers, and the partition agrees", () => {
    // Blood Death Knight held this half from M11-B2 until M11-B12 promoted
    // it; Brewmaster Monk held it from M11-C2 until M11-C4j promoted it;
    // Augmentation Evoker held it in M13-E until M13-F promoted it; Restoration
    // Shaman held it in HEAL-A until HEAL-AP promoted it. HEAL-B1 put the
    // three healers on its architecture here, and HEAL-B1P promoted Holy
    // Paladin and Mistweaver Monk through the healer gate; Restoration Druid
    // has no retained evidence. HEAL-B2 added Holy Priest, and HEAL-B2P
    // promoted it through the healer gate. HEAL-B3 added Discipline Priest,
    // HEAL-B4 Preservation Evoker, and HEAL-B4P promoted that through the healer gate. ONB-A1 added Havoc Demon Hunter, and ONB-A1P promoted it through both gates.
    // The synthetic module below still exercises the branch.
    // ONB-A2 added Cohort A's three followers, which no retained capture can validate.
    expect([...INTERNAL_ONLY_SPEC_IDS]).toEqual([
      "druid/restoration",
      "priest/discipline",
      "rogue/subtlety",
      "warrior/fury",
      "warrior/protection",
      "warrior/arms",
      "deathknight/frost",
      "shaman/enhancement",
      "demonhunter/devourer",
      "druid/feral",
      "rogue/outlaw",
      "warlock/destruction",
      "shaman/elemental",
      "druid/balance",
      "priest/shadow",
      "mage/arcane",
      "mage/frost",
      "warlock/affliction",
      "hunter/marksmanship",
      "mage/fire",
      "evoker/devastation",
      "demonhunter/vengeance",
      "warlock/demonology",
      "deathknight/unholy",
    ]);
    const internal = PRODUCTION_CATALOG.registrations.filter((row) => row.exposure === "INTERNAL_ONLY");
    expect(internal.map((row) => row.specId)).toEqual([...INTERNAL_ONLY_SPEC_IDS]);
  });

  it("ONB-A2P: the gate search finds nothing for Cohort A's three followers, so none is promoted", async () => {
    // Why they stay INTERNAL_ONLY, measured rather than asserted: no real decision of theirs
    // resolves, so nothing here qualifies. A real capture that changed this would fail this pin
    // and prompt a new public entry; it would not promote anything by itself.
    const tiers = await tiersPromise;
    for (const specId of ["rogue/subtlety", "warrior/fury", "warrior/protection"] as const) {
      const module = MODULES.find((candidate) => candidate.identity.specId === specId);
      if (module === undefined) throw new Error(`no module for ${specId}`);
      const readiness = evaluate(tiers, specId, "INTERNAL_ONLY", internalPairing(module));
      expect(readiness.qualifyingAssertions, specId).toEqual([]);
      expect(readiness.evidenceReady, specId).toBe(false);
    }
  });

  it("ONB-X5: the gate search finds nothing for Unholy Death Knight", async () => {
    // All 147 decisions of its one retained subject stay UNKNOWN, so it was not promoted (agent/architecture.md
    // "ONB-X5P"). A later capture that changed this would fail this pin and prompt a new public entry; it would not
    // promote anything by itself.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "deathknight/unholy");
    if (module === undefined) throw new Error("no module for deathknight/unholy");
    const readiness = evaluate(tiers, "deathknight/unholy", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("ONB-X4: the gate search finds nothing for Demonology Warlock", async () => {
    // All 1,391 decisions of its seven retained subjects stay UNKNOWN, so it was not promoted (agent/architecture.md
    // "ONB-X4P"). A later capture that changed this would fail this pin and prompt a new public entry; it would not
    // promote anything by itself.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "warlock/demonology");
    if (module === undefined) throw new Error("no module for warlock/demonology");
    const readiness = evaluate(tiers, "warlock/demonology", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("ONB-X3: the gate search finds nothing for Vengeance Demon Hunter", async () => {
    // No decision of it resolves and no retained capture holds one of its events, so it was not promoted (agent/architecture.md
    // "ONB-X3P"). A later capture that changed this would fail this pin and prompt a new public entry; it would not
    // promote anything by itself.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "demonhunter/vengeance");
    if (module === undefined) throw new Error("no module for demonhunter/vengeance");
    const readiness = evaluate(tiers, "demonhunter/vengeance", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("ONB-X2: the gate search finds nothing for Devastation Evoker", async () => {
    // All 440 decisions of its three retained subjects stay UNKNOWN, so it was not promoted (agent/architecture.md
    // "ONB-X2P"). A later capture that changed this would fail this pin and prompt a new public entry; it would not
    // promote anything by itself.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "evoker/devastation");
    if (module === undefined) throw new Error("no module for evoker/devastation");
    const readiness = evaluate(tiers, "evoker/devastation", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("ONB-X1: the gate search finds nothing for Fire Mage", async () => {
    // All 113 decisions of its one retained subject stay UNKNOWN, so it was not promoted (agent/architecture.md
    // "ONB-X1P"). A later capture that changed this would fail this pin and prompt a new public entry; it would not
    // promote anything by itself.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "mage/fire");
    if (module === undefined) throw new Error("no module for mage/fire");
    const readiness = evaluate(tiers, "mage/fire", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("ONB-D4: the gate search finds nothing for Affliction Warlock", async () => {
    // Its only replayable source refuses for want of combatant info, so it was not promoted (agent/architecture.md
    // "ONB-D4P"). A later capture that changed this would fail this pin and prompt a new public entry; it would not
    // promote anything by itself.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "warlock/affliction");
    if (module === undefined) throw new Error("no module for warlock/affliction");
    const readiness = evaluate(tiers, "warlock/affliction", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("ONB-D4: the gate search finds nothing for Marksmanship Hunter", async () => {
    // Its only replayable sources refuse for want of combatant info, so it was not promoted (agent/architecture.md
    // "ONB-D4P"). A later capture that changed this would fail this pin and prompt a new public entry; it would not
    // promote anything by itself.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "hunter/marksmanship");
    if (module === undefined) throw new Error("no module for hunter/marksmanship");
    const readiness = evaluate(tiers, "hunter/marksmanship", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("ONB-D3: the gate search finds nothing for Arcane Mage", async () => {
    // All 1,039 decisions of its retained subjects stay UNKNOWN, so it was not promoted (agent/architecture.md
    // "ONB-D3P"). A later change that resolved one would fail this pin and prompt a new public entry; it would not
    // promote anything by itself.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "mage/arcane");
    if (module === undefined) throw new Error("no module for mage/arcane");
    const readiness = evaluate(tiers, "mage/arcane", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("ONB-D3: the gate search finds nothing for Frost Mage", async () => {
    // Its only replayable source refuses for want of combatant info, so it was not promoted (agent/architecture.md
    // "ONB-D3P"). A later capture that changed this would fail this pin and prompt a new public entry; it would not
    // promote anything by itself.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "mage/frost");
    if (module === undefined) throw new Error("no module for mage/frost");
    const readiness = evaluate(tiers, "mage/frost", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("ONB-D2: the gate search finds nothing for Elemental Shaman", async () => {
    // All 1,210 decisions of its retained subjects stay UNKNOWN, so it was not promoted (agent/architecture.md
    // "ONB-D2P"). A later change that resolved one would fail this pin and prompt a new public entry; it would not
    // promote anything by itself.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "shaman/elemental");
    if (module === undefined) throw new Error("no module for shaman/elemental");
    const readiness = evaluate(tiers, "shaman/elemental", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("ONB-D2: the gate search finds nothing for Balance Druid", async () => {
    // All 287 decisions of its retained subjects stay UNKNOWN, so it was not promoted (agent/architecture.md
    // "ONB-D2P"). A later change that resolved one would fail this pin and prompt a new public entry; it would not
    // promote anything by itself.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "druid/balance");
    if (module === undefined) throw new Error("no module for druid/balance");
    const readiness = evaluate(tiers, "druid/balance", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("ONB-D2: the gate search finds nothing for Shadow Priest", async () => {
    // All 356 decisions of its retained subjects stay UNKNOWN, so it was not promoted (agent/architecture.md
    // "ONB-D2P"). A later change that resolved one would fail this pin and prompt a new public entry; it would not
    // promote anything by itself.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "priest/shadow");
    if (module === undefined) throw new Error("no module for priest/shadow");
    const readiness = evaluate(tiers, "priest/shadow", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("ONB-D1: the gate search finds nothing for Destruction Warlock", async () => {
    // All 220 decisions of its two retained subjects stay UNKNOWN, so it was not promoted (agent/architecture.md
    // "ONB-D1P"). A later change that resolved one would fail this pin and prompt a new public entry; it would not
    // promote anything by itself.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "warlock/destruction");
    if (module === undefined) throw new Error("no module for warlock/destruction");
    const readiness = evaluate(tiers, "warlock/destruction", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("ONB-C2: the gate search finds nothing for Outlaw Rogue", async () => {
    // No retained capture holds one of its events, so nothing qualifies and it was not promoted (agent/architecture.md
    // "ONB-C2P"). A later capture that changed this would fail this pin and prompt a new public entry; it would not
    // promote anything by itself.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "rogue/outlaw");
    if (module === undefined) throw new Error("no module for rogue/outlaw");
    const readiness = evaluate(tiers, "rogue/outlaw", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("ONB-C1: the gate search finds nothing for Feral Druid", async () => {
    // Its two retained subjects resolve no decision (agent/architecture.md "ONB-C1P"), so it was not promoted.
    // A later change that resolved one would fail this pin and prompt a new public entry; it would not promote
    // anything by itself.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "druid/feral");
    if (module === undefined) throw new Error("no module for druid/feral");
    const readiness = evaluate(tiers, "druid/feral", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("ONB-B3: the gate search finds nothing for Devourer Demon Hunter", async () => {
    // Its three retained subjects resolve no decision (agent/architecture.md "ONB-B3P"), so it was not promoted.
    // A later change that resolved one would fail this pin and prompt a new public entry; it would not promote
    // anything by itself.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "demonhunter/devourer");
    if (module === undefined) throw new Error("no module for demonhunter/devourer");
    const readiness = evaluate(tiers, "demonhunter/devourer", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("ONB-B2: the gate search finds nothing for Frost Death Knight or Enhancement Shaman", async () => {
    // Frost's two retained subjects resolve no decision, and no capture can validate Enhancement
    // (agent/architecture.md "ONB-B2P"), so neither was promoted. A later change that resolved one
    // would fail this pin and prompt a new public entry; it would not promote anything by itself.
    const tiers = await tiersPromise;
    for (const specId of ["deathknight/frost", "shaman/enhancement"] as const) {
      const module = MODULES.find((candidate) => candidate.identity.specId === specId);
      if (module === undefined) throw new Error(`no module for ${specId}`);
      const readiness = evaluate(tiers, specId, "INTERNAL_ONLY", internalPairing(module));
      expect(readiness.qualifyingAssertions, specId).toEqual([]);
      expect(readiness.evidenceReady, specId).toBe(false);
    }
  });

  it("ONB-B1: the gate search finds nothing for Arms Warrior, whose decisions all stop at the enemy count", async () => {
    // Retained captures hold five subjects, and they do not help: no decision resolves on any
    // (agent/architecture.md "ONB-B1P"), so Arms was not promoted. A later change that resolved one
    // would fail this pin and prompt a new public entry; it would not promote anything by itself.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "warrior/arms");
    if (module === undefined) throw new Error("no module for warrior/arms");
    const readiness = evaluate(tiers, "warrior/arms", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
  });

  it("the internal pairing finds nothing for Brewmaster Monk now that the identity table resolves it (M11-C4j)", async () => {
    // The mirror of the Blood and Retribution cases: the internal pairing
    // REQUIRES the public table to refuse the identity, and the table now
    // resolves Monk/Brewmaster, so the internal-mode search over the same real
    // evidence qualifies nothing. The PUBLIC mode is where they count.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "monk/brewmaster");
    if (module === undefined) throw new Error("no Brewmaster module");
    const readiness = evaluate(tiers, "monk/brewmaster", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
    expect(readiness.disqualified.length).toBeGreaterThan(0);
    for (const d of readiness.disqualified) expect(d.reason).toContain("not this specialization");
  });

  it("the internal pairing finds nothing for Blood Death Knight now that the identity table resolves it (M11-B12)", async () => {
    // The mirror of the Retribution case above: the internal pairing REQUIRES
    // the public table to refuse the identity, and the table now resolves
    // DeathKnight/Blood, so the internal-mode search over the same real
    // evidence qualifies nothing. Informational, not a failure — the PUBLIC
    // mode above is where those assertions count.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "deathknight/blood");
    if (module === undefined) throw new Error("no Blood module");
    const readiness = evaluate(tiers, "deathknight/blood", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
    expect(readiness.disqualified.length).toBeGreaterThan(0);
    for (const d of readiness.disqualified) expect(d.reason).toContain("not this specialization");
  });

  it("the internal pairing finds nothing for a specialization the identity table resolves — Retribution Paladin since M11-A5", async () => {
    // The internal pairing REQUIRES the public table to refuse the identity.
    // Now that it resolves Paladin/Retribution, the internal-mode search over
    // the same evidence qualifies nothing and reports evidenceReady false;
    // that is informational, not a failure, and the PUBLIC mode above is
    // where the same assertions count.
    const tiers = await tiersPromise;
    const module = MODULES.find((candidate) => candidate.identity.specId === "paladin/retribution");
    if (module === undefined) throw new Error("no Retribution module");
    const readiness = evaluate(tiers, "paladin/retribution", "INTERNAL_ONLY", internalPairing(module));
    expect(readiness.qualifyingAssertions).toEqual([]);
    expect(readiness.evidenceReady).toBe(false);
    expect(readiness.disqualified.length).toBeGreaterThan(0);
    for (const d of readiness.disqualified) expect(d.reason).toContain("not this specialization");
  });

  it("a synthetic internal module's readiness is a report, and its identity is refused by the public table", async () => {
    // Built with the real factory so the identity rules hold, given the
    // Protection facade's capabilities and bindings so it is a coherent row,
    // and NEVER placed in a catalog: its spec id is the public one, so the
    // registry would refuse it as a duplicate — which is the point. It exists
    // only to drive the INTERNAL_ONLY branch of the gate.
    const synthetic = defineSpecModule({
      identity: {
        specId: "paladin/protection",
        analyzerId: "synthetic-internal-for-the-gate",
        displayName: "Protection Paladin",
        wclClassName: "Paladin",
        wclSpecName: "Protection",
      },
      exposure: "INTERNAL_ONLY",
      capabilities: PROTECTION_CAPABILITIES,
      authorityBindings: PROTECTION_AUTHORITY_BINDINGS,
      limitsProse: { analysis: "", raidNight: "" },
      analyze: () => {
        throw new Error("never run");
      },
      observedDecisionView: () => {
        throw new Error("never viewed");
      },
    });
    const tiers = await tiersPromise;

    // The public table resolves Paladin/Protection today, so the internal
    // pairing (which requires the table to REFUSE) finds nothing: readiness
    // is reported false, and that is informational, not a failure.
    const readiness = evaluate(tiers, synthetic.identity.specId, "INTERNAL_ONLY", internalPairing(synthetic));
    expect(readiness.exposure).toBe("INTERNAL_ONLY");
    expect(readiness.evidenceReady).toBe(false);
    expect(readiness.disqualified.length).toBeGreaterThan(0);
    for (const d of readiness.disqualified) expect(d.reason).toContain("not this specialization");

    // With the table's refusal simulated (as it will be for a real internal
    // id), the same real Protection evidence pairs against the module's own
    // canonical strings and readiness reads true — still authorizing nothing.
    const pairingWithoutTable = (identity: WclIdentity): boolean =>
      identity.className === synthetic.identity.wclClassName &&
      identity.specName === synthetic.identity.wclSpecName;
    const simulated = evaluate(tiers, synthetic.identity.specId, "INTERNAL_ONLY", pairingWithoutTable);
    expect(simulated.evidenceReady).toBe(true);
    expect(simulated.observationGate.ready).toBe(true);
    expect(simulated.discriminationGate.controls).toHaveLength(1);
    expect(simulated.qualifyingAssertions.map((q) => q.expectedOutcome)).toContain("MATCH");
    expect(simulated.qualifyingAssertions.every((q) => q.evidenceIdentity.className === "Paladin")).toBe(
      true,
    );
  });

  it("an INTERNAL_ONLY readiness with zero qualifying assertions does not throw and does not fail", async () => {
    const tiers = await tiersPromise;
    const readiness = evaluate(tiers, "rogue/assassination", "INTERNAL_ONLY", () => false);
    expect(readiness.evidenceReady).toBe(false);
    expect(readiness.qualifyingAssertions).toEqual([]);
  });
});

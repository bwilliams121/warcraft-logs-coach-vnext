/**
 * M11-A2: the generic specialization-module conformance suite.
 *
 * Runs over EVERY specialization module the tree exports — discovered, never
 * listed — and proves the same invariants for each. Today that is exactly
 * Assassination and Protection; the mechanics are count-independent and a
 * reviewed snapshot at the end names today's modules so a new one is a
 * visible change.
 *
 * WHAT IS PROVEN PER MODULE
 *
 *   identity      specId is known and partitioned; analyzerId, displayName,
 *                 wclClassName, wclSpecName are non-blank; simcSpecId and
 *                 role are the roster's; displayName is the roster's
 *   registration  the module's registration carries the module's identity,
 *                 exposure and limits, and IS the row the catalog lists
 *   exposure      agrees with PUBLIC_SPEC_IDS / INTERNAL_ONLY_SPEC_IDS
 *   WCL identity  for a PUBLIC module the identity table resolves its
 *                 (wclClassName, wclSpecName) to its specId; for an
 *                 INTERNAL_ONLY module it must NOT; and the committed
 *                 fight-context artifact reports exactly those strings for
 *                 the actor the module's evidence comes from
 *   capabilities  validate; every authority binding names a domain a
 *                 capability declares and a provider allowed for it
 *   ownership     a result naming another spec, or citing an authority the
 *                 module does not bind, is refused
 *   projection    the module's view over a real analysis produces only
 *                 public vocabulary (exclusions, blocker classes, bases)
 *   corpus home   `SPEC_LAYER_OF` maps the id to a SPEC_ layer rooted at the
 *                 module's own tree
 *   supplemental  zero or more analyses, ids under the module's own prefix,
 *                 requirements valid, and NOTHING in production invokes or
 *                 names them (M11-A2 seam only)
 *
 * WHAT IS NOT HERE. No decision, no MATCH/REJECTED/UNKNOWN expectation, no
 * corpus evidence — those are the corpus's; and nothing here reads a
 * module's analyzer semantics. The suite proves the module is a coherent,
 * well-registered, well-isolated thing, not that it is right.
 */

import { describe, expect, it } from "vitest";

import { rosterSpecialization } from "../../src/data/game/spec-roster.js";
import { PUBLIC_EXCLUSION_REASONS } from "../../src/contracts/analysis-contract.js";
import { AUTHORITY_DOMAINS, providerMayGovern } from "../../src/findings/authority-domain.js";
import { validateCapabilities } from "../../src/findings/decision-capability.js";
import { checkAnalysisOwnership } from "../../src/findings/analyzer-registration.js";
import { isSpecModule, type SpecModule } from "../../src/findings/spec-module.js";
import { INTERNAL_ONLY_SPEC_IDS, isSpecId, PUBLIC_SPEC_IDS } from "../../src/findings/spec-id.js";
import {
  ANALYZER_REGISTRATIONS,
  analyzerForSpec,
  internalAnalyzerForSpec,
  PRODUCTION_CATALOG,
} from "../../src/services/analyzer-registry.js";
import { resolveSpecIdentity } from "../../src/services/spec-identity.js";
import { committedArtifactText } from "../support/corpus/artifacts.js";
import { OWNING_LAYERS, SPEC_LAYER_OF, specTreeRoot } from "../support/corpus/contract.js";

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

const REGISTRATION_MODULES: Record<string, Record<string, unknown>> = import.meta.glob(
  "../../src/specs/*/*/registration.ts",
  { eager: true },
);

const PRODUCTION_SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

interface Discovered {
  readonly path: string;
  readonly exportName: string;
  readonly module: SpecModule;
}

const MODULES: readonly Discovered[] = Object.entries(REGISTRATION_MODULES)
  .flatMap(([key, exports]) =>
    Object.entries(exports)
      .filter(([, value]) => isSpecModule(value))
      .map(([exportName, value]) => ({
        path: key
          .replace(/^\.\.\/\.\.\//, "")
          .split("\\")
          .join("/"),
        exportName,
        module: value as SpecModule,
      })),
  )
  .sort((a, b) => a.path.localeCompare(b.path));

/**
 * The committed evidence each module's WCL identity is proven from: the
 * fight-context artifact and the actor in it. Test-owned; the module itself
 * carries no artifact id.
 */
const IDENTITY_EVIDENCE: Readonly<
  Record<string, { readonly artifactId: string; readonly fightId: number; readonly sourceId: number }>
> = {
  "rogue/assassination": { artifactId: "wcl-fight-context-a7r6-fight-7", fightId: 7, sourceId: 19 },
  "paladin/protection": { artifactId: "wcl-fight-context-a7r6-fight-7", fightId: 7, sourceId: 7 },
  // M11-A4: actor 6 of the same fight, the Retribution Paladin the committed context reports.
  "paladin/retribution": { artifactId: "wcl-fight-context-a7r6-fight-7", fightId: 7, sourceId: 6 },
  // M11-B2: actor 14 of the same fight, the Blood Death Knight the committed context reports.
  "deathknight/blood": { artifactId: "wcl-fight-context-a7r6-fight-7", fightId: 7, sourceId: 14 },
  // M11-C2: actor 4 of gtKb fight 22, the Brewmaster Monk the committed context reports.
  "monk/brewmaster": { artifactId: "wcl-fight-context-gtkb-fight-22", fightId: 22, sourceId: 4 },
};

function wclIdentityOf(evidence: {
  readonly artifactId: string;
  readonly fightId: number;
  readonly sourceId: number;
}) {
  const raw = JSON.parse(committedArtifactText(evidence.artifactId)) as {
    readonly reportData: {
      readonly report: {
        readonly masterData: { readonly actors: readonly { id: number; type: string; subType: string }[] };
        readonly fights: readonly {
          id: number;
          friendlyPlayers: readonly number[];
          friendlySpecs: readonly string[];
        }[];
      };
    };
  };
  const report = raw.reportData.report;
  const actor = report.masterData.actors.find((candidate) => candidate.id === evidence.sourceId);
  const fight = report.fights.find((candidate) => candidate.id === evidence.fightId);
  if (actor === undefined || fight === undefined)
    throw new Error("evidence actor or fight not in the artifact");
  const index = fight.friendlyPlayers.indexOf(evidence.sourceId);
  return { type: actor.type, className: actor.subType, specName: fight.friendlySpecs[index] ?? null };
}

function codeOf(path: string): string {
  const source = PRODUCTION_SOURCES[`../../${path}`];
  if (source === undefined) throw new Error(`no source captured for ${path}`);
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// ---------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------

describe("discovery", () => {
  it("finds at least one module, exactly one per registration.ts", () => {
    expect(MODULES.length).toBeGreaterThan(0);
    expect(MODULES.length).toBe(Object.keys(REGISTRATION_MODULES).length);
  });
});

for (const { path, exportName, module } of MODULES) {
  const { identity } = module;
  describe(`${identity.specId} (${exportName})`, () => {
    it("identity is internally coherent and roster-backed", () => {
      expect(isSpecId(identity.specId)).toBe(true);
      for (const field of ["analyzerId", "displayName", "wclClassName", "wclSpecName"] as const) {
        expect(identity[field].trim().length, field).toBeGreaterThan(0);
        expect(identity[field], field).toBe(identity[field].trim());
      }
      const roster = rosterSpecialization(identity.specId);
      expect(roster).not.toBeNull();
      expect(identity.simcSpecId).toBe(roster?.simcSpecId);
      expect(identity.role).toBe(roster?.role);
      expect(identity.displayName).toBe(roster?.displayName);
      expect(path).toBe(`${specTreeRoot(identity.specId)}registration.ts`);
    });

    it("the registration carries the module's identity, exposure and limits, and is the listed row", () => {
      const { registration } = module;
      expect(registration.specId).toBe(identity.specId);
      expect(registration.analyzerId).toBe(identity.analyzerId);
      expect(registration.displayName).toBe(identity.displayName);
      expect(registration.exposure).toBe(module.exposure);
      expect(registration.publicLimits).toEqual(module.limitsProse);
      expect(ANALYZER_REGISTRATIONS.filter((row) => row === registration)).toHaveLength(1);
      expect(Object.isFrozen(module)).toBe(true);
      expect(Object.isFrozen(module.identity)).toBe(true);
    });

    it("exposure agrees with the public/internal partition, and lookups agree with exposure", () => {
      const isPublic = (PUBLIC_SPEC_IDS as readonly string[]).includes(identity.specId);
      const isInternal = (INTERNAL_ONLY_SPEC_IDS as readonly string[]).includes(identity.specId);
      expect(isPublic !== isInternal, "partitioned exactly once").toBe(true);
      expect(module.exposure).toBe(isPublic ? "PUBLIC" : "INTERNAL_ONLY");
      const internal = internalAnalyzerForSpec(identity.specId, PRODUCTION_CATALOG);
      const publicRow = analyzerForSpec(identity.specId, PRODUCTION_CATALOG);
      expect(internal?.analyzerId).toBe(identity.analyzerId);
      if (module.exposure === "PUBLIC") expect(publicRow?.analyzerId).toBe(identity.analyzerId);
      else expect(publicRow).toBeNull();
    });

    it("WCL identity: the identity table resolves a PUBLIC module and refuses an INTERNAL_ONLY one", () => {
      const resolution = resolveSpecIdentity({
        className: identity.wclClassName,
        specName: identity.wclSpecName,
      });
      if (module.exposure === "PUBLIC") {
        expect(resolution).toEqual({ ok: true, specId: identity.specId });
      } else {
        expect(resolution.ok).toBe(false);
      }
    });

    it("WCL identity strings are exactly what the committed capture reports for the module's evidence actor", () => {
      const evidence = IDENTITY_EVIDENCE[identity.specId];
      expect(evidence, `no committed identity evidence recorded for ${identity.specId}`).toBeDefined();
      if (evidence === undefined) return;
      const observed = wclIdentityOf(evidence);
      expect(observed.type).toBe("Player");
      expect(observed.className).toBe(identity.wclClassName);
      expect(observed.specName).toBe(identity.wclSpecName);
    });

    it("capabilities validate and every binding is allowed for its domain", () => {
      const { registration } = module;
      expect(validateCapabilities(registration.capabilities)).toEqual([]);
      const declared = new Set(registration.capabilities.map((capability) => capability.domain));
      for (const binding of registration.authorityBindings) {
        expect(AUTHORITY_DOMAINS).toContain(binding.domain);
        expect(declared.has(binding.domain), `${binding.authorityId} binds an undeclared domain`).toBe(true);
        expect(providerMayGovern(binding.kind, binding.domain)).toBe(true);
        expect(binding.load().ok).toBe(true);
      }
      // A SimulationCraft APL binds OFFENSIVE_ROTATION and nothing else.
      for (const binding of registration.authorityBindings.filter(
        (candidate) => candidate.kind === "SIMC_APL",
      )) {
        expect(binding.domain).toBe("OFFENSIVE_ROTATION");
      }
    });

    it("ownership refuses a result that names another spec or cites a foreign authority", () => {
      const { registration } = module;
      const other = MODULES.find((candidate) => candidate.module !== module);
      const bound = registration.authorityBindings[0]?.authorityId ?? "SIMC_APL_NONE";
      expect(
        checkAnalysisOwnership(registration, {
          status: "ANALYZED",
          specId: other?.module.identity.specId ?? "fake/other",
          authority: { authorityId: bound },
        }).ok,
      ).toBe(false);
      expect(
        checkAnalysisOwnership(registration, {
          status: "ANALYZED",
          specId: identity.specId,
          authority: { authorityId: "SIMC_APL_FORGED" },
        }),
      ).toMatchObject({ ok: false, defect: "RESULT_CITES_FOREIGN_AUTHORITY" });
    });

    it("has a test-owned corpus home whose layer is rooted at exactly its own tree", () => {
      const layer = SPEC_LAYER_OF[identity.specId];
      expect(layer).toBeDefined();
      expect(OWNING_LAYERS[layer]).toEqual([specTreeRoot(identity.specId)]);
    });

    it("supplemental analyses are a frozen seam: prefixed ids, valid requirements, none wired", () => {
      expect(Object.isFrozen(module.supplementalAnalyses)).toBe(true);
      const ids = new Set<string>();
      for (const analysis of module.supplementalAnalyses) {
        expect(analysis.supplementalId.startsWith(`${identity.specId}.`)).toBe(true);
        expect(ids.has(analysis.supplementalId)).toBe(false);
        ids.add(analysis.supplementalId);
        expect(analysis.question.trim().length).toBeGreaterThan(0);
        expect(
          validateCapabilities([
            {
              capabilityId: analysis.supplementalId,
              domain: "OFFENSIVE_ROTATION",
              requirements: analysis.requirements,
            },
          ]),
        ).toEqual([]);
        expect(typeof analysis.analyze).toBe("function");
      }
    });
  });
}

describe("the supplemental seam is not wired to any transport, service, contract or projection (M11-A2)", () => {
  it("no module outside src/findings and src/specs names supplementalAnalyses", () => {
    const naming = Object.keys(PRODUCTION_SOURCES)
      .map((key) =>
        key
          .replace(/^\.\.\/\.\.\//, "")
          .split("\\")
          .join("/"),
      )
      .filter((path) => !path.startsWith("src/findings/spec-module.ts") && !path.startsWith("src/specs/"))
      .filter((path) => /\bsupplementalAnalyses\b|\bSupplementalAnalysis/.test(codeOf(path)));
    expect(naming).toEqual([]);
  });

  it("the factory never branches on a specialization", () => {
    const code = codeOf("src/findings/spec-module.ts").toLowerCase();
    for (const forbidden of [
      "rogue",
      "paladin",
      "warlock",
      "assassination",
      "protection",
      "switch (",
      "switch(",
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });
});

describe("what the tree exports today", () => {
  it("is exactly the four public modules and, since M11-C2, one INTERNAL_ONLY module, each with zero supplemental analyses", () => {
    // A reviewed snapshot, not the rule: every proof above is per module and
    // count-independent. The third module (M11-A4) first changed this line
    // WITHOUT the five-site identity move — INTERNAL_ONLY, carrying the
    // internal partition entry — and M11-A5 changed it again WITH the move.
    // Its `supplementalAnalyses` is empty by decision
    // (agent/m11-a4-first-spec-contract.md section 8); M11-A5 is exposure only.
    // The fourth module (M11-B2) followed the same two-step: INTERNAL_ONLY
    // first, PUBLIC at M11-B12 by the five-site move. The fifth (M11-C2,
    // Brewmaster Monk) is INTERNAL_ONLY, carrying the internal partition entry.
    expect(
      MODULES.map(({ exportName, module }) => [
        exportName,
        module.identity.specId,
        module.exposure,
        module.supplementalAnalyses.length,
      ]),
    ).toEqual([
      ["BLOOD_DEATH_KNIGHT_MODULE", "deathknight/blood", "PUBLIC", 0],
      ["BREWMASTER_MONK_MODULE", "monk/brewmaster", "INTERNAL_ONLY", 0],
      ["PROTECTION_PALADIN_MODULE", "paladin/protection", "PUBLIC", 0],
      ["RETRIBUTION_PALADIN_MODULE", "paladin/retribution", "PUBLIC", 0],
      ["ASSASSINATION_MODULE", "rogue/assassination", "PUBLIC", 0],
    ]);
  });

  it("the public exclusion vocabulary is closed, so a module's view cannot publish an unmapped reason", () => {
    // M11-A5 added OUTSIDE_SUPPORTED_SLICE, the one spec-neutral value a
    // module whose slice is narrower than its authority projects onto.
    expect([...PUBLIC_EXCLUSION_REASONS].sort()).toEqual([
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "NON_GCD_ACTION",
      "NO_AUTHORITY_TOKEN_BINDING",
      "OUTSIDE_SUPPORTED_SLICE",
    ]);
  });
});

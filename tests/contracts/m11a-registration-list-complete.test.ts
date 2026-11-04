/**
 * M11-A1: every specialization registration module is in the production
 * catalog, and every production registration is a specialization module.
 *
 * THE FAILURE THIS GUARDS AGAINST
 *
 * `src/services/analyzer-registry.ts` LISTS its rows by hand
 * (`ANALYZER_REGISTRATIONS`). That is deliberate — production never discovers
 * analyzers by walking a filesystem — but it leaves one hole: a
 * `src/specs/<class>/<spec>/registration.ts` module can exist, compile,
 * validate in isolation, and simply not be listed. Nothing fails. The
 * specialization reads as `SPEC_NOT_SUPPORTED` on every public path, which is
 * a truthful-looking answer produced by an omission. The M10-A/M10-D proofs
 * pin the two rows that ARE listed; none of them can see a row that is not.
 *
 * WHAT IS COMPARED, AND WHY NOT FILENAMES
 *
 * Each registration module is EVALUATED (`import.meta.glob` in eager module
 * form, see `types/vite-glob.d.ts`) and its exported registration object is
 * compared with the catalog by the two stable identities a registration
 * carries — `specId` and `analyzerId` — and by object reference against the
 * raw `ANALYZER_REGISTRATIONS` list. A filename proves only that a file
 * exists; the object proves what it registers.
 *
 * THE LAYOUT RULE IS PART OF THE CONTRACT
 *
 * A registration lives at `src/specs/<class>/<spec>/registration.ts` and the
 * directory pair must spell its `specId` (`rogue/assassination`). A
 * registration defined anywhere else under `src/specs/` — in a differently
 * named file, or built in a helper — is refused by a source scan, because the
 * glob below could not see it and this guard would be silently incomplete.
 *
 * WHAT THIS IS NOT
 *
 * Not auto-registration. Production keeps its hand-written list and this
 * test proves the list is complete; the day the list and the tree disagree,
 * the build fails and a person decides which one is wrong. Nothing here
 * changes exposure, dispatch, or any registration's contents, and the set
 * proven today is exactly the two public specializations — as a reviewed
 * snapshot beside the structural rules, never as the rule itself.
 */

import { describe, expect, it } from "vitest";

import { isSpecModule } from "../../src/findings/spec-module.js";
import { INTERNAL_ONLY_SPEC_IDS, PUBLIC_SPEC_IDS, SPEC_IDS } from "../../src/findings/spec-id.js";
import {
  ANALYZER_REGISTRATIONS,
  PRODUCTION_CATALOG,
  type AnalyzerRegistration,
} from "../../src/services/analyzer-registry.js";

// ---------------------------------------------------------------------------
// Discovery: the evaluated registration modules, and the source of the tree
// ---------------------------------------------------------------------------

/** Every `registration.ts` at the canonical depth, evaluated. */
const REGISTRATION_MODULES: Record<string, Record<string, unknown>> = import.meta.glob(
  "../../src/specs/*/*/registration.ts",
  { eager: true },
);

/** Source text of the whole specialization tree, for the layout scan. */
const SPEC_SOURCES: Record<string, string> = import.meta.glob("../../src/specs/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

function repoPath(globKey: string): string {
  return globKey
    .replace(/^\.\.\/\.\.\//, "")
    .split("\\")
    .join("/");
}

/** `src/specs/rogue/assassination/registration.ts` -> `rogue/assassination`. */
function specIdFromPath(path: string): string {
  const match = /^src\/specs\/([^/]+)\/([^/]+)\/registration\.ts$/.exec(path);
  if (match === null) throw new Error(`not a canonical registration path: ${path}`);
  return `${String(match[1])}/${String(match[2])}`;
}

/**
 * The duck-typed shape of a registration, checked on every export of a
 * module. `defineAnalyzerRegistration` returns a frozen object with exactly
 * these members; a value carrying all of them is a registration whatever its
 * export name.
 */
function isRegistrationShaped(value: unknown): value is AnalyzerRegistration {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["specId"] === "string" &&
    typeof record["analyzerId"] === "string" &&
    typeof record["exposure"] === "string" &&
    typeof record["analyze"] === "function" &&
    typeof record["observedDecisionView"] === "function" &&
    Array.isArray(record["capabilities"]) &&
    Array.isArray(record["authorityBindings"])
  );
}

interface DiscoveredRegistration {
  readonly path: string;
  readonly pathSpecId: string;
  readonly exportName: string;
  readonly registration: AnalyzerRegistration;
}

const DISCOVERED: readonly DiscoveredRegistration[] = Object.entries(REGISTRATION_MODULES)
  .flatMap(([key, module]) => {
    const path = repoPath(key);
    return Object.entries(module)
      .filter(([, value]) => isRegistrationShaped(value))
      .map(([exportName, value]) => ({
        path,
        pathSpecId: specIdFromPath(path),
        exportName,
        registration: value as AnalyzerRegistration,
      }));
  })
  .sort((a, b) => a.path.localeCompare(b.path));

const identityOf = (registration: { readonly specId: string; readonly analyzerId: string }) =>
  `${registration.specId} := ${registration.analyzerId}`;

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

describe("the specialization tree", () => {
  it("has at least one registration module, so the guard has something to guard", () => {
    expect(Object.keys(REGISTRATION_MODULES).length).toBeGreaterThan(0);
    expect(DISCOVERED.length).toBeGreaterThan(0);
  });

  it("every registration module exports exactly one registration", () => {
    const perModule = new Map<string, number>();
    for (const key of Object.keys(REGISTRATION_MODULES)) perModule.set(repoPath(key), 0);
    for (const found of DISCOVERED) perModule.set(found.path, (perModule.get(found.path) ?? 0) + 1);
    for (const [path, count] of perModule) {
      expect(count, `${path} exports ${String(count)} registration objects`).toBe(1);
    }
  });

  it("the directory pair spells the registration's specId", () => {
    for (const found of DISCOVERED) {
      expect(found.registration.specId, found.path).toBe(found.pathSpecId);
    }
  });

  it("every registration module exports exactly one specialization module, which owns the registration (M11-A2)", () => {
    // `defineSpecModule` builds the row; the exported registration must BE
    // the module's row, so the module identity and the listed row cannot
    // drift apart, and a registration built without the factory is refused.
    for (const [key, module] of Object.entries(REGISTRATION_MODULES)) {
      const path = repoPath(key);
      const modules = Object.entries(module).filter(([, value]) => isSpecModule(value));
      expect(modules, `${path} exports ${String(modules.length)} specialization modules`).toHaveLength(1);
      const [, specModule] = modules[0] as [string, { registration: unknown }];
      const found = DISCOVERED.find((candidate) => candidate.path === path);
      expect(found?.registration, `${path}: the exported registration is not the module's own`).toBe(
        specModule.registration,
      );
    }
  });

  it("no registration is built anywhere except a canonical registration.ts", () => {
    // Comments stripped: the prohibition is on CODE. The call is the only way
    // a frozen, ownership-checked row comes into being, so any other call
    // site is a registration this guard could not have discovered.
    const offenders = Object.keys(SPEC_SOURCES)
      .map(repoPath)
      .filter((path) => !/^src\/specs\/[^/]+\/[^/]+\/registration\.ts$/.test(path))
      .filter((path) => {
        const code = (SPEC_SOURCES[`../../${path}`] ?? "")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        return /define(?:AnalyzerRegistration|SpecModule)\s*\(/.test(code);
      });
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Both directions
// ---------------------------------------------------------------------------

describe("the production catalog and the tree name the same registrations", () => {
  it("every discovered registration is listed in ANALYZER_REGISTRATIONS, by reference and by identity", () => {
    for (const found of DISCOVERED) {
      const byReference = ANALYZER_REGISTRATIONS.find((row) => row === found.registration);
      expect(byReference, `${found.path} (${found.exportName}) is not listed by reference`).toBeDefined();
      const byIdentity = ANALYZER_REGISTRATIONS.filter(
        (row) => row.specId === found.registration.specId && row.analyzerId === found.registration.analyzerId,
      );
      expect(
        byIdentity,
        `${identityOf(found.registration)} listed ${String(byIdentity.length)} times`,
      ).toHaveLength(1);
    }
  });

  it("every listed registration is a discovered registration module", () => {
    for (const row of ANALYZER_REGISTRATIONS) {
      const matches = DISCOVERED.filter(
        (found) =>
          found.registration.specId === row.specId && found.registration.analyzerId === row.analyzerId,
      );
      expect(matches, `${identityOf(row)} has ${String(matches.length)} registration modules`).toHaveLength(
        1,
      );
      expect(matches[0]?.registration, `${identityOf(row)} is listed from a different object`).toBe(row);
    }
  });

  it("the validated production catalog carries exactly the discovered identities", () => {
    const catalog = PRODUCTION_CATALOG.registrations.map(identityOf).sort();
    const discovered = DISCOVERED.map((found) => identityOf(found.registration)).sort();
    expect(catalog).toEqual(discovered);
  });

  it("every known SpecId has a registration module, and every module registers a known SpecId", () => {
    // The partition (public + internal-only) IS the set of specializations
    // this build has a name for; a name with no registration, or a
    // registration with no name, is the drift this guard exists to catch.
    const known = [...PUBLIC_SPEC_IDS, ...INTERNAL_ONLY_SPEC_IDS].sort();
    expect(known).toEqual([...SPEC_IDS].sort());
    expect(DISCOVERED.map((found) => found.registration.specId).sort()).toEqual(known);
  });
});

// ---------------------------------------------------------------------------
// The reviewed snapshot
// ---------------------------------------------------------------------------

describe("what the tree registers today", () => {
  it("is exactly Assassination Rogue, the two Paladins, Blood Death Knight, Brewmaster Monk, Augmentation Evoker, Restoration Shaman, Holy Paladin, Mistweaver Monk and Holy Priest, all PUBLIC, plus Restoration Druid, Discipline Priest and Preservation Evoker INTERNAL_ONLY", () => {
    // A reviewed list, not the rule: the rules above scale to any number of
    // registrations. This snapshot exists so that a new registration module
    // is a VISIBLE change to this file, reviewed alongside the five-site
    // identity move it must accompany — or, for an INTERNAL_ONLY row, the
    // partition entry it must NOT accompany. Retribution arrived here
    // INTERNAL_ONLY at M11-A4 and became PUBLIC at M11-A5; Blood arrived
    // INTERNAL_ONLY at M11-B2 as the run_action_list cohort's measurement and
    // became PUBLIC at M11-B12; Brewmaster arrived INTERNAL_ONLY at M11-C2 as
    // the next cohort's measurement and became PUBLIC at M11-C4j; Augmentation
    // arrived INTERNAL_ONLY at M13-E, binding no decision authority, and became
    // PUBLIC at M13-F with its support-observation view; Restoration Shaman
    // arrived INTERNAL_ONLY at HEAL-A as the first healer registration and became
    // PUBLIC at HEAL-AP with its healer view; Holy Paladin, Restoration Druid
    // and Mistweaver Monk arrived INTERNAL_ONLY at HEAL-B1 on its architecture,
    // and Holy Paladin and Mistweaver Monk became PUBLIC at HEAL-B1P with the
    // shared healer view; Restoration Druid has no retained evidence for the
    // healer gate and stays INTERNAL_ONLY; Holy Priest arrived INTERNAL_ONLY
    // at HEAL-B2 on the same architecture (PUBLIC since HEAL-B2P); Discipline
    // Priest arrived INTERNAL_ONLY at HEAL-B3, and Preservation Evoker at
    // HEAL-B4. Subtlety Rogue, Fury Warrior and Protection Warrior arrived INTERNAL_ONLY at
    // ONB-A2 as Cohort A's followers.
    expect(DISCOVERED.map((found) => [found.path, found.exportName, found.registration.exposure])).toEqual([
      ["src/specs/deathknight/blood/registration.ts", "BLOOD_DEATH_KNIGHT_REGISTRATION", "PUBLIC"],
      ["src/specs/deathknight/frost/registration.ts", "FROST_DEATH_KNIGHT_REGISTRATION", "INTERNAL_ONLY"],
      [
        "src/specs/demonhunter/devourer/registration.ts",
        "DEVOURER_DEMON_HUNTER_REGISTRATION",
        "INTERNAL_ONLY",
      ],
      ["src/specs/demonhunter/havoc/registration.ts", "HAVOC_DEMON_HUNTER_REGISTRATION", "PUBLIC"],
      ["src/specs/druid/restoration/registration.ts", "RESTORATION_DRUID_REGISTRATION", "INTERNAL_ONLY"],
      ["src/specs/evoker/augmentation/registration.ts", "AUGMENTATION_EVOKER_REGISTRATION", "PUBLIC"],
      ["src/specs/evoker/preservation/registration.ts", "PRESERVATION_EVOKER_REGISTRATION", "PUBLIC"],
      ["src/specs/monk/brewmaster/registration.ts", "BREWMASTER_MONK_REGISTRATION", "PUBLIC"],
      ["src/specs/monk/mistweaver/registration.ts", "MISTWEAVER_MONK_REGISTRATION", "PUBLIC"],
      ["src/specs/paladin/holy/registration.ts", "HOLY_PALADIN_REGISTRATION", "PUBLIC"],
      ["src/specs/paladin/protection/registration.ts", "PROTECTION_PALADIN_REGISTRATION", "PUBLIC"],
      ["src/specs/paladin/retribution/registration.ts", "RETRIBUTION_PALADIN_REGISTRATION", "PUBLIC"],
      ["src/specs/priest/discipline/registration.ts", "DISCIPLINE_PRIEST_REGISTRATION", "INTERNAL_ONLY"],
      ["src/specs/priest/holy/registration.ts", "HOLY_PRIEST_REGISTRATION", "PUBLIC"],
      ["src/specs/rogue/assassination/registration.ts", "ASSASSINATION_REGISTRATION", "PUBLIC"],
      ["src/specs/rogue/subtlety/registration.ts", "SUBTLETY_ROGUE_REGISTRATION", "INTERNAL_ONLY"],
      ["src/specs/shaman/enhancement/registration.ts", "ENHANCEMENT_SHAMAN_REGISTRATION", "INTERNAL_ONLY"],
      ["src/specs/shaman/restoration/registration.ts", "RESTORATION_SHAMAN_REGISTRATION", "PUBLIC"],
      ["src/specs/warrior/arms/registration.ts", "ARMS_WARRIOR_REGISTRATION", "INTERNAL_ONLY"],
      ["src/specs/warrior/fury/registration.ts", "FURY_WARRIOR_REGISTRATION", "INTERNAL_ONLY"],
      ["src/specs/warrior/protection/registration.ts", "PROTECTION_WARRIOR_REGISTRATION", "INTERNAL_ONLY"],
    ]);
  });
});

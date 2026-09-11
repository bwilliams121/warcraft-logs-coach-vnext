import { describe, expect, it } from "vitest";

import { resolveFightIdentity } from "../../src/wcl/identity.js";
import { decodePreflight, type PreflightPayload } from "../../src/wcl/preflight-query.js";
import {
  preflightData,
  REQUEST,
  reportWithActors,
  reportWithFight,
  validReport,
  type ReportFixture,
} from "../fixtures/wcl/preflight-payloads.js";

/**
 * Required regression: a valid Warcraft Logs identity must never silently
 * become partially null.
 *
 * The previous analyzer hydrated actors in a way that could produce:
 *
 *     name  = null
 *     class = null
 *     spec  = known
 *
 * and carried that forward into gameplay evaluation, which then coached a
 * player whose identity was never actually established.
 *
 * Two guarantees together prevent it here:
 *
 * 1. `FightIdentity` has no partially-populated variant, so a half-hydrated
 *    player is not representable.
 * 2. Missing or unusable identity fields fail closed with a typed reason.
 */

function payload(report: ReportFixture | null): PreflightPayload {
  const outcome = decodePreflight(preflightData(report));
  if (!outcome.ok) {
    throw new Error("fixture did not decode, but this test intends a decodable payload");
  }
  return outcome.value;
}

function resolve(report: ReportFixture | null) {
  return resolveFightIdentity(payload(report), REQUEST);
}

/** Every leaf value in a JSON-ish object, with its path. */
function collectLeaves(value: unknown, path = "", into: [string, unknown][] = []): [string, unknown][] {
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      collectLeaves(nested, path === "" ? key : `${path}.${key}`, into);
    }
    return into;
  }
  into.push([path, value]);
  return into;
}

describe("wcl identity is never partially hydrated", () => {
  it("identity_with_null_name_never_resolves_with_a_known_spec", () => {
    // The exact old failure: spec present, name absent.
    const result = resolve(reportWithActors([{ id: 15, name: null, type: "Player", subType: "Rogue" }]));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("IDENTITY_UNRESOLVED");
    }
    // And crucially: no identity object exists to be consumed downstream.
    expect("identity" in result).toBe(false);
  });

  it("identity_with_null_class_never_resolves_with_a_known_spec", () => {
    const result = resolve(reportWithActors([{ id: 15, name: "Coachtest", type: "Player", subType: null }]));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("IDENTITY_UNRESOLVED");
    }
    expect("identity" in result).toBe(false);
  });

  it("known_name_and_class_with_an_unusable_spec_also_fails_closed", () => {
    // The inverse direction of the same bug. A resolved actor must not be
    // carried forward with a guessed or blank specialization.
    const result = resolve(
      reportWithFight({ friendlyPlayers: [15, 16], friendlySpecs: [null, "Protection"] }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("IDENTITY_UNRESOLVED");
    }
  });

  it("no_resolved_identity_ever_carries_an_empty_field", () => {
    // Structural sweep over every leaf: nothing null, undefined, or blank may
    // survive into a resolved identity — except gameVersion and difficulty,
    // which WCL itself declares nullable.
    const nullableByContract = new Set(["data.gameVersion", "fight.difficulty"]);

    const reports: ReportFixture[] = [
      validReport(),
      reportWithFight({ difficulty: null }),
      reportWithFight({ encounterID: 0, name: "Trash" }),
    ];

    for (const report of reports) {
      const result = resolve(report);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;

      for (const [path, value] of collectLeaves(result.identity)) {
        if (nullableByContract.has(path)) {
          continue;
        }
        expect(value, `${path} must not be null`).not.toBeNull();
        expect(value, `${path} must not be undefined`).not.toBeUndefined();
        if (typeof value === "string") {
          expect(value.trim().length, `${path} must not be blank`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("name_class_and_spec_are_resolved_together_or_not_at_all", () => {
    // Either all three are present, or there is no identity at all. There is no
    // third outcome.
    const cases: (ReportFixture | null)[] = [
      validReport(),
      reportWithActors([{ id: 15, name: "Coachtest", type: "Player" }]),
      reportWithActors([{ id: 15, type: "Player", subType: "Rogue" }]),
      reportWithFight({ friendlyPlayers: [15, 16], friendlySpecs: ["", "Protection"] }),
      null,
    ];

    for (const report of cases) {
      const result = resolve(report);
      if (!result.ok) {
        continue;
      }
      const { name, className, specName } = result.identity.player;
      expect(name.trim().length).toBeGreaterThan(0);
      expect(className.trim().length).toBeGreaterThan(0);
      expect(specName.trim().length).toBeGreaterThan(0);
    }
  });
});

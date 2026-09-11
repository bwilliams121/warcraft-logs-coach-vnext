import { describe, expect, it } from "vitest";

import { deriveIngestionScope, type AnalyzerRequirement } from "../../src/services/ingestion-scope.js";

const playerContextAnalyzer: AnalyzerRequirement = {
  analyzerId: "example-rotation",
  requiredScope: "PLAYER_CONTEXT",
};

const fullRaidAnalyzer: AnalyzerRequirement = {
  analyzerId: "example-healer-coverage",
  requiredScope: "FULL_RAID",
};

describe("deriveIngestionScope", () => {
  it("scope_is_derived_from_the_union_of_declared_analyzer_inputs", () => {
    const result = deriveIngestionScope([playerContextAnalyzer]);

    expect(result).toEqual({
      ok: true,
      scope: "PLAYER_CONTEXT",
      contributingAnalyzers: ["example-rotation"],
    });
  });

  it("adding_a_full_raid_analyzer_widens_the_derived_scope", () => {
    const narrow = deriveIngestionScope([playerContextAnalyzer]);
    const widened = deriveIngestionScope([playerContextAnalyzer, fullRaidAnalyzer]);

    expect(narrow.ok && narrow.scope).toBe("PLAYER_CONTEXT");
    expect(widened).toEqual({
      ok: true,
      scope: "FULL_RAID",
      contributingAnalyzers: ["example-healer-coverage"],
    });
  });

  it("derivation_is_order_independent", () => {
    expect(deriveIngestionScope([fullRaidAnalyzer, playerContextAnalyzer])).toEqual(
      deriveIngestionScope([playerContextAnalyzer, fullRaidAnalyzer]),
    );
  });

  it("no_enabled_analyzers_does_not_default_to_player_context", () => {
    // With nothing enabled there is nothing to analyze. Falling back to the
    // narrowest scope is the silent under-fetch this module exists to prevent.
    expect(deriveIngestionScope([])).toEqual({ ok: false, reason: "NO_ANALYZERS_ENABLED" });
  });

  it("scope_derivation_prevents_silent_under_fetch", () => {
    // Scope cannot be narrowed from outside, because derivation takes analyzer
    // requirements as its ONLY input. There is no caller-supplied scope to
    // reconcile, so under-fetching is structurally impossible rather than
    // something a runtime check must catch.
    expect(deriveIngestionScope.length).toBe(1);

    const derived = deriveIngestionScope([playerContextAnalyzer, fullRaidAnalyzer]);
    expect(derived.ok && derived.scope).toBe("FULL_RAID");

    // Requiring FULL_RAID anywhere in the union can never yield PLAYER_CONTEXT.
    const permutations: AnalyzerRequirement[][] = [
      [fullRaidAnalyzer],
      [fullRaidAnalyzer, playerContextAnalyzer],
      [playerContextAnalyzer, fullRaidAnalyzer, playerContextAnalyzer],
    ];
    for (const requirements of permutations) {
      const result = deriveIngestionScope(requirements);
      expect(result.ok && result.scope).toBe("FULL_RAID");
    }
  });
});

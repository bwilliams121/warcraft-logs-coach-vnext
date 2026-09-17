/**
 * SHARED_DECISION_ENGINE executors (M10-C correction 2): the specialization-
 * neutral first-scan engine under `src/simc/`, driven directly over a
 * SYNTHETIC authority artifact.
 *
 * No specialization is involved and none may be: this module imports from
 * `src/simc/` only. The bindings, the proven-usable tokens and the entry list
 * all come from the case parameters, so every premise of a claim is written
 * in the manifest beside the claim. The artifact is a labelled synthetic
 * authority — the engine's priority semantics are the subject, not any real
 * rotation.
 *
 * WHAT IS PINNED: the three shapes of a single foreground scan.
 *
 *     DEFINITE      a higher-priority entry proven to fire selects, and
 *                   nothing below it is reachable
 *     AMBIGUOUS     an UNDECIDED higher-priority entry contaminates the scan:
 *                   the lower-priority certainty is NOT promoted to the answer
 *                   (the priority short-circuit rule)
 *     BLOCKED       an unsupported expression refuses the scan with the exact
 *                   entry it stopped at, never evaluating as false or true
 */

import { loadAplAuthority, type AplAction } from "../../../../src/simc/apl-authority.js";
import { provenUsable, unknownUsability } from "../../../../src/simc/action-applicability.js";
import { unknownNumber, type AtomBindings } from "../../../../src/simc/expression/evaluate.js";
import {
  resolveOneForegroundScan,
  type OneForegroundScanResult,
} from "../../../../src/simc/nested-selection.js";
import type { LoadedArtifact } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";
import type { ParamsOf } from "./params.js";

interface ScanPremise {
  readonly entryListName: string;
  readonly knownBuffs: readonly { readonly name: string; readonly up: boolean }[];
  readonly knownTalents: readonly { readonly name: string; readonly taken: boolean }[];
  readonly provenUsableTokens: readonly string[];
}

/** Every magnitude UNKNOWN; only what the case states is bound. */
function bindingsOf(premise: ScanPremise): AtomBindings {
  return {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    knownBuffs: premise.knownBuffs,
    knownTalents: premise.knownTalents,
  };
}

function scan(
  artifact: LoadedArtifact,
  premise: ScanPremise,
):
  | { readonly ok: true; readonly result: OneForegroundScanResult }
  | { readonly ok: false; readonly outcome: AssertionOutcome } {
  const loaded = loadAplAuthority(artifact.json);
  if (!loaded.ok) {
    return {
      ok: false,
      outcome: fail("the artifact is not a loadable authority", {
        actual: { reason: loaded.reason, detail: loaded.detail },
      }),
    };
  }
  const usable = new Set(premise.provenUsableTokens);
  const result = resolveOneForegroundScan({
    authority: loaded.authority,
    entryListName: premise.entryListName,
    bindings: bindingsOf(premise),
    usabilityFor: (action: AplAction) =>
      usable.has(action.actionToken) ? provenUsable() : unknownUsability(),
  });
  return { ok: true, result };
}

const entryOf = (step: { listName: string; priorityOrdinal: number; actionToken: string }) => ({
  listName: step.listName,
  priorityOrdinal: step.priorityOrdinal,
  actionToken: step.actionToken,
});

export function scanSelectsDefinitely(
  artifact: LoadedArtifact,
  params: ParamsOf<"SHARED_DECISION_ENGINE.SCAN_SELECTS_DEFINITELY">,
): AssertionOutcome {
  const run = scan(artifact, params);
  if (!run.ok) return run.outcome;
  const { result } = run;
  if (result.kind !== "RESOLVED" || result.resolution.kind !== "DEFINITE") {
    return fail("the scan did not resolve to one definite entry", {
      expected: { kind: "RESOLVED", resolution: "DEFINITE", entry: params.expected },
      actual:
        result.kind === "RESOLVED" ? { resolution: result.resolution.kind } : { blocker: result.blocker },
    });
  }
  const actual = entryOf(result.resolution.step);
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the definite entry differs", { expected: params.expected, actual });
  }
  return pass();
}

export function scanUndecidedByHigherPriority(
  artifact: LoadedArtifact,
  params: ParamsOf<"SHARED_DECISION_ENGINE.SCAN_UNDECIDED_BY_HIGHER_PRIORITY">,
): AssertionOutcome {
  const run = scan(artifact, params);
  if (!run.ok) return run.outcome;
  const { result } = run;
  if (result.kind !== "RESOLVED" || result.resolution.kind !== "AMBIGUOUS") {
    return fail("the scan did not stay AMBIGUOUS across the undecided higher-priority entry", {
      expected: { kind: "RESOLVED", resolution: "AMBIGUOUS" },
      actual:
        result.kind === "RESOLVED" ? { resolution: result.resolution.kind } : { blocker: result.blocker },
    });
  }
  const actual = result.resolution.candidates.map((candidate) => ({
    ...entryOf(candidate.step),
    definite: candidate.definite,
  }));
  if (JSON.stringify(actual) !== JSON.stringify(params.expectedCandidates)) {
    return fail("the candidate set differs", { expected: params.expectedCandidates, actual });
  }
  return pass();
}

export function scanRefusesUnsupportedExpression(
  artifact: LoadedArtifact,
  params: ParamsOf<"SHARED_DECISION_ENGINE.SCAN_REFUSES_UNSUPPORTED_EXPRESSION">,
): AssertionOutcome {
  const run = scan(artifact, params);
  if (!run.ok) return run.outcome;
  const { result } = run;
  if (
    result.kind !== "BLOCKED" ||
    result.blocker !== "UNSUPPORTED_AUTHORITY_EXPRESSION" ||
    result.blockedAt === null
  ) {
    return fail("the scan did not refuse with UNSUPPORTED_AUTHORITY_EXPRESSION", {
      expected: {
        kind: "BLOCKED",
        blocker: "UNSUPPORTED_AUTHORITY_EXPRESSION",
        blockedAt: params.expectedBlockedAt,
      },
      actual:
        result.kind === "BLOCKED" ? { blocker: result.blocker } : { resolution: result.resolution.kind },
    });
  }
  const actual = entryOf(result.blockedAt);
  if (JSON.stringify(actual) !== JSON.stringify(params.expectedBlockedAt)) {
    return fail("the blocking entry differs", { expected: params.expectedBlockedAt, actual });
  }
  const gate = result.blockedAt.gate;
  if (gate.kind !== "UNSUPPORTED" || gate.fragment !== params.expectedFragment) {
    return fail("the blocking entry's gate does not carry the unsupported fragment", {
      expected: { gate: "UNSUPPORTED", fragment: params.expectedFragment },
      actual:
        gate.kind === "UNSUPPORTED"
          ? { gate: gate.kind, reason: gate.reason, fragment: gate.fragment }
          : { gate: gate.kind },
    });
  }
  return pass();
}

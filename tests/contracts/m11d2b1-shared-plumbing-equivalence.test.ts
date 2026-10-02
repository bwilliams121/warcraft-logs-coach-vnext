import { beforeAll, describe, expect, it, vi } from "vitest";

import bloodArtifact from "../../src/simc/data/deathknight-blood.apl.json";
import brewmasterArtifact from "../../src/simc/data/monk-brewmaster.apl.json";
import protectionArtifact from "../../src/simc/data/paladin-protection.apl.json";
import retributionArtifact from "../../src/simc/data/paladin-retribution.apl.json";
import { bloodTokenBinding } from "../../src/data/game/deathknight-blood-gcd-semantics.js";
import { bloodTransitionContractFor } from "../../src/data/game/deathknight-blood-transition-authority.js";
import { brewmasterTokenBinding } from "../../src/data/game/monk-brewmaster-gcd-semantics.js";
import { BREWMASTER_READINESS_FACTS } from "../../src/data/game/monk-brewmaster-readiness-authority.js";
import { brewmasterTransitionContractFor } from "../../src/data/game/monk-brewmaster-transition-authority.js";
import { retributionTransitionContractFor } from "../../src/data/game/paladin-retribution-transition-authority.js";
import type { HeroTreeResolution } from "../../src/data/game/talent-selection.js";
import type { CooldownReadiness } from "../../src/engine/game-state/cooldowns/cooldown-usability.js";
import {
  AUTHORITY_DOMAINS,
  type AuthorityAccess,
  type AuthorityDomain,
  type AuthorityDomainBinding,
  type AuthorityResolution,
} from "../../src/findings/authority-domain.js";
import {
  offensiveAuthorityBinding,
  pinnedAplAuthority,
  standaloneAuthorityAccess,
  type PinnedAuthorityIdentity,
} from "../../src/findings/pinned-apl-authority.js";
import { validatedHeroTreeProfile } from "../../src/findings/validated-hero-tree-profile.js";
import { provenUnusable, type ActionUsabilityVerdict } from "../../src/simc/action-applicability.js";
import type { AplAction, AuthorityLoadResult } from "../../src/simc/apl-authority.js";
import {
  asPathEntry,
  contractForSelected,
  executedEntriesKey,
  executedEntryKey,
  executedEntryOf,
  hasExecuted,
  withExecution,
  type ExecutedEntriesState,
  type ExecutedEntry,
} from "../../src/simc/executed-entries.js";
import type { AtomBindings } from "../../src/simc/expression/evaluate.js";
import {
  heroTreeTruths,
  magnitudeAtom,
  notEstablishedAtom,
  notModelledAtom,
  resourceFieldsNotModelled,
  truthAtom,
  type HeroTreeAtom,
} from "../../src/simc/expression/spec-atom-builders.js";
import type { SpecAtomBinding } from "../../src/simc/expression/spec-vocabulary.js";
import {
  bindingCandidates,
  sequenceUsability,
  type UnusableVerdict,
} from "../../src/findings/usability/usability-steps.js";
import { ANALYZER_REGISTRATIONS } from "../../src/services/analyzer-registry.js";
import {
  NO_READINESS_FACTS,
  type BloodReadinessFact,
} from "../../src/specs/deathknight/blood/action-profile.js";
import {
  BLOOD_DECLARED_DOMAINS,
  BLOOD_OFFENSIVE_AUTHORITY,
  standaloneBloodAuthorityAccess,
} from "../../src/specs/deathknight/blood/authority-bindings.js";
import * as bloodState from "../../src/specs/deathknight/blood/first-gcd-state.js";
import { bloodContractForSelected } from "../../src/specs/deathknight/blood/first-gcd-adapter.js";
import {
  BLOOD_DEATH_KNIGHT_AUTHORITY_IDENTITY,
  pinnedBloodDeathKnightAuthority,
} from "../../src/specs/deathknight/blood/pinned-authority.js";
import { resolveBloodAtoms } from "../../src/specs/deathknight/blood/resolver.js";
import {
  MARROWREND_TOKEN,
  NO_RUNE_AFFORDABILITY,
  marrowrendAffordabilityProven,
  type BloodRuneAffordability,
} from "../../src/specs/deathknight/blood/rune-affordability.js";
import {
  BLOOD_VALIDATED_HERO_TREES,
  bloodValidatedProfile,
} from "../../src/specs/deathknight/blood/supported-profile.js";
import { HERO_TREE_DEATHBRINGER, HERO_TREE_SANLAYN } from "../../src/specs/deathknight/blood/vocabulary.js";
import type { BrewmasterUsabilityInput } from "../../src/specs/monk/brewmaster/action-profile.js";
import {
  BREWMASTER_DECLARED_DOMAINS,
  BREWMASTER_OFFENSIVE_AUTHORITY,
  standaloneBrewmasterAuthorityAccess,
} from "../../src/specs/monk/brewmaster/authority-bindings.js";
import * as brewmasterState from "../../src/specs/monk/brewmaster/first-gcd-state.js";
import { brewmasterContractForSelected } from "../../src/specs/monk/brewmaster/first-gcd-adapter.js";
import {
  BREWMASTER_MONK_AUTHORITY_IDENTITY,
  pinnedBrewmasterMonkAuthority,
} from "../../src/specs/monk/brewmaster/pinned-authority.js";
import { resolveBrewmasterAtoms } from "../../src/specs/monk/brewmaster/resolver.js";
import {
  BREWMASTER_VALIDATED_HERO_TREES,
  brewmasterValidatedProfile,
} from "../../src/specs/monk/brewmaster/supported-profile.js";
import {
  HERO_TREE_MASTER_OF_HARMONY,
  HERO_TREE_SHADOPAN,
} from "../../src/specs/monk/brewmaster/vocabulary.js";
import {
  PROTECTION_DECLARED_DOMAINS,
  PROTECTION_OFFENSIVE_AUTHORITY,
  standaloneProtectionAuthorityAccess,
} from "../../src/specs/paladin/protection/authority-bindings.js";
import * as protectionState from "../../src/specs/paladin/protection/first-gcd-state.js";
import {
  PROTECTION_PALADIN_AUTHORITY_IDENTITY,
  pinnedProtectionPaladinAuthority,
} from "../../src/specs/paladin/protection/pinned-authority.js";
import {
  RETRIBUTION_DECLARED_DOMAINS,
  RETRIBUTION_OFFENSIVE_AUTHORITY,
  standaloneRetributionAuthorityAccess,
} from "../../src/specs/paladin/retribution/authority-bindings.js";
import * as retributionState from "../../src/specs/paladin/retribution/first-gcd-state.js";
import { retributionContractForSelected } from "../../src/specs/paladin/retribution/first-gcd-adapter.js";
import {
  RETRIBUTION_PALADIN_AUTHORITY_IDENTITY,
  pinnedRetributionPaladinAuthority,
} from "../../src/specs/paladin/retribution/pinned-authority.js";
import { committedEvidenceArchiveFiles } from "../support/corpus/evidence-archive.js";
import { corpusBundleState, corpusState, stateOfBundle } from "../support/corpus/fight.js";
import {
  committedCorpusFiles,
  loadCommittedCorpus,
  validateEvidenceArchive,
} from "../support/corpus/loader.js";

/**
 * M11-D2-B1 — the shared analyzer plumbing reproduces the specialization
 * implementations it was extracted from, on committed evidence.
 *
 * HOW. The four template specializations' own functions are wrapped — never
 * replaced — so every call the REAL analyzers make while analyzing every
 * committed capture and bundle is recorded with its arguments and result.
 * Each recorded call is then replayed through the shared helper and the two
 * results must be deep-equal, strings included. Where a helper takes
 * spec-owned steps (a gate, a proof, a lookup), the test supplies them exactly
 * as the specialization states them, so what is proven is the shared part:
 * the sequence, the generic steps and the result shapes.
 *
 * No public analyzer imports a helper. Nothing here changes what any analyzer
 * computes: the wrappers return the original result unchanged.
 */

type Recorded = { readonly args: readonly unknown[]; readonly result: unknown };

const recorder = vi.hoisted(() => {
  const calls = new Map<string, Recorded[]>();
  function wrap<F extends (...args: never[]) => unknown>(label: string, fn: F): F {
    return ((...args: Parameters<F>) => {
      const result = fn(...args);
      let list = calls.get(label);
      if (list === undefined) {
        list = [];
        calls.set(label, list);
      }
      list.push({ args, result });
      return result;
    }) as F;
  }
  return { calls, wrap };
});

vi.mock("../../src/specs/deathknight/blood/first-gcd-state.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/specs/deathknight/blood/first-gcd-state.js")>();
  return {
    ...m,
    withExecution: recorder.wrap("blood.withExecution", m.withExecution),
    hasExecuted: recorder.wrap("blood.hasExecuted", m.hasExecuted),
    bloodStateKey: recorder.wrap("blood.stateKey", m.bloodStateKey),
  };
});
vi.mock("../../src/specs/monk/brewmaster/first-gcd-state.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/specs/monk/brewmaster/first-gcd-state.js")>();
  return {
    ...m,
    withExecution: recorder.wrap("brewmaster.withExecution", m.withExecution),
    hasExecuted: recorder.wrap("brewmaster.hasExecuted", m.hasExecuted),
    brewmasterStateKey: recorder.wrap("brewmaster.stateKey", m.brewmasterStateKey),
  };
});
vi.mock("../../src/specs/paladin/retribution/first-gcd-state.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/specs/paladin/retribution/first-gcd-state.js")>();
  return {
    ...m,
    withExecution: recorder.wrap("retribution.withExecution", m.withExecution),
    hasExecuted: recorder.wrap("retribution.hasExecuted", m.hasExecuted),
    retributionStateKey: recorder.wrap("retribution.stateKey", m.retributionStateKey),
  };
});
vi.mock("../../src/specs/paladin/protection/first-gcd-state.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/specs/paladin/protection/first-gcd-state.js")>();
  return {
    ...m,
    withExecution: recorder.wrap("protection.withExecution", m.withExecution),
    protectionStateKey: recorder.wrap("protection.stateKey", m.protectionStateKey),
  };
});
vi.mock("../../src/specs/deathknight/blood/action-profile.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/specs/deathknight/blood/action-profile.js")>();
  return { ...m, resolveBloodUsability: recorder.wrap("blood.usability", m.resolveBloodUsability) };
});
vi.mock("../../src/specs/monk/brewmaster/action-profile.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/specs/monk/brewmaster/action-profile.js")>();
  return {
    ...m,
    resolveBrewmasterUsability: recorder.wrap("brewmaster.usability", m.resolveBrewmasterUsability),
  };
});
vi.mock("../../src/specs/deathknight/blood/resolver.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/specs/deathknight/blood/resolver.js")>();
  return { ...m, resolveBloodAtoms: recorder.wrap("blood.atoms", m.resolveBloodAtoms) };
});
vi.mock("../../src/specs/monk/brewmaster/resolver.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/specs/monk/brewmaster/resolver.js")>();
  return { ...m, resolveBrewmasterAtoms: recorder.wrap("brewmaster.atoms", m.resolveBrewmasterAtoms) };
});
vi.mock("../../src/specs/paladin/retribution/resolver.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/specs/paladin/retribution/resolver.js")>();
  return { ...m, resolveRetributionAtoms: recorder.wrap("retribution.atoms", m.resolveRetributionAtoms) };
});
vi.mock("../../src/specs/paladin/protection/resolver.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/specs/paladin/protection/resolver.js")>();
  return { ...m, resolveProtectionAtoms: recorder.wrap("protection.atoms", m.resolveProtectionAtoms) };
});
vi.mock("../../src/specs/deathknight/blood/supported-profile.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/specs/deathknight/blood/supported-profile.js")>();
  return { ...m, bloodValidatedProfile: recorder.wrap("blood.profile", m.bloodValidatedProfile) };
});
vi.mock("../../src/specs/monk/brewmaster/supported-profile.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/specs/monk/brewmaster/supported-profile.js")>();
  return {
    ...m,
    brewmasterValidatedProfile: recorder.wrap("brewmaster.profile", m.brewmasterValidatedProfile),
  };
});
vi.mock("../../src/specs/deathknight/blood/first-gcd-adapter.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/specs/deathknight/blood/first-gcd-adapter.js")>();
  return { ...m, bloodFirstGcdSelectionAt: recorder.wrap("blood.query", m.bloodFirstGcdSelectionAt) };
});
vi.mock("../../src/specs/monk/brewmaster/first-gcd-adapter.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/specs/monk/brewmaster/first-gcd-adapter.js")>();
  return {
    ...m,
    brewmasterFirstGcdSelectionAt: recorder.wrap("brewmaster.query", m.brewmasterFirstGcdSelectionAt),
  };
});
vi.mock("../../src/specs/paladin/retribution/first-gcd-adapter.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/specs/paladin/retribution/first-gcd-adapter.js")>();
  return {
    ...m,
    retributionFirstGcdSelectionAt: recorder.wrap("retribution.query", m.retributionFirstGcdSelectionAt),
  };
});
vi.mock("../../src/specs/paladin/protection/first-gcd-adapter.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/specs/paladin/protection/first-gcd-adapter.js")>();
  return {
    ...m,
    protectionFirstGcdSelectionAt: recorder.wrap("protection.query", m.protectionFirstGcdSelectionAt),
  };
});

const TEMPLATE_SPECS = ["deathknight/blood", "monk/brewmaster", "paladin/retribution", "paladin/protection"];

function calls(label: string): readonly Recorded[] {
  return recorder.calls.get(label) ?? [];
}

/** Every committed capture and bundle, analyzed by the four template registrations, exactly as the public baseline does. */
async function analyzeCorpus(): Promise<number> {
  const registrations = ANALYZER_REGISTRATIONS.filter((r) => TEMPLATE_SPECS.includes(r.specId));
  expect(registrations).toHaveLength(4);
  let analyses = 0;
  const run = (state: unknown, actorId: number): void => {
    for (const registration of registrations) {
      registration.analyze({ state, actorId, specId: registration.specId, targetActorId: null } as never);
      analyses += 1;
    }
  };
  const loaded = await loadCommittedCorpus();
  if (!loaded.ok) throw new Error("the committed corpus does not load");
  for (const artifact of loaded.corpus.artifacts) {
    if (artifact.record.payloadKind !== "WCL_EVENT_ARRAY" || !artifact.record.artifactId.startsWith("wcl-"))
      continue;
    const state = corpusState(artifact.record.artifactId);
    const actors = new Set<number>();
    for (const event of state.fight.events) {
      if (event.kind === "CAST" && event.castPhase === "COMPLETE" && event.source !== null)
        actors.add(event.source.actorId);
    }
    for (const actor of [...actors].sort((a, b) => a - b)) run(state, actor);
  }
  const prot165 = ["seg-45-60", "seg-60-90", "seg-90-120", "seg-120-165"].map(
    (s) => `wcl-protection-paladin-a7r6-rotational-165s.${s}`,
  );
  run(corpusBundleState(["wcl-protection-paladin-a7r6-rotational-45s", ...prot165], []), 7);
  run(
    corpusBundleState(
      [
        "wcl-retribution-paladin-a7r6-rotational-45s",
        "wcl-retribution-paladin-a7r6-rotational-165s.seg-45-105",
        "wcl-retribution-paladin-a7r6-rotational-165s.seg-105-165",
      ],
      [],
    ),
    6,
  );
  run(
    corpusBundleState(
      [
        "wcl-blood-death-knight-a7r6-rotational-45s",
        "wcl-blood-death-knight-a7r6-rotational-165s.seg-45-105",
        "wcl-blood-death-knight-a7r6-rotational-165s.seg-105-165",
      ],
      [],
    ),
    14,
  );
  const archive = await validateEvidenceArchive(committedEvidenceArchiveFiles(), committedCorpusFiles());
  if (!archive.ok) throw new Error("the evidence archive does not validate");
  for (const [actor, parts] of [
    [
      4,
      [
        "wcl-brewmaster-monk-gtkb-opener",
        "wcl-brewmaster-monk-gtkb-rotational-165s.seg-20-165",
        "wcl-brewmaster-monk-gtkb-full-fight.seg-165-285",
      ],
    ],
    [11, ["wcl-brewmaster-monk-rxaf-opener", "wcl-brewmaster-monk-rxaf-rotational-165s.seg-20-165"]],
  ] as const) {
    run(stateOfBundle(archive.archive, parts, []), actor);
  }
  return analyses;
}

// Each check replays tens of thousands of recorded calls; 60 s is a CPU-sensitive
// ceiling for a loaded full-suite run, not a performance target.
const CHECK_TIMEOUT_MS = 60_000;

let analyses = 0;
beforeAll(async () => {
  analyses = await analyzeCorpus();
}, 180_000);

// ---------------------------------------------------------------------------
// The specialization-owned steps, stated exactly as each specialization does.
// ---------------------------------------------------------------------------

const ACTIVE_COOLDOWN_DETAIL =
  "the ability's own cooldown, anchored on the actor's last OBSERVED cast before this decision under " +
  "the pinned base and the reviewed modifier policy, is proven to exceed the queueing tolerance, so " +
  "action_t::ready cannot succeed. The bound is a LOWER bound and is compared as one.";

interface ReadinessRow {
  readonly simcToken: string;
  readonly readiness: CooldownReadiness;
  readonly abilityGameId: number | null;
}

function activeCooldownGate(readiness: readonly ReadinessRow[], token: string): UnusableVerdict | null {
  const fact = readiness.find((row) => row.simcToken === token);
  if (fact === undefined || fact.readiness.state !== "PROVEN_NOT_READY") return null;
  return provenUnusable("ACTIVE_COOLDOWN", {
    abilityGameId: fact.abilityGameId,
    itemId: null,
    provenRemainingAtLeastMs: fact.readiness.provenRemainingAtLeastMs,
    cooldownToleranceMs: fact.readiness.cooldownToleranceMs,
    detail: ACTIVE_COOLDOWN_DETAIL,
  }) as UnusableVerdict;
}

function bloodReference(args: readonly unknown[]): ActionUsabilityVerdict {
  const state = args[0] as bloodState.BloodFirstGcdState;
  const action = args[1] as AplAction;
  const observed = args[2] as number;
  const readiness = (args[3] ?? NO_READINESS_FACTS) as readonly BloodReadinessFact[];
  const runes = (args[4] ?? NO_RUNE_AFFORDABILITY) as BloodRuneAffordability;
  return sequenceUsability({
    executedInBranch: hasExecuted(state, executedEntryOf(action)),
    branchRefusals: [],
    observedAbilityGameId: observed,
    observedCandidates: bindingCandidates(bloodTokenBinding(action.actionToken)),
    negativeGates: [() => activeCooldownGate(readiness, action.actionToken)],
    positiveProofs: [() => action.actionToken === MARROWREND_TOKEN && marrowrendAffordabilityProven(runes)],
  });
}

function brewmasterReference(input: BrewmasterUsabilityInput): ActionUsabilityVerdict {
  const { state, action, observedAbilityGameId, buildFacts, readiness, readinessAuras } = input;
  const candidates = bindingCandidates(brewmasterTokenBinding(action.actionToken));
  return sequenceUsability({
    executedInBranch: hasExecuted(state, executedEntryOf(action)),
    branchRefusals: [
      () =>
        state.sharedCooldownTokens.includes(action.actionToken)
          ? (provenUnusable("SIMULATED_PREFIX_EXECUTION", {
              abilityGameId: null,
              itemId: null,
              provenRemainingAtLeastMs: null,
              cooldownToleranceMs: null,
              detail:
                "HYPOTHETICAL, not observed: in this explored branch an entry naming this token has already fired, " +
                "and its internal cooldown is shared by name across every entry naming it, so none can fire again " +
                "at zero elapsed time. This says nothing about what the player actually did.",
            }) as UnusableVerdict)
          : null,
    ],
    observedAbilityGameId,
    observedCandidates: candidates,
    negativeGates: [
      () => {
        for (const fact of BREWMASTER_READINESS_FACTS) {
          if (fact.simcToken !== action.actionToken || fact.gate.kind !== "NOT_READY_WHILE_TALENT_SELECTED")
            continue;
          const talent = fact.gate.talentSimcName;
          if ((buildFacts.talents[talent]?.selection ?? "UNKNOWN") !== "SELECTED") continue;
          return provenUnusable("STATIC_READY_FALSE", {
            abilityGameId: candidates[0] ?? null,
            itemId: null,
            provenRemainingAtLeastMs: null,
            cooldownToleranceMs: null,
            detail:
              `the action's ready() returns false while talent '${talent}' is taken, and the observed tree ` +
              "resolves it SELECTED (sc_monk.cpp:848-853); the action cannot fire whatever its cooldown says.",
          }) as UnusableVerdict;
        }
        return null;
      },
      () => activeCooldownGate(readiness, action.actionToken),
      () => {
        const aura = readinessAuras.find((row) => row.simcToken === action.actionToken);
        if (aura === undefined || aura.state !== "PROVEN_INACTIVE") return null;
        return provenUnusable("REQUIRED_AURA_INACTIVE", {
          abilityGameId: aura.wireAuraId,
          itemId: null,
          provenRemainingAtLeastMs: null,
          cooldownToleranceMs: null,
          detail:
            `ready() requires aura ${String(aura.wireAuraId)} up, and M4 proved it INACTIVE from the removal ` +
            `observed at ${String(aura.anchorReportTimeMs)}; the action cannot fire whatever its gate says.`,
        }) as UnusableVerdict;
      },
    ],
    positiveProofs: [() => input.positiveUsability?.get(action.actionToken)?.kind === "PROVEN_USABLE"],
  });
}

function verdictLabel(verdict: ActionUsabilityVerdict): string {
  return verdict.kind === "PROVEN_UNUSABLE" ? `PROVEN_UNUSABLE:${verdict.reason}` : verdict.kind;
}

function tally(labels: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const label of labels) out[label] = (out[label] ?? 0) + 1;
  return out;
}

// ---------------------------------------------------------------------------

describe("the corpus run is real and non-vacuous", () => {
  it("analyzed every committed capture and bundle with the four template registrations", () => {
    expect(analyses).toBeGreaterThan(400);
    for (const label of [
      "blood.withExecution",
      "brewmaster.withExecution",
      "retribution.withExecution",
      "protection.withExecution",
      "blood.usability",
      "brewmaster.usability",
      "blood.atoms",
      "brewmaster.atoms",
      "retribution.atoms",
      "protection.atoms",
      "blood.profile",
      "brewmaster.profile",
    ]) {
      expect(calls(label).length, label).toBeGreaterThan(0);
    }
  });
});

describe("executed-entry utilities", { timeout: CHECK_TIMEOUT_MS }, () => {
  const SPECS = [
    { name: "blood", m: bloodState },
    { name: "brewmaster", m: brewmasterState },
    { name: "retribution", m: retributionState },
    { name: "protection", m: protectionState },
  ] as const;

  it.each(SPECS.map((s) => [s.name] as const))(
    "%s: every recorded withExecution is reproduced exactly",
    (name) => {
      const recorded = calls(`${name}.withExecution`);
      for (const { args, result } of recorded) {
        const [state, entry] = args as [ExecutedEntriesState, ExecutedEntry];
        expect(withExecution(state, entry)).toStrictEqual(result);
      }
    },
  );

  it.each(["blood", "brewmaster", "retribution"].map((n) => [n] as const))(
    "%s: every recorded hasExecuted is reproduced exactly",
    (name) => {
      const recorded = calls(`${name}.hasExecuted`);
      expect(recorded.length).toBeGreaterThan(0);
      expect(recorded.some(({ result }) => result === true)).toBe(true);
      for (const { args, result } of recorded) {
        const [state, entry] = args as [ExecutedEntriesState, ExecutedEntry];
        expect(hasExecuted(state, entry)).toBe(result);
      }
    },
  );

  it.each(SPECS.map((s) => [s.name, s.m] as const))(
    "%s: entry key and path entry match on every executed entry",
    (name, m) => {
      const entries = calls(`${name}.withExecution`).map(({ args }) => args[1] as ExecutedEntry);
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(executedEntryKey(entry)).toBe(m.executedEntryKey(entry));
        expect(asPathEntry(entry)).toStrictEqual(m.asPathEntry(entry));
      }
    },
  );

  it("the sorted executed-entry key IS the Blood and Retribution state key, and the prefix of every richer one", () => {
    for (const name of ["blood", "retribution"]) {
      for (const { args, result } of calls(`${name}.stateKey`)) {
        expect(executedEntriesKey((args[0] as ExecutedEntriesState).executedEntries)).toBe(result);
      }
    }
    for (const { args, result } of calls("brewmaster.stateKey")) {
      const state = args[0] as brewmasterState.BrewmasterFirstGcdState;
      const shared = executedEntriesKey(state.executedEntries);
      const plain = state.sharedCooldownTokens.length === 0 && state.forgottenBuffs.length === 0;
      // The suffix is Brewmaster's own; the executed part is the shared key.
      expect(plain ? result : (result as string).slice(0, shared.length)).toBe(shared);
    }
    for (const { args, result } of calls("protection.stateKey")) {
      const state = args[0] as protectionState.ProtectionFirstGcdState;
      expect(
        (result as string).startsWith(`${state.race}|${executedEntriesKey(state.executedEntries)}|forgot[`),
      ).toBe(true);
    }
    expect(calls("blood.stateKey").length + calls("retribution.stateKey").length).toBeGreaterThan(0);
  });

  it.each([
    ["blood", pinnedBloodDeathKnightAuthority, bloodContractForSelected, bloodTransitionContractFor],
    [
      "brewmaster",
      pinnedBrewmasterMonkAuthority,
      brewmasterContractForSelected,
      brewmasterTransitionContractFor,
    ],
    [
      "retribution",
      pinnedRetributionPaladinAuthority,
      retributionContractForSelected,
      retributionTransitionContractFor,
    ],
  ] as const)(
    "%s: the contract lookup and its refusal match for every pinned action token",
    (_name, pinned, specLookup, table) => {
      const loaded = pinned();
      if (!loaded.ok) throw new Error("authority");
      const tokens = [...new Set(loaded.authority.actions.map((action) => action.actionToken))];
      let contracts = 0;
      for (const actionToken of tokens) {
        const spec = specLookup({ actionToken, step: undefined as never });
        const shared = contractForSelected(actionToken, table as (token: string) => unknown);
        expect(shared).toStrictEqual(spec);
        if ("contract" in spec) contracts += 1;
      }
      expect(contracts).toBeGreaterThan(0);
      expect(contracts).toBeLessThan(tokens.length);
    },
  );
});

describe("usability-step sequencing", { timeout: CHECK_TIMEOUT_MS }, () => {
  it("Blood: every recorded usability verdict is reproduced exactly, in every branch the corpus reaches", () => {
    const recorded = calls("blood.usability");
    for (const { args, result } of recorded) {
      expect(bloodReference(args)).toStrictEqual(result);
    }
    const reached = tally(recorded.map(({ result }) => verdictLabel(result as ActionUsabilityVerdict)));
    for (const label of [
      "PROVEN_UNUSABLE:SIMULATED_PREFIX_EXECUTION",
      "PROVEN_USABLE",
      "PROVEN_UNUSABLE:ACTIVE_COOLDOWN",
      "UNKNOWN",
    ]) {
      expect(reached[label] ?? 0, label).toBeGreaterThan(0);
    }
  });

  it("Brewmaster: every recorded usability verdict is reproduced exactly, in every branch the corpus reaches", () => {
    const recorded = calls("brewmaster.usability");
    for (const { args, result } of recorded) {
      expect(brewmasterReference(args[0] as BrewmasterUsabilityInput)).toStrictEqual(result);
    }
    const reached = tally(recorded.map(({ result }) => verdictLabel(result as ActionUsabilityVerdict)));
    for (const label of [
      "PROVEN_UNUSABLE:SIMULATED_PREFIX_EXECUTION",
      "PROVEN_USABLE",
      "PROVEN_UNUSABLE:ACTIVE_COOLDOWN",
      "UNKNOWN",
    ]) {
      expect(reached[label] ?? 0, label).toBeGreaterThan(0);
    }
  });

  it("stops at the first step that decides and never consults a later one", () => {
    const consulted: string[] = [];
    const gate = (name: string, verdict: UnusableVerdict | null) => () => {
      consulted.push(name);
      return verdict;
    };
    const refusal = provenUnusable("ACTIVE_COOLDOWN", {
      abilityGameId: null,
      itemId: null,
      provenRemainingAtLeastMs: null,
      cooldownToleranceMs: null,
      detail: "spec-owned",
    }) as UnusableVerdict;
    const base = {
      branchRefusals: [gate("branch", null)],
      observedAbilityGameId: 1,
      observedCandidates: [2],
      negativeGates: [gate("negative-1", null), gate("negative-2", refusal), gate("negative-3", null)],
      positiveProofs: [
        () => {
          consulted.push("positive");
          return true;
        },
      ],
    };
    expect(sequenceUsability({ ...base, executedInBranch: false })).toStrictEqual(refusal);
    expect(consulted).toEqual(["branch", "negative-1", "negative-2"]);
    consulted.length = 0;
    expect(sequenceUsability({ ...base, executedInBranch: true }).kind).toBe("PROVEN_UNUSABLE");
    expect(consulted).toEqual([]);
    consulted.length = 0;
    expect(sequenceUsability({ ...base, executedInBranch: false, observedCandidates: [1] })).toStrictEqual({
      kind: "PROVEN_USABLE",
    });
    expect(consulted).toEqual(["branch"]);
  });
});

describe("spec-atom builders", { timeout: CHECK_TIMEOUT_MS }, () => {
  function rebuilt(binding: SpecAtomBinding): SpecAtomBinding | null {
    if (binding.value.kind === "TRUTH")
      return truthAtom(binding.key, binding.value.value, binding.actionToken);
    const number = binding.value.binding;
    if (number.state === "KNOWN_NUMBER") return magnitudeAtom(binding.key, number.value, binding.actionToken);
    if (number.state === "UNKNOWN_NUMBER" && number.reason === "STATE_NOT_MODELLED") {
      return notModelledAtom(binding.key, binding.actionToken);
    }
    if (number.state === "UNKNOWN_NUMBER" && number.reason === "STATE_NOT_ESTABLISHED") {
      return notEstablishedAtom(binding.key, binding.actionToken);
    }
    return null;
  }

  it.each(["blood", "brewmaster", "retribution", "protection"].map((n) => [n] as const))(
    "%s: every binding the resolver emitted in the corpus that a builder constructs is reproduced exactly",
    (name) => {
      const recorded = calls(`${name}.atoms`);
      expect(recorded.length).toBeGreaterThan(0);
      let constructed = 0;
      for (const { result } of recorded) {
        const { specAtoms } = result as { specAtoms: { bound: readonly SpecAtomBinding[] } };
        for (const binding of specAtoms.bound) {
          const shared = rebuilt(binding);
          if (shared === null) continue; // a spec-owned binding kind (a bound or a set)
          expect(shared).toStrictEqual(binding);
          constructed += 1;
        }
      }
      expect(constructed).toBeGreaterThan(0);
    },
  );

  const VARIANTS: readonly HeroTreeResolution[] = [
    { state: "RESOLVED", simcName: "sanlayn", subTreeId: 31, decidedByEntryIds: [1] },
    { state: "RESOLVED", simcName: "deathbringer", subTreeId: 33, decidedByEntryIds: [2] },
    { state: "RESOLVED", simcName: "shadopan", subTreeId: 66, decidedByEntryIds: [3] },
    { state: "RESOLVED", simcName: "master_of_harmony", subTreeId: 65, decidedByEntryIds: [4] },
    { state: "RESOLVED", simcName: "some_other_tree", subTreeId: 99, decidedByEntryIds: [5, 6] },
    { state: "CONTRADICTORY", subTreeIds: [31, 33] },
    { state: "UNKNOWN" },
  ];

  it.each([
    [
      "blood",
      resolveBloodAtoms,
      [
        { key: HERO_TREE_SANLAYN, simcName: "sanlayn" },
        { key: HERO_TREE_DEATHBRINGER, simcName: "deathbringer" },
      ],
    ],
    [
      "brewmaster",
      resolveBrewmasterAtoms,
      [
        { key: HERO_TREE_MASTER_OF_HARMONY, simcName: "master_of_harmony" },
        { key: HERO_TREE_SHADOPAN, simcName: "shadopan" },
      ],
    ],
  ] as const)(
    "%s: the hero-tree truths are all-or-none, in the resolver's order, over the corpus and every resolution",
    (name, resolve, atoms: readonly HeroTreeAtom[]) => {
      const keys = new Set(atoms.map((atom) => atom.key));
      const check = (heroTree: HeroTreeResolution, result: unknown): void => {
        const { specAtoms, diagnostics } = result as {
          specAtoms: { bound: readonly SpecAtomBinding[] };
          diagnostics: { heroTreeBound: string | null };
        };
        const shared = heroTreeTruths(heroTree, atoms);
        expect(shared.bindings).toStrictEqual(specAtoms.bound.filter((binding) => keys.has(binding.key)));
        expect(shared.bound).toBe(diagnostics.heroTreeBound);
      };
      const recorded = [...calls(`${name}.atoms`)];
      for (const { args, result } of recorded)
        check((args[0] as { heroTree: HeroTreeResolution }).heroTree, result);
      const input = recorded[0]?.args[0] as Record<string, unknown>;
      for (const heroTree of VARIANTS) {
        check(heroTree, (resolve as (input: never) => unknown)({ ...input, heroTree } as never));
      }
    },
  );

  it.each(["blood", "brewmaster", "retribution", "protection"].map((n) => [n] as const))(
    "%s: the three always-stated resource fields equal the shared not-modelled defaults at every decision",
    (name) => {
      const recorded = calls(`${name}.query`);
      expect(recorded.length).toBeGreaterThan(0);
      for (const { args } of recorded) {
        const { bindings } = args[0] as { bindings: AtomBindings };
        expect({
          comboPoints: bindings.comboPoints,
          comboPointsDeficit: bindings.comboPointsDeficit,
          energyPct: bindings.energyPct,
        }).toStrictEqual(resourceFieldsNotModelled());
      }
    },
  );
});

describe("pinned-authority helper", { timeout: CHECK_TIMEOUT_MS }, () => {
  const SPECS: readonly {
    readonly name: string;
    readonly artifact: Parameters<typeof pinnedAplAuthority>[0];
    readonly identity: PinnedAuthorityIdentity;
    readonly load: () => AuthorityLoadResult;
    readonly offensive: AuthorityDomainBinding;
    readonly declared: readonly AuthorityDomain[];
    readonly standalone: () => AuthorityAccess;
  }[] = [
    {
      name: "blood",
      artifact: bloodArtifact,
      identity: BLOOD_DEATH_KNIGHT_AUTHORITY_IDENTITY,
      load: pinnedBloodDeathKnightAuthority,
      offensive: BLOOD_OFFENSIVE_AUTHORITY,
      declared: BLOOD_DECLARED_DOMAINS,
      standalone: standaloneBloodAuthorityAccess,
    },
    {
      name: "brewmaster",
      artifact: brewmasterArtifact,
      identity: BREWMASTER_MONK_AUTHORITY_IDENTITY,
      load: pinnedBrewmasterMonkAuthority,
      offensive: BREWMASTER_OFFENSIVE_AUTHORITY,
      declared: BREWMASTER_DECLARED_DOMAINS,
      standalone: standaloneBrewmasterAuthorityAccess,
    },
    {
      name: "retribution",
      artifact: retributionArtifact,
      identity: RETRIBUTION_PALADIN_AUTHORITY_IDENTITY,
      load: pinnedRetributionPaladinAuthority,
      offensive: RETRIBUTION_OFFENSIVE_AUTHORITY,
      declared: RETRIBUTION_DECLARED_DOMAINS,
      standalone: standaloneRetributionAuthorityAccess,
    },
    {
      name: "protection",
      artifact: protectionArtifact,
      identity: PROTECTION_PALADIN_AUTHORITY_IDENTITY,
      load: pinnedProtectionPaladinAuthority,
      offensive: PROTECTION_OFFENSIVE_AUTHORITY,
      declared: PROTECTION_DECLARED_DOMAINS,
      standalone: standaloneProtectionAuthorityAccess,
    },
  ];

  function sameLoad(a: AuthorityLoadResult, b: AuthorityLoadResult): void {
    expect(a.ok).toBe(b.ok);
    if (a.ok && b.ok) {
      expect(a.authority.artifact).toStrictEqual(b.authority.artifact);
      expect(a.authority.actions).toStrictEqual(b.authority.actions);
    } else if (!a.ok && !b.ok) {
      expect([a.reason, a.detail]).toEqual([b.reason, b.detail]);
    }
  }

  function sameResolution(a: AuthorityResolution, b: AuthorityResolution): void {
    expect([a.outcome, a.domain]).toEqual([b.outcome, b.domain]);
    if (a.outcome === "AUTHORITY_AVAILABLE" && b.outcome === "AUTHORITY_AVAILABLE") {
      const { load: _a, ...bindingA } = a.binding;
      const { load: _b, ...bindingB } = b.binding;
      expect(bindingA).toStrictEqual(bindingB);
      expect(a.kind).toBe(b.kind);
      expect(a.authority.artifact).toStrictEqual(b.authority.artifact);
      expect(a.authority.actions).toStrictEqual(b.authority.actions);
    }
  }

  it.each(SPECS.map((s) => [s.name, s] as const))(
    "%s: identity, load, offensive binding and standalone access match the specialization's",
    (_name, spec) => {
      const pinned = pinnedAplAuthority(spec.artifact);
      expect(pinned.identity).toStrictEqual(spec.identity);
      expect(Object.isFrozen(pinned.identity)).toBe(Object.isFrozen(spec.identity));
      sameLoad(pinned.load(), spec.load());
      expect(pinned.load().ok).toBe(true);

      const binding = offensiveAuthorityBinding(pinned);
      const { load: sharedLoad, ...shared } = binding;
      const { load: specLoad, ...owned } = spec.offensive;
      expect(shared).toStrictEqual(owned);
      expect(Object.isFrozen(binding)).toBe(Object.isFrozen(spec.offensive));
      sameLoad(sharedLoad(), specLoad());

      const access = standaloneAuthorityAccess(spec.declared, [binding]);
      const specAccess = spec.standalone();
      for (const domain of AUTHORITY_DOMAINS)
        sameResolution(access.forDomain(domain), specAccess.forDomain(domain));
    },
  );

  it("memoises per artifact, re-validates after a reset, and never shares a cache between artifacts", () => {
    const blood = pinnedAplAuthority(bloodArtifact);
    const brewmaster = pinnedAplAuthority(brewmasterArtifact);
    const first = blood.load();
    const other = brewmaster.load();
    expect(blood.load()).toBe(first);
    blood.resetCache();
    const second = blood.load();
    expect(second).not.toBe(first);
    sameLoad(second, first);
    expect(brewmaster.load()).toBe(other);
    expect(
      first.ok && other.ok && first.authority.artifact.authorityId !== other.authority.artifact.authorityId,
    ).toBe(true);
  });
});

describe("validated hero-tree profile helper", { timeout: CHECK_TIMEOUT_MS }, () => {
  const VARIANTS: readonly HeroTreeResolution[] = [
    { state: "RESOLVED", simcName: "sanlayn", subTreeId: 31, decidedByEntryIds: [1, 2] },
    { state: "RESOLVED", simcName: "deathbringer", subTreeId: 33, decidedByEntryIds: [7] },
    { state: "RESOLVED", simcName: "shadopan", subTreeId: 66, decidedByEntryIds: [3] },
    { state: "RESOLVED", simcName: "master_of_harmony", subTreeId: 65, decidedByEntryIds: [4, 5] },
    { state: "CONTRADICTORY", subTreeIds: [65, 66] },
    { state: "UNKNOWN" },
  ];

  it.each([
    ["blood", "Blood Death Knight", BLOOD_VALIDATED_HERO_TREES, bloodValidatedProfile],
    ["brewmaster", "Brewmaster Monk", BREWMASTER_VALIDATED_HERO_TREES, brewmasterValidatedProfile],
  ] as const)(
    "%s: every recorded profile, and every resolution, is reproduced exactly",
    (name, displayName, trees, specProfile) => {
      const recorded = calls(`${name}.profile`);
      expect(recorded.length).toBeGreaterThan(0);
      const gate = { displayName, trees: trees as readonly string[] };
      for (const { args, result } of recorded) {
        expect(validatedHeroTreeProfile(gate, args[0] as HeroTreeResolution)).toStrictEqual(result);
      }
      for (const heroTree of VARIANTS) {
        expect(validatedHeroTreeProfile(gate, heroTree)).toStrictEqual(specProfile(heroTree));
      }
    },
  );
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import type { CastDecisionAnchorState } from "../../src/engine/game-state/casting/cast-decision-anchor.js";
import { enemySetAt, type EnemySetQuery } from "../../src/engine/game-state/enemies/enemy-set.js";
import type { CombatActor } from "../../src/engine/normalization/actors.js";
import { createNormalizer } from "../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../src/engine/normalization/supported-families.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import { decisionPositionOfAnchor, withEnemyCountAt } from "../../src/findings/enemy-count-bindings.js";
import { PUBLIC_SPEC_IDS } from "../../src/findings/spec-id.js";
import { allApplicable, provenUsable } from "../../src/simc/action-applicability.js";
import { loadAplAuthority, type AplAction } from "../../src/simc/apl-authority.js";
import { classifyDecision } from "../../src/simc/decision-coverage.js";
import {
  enemyCountBinding,
  enemyCountFromBounds,
  spellTargetsEvidence,
  withActiveEnemies,
  withSpellTargets,
  type ActionTargetApplicability,
  type EnemyCountEvidence,
} from "../../src/simc/expression/enemy-count.js";
import {
  evaluateSimcExpression,
  knownNumber,
  NO_ACTING_ACTION,
  type AtomBindings,
  type TargetCandidate,
  type TargetDomain,
} from "../../src/simc/expression/evaluate.js";
import { isBuiltinIdentifier, parseSimcExpression } from "../../src/simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomBindings,
} from "../../src/simc/expression/spec-vocabulary.js";
import { firstGcdSelectionAcrossRescans } from "../../src/simc/first-gcd-selection.js";
import { selectAcrossLists, resolveOneForegroundScan } from "../../src/simc/nested-selection.js";
import { selectWithinList } from "../../src/simc/list-selection.js";
import { targetIfVerdict } from "../../src/simc/target-if.js";
import { syntheticArtifact, syntheticAuthority, type SyntheticListSpec } from "../support/m5a-authority.js";
import { observableCategory, syntheticFight, UNVERIFIED_CATEGORY } from "../support/synthetic-fight.js";

/**
 * ONB-S3: the bounded, evidence-first enemy-set and target-count model.
 *
 * The owner's table, the rule that only positive evidence admits a member, and every direction a
 * count could be manufactured from: metadata, an earlier hit, silence, the future, a sibling
 * expression, an order. See agent/architecture.md "Owner decision (2026-11-05)".
 */

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;
const START = 1_000;
const END = 90_000;
const SUBJECT = 15;
const ALLY = 16;
const BOSS = 161;
const ADD = 180;
const DOT = 703;

function actor(actorId: number, actorType: CombatActor["actorType"]): [number, CombatActor] {
  return [
    actorId,
    {
      actorId,
      gameId: null,
      name: null,
      server: null,
      actorType,
      rawType: null,
      subType: null,
      petOwnerActorId: null,
    },
  ];
}

const CATALOG = new Map<number, CombatActor>([
  actor(SUBJECT, "PLAYER"),
  actor(ALLY, "PLAYER"),
  actor(BOSS, "NPC"),
  actor(ADD, "NPC"),
  actor(200, "NPC"),
]);

function stateOf(raw: readonly Raw[], options: { readonly auras?: boolean } = {}): CombatState {
  const normalizer = createNormalizer({
    fightStartTimeMs: START,
    requestedRange: inclusiveRange(START, END),
    contracts: indexContracts([...SUPPORTED_TYPE_CONTRACTS]),
    directionFields: VERIFIED_DIRECTION_FIELDS,
  });
  normalizer.accept({
    streamId: "all",
    pageOrdinal: 0,
    requestedStartTimeMs: START,
    nextPageTimestamp: null,
    events: raw,
  });
  return createCombatState(
    syntheticFight({
      events: normalizer.finish().events,
      startTimeMs: START,
      endTimeMs: END,
      actors: CATALOG,
      categories: {
        AURAS:
          options.auras === false
            ? UNVERIFIED_CATEGORY
            : observableCategory(inclusiveRange(START, END), null),
      },
    }),
  );
}

const instanceField = (instance: number | null): Raw =>
  instance === null ? {} : { targetInstance: instance };

const debuff = (
  timestamp: number,
  type: string,
  target: number,
  instance: number | null,
  source = SUBJECT,
): Raw => ({
  timestamp,
  type,
  sourceID: source,
  targetID: target,
  ...instanceField(instance),
  abilityGameID: DOT,
  fight: 1,
});
const hit = (timestamp: number, target: number, instance: number | null, source = SUBJECT): Raw => ({
  timestamp,
  type: "damage",
  sourceID: source,
  targetID: target,
  ...instanceField(instance),
  abilityGameID: 1,
  amount: 100,
  fight: 1,
});
const hitWithHealth = (
  timestamp: number,
  target: number,
  instance: number | null,
  hitPoints: number,
): Raw => ({
  ...hit(timestamp, target, instance, ALLY),
  resourceActor: 2,
  hitPoints,
  maxHitPoints: 1000,
});
const death = (timestamp: number, target: number, instance: number | null): Raw => ({
  timestamp,
  type: "death",
  sourceID: -1,
  targetID: target,
  ...instanceField(instance),
  abilityGameID: 0,
  fight: 1,
});
const decisionCast = (timestamp: number): Raw => ({
  timestamp,
  type: "cast",
  sourceID: SUBJECT,
  targetID: BOSS,
  abilityGameID: 2,
  fight: 1,
});

/** The set at the last event, which is the decision cast each scenario ends on. */
function setAtEnd(state: CombatState, extra: Partial<EnemySetQuery> = {}) {
  return enemySetAt(state, {
    subjectActorId: SUBJECT,
    at: { anchor: "BEFORE_EVENT", position: state.fight.events.length - 1 },
    ...extra,
  });
}
const memberKeys = (state: CombatState, extra: Partial<EnemySetQuery> = {}) =>
  setAtEnd(state, extra).members.map(
    (member) => `${String(member.actor.actorId)}#${String(member.actor.instanceId)}`,
  );

const BINDINGS: AtomBindings = {
  comboPoints: knownNumber(7),
  comboPointsDeficit: knownNumber(0),
  energyPct: knownNumber(100),
  dotRemainsSecondsByAction: [],
  knownBuffs: [],
};

const VOCABULARY = defineSpecAtomVocabulary(
  "test/spec",
  [
    { identifier: "active_enemies", shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
    { identifier: "spell_targets.cleave", shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
    { identifier: "player_flag", shape: "BOOLEAN", scope: "PLAYER_SCOPED", selfAddressing: false },
    { identifier: "debuff.bar.down", shape: "BOOLEAN", scope: "TARGET_SCOPED", selfAddressing: false },
    { identifier: "target_magnitude", shape: "NUMERIC", scope: "TARGET_SCOPED", selfAddressing: false },
  ],
  isBuiltinIdentifier,
);
const EMPTY_ATOMS: SpecAtomBindings = { vocabulary: VOCABULARY, bound: [] };

const withCount = (evidence: EnemyCountEvidence): AtomBindings => ({
  ...BINDINGS,
  specAtoms: withActiveEnemies(EMPTY_ATOMS, evidence),
});

function outcomeOf(expression: string, bindings: AtomBindings): "TRUE" | "FALSE" | "UNKNOWN" {
  const parsed = parseSimcExpression(expression, VOCABULARY);
  if (!parsed.ok) throw new Error(`does not parse: ${expression}`);
  const evaluation = evaluateSimcExpression(parsed.ast, expression, bindings, NO_ACTING_ACTION);
  if (evaluation.outcome !== "RESOLVED") return "UNKNOWN";
  return evaluation.value ? "TRUE" : "FALSE";
}

function actionOf(line: string): AplAction {
  const loaded = loadAplAuthority(syntheticArtifact({ lists: [{ listName: "default", actions: [line] }] }));
  if (!loaded.ok) throw new Error(loaded.detail);
  const lookup = loaded.authority.actionsInList("default");
  const [action] = lookup.found ? lookup.actions : [];
  if (action === undefined) throw new Error("no action");
  return action;
}

/** A candidate whose target-scoped `debuff.bar.down` is known; nothing else differs. */
const candidate = (
  key: string,
  barDown: boolean | null,
  ready: TargetCandidate["targetReady"],
): TargetCandidate => ({
  key,
  targetReady: ready,
  overlay:
    barDown === null
      ? {}
      : {
          specAtoms: {
            vocabulary: VOCABULARY,
            bound: [{ key: "debuff.bar.down", actionToken: null, value: { kind: "TRUTH", value: barDown } }],
          },
        },
});
const domainOf = (
  closure: TargetDomain["closure"],
  candidates: readonly TargetCandidate[],
): TargetDomain => ({
  closure,
  candidates,
  provenance: closure === "CLOSED" ? "synthetic closed roster" : "",
});
const overDomain = (domain: TargetDomain | null): AtomBindings => ({
  ...BINDINGS,
  specAtoms: EMPTY_ATOMS,
  targetDomainFor: () => domain,
});
const verdictKind = (line: string, bindings: AtomBindings = { ...BINDINGS, specAtoms: EMPTY_ATOMS }) =>
  targetIfVerdict(actionOf(line), bindings);

// ---------------------------------------------------------------------------
// The owner's table
// ---------------------------------------------------------------------------

describe("exact, bounded and unknown counts decide only what every consistent count agrees on", () => {
  it("is the owner's table for active_enemies>=3", () => {
    const expression = "active_enemies>=3";
    expect(outcomeOf(expression, withCount(enemyCountFromBounds(4, null)))).toBe("TRUE");
    expect(outcomeOf(expression, withCount(enemyCountFromBounds(0, 2)))).toBe("FALSE");
    expect(outcomeOf(expression, withCount(enemyCountFromBounds(2, 4)))).toBe("UNKNOWN");
    expect(outcomeOf(expression, withCount({ kind: "EXACT", count: 3 }))).toBe("TRUE");
    expect(outcomeOf(expression, withCount({ kind: "UNKNOWN", reason: "x" }))).toBe("UNKNOWN");
  });

  it("never collapses a lower bound into a value: active_enemies=1 is FALSE from 2 and UNKNOWN from 1", () => {
    expect(outcomeOf("active_enemies=1", withCount(enemyCountFromBounds(2, null)))).toBe("FALSE");
    expect(outcomeOf("active_enemies=1", withCount(enemyCountFromBounds(1, null)))).toBe("UNKNOWN");
    expect(outcomeOf("active_enemies<3", withCount(enemyCountFromBounds(1, null)))).toBe("UNKNOWN");
  });

  it("canonicalizes bounds, and two proofs that contradict believe neither", () => {
    expect(enemyCountFromBounds(3, 3)).toEqual({ kind: "EXACT", count: 3 });
    expect(enemyCountFromBounds(5, 2)).toEqual({ kind: "UNKNOWN", reason: "BOUNDS_CONTRADICT" });
    expect(enemyCountFromBounds(0, null)).toEqual({ kind: "UNKNOWN", reason: "NO_POSITIVE_MEMBER" });
    expect(enemyCountFromBounds(1.5, null).kind).toBe("UNKNOWN");
    expect(enemyCountBinding({ kind: "BOUNDED", lowerBound: 5, upperBound: 2 }).state).toBe("UNKNOWN_NUMBER");
  });

  it("binds a range as its members, never one point of it", () => {
    expect(enemyCountBinding(enemyCountFromBounds(2, 4))).toEqual({
      state: "ONE_OF_NUMBERS",
      values: [2, 3, 4],
      reason: "STATE_NOT_ESTABLISHED",
    });
    expect(enemyCountBinding(enemyCountFromBounds(2, null)).state).toBe("BOUNDED_NUMBER");
  });

  it("leaves a list that declares no count unchanged", () => {
    const other = defineSpecAtomVocabulary("test/other", [], isBuiltinIdentifier);
    const atoms: SpecAtomBindings = { vocabulary: other, bound: [] };
    expect(withActiveEnemies(atoms, { kind: "EXACT", count: 2 })).toBe(atoms);
  });
});

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

describe("membership needs positive evidence at the decision", () => {
  it("admits an enemy carrying the subject's debuff after friendly damage, as PRESENT and no more", () => {
    const set = setAtEnd(
      stateOf([hit(2_000, ADD, 1), debuff(2_100, "applydebuff", ADD, 1), decisionCast(5_000)]),
    );
    expect(set.count).toEqual({ kind: "BOUNDED", lowerBound: 1, upperBound: null });
    expect(set.members).toEqual([
      {
        actor: { actorId: ADD, instanceId: 1 },
        presence: "PRESENT",
        targetable: "UNKNOWN",
        inRange: "UNKNOWN",
        bases: ["CARRIES_SUBJECT_DEBUFF"],
        hostileIdentityPosition: 0,
      },
    ]);
    expect(set.absenceSemantics).toBe("NONE");
  });

  it("an earlier appearance admits nothing: a hit a second before the decision is not presence", () => {
    const set = setAtEnd(
      stateOf([hit(3_999, ADD, 1), hitWithHealth(3_999, BOSS, null, 500), decisionCast(5_000)]),
    );
    expect(set.members).toEqual([]);
    expect(set.count).toEqual({ kind: "UNKNOWN", reason: "NO_POSITIVE_MEMBER" });
  });

  it("the actor catalog admits nothing: every NPC of the report with no evidence stays out", () => {
    const set = setAtEnd(stateOf([decisionCast(5_000)]));
    expect(set.members).toEqual([]);
    expect(set.count.kind).toBe("UNKNOWN");
  });

  it("another player's debuff admits nothing", () => {
    const state = stateOf([
      hit(2_000, ADD, 1),
      debuff(2_100, "applydebuff", ADD, 1, ALLY),
      decisionCast(5_000),
    ]);
    expect(memberKeys(state)).toEqual([]);
  });

  it("a debuff with no hostile identity is disclosed and not counted", () => {
    const set = setAtEnd(stateOf([debuff(2_100, "applydebuff", 200, 1), decisionCast(5_000)]));
    expect(set.members).toEqual([]);
    expect(set.excluded).toEqual([
      {
        actor: { actorId: 200, instanceId: 1 },
        reason: "HOSTILE_IDENTITY_NOT_ESTABLISHED",
      },
    ]);
  });

  it("a player or a pet is never an enemy, whatever it carries", () => {
    const state = stateOf([
      hit(2_000, ALLY, null),
      debuff(2_100, "applydebuff", ALLY, null),
      decisionCast(5_000),
    ]);
    expect(memberKeys(state)).toEqual([]);
  });

  it("a health snapshot in the decision's own millisecond proves presence, with its hit as identity", () => {
    const set = setAtEnd(stateOf([hitWithHealth(5_000, ADD, 2, 500), decisionCast(5_000)]));
    expect(set.members.map((member) => member.bases)).toEqual([["POSITIVE_HEALTH_SNAPSHOT_AT_D"]]);
  });

  it("zero health in that millisecond proves nothing", () => {
    const state = stateOf([hitWithHealth(5_000, ADD, 2, 0), decisionCast(5_000)]);
    expect(memberKeys(state)).toEqual([]);
  });

  it("an observed removal ends presence; silence does not", () => {
    const removed = stateOf([
      hit(2_000, ADD, 1),
      debuff(2_100, "applydebuff", ADD, 1),
      debuff(3_000, "removedebuff", ADD, 1),
      decisionCast(5_000),
    ]);
    expect(memberKeys(removed)).toEqual([]);
    const silent = stateOf([hit(2_000, ADD, 1), debuff(2_100, "applydebuff", ADD, 1), decisionCast(60_000)]);
    expect(memberKeys(silent)).toEqual(["180#1"]);
  });

  it("any death fact for the key removes it from the proof, in every order", () => {
    const after = stateOf([
      hit(2_000, ADD, 1),
      debuff(2_100, "applydebuff", ADD, 1),
      death(3_000, ADD, 1),
      decisionCast(5_000),
    ]);
    expect(setAtEnd(after).excluded).toEqual([
      { actor: { actorId: ADD, instanceId: 1 }, reason: "DEATH_EVENT_FOR_KEY" },
    ]);
    const atDecision = stateOf([
      hit(2_000, ADD, 1),
      debuff(2_100, "applydebuff", ADD, 1),
      death(5_000, ADD, 1),
      decisionCast(5_000),
    ]);
    expect(memberKeys(atDecision)).toEqual([]);
  });

  it("a death that may be the same unit leaves the member out, in both alias directions", () => {
    const decided = (memberInstance: number | null, deadInstance: number | null) => {
      const state = stateOf([
        hit(2_000, ADD, memberInstance),
        debuff(2_100, "applydebuff", ADD, memberInstance),
        death(3_000, ADD, deadInstance),
        decisionCast(5_000),
      ]);
      const set = setAtEnd(state);
      return { set, atLeastOne: outcomeOf("active_enemies>=1", withCount(set.count)) };
    };
    for (const [member, dead] of [
      [1, null],
      [null, 1],
    ] as const) {
      const { set, atLeastOne } = decided(member, dead);
      expect(set.members, `${String(member)} / ${String(dead)}`).toEqual([]);
      expect(set.excluded).toEqual([
        { actor: { actorId: ADD, instanceId: member }, reason: "DEATH_EVENT_MAY_ALIAS" },
      ]);
      expect(atLeastOne).toBe("UNKNOWN");
    }
    // Control: two numbered instances are told apart.
    expect(decided(1, 2).atLeastOne).toBe("TRUE");
  });

  it("an aliasing death after the boundary has no effect", () => {
    const state = stateOf([
      hit(2_000, ADD, 1),
      debuff(2_100, "applydebuff", ADD, 1),
      decisionCast(5_000),
      death(5_000, ADD, null),
    ]);
    const set = enemySetAt(state, { subjectActorId: SUBJECT, at: { anchor: "BEFORE_EVENT", position: 2 } });
    expect(set.count).toEqual({ kind: "BOUNDED", lowerBound: 1, upperBound: null });
  });

  it("a death of one instance says nothing about another", () => {
    const state = stateOf([
      hit(2_000, ADD, 1),
      hit(2_000, ADD, 2),
      debuff(2_100, "applydebuff", ADD, 1),
      debuff(2_100, "applydebuff", ADD, 2),
      death(3_000, ADD, 1),
      decisionCast(5_000),
    ]);
    expect(memberKeys(state)).toEqual(["180#2"]);
  });

  it("counts each provable instance, and a null instance cannot add to a numbered one of its actor", () => {
    const numbered = stateOf([
      hit(2_000, ADD, 1),
      hit(2_000, ADD, 2),
      hit(2_000, BOSS, null),
      debuff(2_100, "applydebuff", ADD, 1),
      debuff(2_100, "applydebuff", ADD, 2),
      debuff(2_100, "applydebuff", BOSS, null),
      decisionCast(5_000),
    ]);
    expect(setAtEnd(numbered).count).toEqual({ kind: "BOUNDED", lowerBound: 3, upperBound: null });
    const aliased = stateOf([
      hit(2_000, ADD, 1),
      hit(2_000, ADD, null),
      debuff(2_100, "applydebuff", ADD, 1),
      debuff(2_100, "applydebuff", ADD, null),
      decisionCast(5_000),
    ]);
    expect(setAtEnd(aliased).count).toEqual({ kind: "BOUNDED", lowerBound: 1, upperBound: null });
    expect(setAtEnd(aliased).excluded.map((entry) => entry.reason)).toEqual(["NULL_INSTANCE_MAY_ALIAS"]);
  });

  it("missing aura coverage proves nothing either way: UNKNOWN, never zero", () => {
    const state = stateOf([hit(2_000, ADD, 1), debuff(2_100, "applydebuff", ADD, 1), decisionCast(5_000)], {
      auras: false,
    });
    expect(setAtEnd(state).count).toEqual({ kind: "UNKNOWN", reason: "NO_POSITIVE_MEMBER" });
    expect(enemyCountBinding(setAtEnd(state).count).state).toBe("UNKNOWN_NUMBER");
  });

  it("a timeline that is not monotonic has no sound prefix: UNKNOWN", () => {
    const state = stateOf([hit(4_000, ADD, 1), debuff(2_100, "applydebuff", ADD, 1), decisionCast(5_000)]);
    expect(setAtEnd(state).count).toEqual({ kind: "UNKNOWN", reason: "TIMELINE_NOT_MONOTONIC" });
  });

  it("an unresolved position is UNKNOWN", () => {
    const state = stateOf([decisionCast(5_000)]);
    const set = enemySetAt(state, { subjectActorId: SUBJECT, at: { anchor: "BEFORE_EVENT", position: 99 } });
    expect(set.count).toEqual({ kind: "UNKNOWN", reason: "POSITION_UNRESOLVED" });
  });
});

describe("no future evidence", () => {
  const prefix = [hit(2_000, ADD, 1), debuff(2_100, "applydebuff", ADD, 1), decisionCast(5_000)];

  it("appending later events never changes the answer at the decision", () => {
    const before = setAtEnd(stateOf(prefix));
    const position = prefix.length - 1;
    const later = stateOf([
      ...prefix,
      hit(5_100, ADD, 2),
      debuff(5_100, "applydebuff", ADD, 2),
      hitWithHealth(5_200, BOSS, null, 700),
      death(6_000, ADD, 1),
      debuff(6_000, "removedebuff", ADD, 1),
    ]);
    const after = enemySetAt(later, { subjectActorId: SUBJECT, at: { anchor: "BEFORE_EVENT", position } });
    expect(after).toEqual(before);
  });

  it("a death after the boundary cannot change the answer, in the same millisecond or later", () => {
    const before = setAtEnd(stateOf(prefix));
    expect(before.count).toEqual({ kind: "BOUNDED", lowerBound: 1, upperBound: null });
    const position = prefix.length - 1;
    for (const when of [5_000, 5_001]) {
      const later = stateOf([...prefix, death(when, ADD, 1)]);
      expect(later.eventAt(position + 1)?.kind, String(when)).toBe("DEATH");
      const after = enemySetAt(later, { subjectActorId: SUBJECT, at: { anchor: "BEFORE_EVENT", position } });
      expect(after, String(when)).toEqual(before);
    }
  });

  it("hostile identity established only after the decision does not count", () => {
    const state = stateOf([debuff(2_100, "applydebuff", 200, 1), decisionCast(5_000), hit(6_000, 200, 1)]);
    const set = enemySetAt(state, { subjectActorId: SUBJECT, at: { anchor: "BEFORE_EVENT", position: 1 } });
    expect(set.members).toEqual([]);
  });

  describe("the decision's position comes from the anchor's source", () => {
    const anchorOf = (
      source: "INSTANT_COMPLETION" | "OBSERVED_BEGINCAST" | "CHANNEL_START" | "DERIVED_FROM_COMPLETION",
      beginPosition: number | null,
    ): CastDecisionAnchorState => ({
      state: "ESTABLISHED",
      source,
      reportTimeMs: 5_000,
      beginPosition,
      beginLocator: null,
    });

    it("maps each source, and an unestablished anchor to none", () => {
      expect(decisionPositionOfAnchor(anchorOf("OBSERVED_BEGINCAST", 7), 20)).toBe(7);
      expect(decisionPositionOfAnchor(anchorOf("OBSERVED_BEGINCAST", null), 20)).toBe(null);
      expect(decisionPositionOfAnchor(anchorOf("INSTANT_COMPLETION", null), 20)).toBe(20);
      expect(decisionPositionOfAnchor(anchorOf("INSTANT_COMPLETION", 19), 20)).toBe(20);
      expect(decisionPositionOfAnchor(anchorOf("CHANNEL_START", null), 20)).toBe(20);
      expect(decisionPositionOfAnchor(anchorOf("DERIVED_FROM_COMPLETION", null), 20)).toBe(null);
      const unknown: CastDecisionAnchorState = {
        state: "UNKNOWN",
        reason: "CAST_TIME_UNKNOWN",
        evidenceReason: null,
        candidateReportTimesMs: [],
        detail: "synthetic",
      };
      expect(decisionPositionOfAnchor(unknown, 20)).toBe(null);
    });

    it("evidence between a begin and its completion in one millisecond cannot reach the begin's count", () => {
      const begin: Raw = { ...decisionCast(5_000), type: "begincast" };
      const state = stateOf([
        decisionCast(1_500),
        begin,
        hitWithHealth(5_000, ADD, 2, 500),
        decisionCast(5_000),
      ]);
      expect(state.eventAt(1)?.reportTimeMs).toBe(state.eventAt(3)?.reportTimeMs);
      const base: AtomBindings = { ...BINDINGS, specAtoms: EMPTY_ATOMS };
      const atAnchor = (anchor: CastDecisionAnchorState) =>
        withEnemyCountAt(base, state, SUBJECT, decisionPositionOfAnchor(anchor, 3));
      // The hard cast was decided at its begin, before that hit in the log.
      expect(outcomeOf("active_enemies>=1", atAnchor(anchorOf("OBSERVED_BEGINCAST", 1)))).toBe("UNKNOWN");
      // Control: an instant with a begin in its millisecond is decided at its completion, after the hit.
      expect(outcomeOf("active_enemies>=1", atAnchor(anchorOf("INSTANT_COMPLETION", 1)))).toBe("TRUE");
    });
  });

  it("a decision whose position is not established reads no count", () => {
    const bindings: AtomBindings = { ...BINDINGS, specAtoms: EMPTY_ATOMS };
    expect(withEnemyCountAt(bindings, stateOf(prefix), SUBJECT, null)).toBe(bindings);
  });
});

describe("an upper bound comes only from a source that says where it came from", () => {
  const twoMembers = () =>
    stateOf([
      hit(2_000, ADD, 1),
      hit(2_000, ADD, 2),
      debuff(2_100, "applydebuff", ADD, 1),
      debuff(2_100, "applydebuff", ADD, 2),
      decisionCast(5_000),
    ]);

  it("no event ever supplies one", () => {
    expect(setAtEnd(twoMembers()).count).toEqual({ kind: "BOUNDED", lowerBound: 2, upperBound: null });
  });

  it("a supplied bound makes the count exact or a range, and a contradicted one yields UNKNOWN", () => {
    const provenance = "synthetic curated roster";
    expect(setAtEnd(twoMembers(), { upperBound: { upperBound: 2, provenance } }).count).toEqual({
      kind: "EXACT",
      count: 2,
    });
    expect(setAtEnd(twoMembers(), { upperBound: { upperBound: 4, provenance } }).count).toEqual({
      kind: "BOUNDED",
      lowerBound: 2,
      upperBound: 4,
    });
    expect(setAtEnd(twoMembers(), { upperBound: { upperBound: 1, provenance } }).count).toEqual({
      kind: "UNKNOWN",
      reason: "UPPER_BOUND_CONTRADICTS_OBSERVED_MEMBERS",
    });
    expect(setAtEnd(twoMembers(), { upperBound: { upperBound: 4, provenance: "" } }).count.kind).toBe(
      "UNKNOWN",
    );
    expect(setAtEnd(twoMembers(), { upperBound: { upperBound: 1.5, provenance } }).count.kind).toBe(
      "UNKNOWN",
    );
  });
});

// ---------------------------------------------------------------------------
// spell_targets
// ---------------------------------------------------------------------------

describe("spell_targets is action-owned and never aliased to active_enemies", () => {
  const members = ["a", "b", "c"];
  const counted = { members, count: enemyCountFromBounds(3, null) };
  const registration = (
    verdicts: Record<string, "APPLICABLE" | "NOT_APPLICABLE" | "UNKNOWN">,
  ): ActionTargetApplicability<string> => ({
    simcToken: "cleave",
    provenance: "synthetic pinned mechanics",
    verdictFor: (member) => verdicts[member] ?? "UNKNOWN",
  });

  it("binding active_enemies leaves spell_targets unbound", () => {
    const bindings = withCount(enemyCountFromBounds(9, null));
    expect(outcomeOf("active_enemies>=3", bindings)).toBe("TRUE");
    expect(outcomeOf("spell_targets.cleave>=3", bindings)).toBe("UNKNOWN");
  });

  it("no registration is UNKNOWN however large the enemy count", () => {
    expect(spellTargetsEvidence(counted, null)).toEqual({
      kind: "UNKNOWN",
      reason: "NO_ACTION_TARGET_REGISTRATION",
    });
  });

  it("a registration without provenance is refused", () => {
    const evidence = spellTargetsEvidence(counted, { ...registration({ a: "APPLICABLE" }), provenance: "" });
    expect(evidence).toEqual({ kind: "UNKNOWN", reason: "REGISTRATION_WITHOUT_PROVENANCE" });
  });

  it("counts only members the action proves applicable", () => {
    expect(
      spellTargetsEvidence(counted, registration({ a: "APPLICABLE", b: "APPLICABLE", c: "UNKNOWN" })),
    ).toEqual({
      kind: "BOUNDED",
      lowerBound: 2,
      upperBound: null,
    });
    expect(spellTargetsEvidence(counted, registration({})).kind).toBe("UNKNOWN");
  });

  it("takes an upper bound only from the enemy set's own, less what the action rules out", () => {
    const closed = { members, count: enemyCountFromBounds(3, 3) };
    expect(
      spellTargetsEvidence(closed, registration({ a: "APPLICABLE", b: "NOT_APPLICABLE", c: "UNKNOWN" })),
    ).toEqual({
      kind: "BOUNDED",
      lowerBound: 1,
      upperBound: 2,
    });
    expect(
      spellTargetsEvidence(
        closed,
        registration({ a: "APPLICABLE", b: "NOT_APPLICABLE", c: "NOT_APPLICABLE" }),
      ),
    ).toEqual({ kind: "EXACT", count: 1 });
  });

  it("contradictory evidence stays UNKNOWN: it can never resolve a spell_targets comparison", () => {
    const contradicted = { members, count: enemyCountFromBounds(3, 2) };
    const allApplicableMembers = registration({ a: "APPLICABLE", b: "APPLICABLE", c: "APPLICABLE" });
    const evidence = spellTargetsEvidence(contradicted, allApplicableMembers);
    expect(evidence).toEqual({ kind: "UNKNOWN", reason: "BOUNDS_CONTRADICT" });
    const bindings: AtomBindings = {
      ...BINDINGS,
      specAtoms: withSpellTargets(EMPTY_ATOMS, "cleave", evidence),
    };
    expect(outcomeOf("spell_targets.cleave>=3", bindings)).toBe("UNKNOWN");
    expect(outcomeOf("spell_targets.cleave<1", bindings)).toBe("UNKNOWN");
  });

  it("binds its own identifier only", () => {
    const atoms = withSpellTargets(EMPTY_ATOMS, "cleave", { kind: "EXACT", count: 2 });
    const bindings: AtomBindings = { ...BINDINGS, specAtoms: atoms };
    expect(outcomeOf("spell_targets.cleave=2", bindings)).toBe("TRUE");
    expect(outcomeOf("active_enemies=2", bindings)).toBe("UNKNOWN");
  });
});

// ---------------------------------------------------------------------------
// target_if
// ---------------------------------------------------------------------------

describe("target_if resolves only when every target world agrees", () => {
  const FIRST = "x,target_if=first:debuff.bar.down";
  const FIRST_IF_TARGET = "x,target_if=first:debuff.bar.down,if=debuff.bar.down";
  const FIRST_IF_PLAYER = "x,target_if=first:debuff.bar.down,if=combo_points>=5";

  it("with no domain, FIRST stays refused exactly as before", () => {
    expect(verdictKind(FIRST)).toMatchObject({ kind: "REFUSED", reason: "FIRST_MODE_NEEDS_ENEMY_SET" });
    expect(verdictKind(FIRST, overDomain(null))).toMatchObject({ reason: "FIRST_MODE_NEEDS_ENEMY_SET" });
  });

  it("a FALSE player-only conjunct of the score eliminates FIRST with no domain at all", () => {
    const verdict = verdictKind("x,target_if=first:combo_points<5&debuff.bar.down");
    expect(verdict?.kind).toBe("ELIMINATED_FOR_EVERY_TARGET");
    if (verdict?.kind !== "ELIMINATED_FOR_EVERY_TARGET") return;
    expect(verdict.elimination.overTargets?.basis).toBe("SCORE_PLAYER_CONJUNCT_FALSE");
  });

  it("an OPEN domain whose candidates all score zero stays UNKNOWN: the unobserved enemy could score", () => {
    const domain = domainOf("OPEN", [candidate("a", false, "PROVEN_READY")]);
    expect(verdictKind(FIRST, overDomain(domain))).toMatchObject({
      kind: "REFUSED",
      reason: "TARGET_DOMAIN_NOT_CONVERGED",
    });
  });

  it("a CLOSED domain whose candidates all score zero is not ready", () => {
    const domain = domainOf("CLOSED", [
      candidate("a", false, "NOT_PROVEN"),
      candidate("b", false, "NOT_PROVEN"),
    ]);
    const verdict = verdictKind(FIRST, overDomain(domain));
    expect(verdict?.kind).toBe("ELIMINATED_FOR_EVERY_TARGET");
    if (verdict?.kind !== "ELIMINATED_FOR_EVERY_TARGET") return;
    expect(verdict.elimination.overTargets).toEqual({
      basis: "SCORE_ZERO_ON_EVERY_CANDIDATE",
      candidateKeys: ["a", "b"],
    });
  });

  it("a CLOSED domain without provenance proves nothing", () => {
    const domain = {
      closure: "CLOSED",
      candidates: [candidate("a", false, "NOT_PROVEN")],
      provenance: "",
    } as const;
    expect(verdictKind(FIRST, overDomain(domain))?.kind).toBe("REFUSED");
  });

  it("an undecided score on any candidate of a CLOSED domain blocks the elimination", () => {
    const domain = domainOf("CLOSED", [
      candidate("a", false, "NOT_PROVEN"),
      candidate("b", null, "NOT_PROVEN"),
    ]);
    expect(verdictKind(FIRST, overDomain(domain))?.kind).toBe("REFUSED");
  });

  it("a scored candidate proven ready means some target IS chosen, on an OPEN domain too", () => {
    const domain = domainOf("OPEN", [candidate("a", true, "PROVEN_READY")]);
    const verdict = verdictKind(FIRST, overDomain(domain));
    expect(verdict).toMatchObject({
      kind: "TARGET_SELECTION_IGNORABLE",
      condition: "ABSENT",
      scoreFiniteness: null,
    });
    expect(verdictKind(FIRST_IF_PLAYER, overDomain(domain))).toMatchObject({
      kind: "TARGET_SELECTION_IGNORABLE",
      condition: "PLAYER_SCOPED",
    });
  });

  it("being in the set does not prove the action ready on it", () => {
    const domain = domainOf("OPEN", [candidate("a", true, "NOT_PROVEN")]);
    expect(verdictKind(FIRST, overDomain(domain))?.kind).toBe("REFUSED");
  });

  it("a score that is not truth-valued is refused: one candidate needs > 0, several need != 0", () => {
    const domain = domainOf("OPEN", [
      {
        key: "a",
        targetReady: "PROVEN_READY",
        overlay: {
          specAtoms: {
            vocabulary: VOCABULARY,
            bound: [
              {
                key: "target_magnitude",
                actionToken: null,
                value: { kind: "MAGNITUDE", binding: knownNumber(-5) },
              },
            ],
          },
        },
      },
    ]);
    expect(verdictKind("x,target_if=first:target_magnitude", overDomain(domain))?.kind).toBe("REFUSED");
  });

  it("a target-dependent if= on an OPEN domain stays UNKNOWN: the unobserved enemy could be chosen", () => {
    const domain = domainOf("OPEN", [candidate("a", true, "PROVEN_READY")]);
    expect(verdictKind(FIRST_IF_TARGET, overDomain(domain))?.kind).toBe("REFUSED");
  });

  it("a target-dependent if= over a CLOSED domain resolves only when every candidate agrees", () => {
    const agreeTrue = domainOf("CLOSED", [
      candidate("a", true, "PROVEN_READY"),
      candidate("b", true, "NOT_PROVEN"),
    ]);
    expect(verdictKind(FIRST_IF_TARGET, overDomain(agreeTrue))).toMatchObject({
      kind: "TARGET_SELECTION_IGNORABLE",
      condition: "TRUE_ON_EVERY_CANDIDATE",
    });
    const disagree = domainOf("CLOSED", [
      candidate("a", true, "PROVEN_READY"),
      candidate("b", false, "NOT_PROVEN"),
    ]);
    expect(verdictKind(FIRST_IF_TARGET, overDomain(disagree))).toMatchObject({
      kind: "REFUSED",
      reason: "TARGET_DOMAIN_NOT_CONVERGED",
    });
  });

  it("MIN/MAX: a target-dependent if= FALSE on every candidate is not ready, whatever the score", () => {
    const domain = domainOf("CLOSED", [
      candidate("a", false, "NOT_PROVEN"),
      candidate("b", false, "NOT_PROVEN"),
    ]);
    const verdict = verdictKind("x,target_if=max:debuff.foo.remains,if=debuff.bar.down", overDomain(domain));
    expect(verdict?.kind).toBe("ELIMINATED_FOR_EVERY_TARGET");
    if (verdict?.kind !== "ELIMINATED_FOR_EVERY_TARGET") return;
    expect(verdict.elimination.overTargets?.basis).toBe("CONDITION_FALSE_ON_EVERY_CANDIDATE");
  });

  it("MIN/MAX: TRUE on every candidate needs a finite score AND a candidate proven ready", () => {
    const ready = overDomain(domainOf("CLOSED", [candidate("a", true, "PROVEN_READY")]));
    const notReady = overDomain(domainOf("CLOSED", [candidate("a", true, "NOT_PROVEN")]));
    const finite = "x,target_if=max:combo_points>=1,if=debuff.bar.down";
    expect(verdictKind(finite, ready)).toMatchObject({
      kind: "TARGET_SELECTION_IGNORABLE",
      condition: "TRUE_ON_EVERY_CANDIDATE",
    });
    expect(verdictKind(finite, notReady)).toMatchObject({
      kind: "REFUSED",
      reason: "TARGET_DOMAIN_NOT_CONVERGED",
    });
    expect(verdictKind("x,target_if=max:debuff.foo.remains,if=debuff.bar.down", ready)?.kind).toBe("REFUSED");
  });

  it("MIN/MAX: a stated domain with none proven ready proves no target, whatever the if= reads", () => {
    const notReady = overDomain(domainOf("OPEN", [candidate("a", true, "NOT_PROVEN")]));
    for (const line of [
      "x,target_if=max:combo_points>=1",
      "x,target_if=max:combo_points>=1,if=combo_points>=5",
    ]) {
      expect(verdictKind(line, notReady), line).toMatchObject({
        kind: "REFUSED",
        reason: "TARGET_DOMAIN_NOT_CONVERGED",
      });
    }
  });

  describe("both selectors, MIN/MAX over a closed domain", () => {
    const LINE = "x,target_if=max:combo_points>=1,if=debuff.bar.down";
    const selectorsOver = (bindings: AtomBindings) => {
      const authority = syntheticAuthority({ lists: [{ listName: "default", actions: [LINE, "y"] }] });
      return {
        nested: selectAcrossLists({
          authority,
          entryListName: "default",
          bindings,
          usabilityFor: () => provenUsable(),
          applicabilityFor: allApplicable(),
        }),
        flat: selectWithinList(authority, "default", bindings, () => "PROVEN_USABLE"),
      };
    };

    it("select with a candidate proven ready", () => {
      const { nested, flat } = selectorsOver(
        overDomain(domainOf("CLOSED", [candidate("a", true, "PROVEN_READY")])),
      );
      expect(nested).toMatchObject({ kind: "SELECTED", actionToken: "x" });
      expect(flat.kind).toBe("SELECTED");
    });

    it("stay undecided with none proven ready, and never fall through to the line below", () => {
      const { nested, flat } = selectorsOver(
        overDomain(domainOf("CLOSED", [candidate("a", true, "NOT_PROVEN")])),
      );
      expect(nested.kind).toBe("UNKNOWN");
      expect(flat).toMatchObject({ kind: "INDETERMINATE", blocker: "UNSUPPORTED_ACTION_OPTION" });
    });
  });

  it("candidate order is never authority: reversing a domain changes no verdict", () => {
    const candidates = [
      candidate("a", true, "PROVEN_READY"),
      candidate("b", false, "NOT_PROVEN"),
      candidate("c", null, "NOT_PROVEN"),
    ];
    const lines = [
      FIRST,
      FIRST_IF_TARGET,
      FIRST_IF_PLAYER,
      "x,target_if=max:combo_points>=1,if=debuff.bar.down",
    ];
    for (const closure of ["OPEN", "CLOSED"] as const) {
      for (const line of lines) {
        const forward = verdictKind(line, overDomain(domainOf(closure, candidates)));
        const reversed = verdictKind(line, overDomain(domainOf(closure, [...candidates].reverse())));
        expect(reversed?.kind, `${closure} ${line}`).toBe(forward?.kind);
        if (forward?.kind === "REFUSED" && reversed?.kind === "REFUSED") {
          expect(reversed.reason).toBe(forward.reason);
        }
      }
    }
  });

  it("an empty domain settles nothing", () => {
    expect(verdictKind(FIRST, overDomain(domainOf("CLOSED", [])))?.kind).toBe("REFUSED");
  });

  it("the `if=` proven on every candidate reads TRUE through both selectors, and selects", () => {
    const domain = domainOf("CLOSED", [candidate("a", true, "PROVEN_READY")]);
    const bindings = overDomain(domain);
    const lists: SyntheticListSpec[] = [{ listName: "default", actions: [FIRST_IF_TARGET, "y"] }];
    const input = {
      authority: syntheticAuthority({ lists }),
      entryListName: "default",
      bindings,
      usabilityFor: () => provenUsable(),
      applicabilityFor: allApplicable(),
    };
    const nested = selectAcrossLists(input);
    expect(nested).toMatchObject({ kind: "SELECTED", actionToken: "x" });
    const scan = resolveOneForegroundScan(input);
    expect(scan.kind).not.toBe("BLOCKED");
    const lookup = input.authority.actionsInList("default");
    expect(lookup.found).toBe(true);
    const flat = selectWithinList(input.authority, "default", bindings, () => "PROVEN_USABLE");
    expect(flat.kind).toBe("SELECTED");
  });
});

// ---------------------------------------------------------------------------
// The scan: what the count does to a priority list
// ---------------------------------------------------------------------------

describe("the count never launders a guess through the priority list", () => {
  const scanWith = (count: EnemyCountEvidence, actions: readonly string[]) =>
    selectAcrossLists({
      authority: syntheticAuthority({ lists: [{ listName: "default", actions: [...actions] }] }),
      entryListName: "default",
      bindings: { ...BINDINGS, specAtoms: withActiveEnemies(EMPTY_ATOMS, count) },
      usabilityFor: () => provenUsable(),
      applicabilityFor: allApplicable(),
    });

  it("an undecided count stops the scan at its own line, and never selects below it", () => {
    const result = scanWith(enemyCountFromBounds(1, null), ["x,if=active_enemies>=2", "y"]);
    expect(result).toMatchObject({ kind: "UNKNOWN" });
    if (result.kind !== "UNKNOWN") return;
    expect(result.blockedAt?.priorityOrdinal).toBe(0);
  });

  it("a count proven above the threshold selects, and one proven not equal steps past", () => {
    expect(scanWith(enemyCountFromBounds(3, null), ["x,if=active_enemies>=2", "y"])).toMatchObject({
      kind: "SELECTED",
      actionToken: "x",
    });
    expect(scanWith(enemyCountFromBounds(2, null), ["x,if=active_enemies=1", "y"])).toMatchObject({
      kind: "SELECTED",
      actionToken: "y",
    });
  });

  it("missing evidence never reads as one target", () => {
    const result = scanWith({ kind: "UNKNOWN", reason: "NO_POSITIVE_MEMBER" }, [
      "x,if=active_enemies=1",
      "y",
    ]);
    expect(result.kind).toBe("UNKNOWN");
  });

  it("a line blocked on an undecided count is still classified TARGET_COUNT, not as permanent state", () => {
    const authority = syntheticAuthority({
      lists: [
        { listName: "default", actions: ["run_action_list,name=aoe,if=active_enemies>=2", "y"] },
        { listName: "aoe", actions: ["x"] },
      ],
    });
    const result = firstGcdSelectionAcrossRescans<string>({
      rootListName: "default",
      initialState: "",
      stateKey: (state) => state,
      scanFor: () =>
        resolveOneForegroundScan({
          authority,
          entryListName: "default",
          bindings: withCount(enemyCountFromBounds(1, null)),
          usabilityFor: () => provenUsable(),
          applicabilityFor: allApplicable(),
        }),
      laneFor: () => "GCD_CONSUMING",
      transitionFor: () => ({ kind: "UNSUPPORTED", detail: "none" }),
    });
    expect(classifyDecision(result).blockerClass).toBe("TARGET_COUNT");
  });
});

// ---------------------------------------------------------------------------
// Ownership and invariance
// ---------------------------------------------------------------------------

describe("ownership and invariance", () => {
  const source = (path: string) => readFileSync(path, "utf8");

  const WIRED = [
    "deathknight/frost",
    "deathknight/unholy",
    "demonhunter/devourer",
    "druid/balance",
    "evoker/devastation",
    "hunter/marksmanship",
    "mage/arcane",
    "mage/fire",
    "mage/frost",
    "priest/shadow",
    "shaman/elemental",
    "shaman/enhancement",
    "warlock/affliction",
    "warlock/demonology",
    "warlock/destruction",
    "warrior/arms",
    "warrior/fury",
  ] as const;

  it("every wired specialization is INTERNAL_ONLY, so no public analyzer reads the new count", () => {
    for (const spec of WIRED) {
      expect((PUBLIC_SPEC_IDS as readonly string[]).includes(spec), spec).toBe(false);
      expect(source(`src/specs/${spec}/vocabulary.ts`), spec).toMatch(/"active_enemies"|ACTIVE_ENEMIES/);
      expect(source(`src/specs/${spec}/observed-analysis.ts`), spec).toContain("withEnemyCountAt(");
    }
  });

  it("no PUBLIC specialization binds it", () => {
    for (const spec of PUBLIC_SPEC_IDS) {
      let text = "";
      try {
        text = source(`src/specs/${spec}/observed-analysis.ts`);
      } catch {
        continue;
      }
      expect(text, spec).not.toContain("withEnemyCountAt");
    }
  });

  it("no pinned PUBLIC list has a FIRST line, so the FIRST score rule moves no public decision", () => {
    const publicApls = [
      "rogue-assassination",
      "paladin-retribution",
      "deathknight-blood",
      "monk-brewmaster",
      "paladin-protection",
      "demonhunter-havoc",
    ];
    for (const apl of publicApls) {
      const text = source(`src/simc/data/${apl}.apl.json`);
      const modes = [...text.matchAll(/target_if=([^,"]*)/g)].map((match) => match[1] ?? "");
      expect(
        modes.filter((mode) => !mode.startsWith("min:") && !mode.startsWith("max:")),
        apl,
      ).toEqual([]);
    }
  });

  it("the shared layers hold no gameplay name and no specialization conditional", () => {
    for (const path of [
      "src/engine/game-state/enemies/enemy-set.ts",
      "src/simc/expression/enemy-count.ts",
      "src/findings/enemy-count-bindings.ts",
    ]) {
      expect(source(path), path).not.toMatch(/specId|=== "(rogue|warrior|mage|druid|paladin|warlock)/);
    }
  });

  it("the shared simulation layer still imports nothing from the engine", () => {
    expect(source("src/simc/expression/enemy-count.ts")).not.toMatch(/from "[^"]*engine/);
  });

  it("no whole-fight enemy classification is read as evidence", () => {
    expect(source("src/engine/game-state/enemies/enemy-set.ts")).not.toMatch(/enemyNPCs|enemyPets/);
  });
});

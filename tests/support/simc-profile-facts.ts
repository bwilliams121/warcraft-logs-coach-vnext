/**
 * Real tier-3 facts for tests of the public disclosure (SIMC-FB-B).
 *
 * No PUBLIC specialization reads the fallback yet, so a test attaches these to a real view itself. The
 * facts are not hand-written: they are what `withEncounterStateAt` returns over the committed record,
 * for a synthetic fight whose build is injected. Attaching them to a decision says nothing about how that
 * decision was evaluated, so these tests prove the disclosure and never a gameplay result.
 */

import {
  createSimcProfileFallback,
  simcProfileFactsField,
  withEncounterStateAt,
  type SimcProfileProvenance,
} from "../../src/findings/simc-profile-fallback.js";
import type {
  ObservedDecisionRecord,
  ObservedDecisionView,
} from "../../src/findings/observed-decision-view.js";
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import { SIMC_PROFILE_ENVIRONMENT } from "../../src/data/simc-profile/simc-profile-environment.js";
import { ANALYZER_AUTHORITY_MODEL } from "../../src/simc/analyzer-authority-model.js";
import { knownNumber } from "../../src/simc/expression/evaluate.js";
import { isBuiltinIdentifier } from "../../src/simc/expression/parse.js";
import { defineSpecAtomVocabulary } from "../../src/simc/expression/spec-vocabulary.js";
import { castEvent, observableCategory, syntheticFight } from "./synthetic-fight.js";

const START = 1_000;
const END = 90_000;
const SUBJECT = 15;

export function realProfileFacts(): readonly SimcProfileProvenance[] {
  const fight = syntheticFight({
    focusActorId: SUBJECT,
    events: [
      castEvent({
        ordinal: 1,
        reportTimeMs: 5_000,
        sourceActorId: SUBJECT,
        abilityGameId: 2,
        castPhase: "COMPLETE",
      }),
    ],
    startTimeMs: START,
    endTimeMs: END,
    categories: {
      AURAS: observableCategory(inclusiveRange(START, END), null),
      DAMAGE: observableCategory(inclusiveRange(START, END), null),
    },
  });
  const vocabulary = defineSpecAtomVocabulary(
    "test/spec",
    [
      { identifier: "active_enemies", shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
      {
        identifier: "fight_style.patchwerk",
        shape: "BOOLEAN",
        scope: "PLAYER_SCOPED",
        selfAddressing: false,
      },
    ],
    isBuiltinIdentifier,
  );
  const { profileFacts } = withEncounterStateAt(
    {
      comboPoints: knownNumber(7),
      comboPointsDeficit: knownNumber(0),
      energyPct: knownNumber(100),
      dotRemainsSecondsByAction: [],
      knownBuffs: [],
      specAtoms: { vocabulary, bound: [] },
    },
    createCombatState(fight),
    SUBJECT,
    0,
    {
      authority: {
        authorityId: "SIMC_APL_ROGUE_ASSASSINATION",
        simcCommit: ANALYZER_AUTHORITY_MODEL.simcCommit,
      },
      fallback: createSimcProfileFallback({
        dataset: SIMC_PROFILE_ENVIRONMENT,
        gameBuildOf: () => "12.1.0.69933",
      }),
    },
  );
  if (profileFacts.length === 0) throw new Error("the fixture bound no profile fact");
  return profileFacts;
}

/** The record as a specialization's adapter would spread it. */
export const profileRelative = (
  decision: ObservedDecisionRecord,
  facts: readonly SimcProfileProvenance[],
): ObservedDecisionRecord => ({ ...decision, ...simcProfileFactsField({ profileFacts: facts }) });

/** Every decision of a real view, as evaluated under the profile. Only the disclosure differs. */
export const everyDecisionProfileRelative = (
  view: ObservedDecisionView,
  facts: readonly SimcProfileProvenance[],
): ObservedDecisionView => ({
  ...view,
  decisions: view.decisions.map((decision) => profileRelative(decision, facts)),
});

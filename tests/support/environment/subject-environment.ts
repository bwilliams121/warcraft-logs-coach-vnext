/**
 * The canonical M11-G3-4 subject environment (b1PmaKrd6CDfzngc fight 48,
 * actor 15), built ONLY from committed evidence.
 *
 * The events and their completeness come from the M11-E2 owned-pet bundle.
 * A bundle's fight metadata is synthetic (its interval is the event window),
 * so the fight and report metadata are taken from the committed fight context
 * — exactly what production reads from `ReportFight` — and nothing else is
 * changed. The subject's pull facts, temporary enchants and character-owned
 * talent spells come from the G3-2 reconstruction of the same evidence.
 */

import { createHash } from "node:crypto";

import { RUNNER_MODEL_VALIDATIONS } from "../../../runner/spec-bindings.js";

import { readCombatantPullFacts } from "../../../src/character-profile/pull-facts.js";
import { reconstructCharacterProfile } from "../../../src/character-profile/reconstruct.js";
import type { EnvironmentReconstructionInput } from "../../../src/environment/reconstruct.js";
import type { CombatFight } from "../../../src/engine/normalization/combat-fight.js";
import { BLOOD_CHARACTER_BINDING } from "../../../src/specs/deathknight/blood/character-binding.js";
import {
  selectSimulationModel,
  type SimulationGameContext,
  type SimulationModelApplicability,
} from "../../../src/simulation/model-registry.js";
import { reconstructionInputOf, simulationModelDataOrThrow, subjectEvidence } from "../character/subject.js";
import { DEV_SIMULATION_MODEL_ID } from "../simulation/dev-blood-job.js";
import { bundleOf } from "../corpus/fight.js";
import { artifactJson, g2Archive, SUBJECT } from "../m11/g2-four-fights.js";

interface ContextFight {
  readonly id: number;
  readonly name: string;
  readonly encounterID: number;
  readonly difficulty: number | null;
  readonly size: number | null;
  readonly kill: boolean | null;
  readonly inProgress: boolean | null;
  readonly startTime: number;
  readonly endTime: number;
}

/** The committed fight context's entry for the subject fight. */
export function subjectContextFight(): {
  readonly fight: ContextFight;
  readonly reportStartUnixMs: number;
  readonly code: string;
} {
  const context = artifactJson(SUBJECT.contextId) as {
    reportData: { report: { code: string; startTime: number; fights: ContextFight[] } };
  };
  const report = context.reportData.report;
  const fight = report.fights.find((entry) => entry.id === SUBJECT.fightId);
  if (fight === undefined) throw new Error(`${SUBJECT.contextId}: no fight ${String(SUBJECT.fightId)}`);
  return { fight, reportStartUnixMs: report.startTime, code: report.code };
}

/** The subject's normalized fight: bundle events + completeness, committed context metadata. */
export async function subjectFight(): Promise<CombatFight> {
  const loaded = await g2Archive();
  const bundled = bundleOf(loaded, SUBJECT.segmentIds, [], { catalogArtifactId: SUBJECT.contextId }).fight;
  const { fight, reportStartUnixMs, code } = subjectContextFight();
  return {
    ...bundled,
    report: { ...bundled.report, code, startTimeUnixMs: reportStartUnixMs },
    fight: {
      ...bundled.fight,
      id: fight.id,
      name: fight.name,
      encounterId: fight.encounterID,
      difficulty: fight.difficulty,
      size: fight.size,
      kill: fight.kill,
      startTimeMs: fight.startTime,
      endTimeMs: fight.endTime,
      durationMs: fight.endTime - fight.startTime,
      finality:
        fight.inProgress === false ? "COMPLETED" : fight.inProgress === true ? "IN_PROGRESS" : "UNKNOWN",
      inProgressRaw: fight.inProgress,
    },
  };
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/**
 * The canonical subject's resolved game context. The build (Live
 * 12.1.0.69933) is the approved M11 model-pin investigation result — resolving
 * a log's build automatically is G4 work; the fight start is the committed
 * fight context's.
 */
export function subjectGameContext(): SimulationGameContext {
  const { fight, reportStartUnixMs } = subjectContextFight();
  return {
    specKey: "deathknight/blood",
    gameBuild: "12.1.0.69933",
    fightStartUtc: new Date(reportStartUnixMs + fight.startTime).toISOString(),
  };
}

/**
 * The applicability model selection gives the canonical subject, if selection
 * picks `modelId`; null otherwise (a model run without a validated context).
 */
export function subjectModelApplicability(modelId: string): SimulationModelApplicability | null {
  const selected = selectSimulationModel(subjectGameContext(), RUNNER_MODEL_VALIDATIONS);
  return selected.ok && selected.value.model.id === modelId ? selected.value.applicability : null;
}

/** The full reconstruction input for the canonical subject. */
/** The canonical subject's environment input FOR a named simulation model (default: the historical development model). */
export async function subjectEnvironmentInput(
  modelId: string = DEV_SIMULATION_MODEL_ID,
): Promise<EnvironmentReconstructionInput> {
  const evidence = await subjectEvidence();
  const characterInput = reconstructionInputOf(evidence, modelId);
  const profile = reconstructCharacterProfile(characterInput, BLOOD_CHARACTER_BINDING);
  const facts = readCombatantPullFacts(evidence.rawCombatantInfo);
  const table = BLOOD_CHARACTER_BINDING.loadoutTable();
  const entrySpells = new Map<number, number>();
  if (table.ok) {
    for (const node of table.table.nodes)
      for (const entry of node.entries) entrySpells.set(entry.entryId, entry.spellId);
  }
  const owned =
    profile.talents.decode.state === "DECODED"
      ? profile.talents.decode.talents
          .filter((talent) => talent.rank > 0)
          .map((talent) => entrySpells.get(talent.entryId))
          .filter((spellId): spellId is number => spellId !== undefined && spellId > 0)
      : [];
  return {
    simulationModel: simulationModelDataOrThrow(modelId),
    modelApplicability: subjectModelApplicability(modelId),
    subject: { fightRef: SUBJECT.fightRef, actorId: SUBJECT.focusActorId },
    fight: await subjectFight(),
    pullFacts: facts === null ? null : { actorId: SUBJECT.focusActorId, facts },
    temporaryEnchants: {
      actorId: SUBJECT.focusActorId,
      slots: profile.equipment
        .filter((record) => record.slot === "main_hand" || record.slot === "off_hand")
        .map((record) => ({
          slot: record.slot as "main_hand" | "off_hand",
          evidence: record.temporaryEnchant,
        })),
    },
    characterOwnedSpellIds: {
      actorId: SUBJECT.focusActorId,
      spellIds: [...new Set(owned)].sort((a, b) => a - b),
    },
    documents: characterInput.documents.map((document) => ({ id: document.id, sha256: document.sha256 })),
  };
}

/** Committed-bytes hash, for tests that pin a document. */
export const documentSha256 = sha256;

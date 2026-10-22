/**
 * The semantic ENVIRONMENT HASH (M11-G3-4), on the G3-1 canonical hashing
 * (`canonicalJson` + SHA-256).
 *
 * It covers what the environment MEANS for a simulation: duration and
 * finality, primary-target and target-schedule states (by game id), raid-buff
 * presence, Bloodlust identity and fight-relative timing, consumables, the
 * tank-load model/version/revision, the pull-aura classification and the
 * assumption set (id@version).
 *
 * It never covers report identity: no report code, fight reference, actor id,
 * source actor, report-relative timestamp, evidence document, explanatory
 * text or observation-only detail (engagement spans, refresh instants).
 */

import type { Evidenced } from "../character-profile/profile.js";
import { canonicalJson, sha256Hex } from "../simulation/canonical.js";
import type { SimulationEnvironment } from "./model.js";

export const ENVIRONMENT_HASH_KIND = "simulation-environment-reconstruction-hash/1";

function fact<T>(evidence: Evidenced<T>, project: (value: T) => unknown = (value) => value): unknown {
  switch (evidence.state) {
    case "KNOWN":
      return { state: evidence.state, value: project(evidence.value) };
    case "MODEL_ASSUMPTION":
      return {
        state: evidence.state,
        value: project(evidence.value),
        assumption: `${evidence.assumption.id}@${String(evidence.assumption.version)}`,
      };
    case "USER_PROVIDED":
      return { state: evidence.state, value: project(evidence.value) };
    default:
      return { state: evidence.state };
  }
}

const byKey = <T>(items: readonly T[], key: (item: T) => string): T[] =>
  [...items].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

/** The hashed projection. Exported so tests can show exactly what is and is not covered. */
export function semanticEnvironment(env: SimulationEnvironment): unknown {
  return {
    schemaVersion: env.schemaVersion,
    duration: {
      interval: fact(env.duration.interval, (value) => ({ durationMs: value.durationMs })),
      finality: env.duration.finality,
      fightEndKnowledge: fact(env.duration.fightEndKnowledge),
    },
    primaryTarget: {
      identity: fact(env.primaryTarget.identity, (value) => ({ gameId: value.gameId })),
      availability: fact(env.primaryTarget.availability),
    },
    raidBuffs: env.raidBuffs.map((entry) => ({
      override: entry.override,
      presence: fact(entry.presence, (value) =>
        value.kind === "WHOLE_FIGHT"
          ? { kind: value.kind, auraSpellId: value.auraSpellId }
          : { kind: value.kind, auraSpellId: value.auraSpellId, transitions: value.transitions },
      ),
    })),
    bloodlust: fact(env.bloodlust.applications, (apps) =>
      apps.map((app) => ({
        spellId: app.spellId,
        equivalence: app.equivalence,
        startMs: fact(app.startMs),
        endMs: fact(app.endMs),
      })),
    ),
    consumables: {
      setup: env.consumables.setup.map((entry) => ({
        kind: entry.kind,
        identity: fact(entry.identity),
        rank: fact(entry.rank),
        rankOptions: entry.rankOptions,
        presence: fact(entry.presence),
      })),
      potion: {
        identity: fact(env.consumables.potion.identity),
        rank: fact(env.consumables.potion.rank),
        rankOptions: env.consumables.potion.rankOptions,
        timingPolicy: env.consumables.potion.timingPolicy,
        uses: fact(env.consumables.potion.uses, (uses) =>
          uses.map((use) => ({ from: fact(use.activeFromMs), to: fact(use.activeToMs) })),
        ),
      },
      temporaryEnchants: byKey(env.consumables.temporaryEnchants, (entry) => entry.slot).map((entry) => ({
        slot: entry.slot,
        enchant: fact(entry.enchant),
        persistence: fact(entry.persistence),
      })),
    },
    tankLoad: { model: env.tankLoad.model, version: env.tankLoad.version, revision: env.tankLoad.revision },
    targetSchedule: {
      candidates: byKey(
        env.targetSchedule.candidates.map((candidate) => ({
          gameId: candidate.gameId,
          availability: fact(candidate.availability),
        })),
        (candidate) => canonicalJson(candidate),
      ),
      schedule: fact(env.targetSchedule.schedule),
    },
    pullAuras: byKey(
      env.pullAuras.map((aura) => ({
        spellId: aura.spellId,
        sourceRole: aura.sourceRole,
        classification: aura.classification,
      })),
      (aura) => canonicalJson(aura),
    ),
    assumptions: byKey(
      env.assumptions.map((assumption) => `${assumption.id}@${String(assumption.version)}`),
      (id) => id,
    ),
  };
}

export async function simulationEnvironmentHash(env: SimulationEnvironment): Promise<string> {
  return await sha256Hex(
    canonicalJson({ kind: ENVIRONMENT_HASH_KIND, environment: semanticEnvironment(env) }),
  );
}

/**
 * HEAL-AP: the real Restoration Shaman subject, from the committed evidence
 * archive (b1PmaKrd6CDfzngc fight 48, actor 122, the M12-D subject), composed
 * exactly as HEAL-A's registration test composes it, plus the service seams
 * the public tests drive it through. HEAL-B1P: the same composition for the
 * fight's Holy Paladin (actor 1) and Mistweaver Monk (actor 9), whose
 * whole-fight cast segments were cut from the same capture. HEAL-B2P: the same
 * for the fight's Holy Priest (actor 2). HEAL-B4P: the same composition for the
 * Preservation Evoker of gtKb2xHn87pNcFfW fight 22 (actor 15), the one retained
 * whole fight that holds one; its context is the regression corpus's.
 *
 * Nothing here is fetched. The two fights are the same capture: `fight` at its
 * retrieved PLAYER_CONTEXT breadth, and `rostered` with the committed fight
 * context's friendly roster declared in scope (FULL_RAID), so plan names
 * resolve and cooldown overlap is reconstructed over that roster.
 */

import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import type { AnalysisRunner } from "../../src/services/analysis-runner.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import { MCP_TEST_ENV } from "./analysis-transports.js";
import { countedProductionCatalog } from "./catalog.js";
import { loadCommittedEvidenceArchive } from "./corpus/evidence-archive.js";
import { bundleOf } from "./corpus/fight.js";

export const RESTORATION_SUBJECT_ACTOR = 122;
export const SPIRIT_LINK_TOTEM = 98008;
export const ASCENDANCE = 114052;
export const CHAIN_HEAL = 1064;
/** The subject's letters-only pseudonym (see `loadRestorationSubject`). */
export const RESTORATION_SUBJECT_PSEUDONYM = "Subjectshaman";

/** HEAL-B1P: the canonical fight's Holy Paladin and its identified healing cooldowns. */
export const HOLY_PALADIN_SUBJECT_ACTOR = 1;
export const AURA_MASTERY = 31821;
export const AVENGING_WRATH = 31884;
export const HOLY_SHOCK = 20473;
/** HEAL-B1P: the canonical fight's Mistweaver Monk and its identified healing cooldowns. */
export const MISTWEAVER_SUBJECT_ACTOR = 9;
export const RESTORAL = 388615;
export const INVOKE_YULON = 322118;
export const VIVIFY = 116670;
/** HEAL-B2P: the canonical fight's Holy Priest and its identified healing cooldowns. */
export const HOLY_PRIEST_SUBJECT_ACTOR = 2;
export const DIVINE_HYMN = 64843;
export const APOTHEOSIS = 200183;
export const FLASH_HEAL = 2061;
/** HEAL-B4P: gtKb fight 22's Preservation Evoker and its identified healing cooldowns. */
export const PRESERVATION_SUBJECT_ACTOR = 15;
export const REWIND = 363534;
export const STASIS = 370537;
export const DREAM_BREATH = 355936;

const segmentsOf = (slug: string, actorId: number) => [
  `wcl-b1pm-fight-48-${slug}-${String(actorId)}-casts.seg-0-180`,
  `wcl-b1pm-fight-48-${slug}-${String(actorId)}-casts.seg-180-345`,
];
const CONTEXT = "wcl-fight-context-b1pm-fight-48";

export interface RestorationSubject {
  /** The capture at its retrieved breadth (PLAYER_CONTEXT). */
  readonly fight: CombatFight;
  /** The same capture with the committed context's roster declared in scope. */
  readonly rostered: CombatFight;
  /** The actor catalog's name for the subject. */
  readonly name: string;
  readonly encounter: { readonly encounterId: number; readonly difficulty: number };
}

export async function loadRestorationSubject(): Promise<RestorationSubject> {
  return await loadCanonicalHealerSubject({
    actorId: RESTORATION_SUBJECT_ACTOR,
    segments: segmentsOf("restoration-shaman", RESTORATION_SUBJECT_ACTOR),
    pseudonym: RESTORATION_SUBJECT_PSEUDONYM,
  });
}

/** HEAL-B1P: the canonical fight's Holy Paladin, composed as the Restoration Shaman is. */
export async function loadHolyPaladinSubject(): Promise<RestorationSubject> {
  return await loadCanonicalHealerSubject({
    actorId: HOLY_PALADIN_SUBJECT_ACTOR,
    segments: segmentsOf("holy-paladin", HOLY_PALADIN_SUBJECT_ACTOR),
    pseudonym: "Subjectpaladin",
  });
}

/** HEAL-B1P: the canonical fight's Mistweaver Monk, composed as the Restoration Shaman is. */
export async function loadMistweaverSubject(): Promise<RestorationSubject> {
  return await loadCanonicalHealerSubject({
    actorId: MISTWEAVER_SUBJECT_ACTOR,
    segments: segmentsOf("mistweaver-monk", MISTWEAVER_SUBJECT_ACTOR),
    pseudonym: "Subjectmonk",
  });
}

/** HEAL-B2P: the canonical fight's Holy Priest, composed as the Restoration Shaman is. */
export async function loadHolyPriestSubject(): Promise<RestorationSubject> {
  return await loadCanonicalHealerSubject({
    actorId: HOLY_PRIEST_SUBJECT_ACTOR,
    segments: segmentsOf("holy-priest", HOLY_PRIEST_SUBJECT_ACTOR),
    pseudonym: "Subjectpriest",
  });
}

/** HEAL-B4P: gtKb fight 22's Preservation Evoker, composed as the Restoration Shaman is. */
export async function loadPreservationSubject(): Promise<RestorationSubject> {
  return await loadCanonicalHealerSubject({
    actorId: PRESERVATION_SUBJECT_ACTOR,
    segments: [
      "wcl-gtkb-fight-22-preservation-evoker-15-casts.seg-0-20",
      "wcl-gtkb-fight-22-preservation-evoker-15-casts.seg-20-165",
      "wcl-gtkb-fight-22-preservation-evoker-15-casts.seg-165-285",
    ],
    pseudonym: "Subjectevoker",
    contextArtifactId: "wcl-fight-context-gtkb-fight-22",
  });
}

async function loadCanonicalHealerSubject(subjectOf: {
  readonly actorId: number;
  readonly segments: readonly string[];
  readonly pseudonym: string;
  readonly contextArtifactId?: string;
}): Promise<RestorationSubject> {
  const loaded = await loadCommittedEvidenceArchive();
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
  const contextId = subjectOf.contextArtifactId ?? CONTEXT;
  const context = loaded.archive.referenceableArtifacts.find(
    (entry) => entry.record.artifactId === contextId,
  );
  if (context === undefined) throw new Error("no fight context");
  const row = (
    context.json as {
      reportData: {
        report: {
          fights: {
            startTime: number;
            endTime: number;
            encounterID: number;
            difficulty: number;
            friendlyPlayers: number[];
          }[];
        };
      };
    }
  ).reportData.report.fights[0];
  if (row === undefined) throw new Error("no fight row");
  const composed = bundleOf(loaded.archive, subjectOf.segments, [], { catalogArtifactId: contextId }).fight;
  // The archive's names are sanitized pseudonyms ("Actor122"), which a public
  // plan cannot name: the request parser accepts letters only. The subject's
  // pseudonym is replaced by another, letters-only and unique in the roster.
  // Identity is the actor id, which is untouched; no event changes.
  const actors = new Map(composed.actors);
  const subject = actors.get(subjectOf.actorId);
  if (subject === undefined) throw new Error("no subject actor");
  if ([...actors.values()].some((actor) => actor.name === subjectOf.pseudonym)) {
    throw new Error("the pseudonym is not unique");
  }
  actors.set(subjectOf.actorId, { ...subject, name: subjectOf.pseudonym });
  const fight: CombatFight = {
    ...composed,
    actors,
    fight: {
      ...composed.fight,
      encounterId: row.encounterID,
      difficulty: row.difficulty,
      startTimeMs: row.startTime,
      endTimeMs: row.endTime,
      durationMs: row.endTime - row.startTime,
    },
  };
  const rostered: CombatFight = {
    ...fight,
    breadth: { ...fight.breadth, scope: "FULL_RAID", friendlyActorsInScope: row.friendlyPlayers },
  };
  return {
    fight,
    rostered,
    name: subjectOf.pseudonym,
    encounter: { encounterId: row.encounterID, difficulty: row.difficulty },
  };
}

/** The preflight identity Warcraft Logs would state for `actorId` in `of`. */
export function restorationIdentityFor(
  of: CombatFight,
  actorId: number,
  player: { readonly name: string; readonly className: string; readonly specName: string },
): FightIdentity {
  return {
    report: { code: of.report.code, revision: of.report.revision, startTime: 0, endTime: 0 },
    data: of.data,
    fight: {
      id: of.fight.id,
      name: of.fight.name,
      encounterId: of.fight.encounterId,
      difficulty: of.fight.difficulty,
      startTime: of.fight.startTimeMs,
      endTime: of.fight.endTimeMs,
    },
    player: { sourceId: actorId, ...player },
  };
}

/** A service runner over one fixed fight, counting dispatches and recording requested scopes. */
export function restorationRunner(of: CombatFight, identity: FightIdentity) {
  const counted = countedProductionCatalog();
  const scopes: string[] = [];
  const deps: AnalysisServiceDeps = {
    env: MCP_TEST_ENV,
    preflight: async () => ({ ok: true, identity, rateLimit: undefined }),
    ingest: async (request) => {
      scopes.push(request.scope);
      return { ok: true, fight: of, rateLimit: undefined };
    },
    registry: counted.registry,
  };
  const analyze: AnalysisRunner = async (input) => await analyzeFight(input, deps);
  return {
    analyze,
    scopes,
    calls: counted.calls,
    ids: { reportCode: of.report.code, fightId: of.fight.id, sourceId: identity.player.sourceId },
  };
}

/** A structured request plan, in the public request shape. */
export function requestPlan(
  encounter: { readonly encounterId: number; readonly difficulty: number },
  fightStartMs: number,
  entries: readonly {
    readonly name: string;
    readonly abilityId: number;
    readonly atReportTimeMs: number;
    readonly toleranceMs: number;
  }[],
) {
  return {
    format: "STRUCTURED",
    label: "heal-ap test plan",
    encounterId: encounter.encounterId,
    difficulty: encounter.difficulty,
    assignments: entries.map((entry) => ({
      player: { name: entry.name },
      abilityId: entry.abilityId,
      plannedTime: { kind: "FIGHT_RELATIVE", offsetMs: entry.atReportTimeMs - fightStartMs },
      toleranceMs: entry.toleranceMs,
    })),
  };
}

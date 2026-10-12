/**
 * M11-G2 test support: the four-fight dogfood set, composed from COMMITTED
 * evidence only.
 *
 *   subject      M11-E2 canonical fixture (b1PmaKrd6CDfzngc fight 48, focus
 *                15): seven granted owned-pet segments -> COVERAGE_VOUCHED;
 *                Warcraft Logs raid entry from the G1 subject surface; the
 *                enemy list was never retrieved (the subject is never
 *                re-fetched).
 *   comparisons  the three G1-selected members: their M11-G2 segments compose
 *                with NO grants (withheld) -> UNCERTIFIED_FILTERED_CAPTURE;
 *                tables, raid entry and enemy list from the G2 surfaces.
 *
 * The G1 identity of each comparison is the committed G1 cohort, replayed
 * offline: there is one pseudonym scheme.
 */

import { committedEvidenceArchiveFiles, loadCommittedEvidenceArchive } from "../corpus/evidence-archive.js";
import { bundleOf } from "../corpus/fight.js";
import type { LoadedCorpus } from "../corpus/loader.js";
import {
  discoverObservedCohort,
  type CohortPorts,
  type PortResponse,
} from "../../../src/cohort/cohort-discovery.js";
import { observedPerformanceOf } from "../../../src/cohort/observed-performance.js";
import { decodeSubjectPerformance } from "../../../src/wcl/cohort/cohort-decoders.js";
import { resolveBloodHeroTree } from "../../../src/data/game/deathknight-blood-talents.js";
import {
  decodeComparisonTables,
  decodeRaidDamageTable,
  type ComparisonTables,
} from "../../../src/wcl/comparison/comparison-tables.js";
import type { ComparisonFightInput } from "../../../src/comparison-facts/fight-facts.js";
import type { EnemyNpcEntry } from "../../../src/comparison-facts/environment-profile.js";

type Json = Record<string, unknown>;

export const SUBJECT = {
  fightRef: "b1PmaKrd6CDfzngc#48",
  reportCode: "b1PmaKrd6CDfzngc",
  fightId: 48,
  focusActorId: 15,
  contextId: "wcl-fight-context-b1pm-fight-48",
  segmentIds: ["0-45", "45-113", "113-151", "151-214", "214-263", "263-311", "311-345"].map(
    (name) => `wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-${name}`,
  ),
} as const;

export interface ComparisonFixture {
  readonly fightRef: string;
  readonly reportCode: string;
  readonly fightId: number;
  readonly focusActorId: number;
  readonly ownedActorIds: readonly number[];
  readonly contextId: string;
  readonly tablesId: string;
  readonly segmentIds: readonly string[];
}

const segments = (cohort: string, fight: number, names: readonly string[]) =>
  names.map((name) => `wcl-g2-${cohort}-f${String(fight)}-owned-pets.seg-${name}`);

export const COMPARISONS: readonly ComparisonFixture[] = [
  {
    fightRef: "COHORT246AAAAAAA#33",
    reportCode: "COHORT246AAAAAAA",
    fightId: 33,
    focusActorId: 7,
    ownedActorIds: [15, 16, 92, 202],
    contextId: "wcl-g2-fight-context-cohort246-fight-33",
    tablesId: "wcl-g2-tables-cohort246-fight-33",
    segmentIds: segments("cohort246", 33, [
      "0-46",
      "46-106",
      "106-144",
      "144-197",
      "197-228",
      "228-284",
      "284-315",
      "315-329",
    ]),
  },
  {
    fightRef: "COHORT116AAAAAAA#64",
    reportCode: "COHORT116AAAAAAA",
    fightId: 64,
    focusActorId: 332,
    ownedActorIds: [362, 364, 665],
    contextId: "wcl-g2-fight-context-cohort116-fight-64",
    tablesId: "wcl-g2-tables-cohort116-fight-64",
    segmentIds: segments("cohort116", 64, [
      "0-36",
      "36-96",
      "96-136",
      "136-192",
      "192-214",
      "214-274",
      "274-288",
      "288-335",
      "335-336",
    ]),
  },
  {
    fightRef: "COHORT261AAAAAAA#31",
    reportCode: "COHORT261AAAAAAA",
    fightId: 31,
    focusActorId: 6,
    ownedActorIds: [166, 184, 185, 309],
    contextId: "wcl-g2-fight-context-cohort261-fight-31",
    tablesId: "wcl-g2-tables-cohort261-fight-31",
    segmentIds: segments("cohort261", 31, [
      "0-46",
      "46-108",
      "108-159",
      "159-200",
      "200-249",
      "249-290",
      "290-342",
      "342-360",
    ]),
  },
];

export const UNCERTIFIED_REASON =
  "server-filtered capture whose grants were withheld: no category certified against the fight's Warcraft Logs tables";

export function artifactJson(id: string): unknown {
  const text =
    committedEvidenceArchiveFiles()[`artifacts/wcl-graphql/${id}.json`] ??
    committedEvidenceArchiveFiles()[`artifacts/wcl-events/${id}.json`];
  if (text === undefined) throw new Error(`no committed archive artifact ${id}`);
  return JSON.parse(text);
}

export function comparisonTables(fixture: ComparisonFixture): ComparisonTables {
  const decoded = decodeComparisonTables(artifactJson(fixture.tablesId));
  if (!decoded.ok) throw new Error(`${fixture.tablesId}: ${decoded.defect}`);
  return decoded.tables;
}

export function comparisonEvents(fixture: ComparisonFixture): Record<string, unknown>[] {
  return fixture.segmentIds.flatMap((id) => artifactJson(id) as Record<string, unknown>[]);
}

export function enemyEntriesOf(fixture: ComparisonFixture): EnemyNpcEntry[] {
  const npcs = artifactJson("wcl-g2-fight-npcs-comparisons") as {
    comparisons: {
      comparisonRef: string;
      fight: { enemyNPCs: { id: number; gameID: number; instanceCount: number }[] };
    }[];
  };
  const entry = npcs.comparisons.find((candidate) => candidate.comparisonRef === fixture.fightRef);
  if (entry === undefined) throw new Error(`no enemy list for ${fixture.fightRef}`);
  return entry.fight.enemyNPCs
    .map((npc) => ({ actorId: npc.id, gameId: npc.gameID, instanceCount: npc.instanceCount }))
    .sort((left, right) => left.actorId - right.actorId);
}

let archive: LoadedCorpus | null = null;
export async function g2Archive(): Promise<LoadedCorpus> {
  if (archive !== null) return archive;
  const loaded = await loadCommittedEvidenceArchive();
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
  archive = loaded.archive;
  return archive;
}

export async function subjectInput(): Promise<ComparisonFightInput> {
  const loaded = await g2Archive();
  const fight = bundleOf(loaded, SUBJECT.segmentIds, [], { catalogArtifactId: SUBJECT.contextId }).fight;
  const g1 = artifactJson("wcl-g1-subject-performance-b1pm-fight-48") as Json;
  const table = decodeRaidDamageTable(((g1["reportData"] as Json)["report"] as Json)["damageDone"]);
  return {
    fightRef: SUBJECT.fightRef,
    fight,
    focusActorId: SUBJECT.focusActorId,
    basis: { kind: "COVERAGE_VOUCHED" },
    enemyNpcs: { kind: "NOT_RETRIEVED", reason: "SUBJECT_NEVER_REFETCHED" },
    enemyEntries: null,
    wcl: {
      raidEntry: table?.entries.find((entry) => entry.actorId === SUBJECT.focusActorId) ?? null,
      raidTotalTimeMs: table?.totalTimeMs ?? null,
      tables: null,
    },
  };
}

export async function comparisonInput(fixture: ComparisonFixture): Promise<ComparisonFightInput> {
  const loaded = await g2Archive();
  const fight = bundleOf(loaded, fixture.segmentIds, [], { catalogArtifactId: fixture.contextId }).fight;
  const tables = comparisonTables(fixture);
  const enemyEntries = enemyEntriesOf(fixture);
  return {
    fightRef: fixture.fightRef,
    fight,
    focusActorId: fixture.focusActorId,
    basis: { kind: "UNCERTIFIED_FILTERED_CAPTURE", reason: UNCERTIFIED_REASON },
    enemyNpcs: { kind: "RETRIEVED", actorIds: new Set(enemyEntries.map((entry) => entry.actorId)) },
    enemyEntries,
    wcl: {
      raidEntry:
        tables.raidDamageDone.entries.find((entry) => entry.actorId === fixture.focusActorId) ?? null,
      raidTotalTimeMs: tables.raidDamageDone.totalTimeMs,
      tables,
    },
  };
}

// ---------------------------------------------------------------------------
// G1: the committed cohort, replayed offline (the one identity scheme)
// ---------------------------------------------------------------------------

const ok = (data: unknown): PortResponse => ({ ok: true, data, rateLimit: null });

export async function committedG1Cohort() {
  const contexts = [1, 2, 3].map((n) => artifactJson(`wcl-g1-cohort-candidate-${String(n)}`) as Json);
  const ports: CohortPorts = {
    subjectPerformance: async () => ok(artifactJson("wcl-g1-subject-performance-b1pm-fight-48")),
    cohortRankingPage: async (request) =>
      ok(artifactJson(`wcl-g1-cohort-rankings-3455-5-blood-bracket-${String(request.bracket)}`)),
    candidateContext: async (code, fight) => {
      const hit = contexts.find((context) => {
        const report = (context["reportData"] as Json)["report"] as Json;
        return report["code"] === code && (report["fights"] as Json[])[0]?.["id"] === fight;
      });
      if (hit === undefined)
        throw new Error(`candidate outside the committed cohort: ${code}#${String(fight)}`);
      return ok(hit);
    },
  };
  return discoverObservedCohort(ports, {
    reportCode: SUBJECT.reportCode,
    fightId: SUBJECT.fightId,
    encounterId: 3455,
    difficulty: 5,
    className: "DeathKnight",
    specName: "Blood",
    subject: { actorId: 15, name: "Actor15", serverName: null, specResolved: true },
    resolveHeroTree: resolveBloodHeroTree,
  });
}

/** The subject's ACTUAL_DPS from G1's pinned surface. */
export function subjectObservedPerformance() {
  return observedPerformanceOf(
    decodeSubjectPerformance(artifactJson("wcl-g1-subject-performance-b1pm-fight-48"), 48),
    {
      actorId: 15,
      name: "Actor15",
      serverName: null,
      specResolved: true,
    },
  );
}

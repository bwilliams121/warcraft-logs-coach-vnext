/**
 * The canonical M11-G3-2 subject (b1PmaKrd6CDfzngc fight 48, actor 15), built
 * ONLY from committed evidence: the M11-E2 owned-pet segments and the fight
 * context. Every document used is listed with the SHA-256 of its committed
 * bytes.
 *
 * `talentImportCode(actorID:)` is per-actor. The committed context records the
 * actor it was requested for in its manifest provenance (`sourceActorId`; "The
 * talent import code present is actor 15's (the query argument)"), so the code
 * is read from the context's fight entry and attributed from that record —
 * never from a test bundle's focus.
 */

import { createHash } from "node:crypto";

import { readCombatantPullFacts } from "../../../src/character-profile/pull-facts.js";
import type { ReconstructionInput } from "../../../src/character-profile/reconstruct.js";
import type { CombatantSnapshot } from "../../../src/engine/normalization/normalized-events.js";
import manifest from "../../evidence/manifest.json";
import statements from "../../fixtures/character/canonical-subject-user-statements.json";
import { committedEvidenceArchiveFiles } from "../corpus/evidence-archive.js";
import { bundleOf } from "../corpus/fight.js";
import { artifactJson, COMPARISONS, g2Archive, SUBJECT } from "../m11/g2-four-fights.js";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

function documentText(id: string): string {
  const files = committedEvidenceArchiveFiles();
  const text = files[`artifacts/wcl-graphql/${id}.json`] ?? files[`artifacts/wcl-events/${id}.json`];
  if (text === undefined) throw new Error(`no committed artifact ${id}`);
  return text;
}

export interface FightEvidence {
  readonly fightRef: string;
  readonly focusActorId: number;
  readonly snapshot: CombatantSnapshot | null;
  readonly talentImport: { readonly actorId: number; readonly code: string | null };
  readonly rawCombatantInfo: Record<string, unknown> | null;
  readonly castSpellIds: readonly number[];
  readonly documentIds: readonly string[];
}

interface ManifestRecord {
  readonly artifactId: string;
  readonly provenance: { readonly source?: { readonly sourceActorId?: number } };
}

function contextTalentImport(contextId: string, fightRef: string): { actorId: number; code: string | null } {
  const record = (manifest as unknown as { artifacts: ManifestRecord[] }).artifacts.find(
    (entry) => entry.artifactId === contextId,
  );
  const actorId = record?.provenance.source?.sourceActorId;
  if (actorId === undefined) throw new Error(`${contextId}: no sourceActorId in the evidence manifest`);
  const fightId = Number(fightRef.split("#")[1]);
  const context = artifactJson(contextId) as {
    reportData: { report: { fights: { id: number; talentImportCode?: string | null }[] } };
  };
  const fight = context.reportData.report.fights.find((entry) => entry.id === fightId);
  return { actorId, code: fight?.talentImportCode ?? null };
}

async function fightEvidence(
  fightRef: string,
  focusActorId: number,
  contextId: string,
  segmentIds: readonly string[],
): Promise<FightEvidence> {
  const loaded = await g2Archive();
  const fight = bundleOf(loaded, segmentIds, [], { catalogArtifactId: contextId }).fight;
  let snapshot: CombatantSnapshot | null = null;
  for (const event of fight.events) {
    if (event.kind === "COMBATANT_INFO" && event.snapshot.actorId === focusActorId) snapshot = event.snapshot;
  }
  const raw = segmentIds.flatMap((id) => artifactJson(id) as Record<string, unknown>[]);
  const rawCombatantInfo =
    raw.find((event) => event["type"] === "combatantinfo" && event["sourceID"] === focusActorId) ?? null;
  const casts = new Set<number>();
  for (const event of raw) {
    if (
      event["type"] === "cast" &&
      event["sourceID"] === focusActorId &&
      typeof event["abilityGameID"] === "number"
    ) {
      casts.add(event["abilityGameID"]);
    }
  }
  return {
    fightRef,
    focusActorId,
    snapshot,
    talentImport: contextTalentImport(contextId, fightRef),
    rawCombatantInfo,
    castSpellIds: [...casts].sort((a, b) => a - b),
    documentIds: [contextId, ...segmentIds],
  };
}

export async function subjectEvidence(): Promise<FightEvidence> {
  return await fightEvidence(SUBJECT.fightRef, SUBJECT.focusActorId, SUBJECT.contextId, SUBJECT.segmentIds);
}

/** A G1/G2 comparison player's evidence — used only to prove it cannot fill the subject. */
export async function comparisonEvidence(index = 0): Promise<FightEvidence> {
  const fixture = COMPARISONS[index];
  if (fixture === undefined) throw new Error("no comparison");
  return await fightEvidence(fixture.fightRef, fixture.focusActorId, fixture.contextId, fixture.segmentIds);
}

/**
 * The owner's explicit statements about the canonical subject (USER_PROVIDED,
 * with provenance) — never evidence, never a default. Applied only by callers
 * that ask for them; the plain subject stays RACE_UNRESOLVED.
 */
export function withOwnerStatements(input: ReconstructionInput): ReconstructionInput {
  if (
    input.subject.fightRef !== statements.subject.fightRef ||
    input.subject.actorId !== statements.subject.actorId
  ) {
    throw new Error("owner statements belong to the canonical subject only");
  }
  return {
    ...input,
    userProvided: {
      race: {
        value: statements.race.value,
        provenance: { ...statements.race.provenance, source: "USER_PROVIDED" as const },
      },
    },
  };
}

export function reconstructionInputOf(evidence: FightEvidence): ReconstructionInput {
  const facts = readCombatantPullFacts(evidence.rawCombatantInfo);
  return {
    subject: { fightRef: evidence.fightRef, actorId: evidence.focusActorId },
    snapshot: evidence.snapshot,
    talentImport: evidence.talentImport,
    pullFacts: facts === null ? null : { actorId: evidence.focusActorId, facts },
    subjectCasts: { actorId: evidence.focusActorId, spellIds: evidence.castSpellIds },
    documents: evidence.documentIds.map((id, index) => ({
      id,
      sha256: sha256(documentText(id)),
      role: index === 0 ? "FIGHT_CONTEXT" : id.endsWith("seg-0-45") ? "COMBATANT_INFO" : "EVENTS",
    })),
  };
}

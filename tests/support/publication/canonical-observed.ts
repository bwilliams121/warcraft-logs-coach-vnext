/**
 * The canonical subject's OBSERVED DPS as a publication caller establishes
 * it, from committed evidence only:
 * - G1 ACTUAL_DPS (the DamageDone table total per fight second);
 * - the table's log version and target count;
 * - the attribution reconciliation over the committed full-fight owned-pet
 *   events (M11-E2.1).
 *
 * Coverage is COMPLETE: the archive slice retains every event of the focus
 * (15) and every owned pet (44, 45, 47, 224) over the whole fight. Its actor
 * slice is re-derived and checked by the archive loader.
 */

import type { AttributionInput } from "../../../src/publication/attribution.js";
import { reconcileObservedAttribution } from "../../../src/publication/attribution.js";
import type { ObservedDps } from "../../../src/publication/record.js";
import { artifactJson, SUBJECT, subjectObservedPerformance } from "../m11/g2-four-fights.js";

type Json = Record<string, any>;

export const CANONICAL_OWNER_AND_PETS = [15, 44, 45, 47, 224] as const;

export function canonicalTableEntry(): { readonly logVersion: number; readonly entry: Json } {
  const table = (artifactJson("wcl-g1-subject-performance-b1pm-fight-48") as Json)["reportData"]["report"][
    "damageDone"
  ]["data"];
  const entry = (table["entries"] as Json[]).find((candidate) => candidate["id"] === SUBJECT.focusActorId);
  if (entry === undefined) throw new Error("no subject table entry");
  return { logVersion: table["logVersion"], entry };
}

/** The reconciliation input for the canonical subject's observed total. */
export function canonicalAttributionInput(): AttributionInput {
  const actors = new Map<number, Json>(
    ((artifactJson(SUBJECT.contextId) as Json)["reportData"]["report"]["masterData"]["actors"] as Json[]).map(
      (actor) => [actor["id"], actor],
    ),
  );
  const events = SUBJECT.segmentIds.flatMap((id) => artifactJson(id) as Json[]);
  return {
    tableTotal: canonicalTableEntry().entry["total"],
    ownerAndPetIds: CANONICAL_OWNER_AND_PETS,
    coverage: "COMPLETE",
    damage: events
      .filter((event) => event["type"] === "damage")
      .map((event) => ({
        sourceId: event["sourceID"],
        abilityId: event["abilityGameID"],
        targetHostile: actors.get(event["targetID"])?.["type"] === "NPC",
        amount: event["amount"] ?? 0,
        absorbed: event["absorbed"] ?? 0,
      })),
  };
}

export function canonicalObservedDps(): ObservedDps {
  const actual = (subjectObservedPerformance() as { actualDps: Json }).actualDps;
  if (actual["status"] !== "OBSERVED") return { state: "UNKNOWN", reason: String(actual["status"]) };
  const { logVersion, entry } = canonicalTableEntry();
  return {
    state: "KNOWN",
    dps: actual["value"],
    source: actual["source"],
    logVersion,
    targetCount: (entry["targets"] as Json[]).length,
    attribution: reconcileObservedAttribution(canonicalAttributionInput()),
  };
}

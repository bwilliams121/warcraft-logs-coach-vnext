/**
 * The committed encounter-state census (POLB-A). It holds no row: POLB-CENSUS acquires the evidence
 * under its own owner grant, and POLB-B derives rows from it. A file that does not validate stops
 * the process at load, like every other runtime artifact.
 */

import { parseEncounterStateCensus, type EncounterStateCensus } from "./encounter-state-census-artifact.js";
import artifact from "./encounter-state-census.json";

function loadCommitted(): EncounterStateCensus {
  const parsed = parseEncounterStateCensus(artifact);
  if (!parsed.ok) {
    const lines = parsed.refusals.map((refusal) => `[${refusal.code}] ${refusal.detail}`);
    throw new Error(`the encounter-state census does not validate:\n${lines.join("\n")}`);
  }
  return parsed.dataset;
}

export const ENCOUNTER_STATE_CENSUS: EncounterStateCensus = loadCommitted();

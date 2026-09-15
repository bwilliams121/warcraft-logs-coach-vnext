/**
 * Builders for M8-G encounter-context composition and contract tests.
 *
 * The qualified reference is produced by the REAL M8-F qualification path, so a
 * contract test cannot accidentally validate a shape the domain never emits —
 * in particular, its `comparability` is whatever M8-B actually concluded, which
 * across reports is UNKNOWN.
 */

import {
  qualifyCandidate,
  type QualifiedExternalReference,
} from "../../src/external-context/candidate-qualification.js";
import { candidateReport, descriptorFor, subjectPull } from "./m8f-fixture.js";

export { DIFFICULTY, ENCOUNTER_ID } from "./m8f-fixture.js";

import { DIFFICULTY, ENCOUNTER_ID } from "./m8f-fixture.js";

/** One qualified external reference, through the real qualification path. */
export function qualifiedReferenceFor(
  options: { readonly code?: string; readonly fightId?: number } = {},
): QualifiedExternalReference {
  const code = options.code ?? "AAAAAAAAAAAAAAAA";
  const fightId = options.fightId ?? 22;
  const result = qualifyCandidate({
    descriptor: descriptorFor({ code, fightId }),
    report: candidateReport({ code, fightId }),
    expectedEncounterId: ENCOUNTER_ID,
    expectedDifficulty: DIFFICULTY,
    subject: subjectPull(),
  });
  if (result.outcome !== "QUALIFIED") {
    throw new Error(`fixture candidate did not qualify: ${result.reason}`);
  }
  return result.reference;
}

/**
 * Types for the M11-G1 cohort sanitizer's exported surface, so its revision can
 * be checked against the manifests. The script stays plain JavaScript; the CLI
 * body runs behind an entry-point guard and is not reachable by importing this
 * module.
 */

/** The tool's own revision, recorded as `tooling.revision` on a G1 archive artifact. */
export const G1_SANITIZER_REVISION: string;

/**
 * The sanitized subject surface, ranking pages and candidate contexts, from the
 * raw capture and the subject report's committed fight context. `leakNeedles`
 * holds the REAL names, servers and codes seen in the input: the CLI refuses to
 * write any output containing one, and the needles themselves are never written.
 */
export function sanitizeG1(
  capture: unknown,
  subjectContext: unknown,
): {
  subject: unknown;
  pages: unknown[];
  candidates: unknown[];
  leakNeedles: { players: string[]; servers: string[]; codes: string[] };
};

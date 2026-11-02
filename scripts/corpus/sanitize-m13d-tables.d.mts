/**
 * Types for the M13-D certification-table sanitizer's exported surface, so its
 * rules can be tested. The script stays plain JavaScript; the CLI body runs
 * behind an entry-point guard and is not reachable by importing this module.
 */

/** The tool's own revision, recorded as `tooling.revision` on the M13-D archive artifact. */
export const M13D_SANITIZER_REVISION: string;

/** Each `alias: table(...)` of the recorded query document, by alias, ascending. */
export function tableArgumentsOf(queryDocument: string): Record<
  string,
  {
    readonly dataType: "Buffs" | "Casts";
    readonly startTime: number;
    readonly endTime: number;
    readonly hostilityType: "Friendlies";
    readonly abilityID: number | null;
    readonly sourceID: number | null;
  }
>;

/** Reads the M13-D and M13-A probe directories and returns the files it would write, by relative path. */
export function sanitizeM13d(m13dDir: string, m13aDir: string): ReadonlyMap<string, string>;

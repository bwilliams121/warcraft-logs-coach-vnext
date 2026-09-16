/**
 * Types for the payload sanitizer's exported helpers, so its rules can be
 * tested. The script stays plain JavaScript; the CLI body runs behind an
 * entry-point guard and is not reachable by importing this module.
 */

/** The sanitizer's own revision, recorded as `tooling.revision` on a corpus artifact. */
export const SANITIZE_PAYLOADS_REVISION: string;

/** `pages` mode: rateLimitData removed from each decoded page; events and cursors untouched. */
export function sanitizePages(pages: unknown): unknown[];

/** `context` mode: names → `Actor<id>`, servers → null, player gameIDs → null. */
export function sanitizeContext(data: unknown): unknown;

/** `rankings` mode over a probe result holding a characterRankings page under `dataKey`. */
export function sanitizeRankings(probe: unknown, dataKey: string): unknown;

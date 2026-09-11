/**
 * Evidence locators.
 *
 * Every factual observation must be traceable back to the exact Warcraft Logs
 * response position that produced it, so the analyzer can eventually answer
 * "why did it tell me this?".
 *
 * The split here is load-bearing:
 *
 * - `RetrievalPosition` is ALWAYS knowable. We know which stream, page and
 *   index we read something from even when the payload is unreadable.
 * - `EvidenceLocator` additionally carries envelope facts that are only
 *   knowable once they have actually been decoded.
 *
 * A malformed raw observation therefore gets a `RetrievalPosition` and not an
 * `EvidenceLocator`, which is what stops the normalizer from inventing a
 * timestamp or a type in order to satisfy a type.
 */

export interface RetrievalPosition {
  /** Identifies the retrieval stream, e.g. `all` or `all:enemies`. */
  readonly streamId: string;
  /** 0-based page index within the stream, in retrieval order. */
  readonly pageOrdinal: number;
  /** 0-based index within that page's event array, as received. */
  readonly indexInPage: number;
  /** Monotonic across the whole fight, in retrieval order. Never re-sorted. */
  readonly ingestionOrdinal: number;
}

/**
 * A retrieval position plus the envelope facts that were proven present.
 *
 * Both extra fields are non-optional on purpose: an `EvidenceLocator` can only
 * be constructed for an observation whose common envelope was established.
 */
export interface EvidenceLocator extends RetrievalPosition {
  /** Warcraft Logs' own event type string, verbatim. */
  readonly rawType: string;
  /** Report-relative timestamp, exactly as supplied. Never rounded. */
  readonly reportTimeMs: number;
}

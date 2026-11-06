/**
 * `BRACKETED_HOSTILE_INSTANCE_V1`, exactly (POLB-A; agent/architecture.md "POLB-A"). A pure reading of
 * one census pull. It is never run on an analyzed pull, whose later events O2 forbids.
 *
 * An instance counts at report millisecond t when it has events at a <= t <= b with b - a at most the
 * gap, and no death at or before t names its key or a key that may alias it. A `null` instance counts
 * only when its actor has no numbered member at t. The caller passes only instances a friendly player
 * or pet damaged in the pull. It says "arisen and not demised", never targetable or in range.
 *
 * THE WINDOW'S MINIMUM IS NOT SAMPLED. Report time is whole milliseconds and the count can change only
 * next to a presence interval's edge or a death, so every such millisecond is evaluated. A dip shorter
 * than any grid is still the minimum.
 *
 * A WINDOW THE PULL DOES NOT WHOLLY COVER HAS NO MINIMUM. It is refused rather than clipped, since the
 * uncovered part says nothing about the count.
 */

export interface BracketTrack {
  readonly actorId: number;
  readonly instanceId: number | null;
  /** Every event naming this instance as source or target, in report time. */
  readonly eventTimesMs: readonly number[];
}

export interface BracketDeath {
  readonly actorId: number;
  readonly instanceId: number | null;
  readonly timeMs: number;
}

export type BracketWindowMinimum =
  | { readonly kind: "MINIMUM"; readonly count: number; readonly atMs: number }
  | { readonly kind: "WINDOW_NOT_COVERED" };

interface PresenceInterval {
  readonly fromMs: number;
  /** Inclusive. */
  readonly toMs: number;
}

/** Where the track's bracketed presence holds, as disjoint closed intervals, before any death. */
export function bracketIntervals(
  eventTimesMs: readonly number[],
  gapMs: number,
): readonly PresenceInterval[] {
  const times = [...eventTimesMs].sort((left, right) => left - right);
  const intervals: PresenceInterval[] = [];
  for (const time of times) {
    const last = intervals[intervals.length - 1];
    if (last !== undefined && time - last.toMs <= gapMs) {
      intervals[intervals.length - 1] = { fromMs: last.fromMs, toMs: time };
    } else {
      intervals.push({ fromMs: time, toMs: time });
    }
  }
  return intervals;
}

const mayAlias = (track: BracketTrack, death: BracketDeath): boolean =>
  track.actorId === death.actorId &&
  (track.instanceId === death.instanceId || track.instanceId === null || death.instanceId === null);

/** The minimum count over the report-time window [fromMs, toMs), which must lie within [.., coveredToMs]. */
export function minimumBracketCount(input: {
  readonly tracks: readonly BracketTrack[];
  readonly deaths: readonly BracketDeath[];
  readonly gapMs: number;
  readonly fromMs: number;
  readonly toMs: number;
  /** The last report millisecond this pull covers. */
  readonly coveredToMs: number;
}): BracketWindowMinimum {
  const { tracks, deaths, gapMs, fromMs, toMs, coveredToMs } = input;
  if (toMs - 1 > coveredToMs || toMs <= fromMs) return { kind: "WINDOW_NOT_COVERED" };

  const placed = tracks.map((track) => {
    const firstDeath = deaths
      .filter((death) => mayAlias(track, death))
      .reduce((earliest, death) => Math.min(earliest, death.timeMs), Number.POSITIVE_INFINITY);
    return { track, firstDeath, intervals: bracketIntervals(track.eventTimesMs, gapMs) };
  });

  const countAt = (time: number): number => {
    const numbered = new Set<number>();
    const unnumbered = new Set<number>();
    let count = 0;
    for (const { track, firstDeath, intervals } of placed) {
      if (time >= firstDeath) continue;
      if (!intervals.some((interval) => interval.fromMs <= time && time <= interval.toMs)) continue;
      if (track.instanceId === null) {
        unnumbered.add(track.actorId);
      } else {
        numbered.add(track.actorId);
        count += 1;
      }
    }
    for (const actorId of unnumbered) if (!numbered.has(actorId)) count += 1;
    return count;
  };

  const candidates = new Set<number>([fromMs, toMs - 1]);
  const addAround = (time: number): void => {
    for (const candidate of [time - 1, time, time + 1]) {
      if (fromMs <= candidate && candidate < toMs) candidates.add(candidate);
    }
  };
  for (const { firstDeath, intervals } of placed) {
    if (Number.isFinite(firstDeath)) addAround(firstDeath);
    for (const interval of intervals) {
      addAround(interval.fromMs);
      addAround(interval.toMs);
    }
  }

  let best: { count: number; atMs: number } | null = null;
  for (const time of [...candidates].sort((left, right) => left - right)) {
    const count = countAt(time);
    if (best === null || count < best.count) best = { count, atMs: time };
  }
  return best === null ? { kind: "WINDOW_NOT_COVERED" } : { kind: "MINIMUM", ...best };
}

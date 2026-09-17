/**
 * One corpus execution's private scope.
 *
 * `runCorpusHarness` creates a context at the start of every run and hands it
 * to every assertion it executes. An executor that derives the same expensive,
 * deterministic value for several assertions — a specialization layer running
 * its real evaluator over one artifact for thirty cases — derives it ONCE per
 * run through `memo.once` and reads it back for the rest.
 *
 * WHAT THIS IS NOT
 *
 *   - not a process-global cache: nothing here is module state, and two runs
 *     never see each other's context, in the same process or across Node and
 *     workerd;
 *   - not production memoization: no module under `src/` knows this exists;
 *   - not a shortcut around real work: the first `once` for a key runs the
 *     real computation, and every assertion still executes against its
 *     result; nothing is precomputed, and nothing is read from disk.
 *
 * THE KEY IS THE WHOLE INPUT. A caller composes the key from EVERY input of
 * the derivation — artifact identity and digest, provenance, actor, spec,
 * target, the code path — so two derivations share a value only when nothing
 * that could change the value differs. An opener and its gap derivative are
 * different artifacts with different digests and never collide.
 *
 * THE VALUE IS SHARED READ-ONLY. `memo.once` freezes what the computation
 * returned (deeply, for plain data) before anyone reads it, so no assertion can
 * hand the next one a result it has changed.
 *
 * ACCOUNTING IS DETERMINISTIC. `memo.stats()` reports, per key, how many times
 * the computation ran (always 1) and how many reads it served, so a test can
 * pin the exact amount of real work a run performs.
 */

export interface MemoStat {
  readonly key: string;
  /** Times the computation ran for this key within the run. Always 1. */
  readonly computed: number;
  /** Times the memoized value was served without recomputation. */
  readonly served: number;
}

export interface ExecutionMemo {
  /**
   * The value for `key`, computed by `compute` the first time the key is seen
   * in this run and served frozen from then on.
   */
  once<T>(key: string, compute: () => T): T;
  /** Per-key accounting, in first-seen order. */
  stats(): readonly MemoStat[];
}

export interface CorpusExecutionContext {
  readonly memo: ExecutionMemo;
}

/**
 * Freezes plain data in place — objects and arrays, recursively — and returns
 * it. Anything that is not plain data (a class instance, a Map, a function) is
 * left as it is: freezing such a value would not make it immutable and might
 * break it.
 */
export function deepFreezePlainData<T>(value: T): T {
  freezeWalk(value, new Set());
  return value;
}

function freezeWalk(value: unknown, seen: Set<object>): void {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  const proto: unknown = Object.getPrototypeOf(value);
  const plain = Array.isArray(value) || proto === Object.prototype || proto === null;
  if (!plain) return;
  seen.add(value);
  Object.freeze(value);
  for (const entry of Object.values(value as Record<string, unknown>)) freezeWalk(entry, seen);
}

export function createExecutionContext(): CorpusExecutionContext {
  const values = new Map<string, { value: unknown; computed: number; served: number }>();
  const memo: ExecutionMemo = {
    once<T>(key: string, compute: () => T): T {
      const hit = values.get(key);
      if (hit !== undefined) {
        hit.served += 1;
        return hit.value as T;
      }
      const value = deepFreezePlainData(compute());
      values.set(key, { value, computed: 1, served: 0 });
      return value;
    },
    stats(): readonly MemoStat[] {
      return [...values.entries()].map(([key, entry]) => ({
        key,
        computed: entry.computed,
        served: entry.served,
      }));
    },
  };
  return Object.freeze({ memo: Object.freeze(memo) });
}

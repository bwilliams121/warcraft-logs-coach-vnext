/**
 * The one piece of task metadata the suite attaches.
 *
 * `tests/regression/m9b-corpus-gate.test.ts` puts the machine-readable corpus
 * report of its own execution on `task.meta`, which Vitest serialises into
 * the JSON reporter's output. That is how `scripts/corpus/gate.mjs` collects
 * a report produced INSIDE workerd without the corpus machinery ever writing
 * to a filesystem. Declared here, typed as `unknown`, so the test file does
 * not need a module augmentation of its own and no other key is invited.
 */

declare module "vitest" {
  interface TaskMeta {
    corpusReport?: unknown;
  }
}

export {};

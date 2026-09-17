/**
 * Assassination's decision-coverage vocabulary.
 *
 * MOVED TO SHARED CODE AT M10-C. The classifier and its vocabulary never
 * named a Rogue concept — they read the generic engine's result and a table
 * of generic SimulationCraft atoms — so they now live in
 * `src/simc/decision-coverage.ts`, where a second specialization can use the
 * identical classification. This module re-exports them so every existing
 * import path, value and type is unchanged.
 */

export * from "../../../simc/decision-coverage.js";

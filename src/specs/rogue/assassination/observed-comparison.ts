/**
 * Comparing ONE observed rotational decision against the pinned authority.
 *
 * MOVED TO SHARED CODE AT M10-C. The comparison reads two spec-neutral inputs
 * — the generic first-GCD result and the shared observed-action judgment —
 * and names no Rogue concept, so it now lives in
 * `src/findings/observed-comparison.ts`. This module re-exports it so every
 * existing import path, value and type is unchanged, and `MATCH` keeps the
 * exact meaning documented there: authority-compatible, and nothing more.
 */

export * from "../../../findings/observed-comparison.js";

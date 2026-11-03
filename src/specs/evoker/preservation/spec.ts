/**
 * Preservation Evoker's identity and declared inputs (HEAL-B4, registered
 * INTERNAL_ONLY).
 *
 * The Warcraft Logs class and specialization strings are the ones the
 * committed fight contexts record for the identity subjects (the M13-A fight
 * context actor 8, and the corpus a7r6 fight 7 actor 5: `subType` "Evoker",
 * `friendlySpecs` "Preservation").
 *
 * ROLE. The pinned roster states Preservation's role as UNKNOWN
 * (`src/data/game/spec-roster.json`: no Evoker specialization carries the
 * role passive the extractor reads). That classification is carried as is on
 * the module identity and never replaced by a guess: this tree is a healer
 * evaluator because it is registered as one (its declared families are the
 * healer families), not because a role was inferred, and nothing here reads
 * or asserts a role.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const PRESERVATION_EVOKER_EVALUATOR_REVISION = "preservation-evoker-evaluator/1" as const;

/** The id. `InternalOnlySpecId`: the compile-time side of the exposure. */
export const PRESERVATION_EVOKER_SPEC_ID = "evoker/preservation" satisfies InternalOnlySpecId;

export const PRESERVATION_EVOKER_ANALYZER_ID = "evoker-preservation-healer-findings";

/** The roster display name; the factory refuses any other. */
export const PRESERVATION_EVOKER_DISPLAY_NAME = "Preservation Evoker";

export const PRESERVATION_EVOKER_WCL_CLASS_NAME = "Evoker";
export const PRESERVATION_EVOKER_WCL_SPEC_NAME = "Preservation";

/**
 * What the evaluator reads (CLAUDE.md "Ingestion Scope Derivation").
 *
 * FULL_RAID because a cooldown's overlap with damage episodes ranges over the
 * whole friendly roster, and a plan's player names resolve only against it.
 * Under a smaller scope the overlap reports ROSTER_NOT_IN_SCOPE instead of an
 * empty list. CASTS also carries the empower envelopes the evaluator checks
 * its identified abilities against. The registration declares its
 * capabilities FROM this object, so the derived ingestion requirement cannot
 * drift from it (`registration.ts`).
 */
export const PRESERVATION_EVOKER_REQUIRED_INPUTS = {
  scope: "FULL_RAID",
  categories: ["ACTORS", "CASTS", "DAMAGE", "HEALING", "ABSORBS"],
} as const;

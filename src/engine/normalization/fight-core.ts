/**
 * The actor-independent normalized fight, and the per-player view built from it.
 *
 * WHY THIS SPLIT EXISTS
 *
 * Retrieving a fight is expensive and retrieving it is not about a player.
 * `retrieval-plan.ts` already settled that at the transport: the plan has no
 * `sourceID`/`targetID` field, requests one chronological `dataType: All` stream
 * unfiltered by actor, and omits `hostilityType`. One fetch therefore already
 * contains every actor's events — a fact that was true before this module
 * existed and that nothing here changes.
 *
 * What did NOT exist was a way to SAY so. `ingestFight` produced a `CombatFight`
 * whose evidence view was pinned to one focus actor, so analysing a second
 * player in the same fight meant retrieving the fight a second time. The cost
 * was real and the duplication bought nothing: the second retrieval returned the
 * same bytes.
 *
 * So the fight is now two things:
 *
 *     NormalizedFightCore   what was observed        — actor-independent
 *     CombatFight           what WE may reason about — one focus actor
 *
 * WHAT THE CORE OWNS
 *
 * Every observation and every retrieval fact: provenance, report and fight
 * identity, the actor and ability catalogs, phases, the canonical event
 * sequence, malformed observations, and per-stream retrieval completeness.
 * None of that differs by who is being analysed, because none of it was
 * retrieved per player.
 *
 * WHAT THE CORE DELIBERATELY DOES NOT OWN
 *
 * `breadth` and per-category `coverage.actorScope`. Those answer "whose absence
 * claims may this evidence support", which is a question about an ANALYSIS, not
 * about a retrieval. A core that carried one answer would be making it on behalf
 * of every player who later reads it.
 *
 * It also owns no gameplay meaning, no verdict, and no analyzer. It is the M3
 * model with the actor-dependent projection lifted off.
 *
 * WHICH M3 CONTRACTS THIS PRESERVES
 *
 * All of them, and by construction rather than by care:
 *
 * - `events` is the retrieval-order array, passed through by reference. Nothing
 *   here sorts, deduplicates, filters or re-indexes it, so equal timestamps stay
 *   valid evidence and `ingestionOrdinal` stays unequal to an array index.
 * - actor id `0` is a real id and `-1` is the unknown sentinel; this module
 *   performs no truthiness test on an actor id anywhere.
 * - pets stay factual actors in the catalog, with no owner rollup.
 * - the retrieval plan, cursor handling and stream completeness are untouched —
 *   they are carried across verbatim.
 *
 * WHICH M4 CONTRACTS THIS PRESERVES
 *
 * `createCombatState` takes a `CombatFight` and this module produces exactly
 * that type, with the same fields it always had minus one that nothing read.
 * `combat-state.ts`, `indexes.ts` and `state-result.ts` are not modified, not
 * re-implemented and not bypassed. A focused fight is a `CombatFight`; M4 cannot
 * tell it apart from one that came out of a single-player ingestion, and the
 * fail-closed absence gate behaves identically because it is reading the same
 * `actorScope` the single-player path would have given it.
 */

import type { EvidenceCategory, RetrievalSource } from "../../wcl/evidence-capability.js";
import { EVIDENCE_CAPABILITY_REGISTRY } from "../../wcl/evidence-capability.js";
import { deriveEvidenceActorScope } from "../../wcl/evidence-actor-scope.js";
import type { StreamCompleteness } from "../../wcl/retrieval-types.js";
import type { IngestionScope } from "../../services/ingestion-scope.js";
import type { CombatAbility } from "./abilities.js";
import type { CombatActor } from "./actors.js";
import type { CombatFight, CombatPhase, IngestionProvenance } from "./combat-fight.js";
import { projectCategoryEvidence } from "./completeness.js";
import type { CombatEvent, MalformedRawObservation } from "./normalized-events.js";

/**
 * `ReportFight.talentImportCode`, together with the one actor it describes.
 *
 * THE ACTOR ID IS NOT DECORATION. `talentImportCode(actorID:)` is the only
 * per-actor field in the ingestion context query, so a shared core holds a code
 * belonging to exactly one player. Storing the code alone would let a focused
 * view hand player B the build of player A — a fabricated fact of precisely the
 * kind that is never recoverable downstream, because it is well-formed.
 *
 * Pairing them makes the mismatch checkable, and `focusedFightFor` checks it.
 *
 * `code` is `null` when Warcraft Logs supplied none. That is the documented case
 * for Classic and pre-Dragonflight fights, and it is recorded rather than
 * inferred.
 *
 * TWO STATES THAT MUST NOT COLLAPSE INTO ONE
 *
 *     QUERIED, ANSWERED null   we asked about this actor and WCL had nothing
 *     NOT QUERIED              we never asked about this actor at all
 *
 * `code: null` expresses only the first. The second is not representable here on
 * purpose — it is not a fact about the code, it is the absence of evidence — and
 * it lives where this project puts every "do we hold this" question: in
 * `completeness`. `focusedFightFor` withholds the `TYPED_GRAPHQL_FIELD_PER_ACTOR`
 * stream from any view whose focus actor is not `actorId`, so that view's
 * `TALENTS` evidence resolves ABSENT / NOT_REQUESTED rather than COMPLETE.
 */
export interface TalentImportObservation {
  readonly actorId: number;
  readonly code: string | null;
}

/**
 * One retrieved, normalized fight, before any analysis claims it.
 *
 * Field-for-field the observation half of `CombatFight`. The names match on
 * purpose: a reader comparing the two should be able to see that the focused
 * view adds a projection and invents nothing.
 */
export interface NormalizedFightCore {
  readonly provenance: IngestionProvenance;

  readonly report: CombatFight["report"];
  readonly data: CombatFight["data"];
  readonly fight: CombatFight["fight"];

  readonly actors: ReadonlyMap<number, CombatActor>;
  readonly abilities: ReadonlyMap<number, CombatAbility>;
  readonly phases: readonly CombatPhase[];

  /** Retrieval order. Never re-sorted, never deduplicated. */
  readonly events: readonly CombatEvent[];
  /** Observations with no establishable envelope. Never in `events`. */
  readonly malformedObservations: readonly MalformedRawObservation[];

  /**
   * Per-stream retrieval completeness — what was actually fetched.
   *
   * Actor-independent because retrieval was: one unfiltered stream per
   * hostility selector, plus the typed context streams.
   */
  readonly streams: readonly StreamCompleteness[];
  /** Which stream ids serve each retrieval source. Read by category projection. */
  readonly streamIdsBySource: Readonly<Record<RetrievalSource, readonly string[]>>;
  /** Categories whose family decoding failed on a valid envelope. */
  readonly degradedCategories: ReadonlySet<EvidenceCategory>;
  /** Streams that produced an untyped, untimed defect. */
  readonly streamsWithUntypedDefects: ReadonlySet<string>;

  /**
   * `ReportFight.friendlyPlayers`, verbatim. The raid, as the API reports it.
   *
   * Held because evidence-scope derivation needs to know which actors are ally
   * raid state. It is NOT a roster model and carries no specs — `friendlySpecs`
   * is deliberately absent, because nothing at this boundary reads it.
   */
  readonly friendlyPlayers: readonly number[];

  readonly talentImport: TalentImportObservation;
}

/**
 * Builds the `CombatFight` one analysis of one player may reason over.
 *
 * WHAT IT COMPUTES, AND WHAT IT MERELY PASSES ALONG
 *
 * It computes three small things, all of them answers to "whose evidence is
 * this": `breadth`, the per-category `coverage.actorScope`, and whether the
 * talent import code belongs to this player. Everything else is handed across by
 * reference.
 *
 * NOTHING LARGE IS COPIED. `events`, `actors`, `abilities`, `phases`,
 * `provenance`, `malformedObservations` and the stream list are the SAME objects
 * the core holds. Twenty focused views over one fight share one event array, and
 * a test asserts that by object identity rather than by contents — a deep copy
 * would still compare equal while quietly multiplying the memory cost of a raid
 * night by the size of the raid.
 *
 * THE SCOPE RULES ARE NOT RESTATED HERE
 *
 * `deriveEvidenceActorScope` and `projectCategoryEvidence` remain the only
 * authorities on what the evidence vouches for. This function calls them with
 * one focus actor, which is exactly what single-player ingestion did — so a
 * focused view is not a widened view, and `PLAYER_CONTEXT` still fences ally
 * state off even though the bytes for every ally are physically present in the
 * shared stream.
 *
 * That fencing is the whole reason the scope is derived per player rather than
 * once per fight. Deriving it once over every analysed actor would hand each
 * analysis authority to make absence claims about the others, which is scope
 * widening nobody declared and which no analyzer's registration asked for.
 */
export function focusedFightFor(
  core: NormalizedFightCore,
  focusActorId: number,
  scope: IngestionScope,
): CombatFight {
  // Was the per-actor typed field obtained for THIS player?
  //
  // Only that player's view may draw on it. Every other view is handed an empty
  // stream list for the per-actor source, which `projectCategoryEvidence` turns
  // into ABSENT coverage with reason NOT_REQUESTED — the honest statement that
  // we never asked, and structurally distinct from having asked and received
  // nothing.
  //
  // The comparison is an explicit `===` on ids. Actor id `0` is real in this
  // data, so a truthiness test here would silently withhold a player's own
  // evidence from them.
  const talentQueriedForFocus = focusActorId === core.talentImport.actorId;
  const streamIdsBySource = {
    ...core.streamIdsBySource,
    TYPED_GRAPHQL_FIELD_PER_ACTOR: talentQueriedForFocus
      ? core.streamIdsBySource.TYPED_GRAPHQL_FIELD_PER_ACTOR
      : [],
  };

  return {
    provenance: core.provenance,
    breadth: {
      scope,
      focusActorIds: [focusActorId],
      friendlyActorsInScope: scope === "FULL_RAID" ? core.friendlyPlayers : [],
    },
    completeness: {
      streams: core.streams,
      categories: projectCategoryEvidence({
        registry: EVIDENCE_CAPABILITY_REGISTRY,
        streams: core.streams,
        streamIdsBySource,
        degradedCategories: core.degradedCategories,
        streamsWithUntypedDefects: core.streamsWithUntypedDefects,
        // Which actors the evidence VOUCHES for — not who we are analysing.
        // See `evidence-actor-scope.ts`: the capture is unfiltered by actor, so
        // enemy/target state is genuinely held under PLAYER_CONTEXT, while ally
        // state stays fenced off until FULL_RAID.
        actorScope: deriveEvidenceActorScope({
          scope,
          focusActorId,
          friendlyPlayerActorIds: core.friendlyPlayers,
          actors: core.actors,
        }),
      }),
    },
    report: core.report,
    data: core.data,
    fight: core.fight,
    actors: core.actors,
    abilities: core.abilities,
    // The code belongs to ONE actor. Carrying another player's build here would
    // be a fabricated fact, so every other view gets `null`.
    //
    // `null` ALONE DOES NOT SAY WHICH NULL THIS IS. A reader distinguishing
    // "asked, and there was none" from "never asked" must consult
    // `completeness.categories.TALENTS`, which is COMPLETE only for the actor
    // the field was requested for. That is the same division this project draws
    // everywhere: a value says what was seen, and completeness says whether we
    // were in a position to see it.
    talentImportCode: talentQueriedForFocus ? core.talentImport.code : null,
    phases: core.phases,
    events: core.events,
    malformedObservations: core.malformedObservations,
  };
}

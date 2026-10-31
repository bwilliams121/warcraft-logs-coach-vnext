# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M12-D: First healer specialization evaluator (Restoration Shaman, internal).
Autopilot queue entry M12-D. Branch `autopilot/m12-d`, from main at 5e6ce70.

- **Owner decision (2026-10-31)**, recorded in `agent/autopilot-queue.md`
  "M12-D": Restoration Shaman first; v1 scope ASSIGNMENT (only with a
  supplied plan), COOLDOWN (observational), HEALING_DECISION
  (NO_AUTHORITY_AVAILABLE); cooldown identity in that spec's runtime data.
- Warcraft Logs: none. The new evidence is cut from the already-authorized,
  locally retained M11-E2 capture (`.probe/m11e2/pages.json`).
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/`,
  `src/mcp/` or `src/services/` changed. The evaluator is not registered.
- Queue bookkeeping: PREP-5 recorded MERGED (PR #19, 5e6ce70); M12-D set
  PR_OPEN. M12-C was already recorded.

## What it adds

`src/specs/shaman/restoration/evaluator.ts` — `evaluateRestorationShaman`
(pure, revision `restoration-shaman-evaluator/1`).

- **Identity first.** The preflight `FightIdentity` must name this report and
  fight, class "Shaman", specialization "Restoration"; the fight's master
  data must list the actor as a Shaman player. Otherwise `IDENTITY_REFUSED`
  (`IDENTITY_MISMATCH` / `NOT_THIS_SPECIALIZATION` / `IDENTITY_UNRESOLVED` /
  `IDENTITY_CONFLICT`), nothing evaluated. Unusable runtime data:
  `RUNTIME_DATA_UNAVAILABLE`.
- **ASSIGNMENT**, authority `RAID_COOLDOWN_PLAN` (the plan's source):
  - no plan → `NO_AUTHORITY_AVAILABLE` / `NO_RAID_COOLDOWN_PLAN`; never
    inferred from anyone's casts;
  - entries are the architecture's normalized CooldownAssignment (player,
    ability, planned time, plan-stated tolerance, source). The input
    format/transport stays M12-E's owner decision; nothing in production
    supplies a plan;
  - `ASSIGNMENT_MET`: the player's own completed cast of the planned ability
    inside `[planned − tol, planned + tol]`; the cast is the actionability
    proof (`provenActionableByObservedExecution`);
  - `ASSIGNMENT_NOT_ACTIONABLE` (`ENCOUNTER_ENDED_BEFORE_WINDOW`): only a
    COMPLETED fight whose end precedes the window;
  - `ASSIGNMENT_UNKNOWN` otherwise: `READINESS_NOT_ESTABLISHED` for no cast in
    a COMPLETE-covered window (nothing pinned proves readiness, so a miss is
    unprovable), the CASTS gate's reason for a coverage gap,
    `WINDOW_OUTSIDE_FIGHT`, `ABILITY_NOT_IDENTIFIED`, `ASSIGNMENT_INVALID`.
    Nearest observed casts are context only;
  - MISSED / EARLY / LATE / PLAN_MAY_NEED_REVIEW are deliberately
    unreachable in v1 (follow-up "After M12-D" says what would unlock them).
- **COOLDOWN**, `WCL_OBSERVED_FACT`, no verdict:
  - a use is a completed `cast` sourced by the player of an identified
    ability — not a begincast, an aura of the same id (real Ascendance: 7
    applications, 2 casts), another player's cast, or the totem's cast;
  - listing COMPLETE only under the player's CASTS coverage over the whole
    fight, else UNKNOWN with the gate's reason;
  - per use, the M12-B episodes overlapping `[cast, cast + 10 s]` (a
    reporting span, not an effect duration), with, per player hit, the count
    of M12-C entries from the player and its WCL-stated pets plus that list's
    coverage. Counting stated pets is this spec's decision; `src/healing/`
    still never attributes pets. Without FULL_RAID: `ROSTER_NOT_IN_SCOPE`.
  - **(review cycle 2)** each overlap now carries `listing`: COMPLETE only
    when DAMAGE holds for every roster player over `[cast − gapMs, cast +
    span + gapMs]`, inside the fight, with no ability-less roster hit there
    (the M12-B episode-coverage rule applied to the span); otherwise UNKNOWN
    with `beyondFightEdge`, `uncoveredActors` (gate reasons) and
    `unidentifiedHitsInSpan`. Observed episodes are still listed. New tests:
    absent DAMAGE, a gap in the span, a gap in the margin before the span
    (uncertain boundary) with its covered counterpart, an ability-less hit,
    a span past the fight end, and a COMPLETE empty-list control.
  - **(review cycle 3)** the cooldown listing is now UNKNOWN
    (`UNIDENTIFIED_SUBJECT_CAST`, with `unidentifiedCasts`) when a completed
    cast of the player inside the fight carries no ability id, even under
    COMPLETE CASTS coverage; known uses are kept. An assignment window
    holding such a cast resolves `UNIDENTIFIED_SUBJECT_CAST` rather than
    `READINESS_NOT_ESTABLISHED`. New tests: the listing case, a control where
    another player's ability-less cast leaves it COMPLETE, and the
    assignment-window case. The real fight's listing stays COMPLETE (actor
    122 has no ability-less cast).
  - **(review cycle 4)** a use (and so MET evidence, and the unidentified
    casts) must lie inside the encounter, bounds inclusive; the normalizer
    keeps out-of-range events flagged, and the evaluator now ignores them.
    New tests: identified casts before the pull and after the kill neither
    list nor meet an assignment (the post-kill one is NOT_ACTIONABLE), with
    controls exactly at the start and end that list and meet.
- **HEALING_DECISION**: always `NO_AUTHORITY_AVAILABLE` /
  `NO_APPROVED_PER_CAST_HEALER_MODEL`.
- No confidence field: `m5-boundary-and-vocabulary` bans a confidence
  vocabulary in `src/specs`; the status carries the evidence grade.
- `spec.ts` declares `RESTORATION_SHAMAN_REQUIRED_INPUTS` (FULL_RAID, ACTORS,
  CASTS, DAMAGE, HEALING, ABSORBS). Nothing derives a scope from it until
  registration (follow-up).

## Runtime data

`src/data/game/shaman-restoration-healing-cooldowns.{json,ts}`: identity only
— Spirit Link Totem 98008, Ascendance 114052, Healing Tide Totem 108280
(Ascendance/HTT share choice node 81032).

- Each entry carries its verbatim `trait_data.inc` row from the pinned SimC
  commit 33622e9d (client 12.1.0.69587); the four source-file hashes equal
  those already recorded for that commit in the Blood datasets. I checked
  each row verbatim against the local pinned checkout.
- The loader re-parses each row (tree 2, class 7, entry, node, spell, name,
  spec 264) and the choice-sibling coherence, failing closed.
- No cooldown, charge or duration is claimed; the selection of healing
  cooldowns is hand-reviewed per entry.

## Guard amendments (each by name, nothing loosened beyond it)

- `m12a-healing-layering`: "nothing in production reads it yet" becomes
  "only the named consumers read it", naming exactly
  `src/specs/shaman/restoration/evaluator.ts`.
- `m11a2-cross-spec-isolation`: `UNREGISTERED_EVALUATOR_TREES =
  ["shaman/restoration"]`. R1/R3/R4/R5 apply to it unchanged; only the
  registration rules (registration.ts present, trees == SpecIds, R2's
  importer list, one APL per tree) exclude it, and it is pinned to have no
  registration.ts and no SpecId.
- `m10a-cross-spec-isolation`: the tree list includes it; pinned to have no
  registration.
- `m5c1-gcd-semantics` "no negative ACTIONABILITY state": the exact literal
  `"ASSIGNMENT_NOT_ACTIONABLE"` is admitted in that one file only, which must
  also carry `reason: "ENCOUNTER_ENDED_BEFORE_WINDOW"` and
  `fightEndReportTimeMs`. It is the outcome named in architecture "Raid
  Cooldown Assignments", not an actionability member (the two-member
  vocabulary in `src/findings/actionability.ts` is unchanged).
  `PROVEN_NOT_ACTIONABLE` stays banned everywhere.

## Evidence

Two `--actor-slice 122 --families cast,begincast --compact` segments of the
M11-E2 capture (whole fight, 209 + 192 events, 119,216 bytes), archive only,
granting CASTS for actor 122. Two normalization-census archive cases.
`build-manifest.mjs`, `tests/evidence/manifest.json` and `report.json`
regenerated; m11c4e pins updated (14 cases / 36 assertions; 18,158,195
bytes). Corpus bytes unchanged; ledger row added.

The real test composes the segments through the sanctioned `bundleOf` with
the committed fight context as catalog (the m9a corpus-layering rule), takes
the encounter bounds from that context, and asserts, against values derived
from the raw bytes: four healing-cooldown casts (Ascendance 7,469,039 and
7,666,386; SLT 7,543,726 and 7,776,617), listing COMPLETE, sources 122 + 7
stated pets, overlap `ROSTER_NOT_IN_SCOPE`, both NO_AUTHORITY results, and a
test plan giving MET / READINESS_NOT_ESTABLISHED / NOT_ACTIONABLE.

## Validation

- `tests/unit/specs/restoration-shaman-evaluator.test.ts`: 37 passed.
- Amended guards + m9a + m5 boundary: 2,257 passed.
- `npm run typecheck`, `npm run format:check`: clean.
- `npm run test:evidence`: PASSED (byte-identical workerd reports, committed
  report matches). `npm run test:corpus`: PASSED (183 cases / 778
  assertions).
- `npm test`: 10,617 passed, 13 failed — all "Test timed out in 5000ms" in
  Protection/Retribution projection, raid-night, encounter-context and
  simulation-runner files this tranche does not touch. The same 10 files
  rerun with `--testTimeout=120000`: 146/146 passed. CI is the arbiter.

## Questions for the reviewer

1. Is defining the normalized assignment input locally in the spec tree
   (pending M12-E's format/transport decision) acceptable, versus leaving
   ASSIGNMENT permanently NO_AUTHORITY_AVAILABLE until M12-E?
2. Are the four named guard amendments the right shape for the first
   unregistered evaluator tree?

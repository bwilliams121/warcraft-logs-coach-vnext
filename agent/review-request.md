# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M12-E: Raid cooldown assignment input. Autopilot queue entry M12-E. Branch
`autopilot/m12-e`, from main at 8a6cff5.

- **Owner decision (2026-10-31)**, recorded in `agent/autopilot-queue.md`
  "M12-E" (13 points): the authoritative raid cooldown plan is an EXPLICIT
  USER-PROVIDED INPUT; no plan means ASSIGNMENT is NO_AUTHORITY_AVAILABLE.
  The decision text itself is part of this diff (the queue entry moves from
  OWNER_DECISION_REQUIRED to PR_OPEN).
- Warcraft Logs: none. Synthetic and note fixtures, plus the committed M12-D
  evidence.
- **Public contract: EXPECTED** (declared by the queue). Precisely:
  1. **Request input (REST body and MCP tool argument):** a new optional
     `raidCooldownPlan`, either
     `{ format: "STRUCTURED", encounterId, difficulty, label?, defaultToleranceMs?, assignments: [{ player: { name, realm? }, abilityId, plannedTime: { kind: "PHASE_RELATIVE", phase: string, offsetMs } | { kind: "FIGHT_RELATIVE", offsetMs }, toleranceMs?, bossSpellId? }] }`
     or `{ format: "TIMELINE_NOTE", encounterId, difficulty, label?, defaultToleranceMs, text }`.
     An invalid plan is `INVALID_REQUEST` with existing issue codes
     (`INVALID_REQUEST_SHAPE`, `REQUEST_LIMIT_EXCEEDED`). No new error code.
  2. **MCP tool:** both `analyze_warcraft_log` input variants gain the
     optional field (`src/contracts/raid-cooldown-plan-input-contract.ts`,
     shape only); the description gains one paragraph saying a plan is never
     inferred and its assignments are NOT_EVALUATED by this tool.
  3. **Result (`analysis/1`, optional, additive):** `raidCooldownPlan`
     (`RaidCooldownPlanDisclosureSchema`), present ONLY when a plan was
     supplied, on every status. Fields: `authority`
     (`USER_PROVIDED_RAID_PLAN`), `schema` (`raid-cooldown-plan/1`), `format`,
     `label`, `digest` (SHA-256 hex of the normalized plan's canonical JSON),
     `encounter`, `encounterBinding` (MATCHED / MISMATCHED / UNKNOWN),
     `assignmentCount`, `importDiagnostics` (tally), `assignmentEvaluation:
     { state: NOT_EVALUATED, reason: PLAN_NOT_FOR_THIS_FIGHT |
     ENCOUNTER_BINDING_UNKNOWN | NO_PUBLIC_ASSIGNMENT_EVALUATOR }`.
     A request without a plan produces a byte-identical document (no key);
     the corpus and evidence gates' committed reports are unchanged.
- Queue bookkeeping: M12-D recorded MERGED (PR #20, 8a6cff5); M12-E PR_OPEN.
  M12-C and PREP-5 were already recorded MERGED.

## What it adds

**`src/raid-plan/` (shared input, no gameplay meaning, no spec branch):**

- `raid-cooldown-plan.ts`: the normalized `RaidCooldownPlan` /
  `RaidCooldownAssignment` (player name + optional realm, `abilityId`,
  `plannedTime`, `toleranceMs` + `toleranceSource`, source line/index and raw
  line, `context.bossSpellId`), import-diagnostic vocabulary, limits.
- `timeline-note-import.ts`: the semicolon note importer. An assignment needs
  `time`, `ph`, one named player in `tag`, and `spellid`; everything else is a
  diagnostic (`everyone`/role/group tags, several names, reminders, text, no
  `ph` — never assumed pull-relative). `countdown` is not tolerance;
  `bossSpell` is context only; the caller's `defaultToleranceMs` is the only
  tolerance. Seconds → ms without floating point.
- `resolve.ts`: binding (encounter id AND Warcraft Logs difficulty id equal;
  unreported difficulty → UNKNOWN; mismatch → NOT_BOUND, nothing resolved);
  player (exactly one `friendlyActorsInScope` player, NFC + case-insensitive,
  diacritics significant, realm exact; else ROSTER_NOT_IN_SCOPE /
  ROSTER_NAMES_INCOMPLETE / NO_MATCH / AMBIGUOUS with candidates as
  context); time (FIGHT_RELATIVE from the pull; PHASE_RELATIVE always
  `PHASE_LABEL_NOT_MAPPED`: no reviewed label→phase map exists, a boundary is
  never guessed).
- `digest.ts`: local canonical JSON + WebCrypto SHA-256 (no analysis path may
  import `src/simulation`).

**Application service:** `parseAnalysisRequest` parses the plan beside
either identifier form (one parser for REST and MCP); preflight still gets
identifiers only; `discloseRaidCooldownPlan` (binding from the preflight
identity) is attached to every success result, including SPEC_NOT_SUPPORTED.
No analyzer reads the plan.

**Restoration Shaman (still internal, unregistered):** consumes the normalized
plan and resolves it itself. No plan → NO_AUTHORITY_AVAILABLE; plan for
another encounter/difficulty → NO_AUTHORITY_AVAILABLE
(`PLAN_NOT_FOR_THIS_FIGHT`); unbindable → UNKNOWN
(`ENCOUNTER_BINDING_UNKNOWN`). Only this player's entries for its registered
healing-cooldown ids are evaluated; its other entries are `notEvaluated`
(`ABILITY_NOT_REGISTERED`, replacing M12-D's `ABILITY_NOT_IDENTIFIED`
UNKNOWN). An unresolved name that may be this player (the subject is a
name-matching candidate, or the name equals the preflight identity's name,
whatever the resolver's reason — including a roster that names the subject
nowhere) → `PLAYER_NOT_RESOLVED`, never counted as another player's;
unresolved time → `PLANNED_TIME_UNRESOLVED`. Every result carries an
`AssignmentReference` back to the plan entry. M12-D's MET / NOT_ACTIONABLE /
UNKNOWN rules are unchanged; MISSED/EARLY/LATE remain unreachable.

## Fail-closed points worth checking

- UNKNOWN vs NO_AUTHORITY_AVAILABLE: a plan for another fight is "no
  standard for this fight" (NO_AUTHORITY); an unbindable plan is "a standard
  without the evidence to apply it" (UNKNOWN).
- No guessed phase boundary, difficulty name, realm spelling, alias or
  tolerance; a phase is never numeric.
- An invalid plan never degrades to "no plan".
- A supplied plan can never read as "assignments met": the public disclosure
  is always NOT_EVALUATED.

## Tests and validation

New: `tests/unit/raid-plan/timeline-note-import.test.ts`,
`tests/unit/raid-plan/resolve.test.ts`,
`tests/unit/raid-cooldown-plan-request.test.ts`,
`tests/contracts/m12e-raid-cooldown-plan-input.test.ts`,
`tests/integration/m12e-raid-cooldown-plan-transports.test.ts`. Updated:
`tests/unit/specs/restoration-shaman-evaluator.test.ts` (normalized plan,
binding, resolution, real evidence under the committed roster),
Review cycle 1 fix: the subject with a null roster name and a plan entry
naming it (preflight name) is now `PLAYER_NOT_RESOLVED` with
`assignmentsForOtherPlayers: 0` (regression added).
`tests/contracts/m6a-mcp-layering.test.ts` (allowlists the input-contract
module), `tests/unit/analysis-request.test.ts` (request keys now include
`raidCooldownPlan: null`; still no scope).

- `npm run typecheck`: clean. `npm run format:check`: clean.
- `npm test`: 10,708 passed; 14 failed, all 5 s timeouts in pre-existing
  slow tests (simulation runner service, Protection projections, corpus
  harness). The same set fails identically on an origin/main worktree on
  this machine under the same load; each touched M12-E test passes.
- `npm run test:corpus`: PASSED (183 cases / 778 assertions, committed
  report matches). `npm run test:evidence`: PASSED (14 / 36).

## Docs

`agent/architecture.md` "M12-E"; `agent/follow-ups.md` "After M12-E" (phase
label map, public assignment evaluation, difficulty names, realm spelling,
note roster enrichment, multi-name tags, bossSpell anchors, persistence) and
M12-D's "No plan input" bullet superseded; `agent/testing.md`;
`src/specs/shaman/restoration/README.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

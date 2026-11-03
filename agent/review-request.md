# Review request

Rolling file: overwritten for each review cycle.

## Change

HEAL-B1: Holy Paladin, Restoration Druid and Mistweaver Monk (internal).
Branch `autopilot/heal-b1`, from main at 7abddea.

- **Warcraft Logs: NONE.** No request, probe or capture. Real evidence is
  committed only (the M13-A capture, the b1PmaKrd6CDfzngc fight 48 archive
  window and its context, and the gtKb fight 22 corpus context). Runtime data
  rows come from the already-pinned SimulationCraft `trait_data.inc`
  (commit 33622e9d, sha256 7818328b…, the same file Restoration Shaman's data
  cites).
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or
  `src/mcp/` changes. The three ids are INTERNAL_ONLY; a public request for
  any of them stays SPEC_NOT_SUPPORTED with no analyzer dispatched.
- **Queue bookkeeping:** HEAL-AP is recorded MERGED (PR #46, 7abddea1…), and
  HEAL-B1 is set PR_OPEN. The other merged tranches the supervisor listed were
  already recorded MERGED with their pr and mergeSha.

## Design: lift what is no specialization's, keep what is

Restoration Shaman's M12-D evaluator mixed spec-owned code (identity gate,
healing-cooldown data, counting its totems) with code that is no
specialization's: the CLAUDE.md "Healer Cooldown Assignments" plan rules, the
observed-use and overlap facts, the artifact reader, the finding-set
restatement. Three more healers would have copied the second kind three times
(CLAUDE.md "Shared Finding Primitives"). It moved, **unchanged in behavior**:

| New shared module | From | Notes |
| --- | --- | --- |
| `src/healing/cooldown-use-context.ts` | Resto evaluator `castsOf`, unidentified casts, listing, pet set, `overlapOf` | facts only; ids and "count pets?" are caller inputs; passes `m12a-healing-layering` (no spec/judgement word, imports only engine + `./`) |
| `src/findings/healer-assignment-execution.ts` | Resto evaluator `evaluatePlan` / `evaluateAssignment` | the plan rules; never imports `src/healing/`; the `m5c1` `"ASSIGNMENT_NOT_ACTIONABLE"` exception moved with it (still one issuing file, same reason) |
| `src/findings/healer-finding-projection.ts` | Resto `healer-findings.ts` body | `healerFindingSetOf(spec, …)` |
| `src/data/game/healing-cooldown-identity-artifact.ts` | Resto data loader | parameterized by dataset/class/spec; two added row checks (below) |

Proof of no behavior change: Restoration Shaman's evaluator, registration and
public tests, the HEAL-AP healer promotion gate and the corpus all run
unchanged. Its evaluator revision stays `/2` and re-exports the moved types
under their old names.

The reader gained two checks, both satisfied by the Restoration Shaman
artifact: the entry's node type must equal the row's `node_type`; and the
cast id is the row's `id_override_spell` when non-zero
(`trait_data.hpp`: "id_spell is overriden by id_override_spell for
display/activation in-game"), else `id_spell`. A CHOICE node may have no
identified sibling; a NORMAL node never has one.

## The three specialization trees

Each of `src/specs/paladin/holy/`, `src/specs/druid/restoration/`,
`src/specs/monk/mistweaver/` owns `spec.ts` (identity strings, REQUIRED_INPUTS
FULL_RAID), `evaluator.ts` (identity gate → its data → shared facts and plan
rules), `registration.ts` (HEAL-A's shape: three provider-less families from
REQUIRED_INPUTS, no binding, never ANALYZED; AUTHORITY_NOT_AVAILABLE /
INSUFFICIENT_EVIDENCE; no healer view; empty public prose) and a README with
its supported surface. The M12-D verdict-category limits apply unchanged:
ASSIGNMENT only against a supplied plan (MET / NOT_ACTIONABLE after a completed
encounter / UNKNOWN; MISSED, EARLY, LATE unreachable), COOLDOWN observational,
HEALING_DECISION NO_AUTHORITY_AVAILABLE.

Runtime data (`src/data/game/<class>-<spec>-healing-cooldowns.{json,ts}`,
spec-owned under R3), each entry a verbatim spec-tree row, extracted by a
script from the pinned file, selection hand reviewed and noted per entry:

- Holy Paladin (2/65): Aura Mastery 31821; Avenging Wrath 31884 | Avenging
  Crusader 216331 (talent spell 394088, override 216331).
- Restoration Druid (11/105): Tranquility 740; Flourish 197721; Incarnation:
  Tree of Life 33891 | Convoke the Spirits 391528 (the spec-105 row only).
- Mistweaver Monk (10/270): Revival 115310 | Restoral 388615; Invoke Yu'lon
  322118 | Invoke Chi-Ji 325197.

Externals (Blessing of Sacrifice, Ironbark, Life Cocoon), Tyr's Deliverance,
hero and class-tree spells are deliberately not identified; a plan entry for
one is `ABILITY_NOT_REGISTERED` (follow-ups "After HEAL-B1").

## Registration ripple

Ids appended to `SPEC_IDS` and `INTERNAL_ONLY_SPEC_IDS`; three rows appended
to `ANALYZER_REGISTRATIONS` (ten rows; seven PUBLIC). Test pins updated to the
new catalog: partition, registry, catalog and module snapshots, counted-catalog
call maps, roster count (30 unregistered), isolation trees, authority-free
trees, healing consumers, identity evidence (fight 48 actor 1; gtKb fight 22
actors 2 and 17), corpus layers `SPEC_HOLY_PALADIN`, `SPEC_RESTORATION_DRUID`,
`SPEC_MISTWEAVER_MONK` (one kind, one executor, two cases each: unstated
subject → INSUFFICIENT_EVIDENCE; internal-only reachability). Corpus: 193
cases / 788 assertions; `report.json` rewritten by the gate.

## Real evidence (committed; checked against raw bytes)

- M13-A Holy Paladin (actor 5): Avenging Wrath at 184,987 and Aura Mastery at
  272,367, its only casts of identified ids; filtered capture → listing UNKNOWN
  (INSUFFICIENT_COVERAGE); breadth → ROSTER_NOT_IN_SCOPE overlap.
- Fight 48 Holy Paladin (actor 1) and Mistweaver (actor 9), friendly-players
  window with none of their casts: no use, listing UNKNOWN, never "none used";
  Mistweaver sources = 9 plus its four stated pets.
- The same stated Holy Paladin run as Druid or Mistweaver: IDENTITY_REFUSED.

## Negative cases pinned (per specialization)

Wrong spec/class, unlisted actor, other-class actor, pet, other fight →
IDENTITY_REFUSED. No plan → NO_AUTHORITY_AVAILABLE even when the player and
another healer cast the cooldown. Begincast, aura, another player's cast, the
pet's own cast, an unidentified class spell and Spirit Link Totem are never
uses. CASTS gap → listing UNKNOWN. No cast in a covered window → UNKNOWN
READINESS_NOT_ESTABLISHED, never missed. Another healer's cooldown in a plan →
ABILITY_NOT_REGISTERED. PLAYER_CONTEXT → ROSTER_NOT_IN_SCOPE.

## Validation

- `npm run typecheck`: clean. `npm run format:check`: clean.
- `npm test` (node + workers), full run: 12,481 passed; the failures were
  two missed pins (fixed and rerun green) and 5 s timeouts in unrelated heavy
  suites at 97% CPU. Rerun at two workers, all passed except
  `m8g-encounter-context-composition` "byte-identical across…", which times
  out identically (6.2 s) on an origin/main worktree on this machine: not a
  regression.
- `npm run test:evidence`: PASSED.
- `npm run test:corpus -- --write-report`: PASSED (two byte-identical workerd
  runs, 193 cases, 788 assertions).

## Not established (follow-ups "After HEAL-B1")

None of the three can pass the healer promotion gate on committed evidence
(HEAL-B1P needs whole-fight cast captures); six of ten identified ids are
row-only; selections are narrow; four registrations restate one facade.

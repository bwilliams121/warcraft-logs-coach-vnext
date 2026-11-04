# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-D1: Destruction Warlock (internal, Cohort D representative). Branch `autopilot/onb-d1`, from main at b46cbed. **Outcome: registered INTERNAL_ONLY, the first reader of the shared ONB-S4 cast anchor. No decision resolves on real evidence.**

- **Warcraft Logs: NONE.** No request or probe. The census and replay read retained files offline.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Warlock/Destruction request is SPEC_NOT_SUPPORTED, as before.
- **Shared code: one additive blocker** (see below). No spec logic in shared code and no new shared analyzer.
- **Queue bookkeeping:** ONB-C2P is recorded MERGED (PR #68, b46cbed3…), and ONB-D1 is set to PR_OPEN. The supervisor's merged list was compared by script (see Validation).

## The thing to check first: what the anchor means for a decision

ONB-S4 said Cohort D "owns what the anchor means". This is the first reading, and later casters will copy it. `src/specs/warlock/destruction/observed-analysis.ts`:

1. **The decision's times are the anchor's.** `reportTimeMs` and `fightTimeMs` become the begin's where the anchor is established. `position` and `locator` stay the completion's, because the completion is the observation that names the action. No earlier specialization separated them. The view is not public, and a promotion must check its readers (agent/follow-ups.md "After ONB-D1").
2. **No anchor, no verdict.** An UNKNOWN anchor replaces the query's answer with `ROTATIONAL_GCD_UNKNOWN` / `DECISION_ANCHOR_NOT_ESTABLISHED`, whatever the scan said. The scan's diagnostics stay attached. A test gives the facade an authority view that does resolve: a Soul Fire is a MATCH with its begin and UNKNOWN without one, and a Chaos Bolt is UNKNOWN even with one.
3. **Nothing read at a completion is called the decision's state.** Every binding is fixed for the fight, the talents and the hero tree, so "bindings at the anchor" holds trivially. `soul_shard` is unbound on purpose: `begincast` carries no `classResources` on the wire, the value on a Chaos Bolt's `cast` is at its completion, and fractions arrive during the cast. A test attaches five shards to a completion and shows `soul_shard<=4` stay open.
4. **A begin alone is no decision.** No missed-action opportunity is built anywhere. Unpaired begins are counted in `coverage.unpairedBegins`, never judged.

## The shared addition

`DECISION_ANCHOR_NOT_ESTABLISHED` joins `RotationalGcdBlocker` (`src/simc/first-gcd-selection.ts`), and `classifyBlocker` reads it as the existing `OBSERVED_STATE_MISSING` (`src/simc/decision-coverage.ts`). The query never produces it. `rawBlocker` is not in `ObservedDecisionView`, and the class already exists, so no public vocabulary moves.

## The profile (`cast-anchor-profile.ts`, `warlock-destruction-cast-semantics.ts`)

It proves a cast time above zero, never a duration. `exactMs` is always null, because haste at the cast is not established, so `DERIVED_FROM_COMPLETION` is unreachable and a begin-less hard cast is never read as instant.

| Row | Base (pinned `_cast_time`) | Rule |
| --- | --- | --- |
| Soul Fire, Immolate, Cataclysm | 3000, 1500, 2000 | POSITIVE: no -100% cast-time row of the family matches |
| Chaos Bolt, Incinerate, Infernal Bolt, Ruination | 3000, 2000, 2000, 1500 | UNKNOWN on every build |
| Conflagrate, Shadowburn, Wither, Summon Infernal, Malevolence, Havoc, Rain of Fire | 0 | INSTANT |

## The previous review's finding, and what changed

The last review returned CHANGES_REQUIRED: I had excluded -100% cast-time rows (281440, 364349 on Chaos Bolt; 335004, 279673 on Incinerate) because the pinned module and talent data do not name them, and that is not a proof. I searched for one: those ids appear in no retained source except the spell table itself, but the retained sources hold no set-bonus table, so I cannot prove them unreachable. So I took the review's other option:

1. **Every spell with such a row stays UNKNOWN on every build.** The talent conditions (Diabolic Ritual, Chaotic Inferno, Backlash) are gone, and so are the two talent rows only they read.
2. **Regression, and a further gap it exposed.** With `castTimeAt` UNKNOWN, the shared timeline still pairs a completion with an earlier begin, and enumerates an instant execution only for a begin in the completion's own millisecond. So a stale begin could still give a falsely established anchor. `destructionDecisionAnchor` refuses that pairing, with both instants as candidates. A test pins it: Chaos Bolt and Incinerate with a begin are UNKNOWN and never a MATCH.
3. **I did not change the shared rule.** ONB-S4's pinned measurements rest on it, and no other specialization reads it. It is recorded in agent/follow-ups.md "After ONB-D1". **Please check this is the right side of the boundary.**
4. **Effect scan widened.** The family holds cast-time effects on aura subtypes 4, 107 and 108 only, so no label modifier (218, 219) is involved. The reading says nothing of effects outside the warlock family.

The earlier non-blocking note (a related-test path naming ONB-C1) is fixed.

## The evidence

Measured offline at this base (`.probe/onbd1/census.cjs`, `.probe/onbd1/m/`, re-measured after the correction), 5,649 JSON files parsed, Mortal Strike as the positive control. Replayed through production ingestion:

| Subject | Hero tree | Span | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| A7R6 fight 7 actor 12 | Hellcaller | first 165 s of 424.5 s | 115 | 0 | 0 | 115 | 21 |
| A7R6 fight 7 actor 15 | Hellcaller | first 165 s of 424.5 s | 105 | 0 | 0 | 105 | 12 |

Every scan passes `variables`, `ogcd` and `items` and meets `default[3]` on `active_enemies`.

| Anchor | Actor 12 | Actor 15 |
| --- | ---: | ---: |
| `INSTANT_COMPLETION` | 49 | 54 |
| `OBSERVED_BEGINCAST` (Soul Fire) | 2 | 2 |
| `BEGINCAST_PAIRING_AMBIGUOUS` (every Chaos Bolt and Incinerate) | 63 | 48 |
| `CAST_TIME_UNKNOWN` (the opening Soul Fire, begun before the pull) | 1 | 1 |

Begins: 11 `INTERRUPTED`, 26 `PAIRING_NOT_PROVEN`. No instant contradicts its review.

## Decisions a reviewer might reject

1. **"Not an owner stop."** Requirement C cannot be met, because every decision stops at the enemy count, which is already queued as the owner's (ONB-S3). Same reasoning as ONB-B1, ONB-B3 and ONB-C1, and the entry asks for an internal registration.
2. **Soul Shards unbound, and no wire contract added.** A type 7 row in `resource-types.ts` would be new shared surface for a value nothing could correctly read at a begin. It is in the follow-up.
3. **The cast table is hand-reviewed, not extracted.** Its rows cite the pinned field, and a test holds it to the GCD dataset's tokens. Extracting `_cast_time` would change a shared extractor's output shape for one specialization.
4. **Rain of Fire's applicability is UNKNOWN**, so real scans physically stop there inside the area list (210 of 220), not on its condition. Both read the count, and neither is reachable without ONB-S3.
5. **Nothing committed.** Pinning these decisions would prove nothing the synthetic tests do not.
6. **Ritual Clipping untouched**, as the entry says.

## What changed

- Module: `src/specs/warlock/destruction/` (new), including `cast-anchor-profile.ts` and `README.md`.
- Data: `src/simc/data/warlock-destruction.apl.json`, `src/data/game/warlock-destruction-{gcd-semantics,talents}.{json,ts}`, `-transition-authority.ts`, `-cast-semantics.ts`.
- Extractors: three new targets in `scripts/authority/`, plus its README. No other target changes.
- Shared: `src/simc/first-gcd-selection.ts`, `src/simc/decision-coverage.ts`, `src/findings/spec-id.ts`, `src/services/analyzer-registry.ts`.
- Tests: `tests/unit/specs/onb-d1-destruction-warlock.test.ts` (new), the corpus executor, two manifest cases, reports, and the row in each registry pin.
- Docs: `agent/architecture.md` "ONB-D1" and the ONB-S4 note, `agent/follow-ups.md` "After ONB-D1", `agent/testing.md`, `agent/spec-onboarding-inventory.md`, `agent/m11-spec-coaching-inventory.md`, `agent/autopilot-queue.md`.

## Validation run

- All of this ran on this tree, after the correction.
- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED (221 cases, 816 assertions). `npm run test:evidence`: PASSED (32 cases, 80 assertions). Both ran in sequence, with no suite beside them. Both reports were regenerated with `--write-report` for the new row before the correction, and the corrected tree matches them.
- Full suite, node project, parallel, 60 s timeout: 14,324 tests, 14,323 passed, 1 failed. The failure is `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, on the recorded list of parallel-load failures. Rerun without the full suite beside it, it passes (44 passed), so I infer load; I did not prove it. The whole suite has not run clean in one pass. An earlier run on the tree before the correction also failed `simulation/runner-and-parser` U and `simulation/runner-service-queue` W, which count job directories in the shared temporary directory; both passed in this run.
- Focused: `tests/contracts`, `onb-d1-destruction-warlock`, `m9b-corpus-manifest`, `m11d2c-pinned-extraction-preflight`: 9,281 passed (9,281).
- Queue compared by script with the supervisor's whole merged list: 50 compared, 0 mismatched.
- The APL and GCD extractor targets ran against the local pinned source root, and the talent target reran after the correction, each with required facts VERIFIED. No other target's artifact changed.
- No network to Warcraft Logs.

## What is not here

No promotion, no public change, no new evidence, no Warcraft Logs request, no enemy-count model, no Soul Shard reading, no aura or cooldown binding.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

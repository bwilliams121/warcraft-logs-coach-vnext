# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-A2P: Subtlety Rogue, Fury Warrior and Protection Warrior, public promotion: **not promoted**. Branch `autopilot/onb-a2p`,
from main at 0955a07.

- **Warcraft Logs: NONE.** No request or probe, and no new evidence.
- **Public contract: declared EXPECTED, actual NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed: no `specId`
  value is added, because nothing passes. The public meaning of a request for any of the three is unchanged: SPEC_NOT_SUPPORTED, with
  one retrieval for preparation alone.
- **No production code changed.** Docs, the queue, and two test files.
- **Queue bookkeeping:** ONB-A2 is recorded MERGED (PR #57, 0955a075…). Every other merged tranche the supervisor listed was compared
  by script and was already recorded with the same PR and SHA. ONB-A2P is set to PR_OPEN.

## The thing to check first: is "not promoted" right, and is it not an owner stop?

Onboarding rule 4 says a specialization that cannot pass stays INTERNAL_ONLY, recorded in the inventory, with its evidence gap on
ONB-EV. Rule 6 says no gate moves for a spec's sake. HEAL-B3P is the precedent. ONB-EV and ONB-S3, the decisions that could change
this, are already queued as the owner's, so I did not stop.

None of the three can pass, for two independent reasons:

1. **No decision resolves, on any input.** OBSERVATION needs a real MATCH over several tokens and DISCRIMINATION a real REJECTED or a
   control flipping a real MATCH. ONB-A2 pinned over synthetic whole builds that Subtlety refuses at `default[5] stealth`, Fury's root
   scan stops at the `active_enemies` dispatch and Protection's at `default[15] ignore_pain`.
2. **No retained capture can supply a subject.** I repeated ONB-A2's census and added a second by a different method, because HEAL-B4P
   showed an earlier census had missed retained captures:
   - **By identity** (`friendlySpecs` aligned to `friendlyPlayers`, over 13 retained contexts): only M13-A actor 17 has events of any of
     them.
   - **By signature ability**, over 17,369 retained and committed files, 286 of them holding raw events, skipping autopilot transcripts
     and derived digests: no event of Bloodthirst, Raging Blow, Rampage, Recklessness, Shield Slam, Revenge, Shield Block, Shield Wall or
     Demoralizing Shout. Subtlety's ids appear only in the M13-A capture and its copies. Mortal Strike and Mutilate are positive
     controls and were found. Ids named here were checked against the pinned GCD data; two I first listed (Enrage, Last Stand) are not
     in it, so the document does not name them.
   - **M13-A actor 17:** 150 casts over a 151 s wipe. In its aura file, 34 aura events with the actor as target and none as source. No
     combatant info, no resources. So its talents never resolve.

A limit worth knowing: the signature scan is keyed on ids the pinned data names, so a wire-only replacement id would not hit it. The
identity census is what covers that: it finds no Fury or Protection Warrior actor in any capture that holds events.

## Decisions to check

1. **Two small pins added**, rather than HEAL-B3P's "no test changed", because both were real gaps:
   - `tests/contracts/m11-promotion-evidence-gate.test.ts`: the gate search over the three finds no qualifying assertion and
     `evidenceReady` false. It makes the reason measured rather than asserted, and it will fail if qualifying evidence arrives, which
     is the prompt for a new public entry.
   - `tests/unit/analysis-composition-refusals.test.ts`: Warrior/Fury and Warrior/Protection beside Rogue/Subtlety:
     SPEC_NOT_SUPPORTED, one retrieval, no dispatch. Neither Warrior was in this list.
2. **`IDENTITY_RETAINED_ONLY` stays**, and it stays refused on a PUBLIC module. Nothing was committed to satisfy it.
3. **Follow-up recorded:** ONB-EV alone does not unlock any of them, and no later public entry is queued. I did not add one: it has
   nothing to do until ONB-EV, and ONB-S3 for the Warriors, are decided. ONB-Z depends on ONB-A2P and its completion rule still requires
   every row terminal, so these three are not silently lost (agent/spec-onboarding-inventory.md "Completion rule").

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus` and `npm run test:evidence`: both gates PASSED (207 cases, 802 assertions; evidence 30 cases, 76 assertions), each
  matching its committed report.
- Focused, serial (`analysis-composition-refusals`, `m11-promotion-evidence-gate`, `m10d-public-registration`, `m10a-spec-partition`,
  `spec-identity`, `onb-a2-cohort-a-followers`): 184 tests, 0 failed.
- Full suite, parallel, 30 s timeout: 13,800 tests, 13,799 passed, 1 failed. The failure is `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, a
  timeout at 38 s under load, in code this change does not touch. That file then passed serially with a 120 s timeout: 37 tests, 0 failed.
- Not run: the two new pins were not mutated. No real-evidence run exists, because there is no capture to replay.

## What is not here

No promotion, no gate change, no evidence, no public change, no production code, no change to ONB-EV's or ONB-S3's decision text
(both already name these specializations).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

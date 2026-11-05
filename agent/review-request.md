# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-D3P: Arcane Mage and Frost Mage (public). Branch `autopilot/onb-d3p`, from main at 629665d. **Outcome: not promoted. Both stay INTERNAL_ONLY, because neither can pass the rotational promotion gates.**

- **Warcraft Logs: NONE.** No request or probe. The census and replays read retained files offline, the replays through a fake transport.
- **Public contract: declared EXPECTED; actual change NONE, because nothing passes.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Mage/Arcane or Mage/Frost request is SPEC_NOT_SUPPORTED, as before, with preparation still run and partial coverage disclosed.
- **Production code: NONE.** The only non-doc changes are two new rows in a refusal test and two test comments.
- **Queue bookkeeping:** ONB-D3 is recorded MERGED (PR #73, 629665d9…), and ONB-D3P is set to PR_OPEN. The supervisor's whole merged list was compared by script (see Validation).

## The thing to check first: is "not promoted" the right call, rather than an owner stop?

Onboarding rule 4: a specialization that cannot pass stays INTERNAL_ONLY, with its reason in the inventory. ONB-B1P, ONB-B3P, ONB-C1P, ONB-D1P and ONB-D2P decided the same shape, so this tranche asks the owner nothing new. ONB-S3 and ONB-EV are already queued as the owner's, and neither would resolve a decision of these two by itself.

Please check that the gates are not weakened. They are not touched. OBSERVATION and DISCRIMINATION both start from a real resolved decision, and neither specialization has one.

## The evidence

**Replay** (`.probe/onbd3p/m/`), at this base, through production ingestion and each facade:

| Subject | Spec, hero tree | Retained span | Result | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| b1Pm fight 48 actor 121 | Arcane, Sunfury | whole fight | ANALYZED | 246 | 0 | 0 | 246 | 26 |
| b1Pm fight 48 actor 7 | Arcane, Sunfury | whole fight | ANALYZED | 238 | 0 | 0 | 238 | 33 |
| gtKb fight 22 actor 1 | Arcane, Sunfury | whole fight | ANALYZED | 204 | 0 | 0 | 204 | 21 |
| A7R6 fight 7 actor 3 | Arcane, Sunfury | first 165 s | ANALYZED | 116 | 0 | 0 | 116 | 13 |
| rXAf fight 13 actor 3 | Arcane, Sunfury | first 165 s | ANALYZED | 117 | 0 | 0 | 117 | 13 |
| rXAf fight 13 actor 4 | Arcane, Sunfury | first 165 s | ANALYZED | 118 | 0 | 0 | 118 | 11 |
| Gw2k fight 1 actor 11 (M13-A) | Arcane, not resolved | filtered casts | `PROFILE_NOT_RESOLVED` | none | none | none | none | none |
| Gw2k fight 1 actor 6 (M13-A) | Frost, not resolved | filtered casts | `PROFILE_NOT_RESOLVED` | none | none | none | none | none |

Arcane stops: root scan at `cooldowns[4] evocation`, all 1,039; engine refusal at `default[0] counterspell` on 875 anchored decisions. Frost has no real decision, so its recorded stops stay synthetic.

**Against ONB-D3's saved output:** a field-by-field comparison reports 0 differences across the six Arcane subjects and both vocabularies. ONB-D3 said the M13-A actors "would refuse" without running them; both are now measured.

**Census** (`.probe/onbd3p/census.cjs`, `census-read.txt`, `actors.cjs`): 5,700 JSON files over 500 bytes under `.probe/` and `tests/`, skipping tool output and worktree copies; 5,699 parsed. Positive control, Mortal Strike: 559 casts. The aggregated output is byte-identical to ONB-D3's. Beyond the sources above, the hits are Mirror Image pets casting Frostbolt 59638 (A7R6 42, gtKb 41, rXAf 130, b1Pm 49, 126 casts), resolved against each report's master data, and one Blizzard by gBMC fight 33 actor 142.

Limits: it does not read JSON files of 500 bytes or less, or log and text output. It matches named ability ids, so a file holding only other abilities would not appear.

## Decisions a reviewer might reject

1. **Actor 142 is still not a Frost subject.** `.probe/m11g2/diagnose.json` holds its one cast and its combatant info (specID 64), so ONB-D3's "no retained subject with combatant info" invites a challenge. The file is eleven aliased filter-syntax probes, each capped at 20 events, so nothing in it is a retained span of the fight and no page chain can be replayed. I did not replay it, and one cast could not meet OBSERVATION's several tokens. The new architecture section states this; ONB-D3's own text stays as written, since "one cast in a two-second diagnosis page" is not false.
2. **Frost stays on ONB-EV; Arcane is not added.** A Frost subject must come first, though it alone resolves nothing, since `interrupt_if` stops the scan on both hero trees' synthetic builds. More Arcane subjects would resolve nothing either, since the list stops before any input a subject supplies. Arcane would still need more evidence to promote (all Sunfury, three prefix subjects), which is recorded rather than raised as a gap today.
3. **The refusal rows are new.** ONB-D3 added the gate-search pins but no row in `analysis-composition-refusals`, so this tranche adds both. `Mage` is what both registrations' `wclClassName` names.

## What changed

- Docs: `agent/architecture.md` "ONB-D3P", `agent/follow-ups.md` "After ONB-D3", `agent/testing.md`, `agent/spec-onboarding-inventory.md` (the note and two rows; counts unchanged), `agent/autopilot-queue.md`, and both specs' `README.md`.
- Tests: `tests/unit/analysis-composition-refusals.test.ts` (two new rows), `tests/contracts/m11-promotion-evidence-gate.test.ts` (two comments only).

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED. `npm run test:evidence`: PASSED. Both ran in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout: 16,943 tests, 16,942 passed, 1 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, on the recorded list of parallel-load failures, whose code this change does not touch. It passes rerun without the full suite beside it, so I infer load. The whole suite has not run clean in one pass.
- `m9b-corpus-harness`, `analysis-composition-refusals`, `m11-promotion-evidence-gate`, the `onb-d3` suites, `m10d-public-registration` and `m10a-spec-partition` rerun together: 273 passed (273).
- Queue compared by script with the supervisor's whole merged list: 55 compared, 1 written (ONB-D3), 0 missing, and a second run wrote nothing.
- No network to Warcraft Logs.

## What is not here

No promotion, no gate change, no public change, no new evidence, no production code, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-X2P: Devastation Evoker (public). Branch `autopilot/onb-x2p`, from main at ff71a4f. **Outcome: not promoted. It stays INTERNAL_ONLY, because it cannot pass the rotational gates: 440 decisions on three retained subjects, 0 MATCH, 0 REJECTED, all UNKNOWN.**

- **Warcraft Logs: NONE.** No request or probe. The census and replay read retained files offline, the replay through a fake transport.
- **Public contract: declared EXPECTED, actual change NONE**, because nothing passes. Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Evoker/Devastation request is SPEC_NOT_SUPPORTED, as before, with preparation and partial coverage.
- **Production code: no change.** The only file under `src/` is the specialization's README. The two test edits are comments; no assertion changed.
- **Queue bookkeeping:** ONB-X2 is recorded MERGED (PR #79, ff71a4f1…), and ONB-X2P is set to PR_OPEN. The supervisor's whole merged list was compared by script (see Validation).

## The things to check first

**1. Is "not promoted" right, and is it not an owner stop?** Onboarding rule 4 says a public entry that cannot pass stays INTERNAL_ONLY. OBSERVATION needs a real MATCH and DISCRIMINATION a real REJECTED or a control flipping a real MATCH, and no decision resolves. The precedents are ONB-X1P and the other public entries before it. The gates are not touched.

**2. Is the census sound?** ONB-X2's clone had an empty pinned-file list, so that route silently did nothing there (`.probe/onbx2/census.cjs`, `PINNED_IDS []`). This one has it filled, and the output shows 18 pinned ids. The pinned route adds only Hover, Emerald Blossom and Verdant Embrace, which every Evoker shares.

## The evidence

**Replay** (`.probe/onbx2p/m/`), through production ingestion and the facade, at this base. `out.json` is byte-identical to ONB-X2's (sha256 `cc89319b…`).

| Subject | Hero tree | Span | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| A7R6 fight 7 actor 11 | Scalecommander | first 165 s of 424.5 s | 89 | 0 | 0 | 89 | 22 |
| b1Pm fight 48 actor 16 | Scalecommander | whole, 345.2 s | 191 | 0 | 0 | 191 | 38 |
| gtKb fight 22 actor 33 | Scalecommander | whole, 284.8 s | 160 | 0 | 0 | 160 | 24 |

351 are anchored (280 channel start, 71 instant completion), and on each the engine refuses at `default[6] quell`. 89 have no anchor (88 Living Flame ambiguous, 1 cast time unknown). All 440 root scans stop at `sc[0] deep_breath`, on its `cancel_if`.

**Census** (`.probe/onbx2p/census.cjs`, `census.txt`, `census-read.txt`, `actors.cjs`): 5,715 JSON files, 5,714 parsed (the unparsed one is `.probe/m11d2c/bad.json`). Controls: Mortal Strike, 559 casts, and 31 specIDs. Combatant-info specID 1467 finds exactly the three subjects. Signature-ability hits, beyond those subjects: their own Dracthyr Commando pets (1236943, Deep Breath by name), and one Disintegrate of A7R6 actor 11 in a 14-event committed corpus artifact. Other Evokers appear only on abilities every Evoker shares; each was resolved to Preservation or Augmentation by its context or combatant info. Contexts for yzH9 fight 32, 24XJ fight 23 and qJ1p fight 6 name a Devastation player with no retained cast.

Limits: it does not read JSON files of 500 bytes or less, or log and text output. Cast routes match named and pinned ids only; the combatant-info route does not depend on them.

## Decisions a reviewer might reject

1. **Not added to ONB-EV.** Evidence is not the first gap: three subjects stop at the same two lines.
2. **No code for the first stops.** The Quell and `cancel_if` readings are recorded in "After ONB-X2" as inputs to a later entry, not attempted here: the `cancel_if` reading is a shared decision, and this entry is a promotion decision.
3. **No new public entry queued**, matching ONB-X1P. The architecture section says what one must do.

## What changed

- Docs: `agent/architecture.md` "ONB-X2P", `agent/follow-ups.md` "After ONB-X2", `agent/spec-onboarding-inventory.md`, `agent/testing.md`, `agent/autopilot-queue.md`, `agent/review-request.md`, `src/specs/evoker/devastation/README.md`.
- Comments: `tests/contracts/m11-promotion-evidence-gate.test.ts`, `tests/unit/analysis-composition-refusals.test.ts`.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED. `npm run test:evidence`: PASSED. Both ran in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout: 18,136 tests, 18,134 passed, 2 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN and `runner-service-queue` W (a job directory left behind). Both are on the recorded list of parallel-load failures, and this change touches neither one's code. Both pass rerun without the full suite beside them, so I infer load. The whole suite has not run clean in one pass.
- `m9b-corpus-harness`, `runner-service-queue`, `analysis-composition-refusals`, `m11-promotion-evidence-gate`, the `onb-x2` suite, `m10d-public-registration` and `m10a-spec-partition` rerun together: 265 passed (265), 7 files.
- One architecture sentence was reworded after those runs (prose only); `prettier --check` and `git diff --check` pass after it.
- Queue compared by script with the supervisor's whole merged list: 60 compared, 1 written (ONB-X2), 0 missing, and a second run wrote nothing.
- No network to Warcraft Logs.

## What is not here

No promotion, no public change, no new evidence, no production change, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

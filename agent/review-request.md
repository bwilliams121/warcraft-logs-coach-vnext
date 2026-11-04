# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-C2P: Outlaw Rogue (public). Branch `autopilot/onb-c2p`, from main at d41df35. **Outcome: not promoted. It stays INTERNAL_ONLY, because it cannot pass the rotational promotion gates.**

- **Warcraft Logs: NONE.** No request or probe. The census reads retained files offline.
- **Public contract: declared EXPECTED; actual change NONE, because nothing passes.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Rogue/Outlaw request is SPEC_NOT_SUPPORTED, as before, with preparation still run and partial coverage disclosed.
- **Production code: NONE.** The only other non-doc changes are two test comments, and no assertion moved.
- **Queue bookkeeping:** ONB-C2 is recorded MERGED (PR #67, d41df35b…), and ONB-C2P is set to PR_OPEN. The supervisor's whole merged list was compared by script (see Validation).

## The thing to check first: is "not promoted" the right call, rather than an owner stop?

Onboarding rule 4: a specialization that cannot pass stays INTERNAL_ONLY, with its reason in the inventory and its evidence gap on ONB-EV. Rule 7: missing evidence is recorded, never fetched. ONB-A2P decided the same shape for Subtlety and two Warriors. ONB-EV is already queued as the owner's decision and already names Outlaw, so this tranche asks nothing new.

Please check that the gates are not weakened. They are not touched. OBSERVATION and DISCRIMINATION both start from a real resolved decision, and Outlaw has none.

## The evidence

Measured offline at this base (`.probe/onbc2p/census.cjs`, `census.txt`):

- 5,680 JSON files over 500 bytes under `.probe/` and `tests/`, skipping tool output and worktree copies; 5,679 parsed.
- Events of **any type and any source** of Sinister Strike, Pistol Shot, Dispatch, Between the Eyes, Roll the Bones, Blade Flurry, Adrenaline Rush, Blade Rush, Keep It Rolling and Killing Spree: **none**. ONB-C2's census read casts only, so this is wider.
- Positive control, Mortal Strike: 985 events, 559 of them casts, the same cast count as ONB-C2's census.
- All ten ids appear in the pinned `rogue-outlaw-gcd-semantics.json` (`.probe/onbc2p/ids.cjs`).
- Contexts naming an Outlaw: g34mvXTKLMJ2Nfwr fights 1, 6 and 7, actor 17, as ONB-C2 found. Only `.probe/m13a/discovery.json` and `candidates.json` name that report, and neither holds an event.

Limits: it does not read JSON files of 500 bytes or less, or log and text output. It looks for signature abilities, so a capture holding only other Outlaw abilities would not appear.

There is no replay, because there is nothing to replay. A capture alone would not resolve anything either: ONB-C2 pinned on synthetic builds that every decision stops at `default[0] stealth`.

## Decisions a reviewer might reject

1. **"ONB-S3 is necessary, not first" for this list.** The inventory row and architecture say its list also needs ONB-S3 behind Stealth and Kick. The `cds` list reads the enemy count (agent/follow-ups.md "After ONB-C2").
2. **No new test.** The refusal row and the gate-search pin already exist from before this tranche, unlike ONB-C1P, which had to add a pin. This tranche changes only their comments.
3. **The ONB-EV entry is not edited.** ONB-C2 already confirmed Outlaw there, with the same context. The re-measurement is recorded in follow-ups and architecture.

## What changed

- Docs: `agent/architecture.md` "ONB-C2P", `agent/follow-ups.md` "After ONB-C2", `agent/testing.md`, `agent/spec-onboarding-inventory.md` (the note and the row; counts unchanged), `agent/autopilot-queue.md`, `src/specs/rogue/outlaw/README.md`.
- Comments only: `tests/unit/analysis-composition-refusals.test.ts`, `tests/contracts/m11-promotion-evidence-gate.test.ts`.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED. `npm run test:evidence`: PASSED (32 cases, 80 assertions). Both ran in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout: 15,301 tests, 15,300 passed, 1 failed. The failure is `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, on the recorded list of parallel-load failures. This change touches none of its code. Rerun without the full suite beside it, it passes, so I infer load; I did not prove it. The whole suite has not run clean in one pass.
- `m9b-corpus-harness`, `analysis-composition-refusals`, `m11-promotion-evidence-gate`, `onb-c2-outlaw-rogue`, `m10d-public-registration` and `m10a-spec-partition` rerun together: 168 passed (168).
- Queue compared by script with the supervisor's whole merged list, including ONB-C1P and ONB-C2: 49 compared, 0 mismatched.
- No network to Warcraft Logs.

## What is not here

No promotion, no gate change, no public change, no new evidence, no production code, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

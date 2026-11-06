# Review request

Rolling file: overwritten for each review cycle.

## Change

Record the owner's ONB-Z decision (2026-11-06) and revise the roadmap. Working tree on `main` at ec05be3, uncommitted.

- Documentation and queue only: no source, test, analyzer, runtime-data or public-contract change.
- **Warcraft Logs: no request was made.** This change writes the owner's ONB-EV grant onto that entry; ONB-EV itself runs later, after POLB-C and ONB-EV-PLAN.
- The four untracked local paths (`.claude/` and the three `scripts/probe/wcl-*.probe.ts` files) are the standing CLAUDE.md exclusions and are not part of this change.

## The decision

Onboarding does not close at 12 of 40 PUBLIC, and ONB-Z does not merge now. `INTERNAL_ONLY` after a failed promotion is not terminal, and the 28 are not mass-reclassified. Restoration Druid's public entry, ONB-EV and Policy B are approved. A full blocker census precedes retries. Gates are unchanged. ONB-Z becomes the final roster-closure gate.

## Files

- `agent/architecture.md`: new section "Owner decision (2026-11-06): remediation before roster closure"; the Policy B bullet now says scheduled.
- `agent/follow-ups.md`: a dated section saying which older "deferred" and "not queued" text is superseded. Older text stays as the record.
- `agent/spec-onboarding-inventory.md`: a remediation section, Restoration Druid's owning entry, and the note. Counts unchanged (12 PUBLIC, 28 INTERNAL_ONLY).
- `agent/autopilot-queue.md`:
  - a "Specialization remediation" section with nine rules;
  - new entries HEAL-B1P2, POLB-A, POLB-B, POLB-C, ONB-EV-PLAN, REM-CENSUS and REM-GATE, all `wcl: NONE`;
  - ONB-EV rewritten as approved and depending on ONB-EV-PLAN, with its history kept;
  - ONB-Z rewritten as the closure gate, also depending on HEAL-B1P2, POLB-C, ONB-EV, REM-CENSUS and REM-GATE;
  - bookkeeping: ONB-T2P recorded MERGED (#93, ec05be3).

## Please check

1. **The ONB-EV grant.** The owner set a hard cap of 60 requests in total, far below the 600 recommended. The `wcl:` line, the entry and `agent/architecture.md` "Owner grant (2026-11-06): ONB-EV" should all say the same thing: everything counts toward the cap, including OAuth; no rankings or comparison data; no replacement fight or alternate subject because of a result; stop before exceeding 60; no archive increase; no promotion. ONB-EV-PLAN freezes the order and reports the worst case against the cap, and it may not drop or reorder specializations to fit.
2. **POLB-A stops for the owner if no source qualifies.** The decision approves Policy B and excludes guides, remembered mechanics, expected SimulationCraft behavior and top-log behavior, but names no source, and N2 keeps WCL enemy classification post-hoc only.
3. **Tranches queued by a tranche.** REM-CENSUS adds `REM-*` entries because their content depends on its measurements. REM-GATE fails closed if a pass is missing, and ONB-Z depends on it.
4. **Order.** The decision lists Restoration Druid, Policy B, ONB-EV, census, then waves. Dependencies enforce that order, since ONB-EV sits earlier in the file. POLB-A depends on HEAL-B1P2, so explicit `-TrancheId` selection cannot put it first either.

## Validation

- The supervisor's own `ConvertFrom-QueueText` reads 87 entries, with unique IDs and known dependencies.
- Simulated selection after main: HEAL-B1P2, POLB-A, POLB-B, POLB-C, ONB-EV-PLAN, ONB-EV, REM-CENSUS, REM-GATE, ONB-Z. The simulation only orders entries: REM-CENSUS adds more before REM-GATE, and REM-GATE can add another wave.
- M15-E and M11-G4-5-R stay BLOCKED.
- `prettier --check` and `git diff --check` pass. No test suite was run: nothing executable changed.

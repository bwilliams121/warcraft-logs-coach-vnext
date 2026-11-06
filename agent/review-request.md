# Review request

Rolling file: overwritten for each review cycle.

## Change

Record the owner's Policy B source decision (2026-11-06), which answers POLB-A's stop, and update the queue. Working tree on `main` at 6351a7c, uncommitted.

- Documentation and queue only: no source, test, analyzer, runtime-data or public-contract change.
- **Warcraft Logs: no request was made, and this writes no new grant.**
- The four untracked local paths (`.claude/` and the three `scripts/probe/wcl-*.probe.ts` files) are the standing CLAUDE.md exclusions and are not part of this change.

## The decision

Option C: a neutral, deterministic, separately retained Warcraft Logs census supplies empirical encounter-state bounds only. Positive observations may give lower bounds. An upper bound or closed set needs an explicit completeness argument; an observed maximum is never one. Present, targetable and in range stay separate. Conflicts widen a bound. Options A, B and D are rejected, and E stays the fallback.

## Files

- `agent/architecture.md`: new section "Owner decision (2026-11-06): Policy B source"; the Policy B bullet updated.
- `agent/follow-ups.md`, `agent/spec-onboarding-inventory.md`: pointers updated. Counts unchanged.
- `agent/autopilot-queue.md`:
  - **POLB-A** rewritten: schema, separation, the sampling policy, a per-fact completeness analysis, and an acquisition proposal for the owner. Offline.
  - **New POLB-CENSUS:** status OWNER_DECISION_REQUIRED, `wcl: OWNER_DECISION_REQUIRED`, depending on POLB-A.
  - **POLB-B** now depends on POLB-CENSUS; POLB-B and POLB-C rescoped to the census.
  - **ONB-EV** gains a line that its grant does not cover the census.
  - Bookkeeping: HEAL-B1P2 recorded MERGED (#95).

## Please check

1. **The literal `wcl: OWNER_DECISION_REQUIRED`.** The owner asked for it. It is not a grant, and the supervisor throws on it (`run-project.ps1`, "malformed WCL grant") if the entry is ever selected. Its status keeps it from being selected, and if someone flips the status without writing a grant, it fails closed. Is that acceptable?
2. **Contradiction handling.** The decision says conflicts widen a bound; O3 says a contradiction with observed evidence is UNKNOWN plus a drift diagnostic, never REJECTED. I recorded the first as within the census and the second as against an analyzed pull. Is that the right reconciliation?
3. **O2 and N2.** O2 forbids a pull's own future events as authority, and N2 keeps WCL enemy classification post-hoc only. The census uses other pulls' events, under a new owner ruling. POLB-A must say how a window maps onto an analyzed pull, with UNKNOWN where it cannot.

## Validation

- The supervisor's own `ConvertFrom-QueueText` reads 88 entries, with unique IDs and known dependencies.
- Simulated selection after main: POLB-A, then it stops at POLB-CENSUS's owner decision. POLB-B, POLB-C, ONB-EV-PLAN, ONB-EV, REM-CENSUS, REM-GATE and ONB-Z wait behind it. M15-E and M11-G4-5-R stay BLOCKED.
- `prettier --check` and `git diff --check` pass. No test suite was run: nothing executable changed.

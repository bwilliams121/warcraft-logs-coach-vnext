# Review request

Rolling file: overwritten for each review cycle.

## Change

Record the owner's 2026-11-07 decisions on Warcraft Logs audit hardening, POLB-CENSUS and ONB-EV completion, and queue AUD-WCL-1. Working tree on `main` at 50fb71e, uncommitted.

- Documentation and queue only: no source, test, analyzer, runtime-data or public-contract change. AUD-WCL-1 implements the supervisor fix later.
- **Warcraft Logs: no request was made.** The ONB-EV grant line changes to record the owner's 119 cap, the retry decision and revision 2. AUD-WCL-1 is `wcl: NONE`.
- The four untracked local paths (`.claude/` and the three `scripts/probe/wcl-*.probe.ts` files) are the standing CLAUDE.md exclusions and are not part of this change.

## The decision

- **AUD-WCL-1, `wcl: NONE`:** detect execution of code or configuration rooted under `.probe/` through common launchers; keep inspection distinct from execution; self-tests; read-only historical backfill with four classifications; the empty-audit rule; and a pre-merge check for uncommitted tracked edits. It runs after ONB-EV's current stop and before any later ordinary tranche.
- **POLB-CENSUS: DECLINED.** No grant and no archive exception. The SimC fallback is the active path.
- **ONB-EV completion: APPROVED.**
  - The total cap rises from 60 to 119, cumulative, only to complete the twelve.
  - Revision 2 is accepted.
  - The archive line is unchanged, and REM-CENSUS proposes byte-pinned exceptions only for evidence that must be committed. Evidence that establishes a blocker is kept.
  - AUD-WCL-1 must merge and the supervisor restart first.
  - PR #103 is reconciled semantically with main.

## Files

- `agent/architecture.md`: new section "Owner decision (2026-11-07): WCL audit hardening and POLB-CENSUS".
- `agent/autopilot.md`: an interim warning that an empty audit is not yet proof of no requests.
- `agent/follow-ups.md`, `agent/spec-onboarding-inventory.md`: pointers.
- `agent/autopilot-queue.md`:
  - new AUD-WCL-1 (READY, no dependencies), placed before ONB-EV;
  - ONB-EV: PR_OPEN on PR #103, now depending on AUD-WCL-1. The grant is raised to 119 and records the retry decision and the accepted revision 2. Main lacked the branch's retry wording, so the grant line restates it. The entry holds the decision, the reconciliation rules and the stop conditions;
  - AUD-WCL-1 states the restart procedure, and REM-CENSUS the archive procedure;
  - REM-CENSUS depends on AUD-WCL-1;
  - POLB-CENSUS, POLB-B and POLB-C are BLOCKED, and the census is recorded as declined;
  - ONB-Z no longer depends on POLB-C, and its Policy B condition is reworded;
  - bookkeeping: ONB-EV-PLAN recorded MERGED (#102).

## Please check

1. **The restart.** The scheduled task runs with `-MaxTranches 0`, so the process that merges AUD-WCL-1 still runs the old detector and would continue into ONB-EV. I recorded that the owner runs AUD-WCL-1 alone (`-TrancheId AUD-WCL-1 -MaxTranches 1`) and then restarts the task. ONB-EV also stops before any request if its supervisor started before AUD-WCL-1 merged. Is that guard sufficient?
2. **Ordering.** Making ONB-EV and REM-CENSUS depend on AUD-WCL-1 enforces "before any subsequent ordinary tranche" for explicit `-TrancheId` selection too. It also means the campaign's remaining requests run under the fixed detector.
3. **Self-update.** AUD-WCL-1 changes `scripts/autopilot/`, which the running supervisor has already loaded. Its scope makes the supervisor exit after merging such a change.

## Validation

- The supervisor's own `ConvertFrom-QueueText` reads 92 entries, with unique IDs and known dependencies.
- Simulated selection after main: AUD-WCL-1, then ONB-EV (PR #103), then REM-CENSUS and REM-GATE, with ONB-Z after the waves REM-CENSUS adds. No entry is OWNER_DECISION_REQUIRED. POLB-B, POLB-C, POLB-CENSUS, M15-E and M11-G4-5-R are BLOCKED.
- `prettier --check` and `git diff --check` pass. No test suite was run: nothing executable changed.

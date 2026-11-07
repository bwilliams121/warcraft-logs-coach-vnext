# Review request

Rolling file: overwritten for each review cycle.

## Change

Record the owner's SimC profile fallback decision (2026-11-06) and update the queue. Working tree on `main` at 608bef7, uncommitted.

- Documentation and queue only: no source, test, analyzer, runtime-data or public-contract change.
- **Warcraft Logs: no request was made, and no grant changed.**
- The four untracked local paths (`.claude/` and the three `scripts/probe/wcl-*.probe.ts` files) are the standing CLAUDE.md exclusions and are not part of this change.

## The decision

The pinned SimC profile becomes fallback authority for encounter-state facts: observed evidence, then curated authority, then the pinned profile, then UNKNOWN. It carries explicit `SIMC_PROFILE_FALLBACK` provenance and public disclosure, and observed evidence always outranks it. A real logged action evaluated against it may count as promotion evidence, under unchanged gates. The exit criterion is 100% of the roster PUBLIC.

## Files

- `agent/architecture.md`: the decision, what it supersedes, and recording notes.
- `CLAUDE.md`: a dated owner-change note under "Multi-Target Support", because its fail-closed rule would otherwise read as forbidding this.
- `agent/follow-ups.md`, `agent/spec-onboarding-inventory.md`: pointers and the exit criterion. Counts unchanged.
- `agent/autopilot-queue.md`:
  - new SIMC-FB-A (shared, internal), SIMC-FB-B (public disclosure, `publicContract: EXPECTED`) and SIMC-FB-R (replay), all `wcl: NONE`;
  - ONB-EV-PLAN and REM-CENSUS now depend on SIMC-FB-R rather than POLB-C, so they no longer wait on the census decision;
  - ONB-Z also depends on SIMC-FB-R, keeps POLB-C, and passes only at 100% PUBLIC;
  - remediation rules 10 and 11 added, and rule 3 amended;
  - POLB-CENSUS's decision text updated, still the owner's;
  - ONB-EV-PLAN: a candidate must have a provable build, set before any outcome is known. The grant text is unchanged;
  - bookkeeping: POLB-A recorded MERGED (#97).

## Please check

1. **Actionability.** I recorded that the fallback supplies APL inputs and does not make a decision ACTIONABLE, under CLAUDE.md "ACTIONABLE Requires Positive Evidence". The decision lists "target availability represented by that profile" as a permitted fact and also says it weakens no evidence rule. Is that the right reading?
2. **The exit criterion.** The earlier decision accepted a lower final count for a demonstrably unsolvable specialization. This one states 100% and calls it unchanged. I recorded it as replacing the earlier allowance, and flag it for the owner. Rule 11 stops for the owner rather than spinning.
3. **The ONB-EV-PLAN build rule.** It narrows "qualifying" before any request. Does it stay within the grant's "first qualifying public raid fight under the recorded fixed discovery rule"?
4. **Moved dependencies.** Is taking POLB-C out of ONB-EV-PLAN and REM-CENSUS consistent with the owner's "may interleave independent work"?
5. **Tier 3 REJECTED.** A decision before any add is touched reads the profile's 1, so a REJECTED can arise where the real fight had more enemies. The decision accepts this with disclosure, and SIMC-FB-B carries it.

## Validation

- The supervisor's own `ConvertFrom-QueueText` reads 91 entries, with unique IDs and known dependencies.
- Simulated selection after main: SIMC-FB-A, SIMC-FB-B, SIMC-FB-R, ONB-EV-PLAN, ONB-EV, REM-CENSUS, REM-GATE. It then stops at POLB-CENSUS's owner decision, with POLB-B, POLB-C and ONB-Z behind it. REM-CENSUS adds more entries before REM-GATE. M15-E and M11-G4-5-R stay BLOCKED.
- `prettier --check` and `git diff --check` pass. No test suite was run: nothing executable changed.

# Review request

Rolling file: overwritten for each review cycle.

## Tranche

AUTOPILOT-DRYRUN: Autopilot dry run (documentation only). Branch
`autopilot/autopilot-dryrun`, from `origin/autopilot-supervisor` at ef653b9.
The PR targets `autopilot-supervisor`, not main.

This is the first end-to-end test of the project autopilot supervisor
(`scripts/autopilot/run-project.ps1`). The supervisor launched this tranche
non-interactively from a temporary, gitignored one-entry queue in
`.probe/autopilot/`. It is not a roadmap tranche and is never to be merged:
the supervisor runs it with `-NoMerge`, and the base branch is itself
unmerged.

## Change

- New `agent/autopilot-dryrun.md`: a level-1 heading "Autopilot dry run"
  and one paragraph stating that the supervisor launched this tranche
  non-interactively, that it is a harmless documentation-only test, and that
  it is never to be merged.
- This `agent/review-request.md`, rewritten for the dry run.

Nothing else changes: no source, test, corpus, evidence or contract file.
`agent/autopilot-queue.md` is deliberately untouched.

## Declarations

- Warcraft Logs network activity: NONE. No probe and no
  `vitest.probe.config.ts` run.
- Public contract change: NONE (`src/contracts/`, `src/api/`, `src/mcp/`
  untouched).

## Validation

- `npx prettier --check agent/autopilot-dryrun.md agent/review-request.md`
- `git diff --check`

The test suite was not run: the change is documentation only, and the queue
entry names the formatting check as sufficient. CI runs the full suite on the
PR.

## Requested verdict

APPROVED if the change is documentation only and matches the queue scope;
CHANGES_REQUIRED otherwise.

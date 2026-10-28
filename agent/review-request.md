# Review request

Rolling file: overwritten for each review cycle.

## Tranche

Workflow: make the autonomous development and review workflow permanent
(CLAUDE.md).

## Intended change

Add standing project behavior to the root `CLAUDE.md` so the owner can say
"Start G4." or "Continue." without repeating Git, PR, CI, OpenAI-review or
handoff instructions. Instructions only: no product code, architecture rule,
test or data changes. No second instruction file was created.

## Files / surfaces changed

`CLAUDE.md` gains one new top-level section, "Autonomous Tranche Workflow"
(185 added lines, nothing removed). It sits after "Implementation Discipline"
and before "Reporting", and contains:

- the 18-step tranche workflow: state discovery, feature branch, implement,
  validate, `agent/review-request.md`, the local OpenAI review loop, git
  hygiene, `gh pr create`/`edit`, `gh pr checks --watch`, CI-failure loop,
  GitHub review loop, completion criteria and the completion message;
- Owner Interruption Policy;
- Git Safety: never push or force-push main, merge, bypass checks or deploy;
- Local File Exclusions (`.claude/` and three `scripts/probe/wcl-*.probe.ts`);
- OpenAI Review: read-only, never skipped, disputes through `-DisputeFile`,
  APPROVED never licenses weakening a rule.

## Decisions made

- **Stacked branches.** The owner's step 11 specifies `--base main`. A narrow
  exception is added: when a tranche needs files that exist only on an
  unmerged feature branch, the branch is stacked on it and the PR targets that
  parent branch.
  - This tranche is itself stacked on `m11-simulation-model-registry` (PR #1),
    because `scripts/review/openai-review.ps1` and
    `agent/openai-review-policy.md` exist only there.
  - GitHub retargets the PR to main when the parent merges.
- **Line endings.** The working-tree `CLAUDE.md` had CRLF line endings while
  the index has LF (`core.autocrlf=false`). The file was normalized to LF so
  the diff contains only the added section.

## Validation

- **Fresh-session load.** A fresh, non-interactive Claude Code session (Zed's
  bundled `claude.exe` 2.1.310, `-p`, write tools disallowed) was asked to
  answer only from loaded instructions. It reproduced:
  - the workflow;
  - the exact completion sentence;
  - the four excluded paths;
  - the forbidden git actions;
  - the review command and `-DisputeFile`.
- **gh.** `gh auth status`: logged in as `bwilliams121`, scopes `repo` and
  `workflow`.
- **Repository and PR.** `gh repo view`: `bwilliams121/warcraft-logs-coach-vnext`,
  PRIVATE. Open PR #1 (`m11-simulation-model-registry`): corpus check pass,
  verify pending at the time of the check. No reviews.
- **Diff checks.** `git diff --check` is clean; the diff is 185 insertions,
  0 deletions.
- **Tests.** No tests were run, because no code changed. Prettier ignores
  `*.md` by repository policy.

## External / network activity

- GitHub (gh: repo, PR, checks).
- The local Claude Code session called the Anthropic API.
- No Warcraft Logs requests.

## Known limitations

- `gh` is at `C:\Program Files\GitHub CLI\gh.exe`, on the PowerShell PATH but
  not the Git Bash PATH.
- Nothing merges automatically; PR #1 and this PR need the owner.

## Owner questions

None.

## Staged / committed

Nothing is staged or committed yet. After approval this is committed to the
`workflow-autonomous-tranche` branch, stacked on `m11-simulation-model-registry`.

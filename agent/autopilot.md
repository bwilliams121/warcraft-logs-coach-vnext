# Project autopilot

A local supervisor that works through `agent/autopilot-queue.md` tranche by
tranche without the owner, until a genuine owner decision is needed.

It orchestrates the existing machinery and replaces none of it:

- the Autonomous Tranche Workflow in CLAUDE.md;
- the local OpenAI/Codex review (`scripts/review/openai-review.ps1`);
- the GitHub CLI workflow;
- the repository's safety rules.

## Commands

| Purpose | Command |
| --- | --- |
| Run one tranche | `powershell -ExecutionPolicy Bypass -File scripts/autopilot/run-project.ps1 -MaxTranches 1` |
| Continue until blocked | `powershell -ExecutionPolicy Bypass -File scripts/autopilot/run-project.ps1 -MaxTranches 0` |
| Status | `powershell -ExecutionPolicy Bypass -File scripts/autopilot/status.ps1` |
| Graceful stop | `powershell -ExecutionPolicy Bypass -File scripts/autopilot/stop.ps1` |
| Offline self-test | `powershell -ExecutionPolicy Bypass -File scripts/autopilot/run-project.ps1 -SelfTest` |
| Gate decision only | `... run-project.ps1 -TrancheId <ID> -GateOnly -NoMerge` |
| Auto-start at logon | `powershell -ExecutionPolicy Bypass -File scripts/autopilot/install-autopilot-task.ps1` (the owner runs it; `-WhatIf` previews, `-Uninstall` removes) |

Other parameters:

- `-MaxRuntimeMinutes` (default 720; 0 means none);
- `-NoMerge`;
- `-ClaudePath`;
- `-ClaudeTimeoutMinutes` (360);
- `-CiTimeoutMinutes` (90);
- `-PollSeconds` (60);
- `-MaxRepairCycles` (3);
- `-QueueFile`.

## The loop

For each tranche, the supervisor does this.

1. **Lock and preflight.** Take the single-instance lock, an exclusive
   handle on `.probe/autopilot/supervisor.lock` that the OS releases if the
   process dies; a second supervisor exits at once. Then verify:
   - the repository and its origin;
   - no merge, rebase, cherry-pick or revert in progress;
   - `gh` is authenticated;
   - Codex and Claude both run;
   - no excluded local file is staged or tracked.
2. **Fetch and select.** Fetch origin and select the next tranche (see the
   queue rules).
3. **Launch Claude.** Run Claude Code non-interactively in the repository:
   - `-p`, stream-json transcript, `acceptEdits`, an explicit allowed and
     disallowed tool list;
   - never `--bare`, so CLAUDE.md and the project settings load;
   - the prompt is the owner's instruction plus tranche context (stable
     branch, WCL permission, declared public contract change, merged
     predecessors to record, resume notes).
4. **Read the result.** Claude ends with machine-readable
   `AUTOPILOT_RESULT / PR / SHA / DECISION` lines.
5. **Verify independently.** Audit the transcript for Warcraft Logs or probe
   activity. Wait for CI with bounded polling. Evaluate the merge gate from
   repository and GitHub state, never from Claude's message alone.
6. **Act on the decision:**
   - `READY_TO_MERGE`: merge, record, continue;
   - `OWNER_DECISION_REQUIRED`: stop cleanly;
   - `RETRYABLE_FAILURE`: repair, as below;
   - `FATAL_FAILURE`: stop.

## The merge gate

Every condition is verified, and none is inferred from absence.

- **The local OpenAI review is APPROVED for exactly the candidate.**
  `openai-review.ps1` writes `.probe/openai-review/latest.meta.json` with
  the verdict and the git tree id of the reviewed working tree. That tree
  is HEAD plus every change, excluding the protected local files, and it is
  computed before and after the review; the id is withheld if they differ.
  The PR head commit's tree must equal it, so any edit after approval fails
  the gate.
- **The PR is right.** It is open, its head is the tranche branch and not
  main, its base is main, it is not a draft, it is `MERGEABLE`, and its head
  SHA did not move during the gate.
- **CI is green.** Every check named in `requiredChecks` (in the queue) has
  reported `SUCCESS`, and no check failed.
- **GitHub reviews are clear.** There is no unresolved `CHANGES_REQUESTED`
  review: per author only decisive states count, latest by time, so a later
  comment does not resolve a change request. If a GitHub architecture review (`VERDICT:` line) is present, its
  latest verdict is APPROVED.
- **No owner decision is pending.** No `OWNER_DECISION_REQUIRED` from Claude,
  Codex or GitHub.
- **Public changes match the declaration.** The diff touches
  `src/contracts/`, `src/api/` or `src/mcp/` only if the tranche declares
  `publicContract: EXPECTED`.
- **Every Claude run of the tranche was audited, and nothing escaped the
  audit.**
  - Every attempt has a COMPLETED or RECOVERED audit record in
    `.probe/autopilot/audit/<tranche>.json`.
  - Every transcript is auditable.
  - No unauthorized Warcraft Logs or probe activity was executed.
  - The PR head is the SHA the last audited run itself reported
    (`AUTOPILOT_SHA`), matched against the head observed when that run was
    audited. A head that moved, or a run that reported nothing, is unbound
    and blocks.
  - A PR the supervisor did not produce has no audit, so it cannot pass, and
    `-GateOnly` applies the same rule.
- **No excluded local file is in the PR.**

**Why the supervisor is the enforcement point.** GitHub cannot enforce
required checks here. The repository is private on a plan without branch
protection or rulesets (HTTP 403), and `allow_auto_merge` is false, so
`gh pr merge --auto` is unavailable.

**How it merges.** After the gate passes, the supervisor re-reads the PR's
state, base and head immediately before merging, and refuses if any of
them changed: a retargeted PR keeps its head SHA, so head pinning alone
would not notice. It then merges directly with
`gh pr merge <n> --squash --match-head-commit <sha>`. GitHub refuses that
if the head moved. It never uses `--admin`.

**After a merge.** The supervisor waits for GitHub to report `MERGED`. It
then fetches, fast-forwards main only, verifies that main contains the merge
commit, deletes the tranche branch where safe, and records the merge in its
ledger.

Repository auto-merge does not need to be enabled for this. Enabling it
would add nothing without branch protection.

## Stop conditions and retries

**NORMAL_BLOCKED** stops cleanly, exits 0 and writes
`.probe/autopilot/OWNER_DECISION_REQUIRED.md`. It covers:

- an `OWNER_DECISION_REQUIRED` from Claude, the local review or GitHub;
- a next roadmap item that is itself `OWNER_DECISION_REQUIRED`;
- an unexpected public change;
- unauthorized Warcraft Logs activity;
- Claude or `gh` authentication needing the owner.

While blocked, a restart (for example at the next logon) only compares the
queue file's hash with the one recorded at the block. It invokes no model
until the queue changes.

**RECOVERABLE** failures retry with exponential delay (1, 2, 4 minutes and
so on, capped at 30):

- a Claude run that ends without `READY_FOR_GATE`, or crashes;
- a failed or red gate, which Claude repairs through the normal workflow, so
  code changes are reviewed again;
- a CI timeout;
- transient `gh` failures, retried in place.

**FATAL** failures stop the supervisor:

- more than `MaxRepairCycles` (3) repair cycles for one tranche (the attempt
  count persists across restarts, so a restart does not reset the budget);
- repository corruption;
- an invariant violation.

The supervisor exits non-zero for recoverable and fatal failures, so the
Scheduled Task's bounded restart applies to them.

**Ctrl+C** ends the run through `finally`: the Claude process tree is
stopped, the lock is released, and `state.json` keeps the current tranche,
so the next run resumes it.

**Crash safety across a Claude run.** Before Claude launches, the supervisor
writes the attempt's STARTED audit record, naming its transcript file, and
only then saves the attempt count. Claude runs under
`scripts/autopilot/run-claude.mjs`, a small Node launcher that writes
Claude's stdout and stderr to files line by line, redacting each line before
it is written and writing it synchronously. The transcript is therefore on
disk as it is produced, and no raw secret is ever persisted. The launcher
refuses `.cmd` and `.bat` targets, because a shell would re-split the
tool-rule arguments. On restart, each STARTED attempt is recovered:

- any process whose command line names its transcript is tree-killed,
  without trusting a recorded PID;
- if no transcript exists and nothing was running, the attempt never
  launched: its record becomes WITHDRAWN and is kept, so the attempt number
  stays accounted for, and a withdrawn attempt is never evidence;
- otherwise the transcript is audited and the record becomes RECOVERED,
  bound to the current candidate.

Attempt numbers continue past the highest recorded attempt.

**What the audit counts.** It counts only executed actions: shell commands,
web tools and MCP tools, including a subagent's. It never counts a file read
or an edit that merely mentions the probe. A transcript is auditable only if
it opens with Claude's init event and every line parses, except a truncated
final JSON object. A message cut off mid-write was never executed. An
unauditable transcript goes to the owner rather than to a retry, because no
retry can prove what an unreadable run did. It stops the tranche immediately, after
normal completion and after recovery, with no further launch. To resolve
it, the owner inspects the transcript and sets `"ownerConfirmed": true` on
that attempt's record in `.probe/autopilot/audit/<tranche>.json`. That
confirmation alone clears the saved stop at the next start, even with the
queue unchanged. It never clears an unrelated owner decision, which is
resolved only by recording it in the queue.

## State and logs (`.probe/autopilot/`, gitignored)

- `status.json`: the heartbeat. It holds:
  - supervisor state, current tranche, branch and phase;
  - PR, candidate SHA and attempt;
  - the last Claude result, Codex verdict, CI and gate state, and gate
    reasons;
  - the last activity and last success times;
  - the stop reason.
- `state.json`: crash-safe runtime state (current tranche, attempts per
  tranche, the block record, the merge ledger). It is written atomically.
- `supervisor-<time>.log` plus `latest.log`;
  `claude-<tranche>-<time>.jsonl` plus `latest-claude.jsonl`; the prompts.
  Tokens and secrets are redacted before anything is written. Claude's
  output is redacted line by line by the launcher, and the supervisor's own
  logs by the same rules. The self-test checks that both rule sets agree.
- `STOP`: a graceful stop request, from `stop.ps1`.

## Warcraft Logs

The default is NONE. The prompt forbids requests, and the disallowed tools
block the probe commands and web access. The transcript audit catches any
executed command or web or MCP call that reaches `warcraftlogs.com`, runs
the probe config, or runs a probe script. A queue entry may carry an `OWNER-GRANT:` only when an existing
owner decision authorizes that exact request, and the tranche must record
every request in its review packet.

**Grants do not exempt detected activity.** The audit cannot yet prove
that a request is inside a grant's scope (report, fight, operation). So ANY
detected Warcraft Logs or probe activity, under a grant or not, stops the
tranche for the owner. The audit record keeps each matching command,
redacted and truncated. The owner confirms the record (`ownerConfirmed`)
only after checking that every request is within the grant.

## Claude binary

The supervisor finds the Claude Code CLI in this order:

1. `-ClaudePath`;
2. `PATH`;
3. the standard install locations;
4. the binary bundled with Zed's agent integration.

The Zed binary needs no Zed window, but a Zed update can move it. Installing
the Claude Code CLI, or passing `-ClaudePath`, gives a stable path. All runs
use the owner's own Windows profile and its existing Claude, Codex, GitHub
CLI and Git credentials. No credential is passed on a command line.

## Parallelism

Concurrency is 1, and the supervisor runs one tranche at a time.

Raising it to 2 would be safe only for two READY tranches that meet all of
these:

- they share no dependency chain;
- they are unlikely to touch the same files (the rolling
  `agent/review-request.md` is shared today and would need a per-tranche
  packet);
- neither changes shared authority semantics, such as the evidence gate,
  coverage, the decision engine, the corpus contract or public contracts;
- each runs in its own Git worktree with its own Claude run, its own Codex
  review and its own CI.

The shared rolling review packet and the single
`.probe/openai-review/latest*` slot mean concurrency 2 needs per-worktree
review output first. That is deliberately not enabled.

## Merge policy

The owner changed it on 2026-10-31. Merging was owner-controlled; the
supervisor may now merge a PR only when every gate above passes, recorded in
CLAUDE.md "Git Safety". Production deployment, secret changes and new
Warcraft Logs requests remain the owner's.

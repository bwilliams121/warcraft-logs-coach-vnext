# Review request

Rolling file: overwritten for each review cycle.

## Tranche

AUTOPILOT: the local project autopilot supervisor (tooling; no analyzer
change). Branch `autopilot-supervisor`, from main at d4798ef (M12-B merged).

The owner asked for a supervisor that runs the approved roadmap tranche by
tranche, unattended, until a genuine owner decision is needed. It must use
the existing workflow, the Codex reviewer, the gh workflow and the safety
rules as authoritative constraints: orchestrate them, never replace them.
The owner also asked that the reviewer review this implementation before it
is committed.

**Owner policy change (explicit, 2026-10-31).** The supervisor may merge a
tranche PR when every gate passes. This is recorded in CLAUDE.md "Git
Safety" and `agent/architecture.md` "AUTOPILOT". Everything else in Git
Safety stands.

## Review cycle 18: response to CHANGES_REQUIRED (cycle 17)

1. **Re-audit keeps the run's queue identity.** `Update-AuditRecords` now
   carries each record's original `queueHash` onto the rebuilt record. An
   owner decision the queue has since resolved stays resolved: the record
   still belongs to the queue as it was when the run was audited.
2. **Re-audit handles every status.**
   - The new strict-safe `Format-AuditRecord` prints STARTED and WITHDRAWN
     records as "(no audit fields)" and the rest with their audit fields.
     `-Reaudit` logs through it.
   - `Update-AuditRecords` rewrites only COMPLETED and RECOVERED records,
     leaving STARTED and WITHDRAWN exactly as they were.
- **Regressions.** On a mixed history (WITHDRAWN, then a COMPLETED record
  whose run asked for an owner decision under an older queue hash, then
  STARTED), `-Reaudit`:
  - completes without error and formats all three;
  - leaves the WITHDRAWN and STARTED records as they were;
  - leaves the STARTED record still blocking the gate ("interrupted");
  - keeps the COMPLETED record's `queueHash` ("hash-at-the-time");
  - and so the decision resolved since stays resolved (`Get-OwnerBlock`
    gives "").
- **Live.** `-TrancheId AUTOPILOT-DRYRUN -Reaudit` again gives attempt 1
  COMPLETED, auditable, 0 hits, bound to 11ff225.
- **Totals.** `-SelfTest` now runs 155 checks, all passing.

## Review cycle 17: the end-to-end dry run, and the audit defect it found

**The dry run (real, unattended).** The supervisor ran `-MaxTranches 1
-NoMerge` on a temporary one-entry queue in `.probe/`, holding a
documentation-only tranche stacked on `autopilot-supervisor`.

- **Claude ran the whole workflow non-interactively.** The launch went
  through the redacting launcher, not `--bare`, so CLAUDE.md loaded. It
  took 14 minutes and produced:
  - the branch `autopilot/autopilot-dryrun`;
  - the doc commit 11ff225;
  - its own local Codex review, APPROVED;
  - PR #17 against `autopilot-supervisor`;
  - the result READY_FOR_GATE, with the head SHA it reported.
- **Exact-candidate binding held.** The reviewed tree that Claude's Codex
  run recorded (`89270da5`) equals PR #17's head tree.
- **CI on PR #17 is green:** verify and corpus both pass.
- **The supervisor stopped, fail-closed, on its own audit rule.** It
  reported "transcript ... cannot be audited (no init event)" and
  NORMAL_BLOCKED (exit 0).
  - Claude Code 2.1.310's stream opens with a `system/session_state_changed`
    event, then `system/init`.
  - The cycle-3 rule required init on line 1.

**Fixes:**

- **Init rule.** A transcript must hold the init event, only SYSTEM events
  may precede it (an action before init is unauditable), and every line
  parses (except a truncated last line).
- **`-Reaudit` (with `-TrancheId`).** It rebuilds every COMPLETED or
  RECOVERED record from its own transcript under the current rules.
  - It keeps attempt numbers and any `ownerConfirmed`.
  - It re-binds only to the SHA the run itself reported, checked against
    the head observed now.
  - It clears a saved AUDIT_CONFIRMATION stop only if no record still needs
    the owner.
  - No model is launched and nothing is merged.

**Regressions:**

- a session_state_changed event before init is auditable;
- an action before init is not;
- system events without init are not;
- `Update-AuditRecords` makes a wrongly rejected transcript auditable
  (attempt and binding kept);
- a moved head stays unbound;
- garbage never becomes evidence.

`-SelfTest` now runs 150 checks, all passing.

**Decision dry runs** (no model launched, with the working-tree supervisor
and the dry run's own preserved review verdict in the slot):

- `-TrancheId AUTOPILOT-DRYRUN -Reaudit` re-audited attempt 1: auditable,
  0 Warcraft Logs hits, candidate bound to 11ff225 ("the run reported
  11ff225..."). The AUDIT_CONFIRMATION stop was cleared.
- `-TrancheId AUTOPILOT-DRYRUN -GateOnly -NoMerge` returned
  READY_TO_MERGE for PR #17 at 11ff225, so every gate is green. It then
  logged "WOULD_MERGE ... stacked on autopilot-supervisor; the supervisor
  merges only into main", and nothing was merged.
- **Live negative control:** the same gate with an extra required check
  `nonexistent-check` returned RETRYABLE_FAILURE "required check
  'nonexistent-check' has not reported", giving GATE_NOT_READY.

## Review cycle 16: a strict-mode defect found by the first dry run

Cycle 15 was APPROVED and committed (9a3f920; its tree equals the recorded
reviewed tree `1799756e`). The first end-to-end dry run, on a temporary
ONE-entry queue in `.probe/`, failed at startup before launching Claude:
FATAL "The property 'Count' cannot be found on this object."

- **Cause.** In `ConvertFrom-QueueText`, `($ids | Select-Object
  -Unique).Count` unrolls to a bare string when the queue has one entry,
  and strict mode rejects `.Count` on it. Every self-test queue had three
  entries.
- **The same hazard** was in the main-path parse of `requiredChecks`: an
  `if` expression unrolls a one-element array.
- **Fixes:**
  - `@($ids | Select-Object -Unique).Count`;
  - a new `Get-RequiredChecks(queueText)` that always returns an array
    (`return , @(...)`), now used by the main path.
  - A sweep of every `.Count` in the script found every other site
    already wrapped in `@()` or a collection type.
- **Diagnosability.** The FATAL handler now also logs the first frames of
  `ScriptStackTrace`. That is how this was located (`ConvertFrom-QueueText`
  line 334, from `Read-Queue`).
- **Regressions:**
  - a single-entry queue parses (the old code crashes on it);
  - a single required check is an array of one;
  - two checks parse in order;
  - no `requiredChecks` line gives an empty array.
- **Live.** `-GateOnly -NoMerge` on the one-entry dry-run queue now gets
  past parsing and correctly reports "no open PR for
  autopilot/autopilot-dryrun" (no Claude launch).
- **Totals.** `-SelfTest` now runs 144 checks, all passing.

## Review cycle 15: a binding defect found after APPROVED (cycle 14)

Cycle 14 was APPROVED and committed (bdbca74 on `autopilot-supervisor`).
Checking the committed tree against the tree the review recorded showed a
mismatch: commit 31a2ec25 against reviewed 8468669f.

- **Why.** Three tracked files (`.gitignore`, `.dev.vars.example`,
  `agent/product-intent.md`) are checked out here with CRLF over LF blobs
  (`git ls-files --eol`: `i/lf w/crlf`, `core.autocrlf` false).
  `Get-ReviewedTreeId` built its tree from `read-tree HEAD` in an empty
  index with no stat cache, so `git add -A` re-hashed those files into CRLF
  blobs. A real commit uses the existing index, whose stat cache treats them
  as unchanged.
- **Effect.** No reviewed tree on this machine would ever have equalled a
  committed tree, and the gate would have refused every candidate. It fails
  closed, but it is useless.
- **Fix** (`scripts/review/openai-review.ps1`). The reviewed tree is built
  from a throwaway COPY of the real index, keeping the stat cache, so
  `git add -A` (excluding the protected files) produces exactly what
  staging everything would commit.
- **Verified.** With only this fix in the working tree, the computed tree
  differs from HEAD's tree in exactly one path,
  `scripts/review/openai-review.ps1`, and no longer in the CRLF files. After
  this review the new commit's tree is compared with the recorded reviewed
  tree again.
- **Docs.** `agent/autopilot.md` and `agent/architecture.md` now say "a
  throwaway copy of the real index".
- **Regression** (cycle 15, as review required).
  - The calculation now lives in `scripts/review/reviewed-tree.ps1` (new,
    `Get-ReviewedTreeId RepoRoot WorkDir Exclude`). `openai-review.ps1`
    dot-sources it.
  - The autopilot self-test reproduces the condition in a disposable repo:
    LF blobs committed with autocrlf off, re-checked out as CRLF with
    autocrlf on, back-dated an hour and `update-index --refresh`ed (so not
    racily clean), then autocrlf turned off. That gives `ls-files --eol`
    `i/lf w/crlf` and a clean status.
  - It then asserts:
    - the OLD calculation (`read-tree HEAD` into an empty index) does NOT
      equal HEAD's tree;
    - `Get-ReviewedTreeId` DOES equal it;
    - the real `.git/index` hash is unchanged;
    - a real content change alters the tree;
    - an excluded path never enters it.
  - `-SelfTest` now runs 140 checks, all passing.

## Review cycle 14: response to CHANGES_REQUIRED (cycle 13)

**A grant never exempts detected Warcraft Logs activity.** I took the
fail-closed option the review offered, since the audit cannot yet prove
scope.

- ANY detected Warcraft Logs or probe activity, under an `OWNER-GRANT` or
  not, now stops for the owner. That holds:
  - right after the run (`OWNER:attempt N shows Warcraft Logs or probe
    activity (grant: ...)`);
  - in `Get-OwnerBlock`;
  - in the gate (`Test-AuditEvidence` owner reason: "the owner must
    confirm it is within the grant").
- It is resolved only by `ownerConfirmed` on that attempt's record, after
  the owner checks every request against the grant.
- The persisted stop's kind is now `AUDIT_CONFIRMATION`, covering this and
  the unauditable case, with its attempt.
- Each audit hit now keeps the matching command, redacted and truncated to
  240 characters, so the owner can judge scope.
- **Regressions** (grant "report abc fight 1 events only", with a curl to
  `warcraftlogs.com` for report ZZZ):
  - the hit keeps the command (it names ZZZ);
  - the gate gives an owner reason ("within the grant");
  - the owner block names the activity;
  - `ownerConfirmed` resolves it;
  - the real loop (stubbed) gives `OWNER:attempt 1 shows Warcraft Logs...`
    with 1 launch and 0 merges;
  - the persisted stop is `AUDIT_CONFIRMATION`, attempt 1.
- **Docs.** `agent/autopilot.md` ("Grants do not exempt detected
  activity") and the queue's Warcraft Logs rule state this.
- **Totals.** `-SelfTest` now runs 134 checks, all passing.

## Review cycle 13: response to CHANGES_REQUIRED (cycle 12)

**Owner confirmation resolves the PERSISTED unauditable stop.**

- `Stop-Blocked` now records the block's `kind`: UNAUDITABLE, with its
  `attempt`, when the reason is an unauditable transcript, and DECISION
  otherwise.
- `Test-OwnerBlock` takes the audit records. An UNAUDITABLE block is
  resolved when that attempt's record carries `ownerConfirmed: true`, even
  with the queue unchanged. A DECISION block is resolved only by a queue
  change, as before.
- The startup check moved into the testable `Resolve-StartupBlock(state)`.
  It clears a resolved block (and its note) and keeps an unresolved one.
- **Regressions,** on the NORMAL persisted path:
  - an unauditable record plus `Stop-Blocked` with its reason records
    `kind = UNAUDITABLE, attempt = 1` in `state.json`;
  - unconfirmed, `Resolve-StartupBlock` stays blocked with the queue
    unchanged;
  - after `ownerConfirmed` on the record, it clears the persisted block,
    still with the queue unchanged;
  - `Invoke-Tranche` then proceeds (one launch, merged by the stub);
  - a DECISION block ("pick A or B") is NOT cleared by a confirmed audit
    record.
- **Live:** the blocked test queue run twice gives NORMAL_BLOCKED and then
  "still blocked ... unresolved, so nothing is run", exit 0 both times.
- **Totals.** `-SelfTest` now runs 128 checks, all passing. The guide
  states both resolution paths.

## Review cycle 12: response to CHANGES_REQUIRED (cycle 11)

1. **An unauditable transcript stops for the owner immediately.**
   - After a normal Claude run, an unauditable record returns `OWNER:`
     right away, before the result marker is read, so there is no retry.
   - `Get-OwnerBlock` treats any ran record that is unauditable and not
     owner-confirmed as a block. It is enforced at the start of
     `Invoke-Tranche` (after recovery, before any launch), before gating
     and in the gate.
   - **Resolution is explicit:** after inspecting the transcript, the owner
     sets `"ownerConfirmed": true` on that record. `Test-AuditEvidence`
     and `Get-OwnerBlock` honour it. This is documented in
     `agent/autopilot.md`.
   - **Regressions (the real loop, stubbed):**
     - a garbage transcript gives OWNER after exactly ONE launch, with 0
       merges;
     - a restart gives OWNER again, with still one launch in total;
     - a recovered interrupted run with an unreadable transcript gives OWNER
       with 0 launches and 0 merges;
     - `ownerConfirmed` on the record resolves the block.
   - The stubbed loop's fixture transcript now carries the init event its
     auditability requires.
2. **The PR base is verified at the gate and again just before merging.**
   - `Test-MergeGate` compares the freshly fetched `baseRefName` with the
     declared base.
   - `Invoke-Merge` re-reads the PR's state, base and head right before
     `gh pr merge`, and throws RECOVERABLE without merging if the PR is not
     OPEN, has another base, or has another head. A retargeted PR keeps its
     head SHA, so head pinning cannot see it.
   - **Regressions,** running the real `Invoke-Merge` with `Invoke-Gh`
     stubbed:
     - a base changed to `release` with the same head SHA refuses, and
       `gh pr merge` is never called;
     - a moved head refuses as well, with no merge call.
- **Totals.** `-SelfTest` now runs 123 checks, all passing.

## Review cycle 11: response to CHANGES_REQUIRED (cycle 10)

1. **A later comment never resolves a change request.**
   - The pure `Test-GithubReviews(reviews, reviewDecision)` keeps only
     DECISIVE states per author (APPROVED, CHANGES_REQUESTED, DISMISSED),
     ordered by `submittedAt`. COMMENTED and PENDING are ignored. An
     aggregate `CHANGES_REQUESTED` decision also blocks.
   - **Regressions:**
     - CHANGES_REQUESTED then COMMENTED, with an empty `reviewDecision`,
       is blocked;
     - followed by APPROVED, it is resolved;
     - DISMISSED resolves it;
     - list order does not matter, time does;
     - an aggregate CHANGES_REQUESTED blocks.
2. **An audit binds only the candidate the run itself produced.**
   - `Get-CandidateBinding(claimed, observed)`: a record's `candidateSha`
     is the run's own reported `AUTOPILOT_SHA`, and only when it equals
     the head observed at audit time (exactly, or as an unambiguous prefix
     of 7+ characters).
   - Otherwise the record is UNBOUND (`candidateSha` ""), with a
     `candidateBinding` note naming both SHAs, and the gate blocks ("the PR
     head ... is not a candidate the last audited run produced"). This
     covers a head that moved before the audit was written, a head that
     moved before restart recovery, and a run that never reported its SHA.
     The same rule applies on the normal path and in recovery.
   - The prompt now asks for the full SHA from `git rev-parse HEAD` after
     the last push.
   - **Regressions:**
     - the head moved before audit persistence: claimed sha1, observed sha2,
       unbound, blocked;
     - the head moved before restart recovery: the transcript reports sha9,
       the branch is now sha11, unbound, the note names both, blocked;
     - interrupted before reporting a SHA: unbound, blocked;
     - a 7+ character prefix binds to the full head; a 3-character prefix
       does not;
     - the earlier recovery tests now use transcripts that report their
       SHA.
- **Totals.** `-SelfTest` now runs 116 checks, all passing.
  `agent/autopilot.md` states both rules.

## Review cycle 10: response to CHANGES_REQUIRED (cycle 9)

**The retry budget limits Claude launches, not gating.**

- The exhaustion check now runs only when another Claude attempt would
  launch.
- At the start of `Invoke-Tranche`, if the latest COMPLETED or RECOVERED
  audit record reported `READY_FOR_GATE`, the first loop iteration gates
  that existing candidate without launching. This covers a run interrupted
  after it finished.
- `-GateOnly` always gates without launching. If the existing candidate's
  gate then fails with the budget spent, the next iteration would need a
  launch, and that is FATAL.
- **Regressions,** with the budget spent at four audited attempts:
  - the last run READY_FOR_GATE is gated and merged with 0 launches;
  - `-GateOnly` evaluates and merges it with 0 launches;
  - the existing candidate's gate fails: FATAL "retry budget exhausted",
    with 0 launches and 0 merges, so a fifth launch is prohibited;
  - the last run not READY: FATAL with 0 launches.
- **Totals.** `-SelfTest` now runs 105 checks, all passing.

## Review cycle 9: response to CHANGES_REQUIRED (cycle 8)

**The top-level owner stop never replaces unreadable state.**

- The handler is now `Complete-OwnerStop(reason, tranche)`. The top-level
  catch calls it for every `OWNER:` failure, preflight authentication
  included.
- It saves the block only into a READABLE or absent state.
- If the existing `state.json` cannot be read, it saves nothing:
  `state.json` and `state.json.bak` stay byte-for-byte unchanged. The
  owner note (`Write-OwnerNote`, split out of `Stop-Blocked`) names both
  the decision and the state corruption, and the run ends FATAL (exit 2),
  because the corruption needs repair too.
- **Regressions:**
  - with a truncated `state.json` and a separate backup present, a
    preflight-style owner stop ("gh is not authenticated") returns 2;
  - `state.json` is unchanged;
  - the backup is unchanged;
  - the owner note names both problems;
  - with no state file, the same stop saves the block and returns 0.
- **Totals.** `-SelfTest` now runs 101 checks, all passing. The script
  parses and is pure ASCII.

## Review cycle 8: response to CHANGES_REQUIRED (cycle 7)

1. **Claude's owner-decision result survives a crash.**
   - Every audit record now carries the run's own parsed `result`
     (AUTOPILOT_RESULT) and `decision`, plus the queue hash at audit time.
     Recovery rebuilds a record from the on-disk transcript, so a decision
     Claude asked for is re-read even if the supervisor died before saving
     the block.
   - `Get-OwnerBlock` combines the block saved in state with the latest
     audited run's `OWNER_DECISION_REQUIRED` result. Both are resolved only
     when the queue hash changes, that is, when the decision is recorded.
   - It is enforced in four places:
     - at the start of `Invoke-Tranche`, after recovery and before any new
       attempt is launched;
     - before gating, which `-GateOnly` reaches;
     - inside `Test-MergeGate`;
     - at startup for an explicit `-TrancheId`.
   - **Regressions:**
     - a STARTED attempt whose on-disk transcript ends with an
       `OWNER_DECISION_REQUIRED` result is recovered;
     - the recovered record keeps `result` and `decision`;
     - `Invoke-Tranche` returns `OWNER:...first healer spec` with 0
       Claude launches and 0 merges;
     - `-GateOnly` with a gate stub that would merge returns OWNER with 0
       merges;
     - a changed queue hash resolves it.
2. **Unreadable state fails closed.**
   - `Read-State` returns null only when `state.json` is absent. A file
     that does not parse, or lacks `version`, `attempts` or `merged`, is
     FATAL, and the file is left untouched (the message points to
     `state.json.bak`).
   - `Initialize-State` creates a state only when none exists. The error
     path no longer overwrites an unreadable state.
   - **Regressions:**
     - a blocked state truncated to 40 bytes makes `Initialize-State`
       FATAL, and the file stays byte-for-byte unchanged;
     - a JSON state without the expected fields is FATAL too.
3. **Two defects these runs exposed, fixed:**
   - **Unbounded recursion.** An edit had made `Initialize-State` call
     itself, which would have crashed every startup. The new state test
     caught it as a call-depth overflow.
   - **A transient lock on the log file was FATAL.** An antivirus scan of a
     fresh file holds it briefly. `Write-Log` now appends with five short
     retries and never throws.

   Live re-runs after the fixes:
   - `-TrancheId M12-B -GateOnly -NoMerge` gives ALREADY_MERGED, exit 0;
   - the blocked queue, twice, gives NORMAL_BLOCKED and then "still blocked
     ... nothing is run", exit 0 both times.
   - `Read-ClaudeResult` also reads optional fields safely under strict
     mode.
- **Totals.** `-SelfTest` now runs 96 checks, all passing. The script
  parses and is pure ASCII.

## Review cycle 7: response to CHANGES_REQUIRED (cycle 6)

1. **Repository credential bindings are redacted.**
   - In both implementations the secret-key rule is now any identifier
     ENDING in `secret`, `token`, `password`, `passwd`, an api key
     or `client_id`. That covers `ANALYSIS_AUTH_TOKEN`,
     `WCL_CLIENT_SECRET`, `WCL_CLIENT_ID`, `access_token` and the rest.
     Whole quoted values apply as in cycle 6.
   - Usage counters such as `input_tokens` and `output_tokens` do not end
     at a separator and are untouched.
   - New self-tests:
     - `ANALYSIS_AUTH_TOKEN=...` (plain);
     - `WCL_CLIENT_SECRET="..."` (quoted, with spaces);
     - a JSON-encoded tool_result with `ANALYSIS_AUTH_TOKEN` and
       `WCL_CLIENT_ID`;
     - a usage line.

     For these, both implementations agree, no value survives, the nested
     JSON stays valid, and the usage line is byte-identical.
   - The end-to-end fake run also emits `ANALYSIS_AUTH_TOKEN` in a
     serialized tool_result and on stderr. The persisted lines are
     `{\"ANALYSIS_AUTH_TOKEN\":\"[REDACTED]\"}` and
     `ANALYSIS_AUTH_TOKEN=[REDACTED]`, and no fragment survives in the
     transcript, stderr or latest copy.
2. **A saved owner block is enforced on every merge path.**
   - The pure `Test-OwnerBlock(state, tranche, queueHash)` reports the
     unresolved decision recorded for the tranche. It is resolved only when
     the queue file's hash changes, that is, when the decision is recorded.
   - It is enforced in three places:
     - in `Invoke-Tranche` before gating, which `-GateOnly` reaches too;
     - inside `Test-MergeGate`, as an owner reason;
     - at startup, where an explicit `-TrancheId` for the blocked tranche
       exits BLOCKED without running anything.
   - New self-tests:
     - the block is enforced;
     - a block on another tranche does not apply;
     - a changed queue hash resolves it;
     - REGRESSION: a stubbed `-GateOnly` `Invoke-Tranche`, with a gate
       stub that would merge, returns `OWNER:...pick A or B` with 0
       merges.
- **Totals.** `-SelfTest` now runs 89 checks, all passing. The script
  parses and is pure ASCII; `node --check` passes.

## Review cycle 6: response to CHANGES_REQUIRED (cycle 5)

**Quoted secret values are redacted WHOLE.**

- **The rule.** In both implementations, a value after a secret key (or
  after `authorization`) is either quoted or bare.
  - A quoted value runs from its opening quote to the matching closing quote
    at the same escape level: the same run of backslashes, not itself
    escaped. This uses a named backreference and a lookbehind. Spaces,
    backslashes and escaped quotes inside it are redacted, and the quotes
    and escapes around it are kept, so a JSON line stays valid.
  - A bare value keeps the token rule (up to whitespace, a quote, a comma or
    a backslash).
  - Node uses a replacer function; PowerShell uses a MatchEvaluator over the
    same pattern text.
- **New self-tests:**
  - `password: "synthetic first second"`;
  - `client_secret: "synthetic\remainingSecret987"`;
  - a single-quoted value with spaces;
  - a JSON-encoded tool_result holding a spaced password, a backslashed
    client_secret and an api_key with escaped quotes inside.

  For these, both implementations agree, no fragment survives, the
  redacted JSON line still parses, and keys and quoting stay readable
  (`password: "[REDACTED]"`).
- **The end-to-end fake run** is now a `.js` file, so no command-line
  quoting alters it. It emits all of these on stdout (inside a serialized
  tool_result) and on stderr.
  - Its persisted transcript lines are `{"client_secret":"[REDACTED]",
    "password":"[REDACTED]","api_key":"[REDACTED]"}`, inside valid JSON.
  - Its stderr is `password: "[REDACTED]"` and `Authorization: Bearer
    [REDACTED]`.
  - No fragment survives in the transcript, stderr or
    `latest-claude.jsonl`.
- **Totals.** `-SelfTest` now runs 81 checks, all passing. The script
  parses and is pure ASCII; `node --check` passes.

## Review cycle 5: response to CHANGES_REQUIRED (cycle 4)

1. **Secrets inside JSON-encoded tool output are redacted, and the JSON stays
   valid.**
   - In both `redact` (launcher) and `Redact` (supervisor), the
     key/value separators now accept JSON escaping (`\\"`, and any run of
     backslashes before a quote).
   - A redacted value stops at a backslash, so the closing escape survives
     and the line stays valid JSON.
   - New self-tests, on three Claude-shaped tool_result lines (an escaped
     `client_secret`, an escaped `authorization: Bearer ...` in nested
     headers, and a DOUBLE-escaped `access_token`):
     - both implementations give identical output;
     - none of the three synthetic secrets survives;
     - every redacted line still parses as JSON.
   - The completed fake run now also emits a serialized `client_secret`
     tool result. Its transcript, stderr and `latest-claude.jsonl` carry
     none of the synthetic secrets.
2. **Required checks: every entry must be COMPLETED and SUCCESS.**
   - The pure `Test-RequiredChecks` replaces the any-SUCCESS rule. For each
     required name, there must be at least one entry and EVERY entry must
     be COMPLETED/SUCCESS (a re-run can leave an old SUCCESS beside a new
     pending or failed entry). Any other check that is pending or failed
     also blocks.
   - It handles both check runs (status/conclusion) and status contexts
     (state).
   - New self-tests:
     - all SUCCESS is green;
     - SUCCESS plus QUEUED, SUCCESS plus IN_PROGRESS, and SUCCESS plus
       FAILURE of the same check are each not green;
     - a required check that never reported is not green;
     - a pending status context is not green.
- **Totals.** `-SelfTest` now runs 77 checks, all passing.
  `run-project.ps1` parses and is pure ASCII; `node --check` passes for
  `run-claude.mjs`.

## Review cycle 4: response to CHANGES_REQUIRED (cycle 3)

1. **A never-launched attempt is WITHDRAWN, not deleted.**
   - On restart, a STARTED attempt with no transcript and no running process
     becomes a WITHDRAWN record and is kept. The attempt number stays
     accounted for, and numbering never has a hole.
   - `Test-AuditEvidence` skips WITHDRAWN for evidence, and takes the
     candidate from the last attempt that actually ran. If every attempt was
     withdrawn, that is a blocking reason.
   - New self-tests, each running the full gate with nothing filtered:
     - withdrawal is kept as WITHDRAWN;
     - withdrawn attempts alone are not evidence;
     - withdrawal then an on-disk recovery passes the full gate (0 reasons,
       0 owner);
     - the next completed run (attempt 3) passes the full gate;
     - a head equal to an earlier attempt's candidate fails.
2. **Output is redacted before it is persisted.**
   - **The launcher.** Claude now runs under
     `scripts/autopilot/run-claude.mjs` (new, plain Node). It pipes the
     prompt file to stdin and writes stdout and stderr line by line,
     redacting each line before a synchronous write. Crash durability is
     kept, and no raw secret reaches disk.
   - **Where it is used.** `Start-LoggedRun` (launcher, wait,
     timeout tree-kill, `latest-claude.jsonl` copy) serves the Claude run.
     Its command line still names the transcript for restart recovery.
   - **Redaction rules.** They are rebuilt in both the launcher and
     `Redact`. Authorization headers redact the token, not the word
     "Bearer"; also covered are bare bearer/basic tokens,
     client_secret/client_id/access/refresh tokens, api keys and passwords.
   - **No shell re-splitting.** The launcher refuses `.cmd` and `.bat`
     targets, since a shell would re-split the tool-rule arguments; the npm
     `claude.cmd` candidate is dropped.
   - **New synthetic-secret self-tests:**
     - the launcher and the supervisor redact six sample secrets
       identically, and none survives;
     - a completed fake run (node printing a GitHub token on stdout and an
       Authorization header on stderr) leaves no raw secret in its
       transcript, its stderr or `latest-claude.jsonl`, and its transcript
       is auditable;
     - an interrupted fake run (killed at a 3 s timeout) leaves its
       redacted lines on disk and no raw secret in the transcript or the
       latest copy;
     - a `.cmd` program is refused (exit 2).
   - After the tests, no node process from the fake runs remains.
- **Totals.** `-SelfTest` now runs 68 checks, all passing. The scripts
  parse and are pure ASCII.

## Review cycle 3: response to CHANGES_REQUIRED (cycle 2)

1. **Only executed actions are audited.**
   - `Test-TranscriptWcl` inspects only executing tools: Bash, PowerShell,
     Monitor, WebFetch, WebSearch and `mcp__*`, including a subagent's,
     which the stream carries as its own tool_use.
   - Probe-script patterns require an executor (node, npx, vitest, tsx,
     ts-node) before `scripts/probe/` or `*.probe.ts`.
   - New self-tests:
     - Read of `vitest.probe.config.ts`: no hit.
     - An Edit whose text documents "no vitest.probe.config, no npm run
       probe, scripts/probe/x.probe.ts": no hit.
     - `git diff -- scripts/probe/`: no hit.
     - `npx.cmd vitest run --config vitest.probe.config.ts`: hit.
     - `npx vitest run scripts/probe/...probe.ts`: hit.
     - A subagent's `npm.cmd run probe`: hit.
2. **No auditability without evidence.**
   - A transcript is auditable only if its first line is Claude's
     `system/init` event and every line parses, except a final line that
     is a truncated JSON object (it was cut off, so never executed).
   - An unauditable transcript is now `OWNER_DECISION_REQUIRED`, not a
     retry: no retry can prove what an unreadable run did.
   - New self-tests:
     - empty, garbage-only, init-less and garbage-final transcripts are not
       auditable;
     - an init-led, fully parsed transcript is auditable;
     - init plus a truncated final object is auditable;
     - unauditable evidence goes to the owner.
3. **Interrupted attempts are recovered explicitly.**
   - **Ordering.** The transcript path is chosen, then the attempt's STARTED
     audit record is written, and only then is the attempt count saved and
     Claude launched.
   - **Output on disk.** Claude now runs under `cmd.exe` with stdout and
     stderr redirected to files, so the transcript is on disk as it is
     produced, even if the supervisor dies. Timeout and Ctrl+C tree-kill
     with `taskkill /T /F`.
   - **On restart, `Resume-InterruptedAttempts`:**
     - tree-kills any process whose command line names the attempt's
       transcript (no PID is trusted);
     - withdraws the record if no transcript exists and nothing was running,
       because it never launched;
     - otherwise audits the on-disk transcript into a RECOVERED record bound
       to the current candidate.
   - **Gate.** An unrecovered STARTED record blocks the merge.
   - **Numbering.** Attempts continue after max(state, highest recorded
     attempt), so a crash never reuses a number.
   - **New self-tests:**
     - an unrecovered interruption blocks;
     - a never-launched attempt is withdrawn on restart;
     - an interrupted run's on-disk transcript (init, `npm.cmd test`,
       truncated tail) is RECOVERED, auditable and bound to its head, and
       the gate accepts it;
     - numbering continues after the highest attempt.
   - **Strict-mode crashes found by these tests and fixed:**
     - reading `candidateSha` on a STARTED record;
     - an empty array returned from a function unrolling to `$null`;
     - the gate reading attempts from a missing state file.
- **Totals.** `-SelfTest` now runs 58 checks, all passing. The scripts
  parse and are pure ASCII. `agent/autopilot.md` documents audit scope,
  auditability and crash recovery.

## Review cycle 2: response to CHANGES_REQUIRED (cycle 1)

1. **GitHub verdicts are ordered by time.**
   - `Get-LatestGithubVerdict` merges reviews (`submittedAt`) and comments
     (`createdAt`) and takes the verdict with the latest timestamp, using
     the last VERDICT line of a body.
   - An undated verdict is read as CHANGES_REQUIRED, never as approval.
   - New self-tests:
     - an older APPROVED comment does not override a newer
       CHANGES_REQUIRED review;
     - a newer APPROVED comment wins;
     - a newer OWNER_DECISION_REQUIRED review wins over an older APPROVED
       comment;
     - no verdict gives "";
     - undated gives CHANGES_REQUIRED.
2. **Explicit selection obeys readiness.**
   - `Test-Runnable` (the status is READY, IN_PROGRESS or PR_OPEN, and
     every dependency is merged) is the one rule for automatic and
     `-TrancheId` selection.
   - `-TrancheId` on a non-runnable tranche throws `REFUSED:`, which
     exits 1 with no Claude run. An already-merged tranche is still
     inspectable and gives ALREADY_MERGED.
   - New self-tests: READY is runnable, OWNER_DECISION_REQUIRED is not, an
     unmerged dependency is not, `-TrancheId` on an owner tranche is
     REFUSED, and `-TrancheId` on a merged one is inspected.
   - Live: `-TrancheId M12-D -GateOnly -NoMerge` printed "REFUSED: tranche
     M12-D is not runnable: its status is OWNER_DECISION_REQUIRED" and
     exited 1.
3. **STOP is checked at every boundary.**
   - It is checked after the Claude run and its audit, after CI completes,
     immediately before `Invoke-Merge`, and again inside `Invoke-Merge`
     before `gh pr merge`, where it throws RECOVERABLE without merging.
   - New stubbed self-tests run the REAL `Invoke-Tranche`, with Find-Pr,
     Invoke-Claude, Wait-Ci, Test-MergeGate and Invoke-Merge stubbed:
     - the control, with no stop, merges exactly once, so the stubs reach
       the merge;
     - a stop written during the Claude run gives STOPPED with 0 merges;
     - a stop written during CI gives STOPPED with 0 merges.
4. **The Warcraft Logs audit is durable, candidate-bound and required on
   every merge path.**
   - After each Claude run the supervisor writes an audit record to
     `.probe/autopilot/audit/<tranche>.json` (attempt, transcript path and
     SHA-256, line count, auditable flag, Warcraft Logs hits) together with
     the candidate SHA, which is the open PR's head or the remote branch
     head.
   - `Test-MergeGate`, which `-GateOnly` also uses, calls the pure
     `Test-AuditEvidence`. It blocks the merge on:
     - no records ("the candidate was not produced by an audited supervisor
       run");
     - a missing record for any attempt;
     - an unauditable transcript (a line that does not parse, except a
       truncated last line, which was never executed);
     - a PR head other than the one the last audited run left.

     Unauthorized hits are `OWNER_DECISION_REQUIRED`.
   - New self-tests:
     - clean evidence passes;
     - no evidence, a missing attempt, a moved head and an unparseable
       transcript each block;
     - unauthorized activity needs the owner;
     - a truncated last line stays auditable;
     - a stubbed run with probe activity gives OWNER with 0 merges;
     - the control run leaves one record bound to its head.
- **Totals.** `-SelfTest` grows from 20 to 42 checks, all passing. They
  write only under `.probe/autopilot/selftest/`, never over real state.
  All scripts parse and are pure ASCII.

## What changed

- **`scripts/autopilot/run-project.ps1` (new), the supervisor.**
  - **Lock and preflight.** A single-instance lock (an exclusive handle; the
    OS releases it if the process dies; a second instance exits 0). The
    preflight checks:
    - the repository and its origin;
    - no merge, rebase, cherry-pick or revert in progress;
    - `gh` authenticated;
    - Codex present;
    - the Claude CLI runs;
    - no excluded local file staged or tracked.
  - **Fetch and select.** It selects the first READY / IN_PROGRESS /
    PR_OPEN entry whose dependencies are merged. "Merged" is verified from
    the queue, the ledger or GitHub.
  - **The Claude run.** Claude Code is launched non-interactively, without
    `--bare`, in the repository:
    - `-p`, stream-json, `acceptEdits`, `--max-turns`;
    - an explicit `--allowedTools` set (files, search, shell, subagents);
    - `--disallowedTools` for `gh pr merge`, force pushes, pushes to main,
      wrangler or npm deploy, `npm run probe`, WebFetch and WebSearch.
    - The prompt is the owner's text plus tranche context: the stable
      branch, the base, WCL permission (NONE unless an `OWNER-GRANT:`
      entry), the declared public-contract change, merges to record, resume
      notes, and machine-readable result lines.
  - **Independent verification.** It audits the transcript for Warcraft
    Logs or probe activity, waits for CI with bounded polling, and evaluates
    the merge gate from repository and GitHub state.
  - **Decisions.** READY_TO_MERGE, OWNER_DECISION_REQUIRED,
    RETRYABLE_FAILURE or FATAL_FAILURE.
  - **Merging.** `gh pr merge <n> --squash --match-head-commit <sha>`, never
    `--admin`. It merges only PRs whose base is main, waits for `MERGED`,
    fetches, fast-forwards main only, verifies that main contains the merge
    commit, deletes the tranche branch where safe, records the ledger and
    continues.
  - **Retries.** Up to `MaxRepairCycles` (3) repair cycles with exponential
    backoff; the attempt count persists across restarts. Beyond that it is
    FATAL.
  - **Blocking.** NORMAL_BLOCKED writes
    `.probe/autopilot/OWNER_DECISION_REQUIRED.md` and exits 0. A restart
    while blocked only compares the queue hash and invokes no model.
  - **Limits and stopping.** `-MaxTranches` (0 means until blocked),
    `-MaxRuntimeMinutes`, a STOP file checked at safe boundaries, and a
    Claude timeout. On Ctrl+C, `finally` stops the child and releases the
    lock.
  - **Logs and state.** Under `.probe/autopilot/` with secrets redacted:
    `status.json` (heartbeat) and `state.json` (crash-safe, atomic writes).
  - **`-SelfTest`.** 155 offline checks (cycle 18): queue parsing and refusals, base
    defaulting, argument quoting, the transcript audit, result markers,
    redaction, verdict ordering, readiness, audit evidence, and the real
    tranche loop under stubs (cycle 2).
- **`scripts/review/openai-review.ps1`.** It now also writes
  `latest.meta.json`: the verdict and the git tree id of the reviewed
  working tree.
  - The tree is HEAD plus all changes, built in a throwaway index, excluding
    the protected local files.
  - It is computed before and after the review, and recorded only if both
    match and HEAD did not move.
  - The gate requires the PR head commit's tree to equal it. The review
    prompt and Codex invocation are unchanged.
- **`scripts/autopilot/status.ps1`, `stop.ps1`,
  `install-autopilot-task.ps1` (new).**
  - `status.ps1` prints a concise status.
  - `stop.ps1` requests a graceful stop.
  - `install-autopilot-task.ps1` builds the logon task: current user,
    Interactive logon, so no stored credentials; `-MaxTranches 0`; the
    repository as working directory; StartWhenAvailable; restart on failure
    3 times, 15 minutes apart; IgnoreNew; no time limit; not stopped on
    idle. It has `-WhatIf` and `-Uninstall`. It was NOT installed.
- **`agent/autopilot-queue.md` (new), the roadmap queue.** It is seeded
  only from the roadmap and follow-ups:
  - M12-A and M12-B are MERGED (PRs 14 and 15).
  - M12-C (healing and absorbs received during damage episodes) is READY,
    from the architecture's "what covered it" and follow-ups "After M12-B".
  - PREP-5 (the MCP tool description mentions consumable status) is READY,
    from follow-ups "PRODUCT-INTENT GAP", with `publicContract: EXPECTED`.
  - Four items are OWNER_DECISION_REQUIRED, each naming its decision:
    - M12-D, the first healer spec and its v1 verdicts;
    - M12-E, the assignment plan input format;
    - M13-A, an Augmentation capture, which is a new WCL request;
    - M11-G4-5-R, the recorded 12.1.5 options.
  - `requiredChecks: verify, corpus`.
- **`agent/autopilot.md` (new), the operating guide.** It covers the
  commands, loop, merge gate, stop and retry policy, state, WCL policy, the
  Claude binary, parallelism (concurrency 1, and what 2 would need) and the
  merge policy.
- **Other docs.**
  - `CLAUDE.md` "Git Safety": the owner's merge-policy change, and the
    result lines a supervised run must end with.
  - `agent/architecture.md` "AUTOPILOT".
  - `agent/follow-ups.md` "After AUTOPILOT".

## Decisions made (please assess)

1. **Direct merge after a verified gate, not GitHub auto-merge.** Auto-merge
   is disabled, and branch protection and rulesets are unavailable on this
   private repo's plan (403). GitHub cannot enforce required checks, so the
   supervisor verifies them and merges with the head pinned. Enabling
   auto-merge would add nothing.
2. **Exact-candidate binding by tree id.** Reviews run before the commit,
   so the reviewed working tree's id is compared with the committed tree's.
   An edit after approval fails the gate, and the prompt tells Claude to
   re-review instead.
3. **Queue state split.** The tracked queue holds roadmap state. The
   transient ledger is in `.probe/`. The next tranche's PR records earlier
   merges in the queue, so there is no PR just to update state. Entries are
   matched by a stable `branch`.
4. **`base` field.** A stacked tranche declares its parent. The gate checks
   the PR's base against it, and the supervisor never merges a stacked PR.
   This is what lets the first dry run use the reviewer metadata before
   this branch merges.
5. **Claude binary fallback.** No Claude Code CLI is on PATH, so the
   supervisor falls back to the one bundled with Zed's agent integration,
   with a warning. `-ClaudePath` overrides. This is recorded in follow-ups.

## Validation (before commit)

- **Static.** All four scripts and `openai-review.ps1` parse
  (`Parser::ParseFile`, zero errors) and are pure ASCII. Windows PowerShell
  5.1 reads a BOM-less script as ANSI, where the UTF-8 bytes of an em dash
  decode to a smart quote that PowerShell treats as a string delimiter.
- **`-SelfTest`.** 20/20 at cycle 1, 42/42 at cycle 2, 58/58 at cycle 3,
  68/68 at cycle 4, 77/77 at cycle 5, 81/81 at cycle 6, 89/89 at cycle 7,
  96/96 at cycle 8, 101/101 at cycle 9, 105/105 at cycle 10, 116/116 at cycle 11,
  123/123 at cycle 12, 128/128 at cycle 13, 134/134 at cycle 14,
  140/140 at cycle 15, 144/144 at cycle 16, 150/150 at cycle 17,
  155/155 now.
- **Single instance.** With the lock file held exclusively, a second
  supervisor printed "another supervisor holds ..." and exited 0.
- **Gate-only on a real tranche.** `-TrancheId M12-B -GateOnly -NoMerge`
  after PR #15 was merged gave outcome ALREADY_MERGED, exit 0, and no
  Claude run.
- **Defects found and fixed during these runs.**
  - Under PowerShell 5.1 native stderr (`git fetch`'s "From ...")
    terminated under Stop, so native calls now run under Continue and are
    judged by exit code. The same fix went into the reviewer's tree
    function.
  - An uninitialized `$script:ClaudeProcess` broke under strict mode.
  - `File.Replace` rejected a null backup path.
  - Status writes inside the error handler could mask the original error;
    they are now guarded.
- **The blocked path,** with a throwaway queue in `.probe/`.
  - The first run gave NORMAL_BLOCKED on the owner item, wrote
    `OWNER_DECISION_REQUIRED.md` and exited 0.
  - The second run said "still blocked ... the queue has not changed, so
    nothing is run" and exited 0.
  - No Claude transcript was created.
- **CLAUDE.md loads in non-interactive mode.** `claude -p` with every tool
  disallowed was asked for the first line under "Core Philosophy" and the
  step-6 command. In one turn and with no tool, it answered "Correctness
  first." and the exact `openai-review.ps1` command.
- **Scheduled task.** `install-autopilot-task.ps1 -WhatIf` printed the
  definition. `Get-ScheduledTask` confirms that no task exists.
- **The end-to-end dry run** (see cycle 17 for the results). As planned at
  cycle 1: the end-to-end dry run, with a real Claude run, Codex
  review, PR and CI on a harmless documentation-only tranche, and the merge
  gate on it with `-NoMerge`. It needs this branch pushed, because the dry
  tranche stacks on it. It runs after this review and commit, and any fix
  it finds returns here for review.

## External / network activity

No Warcraft Logs request. GitHub was read (`gh repo view`, `gh api` for the
merge settings and protection, which returned 403, and PR state). One
`claude -p` run was made, with no tools, for the CLAUDE.md probe.

## Staged / committed

Not yet committed. The intended files are:

- `scripts/autopilot/{run-project,status,stop,install-autopilot-task}.ps1`,
  `scripts/autopilot/run-claude.mjs`, `scripts/review/reviewed-tree.ps1`
- `scripts/review/openai-review.ps1`
- `agent/autopilot-queue.md`, `agent/autopilot.md`
- `CLAUDE.md`, `agent/architecture.md`, `agent/follow-ups.md`,
  `agent/review-request.md`

`.claude/` and the three local `scripts/probe/*.probe.ts` files stay excluded.

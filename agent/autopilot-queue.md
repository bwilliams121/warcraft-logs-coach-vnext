# Autopilot queue

The roadmap queue the project autopilot supervisor
(`scripts/autopilot/run-project.ps1`, guide: `agent/autopilot.md`) works
through, tranche by tranche.

This file is durable roadmap state and it is tracked. Transient runtime
state, such as the heartbeat, attempts, the merge ledger and locks, lives in
the gitignored `.probe/autopilot/`.

## Rules

- **Readiness.** A tranche is `READY` only when existing product intent,
  architecture and follow-ups already establish enough direction to implement
  it without guessing. A roadmap item that needs a product choice is
  `OWNER_DECISION_REQUIRED`, with the decision named in `ownerDecision`, and
  the supervisor stops there.
- **Selection.** The supervisor takes the first entry, in file order, that
  is `READY`, `IN_PROGRESS` or `PR_OPEN` and whose dependencies are all
  `MERGED`. A tranche is merged when this file says so, the supervisor's
  ledger records it, or GitHub shows its PR merged. It is verified, never
  assumed.
- **Identity.** `branch` is the tranche's stable identity. The default is
  `autopilot/<id in lower case>`. A restarted supervisor finds the existing
  branch or PR, resumes it, and never opens a second one.
- **Warcraft Logs.** `wcl` is `NONE` by default. Only an existing owner
  decision can authorize a request, written as
  `OWNER-GRANT: <where the decision is recorded>; <exactly what is
  authorized>`. "Continue the roadmap" is never such a grant. Until the audit can
  verify a request's scope, every detected request stops for the owner's
  confirmation, even under a grant.
- **Public contract.** `publicContract` is `NONE` or `EXPECTED`. A change
  under `src/contracts/`, `src/api/` or `src/mcp/` in a tranche that
  declares `NONE` stops the supervisor with `OWNER_DECISION_REQUIRED`.
- **Recording merges.** When a tranche merges, the supervisor records the
  PR number and merge SHA in its ledger. The NEXT tranche's PR writes them
  into this file. That keeps the record without opening a PR that exists
  only to update this file.
- **Concurrency.** It is 1. See `agent/autopilot.md` "Parallelism" for when
  2 could be enabled. Entries carry no lock, so that change needs only the
  supervisor.

Fields, in a fenced `autopilot` block under each `### <ID>: <title>`
heading:

| Field | Values |
| --- | --- |
| `status` | `BLOCKED`, `READY`, `IN_PROGRESS`, `PR_OPEN`, `MERGED`, `OWNER_DECISION_REQUIRED` |
| `dependsOn` | tranche ids, comma-separated, or `none` |
| `branch` | optional; the default is `autopilot/<id>` |
| `base` | optional; the default is `main`. A stacked tranche names its parent branch, and the supervisor merges only into main |
| `wcl` | `NONE`, or an `OWNER-GRANT:` as above |
| `publicContract` | `NONE` or `EXPECTED` |
| `ownerDecision` | the decision needed, or empty |
| `pr`, `mergeSha` | recorded when known |

requiredChecks: verify, corpus

## Queue

### M12-A: Healer Foundation, death timelines (internal)

```autopilot
status: MERGED
dependsOn: none
branch: m12-a-healer-foundation
wcl: NONE
publicContract: NONE
pr: 14
mergeSha: 57d11f905018ede0e76efc1b24d86e20e7169143
```

### M12-B: Healer Foundation, damage episodes (internal)

```autopilot
status: MERGED
dependsOn: M12-A
branch: m12-b-raid-damage-events
wcl: NONE
publicContract: NONE
pr: 15
mergeSha: d4798ef5378affb50b67f0cc39afe7250bfaf2e0
```

### M12-C: Healer Foundation, healing and absorbs received during damage episodes (internal)

```autopilot
status: MERGED
dependsOn: M12-B
branch: autopilot/m12-c
wcl: NONE
publicContract: NONE
pr: 18
mergeSha: b27317d6255c4db685ac6fa87b81c34ed0fc9cc8
```

**Direction.**

- `agent/architecture.md` "Healer Architecture": `src/healing/`
  reconstructs WHEN raid damage occurred and WHAT covered it, and lists
  other-healer coverage and absorbs.
- `agent/follow-ups.md` "After M12-B": "the next tranche (healing received
  during an episode, other-healer coverage) needs no new capture for this
  window".

**Scope.** A shared, internal, fact-only `src/healing/` primitive. For each
damage episode, it reports the healing and absorbs each affected roster
player received, by reported source, with per-category coverage.

- No totals (follow-up M1).
- No verdict on any healer.
- No spec-specific meaning.

**Evidence.** The archive segments committed in M12-B already retain every
heal and absorb in their window. Healer evidence follows the 2026-10-31
owner policy (agent/architecture.md "M12-B").

### PREP-5: The MCP tool description mentions consumable status

```autopilot
status: PR_OPEN
dependsOn: none
branch: autopilot/prep-5
wcl: NONE
publicContract: EXPECTED
```

**Direction.** `agent/follow-ups.md` "PRODUCT-INTENT GAP", in the "Still
open" list: "The MCP tool description does not yet mention consumable
status. The outputSchema advertises the field."

**Scope.** Describe, in the MCP tool's description text, the consumable
status every analysis already carries (PREP-2). The schema does not change.
This is the only public change, so `publicContract` is `EXPECTED`.

### M12-D: First healer specialization evaluator

```autopilot
status: OWNER_DECISION_REQUIRED
dependsOn: M12-C
wcl: NONE
publicContract: NONE
ownerDecision: Which healer specialization comes first, and which evidence-grounded verdict categories its v1 evaluator may issue (per-cast spell choice stays NO_AUTHORITY_AVAILABLE). This also decides where healing-cooldown identity lives: that spec module's runtime data.
```

**Direction.** Healer verdicts belong to `src/specs/<class>/<spec>/`
(CLAUDE.md "Role Module Boundary"). The architecture names no first healer
spec and no v1 verdict list.

### M12-E: Raid cooldown assignment input

```autopilot
status: OWNER_DECISION_REQUIRED
dependsOn: M12-C
wcl: NONE
publicContract: EXPECTED
ownerDecision: What an authoritative raid cooldown plan looks like as input (format, how it is supplied, and how a player and planned time are named). Without a plan, assignment analysis stays NO_AUTHORITY_AVAILABLE.
```

**Direction.** CLAUDE.md "Healer Cooldown Assignments" and
`agent/architecture.md` "Raid Cooldown Assignments" define the evaluation
outcomes. Neither defines the plan's input format or transport.

### M13-A: Augmentation Foundation

```autopilot
status: OWNER_DECISION_REQUIRED
dependsOn: none
wcl: NONE
publicContract: NONE
ownerDecision: Authorize (or supply) a Warcraft Logs capture of a fight with an Augmentation Evoker: no committed evidence contains one, and gathering it is a new Warcraft Logs request.
```

### M11-G4-5-R: Register a 12.1.5 simulation model

```autopilot
status: OWNER_DECISION_REQUIRED
dependsOn: none
wcl: NONE
publicContract: NONE
ownerDecision: Choose among the options recorded in agent/follow-ups.md "After M11-G4-5" (tank-load meaning under the 70575 data, the Blood validation-window basis, EU coverage).
```

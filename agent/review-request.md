# Review request

Rolling file: overwritten for each review cycle.

## Change

HEAL-A: Restoration Shaman registration and the healer finding shape
(internal). Branch `autopilot/heal-a`, from main at 03d967d.

- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or
  `src/mcp/` changes. The registration is INTERNAL_ONLY, so a public request
  for a Restoration Shaman is still SPEC_NOT_SUPPORTED and the plan
  disclosure still says `NO_PUBLIC_ASSIGNMENT_EVALUATOR`.
- **Warcraft Logs: NONE.** No request, probe or capture. Tests are synthetic,
  plus the already-committed evidence archive (b1PmaKrd6CDfzngc fight 48,
  actor 122, the M12-D subject).
- **Queue bookkeeping:** ONB-S6 is recorded MERGED (PR #44, 03d967dd…), and
  HEAL-A is set PR_OPEN. The other merged tranches the supervisor listed were
  already recorded MERGED with their pr and mergeSha.

## Direction

`agent/autopilot-queue.md` HEAL-A and `agent/follow-ups.md` "After M12-D".
The evaluator needed three things:

- a registration shape for an evaluator with no SimulationCraft authority;
- FULL_RAID derived from `RESTORATION_SHAMAN_REQUIRED_INPUTS`;
- a shared finding shape for ASSIGNMENT, COOLDOWN and HEALING_DECISION.

It also had to remove the unregistered-tree exceptions. The M12-D verdict
scope and the M12-E plan semantics are unchanged:

- HEALING_DECISION is NO_AUTHORITY_AVAILABLE;
- ASSIGNMENT is NO_AUTHORITY_AVAILABLE without a plan;
- COOLDOWN is observational.

## Design (agent/architecture.md "HEAL-A")

**Provider-less healer domains.** COOLDOWN_ASSIGNMENT, HEALING_COOLDOWN and
HEALING_DECISION join `PROVIDERLESS_DOMAINS`, by the M13-E mechanism:
declarable, never bindable, always NO_PINNED_AUTHORITY_FOR_DOMAIN.
COOLDOWN_ASSIGNMENT is provider-less because its only standard is the
caller's plan: per-request input, never a pinned artifact.

**Plan transport.** `SpecAnalysisInput.raidCooldownPlan` is new and
optional. Absent or `null` means no plan. The analysis service now passes
the request's plan through to the selected analyzer, untouched. No public
analyzer reads it.

**Shared healer finding shape** (`src/findings/healer-finding.ts`). It is
kept separate from the rotational `Finding`, and `DecisionCategory` stays
ROTATION.

- `categories` lists all three, in order:
  - ASSIGNMENT is NO_AUTHORITY_AVAILABLE (no plan, or another fight's plan),
    UNKNOWN (the binding cannot be established), or EVALUATED_AGAINST_PLAN,
    citing the plan;
  - COOLDOWN is OBSERVED, `WCL_OBSERVED_FACT`, with its listing completeness;
  - HEALING_DECISION is NO_AUTHORITY_AVAILABLE.
- `findings` holds the per-entry ASSIGNMENT results (OUTCOME, with the
  spec-owned outcome string and the shared two-member actionability, or
  UNKNOWN with its reason) and one COOLDOWN observation per use, which has no
  verdict field.
- `createHealerFindingSet` checks the authority rules rather than trusting
  them. It throws when:
  - an ASSIGNMENT finding exists without plan evaluation, or cites a
    different plan;
  - a COOLDOWN finding exists without an OBSERVED category;
  - an id is duplicated or a finding belongs to another specialization.
- No confidence, severity, score, HPS or plan-quality field exists.

**Registration** (`src/specs/shaman/restoration/registration.ts`,
INTERNAL_ONLY).

- Three capabilities are declared from REQUIRED_INPUTS, so the derived
  requirement is FULL_RAID. There are no bindings.
- **Envelope status, a decision for review.** The result is never ANALYZED,
  because ANALYZED cites pinned `AnalysisAuthorityMetadata` and a request's
  plan is not that.
  - AUTHORITY_NOT_AVAILABLE when the evaluator ran. It means "no pinned
    decision authority". Plan-backed findings carry their own authority.
  - INSUFFICIENT_EVIDENCE when the identity is not established or the data is
    unusable. The payload then says NOT_ASSESSED with the reason, never an
    empty finding set.
  - What the public status should be for a plan-evaluated healer result is
    recorded as HEAL-AP's decision ("After HEAL-A").
- **Identity** follows M13-E: the subject's stated specialization, plus the
  actor catalog's name for plan-name matching. The evaluator's identity input
  is narrowed to `RestorationShamanSubjectIdentity`, which `FightIdentity`
  satisfies, with a nullable name. With no known name, every unresolved plan
  entry may be the subject's, so it is UNKNOWN and never counted as another
  player's. This fail-closed fix bumps the evaluator revision to `/2`.
- **Projection** (`healer-findings.ts`) restates the evaluation and adds
  nothing. An entry for an unidentified ability is UNKNOWN
  ABILITY_NOT_REGISTERED.

**Guards.** The unregistered-tree list in `m11a2-cross-spec-isolation` is
now empty, and `m10a` expects `registration.ts`. The tree is a second
authority-free registered tree with no APL artifact. Every pin of the catalog
and partition now includes the seventh, INTERNAL_ONLY row. The corpus gains
the `SPEC_RESTORATION_SHAMAN` layer and two cases (187 cases, 782
assertions).

## Real evidence (actor 122, fight 48)

- **No plan:** AUTHORITY_NOT_AVAILABLE. ASSIGNMENT is NO_AUTHORITY_AVAILABLE
  with no assignment finding. COOLDOWN is OBSERVED and COMPLETE, with four
  facts (Ascendance 7,469,039 and 7,666,386; SLT 7,543,726 and 7,776,617).
  The evaluation equals the evaluator's under a preflight identity.
- **A test plan with the roster declared:**
  - `slt-1` is MET, with cast evidence and positive actionability;
  - `slt-200s` is UNKNOWN READINESS_NOT_ESTABLISHED;
  - `after-kill` is ASSIGNMENT_NOT_ACTIONABLE, with actionability
    NOT_EVALUATED and no evidence;
  - the Chain Heal entry is UNKNOWN ABILITY_NOT_REGISTERED;
  - one entry is another player's.

## Files

- **New:**
  - `src/findings/healer-finding.ts`
  - `src/specs/shaman/restoration/registration.ts` and `healer-findings.ts`
  - `tests/unit/healer-finding.test.ts`
  - `tests/unit/specs/restoration-shaman-registration.test.ts`
  - `tests/support/corpus/executors/spec-restoration-shaman.ts`
- **Changed source:**
  - `src/findings/authority-domain.ts`, `analysis-envelope.ts` and
    `spec-id.ts`
  - `src/services/analyzer-registry.ts`, `analysis-service.ts` (plan
    pass-through) and `raid-cooldown-plan-disclosure.ts` (comment)
  - `src/specs/shaman/restoration/evaluator.ts`, `spec.ts` and `README.md`
- **Pins:** registry and partition tests, call maps, corpus contract,
  executors, manifest generator, `manifest.json`, `report.json`, corpus
  README.
- **Docs:** `agent/architecture.md`, `follow-ups.md`, `testing.md`,
  `spec-onboarding-inventory.md` and `autopilot-queue.md`.

## Validation

- `npx tsc --noEmit` and `npx prettier --check .` are clean.
- The new and changed Restoration tests pass (68/68 on the first run).
- The node project: 10923 passed and 12 failed. All 12 are timeouts under
  full parallel load.
  - Of those files, the simulation runner tests, `m11a4-retribution-evaluator`
    and `m10c5b-final-audit` time out on an untouched main worktree on this
    machine too.
  - `m10d-protection-public-projection`, `m11g2-comparison-evidence` and
    `m9b-corpus-harness` pass when run alone.
- `node scripts/corpus/gate.mjs`: PASSED. Two workerd runs gave
  byte-identical reports (187/782), and the report is committed.
- `node scripts/corpus/gate.mjs --root evidence`: 16 cases and 42 assertions
  passed in both runs.

## Questions for the reviewer

1. Is AUTHORITY_NOT_AVAILABLE ("no pinned decision authority") the right
   internal envelope status when assignment findings were judged against a
   supplied plan, with the public meaning left to HEAL-AP?
2. Is the nullable subject name, which widens "may be this player", the right
   fail-closed rule for a facade that has no preflight name?

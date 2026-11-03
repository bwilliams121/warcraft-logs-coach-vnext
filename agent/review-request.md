# Review request

Rolling file: overwritten for each review cycle.

## Change

HEAL-AP: Restoration Shaman public promotion and the healer promotion gate.
Branch `autopilot/heal-ap`, from main at 3fce847.

- **Warcraft Logs: NONE.** No request, probe or capture. Real evidence is the
  committed archive only (b1PmaKrd6CDfzngc fight 48, actor 122, the M12-D
  subject).
- **Queue bookkeeping:** HEAL-A is recorded MERGED (PR #45, 3fce8475…), and
  HEAL-AP is set PR_OPEN. The other merged tranches the supervisor listed were
  already recorded MERGED with their pr and mergeSha.

## Public contract change (EXPECTED), all additive under `analysis/1`

1. **`specialization.specId` enum** gains `shaman/restoration` (appended),
   by the same precedent as every earlier promotion. Only Shaman/Restoration
   documents change: they were `SPEC_NOT_SUPPORTED` and are now
   `AUTHORITY_NOT_AVAILABLE` or `INSUFFICIENT_EVIDENCE`.
2. **New optional `healerFindings` block**, admitted only on
   `AUTHORITY_NOT_AVAILABLE` and `INSUFFICIENT_EVIDENCE` (the same two
   statuses as `supportObservations`), emitted only by a registration with a
   healer view (Restoration Shaman). Shape (`HealerFindingsSchema`):
   - `ASSESSED`: `revision: "healer-view/1"`, `identityData`
     (`RUNTIME_GAME_DATA`, dataset id and revision),
     `evaluatesHealingQuality: false` and `evaluatesPlanQuality: false`
     (literals);
   - `categories`, a tuple of exactly three:
     - ASSIGNMENT: `NO_AUTHORITY_AVAILABLE` (`NO_RAID_COOLDOWN_PLAN` or
       `PLAN_NOT_FOR_THIS_FIGHT`); `UNKNOWN` (`ENCOUNTER_BINDING_UNKNOWN`,
       citing the plan); or `EVALUATED_AGAINST_PLAN` (citing the plan, with
       `assignmentsForOtherPlayers`);
     - COOLDOWN: `OBSERVED`, `WCL_OBSERVED_FACT`, listing `COMPLETE` or
       `UNKNOWN` with reason;
     - HEALING_DECISION: `NO_AUTHORITY_AVAILABLE`
       (`NO_APPROVED_PER_CAST_HEALER_MODEL`);
   - `assignments`: per plan entry for the player. `ASSIGNMENT_MET` only with
     PROVEN actionability (the cast as evidence) and its window;
     `ASSIGNMENT_NOT_ACTIONABLE` only with NOT_EVALUATED actionability and its
     window; otherwise `UNKNOWN` with a frozen reason. There is no miss, early,
     late or plan-quality outcome. A refinement refuses any assignment result
     unless ASSIGNMENT is `EVALUATED_AGAINST_PLAN`;
   - `cooldownUses`: per observed use, with ability, time, position, cast
     evidence and `healingContext`, which is either `ROSTER_NOT_IN_SCOPE`, or
     `RECONSTRUCTED`: the reporting span, the listing completeness, and
     overlapping episodes with their coverage and per-player COUNT of subject
     healing and absorb events (never an amount) with HEALING and ABSORBS
     coverage. A use has no verdict field;
   - `NOT_ASSESSED`: reason `SUBJECT_SPECIALIZATION_NOT_STATED`,
     `IDENTITY_REFUSED` or `RUNTIME_DATA_UNAVAILABLE`.
3. **`raidCooldownPlan.assignmentEvaluation`** becomes a discriminated union.
   It keeps `{state: NOT_EVALUATED, reason}`, and the reason vocabulary gains
   `SUBJECT_NOT_ASSESSED`. It adds `{state: EVALUATED_IN_HEALER_FINDINGS}`.
   Documents of every other specialization are unchanged.
4. **TLDR and report `disclosures`** gain `HEALER_FINDINGS_NOT_SUMMARIZED` and
   `RAID_COOLDOWN_PLAN_NOT_SUMMARIZED`, with their sentences. The latter
   replaces `RAID_COOLDOWN_PLAN_NOT_EVALUATED` only when a healer judged the
   plan.
5. **MCP tool description** prose: the plan paragraph and the
   not-summarized sentence are updated. The Restoration Shaman `publicLimits`
   prose is new.

## Design (agent/architecture.md "HEAL-AP")

- **The five-site promotion**, exactly as for every earlier promotion. The
  internal-only set is empty again. The evaluator, facade and finding set are
  unchanged.
- **The healer view** (`src/findings/healer-view.ts`; the adapter is
  `src/specs/shaman/restoration/healer-view.ts`). An optional registration
  hook, `healerView`, with `healerViewOf` in the registry. It is built
  exactly as the M13-F support-observation view: ownership checked first,
  then the registration's own adapter. The view restates the HEAL-A finding
  set and joins each finding to the evaluator's facts. A finding it cannot
  join throws, and the service then returns INTERNAL_ERROR.
- **Envelope status decision** (recorded as HEAL-AP's in "After HEAL-A").
  `AUTHORITY_NOT_AVAILABLE` keeps its one meaning publicly: "no pinned
  decision authority". A caller's plan is request input, not a pinned
  artifact, so ANALYZED stays impossible. What the plan produced is said in
  `healerFindings` and in the disclosure (`withHealerAssignmentEvaluation`):
  - the binding comes first;
  - with no healer view, the reason stays `NO_PUBLIC_ASSIGNMENT_EVALUATOR`;
  - a NOT_ASSESSED view gives `SUBJECT_NOT_ASSESSED`;
  - a judging view gives `EVALUATED_IN_HEALER_FINDINGS`;
  - a disagreement throws, and the service returns INTERNAL_ERROR.
- **m5c1 sweep.** The public contract may contain `"ASSIGNMENT_NOT_ACTIONABLE"`
  exactly once, as the schema literal whose actionability is pinned
  NOT_EVALUATED (the evaluator's existing exception, extended by one file).
  The limits prose avoids the literal.

## The healer promotion gate

`tests/contracts/heal-ap-healer-promotion-gate.test.ts` is defined from
onboarding rule 3, separate from the rotational gates, which are unchanged.
The rotational gate test now pins two exempt rows (Augmentation and
Restoration Shaman) and states that a healer row is governed by the healer
gate.

Every PUBLIC row with a healer view needs a pinned real subject. Through the
public service, the subject must show:

- **Observations:** COOLDOWN OBSERVED and COMPLETE, with at least one use,
  and every use the subject's own completed cast.
- **Assignment:** a real MET whose proof is one of those uses, inside its
  window.
- **Discrimination:** on the same evidence, an identified-cooldown entry that
  is not met. Not-met outcomes carry NOT_EVALUATED actionability and no
  evidence. The disclosure says EVALUATED_IN_HEALER_FINDINGS.
- **Missing plan:**
  - no plan, or another fight's plan: NO_AUTHORITY_AVAILABLE with no
    assignment result;
  - a binding that cannot be proven: UNKNOWN.
- **Identity:**
  - another stated specialization: IDENTITY_REFUSED, and the disclosure says
    SUBJECT_NOT_ASSESSED;
  - an unstated subject: SUBJECT_SPECIALIZATION_NOT_STATED.
- **Completeness:**
  - CASTS coverage withdrawn: the listing and every cast-less entry are
    UNKNOWN CAPABILITY_UNVERIFIED, never READINESS_NOT_ESTABLISHED;
  - PLAYER_CONTEXT breadth: ROSTER_NOT_IN_SCOPE;
  - with the roster declared: RECONSTRUCTED with an UNKNOWN listing.
- **Negative controls:** none of these keys: hps, amount, total, rank, score,
  confidence, quality, `state`, `status`. No verdict word; a use carries facts
  only; HEALING_DECISION is NO_AUTHORITY_AVAILABLE.

**Real evidence, one disclosed fixture step.** The archive's names are
sanitized pseudonyms (`Actor122`), and the public plan parser accepts letters
only. The fixture (`tests/support/heal-ap-restoration-subject.ts`) therefore
re-labels the subject's pseudonym to `Subjectshaman` (unique in the roster;
actor id and events untouched) before a request names it. On the real
subject, the four plan entries give:

- MET (Spirit Link Totem at 7,543,726);
- UNKNOWN READINESS_NOT_ESTABLISHED (Ascendance, no cast in the window);
- the encounter-ended outcome;
- UNKNOWN ABILITY_NOT_REGISTERED (Chain Heal).

## Tests

- **New:**
  - `tests/contracts/heal-ap-healer-promotion-gate.test.ts` (7);
  - `tests/integration/heal-ap-restoration-shaman-public.test.ts` (10): REST
    and MCP give identical documents with one dispatch each at FULL_RAID, a
    field-for-field view, coverage disclosure, INTERNAL_ERROR on a refusing
    or contradicting view, the schema's refusals, and vocabulary parity;
  - `tests/support/heal-ap-restoration-subject.ts`.
- **Changed pins:** registry, partition, identity, catalog and transport
  pins now carry seven PUBLIC rows; the Restoration registration test; the
  rotational gate exempt set; the m5c1 exception; the corpus executors,
  manifest and report; the MCP description and plan-input tests; the
  M15-F disclosure lists; and two regression pins,
  `tests/regression/m10a-analyzer-result-ownership.test.ts` (the validated
  test catalog now needs the seventh public row) and
  `tests/regression/m10d-public-second-registration-invariance.test.ts`
  (seven PUBLIC rows, the INTERNAL_ONLY set empty, both lookups alike for
  Restoration Shaman).

## Validation

- `npm run typecheck`: clean. `prettier --check .`: clean.
- `npm run test:corpus`: PASSED, 187 cases / 782 assertions, two workerd
  runs byte-identical, committed report matches.
- Full `vitest run` (parallel, this machine): 12,208 passed, 22 failed. Two
  were real stale pins (the regression files above), now fixed and passing.
  The other 20 are timeouts (5 s / 20 s) and simulation temp-dir races
  under parallel load. Rerun serially, all pass except
  `m8g-encounter-context-composition` "byte-identical across…", which times
  out at ~6.0 s here **identically on origin/main** (checked in a clean
  worktree), so it is pre-existing machine slowness, not this change.
- Targeted rerun after the fixes (gate, public integration, corpus manifest
  and gate, m5c1, m6c, both regression files): 179/179 passed.
- `git diff --check`: clean.

## Questions for the reviewer

1. Is keeping `AUTHORITY_NOT_AVAILABLE` for a plan-judged healer result, with
   the plan's outcome carried in `healerFindings` and
   `assignmentEvaluation: EVALUATED_IN_HEALER_FINDINGS`, the right public
   meaning?
2. Does the healer gate hold the same quality bar as the rotational gates?
   Its discrimination is "a not-met identified entry on the same evidence",
   because MISSED is unreachable in v1 and the schema cannot express it.
3. Is re-labelling the sanitized pseudonym (identity by actor id unchanged)
   an acceptable fixture step for real-evidence plan tests?

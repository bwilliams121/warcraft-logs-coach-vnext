# Review request

Rolling file: overwritten for each review cycle.

## Change

HEAL-B4: Preservation Evoker (internal, own representative). Branch
`autopilot/heal-b4`, from main at 840f9fd.

A healer evaluator on the HEAL-B1 architecture, registered INTERNAL_ONLY. It
has its own identity gate (stated Evoker/Preservation), its own pinned
healing-cooldown identity, and its own provider-less registration (FULL_RAID
derived, never ANALYZED). The shared healer modules are used unchanged.

- **Warcraft Logs: NONE.** No request, probe or capture. The work reads only
  committed fixtures and files already retained under `.probe/` (the pinned
  SimC `trait_data.inc`, and the M11-C4f raw pages for the evidence census).
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or
  `src/mcp/` changes. Evoker/Preservation stays `SPEC_NOT_SUPPORTED` on every
  public path.
- **Queue bookkeeping:** HEAL-B3P is recorded MERGED (PR #52, 840f9fda…). Every
  other merged tranche the supervisor listed was already recorded MERGED.
  HEAL-B4 is set to PR_OPEN with its outcome. ONB-EV's owner decision now also
  lists Preservation Evoker as an evidence gap.

## Why it is its own representative, and what was decided

1. **Empowered casts (a wire fact pinned from committed bytes).** The M13-A
   capture (actor 8) records an empowered cast as `empowerstart`, then a
   `cast` of the same spell at that start, then `empowerend` at the release.
   For all six Dream Breaths the `cast` falls in the `empowerstart`'s
   millisecond. Of the three Fire Breaths, two do the same and one lands a
   millisecond later. A spell made instant (two Fire Breaths, each after Tip
   the Scales) records only the `cast`. So for an empowered spell, a `cast` is
   a start, not a completion, and the shared rule "a use is a completed
   `cast`" only holds for a spell that is not empowered.
   - No identified cooldown is empowered (Rewind 363534; Dream Flight 359816
     and Stasis 370537, which share a choice node).
   - The evaluator checks this against the evidence. If the player has an
     `empowerstart` or `empowerend` for an identified ability, the evaluation
     returns `RUNTIME_DATA_CONTRADICTED` (`IDENTIFIED_ABILITY_OBSERVED_EMPOWERED`),
     with the envelopes and their locators as evidence. Nothing is evaluated,
     nothing counts as a use, and no finding set is built. The registration
     returns INSUFFICIENT_EVIDENCE / NOT_ASSESSED `RUNTIME_DATA_CONTRADICTED`.
   - Another actor's envelopes are ignored. The envelopes stay envelope-only:
     there is no normalization change and no shared change.
2. **Role.** The pinned roster states Preservation's role as `UNKNOWN`, with
   `roleEvidence: null`. The module identity carries that `UNKNOWN` unchanged
   (pinned by tests). The healer families are declared by the registration,
   not derived from a role, and nothing reads or guesses a role.
3. **ONB-S4's anchor has landed, and it is not used.** No healer category
   anchors a decision: an assignment is judged on the completed cast, which is
   the decision for every identified ability here. The anchor's profile also
   has no empowered execution kind. A future empowered decision needs that
   kind first, and the wire fact above is its input
   (agent/follow-ups.md "After HEAL-B4").
4. **Stasis's release** is recorded as a `cast` of 370564. That spell is not
   identified, so a release is never a use, and an assignment window that holds
   only a release is ASSIGNMENT_UNKNOWN READINESS_NOT_ESTABLISHED, never MET.

## Real evidence (committed, checked against the raw bytes)

- M13-A Preservation Evoker (actor 8): Stasis at 176,828 and 272,401
  (released at 199,450 and 288,323) and Rewind at 284,626, with no empower
  envelope on an identified id. The capture is filtered, so the listing is
  UNKNOWN (INSUFFICIENT_COVERAGE) and the overlap is ROSTER_NOT_IN_SCOPE.
- The M13-A Augmentation Evoker (actor 1) is refused as
  NOT_THIS_SPECIALIZATION.
- HEAL-B4P cannot pass the healer gate on any evidence we already hold:
  fight 48 has no Preservation Evoker, and the retained M11-C4f fight
  (rXAf 13, actor 17) covers 165 s of a 271.8 s fight and holds only Stasis
  aura events for it, with no cast of an identified ability.

## Files

- New: `src/specs/evoker/preservation/{spec,evaluator,registration}.ts`,
  `README.md`; `src/data/game/evoker-preservation-healing-cooldowns.{json,ts}`
  (verbatim pinned trait rows, class 13, spec 1468);
  `tests/unit/specs/heal-b4-preservation-evoker.test.ts`;
  `tests/support/corpus/executors/spec-preservation-evoker.ts`.
- `src/findings/spec-id.ts` (`INTERNAL_ONLY_SPEC_IDS` gains
  `evoker/preservation`) and `src/services/analyzer-registry.ts` (a thirteenth
  row).
- Corpus: one layer `SPEC_PRESERVATION_EVOKER` and two cases
  (`build-manifest.mjs`, `manifest.json`, `report.json`, `contract.ts`,
  `executors.ts`), giving 199 cases and 794 assertions.
- The usual registration ripple across the contract, integration and regression
  pins: catalog lists, partitions, counts, and zero-call maps. Preservation is
  also added as a sixth case in the HEAL-B1 parametrized evaluator and
  registration tests.
- Docs: `agent/architecture.md` (new "HEAL-B4" section), `agent/follow-ups.md`
  ("After HEAL-B4"), `agent/testing.md`, `agent/spec-onboarding-inventory.md`
  (10 PUBLIC, 3 INTERNAL_ONLY, 27 NOT_STARTED), `agent/autopilot-queue.md`.

## Validation

- Focused: heal-b4, heal-b1 evaluators/registrations, and the touched contract
  files all pass. Typecheck is clean.
- `npm run test:corpus -- --write-report`: PASSED (199 cases / 794
  assertions, byte-identical across two workerd runs).
- Full `npm test`, `npm run format:check` and `git diff --check`: see the
  commit and CI.

## Review questions

1. Is a spec-owned contradiction check (stopping evaluation when an identified
   ability shows up empowered) the right fail-closed response, rather than
   only excluding those casts?
2. Is leaving ONB-S4's anchor unused, with an empowered execution kind
   recorded as a follow-up, an acceptable reading of "reuse ONB-S4's anchor if
   it has landed"?

🤖 Generated with [Claude Code](https://claude.com/claude-code)

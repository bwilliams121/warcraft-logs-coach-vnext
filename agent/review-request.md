# Review request

Rolling file: overwritten for each review cycle.

## Tranche

PREP-2: consumable status on every public report. Branch
`preparation-public-status`, from main at c2edfdc (PREP-1 merged).

## Owner decisions (2026-10-30; recorded in agent/architecture.md "PREP-2")

1. **Public field:** yes, now (additive on v1; public output changes,
   intentionally).
2. **Unsupported specializations:** retrieve the fight for preparation alone,
   at an accepted real Warcraft Logs cost per request.
3. **Definition:** the shared cooldown slot, as built in PREP-1.

## Intended change

1. **Public contract** (`src/contracts/analysis-contract.ts`).
   - `preparation` (optional in the schema, always emitted) in the common
     fields, so it is on EVERY status. The unanalyzed-variant rule is
     amended explicitly.
   - Shape:
     - `{assessment: ASSESSED, category, authority, identityData,
       statuses{healthPotion, healthstone, combatPotion}}`, or
       `{assessment: NOT_ASSESSED, reason}`;
     - each status is `{countState: OBSERVED, count, uses}` or
       `{countState: UNKNOWN, reasons, observedAtLeast, uses}`;
     - a use is `{spellId, name, timing, evidence}`.
   - The discriminators avoid the wire-banned `state` key.
2. **Projection** (`analysis-projection.ts`): field for field. Internal kinds
   are renamed to public keys, and the identity-load detail is dropped. A
   gate outside the public set fails closed.
3. **Service** (`analyzeFight`).
   - Both unsupported paths retrieve the fight once, with scope derived from
     `PREPARATION_REQUIREMENT` alone. The derived scope is passed in; there
     is no literal scope.
   - Preparation is ASSESSED, the analyzer never runs, and `scope` records
     the retrieval.
   - A failed retrieval or a changed report revision keeps
     SPEC_NOT_SUPPORTED, with preparation `NOT_ASSESSED (RETRIEVAL_FAILED)`
     and `scope: null`.
4. **Producer:** the `CONSUMABLE_UNKNOWN_CODES` and `CONSUMABLE_USE_TIMINGS`
   constants, used for pinning. `PreparationOutcome` gains
   `RETRIEVAL_FAILED`.
5. **Docs:**
   - README: the preparation section is now "implemented";
   - `agent/deployment-smoke.md` M10-5: expect the block, and budget the
     retrieval;
   - `agent/{architecture,follow-ups,testing,review-request}.md`.

## Tests changed because the owner decision superseded them

These pinned "unsupported spec = zero ingestion" or a null scope. They now pin
exactly one preparation-only retrieval (`PLAYER_CONTEXT`, no resources) and no
analyzer run; no other assertion was relaxed:

- `tests/unit/analysis-composition-refusals.test.ts` (3 tests);
- `tests/regression/m10d-public-second-registration-invariance.test.ts` (Arms
  Warrior: one retrieval, the public block ASSESSED);
- `tests/contracts/m6c-analysis-projection.test.ts` (unsupported scope);
- `tests/contracts/preparation-service.test.ts` (PREP-1's NOT_ASSESSED
  expectation, now three tests: retrieval, retrieval failure, report
  changed);
- corpus: the two APPLICATION_SERVICE unsupported cases expect scope
  `PLAYER_CONTEXT`.
  - The case id `…-retrieves-nothing` is renamed
    `…-retrieves-for-preparation-only` in `scripts/corpus/build-manifest.mjs`
    and all references.
  - The manifest is rebuilt, and the report regenerated from execution
    (only the id changes).
- `tests/contracts/m6a-mcp-layering.test.ts`: the projection's pinned import
  list gains the producer's type module.
- Per-spec public projection tests (Blood, Ret, Brewmaster, Protection):
  their expected envelopes build preparation exactly as the service does.

## New tests

`tests/contracts/preparation-public-projection.test.ts`:

- unsupported public result with all three statuses;
- UNKNOWN has no `count`;
- NOT_ASSESSED shape;
- no detail and no `state` leak;
- vocabularies pinned;
- a gate outside the public set fails closed.

## Validation

- **New and updated tests:**
  - public projection 6/6;
  - service 6/6;
  - refusals 21/21;
  - m10d invariance 13/13;
  - per-spec public projections, m6a and m6c: 180/180.
- **Corpus gate** (`npm run test:corpus -- --write-report`): PASSED. The
  report diff is only the renamed case id.
- **Analyzer digests unchanged:** 600/600 byte-identical (the internal
  analyzer outputs). The PUBLIC document changes by design (owner decision
  1).
- **Checks:** typecheck clean; prettier clean; `git diff --check` clean.
- **Full suite** (`npm test -- --maxWorkers=1 --testTimeout=30000`): 347
  files, 10,061 tests, all pass (1,028 s).

## External / network activity

None. No Warcraft Logs requests; fixtures only.

## Known limitations

- **Raid night.** Its public document has no per-player analyses, so
  consumable status there stays internal, and its unanalyzable players are
  still not ingested (follow-up).
- **No committed real use.** No committed fight contains a health potion or
  healthstone use.

## Staged / committed

Nothing is staged or committed.

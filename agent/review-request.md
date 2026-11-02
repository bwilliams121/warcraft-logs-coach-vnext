# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M13-E: Augmentation evaluator orchestration and registration (internal).
Autopilot queue entry M13-E. Branch `autopilot/m13-e`, from main at 423cb48.

- **Direction.** Queue entry M13-E and follow-ups "After M13-A" (not
  registered): register the Augmentation evaluator for internal analysis, its
  declared FULL_RAID requirement flowing into the DERIVED ingestion scope;
  results stay internal; SUPPORT_TARGETING stays NO_AUTHORITY_AVAILABLE; no
  targeting model; remove the unregistered-tree exceptions in the
  cross-spec-isolation guards.
- **Public contract: NONE.** No change under `src/contracts/`, `src/api/` or
  `src/mcp/`. No public document, raid-night cell or MCP description changes.
- **Warcraft Logs: NONE.** No request, probe or probe config was run.
- **Queue bookkeeping.** M13-D (#34, 423cb48) recorded MERGED; M13-E is
  PR_OPEN with its branch. Every other tranche the supervisor listed was
  already recorded MERGED with the same PR and SHA (verified).

## The problem

The registration model was built for observed-decision verification:

- an ANALYZED envelope must cite a decision authority its registration binds
  (`RESULT_CITES_FOREIGN_AUTHORITY`);
- a capability's domain had to be an `AuthorityDomain`, i.e. one a provider
  could bind;
- every registered tree owned an APL artifact.

The Augmentation evaluator has no decision authority at all, so it could not
be registered, and `AUGMENTATION_EVOKER_REQUIRED_INPUTS` (FULL_RAID) reached
no scope derivation.

## What changed

1. **Provider-less decision domains** (`src/findings/authority-domain.ts`).
   - `PROVIDERLESS_DOMAINS` = SUPPORT_TARGETING, SUPPORT_TIMING (CLAUDE.md
     "Decision Categories"); `DecisionDomain` = `AuthorityDomain` ∪ those.
   - A capability may declare one: `DecisionCapability<TDomain>` defaults to
     `AuthorityDomain`, so no existing specialization's types, payloads or
     corpus outputs change. Registrations hold the wide type.
   - Nothing can bind one. A binding's `domain` stays `AuthorityDomain`;
     `PROVIDER_DOMAIN_COMPATIBILITY` is unchanged (SIMC_APL →
     OFFENSIVE_ROTATION only); a forged binding fails catalog validation
     (`PROVIDER_DOMAIN_INCOMPATIBLE`); `resolveAuthorityForDomain` answers
     `NO_PINNED_AUTHORITY_FOR_DOMAIN` for a declared provider-less domain
     whatever the bindings say.
   - Kept OUT of `AUTHORITY_DOMAINS`, which each specialization's per-domain
     results enumerate, so no tank/Ret payload grew support rows.
2. **The registration** (`src/specs/evoker/augmentation/registration.ts`,
   new; INTERNAL_ONLY; `evoker/augmentation` added to `SpecId` and
   `INTERNAL_ONLY_SPEC_IDS`, not to `PUBLIC_SPEC_IDS`, the identity table or
   the contract enum).
   - Two capabilities (SUPPORT_TARGETING, SUPPORT_TIMING), both built FROM
     `AUGMENTATION_EVOKER_REQUIRED_INPUTS` (FULL_RAID; ACTORS, CASTS, AURAS,
     DEATHS; no resources; NO_TARGET). The requirement is derived FULL_RAID;
     `deriveIngestionScopeFor([registration, PREPARATION])` = FULL_RAID with
     the Augmentation analyzer contributing. No bindings.
   - Result: an UNANALYZED envelope with a spec-owned payload (`domains` read
     from the registration's own access, `subjectSpecialization`,
     `evaluation`).
     - `AUTHORITY_NOT_AVAILABLE`: the evaluator ran; no support decision has a
       standard, so none was evaluated; the observations ride along.
     - `INSUFFICIENT_EVIDENCE`: no stated specialization (a pet, an unlisted
       actor), a refused identity, or unusable pinned data. No fact.
     - Never ANALYZED: there is no decision authority to cite, and runtime game
       data (support-ability identities) is never presented as one. No
       observed-decision view (throws rather than returning an empty view).
   - Identity: `SpecAnalysisInput` has no preflight identity, so the facade
     feeds the evaluator's existing gate the fight's report code and fight id
     and the subject's M13-B `friendlySpecializations` entry, the same
     `friendlySpecs` entry preflight reads. The evaluator input type is
     narrowed to the fields the gate reads (`AugmentationSubjectIdentity`;
     `FightIdentity` still satisfies it, evaluator unchanged otherwise).
3. **Catalog.** `ANALYZER_REGISTRATIONS` lists the row (six rows, five
   PUBLIC). `analyzerForSpec` never selects it.
4. **Guards.** The `evoker/augmentation` unregistered-tree exception is
   removed from `m11a2-cross-spec-isolation` and `m10a-cross-spec-isolation`.
   `m11a2` names it as the one registered tree with no APL artifact
   (`AUTHORITY_FREE_REGISTERED_TREES`, asserted to be registered and to own
   no APL); every other registered tree still owns exactly one.
5. **Corpus.** New owning layer `SPEC_AUGMENTATION_EVOKER` (`SPEC_LAYER_OF`
   total over `SpecId`), assertion kind
   `SPEC_AUGMENTATION_EVOKER.REGISTRATION_RESULT` (NO_AUTHORITY_AVAILABLE
   class; driven through the internal lookup and `runAnalyzer`), and two
   cases: the registration over an unstated subject (FULL_RAID derived, both
   families NO_PINNED, INSUFFICIENT_EVIDENCE, no evaluator result) and
   `APPLICATION_SERVICE.INTERNAL_REGISTRATION` (internal yes, public null,
   identity unresolved). Manifest regenerated; `report.json` rewritten from
   the workerd execution (185 cases / 780 assertions).
6. **Docs.** Architecture "M13-E"; follow-ups "After M13-E" (and the M13-A /
   M13-B bullets it resolves); the Augmentation README; `spec-id.ts` and
   registry headers.

## Tests

- New `tests/unit/specs/augmentation-evoker-registration.test.ts` (12):
  - the row, its capabilities from REQUIRED_INPUTS, no bindings, derived
    FULL_RAID requirement and scope derivation;
  - support families NO_PINNED, OFFENSIVE_ROTATION DOMAIN_NOT_DECLARED; a
    forged SUPPORT_TARGETING binding refused by the catalog and ignored by
    resolution; the view throws;
  - real M13-A Evoker (archive) through the internal path:
    AUTHORITY_NOT_AVAILABLE whose `evaluation` deep-equals the evaluator's
    under a preflight identity; SUPPORT_TARGETING NO_AUTHORITY_AVAILABLE;
  - negatives: another stated specialization → IDENTITY_REFUSED
    NOT_THIS_SPECIALIZATION; a pet → NOT_IN_FRIENDLY_ROSTER, no evaluation;
    unusable data → INSUFFICIENT_EVIDENCE; a PUBLIC request for an
    Augmentation Evoker → SPEC_NOT_SUPPORTED, 0 Augmentation runs, only
    PLAYER_CONTEXT retrieved.
- Existing tests updated because the catalog/partition genuinely changed (no
  assertion weakened; several strengthened with the internal row's absence
  from public lookups):
  - partition pins (`m10a-spec-partition`, `m10d-public-registration`,
    `m11b2`, `m11c2`, `m11-promotion-evidence-gate`, which also now reports
    Augmentation's internal readiness: not ready, by design);
  - catalog snapshots (`m10a-registry-integrity`, `m10c-protection-authority-binding`,
    `m11a-registration-list-complete`, `m11a2-spec-module-conformance` with
    the M13-A archive identity evidence, `m11a2-spec-roster` 35 → 34,
    `m10d-public-second-registration-invariance`);
  - exhaustive call maps in the public transport and raid-night tests gain
    `evoker-augmentation-support-observations: 0`;
  - corpus pins (cases 183 → 185, assertions 778 → 780, layers, executor ring).

## Validation

- `npx tsc --noEmit`: clean. `npx prettier --check .`: clean.
  `git diff --check`: clean.
- Focused: the new registration test, the Augmentation evaluator test, all
  of `tests/contracts` and the corpus unit tests pass.
- `npm run test:corpus`: PASSED (two byte-identical workerd runs, committed
  report matches). `npm run test:evidence`: PASSED (unchanged).
- Full `npx vitest run`: 11740/11761. Every failure is a default-5 s timeout
  under machine load (STACK_TRACE_ERROR) plus the known load-dependent
  `runner-service-queue` W; rerun with `--testTimeout=180000` all pass except
  `m9b-corpus-harness` (Protection) and `runner-service-queue` W, which pass
  alone (the same pair noted in M13-D and M15-D).

## Decisions for the reviewer

1. **Provider-less domains instead of widening `AUTHORITY_DOMAINS`.** Adding
   the support families to `AUTHORITY_DOMAINS` would add two
   DOMAIN_NOT_DECLARED rows to every tank and Retribution payload and rewrite
   their corpus expectations, for questions those analyzers are never asked.
   A separate, never-bindable vocabulary keeps authority per decision
   category without touching other specializations.
2. **AUTHORITY_NOT_AVAILABLE, not ANALYZED.** The envelope status summarizes
   decision authority; with none for either family the honest status is
   AUTHORITY_NOT_AVAILABLE, and the observations are carried as facts in the
   payload. Making ANALYZED authority-optional would weaken the ownership
   check every other registration relies on.
3. **Identity from `friendlySpecializations`.** Same source and roster rules
   as preflight; refused or unstated identity yields no fact, never a default.

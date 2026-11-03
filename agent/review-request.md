# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M13-F: Public Augmentation support observations. Autopilot queue entry M13-F.
Branch `autopilot/m13-f`, from main at cda0e09.

- **Direction.** Queue entry M13-F; follow-ups "After M13-E" (no public shape;
  "when M13-F makes it reachable, the service derives FULL_RAID from the same
  requirement"); the M13-E comments in `spec-id.ts` and `registration.ts`
  ("its public shape is M13-F; until then the id stays here"); and the M13-E
  gate test ("this gate can never make it publishable as an observed-decision
  analyzer. Its public shape is M13-F's, not this gate's").
- **Warcraft Logs: NONE.** No request, probe or probe config was run.
- **Queue bookkeeping.** M13-E (#35, cda0e09) recorded MERGED; M13-F is
  PR_OPEN with its branch. Every other tranche the supervisor listed was
  already recorded MERGED with the same PR and SHA (verified).

## Public contract change (EXPECTED), precisely

All under `warcraft-logs-coach.analysis/1`, additive (no field removed, no enum
narrowed, no field changes meaning):

1. **`specialization.specId` enum widened** with `evoker/augmentation`
   (`src/contracts/analysis-contract.ts` `PUBLIC_SPEC_IDS`), the same additive
   widening as Protection, Retribution, Blood and Brewmaster.
2. **New optional `supportObservations` block**, admitted ONLY on
   `AUTHORITY_NOT_AVAILABLE` and `INSUFFICIENT_EVIDENCE` documents
   (`SupportObservationsSchema`); `ANALYZED`, `SPEC_NOT_SUPPORTED` and
   `PROFILE_NOT_RESOLVED` refuse it. Emitted only by a registration that
   publishes support observations (Augmentation). Shapes:
   - `ASSESSED`: `revision: "support-observations/1"`, `authority:
     WCL_OBSERVED_FACT`, `identityData {authority: RUNTIME_GAME_DATA,
     datasetId, artifactRevision}`, `evaluatesSupportQuality: false`
     (literal), `supportDecisions` (≥1), `allyBuffs`, `selfBuffs`,
     `supportCasts`.
   - `NOT_ASSESSED`: `revision`, `reason` ∈ SUBJECT_SPECIALIZATION_NOT_STATED,
     IDENTITY_REFUSED, RUNTIME_DATA_UNAVAILABLE.
   - `supportDecisions`: per family, ONLY NO_AUTHORITY_AVAILABLE (with its
     pinned reason) or, for SUPPORT_TARGETING, UNKNOWN (`modelId`, `missing
     {recipientActorId, evidenceCategory, reason}`). No evaluated variant
     exists, so no recipient-quality or timing conclusion can be expressed.
   - Every list carries completeness (`COMPLETE` / `OBSERVED_ONLY` /
     `UNKNOWN` with reason); a support time is `AT_LEAST` (ms + ≥1 caveat) or
     `UNKNOWN` (caveats, no number); survival is positive-only
     (`NO_DEATH_OBSERVED`, never "alive"); cooldown identity carries
     `REVIEWED_SUBSET`. No `state` key (the contract reserves it).
   - New frozen vocabularies: `PUBLIC_SUPPORT_*` (not-assessed reasons,
     evidence reasons = `UNKNOWN_REASONS`, unobserved-bound reasons,
     continuity reasons, window/cast listing reasons, specialization-unknown
     reasons, actor types, cooldown criteria, support-time caveats, evidence
     categories = `EVIDENCE_CATEGORIES`).
3. **Document changes for an Evoker/Augmentation identity**: previously
   `SPEC_NOT_SUPPORTED` with `specId: null`; now `AUTHORITY_NOT_AVAILABLE` (or
   `INSUFFICIENT_EVIDENCE`), `specId: evoker/augmentation`, `analyzerId:
   evoker-augmentation-support-observations`, `gameplaySupported: true`
   (unchanged meaning: an analyzer ran), plus `supportObservations`. TLDR
   and report: `GAMEPLAY_NOT_ANALYZED` headline/disclosure (unchanged code).
4. **MCP tool descriptions** (`src/mcp` text derived from the catalog, no
   code change there): the supported-specializations sentence now names
   Augmentation Evoker, and its author-written limits paragraph (analysis and
   raid-night) says it is observation-only, evaluates no decision, never
   judges a recipient or timing, and does not score.
5. **Raid night**: an Evoker cell is now dispatched (AUTHORITY_NOT_AVAILABLE,
   no decisions, no support block). Other players' cells are unchanged (see
   change 5 below).

No other specialization's document changes. No file under `src/api/` or
`src/mcp/` changed.

## What changed

1. **Five-site promotion** (`spec-id.ts` partition — internal-only set empty
   again; contract enum; identity table; `satisfies PublicSpecId` in
   `spec.ts`; `exposure: "PUBLIC"`). Reachability only: facade, evaluator and
   result unchanged; the service derives FULL_RAID from the registration's
   declared requirement ∪ preparation's (proven live).
2. **Support-observation view** (`src/findings/support-observation-view.ts`,
   new): the unanalyzed counterpart of the observed-decision view. Optional
   `supportObservationView` on `AnalyzerDefinition` / `AnalyzerRegistration`
   / `SpecModuleDefinition`, wrapped with the ownership check like the
   decision view, copied by `snapshotRegistration`.
   `supportObservationViewOf(catalog, analysis)` in the registry finds the
   owner, checks ownership, returns `null` when none is published.
3. **Augmentation adapter** (`src/specs/evoker/augmentation/support-observation-view.ts`,
   new): field-for-field copy of the evaluator's result. Throws on
   `ALLY_STATE_SUFFICIENT` (no public form for a model's conclusions). Reads
   the support primitives' types THROUGH the evaluator, so `src/support/` and
   the recipient-cooldown registry keep their single named consumer.
4. **Service / contract / projection.** `FightAnalysis.supportObservations`
   (optional) set from the view on unanalyzed results; a throwing view →
   `INTERNAL_ERROR`, never a quieter document. Schema and field-by-field
   projection as above.
5. **Raid night per-player breadth** (`raid-night-service.ts`). Each focused
   view's scope is now derived from THAT player's analyzer requirement ∪
   preparation (preparation alone when unanalyzable) — the single-fight
   derivation — instead of the fight-level union. Without this an Evoker in
   a fight would have widened every other player's view to FULL_RAID. For
   every other specialization the value is the same PLAYER_CONTEXT as before.
   Owned-pet evidence keeps its fight-level union (unchanged; follow-up).
6. **Promotion-evidence gate scope** (test-owned). PUBLIC mode evaluates
   PUBLIC registrations that bind a decision authority. A registration that
   binds none can never return an ANALYZED result that passes ownership, so
   it publishes no decision; the exempt set is pinned to exactly
   Augmentation, with only provider-less domains, every one
   NO_PINNED_AUTHORITY_FOR_DOMAIN, and a support view.
7. **Corpus**: the M13-E app-service case is re-pinned
   (`…-is-public-since-m13-f`: both lookups the same row, PUBLIC, identity
   resolves) and the Augmentation spec executor now requires the public
   lookup to find the same row. Report regenerated (one caseId line).
8. **Docs**: architecture "M13-F", follow-ups "After M13-F" (+ resolved
   bullets in After M13-E / After M13-A), Augmentation README, queue.

## Tests

- New `tests/integration/m13f-augmentation-public-observations.test.ts` (12):
  real M13-A Evoker through the real service and BOTH transports — one
  dispatch per transport, FULL_RAID both times, REST ≡ MCP, schema-valid,
  AUTHORITY_NOT_AVAILABLE, no decisions/coverage; supportObservations equal
  the adapter's projection of the evaluator's own result; both families
  NO_AUTHORITY_AVAILABLE; every ally-buff listing OBSERVED_ONLY on the real
  capture; support time never exact, UNKNOWN never numeric; TLDR/report
  GAMEPLAY_NOT_ANALYZED, PARTIAL; no verdict words, no `state` key, no
  internal revisions. Negatives: contextless capture → INSUFFICIENT_EVIDENCE
  + NOT_ASSESSED (never an empty list); ALLY_STATE_SUFFICIENT → adapter
  throws and a throwing view → INTERNAL_ERROR; a declared model missing ally
  state → UNKNOWN with what is missing, and the two refusals cannot share a
  shape; the schema refuses evaluated/quality-bearing decisions,
  `evaluatesSupportQuality: true`, numeric UNKNOWN, caveat-less AT_LEAST,
  and the block on other statuses; vocabularies pinned to internal arrays.
- New `tests/regression/m13f-mixed-raid-night.test.ts` (2): Brewmaster cell
  identical alone and beside an Evoker, and each analyzer handed its OWN
  breadth (Brewmaster PLAYER_CONTEXT, Augmentation FULL_RAID) — this
  assertion FAILS on the pre-M13-F raid-night code (verified by reverting);
  Evoker cell not ANALYZED, night schema-valid.
- Updated because the partition genuinely changed (no assertion weakened):
  partition/identity/enum pins, catalog snapshots, injected catalogs now
  carry the sixth public row (the validator requires every public id),
  requirement lists gain the FULL_RAID Augmentation entry, supported-sentence
  pins, `analysis-composition-refusals` uses Evoker/Devastation as the Evoker
  miss, the M13-E registration test now proves the public dispatch
  (1 run, FULL_RAID, AUTHORITY_NOT_AVAILABLE + supportObservations), the
  m6a projection-imports pin adds the shared view module.

## Validation

- `npx tsc --noEmit`: clean. `npx prettier --check` on changed files: clean.
  `git diff --check`: clean.
- `npm run test:corpus`: PASSED (report regenerated; one caseId line).
- Every previously failing file rerun in isolation: pass, except
  default-5 s timeouts.
- Full `npx vitest run`: 11782/11800. All 18 failures are default-5 s
  timeouts (STACK_TRACE_ERROR) in heavy files (m10d projections, m7f
  raid-night, m8g, m9b harness, simulation runner).
- Baseline: the same full run on a clean `git archive origin/main` tree on
  this machine: 11737 passed, 24 failed, all the same default-5 s timeouts —
  a superset of this branch's 18 (the branch adds no new failing test).
- `npm run test:evidence`: PASSED (unchanged).
- Full run with `--testTimeout=180000`: 11799/11800. The one failure is the
  `m9b-corpus-harness` Protection timeout already noted in M13-D and M15-D,
  which passes when run alone (it did here).

## Decisions for the reviewer

1. **Promotion, not a side channel.** The M13-E code and follow-ups name
   M13-F as the step that makes the registration reachable and moves the id.
   A side channel (keeping SPEC_NOT_SUPPORTED and running an internal-only
   registration for a public request) would break the tested invariant that
   no public request runs an INTERNAL_ONLY row.
2. **Gate scoped by authority binding.** The gates measure decisions; a
   registration with no binding cannot publish one. Scoping by binding (and
   pinning the exempt set by name) keeps every decision analyzer gated.
3. **No new TLDR/report content.** They already disclose
   GAMEPLAY_NOT_ANALYZED for this status; summarizing support facts there is
   presentation work (follow-up), and must never rank them as findings.
4. **`gameplaySupported: true`** keeps its documented meaning (an analyzer
   ran); the status, TLDR and detail state that no decision was evaluated.

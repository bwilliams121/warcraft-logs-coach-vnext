# Review request

Rolling file: overwritten for each review cycle.

## Change

HEAL-B4P: Preservation Evoker (public). Branch `autopilot/heal-b4p`, from main at
e450968.

Preservation Evoker passes the HEAL-AP healer promotion gate on a real whole-fight
subject and becomes PUBLIC through the five-site edit.

- **Warcraft Logs: NONE.** No request or probe. Everything is cut offline from raw
  captures already retained under `.probe/`.
- **Public contract: EXPECTED, two additive values under `analysis/1`.**
  1. The `specId` enum gains `evoker/preservation`.
  2. `PUBLIC_HEALER_NOT_ASSESSED_REASONS` gains `RUNTIME_DATA_CONTRADICTED`
     (decision 3 below).
  The derived supported-specializations sentence and limits list gain Preservation
  Evoker, so the MCP tool descriptions change. Nothing else in `src/contracts/`,
  `src/api/` or `src/mcp/` changes.
- **Queue bookkeeping:** HEAL-B4 is recorded MERGED (PR #53, e4509684…). Every other
  merged tranche the supervisor listed was already recorded MERGED. HEAL-B4P is set
  to PR_OPEN with its outcome. ONB-EV's owner-decision text drops Preservation
  Evoker and corrects Restoration Druid (see below).

## What was decided

1. **A census correction, which is why this promotes rather than stopping.** HEAL-B4
   and HEAL-B3P said no retained evidence could supply a Preservation Evoker. Their
   censuses read M11-E2, M10-B, M10-C5 and M11-C4f. Parsing every retained raw page
   file found:
   - gtKb2xHn87pNcFfW fight 22 (284,791 ms) is retained whole in three adjoining
     captures, each COMPLETE, actor-unfiltered, at revision 22: M9-C2 opener
     [2,415,041 .. 2,435,041], M11-C4 [.. 2,580,041], M11-C4b [.. 2,699,832]. Actor 15
     is its Preservation Evoker (`friendlySpecs` Preservation in the committed
     context; combatantinfo specID 1468). It is the only whole-fight capture of one,
     so choosing it selected no outcome.
   - HEAL-B4's statement that M11-C4f actor 17 has no identified cast was wrong: the
     pages hold two Stasis casts. That capture is still only 165 s of 271.8 s.
   Both errors are corrected where they were recorded.
2. **The cut retains empower envelopes**: `--families
   cast,begincast,empowerstart,empowerend`. The earlier healer cuts used
   `cast,begincast`. This evaluator's contradiction check reads the envelopes, so a
   cast-only cut would grant CASTS COMPLETE while withholding the check's input, and
   the check would pass vacuously.
3. **`RUNTIME_DATA_CONTRADICTED` is published as itself.** The healer view had three
   NOT_ASSESSED reasons and HEAL-B4 added a fourth internally. Mapping it to
   `RUNTIME_DATA_UNAVAILABLE` would state something false: the data loaded, and the
   player's own events contradict it. The envelopes stay internal; the public result
   is INSUFFICIENT_EVIDENCE with the reason and detail.
4. **Restoration Druid is recorded, not promoted.** The same captures hold gtKb fight
   22 actor 2 whole (384 cast and begincast events, including Tranquility twice and
   Convoke the Spirits five times), so HEAL-B1P's "no retained evidence" is wrong too.
   This tranche corrects the inventory and ONB-EV and adds no queue entry
   (agent/follow-ups.md "After HEAL-B4P"). Discipline Priest is unaffected: that fight
   has none.

## Gate subject (real, raw-checked)

gtKb fight 22 actor 15: Stasis at 2,418,645, 2,516,125 and 2,625,623; Rewind at
2,515,073; listing COMPLETE. Stasis releases (370564) at 2,445,251, 2,539,064 and
2,652,153 are never uses. Its 25 empowerstarts include none on an identified ability.
Plan entries: Rewind MET (2,515,000 ± 2 s), Rewind not met (2,600,000 ± 3 s), Stasis
after the encounter's end (2,710,000), and Dream Breath (really cast at 2,444,195,
not identified). The gate's checks are unchanged in substance. The Evoker's roster
role stays UNKNOWN and nothing reads it.

## Files

- Sites: `src/findings/spec-id.ts`, `src/contracts/analysis-contract.ts`,
  `src/services/spec-identity.ts`, `src/specs/evoker/preservation/{spec,registration}.ts`
  (`exposure`, healer view, limits prose), `README.md`. Also
  `src/findings/healer-view.ts` (the reason) and `src/services/analyzer-registry.ts`
  (comments). The evaluator, data and revision are unchanged.
- Evidence: three new artifacts under `tests/evidence/artifacts/wcl-events/`
  (123,153 bytes, ordinary archive growth, pinned in
  `tests/unit/m11c4e-evidence-archive.test.ts`), `scripts/corpus/build-manifest.mjs`,
  both manifests and reports, `tests/evidence/README.md`.
- Gate: `tests/contracts/heal-ap-healer-promotion-gate.test.ts`,
  `tests/support/heal-ap-restoration-subject.ts` (a subject's context id is now a
  parameter, defaulting to fight 48's).
- Pin ripple across contract, integration, regression and unit tests: public lists,
  counts, the sentence, requirement sets, and a Preservation demotion row.
- `tests/unit/specs/heal-b4-preservation-evoker.test.ts`: the whole-fight real
  evidence test and the contradiction view test.
- Corpus: two Preservation cases re-pinned; the service case's id inverted to
  `...-is-public-since-heal-b4p`.
- Docs: `agent/architecture.md` ("HEAL-B4P"), `agent/follow-ups.md` ("After HEAL-B4P"),
  `agent/testing.md`, `agent/spec-onboarding-inventory.md` (11 PUBLIC, 2 INTERNAL_ONLY,
  27 NOT_STARTED), `agent/autopilot-queue.md`.

## Validation

- Focused gate, Preservation and archive tests pass; typecheck is clean.
- `npm run test:corpus -- --write-report` and `npm run test:evidence -- --write-report`:
  PASSED. The evidence archive is 25 cases and 69 assertions.
- Full `npm test`: see the commit and CI. Locally the only failures are 5 s and 20 s
  timeouts in files this tranche does not concern, the known load-dependent failures
  on this machine, plus the two report comparisons that the regenerated reports fix.

## Review questions

1. Is publishing `RUNTIME_DATA_CONTRADICTED` as a new additive reason right, rather
   than mapping it onto `RUNTIME_DATA_UNAVAILABLE`?
2. Is recording the Restoration Druid correction without promoting it or adding a
   queue entry the right scope for this tranche?
3. Does the three-capture cut (M9-C2, M11-C4, M11-C4b), joined by adjacency with
   exclusive `--from` bounds, support the COMPLETE listing the gate relies on?

🤖 Generated with [Claude Code](https://claude.com/claude-code)

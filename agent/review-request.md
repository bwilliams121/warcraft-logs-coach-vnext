# Review request

Rolling file: overwritten for each review cycle.

## Change

HEAL-B2P: Holy Priest (public). Branch `autopilot/heal-b2p`, from main at
b2658f2.

- **Warcraft Logs: NONE.** No request, probe or capture. The new evidence is
  two segments cut offline by `scripts/sanitize-probe.mjs` from the retained,
  authorized M11-E2 raw capture (`.probe/m11e2/pages.json`, b1PmaKrd6CDfzngc
  fight 48), exactly as HEAL-B1P cut actors 1 and 9.
- **Public contract: EXPECTED, additive under `analysis/1`.** Precisely:
  - `PUBLIC_SPEC_IDS` in `src/contracts/analysis-contract.ts` (the public
    `specId` enum) gains `"priest/holy"`, appended last; no existing value
    moves or changes.
  - A public request whose subject Warcraft Logs states as Priest/Holy now
    resolves (identity table) and dispatches the Holy Priest row instead of
    `SPEC_NOT_SUPPORTED`. It publishes `healerFindings` in the existing HEAL-AP
    shape (no schema change): `AUTHORITY_NOT_AVAILABLE` when evaluated,
    `INSUFFICIENT_EVIDENCE` otherwise, never `ANALYZED`.
  - The derived supported-specializations sentence (REST/MCP tool
    description) gains "Holy Priest" (code-point order, after Holy Paladin),
    and `PUBLIC_SPECIALIZATION_DESCRIPTIONS` gains Holy Priest's limits prose
    (analysis and raid night), copied from HEAL-B1P's wording.
  - Raid-night cells for a Holy Priest become `AUTHORITY_NOT_AVAILABLE` (or
    `INSUFFICIENT_EVIDENCE`) with no healer findings and no plan, as for the
    other public healers. Discipline and Shadow stay `SPEC_NOT_SUPPORTED`.
- **Queue bookkeeping:** HEAL-B2 recorded MERGED (PR #49, b2658f25…);
  HEAL-B2P set PR_OPEN with branch and outcome. Every other merged tranche
  the supervisor listed was already recorded MERGED with its pr and mergeSha.

## The gate (unchanged in substance)

`tests/contracts/heal-ap-healer-promotion-gate.test.ts` gains one pinned
subject; every check passes through the public service:

| Check | Holy Priest, fight 48 actor 2 |
| --- | --- |
| OBSERVATIONS | 3 Apotheosis (7,470,226, 7,595,502, 7,721,342) + 3 Divine Hymn (7,509,640, 7,640,275, 7,761,154); listing COMPLETE |
| ASSIGNMENT | MET Divine Hymn 7,509,000 ± 2 s; not-met Apotheosis 7,650,000 ± 3 s; one after the encounter's end; Flash Heal (unidentified) |
| MISSING PLAN / IDENTITY / COMPLETENESS / NEGATIVE CONTROLS | pass, same checks as the three other public healers |

Its fifteen Divine Hymn pulse casts (64844) are never uses, pinned on the
real bytes in `tests/unit/specs/heal-b2-holy-priest.test.ts`.

## Code

- Five-site promotion, one edit: `src/findings/spec-id.ts`
  (`INTERNAL_ONLY_SPEC_IDS` = `druid/restoration` alone), the contract enum,
  `src/services/spec-identity.ts`, `satisfies PublicSpecId` in
  `src/specs/priest/holy/spec.ts`, `exposure: "PUBLIC"` in
  `src/specs/priest/holy/registration.ts`.
- The registration gains `holyPriestHealerViewOf` (delegating to the shared
  `healerViewOfEvaluation`) and `HOLY_PRIEST_LIMITS`, both copies of HEAL-B1P's
  shape. Evaluator, data and revision (`holy-priest-evaluator/1`) unchanged.

## Evidence

`tests/evidence/artifacts/wcl-events/wcl-b1pm-fight-48-holy-priest-2-casts.seg-{0-180,180-345}.json`
(265 + 214 events, 137,685 bytes): every cast/begincast sourced by or
targeting actor 2, whole fight, `--actor-slice 2 --families cast,begincast
--compact`. Grants CASTS for actor 2 only (its pet is not retained). Manifest
records added as a third subject in the HEAL-B1P block of
`scripts/corpus/build-manifest.mjs`, with two normalization census cases.
Ordinary archive growth (19,265,924 bytes with frames), pinned; the archive
without the two owner exceptions stays under its 4 MiB line.

## Tests

- Gate subject (above); new whole-fight real-evidence test in
  `heal-b2-holy-priest.test.ts`; Holy Priest flips to PUBLIC in
  `heal-b1-healer-registrations` (public lookup, identity table, prose, view,
  dispatch).
- Corpus: `application-service.holy-priest-registration-is-internal-only`
  re-pinned as `…-is-public-since-heal-b2p` (inverted expectation, as
  HEAL-B1P did); the `SPEC_HOLY_PRIEST` executor now requires the public
  lookup to find the same row.
- Pin ripple (no assertion weakened): public id lists, enabled analyzers and
  requirements (nine to ten), supported sentence, catalog arrays in test-built
  catalogs (now including Holy Priest, plus a demoted-Holy-Priest refusal
  case), internal-only set, identity tests (Priest/Holy resolves; Shaman/Holy
  and Druid/Holy added as unsupported nearest misses), healer exemption lists
  in the rotational gate, archive and report counts.

## Validation

- `npm run typecheck`, `npm run format:check`: clean.
- Full `npx vitest run`: 12,598 passed, 22 failed, 21 of them 5-60 s timeouts
  in load-sensitive suites and one simulation-queue cleanup check. Rerun of
  all 28 affected files at two workers: 357/357 passed. The remaining
  `m8g-encounter-context-composition` "byte-identical…" times out alone too,
  identically on main with this change stashed.
- `node scripts/corpus/gate.mjs --write-report` and `--root evidence
  --write-report`: PASSED (both double-run workerd byte-identical); reports
  regenerated from execution.
- Focused: the gate (25), heal-b2 (9), heal-b1 registrations, archive tests:
  pass.

## Not established (follow-ups "After HEAL-B2P")

Healing context stays UNKNOWN (cast-only subject); the pet's casts are not
retained; the pseudonym is re-labelled for the plan. The shared healer
registration helper ("After HEAL-B2") is not done here: it would rewrite four
reviewed registrations inside a one-specialization promotion, so it is
recorded as its own refactor before any further healer copies the shape.

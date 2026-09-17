# Named follow-ups

Work that is deliberately NOT being done inside the milestone that discovered it,
recorded so it is a decision rather than a thing everyone stopped noticing.

Each entry states what is true today, why it was not fixed in place, and what
"done" would look like. Nothing here is a bug in shipped behaviour; these are
hygiene and clarity items.

---

## TEST-HYGIENE: make the normal offline test suite independent of production `.dev.vars`

**Raised:** M7-F closeout (2026-09-15). **Do after:** M7 closeout.

### What happens today

`npm test` runs two Vitest projects. The `workers` project uses
`@cloudflare/vitest-pool-workers` pointed at `wrangler.jsonc`, and that pool reads
`.dev.vars` as part of building the Miniflare environment. The run prints:

```text
Using secrets defined in .dev.vars
```

once per worker. `.dev.vars` is gitignored and, on a developer machine, normally
holds real Warcraft Logs client credentials.

### Why this is not currently dangerous

- `vitest.config.ts` sets an `outboundService` that answers **every** outbound
  request from workerd locally, so no test can reach Warcraft Logs even if it
  tried — in CI, on a laptop, with or without credentials.
- The pool config declares explicit sentinel bindings
  (`fake-client-id-not-real`, `fake-client-secret-not-real`,
  `fake-analysis-token-not-real`), and tests that matter construct their own
  `Env` objects rather than relying on ambient ones.
- Regression tests sweep responses and headers for credential sentinels.

### Why it is still worth fixing

"Nothing can escape" is a property of one config line, and the failure mode it
guards against is not hypothetical: during M7-B a positional file filter caused a
credential-loading probe config to run and spend real API points. The normal test
command should not be reading a production credential file at all — defence in
depth should not depend on remembering that the outbound guard is there.

Recording it accurately rather than calling it ideal: it is **acceptable today,
and not the arrangement we want**.

### What done looks like

The default `npm test` run does not read `.dev.vars`, and says so in its output.
Possible shapes, none chosen yet:

- point the pool at a committed, credential-free vars file for tests;
- give the test config its own wrangler environment with no secret loading;
- or keep the pool's loading but prove, by test, that no loaded value reaches an
  `Env` any test uses.

Whatever the shape, the credential-loading probe config
(`vitest.probe.config.ts`) must stay separate and must stay the only thing that
can spend Warcraft Logs points.

### Explicitly out of scope

This is not an invitation to redesign the test runner, the two-project split, or
the Miniflare bindings while doing it.

---

## M9-C: corpus follow-through

**Raised:** M9-B closeout (2026-09-15). **Resolved in M9-C (2026-09-15)** except
where marked.

- Done: `npm run test:corpus` (`scripts/corpus/gate.mjs`) and a separate CI
  job; the gate also still runs inside `npm test`.
- Done: implementation-level mutation proofs (M3 cursor, M4 absence gate, M6/M8
  parity); the M4 mutation was uncaught and produced a new case.
- Decided: `tests/fixtures/wcl/preflight-payloads.ts` stays a synthetic
  mutable builder outside the corpus (see `tests/corpus/README.md`); real
  identity resolution is corpus-pinned over real master data.
- Still open: `tests/support/raid-night-orchestration-fixture.ts` normalizes
  the D2 artifact under its own window; the raid-night and encounter-context
  parity executors accept only the D2 artifact and say so. M9-C added
  `fightFacts` so the subject pull's encounter facts can be stated, but the
  window is still the fixture's own.
- Every M9-B evidence gap now carries a disposition in
  `tests/support/corpus/report.ts` and `tests/corpus/report.json`.

## PRODUCT-INTENT GAP: preparation / consumable status is not implemented

**Raised:** M11-A Phase 1 audit (2026-09-17). **Owner:** not yet assigned; not
M11-A.

`CLAUDE.md`, `agent/product-intent.md`, `agent/architecture.md` and `README.md`
all require every analysis report to carry a status for health-potion,
healthstone and combat-potion usage (`UNKNOWN` under incomplete coverage,
never omitted). Today no preparation analyzer exists under `src/`, schema
`warcraft-logs-coach.analysis/1` has no consumable or preparation field, and
`agent/deployment-smoke.md` step M8-5's consumable check cannot be performed
against the current output. The README now labels the requirement as product
intent not yet implemented, so no document claims the status is emitted.

Done looks like: a shared preparation analyzer running as a parallel finding
producer, an additive (optional, therefore schema-v1-compatible) public field
carrying the three statuses, and contract tests proving the category is never
omitted and never reads zero from `PARTIAL`/`ABSENT` coverage. Making the field
required is a schema-v2 decision. None of that is M11-A work.

## After M10-D: the internal-only partition is dormant

**Raised:** M10-D (2026-09-18).

Both known specializations are PUBLIC and `INTERNAL_ONLY_SPEC_IDS` is empty.
The partition, `requirePublicSpecId`, `InternalSpecExposureError`, the
registry's `INTERNAL_ONLY` exposure and `internalAnalyzerForSpec` are kept as
the on-ramp for the next specialization, which is expected to arrive as an
internal-only id first, exactly as Protection Paladin did in M10-A. Until
then `PUBLIC_EXPOSURE_OF_INTERNAL_SPEC` has no reachable subject, and the
proofs that once used a test-owned internal-only row live on the two real
registrations (`tests/support/catalog.ts`,
`tests/regression/m10d-public-second-registration-invariance.test.ts`). The
milestone that adds the next id must re-prove the internal-only path over its
real registration before exposing it (the M10-C pattern) — nothing here should
be deleted on the grounds that it is unexercised.

Two identity/evidence caveats M10-D surfaced, both outside its scope:

- A Warcraft Logs identity naming a supported specialization over another
  class's events dispatches the real analyzer and yields `ANALYZED` with
  zero eligible decisions (every cast excluded) or `PROFILE_NOT_RESOLVED`.
  That was true of Assassination before M10-D and is now two-sided.
  `IDENTITY_CONFLICT` detection remains M15's; tests and smoke checks must
  never pair a supported identity with another class's evidence.
- `agent/deployment-smoke.md` Part II step M8-5 names actor 5 as the
  Protection Paladin; the committed A7R6 master data has actor 5 as an
  Evoker (Preservation) and actor 7 as the Protection Paladin, and the step
  expects consumable categories schema v1 does not carry. Part III supersedes
  it with actors 7 (Protection) and 4 (Warrior/Arms).

## After M9-C: evidence the corpus still lacks

**Raised:** M9-C closeout (2026-09-15).

Every remaining gap has a canonical owner (`KNOWN_EVIDENCE_GAPS`,
`tests/corpus/report.json`):

- **M10 (Protection Paladin):** the decision-level tank capture, which must
  retain every interrupt by the player (`no-interrupt-events` — the first
  capture milestone whose subject has an interrupt in its supported surface).
- **M11 (broader DPS corpus expansion):** `assassination-corpus-breadth` — a
  wipe, a pre-pull window that retains the Stealth application so an opener
  decision can resolve, the low-bracket subject's own slice from the gtKb
  kill (actor 8, 8 %, has performance provenance but no events), and a
  decision on whether a bounded cast-to-application tolerance is sound for
  combo-point DoTs (the gtKb report records Rupture's applydebuff one
  millisecond after its cast, and `bindDotRemains` refuses).
- **M12 (death-event and dispel/triage behaviour):**
  `no-death-or-dispel-events`. Not M10: a tank capture may contain a dispel,
  but healer triage semantics are not a tank question.
- **M14 (targetability and temporal root-cause consumers):**
  `no-targetability-or-intermission` — the targetability event shape; real
  intermission PHASE transitions are already committed.
- **M15 (identity and product maturity):** `no-identity-conflict-capture` —
  `IDENTITY_CONFLICT` is a result state nothing produces or consumes; detection
  and propagation are unimplemented, so the gap is OUTSIDE_CURRENT_CAPABILITY
  until M15 implements them and owns their evidence.
- A verbatim upstream failure BODY (rate-limit or 5xx from Warcraft Logs) is
  not captured and will not be: provoking one means spending or exhausting
  quota. The transport's classification of each is pinned by unit tests; the
  corpus models the failure class over real pages.
- The A7R6 events captures list `sourceActorId: 19` and `PLAYER_CONTEXT`; the
  fight-context capture is recorded `FULL_RAID` because master data is
  report-wide. Neither is a claim about ingestion scope derivation.

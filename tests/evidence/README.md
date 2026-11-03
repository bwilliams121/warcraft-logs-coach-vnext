# Evidence archive (M11-C4e)

Qualifying real evidence retained for **promotion verification**, kept apart
from the executable regression corpus in `tests/corpus/`.

The two roots share one artifact and case schema (`tests/support/corpus/contract.ts`)
and one provenance vocabulary. They have different responsibilities.

| | Regression corpus (`tests/corpus/`) | Evidence archive (`tests/evidence/`) |
| --- | --- | --- |
| Purpose | executable regression fixtures | qualifying real evidence, verification only |
| Loaded by | every corpus run (`npm run test:corpus`, `npm test`) | its own command (`npm run test:evidence`) and the promotion evidence gate |
| Artifact kinds | any (`SANITIZED_CAPTURE`, `DERIVED_FROM_CAPTURE`, `SYNTHETIC`) | `SANITIZED_CAPTURE` only |
| Per artifact | 512 KiB | 512 KiB |
| Total | 5.5 MiB notice line (test), 6 MiB ceiling (loader) | 4 MiB notice line (test) over artifacts plus committed `selection-frames/**`, no total ceiling; crossed once, by owner review, for the M11-E2 fixture only (below) |
| Assertion families | all registered kinds | evidence verification only: the four `NORMALIZATION` census kinds, `NORMALIZATION.BUNDLE_COMPOSITION`, and a specialization's `DECISION_COVERAGE`, `COVERAGE_SUMMARY`, `MEASUREMENT_DISTRIBUTION` and `STATE_EVIDENCE_CENSUS` |
| May reference | itself only | itself and the regression corpus |
| Report | `tests/corpus/report.json` | `tests/evidence/report.json` |

## Rules the loader enforces

- **One id namespace.** An artifact id or case id may appear in only one root,
  whatever the bytes. A duplicate is an error.
- **One-way references.** An archive case may read regression-corpus artifacts,
  for example an archive bundle that starts with a corpus opener. A
  regression-corpus case may never read the archive. The corpus loader never
  sees the archive, and when the two are validated together a corpus reference
  to an archive id is `CORPUS_REFERENCES_ARCHIVE`.
- **Real evidence only.** Archive artifacts are `SANITIZED_CAPTURE`. A
  `DERIVED_FROM_CAPTURE` or `SYNTHETIC` artifact anywhere in a decision's
  evidence set, in either root, disqualifies it as promotion OBSERVATION
  evidence. Negative controls (M11-C4h) are derivations and therefore live in
  the regression corpus, never here.
- **Not a second regression corpus.** Every archive case must read at least one
  archive artifact, and every archive assertion must belong to the evidence
  verification families. Adding a family is a reviewed change to the list in
  `contract.ts`, which a test pins.

## Owned-pet slices and compact bytes (M11-E2.1)

An artifact may declare `provenance.actorSlice`: it is the
`scripts/sanitize-probe.mjs --actor-slice-with-owned-pets` predicate. The
actor scope is a focus plus every actor whose WCL master-data `petOwner` is
exactly the focus. The scope is derived from a named, committed fight-context
artifact, never chosen by hand.

The loader re-derives the scope on every load. It refuses
(`ACTOR_SLICE_INVALID`) when:

- the focus cannot be resolved;
- the catalog's ownership is contradictory;
- the derived set differs from the declared set;
- a grant's actor scope is not exactly focus + owned;
- a retained event lies outside the predicate or the granted range;
- the declared activity split does not match the events;
- a grant names a category whose families were not all retained. For example,
  there can be no HEALING grant when `heal` was excluded.

Archive artifacts may be compact JSON. `--compact` on the slicer and on
`sanitize-payloads.mjs` changes whitespace only. Without the flag, both tools
produce the same bytes as before, so no earlier artifact changes.

The canonical Blood Death Knight fixture is seven segments plus its context.
It crosses the 4 MiB notice line under a recorded, owner-reviewed exception
for that fixture only, pinned to the byte by a test. See
`m11e2-blood-death-knight-b1pm-fight-48.md`.

The M11-G1 observed-performance and elite-cohort evidence is seven sanitized
report and ranking surfaces, with no events. Third-party identities are
pseudonyms. See `m11g1-cohort-capture.md`.

The M11-G2 comparison-fight evidence is the three G1 cohort fights at E2 parity: 25 owned-pet segments, three contexts, three table surfaces and one NPC surface. It has its own one-time, byte-pinned size exception. The captures were server-filtered and certify no category, so every slice withholds its grants. See `m11g2-comparison-capture.md`.

## Friendly-players slices and healer evidence (M12-B)

**Owner direction (2026-10-31).** Healer evidence is split between the two
roots:

- The full real evidence needed to establish healer behavior belongs here.
- The regression corpus keeps its 5.5 MiB line and takes only the smallest
  deterministic fixture derived from that evidence. Its remaining capacity is
  treated as exhausted.
- Evidence is never weakened, and context never discarded, to fit.
- If several healer slices each need a genuinely minimal fixture that cannot
  fit, that becomes a measured proposal to the owner. The line is never
  raised preemptively for one tranche.

**The slice mode.** An artifact may declare `provenance.actorSlice` with mode
`FIGHT_FRIENDLY_PLAYERS`. That is the
`scripts/sanitize-probe.mjs --friendly-players-slice` predicate (revision
`sanitize-probe-8`): every event sourced by or targeting one of the named
fight's Warcraft Logs `friendlyPlayers`, read from a committed fight context.
The roster is never typed by hand.

The loader re-derives the roster on every load and refuses
(`ACTOR_SLICE_INVALID`) when any of these hold:

- the fight is listed other than once;
- an id is not exactly one `Player` in the master data;
- the declared roster differs from the derived one;
- the slice names another fight;
- a grant's scope is not exactly the roster;
- a retained event lies outside the predicate or the granted range;
- the activity split does not match;
- a grant names a category whose families were not retained.

A bundle of such slices composes into a FULL_RAID fight whose
`friendlyActorsInScope` is that roster.

**M12-B evidence.** `wcl-b1pm-fight-48-friendly-players.seg-*` is three
compact segments (974,973 bytes) of the M11-E2 capture.

- They cover fight +69.5 s to +77.0 s, with damage, heal, absorb and death
  families for all twenty friendly players.
- They grant DAMAGE, HEALING and ABSORBS for the roster.
- This is ordinary archive growth, named and pinned by
  `tests/unit/m11c4e-evidence-archive.test.ts`. Without the M11-E2 and
  M11-G2 exceptions the archive stays under its 4 MiB line.
- No new Warcraft Logs request was made.

**M12-D evidence.** `wcl-b1pm-fight-48-restoration-shaman-122-casts.seg-*`
is two compact `--actor-slice` segments (119,216 bytes) of the same capture.

- Together they cover the whole fight: every `cast` and `begincast` sourced
  by or targeting actor 122, the canonical Restoration Shaman.
- They grant CASTS for actor 122 only. Its totems' own casts are not
  retained.
- The bundle, with the committed fight context as its catalog, is what the
  Restoration Shaman evaluator's real-evidence tests read.

**HEAL-B1P evidence.** `wcl-b1pm-fight-48-holy-paladin-1-casts.seg-*` and
`wcl-b1pm-fight-48-mistweaver-monk-9-casts.seg-*` are four compact
`--actor-slice` segments (403,697 bytes) of the same capture, cut exactly as
M12-D's.

- Each pair covers the whole fight: every `cast` and `begincast` sourced by or
  targeting actor 1 (the canonical Holy Paladin) or actor 9 (the canonical
  Mistweaver Monk).
- They grant CASTS for their own actor only. Pets' own casts are not retained.
- Each bundle, with the committed fight context as its catalog, is a healer
  promotion gate subject (`tests/contracts/heal-ap-healer-promotion-gate.test.ts`).
- Ordinary archive growth, pinned in the same test. No new Warcraft Logs
  request was made.

**HEAL-B2P evidence.** `wcl-b1pm-fight-48-holy-priest-2-casts.seg-*` is two
compact `--actor-slice` segments (137,685 bytes) of the same capture, cut
exactly as HEAL-B1P's.

- Together they cover the whole fight: every `cast` and `begincast` sourced
  by or targeting actor 2, the canonical Holy Priest.
- They grant CASTS for actor 2 only. Its pet's own casts are not retained.
- The bundle, with the committed fight context as its catalog, is the healer
  promotion gate's Holy Priest subject.
- Ordinary archive growth, pinned in `tests/unit/m11c4e-evidence-archive.test.ts`.
  No new Warcraft Logs request was made.

**ONB-A1 evidence.** `wcl-b1pm-fight-48-havoc-demon-hunter-18-decisions.seg-0-90` is one compact
`--actor-slice` segment (364,068 bytes) of the M11-E2 capture.

- Every `cast`, `begincast`, `combatantinfo`, aura transition and `resourcechange` sourced by or
  targeting actor 18, the fight's Havoc Demon Hunter, over the fight's first 90 s of 345 s.
- It grants CASTS, AURAS, RESOURCES and COMBATANT_INFO for actor 18 over that range, and each grant is
  whole: no event of those families in the range is omitted.
- Only that window is committed: the whole fight is about 1.3 MB and the archive had 0.39 MB left under
  its notice line. The line is not raised silently (agent/follow-ups.md "After ONB-A1").
- Ordinary archive growth, pinned in the same test. No new Warcraft Logs request was made.

**HEAL-B4P evidence.** `wcl-gtkb-fight-22-preservation-evoker-15-casts.seg-*` is
three compact `--actor-slice` segments (123,153 bytes) of the three adjoining
retained captures of gtKb fight 22 (M9-C2 opener, M11-C4, M11-C4b), each
retrieved COMPLETE with no actor filter at revision 22.

- Together they cover the whole fight: every `cast`, `begincast`,
  `empowerstart` and `empowerend` sourced by or targeting actor 15, the
  fight's Preservation Evoker. The envelopes are retained because that
  evaluator's contradiction check reads them.
- They grant CASTS for actor 15 only.
- The bundle, with the regression corpus's fight context as its catalog, is the
  healer promotion gate's Preservation Evoker subject.
- Ordinary archive growth, pinned in the same test. No new Warcraft Logs request
  was made.

## Server-filtered event streams (M13-A)

A source query may be `FILTERED_EVENT_STREAMS`: several event streams of one
fight window, each a `dataType` family and optionally a verbatim
`filterExpression`, merged into one artifact by a recorded rule. Every such
stream is a server filter, so the artifact retains no coverage; the loader's
`FILTERED_CAPTURE_GRANTED` rule refuses any grant, exactly as for
`actorFilter`.

**M13-A evidence.** `wcl-m13a-fight-context-aug1-fight-1` and the two
`wcl-m13a-aug1-fight-1-support.seg-*` segments (504,031 bytes): the one
owner-authorized Augmentation Evoker capture, pseudonym `M13AAUGAAAAAAAAA`.
Casts, the three support auras and deaths over the whole fight, granting
nothing. Ordinary archive growth, pinned in
`tests/unit/m11c4e-evidence-archive.test.ts`. See
`m13a-augmentation-capture.md`.

**M13-D evidence.** `wcl-m13d-certification-tables-aug1-fight-1` (62,316
bytes): Warcraft Logs tables for the same M13-A fight. They are the trusted
side of the completeness certificates. The artifact grants no category
coverage. Certified predicate coverage is computed from it and the M13-A
segments by reviewed code (`src/engine/evidence/filtered-capture-certification.ts`),
never claimed in the manifest. Ordinary archive growth. See
`m13d-certification.md`.

## Execution and promotion

`npm run test:evidence` (`scripts/corpus/gate.mjs --root evidence`) runs four
steps:

1. Regenerates the archive manifest with `node scripts/corpus/build-manifest.mjs --root evidence`.
2. Runs the archive's Node tests.
3. Executes every archive case twice, in two separate workerd processes, and
   requires byte-identical reports.
4. Holds the result against the committed `tests/evidence/report.json`.

`--write-report` writes that report from the execution, never by hand.

The promotion evidence gate (`tests/contracts/m11-promotion-evidence-gate.test.ts`,
reading `tests/support/corpus/promotion-evidence.ts`) accepts a qualifying real
`MATCH` or `REJECTED` from either root for its OBSERVATION half (and a real
`REJECTED` for its DISCRIMINATION half; a negative control is the other
discrimination route, M11-C4h), under unchanged rules:

- the whole evidence set is `SANITIZED_CAPTURE`, resolved across both roots, to
  exactly one holder per id;
- identity is proven from a committed fight-context artifact;
- the case's own root's committed report records the assertion `PASSED`.

A root with cases but no committed report fails the gate.

## Selection-frame privacy policy (approved; for future evidence campaigns)

A neutral second-subject campaign walks a fixed candidate population (see the
M11-C4c and C4d reviews). When that frame is committed, it is committed as
follows:

- **Unselected candidates:** rank, fight ID, fight start time, duration, raid
  size, and the SHA-256 of the report code. No report code in clear, no name,
  no server, no guild.
- **Candidate walk:** for each candidate examined, its hashed identity, the
  eligibility facts read (encounter, difficulty, kill, duration, game and log
  version, Brewmaster actor ids, hero-tree result) and the reason it was
  rejected.
- **Selected subject:** its report code in clear, where evidence provenance
  requires it, exactly as for every captured subject in the corpus.

The raw ranking snapshot (`.probe/m8-rankings-shape.json`) is not committed.
No second-subject campaign has been run.

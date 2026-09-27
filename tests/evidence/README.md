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
| Total | 5.5 MiB notice line (test), 6 MiB ceiling (loader) | 4 MiB notice line (test) over artifacts plus committed `selection-frames/**`, no total ceiling |
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

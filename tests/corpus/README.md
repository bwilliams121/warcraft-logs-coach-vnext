# Regression corpus (M9)

Deterministic, offline evidence for regression testing, with provenance that
says exactly what each file can and cannot prove.

This directory holds DATA and POLICY only. The machinery that validates and
executes it lives in `tests/support/corpus/`:

| File | Role |
| --- | --- |
| `contract.ts` | contract version, vocabularies, manifest schema, assertion registry |
| `loader.ts` | deterministic loading, integrity and lineage validation |
| `executors.ts` | one executor per EXECUTABLE assertion kind, driving the real layer |

Nothing under `src/` may import any of it. `tests/contracts/m9a-corpus-layering.test.ts`
enforces that, and enforces that the corpus machinery reaches no transport,
clock, filesystem or environment.

---

## Layout

```text
tests/corpus/
    README.md            this document
    .gitattributes       pins LF under the root
    manifest.json        the index: every artifact, every case
    artifacts/           evidence bytes, digest-pinned, never rewritten by tooling
        wcl-events/      WCL event arrays (bare arrays, as the slicer writes them)
        wcl-graphql/     decoded GraphQL `data` objects
```

`manifest.json` is formatted by Prettier like any other file. `artifacts/` is
listed in `.prettierignore`: an artifact's bytes are its identity, and no tool
may reflow them after the digest is taken.

Contract version: **1**. The loader reads exactly this version and rejects any
other (`CONTRACT_VERSION_UNSUPPORTED`). Bumping it is a reviewed migration.

---

## Two records, kept apart

### Artifact — bytes plus provenance

An artifact is one file and the account of where it came from:

- `artifactId`, `path` (corpus-relative, under `artifacts/`), `encoding`
  (`JSON` | `RAW_TEXT`), `payloadKind` (`WCL_EVENT_ARRAY` |
  `WCL_GRAPHQL_DATA` | `JSON_VALUE` | `RAW_TEXT`)
- `sha256` and `byteLength` over canonical bytes (see *Integrity*)
- `provenance`:
  - `kind` — lineage classification (below)
  - `parentArtifactId` — for derivations
  - `source` — the capture the bytes come from: report code, fight, **report
    revision at capture**, source actor, encounter, difficulty, capture date,
    `gameVersion` / `logVersion`, ingestion scope, the exact retrieval query,
    the source capture's **pagination and completeness facts**
    (`eventsReturned`, `pagesRetrieved`, verbatim `nextPageTimestamp`, state,
    and where that evidence is written down), capture tooling identity, and
    whether the raw capture was retained (it never is; `.probe/` is gitignored)
  - `transformations` — every step between the source capture and this file,
    each with tooling, an invocation, a description, and the claims it
    **invalidates**
  - `retainedCoverage` — the report-time ranges this artifact still fully
    covers after every transformation. Only these may be granted as coverage
    when a fight is built from it
  - `retainedFor`, `limitations`

Metadata that was not recorded is never `null` and never guessed. It is one
of three markers, because they mean different things:

| Marker | Meaning | Remedy |
| --- | --- | --- |
| `UNAVAILABLE` | could have been recorded, was not | re-capture with better tooling |
| `REDACTED` | recorded, deliberately removed for publication | none — it exists and is not here |
| `NOT_APPLICABLE` | has no meaning for this artifact | none |

Capture timestamps are corpus metadata. They never appear in analyzer output.

### Case — a claim about an artifact, owned by one layer

- `caseId`, `artifactId` — many cases may point at one artifact; the payload
  is never duplicated
- `owningLayer` — one of `WCL_TRANSPORT`, `NORMALIZATION`, `COMBAT_STATE`,
  `SPEC_ASSASSINATION`, `APPLICATION_SERVICE`, `PUBLIC_CONTRACT`. Each maps to
  real source roots in `contract.ts`, and a case may only use assertion kinds
  its layer owns (`CASE_ASSERTION_LAYER_MISMATCH`)
- `contractUnderTest` — the module/contract the claim is about
- `purpose` — **descriptive prose, never executed**
- `assertions` — **the executed part**: registered kinds with typed parameters
- `rationale` — `basis` from `OWNED_CONTRACT` | `VALIDATED_EVIDENCE` |
  `PINNED_AUTHORITY`, plus text. "This is what the code currently outputs" is
  deliberately not a basis
- `authority` — required when any assertion kind is authority-dependent:
  `authorityId`, `artifactRevision`, and the `requiredStateEvidence` the
  verdict needs. The revision must equal the committed authority artifact's
  (`CASE_AUTHORITY_REVISION_STALE` otherwise). Re-pinning SimulationCraft
  invalidates every authority-dependent expectation until it is re-verified
- `limitations`, `relatedTests`

---

## Lineage classification

Classification follows what was DONE to the bytes, not what they look like.

| `kind` | Meaning | Required | Forbidden |
| --- | --- | --- | --- |
| `REAL_CAPTURE` | bytes exactly as returned by Warcraft Logs | `source` | any transformation |
| `SANITIZED_CAPTURE` | a real capture after selection / redaction / remapping. Every event was observed | `source`, ≥1 sanitizing transformation | mutation, injection, removal |
| `DERIVED_FROM_CAPTURE` | a capture deliberately CHANGED to construct a condition. Not evidence the condition occurred | `parentArtifactId`, ≥1 deriving transformation that lists `OBSERVED_BEHAVIOUR` as invalidated | `source` (reached via the parent) |
| `SYNTHETIC` | hand-authored | — | `source`, `parentArtifactId` |

A mutated real capture is `DERIVED_FROM_CAPTURE`, never `SANITIZED_CAPTURE`.
The loader rejects the mislabel in both directions. No `REAL_CAPTURE` is
committed today: raw probe output stays in gitignored `.probe/`.

Transformation kinds: `SUBSET_SELECTION`, `IDENTIFIER_REMAP`,
`FIELD_REDACTION` (sanitizing); `VALUE_MUTATION`, `EVENT_INJECTION`,
`EVENT_REMOVAL` (deriving); `CREDENTIAL_SHAPE_SCAN`, `LEGACY_FIXTURE_COPY`
(neutral, recorded so the step is on file).

Claims a transformation can invalidate: `WINDOW_COVERAGE`, `ABSENCE_PROOF`,
`CROSS_EVENT_CONTINUITY`, `PAGINATION_BEHAVIOUR`, `OBSERVED_BEHAVIOUR`,
`ORIGINAL_IDENTIFIERS`.

**Trimming is a transformation.** A slice records `SUBSET_SELECTION` and
retains no coverage unless a contiguous range provably survived. Coordinates
(report, fight, window) do not establish completeness — the page facts do,
and a slice that no longer contains the page boundary cannot prove a
pagination behaviour.

---

## Integrity

`sha256` and `byteLength` are computed over **canonical bytes**: the file's
UTF-8 bytes with `\r\n` folded to `\n`. That is the only transformation the
loader ever applies, it is applied on the way to the digest only, and it
cannot touch payload content — JSON forbids a raw carriage return inside a
string, so CRLF is always whitespace. It exists because `core.autocrlf=true`
checkouts would otherwise fail every digest on identical evidence.
`.gitattributes` pins LF as well.

A digest proves **identity**: these are the bytes the manifest describes. It
does not prove authenticity (that Warcraft Logs returned them) or completeness
(that nothing is missing). Those are provenance claims and are only as good as
the recorded transformations.

The loader never sorts, deduplicates, repairs or normalizes an artifact. Equal
timestamps, non-monotonic arrays, actor `0`, the `-1` sentinel and page
boundaries pass through untouched. Corpus STRUCTURE is validated; combat
validity is not — a deliberately malformed Warcraft Logs payload is a valid
artifact when a case tests its rejection. An artifact declared `JSON` must
parse; one declared `RAW_TEXT` need not.

---

## Loader rules

All rules run; every failure is reported with its code and the artifact or
case it was found on. `MANIFEST_MISSING`, `MANIFEST_NOT_JSON`,
`CONTRACT_VERSION_UNSUPPORTED` and `MANIFEST_SHAPE_INVALID` stop early because
nothing after them is meaningful.

| Rule | Code |
| --- | --- |
| ids unique | `ARTIFACT_ID_DUPLICATE`, `CASE_ID_DUPLICATE` |
| one file, one artifact | `ARTIFACT_PATH_DUPLICATE` |
| path relative, forward-slashed, no `.`/`..`, under `artifacts/` | `ARTIFACT_PATH_OUTSIDE_ROOT` |
| file present | `ARTIFACT_FILE_MISSING` |
| bytes match | `ARTIFACT_BYTE_LENGTH_MISMATCH`, `ARTIFACT_DIGEST_MISMATCH` |
| size ceilings | `ARTIFACT_TOO_LARGE`, `CORPUS_TOO_LARGE` |
| every file under `artifacts/` is referenced | `CORPUS_FILE_UNREFERENCED` |
| encoding/kind coherent, JSON parses, kind shape holds | `ARTIFACT_NOT_JSON`, `ARTIFACT_ENCODING_KIND_MISMATCH`, `ARTIFACT_PAYLOAD_KIND_MISMATCH` |
| lineage coherent | `PROVENANCE_*` (source required/forbidden, parent required/forbidden/unknown/cycle/synthetic, kind matches transformations, derivation admits `OBSERVED_BEHAVIOUR`, retained coverage within the source window) |
| case references resolve | `CASE_ARTIFACT_UNKNOWN` |
| assertions registered, typed, layer-owned, payload-compatible | `CASE_ASSERTION_KIND_UNKNOWN`, `CASE_ASSERTION_PARAMS_INVALID`, `CASE_ASSERTION_LAYER_MISMATCH`, `CASE_ASSERTION_PAYLOAD_KIND_MISMATCH` |
| authority pinned and current | `CASE_AUTHORITY_REQUIRED`, `CASE_AUTHORITY_UNKNOWN`, `CASE_AUTHORITY_REVISION_STALE` |

Determinism: artifacts and cases are returned in code-point order of their
ids, independent of manifest order and of how the filesystem listed files.
The committed corpus is bound at build time by `import.meta.glob`, so the
loader needs no `node:fs`, runs identically under plain Node and workerd, and
cannot see outside the corpus root. Digests use Web Crypto. There is no live
Warcraft Logs access and no fixture refresh path.

---

## Assertions

`contract.ts` registers every assertion kind: owning layer, outcome class,
compatible payload kinds, a strict parameter schema, and whether it is
`EXECUTABLE` (an executor exists in `executors.ts` and it counts as coverage)
or `DECLARED` (validated and reported, **not** counted). There is no free-form
or executable assertion in a manifest; adding a question means adding a kind,
an executor, and tests for both.

Outcome classes: `POSITIVE_FACT`, `NEGATIVE_FACT`, `UNKNOWN`,
`NO_AUTHORITY_AVAILABLE`, `UNSUPPORTED`, `REJECTION`, `PARITY`. `UNKNOWN` and
`NO_AUTHORITY_AVAILABLE` are separate classes and no kind accepts one in
place of the other; the UNKNOWN kind's `reason` parameter is the state
layer's own `UnknownReason` enum, which has no `NO_AUTHORITY_AVAILABLE`.

Kinds registered in M9-A:

| Kind | Layer | Class | Execution |
| --- | --- | --- | --- |
| `NORMALIZATION.EVENT_COUNT_PRESERVED` | NORMALIZATION | POSITIVE_FACT | EXECUTABLE |
| `NORMALIZATION.SOURCE_ABSENCE` | NORMALIZATION | POSITIVE_FACT | EXECUTABLE |
| `NORMALIZATION.NO_ACTOR_REF_HOLDS` | NORMALIZATION | NEGATIVE_FACT | EXECUTABLE |
| `NORMALIZATION.UNSUPPORTED_TYPE_COUNTED` | NORMALIZATION | UNSUPPORTED | EXECUTABLE |
| `COMBAT_STATE.LAST_OBSERVED_CAST_UNKNOWN` | COMBAT_STATE | UNKNOWN | EXECUTABLE |
| `COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST` | COMBAT_STATE | POSITIVE_FACT | EXECUTABLE |
| `WCL_DECODE.EVENT_PAGE_OUTCOME` | WCL_TRANSPORT | REJECTION | EXECUTABLE |
| `PUBLIC_CONTRACT.REST_MCP_PARITY` | PUBLIC_CONTRACT | PARITY | DECLARED (M9-B) |
| `SPEC_ASSASSINATION.DECISION_COVERAGE` | SPEC_ASSASSINATION | UNKNOWN | DECLARED (M9-B), authority-dependent |

Raw-index addressing (`RAW_INDEX` selectors) is acceptable in the corpus and
nowhere else in this repository, because artifacts are digest-pinned and their
positions cannot move silently. Prefer a fact locator when one exists.

### How a fight is built from an artifact

Executors that need a `CombatFight` build it through the real normalizer under
the real contracts. Capability is granted only to the categories a capture can
vouch for (the ones `PROVENANCE.md` records as OBSERVABLE from sanitized
captures), coverage is granted only from `retainedCoverage.ranges`, and a
SYNTHETIC artifact is granted no capability at all. A slice that retains no
range can prove no absence — the seed case
`combat-state.trimmed-slice-cannot-prove-absence` pins exactly that.

---

## Sanitization policy

What a committed artifact must never contain:

- credentials, authorization headers, access tokens, client ids or secrets
- the test pool's sentinel credentials
- player names, realm names, or any `name` / `server` key on an event

What sanitization must preserve when the claimed behaviour depends on it:

- timestamps, exactly
- event order as returned, including same-timestamp order (it is evidence —
  see the M5-C3a entry in `tests/fixtures/wcl/events/PROVENANCE.md`)
- source/target/ability relationships and instance ids
- `-1` sentinels, actor `0`, `resourceActor`, `classResources` entries
- page boundary evidence (`nextPageTimestamp`) when a case is about pagination

Identifier remapping, when a future capture needs it, must be deterministic
and coherent — one mapping applied to every source, target and resource-actor
reference — recorded as `IDENTIFIER_REMAP` with `ORIGINAL_IDENTIFIERS`
invalidated.

Deliberate corruption is never mixed into a capture in place. It is a
separate `DERIVED_FROM_CAPTURE` artifact naming its parent and its mutation,
or a `SYNTHETIC` artifact with no lineage claim.

The existing slicer `scripts/sanitize-probe.mjs` remains the capture-to-slice
tool. It has no version field, so `tooling.revision` is `UNAVAILABLE` for the
slices it produced; giving it one is an M9-B tooling item.

---

## Storage policy

| Limit | Value | Basis |
| --- | --- | --- |
| per artifact | 512 KiB (`MAX_ARTIFACT_BYTES`) | the largest committed slice today is the ~226 KB M5-D2 corpus; a raw full-fight run is tens of MB and is never committed |
| whole corpus | 6 MiB (`MAX_CORPUS_BYTES`) | bounds what `import.meta.glob` eagerly bundles into a test module and what a clone carries |

Both are checked from measured canonical byte lengths, so the answer is the
same on every machine. There is no external storage: fixtures must work
offline and CI must never need a download or a credential. If M9-B's
population approaches the corpus ceiling, raise it deliberately in
`contract.ts` with the evidence, rather than storing artifacts elsewhere.

Legacy fixtures under `tests/fixtures/wcl/events/` are not migrated in M9-A.
Two were copied byte-for-byte into the corpus (`LEGACY_FIXTURE_COPY`), and
`tests/unit/m9a-corpus-seed-cases.test.ts` asserts each copy still equals its
original. Migrating the remaining fixtures and their importers is M9-B's.

---

## Seed set (M9-A)

| Artifact | Kind | Bytes | Backs |
| --- | --- | --- | --- |
| `wcl-events.no-actor-sentinel-source` | SANITIZED_CAPTURE (report `qJ1pgB49ZrRNVmCd`, fight 6, rev 1) | 1,070 | 2 cases |
| `wcl-events.no-actor-sentinel-source.unusable-negative` | DERIVED_FROM_CAPTURE (parent above; `sourceID` −1 → −5 at index 0) | 1,070 | 1 case |
| `wcl-events.cast-resource-pre-cost` | SANITIZED_CAPTURE (report `A7R6kxPJ1hC8YQ4w`, fight 7, rev 30; truncated-prefix page evidence) | 3,045 | 1 case |
| `wcl-events.synthetic-unsupported-type` | SYNTHETIC | 154 | 1 case |
| `wcl-graphql.event-page-null-data` | SYNTHETIC, malformed by design | 133 | 1 case |

Six cases, every assertion EXECUTABLE, `declared: 0`. This proves the format;
it is not corpus breadth. See `manifest.json` for each case's purpose,
assertions, rationale and limitations.

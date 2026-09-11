# Warcraft Logs fixture provenance

## Origin

**Synthetic. Not captured from a live report.**

These payloads were hand-authored to mirror the documented Warcraft Logs v2
schema shapes that the Milestone 2 preflight depends on. No live capture was
performed, because no Warcraft Logs credential was available in the development
environment at the time of writing (`.dev.vars` absent, environment unset).

Nothing here contains a credential, an access token, a real character name, or a
real report code. `aBcDeFgH12345678` is an obvious placeholder.

## Shapes mirrored

| Source | Field |
| --- | --- |
| `ReportData.report(code:, allowUnlisted:)` | `code`, `revision`, `startTime`, `endTime` |
| `ReportMasterData` | `logVersion` (non-null), `gameVersion` (nullable) |
| `ReportActor` | `id`, `name`, `type`, `subType` (class for players) |
| `ReportFight` | `id`, `name`, `encounterID`, `difficulty` (nullable), `startTime`, `endTime` |
| `ReportFight` | `friendlyPlayers` / `friendlySpecs`, index-aligned |
| `rateLimitData` | `limitPerHour`, `pointsSpentThisHour`, `pointsResetIn` |

## Purpose

To exercise, offline and deterministically:

- successful identity resolution (name, class and spec together)
- `report: null` — the only recognised inaccessible-report signal
- GraphQL `errors[]` on HTTP 200, which fails closed without being classified
  from its message text
- fight / actor / participation mismatches
- malformed unrelated actors, duplicate actor IDs, and misaligned
  `friendlyPlayers` / `friendlySpecs`

## Deliberately absent

No permission-error fixture asserts a machine-readable "private report" code or
category. The public schema exposes no verified stable shape for that, and a
fixture asserting an invented one would encode a contract the analyzer cannot
defend. If a live probe later confirms such a shape, add the captured fixture
then — and only then.

## When a real capture is added

Include the provenance block `agent/testing.md` requires: report code, fight ID,
source ID, encounter, difficulty, character, class, spec, role, game
version/build, capture date, ingestion scope, completeness, and why the fixture
exists. Sanitize before committing.

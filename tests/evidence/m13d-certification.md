# M13-D certification tables — provenance and certificates

Human-readable companion to the `wcl-m13d-certification-tables-aug1-fight-1`
archive artifact. The machine record is `tests/evidence/manifest.json`; the
certificates are recomputed offline by
`tests/unit/m13d-filtered-capture-certification.test.ts`. Nothing here is
read by a test.

## Authority

Owner decision of 2026-11-02, `agent/autopilot-queue.md` "M13-D": the
reviewed completeness-certificate path, applied ONLY to the existing M13-A
report, fight 1 and its interval [165,857 .. 316,612]. Only the table and
context requests needed to prove or refuse exact certificates. No unfiltered
capture, no damage or healing retrieval, no other report, fight or Evoker.
At most 15 Warcraft Logs HTTP requests.

## Plan (recorded before any request)

`.probe/m13d/certification-plan.md` (gitignored). It records what M13
conclusions consume, which requests would be made, a worst case of 9
requests, and the certificate rules, all fixed in advance:

- **Consumed:** AURAS for 395152, 410089 and 395296; CASTS (completed) for
  the subject and the recipients.
- **Not consumed:** DEATHS. Survival is positive-only, so no Deaths request
  was made.

## Requests (2026-11-02): 2 of 15

Counted at the fetch layer (a counter refusing a 16th request):

| # | Request | Outcome |
| --- | --- | --- |
| 1 | OAuth client-credentials token | OK |
| 2 | One composed GraphQL request: `revision`; `fights(fightIDs: [1])`; `table(dataType: Buffs, hostilityType: Friendlies, abilityID: X)` for X in 395152, 410089, 395296; `table(dataType: Casts, hostilityType: Friendlies, sourceID: R)` for each of the 20 friendly players; every table over startTime 165857, endTime 316612 | OK; revision 10; fight 1 [165857, 316612]; 1 rate-limit point |

The conditional per-target Buffs requests (T2) were not needed: the
by-ability Buffs tables list one entry per target actor. No events request
was made. The events are the committed M13-A segments.

## The artifact

| Artifact | Bytes | Content |
| --- | ---: | --- |
| `wcl-m13d-certification-tables-aug1-fight-1` | 62,316 | code → `M13AAUGAAAAAAAAA`; revision; fight bounds; each table's request arguments (parsed from the recorded query document); the three Buffs tables (per target: id, class/type, totalUses, totalUptime, bands); the twenty Casts tables (guid, type, actor, total, counts, composites) |

Names, icons, per-target guids (stable character ids), source lists and rate
limit data are dropped by `scripts/corpus/sanitize-m13d-tables.mjs`. The
sanitizer is deterministic: two runs give byte-identical output.

## Why a filtered stream is COMPLETE (and where it is not)

The certificate compares the fight's own normalized events with the tables.
Both use the same report, revision 10, fight 1 and interval (inclusive at
both ends), and the same family, hostility and ability or source predicate.
The rules are in `agent/architecture.md` "M13-D". The results:

- **Ebon Might on allies (395152).** CERTIFIED. 13 targets, 173 windows; every
  window equals its band and every target's applications plus refreshes
  equal its uses.
- **The Evoker's own Ebon Might (395296).** CERTIFIED: 3 windows.
- **Prescience (410089).** Certified except targets 36, 50 and 52. Those
  pets' events state instances (50 holds 8, 52 holds 24), and the table is
  per actor, so their windows cannot be proven per instance. The other 12
  targets match exactly.
- **Completed casts.** 303 (actor, ability) pairs are proven by equal counts.
  28 are not:
  - abilities the table does not list (e.g. 361195, 434144);
  - empowered spells, where the table counts `cast` + `empowerend`
    (Fire Breath 357208: 6 casts vs 10; Upheaval 396286: 9 vs 16).
  - For the subject: 395152, 409311 and 403631 are proven. 442204 was never
    cast and is not proven.

## What this changes and does not change

- **Changes.**
  - The Ebon Might ally listing and the self listing are COMPLETE.
  - Every Ebon Might window and the 12 proven Prescience targets' windows
    have established continuity.
  - Support time is a real AT_LEAST bound. It is never exact, because a
    carried-in buff is never excluded.
- **Does not change.**
  - The Prescience listing stays OBSERVED_ONLY.
  - The support-cast listing stays UNKNOWN (442204).
  - Category coverage, so CASTS and AURAS stay ABSENT.
  - Deaths.
  - Cooldown overlap (no real recipient has a reviewed cooldown identity).
  - SUPPORT_TARGETING and SUPPORT_TIMING, which stay NO_AUTHORITY_AVAILABLE.
    A certificate is completeness evidence only.

The real report code and the request ledger stay in the gitignored
`.probe/m13d/` for the owner's audit.

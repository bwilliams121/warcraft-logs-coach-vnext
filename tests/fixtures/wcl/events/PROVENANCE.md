# Warcraft Logs event fixture provenance

Four sanitized slices from one live capture. Together they are the sole evidence
for every raw event type string and field name that `src/` recognises.

## Source capture

| | |
| --- | --- |
| Report code | `qJ1pgB49ZrRNVmCd` |
| Fight ID | 6 |
| Source ID | 5 |
| Encounter | Sszorak (`encounterID` 3420) |
| Difficulty | 4 |
| Raid size | 24 |
| Outcome | Kill |
| Class / spec / role | Paladin / Protection / Tank |
| Report revision | 1 |
| `logVersion` | 17 |
| `gameVersion` | 1 |
| Capture date | 2026-09-11 |
| Ingestion scope | `PLAYER_CONTEXT` |
| Retrieval | `dataType: All`, unfiltered by actor, `hostilityType` omitted |
| Completeness | The full-fight run was `COMPLETE`: 40 pages, 196,366 events, no failures |

Character names are NOT present. Event payloads reference actors by numeric id
only; the single name string in these files is `"Sszorak"` on the
`encounterstart` event, which is the public encounter name rather than personal
data. The report code is retained because `agent/testing.md` requires it for
provenance and the report is public.

## The slices

| File | Events | Bytes | Produced by | Purpose |
| --- | --- | --- | --- | --- |
| `wcl-pull-window-with-resources.json` | 43 | ~58 KB | `--per-type 3` over the pull window with `includeResources: true` | Type strings and field shapes for 16 families; the ONLY evidence for the flattened `resourceActor` attachment shape and for `combatantinfo` gear/talents |
| `wcl-midfight-window.json` | 59 | ~10 KB | `--per-type 3` over 7,550,000-7,560,000 | Six further families absent from the pull window: `absorbed`, `healabsorbed`, `removedebuff`, `applydebuffstack`, `removedebuffstack`, `empowerstart`/`empowerend` |
| `wcl-no-actor-sentinel-source.json` | 4 | ~1 KB | `--where sourceID=-1 4` | Evidence that `-1` is a no-actor sentinel on `sourceID`, not only on `targetID` |
| `wcl-boss-sourced.json` | 4 | ~1 KB | `--where sourceID=160 4` | Evidence that the unfiltered `All` stream carries enemy-sourced events (actor 160 is the boss) |

Reproduce any of them from a fresh `.probe/` capture:

```powershell
npm.cmd run probe
node scripts/sanitize-probe.mjs .probe/events-page1-withresources.json wcl-pull-window-with-resources.json --per-type 3
node scripts/sanitize-probe.mjs .probe/followup-q1-omitted.json wcl-midfight-window.json --per-type 3
node scripts/sanitize-probe.mjs .probe/followup-q1-omitted.json wcl-no-actor-sentinel-source.json --where sourceID=-1 4
node scripts/sanitize-probe.mjs .probe/followup-q1-omitted.json wcl-boss-sourced.json --where sourceID=160 4
```

Slicing per-type rather than by head is deliberate: a fixture that has to
justify contracts for twenty raw type strings needs one example of each, not the
first 200 events of a pull.

## Why these files are load-bearing

`tests/unit/supported-families.test.ts` drives both window slices through the
real contracts and asserts zero malformed observations, zero malformed family
events, zero unsupported types and zero degraded categories. A fixture that is
never decoded proves nothing.

`tests/contracts/normalization-boundary.test.ts` asserts that every raw type
string recognised in `src/` appears in one of these files. Adding a contract
without adding evidence fails the build.

## Verified facts these slices establish

- Envelope keys: `timestamp`, `type`, `fight`
- Direction keys: `sourceID`, `targetID`, `sourceInstance`, `targetInstance`, `abilityGameID`
- `-1` is a no-actor sentinel on both `sourceID` and `targetID`
- Resource snapshots are FLATTENED onto the event, with `resourceActor` (1 = source, 2 = target) saying which side they describe. There is no `sourceResources`/`targetResources` object.
- `classResources[].cost` appears on `cast` events
- `combatantinfo.talents` was `[]` while `talentTree` was populated
- Gear entries carry no slot key; the slot is the array index
- Gear `permanentEnchant`, `gems`, `temporaryEnchant`, `setID` are genuinely optional per item

## Capability state

`OBSERVABLE` from these captures: `CASTS`, `AURAS`, `RESOURCES`, `ABSORBS`,
`DAMAGE`, `HEALING`, `SUMMONS`, `COMBATANT_INFO`, `GEAR`.

`OBSERVABLE` from typed schema fields, needing no capture: `ACTORS`,
`ABILITIES`, `ENCOUNTER_PHASES`, `TALENTS`.

Still `UNVERIFIED`, with what would close each:

| Category | What would verify it |
| --- | --- |
| `DEATHS` | A capture containing a death event. Neither window contained one. |
| `INTERRUPTS` | A capture containing an interrupt event. |
| `DISPELS` | A capture containing a dispel event. |
| `TARGETABILITY` | A capture containing a targetability event, ideally from an encounter with a real intermission. The captured encounter has two phases and neither is an intermission. |

**None of these is `NOT_OBSERVABLE`.** Failing to observe a category proves only
that the captured windows did not contain it. `NOT_OBSERVABLE` requires
authoritative negative evidence that the source cannot supply it, and no such
evidence exists for any of them.

## Additional captures still wanted

1. **An encounter with a real intermission**, to settle `TARGETABILITY`.
2. **A pull with deaths, interrupts and dispels**, to settle the other three.
3. **A pull including a pet or guardian class**, to exercise `petOwner` against real data.

## Never stored here

Client ID, client secret, bearer token, Authorization header. A contract test
sweeps every committed fixture payload for credential-shaped values, and
`scripts/sanitize-probe.mjs` refuses to write output containing one.

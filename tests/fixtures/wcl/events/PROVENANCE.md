# Warcraft Logs event fixture provenance

Six sanitized slices from two public reports.

They serve two different purposes, and the distinction matters when reviewing
them:

| Purpose | Files | What it gates |
| --- | --- | --- |
| **Type recognition** | the four window/edge slices | every raw type string and field name `src/` recognises |
| **Field semantics** | `wcl-aura-stack-absolute`, `wcl-cast-resource-pre-cost` | what two specific field VALUES mean |

A semantics fixture is not cited by `supported-families.ts`, because it
establishes no new type. It is cited by the contract tests that read the meaning
of a value, and it is the reason those tests are evidence rather than assertion.

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

## Verified facts these four slices establish

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

---

# Evidence-contract slices

Two further slices establish what a FIELD VALUE means, rather than that a type
exists. Both were captured on **2026-09-12** during the M4-C1 evidence
investigation.

**Version scope for both: `gameVersion` 1, `logVersion` 17.** These contracts are
evidence-backed for that pair and are not generalised beyond it. A parser or game
version that contradicts either is a STOP condition, not something to patch
around.

## `wcl-aura-stack-absolute.json`

| | |
| --- | --- |
| Report code | `qJ1pgB49ZrRNVmCd` |
| Fight ID | 6 |
| Source ID | not applicable — the chains belong to actors 9 and 7, not the analysed player |
| `gameVersion` / `logVersion` | 1 / 17 |
| Events | 15 |
| Capture window | 7,550,000–7,560,000 (terminal page, complete) |
| Purpose | establish the meaning of the aura `stack` field |
| Classification | `ESTABLISHED_ABSOLUTE_RESULTING` |

**Establishes:** on a stack-change aura event, `stack` is the ABSOLUTE RESULTING
STACK COUNT AFTER that event. Not a delta, not the prior count, not an amount to
add or subtract.

It is also the evidence behind one behaviour: a stack removal reporting a
positive count proves the aura survived it, so `removebuffstack` reading 2 is a
known-`ACTIVE` presence anchor. The second chain below carries both real
observations — `stack: 2` and `stack: 1` — followed by the ordinary `removebuff`
that does end the aura. A resulting count of ZERO appears nowhere in any capture
and is deliberately not read as `INACTIVE`.

Two chains, each **complete** — every event Warcraft Logs returned for that
(ability, source, target) inside the window, nothing dropped. Completeness is
what makes them evidence; a sliced chain could be made to fit almost any reading.

```text
ability 1297033, actor 9 on itself
  applybuff -> stack 2 -> stack 3 -> stack 4 -> stack 5 -> stack 6 -> removebuff
  (with the four interleaved refreshbuff events retained)

ability 1263382, actor 7 on itself
  applybuff -> removebuffstack 2 -> removebuffstack 1 -> removebuff (+1182 ms)
```

Why the alternatives fail:

- **Delta** would need the first stack application to read 1 — the commonest
  value a delta takes. It never appears. The ascending run would instead mean
  gaining 2, then 3, then 4 stacks one at a time.
- **Absolute-before** dies twice: `applybuff` establishes the aura, so a
  following application claiming a PRIOR count of 2 is impossible; and a removal
  reading 1 would mean the aura hit zero, yet the second chain runs for another
  1.18 seconds before its own `removebuff`.

The wider investigation behind this slice covered 1,012 stack applications and
510 stack removals across two reports: zero applications read 1, zero removals
read 0, and 131 of 131 plain-application-then-stack-application transitions read
2.

## `wcl-cast-resource-pre-cost.json`

| | |
| --- | --- |
| Report code | `A7R6kxPJ1hC8YQ4w` |
| Fight ID | 7 |
| Source ID | 19 (Rogue); actor 12 supplies the independent second example |
| Encounter | Entombed Sentinels (`encounterID` 3445), difficulty 5, 20-player, kill |
| Report revision | 30 |
| `gameVersion` / `logVersion` | 1 / 17 |
| Events | 5 |
| Capture window | 2,174,394–2,194,394, `includeResources: true` (truncated at the page limit; the slice is well inside the covered prefix) |
| Purpose | establish when a CAST-attached `classResources[].amount` was sampled |
| Classification | `ESTABLISHED_PRE_COST` |

**Establishes:** when a COMPLETED cast carries a `classResources[]` entry with a
positive `cost`, `amount` is the actor's amount BEFORE that cost was paid.

A second report at a different revision, deliberately — it makes this a genuine
cross-check rather than a second look at one parse.

The falsifier is structural and decided from ONE event, needing no arithmetic, no
event ordering and no regeneration model:

```text
amount == max   while   cost > 0
```

Under a post-cost reading the actor would have held `max + cost`, above the cap.
The slice carries the sharpest form — a capped discrete resource spent in full:

```text
cast 32645   resource type 4   amount 7 / max 7 / cost 7
```

Post-cost would require holding 14 of a 7-capacity pool.

The five events and what each is for:

| Event | Role |
| --- | --- |
| `cast` 116858, actor 12, resource type 7, 50/50 cost 20 | independent actor and resource: the contract is not one class's quirk |
| `resourcechange` 1298870, actor 19 | a `resourcechange` attachment, which stays `EVENT_ASSOCIATED` |
| `cast` 32645, actor 19 | two costed entries on one cast, including `amount == max == cost` |
| `cast` 703, actor 19, 195/250 cost 45 | a costed cast below cap |
| `cast` 1 (melee), actor 19, 150/250, no cost | an UNcosted cast: `EVENT_ASSOCIATED`, and corroboration that 195 − 45 = 150 |

The last pair shares a timestamp. It is corroboration only — the accepted
contract rests on the cap-bounded falsifier, because same-timestamp retrieval
order is not guaranteed to be causal order.

The wider investigation found 126 cap-bounded falsifiers of the post-cost reading
and zero counterexamples across 423 costed entries, spanning resource types 0, 1,
3, 4, 5, 7, 11 and 17 in two reports.

Reproduce both from fresh `.probe/` captures:

```powershell
node scripts/sanitize-probe.mjs .probe/followup-q1-omitted.json wcl-aura-stack-absolute.json --indices 1801,1827,1836,2372,2373,2378,2913,2914,3162,3385,3386,3770,3771,3867,3876
node scripts/sanitize-probe.mjs .probe/m4c1-rogue-resources.json wcl-cast-resource-pre-cost.json --indices 464,700,704,4713,4715
```

`--indices` selects exact capture positions, which the property-based modes
cannot express: an evidence contract about a SEQUENCE needs the actual chain, and
selecting by ability id would drag in every other actor's copy of the same aura.

### Reproducing the raw captures those indices refer to

An index list is only meaningful against the exact capture it was taken from, and
neither capture is what `npm run probe` writes by default — the committed probe
takes a 300-event shape sample, not a mid-fight window. The retrieval parameters
are recorded here instead, because they are what makes the positions
deterministic:

| | `followup-q1-omitted.json` | `m4c1-rogue-resources.json` |
| --- | --- | --- |
| Report | `qJ1pgB49ZrRNVmCd` | `A7R6kxPJ1hC8YQ4w` |
| Revision at capture | 1 | 30 |
| `fightIDs` | `[6]` | `[7]` |
| `startTime` | 7,550,000 | 2,174,394 |
| `endTime` | 7,560,000 | 2,194,394 |
| `limit` | 10,000 | 10,000 |
| `includeResources` | false | **true** |
| `dataType` | `All` | `All` |
| `hostilityType` | omitted | omitted |
| Events returned | 5,010 | 10,003 |
| `nextPageTimestamp` | null (terminal page) | 2,191,432 (truncated prefix) |

Everything else matches `EVENTS_QUERY`: `translate: true`, `useActorIDs: true`,
`useAbilityIDs: true`, no actor or aura filters.

The Rogue window hit the page limit, so its coverage is the contiguous prefix
`[2174394, 2191432)`. The selected indices sit well inside it. A re-fetch at a
DIFFERENT revision may renumber positions — the revisions above are recorded for
exactly that reason, and a mismatch means re-deriving the indices rather than
trusting the list.

---

## `wcl-assassination-envenom-combo-points.json`

| | |
| --- | --- |
| Report code | `A7R6kxPJ1hC8YQ4w` |
| Fight ID | 7 |
| **Report revision** | **30** |
| Encounter | Entombed Sentinels (`encounterID` 3445), difficulty 5, 20-player, kill |
| `gameVersion` / `logVersion` | 1 / 17 |
| Events | 12 |
| Capture date | 2026-09-12 |
| Purpose | the M5-A Assassination decision surface, and corroboration for the combo-point wire contract |

**Revision 30 is load-bearing.** A re-export renumbers canonical positions, so
tests address events by `(actorId, abilityGameID, timestamp)` and never by index.

Assembled from narrow live windows rather than one slice, because the events of
interest are spread across a 424-second fight. Each was selected by fact, and the
whole set was passed through `scripts/sanitize-probe.mjs`.

### Specialization provenance

Two `combatantinfo` events, actors 13 and 19, both `specID: 259`. Three
independent Warcraft Logs facts agree that both are Assassination Rogues:

| Source | Value |
| --- | --- |
| `masterData.actors[].subType` | `"Rogue"` (actor type `Player`) |
| `fights[].friendlySpecs[]`, index-aligned to `friendlyPlayers[]` | `"Assassination"` |
| `combatantinfo.specID` | `259` |

The index-aligned pairing was cross-checked across all 20 raiders: 17 distinct
`(friendlySpecs string ↔ specID)` pairs, perfectly 1:1, no string mapping to two
ids and no id mapping to two strings — including three replicated pairs
(`Assassination↔259`, `Destruction↔267`, `Elemental↔262`). That is within-capture
corroboration for this report; it is not a global claim about spec ids.

Neither event carries a player name. The only `name` strings anywhere in this
fixture are public ability names inside `combatantinfo.auras` (`"Battle Shout"`,
`"Arcane Intellect"`, …). There is no `server` field and no player-identifying
key.

### The Envenom decision points

| Actor | Timestamp | Combo points | What it establishes |
| --- | --- | --- | --- |
| 13 | 2,150,252 | `3 / 7`, cost 3 | **The first exact M5 gameplay judgment.** The spend gate is false under both Darkest Night resolutions, so the cast is `REJECTED_BY_AUTHORITY`. |
| 19 | 2,028,273 | `5 / 7`, cost 5 | Darkest Night decides the gate → `UNKNOWN` |
| 19 | 2,016,360 | `6 / 7`, cost 6 | Darkest Night decides the gate → `UNKNOWN` |
| 19 | 2,013,095 | `7 / 7`, cost 7 | Gate satisfiable, which must NOT become "correct" |
| 19 | 2,090,898 | **no type-4 entry at all** | Missing data must never become zero combo points |

The last row is the most important negative evidence in this fixture. It is a
real Envenom that plainly happened — it carries an Energy cost of 35, and the
full capture shows Envenom damage 362 ms later — whose `classResources`
nevertheless omits the combo-point entry entirely. A second Envenom by the same
actor 1,015 ms later does carry `t4: 6/7 cost 6`.

**Therefore: the absence of a combo-point entry does not establish that no combo
points were spent.** Reading it as zero would manufacture the sharpest possible
false rejection, because `0 < 5` fails the gate under both resolutions exactly
as the genuine 3/7 case does.

### Resource-type corroboration

Five costed discrete-resource casts from five different classes, supporting the
joint evidence contract in `src/data/wcl-wire/resource-types.ts`:

| Actor | Class | Wire type | Observed |
| --- | --- | --- | --- |
| 1 | Feral Druid | 4 | `5 / 5` cost 5 |
| 13, 19 | Rogue | 4 | `3 / 7`, `7 / 7` … |
| 6 | Paladin | 9 | `4 / 5` cost 3 |
| 15 | Warlock | 7 | `30 / 50` cost 20 |
| 11 | Evoker | 19 | `4 / 5` cost 3 |
| 14 | Death Knight | 5 | `5 / 6` cost 1 |

Wire type 4 appears on the combo-point classes with class-appropriate maxima
(Rogue 7, Feral Druid 5) and on no other class. The wider full-fight census
behind this — 249,516 events, COMPLETE coverage — found type 4 on exactly three
actors across the whole raid, and every type-4 entry in the fight was costed.

**This corroborates the mapping; it does not prove it.** The game enum supplies
the meaning, the capture supplies compatible wire behaviour, and the contract
requires both. See `src/data/wcl-wire/resource-types.ts`.

### What this fixture does NOT establish

- That wire type 4 means combo points **outside** `gameVersion` 1 / `logVersion` 17.
- Anything about Darkest Night. The buff appears nowhere in this report: zero of
  the 2,035 abilities in the fight's master data have a name matching
  `/darkest/i`. That is an observation about one capture and is **not** evidence
  that the buff was inactive, untalented, or absent from the game.
- Any generate-side combo-point state. The full-fight census found combo points
  are reported only on casts that spend them, so a generator's combo-point state
  is not observable through this field at all.

---

# Still NOT ESTABLISHED

## `resourcechange` attached snapshot timing

When a `resourcechange` event carries both a `resourceChange` delta and an
attached `classResources[].amount`, whether that amount describes the state
before or after the change is **NOT ESTABLISHED**.

Observed evidence strongly favours POST_CHANGE — 50 discriminating cases across
two reports matched it and zero matched PRE_CHANGE — but causal ordering is
insufficiently established to promote this to a runtime contract. The supporting
evidence relies on same-timestamp retrieval adjacency behaving as causal order,
which the ingestion layer deliberately does not guarantee, and whole-window
reconciliation left gaps that could equally be explained by resource changes that
emit no event.

M4 therefore tags a `resourcechange` attachment `EVENT_ASSOCIATED`. There is no
`POST_CHANGE` and no `PRE_CHANGE` anywhere in the runtime, and a contract test
pins that the timing union has exactly two members.

## Do not replay resourcechange deltas between observations

**Do not replay `resourcechange` deltas between observations to manufacture exact
resource state.**

This is an architectural prohibition, not a temporary gap. M4-C1 measured exactly
that reconstruction against live captures and it does not reconcile: snapshots
appear whose value disagrees with an anchor plus the intervening observed deltas.
Two explanations survive the evidence and neither can be excluded — not every
resource change emits an event, and same-timestamp retrieval order is not
guaranteed to be causal. Either one is fatal to replay.

The same prohibition covers passive regeneration, interpolation between
observations, synthesizing a missing change, and computing `amount - cost` as a
post-cost amount.

A snapshot is authoritative for its own observational point. Between observations
the amount is UNKNOWN, and `PRE_COST` does not change that — it makes one more
INSTANT exactly knowable, not the intervals around it.

## Never stored here

Client ID, client secret, bearer token, Authorization header. A contract test
sweeps every committed fixture payload for credential-shaped values, and
`scripts/sanitize-probe.mjs` refuses to write output containing one.

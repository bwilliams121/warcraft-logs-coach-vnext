# Warcraft Logs event fixture provenance (legacy prose, preserved)

> **Read this first.** This document is the M2–M8 provenance prose for the
> eleven sanitized event slices, preserved verbatim from
> `tests/fixtures/wcl/events/PROVENANCE.md` when M9-B migrated the slices into
> the regression corpus. The slices now live under
> `tests/corpus/artifacts/wcl-events/` with the same file names and the same
> bytes, and every fact below that a test depends on is recorded as structured
> metadata in `tests/corpus/manifest.json`. The manifest is authoritative for
> what an artifact is and what it may prove; this file is the investigation
> record behind it — the measurements, the falsifiers, the captures that were
> re-taken and why — and is kept because structuring a fact does not preserve
> the reasoning that established it.
>
> Paths below that say `tests/fixtures/wcl/events/` refer to the pre-M9-B
> location. `scripts/sanitize-probe.mjs` now writes to the corpus artifact tree.


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

## M5-B additions to `wcl-assassination-envenom-combo-points.json`

Two further Envenom casts by actor 19, captured on **2026-09-12** from the same
report at the same revision. The fixture now holds **14** events.

| | |
| --- | --- |
| Report code | `A7R6kxPJ1hC8YQ4w` |
| Fight ID | 7 |
| **Report revision** | **30** — unchanged, and still load-bearing |
| `gameVersion` / `logVersion` | 1 / 17 |
| Retrieval | one single-timestamp window per event: `startTime = endTime = t`, `limit` 10,000, `includeResources: true`, `dataType: All`, `hostilityType` omitted |

Both timestamps fall inside the fixture's existing window
`[2,004,589 … 2,150,253]`, so no window constant changed. Each window returned
exactly ONE `cast` of `abilityGameID` 32645 by `sourceID` 19, so the selection is
unambiguous. Neither payload contains a `name` key.

Reproduce:

```powershell
# capture both windows and merge with the committed fixture
npx.cmd vitest run --config .probe/m5b-fixture.config.ts
node scripts/sanitize-probe.mjs .probe/m5b-fixture-source.json wcl-assassination-envenom-combo-points.json --indices 0,1,2,3,4,5,6,7,8,9,10,11,12,13
```

### The two new decision points

| Actor | Timestamp | Combo points | Wire type 3 | `amount / max * 100` | What it establishes |
| --- | --- | --- | --- | --- | --- |
| 19 | 2,039,278 | `7 / 7`, cost 7 | `250 / 250`, cost 35 | **100** | **The first exact scoped action selection.** The `spend` gate is TRUE under both Darkest Night resolutions, `energy.pct > 70` is TRUE, and every surviving `spend` line names Envenom. |
| 19 | 2,019,463 | `7 / 7`, cost 7 | `233 / 250`, cost 35 | **93.2** | The same selection from a NON-CAPPED pool. An implementation that special-cased `amount == max` instead of computing the ratio would pass the row above and fail this one. |

Both entries on both events are `EXACT` / `OBSERVED` / `PRE_COST`, and each is
independently a cap-bounded falsifier of the post-cost reading on wire type 4
(`amount == max == cost`). The 2,039,278 event is additionally one for wire type
3, where `250 / 250` is held while a cost of 35 is paid.

The fixture's existing rows already cover the negative side and are unchanged:
2,013,095 is full combo points at **58.8 %** (so `energy.pct > 70` is FALSE),
2,028,273 is 97.2 % Energy at only 5 of 7 combo points, 2,150,252 is the 3/7
rejection, and 2,090,898 carries no combo-point entry at all.

### Wire-type-3 corroboration

This fixture is also the cited corroboration for the **ENERGY** wire contract in
`src/data/wcl-wire/resource-types.ts`. As with combo points, the contract
requires BOTH a versioned game enum and observed wire behaviour compatible with
it, and the capture is recorded as **corroboration, not proof**.

Measured across the same complete fight (249,516 events, COMPLETE coverage,
50/50 pages, 0 malformed observations):

- Wire type 3 appeared on **74,224 entries**, and only on energy-using actors:
  two Rogues (`max` 250), a Feral Druid (`max` 140), two bosses and two NPCs
  (`max` 100), and five pets (`max` 100 or 200).
- **No** Priest, Mage, Warlock, Paladin, Warrior, Death Knight, Monk, Shaman,
  Hunter, Demon Hunter or Evoker carried it.
- **The Hunter carried wire type 2 and never type 3.** Focus is enum 2 and
  Energy is enum 3; a renumbering or off-by-one would surface there first. This
  is the sharpest single discriminator the capture offers.
- Eleven further types in the same capture line up with the same enumeration:
  0 mana, 1 rage, 2 focus, 4 combo points, 5 runes, 6 runic power, 7 soul shards,
  9 holy power, 11 maelstrom, 17 fury, 19 essence.
- The Feral Druid carried types 0, 3 and 4 **simultaneously**, each with a
  class-appropriate maximum.
- Integrity: **zero** type-3 entries with `amount` above `max`, **zero** with a
  null `max`, and **zero** of the 1,008 costed entries with `amount` below
  `cost`.
- Observed type-3 costs were 20, 25, 30, 35, 40, 45, 50 and 60 — discrete, none
  fractional.
- Per-actor `max` was stable for the entire fight: `250` across 6,923 and 6,471
  observations for the two Rogues.

### Why the adapter is a PERCENTAGE, and what that does not require

SimulationCraft's `energy.pct` is a percentage from 0 to 100. Warcraft Logs
supplies, on ONE `PRE_COST` observation attached to the cast itself, both the
exact current amount and the actor's contemporaneous maximum. The adapter
evaluates `observedAmount / observedMax * 100`.

A ratio of two numbers drawn from the SAME encoding is independent of what that
encoding is. The same capture shows Rage at `max` 1300 and Runic Power at `max`
1250 — neither of which is the number a player reads off their own bar — so an
absolute unit scale plainly cannot be assumed to be shared with any other tool.
The percentage is unaffected, because the scale cancels.

**The adapter therefore does not require, and does not assume, that Warcraft
Logs' absolute Energy units equal SimulationCraft's.** What it requires is that
`amount` and `max` describe the same pool at the same instant, which is exactly
what a single same-event observation provides, and which the integrity
measurements above support.

No rounding, flooring or clamping is applied. No regeneration is modelled, no
value is interpolated between observations, no `resourcechange` delta is
replayed, and no earlier reading is carried forward.

### What these two events do NOT establish

- Anything about wire type 3 **outside** `gameVersion` 1 / `logVersion` 17.
- That Envenom was the globally ideal action. The selection is scoped to the
  `spend` sub-list; higher-priority `default` entries remain unevaluated, and
  several — an unconditional `stealth`, an unconditional `kick`, a `variable`
  assignment, and an unconditional call to `core_dot` — remain unevaluable.
- Anything about Darkest Night. The buff still appears nowhere in this report.
- Anything about `fight_remains`. It is PREDICTIVE and is never bound, so
  `spend[1]` resolves TRUE on its Energy half alone.

---

## `wcl-assassination-vanish-ambush-gate.json`

Five events from the same report and revision, captured on **2026-09-12** for
M5-C2. This is a SEPARATE slice, not an addition to the Envenom fixture: it
covers a different window and establishes different facts.

| | |
| --- | --- |
| Report code | `A7R6kxPJ1hC8YQ4w` |
| Fight ID | 7 |
| **Report revision** | **30** — unchanged, and still load-bearing |
| `gameVersion` / `logVersion` | 1 / 17 |
| Actor | 19 (`Saruxoxo`, Assassination Rogue, `specID` 259) |
| Retrieval | two ranges, `limit` 10,000, `includeResources: true`, `dataType: All`, `hostilityType` omitted |

The five events, in captured order:

| `timestamp` | `type` | `abilityGameID` | Why it is here |
| --- | --- | --- | --- |
| 2,004,589 | `combatantinfo` | — | carries `talentTree`, 76 entries |
| 2,176,120 | `applybuff` | 11327 | the Vanish BUFF, source 19 → target 19 |
| 2,176,120 | `cast` | 1856 | the Vanish ACTION — decision point P |
| 2,176,580 | `cast` | 703 | Garrote — decision point Q |
| 2,176,580 | `removebuff` | 11327 | the Vanish buff being consumed |

### What makes this slice load-bearing

**The last two events share a timestamp, and their ORDER is the evidence.** The
`removebuff` sits AFTER the Garrote cast in canonical order, so the Vanish buff
is observably up at Q and observably gone immediately after. That is what lets
M4's `presenceAt` prove ACTIVE at Q from an observed APPLICATION, with no
duration invented anywhere. A slice holding only the cast could not establish it,
and a query keyed on timestamp rather than canonical position would get it wrong.

**1856 and 11327 are different identities.** The action the player pressed and
the buff it applied. `stealthed.rogue` is satisfied by the BUFF only.

### Verified facts this slice establishes

- `stealthed.rogue` resolves TRUE at the Garrote decision point, anchored on the
  observed `applybuff` of 11327.
- Actor 19's real build, read through the normalizer's `talentTree`:
  - `improved_ambush` **NOT_SELECTED** — node 90692 carries entry 117152
    (Tight Spender), not 112580. A node-presence rule would invert this.
  - `shrouded_suffocation` **SELECTED** — entry 112669 at node 90776.
  - `blindside` **UNKNOWN** — the node is absent, which M5-C2 refuses to read as
    "not taken".
- The pinned `default[4]` Ambush gate therefore resolves **FALSE** here, while
  `stealthed.rogue` is TRUE. Stealth does not imply Ambush.

### What it does NOT establish

- That Garrote was globally selected. Reaching `core_dot` requires passing
  `default[5] cds`, whose condition is still outside the supported subset.
- That Ambush was unusable. That is action readiness, a different question with a
  different stealth mask.
- Anything about `variable.single_target`. It remains UNKNOWN.
- Anything about ability 8676. It appears **zero** times in this fight, for both
  Rogues, which is expected for this build and is not an error.

Reproduce:

```powershell
# .probe/m5c2-fixture.probe.ts captures both ranges, then:
node scripts/sanitize-probe.mjs `
  .probe/m5c2-fixture-source.json `
  wcl-assassination-vanish-ambush-gate.json `
  --indices 0,1,2,3,4

# then Prettier, which reflows short numeric arrays in the combatantinfo gear
# entries. Whitespace only — the parsed payload is byte-identical to the capture.
npx prettier --write tests/fixtures/wcl/events/wcl-assassination-vanish-ambush-gate.json
```

---

## `wcl-assassination-garrote-dot-remains.json`

270 events from the same report and revision, captured on **2026-09-13** for
M5-C3a. A third separate slice, covering the window a remaining-duration
derivation actually needs.

| | |
| --- | --- |
| Report code | `A7R6kxPJ1hC8YQ4w` |
| Fight ID | 7 |
| **Report revision** | **30** — unchanged, and still load-bearing |
| `gameVersion` / `logVersion` | 1 / 17 |
| Actor | 19 (`Saruxoxo`, Assassination Rogue, `specID` 259) |
| Target | 21 (the enemy the DoT is on) |
| Window | `[2,164,325 .. 2,176,581]`, plus the pull `combatantinfo` at 2,004,589 |
| Retrieval | paged ranges, `limit` 10,000, `includeResources: true`, `dataType: All`, `hostilityType` omitted |

### Why it is 270 events and not five

The derivation makes a CONTINUITY claim across `[2,164,326 .. 2,176,580]`:
actor 19's Garrote was applied at the start and nothing removed it before the
end. A slice may only support that claim if it contains **every aura observation
M4 consults for that identity over the interval**.

M4 indexes aura observations by TARGET, and a from-source query additionally
consults unidentified-ability observations on that target and sourceless
transitions of the same aura. So the honest predicate is *every aura event in the
interval whose target is 19 or 21* — nothing filtered by ability or by source —
plus the casts the decision point needs.

Filtering by ability would have been far smaller and **wrong**: it would have
removed exactly the events capable of contradicting the continuity claim, leaving
a fixture that proves continuity by construction. Measured before capture: 0
unidentified-ability aura events on target 21, so nothing ambiguous is present.

### The three Garrote transitions

| `timestamp` | `type` | source → target | Why it matters |
| --- | --- | --- | --- |
| 2,164,326 | `applydebuff` | 19 → 21 | **the anchor** |
| 2,172,232 | `applydebuff` | 13 → 21 | a DIFFERENT rogue's independent DoT |
| 2,176,580 | `removedebuff` + `applydebuff` | 19 → 21 | the cast's own consequence |

The middle row is the slice's sharpest asset. Actor 13 lands an independent
Garrote on the same target between the anchor and Q. It is a different aura
identity, so it must not become actor 19's anchor — and because it is an
APPLICATION, mistaking it yields **13.652 s** instead of 5.746 s. Both are
plausible; only one is right.

### Event order at Q is EVIDENCE, and this slice was re-captured to get it right

At 2,176,580 the Garrote cast shares a timestamp with eight other events,
including the `removedebuff` + `applydebuff` the cast itself causes. **Warcraft
Logs returns the cast FIRST**, and the fixture preserves that order verbatim:

| # | `type` | `abilityGameID` |
| --- | --- | --- |
| 1 | `cast` | 703 |
| 2 | `removebuff` | 11327 |
| 3 | `applybuff` | 392401 |
| 4 | `refreshdebuff` | 1305711 |
| 5 | `removedebuff` | 703 |
| 6 | `applydebuff` | 703 |
| 7–8 | `refreshdebuff` | 392388, 3409 |

`BEFORE_EVENT` at the cast excludes everything after it, so the anchor is the
2,164,326 application and `remains` is 5.746 s. Had the consequences sorted
first, the same query would have found the DoT the cast itself applied and
derived **18.000 s** — justifying the decision by its own result.

**The first capture got this wrong.** It assembled the slice as
`[...combatantInfo, ...auraEvents, ...casts]` and sorted on `timestamp` alone;
`Array.prototype.sort` is stable, so every aura event landed before the cast. The
slice was re-captured with a single in-place filter that preserves the API's own
interleaving. The event multiset is identical between the two captures — only the
order differs, and the order is the part that decides the answer.

### Verified facts this slice establishes

- Garrote `remains` at Q = **5.746 s**, from `(2,164,326 + 18,000) − 2,176,580`,
  where 18,000 ms is the pinned `_duration` for spell 703.
- The anchor is actor 19's own application, not actor 13's, and not the
  post-decision re-application.
- `stealthed.rogue` is still TRUE at Q, anchored on the Vanish buff (11327) — the
  M5-C2 fact, re-proved against this larger slice.
- Within `core_dot`, the pinned authority selects **Garrote** at ordinal 0, TRUE
  across all eight enumerated worlds.

### What it does NOT establish

- That Garrote was GLOBALLY selected. `default[0]` stealth and `default[1]` kick
  sit above the `core_dot` call, unconditional, with action readiness and
  interruptibility unmodelled.
- Anything about the `cds` list. It is never evaluated.
- Anything about `talent.razor_wire` or `variable.single_target`. Both remain
  UNKNOWN; the verdict holds because it converges across every resolution.
- Anything about `pmultiplier`. It is a snapshot this project does not
  reconstruct and is never resolved.
- That `core_dot` is evaluable in general. Entries 1–4 remain outside the
  supported subset; the walk stops at entry 0 and never reaches them.

Reproduce:

```powershell
# .probe/m5c3a-order.probe.ts captures the interval and filters IN PLACE,
# preserving the order Warcraft Logs returned. Then:
node scripts/sanitize-probe.mjs `
  .probe/m5c3a-ordered-source.json `
  wcl-assassination-garrote-dot-remains.json

# then Prettier, which reflows short numeric arrays in the combatantinfo gear
# entries. Whitespace only — the parsed payload is byte-identical to the capture.
npx prettier --write tests/fixtures/wcl/events/wcl-assassination-garrote-dot-remains.json
```

---

## `wcl-assassination-kingsbane-cooldown.json`

310 events from the same report and revision, captured on **2026-09-13** for
M5-C3c1.

| | |
| --- | --- |
| Report code | `A7R6kxPJ1hC8YQ4w` |
| Fight ID | 7 |
| **Report revision** | **30** — unchanged, and still load-bearing |
| `gameVersion` / `logVersion` | 1 / 17 |
| Actor | 19 (`Saruxoxo`, Assassination Rogue, `specID` 259) |
| Window | `[2,164,325 .. 2,176,581]`, plus the pull `combatantinfo` at 2,004,589 |
| Retrieval | paged ranges, `limit` 10,000, `includeResources: true`, `dataType: All`, `hostilityType` omitted |

### How it differs from the C3a slice

Same window. The AURA predicate is identical — every aura event targeting actor
19 or 21. The CAST predicate is **widened** from "the two decision casts" to
**every actor-19 cast**: 42 instead of 2.

That widening is what makes the cooldown derivation sound. It asks
`lastObservedCast(kingsbane, COMPLETE, before Q)`, and "most recent" is only
meaningful if the slice contains every candidate. A fixture filtered to the
abilities the test cares about would have proved "the most recent Kingsbane cast
among the ones we kept" — a different and much weaker claim.

### The cast sequence

| `timestamp` | rel Q | `abilityGameID` | |
| --- | --- | --- | --- |
| 2,172,777 | −3,803 | 360194 | Deathmark |
| 2,173,778 | −2,802 | 385627 | **Kingsbane — the cooldown anchor** |
| 2,175,585 | −995 | 32645 | Envenom |
| 2,176,120 | −460 | 1856 | Vanish |
| 2,176,580 | 0 | 703 | Garrote — the decision point Q |

The remaining 37 casts are 24 melee autos (ability 1) and assorted abilities.
They are not noise: they are what demonstrates, on real data, that an unrelated
cast does not anchor a cooldown.

### Event order is preserved verbatim

Filtered IN PLACE rather than re-sorted, for the reason the C3a entry records at
length: at Q the cast shares a timestamp with its own consequences, and Warcraft
Logs returns the cast FIRST.

### Verified facts this slice establishes

- Kingsbane cooldown at Q = **EXACT 57.198 s**, from `60000 − 2802`.
- `cooldown.kingsbane.remains<=2` = **FALSE**, so `cds[0]` Deathmark is FALSE in
  all four enumerated worlds.
- The traversal's earliest blocker moves from `cds[0]` to `cds[1]`.

### What it does NOT establish

- Nothing about DoT ticking, Envenom duration, or any predictive value. Those
  atoms parse and stay unknown.
- No global Garrote selection.
- No negative usability for Kingsbane itself; `cds[4]` is never reached.
- The 60 s base cooldown is pinned DBC, not derived from this capture. The
  observed next Kingsbane cast at Q+57,665 (60,467 ms after the anchor)
  corroborates it but is not the source.

Reproduce:

```powershell
# .probe/c3c1-fixture.probe.ts captures the interval and filters IN PLACE.
node scripts/sanitize-probe.mjs `
  .probe/m5c3c1-source.json `
  wcl-assassination-kingsbane-cooldown.json `
  --head 310

npx prettier --write tests/fixtures/wcl/events/wcl-assassination-kingsbane-cooldown.json
```

---

## `wcl-assassination-d2-decision-corpus.json`

1083 events from the same report and revision, captured on **2026-09-13** for
M5-D2.

| | |
| --- | --- |
| Report code | `A7R6kxPJ1hC8YQ4w` |
| Fight ID | 7 |
| **Report revision** | **30** — unchanged, and still load-bearing |
| `gameVersion` / `logVersion` | 1 / 17 |
| Actor | 19 (`Saruxoxo`, Assassination Rogue, `specID` 259) |
| Window | `[2,164,325 .. 2,194,928]`, plus the pull `combatantinfo` at 2,004,589 |
| Retrieval | paged ranges, `limit` 10,000, `includeResources: true`, `dataType: All`, `hostilityType` omitted |

### A strict forward extension of the C3c1 slice

Same start, same predicate — every actor-19 cast, plus every aura event
targeting actor 19 or 21 — with the end moved from `2,176,581` out to
`2,194,928`. 1083 events instead of 310, 131 casts instead of 42.

Nothing about the C3c1 window was relaxed, so every fact that slice established
is still established by this one, and case 1 of the corpus asserts the M5-C3c3c
result verbatim on the wider data.

### The window start is MEASURED, not inherited

A wider capture `[2,136,000 .. 2,195,000]`, 2777 events, was taken first and
kept only in gitignored `.probe/`. The committed start was then chosen by
cutting progressively later and re-running all seven corpus decisions:

| cut | case 1 | Garrote remains |
| --- | --- | --- |
| 2,136,000 | SELECTED garrote @ `core_dot[0]` | 5.746 s |
| 2,158,000 | SELECTED garrote @ `core_dot[0]` | 5.746 s |
| **2,164,325** | **SELECTED garrote @ `core_dot[0]`** | **5.746 s** |
| 2,168,000 | UNKNOWN | not established |

`2,164,326` is the `applydebuff` anchoring actor 19's Garrote on target 21.
Without it the DoT remainder is not derivable and the exact answer correctly
withdraws. Every other case is unchanged across all four cuts.

`tests/regression/m5d2-truncated-window.test.ts` re-runs that degradation
against the committed fixture, so the justification is executable rather than
recorded prose.

### Why the end is 2,194,928

The last corpus decision is the Rupture cast at `2,194,927`; `2,194,928` is its
own `applydebuff`. No case reads anything later.

### Deliberately EXCLUDED: enemy 22

The capture also collected aura events targeting actor 22 — the fight's other
enemy, which actor 19 was attacking until `2,171,770`. Including them changed no
corpus outcome, so they are not committed.

They did expose a real defect in the corpus, worth recording because the fix is
a rule and not a one-off. The case-2 query point was originally addressed as
"one index before the Garrote cast". Adding enemy-22 events shifted what that
index referred to by 43 ms, silently moving a derived DoT remainder from 5.835 s
to 5.792 s. Every locator now matches on a TIMESTAMP and asserts the match is
unique. Index-relative addressing is not safe against a change of capture
predicate.

### The decisions this slice carries

| `timestamp` | rel Q | ability | corpus case |
| --- | --- | --- | --- |
| 2,164,326 | −12,254 | Garrote `applydebuff` | anchor for case 1 |
| 2,172,777 | −3,803 | Deathmark 360194 | case 6 |
| 2,173,778 | −2,802 | Kingsbane 385627 | cooldown anchor |
| 2,175,585 | −995 | Envenom 32645 | — |
| 2,176,120 | −460 | Vanish 1856 | cooldown anchor, cases 2/3/4/5/7 |
| 2,176,491 | −89 | (aura) | **case 2 query point** |
| 2,176,580 | 0 | Garrote 703 | **case 1** |
| 2,178,582 | +2,002 | Envenom 32645 | case 3 |
| 2,190,902 | +14,322 | Envenom 32645 | case 4 |
| 2,191,906 | +15,326 | Fan of Knives 51723 | case 7 |
| 2,194,927 | +18,347 | Rupture 1943 | case 5 |

Each was chosen by a mechanical rule over the full-fight cast census, recorded
on the case itself in `tests/support/m5d2-corpus.ts`.

### Event order is preserved verbatim

Filtered IN PLACE rather than re-sorted, for the reason the C3a entry records at
length.

### Verified facts this slice establishes

- Case 1 resolves to **`ROTATIONAL_GCD_SELECTED garrote @ core_dot[0]`** via
  `default[6]`, matching M5-C3c3c on 3.5× the events.
- Case 2 resolves `core_dot[0]`'s CONDITION to **TRUE** at a position where
  Garrote was not cast, and still returns UNKNOWN — on usability alone.
- The Vanish CHARGE cooldown (120,000 ms) eliminates `vanish[0]` and `vanish[1]`
  14,782 ms after the anchor. The nominal `_cooldown` of 1,000 ms would not have.
- Measured decision coverage over the corpus: **1 exact, 0 token-converged,
  0 no-action, 6 UNKNOWN.**

### What it does NOT establish

- No Rupture DoT remainder. Its nearest anchor on target 21 is a REFRESH, so
  `refreshable` stays UNKNOWN and `core_dot[3]` is never decided.
- Nothing about movement, Energy between observations, or any cooldown upper
  bound. None of those is derivable and none is attempted.
- No coaching verdict of any kind. Case 6 and case 7 are decisions the player
  actually made, and the corpus declines to evaluate both.

Reproduce:

```powershell
# .probe/m5d2-fixture.probe.ts captures [2,136,000 .. 2,195,000] wide, then the
# committed slice is cut to [2,164,325 .. 2,194,928] with the C3c1 predicate:
#   auras targeting actor 19 or 21, every actor-19 cast, pull combatantinfo.
node scripts/sanitize-probe.mjs `
  .probe/m5d2-source.json `
  wcl-assassination-d2-decision-corpus.json `
  --head 1083

npx prettier --write tests/fixtures/wcl/events/wcl-assassination-d2-decision-corpus.json
```

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

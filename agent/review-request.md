# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-S6: shared pet actor mapping for pet-driven APL state. Branch
`autopilot/onb-s6`, from main at 668d34d.

- **Internal shared engine only.** New `src/engine/game-state/pets/pet-state.ts`
  and `src/simc/expression/pet-atoms.ts`. Nothing under `src/contracts/`,
  `src/api/` or `src/mcp/` changes, no existing module changes, and no
  specialization module changes. No registered specialization builds a pet
  state, so no public decision changes.
- **Warcraft Logs: NONE.** No request, probe or capture. Tests are synthetic,
  plus the already-committed evidence archive (b1PmaKrd6CDfzngc fight 48
  owned-pet segments, M11-E2.1).
- Queue bookkeeping: ONB-S5 is recorded MERGED (PR #43, 668d34db…) and ONB-S6
  is set PR_OPEN. The other merged tranches the supervisor listed were already
  recorded MERGED with their pr and mergeSha.

## Direction

`agent/autopilot-queue.md` ONB-S6, `agent/follow-ups.md` "After M11-G3-1"
(pets are not mapped to WCL actors), and the M11-E2.1 owned-pet tooling.
Scope: a shared, evidence-backed mapping between pinned SimulationCraft pet
entities and Warcraft Logs pet actors (stated `petOwner`, summon events),
plus pet-count and pet-active state for APL reads. An ambiguous mapping is
UNKNOWN, never a guess.

## Design (agent/architecture.md "ONB-S6")

**Review history.**

- Cycle 1: non-monotonic time must refuse every surface. Fixed in `guard`,
  with an unsorted-sequence regression.
- Cycle 2: presence used a cast AFTER t to bracket t, which O2
  (architecture.md "No future bracketing") forbids for authority. Presence
  was redesigned to read only events at or before t. The continuity option
  is removed, and a regression appends later events and proves every
  surface unchanged.

**Ownership split.** Shared code holds the mapping, the evidence rules and
the fail-closed gates, and knows no pet. The specialization supplies a frozen
`PetMappingProfile` (`definePetMappingProfile` throws on a malformed one).
Each entity gives:

- `simcName` and `wclGameIds`;
- a proven `minLifetimeMs` (cannot end sooner) or `null`;
- a proven `maxLifetimeMs` or `null`;
- `instancesBeginWithSummon` (reviewed).

What `pet.X.active`, a count or a pet aura means in an APL stays the
specialization's.

**Mapping.**

- Ownership is WCL `petOwner` only, never a summon source.
- Two entities listing one gameID are both AMBIGUOUS, so every answer is
  UNKNOWN. This is how the Rune Weapon shared across engine pets is handled.
- A catalog actor of a listed gameID with an unstated owner, or an owned
  actor with no gameID, blocks absence and count ceilings
  (`OWNERSHIP_NOT_STATED`).

**No future evidence (O2), throughout the millisecond.** The answer at t
reads only events at or before t, and holds whatever the unproven
same-millisecond order. PRESENT needs all of:

- a pinned minimum lifetime;
- a single summon strictly before t, with t < summon + min;
- no positive death since the summon;
- up to t, no cast before the summon or after summon + max, and no null
  instance id beside numbered ones.

Casts and damage never prove presence on their own (M11-ED delayed damage).
A death never proves absence.

**No unobserved instance.** NOT_PRESENT and a count ceiling need all of:

- summon start and maximum lifetime D pinned;
- t − D not before the pull;
- SUMMONS COMPLETE over [t − D, t] for the owner and every mapped actor, via
  the shared `gateAbsenceClaim`;
- no owner-sourced summon in the window to an actor without a gameID;
- no unstated-owner candidate;
- no past cast contradicting D (`LIFETIME_BOUND_CONTRADICTED`).

Then a key with no summon in [t − D, t] is NOT_PRESENT. Otherwise no key is
NOT_PRESENT, and `instancesAt` reports `unobservedKeysPossible`. A later
summon is never used to prove an earlier absence. A non-monotonic order
refuses every surface.

**Counts.** EXACT, BOUNDED with a ceiling (undecided window keys), or BOUNDED
without one (an unobserved instance is possible, or one key has two summons
in the window). As atoms they become KNOWN_NUMBER, ONE_OF_NUMBERS and
BOUNDED_NUMBER. An undecided presence binds no truth, so the evaluator
enumerates it, and it is never false.

**Layering.** `pet-atoms.ts` takes structural inputs, so `src/simc` still
imports nothing from `src/engine`. The specializations bridge the two, as
they already do for cooldowns.

## Retained evidence (test profiles; the lifetimes are not game data)

b1PmaKrd6CDfzngc fight 48, focus 15:

- Ghoul 47: three instances, one summon each. Another player's Ghoul (41) is
  not mapped. With test lifetimes of 30 s minimum and 61 s maximum, at
  one-second samples:
  - 90 PRESENT;
  - 159 NOT_PRESENT;
  - 65 undecided;
  - 31 pre-pull blocked.
- Blood Beast 45: four instances, each ending in a death. Unstated owner
  actor 142 blocks every absence claim: 20 PRESENT, 325 UNKNOWN.
- Rune Weapon 44: AMBIGUOUS throughout. Warband Bank Convergence 224:
  unclassified.

## Files

- `src/engine/game-state/pets/pet-state.ts`: new.
- `src/simc/expression/pet-atoms.ts`: new.
- `tests/unit/onb-s6-pet-state.test.ts`: new, 49 tests.
- `agent/architecture.md` (new section "ONB-S6"), `agent/follow-ups.md`
  ("After ONB-S6", and a pointer in "After M11-G3-1"), `agent/testing.md`
  (index block), `agent/spec-onboarding-inventory.md` (notes),
  `agent/autopilot-queue.md`.

## Validation

- `npx tsc --noEmit`: clean. `npx prettier --check` on every changed source
  and test file: clean.
- `tests/unit/onb-s6-pet-state.test.ts`: 49/49. This includes the engine
  vocabulary and layering contracts that sweep `src/engine` and `src/simc`.
- Rerun after the cycle 2 rework: `onb-s6-pet-state`, `m4-state-vocabulary` and`n  `m5-boundary-and-vocabulary`: 130/130. The rework touched only the new`n  files, which nothing else imports.
- Full `npx vitest run` before the rework (default parallelism): 12089 passed and 20 failed, in
  13 heavy files. All 20 are timeouts under load (simulation runner service,
  public projections, corpus harness, raid night). None imports the new
  modules.
- Those 13 files rerun serially: 209/210. The one remaining failure is
  `tests/regression/m8g-encounter-context-composition.test.ts` (workers
  project), which took 5.9 s against a 5 s timeout. ONB-S5 recorded the same
  failure on the untouched main tree on this machine.

## Questions for the reviewer

1. Is a pinned minimum lifetime, with a single summon strictly before t, the
   right past-only basis for PRESENT under O2?
2. Is cast-contradiction of the maximum lifetime (`LIFETIME_BOUND_CONTRADICTED`)
   a sufficient guard for an absence claim that rests on D?

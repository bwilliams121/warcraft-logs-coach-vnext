# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M11-G4-4: DPS comparability, i.e. when attainment may be KNOWN. Branch
`m11-g4-4-attainment-comparability`, from main at e7a30a7 (G4-3 merged).

## Review cycle 2: response to CHANGES_REQUIRED (cycle 1)

Finding: PROVEN followed from source, log version and target count alone,
which does not establish that an observation's attribution matches the
engine's. Fixed:

- **New `src/publication/attribution.ts`.**
  - `reconcileObservedAttribution` requires each observation's own table
    total to equal, to the unit, Σ (amount + absorbed) over the player and
    its owned pets against hostile targets.
  - The only permitted subtraction is damage from
    `CREDITED_TO_OTHER_PLAYER_ABILITIES` (Bombardments, with its evidence).
  - UNRECONCILED for:
    - incomplete owner or pet coverage;
    - any unexplained difference;
    - a credited ability the total did NOT exclude (a different attribution
      rule).
- **`ObservedDps` (KNOWN)** carries `attribution`, and
  `assessDpsComparability` requires RECONCILED. Metadata alone never proves
  comparability.
- **New negative tests:**
  - same source, version and one target, but UNRECONCILED attribution →
    NOT_PROVEN;
  - total ±1 → UNRECONCILED;
  - total including the credited ability → UNRECONCILED;
  - PARTIAL or ABSENT coverage → UNRECONCILED;
  - dropping a pet from the reconciled actors → UNRECONCILED, which proves
    pets are counted.
- **Positive test.** The canonical observation (now built in
  `tests/support/publication/canonical-observed.ts` from the archived
  events) reconciles with only Bombardments (190,342) excluded. It stays
  NOT_PROVEN on its 3 targets.
- **Docs.** The architecture rule now has four conditions plus a per-observation
  attribution section. The follow-ups state that a caller must supply complete
  owner and pet damage events. The testing lines are added.
- **Validation:**
  - publication tests: 34 pass;
  - focused suites: 125 files, 5,238 tests, pass;
  - typecheck and prettier clean;
  - full suite: 339 files, 9,870 tests, all pass (998 s).

## Intended change

The G4-2 owner decision keeps attainment UNKNOWN until G1's ACTUAL_DPS is
PROVEN to count pets and guardians as the engine's "player DPS including
pets" does. This tranche proves both sides from committed evidence, and
replaces the global `ACTUAL_DPS_ENGINE_COMPARABILITY = NOT_PROVEN` constant
with a per-publication assessment.

## Evidence (all from committed data; no capture)

- **Warcraft Logs, reconciled to the unit** (canonical subject: the
  committed full-fight owned-pet event segments plus the G1 DamageDone
  table, log version 17):
  - table total = Σ (amount + absorbed) over owner 15 and pets 44, 45 and 47
    against hostile NPCs, minus Bombardments (434481, credited by WCL to
    another player; 190,342);
  - 45,992,351 − 190,342 = 45,802,009;
  - each pet row, each add row (179, 180) and the boss row match exactly;
  - the only friendly-target damage is redirected Blessing of Sacrifice
    (6940), which is excluded;
  - the one overkill event has amount < overkill, so `amount` excludes
    overkill.
  - G1's open 92,598 gap decomposes exactly: +2,092,963 absorbed,
    −1,810,023 redirected Blessing of Sacrifice, −190,342 Bombardments.
- **Engine** (real 0a72e6a7 Consumption golden): DPS × 345.177 s = own
  damage-type actions + pet damage, relative error < 1e-12. It does not
  reconcile without the pets, and healing and absorbs are not counted.
- **SimC source at the pin.** `action_t::record_data` records
  `stats->add_result(result_amount, …)`, and `player_t::do_damage` caps only
  the target's health loss. The engine therefore counts overkill, which can
  differ only if a simulated target dies early. A fixed-time single target
  cannot.

## Decision made (please assess)

The rule (`src/publication/comparability.ts`, `assessDpsComparability`):
comparability is PROVEN only when the observed DPS is

- the DamageDone table total (source equal to cohort `ACTUAL_DPS_SOURCE`,
  which a test keeps equal);
- read under an evidenced log version (17);
- damage to exactly ONE target.

Otherwise it is NOT_PROVEN with reasons, and attainment stays UNKNOWN.
Reasons for the rule:

- a simulation job is single target, so the table's multi-target total is
  not comparable;
- the evidence covers one log version;
- it makes no claim about attribution rules not seen in the evidence (for
  example Augmentation credit).

The owner's stated condition, pets and guardians, is met on both sides. The
target restriction is an additional fail-closed limit taken from the job
schema.

## Files / surfaces changed

- **New** `src/publication/comparability.ts`.
- **Record and pipeline:**
  - `src/publication/record.ts`: `ObservedDps` KNOWN carries `logVersion`
    and `targetCount`; the record carries `comparability {state, reasons}`.
  - `src/publication/pipeline.ts`: the global constant is removed; the
    assessment drives attainment.
- **Comment only:** `src/cohort/observed-performance.ts` (pet inclusion is
  now reconciled).
- **Tests:**
  - new `tests/unit/publication/dps-comparability-evidence.test.ts` (10);
  - `tests/unit/publication/pipeline.test.ts`:
    - the canonical observed DPS carries log version 17 and 3 targets, so it
      is NOT_PROVEN;
    - the synthetic observed DPS is NOT_PROVEN;
    - new: a comparable observation gives attainment KNOWN `[45,000 / 50,500,
      45,000 / 49,500]`;
  - `tests/contracts/m11g4-publication-layering.test.ts` lists
    `comparability.ts`.
- **Docs:**
  - `agent/architecture.md`: new section "M11-G4-4";
  - `agent/testing.md`;
  - `agent/follow-ups.md`: the G4-2 attainment item is RESOLVED for
    single-target observations, with the remainder listed; the G1 M1 entry is
    rewritten (the 92,598 gap explained; pet inclusion proven for this
    fight).

## Validation

- Evidence and publication tests: 10 + 18, pass.
- **Focused suites:** publication, simulation-context, simulation,
  environment, character-profile, the G1 cohort and its boundary, all
  contracts and the remote-client integration: 125 files, 5,228 tests, pass.
- **Public digests unchanged:** 600/600; publication is internal.
- **Checks:** typecheck clean; prettier clean; `git diff --check` clean.
- **Full suite** (`npm test -- --maxWorkers=1 --testTimeout=30000`): 339
  files, 9,860 tests, all pass (970 s).

## External / network activity

None. No Warcraft Logs requests; no Docker runs. The one pinned SimC source
read used the local SimC clone (git blob fetch from GitHub).

## Known limitations

- Multi-target observations stay NOT_PROVEN.
- The proof covers one fight under log version 17.
- No real subject passes ENVIRONMENT yet, so no real attainment is produced.

## Owner questions

None.

## Staged / committed

Nothing is staged or committed.

# Specialization onboarding inventory

The canonical record of FULL PLAYABLE-SPECIALIZATION ONBOARDING progress
(owner product decision, 2026-11-02). The roster comes from the pinned
`src/data/game/spec-roster.json` (`playableSpecializationCount` 40). States
come from the production analyzer registry (`src/services/analyzer-registry.ts`)
and the specialization trees under `src/specs/`. The queue entries that own
each remaining specialization are in `agent/autopilot-queue.md`
("Specialization onboarding").

This file is updated by every onboarding tranche that changes a
specialization's state. The deeper per-specialization question backlog
stays in `agent/m11-spec-coaching-inventory.md` and
`tests/support/m11/coaching-inventory.json`.

## Completion rule (owner product decision, 2026-11-02)

- **Scope.** The project is not complete when M15-F is complete. The
  intended product scope is every playable specialization in the pinned
  roster.
- **When onboarding is complete.** Every playable specialization has an
  explicit TERMINAL disposition:
  1. **PUBLIC**, the preferred disposition;
  2. **DEFERRED**, by an explicit owner decision;
  3. **BLOCKED**, on a documented genuine missing authority or evidence
     condition that prevents truthful support.
- **What does not count.** An empty queue while ordinary playable
  specializations remain unsupported is NOT completion. Finishing the
  architecture milestones is not specialization-completeness, and a shared
  foundation never counts as a completed specialization.
- **At final completion,** queue entry ONB-Z regenerates the roster matrix
  below with every row terminal.

## State vocabulary

| State | Meaning |
| --- | --- |
| `PUBLIC` | registered in the production registry with PUBLIC exposure, so a public request runs its analyzer |
| `INTERNAL_ONLY` | registered with INTERNAL_ONLY exposure: internal analysis only, refused publicly |
| `FOUNDATION` | a specialization module or evaluator exists but is not registered |
| `NOT_STARTED` | no specialization module; support is not inferred from runtime data or a directory |
| `DEFERRED` | terminal, by owner decision |
| `BLOCKED` | terminal for now, on a documented authority or evidence blocker |

`Evidence` gives the retained, already-authorized real evidence known to
hold the specialization:

- `COMMITTED`: committed sanitized evidence exists;
- `RETAINED_RAW`: an authorized local capture holds it, such as the
  whole-fight unfiltered M11-E2 capture of `b1PmaKrd6CDfzngc` fight 48 or
  the earlier M11 local captures;
- `CONTEXT_ONLY`: it appears only in a committed fight context, with no
  retained events known;
- `NONE_KNOWN`.

The spec's own authority and evidence review step verifies this; it is
never assumed.

## Progress summary

```onboarding-progress
{
  "asOf": "2026-11-03",
  "rosterSource": "src/data/game/spec-roster.json",
  "playableTotal": 40,
  "public": 6,
  "internalOnly": 1,
  "foundation": 0,
  "blocked": 0,
  "deferred": 0,
  "notStarted": 33,
  "publiclySupportedPercent": 15,
  "terminallyDispositionedPercent": 15,
  "notes": "Augmentation Evoker became PUBLIC with M13-F (#36). Restoration Shaman is INTERNAL_ONLY since HEAL-A (registered, binding no pinned authority, healer finding shape); its public promotion and healer gate are HEAL-AP. Shared foundations (src/healing, src/support, the M14 comparison facts) are never counted. ONB-S1 (shared precombat variable execution), ONB-S2 (shared variable combining operations), ONB-S4 (shared cast and channel decision anchor), ONB-S5 (shared pooling and wait semantics) and ONB-S6 (shared pet actor mapping) change no specialization's state."
}
```

The percentages are `public / playableTotal` and
`(public + deferred + blocked) / playableTotal`.

## Roster matrix

| Roster key | Role | State | Evidence | Owning tranche(s) |
| --- | --- | --- | --- | --- |
| `rogue/assassination` | DPS | PUBLIC | COMMITTED | M1–M9 (terminal) |
| `paladin/protection` | TANK | PUBLIC | COMMITTED | M10 (terminal) |
| `paladin/retribution` | DPS | PUBLIC | COMMITTED | M11-A4/A5 (terminal) |
| `deathknight/blood` | TANK | PUBLIC | COMMITTED | M11-B (terminal) |
| `monk/brewmaster` | TANK | PUBLIC | COMMITTED | M11-C (terminal) |
| `evoker/augmentation` | UNKNOWN (support) | PUBLIC | COMMITTED (M13-A, M13-D certified) | M13-A–M13-F (terminal) |
| `shaman/restoration` | HEALER | INTERNAL_ONLY | COMMITTED (M12-D archive, fight 48, actor 122) | HEAL-A, HEAL-AP |
| `paladin/holy` | HEALER | NOT_STARTED | RETAINED_RAW (fight 48 "Holy", class to verify) | HEAL-B1, HEAL-B1P |
| `druid/restoration` | HEALER | NOT_STARTED | CONTEXT_ONLY | HEAL-B1, HEAL-B1P |
| `monk/mistweaver` | HEALER | NOT_STARTED | RETAINED_RAW (fight 48) | HEAL-B1, HEAL-B1P |
| `priest/holy` | HEALER | NOT_STARTED | RETAINED_RAW (fight 48 "Holy", class to verify) | HEAL-B2, HEAL-B2P |
| `priest/discipline` | HEALER | NOT_STARTED | CONTEXT_ONLY | HEAL-B3, HEAL-B3P |
| `evoker/preservation` | UNKNOWN (healer) | NOT_STARTED | CONTEXT_ONLY | HEAL-B4, HEAL-B4P |
| `demonhunter/havoc` | DPS | NOT_STARTED | RETAINED_RAW (fight 48) | ONB-A1, ONB-A1P |
| `rogue/subtlety` | DPS | NOT_STARTED | CONTEXT_ONLY | ONB-A2, ONB-A2P |
| `warrior/fury` | DPS | NOT_STARTED | NONE_KNOWN | ONB-A2, ONB-A2P (evidence: ONB-EV) |
| `warrior/protection` | TANK | NOT_STARTED | NONE_KNOWN (a "Protection" in fight 48 may be the Paladin) | ONB-A2, ONB-A2P (evidence: ONB-EV) |
| `warrior/arms` | DPS | NOT_STARTED | RETAINED_RAW (fight 48) | ONB-B1, ONB-B1P |
| `deathknight/frost` | DPS | NOT_STARTED | RETAINED_RAW ("Frost" in fight 48, class to verify) | ONB-B2, ONB-B2P |
| `shaman/enhancement` | DPS | NOT_STARTED | CONTEXT_ONLY | ONB-B2, ONB-B2P |
| `demonhunter/devourer` | DPS | NOT_STARTED | RETAINED_RAW (earlier M11 local capture) | ONB-B3, ONB-B3P |
| `druid/feral` | DPS | NOT_STARTED | RETAINED_RAW (fight 48) | ONB-C1, ONB-C1P |
| `rogue/outlaw` | DPS | NOT_STARTED | NONE_KNOWN | ONB-C2, ONB-C2P (evidence: ONB-EV) |
| `monk/windwalker` | DPS | NOT_STARTED | RETAINED_RAW (fight 48) | ONB-T1, ONB-T1P |
| `druid/guardian` | TANK | NOT_STARTED | CONTEXT_ONLY | ONB-T2, ONB-T2P |
| `hunter/beast_mastery` | DPS | NOT_STARTED | RETAINED_RAW (fight 48) | ONB-T2, ONB-T2P |
| `hunter/survival` | DPS | NOT_STARTED | NONE_KNOWN | ONB-T2, ONB-T2P (evidence: ONB-EV) |
| `warlock/destruction` | DPS | NOT_STARTED | RETAINED_RAW (earlier M11 local capture) | ONB-D1, ONB-D1P |
| `shaman/elemental` | DPS | NOT_STARTED | RETAINED_RAW (fight 48) | ONB-D2, ONB-D2P |
| `druid/balance` | DPS | NOT_STARTED | RETAINED_RAW (earlier M11 local capture) | ONB-D2, ONB-D2P |
| `priest/shadow` | DPS | NOT_STARTED | RETAINED_RAW (earlier M11 local capture) | ONB-D2, ONB-D2P |
| `mage/arcane` | DPS | NOT_STARTED | RETAINED_RAW (fight 48, actor 121) | ONB-D3, ONB-D3P |
| `mage/frost` | DPS | NOT_STARTED | CONTEXT_ONLY ("Frost" class to verify) | ONB-D3, ONB-D3P |
| `warlock/affliction` | DPS | NOT_STARTED | CONTEXT_ONLY | ONB-D4, ONB-D4P |
| `hunter/marksmanship` | DPS | NOT_STARTED | CONTEXT_ONLY | ONB-D4, ONB-D4P |
| `mage/fire` | DPS | NOT_STARTED | RETAINED_RAW (earlier M11 local capture) | ONB-X1, ONB-X1P |
| `evoker/devastation` | UNKNOWN (DPS by declared classification) | NOT_STARTED | RETAINED_RAW (fight 48) | ONB-X2, ONB-X2P |
| `demonhunter/vengeance` | TANK | NOT_STARTED | NONE_KNOWN | ONB-X3, ONB-X3P (evidence: ONB-EV) |
| `warlock/demonology` | DPS | NOT_STARTED | RETAINED_RAW (fight 48) | ONB-X4, ONB-X4P |
| `deathknight/unholy` | DPS | NOT_STARTED | CONTEXT_ONLY | ONB-X5, ONB-X5P |

Counts: 40 rows; PUBLIC 6, INTERNAL_ONLY 1, FOUNDATION 0, NOT_STARTED 33.

## Cohort design

Specs are grouped by shared ENGINEERING pattern, never by shared gameplay
meaning. The cohorts follow the M11-D0 census, refined by the M11-D1 to D3
engine work and by the evidence above.

- **Gameplay stays per spec.** Every specialization keeps its own module
  under `src/specs/<class>/<spec>/`, its own authority and its own promotion
  gates.
- **Shared machinery stays shared.** It lands only in the shared-capability
  tranches (ONB-S*), never as `if spec === ...` in generic infrastructure.
- **Representative first.** A cohort with a new pattern starts with one
  representative specialization (A1, B1, C1, T1, D1, and each holdout X*).
  Its 2–3 structurally similar members follow once the pattern is proven.

| Cohort | Pattern | Representative | Followers | Shared prerequisite |
| --- | --- | --- | --- | --- |
| A | instant builder/spender, no `run_action_list`, precombat-assigned variables | Havoc | Subtlety, Fury, Protection Warrior | ONB-S1 precombat list |
| B | `run_action_list` dispatch, cooldown windows | Arms | Frost DK, Enhancement | ONB-S1 |
| B3 | Devourer: new spec, pseudo-actions (`pick_up_fragment`, `line_cd`), numeric `react` | Devourer (own representative) | — | ONB-S1, ONB-S2 combining operations |
| C | resource pooling / waits | Feral | Outlaw | ONB-S5 pooling and wait semantics |
| T | target selection / target count | Windwalker | Guardian, Beast Mastery, Survival | ONB-S3 enemy-set authority (owner decision) |
| D | casters needing a cast/channel decision anchor | Destruction | Elemental, Balance, Shadow; Arcane, Frost Mage; Affliction, Marksmanship | ONB-S4 cast and channel anchor |
| X | holdouts, each its own representative | Fire, Devastation, Vengeance, Demonology, Unholy | — | per entry (S2, S4, S6) |
| HEAL | healers on the proven M12 healer architecture | Restoration Shaman | Holy Paladin, Restoration Druid, Mistweaver; Holy Priest; Discipline (own representative); Preservation (own representative) | M12 healer primitives, M12-E raid plan |
| AUG | support role, M13 (never folded into DPS onboarding) | Augmentation | — | M13 |

## Evidence policy for onboarding

- **Network.** Every onboarding tranche is `wcl: NONE`. Retained,
  already-authorized material comes first (the M12 precedent: slicing the
  M11-E2 whole-fight capture needs no new request).
- **When evidence is missing.** If a specialization has no adequate retained
  evidence, its tranche keeps the specialization INTERNAL_ONLY and records
  the exact need under ONB-EV. ONB-EV is the single owner decision for a
  neutral, deterministic, bounded campaign. A specialization missing
  evidence never blocks unrelated cohorts.
- **Corpus and archive.** The existing caps and the M12 ledger rule apply:
  full real captures go to the evidence archive and minimal fixtures to the
  corpus. When several specs' minimal fixtures cannot fit, raise the
  measured corpus proposal; never raise the line silently.

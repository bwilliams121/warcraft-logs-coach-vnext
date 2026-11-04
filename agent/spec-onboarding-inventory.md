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
  "public": 12,
  "internalOnly": 6,
  "foundation": 0,
  "blocked": 0,
  "deferred": 0,
  "notStarted": 22,
  "publiclySupportedPercent": 30,
  "terminallyDispositionedPercent": 30,
  "notes": "Augmentation Evoker became PUBLIC with M13-F (#36). Restoration Shaman became PUBLIC with HEAL-AP (registered INTERNAL_ONLY in HEAL-A; binds no pinned authority; publishes healerFindings) after passing the healer promotion gate (tests/contracts/heal-ap-healer-promotion-gate.test.ts). Holy Paladin, Restoration Druid and Mistweaver Monk were registered INTERNAL_ONLY in HEAL-B1 (on Restoration Shaman's healer architecture, binding no pinned authority). HEAL-B1P promoted Holy Paladin and Mistweaver Monk PUBLIC after each passed the healer promotion gate on its whole-fight casts in b1PmaKrd6CDfzngc fight 48 (cut from the retained M11-E2 capture, no new request). Restoration Druid stays INTERNAL_ONLY: no committed or retained capture holds one of its events, so it cannot meet the gate; its evidence gap is recorded on ONB-EV. Holy Priest was registered INTERNAL_ONLY in HEAL-B2 (on the same healer architecture, binding no pinned authority); HEAL-B2P promoted it PUBLIC after it passed the healer promotion gate on its whole-fight casts in b1PmaKrd6CDfzngc fight 48 (actor 2, cut from the retained M11-E2 capture, no new request). Discipline Priest is INTERNAL_ONLY since HEAL-B3 (its own representative on the same healer architecture, binding no pinned authority, reporting its observed Atonement as facts); HEAL-B3P did not promote it: no committed or retained capture holds its whole-fight casts (fight 48 and the M11-C4f fight have no Discipline Priest, and no retained raw page holds a Discipline ability event), so it cannot meet the healer promotion gate; it stays INTERNAL_ONLY and its evidence gap is on ONB-EV. Preservation Evoker was registered INTERNAL_ONLY in HEAL-B4 (its own representative on the same healer architecture, binding no pinned authority; its roster role stays UNKNOWN as pinned, never guessed; an identified cooldown observed empowered stops evaluation); HEAL-B4P promoted it PUBLIC after it passed the healer promotion gate on its whole-fight casts in gtKb2xHn87pNcFfW fight 22 (actor 15, cut from the retained M9-C2, M11-C4 and M11-C4b captures, no new request). That census also corrects Restoration Druid: its whole-fight events (same fight, actor 2) are retained, so its promotion needs no new request. Shared foundations (src/healing, src/support, the M14 comparison facts) are never counted. ONB-S1 (shared precombat variable execution), ONB-S2 (shared variable combining operations), ONB-S4 (shared cast and channel decision anchor), ONB-S5 (shared pooling and wait semantics) and ONB-S6 (shared pet actor mapping) change no specialization's state. Havoc Demon Hunter is INTERNAL_ONLY since ONB-A1, the first rotational specialization of full onboarding and Cohort A's representative, on a narrow surface: the Reaver's Glaive priority on Aldrachi Reaver builds. It became PUBLIC with ONB-A1P after passing both rotational gates, for Aldrachi Reaver builds only; a Fel-Scarred build is refused. Subtlety Rogue, Fury Warrior and Protection Warrior are INTERNAL_ONLY since ONB-A2, Cohort A's followers. No decision of any of them resolves today and no retained capture can validate them, so their evidence gaps are on ONB-EV, and Fury and Protection Warrior's lists also need ONB-S3. ONB-A2P did not promote Subtlety Rogue, Fury Warrior or Protection Warrior: no decision of any of them resolves and no committed or retained capture can validate them, so each stays INTERNAL_ONLY with its evidence gap on ONB-EV. Arms Warrior is INTERNAL_ONLY since ONB-B1, Cohort B's representative. No decision resolves on its retained real evidence (fight 48, actor 5), because every GCD action of its list sits behind the enemy count (ONB-S3), and it reports its Colossus Smash windows as an internal observation."
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
| `shaman/restoration` | HEALER | PUBLIC | COMMITTED (M12-D archive, fight 48, actor 122) | M12-D, HEAL-A, HEAL-AP (terminal) |
| `paladin/holy` | HEALER | PUBLIC | COMMITTED (HEAL-B1P archive, fight 48, actor 1, whole-fight casts) | HEAL-B1, HEAL-B1P (terminal) |
| `druid/restoration` | HEALER | INTERNAL_ONLY | RETAINED_RAW (gtKb fight 22 actor 2, whole fight, in the M9-C2, M11-C4 and M11-C4b captures; found by HEAL-B4P's census; not yet cut or gated) | HEAL-B1, HEAL-B1P (not promoted); promotion not yet queued (agent/follow-ups.md "After HEAL-B4P") |
| `monk/mistweaver` | HEALER | PUBLIC | COMMITTED (HEAL-B1P archive, fight 48, actor 9, whole-fight casts) | HEAL-B1, HEAL-B1P (terminal) |
| `priest/holy` | HEALER | PUBLIC | COMMITTED (HEAL-B2P archive, fight 48, actor 2, whole-fight casts; also the filtered M13-A capture, actor 2) | HEAL-B2, HEAL-B2P (terminal) |
| `priest/discipline` | HEALER | INTERNAL_ONLY | COMMITTED (filtered M13-A capture, actor 9: Evangelism and Ultimate Penitence casts; G2 cohort246 fight 33 actor 88: Atonement applications onto the capture's subject; no whole-fight casts: cannot meet the healer promotion gate, gap recorded on ONB-EV) | HEAL-B3, HEAL-B3P (not promoted), ONB-EV |
| `evoker/preservation` | UNKNOWN (healer) | PUBLIC | COMMITTED (HEAL-B4P archive, gtKb fight 22, actor 15, whole-fight casts; also the filtered M13-A capture, actor 8) | HEAL-B4, HEAL-B4P (terminal) |
| `demonhunter/havoc` | DPS | PUBLIC (Aldrachi Reaver only) | COMMITTED (first 90 s of fight 48, actor 18, in the archive; whole fight RETAINED_RAW, too large for the archive's notice line) | ONB-A1, ONB-A1P |
| `rogue/subtlety` | DPS | INTERNAL_ONLY | COMMITTED (filtered M13-A capture, actor 17: 150 casts, no combatant info, auras or resources; cannot validate, gap on ONB-EV) | ONB-A2, ONB-A2P (not promoted), ONB-EV |
| `warrior/fury` | DPS | INTERNAL_ONLY | CONTEXT_ONLY (uncommitted m11c4f context-2 actor 3 and context-4 actor 21; no event retained) | ONB-A2, ONB-A2P (not promoted), ONB-EV; its list also needs ONB-S3 |
| `warrior/protection` | TANK | INTERNAL_ONLY | CONTEXT_ONLY (uncommitted m11c4f context-1 actor 5; no event retained; every "Protection" of a committed context is the Paladin) | ONB-A2, ONB-A2P (not promoted), ONB-EV; its list also needs ONB-S3 |
| `warrior/arms` | DPS | INTERNAL_ONLY | COMMITTED (first 6 s of fight 48, actor 5, in the archive; whole fight RETAINED_RAW, too large for the archive's notice line) | ONB-B1, ONB-B1P; every GCD action needs ONB-S3 |
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

Counts: 40 rows; PUBLIC 12, INTERNAL_ONLY 6, FOUNDATION 0, NOT_STARTED 22.

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
| A | instant builder/spender, precombat-assigned variables. Havoc and Subtlety have no `run_action_list`; Fury and Protection Warrior do, gated on the enemy count (ONB-A2) | Havoc | Subtlety, Fury, Protection Warrior | ONB-S1 precombat list; Fury and Protection Warrior also ONB-S3 |
| B | `run_action_list` dispatch, cooldown windows. The dispatches read the enemy count (ONB-B1) | Arms | Frost DK, Enhancement | ONB-S1; to resolve any decision, ONB-S3 |
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

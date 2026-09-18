# Retribution Paladin — observed spender-decision evaluator (M11-A4, INTERNAL_ONLY)

**Exposure: `INTERNAL_ONLY`.** This evaluator is registered in the production
catalog (`paladin-retribution-observed-decisions`, `paladin/retribution`) and
is reachable by the internal lookup, the corpus and tests only. The
application service, raid-night orchestration, REST and MCP never select it:
`paladin/retribution` is in `INTERNAL_ONLY_SPEC_IDS`, absent from
`PUBLIC_SPEC_IDS`, from the public contract's `specId` enum and from
`SUPPORTED_SPEC_IDENTITIES`, and a public request for a Paladin/Retribution
identity receives `SPEC_NOT_SUPPORTED` exactly as before M11-A4. The
`satisfies InternalOnlySpecId` on `spec.ts` fails the build if the id is
moved without the five public sites. Promotion is a separate, reviewed
milestone with its own evidence gate; nothing in this tree does it.

The registration is built by the specialization module factory
(`RETRIBUTION_PALADIN_MODULE` in `registration.ts`, through
`defineSpecModule`), pinned to the roster row (`simcSpecId` 70, role `DPS`),
with `supplementalAnalyses: []` by decision
(`agent/m11-a4-first-spec-contract.md` §8).

## The first slice: Holy Power SPENDER decisions, and nothing else

For one Retribution Paladin's observed **Divine Storm** and **Templar's /
Final Verdict** casts, under the pinned `SIMC_APL_PALADIN_RETRIBUTION`
artifact (`simc-33622e9d-1`, the `//retribution_apl_start .. _end` region of
`apl_paladin.cpp` at the same commit Protection pins):

    MATCH      the shared first-GCD query resolves the same action token
               — AUTHORITY_COMPATIBLE_ONLY after the non-domain exclusion,
               and nothing more
    REJECTED   every pinned entry naming the observed token, in EVERY list of
               the authority, is background for this player's proven build or
               gated FALSE in every enumerated world (`observed-action-gate.ts`);
               or the scan selects a different token with the competitor
               PROVEN usable
    UNKNOWN    anything else, with the engine's own blocker carried verbatim
               and the root scan's innermost stopping entry beside it

The four declared domains are represented separately (`domains.ts`). Only
`OFFENSIVE_ROTATION` has authority; `RESOURCE_SPENDING`, `DEFENSIVE_COOLDOWN`
and `INTERRUPT` resolve `NO_PINNED_AUTHORITY_FOR_DOMAIN`; `ACTIVE_MITIGATION`
and `SELF_HEALING` are not declared and resolve `DOMAIN_NOT_DECLARED`.

## The class/spec authority boundary (2026-09-18)

The analyzer evaluates class/spec/hero-talent ROTATIONAL gameplay. Entries
of the pinned list that are not class/spec actions — racial actions
(`lights_judgment`, `fireblood`, `arcane_torrent`, …), potions, item uses,
external buffs — are `OUTSIDE_SUPPORTED_DECISION_DOMAIN`, classified by
TOKEN CATEGORY before any build fact is read (`domain-boundary.ts`). They
cannot preempt a class/spec action. This is a domain-boundary decision, not
an availability claim: nothing about race, faction, gear use effects or
consumables is read or inferred, and no race world is explored. MATCH
therefore means "compatible with the pinned class/spec authority after the
non-domain entries are excluded".

## The decision population, stated

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD (Crusading Strikes' auto-attack strikes, Avenging Wrath, Rebuke, the defensives, Divine Steed) | excluded `NON_GCD_ACTION` |
| no pinned lane record | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| GCD lane, no authority token | excluded `NO_AUTHORITY_TOKEN_BINDING` |
| GCD lane, in-domain, not a spender (Judgment, Blade of Justice, Hammer of Wrath, Wake of Ashes, Divine Toll, Execution Sentence, the strikes, Hammer of Light) | excluded `OUTSIDE_FIRST_SLICE` |
| `divine_storm`, `templars_verdict` | eligible → unselectability proof + first-GCD query → comparison |

`OUTSIDE_FIRST_SLICE` has no name in the public schema; the view carries it
verbatim and a promotion would first have to decide its projection.

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `holy_power` | the decision cast's own `classResources` type-9 PRE_COST entry (`holy-power.ts`) | KNOWN on a costed cast; UNKNOWN on a Divine Purpose free cast (no entry on the wire). Never replayed. |
| `buff.empyrean_legacy.up`, `buff.divine_arbiter_verdict.up`, `buff.divine_arbiter_divine_storm.up`, `buff.avenging_wrath.up` | M4 `presenceAt` under the pinned identities (`paladin-retribution-aura-authority.ts`) | BOUND only from an observed transition strictly before the decision; FALSE only from an observed removal; `avenging_wrath` only when Radiant Glory is disproved |
| Divine Purpose 408458, Hammer of Wrath readiness 1241410 | the same | feed the free-cast route and the Hammer of Wrath readiness gate; never exported as APL buff atoms |
| `buff.art_of_war.stack`, `buff.righteous_cause.stack` | `bindRetributionStackZero` | EXACTLY ZERO under `PROVEN_INACTIVE` (an observed removal M4 proved) or `TALENT_NOT_SELECTED` (the producing talent disproved at its choice node); UNBOUND otherwise — never a positive count |
| `variable.ds_castable` | the pinned `finishers[0]` value expression, evaluated by the SHARED evaluator over the same bindings (`resolver.ts`) | BOUND only when every enumeration agrees; `active_enemies` is never bound |
| `variable.pre_es_wake` | `precombat[7] op=reset,default=0`, no in-combat assignment | KNOWN 0 |
| `cooldown.wake_of_ashes/divine_toll/execution_sentence/avenging_wrath.remains` | `cooldown-bindings.ts` from the last OBSERVED cast under the pinned base and the reviewed modifier census | lower bound; only `PROVEN_NOT_READY` is ever claimed |
| `cooldown.blade_of_justice.remains` | REFUSED (hasted; charge talent) | UNKNOWN by design |
| `active_enemies`, `cooldown.hammer_of_wrath.charges`, `gcd` | — | UNKNOWN_NUMBER, stated as such |

## Applicability and usability

Applicability: the domain boundary first; then the constructor readings
(talent-built actions are background on `spell_data_t::not_found()`,
`crusader_strike` under Crusading/Templar Strikes, `templar_strike`/`_slash`
without Templar Strikes, `hammer_of_light` outside Templar, `templars_verdict`
only with a pinned two-handed weapon worn, `avenging_wrath` without the talent
or under Radiant Glory). A constructor reading that comes out UNKNOWN —
Avenging Wrath under a Radiant Glory the three-way talent rule cannot
disprove — is settled APPLICABLE only by a hand-reviewed FOREGROUND-ONLY
execution fact (`paladin-retribution-foreground-execution-authority.ts`):
the pinned module executes 31884 only through the foreground constructor,
its background/triggered wings being the distinct record 454351, so an
observed 31884 cast is a foreground execution under the pinned mechanics.
There is no generic "cast observed ⇒ selectable" rule: an observed cast of
any other ability settles nothing for any token (a triggered action executes
and logs too — Crusading Strikes 408385 is one), a BACKGROUND reading is
never converted (an observed foreground-only cast under it is a
contradiction and stays UNKNOWN), and an UNKNOWN reading with no such fact
stays UNKNOWN.

Usability: the observed cast; `SIMULATED_PREFIX_EXECUTION`; a derived
cooldown proven past the tolerance; Hammer of Wrath with its readiness aura
proven down (`REQUIRED_AURA_INACTIVE`); a spender PROVEN usable when Holy
Power is KNOWN at or above every pinned cost and the dataset pins no cooldown,
or Divine Purpose is proven up; `INSUFFICIENT_RESOURCE` for Templar's Verdict
only, with Divine Purpose proven down (Divine Storm keeps its Empyrean Power
route, which nothing disproves). Judgment's complementary readiness is NOT
proven in A4: it is never decisive on the spender path.

## Real evidence (committed, `tests/corpus`)

A7R6 fight 7 actor 6 over 165 s (three sanitized slices composed by the
bundle composer): 69 eligible spender decisions — **1 MATCH** (Final Verdict
at +104,407 ms, exact entry), **10 REJECTED** (unselectability; two also
scan-selected `templars_verdict`), 58 UNKNOWN with the stopping entry named;
167 casts excluded by name. gtKb fight 22 actor 23 over 20 s: 15 eligible,
all UNKNOWN. Every expectation was read from the production facade and is
pinned as regression evidence, never as a definition of correctness.

## What is deliberately not here

No generator or cooldown-usage evaluation, no Holy Power replay or waste
model, no positive stack model, no charge model, no GCD-length model, no
target count, no race or faction, no item use effects, no supplemental
analyses, no public projection. Templar hero-tree builds keep
`hammer_of_light` live with unbindable `remains` atoms and resolve UNKNOWN.

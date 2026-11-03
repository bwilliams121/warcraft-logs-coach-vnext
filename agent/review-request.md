# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-A1: Havoc Demon Hunter (internal, Cohort A representative). Branch
`autopilot/onb-a1`, from main at 93150b5.

Havoc Demon Hunter is registered INTERNAL_ONLY on the observed-decision pattern (Retribution,
Blood, Brewmaster), the first rotational specialization of full onboarding.

- **Warcraft Logs: NONE.** No request or probe. Evidence is cut offline from the retained M11-E2
  capture, and the SimulationCraft sources were read from the retained pinned checkout.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changes.
  The public lookup and the identity table refuse the row, pinned in
  `tests/contracts/onb-a1-havoc-promotion-readiness.test.ts`.
- **Queue bookkeeping:** HEAL-B4P is recorded MERGED (PR #54, 93150b5c…). Every other merged
  tranche the supervisor listed was already recorded MERGED. ONB-A1 is set to PR_OPEN.

## What it can decide

Measured over b1PmaKrd6CDfzngc fight 48, actor 18 (Aldrachi Reaver):

| Window | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | --- | --- | --- |
| first 90 s (committed, pinned in the archive) | 76 | 7 | 4 | 65 | 252 |
| whole fight (replayed offline from the raw capture, not committed) | 279 | 24 | 23 | 232 | 902 |

Every resolved decision names `default[9]` (Reaver's Glaive). **This is a one-decision surface and
the docs say so.** 184 of the whole fight's 232 UNKNOWNs stop at `default[5] the_hunt`.

## Decisions to check

1. **Metamorphosis anchored on its impact.** The action runs on 191427; the log reports only the leap's
   impact 200166, after the press. `demonhunter-havoc-cooldowns.ts` runs the shared derivation over the
   pinned record with the wire id and a base shortened by 2,000 ms. **Since review 1 the delay is established
   per leap:** a bound stands only when the buff the leap gains at its start (162264, sc_demon_hunter.cpp:5005-5006)
   has an observed APPLIED edge within 2,000 ms before the impact (`metamorphosisLeapEdgeObserved`). Without one the
   token is refused. The retained subject shows 899 to 923 ms. The stated limit: an unrelated application inside
   the window would satisfy it, and the player is pacified during the leap. The impact has a NON_GCD lane record and
   no token, so the press is never judged.
2. **The Hunt is pinned and never used.** The census gives 75,000 ms; the subject casts it 61,219 ms apart.
   Every pinned SimC commit agrees with the census. I did not choose a floor from observed gaps. The
   disagreement is pinned in a test and recorded in follow-ups.
3. **A resolved hero tree proves the other tree's talents absent.** On a RESOLVED Aldrachi Reaver tree,
   `demonsurge` and `violent_transformation` are treated as not taken; on a RESOLVED Felscarred tree,
   `art_of_the_glaive`. Beyond that the three-way rule stands: A Fire Inside and Burning Wound, alone on their
   nodes, stay UNKNOWN. That is why nothing below `default[15]` resolves.
4. **Aura edges within 2 ms of a decision.** The log places a cast's own effect 0 or 1 ms before the cast. The
   first measurement rejected every Reaver's Glaive for seeing the buffs it applies. **Since review 1 the rule is
   transition-specific:** the one edge the decision's own action is pinned to write, in the direction it writes it (`OWN_ACTION_AURA_EDGES`, each read off the module and all 54
   removals on the subject) is read from before the edge. An opposite-direction edge, an unpinned one, or a second edge in the window leaves the atom unbound, tested directly on `bindHavocAura`.
5. **Reaver's Glaive's positive usability.** `positive-usability.ts`, on the shared completeness contract, for
   that one token. It needs the buff proven up for at least 1,000 ms (reaction tolerance), the decision's own
   cast on the same enemy target and a pinned range record. It is what makes REJECTED possible.
6. **Transition contracts.** `vengeful_retreat` and `pick_up_fragment` consume souls, so they forget Fury and
   `buff.reavers_glaive` (Art of the Glaive can raise it); a buff bound UP stays up, and nothing is ever bound
   up by a branch. A PROVEN_DOWN Reaver's Glaive proof stops applying in such a branch.
7. **Observed tokens excluded.** Throw Glaive: all 48 logged 185123 on the subject sit within 2 ms of a Blade
   Dance or Death Sweep, Screaming Brutality's background copy. The Hunt: a cast-time action decided at its
   `begincast`.
8. **`pick_up_fragment`'s `type`/`mode`** are admitted by a token-scoped list in `src/simc/apl-authority.ts`,
   the one shared-code change. They stay UNRECOGNISED everywhere else, and no other committed authority names
   them, so no public authority is affected.
9. **Evidence is 90 s, not the whole fight, and its grants are whole.** The whole fight is about 1.3 MB and the archive had
   0.39 MB left under its 4 MiB notice line. I did not raise the line. **Since review 3** the segment retains every aura
   transition and resourcechange of actor 18, so its AURAS and RESOURCES grants claim nothing that was omitted; the census
   of retained families equals the raw capture's over the range. About 25 KB is left, so the next onboarding tranche with
   real decisions needs an owner decision (follow-ups "After ONB-A1"). The Restoration Shaman records a misplaced edit had
   touched are restored byte for byte.
10. **`kindsRegisteredButUnused` names two Havoc kinds.** `SPEC_HAVOC_DEMON_HUNTER.DECISION_COVERAGE` and
    `.COVERAGE_SUMMARY` run only in the evidence archive, since no Havoc bytes fit the regression corpus. The
    test's expectation changed from `[]` to those two, with the reason.

**Not coaching.** A REJECTED here says the pinned list would have pressed Reaver's Glaive first. The row is internal
and emits no finding. Whether this surface deserves publication is ONB-A1P's question, recorded in follow-ups.

## Extractors

`demonhunter-havoc` targets on the GCD, talent, ability-cooldown and usability extractors. Two class-neutral
additions that change no earlier target's output: `sourceOverrides` and `classCostClaimsDoNotHold` on the usability
extractor. Violent Transformation and Eternal Hunt are deliberately unpinned (duplicate rows).

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean.
- `npm run test:corpus` and `npm run test:evidence`: both gates PASSED, reports regenerated.
- New: `tests/unit/specs/onb-a1-havoc-demon-hunter.test.ts` (39),
  `tests/contracts/onb-a1-havoc-promotion-readiness.test.ts` (2).
- Full suite: every Havoc-related pin passes. The local failures are 5 s timeouts under parallel load, which pass
  in isolation (Protection projection, m7f, m8g, m10c5b, m9b harness), and the `runner-service-*` tests, which also
  fail on main on this machine.

Test pins changed only to add the new row (partition, catalog, call maps, layering, corpus counts, archive byte table)
and the one D2-C preflight (`demonhunter-havoc` is now extracted). No assertion was weakened.

## What is not here

No promotion, no public view consumer, no Felscarred measurement (A7R6 actor 18 is retained and unmeasured), no Fury
replay, no debuff bindings, no cooldowns beyond Metamorphosis. Limits are in `src/specs/demonhunter/havoc/README.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

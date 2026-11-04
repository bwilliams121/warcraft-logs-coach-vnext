# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-A1P: Havoc Demon Hunter public promotion. Branch `autopilot/onb-a1p`, from main at b2af8bf.

Havoc Demon Hunter passed both rotational gates on real evidence and is PUBLIC, for Aldrachi Reaver builds only.

- **Warcraft Logs: NONE.** No request or probe. No new evidence is committed. The whole-fight numbers come from replaying
  the retained capture through production ingestion with a fake transport.
- **Public contract: EXPECTED, additive under `analysis/1`.** `specId` gains exactly one value, `demonhunter/havoc`
  (`src/contracts/analysis-contract.ts`). No outcome, basis, blocker class, exclusion reason, status, capability value or
  field moved, and nothing under `src/api/` or `src/mcp/` changed. The MCP tool description changes by derivation: its
  supported sentence names Havoc Demon Hunter and it gains Havoc's limits prose.
- **Queue bookkeeping:** ONB-A1 is recorded MERGED (PR #55, b2af8bfd…). Every other merged tranche the supervisor listed
  was already recorded MERGED. ONB-A1P is set to PR_OPEN.

## Decisions to check

Both questions were left to this tranche by `agent/follow-ups.md` "After ONB-A1".

1. **The narrow surface is published.** Whole fight: 279 eligible, 24 MATCH, 23 REJECTED, 232 UNKNOWN, every resolved
   decision at `default[9]` (Reaver's Glaive). Queue rule 4 promotes what passes the applicable gate, and rule 6 forbids
   moving a gate. No rotational gate has a coverage floor (Retribution's gtKb subject is all UNKNOWN on a public row). The
   narrowness reaches the reader through the coverage block, the TLDR and report disclosures (assessment always PARTIAL)
   and the limits prose ("a narrow check and not a rotation review"); `onb-a1p-havoc-public-projection.test.ts` pins them.
   A coverage floor would be a new gate, recorded in follow-ups rather than invented here.
2. **Fel-Scarred is refused.** `src/specs/demonhunter/havoc/supported-profile.ts`, before any decision is read, the shape
   of M11-C4j's gate: Fel-Scarred is AUTHORITY_NOT_AVAILABLE; an unresolved or contradictory hero tree is
   PROFILE_NOT_RESOLVED. It reads only the hero tree resolved from observed trait entries. Both statuses already exist.
   This is the one behaviour change in the evaluator. A7R6 fight 7 actor 18's retained raw combatantinfo carries Fel-Scarred
   entries (entry 117514 present, 117512 absent), read offline. The resolver's Fel-Scarred binding rules stay, unreachable
   through the facade, for the measurement that would lift the gate.
3. **The 23 REJECTEDs were read before publishing.** ONB-A1 called them unreviewed. Four isolated casts in the first 90 s and
   five short runs later (`agent/architecture.md` "ONB-A1P"). Each needs the buff up for at least 1,000 ms, the decision's
   own cast on the same enemy target, and a pinned range record. They stay priority disagreements: `matchMeaning` is
   AUTHORITY_COMPATIBLE_ONLY, no score, and DIVERGENCE_ACTIONABILITY_UNPROVEN is disclosed (pinned). No claim is made that
   holding the glaive lost damage. Timing is still reviewed on one subject only (follow-ups).
4. **Metamorphosis's pinned cooldown was rechecked** because The Hunt's pin is contradicted by the wire. The subject's impact
   gaps are 126,242 ms and 146,734 ms, above the pinned 120,000 ms, so one subject does not contradict it. That is what one
   subject can show, not proof of the pin.
5. **The Fel-Scarred public test swaps the real subject's talent tree** for the pinned Fel-Scarred entries, because no
   Fel-Scarred bytes are committed and the archive has about 25 KB left. It proves the refusal path, not Fel-Scarred behaviour.

## The five-site promotion

The partition (`INTERNAL_ONLY_SPEC_IDS` is now `druid/restoration`, `priest/discipline`), the public contract's enum, the
identity table, `satisfies PublicSpecId` on `spec.ts`, and the registration's `exposure`. Ingestion cannot under-fetch: Fury
is already declared on the offensive capability, and the requirement sets now pin `PLAYER_CONTEXT` with resources. Vengeance
stays SPEC_NOT_SUPPORTED, pinned on the identity table and on REST.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean.
- `npm run test:corpus` and `npm run test:evidence`: both gates PASSED, reports regenerated.
- Full suite, parallel: 13,181 tests, 22 failed. One was the layering rule above, since fixed. Sixteen were 5 s timeouts under
  parallel load (Protection projection and invariance, m7f, m8g, m10c5b, m9b harness, Retribution evaluator); those files
  pass serially with a longer timeout (1,717 tests, 0 failed). The other five are the `runner-service-*` tests, in code this
  change does not touch, which ONB-A1 recorded failing on main on this machine; I did not rerun them on main.
- Offline replay of fight 48 through production ingestion after the gate: 279 / 24 / 23 / 232, excluded 902, unchanged.

## Test changes

- `tests/contracts/onb-a1-havoc-promotion-readiness.test.ts` is re-pinned from INTERNAL_ONLY to PUBLIC mode: the same three
  real assertions, now through the identity table, and the internal pairing now finds nothing.
- New: `tests/unit/specs/onb-a1p-havoc-supported-profile.test.ts`, `tests/contracts/onb-a1p-havoc-public-projection.test.ts`,
  `tests/integration/onb-a1p-havoc-public-transports.test.ts`.
- `m11-promotion-evidence-gate.test.ts`: the three reviewed snapshots gain Havoc; the gate is unchanged.
- `tests/contracts/m9a-corpus-layering.test.ts`: the sanctioned entry points gain `stateOf`, the loader-backed single-artifact
  analogue of `stateOfBundle`, because Havoc's one archive segment cannot be a bundle (a bundle refuses one part). The
  interpreter still owns reading and normalization. Please check this one: it widens an allow-list.
- Other pins change only to add the row (partition, catalog, call maps, requirement sets, the derived sentence). The corpus
  case `application-service.havoc-demon-hunter-registration-is-internal-only` is re-pinned as `...-is-public-since-onb-a1p`.
  `tests/support/m11/coaching-inventory.json` moves the row to PUBLIC. No assertion was weakened.

## What is not here

No Fel-Scarred measurement, no new bindings, no cooldowns beyond Metamorphosis, no change to The Hunt or the `default[15]`
talent limit. The archive's notice line still needs an owner decision before ONB-A2 commits evidence (follow-ups).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

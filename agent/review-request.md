# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M13-C: Shared, reviewed recipient cooldown identity. Autopilot queue entry
M13-C. Branch `autopilot/m13-c`, from main at 509e30f.

- **Direction** (queue entry; follow-ups "After M13-A"): a shared, reviewed
  mechanism through which support analysis asks "which observable cooldown
  ids does specialization X have?", without one specialization importing
  another's private runtime data. Shared plumbing and data only; provenance
  and versioning on every identity; fail closed (no reviewed data is UNKNOWN
  or unsupported, never an empty "no cooldowns"); cover only what proves the
  architecture.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or
  `src/mcp/` changes. The Augmentation evaluator is internal and
  unregistered.
- **Warcraft Logs requests: none.** Committed evidence and synthetic fights.
- Queue bookkeeping: M13-B (#23, 509e30f) recorded MERGED; M13-C PR_OPEN.
  M12-C through M13-A were already recorded.

## What it adds

**`src/data/game/recipient-cooldown-identities.{json,ts}`**, shared,
class-neutral data (`REVIEWED_RECIPIENT_COOLDOWN_IDENTITIES`, revision
`simc-33622e9d-m13c-1`, SimulationCraft 33622e9d, client data 12.1.0.69587).

- Per entry: roster key and SimC spec id (validated against `spec-roster`),
  the exact Warcraft Logs class/specialization strings, the committed fight
  contexts that state them, the SOURCE specialization dataset (id and
  revision), a named criterion, and the ids with display names.
- It imports no specialization dataset (R3 holds). Drift is impossible
  without a failing test: `tests/unit/data/recipient-cooldown-identities.test.ts`
  loads each source through its own loader and re-derives the entry by its
  criterion, requiring exactly the listed ids, the display names and the same
  pin; it also opens every cited context and requires the class/spec pair.
- Criteria, declared in the artifact: `PINNED_COOLDOWN_AT_LEAST_60S` (pinned
  base or per-charge cooldown ≥ 60 000 ms, a selection rule never a
  readiness claim) and `REVIEWED_HEALING_COOLDOWN` (Restoration Shaman's
  hand-reviewed healing cooldowns; no duration claimed).
- Coverage: the six pinned specializations (Blood, Brewmaster, Protection,
  Retribution, Assassination, Restoration Shaman). The M13-A fight's
  recipients have no reviewed data.

**Lookup `recipientCooldownIdentityOf(stated, registry?)`**, a table read:

- `IDENTIFIED` with ids, criterion, source, pin and `coverage:
  REVIEWED_SUBSET` (never "every cooldown");
- `UNKNOWN SPECIALIZATION_NOT_ESTABLISHED` carrying the M13-B reason (a pet
  is NOT_IN_FRIENDLY_ROSTER, never its owner's);
- `UNKNOWN REGISTRY_UNAVAILABLE` when the artifact fails validation (the
  parser fails closed on version, dataset id, pin, criteria, roster
  mismatch, empty or duplicate entries, duplicate ability);
- `UNSUPPORTED NO_REVIEWED_COOLDOWN_IDENTITY` when stated but not reviewed.
- Exact match on class AND specialization: Druid "Restoration" is not
  Shaman "Restoration"; "Death Knight" is not WCL's "DeathKnight".

**Augmentation evaluator `/3`.** The caller input `recipientCooldownIdentity`
is removed; ids come from the registry per recipient actor (test seam
`cooldownRegistry`). Each ally window carries `recipientCooldownIdentity`, so
`NO_COOLDOWN_IDENTITY` always has a stated why. `src/support/` is unchanged
(still ids-in, no specialization vocabulary, no game data).

**Guard `tests/contracts/m13c-recipient-cooldown-registry.test.ts`:** the
registry imports only its artifact, `spec-roster` and the stated
specialization type; no literal class/spec/roster-key comparison and no
spell-id literal in its code; its one consumer is the Augmentation
evaluator.

## Tests

- New: registry unit test (load, drift re-derivation for all six, cited
  context check, lookup states, 11 parser refusals); evaluator tests for
  IDENTIFIED overlap (Retribution Avenging Wrath listed COMPLETE, unlisted id
  ignored), UNSUPPORTED (Frost Mage, Druid Restoration), UNKNOWN (not
  stated, not in roster, registry unusable); real-evidence test that every
  M13-A lookup is UNSUPPORTED or UNKNOWN and overlap stays
  NO_COOLDOWN_IDENTITY; the existing coverage-gated real test now supplies
  its hypothetical id through the registry seam.
- Focused: `tests/unit/data`, the evaluator, m10a/m10c/m11a2 isolation,
  m13a support layering, m13c guard: all pass. `tsc --noEmit` and
  `prettier --check .` clean.
- Full suite on this machine: 14 timeouts in unrelated files (simulation
  runner, Protection projection, corpus harness, regression parity). The
  same files on clean HEAD under the same load fail 14 of 312 versus 8 with
  this change: machine load, not a regression.

## Docs

`agent/architecture.md` "M13-C"; `agent/follow-ups.md` "After M13-C" (six
specializations only, a reviewed subset without defensives, no talent or
build gate, exact WCL strings) and the "After M13-A" bullet marked resolved;
the Augmentation README.

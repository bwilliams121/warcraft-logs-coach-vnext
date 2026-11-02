# Augmentation Evoker (M13-A, internal)

The Augmentation Foundation. Owner decision 2026-11-01
(`agent/autopilot-queue.md` "M13-A").

It is **not registered** with the analysis service and has no public
surface. Nothing in production calls it. It holds no SimulationCraft
authority: there is no `SpecId`, no registration and no APL artifact
(`tests/contracts/m11a2-cross-spec-isolation.test.ts` names it as an
unregistered evaluator tree).

## Supported decision surface (v1)

| Category | Authority | Outcome |
| --- | --- | --- |
| SUPPORT_TARGETING | none | always `NO_AUTHORITY_AVAILABLE`: no approved recipient-quality model. With a declared model missing ally state, `supportTargetingStatus` gives `UNKNOWN`; no v1 caller declares one |
| SUPPORT_TIMING | none for quality; `WCL_OBSERVED_FACT` for facts | `NO_AUTHORITY_AVAILABLE`, with every support cast listed and its listing completeness |

Observations (`WCL_OBSERVED_FACT`, from `src/support/`): Ebon Might and
Prescience windows per recipient with identity, deaths inside the observed
span and the next death after the observed end, the recipient's casts of
its reviewed cooldown ids inside the active span (continuity
established), and proven support time (a lower bound: a carried-in buff
is never excluded); the Evoker's own
Ebon Might windows. Nothing is a finding.

## Runtime data

`src/data/game/evoker-augmentation-support-abilities.*`: pinned trait rows
and `sc_evoker.cpp` lines at SimulationCraft 33622e9d. Identity only.

Recipient cooldown ids (M13-C) come from the shared, reviewed
`src/data/game/recipient-cooldown-identities.*`, looked up by each
recipient's stated specialization. Each ally window carries the lookup:
`IDENTIFIED` (a `REVIEWED_SUBSET`, never every cooldown), `UNKNOWN` (no
established specialization, or the registry is unusable) or `UNSUPPORTED`
(no reviewed data for that specialization).

## Never

- "Wrong Prescience target", or any recipient ranking.
- "Alive" from the absence of a death event.
- A window extended to a nominal duration.
- A recipient's cooldown identity guessed from its class, or a pet's from its owner.
- "No cooldown overlapped" from a reviewed subset or a missing identity.

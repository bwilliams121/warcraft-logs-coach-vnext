# Augmentation Evoker (M13-A; registered in M13-E; PUBLIC since M13-F)

The Augmentation Foundation. Owner decision 2026-11-01
(`agent/autopilot-queue.md` "M13-A").

It was registered INTERNAL_ONLY in M13-E (`registration.ts`) and is
**PUBLIC since M13-F** (`evoker/augmentation` in `PUBLIC_SPEC_IDS`, the
five-site edit). A public request dispatches it at the FULL_RAID scope its
requirement derives; the document is AUTHORITY_NOT_AVAILABLE (or
INSUFFICIENT_EVIDENCE) and carries `supportObservations`, built by
`support-observation-view.ts` from the evaluator's result, field for field.
Raid-night cells evaluate nothing and carry no support observations. It holds no decision
authority: no APL artifact, no binding. Its two declared families,
SUPPORT_TARGETING and SUPPORT_TIMING, are PROVIDER-LESS domains
(`src/findings/authority-domain.ts`) that resolve
`NO_PINNED_AUTHORITY_FOR_DOMAIN` from its own access.

## Registration (M13-E)

- **Scope.** Both capabilities are declared from
  `AUGMENTATION_EVOKER_REQUIRED_INPUTS`, so the derived requirement is
  FULL_RAID (ACTORS, CASTS, AURAS, DEATHS; no resources; NO_TARGET).
- **Result.** Never ANALYZED: an ANALYZED envelope cites a decision
  authority, and there is none. `AUTHORITY_NOT_AVAILABLE` when the
  evaluator ran (the payload carries its observations); `INSUFFICIENT_EVIDENCE`
  when the subject has no stated specialization, its identity is refused, or
  the pinned data is unusable (no fact reconstructed). There is no
  observed-decision view.
- **Identity.** The facade feeds the evaluator's gate the fight's own report
  code and fight id and the subject's Warcraft Logs-stated class and
  specialization (M13-B `friendlySpecializations`, the same `friendlySpecs`
  entry preflight reads). A pet or an unlisted actor is NOT_IN_FRIENDLY_ROSTER,
  never defaulted.

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

## Public shape (M13-F)

`supportObservations` (`src/contracts/analysis-contract.ts`): both support
families as NO_AUTHORITY_AVAILABLE (or UNKNOWN for a declared model missing
ally state), `evaluatesSupportQuality: false`, every window list and the
support-cast list with its completeness, support time as a lower bound or
UNKNOWN with no number. A recipient-quality model that could be applied
(`ALLY_STATE_SUFFICIENT`) has no public form: the adapter throws.

## Never

- "Wrong Prescience target", or any recipient ranking.
- "Alive" from the absence of a death event.
- A window extended to a nominal duration.
- A recipient's cooldown identity guessed from its class, or a pet's from its owner.
- "No cooldown overlapped" from a reviewed subset or a missing identity.

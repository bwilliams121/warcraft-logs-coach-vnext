# Named follow-ups

Work that is deliberately NOT being done inside the milestone that discovered it,
recorded so it is a decision rather than a thing everyone stopped noticing.

Each entry states what is true today, why it was not fixed in place, and what
"done" would look like. Nothing here is a bug in shipped behaviour; these are
hygiene and clarity items.

---

## Regression-corpus ledger: healer fixtures that did not fit (M12)

**Raised:** M12-B (2026-10-31). Owner decision, the same day: the corpus
stays at 5.5 MiB, and its remaining ~18.6 KB is treated as exhausted. A
measured increase is proposed only when several M12 slices each need a
genuinely minimal fixture that cannot fit. The limit is never raised
preemptively for one tranche.

| Tranche | Smallest fixture that proves the behavior | Bytes | Committed |
| --- | --- | ---: | --- |
| M12-B | One COMPLETE damage episode (1,282,525) with its ±2 s margin: damage and extraattacks for all 20 friendly players over 4.005 s, granted DAMAGE | 230,811 | no; protected by archive-reading unit tests |
| M12-D | The Restoration Shaman's casts and begincasts over the whole fight, granted CASTS, so "these are all its healing-cooldown casts" is COMPLETE | 119,216 | no; protected by archive-reading unit tests |

A grant-free fixture of only the episode's 20 hits would be ~9 KB, but it
could not prove COMPLETE coverage, which is the behavior at stake. When a
second row appears, the measured proposal is the sum of the rows plus the
current total (5,748,495 bytes), with what each row buys.

---

## After ONB-S6: what the shared pet mapping does not establish

**Raised:** ONB-S6 (2026-11-03). Each item is UNKNOWN today, never guessed.

- **No reviewed profile exists.** The lifetimes, summon-start and continuity
  facts are the consuming specialization's to pin, with SimulationCraft and
  wire evidence, in ONB-X4 (Demonology), ONB-X5 (Unholy) and ONB-T2 (Beast
  Mastery). The retained Blood measurement uses test values only.
- **PRESENT needs a proven minimum lifetime.** Under O2 (no future
  evidence), presence at t comes only from a summon before t plus a pinned
  minimum life. A pet that can die or be dismissed at any moment (most
  permanent pets) is never PRESENT. Positive presence for those needs a
  reviewed past-only rule, for example "a cast within the last N ms proves
  the pet still exists", with its own evidence. A post-hoc "observed before
  and after t" report is allowed by O2, but is not built here.
- **Death never proves absence.** A positive death ends PRESENT, but
  NOT_PRESENT after a death needs a decoded resurrection contract
  (`death-state.ts`). Until then, a pet that died and was not re-summoned is
  UNKNOWN until its maximum lifetime expires, or forever when it has none.
- **No pre-pull start.** A permanent pet summoned before the pull has no
  summon event, so it is never PRESENT and its absence is never claimed.
  COMBATANT_INFO pet facts, if Warcraft Logs states any, are unread.
- **Unstated owners block absence.** On the retained fight, actor 142 (a
  Blood Beast with no stated owner) blocks every Blood Beast absence claim
  for focus 15. Attributing an unstated-owner pet needs an owner-approved
  rule. A summon source is not one.
- **Reused instance keys stay undecided.** The retained Rune Weapon has more
  summon events than instances. A key with two summons is never decided,
  even where a missing summon page is excluded.
- **SimulationCraft spawner semantics are not modelled.** Expressions like a
  spawner's `active`, `remains` or per-pet remaining-duration reads, and
  Demonic Tyrant's lifetime extension, are each specialization's to resolve
  over these primitives. Nothing here is a pinned SimulationCraft pet
  expression.

---

## After ONB-S5: what pooling and wait semantics do not establish

**Raised:** ONB-S5 (2026-11-03).

- **No REJECTED against a pool.** When the APL definitely pools, an observed
  cast is UNKNOWN, never REJECTED. A REJECTED would need a pooling comparison
  basis, which changes the public `PUBLIC_COMPARISON_BASES`, so it is its own
  reviewed public tranche. It should be revisited only with a specialization
  whose resolver makes `POOLS` reachable on real evidence.
- **No time advance.** The first-GCD query refuses a waiting selection
  (`APL_WAIT_SELECTED`). Answering "what is cast after the pool" needs a
  regeneration model and a non-zero transition, which the engine refuses
  today.
- **Refused options.** `extra_amount=` (an evaluated amount shifts the
  readiness test), `line_cd=` on a waiting line, and `wait_on_ready=` (still an
  unrecognised option on any line) all block. `wait_for_cooldown` readiness
  is never proven: a cooldown with charges can be ready with remains above
  zero.
- **Resolvers are spec-owned and absent.** No specialization supplies a
  `PoolingResolver` yet, so the at-maximum readiness is UNKNOWN wherever a
  resolver is needed. ONB-C1 (Feral) and ONB-C2 (Outlaw) own theirs, along with
  `max_energy=1` on the pinned Feral `ferocious_bite`, which is still refused.
- **Runtime background.** Pruning follows the existing rule: NOT_APPLICABLE
  stands for init-time background. A guarded line made background later at
  runtime is not modelled separately.

---

## After M15-C: what non-numeric prioritization does not establish

**Raised:** M15-C (2026-11-03).

- **Not published.** The priority labels and the estimator hook are
  internal (`src/reporting/priority-labels.ts`, `impact-estimators.ts`), and
  nothing outside `src/reporting/` imports them. Showing a label in the TLDR
  or report is an additive public contract change and its own reviewed
  tranche. It must keep the label's meaning ("where to look first") and must
  not add any numeric key.
- **No real fight reaches HIGH or MEDIUM.** On the committed Blood fight every
  prioritized item is LOW: no adapter yet proves the authority's alternative
  actionable (DECISION_PROVEN_ACTIONABLE). The HIGH and MEDIUM rules are
  proven only on synthetic records.
- **Severity is not declared by any producer.** The label states
  `producerSeverity: NOT_DECLARED`. A producer-owned severity would need a
  restated-record field, a reviewed adapter rule, and a label rule that
  never reads magnitude, damage or comparison behavior.
- **The pattern threshold is still the M15-A default (3)**, not validated on
  real logs. Because HIGH needs a PATTERN, it inherits that follow-up
  ("After M15-A").
- **No numeric estimator exists.** A future one must pass
  `buildImpactEstimatorRegistry` (authority, supported specs, builds and
  categories, evidence requirements, BOUNDED_INTERVAL uncertainty, units,
  provenance, no overlapping cells). It also needs an established build
  input, which no producer passes today, so it would resolve UNKNOWN
  `BUILD_NOT_ESTABLISHED` until one does.
- **Final scoring (M15-E) stays deferred until ONB-Z.** Labels are not a
  score input and carry no weight.

---

## After M15-F: what the final coverage disclosure does not establish

**Raised:** M15-F (2026-11-02).

- **Disclosed, still not summarized.** The TLDR and the report now NAME the
  blocks they do not restate (`SUPPORT_OBSERVATIONS_NOT_SUMMARIZED`,
  `RAID_COOLDOWN_PLAN_NOT_EVALUATED`). They still present no support fact and
  no plan content: summarizing either needs a reviewed M15-A adapter, and must
  never rank an observation as a finding.
- **The raid-night disclosure is night-level only.** It is derived from the
  night's coverage totals and its cells' preparation. Cells still carry no
  TLDR, report, diagnosis or support block; the night says so
  (`PER_FIGHT_PRESENTATION_NOT_INCLUDED`) and points at `analysisRef`. A
  per-cell summary would need its own reviewed shape and payload budget.
- **The encounter-context document (M8-G) is not changed.** It reuses raid-night
  cells and recurrence but is its own contract family; it gains no coverage
  disclosure in M15-F. Doing so is a separate, additive tranche.
- **Lines are English templates**, like the TLDR's; the codes are the
  contract.
- **The integrated negative suite runs on fixtures and the M13-A capture**:
  Assassination (M5-A, M5-D2), the Arms unsupported subject, the real
  Augmentation Evoker, and synthetic raid nights. No fixture proves an
  alternative actionable, so "nothing actionable without evidence" is shown
  as the absence of DECISION_PROVEN_ACTIONABLE, not by a positive case.
- **Resolved here:** "After M15-B" / "After M15-D" raid night carries no coverage
  summary (it now carries `coverageDisclosure`); "After M13-F" TLDR/report
  silence about support facts (now disclosed by name, not summarized).

---

## After M15-D: what the report does not establish

**Raised:** M15-D (2026-11-02).

- **Same two producers as the TLDR.** Healer assignment results,
  Augmentation support observations and diagnosis statements are not report
  entries until each has a reviewed M15-A adapter. The diagnosis appears
  only as its state.
- **No suppression exists on real evidence.** No restated producer emits
  SUPPRESSED yet, so the suppressions section is always empty on real fights;
  the path is proven synthetically.
- **Size.** Every entry carries all its members' locators (≈ 53 KB on the
  Blood fight). If documents grow, an owner decision could replace member
  locators with references to `decisions` positions.
- **English templates only.** The markdown is fixed English over the
  structured fields; consumers should read the fields.
- **Raid night carries no report**, as for the TLDR. Since M15-F it carries
  a night-level `coverageDisclosure` instead (see "After M15-F").

---

## After M15-B: what the TLDR does not establish

**Raised:** M15-B (2026-11-02).

- **Two producers feed it.** The TLDR summarizes the observed-decision view
  and the preparation report, the two restated producers. Healer assignment
  results, Augmentation support observations and diagnosis statements are
  disclosed only as a state (diagnosis) or not at all, until each has a
  reviewed M15-A adapter.
- **No highlight is actionable on real evidence.** Every real divergence
  stands `DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN` (After M15-A), so
  the TLDR always says the authority's alternative was not proven possible.
- **`maxHighlights` = 3 is a presentation choice**, not validated with
  readers. It changes no finding; the rest are counted and disclosed.
- **Prose is English templates.** `lines` are fixed sentences over the
  structured fields; no localization, and consumers should read the fields.
- **Raid night carries no TLDR.** RESOLVED in part by M15-F: the night now
  carries a night-level `coverageDisclosure` (codes plus a coverage sentence
  templated from its own totals). A per-cell summary is still absent.

---
## After M15-A: what finding prioritization does not establish

**Raised:** M15-A (2026-11-02).

- **No producer proves an authority alternative actionable.** The
  observed-decision view proves only the observed cast
  (`OBSERVED_EXECUTION_ONLY`), so on real evidence nothing reaches
  `ACTIONABLE_AUTHORITY_DIVERGENCE`. That needs a reviewed per-decision
  actionability source (encounter targetability with COMPLETE coverage, or a
  spec-owned usability proof for the authority's selected action).
- **The default pattern threshold (3) is not validated** against real logs
  (CLAUDE.md "Timing Tolerance"). No per-category override is set.
- **Two producers are restated.** The healer assignment results (M12-D),
  Augmentation support observations (M13) and the diagnosis outcome (M14-F)
  have no adapter yet; each needs its own reviewed mapping. The record has no
  negative-actionability disposition (the m5c1 sweep forbids that
  vocabulary), so `ASSIGNMENT_NOT_ACTIONABLE`'s restatement is undecided:
  SUPPRESSED needs one of the four named environmental reasons, and
  "encounter ended before the window" is not obviously one of them.
- **The view adapter's aggregation key is shared-code-defined** (outcome +
  observed token + reason). A specialization that needs a different notion of
  "the same pattern" should own its key through its registration.
- **Wired by M15-B** through the TLDR (see "After M15-B").

---

## After M14-F: what the public diagnosis does not establish

**Raised:** M14-F (2026-11-02).

- **The deployed service retrieves no comparison fights.** Every public
  ANALYZED document carries diagnosis NOT_ASSESSED
  (`COMPARISON_EVIDENCE_NOT_RETRIEVED`). The projection runs through the
  service only with an injected `comparisonEvidence` port, which tests supply
  over committed evidence. Live comparison retrieval needs an owner decision:
  which comparison fights (the M11-G1 cohort rules or another selection), the
  Warcraft Logs cost per request, and how the subject's post-hoc evidence
  basis is established from a live retrieval rather than an archive grant.
- **No statement exists on real evidence.** The twelve whole-fight M14-E links
  rest on MATCH decisions (`NO_AUTHORITY_FINDING_IN_LINK`); the 45 Heart
  Strike rejections sit on an UNDECIDED row. Certified comparison coverage
  (After M11-G2) is what would decide more directions.
- **One direction rule.** A rejected observed cast of X bears only on X's
  figure being HIGHER. A rule for the authority's SELECTED action (its figure
  being lower) needs a reviewed token-to-ability-id mapping owned by each
  specialization; the observed-decision view carries only a token.
- **Whole fight only.** Which aligned moments (opener, cooldown windows) to
  diagnose is an unreviewed policy, so the service requests none.
- **Named reasons never suppress.** M14-C's INTERMISSION / PHASE_TRANSITION
  are attached to a statement as context. None exists on real evidence, and
  how long after a transition a decision may still be affected is undecided.
- **Raid night carries no diagnosis.** The raid-night contract is unchanged;
  its cells are built without one.

---

## After M14-E: what causal evidence linkage does not establish

**Raised:** M14-E (2026-11-02).

- **A link is not a cause.** It says decision-level evidence exists in the
  same component and window. It never says how much of a delta the evidence
  accounts for, nor that the player erred. On real evidence the Death Strike
  link rests on authority MATCHes. Turning a link into a coaching statement,
  and reading the producer's status (REJECTED, MATCH, ...), is M14-F's
  reviewed projection.
- **No production adapter yet.** The real Blood results are restated as
  records in the M14-E test. A reviewed adapter from findings and observed
  decisions to records belongs with the M14-F projection, which may import
  both sides. M14-E's linkage never imports the authority branch.
- **Ability identity is exact.** A record links an ability row only through
  the game ids it names. Cast-id-to-damage-id relationships (a cast whose
  damage events carry another id) must be stated by the spec-owned producer,
  never guessed. The M14-E test names only cast ids, so such rows stay
  `NO_DECISION_EVIDENCE_IN_SCOPE`.
- **Undecided deltas link nothing.** Every comparison capture is uncertified,
  so most event-count deltas are bounds and many are UNDECIDED. The 45 real
  Heart Strike rejections link to nothing for that reason. Certified
  comparison coverage (After M11-G2) would decide more directions.
- **No factual record producer.** Uptime, resource, buff-window,
  target-choice, cooldown-alignment and actionability records are in the
  vocabulary and proven on synthetic data. No module yet produces them from
  the subject fight.

---

## After M14-D: what the damage-delta decomposition does not establish

**Raised:** M14-D (2026-11-02).

- **No amount delta below the whole fight.** The subject has only the G1 raid
  entry: no per-actor or window tables. So per-ability and windowed amount
  deltas are UNKNOWN, and only event counts decompose there. Per-actor
  tables for the subject (a new, owner-authorized request) would make them
  table-against-table.
- **Raw amounts never subtract** until follow-up M1 proves what `amount`
  means. Then a proven measure (for example `OBSERVED_EFFECTIVE_DAMAGE_SUM`)
  can be decomposed the same way.
- **Event counts against the comparisons are bounds.** Every comparison
  capture is uncertified (After M11-G2). An upper bound proves only
  `SUBJECT_LOWER`, never `SUBJECT_HIGHER`. Certification would make the
  counts EXACT.
- **A damage event is not damage.** A count includes every observed damage
  event, whatever its size or raw hit type. A count delta says how many
  events differed, not how much damage.
- **Same log version only.** Tables under different log versions are never
  subtracted. Whether a log-version change alters table semantics is
  unmeasured.
- **No cause.** A delta is an observation. Linking one to decision-level
  evidence (APL outcomes, cast opportunities, uptime, actionability) is
  M14-E.

---

## After M14-C: what strategy context does not establish

**Raised:** M14-C (2026-11-02).

- **No named reason on real evidence.** No committed fight holds phase
  evidence (After M14-A), so the INTERMISSION / PHASE_TRANSITION path is
  proven synthetically only. A verified phase capability on a phased
  encounter, with certified comparison anchors, is needed first.
- **TARGET_UNAVAILABLE and FORCED_DOWNTIME are never named.** Targetability
  is unverified and the combat model carries no targetability events. "Done"
  is a verified targetability capability and a reviewed landmark for it.
- **No cooldown hold.** A COOLDOWN_TIMING item is shared window timing. A
  hold needs the cooldown's availability, which is spec-owned and not in the
  post-hoc domain.
- **A phase transition is an instant.** PHASE_TRANSITION applies at the
  subject's transition timestamp only. How long after a transition a finding
  may still be affected is a projection decision (M14-F), never a guessed
  duration here.
- **Nothing consumes it yet.** Attachment returns context beside a finding
  moment and suppresses nothing. The reviewed projection (M14-F) decides how
  a named reason is used.

---

## After M14-B: what multi-log consensus does not establish

**Raised:** M14-B (2026-11-02).

- **The thresholds are CANDIDATE.** Minimum sample 3, agreement 2/3 and a
  5 s tolerance were chosen, not measured. Validating them needs more real
  comparison fights of phased encounters with certified (EXACT) anchors.
  Until then every outcome cites the CANDIDATE set by id. "Done" is a
  recorded validation and a `VALIDATED` set.
- **No real consensus exists yet.** Every comparison anchor except the
  recorded end is NO_LATER_THAN (After M11-G2), so every target-transition
  and cooldown-window row is INSUFFICIENT. Certifying the comparison captures
  (M13-D-style table certificates) is what would make them decisive.
- **One tolerance for every landmark.** An intermission start and a recorded
  end may deserve different tolerances. Per-nature tolerances wait for the
  validation above.
- **Independence is not checked.** Two comparison fights by the same player
  or guild count as two voters. The comparison selection decides who is in
  the cohort; consensus does not deduplicate players.
- **A bound never votes.** A NO_LATER_THAN anchor earlier than every group
  member does prove that fight disagrees, but it abstains. That only makes
  SPLIT rarer (INSUFFICIENT instead), never CONSENSUS more likely.
- **No named environmental reason.** Mapping an ENCOUNTER_STATE consensus to
  INTERMISSION or PHASE_TRANSITION, with the subject's own encounter
  evidence, is M14-C (done; see "After M14-C").

---

## After M14-A: what timing alignment does not establish

**Raised:** M14-A (2026-11-02).

- **No phase or intermission landmark on real evidence.** All four committed
  fights hold ENCOUNTER_PHASES as CAPABILITY_UNVERIFIED with an empty
  transition list. The phase path is proven synthetically only. A verified
  phase capability on a phased encounter is needed before any phase row
  appears.
- **No targetability landmark.** TARGETABILITY is unverified and the combat
  model carries no targetability events. "Boss became available" is not a
  landmark until that capability exists.
- **Comparison anchors are bounds.** Every comparison landmark except pull and
  recorded end is NO_LATER_THAN, because no comparison capture is certified
  (After M11-G2). Moment facts around those landmarks are UNKNOWN for the
  comparisons. Certification would make them EXACT. Interpolation never will.
- **A cooldown ordinal is an observed aura window, not a cast.** Blood's
  Dancing Rune Weapon windows include proc windows, so `#k` aligns the k-th
  observed window, not the k-th Dancing Rune Weapon cast.
- **A first damage event is a relationship.** It says when the focus first
  hit an NPC of that game id, not when the NPC appeared or became
  attackable.
- **No delta, consensus or judgement.** Differences between anchors are left
  to M14-B (consensus) and M14-D (decomposition).

---

## After M13-F: what the public Augmentation support observations do not establish

**Raised:** M13-F (2026-11-02).

- **Observations, never a verdict.** `supportObservations` has no field for a
  recipient-quality or timing conclusion. Publishing one needs an approved,
  machine-usable model of that decision AND its own reviewed public shape; the
  adapter refuses `ALLY_STATE_SUFFICIENT` until then.
- **Production fights carry no certified coverage** (After M13-D), so on a
  live request every ally-buff listing is expected to be OBSERVED_ONLY and
  support time a lower bound or UNKNOWN. The wire says so; nothing upgrades it.
- **Raid-night cells carry no support observations.** An Evoker cell is
  AUTHORITY_NOT_AVAILABLE with its limits prose. A raid-night support block
  would need its own reviewed cell shape.
- **The TLDR and the report present no support facts.** They disclose
  GAMEPLAY_NOT_ANALYZED; the facts are in `supportObservations` only. Whether
  the report should summarize them is presentation work (M15-F at the earliest)
  and must never rank them as findings. M15-F: both now disclose
  `SUPPORT_OBSERVATIONS_NOT_SUMMARIZED`; they still summarize nothing of it.
- **"Supported specializations" now names Augmentation Evoker.** The MCP
  limits paragraph states it is observation-only. The sentence itself is
  derived from the PUBLIC set and carries no per-specialization qualifier.
- **Raid-night breadth is per player; owned-pet evidence is not.** Each focused
  view's scope is now the player's own requirement plus preparation's.
  `ownedPetEvidence` still takes the fight-level union, as before M13-F. Making
  it per player too would change existing cells where a pet-evidence analyzer
  shares a fight, and needs its own review.
- **The promotion gates are scoped to authority-binding registrations.** A
  PUBLIC registration that binds no authority is exempt because it can publish
  no decision. If such a registration ever gains a binding, the gates apply to
  it automatically.
- **m9a's import scanner reads single-line imports only.** Observed in
  M13-F: `tests/contracts/m9a-corpus-layering.test.ts` matches
  `import … from` on one line, so a multi-line import (the Augmentation
  evaluator's `src/support/` imports) is never seen, and its `support/`
  token (meant for `tests/support/`) flags a single-line import of
  `src/support/` as test machinery. M13-F avoided the import rather than
  changing the guard; fixing the scanner is its own small change. The
  m13a support-layering scanner spans lines and is unaffected.

---

## After HEAL-B3: what the internal Discipline Priest registration does not establish

**Raised:** HEAL-B3 (2026-11-03).

- **It cannot pass the healer promotion gate on committed evidence
  (HEAL-B3P).** The gate needs a real subject with a COMPLETE use listing, at
  least one use, and a met and a not-met plan entry over those uses. The M13-A
  Discipline Priest's three uses sit in a filtered capture whose listing is
  UNKNOWN, and the canonical fight 48 (the retained M11-E2 raw capture) has no
  Discipline Priest. Unlike HEAL-B1P and HEAL-B2P, no offline cut can supply
  one. HEAL-B3P therefore needs authorized new evidence (ONB-EV, an owner
  decision about a Warcraft Logs request), or stays INTERNAL_ONLY with its gap
  recorded exactly as Restoration Druid's is. Never a weaker gate.
  **HEAL-B3P (2026-11-03): not promoted.** Its offline census found no
  qualifying evidence either: the retained M11-C4f fight (rXAfw9t1q8YpmkKD 13)
  has no Discipline Priest and covers 165 s of 271.8 s, and no retained raw
  page (M10-B, M10-C5, M11-C4f) holds a Discipline ability event
  (agent/architecture.md "HEAL-B3P"). Discipline Priest stays INTERNAL_ONLY;
  its promotion is a new public entry once ONB-EV supplies a whole-fight
  capture, and that entry also settles the two items below.
- **Its public Atonement shape is undecided.** The Atonement facts are attached
  to the evaluation, not to the shared healer finding set or view. HEAL-B3P
  (publicContract EXPECTED) must decide whether and how they are published, and
  what the healer gate requires of them (at least one observed Atonement
  heal under a COMPLETE healing listing, presumably).
- **No committed capture holds an Atonement heal event.** The heal id (81751)
  is corroborated only by a committed fight context's ability table ("Atonement",
  type 2); the healing-as-reported list is exercised on synthetic events and,
  on real evidence, only as an UNKNOWN empty list (the G2 query excluded heals).
  Its first real COMPLETE listing must be checked against the raw bytes,
  including whether Warcraft Logs ever reports an Atonement heal sourced by a
  pet.
- **Same-name spells are unreviewed.** 94472, 451577 and 451769 are pinned rows
  named "Atonement" whose meaning is not reviewed; an event of one of them from
  the subject makes the listing UNKNOWN. If real logs show one of them is
  routinely sourced by Discipline Priests (for example a hero-talent variant),
  reviewing it is a data change, never a parser default.
- **No Atonement interval.** Removals are not listed and no uptime or
  concurrent-Atonement count is claimed: the pinned data carries no duration and
  a removal may be attributed elsewhere. An interval model would need the M4
  aura-state semantics plus fight-termination rules, and its own review.
- **The selection is narrow.** Power Word: Barrier, Ultimate Penitence and
  Evangelism only. Pain Suppression is an external; Shadowfiend and Mindbender
  are pet summons whose healing arrives through Atonement; Archangel and the
  hero-tree spells are not healing cooldowns by this selection. Power Word:
  Barrier has no observed cast in committed evidence (identified from its row
  and its choice-node pairing with an observed Ultimate Penitence). Widening is
  a reviewed data change.
- **The registration facade is copied a sixth time.** Discipline's evaluation
  differs from the other healers' (two datasets, the Atonement facts), but its
  registration facade is the same shape, the identity strings and seams aside.
  The shared healer registration helper ("After HEAL-B2P") is still its own
  reviewed refactor; HEAL-B3 is its own representative and, as recorded there,
  was not required to share it.

---

## After HEAL-B2P: what the public Holy Priest does not establish

**Raised:** HEAL-B2P (2026-11-03).

- **Real healing context is never COMPLETE for it.** As for the other public
  healers ("After HEAL-AP", "After HEAL-B1P"): the committed subject is
  cast-only, so the overlap listing with the roster declared is UNKNOWN.
  Unchanged.
- **Its pet's casts are not retained.** The cut grants CASTS for actor 2
  only. A use is the player's own completed cast, so the listing is
  unaffected; the healing it overlaps still counts the stated pet (94) as a
  source, which only matters once healing evidence is committed.
- **The pseudonym is re-labelled for the public plan** (`Subjectpriest`),
  exactly as HEAL-AP's and HEAL-B1P's; actor id and events untouched.
- **The registration facade is now copied in four public healers.** HEAL-B2P
  added Holy Priest's view adapter and limits prose by the same copy as
  HEAL-B1P (the identity strings and listed abilities differ, nothing else).
  The shared healer registration helper "After HEAL-B2" describes was not
  done here: it rewrites four already-reviewed registrations, three of them
  PUBLIC before this tranche, inside a tranche that declares one
  specialization's promotion. It should be its own reviewed refactor before
  any further healer registration copies the shape (Restoration Druid's
  eventual promotion; HEAL-B3 and HEAL-B4 are their own representatives and
  may not share it).

---

## After HEAL-B2: what the internal Holy Priest registration does not establish

**Raised:** HEAL-B2 (2026-11-03).

- **It cannot pass the healer promotion gate on committed evidence yet
  (HEAL-B2P).** Resolved by HEAL-B2P: the fight-48 Holy Priest's (actor 2)
  whole-fight casts were cut from the retained M11-E2 capture (no new
  request), and it passed every gate check. The gate needs a real subject with a COMPLETE use listing, at
  least one use, and a met and a not-met plan entry over those uses. The M13-A
  Holy Priest's three uses sit in a filtered capture whose listing is
  UNKNOWN, and no committed capture holds the fight-48 Holy Priest's (actor 2)
  whole-fight casts. HEAL-B2P needs that cut, exactly as HEAL-B1P cut actors 1
  and 9: from the retained, authorized M11-E2 raw capture (no new request) if
  it holds actor 2's casts, otherwise authorized evidence (ONB-EV). Never a
  weaker gate.
- **The selection is deliberately narrow.** Divine Hymn and Apotheosis only.
  Holy Word: Salvation has no row in the pinned Holy tree; Guardian Spirit is
  an external; Symbol of Hope, Divine Image, Holy Word: Sanctify and the
  hero-tree spells are not healing cooldowns by this selection. A plan entry
  for one is ABILITY_NOT_REGISTERED. Widening is a reviewed data change.
- **Both identified abilities are observed** as completed casts in committed
  evidence (M13-A actor 2), including Divine Hymn's channel shape: the 64843
  cast, then 64844 pulse casts. Nothing is identified from the row alone.
- **The registration facade is copied a fifth time.** "After HEAL-B1" and
  "After HEAL-B1P" said to revisit at the fifth healer. Revisited: Holy Priest
  is a mechanical copy of the Restoration Druid internal shape (identity
  strings and data loader differ, nothing else). A shared healer
  registration helper would rewrite four registrations already reviewed, two
  of them PUBLIC, inside a tranche that declares one internal specialization,
  so it is not done here. It is the right change before the next healer
  registration copies the shape again (HEAL-B2P adds Holy Priest's public
  view and prose; HEAL-B3 and HEAL-B4 are their own representatives and may
  not share it). The evaluators' composition is copied too, but each owns a
  different identity gate, data and source rule, and the shared parts are
  already the shared modules.

---

## After HEAL-B1P: what the public Holy Paladin and Mistweaver Monk do not establish

**Raised:** HEAL-B1P (2026-11-03).

- **Restoration Druid is still INTERNAL_ONLY.** No committed or retained
  capture holds one of its events, so it cannot meet the healer promotion
  gate. Its gap is appended to ONB-EV; promoting it needs authorized evidence
  (an owner decision) and then a public tranche of its own, through the same
  gate.
- **Real healing context is never COMPLETE for either.** As for Restoration
  Shaman ("After HEAL-AP"): the committed subjects are cast-only, so the
  overlap listing with the roster declared is UNKNOWN. Unchanged.
- **The pseudonyms are re-labelled for the public plan** (`Subjectpaladin`,
  `Subjectmonk`), exactly as HEAL-AP's (`Subjectshaman`); actor ids and events
  untouched.
- **Three of the seven promoted identified abilities are still unobserved.**
  Avenging Crusader, Revival and Invoke Chi-Ji (and Restoration Druid's four)
  are identified from the pinned rows only; the new evidence observes Aura
  Mastery, Avenging Wrath, Invoke Yu'lon and Restoral as completed casts. An
  unobserved id can only leave a use unlisted, which the listing completeness
  and READINESS_NOT_ESTABLISHED keep from becoming a miss.
- **The healer view is shared; the registration facade is still copied.**
  `healer-view-projection.ts` is the one restatement. The registrations stay
  specialization-owned copies ("After HEAL-B1"), now with a view adapter and
  prose each; revisit with the fifth healer.

---

## After HEAL-B1: what the three internal healer registrations do not establish

**Raised:** HEAL-B1 (2026-11-03).

- **None of the three can pass the healer promotion gate on committed
  evidence yet (HEAL-B1P).** Resolved by HEAL-B1P for Holy Paladin and
  Mistweaver Monk (whole-fight cast segments of fight 48 actors 1 and 9, cut
  from the retained M11-E2 capture); Restoration Druid remains, see "After
  HEAL-B1P". The gate needs, per PUBLIC healer, a real subject
  with a COMPLETE use listing, at least one use, and a met and a not-met plan
  entry over those uses. Holy Paladin's only real uses (M13-A actor 5,
  Avenging Wrath and Aura Mastery) sit in a filtered capture whose listing is
  UNKNOWN; b1PmaKrd6CDfzngc fight 48 holds no cast of the Holy Paladin or the
  Mistweaver; no committed capture holds a Restoration Druid event. HEAL-B1P
  needs whole-fight cast captures of each subject: for the fight 48 Holy
  Paladin and Mistweaver, possibly cut from the retained, authorized M11-E2
  raw capture (no new request); for Restoration Druid, authorized evidence
  (an ONB-EV / owner decision). Never a weaker gate.
- **Six of the ten identified abilities are identified from the pinned row
  only.** Only Aura Mastery (31821) and Avenging Wrath (31884) are observed
  as casts in committed evidence. In particular, the activated cast id of
  Avenging Crusader (216331) rests on the row's `id_override_spell` alone,
  and Tranquility's cast-event shape (a channel) is not observed. An
  identified id that is never observed can only leave a use unlisted, and
  the listing completeness and READINESS_NOT_ESTABLISHED keep that from
  becoming a miss.
- **The selections are deliberately narrow.** Externals (Blessing of
  Sacrifice, Ironbark, Life Cocoon), Tyr's Deliverance (its row's spell id was
  not reviewed against a cast), Divine Toll, Celestial Conduit (hero tree) and
  class-tree spells are not identified. A plan entry for one is
  `ABILITY_NOT_REGISTERED`, never reinterpreted. Widening a selection is a
  reviewed data change.
- **The registrations are copies of one shape.** Each healer registration
  (four, with Restoration Shaman's) restates the same facade around its own
  evaluator. A shared healer registration helper was not introduced: every
  registration in the tree is specialization-owned, and the copies differ in
  identity and data. Revisit if a fifth healer copies it again.

---

## After HEAL-AP: what the public Restoration Shaman does not establish

**Raised:** HEAL-AP (2026-11-03).

- **The public real-evidence plan uses a re-labelled pseudonym.** The
  committed archive's names are sanitized (`Actor122`), and a public plan
  accepts letters only, so the healer gate and the transport test rename the
  subject's pseudonym (`Subjectshaman`, unique in the roster; the actor id and
  every event untouched) before the request names it. No real public plan
  names a real player in any committed fight.
- **Real healing context is never COMPLETE.** The committed subject has
  PLAYER_CONTEXT cast-only evidence: at its retrieved breadth every use is
  `ROSTER_NOT_IN_SCOPE`, and with the roster declared the overlap listing is
  UNKNOWN (no roster DAMAGE coverage). A COMPLETE real overlap needs a
  FULL_RAID capture of a healer fight: an ONB-EV / owner decision.
- **The real outcome set is MET, the encounter-ended outcome and UNKNOWN.**
  MISSED, EARLY and LATE are still unreachable ("After M12-D"), and the
  public schema has no field for them. Adding one is a schema change and a
  cooldown-readiness review, never a relabelling of UNKNOWN.
- **The TLDR and report do not summarize healer findings.** They disclose
  `HEALER_FINDINGS_NOT_SUMMARIZED` (and `RAID_COOLDOWN_PLAN_NOT_SUMMARIZED`
  when the plan was judged). A reviewed reporting adapter for healer findings
  is its own tranche.
- **Raid-night cells carry no healer findings and no plan.** A Restoration
  Shaman cell is AUTHORITY_NOT_AVAILABLE; its limits prose says so.
- **The disclosure and the healer view must agree.** A healer view that judged
  a plan the disclosure does not bind, or did not judge one it binds, is an
  INTERNAL_ERROR (`withHealerAssignmentEvaluation`). Both read the same
  encounter id and difficulty, so a mismatch is a defect, not a fight state.

---

## After HEAL-A: what the Restoration Shaman registration does not establish

**Raised:** HEAL-A (2026-11-03).

- **No public shape and no healer gate.** Resolved by HEAL-AP:
  `healerFindings` and `tests/contracts/heal-ap-healer-promotion-gate.test.ts`
  (see "After HEAL-AP").
- **The envelope status for a plan-evaluated result.** Decided in HEAL-AP:
  `AUTHORITY_NOT_AVAILABLE` keeps its one meaning ("no pinned decision
  authority") publicly too. Plan-judged results are in `healerFindings`, each
  citing the plan, and the plan disclosure says EVALUATED_IN_HEALER_FINDINGS.
  A consumer must read the finding set, never the status alone.
- **The plan reaches every selected analyzer.** `SpecAnalysisInput` carries
  the request's plan to whichever public analyzer runs; only Restoration
  Shaman reads it. For every other analyzer the disclosure stays
  `NO_PUBLIC_ASSIGNMENT_EVALUATOR`.
- **Raid-night cells carry no plan.** A raid-night request has no plan field,
  so a future public healer cell would be ASSIGNMENT NO_AUTHORITY_AVAILABLE.
- **Real coverage is unchanged.** The real M12-D subject still has
  PLAYER_CONTEXT cast-only evidence: no overlap claim and no name resolution
  without a declared roster (test plans only). MISSED, EARLY and LATE remain
  unreachable ("After M12-D").
- **Name matching uses the actor catalog's name.** The facade has no
  preflight identity, so it reads `CombatActor.name`, the same Warcraft Logs
  master-data name. A missing name widens "may be this player" rather than
  narrowing it.

---

## After M13-E: what the Augmentation registration does not establish

**Raised:** M13-E (2026-11-02).

- **No public shape.** Resolved by M13-F (`supportObservations`, through the
  registration's support-observation view; see "After M13-F").
- **No internal service entry.** Resolved by M13-F: the registration is
  PUBLIC, and a live `analyzeFight` run derives FULL_RAID from its declared
  requirement.
- **Production fights carry no certified coverage** (After M13-D), so over a
  production FULL_RAID ingestion the facts' listings and continuity rest on
  category coverage alone.
- **Restoration Shaman is still unregistered.** Resolved by HEAL-A, through
  the same provider-less mechanism (see "After HEAL-A").
- **Envelope status is a summary.** `AUTHORITY_NOT_AVAILABLE` says "no support
  decision has a standard", not "nothing was observed". A consumer reading
  the status alone, without the payload, must not treat it as an empty
  analysis.

---

## After M13-D: what the certified coverage does not establish

**Raised:** M13-D (2026-11-02).

- **Prescience on three pets.** Actors 36, 50 and 52 hold Prescience on
  stated instances, and the Buffs table is per actor, so their windows are
  not proven and the Prescience listing stays OBSERVED_ONLY. No
  instance-level table surface is known. Proving them would need an
  unfiltered aura capture or a new surface: an owner decision.
- **The support-cast listing stays UNKNOWN.** 442204 (Scalecommander Breath
  of Eons) was never cast, and a zero is never certified because the Casts
  table omits whole abilities. The listing becomes COMPLETE only if some
  trusted surface proves that the table counts 442204, or if the support
  cast identities are narrowed by a proven hero-talent path. Neither exists.
- **Empowered spells.** The Casts table counts `cast` + `empowerend`, while
  the normalizer leaves `empowerend` envelope-only. Certifying empowered
  spells needs a reviewed decision on what an empowered cast's completion is.
- **Friendly recipients only.** Both the capture and the table are
  `hostilityType: Friendlies`. A certified listing says nothing about a buff
  on a hostile actor.
- **No production path.** Production ingestion never retrieves the tables,
  so no production fight carries certified coverage. Adding that would mean
  new requests per analysis, which is an owner decision.
- **No deaths certificate.** Nothing consumes death completeness. If a
  later conclusion needs "no death", that needs its own certificate (the
  Deaths table).
- **Table data is not frozen.** The tables are pinned at revision 10 on
  2026-11-02. A later re-check could differ.

---

## After M13-C: what the recipient cooldown registry does not establish

**Raised:** M13-C (2026-11-02).

- **Six specializations only.** Every other one is UNSUPPORTED, including
  all thirteen Ebon Might recipients of the real M13-A fight. Covering them
  needs a reviewed extraction per specialization (the M10-C5 cooldown
  extractor, or verbatim pinned rows); a full-roster generation is its own
  tranche.
- **A reviewed subset, not every cooldown.** The 60 s rule selects from
  what each specialization's dataset pinned for its APL, so defensives and
  utility cooldowns the APL never needed (Icebound Fortitude, Fortifying
  Brew, Divine Shield) are absent. Consumers must keep reading
  `REVIEWED_SUBSET`.
- **No talent gate.** An id is listed whether or not the recipient took the
  talent; overlap lists casts, so an untaken talent only never appears.
- **No client-build gate**, as for the other pinned datasets.
- **WCL strings are exact.** A context spelling a specialization
  differently from the cited evidence is UNSUPPORTED until reviewed.

---

## After M13-B: what the stated specializations do not establish

**Raised:** M13-B (2026-11-02).

- **No role.** Nothing says which specializations heal, tank or damage.
  "Other-healer coverage" (After M12-C, After M12-D) needs a reviewed,
  versioned specialization-to-role source in runtime data, never a list
  typed into a role module.
- **No class/specialization compatibility check.** A stated name that is
  not a specialization of the player's class (a corrupt "Restoration
  Warrior") is carried verbatim as STATED. Refusing it needs a reviewed
  class-to-specialization table with provenance; none exists. Today the
  only per-player identity check is the identity preflight's, for the
  analysed subject.
- **No public surface.** No contract reads the field. Recipient
  specialization reaches only the internal Augmentation evaluator
  (registered INTERNAL_ONLY since M13-E).
- **One fight context per ingestion.** A stated specialization is the
  fight's, never the night's: raid-night roster discovery keeps its own
  per-fight `specName`, and nothing reconciles the two.

---

## After M13-A: what the Augmentation Foundation does not yet do

**Raised:** M13-A (2026-11-02).

- **Not registered, not published.** Registration resolved by M13-E
  (INTERNAL_ONLY, FULL_RAID derived from `AUGMENTATION_EVOKER_REQUIRED_INPUTS`;
  see "After M13-E"); published by M13-F (see "After M13-F").
- **No coverage on the real evidence.** Partly resolved by M13-D (table
  certificates; see "After M13-D"). The category grants are still withheld.
- **No recipient cooldown identity.** Resolved for the six pinned
  specializations by M13-C (`src/data/game/recipient-cooldown-identities.*`;
  see "After M13-C").
- **No recipient specialization.** Resolved by M13-B:
  `CombatFight.friendlySpecializations`, and each LISTED recipient's
  `specialization` (see "After M13-B").
- **A Mythic wipe, one subject.** No kill was available in the fixed order;
  no second subject is authorized.
- **Breath of Eons auras are observations only.** The pinned sources bind no
  aura to the Evoker or an ally; Temporal Wound (an enemy debuff) was not
  requested.
- **Recipient-quality model.** SUPPORT_TARGETING stays
  NO_AUTHORITY_AVAILABLE until an approved, machine-usable model exists;
  `supportTargetingStatus` is ready to answer UNKNOWN when one is declared
  without the ally state it needs.

---

## After M12-E: what the raid cooldown plan input does not yet do

**Raised:** M12-E (2026-10-31).

- **Phase-relative times never resolve.** Placing `ph:2.5` in a fight needs
  a reviewed, per-encounter map from a plan's phase labels to the fight's
  observed `phases`, including what to do when a phase is entered more than
  once. None exists, so every note assignment is
  `PLANNED_TIME_UNRESOLVED`. Only `FIGHT_RELATIVE` entries can be judged.
  This is the largest coverage gap, and building the map needs committed
  phase evidence for each mapped encounter.
- **No assignment is evaluated publicly.** Resolved by HEAL-AP for
  Restoration Shaman: its results are `healerFindings`, and the disclosure
  says EVALUATED_IN_HEALER_FINDINGS (see "After HEAL-AP").
- **Difficulty is a Warcraft Logs id.** Accepting "MYTHIC" needs a reviewed
  difficulty-name authority (the same gap that blocks the raid `fight_style`
  binding, M11-F).
- **Realms are compared exactly, case aside.** "Area52" is not matched to
  "Area 52". Accepting a note's realm spelling needs a reviewed realm-slug
  source.
- **No roster enrichment from the note.** The owner allowed an importer to
  read an explicit name-realm roster or invite list in the note. Not built:
  a name without a realm resolves only when unique in the fight.
- **One player per tag.** `tag:A B` is `TAG_NOT_A_SINGLE_PLAYER`, never split
  into guessed per-player assignments. The format's multi-player semantics
  are not established.
- **`bossSpell` is context only.** No reviewed event-anchor model exists.
- **Plans are not stored.** A caller resupplies the plan per request.
- **Timeline-note text fields with `;`.** A `text:` value containing a
  semicolon makes the line `MALFORMED_FIELD`.

---

## After M12-D: what the Restoration Shaman evaluator does not yet do

**Raised:** M12-D (2026-10-31).

- **Not registered, not published.** Registration resolved by HEAL-A
  (INTERNAL_ONLY, FULL_RAID derived, the shared healer finding shape; see
  "After HEAL-A"). Published by HEAL-AP (see "After HEAL-AP").
- **No plan input.** Superseded by M12-E: the evaluator consumes the shared
  normalized `RaidCooldownPlan`, which a request can supply. Since HEAL-A the
  registration reads it from `SpecAnalysisInput.raidCooldownPlan`.
- **MISSED, EARLY and LATE are unreachable.** A miss needs positive proof
  the ability was ready in the window. That needs Restoration cooldowns
  pinned the way M10-C5 pins them (`extract-simc-ability-cooldowns.mjs`:
  DBC record, modifier census, a hand-reviewed absence proof against
  `sc_shaman.cpp`), plus the pre-pull state. Early and late need a rule for
  which cast answers which assignment. `PLAN_MAY_NEED_REVIEW` is not built.
- **No alive or incapacitated state.** MET rests on the observed cast. No
  other outcome claims the player could act.
- **Overlap is not effect.** The 10 s span is a reporting window. Spirit Link
  Totem's and Ascendance's real effect windows need AURAS evidence, which
  the committed raid segments exclude. No real cooldown use lies inside the
  M12-B damage window (+69.5 s to +77.0 s), so overlap is proven on
  synthetic fights only.
- **No "who else is a healer".** Other-healer coverage proper still needs
  specialization identity for every roster player; the evaluator reads only
  its own subject's identity. Since M13-B every roster player's stated
  specialization is on `CombatFight`; a reviewed specialization-to-role
  source is what remains ("After M13-B").
- **The healing domain has one consumer.** The M12-A milestone guard
  (`tests/contracts/m12a-healing-layering.test.ts`) now names this evaluator;
  the "no consumer" notes in the M12-A, M12-B and M12-C entries below are
  superseded by that, and nothing else changed for them.
- **Healing Tide Totem is identified from the pinned row only.** No
  committed evidence holds its cast.
- **No client-build gate.** As for the other pinned datasets, `CombatFight`
  exposes no build key.

---

## After M12-C: what the received-during-episodes primitive does not yet do

**Raised:** M12-C (2026-10-31).

- **No consumer and no public surface.** The milestone guard in
  `tests/contracts/m12a-healing-layering.test.ts` still holds.
- **No owner attribution.** A pet, totem or guardian is reported as its own
  source. Folding it into its owner needs a verified owner relation for
  allied pets, which this primitive deliberately does not read.
- **No "who is a healer".** Sources are any actor. Naming which sources are
  healers, and so "other-healer coverage" proper, needs specialization
  identity for every roster player. That belongs to the first healer
  evaluator (queue entry M12-D, an owner decision).
- **No pre-episode shields.** An absorb applied before the first hit shows
  only through its `absorbed` events in the window. Shield application and
  remaining value need AURAS, which these segments exclude.
- **Raw amounts only.** "Healing received", overheal share and absorbed
  share wait on follow-up M1.
- **One window, one fight.** As in M12-B.

---

## After M12-B: what the damage-episode primitive does not yet do

**Raised:** M12-B (2026-10-31).

- **No consumer and no public surface**, as with M12-A. The milestone guard
  in `tests/contracts/m12a-healing-layering.test.ts` still holds.
- **The roster is players only.** Pets and guardians that take raid damage
  are not in `friendlyPlayers` and are not in episodes.
- **Grouping is by ability only.** Two enemies casting the same ability
  overlap into one episode, and the sources list both. A tick-heavy ability
  every ~2 s (1,284,561 in fight 48) splits or joins with `gapMs`, which is a
  parameter and not a finding.
- **No healing coverage yet.** The archive segments retain every heal and
  absorb around the episodes, so the next tranche (healing received during
  an episode, other-healer coverage) needs no new capture for this window.
  Cooldown coverage would need AURAS, which these segments exclude.
- **One window, one fight.** No second report has been examined.

---

## After M12-A: what the death-timeline primitive does not yet do

**Raised:** M12-A (2026-10-30). None of these is an owner decision yet.

- **No consumer and no public surface.** `deathTimelinesOf` is internal, and
  nothing in production imports `src/healing/` (a milestone guard in
  `tests/contracts/m12a-healing-layering.test.ts`). The first healer
  specialization evaluator, or a publication of the timelines, must:
  - declare FULL_RAID through its requirement;
  - amend that guard by name.
- **No owning corpus layer.** `src/healing/` is not in `OWNING_LAYERS`, so its
  real-evidence assertions live in `tests/unit/healing/death-timeline.test.ts`
  over a committed corpus artifact (the M11-E1 combat-facts precedent). A
  `HEALING` layer with its own assertion kind is the shape when it is
  published.
- **One real player death.** The M11-E2 capture holds exactly one friendly
  player death (actor 5). Not yet exercised on real bytes:
  - heal absorbs;
  - a second death of the same player;
  - a death under PARTIAL retrieval.

  Synthetic cases cover them.
- **Resurrection is still unregistered.** The capture holds one `resurrect`
  (actor 5 at 7,753,355, outside the committed window). Registering the raw
  type needs committed evidence and its own review (M11-F
  `resurrectionContractFor`).
- **Raw amounts only.** Totals, "damage taken" and "effective healing" wait
  on follow-up M1.
- **Not yet built from the M12 list:**
  - raid damage windows;
  - healing cooldown coverage;
  - other-healer coverage;
  - assignment input.

---

## TEST-HYGIENE: make the normal offline test suite independent of production `.dev.vars`

**Raised:** M7-F closeout (2026-09-15). **Do after:** M7 closeout.
**Resolved in TEST-HYGIENE (2026-10-30).**

### Resolution

The shape chosen was the first one: the pool is pointed at a committed config
with nothing secret beside it. Wrangler reads `.dev.vars` from the directory of
the config it is given, and the pool passes no env-file option. So the
`workers` project now uses `tests/workers/wrangler.jsonc`, a test-only copy of
the production config in a directory that holds no `.dev.vars` or `.env`.

- `tests/contracts/test-hygiene-dev-vars.test.ts` pins:
  - the pointer;
  - equality of every normalized setting with the production config;
  - the empty secrets set in that directory;
  - Miniflare options that carry only `ENVIRONMENT`.
- Each of these mutations fails it:
  - a fake `.dev.vars` beside the copy;
  - the pool pointed back at the root config;
  - a drifted `cpu_ms`.
- The run no longer prints `Using secrets defined in .dev.vars` (0 times,
  against 4 for the same files under the old pointer). The contract test file
  appears in every `npm test` run under its name.
- Unchanged:
  - the two-project split;
  - the sentinel bindings and the outbound guard;
  - `vitest.probe.config.ts`, still the only credential-loading config.

The text below is the record as raised.

### What happened before

`npm test` runs two Vitest projects. The `workers` project uses
`@cloudflare/vitest-pool-workers` pointed at `wrangler.jsonc`, and that pool reads
`.dev.vars` as part of building the Miniflare environment. The run prints:

```text
Using secrets defined in .dev.vars
```

once per worker. `.dev.vars` is gitignored and, on a developer machine, normally
holds real Warcraft Logs client credentials.

### Why this is not currently dangerous

- `vitest.config.ts` sets an `outboundService` that answers **every** outbound
  request from workerd locally, so no test can reach Warcraft Logs even if it
  tried — in CI, on a laptop, with or without credentials.
- The pool config declares explicit sentinel bindings
  (`fake-client-id-not-real`, `fake-client-secret-not-real`,
  `fake-analysis-token-not-real`), and tests that matter construct their own
  `Env` objects rather than relying on ambient ones.
- Regression tests sweep responses and headers for credential sentinels.

### Why it is still worth fixing

"Nothing can escape" is a property of one config line, and the failure mode it
guards against is not hypothetical: during M7-B a positional file filter caused a
credential-loading probe config to run and spend real API points. The normal test
command should not be reading a production credential file at all — defence in
depth should not depend on remembering that the outbound guard is there.

Recording it accurately rather than calling it ideal: it is **acceptable today,
and not the arrangement we want**.

### What done looks like

The default `npm test` run does not read `.dev.vars`, and says so in its output.
Possible shapes, none chosen yet:

- point the pool at a committed, credential-free vars file for tests;
- give the test config its own wrangler environment with no secret loading;
- or keep the pool's loading but prove, by test, that no loaded value reaches an
  `Env` any test uses.

Whatever the shape, the credential-loading probe config
(`vitest.probe.config.ts`) must stay separate and must stay the only thing that
can spend Warcraft Logs points.

### Explicitly out of scope

This is not an invitation to redesign the test runner, the two-project split, or
the Miniflare bindings while doing it.

---

## M9-C: corpus follow-through

**Raised:** M9-B closeout (2026-09-15). **Resolved in M9-C (2026-09-15)** except
where marked.

- Done: `npm run test:corpus` (`scripts/corpus/gate.mjs`) and a separate CI
  job; the gate also still runs inside `npm test`.
- Done: implementation-level mutation proofs (M3 cursor, M4 absence gate, M6/M8
  parity); the M4 mutation was uncaught and produced a new case.
- Decided: `tests/fixtures/wcl/preflight-payloads.ts` stays a synthetic
  mutable builder outside the corpus (see `tests/corpus/README.md`); real
  identity resolution is corpus-pinned over real master data.
- Still open: `tests/support/raid-night-orchestration-fixture.ts` normalizes
  the D2 artifact under its own window; the raid-night and encounter-context
  parity executors accept only the D2 artifact and say so. M9-C added
  `fightFacts` so the subject pull's encounter facts can be stated, but the
  window is still the fixture's own.
- Every M9-B evidence gap now carries a disposition in
  `tests/support/corpus/report.ts` and `tests/corpus/report.json`.

## PRODUCT-INTENT GAP: preparation / consumable status is not implemented

**Raised:** M11-A Phase 1 audit (2026-09-17). **Owner:** not yet assigned; not
M11-A.

`CLAUDE.md`, `agent/product-intent.md`, `agent/architecture.md` and `README.md`
all require every analysis report to carry a status for health-potion,
healthstone and combat-potion usage (`UNKNOWN` under incomplete coverage,
never omitted). Today no preparation analyzer exists under `src/`, schema
`warcraft-logs-coach.analysis/1` has no consumable or preparation field, and
`agent/deployment-smoke.md` step M8-5's consumable check cannot be performed
against the current output. The README now labels the requirement as product
intent not yet implemented, so no document claims the status is emitted.

Done looks like: a shared preparation analyzer running as a parallel finding
producer, an additive (optional, therefore schema-v1-compatible) public field
carrying the three statuses, and contract tests proving the category is never
omitted and never reads zero from `PARTIAL`/`ABSENT` coverage. Making the field
required is a schema-v2 decision. None of that is M11-A work.

**PARTLY RESOLVED (PREP-1, 2026-10-29).** The producer exists and runs:

- `src/analysis/preparation/consumable-status.ts`, with identity data on the
  analyzer authority pin;
- `FightAnalysis.preparation` for every analyzed player, in single-player
  analysis and raid night;
- contract tests for "never omitted" and "never zero from PARTIAL, ABSENT or
  unverified coverage".

**RESOLVED for the single-fight analysis result (PREP-2, 2026-10-30).** All
three owner decisions were taken (agent/architecture.md "PREP-2"):

- the public field ships on every status;
- unsupported specializations retrieve the fight for preparation alone;
- the shared-cooldown slot definition stays.

Still open, none of them an owner decision:

- **RESOLVED (PREP-3): raid night.** Every present cell carries the compact
  status, and all-unanalyzable fights are retrieved (owner decisions,
  agent/architecture.md "PREP-3").
- **RESOLVED (PREP-4): no real use was committed.** Two regression-corpus
  slices of the existing fight-48 capture now carry a real pre-pull combat
  potion, a Healthstone and a Silvermoon Health Potion, asserted through the
  service. No new Warcraft Logs request was made. A whole fight with all
  three kinds for one player is not committed, because of the 5.5 MiB line.
- **RESOLVED (PREP-5): the MCP tool descriptions.** Both
  `analyze_warcraft_log` and `analyze_raid_night` now describe the
  consumable status they carry. The schema did not change
  (agent/architecture.md "PREP-5").

## After M11-A3: shared-engine candidates the audit named

**Raised:** M11-A3 (2026-09-17). Each is an ENGINE milestone with its own
design and proof; none is authorized by A3 and none is needed by the
Retribution first slice. Listed in the order the audit found them to unlock
the most of the remaining M11 population (`agent/m11-a3-authority-audit.md`
§6).

- **`run_action_list` with a decidable gate.** Fifteen of thirty ordinary
  lists put their whole rotation behind it. Two sound, bounded steps: skip a
  `run_action_list` whose gate is proven FALSE exactly as a FALSE
  `call_action_list` gate is skipped today; then model a proven-TRUE one as
  "continue in the child, never return". Neither touches expression
  semantics.
- **Binding fields for `buff.<x>.stack` and `buff.<x>.remains`.** Both are
  built-ins with no binding field, so no specialization can bind them and
  every line reading them is UNKNOWN. Aura stack and remaining
  reconstruction (M4 already carries stacks on events) is the single most
  valuable shared addition for M11 coverage.
- **A proven lower bound above zero is a proven non-zero** (`truthOf` on a
  `BOUNDED_NUMBER`), and sign-aware bound propagation through `*`/`+`/`-`.
  Retribution's `generators[0]` gate and several trinket gates read a
  cooldown remainder as a bare truth or multiply `gcd`.
- **Cast/channel decision anchors.** Every caster's decision point is its
  `begincast`; the shared observed-decision model anchors on `cast`. Blocks
  the first slice of eleven specializations. **Resolved (shared plumbing) in
  ONB-S4** (`buildCastTimeline`, agent/architecture.md "ONB-S4"). What
  remains:
  - No specialization consumes it yet. Each Cohort D representative supplies
    its own `CastAnchorProfile` (reviewed execution, cast time, channel bound)
    and decides what the anchor means for its decisions.
  - Empowered casts (`empowerstart` / `empowerend`, Evoker) are not modelled.
    Their anchor needs its own wire review.
  - The end of a channel is never observed directly. A specialization could
    bound it from its channel aura's removal. Until then, occupancy inside a
    channel is UNKNOWN.
  - A hard cast begun before the pull stays UNKNOWN, because CASTS coverage
    starts at the pull. A prepull begin is observed but cannot be proven the
    latest.
  - Without a proven positive cast time, back-to-back casts of one spell
    whose next begin shares the completion's millisecond are ambiguous. The
    retained Restoration Shaman has 49 of 85 Chain Heals in that state. A
    caster that can exclude instant-cast procs resolves them.
  - `NOT_CASTING` needs complete cast coverage from the pull, and an
    unreviewed ability makes the window before it UNKNOWN. A specialization
    must review every ability it casts, trinkets and potions included.
  - Pushback and cast slows are not modelled. The anchor is the observed
    begin and never a computed one when a begin is observed.
- **Charge state, target count (with evidence, never a default), generic
  in-scan `variable` execution, pets.** Named for completeness; each is
  spec-blocking for some cohort and none has a design yet.

## After M11-A2: deferred structural items

**Raised:** M11-A2 (2026-09-18). None is a defect; each is a decision.

- **Assassination publishes no limitation paragraph.** Its module's
  `limitsProse` is empty on both surfaces, which reproduces the M10-D
  descriptions byte for byte. Whether Assassination's supported surface
  deserves its own paragraph is a wording decision for the milestone that
  next touches the descriptions.
- **The shared parser's Rogue built-ins stay** (`combo_points`,
  `energy.pct`, `stealthed.rogue`, `variable.single_target`, bare
  `remains`/`pmultiplier`/`refreshable`), frozen by
  `m11a-parser-builtins-frozen`. Migrating them into a Rogue vocabulary
  would risk Assassination invariance for no gameplay benefit.
- **The M5-era Assassination data layout is frozen, not fixed:**
  `src/simc/pinned-authority.ts`, the generically named
  `src/data/game/ability-gcd-semantics.ts` (the shared engine imports one
  TYPE from it), and the class-only-named `rogue-*` datasets are pinned as
  Assassination-owned exceptions in `m11a2-cross-spec-isolation`. A future
  Rogue specialization must not import them; relocating them is a separate,
  invariance-proven change.
- **The supplemental-analysis seam is unwired.** `defineSpecModule`
  accepts spec-owned supplemental analyses and both modules register none;
  orchestration, ingestion scope and the public contract know nothing of
  them. The milestone that registers the first one designs the wiring.
- **Two M9-C corpus cases pair the unsupported identity with actor 19's
  evidence** as a declared identity premise
  (`application-service.unsupported-spec-runs-no-analyzer-and-retrieves-for-preparation-only`,
  `public-contract.analysis-parity-for-an-unsupported-spec`). Recorded in
  `m11a2-unsupported-subject.test.ts`; they are not the real subject and
  were left as they are.

## After M10-D: the internal-only partition is dormant

**Raised:** M10-D (2026-09-18).

Both known specializations are PUBLIC and `INTERNAL_ONLY_SPEC_IDS` is empty.
(Superseded: Retribution Paladin arrived internal-only at M11-A4, Blood Death
Knight at M11-B2, and Brewmaster Monk at M11-C2; each was promoted in turn,
Brewmaster at M11-C4j, and the set is empty again.)
The partition, `requirePublicSpecId`, `InternalSpecExposureError`, the
registry's `INTERNAL_ONLY` exposure and `internalAnalyzerForSpec` are kept as
the on-ramp for the next specialization, which is expected to arrive as an
internal-only id first, exactly as Protection Paladin did in M10-A. Until
then `PUBLIC_EXPOSURE_OF_INTERNAL_SPEC` has no reachable subject, and the
proofs that once used a test-owned internal-only row live on the two real
registrations (`tests/support/catalog.ts`,
`tests/regression/m10d-public-second-registration-invariance.test.ts`). The
milestone that adds the next id must re-prove the internal-only path over its
real registration before exposing it (the M10-C pattern) — nothing here should
be deleted on the grounds that it is unexercised.

**Update (M11-A4/A5, 2026-09-18):** exactly that happened. Retribution Paladin
arrived INTERNAL_ONLY at M11-A4 (the partition, the narrowing boundary and the
gate's internal mode exercised over a real registration) and was promoted
PUBLIC at M11-A5; the set is empty again and the on-ramp is intact for the
next specialization.

**Update (M11-B2 … M11-B12, 2026-09-22):** and again, over a much longer
road. Blood Death Knight arrived INTERNAL_ONLY at M11-B2 as a MEASUREMENT
slice, stayed there for ten evidence milestones while the partition and the
internal lookup carried it, and was promoted PUBLIC at M11-B12 by the same
five-site edit after the promotion gate reported twenty-three qualifying real
assertions. The set is empty again; nothing here has been deleted.

Two identity/evidence caveats M10-D surfaced, both outside its scope:

- A Warcraft Logs identity naming a supported specialization over another
  class's events dispatches the real analyzer and yields `ANALYZED` with
  zero eligible decisions (every cast excluded) or `PROFILE_NOT_RESOLVED`.
  That was true of Assassination before M10-D and is now two-sided.
  `IDENTITY_CONFLICT` detection remains M15's; tests and smoke checks must
  never pair a supported identity with another class's evidence.
- `agent/deployment-smoke.md` Part II step M8-5 names actor 5 as the
  Protection Paladin; the committed A7R6 master data has actor 5 as an
  Evoker (Preservation) and actor 7 as the Protection Paladin, and the step
  expects consumable categories schema v1 does not carry. Part III supersedes
  it with actors 7 (Protection) and 4 (Warrior/Arms).

## After M11-B12: Protection and Retribution read the resource wire contracts unkeyed

**Raised:** M11-B12 (2026-09-22).

Blood's promotion made its Rune and Runic Power reads resolve through
`resourceWireTypeFor(resourceId, { gameVersion, logVersion })` with the
capture's own keys, so a log whose parser version no contract covers fails
closed as `INSUFFICIENT_EVIDENCE` instead of reading the numbers out of a
field that log does not use that way (`src/specs/deathknight/blood/
resources.ts`, `bloodWireKeys`). Assassination already did this
(`INCOMPATIBLE_RESOURCE_WIRE_VERSION`).

Protection Paladin (`src/specs/paladin/protection/observed-analysis.ts`) and
Retribution Paladin (`src/specs/paladin/retribution/holy-power.ts`) still scan
`RESOURCE_WIRE_CONTRACTS` directly for their wire type, unkeyed. Today every
committed capture is `gameVersion` 1 / `logVersion` 17, so the two readings
agree and no shipped answer is wrong; the exposure is to a FUTURE capture at a
parser version whose encoding differs, where both would read a wire type that
is no longer theirs rather than refusing.

Not fixed here because M11-B12's scope is Blood's promotion and its owner
decision T3 named Blood only: changing two other public specializations'
resource semantics in a promotion commit would put unrelated verdict-bearing
code in a change reviewed for exposure.

**Done looks like:** both Paladin modules resolve through the keyed resolver,
each with its own fail-closed status, and each with the four negative tests
Blood now has (foreign `logVersion`, older `logVersion`, foreign
`gameVersion`, absent `gameVersion`).

(M11-C4j: Brewmaster's one Energy read is keyed too — owner decision, the
affordability dimension fails closed on an uncovered version. The two Paladin
modules remain the only unkeyed readers.)

## After M11-C4j: Brewmaster's retained UNKNOWN areas and the Master of Harmony slice

**Raised:** M11-C4j (2026-09-28).

Brewmaster is public as a beta-quality slice, validated for Shado-Pan only.
What stays `UNKNOWN` by design, each with its route out:

- **Black Ox Brew** — no reviewed transition contract (what it resets, what it
  forgets); the largest single UNKNOWN cause on both subjects.
- **Empty the Cellar on subject 2** — its readiness aura is corroborated, but
  that window holds no 1262768 transition to anchor it.
- **Keg Smash charges and hasted recharge** — only the ≥1-charge upper bound
  is used; no charge simulation.
- **Energy between observations** — only a decision cast's own PRE_COST is read.
- **Unproven positive usability** — Breath of Fire is untargeted and never
  proven; an uncosted decision cast proves no affordability.
- **Master of Harmony** — refused (`AUTHORITY_NOT_AVAILABLE`) until real
  Master of Harmony evidence is measured.

**Done looks like:** each item closed by its own reviewed slice with real
evidence, never by inference.

## After M11-C4i: the corpus layering guard never inspects `tests/contracts/`

**Raised:** M11-C4i (2026-09-27); recorded at M11-C4j. **Resolved in M11-D1
(2026-09-30).** Every glob key now maps to one path under `tests/` (`./x` →
`contracts/x`, `../d/x` → `d/x`), a path with no source throws instead of
reading as `""`, and four regressions pin the enumeration itself: normalized
paths, non-empty sources, a named contract module genuinely read, and
per-directory non-vacuity. The re-audit before the change found no violation
among the 79 newly inspected contract modules (the triple rule, the pair and
the sanctioned-name rule), so no allowlist was needed; the predicates were not
changed.

`tests/contracts/m9a-corpus-layering.test.ts` globs `../**/*.ts`; Vite keys
files in the importer's own directory as `./x`, but the test strips only
`../`, so every `tests/contracts/*` source reads as empty and the
sanctioned-entry and triple rules never check contract tests (79 of 315 files
at M11-C4i). Not fixed: widening the guard may surface existing violations and
needs its own reviewed change.

**Done looks like:** `./` keys normalized to `contracts/`, and whatever
surfaces triaged.

## After M11-B12: Blood's Deathbringer slice and the Improved Bone Shield maximum

**Raised:** M11-B12 (2026-09-22).

Two deliberate boundaries of the public Blood slice, both recorded here so
neither is mistaken for an oversight.

**Deathbringer is modelled but not validated.** The pinned APL carries the
Deathbringer list, the shared engine dispatches into it, and the analyzer's
hero-tree gate refuses it: every Blood conclusion this build publishes rests
on two San'layn captures, and no Deathbringer verdict has ever been measured
or reviewed (owner decision T2). A Deathbringer build receives
`AUTHORITY_NOT_AVAILABLE`. **Done looks like:** a sanitized Deathbringer
capture in the corpus, its decision surface measured the way M11-B2 … M11-B10
measured San'layn's, an audited MATCH/REJECTED population, and then one entry
added to `BLOOD_VALIDATED_HERO_TREES`.

**Bone Shield's maximum is deferred authority.** The DBC row is 10; Improved
Bone Shield (374715, effect 1259987) raises the in-game maximum to 12, which
both corpus subjects reach. The talent is NOT in the extracted Blood talent
artifact and `maxStackGuard` is off for Bone Shield, so the analyzer neither
enforces a maximum nor infers one from the observed 12 (owner decision Q2 of
M11-B10, re-affirmed at M11-B12). This is safe because NO supported predicate
reads Bone Shield's maximum — the reachable APL conditions are `stack<=1` and
`stack<6` — and M11-B11 traced every MATCH and REJECTED to confirm it.
**Done looks like:** `improved_bone_shield` added to the extractor target and
the artifact regenerated, a Blood-owned modifier beside Frenzied Bloodthirst's,
and the guard switched on — required only if a future predicate reads the
maximum.

## After M11-D2: deferred resource and Energy safety items

**Raised:** M11-D2 audit, M11-D2-A2 and M11-D2-A3 (2026-10-01). None is
reachable by a current public decision; each must be closed before the work
that would make it reachable.

**Assassination stale Energy before D3.** **Resolved in M11-D3-0
(2026-10-01).** The first-GCD query reused the decision's PRE_COST
`energy.pct` in every explored branch, including those after a hypothetical
Thistle Tea. Each declared transition write now names the observed bindings
it invalidates (`ATOMS_INVALIDATED_BY_WRITE`, exhaustive over
`TransitionWrite`); a branch that executes a PLAYER_ENERGY write reads
`energy.pct` as not established, its siblings keep the observed value, and no
post-transition Energy is inferred. On committed evidence the 36 decisions
keep their outcomes; four d2 Envenoms change blocker from DIVERGENT_WORLDS to
OBSERVED_STATE_MISSING (the divergence rested on the stale value), re-pinned
in `spec-assassination.envenom-after-tea-blocks-on-unobserved-energy`.
DELAYED_STEALTH_EXPIRY was reviewed in the same audit and intentionally
invalidates nothing: the pinned Kick timing puts the stealth expiry at t+1ms,
every scan and the selected GCD at t+0, and the engine refuses any non-zero
time advance, so a bound `stealthed.rogue` is proven unchanged over the query.

**`wholeUnits` provenance.** `wholeUnits: true` for COMBO_POINTS, HOLY_POWER
and RUNES rests on count semantics, not on a pinned field (`power_type_data_t`
has none). Give it explicit provenance, or document it as a modelling
decision.

**Unresolved resource-window handling.** `observationsWithinBefore` does not
currently surface unresolved-ownership changes that fall inside the queried
historical window. `resourceHistoryAt` currently protects Blood's production
path, but the generic window helper needs an explicit fail-closed ownership
rule before broader resource-history consumers rely on it.

## After M11-D3-B: target selection diagnostics and coverage limits

**Raised:** M11-D3-B1 and M11-D3-B2 (2026-10-02). None changes a current
public decision; none is a soundness defect — each is attribution precision
or coverage.

**Whole-line blocker classification for refused `target_if` lines.**
`decision-coverage.ts` classifies a blocked line by permanent-atom markers
over its WHOLE verbatim text, and `time_to_die` precedes `target_if` in
`PERMANENT_ATOM_MARKERS`. So a REFUSED `target_if` line whose score is
`target.time_to_die` (every Windwalker MIN/MAX line) classifies as
PREDICTIVE_STATE, although target selection is what is missing
(TARGETING_NOT_MODELLED). This predates B1; B1 only excluded the `target_if`
text when target choice was proven IGNORABLE. Settle the precedence — or
classify a refused line by its refusal reason — before a Windwalker-shaped
authority becomes public.

**`retarget` and the B1 NON_GCD guard classify as OTHER.** Both fail closed
with the first-GCD blocker `TRANSITION_UNSUPPORTED`, which `classifyBlocker`
maps to OTHER; the missing thing is the chosen enemy's identity, which reads
more truthfully as TARGETING_NOT_MODELLED. A classification change, not a
semantic one.

**D3-A collapses before the first-GCD query can drop an auto-attack
retarget.** A run child offering "`retarget_auto_attack`, or a proven entry"
is AMBIGUOUS to one scan, and D3-A stops at the gate without recording the
explored worlds, so the first-GCD query never sees that the retarget's world
converges. SimulationCraft would reach the proven entry in every world; the
engine answers UNKNOWN at the gate. Sound, and a coverage limit; lifting it
means teaching D3-A's collapse about pseudo-actions, which B2 did not do.

## After M11-F: what the narrow evidence primitives do not establish

**Raised:** M11-F (2026-10-08). Each item is UNKNOWN or refused today, never
guessed.

**Raid `fight_style` binding (O7) blocked on a difficulty authority.** The binding
`fight_style.dungeonroute/dungeonslice = false` is approved for a positively
identified raid encounter. No authoritative raid-difficulty classification
exists in the repository, and numeric difficulty ids must not be guessed. It
needs a pinned source: a captured `Zone.difficulties`, or a documented WCL
difficulty enumeration.

**`resurrect` has no committed evidence.** The decoder and contract exist
(`resurrectionContractFor`) but are not registered. Production therefore
answers UNREVIEWED_EVENT_AFTER_DEATH after a death followed by a resurrection,
which fails closed. Committing a capture that contains one (the M11-E2 player 5
event is outside the committed slice) would admit it.

**`active_dot` is a lower bound only.** An exact count needs a proven-empty
window: a pinned MAXIMUM carry duration (pandemic, haste and talents included)
for the DoT, so that complete focus-sourced aura coverage over that window rules
out unobserved carriers. Assassination's pinned durations are base values only.

**NORMALIZATION_REVISION bumped `m3.2` -> `m3.3` (resolved, owner-approved).**
The repo contract bumps on any change of normalized-model shape or meaning, and
additive changes count. M11-E1 (`tickField`, `overkillAmount`) and M11-F
(`DEATH` / `RESURRECTION`, raw `death` no longer `UNSUPPORTED_TYPE`) both
qualified.

Historical note: `b05f0c4` (M10-C4, 2026-09-17) replaced the raw gear ids
`permanentEnchantId` / `temporaryEnchantId` / `gemIds` with the
`GearEnchantState` / `GearGemsState` states without the required bump. It is
recorded here as a missed historical bump. `m3.3` is the next current revision
and incorporates the model as it exists now. No history was rewritten.

The intentional public delta: every ANALYZED raid-night/1 cell's
`provenance.normalizationRevision` reads `"m3.3"`, so a stored `m3.2` result
compares as `sameNormalizationRevision` false and NOT_COMPATIBLE. analysis/1
carries no normalization revision.

**Deferred with Policy B:**
- exact `active_enemies`;
- generic `spell_targets` (an alias of `active_enemies` under the pinned
  defaults);
- closed `target_if` enumeration;
- targetability and attackability windows;
- add availability;
- hostility authority (N5).

## After M11-G4-5: what stands between 12.1.5 and a registered model

**Raised:** M11-G4-5 (2026-10-29). Nothing is registered. Each item is an
owner decision or an upstream event.

**OWNER DECISION (2026-11-02): DEFERRED; do NOT register the 12.1.5 / 70575
model yet.** This is a deliberate deferral, not an open decision. The
autopilot queue entry M11-G4-5-R is `BLOCKED` with its re-open trigger.

1. **Tank-load meaning: WAIT FOR AN UPSTREAM SIMULATIONCRAFT FIX.**
   - Never register 70575 under STANDARD_TANK_LOAD_V1: the Mythic tank dummy
     no longer represents the approved incoming-damage load.
   - Never accept the broken Mythic-dummy behavior as a new normal just to
     register 12.1.5.
   - Never patch the engine locally.
   - Why: the 70575 data moved the Mythic expected-stat modifier from
     difficulty 16 to 233 while the engine still reads 16, so physical
     incoming damage, and with it Blood healing, change materially. Reusing
     STANDARD_TANK_LOAD_V1 would silently change the meaning of an approved
     model.
   - A later upstream snapshot that fixes the difficulty lookup may be
     evaluated as a NEW candidate.
2. **Blood validation window: KEEP THE SNAPSHOT-BOUNDED EVIDENCE STANDARD.**
   - A weaker basis such as "no newer Live snapshot existed as of a recorded
     check" is never introduced to extend the window.
   - A window extends only when a later Live snapshot exists and is verified
     Blood-equivalent under the existing rules.
   - Why: the current candidate's verified window ends before the first
     provable 70575 US fight. Weakening the basis would trade correctness for
     latency, and simulation publication is not worth weakening fail-closed
     semantics.
3. **EU coverage: DEFERRED.** US-only coverage is acceptable for now.
   - EU fights keep failing closed as `REGION_NOT_COVERED` until EU restart
     and deployment evidence is deliberately curated under the US source
     rules.
   - Future US model registration is never blocked on EU evidence.
4. **Current result.** The 70575 candidate stays NOT REGISTERED. Logs
   resolving to 12.1.5 / 70575 keep returning the existing typed
   model-not-available result, with no fallback to an older model.
5. **Re-open trigger.** Revisit only when BOTH hold:
   - a later upstream SimulationCraft snapshot fixes the Mythic difficulty
     and tank-load issue, or otherwise restores an explicitly reviewed,
     stable tank-load meaning;
   - the Blood validation window overlaps a provable deployment interval under
     the existing snapshot-equivalence rules.

   Then create a FRESH, reviewed model-registration tranche; the current
   candidate is never silently revived. EU coverage stays independently
   optional and may be added later.
6. **Not done by this decision.** No model registration, no Warcraft Logs
   request, no deployment.

The items below are kept as the record of the options considered.

- **Tank-load meaning.** Under the 70575 data, SimulationCraft's Mythic tank
  dummy loses the Mythic armor-constant modifier (×1.649). The data moved
  from difficulty 16 to 233, and the engine still reads 16. Incoming physical
  damage drops 35% and Blood's healing drops 10–45%.
  - STANDARD_TANK_LOAD_V1 would silently mean a different load on a 12.1.5
    model.
  - Options:
    - wait for an upstream fix and pin a later snapshot;
    - accept it as a NEW, separately named tank model whose meaning is
      engine-specific;
    - (not recommended) a local engine patch, which leaves upstream-pinned
      provenance.
- **Validation window vs proven deployment.** A snapshot-bounded Blood window
  ends at the last verified Live snapshot. That snapshot (6a4500db0f,
  2026-10-28T00:32:44Z) predates the first provable 70575 fight time
  (2026-10-28T03:00Z, US).
  - A useful window needs either a later Live 70575 snapshot, verified Blood
    equivalent, or a new window basis approved by the owner, for example
    "no newer Live snapshot as of a recorded check".
  - Every extension otherwise waits on upstream.
- **EU.** No EU restart evidence is recorded, so EU fights stay
  `REGION_NOT_COVERED` for every model.
- **Unseparated DPS effect.** The −0.44% Blood DPS change at 70575 is not
  split between the tank load and the 70575 data (Gift of the San'layn
  labels, Transfusion duration). A tank-load fix would need a re-measure.
- **PARTLY RESOLVED (M11-G4-6): simc-build/2 is not bit-reproducible.** Two
  `--no-cache` builds from identical inputs gave different binaries
  (`b1913546…` vs `1fa9954e…`, 57 KB apart).
  - simc-build/3 fixes the embedded build time: `SOURCE_DATE_EPOCH` is the
    commit's time.
  - It also trains single-threaded, but the PGO profile still varies, so the
    binaries still differ.
  - For the tested development Blood jobs (two execution profiles), engine
    output was identical single-threaded across A, B and the v2 candidate.
  - `m11g46-functional-reproduction.bench.ts` repeats that check for the
    jobs it runs.
  - Remaining:
    - Profile independence for other specs, inputs and future rebuilds is
      unproven.
    - Each rebuilt artifact still needs its own approval by binary hash.
    - The training run's variable counters are not identified.
    - Optional: bit-identical binaries would need the PGO profile pinned as
      a distributed input, or no PGO.
- **What promotion would commit:**
  - the `simc-build/2` build record;
  - the `simc-ec3422d6` data bundle (manifest v2, tokens measured);
  - the golden projections;
  - Blood environment facts measured on the candidate (all classes
    unchanged);
  - the registry entry and the Blood validation.
  - All exist in the scratch review and are not committed.

## After M11-G4-2: what internal publication does not establish

**Raised:** M11-G4-2 (2026-10-28).

- **RESOLVED (M11-G4-3): production fidelity echo.**
  - A FIDELITY_PROBE result now carries the engine echo (parser V3), and
    `backendProfileEchoSource` reads it through any backend.
  - Remaining: a publication deployment must enable FIDELITY_PROBE alongside
    PRODUCTION. The production default stays PRODUCTION only, and under it
    CHARACTER fails closed with JOB_REJECTED. That is a deployment choice for
    the owner.
- **No real subject publishes.**
  - The canonical fight stops at ENVIRONMENT. Its missing effects hold on
    both registered models and on every data set the model-pin
    investigation audited.
  - The PUBLISHED path is proven on a synthetic plan only (owner decision 3):
    orchestration, not real-log fidelity.
- **RESOLVED (M11-G4-4) for single-target observations: attainment
  comparability.**
  - Both sides are proven to count pets: the WCL table is reconciled to the
    unit from events, and the engine's DPS from its own breakdown.
  - `assessDpsComparability` makes attainment KNOWN only when the
    observation's own total reconciles to the unit against its owner and pet
    events (`reconcileObservedAttribution`), for the DamageDone table
    source, log version 17, and observed damage to exactly one target.
  - A caller must therefore supply complete owner and pet damage events for
    the subject fight; without them attribution is UNRECONCILED.
  - Remaining: multi-target observations stay NOT_PROVEN, because a job is
    single target.
  - The reconciliation is one fight on log version 17. Other attribution
    rules Warcraft Logs may apply (for example Augmentation credit) are not
    evidenced, and a new log version needs its own reconciliation.
- **Precision bounds refuse short fights.**
  - On the real engine a 60 s fight missed both policies (escalated RSE
    9.03e-4 > 6e-4), while a 345 s fight publishes at STANDARD_SIM_V1 (RSE
    7.8e-4).
  - The bounds were calibrated on the 345 s fight. Whether short fights
    should publish is a precision and cost question for a later owner
    decision; today they refuse, as designed.
- **Internal only; nothing calls it.**
  - No route, service or projection imports `src/publication/`, and the
    runner has no deployed host.
  - Public promotion (a contract and digest change) and deployment are
    separate, owner-controlled steps.

## After M11-G4-1: what the SimulationContextResolver does not establish

**Raised:** M11-G4-1 (2026-10-28).

- **Coverage is US-only and three weeks deep.**
  - Restart evidence exists only for US 2026-09-08, 09-22 and 09-29. No dated
    report of an EU (or KR/TW/CN) maintenance window was found, so every
    non-US log is REGION_NOT_COVERED.
  - Builds 69814 and 69875 have no proven interval: no restart evidence was
    curated for their weeks (a 2026-09-15 US report exists but was not
    entered, since no model exists for either build).
  - Done looks like: restart evidence curated per region and week, as each
    week is needed, under the same source rules.
- **No Blizzard-authored restart window was found.**
  - Every restart source is a THIRD_PARTY_NEWS_REPORT (Blizzard Watch).
    Blizzard's hotfix log tags some changes "[With weekly restarts]" but
    states no region or time, so it does not establish a window.
  - If Blizzard publishes region- and time-specific maintenance statements,
    they replace or corroborate the reports.
- **wago does not record region.**
  - A wago observation is product-level. Applying it to region R relies on R's
    restart evidence coming after the worst-case appearance; it does not prove
    R's version server listed the build at the same moment.
  - Today Blizzard's version server lists one build for every region (checked
    2026-10-28). Historical per-region listings are not available.
- **The 12 h boundary margin is a conservative policy, not a measurement.**
  - It absorbs log-clock and upload-timezone error and maintenance overrun.
  - Validating it would need logs with independently known times near a
    deployment boundary.
- **wago's timezone is undeclared.**
  - Every observation trails Blizzard's CDN upload when read as UTC (minimum
    7 min). That bounds wago's clock to at most 7 min ahead of UTC, but the
    westward worst case (UTC−12) is still assumed.
  - A published wago timezone would tighten every appearance bound by up to
    12 h.
- **Article bytes are not committed.**
  - Third-party article bytes stay in gitignored `.probe/g4/sources/`; the
    committed evidence keeps each source's URL, SHA-256, times and verbatim
    excerpts.
  - Re-verification after loss means re-fetching, and the page may have
    changed.
- **Stored raid-night/1 results become NOT_COMPATIBLE.**
  - `NORMALIZATION_REVISION` moved to `m3.4`, so an `m3.3` cell no longer
    compares with a fresh one, as the contract intends.
  - Any persisted raid-night/1 cells need re-analysis to compare again.
- **Nothing in production calls the resolver yet.**
  - Production ingestion now carries `report.region`. G4 publication will
    call the resolver; until then only tests and the canonical subject use it.
- **G4 publication is not designed.**
  - What is published, its statistics, labels, contract and runner
    orchestration are the next G4 proposal. 12.1.5 compatibility review comes
    after that foundation (owner decision).
- **The calendar needs upkeep.**
  - New builds need `scripts/authority/capture-live-build-evidence.mjs`
    re-run, and new weeks need restart evidence.
  - The newest observed build's interval ends at the observation retrieval
    time, so stale evidence fails closed rather than extending.

## After M11 simulation-model registry: what the 69933 promotion does not establish

**Raised:** M11 model registry (2026-10-23). **Owner decisions locked:**
2026-10-28 (closeout).

- **A log's game build is not resolved automatically.** OWNER DECISION:
  automatic game-build and fight-context resolution belongs to G4, as a
  distinct `SimulationContextResolver` prerequisite, NOT inside ceiling math.
  - `selectSimulationModel` takes a resolved build and fight time.
  - The canonical subject's context (12.1.0.69933, 2026-10-01T01:01Z) is the
    approved investigation result, not something the code derives from a log.
  - The resolver must fail closed with SIMULATION_MODEL_CONTEXT_UNRESOLVED when
    it cannot resolve.
- **The 33622e9d window is narrow by construction.** OWNER DECISION: keep it
  narrow; do not gather evidence to widen it now.
  - Its basis is `SINGLE_SNAPSHOT_UNTIL_NEXT_LIVE_SNAPSHOT`: one data snapshot
    until the next Live snapshot, which is another build.
- **12.1.5 has no model.** OWNER DECISION: do not register 12.1.5 yet.
  - 12.1.5 logs resolve to SIMULATION_MODEL_NOT_AVAILABLE; there is no
    fallback to 69933.
  - 12.1.5 gets a separate compatibility review AFTER the G4 foundation and
    BEFORE ceilings are published for 12.1.5 or current-Live logs.
  - That review covers a new registered model (pin, build, image, build record,
    per-model data, goldens) and a Blood validation.
- **The 0a72e6a7 window ends at the last snapshot shown equivalent.** A later
  69933 hotfix snapshot extends it only after a Blood equivalence check like the
  one for 7cbb6ef5ff and 698c86ba67.
- **Only Blood is validated.** Every other spec is
  SIMULATION_MODEL_NOT_VALIDATED_FOR_SPEC on both models. Protection was
  deliberately not migrated.
- **Consumption breakdown granularity differs across models.**
  - 33622e9d reports `consumption` and `consumption_release` as separate
    breakdown entries; 0a72e6a7 reports one compound `consumption` entry.
  - Any consumer comparing per-ability breakdowns across models must map the
    two shapes; within one model, results are consistent. No consumer does this
    today.
  - OWNER DECISION: no cross-model Consumption normalization layer yet. The
    known shape difference is preserved, pinned by
    `tests/unit/simulation/consumption-release.test.ts`. Normalization is
    added only when an actual consumer needs cross-model per-ability
    comparison.
- **The apk toolchain drifted between the two builds.**
  - The two artifacts share the recipe and base image digest, but the Alpine
    package set resolved differently (the toolchain manifest is recorded per
    build record).
  - Both binaries are verified by their own exact-pin runs. Rebuilding
    reproducibly from the recipe alone is not established for either.
  - OWNER DECISION: do not rebuild existing approved artifacts merely to change
    package pinning.
  - BEFORE THE NEXT MODEL BUILD, introduce a hardened build-recipe revision.
    It pins the immutable base plus the exact package and toolchain inputs, as
    far as practical.
- **RESOLVED (2026-10-28): the historical consumables source label.**
  - The v3 artifact recorded `engine/item/consumable.cpp`, a path that does
    not exist at 33622e9d. Its hash was of `engine/player/consumable.cpp`.
  - Regenerated with extractor v4 from the same five hashed sources:
    consumables `simc-33622e9d-3` → `-4`, token acceptance `-1` → `-2`
    (re-measured on the 33622e9d binary). The 0a72e6a7 bundle moved the same
    way, for extractor reproducibility.
  - Semantic content and token verdicts are byte-identical, pinned by a
    semantic hash. The change is recorded in each model manifest's
    `dataHistory`.
- **The environment stays BLOCKED on both models.** The promotion resolves
  none of the G3-4 blockers. The three absent auras stay
  PINNED_MODEL_MISSING_OBSERVED_EFFECT naming 12.1.0.69933.
  - Inside a validated applicability window, chronology is discharged:
    MODEL_SNAPSHOT_PRECEDES_LOG (informational), not MODEL_BUILD_LAG.
  - Outside one, MODEL_BUILD_LAG stays a diagnostic.

**Done would look like:**
- G4's `SimulationContextResolver` resolves build and fight time from the log
  and selects through the registry.
- Per-spec validations are added only with equivalence evidence.
- A 12.1.5 model is registered after its compatibility review.
- The next model build uses the hardened recipe revision.

## After M11-G3-5: what the runner service does not establish

**Raised:** M11-G3-5 (2026-10-22).

- **No deployed host.**
  - `RECOMMENDED_PRODUCTION_CAPACITY_V1` (16 vCPU, 2 × 8) is a recommendation.
  - The only measured configuration is the 12-CPU development host at 1 × 8.
  - Queue depth and wait must be re-derived from a real job mix before
    production. The feasibility numbers are single-host estimates, not a load
    test.
- **TLS is not in the service.** TLS is MANDATORY for production deployment,
  terminated in front of the service (reverse proxy or tunnel). That is an
  accepted v1 deployment requirement, not implemented here. Application HMAC
  stays mandatory behind TLS or a private network. The HMAC scheme
  authenticates requests; it does not encrypt them or authenticate the
  responses.
  - Response trust comes from `settleTicket`'s full re-verification. A forged
    response can therefore only produce a typed failure or a result whose
    identity matches the job.
  - Numbers inside a well-formed response are not signed.
- **The readiness attestation is a statement, not a proof.** By design the
  Worker is the authoritative G3-2/G3-4 policy engine. Since the final
  hardening, the attestation is bound to the exact job (both hashes) and to the
  gate REVISIONS that declared it ready. The runner accepts only the current
  revisions, and a contract pins each gate's code fingerprint. A compromised
  HMAC holder could still attest falsely; the runner does not re-run the gates.
- **Gate fingerprints cover gate code, not data.** Runtime data the gates read
  (consumable acceptance, raid environment, materiality inputs) is versioned by
  its own revisions. A data change that alters readiness meaning must also
  move the gate revision, and review must catch that, not the fingerprint.
- **Cache numbers:** RESOLVED by the final hardening. Records carry an
  HMAC-SHA256 under a dedicated cache-integrity key, so an edited DPS with
  intact provenance is detected, dropped and recomputed. The key must stay
  private to the runner; whoever holds it can forge records.
- **Accepted v1 limitations (owner-approved):**
  - **Non-durable queue.** A restart loses queued and running work. Recovery is
    client re-submission with semantic identity (tested). It is approved for
    v1.
  - **Nonce store per process.** A request captured in the last tolerance
    window (±300 s) could be replayed once against a freshly restarted runner.
    This is an accepted v1 limitation, not solved here.
  - **Single runner instance.** This is the approved v1 deployment.
    Coalescing, tickets and the nonce store are in-process. Horizontal scaling
    would need shared nonce and ticket stores and a shared cache.
- **No public endpoint and no analysis wiring.** The Worker client is not
  connected to any route, `analysis/1` is unchanged, and no G4 math exists.
- **Layering amendments (reviewed in this tranche):**
  - `runner/service/` may import `../../src/simulation/*`;
  - runner top-level files may import `./service/*`;
  - the new `src/simulation-client/` imports only zod and `src/simulation/*`,
    and nothing in `src/` imports it.

## After M11-G3-4: what the environment reconstruction does not establish

**Raised:** M11-G3-4 (2026-10-19).

**Add availability is unproven, and committed evidence cannot prove it.**
- TARGETABILITY, ENCOUNTER_PHASES and DEATHS are not capability-established.
- SUMMONS does not vouch for enemy actors.
- No phase metadata exists for encounter 3455.
- The subject's adds 179 and 180 are engaged in waves but have no availability
  interval.

A future capture can only help if Warcraft Logs exposes a reviewed boundary
semantic (see the G3-4 report's capture plan).

**Target debuffs on the boss are out of the retrieved scope.** Chaos Brand,
Mystic Touch and Hunter's Mark are material (0.9–3.2%) and UNKNOWN. Resolving
them needs aura events on the boss from every source over the fight.

**Setup consumables can never be KNOWN_NONE.** The pull aura list is not proven
exhaustive. A CURRENT_SETUP translation can therefore never write "no flask",
"no food" or "no rune".

**No pinned item-to-engine-token mapping for ranked consumables.** Even a known
rank cannot be written: the engine token is the tokenized item name plus its
crafting quality (`consumable.cpp:38-59`), and crafting quality is not in the
pinned consumables artifact.

**Observed potion timing cannot be expressed.** The job has no potion schedule,
and the built-in APL owns timing.

**Unnamed pull auras.** 1296934, 1303184 and 1285644 have no pinned identity.
1303171 (Vantus Rune: Tides) is in the pinned data, but the engine does not
model it. Their stat effects are unknown, which keeps stat reconciliation
PARTIALLY_RECONCILED (haste +229, mastery −231, strength +52, stamina +184,
crit +3).

**Lust runs at the next whole second** (≤ 1 s offset; 0.07% for Blood).

**Continuation (2026-10-22).**
- **Ranked consumables.** Superseded by the rank-envelope tokens (consumables
  revision 2).
- **Potion timing.** Superseded by the owner's APL-timing policy.
- **Add availability.** WCL_TARGET_AVAILABILITY_AUTHORITY_NOT_FOUND; a pinned
  encounter schedule is the only remaining route.
- **Boss debuffs.** Intervals were observed through an uncertified filtered
  capture. Certifying them needs one table request under
  `hostilityType: Friendlies, targetID: 161` plus a committed artifact.
  Whole-fight representation also needs an approved approximation, or engine
  support for timed debuffs.
- **Food and rune.** A pre-pull filtered Buffs query for the two pinned
  candidates (1264426, 1278929) returned nothing. That proves no absence. The
  remaining route is USER_PROVIDED. Even a stated food cannot make the
  environment simulation-ready at this pin: the approved engine refuses every
  derived food token (consumable-token-acceptance.json). Some engine food
  names do work (`silvermoon_parade`, used for the materiality example), but
  which item those build is unverified.
- **Unidentified auras** 1285644, 1296934 and 1303184 are absent from the
  pinned data. They need a newer pinned model (no auto-update).

**Final authority reduction (2026-10-22).**
- **Boss-debuff certification.** The friendly-sourced Debuffs table on the
  boss returns nothing, so no WCL surface tried so far certifies those windows.
  Even certified, a late start needs an approved bounded approximation, because
  the engine cannot apply a timed school debuff.
- **Food.** The engine accepts 43 canonical food tokens, verified by echo, but
  none links to the subject's evidence. For future USER_PROVIDED foods, an
  echo-verified token↔spell table could replace the order-independent static
  rule (which marks e.g. `silvermoon_parade` ambiguous). Not implemented.
- **Adds.** Neither Warcraft Logs nor pinned data holds an availability
  authority for encounter 3455; a schedule needs a new, owner-approved
  authority class.

## After M11-G3-3: what ELITE_REALISTIC_V1 does not establish

**Raised:** M11-G3-3 (2026-10-15).

**The 400 ms elite reaction is an assumption, not a measurement.** It is inert
for Blood, and a Fire probe moved by +0.07% against the engine's 500 ms.
Revisit it with evidence when a proc-reactive spec is onboarded; a change is
ELITE_REALISTIC_V2.

**Channel lag (250 ms, pinned) is material for channellers.** An Arcane probe
shows +3.7% at 0 ms. Whether an elite player can queue into a channel's end
needs a product and gameplay decision before a channelling spec is onboarded.
For Blood it is conditional on the Consumption talent.

**The engine emits trivial-level log lines for some specs.** Arcane Mage
reported "Unable to register Improved Conjuration…". The G3-1 parser fails
closed on any log entry, so such specs would be refused until a reviewed
log-level policy exists. Blood emits none.

**No queue timing check against logs.** WCL carries no haste state, so exact
GCD lengths, and with them queue gaps, are not reconstructible from committed
evidence.

## After M11-G3-2: what character reconstruction does not establish

**Raised:** M11-G3-2 (2026-10-14).

**Race is unresolved and blocks every current-setup ceiling.** No committed
evidence carries it, and no neutral engine race exists. This is an owner
decision (see the G3-2 report). Options:
- a player-supplied race;
- a race-bounded range across playable races;
- a documented race policy.

**WCL pull stats do not reconcile exactly.**
- Versatility (flask rank 2), armor and stamina (Fortitude) are explained.
- Haste +245 and mastery −231 against the probe are not. The food aura
  (1285644) and a "Fury of the Dead" aura (1296934) are absent from the
  pinned spell data.
- Until it is explained, stats stay a diagnostic.

**Model-version compatibility is unknown.** The log is 21 days newer than the
pinned hotfix data, and no evidence field carries the client build.

**Consumables for G3-4.**
- Flask and potion are known by identity, with rank open.
- Food and augment rune are UNKNOWN.
- The flask rank-2 stat match is a derived diagnostic, not observed
  evidence.
- Whether the pull aura list is exhaustive is not proven.

**Set-bonus mapping.** WCL setID → engine tier is proven only through
engine-reported markers. The pinned item-set table was not available offline,
and MID1's 4-piece has no engine marker.

**Hero tree is not echoed by the engine.** It is verified from the import
decode against WCL, and indirectly through San'layn spells in the engine
output.

**G3-1 tests were not committed with 6d84c8a.** At the time of G3-2:
- `tests/unit/simulation/*`, `tests/support/simulation/*`,
  `tests/contracts/m11g3-simulation-layering.test.ts` and the G3-1 bench were
  untracked;
- CI for G3-1 ran without them.

## After M11-G3-1: what the simulation runner does not yet establish

**Raised:** M11-G3-1 (2026-10-14).

**Built and verified.** The exact pin was built in Docker (Alpine by digest,
clang 22.1.3) and verified by its own JSON: `33622e9d16`, 12.1.0.69587 Live,
`no_networking` true. The approved artifact has binary sha256 `41347bc4…cb77`.
A golden artifact and the exact-pin benchmark exist (`agent/architecture.md`,
M11-G3-1).

**Settled on real output.**
- `encoded_item` carries `id=`.
- No `logs` array appears on a clean run.
- `dps.count` = iterations − threads exactly.
- `overrides` echoed only `bloodlust` and `bloodlust_time` for the development
  job.
- Two of my earlier assumptions were wrong and are fixed with tests:
  - `options.seed` is not an echo; deterministic=1 reseeds every iteration;
  - stat-less items (shirt, tabard) are not echoed.

**Still unconfirmed on real output.**
- How a `disabled` consumable is echoed. The development job names all five,
  so NONE is still not asserted.
- Whether `logs` warnings ever appear on valid runs. Any entry still fails
  closed.

**Owner decisions pending.**
- STANDARD_SIM_V1 (2k / 8 threads) and PRECISION_ESCALATED_V1 (8k / 8) are
  recommended but remain CANDIDATE.
- ELITE_REALISTIC_CANDIDATE_A/B are inert for Blood: reaction time is sampled
  only for `.react` buffs, and the pinned Blood APL has none. G3-3 must use
  other execution parameters for Blood.

**Pets are not mapped to WCL actors.**
- ONB-S6 adds the shared, spec-profiled mapping
  (`src/engine/game-state/pets/pet-state.ts`). No specialization supplies a
  reviewed profile yet, and a gameID several engine pets share stays
  AMBIGUOUS there.
- Only Blood Beast (217228) is engine-derived.
- The Rune Weapon is AMBIGUOUS across three engine pets.
- Risen Ghoul is not established.
- The real development job reported only `dance_of_midnight` and
  `everlasting_bond`.

**Binary reproducibility is not claimed.** `__DATE__` / `__TIME__` are
compiled in, so a rebuild yields a new binary hash and needs its own approval.
The full-history clone took about 13 minutes of a 35-minute build.

**Development-host environment.** On Windows, libuv gives every child a fixed
set of required variables even with an empty environment. The production
runner (Linux, DirectLauncher in the image) passes none. Docker Desktop's CLI
is not on Git Bash's PATH by default.

## After M11-G2: what the comparison facts do not establish

**Raised:** M11-G2 (2026-10-12). Each item is unproven or refused today, never
guessed.

**No comparison coverage is granted.** Under the owner's rule, no table certifies
the filtered streams. Comparison counts are therefore AT_LEAST and their raw sums
UNKNOWN. Two certification paths would need their own review:
- a certified UNFILTERED reference window of one comparison fight;
- a per-direction grant model (the coverage grant has no direction field, and
  the pets' DamageTaken tables are empty).

Every observed discrepancy is an event the tables omit, so nothing points to
under-retrieval.

**The subject is asymmetric.**
- It has no per-actor tables, no window tables and no enemy list, because it is
  never re-fetched. Its WCL-computed amounts are the G1 raid entry only: total,
  pets and per-target-type split.
- Its WCL_ENEMY_NPC_CLASSIFIED label is unavailable, not zero.

**Filter-language semantics are pinned on one report** (three diagnostic
requests): `source.id` is the catalog gameID, `owner.id` reaches pets, and
missed damage is not `type = "damage"`. A future capture must re-check them,
and the certificates are how.

**M1 data points, not proof.** The subject's Risen Ghoul raw `amount` sum
(248,333) equals its WCL raid-entry pet total exactly. Rune Weapon (7,060,330 vs
7,344,648) and Blood Beast (1,014,118 vs 1,333,469) do not. M1 stays
NOT_YET_PROVEN.

**Resource at window start is UNKNOWN.** No post-hoc resource primitive exists,
and the Blood resource reconstruction lives in the authority branch, which
post-hoc code may not import.

**Dancing Rune Weapon has two sources.** 17–19 aura windows per fight against
4 casts. Proc windows (summon 1264353) are kept, so "the four DRWs" means the
four trigger casts (AT_WINDOW_START or DURING_ACTIVE_WINDOW), not four windows.

**Rune Weapon instances span several windows.** Most instances overlap two or
more windows, because windows are adjacent and instances persist. One cast is
never one instance, and no finer attribution is claimed.

**M2 stays unresolved.** Raw hitTypes 1 / 2 / 10 are reported without meaning.

## After M11-G1: what the observed cohort does not establish

**Raised:** M11-G1 (2026-10-09). Each item is unproven or refused today, never
guessed.

**M1 is still NOT_YET_PROVEN.** ACTUAL_DPS reads WCL's DamageDone table
total, which differs from the normalized raw-amount owner rollup for the same
subject (45,802,009 vs 45,709,411). No normalized sum stands in for WCL's
figure.
- **Explained (M11-G4-4).** The 92,598 difference is +2,092,963 absorbed,
  −1,810,023 redirected Blessing of Sacrifice, and −190,342 Bombardments
  credited to another player
  (`tests/unit/publication/dps-comparability-evidence.test.ts`).

**Pet inclusion in the table total: PROVEN (M11-G4-4) for this fight.** Every
listed pet's table total equals its own events' amount + absorbed, and the
total reconciles to the unit. The proof covers one fight under log version 17.

**NAME_AND_SERVER identity degrades to NAME_ONLY across surfaces.** Rankings
spell realms with spaces ("Tarren Mill", "Area 52"); `masterData` does not
("TarrenMill", "Area52"). The M8-F rule therefore falls back to a unique
name-only match, the same as M8-F. A pinned realm normalization (a
WCL-documented slug, not a guessed space-strip) would restore server-exact
matching.

**Deaths are a table, not a stream.** DIED_BEFORE_END reads the candidate's
Deaths-table entries. A resurrection within the fight still excludes. That is
conservative (it can only shrink the pool) and is never used to blame anyone.

**Page 1 per bracket only.** Each bracket's discovery pool is page 1 (100 rows,
PARTIAL). A highest-DPS selection reads only the top, so this is enough when
three qualify early. A cohort that needs deeper rows reports INSUFFICIENT
rather than paging.

**Not in G1, by owner decision:** simulation, Raidbots, a SimC runner,
ceilings, RNG, execution loss, blame, and comparison-player events (a
G2-or-later decision, with its own budget).

## After M11-E1: what the observed combat facts do not establish

**Raised:** M11-E1 (2026-10-05). Each is NOT YET PROVEN, and the facts layer
reports raw fields only until it is.

**M1 — what raw v2 `amount` means.** The decoder path is proven verbatim; its
accounting meaning is not. The scripting-API definition ("excluding absorbs
and overkill") is a different, derived surface. Closing it needs an official
statement about the v2 `events.data` field, or an approved capture (M8 plan)
with a killing blow carrying `overkill`, compared against the target's health
snapshot. Then `OBSERVED_EFFECTIVE_DAMAGE_SUM` is one more measure over the
existing observations.

*Empirical evidence (M11-E2, 2026-10-06; still NOT_YET_PROVEN).* The
full-fight capture of b1PmaKrd6CDfzngc fight 48 (271,011 events) was examined
offline:

- 48 events carry `overkill`.
- Every one has a target snapshot with `hitPoints` 0.
- In all 48, raw `amount` equals the target's last observed pre-hit
  `hitPoints`, so `amount` did not include overkill.
- 45 of the target instances have a `death` event.
- No event combines a positive `absorbed` with `overkill`.

This is consistent with "amount excludes overkill", but it is one report, not
an official statement. No `OBSERVED_EFFECTIVE_DAMAGE_SUM` was created.

The committed fixture keeps the focus's one overkill blow (raw fields
separate). The full record is in
`tests/evidence/m11e2-blood-death-knight-b1pm-fight-48.md`.

**M2 — raw numeric `hitType`.** The documented `DamageHitType` is a string
union; no official source maps the raw numbers. No crit, miss, immune or
glancing classification until one does.

**M3 — an absent `tick`.** Not "direct". No direct-hit count until pinned.

**M4 — summon-event ownership.** Recorded as evidence only.

**M6 — Augmentation attribution** (`supportID`, `subtractsFromSupportedActor`).
Kept raw; no damage is moved. Owned by M13 or a reviewed attribution model.

**M8 — the full-fight capture.** Executed in M11-E2 and committed in M11-E2.1
to the evidence archive (not the regression corpus):

- b1PmaKrd6CDfzngc fight 48: focus 15 and its WCL-stated pets 44, 45, 47 and
  224.
- Seven compact segments plus the fight context, with the context as the actor
  catalog.
- Owner views, SOURCE_ACTORS per pet and the boss-subtype filter are EXACT
  over committed bytes (`tests/unit/m11e2-blood-dk-fixture.test.ts`).

What remains:

- Regression-corpus fixtures still carry no actor catalog. Owner views stay
  NOT_ESTABLISHED there.
- Healing, absorbs, deaths and targetability are not granted by the new
  fixture.

## After M11-D3-C3: what line_cd support does not reach

**Raised:** M11-D3-C3 (2026-10-04). Coverage, not soundness: each is UNKNOWN
or refused.

**Ordinary Warcraft Logs history decides no line_cd.** The timer starts at
line SELECTION, and a cast proves only that a selection happened at or
before it: no lower bound (queue delay, cast time), and no coverage (a
dropped selection casts nothing). So history built from casts
(`lineSelectionHistoryFromObservedCasts`) is always UNKNOWN for a positive
`line_cd`, and only the analyzer's own same-decision prefix decides one.
Deciding more needs SELECTION evidence that does not exist today: a source
that proves every selection in an interval (READY), or one that proves a
selection's instant from below (NOT_READY). The five public authorities
carry no `line_cd`, so no public adapter supplies any history.

**Call and run lines.** Pinned, `line_cd` on a `call_action_list` is never
started (a call is recursed into, never executed), and on a
`run_action_list` it starts at selection. Neither occurs in Cohorts A/B, so
both stay refused as unsupported options.

**What the probes still stop at.** Havoc reads past its two
`retarget_auto_attack,line_cd=1` lines (B2) and stops at `default[3]` on
`gcd.max`. Survival's `retarget,…,line_cd=5` is refused at its `target_if`
(its `if=fight_style.dungeonroute` is unsupported) before the timer matters,
and would need target identity anyway. Devourer's four
`pick_up_fragment,…,line_cd=` lines share one token across five entries and
are never observed casts, so their timers can only be UNKNOWN; its scans stop
earlier, at `cooldowns[0]`. Enhancement's `bloodlust,line_cd=600` is its
sole Bloodlust entry, so an observed cast would attribute; Enhancement has no
analyzer.

## After M11-D3-C2: what generic variable execution does not reach

**Raised:** M11-D3-C2 (2026-10-03). Coverage, not soundness: each reads UNKNOWN.

**Precombat variables.** Resolved in ONB-S1 (`src/simc/precombat-variables.ts`,
agent/architecture.md "Since ONB-S1"). What remains:

- `trinket.*` expressions do not parse, so trinket-derived precombat values
  (the bulk of Cohort A/B precombat variables) stay UNKNOWN or a set.
- Specialization atoms carry no value in precombat. A talent-derived spec atom
  would need a declared combat-invariance flag before it could be read there.
- Non-variable precombat actions outside the five pinned non-harmful core
  actions are treated as possibly harmful, so later variable lines are joined.
- The single-list walker (`list-selection.ts`) still starts at the unknown
  incoming value; only the nested scans carry precombat values.

**Values across first-GCD rescans.** SimulationCraft's rescan after a NON_GCD
action sees the previous scan's assignments; each scan here starts from the
unknown incoming value instead. Carrying them would put variable values into
the first-GCD state key.

**Combining operations.** Resolved in ONB-S2 (`combineVariableValue`,
agent/architecture.md "Since ONB-S2"). What remains:

- `cycling_variable` stays UNKNOWN until an enemy-set authority exists
  (ONB-S3): Vengeance's `dung_pull_ttd` and Affliction's `min_agony`.
- Expression division `%` and unary minus do not parse, so Vengeance's
  in-combat `ceil` programme (`value=...%variable.frac_souls`) stays UNKNOWN.
  Its `ceil` lines are also on variables with no `add`..`max` line, so they
  stay UNKNOWN (`CONSTANT_FOLDING`) until an expression `is_constant` rule
  can prove those variables unfoldable.
- A proven lower bound is not carried through combining arithmetic, and two
  finite sets are not paired; `pow` beyond an exact safe-integer result is
  UNKNOWN. Each only withholds a value.
- Devourer's `void_ray_count` resolves (KNOWN 0) only where metamorphosis is
  proven down, so its reset runs; with metamorphosis up the add reads the
  unknown incoming value. Balance's precombat `on_use_trinket` sums read
  unparsed `trinket.*` and stay UNKNOWN.
- `op=report` is still not modelled.
- **Constant-variable folding (found in ONB-S2, predates it).** At the
  iteration-1 reset, a variable whose every action is constant takes the
  value it held at the end of iteration 0 as a constant
  (action_variable.cpp:25-78, player.cpp:6694-6697). Its reads fold to that
  constant (player.cpp:11959-11963) and its lines leave the foreground list
  (variable.cpp:174-187). So in iterations after the first, a read between
  two writes of such a variable sees the folded value, not the earlier
  write. The scan model reads the earlier write. `add` to `max` are never
  constant (variable.cpp:202-205), so a variable with one of those lines is
  never folded; `floor`, `ceil` and `reset` are constant when every other
  line is (:216-221). ONB-S2 executes `floor` and `ceil` only on a variable
  proven never folded (`neverFoldedVariables`), so they do not widen the
  gap; `set`, `setif` and `reset` still read as unfolded. A variable with ONE
  constant write folds to that write's value, which is what the model reads
  after it. The divergence needs two or more constant writes with a read
  between them. Audit of the
  five pinned public authorities (ONB-S2): the only variable with more than
  one write is Assassination's `trinket_sync_slot`, two precombat lines with
  no read between them, so no public decision is affected. A fix needs a
  rule matching SimulationCraft's expression `is_constant`, and it belongs
  before an onboarding representative that has such a variable.

## After M9-C: evidence the corpus still lacks

**Raised:** M9-C closeout (2026-09-15).

Every remaining gap has a canonical owner (`KNOWN_EVIDENCE_GAPS`,
`tests/corpus/report.json`):

- **M10 (Protection Paladin):** the decision-level tank capture, which must
  retain every interrupt by the player (`no-interrupt-events` — the first
  capture milestone whose subject has an interrupt in its supported surface).
- **M11 (broader DPS corpus expansion):** `assassination-corpus-breadth` — a
  wipe, a pre-pull window that retains the Stealth application so an opener
  decision can resolve, the low-bracket subject's own slice from the gtKb
  kill (actor 8, 8 %, has performance provenance but no events), and a
  decision on whether a bounded cast-to-application tolerance is sound for
  combo-point DoTs (the gtKb report records Rupture's applydebuff one
  millisecond after its cast, and `bindDotRemains` refuses).
- **M12 (death-event and dispel/triage behaviour):**
  `no-death-or-dispel-events`. Not M10: a tank capture may contain a dispel,
  but healer triage semantics are not a tank question.
- **M14 (targetability and temporal root-cause consumers):**
  `no-targetability-or-intermission` — the targetability event shape; real
  intermission PHASE transitions are already committed.
- **M15 (identity and product maturity):** `no-identity-conflict-capture` —
  `IDENTITY_CONFLICT` is a result state nothing produces or consumes; detection
  and propagation are unimplemented, so the gap is OUTSIDE_CURRENT_CAPABILITY
  until M15 implements them and owns their evidence.
- A verbatim upstream failure BODY (rate-limit or 5xx from Warcraft Logs) is
  not captured and will not be: provoking one means spending or exhausting
  quota. The transport's classification of each is pinned by unit tests; the
  corpus models the failure class over real pages.
- The A7R6 events captures list `sourceActorId: 19` and `PLAYER_CONTEXT`; the
  fight-context capture is recorded `FULL_RAID` because master data is
  report-wide. Neither is a claim about ingestion scope derivation.

---

## After AUTOPILOT: what the supervisor does not yet do

**Raised:** AUTOPILOT (2026-10-31).

- **Claude binary.** No Claude Code CLI is installed on PATH. The supervisor
  falls back to the binary bundled with Zed's agent integration, which needs
  no Zed window but can move when Zed updates. Installing the CLI, or
  passing `-ClaudePath`, removes the dependency.
- **Concurrency is 1.** Running two tranches at once needs a per-tranche
  review packet in place of the rolling `agent/review-request.md`, and
  per-worktree review output in place of the single
  `.probe/openai-review/latest*` slot (`agent/autopilot.md`
  "Parallelism").
- **GitHub cannot enforce checks.** Without branch protection on this plan,
  the supervisor's gate is the only enforcement of required checks. A plan
  with branch protection would let GitHub enforce them too.
- **Older layering guards.** The m11e1-style import regex in older
  layering guards misses bare `import "x"` and dynamic `import()`. M12-A
  widened only its own copy.

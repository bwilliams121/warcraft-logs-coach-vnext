/**
 * ONB-EV-PLAN: the frozen selection rule of the neutral evidence campaign, as code, so that ONB-EV runs
 * what the plan says and a test can hold it to that. See `agent/onb-ev-plan.json` and
 * `agent/architecture.md` "ONB-EV-PLAN".
 *
 * Pure and offline. It reads listing pages it is given and makes no request. It reads identity and fight
 * bounds only: no event, kill flag, boss percentage, ranking, parse or amount can reach a result, because
 * nothing here looks at one.
 */

import { createHash } from "node:crypto";

export const ONB_EV_SELECTION_REVISION = "onb-ev-selection/1";

/** Key order must not change a digest, so objects are written with sorted keys at every depth. */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

/**
 * The plan's digest: sha256 of its canonical JSON, without the digest field and without `status`.
 * Status is lifecycle, so ONB-EV can mark the plan EXECUTED and it stays the plan that was reviewed.
 */
export function planDigest(plan) {
  const { planDigest: _digest, status: _status, ...rest } = plan;
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(rest)))
    .digest("hex");
}

/** A fight's place in the fixed order. Listing order, upload order and content choose nothing. */
export function discoveryOrderKey(plan, reportCode, fightId) {
  return createHash("sha256")
    .update(`${plan.discovery.orderSalt}|${reportCode}|${String(fightId)}`)
    .digest("hex");
}

/** The build the deploy calendar proves for this start time, or null. Half-open, as the calendar is. */
function provenIntervalOf(plan, startMs) {
  return (
    plan.provenIntervals.find(
      (interval) => Date.parse(interval.fromUtc) <= startMs && startMs < Date.parse(interval.toUtc),
    ) ?? null
  );
}

/** Every fight of a page that qualifies for anyone, in the fixed order. Never reads an outcome. */
function orderedFightsOf(plan, page) {
  const fights = [];
  for (const report of page.reports) {
    if (report?.zone?.id !== plan.discovery.zoneId) continue;
    const slug = report?.region?.slug;
    if (typeof slug !== "string" || slug.trim().toUpperCase() !== plan.discovery.region) continue;
    const actors = report?.masterData?.actors;
    if (!Array.isArray(actors)) continue;
    const classOf = new Map(actors.map((actor) => [actor.id, actor.subType]));
    for (const fight of report.fights ?? []) {
      if (!Number.isInteger(fight.encounterID) || fight.encounterID <= 0) continue;
      if (!plan.discovery.difficulties.includes(fight.difficulty)) continue;
      const durationMs = fight.endTime - fight.startTime;
      if (!Number.isFinite(durationMs)) continue;
      const interval = provenIntervalOf(plan, report.startTime + fight.startTime);
      if (interval === null) continue;
      const players = fight.friendlyPlayers;
      const specs = fight.friendlySpecs;
      if (!Array.isArray(players) || !Array.isArray(specs) || players.length !== specs.length) continue;
      fights.push({
        reportCode: report.code,
        fightId: fight.id,
        durationMs,
        gameBuild: interval.gameBuild,
        roster: players.map((actorId, index) => ({
          actorId,
          className: classOf.get(actorId),
          specName: specs[index],
        })),
        key: discoveryOrderKey(plan, report.code, fight.id),
      });
    }
  }
  return fights.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
}

/** The specialization's subject on this fight: the lowest actor id stated once with its class and spec. */
function subjectOn(fight, specialization) {
  const window = specialization.evidenceWindow;
  if (fight.durationMs < window.minFightDurationMs) return null;
  if (window.kind === "WHOLE_FIGHT" && fight.durationMs > window.maxFightDurationMs) return null;
  const once = fight.roster.filter(
    (row, _index, all) => all.filter((other) => other.actorId === row.actorId).length === 1,
  );
  const matching = once
    .filter(
      (row) => row.className === specialization.wclClassName && row.specName === specialization.wclSpecName,
    )
    .map((row) => row.actorId)
    .sort((left, right) => left - right);
  return matching[0] ?? null;
}

/**
 * Walks listing pages in the plan's fixed sequence. `pages` is every page read so far, in that sequence.
 * Each specialization gets its first qualifying fight, then at most `maxGateRetriesPerSpecialization`
 * more from the pages already read, used only if the context gate refuses an earlier one.
 *
 * `needsAnotherPage` is true while a specialization has no candidate and the sequence has pages left. A
 * specialization still empty at the end is NO_CANDIDATE, and the listing is not widened.
 */
export function selectSubjects(plan, pages) {
  const rows = plan.specializations.map((specialization) => ({
    specId: specialization.specId,
    status: "NO_CANDIDATE",
    candidates: [],
  }));
  const limit = 1 + plan.discovery.maxGateRetriesPerSpecialization;
  for (const page of pages) {
    const fights = orderedFightsOf(plan, page);
    plan.specializations.forEach((specialization, index) => {
      const row = rows[index];
      for (const fight of fights) {
        if (row.candidates.length >= limit) break;
        const actorId = subjectOn(fight, specialization);
        if (actorId === null) continue;
        // Pages can overlap as uploads arrive. A repeat keeps its first place and takes no retry slot.
        const repeated = row.candidates.some(
          (candidate) => candidate.reportCode === fight.reportCode && candidate.fightId === fight.fightId,
        );
        if (repeated) continue;
        row.status = "SELECTED";
        row.candidates.push({
          reportCode: fight.reportCode,
          fightId: fight.fightId,
          actorId,
          gameBuild: fight.gameBuild,
          durationMs: fight.durationMs,
        });
      }
    });
  }
  return {
    rows,
    needsAnotherPage:
      rows.some((row) => row.status === "NO_CANDIDATE") &&
      pages.length < plan.discovery.listingSequence.length,
  };
}

/**
 * The fights to capture, in the frozen order: a fight appears when the first specialization selecting it
 * comes up. One capture serves every subject on the fight. WHOLE_FIGHT if any subject on it needs that.
 */
export function capturesOf(plan, selection) {
  const captures = [];
  plan.specializations.forEach((specialization, index) => {
    const candidate = selection.rows[index].candidates[0];
    if (candidate === undefined) return;
    let capture = captures.find(
      (row) => row.reportCode === candidate.reportCode && row.fightId === candidate.fightId,
    );
    if (capture === undefined) {
      capture = {
        reportCode: candidate.reportCode,
        fightId: candidate.fightId,
        windowKind: "FIRST_MS",
        includeResources: false,
        subjects: [],
      };
      captures.push(capture);
    }
    if (specialization.evidenceWindow.kind === "WHOLE_FIGHT") capture.windowKind = "WHOLE_FIGHT";
    capture.includeResources ||= specialization.includeResources;
    capture.subjects.push({ specId: specialization.specId, actorId: candidate.actorId });
  });
  return captures;
}

/** The hard ceiling on one capture's event pages. Reaching it is PARTIAL, never a replacement. */
export function pageCeilingOf(plan, windowKind) {
  return windowKind === "WHOLE_FIGHT" ? plan.limits.wholeFightPageCeiling : plan.limits.prefixPageCeiling;
}

/**
 * Whether a fight's capture may start with this many requests left: one context per subject on it, its
 * whole page ceiling and one revision check. Contexts come first, so the gate reads no event, and the
 * budget can never end a capture part way. The campaign stops before the request that would exceed the
 * cap, at the first capture in the frozen order that does not fit, and never skips ahead to one that does.
 */
export function mayStartCapture(plan, windowKind, requestsLeft, subjectCount) {
  return requestsLeft >= subjectCount + pageCeilingOf(plan, windowKind) + 1;
}

/** The worst case, counted as the grant counts. Recomputed so the stated total cannot drift. */
export function worstCaseRequests(plan) {
  const count = plan.specializations.length;
  const pages = plan.specializations.reduce(
    (sum, specialization) => sum + pageCeilingOf(plan, specialization.evidenceWindow.kind),
    0,
  );
  return (
    plan.requestBudget.tokenRequests +
    plan.discovery.listingSequence.length +
    count * (1 + plan.discovery.maxGateRetriesPerSpecialization) +
    pages +
    count
  );
}

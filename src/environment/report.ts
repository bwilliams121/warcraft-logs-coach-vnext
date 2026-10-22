/**
 * The INTERNAL environment report (M11-G3-4): a plain rendering of a
 * reconstructed environment, its publishability and the stat-reconciliation
 * revisit, for owner review.
 *
 * It renders structured state only and decides nothing. It carries no DPS of
 * any kind — no ceiling, no diagnostic simulation result, no loss estimate —
 * and no coaching.
 */

import type { Evidenced } from "../character-profile/profile.js";
import type { EnvironmentReconstructionResult } from "./model.js";
import type { EnvironmentPublishability } from "./publishability.js";
import type { StatReconciliationRevisit } from "./stat-reconciliation.js";

function show<T>(field: Evidenced<T>, value: (v: T) => string = (v) => String(v)): string {
  switch (field.state) {
    case "KNOWN":
      return value(field.value);
    case "KNOWN_NONE":
      return `none (observed: ${field.basis})`;
    case "MODEL_ASSUMPTION":
      return `${value(field.value)} [MODEL_ASSUMPTION ${field.assumption.id}@${String(field.assumption.version)}]`;
    case "NOT_APPLICABLE":
      return `n/a (${field.reason})`;
    case "USER_PROVIDED":
      return `${value(field.value)} [USER_PROVIDED ${field.provenance.reference}]`;
    default:
      return `UNKNOWN (${field.reason})`;
  }
}

const ms = (value: number): string => `${(value / 1000).toFixed(3)} s`;

export function renderEnvironmentReport(
  result: EnvironmentReconstructionResult,
  publishability: EnvironmentPublishability,
  environmentHash: string,
  stats: StatReconciliationRevisit | null,
): string {
  const env = result.environment;
  const lines: string[] = [];
  const add = (line = "") => lines.push(line);
  add(
    `# Environment reconstruction — ${result.provenance.subject.fightRef} actor ${String(result.provenance.subject.actorId)}`,
  );
  add();
  add(`- environment readiness: ${result.status} (independent of the character profile's readiness)`);
  add(
    `- publishability: ${publishability.status} under ${publishability.policy.id} (${String(publishability.policy.relativeDpsThreshold * 100)}%)`,
  );
  add(`- environment hash: ${environmentHash}`);
  add(
    `- duration: ${show(env.duration.interval, (i) => `${String(i.durationMs)} ms`)}; finality ${env.duration.finality}`,
  );
  add(`- fight-end knowledge: ${show(env.duration.fightEndKnowledge)}`);
  add(
    `- primary target: ${show(env.primaryTarget.identity, (t) => `actor ${String(t.actorId)} (game id ${String(t.gameId)}), WCL boss subtype — metadata only`)}`,
  );
  add(`  - presence: ${show(env.primaryTarget.availability)}`);
  if (env.primaryTarget.engagement !== null) {
    const span = env.primaryTarget.engagement;
    add(
      `  - observed engagement (not availability): ${ms(span.firstObservedMs)}–${ms(span.lastObservedMs)}, ${String(span.observationCount)} hits, largest gap ${ms(span.largestGapMs)}`,
    );
  }
  for (const disclosure of publishability.disclosures) add(`- disclosure: ${disclosure}`);
  add(
    `- tank load: ${env.tankLoad.model} v${String(env.tankLoad.version)} revision ${env.tankLoad.revision}; ${show(env.tankLoad.load)}`,
  );
  add();
  add("## Raid buffs");
  add();
  add("| override | side | presence |");
  add("| --- | --- | --- |");
  for (const entry of env.raidBuffs) {
    add(
      `| ${entry.override} | ${entry.side} | ${show(entry.presence, (p) => (p.kind === "WHOLE_FIGHT" ? `WHOLE_FIGHT (aura ${String(p.auraSpellId)}${p.refreshedAtMs.length > 0 ? `, refreshed at ${p.refreshedAtMs.map(ms).join(", ")}` : ""})` : `TIMED (${p.transitions.map((t) => `${t.operation}@${ms(t.atMs)}`).join(", ")})`))} |`,
    );
  }
  add();
  add("## Bloodlust");
  add();
  add(
    `- applications: ${show(env.bloodlust.applications, (apps) => apps.map((app) => `spell ${String(app.spellId)} ${app.equivalence}, ${show(app.startMs, ms)} → ${show(app.endMs, ms)}`).join("; "))}`,
  );
  add(
    `- lockouts observed: ${env.bloodlust.satedObservations.map((s) => `${String(s.spellId)}@${ms(s.atMs)}`).join(", ") || "none"}`,
  );
  add();
  add("## Consumables");
  add();
  for (const entry of env.consumables.setup) {
    add(
      `- ${entry.kind}: identity ${show(entry.identity, (i) => `spell ${String(i.spellId)} (items ${i.itemIds.join("/")})`)}; rank ${show(entry.rank, (r) => `item level ${String(r.itemLevel)}`)}${entry.rankOptions.length > 1 ? ` (envelope: ${entry.rankOptions.map((o) => `${String(o.itemLevel)}→${o.token}${o.representable ? "" : " [not representable]"}`).join(", ")})` : ""}; presence ${show(entry.presence)}${entry.unclassifiedCandidates.length > 0 ? `; unclassified subject pull auras ${entry.unclassifiedCandidates.join(", ")}` : ""}`,
    );
  }
  const potion = env.consumables.potion;
  add(
    `- POTION: identity ${show(potion.identity, (i) => `spell ${String(i.spellId)} (items ${i.itemIds.join("/")})`)}; rank ${show(potion.rank, (r) => `item level ${String(r.itemLevel)}`)}${potion.rankOptions.length > 1 ? ` (envelope: ${potion.rankOptions.map((o) => `${String(o.itemLevel)}→${o.token}`).join(", ")})` : ""}; timing ${potion.timingPolicy}; observed uses (evidence only) ${show(potion.uses, (uses) => uses.map((use) => `${show(use.activeFromMs, ms)}–${show(use.activeToMs, ms)}`).join(", "))}; casts at ${potion.castsAtMs.map(ms).join(", ") || "none"}`,
  );
  for (const entry of env.consumables.temporaryEnchants) {
    add(
      `- temporary enchant ${entry.slot}: ${show(entry.enchant, (e) => `${String(e.enchantId)} → ${e.engineToken ?? "(no engine token)"}`)}; persistence ${show(entry.persistence)}`,
    );
  }
  add();
  add("## Targets");
  add();
  for (const candidate of env.targetSchedule.candidates) {
    add(
      `- actor ${String(candidate.actorId)} (game id ${String(candidate.gameId)}): availability ${show(candidate.availability)}`,
    );
    if (candidate.engagement !== null) {
      add(
        `  - observed (not availability): ${candidate.observedClusters.map((c) => `${ms(c.firstObservedMs)}–${ms(c.lastObservedMs)} (${String(c.observationCount)})`).join(", ")}`,
      );
    }
    for (const audit of candidate.availabilityEvidence)
      add(`  - ${audit.source}: ${audit.status} — ${audit.detail}`);
  }
  add(`- schedule: ${show(env.targetSchedule.schedule, (s) => `${String(s.length)} additional targets`)}`);
  add();
  add("## Pull auras");
  add();
  add(
    env.pullAuras
      .map((aura) => `${String(aura.spellId)} ${aura.sourceRole} ${aura.classification}`)
      .join("; "),
  );
  add();
  add("## Checks");
  add();
  for (const entry of result.checks) add(`- ${entry.component}: ${entry.state} — ${entry.detail}`);
  add();
  add("## Publishability blockers");
  add();
  for (const blocker of publishability.blockers) add(`- ${blocker.code}: ${blocker.detail}`);
  add();
  add("## Materiality");
  add();
  for (const field of publishability.materiality)
    add(`- ${field.field}: ${field.classification} — ${field.rationale}`);
  add();
  add("## Diagnostics");
  add();
  for (const diagnostic of publishability.diagnostics) add(`- ${diagnostic.code}: ${diagnostic.detail}`);
  add();
  add("## Engine approximations");
  add();
  for (const approximation of result.provenance.engineApproximations) {
    add(
      `- ${approximation.id}: observed ${approximation.observed}; engine ${approximation.engine}; ${approximation.bound}`,
    );
  }
  add();
  add("## Assumptions");
  add();
  for (const assumption of result.assumptions)
    add(`- ${assumption.id}@${String(assumption.version)} (${assumption.approval}): ${assumption.statement}`);
  if (stats !== null) {
    add();
    add("## Stat reconciliation (revisited)");
    add();
    add(`- status: ${stats.status}; basis: ${stats.environmentBasis}`);
    add(
      `- semantic comparability: ${stats.semanticComparability.proven ? "proven" : `not proven (${stats.semanticComparability.reasons.join("; ")})`}`,
    );
    add(`- publication blocking: ${String(stats.publicationBlocking)}`);
    for (const field of stats.fields) {
      add(
        `- ${field.field}: WCL ${String(field.wcl)} vs engine ${String(field.engine)} → residual ${String(field.residual)}${field.reconciled ? " (reconciled)" : ""}`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

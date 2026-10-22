/**
 * The INTERNAL reconstruction report (M11-G3-2): a plain rendering of a
 * reconstructed profile and its fidelity result, for owner review.
 *
 * It renders structured state only — it decides nothing — and it contains no
 * DPS: a fidelity probe's simulated numbers are not player performance.
 */

import type { ProfileFidelityResult } from "./fidelity.js";
import type { CharacterProfile, Evidenced } from "./profile.js";

function show<T>(field: Evidenced<T>, value: (v: T) => string = (v) => String(v)): string {
  switch (field.state) {
    case "KNOWN":
      return value(field.value);
    case "KNOWN_NONE":
      return "none (observed)";
    case "MODEL_ASSUMPTION":
      return `${value(field.value)} [MODEL_ASSUMPTION ${field.assumption.id}@${String(field.assumption.version)}]`;
    case "NOT_APPLICABLE":
      return "n/a";
    case "USER_PROVIDED":
      return `${value(field.value)} [USER_PROVIDED ${field.provenance.reference}]`;
    default:
      return "UNKNOWN";
  }
}

export function renderReconstructionReport(
  profile: CharacterProfile,
  fidelity: ProfileFidelityResult | null,
  semanticHash: string,
): string {
  const lines: string[] = [];
  const add = (line = "") => lines.push(line);
  add(
    `# Character reconstruction — ${profile.evidence.subject.fightRef} actor ${String(profile.evidence.subject.actorId)}`,
  );
  add();
  add(`- reconstruction status: ${profile.reconstructionStatus}`);
  add(`- fidelity: ${fidelity === null ? "not run" : `${fidelity.status} (${fidelity.readiness})`}`);
  add(`- semantic profile hash: ${semanticHash}`);
  add(
    `- spec: ${profile.identity.specKey} (specID ${show(profile.identity.specId)}, class ${show(profile.identity.classId)})`,
  );
  add(`- level: ${show(profile.identity.level)}`);
  add(`- race: ${show(profile.identity.race)}`);
  const decode = profile.talents.decode;
  add(
    `- talent import: ${profile.talents.importCode.state}; decode ${decode.state}; vs WCL talent facts ${profile.talents.reconciliation.state}${profile.talents.reconciliation.state === "RECONCILED" ? ` (${String(profile.talents.reconciliation.entries)} entries)` : ""}`,
  );
  add(
    `- hero tree: ${show(profile.talents.heroTree, (tree) => `${tree.simcName} (sub-tree ${String(tree.subTreeId)})`)}`,
  );
  add();
  add("| slot | pos | item | ilvl | bonus ids | gems | enchant | temp enchant | crafted stats | set |");
  add("| --- | ---: | --- | ---: | --- | --- | --- | --- | --- | --- |");
  for (const record of profile.equipment) {
    add(
      `| ${record.slot} | ${String(record.wclPosition)} | ${record.occupancy === "EQUIPPED" ? show(record.itemId) : record.occupancy} | ${show(record.itemLevel)} | ${show(record.bonusIds, (ids) => ids.join("/"))} | ${show(record.gems, (ids) => ids.join("/"))} | ${show(record.permanentEnchant)} | ${show(record.temporaryEnchant, (e) => `${String(e.enchantId)} ${e.engineToken ?? "(no engine token)"}`)} | ${show(record.craftedStats)} | ${record.setId === null ? "" : String(record.setId)} |`,
    );
  }
  add();
  add("Consumables (setup evidence; applied by the environment in G3-4, not written here):");
  for (const fact of profile.setupFacts.consumables) {
    add(
      `- ${fact.kind}: ${show(fact.identity, (v) => `spell ${String(v.spellId)}, items ${v.itemIds.join("/")}`)} — ${fact.identity.state === "UNKNOWN" ? fact.identity.reason : fact.note}`,
    );
  }
  add();
  if (fidelity !== null) {
    add("Fidelity checks:");
    for (const [name, value] of Object.entries(fidelity.checks)) {
      if (name === "stats") continue;
      const checkValue = value as { state: string; details: readonly string[] };
      add(
        `- ${name}: ${checkValue.state}${checkValue.details.length > 0 ? ` — ${checkValue.details.join("; ")}` : ""}`,
      );
    }
    const stats = fidelity.checks.stats;
    add(`- stats: ${stats.state} — ${stats.reason}`);
    for (const residual of stats.residuals) {
      add(
        `  - ${residual.field}: WCL ${String(residual.wcl)} vs engine ${String(residual.engine)} (WCL − engine ${String(residual.wclMinusEngine)})`,
      );
    }
    add();
  }
  add("Blockers:");
  for (const blocker of fidelity?.blockers ?? profile.blockers.map((b) => `${b.code}: ${b.detail}`))
    add(`- ${blocker}`);
  add();
  add("Diagnostics:");
  for (const diagnostic of profile.diagnostics) add(`- ${diagnostic.code}: ${diagnostic.detail}`);
  add();
  add("Evidence:");
  for (const document of profile.evidence.documents)
    add(`- ${document.role} ${document.id} sha256 ${document.sha256}`);
  return `${lines.join("\n")}\n`;
}

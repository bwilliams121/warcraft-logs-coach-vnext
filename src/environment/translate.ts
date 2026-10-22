/**
 * SIMC TRANSLATION of a reconstructed environment (M11-G3-4): the one place a
 * reconstructed fact becomes the G3-1 `SimulationEnvironmentInput` (plus the
 * job's consumables block). It writes no engine text — the G3-1 input builder
 * still owns every directive.
 *
 * Two purposes, never interchangeable:
 *
 *   CURRENT_SETUP          every component must be established and
 *                          representable, and the environment must be
 *                          PUBLISHABLE. Provenance ACTUAL_OBSERVED.
 *   BOSS_ONLY_DIAGNOSTIC   proven facts only; every unresolved component is
 *                          left out and the omission recorded in the ledger
 *                          ("not written" is never a claim of absence). One
 *                          primary target, no additional target. Provenance
 *                          DIAGNOSTIC_RECONSTRUCTION. Not a ceiling of any
 *                          kind — never lower, conservative, current-setup or
 *                          attainable.
 *
 * What CURRENT_SETUP refuses (each a translation problem):
 *   an UNKNOWN raid buff unless proven inert at the pin (UNKNOWN -> absent is
 *   never written); a timed raid buff (the engine override is whole-fight);
 *   a lust that is unresolved, not effect-identical to the engine's, or not
 *   the only one; any setup consumable without an established identity, rank
 *   and engine token (no ideal or "best" substitution); observed potion uses
 *   (the built-in APL owns potion timing and the job has no schedule); an
 *   unestablished target schedule.
 */

import type { SimulationCharacterInput, SimulationEnvironmentInput } from "../simulation/job.js";
import { POTION_TIMING_ELITE_APL } from "./assumptions.js";
import type { FieldMateriality } from "./materiality.js";
import type { EnvironmentReconstructionResult, RaidBuffName } from "./model.js";
import type { EnvironmentPublishability } from "./publishability.js";
import { USER_STATED_NONE } from "./reconstruct.js";

export type TranslationPurpose = "CURRENT_SETUP" | "BOSS_ONLY_DIAGNOSTIC";

export type TranslationBasis =
  | "OBSERVED"
  | "OBSERVED_NONE"
  | "INERT_AT_PIN"
  | "ENGINE_WHOLE_SECOND"
  | "MODEL_ASSUMPTION"
  | "USER_PROVIDED"
  | "ACTUAL_SETUP_APL_TIMING"
  | "OMITTED_UNRESOLVED";

export interface TranslationEntry {
  readonly component: string;
  readonly written: string;
  readonly basis: TranslationBasis;
  readonly detail: string;
}

/**
 * One member of the rank-uncertainty envelope: a complete consumables block
 * with one plausible rank chosen per uncertain consumable. A consumer (G4) runs
 * every variant and reports the envelope; it never picks one, and never adds
 * per-field sensitivities.
 */
export interface ConsumableVariant {
  readonly id: string;
  /** The uncertain dimensions and the rank this variant takes for each. */
  readonly ranks: readonly {
    readonly slot: string;
    readonly itemLevel: number | null;
    readonly token: string;
  }[];
  readonly consumables: SimulationCharacterInput["consumables"];
}

export interface EnvironmentTranslation {
  readonly purpose: TranslationPurpose;
  readonly environment: SimulationEnvironmentInput;
  /** At least one; more than one exactly when a consumable's rank is UNKNOWN. */
  readonly consumableVariants: readonly ConsumableVariant[];
  readonly ledger: readonly TranslationEntry[];
}

export type TranslationOutcome =
  | { readonly ok: true; readonly translation: EnvironmentTranslation }
  | { readonly ok: false; readonly problems: readonly string[] };

/** Plans a translation without the publishability gate (publishability uses it to test feasibility). */
export function planTranslation(
  result: EnvironmentReconstructionResult,
  materiality: readonly FieldMateriality[],
  purpose: TranslationPurpose,
): TranslationOutcome {
  const env = result.environment;
  const diagnostic = purpose === "BOSS_ONLY_DIAGNOSTIC";
  const provenance = diagnostic ? "DIAGNOSTIC_RECONSTRUCTION" : "ACTUAL_OBSERVED";
  const problems: string[] = [];
  const ledger: TranslationEntry[] = [];
  const omit = (component: string, written: string, detail: string) =>
    ledger.push({
      component,
      written,
      basis: "OMITTED_UNRESOLVED",
      detail: `${detail}; not written — not a claim of absence`,
    });
  const refuse = (component: string, detail: string) => problems.push(`${component}: ${detail}`);

  // ---- duration ----
  const interval = env.duration.interval;
  if (interval.state !== "KNOWN" || env.duration.finality !== "COMPLETED") {
    return { ok: false, problems: ["duration: the exact completed fight interval is not established"] };
  }
  ledger.push({
    component: "duration",
    written: `FIXED_EXACT_OBSERVED ${String(interval.value.durationMs)} ms`,
    basis: "OBSERVED",
    detail: "fixed_time=1, exact max_time, vary_combat_length=0 (RETROSPECTIVE_EXACT_FIGHT_END@1)",
  });

  // ---- primary target ----
  if (env.primaryTarget.identity.state !== "KNOWN") refuse("primaryTarget", "no single boss-subtype actor");
  else
    ledger.push({
      component: "primaryTarget",
      written: "SINGLE_TARGET",
      basis: env.primaryTarget.availability.state === "KNOWN" ? "OBSERVED" : "MODEL_ASSUMPTION",
      detail: `availability ${env.primaryTarget.availability.state}`,
    });

  // ---- raid buffs ----
  const active: RaidBuffName[] = [];
  for (const entry of env.raidBuffs) {
    const presence = entry.presence;
    const component = `raidBuffs.${entry.override}`;
    if (presence.state === "KNOWN" && presence.value.kind === "WHOLE_FIGHT") {
      active.push(entry.override);
      ledger.push({
        component,
        written: "1",
        basis: "OBSERVED",
        detail: `aura ${String(presence.value.auraSpellId)} on the pull, never removed`,
      });
    } else if (presence.state === "KNOWN") {
      if (diagnostic) omit(component, "0", "timed presence: the engine override is whole-fight only");
      else refuse(component, "timed presence; the engine override is whole-fight only");
    } else if (presence.state === "KNOWN_NONE") {
      ledger.push({ component, written: "0", basis: "OBSERVED_NONE", detail: presence.basis });
    } else {
      const field = materiality.find((entry2) => entry2.field === `RAID_BUFF:${entry.override}`);
      if (field?.inert === true) {
        ledger.push({
          component,
          written: "0",
          basis: "INERT_AT_PIN",
          detail: `UNKNOWN, but ${field.rationale}`,
        });
      } else if (diagnostic) {
        omit(component, "0", "presence UNKNOWN");
      } else {
        refuse(component, "presence UNKNOWN and not proven inert: no approved representation");
      }
    }
  }

  // ---- Bloodlust ----
  let bloodlust: SimulationEnvironmentInput["bloodlust"] = { kind: "NONE", provenance };
  const apps = env.bloodlust.applications;
  if (apps.state === "KNOWN_NONE") {
    ledger.push({ component: "bloodlust", written: "NONE", basis: "OBSERVED_NONE", detail: apps.basis });
  } else if (apps.state === "KNOWN" && apps.value.length === 1) {
    const app = apps.value[0];
    if (
      app !== undefined &&
      app.equivalence === "ENGINE_BLOODLUST_EQUIVALENT" &&
      app.startMs.state === "KNOWN"
    ) {
      bloodlust = { kind: "AT", provenance, atMs: app.startMs.value };
      const effective = app.startMs.value === 0 ? 0 : Math.ceil(app.startMs.value / 1000) * 1000;
      ledger.push({
        component: "bloodlust",
        written: `AT ${String(app.startMs.value)} ms (spell ${String(app.spellId)})`,
        basis: effective === app.startMs.value ? "OBSERVED" : "ENGINE_WHOLE_SECOND",
        detail: `the engine fires it at ${String(effective)} ms (whole-second check); no default or second lust`,
      });
    } else if (diagnostic) {
      omit("bloodlust", "NONE", "lust not effect-identical to the engine's or start unknown");
    } else {
      refuse("bloodlust", "lust not effect-identical to the engine's or start unknown");
    }
  } else if (diagnostic) {
    omit(
      "bloodlust",
      "NONE",
      apps.state === "KNOWN" ? `${String(apps.value.length)} applications` : "presence/timing UNKNOWN",
    );
  } else {
    refuse(
      "bloodlust",
      apps.state === "KNOWN"
        ? `${String(apps.value.length)} applications; the engine applies one`
        : "presence/timing UNKNOWN",
    );
  }

  // ---- consumables ----
  // Each identified consumable contributes one DIMENSION: its plausible ranks
  // (one option when the rank is known or stated). The variants are the full
  // Cartesian product — the rank-uncertainty envelope — and no rank is chosen.
  type Slot = "flask" | "food" | "augmentation" | "potion";
  const dimensions: { slot: Slot; options: { itemLevel: number | null; token: string }[] }[] = [];
  const fixed: Record<Slot, string> = { flask: "NONE", food: "NONE", augmentation: "NONE", potion: "NONE" };
  const slotOf = { FLASK: "flask", FOOD: "food", AUGMENTATION: "augmentation" } as const;
  for (const entry of env.consumables.setup) {
    const slot = slotOf[entry.kind];
    const component = `consumables.${slot}`;
    const identity = entry.identity;
    if (identity.state === "KNOWN_NONE") {
      ledger.push({ component, written: "NONE", basis: "OBSERVED_NONE", detail: identity.basis });
      continue;
    }
    if (identity.state === "USER_PROVIDED" && identity.value.spellId === USER_STATED_NONE.spellId) {
      ledger.push({
        component,
        written: "NONE",
        basis: "USER_PROVIDED",
        detail: `the user stated none was used (${identity.provenance.reference})`,
      });
      continue;
    }
    const presenceOk = entry.presence.state === "KNOWN" || entry.presence.state === "USER_PROVIDED";
    const optionsOk =
      entry.rankOptions.length > 0 && entry.rankOptions.every((option) => option.representable);
    if ((identity.state === "KNOWN" || identity.state === "USER_PROVIDED") && presenceOk && optionsOk) {
      dimensions.push({
        slot,
        options: entry.rankOptions.map((option) => ({ itemLevel: option.itemLevel, token: option.token })),
      });
      ledger.push({
        component,
        written: entry.rankOptions.map((option) => option.token).join(" | "),
        basis: identity.state === "USER_PROVIDED" ? "USER_PROVIDED" : "OBSERVED",
        detail:
          entry.rankOptions.length > 1
            ? `spell ${String(identity.value.spellId)}; rank UNKNOWN: every plausible rank is a variant (envelope)`
            : `spell ${String(identity.value.spellId)}`,
      });
      continue;
    }
    const reason =
      identity.state !== "KNOWN" && identity.state !== "USER_PROVIDED"
        ? "identity UNKNOWN"
        : !presenceOk
          ? "whole-fight presence not established"
          : "a plausible rank has no unambiguous engine token";
    if (diagnostic) omit(component, "NONE", reason);
    else refuse(component, reason);
  }
  const potion = env.consumables.potion;
  if (potion.uses.state === "KNOWN_NONE") {
    ledger.push({
      component: "consumables.potion",
      written: "NONE",
      basis: "OBSERVED_NONE",
      detail: potion.uses.basis,
    });
  } else if (
    potion.identity.state === "KNOWN" &&
    potion.rankOptions.length > 0 &&
    potion.rankOptions.every((option) => option.representable)
  ) {
    dimensions.push({
      slot: "potion",
      options: potion.rankOptions.map((option) => ({ itemLevel: option.itemLevel, token: option.token })),
    });
    ledger.push({
      component: "consumables.potion",
      written: potion.rankOptions.map((option) => option.token).join(" | "),
      basis: "ACTUAL_SETUP_APL_TIMING",
      detail: `spell ${String(potion.identity.value.spellId)} was available (observed); timing is the elite APL's (${POTION_TIMING_ELITE_APL.id}); the observed uses are evidence, not replayed`,
    });
  } else {
    const reason =
      potion.identity.state === "KNOWN"
        ? "a plausible potion rank has no unambiguous engine token"
        : "potion availability UNKNOWN";
    if (diagnostic) omit("consumables.potion", "NONE", reason);
    else refuse("consumables.potion", reason);
  }
  const temporaryEnchants: { slot: "main_hand" | "off_hand"; enchant: string }[] = [];
  for (const entry of env.consumables.temporaryEnchants) {
    const component = `consumables.temporaryEnchant.${entry.slot}`;
    if (
      entry.enchant.state === "KNOWN" &&
      entry.enchant.value.engineToken !== null &&
      entry.persistence.state !== "UNKNOWN"
    ) {
      temporaryEnchants.push({ slot: entry.slot, enchant: entry.enchant.value.engineToken });
      ledger.push({
        component,
        written: entry.enchant.value.engineToken,
        basis: entry.persistence.state === "MODEL_ASSUMPTION" ? "MODEL_ASSUMPTION" : "OBSERVED",
        detail: `enchant ${String(entry.enchant.value.enchantId)} on the pull's gear; persistence ${entry.persistence.state}`,
      });
    } else if (diagnostic) {
      omit(component, "none", "temporary enchant or its persistence unresolved");
    } else {
      refuse(component, "temporary enchant or its persistence unresolved");
    }
  }
  const variants: ConsumableVariant[] = [];
  const walk = (index: number, chosen: { slot: Slot; itemLevel: number | null; token: string }[]) => {
    const dimension = dimensions[index];
    if (dimension === undefined) {
      const token = (slot: Slot) => chosen.find((choice) => choice.slot === slot)?.token ?? fixed[slot];
      variants.push({
        id: chosen.map((choice) => `${choice.slot}=${choice.token}`).join(",") || "single",
        ranks: chosen.filter(
          (choice) => (dimensions.find((d) => d.slot === choice.slot)?.options.length ?? 0) > 1,
        ),
        consumables: {
          provenance,
          potion: token("potion"),
          flask: token("flask"),
          food: token("food"),
          augmentation: token("augmentation"),
          temporaryEnchants,
        },
      });
      return;
    }
    for (const option of dimension.options) walk(index + 1, [...chosen, { slot: dimension.slot, ...option }]);
  };
  walk(0, []);

  // ---- targets ----
  const schedule = env.targetSchedule.schedule;
  if (diagnostic) {
    ledger.push({
      component: "targetSchedule",
      written: "BOSS_ONLY",
      basis: "OMITTED_UNRESOLVED",
      detail: `${String(env.targetSchedule.candidates.length)} engaged candidates left out: no availability interval is established; not a claim that none existed`,
    });
  } else if (!(schedule.state === "KNOWN" && schedule.value.length === 0)) {
    refuse(
      "targetSchedule",
      schedule.state === "KNOWN" ? "additional targets are not representable in the job" : "schedule UNKNOWN",
    );
  }

  ledger.push({
    component: "tankLoad",
    written: env.tankLoad.model,
    basis: "MODEL_ASSUMPTION",
    detail: `revision ${env.tankLoad.revision}`,
  });

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    translation: {
      purpose,
      environment: {
        durationPolicy: "FIXED_EXACT_OBSERVED",
        durationMs: interval.value.durationMs,
        primaryTarget: "SINGLE_TARGET",
        tankModel: env.tankLoad.model,
        raidBuffs: { provenance, active },
        bloodlust,
        additionalTargets: [],
      },
      consumableVariants: variants,
      ledger,
    },
  };
}

/**
 * The gate a caller goes through. CURRENT_SETUP requires a PUBLISHABLE
 * environment; BOSS_ONLY_DIAGNOSTIC is always a diagnostic and nothing else.
 */
export function translateEnvironment(
  result: EnvironmentReconstructionResult,
  publishability: EnvironmentPublishability,
  purpose: TranslationPurpose,
): TranslationOutcome {
  if (purpose === "CURRENT_SETUP" && publishability.status !== "PUBLISHABLE") {
    return {
      ok: false,
      problems: [
        `environment is ${publishability.status}: ${publishability.blockers.map((blocker) => blocker.code).join(", ")}`,
      ],
    };
  }
  return planTranslation(result, publishability.materiality, purpose);
}

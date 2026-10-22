/**
 * Blood Death Knight's ENVIRONMENT FACTS (M11-G3-4): how much each unresolved
 * environment field moves a Blood simulation at the pin. Spec knowledge
 * supplies the measurements; the shared materiality policy
 * (src/environment/materiality.ts) decides what they mean.
 *
 * Every number is reproduced exactly by scripts/bench/m11g34-environment.bench.ts
 * on the approved engine (binary 41347bc4…): the development Blood character
 * (whose gear and talents are the canonical subject's), ELITE_REALISTIC_V1, a
 * baseline carrying the subject's PROVEN environment (six whole-fight raid
 * buffs, Heroism at 471 ms, flask rank 2, the observed main-hand oil; no food,
 * rune or potion). Each variant changes one field. These are relative
 * changes, never published DPS. Multi-threaded STANDARD_SIM_V1 results merge
 * threads in a non-fixed order, so the bench reproduces them to 1e-9 (relative
 * change), and the single-threaded ones exactly.
 *
 * Raid-buff overrides: target debuffs measured on/off under STANDARD_SIM_V1;
 * player buffs measured off/on single-threaded. `identicalResult` comes from
 * the single-threaded (bit-reproducible) toggle of each override.
 *
 * Potion timing: the built-in Blood APL owns it (read from the committed APL
 * artifact), so an observed potion schedule cannot be expressed by the job.
 */

import type { EnvironmentSpecFacts } from "../../../environment/materiality.js";
import apl from "../../../simc/data/deathknight-blood.apl.json";

const STANDARD = "STANDARD_SIM_V1";
const SINGLE = "BENCHMARK_300_T1";

export const BLOOD_APL_POTION_LINES: readonly string[] = apl.lists.flatMap((list) =>
  list.actions.map((action) => action.actionStringVerbatim).filter((text) => /^potion(,|$)/.test(text)),
);

export const BLOOD_ENVIRONMENT_FACTS: EnvironmentSpecFacts = {
  specKey: "deathknight/blood",
  basis: {
    bench: "scripts/bench/m11g34-environment.bench.ts",
    character: "development Blood job (tests/support/simulation/dev-blood-job.ts)",
    executionProfile: "ELITE_REALISTIC_V1",
    baseline:
      "six whole-fight raid buffs, Heroism at 471 ms, flask_of_thalassian_resistance_2, main_hand thalassian_phoenix_oil_2; food, augmentation and potion disabled",
  },
  measurements: [
    {
      field: "RAID_BUFF:chaos_brand",
      comparison: "chaos_brand on vs off",
      relativeChange: 0.00916007555176801,
      identicalResult: false,
      coverage: "BOUNDS_ALL_PLAUSIBLE",
      simulationPolicy: STANDARD,
    },
    {
      field: "RAID_BUFF:mystic_touch",
      comparison: "mystic_touch on vs off",
      relativeChange: 0.03175706596325134,
      identicalResult: false,
      coverage: "BOUNDS_ALL_PLAUSIBLE",
      simulationPolicy: STANDARD,
    },
    {
      field: "RAID_BUFF:hunters_mark",
      comparison: "hunters_mark on vs off",
      relativeChange: 0.02932063525186357,
      identicalResult: false,
      coverage: "BOUNDS_ALL_PLAUSIBLE",
      simulationPolicy: STANDARD,
    },
    {
      field: "RAID_BUFF:mortal_wounds",
      comparison: "mortal_wounds on vs off",
      relativeChange: 1.1102230246251565e-15,
      identicalResult: true,
      coverage: "BOUNDS_ALL_PLAUSIBLE",
      simulationPolicy: STANDARD,
    },
    {
      field: "RAID_BUFF:bleeding",
      comparison: "bleeding on vs off",
      relativeChange: 1.1102230246251565e-15,
      identicalResult: true,
      coverage: "BOUNDS_ALL_PLAUSIBLE",
      simulationPolicy: STANDARD,
    },
    {
      field: "RAID_BUFF:arcane_intellect",
      comparison: "arcane_intellect off vs on",
      relativeChange: 0,
      identicalResult: true,
      coverage: "BOUNDS_ALL_PLAUSIBLE",
      simulationPolicy: SINGLE,
    },
    {
      field: "RAID_BUFF:battle_shout",
      comparison: "battle_shout off vs on",
      relativeChange: -0.044331262701098106,
      identicalResult: false,
      coverage: "BOUNDS_ALL_PLAUSIBLE",
      simulationPolicy: SINGLE,
    },
    {
      field: "RAID_BUFF:blessing_of_the_bronze",
      comparison: "blessing_of_the_bronze off vs on",
      relativeChange: 0,
      identicalResult: true,
      coverage: "BOUNDS_ALL_PLAUSIBLE",
      simulationPolicy: SINGLE,
    },
    {
      field: "RAID_BUFF:mark_of_the_wild",
      comparison: "mark_of_the_wild off vs on",
      relativeChange: -0.024202738370042942,
      identicalResult: false,
      coverage: "BOUNDS_ALL_PLAUSIBLE",
      simulationPolicy: SINGLE,
    },
    {
      field: "RAID_BUFF:power_word_fortitude",
      comparison: "power_word_fortitude off vs on",
      relativeChange: 0.0021835402678258564,
      identicalResult: false,
      coverage: "BOUNDS_ALL_PLAUSIBLE",
      simulationPolicy: SINGLE,
    },
    {
      field: "RAID_BUFF:skyfury",
      comparison: "skyfury off vs on",
      relativeChange: -0.03746968982952292,
      identicalResult: false,
      coverage: "BOUNDS_ALL_PLAUSIBLE",
      simulationPolicy: SINGLE,
    },
    {
      field: "FLASK_RANK",
      comparison: "flask rank 1 vs rank 2 (the only two ranks of the identified flask)",
      relativeChange: -0.0026937932067440107,
      identicalResult: false,
      coverage: "BOUNDS_ALL_PLAUSIBLE",
      simulationPolicy: STANDARD,
    },
    {
      field: "FLASK_PRESENCE",
      comparison: "no flask vs flask rank 2 (one example of an unknown flask)",
      relativeChange: -0.02850610544900256,
      identicalResult: false,
      coverage: "EXAMPLE_ONLY",
      simulationPolicy: STANDARD,
    },
    {
      field: "FOOD_PRESENCE",
      comparison: "silvermoon_parade vs no food (one example of an unknown food)",
      relativeChange: 0.011972595947835174,
      identicalResult: false,
      coverage: "EXAMPLE_ONLY",
      simulationPolicy: STANDARD,
    },
    {
      field: "AUGMENTATION_PRESENCE",
      comparison: "void_touched vs no rune (one example of an unknown rune)",
      relativeChange: 0.00533903278176262,
      identicalResult: false,
      coverage: "EXAMPLE_ONLY",
      simulationPolicy: STANDARD,
    },
    {
      field: "POTION_PRESENCE",
      comparison: "potion_of_recklessness_2 at APL timing vs no potion (one example)",
      relativeChange: 0.056980264920309276,
      identicalResult: false,
      coverage: "EXAMPLE_ONLY",
      simulationPolicy: STANDARD,
    },
    {
      field: "POTION_RANK",
      comparison: "potion rank 1 vs rank 2, both at APL timing (the only two ranks)",
      relativeChange: -0.0023067525658829746,
      identicalResult: false,
      coverage: "BOUNDS_ALL_PLAUSIBLE",
      simulationPolicy: STANDARD,
    },
    {
      field: "BLOODLUST_WHOLE_SECOND",
      comparison: "lust at 0 s vs at 471 ms (engine 1 s): spans the whole-second offset",
      relativeChange: 0.0007009178268604366,
      identicalResult: false,
      coverage: "BOUNDS_ALL_PLAUSIBLE",
      simulationPolicy: STANDARD,
    },
    {
      field: "BLOODLUST_PRESENCE",
      comparison: "no lust vs lust at 471 ms",
      relativeChange: -0.04104542175970072,
      identicalResult: false,
      coverage: "BOUNDS_ALL_PLAUSIBLE",
      simulationPolicy: STANDARD,
    },
  ],
  disclosures: [
    "Standardized incoming tank damage used for offensive Blood DK simulation; does not reconstruct encounter-specific incoming damage.",
  ],
  potionTiming: { owner: "BUILT_IN_APL", aplLines: BLOOD_APL_POTION_LINES },
};

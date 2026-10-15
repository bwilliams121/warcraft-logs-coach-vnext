/**
 * The typed SIMULATION JOB (M11-G3-1): `simulation-job/1`.
 *
 * The caller sends STRUCTURED DATA — enums, validated identifiers and bounded
 * integers. It never sends SimulationCraft text: there is no field that can
 * carry a directive, a path, an include, a `$(variable)`, APL text, raid
 * events, an output destination, a network source, a profileset or an
 * override. The input builder (runner-owned) writes every directive.
 *
 * Every object is STRICT (unknown keys are rejected), so a smuggled
 * `actions`, `input` or `json2` key is a JOB_REJECTED, not an ignored field.
 *
 * Nothing defaults. Consumables, raid buffs and Bloodlust are explicit
 * observed (or development-fixture) values — there is no "assume ideal"
 * setting. G3-1 accepts only DEVELOPMENT_FIXTURE character data; WCL
 * reconstruction is G3-2.
 */

import { z } from "zod";

import { fail, succeed, type SimulationOutcome } from "./failures.js";
import { bindingForSpec, type SimulationSpecBinding } from "./spec-binding.js";

export const SIMULATION_JOB_SCHEMA_VERSION = "simulation-job/1";

/** Hard request limits. A violation is JOB_REJECTED, never an engine crash. */
export const JOB_LIMITS = {
  maxPayloadBytes: 256 * 1024,
  maxIterations: 20_000,
  maxThreads: 16,
  maxTimeoutMs: 60_000,
  minDurationMs: 10_000,
  maxDurationMs: 1_200_000,
  maxGearIds: 16,
} as const;

/** The pinned engine's slot tokens, in WCL's positional combatantinfo order. */
export const GEAR_SLOTS = [
  "head",
  "neck",
  "shoulders",
  "shirt",
  "chest",
  "waist",
  "legs",
  "feet",
  "wrists",
  "hands",
  "finger1",
  "finger2",
  "trinket1",
  "trinket2",
  "back",
  "main_hand",
  "off_hand",
  "tabard",
] as const;

/** Playable race tokens at the pin (engine util::race_type_string). No default: G3-2 resolves race. */
export const PLAYABLE_RACES = [
  "blood_elf",
  "dark_iron_dwarf",
  "dracthyr_alliance",
  "dracthyr_horde",
  "draenei",
  "dwarf",
  "earthen_alliance",
  "earthen_horde",
  "gnome",
  "goblin",
  "haranir_alliance",
  "haranir_horde",
  "highmountain_tauren",
  "human",
  "kul_tiran",
  "lightforged_draenei",
  "maghar_orc",
  "mechagnome",
  "night_elf",
  "nightborne",
  "orc",
  "pandaren_alliance",
  "pandaren_horde",
  "tauren",
  "troll",
  "undead",
  "void_elf",
  "vulpera",
  "worgen",
  "zandalari_troll",
] as const;

/** Player raid buffs and target debuffs the pinned engine can toggle (sim.cpp use_optimal_buffs_and_debuffs). */
export const RAID_BUFFS = [
  "arcane_intellect",
  "battle_shout",
  "blessing_of_the_bronze",
  "mark_of_the_wild",
  "power_word_fortitude",
  "skyfury",
  "chaos_brand",
  "mystic_touch",
  "hunters_mark",
  "mortal_wounds",
  "bleeding",
] as const;

export const TANK_MODELS = ["STANDARD_TANK_LOAD_V1"] as const;

/** A SimC item/consumable name: lowercase letters, digits and underscores only. */
const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const gameId = z.number().int().min(1).max(10_000_000);
/**
 * FIDELITY_CONTROL (M11-G3-2): deliberately disabled for a profile-fidelity
 * round trip. Allowed only on a LOGGED_FIDELITY_PROBE, and only as "nothing":
 * no consumable, no raid buff, no Bloodlust.
 */
const provenance = z.enum(["ACTUAL_OBSERVED", "DEVELOPMENT_FIXTURE", "FIDELITY_CONTROL"]);

/**
 * DEVELOPMENT_FIXTURE: test/benchmark data. LOGGED_RECONSTRUCTION: a character
 * reconstructed from a logged fight (M11-G3-2). LOGGED_FIDELITY_PROBE: the same
 * reconstruction run only to read the engine echo back — never a ceiling, and
 * the only kind that may state race "none" while race is unresolved.
 */
export const PROFILE_KINDS = [
  "DEVELOPMENT_FIXTURE",
  "LOGGED_RECONSTRUCTION",
  "LOGGED_FIDELITY_PROBE",
] as const;

const enchant = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("KNOWN"), enchantId: gameId }).strict(),
  z.object({ kind: z.literal("KNOWN_NONE") }).strict(),
]);

const gems = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("KNOWN"), gemIds: z.array(gameId).min(1).max(4) }).strict(),
  z.object({ kind: z.literal("KNOWN_NONE") }).strict(),
]);

const gearSlot = z
  .object({
    slot: z.enum(GEAR_SLOTS),
    itemId: gameId,
    bonusIds: z.array(gameId).max(JOB_LIMITS.maxGearIds),
    gems,
    enchant,
  })
  .strict();

const consumable = z.union([identifier, z.literal("NONE")]);

const characterInput = z
  .object({
    profileKind: z.enum(PROFILE_KINDS),
    spec: z.string().regex(/^[a-z]{1,32}\/[a-z_]{1,32}$/),
    level: z.number().int().min(80).max(90),
    race: z.union([z.enum(PLAYABLE_RACES), z.literal("none")]),
    talents: z.object({ importString: z.string().regex(/^[A-Za-z0-9+/]{20,256}$/) }).strict(),
    gear: z.array(gearSlot).min(1).max(GEAR_SLOTS.length),
    consumables: z
      .object({
        provenance,
        potion: consumable,
        flask: consumable,
        food: consumable,
        augmentation: consumable,
        temporaryEnchants: z
          .array(z.object({ slot: z.enum(["main_hand", "off_hand"]), enchant: identifier }).strict())
          .max(2),
      })
      .strict(),
  })
  .strict();

const environmentInput = z
  .object({
    durationPolicy: z.literal("FIXED_EXACT_OBSERVED"),
    durationMs: z.number().int().min(JOB_LIMITS.minDurationMs).max(JOB_LIMITS.maxDurationMs),
    primaryTarget: z.literal("SINGLE_TARGET"),
    tankModel: z.enum(TANK_MODELS),
    raidBuffs: z.object({ provenance, active: z.array(z.enum(RAID_BUFFS)).max(RAID_BUFFS.length) }).strict(),
    bloodlust: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("NONE"), provenance }).strict(),
      z.object({ kind: z.literal("AT"), provenance, atMs: z.number().int().min(0) }).strict(),
    ]),
    /**
     * SIMULATED_TARGET_AVAILABLE_INTERVALs. G3-1 has no approved evidence
     * contract for an add's availability (G3-4 owns it), so this must be
     * empty: an OBSERVED_ENGAGEMENT_SPAN (first/last hit) is never accepted
     * as availability.
     */
    additionalTargets: z.array(z.never()).max(0),
  })
  .strict();

const jobSchema = z
  .object({
    schemaVersion: z.literal(SIMULATION_JOB_SCHEMA_VERSION),
    model: z.object({ simcCommit: z.string().regex(/^[0-9a-f]{40}$/), gameDataBuild: z.string() }).strict(),
    character: characterInput,
    environment: environmentInput,
    executionProfileId: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
    simulationPolicy: z
      .object({
        policyId: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
        iterations: z.number().int().min(1).max(JOB_LIMITS.maxIterations),
        seed: z
          .number()
          .int()
          .min(1)
          .max(2 ** 31),
        threads: z.number().int().min(1).max(JOB_LIMITS.maxThreads),
        deterministic: z.literal(true),
        timeoutMs: z.number().int().min(1).max(JOB_LIMITS.maxTimeoutMs),
      })
      .strict(),
    requestedOutputs: z.object({ actionBreakdown: z.boolean(), petBreakdown: z.boolean() }).strict(),
  })
  .strict();

export type SimulationJob = z.infer<typeof jobSchema>;
export type SimulationCharacterInput = SimulationJob["character"];
export type SimulationEnvironmentInput = SimulationJob["environment"];

export interface ValidatedSimulationJob {
  readonly job: SimulationJob;
  readonly binding: SimulationSpecBinding;
}

/**
 * Validates an untrusted job. `rawByteLength` is the size of the request body
 * as received; the limit is checked before anything else. `bindings` are the
 * specializations this runner was composed with; any other spec is
 * UNSUPPORTED_SPEC.
 */
export function validateSimulationJob(
  value: unknown,
  rawByteLength: number,
  bindings: readonly SimulationSpecBinding[],
): SimulationOutcome<ValidatedSimulationJob> {
  if (!Number.isSafeInteger(rawByteLength) || rawByteLength > JOB_LIMITS.maxPayloadBytes) {
    return fail(
      "JOB_REJECTED",
      `payload: ${String(rawByteLength)} bytes exceeds ${String(JOB_LIMITS.maxPayloadBytes)}`,
    );
  }
  const parsed = jobSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail("JOB_REJECTED", `${issue?.path.join(".") ?? "(root)"}: ${issue?.code ?? "invalid"}`);
  }
  const job = parsed.data;
  const binding = bindingForSpec(bindings, job.character.spec);
  if (binding === undefined) return fail("UNSUPPORTED_SPEC", `spec: ${job.character.spec}`);
  if (!binding.requiresTankModel) {
    return fail(
      "ENVIRONMENT_NOT_REPRESENTABLE",
      "environment: G3-1 has only the standardized tank-load target model",
    );
  }
  const probe = job.character.profileKind === "LOGGED_FIDELITY_PROBE";
  if (job.character.race === "none" && !probe) {
    return fail("JOB_REJECTED", "character.race: none is allowed only for a LOGGED_FIDELITY_PROBE");
  }
  const consumables = job.character.consumables;
  const controlled = [
    consumables.provenance,
    job.environment.raidBuffs.provenance,
    job.environment.bloodlust.provenance,
  ].map((value) => value === "FIDELITY_CONTROL");
  if (probe && !controlled.every(Boolean)) {
    return fail("JOB_REJECTED", "a LOGGED_FIDELITY_PROBE must control consumables, raid buffs and Bloodlust");
  }
  if (!probe && controlled.some(Boolean)) {
    return fail("JOB_REJECTED", "FIDELITY_CONTROL is allowed only for a LOGGED_FIDELITY_PROBE");
  }
  if (
    probe &&
    ([consumables.potion, consumables.flask, consumables.food, consumables.augmentation].some(
      (c) => c !== "NONE",
    ) ||
      consumables.temporaryEnchants.length > 0 ||
      job.environment.raidBuffs.active.length > 0 ||
      job.environment.bloodlust.kind !== "NONE")
  ) {
    return fail("JOB_REJECTED", "FIDELITY_CONTROL means nothing: no consumable, raid buff or Bloodlust");
  }
  const slots = job.character.gear.map((entry) => entry.slot);
  if (new Set(slots).size !== slots.length) return fail("JOB_REJECTED", "character.gear: duplicate slot");
  const buffs = job.environment.raidBuffs.active;
  if (new Set(buffs).size !== buffs.length)
    return fail("JOB_REJECTED", "environment.raidBuffs.active: duplicate buff");
  const lust = job.environment.bloodlust;
  if (lust.kind === "AT" && lust.atMs >= job.environment.durationMs) {
    return fail("JOB_REJECTED", "environment.bloodlust.atMs: not inside the fight");
  }
  return succeed({ job, binding });
}

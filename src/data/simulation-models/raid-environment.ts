/**
 * RAID-ENVIRONMENT identities of ONE simulation model (M11-G3-4; per model
 * since the M11 model registry), machine-extracted from that model's spell
 * data by scripts/authority/extract-simc-raid-environment.mjs.
 *
 * - LUST FAMILY: a logged lust spell is EQUIVALENT to the engine's own
 *   Bloodlust (2825) only when its duration and every aura-effect row are
 *   identical in that model's data. Equivalence is never decided by name.
 * - SATED FAMILY: the lockout debuffs the model's data carries.
 * - RAID-BUFF OVERRIDES: each engine `override.<name>`, its side (player aura
 *   or target debuff) and the aura spell ids that show it.
 * - DEFENSIVE ALLY AURAS (owner decision, M11-G3-4): ally auras the environment
 *   may exclude under STANDARD_TANK_LOAD_V1, each with every effect row.
 * - SPELL PRESENCE AUDIT: whether audited spell ids exist in the model's data.
 *
 * A spell absent from a table is UNKNOWN to that model — never "not a lust"
 * or "not a raid buff".
 */

import { z } from "zod";

export const raidEnvironmentSchema = z.object({
  artifactVersion: z.literal(1),
  datasetId: z.literal("SIMC_RAID_ENVIRONMENT"),
  artifactRevision: z.string(),
  provenance: z.object({
    commitSha: z.string().regex(/^[0-9a-f]{40}$/),
    clientDataWowVersion: z.string(),
    sources: z.array(z.object({ path: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/) })).min(1),
  }),
  engineBloodlust: z.object({ spellId: z.literal(2825), durationMs: z.number().int().positive() }),
  lustFamily: z.array(
    z.object({
      spellId: z.number().int().positive(),
      name: z.string().optional(),
      inPinnedData: z.boolean(),
      durationMs: z.number().int().optional(),
      equivalentToEngineBloodlust: z.boolean(),
    }),
  ),
  satedFamily: z.array(
    z.object({
      spellId: z.number().int().positive(),
      name: z.string().optional(),
      inPinnedData: z.boolean(),
      durationMs: z.number().int().optional(),
    }),
  ),
  raidBuffOverrides: z.array(
    z.object({
      override: z.string().regex(/^[a-z_]+$/),
      spellId: z.number().int().positive().nullable(),
      side: z.enum(["PLAYER_AURA", "TARGET_DEBUFF"]),
      citation: z.string(),
      name: z.string().nullable(),
      auraSpellIds: z.array(z.number().int().positive()),
    }),
  ),
  defensiveAllyAuras: z.array(
    z.object({
      spellId: z.number().int().positive(),
      name: z.string(),
      effects: z
        .array(
          z.object({
            spellId: z.number().int().positive(),
            effectIndex: z.number().int().nonnegative(),
            type: z.number().int(),
            subtype: z.number().int(),
            subtypeName: z.enum([
              "MOD_DAMAGE_PERCENT_TAKEN",
              "SCHOOL_ABSORB",
              "DUMMY",
              "LINKED_SPELL_WITH_VALUE",
            ]),
            baseValue: z.number(),
            triggerSpellId: z.number().int().nonnegative(),
          }),
        )
        .min(1),
    }),
  ),
  spellPresenceAudit: z.array(
    z.object({
      spellId: z.number().int().positive(),
      inPinnedData: z.boolean(),
      name: z.string().nullable(),
    }),
  ),
});

export type PinnedRaidEnvironment = z.infer<typeof raidEnvironmentSchema>;
export type LustFamilyMember = PinnedRaidEnvironment["lustFamily"][number];
export type RaidBuffOverrideIdentity = PinnedRaidEnvironment["raidBuffOverrides"][number];
export type DefensiveAllyAura = PinnedRaidEnvironment["defensiveAllyAuras"][number];

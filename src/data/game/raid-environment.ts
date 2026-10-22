/**
 * Pinned RAID-ENVIRONMENT identities (M11-G3-4), machine-extracted from the
 * pinned SimulationCraft spell data by
 * scripts/authority/extract-simc-raid-environment.mjs.
 *
 * - LUST FAMILY: a logged lust spell is EQUIVALENT to the engine's own
 *   Bloodlust (2825) only when its duration and every aura-effect row are
 *   identical at the pin. Equivalence is never decided by name.
 * - SATED FAMILY: the lockout debuffs the pinned data carries.
 * - RAID-BUFF OVERRIDES: each engine `override.<name>`, its side (player aura
 *   or target debuff) and the aura spell ids that show it.
 * - DEFENSIVE ALLY AURAS (owner decision, M11-G3-4): ally auras the environment
 *   may exclude under STANDARD_TANK_LOAD_V1, each with every effect row; the
 *   extractor fails unless every row is a defensive aura effect.
 * - SPELL PRESENCE AUDIT: whether audited spell ids exist in the pinned data.
 *
 * A spell absent from a table is UNKNOWN to the pinned model — never "not a
 * lust" or "not a raid buff".
 */

import { z } from "zod";

import artifact from "./raid-environment.json";

const schema = z.object({
  artifactVersion: z.literal(1),
  datasetId: z.literal("SIMC_RAID_ENVIRONMENT"),
  artifactRevision: z.string(),
  provenance: z.object({
    commitSha: z.literal("33622e9d1662ff0e451691edf85a6b49cc9d11d9"),
    clientDataWowVersion: z.literal("12.1.0.69587"),
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

export type PinnedRaidEnvironment = z.infer<typeof schema>;
export type LustFamilyMember = PinnedRaidEnvironment["lustFamily"][number];
export type RaidBuffOverrideIdentity = PinnedRaidEnvironment["raidBuffOverrides"][number];

export type RaidEnvironmentLoad =
  | { readonly ok: true; readonly data: PinnedRaidEnvironment }
  | { readonly ok: false; readonly detail: string };

let cached: RaidEnvironmentLoad | null = null;

export function pinnedRaidEnvironment(): RaidEnvironmentLoad {
  if (cached !== null) return cached;
  const parsed = schema.safeParse(artifact);
  cached = parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, detail: parsed.error.issues[0]?.message ?? "invalid raid-environment artifact" };
  return cached;
}

/** The pinned lust-family entry for a spell, or null when the pinned family does not list it. */
export function lustFamilyMember(spellId: number): LustFamilyMember | null {
  const loaded = pinnedRaidEnvironment();
  return loaded.ok ? (loaded.data.lustFamily.find((entry) => entry.spellId === spellId) ?? null) : null;
}

export function isSatedSpell(spellId: number): boolean {
  const loaded = pinnedRaidEnvironment();
  return (
    loaded.ok && loaded.data.satedFamily.some((entry) => entry.spellId === spellId && entry.inPinnedData)
  );
}

/** The pinned defensive-ally-aura entry for a spell, or null when it is not on the owner-approved list. */
export function defensiveAllyAura(
  spellId: number,
): PinnedRaidEnvironment["defensiveAllyAuras"][number] | null {
  const loaded = pinnedRaidEnvironment();
  return loaded.ok
    ? (loaded.data.defensiveAllyAuras.find((entry) => entry.spellId === spellId) ?? null)
    : null;
}

/** Whether the pinned spell data contains an AUDITED spell: true / false, or null when it was not audited. */
export function pinnedSpellPresence(spellId: number): boolean | null {
  const loaded = pinnedRaidEnvironment();
  if (!loaded.ok) return null;
  return loaded.data.spellPresenceAudit.find((entry) => entry.spellId === spellId)?.inPinnedData ?? null;
}

/** The engine override whose aura this spell is, or null. */
export function raidBuffOverrideForAura(spellId: number): RaidBuffOverrideIdentity | null {
  const loaded = pinnedRaidEnvironment();
  return loaded.ok
    ? (loaded.data.raidBuffOverrides.find((entry) => entry.auraSpellIds.includes(spellId)) ?? null)
    : null;
}

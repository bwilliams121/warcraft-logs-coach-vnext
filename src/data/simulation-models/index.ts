/**
 * SIMULATION-MODEL DATA (M11 model registry): the pinned, simulation-facing
 * data each registered simulation model owns — consumable identities, the
 * engine's consumable-token acceptance, and raid-environment identities —
 * one bundle per model, each extracted from (or measured on) THAT model.
 *
 * This is simulation-model data, NOT analyzer authority: no public analyzer
 * reads it, and it never reads analyzer authority. A caller names the model
 * (`simulationModelData(modelId)`); there is no default bundle, and nothing
 * here answers for a model it has no bundle for.
 *
 * Every bundle is validated on load: each artifact's provenance must name the
 * bundle's own commit and game-data build, the token acceptance must have been
 * measured on the bundle's binary against the bundle's consumables revision.
 * tests/contracts/m11-simulation-model-registry.test.ts keeps every bundle
 * manifest equal to the simulation-model registry.
 */

import {
  consumablesSchema,
  type ConsumableAura,
  type PinnedConsumables,
  type TemporaryEnchantIdentity,
} from "./consumables.js";
import {
  raidEnvironmentSchema,
  type DefensiveAllyAura,
  type LustFamilyMember,
  type PinnedRaidEnvironment,
  type RaidBuffOverrideIdentity,
} from "./raid-environment.js";
import { tokenAcceptanceSchema, type ConsumableTokenAcceptance } from "./token-acceptance.js";

import manifest33622e9d from "./simc-33622e9d/model.json";
import consumables33622e9d from "./simc-33622e9d/consumables.json";
import tokens33622e9d from "./simc-33622e9d/consumable-token-acceptance.json";
import raid33622e9d from "./simc-33622e9d/raid-environment.json";
import manifest0a72e6a7 from "./simc-0a72e6a7/model.json";
import consumables0a72e6a7 from "./simc-0a72e6a7/consumables.json";
import tokens0a72e6a7 from "./simc-0a72e6a7/consumable-token-acceptance.json";
import raid0a72e6a7 from "./simc-0a72e6a7/raid-environment.json";

export type { ConsumableAura, PinnedConsumables, TemporaryEnchantIdentity } from "./consumables.js";
export type {
  DefensiveAllyAura,
  LustFamilyMember,
  PinnedRaidEnvironment,
  RaidBuffOverrideIdentity,
} from "./raid-environment.js";
export type { ConsumableTokenAcceptance } from "./token-acceptance.js";

/**
 * One revision change to a bundle artifact. A correction never rewrites an
 * artifact under its old revision: the bytes change, the revision moves, and
 * the change is recorded here. `semanticContentChanged: false` means only
 * provenance moved (verified by regeneration from the same hashed sources).
 */
export interface SimulationModelDataHistoryEntry {
  readonly date: string;
  readonly datasetId: string;
  readonly fromRevision: string;
  readonly toRevision: string;
  readonly kind: "PROVENANCE_METADATA_CORRECTION";
  readonly semanticContentChanged: boolean;
  readonly note: string;
}

export interface SimulationModelManifest {
  readonly manifestVersion: 2;
  readonly modelId: string;
  readonly simcCommit: string;
  readonly gameDataBuild: string;
  readonly binarySha256: string;
  readonly hotfixDate: string;
  readonly snapshotCommittedAtUtc: string;
  readonly dataHistory: readonly SimulationModelDataHistoryEntry[];
}

/** One simulation model's pinned simulation-facing data. Plain data (cloneable); look up with the functions below. */
export interface SimulationModelData {
  readonly manifest: SimulationModelManifest;
  readonly consumables: PinnedConsumables;
  readonly tokenAcceptance: ConsumableTokenAcceptance;
  readonly raidEnvironment: PinnedRaidEnvironment;
  readonly revisions: readonly { readonly datasetId: string; readonly revision: string }[];
}

export const consumableAuraFor = (data: SimulationModelData, spellId: number): ConsumableAura | null =>
  data.consumables.consumableAuras.find((aura) => aura.spellId === spellId) ?? null;

export const temporaryEnchantFor = (
  data: SimulationModelData,
  enchantId: number,
): TemporaryEnchantIdentity | null =>
  data.consumables.temporaryEnchants.find((entry) => entry.enchantId === enchantId) ?? null;

/** True only when this model's engine accepted the token for this consumable aura. */
export const engineAcceptsToken = (data: SimulationModelData, spellId: number, token: string): boolean =>
  data.tokenAcceptance.tokens.some(
    (entry) => entry.spellId === spellId && entry.token === token && entry.accepted,
  );

export const lustFamilyMember = (data: SimulationModelData, spellId: number): LustFamilyMember | null =>
  data.raidEnvironment.lustFamily.find((entry) => entry.spellId === spellId) ?? null;

export const isSatedSpell = (data: SimulationModelData, spellId: number): boolean =>
  data.raidEnvironment.satedFamily.some((entry) => entry.spellId === spellId && entry.inPinnedData);

export const defensiveAllyAura = (data: SimulationModelData, spellId: number): DefensiveAllyAura | null =>
  data.raidEnvironment.defensiveAllyAuras.find((entry) => entry.spellId === spellId) ?? null;

/** Whether this model's spell data contains an AUDITED spell: true / false, or null when not audited. */
export const spellPresence = (data: SimulationModelData, spellId: number): boolean | null =>
  data.raidEnvironment.spellPresenceAudit.find((entry) => entry.spellId === spellId)?.inPinnedData ?? null;

export const raidBuffOverrideForAura = (
  data: SimulationModelData,
  spellId: number,
): RaidBuffOverrideIdentity | null =>
  data.raidEnvironment.raidBuffOverrides.find((entry) => entry.auraSpellIds.includes(spellId)) ?? null;

export type SimulationModelDataLoad =
  { readonly ok: true; readonly data: SimulationModelData } | { readonly ok: false; readonly detail: string };

export interface RawSimulationModelBundle {
  readonly manifest: unknown;
  readonly consumables: unknown;
  readonly tokens: unknown;
  readonly raid: unknown;
}

const RAW_BUNDLES: readonly RawSimulationModelBundle[] = [
  {
    manifest: manifest33622e9d,
    consumables: consumables33622e9d,
    tokens: tokens33622e9d,
    raid: raid33622e9d,
  },
  {
    manifest: manifest0a72e6a7,
    consumables: consumables0a72e6a7,
    tokens: tokens0a72e6a7,
    raid: raid0a72e6a7,
  },
];

function parseManifest(value: unknown): SimulationModelManifest | null {
  const m = value as Partial<SimulationModelManifest> | null;
  if (
    m === null ||
    typeof m !== "object" ||
    m.manifestVersion !== 2 ||
    typeof m.modelId !== "string" ||
    typeof m.simcCommit !== "string" ||
    !/^[0-9a-f]{40}$/.test(m.simcCommit) ||
    typeof m.gameDataBuild !== "string" ||
    typeof m.binarySha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(m.binarySha256) ||
    typeof m.hotfixDate !== "string" ||
    typeof m.snapshotCommittedAtUtc !== "string" ||
    !Array.isArray(m.dataHistory) ||
    !m.dataHistory.every(
      (entry: Partial<SimulationModelDataHistoryEntry> | null) =>
        entry !== null &&
        typeof entry === "object" &&
        typeof entry.date === "string" &&
        typeof entry.datasetId === "string" &&
        typeof entry.fromRevision === "string" &&
        typeof entry.toRevision === "string" &&
        entry.fromRevision !== entry.toRevision &&
        entry.kind === "PROVENANCE_METADATA_CORRECTION" &&
        typeof entry.semanticContentChanged === "boolean" &&
        typeof entry.note === "string",
    )
  ) {
    return null;
  }
  return m as SimulationModelManifest;
}

/** Validates one raw bundle (exported for tests); production reads only `simulationModelData`. */
export function loadSimulationModelBundle(raw: RawSimulationModelBundle): SimulationModelDataLoad {
  const manifest = parseManifest(raw.manifest);
  if (manifest === null) return { ok: false, detail: "invalid simulation-model data manifest" };
  const consumables = consumablesSchema.safeParse(raw.consumables);
  if (!consumables.success) return { ok: false, detail: `${manifest.modelId}: invalid consumables artifact` };
  const tokens = tokenAcceptanceSchema.safeParse(raw.tokens);
  if (!tokens.success) return { ok: false, detail: `${manifest.modelId}: invalid token-acceptance artifact` };
  const raid = raidEnvironmentSchema.safeParse(raw.raid);
  if (!raid.success) return { ok: false, detail: `${manifest.modelId}: invalid raid-environment artifact` };
  for (const [name, provenance] of [
    ["consumables", consumables.data.provenance],
    ["token acceptance", tokens.data.provenance],
    ["raid environment", raid.data.provenance],
  ] as const) {
    if (
      provenance.commitSha !== manifest.simcCommit ||
      provenance.clientDataWowVersion !== manifest.gameDataBuild
    ) {
      return { ok: false, detail: `${manifest.modelId}: ${name} provenance is not this model` };
    }
  }
  if (tokens.data.provenance.binarySha256 !== manifest.binarySha256) {
    return {
      ok: false,
      detail: `${manifest.modelId}: token acceptance was not measured on this model's binary`,
    };
  }
  if (tokens.data.provenance.consumablesRevision !== consumables.data.artifactRevision) {
    return {
      ok: false,
      detail: `${manifest.modelId}: token acceptance does not describe this consumables revision`,
    };
  }
  const c = consumables.data;
  const t = tokens.data;
  const r = raid.data;
  // The recorded history must end at the artifact actually loaded.
  for (const artifact of [c, t, r]) {
    const changes = manifest.dataHistory.filter((entry) => entry.datasetId === artifact.datasetId);
    const last = changes[changes.length - 1];
    if (last !== undefined && last.toRevision !== artifact.artifactRevision) {
      return {
        ok: false,
        detail: `${manifest.modelId}: ${artifact.datasetId} history ends at ${last.toRevision}, artifact is ${artifact.artifactRevision}`,
      };
    }
  }
  return {
    ok: true,
    data: {
      manifest,
      consumables: c,
      tokenAcceptance: t,
      raidEnvironment: r,
      revisions: [
        { datasetId: c.datasetId, revision: c.artifactRevision },
        { datasetId: t.datasetId, revision: t.artifactRevision },
        { datasetId: r.datasetId, revision: r.artifactRevision },
      ],
    },
  };
}

const LOADED: readonly SimulationModelDataLoad[] = RAW_BUNDLES.map(loadSimulationModelBundle);

/** The model ids that have a data bundle (whether or not it loads). */
export const SIMULATION_MODEL_DATA_IDS: readonly string[] = RAW_BUNDLES.map(
  (raw) => parseManifest(raw.manifest)?.modelId ?? "(invalid manifest)",
);

/** The named model's data, or a failure. There is no default model. */
export function simulationModelData(modelId: string): SimulationModelDataLoad {
  const index = SIMULATION_MODEL_DATA_IDS.indexOf(modelId);
  const loaded = index < 0 ? undefined : LOADED[index];
  return loaded ?? { ok: false, detail: `no simulation-model data for ${modelId}` };
}

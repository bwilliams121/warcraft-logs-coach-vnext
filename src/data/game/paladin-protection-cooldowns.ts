/**
 * Protection Paladin's pinned ability cooldowns (M10-C5 Phase A): the DBC
 * record of each ability the first-GCD question needed a readiness proof
 * for, the MACHINE CENSUS of passive traits that modify its cooldown, and the
 * hand-reviewed, mechanically re-checked absence proof for dynamic
 * modification in the pinned class module.
 *
 * THREE GRADES OF FACT, KEPT APART
 *
 *   MACHINE_EXTRACTED_DBC_RECORD              the base cooldown and its
 *                                             charge/category scalars
 *   MACHINE_CENSUS_OF_PASSIVE_TRAIT_EFFECTS   which traits of the class,
 *                                             selectable by this spec, would
 *                                             change that cooldown through
 *                                             SimulationCraft's generic passive
 *                                             parser, by how much, and in
 *                                             which DIRECTION
 *   HAND_REVIEWED_CPP_ABSENCE_PROOF           that nothing in the module
 *                                             resets, adjusts, hastes or
 *                                             overrides the cooldown after it
 *                                             starts
 *
 * The census is what a pure module review cannot see: Quickened Invocation
 * shortens Divine Toll by 15 s and Righteous Protector halves Sentinel's
 * cooldown without either ever touching a `cooldowns.*` handle. A consumer
 * that resolves a censused trait as SELECTED applies its value exactly; one
 * that cannot resolve it must assume the modifier in the direction it acts.
 *
 * NO MODIFIER IS APPLIED HERE. This module states the pinned facts; the
 * specialization's cooldown bindings decide what they mean for one actor.
 */

import artifact from "./paladin-protection-cooldowns.json";
import type { TalentAlternativeEntry, TalentNodeType, TalentTree } from "./talent-artifact.js";

export const PROTECTION_PALADIN_COOLDOWN_DATASET_ID = "SIMC_DBC_PALADIN_PROTECTION_ABILITY_COOLDOWNS";

export type PassiveModifierKind = "FLAT_MS" | "PCT" | "HASTED" | "CHARGES";
export type PassiveModifierDirection =
  "SHORTENS" | "LENGTHENS" | "NONE" | "SHORTENS_WITH_HASTE" | "CHANGES_CHARGES";

/**
 * Where a censused passive effect comes from (M10-C5 Phase B). A TRAIT is
 * selected or not per the observed tree; a SPEC_PASSIVE or CLASS_PASSIVE is
 * always active for the specialization, so its identity fields are null.
 */
export type PassiveModifierOrigin = "TRAIT" | "SPEC_PASSIVE" | "CLASS_PASSIVE";

/** One censused passive effect that SimulationCraft would apply to the ability's cooldown (or, for a ground effect, its duration). */
export interface PassiveCooldownModifier {
  readonly origin: PassiveModifierOrigin;
  readonly talentSpellId: number;
  readonly displayNameEn: string;
  readonly tree: TalentTree | null;
  readonly traitNodeId: number | null;
  readonly traitEntryId: number | null;
  readonly nodeType: TalentNodeType | null;
  readonly alternativeEntries: readonly TalentAlternativeEntry[];
  readonly effectIndex: number;
  readonly subtype: number;
  readonly subtypeName: string;
  readonly matchedBy: string;
  readonly kind: PassiveModifierKind;
  /** Milliseconds for FLAT_MS; percent points for PCT (−50 halves); unused otherwise. */
  readonly value: number;
  readonly direction: PassiveModifierDirection;
}

export interface DynamicModifierCheck {
  readonly claim: string;
  readonly search: string;
  readonly finding: string;
}

/** A dynamic cooldown mutation the module DOES perform, declared and re-checked by the extractor. */
export interface KnownDynamicMutation {
  readonly member: string;
  readonly site: string;
  /** PRECOMBAT_ONLY never applies in combat; RESET_TO_READY may, and is proven absent only by its observable signature. */
  readonly effect: "PRECOMBAT_ONLY" | "RESET_TO_READY";
  readonly observableSignature?: {
    readonly kind: "AURA_APPLICATION_ON_ACTOR";
    readonly abilityGameId: number;
    readonly basis: string;
  };
}

/** A ground effect the APL reads as `<token>.up`: its pinned lifetime and the passives that change it. */
/**
 * How long a `<x>.up` expression over a ground aoe stays TRUE (M10-C5 Phase
 * B2 audit): SimulationCraft's ground_aoe_event_t keeps the active pointer
 * only until its LAST pulse, which falls inside (D − tick, D] with the tick
 * hasted downwards from `pulseBaseMs`. A consumer may claim TRUE only while
 * elapsed ≤ D − pulseBaseMs and FALSE only after D.
 */
export interface GroundEffectLifetime {
  readonly activeStructMember: string;
  readonly paramsVariable: string;
  readonly pulseBaseMs: number;
  readonly pulseHasted: string;
  readonly expirationPulse: string;
  readonly rule: "ALIVE_UNTIL_LAST_PULSE";
  readonly claim: string;
  readonly sources: readonly string[];
}

export interface GroundEffectRecord {
  readonly expression: string;
  readonly source: string;
  readonly durationMs: number;
  readonly durationModifiers: readonly PassiveCooldownModifier[];
  readonly lifetime: GroundEffectLifetime;
}

export interface ProtectionCooldownAbility {
  readonly simcToken: string;
  readonly abilityGameId: number;
  readonly displayNameEn: string;
  readonly aliasGroup: string | null;
  readonly baseCooldownMs: number;
  readonly charges: number;
  readonly chargeCooldownMs: number;
  readonly internalCooldownMs: number;
  readonly category: number;
  readonly categoryCooldownMs: number;
  readonly passiveModifiers: readonly PassiveCooldownModifier[];
  readonly knownDynamicMutations: readonly KnownDynamicMutation[];
  readonly groundEffect: GroundEffectRecord | null;
  readonly dynamicModifierPolicy: {
    readonly sourcePaths: readonly string[];
    readonly sourceSha256: Readonly<Record<string, string>>;
    readonly reviewedOn: string;
    readonly checks: readonly DynamicModifierCheck[];
  };
}

export interface ProtectionCooldownAliasGroup {
  readonly simcToken: string;
  readonly basis: string;
}

export type ProtectionCooldownLoad =
  | {
      readonly ok: true;
      readonly artifactRevision: string;
      readonly commitSha: string;
      readonly abilities: readonly ProtectionCooldownAbility[];
      readonly aliasGroups: Readonly<Record<string, ProtectionCooldownAliasGroup>>;
    }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function int(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
const SHA256 = /^[0-9a-f]{64}$/;

let cached: ProtectionCooldownLoad | null = null;

function readModifier(raw: unknown): PassiveCooldownModifier | null {
  if (!isRecord(raw)) return null;
  const origin = raw.origin;
  const tree = raw.tree;
  const nodeType = raw.nodeType;
  const kind = raw.kind;
  const direction = raw.direction;
  if (origin !== "TRAIT" && origin !== "SPEC_PASSIVE" && origin !== "CLASS_PASSIVE") return null;
  const passive = origin !== "TRAIT";
  if (
    (passive
      ? tree !== null || nodeType !== null || raw.traitNodeId !== null || raw.traitEntryId !== null
      : (tree !== "CLASS" && tree !== "SPECIALIZATION" && tree !== "HERO") ||
        (nodeType !== "NORMAL" && nodeType !== "CHOICE")) ||
    (kind !== "FLAT_MS" && kind !== "PCT" && kind !== "HASTED" && kind !== "CHARGES") ||
    (direction !== "SHORTENS" &&
      direction !== "LENGTHENS" &&
      direction !== "NONE" &&
      direction !== "SHORTENS_WITH_HASTE" &&
      direction !== "CHANGES_CHARGES") ||
    !Array.isArray(raw.alternativeEntries)
  ) {
    return null;
  }
  const alternatives: TalentAlternativeEntry[] = [];
  for (const entry of raw.alternativeEntries) {
    if (!isRecord(entry)) return null;
    const traitEntryId = int(entry.traitEntryId);
    const displayNameEn = str(entry.displayNameEn);
    const talentSpellId = int(entry.talentSpellId);
    if (traitEntryId === null || displayNameEn === null || talentSpellId === null) return null;
    alternatives.push({ traitEntryId, displayNameEn, talentSpellId });
  }
  const scalars = {
    talentSpellId: int(raw.talentSpellId),
    effectIndex: int(raw.effectIndex),
    subtype: int(raw.subtype),
    value: num(raw.value),
  };
  const traitNodeId = passive ? null : int(raw.traitNodeId);
  const traitEntryId = passive ? null : int(raw.traitEntryId);
  if (!passive && (traitNodeId === null || traitEntryId === null)) return null;
  const displayNameEn = str(raw.displayNameEn);
  const subtypeName = str(raw.subtypeName);
  const matchedBy = str(raw.matchedBy);
  if (
    Object.values(scalars).some((value) => value === null) ||
    displayNameEn === null ||
    subtypeName === null ||
    matchedBy === null
  ) {
    return null;
  }
  return {
    ...(scalars as { [K in keyof typeof scalars]: number }),
    origin,
    traitNodeId,
    traitEntryId,
    displayNameEn,
    tree: passive ? null : (tree as TalentTree),
    nodeType: passive ? null : (nodeType as TalentNodeType),
    alternativeEntries: alternatives,
    subtypeName,
    matchedBy,
    kind,
    direction,
  };
}

function load(): ProtectionCooldownLoad {
  if (cached !== null) return cached;
  const fail = (reason: string, detail: string): ProtectionCooldownLoad =>
    (cached = { ok: false, reason, detail });
  const raw: unknown = artifact;
  if (
    !isRecord(raw) ||
    raw.artifactVersion !== 1 ||
    raw.datasetId !== PROTECTION_PALADIN_COOLDOWN_DATASET_ID
  ) {
    return fail("INVALID_ARTIFACT", "root, version or dataset id");
  }
  const provenance = raw.provenance;
  if (
    !isRecord(provenance) ||
    typeof provenance.commitSha !== "string" ||
    !/^[0-9a-f]{40}$/.test(provenance.commitSha) ||
    provenance.cooldownFieldUnits !== "MILLISECONDS" ||
    !Array.isArray(provenance.sources) ||
    !provenance.sources.every(
      (source) =>
        isRecord(source) &&
        typeof source.path === "string" &&
        typeof source.sha256 === "string" &&
        SHA256.test(source.sha256),
    ) ||
    typeof raw.artifactRevision !== "string"
  ) {
    return fail("INVALID_PROVENANCE", "provenance is incomplete");
  }
  const sourceHashes = new Map(
    (provenance.sources as { path: string; sha256: string }[]).map((source) => [source.path, source.sha256]),
  );
  if (!isRecord(raw.aliasGroups)) return fail("INVALID_ALIAS_GROUPS", "aliasGroups is not a record");
  const aliasGroups: Record<string, ProtectionCooldownAliasGroup> = {};
  for (const [name, group] of Object.entries(raw.aliasGroups)) {
    if (!isRecord(group) || str(group.simcToken) === null || str(group.basis) === null) {
      return fail("INVALID_ALIAS_GROUPS", `alias group ${name}`);
    }
    aliasGroups[name] = { simcToken: group.simcToken as string, basis: group.basis as string };
  }
  if (!Array.isArray(raw.abilities) || raw.abilities.length === 0)
    return fail("INVALID_ABILITIES", "no abilities");
  const abilities: ProtectionCooldownAbility[] = [];
  for (const entry of raw.abilities) {
    if (!isRecord(entry)) return fail("INVALID_ABILITIES", "ability row shape");
    const simcToken = str(entry.simcToken);
    const displayNameEn = str(entry.displayNameEn);
    const scalars = {
      abilityGameId: int(entry.abilityGameId),
      baseCooldownMs: int(entry.baseCooldownMs),
      charges: int(entry.charges),
      chargeCooldownMs: int(entry.chargeCooldownMs),
      internalCooldownMs: int(entry.internalCooldownMs),
      category: int(entry.category),
      categoryCooldownMs: int(entry.categoryCooldownMs),
    };
    if (
      simcToken === null ||
      displayNameEn === null ||
      Object.values(scalars).some((value) => value === null)
    ) {
      return fail("INVALID_ABILITIES", `ability ${simcToken ?? "?"} scalars`);
    }
    const aliasGroup = entry.aliasGroup === null ? null : str(entry.aliasGroup);
    if (aliasGroup !== null && aliasGroups[aliasGroup] === undefined) {
      return fail("INVALID_ABILITIES", `ability ${simcToken} names an unknown alias group`);
    }
    const census = entry.passiveModifierCensus;
    if (
      !isRecord(census) ||
      census.method !== "MACHINE_CENSUS_OF_PASSIVE_TRAIT_EFFECTS" ||
      !Array.isArray(census.modifiers)
    ) {
      return fail("INVALID_CENSUS", `ability ${simcToken}`);
    }
    const passiveModifiers: PassiveCooldownModifier[] = [];
    for (const modifier of census.modifiers) {
      const read = readModifier(modifier);
      if (read === null) return fail("INVALID_CENSUS", `ability ${simcToken} modifier row`);
      passiveModifiers.push(read);
    }
    const mutations: KnownDynamicMutation[] = [];
    if (entry.knownDynamicMutations !== undefined) {
      if (!Array.isArray(entry.knownDynamicMutations))
        return fail("INVALID_ABILITIES", `ability ${simcToken} mutations`);
      for (const mutation of entry.knownDynamicMutations) {
        if (
          !isRecord(mutation) ||
          str(mutation.member) === null ||
          str(mutation.site) === null ||
          (mutation.effect !== "PRECOMBAT_ONLY" && mutation.effect !== "RESET_TO_READY")
        ) {
          return fail("INVALID_ABILITIES", `ability ${simcToken} mutation row`);
        }
        const signature = mutation.observableSignature;
        if (
          signature !== undefined &&
          (!isRecord(signature) ||
            signature.kind !== "AURA_APPLICATION_ON_ACTOR" ||
            int(signature.abilityGameId) === null ||
            str(signature.basis) === null)
        ) {
          return fail("INVALID_ABILITIES", `ability ${simcToken} mutation signature`);
        }
        mutations.push({
          member: mutation.member as string,
          site: mutation.site as string,
          effect: mutation.effect,
          ...(signature === undefined
            ? {}
            : {
                observableSignature: {
                  kind: "AURA_APPLICATION_ON_ACTOR" as const,
                  abilityGameId: (signature as Record<string, unknown>).abilityGameId as number,
                  basis: (signature as Record<string, unknown>).basis as string,
                },
              }),
        });
      }
    }
    let groundEffect: GroundEffectRecord | null = null;
    if (entry.groundEffect !== undefined) {
      const ground = entry.groundEffect;
      if (
        !isRecord(ground) ||
        str(ground.expression) === null ||
        str(ground.source) === null ||
        int(ground.durationMs) === null ||
        !Array.isArray(ground.durationModifiers)
      ) {
        return fail("INVALID_ABILITIES", `ability ${simcToken} ground effect`);
      }
      const durationModifiers: PassiveCooldownModifier[] = [];
      for (const modifier of ground.durationModifiers) {
        const read = readModifier(modifier);
        if (read === null) return fail("INVALID_ABILITIES", `ability ${simcToken} duration modifier row`);
        durationModifiers.push(read);
      }
      const lifetime = ground.lifetime;
      if (
        !isRecord(lifetime) ||
        str(lifetime.activeStructMember) === null ||
        str(lifetime.paramsVariable) === null ||
        int(lifetime.pulseBaseMs) === null ||
        (lifetime.pulseBaseMs as number) <= 0 ||
        str(lifetime.pulseHasted) === null ||
        str(lifetime.expirationPulse) === null ||
        lifetime.rule !== "ALIVE_UNTIL_LAST_PULSE" ||
        str(lifetime.claim) === null ||
        !Array.isArray(lifetime.sources) ||
        !lifetime.sources.every((source) => typeof source === "string")
      ) {
        return fail("INVALID_ABILITIES", `ability ${simcToken} ground effect lifetime`);
      }
      groundEffect = {
        expression: ground.expression as string,
        source: ground.source as string,
        durationMs: ground.durationMs as number,
        durationModifiers,
        lifetime: {
          activeStructMember: lifetime.activeStructMember as string,
          paramsVariable: lifetime.paramsVariable as string,
          pulseBaseMs: lifetime.pulseBaseMs as number,
          pulseHasted: lifetime.pulseHasted as string,
          expirationPulse: lifetime.expirationPulse as string,
          rule: "ALIVE_UNTIL_LAST_PULSE",
          claim: lifetime.claim as string,
          sources: [...(lifetime.sources as string[])],
        },
      };
    }
    const policy = entry.dynamicModifierPolicy;
    if (
      !isRecord(policy) ||
      policy.method !== "HAND_REVIEWED_CPP_ABSENCE_PROOF" ||
      !Array.isArray(policy.sourcePaths) ||
      !isRecord(policy.sourceSha256) ||
      str(policy.reviewedOn) === null ||
      !Array.isArray(policy.checks) ||
      policy.checks.length === 0
    ) {
      return fail("INVALID_POLICY", `ability ${simcToken}`);
    }
    const checks: DynamicModifierCheck[] = [];
    for (const check of policy.checks) {
      if (
        !isRecord(check) ||
        str(check.claim) === null ||
        str(check.search) === null ||
        str(check.finding) === null
      ) {
        return fail("INVALID_POLICY", `ability ${simcToken} check row`);
      }
      checks.push({
        claim: check.claim as string,
        search: check.search as string,
        finding: check.finding as string,
      });
    }
    // The policy's hashes must be the hashes of the sources it was reviewed against.
    for (const hash of Object.values(policy.sourceSha256)) {
      if (typeof hash !== "string" || ![...sourceHashes.values()].includes(hash)) {
        return fail(
          "POLICY_HASH_MISMATCH",
          `ability ${simcToken}: a reviewed module hash is not among the recorded sources`,
        );
      }
    }
    abilities.push({
      simcToken,
      displayNameEn,
      aliasGroup,
      ...(scalars as { [K in keyof typeof scalars]: number }),
      passiveModifiers,
      knownDynamicMutations: mutations,
      groundEffect,
      dynamicModifierPolicy: {
        sourcePaths: policy.sourcePaths.filter((path): path is string => typeof path === "string"),
        sourceSha256: Object.fromEntries(
          Object.entries(policy.sourceSha256).filter(
            (pair): pair is [string, string] => typeof pair[1] === "string",
          ),
        ),
        reviewedOn: policy.reviewedOn as string,
        checks,
      },
    });
  }
  cached = {
    ok: true,
    artifactRevision: raw.artifactRevision,
    commitSha: provenance.commitSha,
    abilities,
    aliasGroups,
  };
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedProtectionPaladinCooldowns(): ProtectionCooldownLoad {
  return load();
}

/** Test seam. */
export function resetProtectionPaladinCooldownCache(): void {
  cached = null;
}

/**
 * Every pinned ability record for an APL token — one per ability id that the
 * token may resolve to. Empty when the token is not pinned.
 */
export function protectionCooldownAbilitiesFor(simcToken: string): readonly ProtectionCooldownAbility[] {
  const loaded = load();
  if (!loaded.ok) return [];
  return loaded.abilities.filter((ability) => ability.simcToken === simcToken);
}

/**
 * The evidence-gated registry of raw event types this analyzer recognises.
 *
 * THE RULE, applied without exception:
 *
 *     If code recognises a raw Warcraft Logs type string by name, there must be
 *     committed evidence supporting that exact string.
 *
 * This applies to envelope-only handling too. Decoding no family-specific
 * fields lowers the SIZE of the contract, not the evidence bar for it: naming a
 * type is still a claim about a non-frozen upstream, and an unevidenced claim
 * would be indistinguishable from a guess.
 *
 * Any raw type absent from this registry normalizes to `UNSUPPORTED_TYPE`,
 * where it is preserved and counted.
 *
 * Every entry below cites a sanitized capture committed under
 * `tests/corpus/artifacts/wcl-events/`. A contract test asserts that each entry carries
 * evidence and that each cited fixture actually exists.
 */

import type { EvidenceCategory } from "../../wcl/evidence-capability.js";
import { isFiniteNumber, isSafeInteger } from "../../wcl/decode.js";
import { normalizeGear, normalizeTalentTree } from "./combatant-info.js";
import type {
  AuraClass,
  AuraOperation,
  CombatEvent,
  CombatEventBase,
  FieldProblem,
} from "./normalized-events.js";

/**
 * Evidence for a specific raw type string.
 *
 * Positive only. There is no "we did not see it" kind, because failing to
 * observe a type proves nothing about whether it exists.
 */
export type SupportedTypeEvidence =
  | { readonly kind: "SANITIZED_CAPTURE"; readonly fixtureId: string; readonly capturedOn: string }
  | { readonly kind: "SCHEMA_TYPED_FIELD"; readonly graphqlPath: string; readonly verifiedOn: string };

export type FamilyDecodeResult =
  | { readonly ok: true; readonly event: CombatEvent }
  | { readonly ok: false; readonly problems: readonly FieldProblem[] };

/**
 * Decodes family-specific fields onto an already-valid envelope.
 *
 * Receives the envelope rather than building one, so a family decoder can never
 * influence timestamp, type or direction.
 */
export type FamilyDecoder = (base: CombatEventBase, raw: Record<string, unknown>) => FamilyDecodeResult;

interface SupportedTypeContractBase {
  /** The exact raw type string, verbatim. */
  readonly rawType: string;
  /** Which evidence category this type feeds, for coverage degradation. */
  readonly category: EvidenceCategory;
  readonly evidence: SupportedTypeEvidence;
}

export interface EnvelopeOnlyTypeContract extends SupportedTypeContractBase {
  readonly handling: "ENVELOPE_ONLY";
}

export interface FamilyTypeContract extends SupportedTypeContractBase {
  readonly handling: "FAMILY";
  readonly family: string;
  readonly decode: FamilyDecoder;
}

export type SupportedTypeContract = EnvelopeOnlyTypeContract | FamilyTypeContract;

/** Committed sanitized captures these contracts are drawn from. */
export const PULL_WINDOW_FIXTURE = "wcl-pull-window-with-resources";
export const MIDFIGHT_WINDOW_FIXTURE = "wcl-midfight-window";
const CAPTURED_ON = "2026-09-11";

function fromPullWindow(): SupportedTypeEvidence {
  return { kind: "SANITIZED_CAPTURE", fixtureId: PULL_WINDOW_FIXTURE, capturedOn: CAPTURED_ON };
}

function fromMidfightWindow(): SupportedTypeEvidence {
  return { kind: "SANITIZED_CAPTURE", fixtureId: MIDFIGHT_WINDOW_FIXTURE, capturedOn: CAPTURED_ON };
}

function optionalNumber(raw: Record<string, unknown>, key: string): number | null {
  const value = raw[key];
  return isFiniteNumber(value) ? value : null;
}

function optionalInteger(raw: Record<string, unknown>, key: string): number | null {
  const value = raw[key];
  return isSafeInteger(value) ? value : null;
}

function optionalBoolean(raw: Record<string, unknown>, key: string): boolean | null {
  const value = raw[key];
  return typeof value === "boolean" ? value : null;
}

/** Required numeric field. A rename or type change surfaces as a defect. */
function requireNumber(raw: Record<string, unknown>, key: string, problems: FieldProblem[]): number | null {
  const value = raw[key];
  if (!(key in raw)) {
    problems.push({ field: key, problem: "MISSING" });
    return null;
  }
  if (!isFiniteNumber(value)) {
    problems.push({ field: key, problem: "WRONG_TYPE" });
    return null;
  }
  return value;
}

// --------------------------------------------------------------------------
// Casts
// --------------------------------------------------------------------------

const CAST_PHASES: Readonly<Record<string, "BEGIN" | "COMPLETE">> = {
  cast: "COMPLETE",
  begincast: "BEGIN",
};

function decodeCast(base: CombatEventBase, raw: Record<string, unknown>): FamilyDecodeResult {
  const castPhase = CAST_PHASES[base.rawType];
  if (castPhase === undefined) {
    return { ok: false, problems: [{ field: "type", problem: "OUT_OF_RANGE" }] };
  }
  return {
    ok: true,
    event: { ...base, kind: "CAST", castPhase, isMelee: optionalBoolean(raw, "melee") },
  };
}

// --------------------------------------------------------------------------
// Auras
// --------------------------------------------------------------------------

interface AuraShape {
  readonly operation: AuraOperation;
  readonly auraClass: AuraClass;
  readonly isStackChange: boolean;
}

const AURA_SHAPES: Readonly<Record<string, AuraShape>> = {
  applybuff: { operation: "APPLIED", auraClass: "BUFF", isStackChange: false },
  refreshbuff: { operation: "REFRESHED", auraClass: "BUFF", isStackChange: false },
  removebuff: { operation: "REMOVED", auraClass: "BUFF", isStackChange: false },
  applybuffstack: { operation: "APPLIED", auraClass: "BUFF", isStackChange: true },
  removebuffstack: { operation: "REMOVED", auraClass: "BUFF", isStackChange: true },
  applydebuff: { operation: "APPLIED", auraClass: "DEBUFF", isStackChange: false },
  refreshdebuff: { operation: "REFRESHED", auraClass: "DEBUFF", isStackChange: false },
  removedebuff: { operation: "REMOVED", auraClass: "DEBUFF", isStackChange: false },
  applydebuffstack: { operation: "APPLIED", auraClass: "DEBUFF", isStackChange: true },
  removedebuffstack: { operation: "REMOVED", auraClass: "DEBUFF", isStackChange: true },
};

function decodeAura(base: CombatEventBase, raw: Record<string, unknown>): FamilyDecodeResult {
  const shape = AURA_SHAPES[base.rawType];
  if (shape === undefined) {
    return { ok: false, problems: [{ field: "type", problem: "OUT_OF_RANGE" }] };
  }

  const problems: FieldProblem[] = [];
  // A stack event without a stack count is a broken contract, not a stackless
  // aura. Non-stack aura types legitimately carry no `stack`.
  const stacks = shape.isStackChange ? requireNumber(raw, "stack", problems) : optionalNumber(raw, "stack");
  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    event: {
      ...base,
      kind: "AURA",
      operation: shape.operation,
      auraClass: shape.auraClass,
      isStackChange: shape.isStackChange,
      stacks,
      absorbAmount: optionalNumber(raw, "absorb"),
    },
  };
}

// --------------------------------------------------------------------------
// Damage / healing / absorbs
// --------------------------------------------------------------------------

function decodeDamage(base: CombatEventBase, raw: Record<string, unknown>): FamilyDecodeResult {
  const problems: FieldProblem[] = [];
  const amount = requireNumber(raw, "amount", problems);
  if (amount === null) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    event: {
      ...base,
      kind: "DAMAGE",
      amount,
      unmitigatedAmount: optionalNumber(raw, "unmitigatedAmount"),
      mitigatedAmount: optionalNumber(raw, "mitigated"),
      absorbedAmount: optionalNumber(raw, "absorbed"),
      blockedAmount: optionalNumber(raw, "blocked"),
      hitType: optionalInteger(raw, "hitType"),
      isAoE: optionalBoolean(raw, "isAoE"),
      isTick: optionalBoolean(raw, "tick") === true,
      supportActorId: optionalInteger(raw, "supportID"),
      subtractsFromSupportedActor: optionalBoolean(raw, "subtractsFromSupportedActor"),
    },
  };
}

function decodeHealing(base: CombatEventBase, raw: Record<string, unknown>): FamilyDecodeResult {
  const problems: FieldProblem[] = [];
  const amount = requireNumber(raw, "amount", problems);
  if (amount === null) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    event: {
      ...base,
      kind: "HEALING",
      amount,
      overhealAmount: optionalNumber(raw, "overheal"),
      absorbedAmount: optionalNumber(raw, "absorbed"),
      hitType: optionalInteger(raw, "hitType"),
      isTick: optionalBoolean(raw, "tick") === true,
    },
  };
}

function decodeAbsorb(base: CombatEventBase, raw: Record<string, unknown>): FamilyDecodeResult {
  const problems: FieldProblem[] = [];
  const amount = requireNumber(raw, "amount", problems);
  if (amount === null) {
    return { ok: false, problems };
  }
  const isHeal = base.rawType === "healabsorbed";
  return {
    ok: true,
    event: {
      ...base,
      kind: "ABSORB",
      absorbKind: isHeal ? "HEAL_ABSORBED" : "DAMAGE_ABSORBED",
      amount,
      absorbedAbilityGameId: optionalInteger(raw, "extraAbilityGameID"),
      // `attackerID` on damage absorbs, `healerID` on heal absorbs. Recorded as
      // an id only; no actor is constructed and no attribution is implied.
      attributedActorId: optionalInteger(raw, isHeal ? "healerID" : "attackerID"),
    },
  };
}

// --------------------------------------------------------------------------
// Resources
// --------------------------------------------------------------------------

function decodeResourceChange(base: CombatEventBase, raw: Record<string, unknown>): FamilyDecodeResult {
  const problems: FieldProblem[] = [];
  const resourceChange = requireNumber(raw, "resourceChange", problems);
  const resourceType = requireNumber(raw, "resourceChangeType", problems);
  if (resourceChange === null || resourceType === null) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    event: {
      ...base,
      kind: "RESOURCE_CHANGE",
      resourceType,
      resourceChange,
      otherResourceChange: optionalNumber(raw, "otherResourceChange"),
      maxResourceAmount: optionalNumber(raw, "maxResourceAmount"),
      // Warcraft Logs' own number, preserved verbatim. Not a verdict.
      reportedWasteAmount: optionalNumber(raw, "waste"),
    },
  };
}

// --------------------------------------------------------------------------
// Summons and combatant info
// --------------------------------------------------------------------------

function decodeSummon(base: CombatEventBase): FamilyDecodeResult {
  return { ok: true, event: { ...base, kind: "SUMMON" } };
}

function decodeCombatantInfo(base: CombatEventBase, raw: Record<string, unknown>): FamilyDecodeResult {
  const problems: FieldProblem[] = [];
  const actorId = base.source?.actorId ?? null;
  if (actorId === null) {
    problems.push({ field: "sourceID", problem: "MISSING" });
  }
  if (!Array.isArray(raw["gear"])) {
    problems.push({ field: "gear", problem: "gear" in raw ? "WRONG_TYPE" : "MISSING" });
  }
  if (actorId === null || problems.length > 0) {
    return { ok: false, problems };
  }
  const gear = normalizeGear(raw["gear"]);
  return {
    ok: true,
    event: {
      ...base,
      kind: "COMBATANT_INFO",
      snapshot: {
        actorId,
        specId: optionalInteger(raw, "specID"),
        gear: gear.pieces,
        malformedGearRows: gear.malformedRows,
        // `talentTree`, never `talents`. See combatant-info.ts.
        talentTree: normalizeTalentTree(raw["talentTree"]),
      },
    },
  };
}

// --------------------------------------------------------------------------
// Registry
// --------------------------------------------------------------------------

function family(
  rawType: string,
  familyName: string,
  category: EvidenceCategory,
  decode: FamilyDecoder,
  evidence: SupportedTypeEvidence,
): FamilyTypeContract {
  return { handling: "FAMILY", rawType, family: familyName, category, decode, evidence };
}

function envelopeOnly(
  rawType: string,
  category: EvidenceCategory,
  evidence: SupportedTypeEvidence,
): EnvelopeOnlyTypeContract {
  return { handling: "ENVELOPE_ONLY", rawType, category, evidence };
}

export const SUPPORTED_TYPE_CONTRACTS: readonly SupportedTypeContract[] = [
  family("cast", "CAST", "CASTS", decodeCast, fromPullWindow()),
  family("begincast", "CAST", "CASTS", decodeCast, fromPullWindow()),

  family("applybuff", "AURA", "AURAS", decodeAura, fromPullWindow()),
  family("refreshbuff", "AURA", "AURAS", decodeAura, fromPullWindow()),
  family("removebuff", "AURA", "AURAS", decodeAura, fromPullWindow()),
  family("applybuffstack", "AURA", "AURAS", decodeAura, fromPullWindow()),
  family("removebuffstack", "AURA", "AURAS", decodeAura, fromPullWindow()),
  family("applydebuff", "AURA", "AURAS", decodeAura, fromPullWindow()),
  family("refreshdebuff", "AURA", "AURAS", decodeAura, fromPullWindow()),
  family("removedebuff", "AURA", "AURAS", decodeAura, fromMidfightWindow()),
  family("applydebuffstack", "AURA", "AURAS", decodeAura, fromMidfightWindow()),
  family("removedebuffstack", "AURA", "AURAS", decodeAura, fromMidfightWindow()),

  family("damage", "DAMAGE", "DAMAGE", decodeDamage, fromPullWindow()),
  family("heal", "HEALING", "HEALING", decodeHealing, fromPullWindow()),

  family("absorbed", "ABSORB", "ABSORBS", decodeAbsorb, fromMidfightWindow()),
  family("healabsorbed", "ABSORB", "ABSORBS", decodeAbsorb, fromMidfightWindow()),

  family("resourcechange", "RESOURCE_CHANGE", "RESOURCES", decodeResourceChange, fromPullWindow()),

  family("summon", "SUMMON", "SUMMONS", decodeSummon, fromPullWindow()),
  family("combatantinfo", "COMBATANT_INFO", "COMBATANT_INFO", decodeCombatantInfo, fromPullWindow()),

  // Envelope-only: observed, named, and deliberately left undecoded. They still
  // require evidence — naming a type is a claim either way.
  envelopeOnly("encounterstart", "ENCOUNTER_PHASES", fromPullWindow()),
  envelopeOnly("extraattacks", "DAMAGE", fromPullWindow()),
  envelopeOnly("empowerstart", "CASTS", fromMidfightWindow()),
  envelopeOnly("empowerend", "CASTS", fromMidfightWindow()),
];

export function indexContracts(
  contracts: readonly SupportedTypeContract[],
): ReadonlyMap<string, SupportedTypeContract> {
  const index = new Map<string, SupportedTypeContract>();
  for (const contract of contracts) {
    index.set(contract.rawType, contract);
  }
  return index;
}

/** Raw type -> the evidence category it feeds, for every recognised type. */
export function categoriesByRawType(
  contracts: readonly SupportedTypeContract[],
): ReadonlyMap<string, EvidenceCategory> {
  const index = new Map<string, EvidenceCategory>();
  for (const contract of contracts) {
    index.set(contract.rawType, contract.category);
  }
  return index;
}

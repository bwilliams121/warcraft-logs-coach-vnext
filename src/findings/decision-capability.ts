/**
 * Decision capabilities — what a specialization evaluator claims it can decide,
 * and what it needs in order to decide it.
 *
 * WHY A CAPABILITY AND NOT AN ANALYZER-WIDE LIST
 *
 * An analyzer-wide "needs resources: yes" was enough while one analyzer
 * evaluated one family of decision. A tank evaluator will hold several —
 * offensive rotation, active mitigation, defensive cooldowns — each resting on
 * a different authority domain and a different slice of the evidence, and each
 * able to be absent while the others remain. Declaring per capability is what
 * lets a registration say truthfully "I evaluate this family and not that one",
 * and what lets orchestration derive its ingestion from exactly the families
 * that are declared.
 *
 * WHAT A DECLARATION IS FOR — TODAY
 *
 * Three operational uses, none decorative:
 *
 *   1. `requirementFromCapabilities` derives the analyzer's ingestion
 *      requirement — scope, and whether resources are retrieved — so the
 *      application service fetches what the declared capabilities consume and
 *      nothing an undeclared one would have wanted.
 *   2. `validateCapabilities` rejects a declaration that names a resource,
 *      evidence category, domain or provider this build does not know, or that
 *      is internally incoherent, so a registration cannot claim state that
 *      cannot exist.
 *   3. The capability's domain is what the registration's authority bindings
 *      are checked against: a binding for a domain no capability declares is
 *      an orphan and fails closed, and a declared domain with no binding
 *      resolves truthfully to NO_PINNED_AUTHORITY_FOR_DOMAIN.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not fence every `CombatState` read at runtime. The evaluator still
 * receives the whole state; the declaration is the minimum it consumes, stated
 * so orchestration can act on it, not a sandbox. Nothing here evaluates play.
 */

import { RESOURCE_IDS, type ResourceId } from "../data/wcl-wire/resource-types.js";
import {
  INGESTION_SCOPES,
  type AnalyzerRequirement,
  type IngestionScope,
} from "../services/ingestion-scope.js";
import { EVIDENCE_CATEGORIES, type EvidenceCategory } from "../wcl/evidence-capability.js";
import { DECISION_DOMAINS, type AuthorityDomain, type DecisionDomain } from "./authority-domain.js";

/**
 * How a capability addresses targets.
 *
 * `PER_OBSERVED_CAST` — the decision is about an observed cast and its target
 * is the cast's own. `NO_TARGET` — the decision has no enemy target. There is
 * deliberately no multi-target model; `CLAUDE.md` keeps that failing closed.
 */
export type TargetModel = "PER_OBSERVED_CAST" | "NO_TARGET";

export const TARGET_MODELS = ["PER_OBSERVED_CAST", "NO_TARGET"] as const satisfies readonly TargetModel[];

/** The minimum evidence one capability consumes. */
export interface StateRequirements {
  readonly scope: IngestionScope;
  /** Resources read by numeric wire type; empty when none. Drives `includeResources`. */
  readonly resources: readonly ResourceId[];
  /** Evidence categories read. `CASTS` is mandatory under `PER_OBSERVED_CAST`. */
  readonly evidenceCategories: readonly EvidenceCategory[];
  readonly targetModel: TargetModel;
  /**
   * This capability reads the focus player's OWN pets as evidence (M11-E1,
   * owner decision M5). Present only when true, so no existing capability's
   * shape changes.
   */
  readonly ownedPetEvidence?: true;
}

/**
 * `TDomain` defaults to the bindable domains, which is every capability an
 * APL-backed specialization declares. A registration holds the wider
 * `DecisionCapability<DecisionDomain>`, so a specialization may also declare a
 * provider-less family (M13-E) it is asked about and holds no standard for.
 */
export interface DecisionCapability<TDomain extends DecisionDomain = AuthorityDomain> {
  /** Stable identifier, unique within a registration. Not a display name. */
  readonly capabilityId: string;
  /**
   * The family of decision this capability evaluates — and therefore the
   * authority DOMAIN it requires.
   *
   * A requirement, not a binding. Which provider kind may govern the domain is
   * declared on the binding (`PROVIDER_DOMAIN_COMPATIBILITY`), and whether the
   * registration actually HOLDS such authority is answered at resolution time.
   * A declared domain with nothing bound is a legitimate
   * `NO_PINNED_AUTHORITY_FOR_DOMAIN` outcome, never a hidden default — which is
   * exactly how a tank capability will be declared before any defensive
   * authority exists.
   */
  readonly domain: TDomain;
  readonly requirements: StateRequirements;
}

export type CapabilityDefect =
  | "DUPLICATE_CAPABILITY_ID"
  | "UNKNOWN_AUTHORITY_DOMAIN"
  | "UNKNOWN_INGESTION_SCOPE"
  | "UNKNOWN_RESOURCE_ID"
  | "UNKNOWN_EVIDENCE_CATEGORY"
  | "UNKNOWN_TARGET_MODEL"
  | "TARGET_MODEL_REQUIRES_CASTS"
  | "NO_CAPABILITIES_DECLARED";

export const CAPABILITY_DEFECTS = [
  "DUPLICATE_CAPABILITY_ID",
  "UNKNOWN_AUTHORITY_DOMAIN",
  "UNKNOWN_INGESTION_SCOPE",
  "UNKNOWN_RESOURCE_ID",
  "UNKNOWN_EVIDENCE_CATEGORY",
  "UNKNOWN_TARGET_MODEL",
  "TARGET_MODEL_REQUIRES_CASTS",
  "NO_CAPABILITIES_DECLARED",
] as const satisfies readonly CapabilityDefect[];

export interface CapabilityDefectRecord {
  readonly defect: CapabilityDefect;
  /** The capability at fault, or `null` for a registration-level defect. */
  readonly capabilityId: string | null;
  readonly detail: string;
}

function includes<T extends string>(vocabulary: readonly T[], value: string): value is T {
  return (vocabulary as readonly string[]).includes(value);
}

/**
 * Validates a registration's capability declarations. Total: returns every
 * defect found rather than the first, so a reviewer sees the whole problem.
 */
export function validateCapabilities(
  capabilities: readonly DecisionCapability<DecisionDomain>[],
): readonly CapabilityDefectRecord[] {
  const defects: CapabilityDefectRecord[] = [];
  if (capabilities.length === 0) {
    defects.push({
      defect: "NO_CAPABILITIES_DECLARED",
      capabilityId: null,
      detail: "a registration must declare at least one decision capability",
    });
    return defects;
  }

  const seen = new Set<string>();
  for (const capability of capabilities) {
    const id = capability.capabilityId;
    if (seen.has(id)) {
      defects.push({
        defect: "DUPLICATE_CAPABILITY_ID",
        capabilityId: id,
        detail: `'${id}' is declared twice`,
      });
    }
    seen.add(id);

    if (!includes(DECISION_DOMAINS, capability.domain)) {
      defects.push({
        defect: "UNKNOWN_AUTHORITY_DOMAIN",
        capabilityId: id,
        detail: `'${String(capability.domain)}' is not a declared decision domain`,
      });
    }

    const { requirements } = capability;
    if (!includes(INGESTION_SCOPES, requirements.scope)) {
      defects.push({
        defect: "UNKNOWN_INGESTION_SCOPE",
        capabilityId: id,
        detail: `'${String(requirements.scope)}' is not an ingestion scope`,
      });
    }
    for (const resource of requirements.resources) {
      if (!includes(RESOURCE_IDS, resource)) {
        defects.push({
          defect: "UNKNOWN_RESOURCE_ID",
          capabilityId: id,
          detail: `'${String(resource)}' has no resource wire contract`,
        });
      }
    }
    for (const category of requirements.evidenceCategories) {
      if (!includes(EVIDENCE_CATEGORIES, category)) {
        defects.push({
          defect: "UNKNOWN_EVIDENCE_CATEGORY",
          capabilityId: id,
          detail: `'${String(category)}' is not an evidence category`,
        });
      }
    }
    if (!includes(TARGET_MODELS, requirements.targetModel)) {
      defects.push({
        defect: "UNKNOWN_TARGET_MODEL",
        capabilityId: id,
        detail: `'${String(requirements.targetModel)}' is not a target model`,
      });
    } else if (
      requirements.targetModel === "PER_OBSERVED_CAST" &&
      !requirements.evidenceCategories.includes("CASTS")
    ) {
      defects.push({
        defect: "TARGET_MODEL_REQUIRES_CASTS",
        capabilityId: id,
        detail: "a capability addressed per observed cast must declare CASTS among its evidence",
      });
    }
  }
  return defects;
}

/** The distinct domains a set of capabilities declares, in declaration order. */
export function declaredDomainsOf<TDomain extends DecisionDomain>(
  capabilities: readonly DecisionCapability<TDomain>[],
): readonly TDomain[] {
  const domains: TDomain[] = [];
  for (const capability of capabilities) {
    if (!domains.includes(capability.domain)) domains.push(capability.domain);
  }
  return domains;
}

/** Ordered widest-last, mirroring `deriveIngestionScope`. */
const SCOPE_BREADTH: Readonly<Record<IngestionScope, number>> = { PLAYER_CONTEXT: 0, FULL_RAID: 1 };

/**
 * Derives an analyzer's ingestion requirement from its declared capabilities.
 *
 * The widest declared scope wins, and resources are retrieved when any
 * capability reads one. Assassination declares one capability at
 * `PLAYER_CONTEXT` reading combo points and energy, which derives exactly the
 * requirement its registration stated by hand before M10-A — a contract test
 * pins that equality.
 */
export function requirementFromCapabilities(
  analyzerId: string,
  capabilities: readonly DecisionCapability<DecisionDomain>[],
): AnalyzerRequirement {
  let requiredScope: IngestionScope = "PLAYER_CONTEXT";
  let includeResources = false;
  let ownedPetEvidence = false;
  for (const capability of capabilities) {
    if (capability.requirements.ownedPetEvidence === true) ownedPetEvidence = true;
    if (SCOPE_BREADTH[capability.requirements.scope] > SCOPE_BREADTH[requiredScope]) {
      requiredScope = capability.requirements.scope;
    }
    if (capability.requirements.resources.length > 0) includeResources = true;
  }
  return {
    analyzerId,
    requiredScope,
    includeResources,
    ...(ownedPetEvidence ? { ownedPetEvidence: true } : {}),
  };
}

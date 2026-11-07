/**
 * Types for the ONB-EV selection rule, so it can be tested. The script stays plain JavaScript and makes
 * no request.
 */

export const ONB_EV_SELECTION_REVISION: string;

export type OnbEvWindow =
  | { readonly kind: "FIRST_MS"; readonly ms: number; readonly minFightDurationMs: number }
  | {
      readonly kind: "WHOLE_FIGHT";
      readonly minFightDurationMs: number;
      readonly maxFightDurationMs: number;
    };

export interface OnbEvSpecialization {
  readonly specId: string;
  readonly wclClassName: string;
  readonly wclSpecName: string;
  readonly scope: string;
  readonly includeResources: boolean;
  readonly resources: readonly string[];
  readonly evidenceCategories: readonly string[];
  readonly gate: string;
  readonly evidenceWindow: OnbEvWindow;
  readonly retainedEvidence: string;
}

export interface OnbEvPlan {
  readonly planVersion: number;
  readonly planRevision: string;
  readonly revisionOf: {
    readonly planRevision: string;
    readonly planDigest: string;
    readonly kind: string;
    readonly reason: string;
    readonly failedRequests: readonly {
      readonly limit: number;
      readonly page: number;
      readonly errorText: string;
      readonly stated: { readonly maxComplexity: number; readonly gotComplexity: number };
    }[];
  };
  readonly acquisitionRuleId: string;
  readonly selectionRevision: string;
  readonly frozenOn: string;
  readonly status: "FROZEN" | "EXECUTED";
  readonly grant: string;
  readonly specializations: readonly OnbEvSpecialization[];
  readonly removedSpecializations: readonly unknown[];
  readonly provenIntervals: readonly {
    readonly region: string;
    readonly gameBuild: string;
    readonly fromUtc: string;
    readonly toUtc: string;
  }[];
  readonly excludedProvenIntervals: readonly {
    readonly region: string;
    readonly gameBuild: string;
    readonly reason: string;
  }[];
  readonly discovery: {
    readonly listing: string;
    readonly listingFields: readonly string[];
    readonly pageSize: number;
    readonly listingRequestLimit: number;
    readonly zoneId: number;
    readonly region: string;
    readonly difficulties: readonly number[];
    readonly orderSalt: string;
    readonly maxGateRetriesPerSpecialization: number;
    readonly listingSequence: readonly { readonly gameBuild: string; readonly page: number }[];
  };
  readonly capture: Readonly<Record<string, unknown>>;
  readonly limits: {
    readonly eventPageSize: number;
    readonly prefixPageCeiling: number;
    readonly wholeFightPageCeiling: number;
  };
  readonly requestBudget: {
    readonly hardCap: number;
    readonly tokenRequests: number;
    readonly refusedListingRequests: number;
    readonly listingPages: number;
    readonly listingRequests: number;
    readonly contextRequests: number;
    readonly eventPages: number;
    readonly revisionRequests: number;
    readonly worstCaseTotal: number;
    readonly exceedsHardCap: boolean;
  };
  readonly storage: Readonly<Record<string, unknown>>;
  readonly planDigest: string;
}

export interface OnbEvListingPage {
  readonly reports: readonly unknown[];
}

export interface OnbEvCandidate {
  readonly reportCode: string;
  readonly fightId: number;
  readonly actorId: number;
  readonly gameBuild: string;
  readonly durationMs: number;
}

export interface OnbEvSelection {
  readonly rows: readonly {
    readonly specId: string;
    readonly status: "SELECTED" | "NO_CANDIDATE";
    readonly candidates: readonly OnbEvCandidate[];
  }[];
  readonly needsAnotherPage: boolean;
}

export interface OnbEvCapture {
  readonly reportCode: string;
  readonly fightId: number;
  readonly windowKind: OnbEvWindow["kind"];
  readonly includeResources: boolean;
  readonly subjects: readonly { readonly specId: string; readonly actorId: number }[];
}

export function planDigest(plan: Readonly<Record<string, unknown>> | OnbEvPlan): string;
export function discoveryOrderKey(plan: OnbEvPlan, reportCode: string, fightId: number): string;
export function selectSubjects(plan: OnbEvPlan, pages: readonly OnbEvListingPage[]): OnbEvSelection;
export function capturesOf(plan: OnbEvPlan, selection: OnbEvSelection): readonly OnbEvCapture[];
export function pageCeilingOf(plan: OnbEvPlan, windowKind: OnbEvWindow["kind"]): number;
export function mayStartCapture(
  plan: OnbEvPlan,
  windowKind: OnbEvWindow["kind"],
  requestsLeft: number,
  subjectCount: number,
): boolean;
export function worstCaseRequests(plan: OnbEvPlan): number;
export function listingRequestPagesOf(plan: OnbEvPlan, page: number): readonly number[];
export function assembleListingPage(
  plan: OnbEvPlan,
  page: number,
  rowsByRequestPage: ReadonlyMap<number, readonly unknown[]>,
): OnbEvListingPage | null;

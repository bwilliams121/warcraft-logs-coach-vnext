/**
 * The M11-G1 cohort selection policy, in ONE place (owner decisions,
 * 2026-10-09). Initial product thresholds, not immutable constants.
 */
export interface CohortSelectionConfig {
  /** How many comparable kills the cohort aims for. */
  readonly cohortSize: number;
  /** Starting item-level window, ± overall Warcraft Logs item level. */
  readonly itemLevelStartWindow: number;
  /** Duration windows tried in order at the starting item level, as fractions of the subject's kill duration. */
  readonly durationWindows: readonly number[];
  /** Each further rung widens item level by this many levels, at the widest duration. */
  readonly itemLevelStep: number;
  /** Item level never widens beyond this. */
  readonly itemLevelMaxWindow: number;
  /** The owner's hard cap on GraphQL requests for one G1 discovery, the subject request included. */
  readonly maxGraphqlRequests: number;
}

export const COHORT_SELECTION_CONFIG: CohortSelectionConfig = {
  cohortSize: 3,
  itemLevelStartWindow: 3,
  durationWindows: [0.05, 0.1, 0.15],
  itemLevelStep: 3,
  itemLevelMaxWindow: 9,
  maxGraphqlRequests: 14,
};

export interface CohortRung {
  readonly durationFraction: number;
  readonly itemLevelWindow: number;
}

/**
 * The widening ladder: duration ±5% -> ±10% -> ±15% at the starting item
 * level, then item level one step at a time at ±15%, up to the maximum.
 */
export function cohortRungs(config: CohortSelectionConfig = COHORT_SELECTION_CONFIG): readonly CohortRung[] {
  const rungs: CohortRung[] = config.durationWindows.map((durationFraction) => ({
    durationFraction,
    itemLevelWindow: config.itemLevelStartWindow,
  }));
  const widest = config.durationWindows[config.durationWindows.length - 1] ?? 0;
  for (
    let window = config.itemLevelStartWindow + config.itemLevelStep;
    window <= config.itemLevelMaxWindow;
    window += config.itemLevelStep
  ) {
    rungs.push({ durationFraction: widest, itemLevelWindow: window });
  }
  return rungs;
}

/**
 * Warcraft Logs' item-level brackets, as pinned by the G1 capture: bracket
 * `b` holds item levels `269 + 3b` .. `271 + 3b` (brackets 18, 19 and 20
 * returned exactly 323-325, 326-328 and 329-331; the subject's 327 is bracket
 * 19). Every page is re-checked against this mapping, and a row outside its
 * bracket's range fails the page closed.
 */
export const WCL_ITEM_LEVEL_BRACKET_MAPPING = "WCL_ITEM_LEVEL_BRACKET_3_WIDE_FROM_269";

export function itemLevelBracket(itemLevel: number): number {
  return Math.floor((itemLevel - 269) / 3);
}

export function bracketItemLevelRange(bracket: number): { readonly from: number; readonly to: number } {
  return { from: 269 + 3 * bracket, to: 271 + 3 * bracket };
}

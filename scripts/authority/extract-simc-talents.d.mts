/**
 * Types for the talent extractor's exported helpers (M10-C).
 *
 * The script stays plain JavaScript. Only the target table is typed here, so
 * a test can pin that the committed artifact is what the target declares.
 */

export interface TalentExtractionTarget {
  readonly datasetId: string;
  readonly classId: number;
  readonly specId: number;
  readonly className: string;
  readonly defaultOut: string;
  readonly wclIdSpaceNote: string;
  readonly requiredTalents: readonly {
    readonly simcName: string;
    readonly displayNameEn: string;
    readonly tree: "CLASS" | "SPECIALIZATION" | "HERO";
    readonly binding: string;
  }[];
  readonly heroTrees: readonly { readonly simcName: string; readonly subTreeId: number }[];
  readonly apexTraits: boolean;
}

export const TARGETS: Readonly<
  Record<"rogue-assassination" | "paladin-protection" | "monk-brewmaster", TalentExtractionTarget>
>;

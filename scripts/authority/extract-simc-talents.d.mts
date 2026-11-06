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
    /** Names the hero sub-tree when a name is held by two of them (ONB-B3). */
    readonly subTreeId?: number;
  }[];
  readonly heroTrees: readonly { readonly simcName: string; readonly subTreeId: number }[];
  readonly apexTraits: boolean;
}

export const TARGETS: Readonly<
  Record<"rogue-assassination" | "paladin-protection" | "monk-brewmaster", TalentExtractionTarget>
>;

/** The fields of a parsed trait row these helpers read (ONB-B3). */
export interface TraitRow {
  readonly classId: number;
  readonly treeIndex: number;
  readonly idSubTree: number;
  readonly specIds: readonly number[];
  readonly traitEntryId: number;
  readonly traitNodeId: number;
  readonly displayNameEn: string;
  readonly talentSpellId: number;
  readonly nodeType: number;
}

export function resolveHeroTree(
  rows: readonly TraitRow[],
  declared: {
    readonly simcName: string;
    readonly subTreeId: number;
    readonly placeholderEntryIds?: readonly number[];
  },
  target: { readonly classId: number; readonly specId: number },
):
  | { readonly ok: false; readonly error: string }
  | {
      readonly ok: true;
      readonly heroTree: {
        readonly simcName: string;
        readonly subTreeId: number;
        readonly entries: readonly { readonly traitEntryId: number }[];
      };
    };

export function resolveTalent(
  rows: readonly TraitRow[],
  required: {
    readonly simcName: string;
    readonly displayNameEn: string;
    readonly tree: string;
    readonly subTreeId?: number;
  },
  target: { readonly classId: number; readonly specId: number },
):
  | { readonly ok: false; readonly error: string }
  | { readonly ok: true; readonly talent: { readonly traitEntryId: number } };

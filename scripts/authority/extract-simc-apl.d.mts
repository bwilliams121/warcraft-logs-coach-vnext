/**
 * Types for the APL extractor's exported helpers (M11-C1).
 *
 * The script stays plain JavaScript. The region selector, the region parser
 * and the fact verifier are exported so a test can exercise them over
 * synthetic source and pin the target profiles; the CLI is unchanged.
 */

export interface AplDispatchEdge {
  readonly from: string;
  readonly ordinal: number;
  readonly kind: "CALL" | "RUN";
  readonly to: string;
  readonly condition: string | null;
}

/** One extractable specialization profile. Coordinates and required facts, never a parser. */
export interface AplExtractionTarget {
  readonly sourcePath: string;
  /** MARKER selection: the literal region comment lines. */
  readonly regionStart?: string;
  readonly regionEnd?: string;
  /** NAMESPACE selection (M11-C1): the namespace the function header is looked for in. */
  readonly enclosingNamespace?: string;
  readonly functionHeader: string;
  /** The parameter the list declarations are called on; `p` when absent. */
  readonly playerIdentifier?: string;
  readonly regionName: string;
  readonly authorityId: string;
  readonly spec: { readonly className: string; readonly specName: string };
  readonly defaultOut: string;
  readonly clientVersion?: readonly [number, number, number];
  readonly requiredFacts: {
    readonly kind: string;
    readonly entryListName: string;
    readonly requiredLists: readonly string[];
    readonly listSizes?: Readonly<Record<string, number>>;
    readonly edges?: readonly AplDispatchEdge[];
    readonly forbiddenTokens?: readonly string[];
    readonly noTargetingOptions?: boolean;
    readonly [key: string]: unknown;
  };
}

/**
 * The region provenance an artifact records, in exactly one form (M11-C1a):
 * the literal marker lines of a MARKER target, or the source-coordinate
 * selector of a NAMESPACE_FUNCTION target. Mirrors `AuthorityRegionProvenance`
 * in `src/simc/authority-artifact.ts`.
 */
export type ExtractedRegionProvenance =
  | { readonly regionStartMarker: string; readonly regionEndMarker: string }
  | {
      readonly regionSelector: {
        readonly kind: "NAMESPACE_FUNCTION";
        readonly enclosingNamespace: string;
        readonly functionHeader: string;
        readonly playerIdentifier: string;
      };
    };

export interface LocatedRegion {
  /** The region parser reads the lines strictly between these two indices. */
  readonly startIndex: number;
  readonly endIndex: number;
  readonly provenance: ExtractedRegionProvenance;
}

export interface ExtractedAction {
  readonly priorityOrdinal: number;
  readonly actionStringVerbatim: string;
  readonly comment: string | null;
  readonly sourceLine: number;
}

export interface ExtractedList {
  readonly listName: string;
  readonly receiverIdentifier: string;
  readonly actions: readonly ExtractedAction[];
}

export interface ExtractedRegion {
  readonly lists: readonly ExtractedList[];
  readonly guards: readonly unknown[];
  readonly regionProvenance: ExtractedRegionProvenance;
}

export class ExtractionError extends Error {}

export const TARGETS: Readonly<Record<string, AplExtractionTarget>>;

export function locateRegion(lines: readonly string[], target: AplExtractionTarget): LocatedRegion;

export function extract(sourceText: string, target: AplExtractionTarget): ExtractedRegion;

export function buildArtifact(input: {
  readonly target: AplExtractionTarget;
  readonly extracted: ExtractedRegion;
  readonly sourceSha256: string;
  readonly sourceByteLength: number;
  readonly sha: string | null;
  readonly branch: string;
  readonly commitDate: string;
  readonly extractedOn: string;
}): unknown;

export function verifyRequiredFacts(
  artifact: { readonly entryListName: string; readonly lists: readonly ExtractedList[] },
  target: AplExtractionTarget,
): readonly string[];

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
  /** CLASS_METHOD selection (ONB-B2): the class whose method defines the lists. */
  readonly enclosingClass?: string;
  /** INCLUDED_FILE selection (ONB-C1): the file that holds this one as a function's sole body. */
  readonly includedBy?: PinnedSourceFile & { readonly includeLine: string };
  readonly functionHeader: string;
  /** The parameter the list declarations are called on; `p` when absent. */
  readonly playerIdentifier?: string;
  readonly regionName: string;
  readonly authorityId: string;
  readonly spec: { readonly className: string; readonly specName: string };
  readonly defaultOut: string;
  readonly clientVersion?: readonly [number, number, number];
  /** M11-D2-C: present on PINNED targets only. */
  readonly pinnedSource?: PinnedTargetRecord["pinnedSource"];
  readonly livePtrPolicy?: PinnedTargetRecord["livePtrPolicy"];
  readonly dispatch?: PinnedTargetRecord["dispatch"];
  readonly inertStatements?: PinnedTargetRecord["inertStatements"];
  /** ONB-B2: the guard a class method opens on, by exact code lines, and when the lists exist. */
  readonly methodPrologue?: { readonly lines: readonly string[]; readonly appliesWhen: string };
  /** ONB-B2: each `add_action( this, ... )`, by exact text, with the proof of what it emits. */
  readonly spellGatedActions?: readonly {
    readonly statement: string;
    readonly spellName: string;
    readonly emitted: string | null;
    readonly proofs: readonly (PinnedSourceFile & { readonly checks: readonly unknown[] })[];
  }[];
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
    }
  | {
      readonly regionSelector: {
        readonly kind: "CLASS_METHOD";
        readonly enclosingClass: string;
        readonly functionHeader: string;
      };
    }
  | {
      readonly regionSelector: {
        readonly kind: "INCLUDED_FILE";
        readonly includingSourcePath: string;
        readonly includingSourceSha256: string;
        readonly includeLine: string;
        readonly functionHeader: string;
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
  /** SHA-256 of the region lines, marker or selector lines included, LF-joined (M11-D2-C). */
  readonly regionSha256: string;
  readonly inertStatements?: readonly {
    readonly sourceLine: number;
    readonly statement: string;
    readonly identifier: string;
  }[];
  readonly methodPrologue?: {
    readonly startLine: number;
    readonly endLine: number;
    readonly appliesWhen: string;
  };
  readonly spellGatedActions?: readonly {
    readonly sourceLine: number;
    readonly statement: string;
    readonly spellName: string;
    readonly emitted: string | null;
  }[];
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

// ---------------------------------------------------------------------------
// M11-D2-C: pinned targets and the atomic batch preflight
// ---------------------------------------------------------------------------

/** One pinned source file: its path under the source root, exact length and SHA-256. */
export interface PinnedSourceFile {
  readonly sourcePath: string;
  readonly sha256: string;
  readonly byteLength: number;
}

export type LivePtrPolicyKind =
  | "NO_PTR_REGION"
  | "PTR_MARKERS_EMPTY"
  | "PTR_STUB_NEVER_DISPATCHED"
  | "PTR_BODY_IDENTICAL"
  | "PTR_BODY_DIFFERS"
  | "PTR_SEPARATE_INCLUDE"
  | "PTR_DELEGATES_TO_LIVE";

export interface PinnedTargetRecord {
  readonly pinnedSource: PinnedSourceFile & { readonly commitSha: string; readonly regionSha256: string };
  readonly livePtrPolicy: {
    readonly kind: LivePtrPolicyKind;
    readonly ptrRegionStart?: string;
    readonly ptrRegionEnd?: string;
    readonly ptrIncludeLine?: string;
    readonly entryFunctionHeader?: string;
    readonly ptrFunctionHeader: string;
  };
  readonly dispatch: PinnedSourceFile & {
    readonly functionHeader: string;
    readonly sequence: readonly string[];
  };
  readonly inertStatements?: readonly {
    readonly statement: string;
    readonly identifier: string;
    readonly reason: string;
    readonly proofs: readonly (PinnedSourceFile & {
      readonly checks: readonly (
        | {
            readonly kind: "FUNCTION_BODY_SHA256";
            readonly functionHeader: string;
            readonly bodySha256: string;
          }
        | { readonly kind: "LINE_EXACTLY_ONCE"; readonly line: string }
        | { readonly kind: "TOKEN_ABSENT"; readonly token: string }
      )[];
    })[];
  }[];
}

export type PinnedExtractionTarget = AplExtractionTarget & PinnedTargetRecord;

/** Reads one source-root-relative path: its bytes, or `null` when absent. Throws ExtractionError on a refused path. */
export type SourceReader = (relativePath: string) => Uint8Array | null;

export interface TargetPreflight {
  readonly targetName: string;
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly sourcePath: string | null;
  readonly sourceSha256: string | null;
  readonly sourceByteLength: number | null;
  readonly regionSha256: string | null;
  readonly livePtrPolicy: LivePtrPolicyKind | null;
  readonly dispatchSourcePath: string | null;
  readonly inertStatements: number;
  readonly lists: number;
  readonly actions: number;
  readonly artifact: Record<string, unknown> | null;
  readonly outputPath?: string | null;
}

export interface BatchPreflight {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly results: readonly TargetPreflight[];
}

export const PINNED_SIMC_COMMIT: string;
export const LIVE_PTR_POLICIES: readonly LivePtrPolicyKind[];

export function confinedSourcePath(sourceRoot: string, relativePath: string): string;
export function sourceRootReader(sourceRoot: string): SourceReader;
export function validatePinnedRecord(targetName: string, target: AplExtractionTarget): readonly string[];
export function verifyLivePtrPolicy(
  lines: readonly string[],
  dispatchText: string,
  target: PinnedExtractionTarget,
): void;
export function verifyDispatch(dispatchText: string, target: PinnedExtractionTarget): void;
export function preflightTarget(input: {
  readonly targetName: string;
  readonly target: AplExtractionTarget | undefined;
  readonly read: SourceReader;
  readonly sha: string | null;
  readonly extractedOn: string;
  readonly commitDate: string;
  readonly branch: string;
}): TargetPreflight;
export function outputPathOf(target: AplExtractionTarget, outDir?: string): string;
export function preflightBatch(input: {
  readonly targetNames: readonly string[];
  readonly targets?: Readonly<Record<string, AplExtractionTarget>>;
  readonly read: SourceReader;
  readonly sha: string | null;
  readonly extractedOn: string;
  readonly commitDate: string;
  readonly branch: string;
  readonly outDir?: string;
}): BatchPreflight;
export function batchReport(batch: BatchPreflight): {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly targets: readonly Omit<TargetPreflight, "artifact">[];
};
export function writeBatch(batch: BatchPreflight): readonly string[];

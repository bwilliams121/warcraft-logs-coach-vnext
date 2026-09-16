/**
 * The machine-readable corpus report: what one complete harness run said,
 * in a form that is byte-identical between runs, processes and machines.
 *
 * It is DERIVED from an execution, never written by hand: the gate test
 * builds it from the harness result and the loaded corpus, and
 * `scripts/corpus/gate.mjs --write-report` commits exactly that to
 * `tests/corpus/report.json`. The gate then holds the committed copy against
 * the next execution (`reportDrift`), so the committed report can never say
 * something the corpus no longer does.
 *
 * NOTHING NONDETERMINISTIC IS IN IT. No timestamp, no duration, no random
 * id, no absolute path, no environment value, no enumeration order the
 * loader does not already fix. Keys are emitted sorted so serialisation
 * order cannot leak in either.
 */

import { CORPUS_CONTRACT_VERSION, PINNED_AUTHORITY_REVISIONS } from "./contract.js";
import type { AssertionStatus, HarnessResult } from "./harness.js";
import type { LoadedCorpus } from "./loader.js";
import { KNOWN_EVIDENCE_GAPS, type GapDisposition } from "./report.js";

export const MACHINE_REPORT_VERSION = 1;

export interface MachineReport {
  readonly reportVersion: number;
  readonly contractVersion: number;
  readonly corpusId: string;
  readonly runtime: "NODE" | "WORKERD";
  readonly selection: string;
  readonly totals: {
    readonly artifacts: number;
    readonly artifactBytes: number;
    readonly largestArtifactBytes: number;
    readonly cases: number;
    readonly assertions: number;
    readonly executable: number;
    readonly declared: number;
    readonly passed: number;
    readonly failed: number;
    readonly notExecuted: number;
  };
  readonly byLayer: readonly {
    readonly owningLayer: string;
    readonly cases: number;
    readonly assertions: number;
    readonly passed: number;
    readonly failed: number;
    readonly notExecuted: number;
    readonly kindsExercised: readonly string[];
  }[];
  readonly artifacts: readonly {
    readonly artifactId: string;
    readonly payloadKind: string;
    readonly provenanceKind: string;
    readonly sha256: string;
    readonly byteLength: number;
  }[];
  readonly cases: readonly {
    readonly caseId: string;
    readonly owningLayer: string;
    readonly artifactId: string;
    readonly referencedArtifactIds: readonly string[];
    readonly authority: { readonly authorityId: string; readonly artifactRevision: string } | null;
    readonly assertions: readonly {
      readonly ordinal: number;
      readonly kind: string;
      readonly status: AssertionStatus;
    }[];
  }[];
  readonly gaps: readonly {
    readonly id: string;
    readonly layers: readonly string[];
    readonly disposition: GapDisposition;
    readonly owner: string;
    readonly closedBy: readonly string[];
  }[];
  readonly pinnedAuthorities: Readonly<Record<string, string>>;
}

/** Builds the report from one COMPLETE harness result over the corpus it ran on. */
export function machineReport(
  result: Extract<HarnessResult, { ok: true }>,
  corpus: LoadedCorpus,
): MachineReport {
  const statusOf = new Map<string, AssertionStatus>();
  for (const entry of result.results) {
    statusOf.set(`${entry.caseId}#${String(entry.assertionOrdinal)}`, entry.status);
  }
  const cases = corpus.cases.map((entry) => ({
    caseId: entry.record.caseId,
    owningLayer: entry.record.owningLayer,
    artifactId: entry.artifact.record.artifactId,
    referencedArtifactIds: entry.referencedArtifactIds,
    authority: entry.record.authority,
    assertions: entry.assertions.map((assertion, ordinal) => ({
      ordinal,
      kind: assertion.kind,
      // A selection that did not run a case leaves it NOT_EXECUTED here; the
      // gate runs ALL, so on the committed report every status is PASSED.
      status: statusOf.get(`${entry.record.caseId}#${String(ordinal)}`) ?? "NOT_EXECUTED",
    })),
  }));
  const byLayer = result.summary.byLayer.map((layer) => {
    const layerCases = cases.filter((entry) => entry.owningLayer === layer.owningLayer);
    const kinds = new Set<string>();
    for (const entry of layerCases) for (const assertion of entry.assertions) kinds.add(assertion.kind);
    return {
      owningLayer: layer.owningLayer,
      cases: layer.cases,
      assertions: layerCases.reduce((sum, entry) => sum + entry.assertions.length, 0),
      passed: layer.passed,
      failed: layer.failed,
      notExecuted: layer.notExecuted,
      kindsExercised: [...kinds].sort(),
    };
  });
  return {
    reportVersion: MACHINE_REPORT_VERSION,
    contractVersion: CORPUS_CONTRACT_VERSION,
    corpusId: corpus.manifest.corpusId,
    runtime: result.runtime,
    selection: result.selection.kind,
    totals: {
      artifacts: corpus.artifacts.length,
      artifactBytes: corpus.totalArtifactBytes,
      largestArtifactBytes: Math.max(...corpus.artifacts.map((entry) => entry.canonicalByteLength)),
      cases: result.summary.cases,
      assertions: result.summary.assertions,
      executable: corpus.coverage.executable,
      declared: corpus.coverage.declared,
      passed: result.summary.passed,
      failed: result.summary.failed,
      notExecuted: result.summary.notExecuted,
    },
    byLayer,
    artifacts: corpus.artifacts.map((entry) => ({
      artifactId: entry.record.artifactId,
      payloadKind: entry.record.payloadKind,
      provenanceKind: entry.record.provenance.kind,
      sha256: entry.record.sha256,
      byteLength: entry.canonicalByteLength,
    })),
    cases,
    gaps: KNOWN_EVIDENCE_GAPS.map((gap) => ({
      id: gap.id,
      layers: gap.layers,
      disposition: gap.disposition,
      owner: gap.owner,
      closedBy: gap.closedBy,
    })),
    pinnedAuthorities: PINNED_AUTHORITY_REVISIONS,
  };
}

/** Key-sorted deep copy, so two reports that mean the same serialise the same. */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** The report's one serialisation: key-sorted, two-space, trailing newline. */
export function serializeMachineReport(report: MachineReport): string {
  return `${JSON.stringify(canonicalize(report), null, 2)}\n`;
}

/**
 * The first place two reports disagree, as a dotted path with both values —
 * or `null` when they are the same document. The gate's drift message.
 */
export function reportDrift(committed: unknown, actual: unknown, path = "report"): string | null {
  const left = canonicalize(committed);
  const right = canonicalize(actual);
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return `${path}: committed has ${String(left.length)} entries, this run has ${String(right.length)}`;
    }
    for (const [index, entry] of left.entries()) {
      const drift = reportDrift(entry, right[index], `${path}[${String(index)}]`);
      if (drift !== null) return drift;
    }
    return null;
  }
  if (typeof left === "object" && left !== null && typeof right === "object" && right !== null) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort();
    for (const key of keys) {
      if (!(key in leftRecord)) return `${path}.${key}: absent from the committed report`;
      if (!(key in rightRecord)) return `${path}.${key}: absent from this run`;
      const drift = reportDrift(leftRecord[key], rightRecord[key], `${path}.${key}`);
      if (drift !== null) return drift;
    }
    return null;
  }
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    return `${path}: committed ${JSON.stringify(left)}, this run ${JSON.stringify(right)}`;
  }
  return null;
}

const COMMITTED_REPORT: Record<string, string> = import.meta.glob("../../corpus/report.json", {
  eager: true,
  query: "?raw",
  import: "default",
});

/** The committed `tests/corpus/report.json`, parsed. Throws when it is absent — the gate must write it first. */
export function committedMachineReport(): unknown {
  const text = COMMITTED_REPORT["../../corpus/report.json"];
  if (text === undefined) {
    throw new Error(
      "tests/corpus/report.json is not committed; run `npm run test:corpus -- --write-report` to produce it from an execution",
    );
  }
  return JSON.parse(text) as unknown;
}

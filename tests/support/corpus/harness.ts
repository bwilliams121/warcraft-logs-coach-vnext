/**
 * The regression-corpus execution harness: one deterministic entry point that
 * validates the corpus, enumerates what it was asked to run, dispatches every
 * assertion to the executor its owning layer registered, and reports each one
 * as PASSED, FAILED or NOT_EXECUTED.
 *
 * THREE VERBS AND NO FOURTH
 *
 *   PASSED        the executor ran and the layer produced what the case pins.
 *   FAILED        the executor ran and it did not — with the case, artifact,
 *                 layer, kind, expected and actual semantic results, and an
 *                 evidence locator when the layer offered one.
 *   NOT_EXECUTED  the kind is registered but DECLARED: no executor exists yet.
 *                 Reported every run, counted separately, and NEVER coverage.
 *
 * There is deliberately no SKIPPED. A missing executor is not a reason to look
 * away, it is a fact about the corpus, and a run that includes such an
 * assertion is not `complete`. The complete-corpus gate is therefore
 * "zero FAILED and zero NOT_EXECUTED", and a DECLARED assertion excluded from
 * a selection is still reported in the summary of the whole corpus.
 *
 * RUNTIME IS AN INPUT, NOT A DISCOVERY
 *
 * The caller says which runtime it is — `NODE` or `WORKERD` — and the harness
 * refuses, at SELECTION time, any case whose assertion kinds need a runtime
 * the caller does not have. That refusal is a `SELECTION` failure naming the
 * cases and the runtime they need; nothing is executed, nothing is reported
 * PASSED, FAILED or NOT_EXECUTED for them. A missing runtime API is an
 * environment mismatch, and an environment mismatch is never a result about
 * the corpus. Coverage totals therefore always come from a runtime that could
 * execute every selected case.
 *
 * DETERMINISM
 *
 * Cases and assertions are enumerated in the loader's order — code-point order
 * of ids, manifest ordinal within a case — and executed sequentially. Nothing
 * here reads a clock, the environment, or a random source; nothing writes a
 * file; nothing caches across calls. Two runs over the same file table produce
 * structurally identical results.
 *
 * Each run creates its own `CorpusExecutionContext` and hands it to every
 * assertion: an executor that needs one expensive derivation for many
 * assertions computes it once THERE, and the context dies with the run. It is
 * the only place a value outlives a single assertion, and nothing outlives the
 * run.
 */

import { ASSERTION_KINDS, OWNING_LAYER_IDS, type ExecutionRuntime, type OwningLayer } from "./contract.js";
import { createExecutionContext, type CorpusExecutionContext } from "./execution-context.js";
import { executeAssertion } from "./executors.js";
import {
  committedCorpusFiles,
  validateCorpus,
  type CorpusError,
  type CorpusFileTable,
  type LoadedAssertion,
  type LoadedCase,
  type LoadedCorpus,
} from "./loader.js";

export type AssertionStatus = "PASSED" | "FAILED" | "NOT_EXECUTED";

/** One executed (or declared) assertion, addressed stably by case and ordinal. */
export interface AssertionResult {
  readonly caseId: string;
  readonly artifactId: string;
  readonly owningLayer: OwningLayer;
  /** The assertion's ordinal within its case's manifest list. Stable while the manifest is. */
  readonly assertionOrdinal: number;
  readonly kind: string;
  readonly status: AssertionStatus;
  /** Present on FAILED. Small structured facts, never a payload dump. */
  readonly detail?: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly locator?: unknown;
}

export interface LayerSummary {
  readonly owningLayer: OwningLayer;
  readonly cases: number;
  readonly passed: number;
  readonly failed: number;
  readonly notExecuted: number;
}

export interface HarnessSummary {
  readonly cases: number;
  readonly assertions: number;
  readonly passed: number;
  readonly failed: number;
  readonly notExecuted: number;
  readonly byLayer: readonly LayerSummary[];
}

export type HarnessSelection =
  | { readonly kind: "VALIDATE_ONLY" }
  | { readonly kind: "CASE"; readonly caseId: string }
  | { readonly kind: "LAYER"; readonly owningLayer: OwningLayer }
  | { readonly kind: "ALL" };

/** The runtime the caller is executing in. Stated, never sniffed. */
export type HarnessRuntime = "NODE" | "WORKERD";

/** What the harness runs each assertion with. Injectable so a test can prove exception handling. */
export type AssertionExecutor = typeof executeAssertion;

export interface HarnessOptions {
  readonly runtime: HarnessRuntime;
  /** Defaults to the real dispatcher. A test double proves the harness's own behaviour. */
  readonly execute?: AssertionExecutor;
}

export type HarnessResult =
  /** The corpus did not validate. Nothing was executed. */
  | { readonly ok: false; readonly stage: "VALIDATION"; readonly errors: readonly CorpusError[] }
  /**
   * The selection named nothing, or named a case the stated runtime cannot
   * execute. Distinct from "everything passed", and nothing was executed.
   */
  | { readonly ok: false; readonly stage: "SELECTION"; readonly detail: string }
  | {
      readonly ok: true;
      readonly selection: HarnessSelection;
      readonly runtime: HarnessRuntime;
      readonly results: readonly AssertionResult[];
      readonly summary: HarnessSummary;
      /**
       * True only when the selection ran with zero FAILED and zero NOT_EXECUTED.
       * A DECLARED assertion inside the selection makes it false.
       */
      readonly complete: boolean;
      /** The whole corpus's declared-but-unexecutable count, whatever was selected. */
      readonly declaredInCorpus: number;
    };

function selectCases(corpus: LoadedCorpus, selection: HarnessSelection): readonly LoadedCase[] {
  switch (selection.kind) {
    case "VALIDATE_ONLY":
      return [];
    case "CASE":
      return corpus.cases.filter((entry) => entry.record.caseId === selection.caseId);
    case "LAYER":
      return corpus.cases.filter((entry) => entry.record.owningLayer === selection.owningLayer);
    case "ALL":
      return corpus.cases;
  }
}

/** The runtime an assertion kind needs, as the registry declares it. */
function runtimeNeededBy(kind: LoadedAssertion["kind"]): ExecutionRuntime {
  return ASSERTION_KINDS[kind].runtime;
}

/** Cases the stated runtime cannot execute, with the kinds that need more. */
function incompatibleCases(
  selected: readonly LoadedCase[],
  runtime: HarnessRuntime,
): readonly { readonly caseId: string; readonly kinds: readonly string[] }[] {
  if (runtime === "WORKERD") return [];
  const refused: { caseId: string; kinds: string[] }[] = [];
  for (const kase of selected) {
    const kinds = kase.assertions
      .filter((assertion) => runtimeNeededBy(assertion.kind) === "WORKERD")
      .map((assertion) => assertion.kind);
    if (kinds.length > 0) refused.push({ caseId: kase.record.caseId, kinds: [...new Set(kinds)] });
  }
  return refused;
}

async function runAssertion(
  corpus: LoadedCorpus,
  kase: LoadedCase,
  assertion: LoadedAssertion,
  ordinal: number,
  execute: AssertionExecutor,
  context: CorpusExecutionContext,
): Promise<AssertionResult> {
  const base = {
    caseId: kase.record.caseId,
    artifactId: kase.artifact.record.artifactId,
    owningLayer: kase.record.owningLayer,
    assertionOrdinal: ordinal,
    kind: assertion.kind,
  };
  if (assertion.execution === "DECLARED") {
    return {
      ...base,
      status: "NOT_EXECUTED",
      detail: "registered as DECLARED; no executor exists for this kind",
    };
  }
  let outcome: Awaited<ReturnType<AssertionExecutor>>;
  try {
    outcome = await execute(corpus, kase, assertion, context);
  } catch (error) {
    // An executor that throws has not proven anything either way. It is a
    // FAILED assertion with the throw as its detail — never a crash that takes
    // the rest of the run with it, and never a pass.
    return {
      ...base,
      status: "FAILED",
      detail: `executor threw: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (outcome.ok === true) return { ...base, status: "PASSED" };
  if (outcome.ok === "DECLARED") {
    // The registry says EXECUTABLE and the dispatcher disagrees. Not a pass.
    return {
      ...base,
      status: "NOT_EXECUTED",
      detail: "the dispatcher has no executor for a kind the registry calls EXECUTABLE",
    };
  }
  return {
    ...base,
    status: "FAILED",
    detail: outcome.detail,
    ...(outcome.expected === undefined ? {} : { expected: outcome.expected }),
    ...(outcome.actual === undefined ? {} : { actual: outcome.actual }),
    ...(outcome.locator === undefined ? {} : { locator: outcome.locator }),
  };
}

function summarize(selected: readonly LoadedCase[], results: readonly AssertionResult[]): HarnessSummary {
  const byLayer: LayerSummary[] = [];
  for (const owningLayer of OWNING_LAYER_IDS) {
    const layerResults = results.filter((result) => result.owningLayer === owningLayer);
    const layerCases = selected.filter((entry) => entry.record.owningLayer === owningLayer).length;
    if (layerCases === 0 && layerResults.length === 0) continue;
    byLayer.push({
      owningLayer,
      cases: layerCases,
      passed: layerResults.filter((result) => result.status === "PASSED").length,
      failed: layerResults.filter((result) => result.status === "FAILED").length,
      notExecuted: layerResults.filter((result) => result.status === "NOT_EXECUTED").length,
    });
  }
  return {
    cases: selected.length,
    assertions: results.length,
    passed: results.filter((result) => result.status === "PASSED").length,
    failed: results.filter((result) => result.status === "FAILED").length,
    notExecuted: results.filter((result) => result.status === "NOT_EXECUTED").length,
    byLayer,
  };
}

/**
 * Validates, selects, executes, reports. Pure over its inputs.
 *
 * `files` defaults to the committed corpus. A test hands in an in-memory table
 * to prove a failure mode without touching committed evidence. `options.runtime`
 * is required: the harness never guesses where it is running.
 */
export async function runCorpusHarness(
  selection: HarnessSelection,
  options: HarnessOptions,
  files: CorpusFileTable = committedCorpusFiles(),
): Promise<HarnessResult> {
  const validation = await validateCorpus(files);
  if (!validation.ok) return { ok: false, stage: "VALIDATION", errors: validation.errors };
  return executeLoadedCorpus(validation.corpus, selection, options);
}

/**
 * Selects, executes and reports over an ALREADY VALIDATED root — the
 * regression corpus, or the evidence archive with the corpus it depends on
 * (M11-C4e, `tests/support/corpus/evidence-archive.ts`). The one execution
 * path both roots share; nothing here knows which root it is running.
 */
export async function executeLoadedCorpus(
  corpus: LoadedCorpus,
  selection: HarnessSelection,
  options: HarnessOptions,
): Promise<HarnessResult> {
  const selected = selectCases(corpus, selection);
  if (selection.kind === "CASE" && selected.length === 0) {
    return { ok: false, stage: "SELECTION", detail: `no case with id ${selection.caseId}` };
  }
  if (selection.kind === "LAYER" && selected.length === 0) {
    return { ok: false, stage: "SELECTION", detail: `no case owned by ${selection.owningLayer}` };
  }
  const refused = incompatibleCases(selected, options.runtime);
  if (refused.length > 0) {
    return {
      ok: false,
      stage: "SELECTION",
      detail:
        `the ${options.runtime} runtime cannot execute ${String(refused.length)} selected case(s); run them in the workers project: ` +
        refused.map((entry) => `${entry.caseId} [${entry.kinds.join(", ")}]`).join("; "),
    };
  }

  const execute = options.execute ?? executeAssertion;
  const context = createExecutionContext();
  const results: AssertionResult[] = [];
  for (const kase of selected) {
    for (const [ordinal, assertion] of kase.assertions.entries()) {
      results.push(await runAssertion(corpus, kase, assertion, ordinal, execute, context));
    }
  }
  const summary = summarize(selected, results);
  return {
    ok: true,
    selection,
    runtime: options.runtime,
    results,
    summary,
    complete: summary.failed === 0 && summary.notExecuted === 0,
    declaredInCorpus: corpus.coverage.declared,
  };
}

/** One line per non-passing assertion, for a test's failure message. */
export function describeFailures(result: HarnessResult): string {
  if (!result.ok) {
    return result.stage === "VALIDATION"
      ? result.errors.map((error) => `[${error.code}] ${error.message}`).join("\n")
      : `[SELECTION] ${result.detail}`;
  }
  return result.results
    .filter((entry) => entry.status !== "PASSED")
    .map(
      (entry) =>
        `[${entry.status}] ${entry.caseId} #${String(entry.assertionOrdinal)} ${entry.kind} (${entry.owningLayer}, ${entry.artifactId})` +
        (entry.detail === undefined ? "" : `\n    ${entry.detail}`) +
        (entry.expected === undefined ? "" : `\n    expected: ${JSON.stringify(entry.expected)}`) +
        (entry.actual === undefined ? "" : `\n    actual:   ${JSON.stringify(entry.actual)}`) +
        (entry.locator === undefined ? "" : `\n    locator:  ${JSON.stringify(entry.locator)}`),
    )
    .join("\n");
}

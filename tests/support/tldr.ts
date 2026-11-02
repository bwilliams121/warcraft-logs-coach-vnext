import { buildFightReport, type FightReport } from "../../src/reporting/fight-report.js";
import { buildFightTldr, type FightTldr, type TldrInput } from "../../src/reporting/tldr.js";
import type { FightAnalysis } from "../../src/services/result.js";

/**
 * The TLDR (M15-B) and the report (M15-D) the single-fight service builds
 * beside an analysis, from the same fields, for tests that construct an
 * expected `FightAnalysis`. Their own behavior is proven in
 * `tests/unit/m15b-fight-tldr.test.ts` and `tests/unit/m15d-fight-report.test.ts`.
 */
function presentationInputOf(analysis: Omit<FightAnalysis, "tldr" | "report">): TldrInput {
  const envelope = analysis.analysis;
  const view = analysis.observedDecisions;
  if (envelope.status === "ANALYZED" && view === null) throw new Error("ANALYZED without a view");
  const { diagnosis } = analysis;
  return {
    gameplay:
      envelope.status === "ANALYZED" && view !== null
        ? {
            status: "ANALYZED",
            specId: envelope.specId,
            authorityId: envelope.authority.authorityId,
            view,
          }
        : { status: envelope.status === "ANALYZED" ? "INSUFFICIENT_EVIDENCE" : envelope.status },
    preparation: analysis.preparation,
    diagnosis:
      diagnosis === undefined
        ? null
        : diagnosis.state === "ASSESSED"
          ? { assessment: "ASSESSED", statements: diagnosis.diagnosis.coverage.statements }
          : { assessment: "NOT_ASSESSED", reason: diagnosis.reason },
  };
}

export function expectedTldrOf(analysis: Omit<FightAnalysis, "tldr" | "report">): FightTldr {
  return buildFightTldr(presentationInputOf(analysis));
}

export function expectedReportOf(analysis: Omit<FightAnalysis, "tldr" | "report">): FightReport {
  return buildFightReport(presentationInputOf(analysis));
}

/** The analysis with the TLDR and the report the service would attach. */
export function withExpectedTldr<T extends Omit<FightAnalysis, "tldr" | "report">>(
  analysis: T,
): T & { tldr: FightTldr; report: FightReport } {
  return { ...analysis, tldr: expectedTldrOf(analysis), report: expectedReportOf(analysis) };
}

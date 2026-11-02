import { buildFightTldr, type FightTldr } from "../../src/reporting/tldr.js";
import type { FightAnalysis } from "../../src/services/result.js";

/**
 * The TLDR the single-fight service builds beside an analysis (M15-B), from
 * the same fields, for tests that construct an expected `FightAnalysis`. The
 * TLDR's own behavior is proven in `tests/unit/m15b-fight-tldr.test.ts`.
 */
export function expectedTldrOf(analysis: Omit<FightAnalysis, "tldr">): FightTldr {
  const envelope = analysis.analysis;
  const view = analysis.observedDecisions;
  if (envelope.status === "ANALYZED" && view === null) throw new Error("ANALYZED without a view");
  const { diagnosis } = analysis;
  return buildFightTldr({
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
  });
}

/** The analysis with the TLDR the service would attach. */
export function withExpectedTldr<T extends Omit<FightAnalysis, "tldr">>(
  analysis: T,
): T & { tldr: FightTldr } {
  return { ...analysis, tldr: expectedTldrOf(analysis) };
}

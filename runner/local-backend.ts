/**
 * LOCAL SIMULATION BACKEND (M11-G3-5): the runner service in this process,
 * behind the same `SimulationBackend` contract as the REMOTE client and
 * settled through the same `settleTicket`, so a LOCAL run accepts exactly what
 * a REMOTE run would. No HTTP, no auth (there is no boundary to cross).
 */

import {
  settleTicket,
  type BackendRun,
  type SimulationBackend,
  type SimulationRequest,
} from "../src/simulation/backend.js";
import type { ApprovedEngineArtifact } from "../src/simulation/model.js";
import { expectedResultIdentity } from "../src/simulation/result-verification.js";
import type { SimulationSpecBinding } from "../src/simulation/spec-binding.js";
import type { SimulationService } from "./service/service.js";

export class LocalSimulationBackend implements SimulationBackend {
  readonly kind = "LOCAL";

  constructor(
    private readonly service: SimulationService,
    /** The approved artifacts results are verified against (the job names its model). */
    private readonly artifacts: readonly ApprovedEngineArtifact[],
    private readonly bindings: readonly SimulationSpecBinding[],
  ) {}

  async simulate(request: SimulationRequest, signal?: AbortSignal): Promise<BackendRun> {
    const jobBytes = new TextEncoder().encode(JSON.stringify(request.job) ?? "").byteLength;
    const expected = await expectedResultIdentity(request.job, jobBytes, this.artifacts, this.bindings);
    if (!expected.ok) return { backend: "LOCAL", outcome: expected };
    const submission = await this.service.submit({
      job: request.job,
      rawByteLength: jobBytes,
      ...(request.readiness === undefined ? {} : { readiness: request.readiness }),
    });
    if (!submission.accepted) {
      return { backend: "LOCAL", outcome: { ok: false, failure: submission.rejected.failure } };
    }
    const jobId = submission.ticket.jobId;
    const onAbort = () => this.service.cancel(jobId);
    signal?.addEventListener("abort", onAbort);
    try {
      if (signal?.aborted === true) onAbort();
      const ticket = await this.service.waitFor(jobId);
      if (ticket === null)
        return {
          backend: "LOCAL",
          outcome: { ok: false, failure: { code: "RUNNER_UNAVAILABLE", detail: "ticket lost" } },
        };
      return settleTicket("LOCAL", ticket, expected.value);
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

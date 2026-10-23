/**
 * PRODUCTION READINESS ATTESTATION (M11-G3-5 final hardening).
 *
 * The Worker is the authoritative readiness/publishability policy engine: it
 * runs the G3-2 profile gate and the G3-4 environment gate. The runner NEVER
 * re-runs them. A PRODUCTION job therefore carries an attestation binding the
 * EXACT semantic job (its profile and environment hashes) to the gate
 * REVISIONS that declared it ready. The runner (an authenticated boundary)
 * only checks, in order:
 *
 *   schema version   current attestation schema            JOB_REJECTED
 *   job class        PRODUCTION, and the job is PRODUCTION JOB_REJECTED
 *   hashes           equal the hashes recomputed from the job JOB_REJECTED
 *   gate revisions   in the accepted (current) set           JOB_REJECTED
 *   statuses         SIMULATION_READY / PUBLISHABLE          PROFILE_RECONSTRUCTION_FAILED /
 *                                                            ENVIRONMENT_NOT_REPRESENTABLE
 *
 * Changing what a gate MEANS requires a new gate revision. An attestation made
 * under a revision the runner does not accept is refused — an old attestation
 * is never silently honoured under a new policy. The gate-owned revision
 * constants (src/character-profile/fidelity.ts, src/environment/publishability.ts)
 * must equal the accepted ones here; tests/contracts/m11g35-readiness-gate-revisions.test.ts
 * enforces that, and pins each gate's code fingerprint so a gate change forces
 * an explicit revision decision.
 *
 * Worker-safe: zod only.
 */

import { z } from "zod";

import { fail, type SimulationOutcome } from "./failures.js";

export const READINESS_ATTESTATION_SCHEMA_VERSION = "simulation-readiness-attestation/2";

/**
 * Gate revisions this runner accepts. One current revision each: when a gate's
 * meaning changes, its revision moves and attestations under the old one are
 * refused. (A transition window would list both, deliberately and reviewed.)
 */
export const ACCEPTED_READINESS_GATE_REVISIONS = {
  profile: ["profile-readiness-gate/1"],
  environment: ["environment-publishability-gate/1"],
} as const;

const hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const revision = z.string().regex(/^[a-z][a-z0-9-]{0,63}\/[0-9]{1,6}$/);

export const readinessAttestationSchema = z
  .object({
    schemaVersion: z.literal(READINESS_ATTESTATION_SCHEMA_VERSION),
    jobClass: z.literal("PRODUCTION"),
    profile: z
      .object({
        hash: hex64,
        status: z.enum(["SIMULATION_READY", "NOT_SIMULATION_READY"]),
        gateRevision: revision,
      })
      .strict(),
    environment: z
      .object({
        hash: hex64,
        status: z.enum(["PUBLISHABLE", "BLOCKED"]),
        gateRevision: revision,
      })
      .strict(),
  })
  .strict();
export type ReadinessAttestation = z.infer<typeof readinessAttestationSchema>;

/**
 * Checks an untrusted attestation for a PRODUCTION job whose hashes the runner
 * recomputed. Returns null when it is acceptable, otherwise the typed failure.
 */
export function checkReadinessAttestation(
  value: unknown,
  recomputed: { readonly profileHash: string; readonly environmentHash: string },
): SimulationOutcome<never> | null {
  if (value === undefined) return fail("JOB_REJECTED", "a PRODUCTION job requires a readiness attestation");
  const version = (value as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (version !== READINESS_ATTESTATION_SCHEMA_VERSION) {
    return fail(
      "JOB_REJECTED",
      `readiness attestation schema ${typeof version === "string" ? version.slice(0, 64) : "(missing)"} is not ${READINESS_ATTESTATION_SCHEMA_VERSION}`,
    );
  }
  const parsed = readinessAttestationSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(
      "JOB_REJECTED",
      `readiness attestation: ${issue?.path.join(".") ?? "(root)"} ${issue?.code ?? "invalid"}`,
    );
  }
  const attestation = parsed.data;
  if (
    attestation.profile.hash !== recomputed.profileHash ||
    attestation.environment.hash !== recomputed.environmentHash
  ) {
    return fail("JOB_REJECTED", "readiness attestation does not describe this job");
  }
  if (
    !(ACCEPTED_READINESS_GATE_REVISIONS.profile as readonly string[]).includes(
      attestation.profile.gateRevision,
    )
  ) {
    return fail(
      "JOB_REJECTED",
      `profile gate revision ${attestation.profile.gateRevision} is not accepted (current: ${ACCEPTED_READINESS_GATE_REVISIONS.profile.join(", ")})`,
    );
  }
  if (
    !(ACCEPTED_READINESS_GATE_REVISIONS.environment as readonly string[]).includes(
      attestation.environment.gateRevision,
    )
  ) {
    return fail(
      "JOB_REJECTED",
      `environment gate revision ${attestation.environment.gateRevision} is not accepted (current: ${ACCEPTED_READINESS_GATE_REVISIONS.environment.join(", ")})`,
    );
  }
  if (attestation.profile.status !== "SIMULATION_READY") {
    return fail("PROFILE_RECONSTRUCTION_FAILED", "character profile is not SIMULATION_READY");
  }
  if (attestation.environment.status !== "PUBLISHABLE") {
    return fail("ENVIRONMENT_NOT_REPRESENTABLE", "environment is not PUBLISHABLE");
  }
  return null;
}

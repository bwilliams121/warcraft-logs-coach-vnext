/**
 * M11-G4-3: the engine's profile echo travels through the runner.
 *
 * - The parser attaches `profileEcho` to a LOGGED_FIDELITY_PROBE result, and
 *   only to it (parser revision V3). It is exactly what `extractProfileEcho`
 *   reads from the same report.
 * - Verification requires the echo exactly when the job is a probe, against a
 *   strict schema.
 * - LOCAL and REMOTE backends both deliver it.
 * - The production job-class default still refuses probes, so the CHARACTER
 *   gate fails closed there, explicitly (JOB_REJECTED).
 * - Through a probe-enabled runner, stage A reaches the fidelity verdict on a
 *   TRANSPORTED echo.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { LocalSimulationBackend } from "../../../runner/local-backend.js";
import { RUNNER_MODEL_VALIDATIONS, RUNNER_SPEC_BINDINGS } from "../../../runner/spec-bindings.js";
import { fidelityProbeJob } from "../../../src/character-profile/simulation-character.js";
import { reconstructCharacterProfile } from "../../../src/character-profile/reconstruct.js";
import type { CharacterProfile } from "../../../src/character-profile/profile.js";
import {
  assessPublicationReadiness,
  backendProfileEchoSource,
  type PublicationSpecBinding,
} from "../../../src/publication/pipeline.js";
import { simulationModelById } from "../../../src/simulation/model-registry.js";
import { prepareSimulation } from "../../../src/simulation/prepare.js";
import { extractProfileEcho } from "../../../src/simulation/profile-echo.js";
import { parseSimcJson, RESULT_PARSER_REVISION } from "../../../src/simulation/result-parser.js";
import {
  expectedResultIdentity,
  verifySimulationResult,
} from "../../../src/simulation/result-verification.js";
import { RemoteSimulationBackend } from "../../../src/simulation-client/remote-client.js";
import { COMMITTED_DEPLOY_CALENDAR_EVIDENCE } from "../../../src/simulation-context/evidence.js";
import { BLOOD_CHARACTER_BINDING } from "../../../src/specs/deathknight/blood/character-binding.js";
import { BLOOD_ENVIRONMENT_FACTS_BY_MODEL } from "../../../src/specs/deathknight/blood/environment-facts.js";
import userRaceGolden from "../../fixtures/simulation/simc-0a72e6a7-blood-subject-fidelity-user-race.json";
import devGolden from "../../fixtures/simulation/simc-0a72e6a7-blood-dev-standard.json";
import {
  reconstructionInputOf,
  subjectEvidence,
  withOwnerStatements,
  type FightEvidence,
} from "../../support/character/subject.js";
import {
  subjectContextFight,
  subjectEnvironmentInput,
  subjectRegion,
} from "../../support/environment/subject-environment.js";
import { devBloodJob, jsonBytes } from "../../support/simulation/dev-blood-job.js";
import {
  FAKE_ARTIFACT,
  FAKE_ARTIFACT_NEW,
  httpService,
  inProcessFetch,
  NEW_MODEL_ID,
  startedService,
  TEST_KEY_ID,
  TEST_SECRET,
} from "../../support/simulation/runner-service.js";

type Json = Record<string, any>;
const model = simulationModelById(NEW_MODEL_ID);
if (model === undefined) throw new Error("registry");
const ARTIFACTS = [FAKE_ARTIFACT, FAKE_ARTIFACT_NEW];

let evidence: FightEvidence;
let stated: CharacterProfile;

beforeAll(async () => {
  evidence = await subjectEvidence();
  stated = reconstructCharacterProfile(
    withOwnerStatements(reconstructionInputOf(evidence, NEW_MODEL_ID)),
    BLOOD_CHARACTER_BINDING,
  );
});

/** The stated canonical probe job on the promoted model (the golden's job). */
function probeJob(): Json {
  const job = fidelityProbeJob(
    stated,
    BLOOD_CHARACTER_BINDING,
    model?.pin ?? { simcCommit: "", gameDataBuild: "" },
  );
  if (!job.ok) throw new Error(job.failure.detail);
  return job.value as Json;
}

/** Parses a golden through the production parser with `job`'s prepared context. */
async function parseWith(job: Json, golden: Json, approved = model?.artifact) {
  const prepared = await prepareSimulation(
    job,
    jsonBytes(job),
    [model?.artifact ?? FAKE_ARTIFACT],
    RUNNER_SPEC_BINDINGS,
  );
  if (!prepared.ok || approved === undefined) throw new Error("prepare");
  const text = JSON.stringify(golden);
  return parseSimcJson(text, text.length, {
    job: prepared.value.job,
    binding: prepared.value.binding,
    profile: prepared.value.profile,
    policy: prepared.value.policy,
    approved,
    executedBinarySha256: approved.binarySha256,
    profileHash: prepared.value.keys.profileHash,
    environmentHash: prepared.value.keys.environmentHash,
    executionProfileRevision: prepared.value.keys.executionProfileRevision,
  });
}

describe("parser and verification", () => {
  it("parser V3: a probe result carries exactly the echo extractProfileEcho reads from the same report", async () => {
    expect(RESULT_PARSER_REVISION).toBe("SIMC_JSON_2_PARSER_V3");
    const parsed = await parseWith(probeJob(), userRaceGolden);
    if (!parsed.ok) throw new Error(parsed.failure.detail);
    const direct = extractProfileEcho(JSON.stringify(userRaceGolden));
    if (!direct.ok) throw new Error(direct.failure.detail);
    expect(parsed.value.profileEcho).toEqual(direct.value);
    expect(parsed.value.profileEcho?.race).toBe("dwarf");
  });

  it("a non-probe result carries no echo", async () => {
    const parsed = await parseWith(
      devBloodJob("STANDARD_SIM_V1", "SIMC_DEFAULT_PINNED", NEW_MODEL_ID) as Json,
      devGolden,
    );
    if (!parsed.ok) throw new Error(parsed.failure.detail);
    expect(parsed.value.profileEcho).toBeUndefined();
  });

  it("verification requires the echo exactly on probes, against a strict schema", async () => {
    const job = probeJob();
    const parsed = await parseWith(job, userRaceGolden);
    if (!parsed.ok) throw new Error(parsed.failure.detail);
    const expected = await expectedResultIdentity(
      job,
      jsonBytes(job),
      [model?.artifact ?? FAKE_ARTIFACT],
      RUNNER_SPEC_BINDINGS,
    );
    if (!expected.ok) throw new Error(expected.failure.detail);
    expect(verifySimulationResult(parsed.value, expected.value).ok).toBe(true);
    const { profileEcho: _dropped, ...withoutEcho } = parsed.value;
    expect(verifySimulationResult(withoutEcho, expected.value)).toMatchObject({
      ok: false,
      failure: {
        code: "MODEL_PROVENANCE_MISMATCH",
        detail: "result profileEcho presence does not match the job",
      },
    });
    const malformed = { ...parsed.value, profileEcho: { ...parsed.value.profileEcho, extra: 1 } };
    expect(verifySimulationResult(malformed, expected.value)).toMatchObject({
      ok: false,
      failure: { code: "SIMULATION_OUTPUT_MALFORMED" },
    });
    // An echo on a non-probe result is refused too.
    const devJob = devBloodJob("STANDARD_SIM_V1", "SIMC_DEFAULT_PINNED", NEW_MODEL_ID) as Json;
    const devParsed = await parseWith(devJob, devGolden);
    if (!devParsed.ok) throw new Error(devParsed.failure.detail);
    const devExpected = await expectedResultIdentity(
      devJob,
      jsonBytes(devJob),
      [model?.artifact ?? FAKE_ARTIFACT],
      RUNNER_SPEC_BINDINGS,
    );
    if (!devExpected.ok) throw new Error(devExpected.failure.detail);
    expect(
      verifySimulationResult(
        { ...devParsed.value, profileEcho: parsed.value.profileEcho },
        devExpected.value,
      ),
    ).toMatchObject({
      ok: false,
      failure: { code: "MODEL_PROVENANCE_MISMATCH" },
    });
  });
});

describe("transport through the runner (fake engine)", () => {
  it("LOCAL and REMOTE both deliver the echo of a probe run on a probe-enabled runner", async () => {
    const local = await startedService({
      models: ["NEW"],
      allowedJobClasses: ["PRODUCTION", "FIDELITY_PROBE"],
    });
    const remote = await httpService({
      models: ["NEW"],
      allowedJobClasses: ["PRODUCTION", "FIDELITY_PROBE"],
    });
    const job = probeJob();
    const viaLocal = await backendProfileEchoSource(
      new LocalSimulationBackend(local.service, ARTIFACTS, RUNNER_SPEC_BINDINGS),
    )(job as never, model as never);
    const viaRemote = await backendProfileEchoSource(
      new RemoteSimulationBackend({
        baseUrl: "https://runner.test.invalid",
        keyId: TEST_KEY_ID,
        secret: TEST_SECRET,
        artifacts: ARTIFACTS,
        bindings: RUNNER_SPEC_BINDINGS,
        pollIntervalMs: 5,
        deadlineMs: 20_000,
        maxResubmits: 1,
        fetch: inProcessFetch(() => remote.handler),
      }),
    )(job as never, model as never);
    if (viaLocal === null || viaRemote === null) throw new Error("source");
    const [l, r] = [await viaLocal, await viaRemote];
    if (!l.ok || !r.ok) throw new Error("echo");
    expect(r.value).toEqual(l.value);
    // The fake engine echoes the job's own race, level and talents.
    expect(l.value).toMatchObject({
      race: "dwarf",
      level: 90,
      talents: job["character"]["talents"]["importString"],
    });
  });

  it("the production job-class default refuses the probe: JOB_REJECTED, never an echo", async () => {
    const production = await startedService({ models: ["NEW"], allowedJobClasses: ["PRODUCTION"] });
    const source = backendProfileEchoSource(
      new LocalSimulationBackend(production.service, ARTIFACTS, RUNNER_SPEC_BINDINGS),
    );
    const outcome = await source(probeJob() as never, model as never);
    expect(outcome).toMatchObject({ ok: false, failure: { code: "JOB_REJECTED" } });
  });

  it("stage A through a probe-enabled runner reaches the fidelity verdict on the TRANSPORTED echo", async () => {
    // The fake engine's echo is synthetic (fixed item levels and stats), so
    // fidelity does not MATCH: the point is that CHARACTER is decided by the
    // gate on a transported echo, not by an unavailable or failed probe.
    const runner = await startedService({
      models: ["NEW"],
      allowedJobClasses: ["PRODUCTION", "FIDELITY_PROBE"],
    });
    const binding: PublicationSpecBinding = {
      specKey: "deathknight/blood",
      character: BLOOD_CHARACTER_BINDING,
      environmentFactsByModel: BLOOD_ENVIRONMENT_FACTS_BY_MODEL,
    };
    const environmentInput = await subjectEnvironmentInput(NEW_MODEL_ID);
    const { fight, reportStartUnixMs } = subjectContextFight();
    const backend = new LocalSimulationBackend(runner.service, ARTIFACTS, RUNNER_SPEC_BINDINGS);
    const outcome = await assessPublicationReadiness(
      binding,
      {
        fight: {
          report: { startTimeUnixMs: reportStartUnixMs, region: subjectRegion() },
          fight: { startTimeMs: fight.startTime },
        },
        characterInputFor: (data) =>
          withOwnerStatements(reconstructionInputOf(evidence, data.manifest.modelId)),
        environmentInputFor: (_data, applicability) => ({
          ...environmentInput,
          modelApplicability: applicability,
        }),
        observed: { state: "UNKNOWN", reason: "not needed" },
      },
      {
        deployEvidence: COMMITTED_DEPLOY_CALENDAR_EVIDENCE,
        modelValidations: RUNNER_MODEL_VALIDATIONS,
        profileEcho: backendProfileEchoSource(backend),
        backend,
        artifacts: ARTIFACTS,
        simulationBindings: RUNNER_SPEC_BINDINGS,
      },
    );
    if (outcome.ok) throw new Error("expected NOT_PUBLISHED");
    expect(outcome.publication.gate?.gate).toBe("CHARACTER");
    expect(outcome.publication.gate?.code).toBe("PROFILE_NOT_SIMULATION_READY");
  });
});

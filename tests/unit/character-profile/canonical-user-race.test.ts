/**
 * M11-G3-4: the owner's USER_PROVIDED race for the canonical subject
 * (tests/fixtures/character/canonical-subject-user-statements.json), and the
 * exact-pin fidelity echo of the subject run with it
 * (tests/fixtures/simulation/simc-33622e9d-blood-subject-fidelity-user-race.json,
 * re-cut only by scripts/bench/m11g32-profile-fidelity.bench.ts).
 *
 * The statement resolves the character side only. It is never evidence, the
 * statement-free subject stays RACE_UNRESOLVED, and the environment's own
 * readiness and publishability do not move.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { approvedArtifactForPin } from "../../../src/simulation/approved-artifacts.js";
import { assessProfileFidelity, GATED_CHECKS } from "../../../src/character-profile/fidelity.js";
import type { CharacterProfile } from "../../../src/character-profile/profile.js";
import { extractProfileEcho } from "../../../src/simulation/profile-echo.js";
import { readCombatantPullFacts } from "../../../src/character-profile/pull-facts.js";
import { reconstructCharacterProfile } from "../../../src/character-profile/reconstruct.js";
import { fidelityProbeJob } from "../../../src/character-profile/simulation-character.js";
import { assessEnvironmentPublishability } from "../../../src/environment/publishability.js";
import { reconstructEnvironment } from "../../../src/environment/reconstruct.js";
import { prepareSimulation } from "../../../src/simulation/prepare.js";
import { BLOOD_CHARACTER_BINDING } from "../../../src/specs/deathknight/blood/character-binding.js";
import { BLOOD_ENVIRONMENT_FACTS } from "../../../src/specs/deathknight/blood/environment-facts.js";
import golden from "../../fixtures/simulation/simc-33622e9d-blood-subject-fidelity-user-race.json";
import statements from "../../fixtures/character/canonical-subject-user-statements.json";
import {
  reconstructionInputOf,
  subjectEvidence,
  withOwnerStatements,
} from "../../support/character/subject.js";
import { subjectEnvironmentInput } from "../../support/environment/subject-environment.js";
import { jsonBytes } from "../../support/simulation/dev-blood-job.js";
import { DEV_SIMULATION_MODEL_ID, modelPin } from "../../support/simulation/dev-blood-job.js";

/** The historical simulation model these tests were written against (M11 model registry). */
const HISTORICAL_MODEL = modelPin(DEV_SIMULATION_MODEL_ID);

const binding = BLOOD_CHARACTER_BINDING;
let plain: CharacterProfile;
let stated: CharacterProfile;
let pull: ReturnType<typeof readCombatantPullFacts>;

beforeAll(async () => {
  const evidence = await subjectEvidence();
  const input = reconstructionInputOf(evidence);
  plain = reconstructCharacterProfile(input, binding);
  stated = reconstructCharacterProfile(withOwnerStatements(input), binding);
  pull = readCombatantPullFacts(evidence.rawCombatantInfo);
}, 120_000);

describe("M11-G3-4 canonical subject: owner-stated race", () => {
  it("the statement is the owner's, USER_PROVIDED, with provenance — never evidence", () => {
    expect(statements.race.value).toBe("dwarf");
    expect(stated.identity.race).toEqual({
      state: "USER_PROVIDED",
      value: "dwarf",
      provenance: statements.race.provenance,
    });
    expect(stated.blockers).toEqual([]);
    expect(stated.reconstructionStatus).toBe("AWAITING_FIDELITY");
    // Without the statement nothing changes: no default, no inference.
    expect(plain.identity.race.state).toBe("UNKNOWN");
    expect(plain.blockers.map((b) => b.code)).toEqual(["RACE_UNRESOLVED"]);
  });

  it("the golden is the approved engine running the stated subject's own probe job, race dwarf", async () => {
    const artifact = approvedArtifactForPin(HISTORICAL_MODEL);
    if (artifact === undefined) throw new Error("no artifact");
    const job = fidelityProbeJob(stated, binding, HISTORICAL_MODEL);
    if (!job.ok) throw new Error(job.failure.detail);
    expect(job.value.character.race).toBe("dwarf");
    const prepared = await prepareSimulation(job.value, jsonBytes(job.value), artifact, [binding.simulation]);
    if (!prepared.ok) throw new Error(prepared.failure.detail);
    expect(prepared.value.keys.profileHash).toBe(golden._golden.jobProfileHash);
  });

  it("fidelity on the exact-pin echo: every gated check MATCHes, including race — SIMULATION_READY", () => {
    const extracted = extractProfileEcho(JSON.stringify(golden));
    if (!extracted.ok) throw new Error(extracted.failure.detail);
    expect(extracted.value.race).toBe("dwarf");
    const result = assessProfileFidelity(stated, binding, extracted.value, pull);
    for (const name of GATED_CHECKS) expect(result.checks[name].state, name).toBe("MATCH");
    expect(result.status).toBe("MATCH");
    expect(result.readiness).toBe("SIMULATION_READY");
    expect(result.blockers).toEqual([]);
    expect(result.checks.stats.state).toBe("STAT_RECONCILIATION_NOT_PROVEN");
  });

  it("the character becoming ready moves nothing on the environment side", async () => {
    const environment = reconstructEnvironment(await subjectEnvironmentInput());
    expect(environment.status).toBe("NOT_REPRESENTABLE");
    expect(assessEnvironmentPublishability(environment, BLOOD_ENVIRONMENT_FACTS).status).toBe("BLOCKED");
  });
});

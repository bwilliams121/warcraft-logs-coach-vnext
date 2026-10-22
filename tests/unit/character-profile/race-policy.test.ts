/**
 * M11-G3-4 owner race policy, on the canonical subject:
 *
 *   1. resolve from authoritative evidence if possible (none exists: G3-2 audit);
 *   2. otherwise an explicit USER_PROVIDED race, provenance kept;
 *   3. no default race, no production race=none, no all-races range.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { semanticProfileHash } from "../../../src/character-profile/profile-hash.js";
import {
  reconstructCharacterProfile,
  type ReconstructionInput,
} from "../../../src/character-profile/reconstruct.js";
import { fidelityProbeJob } from "../../../src/character-profile/simulation-character.js";
import { BLOOD_CHARACTER_BINDING } from "../../../src/specs/deathknight/blood/character-binding.js";
import { reconstructionInputOf, subjectEvidence } from "../../support/character/subject.js";

let input: ReconstructionInput;

beforeAll(async () => {
  input = reconstructionInputOf(await subjectEvidence());
}, 120_000);

const provenance = (reference: string) => ({
  source: "USER_PROVIDED" as const,
  reference,
  providedAt: "2026-10-22T00:00:00Z",
});
const withRace = (value: string, reference = "statement-1") => ({
  ...input,
  userProvided: { race: { value, provenance: provenance(reference) } },
});

describe("M11-G3-4 race policy", () => {
  it("no authoritative evidence and no statement: UNKNOWN and RACE_UNRESOLVED — never a default", () => {
    const profile = reconstructCharacterProfile(input, BLOOD_CHARACTER_BINDING);
    expect(profile.identity.race.state).toBe("UNKNOWN");
    expect(profile.blockers.map((b) => b.code)).toEqual(["RACE_UNRESOLVED"]);
  });

  it("an explicit USER_PROVIDED race resolves it, keeps its provenance, and is never upgraded to KNOWN", () => {
    const profile = reconstructCharacterProfile(withRace("blood_elf"), BLOOD_CHARACTER_BINDING);
    expect(profile.identity.race).toEqual({
      state: "USER_PROVIDED",
      value: "blood_elf",
      provenance: provenance("statement-1"),
    });
    expect(profile.blockers).toEqual([]);
    expect(profile.reconstructionStatus).toBe("AWAITING_FIDELITY");
    expect(profile.diagnostics.map((d) => d.code)).toContain("RACE_USER_PROVIDED");
  });

  it('"none", an unknown race, or a non-user provenance is refused and stays unresolved', () => {
    for (const value of ["none", "orcish", ""]) {
      const profile = reconstructCharacterProfile(withRace(value), BLOOD_CHARACTER_BINDING);
      expect(profile.identity.race.state, value).toBe("UNKNOWN");
      expect(
        profile.blockers.map((b) => b.code),
        value,
      ).toEqual(["RACE_USER_PROVIDED_INVALID", "RACE_UNRESOLVED"]);
    }
    const forged = {
      ...input,
      userProvided: {
        race: { value: "orc", provenance: { ...provenance("x"), source: "WCL_COMBATANTINFO" as never } },
      },
    };
    expect(reconstructCharacterProfile(forged, BLOOD_CHARACTER_BINDING).identity.race.state).toBe("UNKNOWN");
  });

  it("the semantic hash covers the stated race, not who stated it or when", async () => {
    const hash = async (value: ReconstructionInput) =>
      await semanticProfileHash(reconstructCharacterProfile(value, BLOOD_CHARACTER_BINDING));
    const unresolved = await hash(input);
    const orc = await hash(withRace("orc", "a"));
    expect(orc).not.toBe(unresolved);
    expect(await hash(withRace("orc", "b"))).toBe(orc);
    expect(await hash(withRace("troll", "a"))).not.toBe(orc);
  });

  it("a probe job carries the stated race, not the probe-only 'none'", () => {
    const job = fidelityProbeJob(
      reconstructCharacterProfile(withRace("orc"), BLOOD_CHARACTER_BINDING),
      BLOOD_CHARACTER_BINDING,
    );
    if (!job.ok) throw new Error(job.failure.detail);
    expect(job.value.character.race).toBe("orc");
  });

  it("no module builds an all-races range", () => {
    const dirs = ["src/character-profile", "src/environment", "src/simulation"];
    for (const dir of dirs) {
      for (const file of readdirSync(dir, { recursive: false, withFileTypes: false }).filter((name) =>
        name.endsWith(".ts"),
      )) {
        const code = readFileSync(join(dir, file), "utf8");
        expect(code, `${dir}/${file}`).not.toMatch(/PLAYABLE_RACES\s*\.\s*(map|flatMap|forEach|reduce)\(/);
        expect(code, `${dir}/${file}`).not.toMatch(/for\s*\(\s*const\s+\w+\s+of\s+PLAYABLE_RACES\b/);
      }
    }
  });
});

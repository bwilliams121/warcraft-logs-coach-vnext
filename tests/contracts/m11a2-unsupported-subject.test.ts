/**
 * M11-A2: the current real unsupported subject is proven from committed
 * evidence, is unsupported everywhere production decides support, and
 * cannot silently outlive its own eligibility.
 *
 * FOUR THINGS, ALL MECHANICAL
 *
 *   1. IDENTITY. The fixture's actor exists in the committed fight-context
 *      artifact, is a Player, and carries exactly the class and spec the
 *      fixture claims — read from `masterData.actors[].subType` and the
 *      fight's `friendlySpecs` index, never from the fixture itself.
 *   2. UNSUPPORTED TODAY. `resolveSpecIdentity` refuses it as
 *      UNSUPPORTED_SPECIALIZATION; the identity table, the public partition
 *      and the pinned roster agree it is a real specialization that this
 *      build has no name for.
 *   3. MIGRATION GUARD. The fixture's `observedSpecId` is not a `SpecId` —
 *      not public, not internal-only. The day a milestone adds it in either
 *      exposure, this test fails and names the fixture as what to migrate.
 *   4. CORPUS AGREEMENT. The manifest cases that pin the subject by
 *      coordinates (they are declarative JSON and cannot import a module)
 *      carry the same actor, class and spec as the fixture.
 */

import { describe, expect, it } from "vitest";

import { INTERNAL_ONLY_SPEC_IDS, isSpecId, PUBLIC_SPEC_IDS, SPEC_IDS } from "../../src/findings/spec-id.js";
import { rosterSpecialization } from "../../src/data/game/spec-roster.js";
import { resolveSpecIdentity, SUPPORTED_SPEC_IDENTITIES } from "../../src/services/spec-identity.js";
import { committedArtifactText, committedManifest } from "../support/corpus/artifacts.js";
import {
  CURRENT_UNSUPPORTED_SUBJECT,
  UNSUPPORTED_SUBJECT_CORPUS_CASES,
  UNSUPPORTED_WCL_IDENTITY,
} from "../support/unsupported-subject.js";

interface ContextActor {
  readonly id: number;
  readonly type: string;
  readonly subType: string;
}

interface ContextFight {
  readonly id: number;
  readonly friendlyPlayers: readonly number[];
  readonly friendlySpecs: readonly string[];
}

function committedContext(): { readonly actors: readonly ContextActor[]; readonly fight: ContextFight } {
  const raw = JSON.parse(committedArtifactText(CURRENT_UNSUPPORTED_SUBJECT.contextArtifactId)) as {
    readonly reportData: {
      readonly report: {
        readonly masterData: { readonly actors: readonly ContextActor[] };
        readonly fights: readonly ContextFight[];
      };
    };
  };
  const report = raw.reportData.report;
  const fight = report.fights.find((candidate) => candidate.id === CURRENT_UNSUPPORTED_SUBJECT.fightId);
  if (fight === undefined)
    throw new Error(`fight ${String(CURRENT_UNSUPPORTED_SUBJECT.fightId)} not in the artifact`);
  return { actors: report.masterData.actors, fight };
}

describe("the current unsupported subject is what the committed capture says it is", () => {
  const { actors, fight } = committedContext();
  const actor = actors.find((candidate) => candidate.id === CURRENT_UNSUPPORTED_SUBJECT.sourceId);

  it("exists in the committed master data and is a Player of the expected class", () => {
    expect(actor).toBeDefined();
    expect(actor?.type).toBe("Player");
    expect(actor?.subType).toBe(CURRENT_UNSUPPORTED_SUBJECT.expectedClassName);
  });

  it("participated in the fight with the expected specialization, per friendlySpecs", () => {
    const index = fight.friendlyPlayers.indexOf(CURRENT_UNSUPPORTED_SUBJECT.sourceId);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(fight.friendlySpecs[index]).toBe(CURRENT_UNSUPPORTED_SUBJECT.expectedSpecName);
  });

  it("names a real specialization of the pinned roster, so it is unsupported and not unreal", () => {
    // A subject that named a spec the game does not have would prove nothing
    // about the unsupported path; the roster says this one exists.
    expect(rosterSpecialization(CURRENT_UNSUPPORTED_SUBJECT.observedSpecId)).not.toBeNull();
    expect(CURRENT_UNSUPPORTED_SUBJECT.observedSpecId).toBe(
      `${CURRENT_UNSUPPORTED_SUBJECT.expectedClassName}/${CURRENT_UNSUPPORTED_SUBJECT.expectedSpecName}`.toLowerCase(),
    );
  });
});

describe("the current unsupported subject is unsupported everywhere production decides support", () => {
  it("resolveSpecIdentity refuses it as UNSUPPORTED_SPECIALIZATION with the observed pair", () => {
    expect(resolveSpecIdentity(UNSUPPORTED_WCL_IDENTITY)).toEqual({
      ok: false,
      reason: "UNSUPPORTED_SPECIALIZATION",
      observed: {
        className: CURRENT_UNSUPPORTED_SUBJECT.expectedClassName.toLowerCase(),
        specName: CURRENT_UNSUPPORTED_SUBJECT.expectedSpecName.toLowerCase(),
      },
    });
  });

  it("is absent from the identity table", () => {
    expect(Object.keys(SUPPORTED_SPEC_IDENTITIES)).not.toContain(CURRENT_UNSUPPORTED_SUBJECT.observedSpecId);
  });

  it("MIGRATION GUARD: its spec is not a SpecId in any exposure — migrate the fixture before adding it", () => {
    const observed = CURRENT_UNSUPPORTED_SUBJECT.observedSpecId;
    const where = `${observed} is now a SpecId; tests/support/unsupported-subject.ts must be migrated to a specialization outside SPEC_IDS before this id can exist`;
    expect(isSpecId(observed), where).toBe(false);
    expect([...SPEC_IDS] as readonly string[], where).not.toContain(observed);
    expect([...PUBLIC_SPEC_IDS] as readonly string[], where).not.toContain(observed);
    expect([...INTERNAL_ONLY_SPEC_IDS] as readonly string[], where).not.toContain(observed);
  });

  it("is scoped to M11 and says so", () => {
    expect(CURRENT_UNSUPPORTED_SUBJECT.scopedToMilestone).toBe("M11");
    expect(CURRENT_UNSUPPORTED_SUBJECT.eligibilityNote.length).toBeGreaterThan(0);
  });
});

describe("the corpus cases that pin the subject agree with the fixture", () => {
  const manifest = committedManifest();

  it.each(UNSUPPORTED_SUBJECT_CORPUS_CASES)("%s", (caseId) => {
    const kase = manifest.cases.find((candidate) => candidate.caseId === caseId);
    expect(kase, `${caseId} is not in the manifest`).toBeDefined();
    for (const assertion of kase?.assertions ?? []) {
      const params = assertion.params as { readonly subject?: Record<string, unknown> };
      expect(params.subject, `${caseId} pins no subject`).toEqual({
        actorId: CURRENT_UNSUPPORTED_SUBJECT.sourceId,
        className: CURRENT_UNSUPPORTED_SUBJECT.expectedClassName,
        specName: CURRENT_UNSUPPORTED_SUBJECT.expectedSpecName,
      });
    }
  });

  it("the mixed raid-night parity case lists the subject as a participant", () => {
    const kase = manifest.cases.find(
      (candidate) =>
        candidate.caseId === "public-contract.raid-night-parity-mixed-roster-over-the-a7r6-opener",
    );
    expect(kase).toBeDefined();
    const params = kase?.assertions[0]?.params as {
      readonly composition?: { readonly participants?: readonly Record<string, unknown>[] };
    };
    const participant = params.composition?.participants?.find(
      (row) => row["sourceId"] === CURRENT_UNSUPPORTED_SUBJECT.sourceId,
    );
    expect(participant).toMatchObject({
      className: CURRENT_UNSUPPORTED_SUBJECT.expectedClassName,
      specName: CURRENT_UNSUPPORTED_SUBJECT.expectedSpecName,
    });
  });

  it("every case whose subject names the unsupported pair is either listed here or a declared identity premise", () => {
    // Two M9-C cases place the unsupported IDENTITY over another actor's
    // evidence (actor 19, the Assassination Rogue) to prove the service
    // retrieves nothing for an unsupported spec whatever the events hold.
    // That is a declared identity premise, recorded here so it is a decision
    // rather than an unnoticed pairing; it is not the real subject.
    const pinned = new Set(UNSUPPORTED_SUBJECT_CORPUS_CASES);
    const premises = new Set([
      "application-service.unsupported-spec-runs-no-analyzer-and-retrieves-nothing",
      "public-contract.analysis-parity-for-an-unsupported-spec",
    ]);
    const naming = manifest.cases.filter((kase) =>
      kase.assertions.some((assertion) => {
        const subject = (assertion.params as { readonly subject?: Record<string, unknown> }).subject;
        return (
          subject?.["className"] === CURRENT_UNSUPPORTED_SUBJECT.expectedClassName &&
          subject?.["specName"] === CURRENT_UNSUPPORTED_SUBJECT.expectedSpecName
        );
      }),
    );
    for (const kase of naming) {
      expect(pinned.has(kase.caseId) || premises.has(kase.caseId), kase.caseId).toBe(true);
      if (premises.has(kase.caseId)) {
        for (const assertion of kase.assertions) {
          const subject = (assertion.params as { readonly subject?: Record<string, unknown> }).subject;
          expect(subject?.["actorId"], kase.caseId).not.toBe(CURRENT_UNSUPPORTED_SUBJECT.sourceId);
        }
      }
    }
  });
});

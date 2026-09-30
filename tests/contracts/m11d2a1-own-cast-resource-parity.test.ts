import { describe, expect, it } from "vitest";

import { resourceWireTypeFor, type ResourceId } from "../../src/data/wcl-wire/resource-types.js";
import type { CombatState } from "../../src/engine/state/combat-state.js";
import { acceptExactPreCost } from "../../src/findings/resources/exact-pre-cost.js";
import { ownCastResourceAt, type OwnCastResource } from "../../src/findings/resources/own-cast-resource.js";
import {
  bloodResourceOn,
  runeCount,
  runicPowerDeficitPoints,
  type BloodResourceObservation,
} from "../../src/specs/deathknight/blood/resources.js";
import { holyPowerOn } from "../../src/specs/paladin/retribution/holy-power.js";
import { adaptComboPoints, adaptEnergyPct } from "../../src/specs/rogue/assassination/envenom-decision.js";
import { committedManifest } from "../support/corpus/artifacts.js";
import { corpusState } from "../support/corpus/fight.js";

/**
 * M11-D2-A1 — the shared own-cast reader is behaviourally equivalent to every
 * specialization reader it generalizes, over every committed capture.
 *
 * THE DOMAIN. Each specialization reader is only ever called by its analyzer
 * on the actor's own COMPLETED cast, so that is the overlap: every completed
 * cast in every committed `WCL_EVENT_ARRAY` artifact, for its own source
 * actor, and for all five modelled resources — not only the actors whose
 * specialization owns the reader, because none of the readers is
 * specialization-conditional in what it reads. Every committed capture is
 * `gameVersion` 1 / `logVersion` 17, the contracts' one scope, so the Paladin
 * readers' missing version check is not exercised: equality is proven inside
 * that pinned domain only, and the shared reader keeps its own check.
 *
 * WHAT "EQUIVALENT" MEANS, PER READER
 *
 *   Blood / Holy Power   EXACT_PRE_COST on exactly the same casts; amount, max
 *                        and cost verbatim equal; Runic Power's deficit in
 *                        points and the Rune count equal the Blood helpers'
 *   Combo points         accepted-and-adapted on exactly the same casts;
 *                        amount, max and deficit equal
 *   Energy               accepted-and-adapted on exactly the same casts;
 *                        `energy.pct` equals the ratio of the shared reader's
 *                        wire amount and maximum
 *
 * The shared reader is STRICTER by construction (own-source cast, caster-side
 * snapshot, maximum required, counts whole). Any cast it refuses where an old
 * reader accepted is counted and must be zero on this evidence; the reverse
 * — the shared reader accepting what an old reader refused — is never allowed.
 */

const RESOURCES: readonly ResourceId[] = ["COMBO_POINTS", "ENERGY", "HOLY_POWER", "RUNES", "RUNIC_POWER"];
const KEYS = { gameVersion: 1, logVersion: 17 } as const;

function wireTypeOf(resourceId: ResourceId): number {
  const resolved = resourceWireTypeFor(resourceId, KEYS);
  if (!resolved.ok) throw new Error(`no contract for ${resourceId}`);
  return resolved.wireType;
}

const EVENT_ARTIFACTS = committedManifest()
  .artifacts.filter((artifact) => artifact.payloadKind === "WCL_EVENT_ARRAY")
  .map((artifact) => artifact.artifactId)
  .sort();

interface OwnCast {
  readonly artifactId: string;
  readonly state: CombatState;
  readonly position: number;
  readonly actorId: number;
}

function ownCompletedCasts(): readonly OwnCast[] {
  const casts: OwnCast[] = [];
  for (const artifactId of EVENT_ARTIFACTS) {
    const state = corpusState(artifactId);
    state.fight.events.forEach((event, position) => {
      if (event.kind !== "CAST" || event.castPhase !== "COMPLETE" || event.source === null) return;
      casts.push({ artifactId, state, position, actorId: event.source.actorId });
    });
  }
  return casts;
}

const CASTS = ownCompletedCasts();

function shared(cast: OwnCast, resourceId: ResourceId): OwnCastResource {
  return ownCastResourceAt(cast.state, { position: cast.position, actorId: cast.actorId, resourceId });
}

interface Tally {
  compared: number;
  bothExact: number;
  bothRefused: number;
  sharedStricter: number;
  sharedLooser: number;
  valueMismatches: number;
}

const tally = (): Tally => ({
  compared: 0,
  bothExact: 0,
  bothRefused: 0,
  sharedStricter: 0,
  sharedLooser: 0,
  valueMismatches: 0,
});

function recordAcceptance(t: Tally, oldExact: boolean, sharedResult: OwnCastResource): boolean {
  t.compared += 1;
  const sharedExact = sharedResult.state === "EXACT_PRE_COST";
  if (oldExact && sharedExact) t.bothExact += 1;
  else if (!oldExact && !sharedExact) t.bothRefused += 1;
  else if (oldExact) t.sharedStricter += 1;
  else t.sharedLooser += 1;
  return oldExact && sharedExact;
}

/** The Blood / Holy Power observation shape against the shared reader. */
function compareObservation(
  t: Tally,
  old: BloodResourceObservation,
  sharedResult: OwnCastResource,
  extra: (sharedResult: Extract<OwnCastResource, { state: "EXACT_PRE_COST" }>) => boolean = () => true,
): void {
  if (!recordAcceptance(t, old.state === "EXACT_PRE_COST", sharedResult)) return;
  if (old.state !== "EXACT_PRE_COST" || sharedResult.state !== "EXACT_PRE_COST") return;
  const equal =
    old.amount === sharedResult.wireAmount &&
    old.max === sharedResult.wireMax &&
    old.cost === sharedResult.wireCost &&
    extra(sharedResult);
  if (!equal) t.valueMismatches += 1;
}

const RESULTS = (() => {
  const runicPower = tally();
  const runes = tally();
  const holyPower = tally();
  const comboPoints = tally();
  const energy = tally();
  for (const cast of CASTS) {
    const at = (resourceId: ResourceId) =>
      [cast.state, cast.position, cast.actorId, wireTypeOf(resourceId)] as const;

    const rpOld = bloodResourceOn(...at("RUNIC_POWER"));
    compareObservation(
      runicPower,
      rpOld,
      shared(cast, "RUNIC_POWER"),
      (s) => runicPowerDeficitPoints(rpOld) === s.deficit,
    );

    const runesOld = bloodResourceOn(...at("RUNES"));
    compareObservation(runes, runesOld, shared(cast, "RUNES"), (s) => runeCount(runesOld) === s.amount);

    compareObservation(holyPower, holyPowerOn(...at("HOLY_POWER")), shared(cast, "HOLY_POWER"));

    const comboAccepted = acceptExactPreCost(
      cast.state.resources.observationOnEvent(...(at("COMBO_POINTS").slice(1) as [number, number, number])),
    );
    const comboAdapted = comboAccepted.accepted
      ? adaptComboPoints(comboAccepted.observation, "COMBO_POINTS")
      : null;
    const comboShared = shared(cast, "COMBO_POINTS");
    if (recordAcceptance(comboPoints, comboAdapted?.ok === true, comboShared)) {
      if (comboAdapted?.ok === true && comboShared.state === "EXACT_PRE_COST") {
        const equal =
          comboAdapted.state.observedAmount === comboShared.amount &&
          comboAdapted.state.observedMax === comboShared.max &&
          comboAdapted.state.derivedDeficit === comboShared.deficit;
        if (!equal) comboPoints.valueMismatches += 1;
      }
    }

    const energyAccepted = acceptExactPreCost(
      cast.state.resources.observationOnEvent(...(at("ENERGY").slice(1) as [number, number, number])),
    );
    const energyAdapted = energyAccepted.accepted
      ? adaptEnergyPct(energyAccepted.observation, "ENERGY")
      : null;
    const energyShared = shared(cast, "ENERGY");
    if (recordAcceptance(energy, energyAdapted?.ok === true, energyShared)) {
      if (energyAdapted?.ok === true && energyShared.state === "EXACT_PRE_COST") {
        const equal =
          energyAdapted.percent === (energyShared.wireAmount / energyShared.wireMax) * 100 &&
          energyAdapted.state.observedAmount === energyShared.amount;
        if (!equal) energy.valueMismatches += 1;
      }
    }
  }
  return { runicPower, runes, holyPower, comboPoints, energy };
})();

describe("the shared own-cast reader over every committed capture", () => {
  it("enumerated the committed event captures, all inside the contracts' one version scope", () => {
    expect(EVENT_ARTIFACTS.length).toBeGreaterThanOrEqual(36);
    expect(CASTS.length).toBeGreaterThan(1000);
    for (const artifactId of EVENT_ARTIFACTS) {
      const { provenance } = corpusState(artifactId).fight;
      expect([provenance.gameVersion, provenance.logVersion], artifactId).toEqual([1, 17]);
    }
  });

  it.each(Object.entries(RESULTS))(
    "%s: equivalent to the specialization reader on every cast",
    (_name, t) => {
      expect(t.compared).toBe(CASTS.length);
      expect(t.bothExact).toBeGreaterThan(0);
      expect(t.valueMismatches).toBe(0);
      expect(t.sharedLooser).toBe(0);
      expect(t.sharedStricter).toBe(0);
      expect(t.bothExact + t.bothRefused).toBe(t.compared);
    },
  );

  it("never accepts a cast its specialization readers' callers would not have passed", () => {
    // Beyond the overlap: any cast event — either phase, any source or none —
    // whose snapshot describes an actor OTHER than its source. Asked about the
    // actor described, the shared reader refuses every one; the specialization
    // readers were never asked, because their callers pass own casts only.
    let asked = 0;
    for (const artifactId of EVENT_ARTIFACTS) {
      const state = corpusState(artifactId);
      state.fight.events.forEach((event, position) => {
        if (event.kind !== "CAST") return;
        const described = event.attachedResources?.actor?.actorId;
        if (described === undefined || described === event.source?.actorId) return;
        for (const resourceId of RESOURCES) {
          asked += 1;
          const result = ownCastResourceAt(state, { position, actorId: described, resourceId });
          expect(result.state, `${artifactId}@${String(position)}`).toBe("REFUSED");
          if (result.state === "REFUSED") {
            expect(["NOT_THE_ACTORS_OWN_CAST", "CAST_NOT_COMPLETED"]).toContain(result.reason);
          }
        }
      });
    }
    expect(asked).toBeGreaterThan(0);
  });
});

/**
 * Protection Paladin reads Holy Power through a MODULE-PRIVATE `holyPowerOn`,
 * which no test can import. Its equivalence is proven by identity instead: its
 * body is Retribution's exported reader, verbatim apart from the parameter's
 * name, so the Holy Power comparison above covers it too.
 */
const SOURCES: Record<string, string> = {
  ...import.meta.glob("../../src/specs/paladin/protection/observed-analysis.ts", {
    eager: true,
    query: "?raw",
    import: "default",
  }),
  ...import.meta.glob("../../src/specs/paladin/retribution/holy-power.ts", {
    eager: true,
    query: "?raw",
    import: "default",
  }),
};

function holyPowerOnBody(path: string): string {
  const source = SOURCES[path] ?? "";
  const match = /function holyPowerOn\(([\s\S]*?)\n}\n/.exec(source);
  if (match === null) throw new Error(`holyPowerOn not found in ${path}`);
  return (match[1] ?? "")
    .replace(/holyPowerWireType/g, "wireType")
    .replace(/\s+/g, " ")
    .trim();
}

describe("Protection's private Holy Power reader is Retribution's", () => {
  it("has the same body, apart from the wire-type parameter's name", () => {
    expect(holyPowerOnBody("../../src/specs/paladin/protection/observed-analysis.ts")).toBe(
      holyPowerOnBody("../../src/specs/paladin/retribution/holy-power.ts"),
    );
  });
});

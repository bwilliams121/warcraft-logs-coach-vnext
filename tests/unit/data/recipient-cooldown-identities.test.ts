/**
 * M13-C: the shared, reviewed recipient cooldown identity registry
 * (src/data/game/recipient-cooldown-identities.*).
 *
 * The registry restates ids that specialization-owned datasets already pin,
 * because a specialization evaluator may not import another
 * specialization's data (m11a2-cross-spec-isolation R3). That is only safe if
 * the restatement cannot drift, so this test, which may import every
 * dataset, re-derives each entry from its named source by its named
 * criterion and requires the result to be exactly the listed ids.
 *
 * The negative cases: an unstated specialization is UNKNOWN, a stated one
 * with no reviewed data is UNSUPPORTED, and neither is ever an empty list; a
 * specialization name shared by two classes is told apart by the class.
 */

import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { pinnedBloodDeathKnightCooldowns } from "../../../src/data/game/deathknight-blood-cooldowns.js";
import { pinnedBrewmasterMonkCooldowns } from "../../../src/data/game/monk-brewmaster-cooldowns.js";
import { pinnedProtectionPaladinCooldowns } from "../../../src/data/game/paladin-protection-cooldowns.js";
import { pinnedRetributionPaladinCooldowns } from "../../../src/data/game/paladin-retribution-cooldowns.js";
import artifactJson from "../../../src/data/game/recipient-cooldown-identities.json";
import {
  parseRecipientCooldownIdentities,
  pinnedRecipientCooldownIdentities,
  recipientCooldownIdentityOf,
  type RecipientCooldownSpecialization,
} from "../../../src/data/game/recipient-cooldown-identities.js";
import { pinnedRogueCooldowns } from "../../../src/data/game/rogue-cooldowns.js";
import { pinnedRestorationShamanHealingCooldowns } from "../../../src/data/game/shaman-restoration-healing-cooldowns.js";
import { rosterSpecialization } from "../../../src/data/game/spec-roster.js";

const PIN = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";

function registry() {
  const loaded = pinnedRecipientCooldownIdentities();
  if (!loaded.ok) throw new Error(loaded.reason);
  return loaded;
}

interface SourceView {
  readonly datasetId: string;
  readonly artifactRevision: string;
  readonly commitSha: string;
  readonly abilities: readonly {
    readonly abilityGameId: number;
    readonly displayNameEn: string;
    readonly baseCooldownMs: number | null;
    readonly chargeCooldownMs: number | null;
  }[];
}

/** Each source dataset, through its own loader, reduced to what a criterion reads. */
function sourceOf(datasetId: string): SourceView {
  const ability = (load: ReturnType<typeof pinnedRetributionPaladinCooldowns>, id: string): SourceView => {
    if (!load.ok) throw new Error(`${id}: ${load.reason}`);
    return {
      datasetId: id,
      artifactRevision: load.artifactRevision,
      commitSha: load.commitSha,
      abilities: load.abilities.map((entry) => ({
        abilityGameId: entry.abilityGameId,
        displayNameEn: entry.displayNameEn,
        baseCooldownMs: entry.baseCooldownMs,
        chargeCooldownMs: entry.chargeCooldownMs,
      })),
    };
  };
  switch (datasetId) {
    case "SIMC_DBC_DEATHKNIGHT_BLOOD_ABILITY_COOLDOWNS":
      return ability(pinnedBloodDeathKnightCooldowns(), datasetId);
    case "SIMC_DBC_MONK_BREWMASTER_ABILITY_COOLDOWNS":
      return ability(pinnedBrewmasterMonkCooldowns(), datasetId);
    case "SIMC_DBC_PALADIN_PROTECTION_ABILITY_COOLDOWNS":
      return ability(pinnedProtectionPaladinCooldowns(), datasetId);
    case "SIMC_DBC_PALADIN_RETRIBUTION_ABILITY_COOLDOWNS":
      return ability(pinnedRetributionPaladinCooldowns(), datasetId);
    case "SIMC_DBC_ROGUE_ABILITY_COOLDOWNS": {
      const load = pinnedRogueCooldowns();
      if (!load.ok) throw new Error(load.reason);
      return {
        datasetId: load.artifact.datasetId,
        artifactRevision: load.artifact.artifactRevision,
        commitSha: load.artifact.provenance.commitSha,
        abilities: load.artifact.cooldowns.map((entry) => ({
          abilityGameId: entry.abilityGameId,
          displayNameEn: entry.displayNameEn,
          baseCooldownMs: entry.baseCooldownMs,
          chargeCooldownMs: entry.chargeCooldownMs,
        })),
      };
    }
    case "SIMC_DBC_SHAMAN_RESTORATION_HEALING_COOLDOWNS": {
      const load = pinnedRestorationShamanHealingCooldowns();
      if (!load.ok) throw new Error(load.reason);
      return {
        datasetId: load.datasetId,
        artifactRevision: load.artifactRevision,
        commitSha: load.commitSha,
        // This source claims no cooldown duration.
        abilities: load.cooldowns.map((entry) => ({
          abilityGameId: entry.abilityGameId,
          displayNameEn: entry.displayNameEn,
          baseCooldownMs: null,
          chargeCooldownMs: null,
        })),
      };
    }
    default:
      throw new Error(`no source loader for ${datasetId}`);
  }
}

/** The ids a criterion selects from a source, in source order. */
function selectedBy(entry: RecipientCooldownSpecialization, source: SourceView): readonly number[] {
  const { criteria } = registry();
  if (entry.criterion === "REVIEWED_HEALING_COOLDOWN") {
    return source.abilities.map((ability) => ability.abilityGameId);
  }
  const minimum = criteria.PINNED_COOLDOWN_AT_LEAST_60S.minimumCooldownMs;
  if (minimum === null) throw new Error("the 60 s criterion has no minimum");
  return source.abilities
    .filter(
      (ability) => (ability.baseCooldownMs ?? 0) >= minimum || (ability.chargeCooldownMs ?? 0) >= minimum,
    )
    .map((ability) => ability.abilityGameId);
}

describe("the committed registry", () => {
  it("loads with its SimulationCraft pin and covers exactly the specializations already pinned", () => {
    const loaded = registry();
    expect([loaded.commitSha, loaded.clientDataWowVersion]).toEqual([PIN, "12.1.0.69587"]);
    expect(loaded.criteria.PINNED_COOLDOWN_AT_LEAST_60S.minimumCooldownMs).toBe(60_000);
    expect(loaded.specializations.map((entry) => entry.rosterKey)).toEqual([
      "deathknight/blood",
      "monk/brewmaster",
      "paladin/protection",
      "paladin/retribution",
      "rogue/assassination",
      "shaman/restoration",
    ]);
  });

  it.each(registry().specializations.map((entry) => [entry.rosterKey, entry] as const))(
    "%s is exactly what its named source selects under its named criterion, at the same pin",
    (_key, entry) => {
      const source = sourceOf(entry.source.datasetId);
      expect(source.artifactRevision).toBe(entry.source.artifactRevision);
      expect(source.commitSha).toBe(registry().commitSha);
      expect(entry.cooldowns.map((cooldown) => cooldown.abilityGameId)).toEqual(selectedBy(entry, source));
      for (const cooldown of entry.cooldowns) {
        const row = source.abilities.find((ability) => ability.abilityGameId === cooldown.abilityGameId);
        expect(row?.displayNameEn, `${entry.rosterKey} ${String(cooldown.abilityGameId)}`).toBe(
          cooldown.displayNameEn,
        );
      }
      expect(rosterSpecialization(entry.rosterKey)?.simcSpecId).toBe(entry.simcSpecId);
    },
  );

  it.each(registry().specializations.map((entry) => [entry.rosterKey, entry] as const))(
    "%s: every committed context it cites states this class and specialization under its Warcraft Logs strings",
    (_key, entry) => {
      for (const path of entry.wclNameEvidence) {
        expect(existsSync(path), path).toBe(true);
        const json = JSON.parse(readFileSync(path, "utf8")) as {
          reportData: {
            report: {
              masterData: { actors: { id: number; subType: string }[] };
              fights: { friendlyPlayers: number[]; friendlySpecs: string[] }[];
            };
          };
        };
        const { report } = json.reportData;
        const classOf = new Map(report.masterData.actors.map((actor) => [actor.id, actor.subType]));
        const pairs = report.fights.flatMap((fight) =>
          fight.friendlyPlayers.map(
            (id, index) => `${String(classOf.get(id))}/${String(fight.friendlySpecs[index])}`,
          ),
        );
        expect(pairs, path).toContain(`${entry.wclClassName}/${entry.wclSpecName}`);
      }
    },
  );
});

describe("lookup by stated specialization", () => {
  const statedAs = (className: string, specName: string) =>
    ({ state: "STATED", className, specName, rosterIndex: 0 }) as const;

  it("IDENTIFIED carries the ids, the criterion, the source and the pin, as a REVIEWED_SUBSET", () => {
    expect(recipientCooldownIdentityOf(statedAs("DeathKnight", "Blood"))).toEqual({
      state: "IDENTIFIED",
      rosterKey: "deathknight/blood",
      simcSpecId: 250,
      abilityGameIds: [49028],
      cooldowns: [{ abilityGameId: 49028, displayNameEn: "Dancing Rune Weapon" }],
      coverage: "REVIEWED_SUBSET",
      criterion: "PINNED_COOLDOWN_AT_LEAST_60S",
      source: {
        datasetId: "SIMC_DBC_DEATHKNIGHT_BLOOD_ABILITY_COOLDOWNS",
        artifactRevision: "simc-33622e9d-1",
      },
      dataset: {
        datasetId: "REVIEWED_RECIPIENT_COOLDOWN_IDENTITIES",
        artifactRevision: "simc-33622e9d-m13c-1",
        commitSha: PIN,
        clientDataWowVersion: "12.1.0.69587",
      },
    });
  });

  it("a specialization that is not established is UNKNOWN with its reason, never a guess", () => {
    expect(recipientCooldownIdentityOf({ state: "UNKNOWN", reason: "NOT_IN_FRIENDLY_ROSTER" })).toEqual({
      state: "UNKNOWN",
      reason: "SPECIALIZATION_NOT_ESTABLISHED",
      specializationReason: "NOT_IN_FRIENDLY_ROSTER",
    });
  });

  it("a stated specialization with no reviewed data is UNSUPPORTED, never an empty list", () => {
    expect(recipientCooldownIdentityOf(statedAs("Warrior", "Arms"))).toEqual({
      state: "UNSUPPORTED",
      reason: "NO_REVIEWED_COOLDOWN_IDENTITY",
      className: "Warrior",
      specName: "Arms",
    });
  });

  it("the class tells a shared specialization name apart, and the match is exact", () => {
    expect(recipientCooldownIdentityOf(statedAs("Shaman", "Restoration")).state).toBe("IDENTIFIED");
    expect(recipientCooldownIdentityOf(statedAs("Druid", "Restoration")).state).toBe("UNSUPPORTED");
    // No case folding, no display-name spelling: "Death Knight" is not WCL's "DeathKnight".
    expect(recipientCooldownIdentityOf(statedAs("Death Knight", "Blood")).state).toBe("UNSUPPORTED");
    expect(recipientCooldownIdentityOf(statedAs("DeathKnight", "blood")).state).toBe("UNSUPPORTED");
  });

  it("an unusable registry is UNKNOWN, never an empty identity", () => {
    expect(
      recipientCooldownIdentityOf(statedAs("DeathKnight", "Blood"), { ok: false, reason: "NO_ENTRIES" }),
    ).toEqual({ state: "UNKNOWN", reason: "REGISTRY_UNAVAILABLE", detail: "NO_ENTRIES" });
  });
});

describe("the parser fails closed", () => {
  type Mutable = {
    datasetId: string;
    provenance: Record<string, unknown>;
    criteria: Record<string, unknown>;
    specializations: Record<string, unknown>[];
  };
  const tampered = (mutate: (artifact: Mutable) => void) => {
    const copy = structuredClone(artifactJson) as unknown as Mutable;
    mutate(copy);
    return parseRecipientCooldownIdentities(copy);
  };
  const first = (artifact: Mutable): Record<string, unknown> => {
    const entry = artifact.specializations[0];
    if (entry === undefined) throw new Error("no entry");
    return entry;
  };

  const cases: readonly (readonly [string, (artifact: Mutable) => void])[] = [
    ["DATASET_ID_MISMATCH", (a) => void (a.datasetId = "OTHER")],
    ["PROVENANCE_MISSING", (a) => void (a.provenance["commitSha"] = "33622e9d")],
    ["CRITERIA_INVALID", (a) => void delete a.criteria["REVIEWED_HEALING_COOLDOWN"]],
    ["NO_ENTRIES", (a) => void (a.specializations = [])],
    ["ROSTER_MISMATCH", (a) => void (first(a)["simcSpecId"] = 251)],
    ["ROSTER_MISMATCH", (a) => void (first(a)["rosterKey"] = "deathknight/tank")],
    ["ENTRY_INVALID", (a) => void (first(a)["cooldowns"] = [])],
    ["ENTRY_INVALID", (a) => void (first(a)["wclNameEvidence"] = [])],
    ["ENTRY_INVALID", (a) => void (first(a)["criterion"] = "LOOKS_LIKE_A_COOLDOWN")],
    [
      "DUPLICATE_SPECIALIZATION",
      (a) => void a.specializations.push({ ...first(a), rosterKey: "deathknight/frost", simcSpecId: 251 }),
    ],
    [
      "DUPLICATE_ABILITY",
      (a) =>
        void (first(a)["cooldowns"] = [
          { abilityGameId: 49028, displayNameEn: "Dancing Rune Weapon" },
          { abilityGameId: 49028, displayNameEn: "Dancing Rune Weapon" },
        ]),
    ],
  ];
  it.each(cases)("%s", (reason, mutate) => {
    expect(tampered(mutate)).toEqual({ ok: false, reason });
  });
});

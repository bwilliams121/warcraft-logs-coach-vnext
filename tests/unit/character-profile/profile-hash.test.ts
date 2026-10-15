/**
 * M11-G3-2: the semantic profile hash describes the character, not where its
 * evidence came from.
 */

import { beforeAll, describe, expect, it } from "vitest";

import type { CharacterProfile, EquipmentRecord } from "../../../src/character-profile/profile.js";
import { semanticProfileHash, semanticProfileView } from "../../../src/character-profile/profile-hash.js";
import { reconstructCharacterProfile } from "../../../src/character-profile/reconstruct.js";
import { BLOOD_CHARACTER_BINDING } from "../../../src/specs/deathknight/blood/character-binding.js";
import { reconstructionInputOf, subjectEvidence } from "../../support/character/subject.js";

let profile: CharacterProfile;
let hash: string;

beforeAll(async () => {
  profile = reconstructCharacterProfile(
    reconstructionInputOf(await subjectEvidence()),
    BLOOD_CHARACTER_BINDING,
  );
  hash = await semanticProfileHash(profile);
});

const withSlot = (name: string, change: (record: EquipmentRecord) => EquipmentRecord): CharacterProfile => ({
  ...profile,
  equipment: profile.equipment.map((record) => (record.slot === name ? change(record) : record)),
});

describe("M11-G3-2 semantic profile hash", () => {
  it("T. the canonical subject's hash is pinned", () => {
    expect(hash).toBe("994b04ef6c42ca3f7df37610ce419e310ddcaf751a6a920390ab52afbc3eebc5");
  });

  it("AA. same evidence -> same hash; provenance and report identity do not enter it", async () => {
    expect(await semanticProfileHash(structuredClone(profile))).toBe(hash);
    const moved: CharacterProfile = {
      ...profile,
      evidence: { subject: { fightRef: "OTHERREPORT#1", actorId: 99 }, documents: [] },
      diagnostics: [],
    };
    expect(await semanticProfileHash(moved)).toBe(hash);
    const text = JSON.stringify(semanticProfileView(profile));
    expect(text).not.toMatch(/b1PmaKrd6CDfzngc|fightRef|actorId|sha256|WCL_COMBATANTINFO|gear\[/);
  });

  it("AA. semantically irrelevant order does not perturb it (bonus ids, gems)", async () => {
    const reordered = withSlot("feet", (record) =>
      record.bonusIds.state === "KNOWN"
        ? { ...record, bonusIds: { ...record.bonusIds, value: [...record.bonusIds.value].reverse() } }
        : record,
    );
    expect(await semanticProfileHash(reordered)).toBe(hash);
    const gems = withSlot("neck", (record) =>
      record.gems.state === "KNOWN"
        ? { ...record, gems: { ...record.gems, value: [...record.gems.value].reverse() } }
        : record,
    );
    expect(await semanticProfileHash(gems)).toBe(hash);
  });

  it("AB. every semantic setup change moves it", async () => {
    const variants: [string, CharacterProfile][] = [
      [
        "item",
        withSlot("trinket2", (r) => ({
          ...r,
          itemId: { ...r.itemId, value: 1 } as EquipmentRecord["itemId"],
        })),
      ],
      [
        "item level",
        withSlot("head", (r) => ({
          ...r,
          itemLevel: { ...r.itemLevel, value: 324 } as EquipmentRecord["itemLevel"],
        })),
      ],
      [
        "dropped bonus id",
        withSlot("feet", (r) =>
          r.bonusIds.state === "KNOWN"
            ? { ...r, bonusIds: { ...r.bonusIds, value: r.bonusIds.value.slice(1) } }
            : r,
        ),
      ],
      [
        "gem",
        withSlot("neck", (r) => ({
          ...r,
          gems: { state: "KNOWN_NONE", source: { kind: "WCL_COMBATANTINFO", field: "x" }, basis: "x" },
        })),
      ],
      [
        "enchant",
        withSlot("head", (r) => ({
          ...r,
          permanentEnchant: { ...r.permanentEnchant, value: 1 } as EquipmentRecord["permanentEnchant"],
        })),
      ],
      [
        "UNKNOWN vs KNOWN_NONE",
        withSlot("neck", (r) => ({
          ...r,
          permanentEnchant: { state: "UNKNOWN", reason: "x", source: null },
        })),
      ],
      [
        "talents",
        {
          ...profile,
          talents: {
            ...profile.talents,
            importCode: {
              state: "KNOWN",
              value: "CoPAAAAAAAAAAAAAAAAAAAAAA",
              source: { kind: "WCL_FIGHT_CONTEXT", field: "x" },
            },
          },
        },
      ],
      [
        "race",
        {
          ...profile,
          identity: {
            ...profile.identity,
            race: { state: "KNOWN", value: "human", source: { kind: "WCL_COMBATANTINFO", field: "x" } },
          },
        },
      ],
    ];
    const seen = new Set([hash]);
    for (const [label, variant] of variants) {
      const next = await semanticProfileHash(variant);
      expect(seen.has(next), label).toBe(false);
      seen.add(next);
    }
  });
});

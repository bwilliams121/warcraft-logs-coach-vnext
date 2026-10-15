/**
 * The DEVELOPMENT Blood Death Knight simulation job (M11-G3-1).
 *
 * Test/benchmark data only — not the player contract, and not a
 * reconstruction of any player (G3-2 owns that). Every value is local and
 * pinned; nothing was fetched to build it:
 *
 * - gear and talents: the committed M11-E2 evidence (report b1PmaKrd6CDfzngc,
 *   fight 48, actor 15 `combatantinfo` in
 *   tests/evidence/artifacts/wcl-events/...seg-0-45.json, and the fight
 *   context's `talentImportCode`), in WCL's positional slot order. The empty
 *   off-hand (item 0) is omitted. Every item, gem and enchant id resolves in
 *   the pinned engine data (client data 12.1.0.69587).
 * - duration: that fight's 345,177 ms.
 * - race and consumables: the pinned shipped profile
 *   profiles/MID1/MID1_Death_Knight_Blood.simc @ 33622e9d. Race is a
 *   development choice (G3-1 does not resolve race).
 * - raid buffs none, Bloodlust at 5 s: explicit development values, not an
 *   "ideal raid" default.
 */

import { APPROVED_SIMC_MODEL } from "../../../src/simulation/model.js";
import { simulationPolicyById } from "../../../src/simulation/simulation-policy.js";

export const DEV_BLOOD_DURATION_MS = 345_177;

const KNOWN_NONE = { kind: "KNOWN_NONE" } as const;
const enchant = (enchantId: number) => ({ kind: "KNOWN", enchantId }) as const;
const gems = (...gemIds: number[]) => ({ kind: "KNOWN", gemIds }) as const;

export function devBloodJob(policyId = "STANDARD_SIM_V1", executionProfileId = "SIMC_DEFAULT_PINNED") {
  const policy = simulationPolicyById(policyId);
  if (policy === undefined) throw new Error(`unknown policy ${policyId}`);
  return {
    schemaVersion: "simulation-job/1",
    model: { simcCommit: APPROVED_SIMC_MODEL.simcCommit, gameDataBuild: APPROVED_SIMC_MODEL.gameDataBuild },
    character: {
      profileKind: "DEVELOPMENT_FIXTURE",
      spec: "deathknight/blood",
      level: 90,
      race: "mechagnome",
      talents: {
        importString:
          "CoPAAAAAAAAAAAAAAAAAAAAAAwYWGzMmxMjhZbmZmmZxMjxMGAAAAwMzMzMzMDzYMAYMzMzAAAYgBmxmGLbAWGwGgZMDAAYmBzwA",
      },
      gear: [
        {
          slot: "head",
          itemId: 271474,
          bonusIds: [6652, 13696, 13440, 13692, 13698, 12846],
          gems: KNOWN_NONE,
          enchant: enchant(7991),
        },
        {
          slot: "neck",
          itemId: 268265,
          bonusIds: [6652, 13668, 13334, 13987, 12854, 13696],
          gems: gems(240983, 240916),
          enchant: KNOWN_NONE,
        },
        {
          slot: "shoulders",
          itemId: 271472,
          bonusIds: [13335, 13694, 6652, 13697, 12851],
          gems: KNOWN_NONE,
          enchant: enchant(7973),
        },
        { slot: "shirt", itemId: 268274, bonusIds: [], gems: KNOWN_NONE, enchant: KNOWN_NONE },
        {
          slot: "chest",
          itemId: 271477,
          bonusIds: [13334, 6652, 12854, 13690, 13698, 1587],
          gems: KNOWN_NONE,
          enchant: enchant(7987),
        },
        {
          slot: "waist",
          itemId: 159442,
          bonusIds: [13440, 6652, 13696, 13662, 12699, 12846],
          gems: KNOWN_NONE,
          enchant: KNOWN_NONE,
        },
        {
          slot: "legs",
          itemId: 271473,
          bonusIds: [13334, 6652, 13708, 13693, 13698, 12854],
          gems: KNOWN_NONE,
          enchant: enchant(8159),
        },
        {
          slot: "feet",
          itemId: 237828,
          bonusIds: [12214, 13667, 12497, 13751, 14001, 8960, 12384, 8790, 13836],
          gems: KNOWN_NONE,
          enchant: enchant(8019),
        },
        {
          slot: "wrists",
          itemId: 237834,
          bonusIds: [12214, 13667, 13695, 12497, 13751, 14001, 8960, 12384, 8792, 13836, 13696],
          gems: gems(240916),
          enchant: KNOWN_NONE,
        },
        {
          slot: "hands",
          itemId: 271475,
          bonusIds: [6652, 13440, 13691, 13697, 12846],
          gems: KNOWN_NONE,
          enchant: KNOWN_NONE,
        },
        {
          slot: "finger1",
          itemId: 159459,
          bonusIds: [13440, 6652, 13668, 12699, 12846],
          gems: gems(240916),
          enchant: enchant(7967),
        },
        {
          slot: "finger2",
          itemId: 158366,
          bonusIds: [13440, 42, 13668, 12699, 12846],
          gems: gems(240916),
          enchant: enchant(7967),
        },
        {
          slot: "trinket1",
          itemId: 270173,
          bonusIds: [6652, 13334, 12854],
          gems: KNOWN_NONE,
          enchant: KNOWN_NONE,
        },
        {
          slot: "trinket2",
          itemId: 250245,
          bonusIds: [13440, 6652, 12699, 12846],
          gems: KNOWN_NONE,
          enchant: KNOWN_NONE,
        },
        {
          slot: "back",
          itemId: 271469,
          bonusIds: [13334, 6652, 12854, 13696],
          gems: KNOWN_NONE,
          enchant: KNOWN_NONE,
        },
        {
          slot: "main_hand",
          itemId: 237846,
          bonusIds: [12214, 12497, 13751, 14004, 12715, 8790, 13836],
          gems: KNOWN_NONE,
          enchant: enchant(6241),
        },
        { slot: "tabard", itemId: 167811, bonusIds: [], gems: KNOWN_NONE, enchant: KNOWN_NONE },
      ],
      consumables: {
        provenance: "DEVELOPMENT_FIXTURE",
        potion: "draught_of_rampant_abandon_2",
        flask: "flask_of_the_shattered_sun_2",
        food: "silvermoon_parade",
        augmentation: "void_touched",
        temporaryEnchants: [{ slot: "main_hand", enchant: "thalassian_phoenix_oil_2" }],
      },
    },
    environment: {
      durationPolicy: "FIXED_EXACT_OBSERVED",
      durationMs: DEV_BLOOD_DURATION_MS,
      primaryTarget: "SINGLE_TARGET",
      tankModel: "STANDARD_TANK_LOAD_V1",
      raidBuffs: { provenance: "DEVELOPMENT_FIXTURE", active: [] },
      bloodlust: { kind: "AT", provenance: "DEVELOPMENT_FIXTURE", atMs: 5_000 },
      additionalTargets: [],
    },
    executionProfileId,
    simulationPolicy: {
      policyId: policy.id,
      iterations: policy.iterations,
      seed: policy.seed,
      threads: policy.threads,
      deterministic: true,
      timeoutMs: policy.timeoutMs,
    },
    requestedOutputs: { actionBreakdown: true, petBreakdown: true },
  };
}

/** A fixed stand-in artifact for tests that never run an engine. */
export const TEST_ARTIFACT = {
  model: APPROVED_SIMC_MODEL,
  binarySha256: "0".repeat(64),
  buildRecipeRevision: "test-recipe",
} as const;

export const jsonBytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

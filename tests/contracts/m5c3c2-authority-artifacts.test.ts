/**
 * The two artifacts M5-C3c2 rests on, and the provenance discipline they obey.
 *
 * `rogue-item-effects.json` is MACHINE-EXTRACTED from hashed DBC tables at one
 * pinned commit. `external-buff-authority.ts` is HAND-REVIEWED C++ — a human
 * reading an initialization sequence that no table records. They support the
 * same milestone and they are not the same kind of claim, so the tests below
 * check the labelling as carefully as the values.
 *
 * If one of these fails after a re-pin, the correct response is to report the
 * discrepancy — not to update the expectation until it matches. A moved item
 * effect or a changed initialization order is a behavioural change to every
 * applicability and usability verdict built on it.
 */

import { describe, expect, it } from "vitest";

import {
  EXTERNAL_BUFF_AUTHORITY,
  EXTERNAL_BUFF_AUTHORITY_METHOD,
  PINNED_DEFAULT_COOLDOWN_TOLERANCE_MS,
} from "../../src/data/game/external-buff-authority.js";
import {
  FORBIDDEN_DERIVED_ITEM_KEYS,
  INVENTORY_TYPE_TRINKET,
  TRIGGER_ON_USE,
  validateItemEffectArtifact,
} from "../../src/data/game/item-effect-artifact.js";
import {
  itemEffectForItemId,
  itemEffectForToken,
  pinnedRogueItemEffects,
} from "../../src/data/game/rogue-item-effects.js";
import artifact from "../../src/data/game/rogue-item-effects.json";

const SIMC_COMMIT = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";
const CLIENT_BUILD = "12.1.0.69587";
/** The same Rogue-module hash M5-C1 pins. Cross-checked so the two cannot drift. */
const ROGUE_MODULE_SHA256 = "209e95265aae4168cf7cda57d1b241dda6361971ba6849a9262bd933bff3e13e";
/** The player module, shared by the item artifact and the external-buff record. */
const PLAYER_MODULE_SHA256 = "50a804d0f63d7bffd7b9eeb89a6de054b1767c3202133c765b1b893987940a5c";

function loadedOrThrow() {
  const loaded = pinnedRogueItemEffects();
  if (!loaded.ok) throw new Error(`item-effect artifact rejected: ${loaded.reason} — ${loaded.detail}`);
  return loaded.artifact;
}

describe("the item-effect artifact is pinned, and says to what", () => {
  it("loads, and records its commit and client build", () => {
    const loaded = loadedOrThrow();
    expect(loaded.provenance.commitSha).toBe(SIMC_COMMIT);
    expect(loaded.provenance.clientDataWowVersion).toBe(CLIENT_BUILD);
    expect(loaded.provenance.cooldownFieldUnits).toBe("MILLISECONDS");
  });

  it("hashes every source it read, and the one it only read BY HAND", () => {
    const loaded = loadedOrThrow();
    const byPath = new Map(loaded.provenance.sources.map((source) => [source.path, source]));
    for (const path of [
      "engine/dbc/generated/item_data.inc",
      "engine/dbc/generated/item_effect.inc",
      "engine/dbc/generated/sc_spell_data.inc",
      "engine/player/player.cpp",
    ]) {
      expect(byPath.get(path)?.sha256, `${path} is unhashed`).toMatch(/^[0-9a-f]{64}$/);
      expect(byPath.get(path)?.byteLength ?? 0).toBeGreaterThan(0);
    }
    // player.cpp was HASHED, not parsed. The hash is what makes the
    // hand-reviewed semantics fail loudly if the module moves underneath them.
    expect(byPath.get("engine/player/player.cpp")?.sha256).toBe(PLAYER_MODULE_SHA256);
    expect(loaded.actionSemantics.sourceSha256).toBe(PLAYER_MODULE_SHA256);
  });

  it("keeps the two provenance grades apart and labelled", () => {
    const loaded = loadedOrThrow();
    expect(loaded.provenance.itemDataMethod).toBe("MACHINE_EXTRACTED_DBC_RECORD");
    expect(loaded.actionSemantics.method).toBe("HAND_REVIEWED_CPP_ACTION_SEMANTICS");
    expect(loaded.actionSemantics.checks.length).toBeGreaterThanOrEqual(5);
    for (const check of loaded.actionSemantics.checks) {
      expect(check.search.length).toBeGreaterThan(0);
      expect(check.finding.length).toBeGreaterThan(0);
    }
  });

  it("carries exactly the five items a supported decision needs", () => {
    const loaded = loadedOrThrow();
    expect(loaded.items.map((item) => item.itemId).sort((a, b) => a - b)).toEqual([
      193_701, 230_638, 270_168, 270_173, 273_796,
    ]);
    // Every entry records WHY it is present. Not an item database.
    for (const item of loaded.items) expect(item.why.length).toBeGreaterThan(0);
  });

  it("records the ON_USE trigger type as the number the enum defines", () => {
    expect(TRIGGER_ON_USE).toBe(0);
    const loaded = loadedOrThrow();
    expect(loaded.provenance.triggerTypeSource).toContain("item_spell_trigger_type");
    for (const item of loaded.items) {
      const onUseRows = item.effects.filter((effect) => effect.triggerType === TRIGGER_ON_USE);
      // The summary field and the rows it summarises must agree.
      expect(item.onUseEffect === null).toBe(onUseRows.length === 0);
    }
  });
});

describe("the facts the traversal actually consumes", () => {
  it("says the equipped trinket1 has NO on-use effect", () => {
    // The distinction the milestone turns on. Not "on cooldown" — no action
    // exists to be ready.
    const identity = itemEffectForItemId(270_173);
    expect(identity?.displayNameEn).toBe("Zul'jin's Guillotine Technique");
    expect(identity?.onUseEffect).toBeNull();
    expect(identity?.effects.every((effect) => effect.triggerType !== TRIGGER_ON_USE)).toBe(true);
  });

  it("says the equipped trinket2 has one, driven by 1293316 on a 120 s cooldown", () => {
    const identity = itemEffectForItemId(273_796);
    expect(identity?.onUseEffect?.effectSpellId).toBe(1_293_316);
    expect(identity?.onUseEffect?.baseCooldownMs).toBe(120_000);
    // The CATEGORY cooldown is recorded but obeys a different readiness rule
    // (`use_item_t::ready` checks it with a strict `remains() > 0`, no
    // tolerance). Recorded so nobody has to guess it was overlooked.
    expect(identity?.onUseEffect?.categoryCooldownMs).toBe(20_000);
  });

  it("resolves the three APL-named items by TOKEN, never by display name", () => {
    expect(itemEffectForToken("algethar_puzzle_box")?.itemId).toBe(193_701);
    expect(itemEffectForToken("astral_gladiators_badge_of_ferocity")?.itemId).toBe(230_638);
    expect(itemEffectForToken("font_of_venomous_rage")?.itemId).toBe(270_168);
    // The display name is for humans and is never a lookup key.
    expect(itemEffectForToken("Algeth'ar Puzzle Box")).toBeNull();
  });

  it("gives the slot-reached trinkets no token, because the APL names no token", () => {
    expect(itemEffectForItemId(270_173)?.simcToken).toBeNull();
    expect(itemEffectForItemId(273_796)?.simcToken).toBeNull();
  });

  it("carries each item's inventory type, so a SLOT answer can be checked", () => {
    expect(INVENTORY_TYPE_TRINKET).toBe(12);
    const loaded = loadedOrThrow();
    for (const item of loaded.items) {
      expect(item.inventoryType, `${item.displayNameEn} is not a trinket`).toBe(INVENTORY_TYPE_TRINKET);
    }
  });

  it("identifies the inventory-type column by agreement, not by a constant offset", () => {
    // `item_data.inc` has no field header, so a hard-coded column index would
    // read the wrong field the moment upstream inserts a member. The extractor
    // instead keeps the ONE column agreeing with every anchor, and records both
    // the column it found and the anchors that fixed it.
    const provenance = loadedOrThrow().provenance as unknown as Record<string, unknown>;
    expect(typeof provenance["inventoryTypeColumnIndex"]).toBe("number");
    expect(String(provenance["inventoryTypeIdentification"])).toContain("anchors");
    const anchors = provenance["inventoryTypeAnchors"];
    expect(Array.isArray(anchors)).toBe(true);
    if (!Array.isArray(anchors)) return;
    expect(anchors.length).toBeGreaterThanOrEqual(16);
    const distinct = new Set(anchors.map((anchor: { inventoryType: number }) => anchor.inventoryType));
    // Agreement across many DISTINCT values is what makes the identification
    // strong. Sixteen anchors all saying "12" would prove nothing.
    expect(distinct.size).toBeGreaterThanOrEqual(14);
  });
});

describe("the artifact validator refuses what it cannot stand behind", () => {
  it("rejects an item with no inventory type", () => {
    const broken = structuredClone(artifact) as { items: Record<string, unknown>[] };
    delete broken.items[0]?.["inventoryType"];
    const result = validateItemEffectArtifact(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("MALFORMED_ITEM");
  });

  it("rejects an on-use record that disagrees with its own effect rows", () => {
    // The artifact would otherwise be able to say "no on-use effect" while
    // carrying an ON_USE row — an applicability answer contradicting its
    // evidence.
    const broken = structuredClone(artifact) as { items: { onUseEffect: unknown }[] };
    const trinket2 = broken.items.find((item) => (item as unknown as { itemId: number }).itemId === 273_796);
    if (trinket2 === undefined) throw new Error("expected 273796 in the artifact");
    trinket2.onUseEffect = null;
    const result = validateItemEffectArtifact(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("MALFORMED_ITEM");
  });

  it("rejects a derived verdict baked into the dataset", () => {
    // `equipped`, `ready`, `onCooldown` are decided per decision against a
    // profile and a moment. Frozen into game data they would be a lie the
    // instant either changed.
    for (const key of FORBIDDEN_DERIVED_ITEM_KEYS) {
      const broken = structuredClone(artifact) as { items: Record<string, unknown>[] };
      const first = broken.items[0];
      if (first === undefined) throw new Error("expected items");
      first[key] = true;
      const result = validateItemEffectArtifact(broken);
      expect(result.ok, `${key} was accepted`).toBe(false);
    }
  });
});

describe("the external-buff record is labelled as the weaker claim it is", () => {
  it("declares the hand-reviewed method, never a machine-extraction one", () => {
    expect(EXTERNAL_BUFF_AUTHORITY.method).toBe(EXTERNAL_BUFF_AUTHORITY_METHOD);
    expect(EXTERNAL_BUFF_AUTHORITY_METHOD).toBe("HAND_REVIEWED_CPP_INITIALIZATION");
    expect(EXTERNAL_BUFF_AUTHORITY.commitSha).toBe(SIMC_COMMIT);
  });

  it("hashes every file the reading spans, with no placeholders", () => {
    // A provenance record carrying an invented hash would present a review as
    // an audit. Each must be real 64-hex, and they must not all be the same.
    const hashes = EXTERNAL_BUFF_AUTHORITY.checks.map((check) => check.sourceSha256);
    for (const hash of hashes) expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(hashes).size).toBeGreaterThanOrEqual(3);
    expect(EXTERNAL_BUFF_AUTHORITY.rogueModuleSha256).toBe(ROGUE_MODULE_SHA256);

    const byClaim = new Map(EXTERNAL_BUFF_AUTHORITY.checks.map((check) => [check.claim, check]));
    expect(byClaim.get("POOL_DEFAULTS_EMPTY_AND_IS_NOT_SET_BY_THE_PINNED_AUTHORITY")?.sourceSha256).toBe(
      PLAYER_MODULE_SHA256,
    );
  });

  it("spans the three files the initialization sequence actually crosses", () => {
    const paths = new Set(EXTERNAL_BUFF_AUTHORITY.checks.map((check) => check.sourcePath));
    expect(paths).toContain("engine/class_modules/priest/sc_priest.cpp");
    expect(paths).toContain("engine/sim/sim.cpp");
    expect(paths).toContain("engine/player/player.cpp");
  });

  it("records the four claims the negative verdict depends on", () => {
    const claims = EXTERNAL_BUFF_AUTHORITY.checks.map((check) => check.claim);
    // Each is load-bearing. Drop the first and `init_finished` throws instead of
    // nulling; drop the last and the action would be BACKGROUND, which is a
    // different verdict with a different remedy.
    expect(claims).toContain("PI_BUFF_IS_REGISTERED_ON_EVERY_PLAYER");
    expect(claims).toContain("BUFFS_ARE_CREATED_BEFORE_ACTIONS");
    expect(claims).toContain("POOL_DEFAULTS_EMPTY_AND_IS_NOT_SET_BY_THE_PINNED_AUTHORITY");
    expect(claims).toContain("EMPTY_POOL_MAKES_READY_PERMANENTLY_FALSE");
    expect(claims).toContain("THE_ACTION_IS_NEVER_MARKED_BACKGROUND");
    for (const check of EXTERNAL_BUFF_AUTHORITY.checks) {
      expect(check.finding.length).toBeGreaterThan(0);
    }
  });

  it("states that the empty pool is a DEFAULT, not a missing input", () => {
    // The whole verdict rests on this. An unknown pool could prove nothing.
    expect(EXTERNAL_BUFF_AUTHORITY.defaultPoolIsEmpty).toBe(true);
    expect(EXTERNAL_BUFF_AUTHORITY.readyBehaviour).toContain("ready() returns false");
  });
});

describe("the cooldown tolerance is a named authority fact, not a magic number", () => {
  it("is 250 ms, exported once", () => {
    expect(PINNED_DEFAULT_COOLDOWN_TOLERANCE_MS).toBe(250);
  });

  it("is not inlined into the readiness bridge", async () => {
    // A bridge with 250 baked in would silently outlive a profile that changed
    // it. The bridge takes the tolerance as an INPUT and returns UNKNOWN when
    // none was established — asserted behaviourally in the bridge's own tests,
    // and structurally here.
    const bridge = await import("../../src/engine/game-state/cooldowns/cooldown-usability.js");
    expect(Object.keys(bridge)).toEqual(["cooldownReadinessAt"]);
  });
});

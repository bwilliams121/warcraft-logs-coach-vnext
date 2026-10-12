/**
 * Blood Death Knight's POST-HOC fact definitions (M11-G2). Data only.
 *
 * This module is read by the post-hoc comparison-facts domain through its
 * caller; it never reads that domain, and nothing in the authority branch
 * reads it. It names which observed evidence Blood's cooldown window and owned
 * sub-actors are; it decides nothing about whether they were used well.
 *
 * DANCING RUNE WEAPON
 *
 *   trigger cast   49028, from the pinned SimC DBC cooldown dataset
 *                  (`deathknight-blood-cooldowns.json`, simcToken
 *                  `dancing_rune_weapon`) — read from it, never retyped here
 *   active aura    81256, `DANCING_RUNE_WEAPON_BUFF_SPELL_ID` in the pinned
 *                  aura authority (`deathknight-blood-aura-authority.ts`,
 *                  sc_death_knight.cpp:15236/15967) — self-applied, and also
 *                  applied WITHOUT a cast (the authority records "other
 *                  summoning sources"; the four-fight capture shows 17–19 aura
 *                  windows against 4 casts per fight)
 *   tolerance      a cast and its aura application were observed up to 2 ms
 *                  apart in either order in all four fights; 5 ms is the
 *                  association tolerance (configurable here, not a gameplay
 *                  rule)
 *
 * OWNED SUB-ACTOR KINDS, by Warcraft Logs catalog gameID (creature id)
 *
 *   27893   Rune Weapon     \
 *   217228  Blood Beast      } observed in the committed fight contexts of all
 *   26125   Risen Ghoul     /  four fights as actors whose WCL petOwner is the
 *                              focus, and named so in the raw (pre-redaction)
 *                              catalogs (M11-E2 provenance; M11-G2 capture)
 *
 * SimulationCraft has no creature ids for these pets, so the authority is the
 * Warcraft Logs catalog itself. An owned actor of any other gameID stays in
 * the tree, unclassified.
 */

import { DANCING_RUNE_WEAPON_BUFF_SPELL_ID } from "../../../data/game/deathknight-blood-aura-authority.js";
import { bloodCooldownAbilitiesFor } from "../../../data/game/deathknight-blood-cooldowns.js";

function pinnedCastId(simcToken: string): number {
  const pinned = bloodCooldownAbilitiesFor(simcToken);
  const first = pinned[0];
  if (pinned.length !== 1 || first === undefined) {
    throw new Error(`the pinned Blood cooldown dataset does not hold exactly one ${simcToken}`);
  }
  return first.abilityGameId;
}

export const BLOOD_POST_HOC_DEFINITION = {
  specId: "deathknight/blood",
  cooldownWindows: [
    {
      windowKind: "DANCING_RUNE_WEAPON",
      triggerCastAbilityGameIds: [pinnedCastId("dancing_rune_weapon")],
      activeAuraAbilityGameId: DANCING_RUNE_WEAPON_BUFF_SPELL_ID,
      auraClass: "BUFF",
      triggerAssociationToleranceMs: 5,
      provenance:
        "cast: SIMC_DBC_DEATHKNIGHT_BLOOD_ABILITY_COOLDOWNS dancing_rune_weapon; aura: deathknight-blood-aura-authority DANCING_RUNE_WEAPON_BUFF_SPELL_ID",
    },
  ],
  subActorKinds: [
    { kind: "RUNE_WEAPON", gameIds: [27893] },
    { kind: "BLOOD_BEAST", gameIds: [217228] },
    { kind: "RISEN_GHOUL", gameIds: [26125] },
  ],
  subActorKindProvenance:
    "Warcraft Logs catalog gameIDs of the actors whose petOwner is the focus, named in the raw catalogs of the M11-E2 subject and the three M11-G2 comparison fights",
} as const;

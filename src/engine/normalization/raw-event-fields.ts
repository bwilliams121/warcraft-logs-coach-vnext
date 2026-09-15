/**
 * Raw Warcraft Logs event field names.
 *
 * `Report.events.data` is `JSON` and is documented as "not considered frozen".
 * Every key name read out of it is therefore a CONTRACT, and this project does
 * not write a contract it cannot cite evidence for.
 *
 * Every name below is now VERIFIED against sanitized live captures committed
 * in the regression corpus under `tests/corpus/artifacts/wcl-events/`. See
 * `tests/corpus/manifest.json` and `tests/corpus/PROVENANCE-legacy.md`.
 */

/**
 * The common envelope keys.
 *
 * Verified present on all 302 events of the pull-window capture and all 5,010
 * events of the mid-fight capture.
 */
export interface EnvelopeFieldNames {
  readonly timestamp: string;
  readonly type: string;
}

export const ENVELOPE_FIELDS: EnvelopeFieldNames = {
  timestamp: "timestamp",
  type: "type",
};

export const ENVELOPE_FIELDS_EVIDENCE =
  "Sanitized captures: wcl-pull-window-with-resources.json, wcl-midfight-window.json";

/**
 * Source/target/ability keys.
 *
 * VERIFIED. Earlier drafts left this `null` because the RpgLogs scripting API
 * exposes these as object accessors (`source`, `sourceInstanceId`), which is a
 * different surface from the raw v2 JSON. The captures settle it: the raw
 * payload uses ID-bearing keys.
 */
export interface DirectionFieldNames {
  readonly sourceId: string;
  readonly sourceInstance: string;
  readonly targetId: string;
  readonly targetInstance: string;
  readonly abilityGameId: string;
}

export const VERIFIED_DIRECTION_FIELDS: DirectionFieldNames | null = {
  sourceId: "sourceID",
  sourceInstance: "sourceInstance",
  targetId: "targetID",
  targetInstance: "targetInstance",
  abilityGameId: "abilityGameID",
};

/**
 * Warcraft Logs' "no actor" sentinel.
 *
 * VERIFIED on both `sourceID` and `targetID`: the mid-fight capture carries 92
 * events with `sourceID: -1` and 117 with `targetID: -1`, including an
 * `empowerend` whose `targetID` is -1 and a `begincast` with no real target.
 *
 * ONLY -1 is treated as the sentinel. No other negative value has been observed
 * and none is generalised — an unobserved negative is recorded as an unusable
 * value rather than silently given this meaning.
 */
export const NO_ACTOR_SENTINEL = -1;

/**
 * Keys of the resource snapshot that `includeResources: true` FLATTENS onto the
 * event.
 *
 * There is no `sourceResources` / `targetResources` object in the raw payload.
 * Instead the snapshot's fields sit at the event's top level, and
 * `resourceActor` says which side of the event they describe.
 *
 * VERIFIED: `resourceActor: 1` carried the caster's own health on a `cast`;
 * `resourceActor: 2` carried the boss's 859M health pool on a `damage` event
 * whose target was the boss. Attaching these to the source unconditionally
 * would misattribute every damage and heal snapshot.
 *
 * The whole block is read ONLY when `resourceActor` is present. That gating
 * matters: `armor`, `absorb` and `avoidance` also appear as unrelated top-level
 * keys on `combatantinfo` and on aura events.
 */
export interface ResourceFieldNames {
  readonly resourceActor: string;
  readonly classResources: string;
  readonly hitPoints: string;
  readonly maxHitPoints: string;
  readonly attackPower: string;
  readonly spellPower: string;
  readonly armor: string;
  readonly absorb: string;
  readonly itemLevel: string;
  readonly x: string;
  readonly y: string;
  readonly facing: string;
  readonly mapId: string;
}

export const RESOURCE_FIELDS: ResourceFieldNames = {
  resourceActor: "resourceActor",
  classResources: "classResources",
  hitPoints: "hitPoints",
  maxHitPoints: "maxHitPoints",
  attackPower: "attackPower",
  spellPower: "spellPower",
  armor: "armor",
  absorb: "absorb",
  itemLevel: "itemLevel",
  x: "x",
  y: "y",
  facing: "facing",
  mapId: "mapID",
};

/** Verified `resourceActor` discriminator values. */
export const RESOURCE_ACTOR_SOURCE = 1;
export const RESOURCE_ACTOR_TARGET = 2;

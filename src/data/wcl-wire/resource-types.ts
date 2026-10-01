/**
 * Version-scoped Warcraft Logs WIRE contracts for `classResources[].type`.
 *
 * This answers one question: what does the number in `classResources[].type`
 * MEAN, for a given parser version? It is the same species of contract as M4's
 * `PRE_COST` sampling contract and the aura `stack` contract — a statement about
 * what Warcraft Logs' wire format denotes, established for an explicit
 * `gameVersion` / `logVersion` pair and not generalised beyond it.
 *
 * WHY THE EVIDENCE IS JOINT, AND WHY THAT IS NOT PEDANTRY
 *
 * Two different claims are involved, and neither implies the other:
 *
 *     the GAME says     Enum.PowerType.ComboPoints == 4
 *     the WIRE says     classResources[].type == 4 carries combo points
 *
 * The game enum is authoritative for the game. It is NOT authoritative for what
 * a third-party log parser chose to put on the wire — Warcraft Logs types the
 * event payload as opaque `JSON`, documents no mapping through its typed schema,
 * and is free to renumber, remap or diverge at any parser version.
 *
 * So `ResourceWireContract` requires BOTH members. The enum supplies the
 * meaning; a sanitized capture supplies evidence that the observed wire
 * behaviour is compatible with that meaning. Declaring one without the other is
 * a compile error, which is the point: it makes "the enum says 4, therefore the
 * wire means 4" unrepresentable.
 *
 * WHAT THE CORROBORATION ACTUALLY SHOWED
 *
 * Across one complete 20-player raid fight, type 4 occurred on exactly three
 * actors — two Rogues (`max` 7) and a Feral Druid (`max` 5) — and on no other
 * class, with class-appropriate maxima. Every type-4 entry in the capture was
 * costed. That is consistent with combo points and is hard to explain otherwise.
 * It is corroboration, not proof, and it is recorded as such.
 *
 * Type 3 is corroborated the same way in the same capture, and the observation
 * string on that contract records the measurements verbatim. The sharpest single
 * discriminator is that the Hunter carries type 2 and never type 3: Focus and
 * Energy are adjacent enum values, so a renumbering would show up there first.
 *
 * A UNIT SCALE IS A SEPARATE, SEPARATELY EVIDENCED CLAIM (M11-D2-A1)
 *
 * Which RESOURCE a wire number describes says nothing about the SCALE its
 * amounts are on. The same capture shows Rage at `max` 1300 and Runic Power at
 * `max` 1250, which are plainly not the numbers a player reads off their own
 * bar. Until M11-D2-A1 no contract claimed a scale at all, and every reader
 * that needed one either avoided it or carried its own: the Energy adapter is
 * a PERCENTAGE, because the ratio of two numbers in one encoding is
 * independent of what that encoding is (see `adaptEnergyPct`), and the Blood
 * module carried Runic Power's divisor 10 privately.
 *
 * Each contract now states its `unitScale`: the divisor from the wire amount to
 * the unit SimulationCraft expressions read, resting on TWO facts that must
 * both hold and neither implies the other:
 *
 *     the GAME DATA says  power_type_data.inc row N carries divisor D
 *     the WIRE says       this resource's `cost` equals the pinned DBC `_cost`
 *                         (or, where no DBC cost applies, its magnitudes fit
 *                         D and no other)
 *
 * The first is read from ONE pinned file (`POWER_TYPE_DATA_SOURCE`), whose
 * header names exactly the pinned client build. The second is recorded per
 * contract in `unitScale.wireEncoding`, naming committed evidence. The
 * percentage adapter is unaffected: it never needed a scale, and still takes
 * none.
 *
 * HOLY POWER (M10-B) IS CORROBORATED BY A PROTECTION PALADIN CAPTURE
 *
 * Type 9 was seen on two actors in the same complete 20-player fight, both
 * Paladins (a Protection tank, the capture's subject, and a Retribution
 * Paladin) and on no other class; every attached type-9 entry was costed at
 * exactly 3 against a stable `max` of 5, and every standalone `resourcechange`
 * of type 9 carried `maxResourceAmount` 5. The specialization-specific
 * corroboration that M10-A's audit found missing — a PROTECTION observation —
 * is the subject's own Shield of the Righteous casts. Recorded, like the
 * others, as corroboration and not proof.
 *
 * A COSTED HOLY POWER CAST IS PRE_COST; AN UNCOSTED ONE IS NOT ZERO
 *
 * The same M4 sampling contract applies unchanged: a COMPLETED cast carrying
 * a positive type-9 `cost` reports the amount BEFORE that cost. The capture
 * also holds two completed Shield of the Righteous casts that carry NO type-9
 * entry at all — real casts of a spender with no resource snapshot — which
 * is why "no entry" must stay NO_OBSERVATION and can never read as zero Holy
 * Power. Nothing here models generation, and the standalone `resourcechange`
 * events (+1, +2, +3 with `waste` 0–3 observed) remain observations that are
 * never replayed onto a snapshot.
 *
 * RUNES AND RUNIC POWER (M11-B2) ARE CORROBORATED BY A BLOOD DEATH KNIGHT CAPTURE
 *
 * Types 5 and 6 were seen, in the first 45 s of the same complete 20-player
 * fight, on exactly one actor — the Blood Death Knight subject — and on no
 * other class. Type 5 appeared only ATTACHED to the subject's own casts,
 * every entry costed at 1 or 2 against a stable `max` of 6; no standalone
 * `resourcechange` of type 5 exists in the window at all, so Rune
 * regeneration is not on the wire and nothing here models it. Type 6
 * appeared attached to 172 events with a stable `max` of 1250, sixteen of
 * them costed at exactly 450 — Death Strike's DBC `_cost`, in TENTHS of a
 * Runic Power point — and on 89 standalone `resourcechange` events.
 *
 * TWO FACTS ABOUT THE TYPE-6 `cost` FIELD, RECORDED SO NO ONE RE-DISCOVERS THEM
 *
 * First, the attached amount is PRE_COST, exactly as M4's sampling contract
 * says: every one of the subject's Death Strike casts is followed by a
 * snapshot 350 lower (990 → 640, 980 → 650, 1040 → 690, …). Second, the
 * `cost` on the wire is the spell's BASE cost, not the amount deducted: the
 * observed deduction is 350 against a reported 450 — this build takes cost
 * reductions the wire does not fold in — and the second subject cast Death
 * Strike twice with an attached amount BELOW the reported cost (440 and 390
 * against 450). A `cost` field is therefore identity corroboration for the
 * resource and nothing else: no affordability proof may be built on it.
 *
 * Outside the declared scope, `resourceWireTypeFor` fails closed. It does not
 * fall back, does not widen, and does not guess.
 */

import {
  checkWireCompatibility,
  type CompatibilityOutcome,
  type FightCompatibilityKeys,
  type WireVersionScope,
} from "../provenance.js";

/** Resource identities this project models. Deliberately not a full database. */
export type ResourceId =
  "COMBO_POINTS" | "ENERGY" | "FOCUS" | "FURY" | "HOLY_POWER" | "RAGE" | "RUNES" | "RUNIC_POWER";

export const RESOURCE_IDS = [
  "COMBO_POINTS",
  "ENERGY",
  "FOCUS",
  "FURY",
  "HOLY_POWER",
  "RAGE",
  "RUNES",
  "RUNIC_POWER",
] as const satisfies readonly ResourceId[];

/** Evidence from a versioned game-data enumeration. Necessary, never sufficient. */
export interface GameEnumEvidence {
  readonly enumName: string;
  readonly memberName: string;
  readonly value: number;
  readonly expansion: string;
  readonly gameBuild: string;
  readonly source: string;
  readonly verifiedOn: string;
}

/** Evidence that the OBSERVED wire behaviour is compatible with that meaning. */
export interface WireCorroborationEvidence {
  readonly fixtureId: string;
  readonly reportCode: string;
  readonly reportRevision: number;
  readonly capturedOn: string;
  /** What the capture actually showed. Factual, no gameplay verdict. */
  readonly observation: string;
}

/**
 * The pinned game-data file every `unitScale.powerTypeData` row is read from
 * (M11-D2-A1): SimulationCraft's generated power-type table at the pinned
 * commit. Its first line reads `// Power types, wow build 12.1.0.69587` — the
 * pinned client build. Recorded for traceability, not as a fight gate: a
 * `CombatFight` carries no game build (see `../provenance.ts`), so the
 * contract's `scope` stays the only applicability gate.
 */
export const POWER_TYPE_DATA_SOURCE = Object.freeze({
  repository: "https://github.com/simulationcraft/simc",
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/dbc/generated/power_type_data.inc",
  sourceSha256: "c5e8e2327005f47d4aa31b64fc3e59572b39c291624b3ad3221682e8fb9055ee",
  sourceByteLength: 2614,
  gameBuild: "12.1.0.69587",
  retrievedOn: "2026-09-30",
});

/**
 * How a resource's wire amounts map onto the unit SimulationCraft expressions
 * read (M11-D2-A1). See the module comment: both halves are required.
 */
export interface WireUnitScale {
  /**
   * `wire amount / divisor` is the amount in expression units. Equal to
   * `powerTypeData.divisor`: the wire was shown to share the DBC encoding.
   */
  readonly divisor: number;
  /** The row of `POWER_TYPE_DATA_SOURCE`, verbatim. Its `id` is the wire type. */
  readonly powerTypeData: { readonly id: number; readonly name: string; readonly divisor: number };
  /**
   * Whether the expression unit is an indivisible count (combo points, Holy
   * Power, Runes), so a well-formed wire amount and maximum are whole numbers.
   */
  readonly wholeUnits: boolean;
  /** Committed evidence that the wire carries this resource in the DBC encoding. Factual. */
  readonly wireEncoding: string;
}

/**
 * One wire contract.
 *
 * Both evidence members are required and non-optional. See the module comment.
 * So is `unitScale` (M11-D2-A1): a contract that cannot state its scale does
 * not exist, rather than existing with a guessed one.
 */
export interface ResourceWireContract {
  readonly wireType: number;
  readonly resourceId: ResourceId;
  readonly scope: WireVersionScope;
  readonly evidence: {
    readonly gameEnum: GameEnumEvidence;
    readonly wireCorroboration: WireCorroborationEvidence;
  };
  readonly unitScale: WireUnitScale;
}

export const RESOURCE_WIRE_CONTRACTS: readonly ResourceWireContract[] = [
  {
    wireType: 4,
    resourceId: "COMBO_POINTS",
    scope: { gameVersion: 1, logVersion: 17 },
    evidence: {
      gameEnum: {
        enumName: "Enum.PowerType",
        memberName: "ComboPoints",
        value: 4,
        expansion: "Midnight",
        gameBuild: "12.0",
        source: "World of Warcraft client power-type enumeration",
        verifiedOn: "2026-09-12",
      },
      wireCorroboration: {
        fixtureId: "wcl-assassination-envenom-combo-points",
        reportCode: "A7R6kxPJ1hC8YQ4w",
        reportRevision: 30,
        capturedOn: "2026-09-12",
        observation:
          "Across one complete 20-player fight (249,516 events, COMPLETE coverage), wire type 4 " +
          "occurred on exactly three actors — two Rogues (max 7) and a Feral Druid (max 5) — and " +
          "on no other class. Every type-4 entry carried a positive cost. No other wire type " +
          "appeared on those actors with those maxima.",
      },
    },
    unitScale: {
      divisor: 1,
      powerTypeData: { id: 4, name: "Combo_points", divisor: 1.0 },
      wholeUnits: true,
      wireEncoding:
        "power_type_data.inc row 4 (Combo_points) carries divisor 1.0 and base maximum 5. Every costed type-4 " +
        "entry on the Envenom casts of fixture wcl-assassination-envenom-combo-points (actor 19) reports a cost " +
        "equal to its PRE_COST amount — the combo points spent, 7, 6 and 5 — against a maximum of 7, and the " +
        "capture's Feral Druid " +
        "carries a maximum of 5: whole combo points. A tenths encoding would put those maxima at 70 and 50.",
    },
  },
  {
    wireType: 3,
    resourceId: "ENERGY",
    scope: { gameVersion: 1, logVersion: 17 },
    evidence: {
      gameEnum: {
        enumName: "Enum.PowerType",
        memberName: "Energy",
        value: 3,
        expansion: "Midnight",
        gameBuild: "12.0",
        source: "World of Warcraft client power-type enumeration",
        verifiedOn: "2026-09-12",
      },
      wireCorroboration: {
        fixtureId: "wcl-assassination-envenom-combo-points",
        reportCode: "A7R6kxPJ1hC8YQ4w",
        reportRevision: 30,
        capturedOn: "2026-09-12",
        observation:
          "Across one complete 20-player fight (249,516 events, COMPLETE coverage, 50/50 pages), " +
          "wire type 3 occurred on 74,224 entries and only on energy-using actors: two Rogues " +
          "(max 250), a Feral Druid (max 140), two bosses and two NPCs (max 100) and five pets " +
          "(max 100 or 200). No Priest, Mage, Warlock, Paladin, Warrior, Death Knight, Monk, " +
          "Shaman, Hunter, Demon Hunter or Evoker carried it. The Hunter carried wire type 2 and " +
          "never type 3, which discriminates Focus from Energy despite their adjacent enum " +
          "values. The same capture placed eleven further types consistently with the same " +
          "enumeration: 0 mana, 1 rage, 2 focus, 4 combo points, 5 runes, 6 runic power, 7 soul " +
          "shards, 9 holy power, 11 maelstrom, 17 fury, 19 essence. The Feral Druid carried 0, 3 " +
          "and 4 simultaneously with class-appropriate maxima on each. Integrity across every " +
          "type-3 entry: zero with amount above max, zero with a null max, and zero of the 1,008 " +
          "costed entries with amount below cost. Observed costs were 20, 25, 30, 35, 40, 45, 50 " +
          "and 60 — discrete values, none fractional. Per-actor max was stable for the whole " +
          "fight: 250 across 6,923 and 6,471 observations for the two Rogues respectively.",
      },
    },
    unitScale: {
      divisor: 1,
      powerTypeData: { id: 3, name: "Energy", divisor: 1.0 },
      wholeUnits: false,
      wireEncoding:
        "power_type_data.inc row 3 (Energy) carries divisor 1.0. On fixture wcl-brewmaster-monk-gtkb-opener " +
        "the subject's (actor 4) Tiger Palm (100780) casts carry type-3 cost 50 and Keg Smash (121253) casts " +
        "cost 40, equal to the pinned DBC _cost of their Energy rows (5167 and 6739, " +
        "monk-brewmaster-spender-costs.json): the wire is in the DBC encoding.",
    },
  },
  {
    wireType: 9,
    resourceId: "HOLY_POWER",
    scope: { gameVersion: 1, logVersion: 17 },
    evidence: {
      gameEnum: {
        enumName: "Enum.PowerType",
        memberName: "HolyPower",
        value: 9,
        expansion: "Midnight",
        gameBuild: "12.0",
        source: "World of Warcraft client power-type enumeration",
        verifiedOn: "2026-09-16",
      },
      wireCorroboration: {
        fixtureId: "wcl-protection-paladin-a7r6-opener",
        reportCode: "A7R6kxPJ1hC8YQ4w",
        reportRevision: 30,
        capturedOn: "2026-09-16",
        observation:
          "Across the first 45 s of the same complete 20-player fight (30,588 events in four pages, " +
          "the last terminal, revision 30 before and after), wire type 9 appeared attached to 34 " +
          "events on exactly two actors — the Protection Paladin subject (actor 7, 16 entries) and a " +
          "Retribution Paladin (actor 6, 18 entries) — and on no other class. Every attached entry " +
          "was costed at 3 against max 5; zero had amount above max, a null max, or amount below " +
          "cost. Standalone resource-change events of type 9 occurred on the same two actors only " +
          "(43 and 64), every one with a maximum of 5, a change of 1, 2 or 3 and a waste field of " +
          "0 to 3. The committed slice retains the subject's five costed Shield of the " +
          "Righteous casts (amounts 4, 3, 3, 3, 3 of 5, cost 3) and two completed Shield of the " +
          "Righteous casts carrying no type-9 entry at all, which are the evidence that absence is " +
          "not zero. The earlier Retribution observation (A7R6 fight 7, actor 6, 4/5 cost 3) in " +
          "wcl-assassination-envenom-combo-points is consistent with all of it.",
      },
    },
    unitScale: {
      divisor: 1,
      powerTypeData: { id: 9, name: "Holy_power", divisor: 1.0 },
      wholeUnits: true,
      wireEncoding:
        "power_type_data.inc row 9 (Holy_power) carries divisor 1.0. On fixture " +
        "wcl-retribution-paladin-a7r6-rotational-45s the subject's (actor 6) Divine Storm (53385) and Final " +
        "Verdict (383328) casts carry type-9 cost 3 against a maximum of 5, equal to the pinned DBC _cost of " +
        "their Holy Power rows (paladin-retribution-spender-costs.json): the wire is in the DBC encoding.",
    },
  },
  {
    wireType: 5,
    resourceId: "RUNES",
    scope: { gameVersion: 1, logVersion: 17 },
    evidence: {
      gameEnum: {
        enumName: "Enum.PowerType",
        memberName: "Runes",
        value: 5,
        expansion: "Midnight",
        gameBuild: "12.0",
        source: "World of Warcraft client power-type enumeration",
        verifiedOn: "2026-09-18",
      },
      wireCorroboration: {
        fixtureId: "wcl-blood-death-knight-a7r6-rotational-45s",
        reportCode: "A7R6kxPJ1hC8YQ4w",
        reportRevision: 30,
        capturedOn: "2026-09-16",
        observation:
          "Across the first 45 s of the same complete 20-player fight (30,588 events in four pages, the " +
          "last terminal, revision 30 before and after), wire type 5 appeared attached to 25 events on " +
          "exactly one actor — the Blood Death Knight subject (actor 14) — and on no other class. Every " +
          "attached entry was costed, at 1 (Heart Strike 206930, Vampiric Strike 433895, Death's Caress " +
          "195292, Death and Decay 43265) or 2 (Marrowrend 195182), against a stable max of 6; observed " +
          "amounts were 1 through 6; zero had amount above max, a null max, or amount below cost. No " +
          "standalone resource-change event of type 5 exists in the window: Rune regeneration is not " +
          "reported on the wire, and nothing in this project models it. The other three committed slices " +
          "of the same subject (two later A7R6 segments and the gtKb opener) show the same shape: " +
          "attached, costed 1 or 2, max 6, actor 14 only.",
      },
    },
    unitScale: {
      divisor: 1,
      powerTypeData: { id: 5, name: "Runes", divisor: 1.0 },
      wholeUnits: true,
      wireEncoding:
        "power_type_data.inc row 5 (Runes) carries divisor 1.0. On fixture " +
        "wcl-blood-death-knight-a7r6-rotational-45s the subject's (actor 14) Marrowrend (195182) casts carry " +
        "type-5 cost 2 and Heart Strike (206930) casts cost 1 against a maximum of 6, equal to the pinned DBC " +
        "_cost of their Rune rows (deathknight-blood-spender-costs.json): the wire is in the DBC encoding.",
    },
  },
  {
    wireType: 6,
    resourceId: "RUNIC_POWER",
    scope: { gameVersion: 1, logVersion: 17 },
    evidence: {
      gameEnum: {
        enumName: "Enum.PowerType",
        memberName: "RunicPower",
        value: 6,
        expansion: "Midnight",
        gameBuild: "12.0",
        source: "World of Warcraft client power-type enumeration",
        verifiedOn: "2026-09-18",
      },
      wireCorroboration: {
        fixtureId: "wcl-blood-death-knight-a7r6-rotational-45s",
        reportCode: "A7R6kxPJ1hC8YQ4w",
        reportRevision: 30,
        capturedOn: "2026-09-16",
        observation:
          "Across the first 45 s of the same complete 20-player fight, wire type 6 appeared attached to " +
          "172 events describing exactly one actor — the Blood Death Knight subject (actor 14; the one " +
          "attached entry on a cast sourced by actor -1 is an environment cast TARGETING the subject, " +
          "whose resourceActor field names the target) — and on no other class, with a stable max of 1250. " +
          "Sixteen attached entries were costed, every one at exactly 450 on a Death Strike (49998) cast — " +
          "the DBC `_cost` of that spell in tenths of a point, power_type_data.inc row 6 divisor 10 — and " +
          "zero had amount above max, a null max, or amount below cost. Eighty-nine standalone " +
          "resource-change events of type 6 occurred, all on actor 14, all with maximum 1250, changes of 0 " +
          "to 20 and waste of 0 to 15; they are NOT in the attached encoding (a Heart Strike gain reports " +
          "15 where the attached scale would say 150) and are never read as amounts. PRE_COST holds: each " +
          "Death Strike cast's attached amount exceeds the next attached amount by 350, the deduction this " +
          "build actually pays, which is LESS than the 450 the cost field reports; the gtKb subject cast " +
          "Death Strike with attached amounts 440 and 390 against a reported cost of 450. The cost field " +
          "corroborates identity only.",
      },
    },
    unitScale: {
      divisor: 10,
      powerTypeData: { id: 6, name: "Runic_power", divisor: 10.0 },
      wholeUnits: false,
      wireEncoding:
        "power_type_data.inc row 6 (Runic_power) carries divisor 10.0 — the fact the Blood module's " +
        "RUNIC_POWER_WIRE_DIVISOR states. On fixture wcl-blood-death-knight-a7r6-rotational-45s the subject's " +
        "(actor 14) Death Strike (49998) casts carry type-6 cost 450 against a maximum of 1250, equal to the " +
        "pinned DBC _cost of its Runic Power row (deathknight-blood-spender-costs.json): the wire is in the DBC " +
        "encoding, tenths of a point.",
    },
  },
  // M11-D2-A2: Rage, Focus and Fury. Each rests on the pinned power_type_data
  // row (POWER_TYPE_DATA_SOURCE) and the pinned SimulationCraft power_e
  // enumerator of the same value (engine/sc_enums.hpp, sha256 64e10c19…c1f),
  // and on fixture wcl-rage-fury-focus-pre-cost: own completed casts only, no
  // standalone resource change. `wholeUnits` is false for all three — the
  // pinned row type carries no indivisibility field, and each row's own
  // columns say otherwise (a 10.0 divisor; 5.0/s regeneration; -1.0/s decay).
  {
    wireType: 1,
    resourceId: "RAGE",
    scope: { gameVersion: 1, logVersion: 17 },
    evidence: {
      gameEnum: {
        enumName: "Enum.PowerType",
        memberName: "Rage",
        value: 1,
        expansion: "Midnight",
        gameBuild: "12.1.0.69587",
        source:
          "SimulationCraft 33622e9d engine/dbc/generated/power_type_data.inc row 1 (Rage) and engine/sc_enums.hpp POWER_RAGE = 1, both generated from the client's power types",
        verifiedOn: "2026-10-01",
      },
      wireCorroboration: {
        fixtureId: "wcl-rage-fury-focus-pre-cost",
        reportCode: "A7R6kxPJ1hC8YQ4w",
        reportRevision: 30,
        capturedOn: "2026-09-16",
        observation:
          "In the first 45 s of the same complete 20-player fight, the Warrior (actor 4, Warrior/Arms by the " +
          "committed fight-context master data) carried wire type 1 on 24 costed completed casts against a stable " +
          "max of 1300, the snapshot on the caster's own side (resourceActor 1). Costs were 200 (Cleave 845, Slam " +
          "1464, a 1269383 cast) and 300 (Mortal Strike 12294). The fixture retains Cleave at 464/1300 costing 200 and " +
          "Mortal Strike at 1300/1300 costing 300; amount == max while costed is the cap-bounded falsifier of a " +
          "post-cost reading. Rage gained from melee swings is not carried by any resource-change event on the wire, " +
          "so no state between casts is established by this contract.",
      },
    },
    unitScale: {
      divisor: 10,
      powerTypeData: { id: 1, name: "Rage", divisor: 10.0 },
      wholeUnits: false,
      wireEncoding:
        "power_type_data.inc row 1 (Rage) carries divisor 10.0 and base maximum 1000. On fixture " +
        "wcl-rage-fury-focus-pre-cost the Warrior's (actor 4) Cleave costs 200 and Mortal Strike 300 on the wire, " +
        "equal to the pinned DBC _cost of their Rage rows (sc_spell_data.inc rows 99 and 9599): the wire is in the " +
        "DBC encoding, tenths of a point — Cleave's 464 is 46.4 Rage.",
    },
  },
  {
    wireType: 2,
    resourceId: "FOCUS",
    scope: { gameVersion: 1, logVersion: 17 },
    evidence: {
      gameEnum: {
        enumName: "Enum.PowerType",
        memberName: "Focus",
        value: 2,
        expansion: "Midnight",
        gameBuild: "12.1.0.69587",
        source:
          "SimulationCraft 33622e9d engine/dbc/generated/power_type_data.inc row 2 (Focus) and engine/sc_enums.hpp POWER_FOCUS = 2, both generated from the client's power types",
        verifiedOn: "2026-10-01",
      },
      wireCorroboration: {
        fixtureId: "wcl-rage-fury-focus-pre-cost",
        reportCode: "A7R6kxPJ1hC8YQ4w",
        reportRevision: 30,
        capturedOn: "2026-09-16",
        observation:
          "In the first 45 s of the same complete 20-player fight, the Hunter (actor 20, Hunter/BeastMastery by the " +
          "committed fight-context master data) carried wire type 2 on 28 costed completed casts against a stable " +
          "max of 100, the snapshot on the caster's own side (resourceActor 1): Kill Command (34026) costing 30 and " +
          "Cobra Shot (193455) costing 35. The fixture retains Kill Command at 100/100 costing 30 (the cap-bounded " +
          "falsifier of a post-cost reading) and Cobra Shot at 98/100 costing 35. OWN-CAST OBSERVATIONS ONLY: " +
          "standalone resource changes a Hunter causes to its pet's Focus are currently attributed to the Hunter " +
          "by source, so no Focus history between casts is established, and none is used here.",
      },
    },
    unitScale: {
      divisor: 1,
      powerTypeData: { id: 2, name: "Focus", divisor: 1.0 },
      wholeUnits: false,
      wireEncoding:
        "power_type_data.inc row 2 (Focus) carries divisor 1.0, base maximum 100 and 5.0/s regeneration. On fixture " +
        "wcl-rage-fury-focus-pre-cost the Hunter's (actor 20) Kill Command costs 30 and Cobra Shot 35 on the wire, " +
        "equal to the pinned DBC _cost of their Focus rows (sc_spell_data.inc rows 1470 and 10443), against the " +
        "base maximum of 100: the wire is in the DBC encoding.",
    },
  },
  {
    wireType: 17,
    resourceId: "FURY",
    scope: { gameVersion: 1, logVersion: 17 },
    evidence: {
      gameEnum: {
        enumName: "Enum.PowerType",
        memberName: "Fury",
        value: 17,
        expansion: "Midnight",
        gameBuild: "12.1.0.69587",
        source:
          "SimulationCraft 33622e9d engine/dbc/generated/power_type_data.inc row 17 (Fury) and engine/sc_enums.hpp POWER_FURY = 17, both generated from the client's power types",
        verifiedOn: "2026-10-01",
      },
      wireCorroboration: {
        fixtureId: "wcl-rage-fury-focus-pre-cost",
        reportCode: "A7R6kxPJ1hC8YQ4w",
        reportRevision: 30,
        capturedOn: "2026-09-16",
        observation:
          "In the first 45 s of the same complete 20-player fight, the Demon Hunter (actor 18, DemonHunter/Havoc by " +
          "the committed fight-context master data) carried wire type 17 on 28 costed completed casts against a " +
          "stable max of 170, the snapshot on the caster's own side (resourceActor 1), costing 30, 35 or 40. The " +
          "fixture retains Eye Beam (198013) at 44/170 costing 30 and Annihilation (201427) at 109/170 costing 40. " +
          "No state between casts is established by this contract.",
      },
    },
    unitScale: {
      divisor: 1,
      powerTypeData: { id: 17, name: "Fury", divisor: 1.0 },
      wholeUnits: false,
      wireEncoding:
        "power_type_data.inc row 17 (Fury) carries divisor 1.0. On fixture wcl-rage-fury-focus-pre-cost the Demon " +
        "Hunter's (actor 18) Eye Beam costs 30 and Annihilation 40 on the wire, equal to the pinned DBC _cost of " +
        "their Fury rows (sc_spell_data.inc rows 10720 and 10809): the wire is in the DBC encoding.",
    },
  },
];

export type ResourceWireResolution =
  | { readonly ok: true; readonly wireType: number; readonly contract: ResourceWireContract }
  | { readonly ok: false; readonly reason: "NO_CONTRACT_FOR_RESOURCE" }
  | { readonly ok: false; readonly reason: "INCOMPATIBLE_VERSION"; readonly outcome: CompatibilityOutcome };

/**
 * The wire type carrying a resource, for this fight's parser version.
 *
 * The ONLY sanctioned way to obtain the number 4. Nothing else in the codebase
 * may hard-code it, and a contract test enforces that — a bare `4` in an
 * evaluator would be exactly the undocumented magic constant this module exists
 * to eliminate.
 */
export function resourceWireTypeFor(
  resourceId: ResourceId,
  keys: FightCompatibilityKeys,
): ResourceWireResolution {
  const contract = RESOURCE_WIRE_CONTRACTS.find((entry) => entry.resourceId === resourceId);
  if (contract === undefined) {
    return { ok: false, reason: "NO_CONTRACT_FOR_RESOURCE" };
  }
  const outcome = checkWireCompatibility(keys, contract.scope);
  if (!outcome.compatible) {
    return { ok: false, reason: "INCOMPATIBLE_VERSION", outcome };
  }
  return { ok: true, wireType: contract.wireType, contract };
}

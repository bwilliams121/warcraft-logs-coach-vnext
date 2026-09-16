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
 * WHAT A WIRE CONTRACT DOES NOT CLAIM: AN ABSOLUTE UNIT SCALE
 *
 * A contract says which RESOURCE a wire number describes. It does not claim that
 * Warcraft Logs encodes that resource on the same absolute scale as any other
 * tool. The same capture shows Rage at `max` 1300 and Runic Power at `max` 1250,
 * which are plainly not the numbers a player reads off their own bar.
 *
 * That is why the Energy adapter is defined as a PERCENTAGE and not as a raw
 * amount. SimulationCraft's `energy.pct` is itself a percentage from 0 to 100,
 * Warcraft Logs supplies an exact current amount and a contemporaneous maximum
 * on the SAME observation, and the ratio of two numbers in one encoding is
 * independent of what that encoding is. The absolute scale is therefore not an
 * input to the comparison at all. See `adaptEnergyPct`.
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
export type ResourceId = "COMBO_POINTS" | "ENERGY" | "HOLY_POWER";

export const RESOURCE_IDS = ["COMBO_POINTS", "ENERGY", "HOLY_POWER"] as const satisfies readonly ResourceId[];

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
 * One wire contract.
 *
 * Both evidence members are required and non-optional. See the module comment.
 */
export interface ResourceWireContract {
  readonly wireType: number;
  readonly resourceId: ResourceId;
  readonly scope: WireVersionScope;
  readonly evidence: {
    readonly gameEnum: GameEnumEvidence;
    readonly wireCorroboration: WireCorroborationEvidence;
  };
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

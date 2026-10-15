/**
 * The engine's PROFILE ECHO (M11-G3-2): what the pinned engine says it built
 * from the profile it was given, read from the same `json2` report.
 *
 * Call only after `parseSimcJson` has accepted the report (identity, settings
 * and actors verified). This reads the character-level surfaces the fidelity
 * gate compares against the logged evidence:
 *
 * - per stat-bearing item: item id, decoded item level, bonus / gem / enchant
 *   ids. The pinned report omits items without stats (report_json.cpp:387)
 *   and REORDERS bonus ids (not plain sorting), so bonus ids are a multiset.
 * - the talent string, race, level, specialization and role it echoes;
 * - every spell id the engine reports (buffs, constant buffs, actions and
 *   their child actions) — the observable trace of effects such as set
 *   bonuses, which the report does not list directly;
 * - stats at combat start (`collected_data.buffed_stats`).
 *
 * Fail-closed: an item token that cannot be read is SIMULATION_OUTPUT_MALFORMED.
 */

import { z } from "zod";

import { fail, succeed, type SimulationOutcome } from "./failures.js";

export interface EchoedItem {
  readonly slot: string;
  readonly itemId: number;
  readonly itemLevel: number;
  /** Ascending, duplicates kept (the engine's order is not semantic). */
  readonly bonusIds: readonly number[];
  readonly gemIds: readonly number[];
  readonly enchantId: number | null;
}

export interface ProfileEcho {
  readonly race: string;
  readonly level: number;
  readonly specialization: string;
  readonly role: string;
  readonly talents: string;
  readonly items: readonly EchoedItem[];
  /** Ascending, unique. */
  readonly observedSpellIds: readonly number[];
  readonly pullStats: {
    readonly strength: number;
    readonly agility: number;
    readonly stamina: number;
    readonly intellect: number;
    readonly critRating: number;
    readonly hasteRating: number;
    readonly masteryRating: number;
    readonly versatilityRating: number;
    readonly armor: number;
  };
}

/** An action entry; its `children` are read recursively by `collectIds`. */
const node = z.object({ id: z.number().optional(), children: z.array(z.unknown()).optional() });

const schema = z.object({
  sim: z.object({
    players: z
      .array(
        z.object({
          race: z.string(),
          level: z.number(),
          specialization: z.string(),
          role: z.string(),
          talents: z.string(),
          gear: z.record(z.string(), z.object({ encoded_item: z.string(), ilevel: z.number() })),
          buffs: z.array(z.object({ spell: z.number().optional() })).optional(),
          buffs_constant: z.array(z.object({ spell: z.number().optional() })).optional(),
          stats: z.array(node).optional(),
          collected_data: z.object({
            buffed_stats: z.object({
              attribute: z.object({
                strength: z.number(),
                agility: z.number(),
                stamina: z.number(),
                intellect: z.number(),
              }),
              stats: z.object({
                crit_rating: z.number(),
                haste_rating: z.number(),
                mastery_rating: z.number(),
                versatility_rating: z.number(),
                armor: z.number(),
              }),
            }),
          }),
        }),
      )
      .length(1),
  }),
});

const idList = (value: string): number[] | null => {
  const parts = value.split("/").map(Number);
  return parts.every((part) => Number.isSafeInteger(part) && part > 0) ? parts : null;
};

/** Parses one `encoded_item` (`name,id=…,bonus_id=a/b,gem_id=…,enchant_id=…`). */
export function parseEncodedItem(slot: string, encoded: string, itemLevel: number): EchoedItem | null {
  const tokens = encoded.split(",");
  const fields = new Map<string, string>();
  for (const token of tokens.slice(1)) {
    const at = token.indexOf("=");
    if (at <= 0) return null;
    fields.set(token.slice(0, at), token.slice(at + 1));
  }
  const itemId = Number(fields.get("id"));
  if (!Number.isSafeInteger(itemId) || itemId <= 0) return null;
  const bonus = fields.has("bonus_id") ? idList(fields.get("bonus_id") ?? "") : [];
  const gems = fields.has("gem_id") ? idList(fields.get("gem_id") ?? "") : [];
  const enchant = fields.has("enchant_id") ? Number(fields.get("enchant_id")) : null;
  if (
    bonus === null ||
    gems === null ||
    (enchant !== null && !(Number.isSafeInteger(enchant) && enchant > 0))
  )
    return null;
  return {
    slot,
    itemId,
    itemLevel,
    bonusIds: [...bonus].sort((a, b) => a - b),
    gemIds: [...gems].sort((a, b) => a - b),
    enchantId: enchant,
  };
}

function collectIds(nodes: readonly unknown[], into: Set<number>): void {
  for (const entry of nodes) {
    const parsed = node.safeParse(entry);
    if (!parsed.success) continue;
    if (typeof parsed.data.id === "number" && parsed.data.id > 0) into.add(parsed.data.id);
    if (parsed.data.children !== undefined) collectIds(parsed.data.children, into);
  }
}

export function extractProfileEcho(text: string): SimulationOutcome<ProfileEcho> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail("SIMULATION_OUTPUT_MALFORMED", "profile echo: not JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(
      "SIMULATION_OUTPUT_MALFORMED",
      `profile echo: ${issue?.path.join(".") ?? "(root)"} ${issue?.code ?? ""}`,
    );
  }
  const player = parsed.data.sim.players[0];
  if (player === undefined) return fail("SIMULATION_OUTPUT_MALFORMED", "profile echo: no player");
  const items: EchoedItem[] = [];
  for (const [slot, entry] of Object.entries(player.gear).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const item = parseEncodedItem(slot, entry.encoded_item, entry.ilevel);
    if (item === null) return fail("SIMULATION_OUTPUT_MALFORMED", `profile echo: gear.${slot} unreadable`);
    items.push(item);
  }
  const spells = new Set<number>();
  for (const buff of [...(player.buffs ?? []), ...(player.buffs_constant ?? [])]) {
    if (typeof buff.spell === "number" && buff.spell > 0) spells.add(buff.spell);
  }
  collectIds(player.stats ?? [], spells);
  const buffed = player.collected_data.buffed_stats;
  return succeed({
    race: player.race,
    level: player.level,
    specialization: player.specialization,
    role: player.role,
    talents: player.talents,
    items,
    observedSpellIds: [...spells].sort((a, b) => a - b),
    pullStats: {
      strength: buffed.attribute.strength,
      agility: buffed.attribute.agility,
      stamina: buffed.attribute.stamina,
      intellect: buffed.attribute.intellect,
      critRating: buffed.stats.crit_rating,
      hasteRating: buffed.stats.haste_rating,
      masteryRating: buffed.stats.mastery_rating,
      versatilityRating: buffed.stats.versatility_rating,
      armor: buffed.stats.armor,
    },
  });
}

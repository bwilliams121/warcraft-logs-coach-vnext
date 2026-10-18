/**
 * Golden-artifact projection (M11-G3-1/G3-2): a real `json2` report from the
 * approved engine, reduced to the fields `parseSimcJson` and
 * `extractProfileEcho` read. Drops build date/time/timestamp and every
 * timeline, so the artifact is deterministic and size-reviewable. The raw
 * report's SHA-256 is recorded in `_golden`.
 */

import { createHash } from "node:crypto";

type Json = Record<string, any>;

const pick = (value: Json, keys: readonly string[]): Json =>
  Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));

function statNode(node: Json): Json {
  return {
    id: node["id"],
    name: node["name"],
    type: node["type"],
    compound_amount: node["compound_amount"],
    ...(node["num_executes"] ? { num_executes: { mean: node["num_executes"].mean } } : {}),
    ...(Array.isArray(node["children"]) ? { children: node["children"].map(statNode) } : {}),
  };
}

export function goldenProjection(raw: string, source: Json): Json {
  const report = JSON.parse(raw) as Json;
  const options = report["sim"].options as Json;
  const player = report["sim"].players[0] as Json;
  return {
    _golden: {
      schema: "simc-golden-projection/2",
      ...source,
      rawSha256: createHash("sha256").update(raw).digest("hex"),
      rawBytes: new TextEncoder().encode(raw).byteLength,
      projection:
        "fields read by SIMC_JSON_2_PARSER_V1 and the profile echo; build_date, build_time, timestamp and all timelines dropped",
    },
    ...pick(report, [
      "version",
      "report_version",
      "ptr_enabled",
      "beta_enabled",
      "no_networking",
      "git_revision",
      "git_branch",
    ]),
    sim: {
      options: {
        ...pick(options, [
          "max_time",
          "vary_combat_length",
          "iterations",
          "target_error",
          "threads",
          "seed",
          "queue_lag",
          "queue_lag_stddev",
          "gcd_lag",
          "gcd_lag_stddev",
          "channel_lag",
          "channel_lag_stddev",
          "queue_gcd_reduction",
          "strict_gcd_queue",
          "confidence",
          "confidence_estimator",
          "world_lag",
          "world_lag_stddev",
          "travel_variance",
          "default_skill",
          "reaction_time",
          "fixed_time",
          "optimal_raid",
          "deterministic",
          "average_range",
          "average_gauss",
          "fight_style",
          "desired_targets",
          "default_aura_delay",
          "default_aura_delay_stddev",
        ]),
        dbc: {
          Live: pick(options["dbc"].Live, [
            "build_level",
            "wow_version",
            "hotfix_date",
            "hotfix_build",
            "hotfix_hash",
          ]),
          version_used: options["dbc"].version_used,
        },
      },
      overrides: report["sim"].overrides,
      statistics: pick(report["sim"].statistics, [
        "elapsed_cpu_seconds",
        "elapsed_time_seconds",
        "total_events_processed",
        "simulation_length",
      ]),
      players: [
        {
          ...pick(player, [
            "name",
            "race",
            "level",
            "role",
            "specialization",
            "talents",
            "reaction_offset",
            "reaction_max",
            "reaction_mean",
            "reaction_stddev",
            "reaction_nu",
            "ready_type",
            "world_lag",
            "world_lag_stddev",
            "brain_lag",
            "brain_lag_stddev",
            "potion",
            "flask",
            "food",
            "augmentation",
            "temporary_enchant",
          ]),
          collected_data: {
            dps: player["collected_data"].dps,
            buffed_stats: {
              attribute: player["collected_data"].buffed_stats.attribute,
              stats: pick(player["collected_data"].buffed_stats.stats, [
                "crit_rating",
                "haste_rating",
                "mastery_rating",
                "versatility_rating",
                "armor",
              ]),
            },
          },
          buffs: (player["buffs"] ?? []).map((buff: Json) => ({ name: buff["name"], spell: buff["spell"] })),
          buffs_constant: (player["buffs_constant"] ?? []).map((buff: Json) => ({
            name: buff["name"],
            spell: buff["spell"],
          })),
          stats: (player["stats"] ?? []).map(statNode),
          stats_pets: Object.fromEntries(
            Object.entries(player["stats_pets"] ?? {}).map(([name, list]) => [
              name,
              (list as Json[]).map(statNode),
            ]),
          ),
          gear: Object.fromEntries(
            Object.entries(player["gear"] as Json).map(([slot, item]) => [
              slot,
              { encoded_item: item.encoded_item, ilevel: item.ilevel },
            ]),
          ),
        },
      ],
      targets: report["sim"].targets.map((target: Json) => ({
        name: target["name"],
        level: target["level"],
      })),
      raid_events: (report["sim"].raid_events ?? []).map((event: Json) => ({
        name: event["name"],
        type: event["type"],
      })),
    },
  };
}

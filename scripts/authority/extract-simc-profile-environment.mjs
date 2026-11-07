#!/usr/bin/env node
/**
 * Deterministic extractor of the PINNED SIMC PROFILE ENVIRONMENT (SIMC-FB-A; agent/architecture.md
 * "Owner decision (2026-11-06): SimC profile fallback").
 *
 * The APL artifacts hold no environment, so this records what the pinned sources say about it, and
 * nothing judged:
 *
 *   1. For each specialization with an APL artifact, its `profiles/MID1/` profile and hero variants,
 *      with each file's hash, and every option line that would set the environment. The profiles at
 *      the pin set none, so they run under the engine's defaults. An override is recorded rather
 *      than skipped, and the runtime refuses that profile.
 *   2. For each model named, the engine lines that give those defaults meaning. A line must occur
 *      exactly once, and it is cited by path, file hash, line span and excerpt hash.
 *
 * A second model (`--also`) adds its build to `provenBuilds` ONLY when every excerpt and every
 * profile's option lines equal the analyzer pin's. That is the whole claim for it: the environment
 * reads the same at that build. It says nothing about the APL, which stays at the analyzer pin.
 *
 * Reads a local clone through `git show`. No network. Two runs over the same commits are identical.
 *
 *   node scripts/authority/extract-simc-profile-environment.mjs --repo <clone> \
 *     --pin 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --also 0a72e6a74684d23c989b2d76143e429d2b4f1c91 \
 *     --extracted-on 2026-11-06 --out src/data/simc-profile/simc-profile-environment.json
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { format, resolveConfig } from "prettier";

const GENERATOR_REVISION = 1;
const APL_DIRECTORY = "src/simc/data";
const PROFILE_DIRECTORY = "profiles/MID1";
const CLIENT_DATA_VERSION = "engine/dbc/generated/client_data_version.inc";

/** Option lines that would change the environment from the engine's defaults. */
export const ENVIRONMENT_OPTIONS = [
  "fight_style",
  "desired_targets",
  "desired_tank_targets",
  "raid_events",
  "enemy",
  "tank_dummy",
  "main_target",
  "distance_targeting_enabled",
  "ignore_invulnerable_targets",
  "override.target_health",
];

const ENVIRONMENT_OPTION_LINE = new RegExp(
  `^(?:${ENVIRONMENT_OPTIONS.map((option) => option.replace(".", "\\.")).join("|")})\\+?=`,
);

/** Every line of a profile that sets the environment, verbatim. A comment is not an option. */
export function environmentOptionLinesOf(profileText) {
  return profileText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => ENVIRONMENT_OPTION_LINE.test(line));
}

/** The line-delimited `CLIENT_DATA` build name in the client data version file. */
export function clientBuildOf(text) {
  const match = /CLIENT_DATA_WOW_VERSION\s+"([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)"/.exec(text);
  if (match === null) throw new Error("no client data build in the client data version file");
  return match[1];
}

/**
 * Each cited engine statement: the one line that anchors it, and how far it runs. `through` is the
 * last line's offset, or a text that ends it.
 */
export const ENGINE_SEMANTICS = [
  {
    semanticId: "DEFAULT_FIGHT_STYLE_IS_PATCHWERK",
    sourcePath: "engine/sim/sim.cpp",
    anchor: "      fight_style = FIGHT_STYLE_PATCHWERK;",
    before: 1,
    through: 1,
  },
  {
    semanticId: "PATCHWERK_HOLDS_NO_RAID_EVENTS",
    sourcePath: "engine/sim/sim.cpp",
    anchor: "    case FIGHT_STYLE_PATCHWERK:",
    before: 0,
    through: 2,
  },
  {
    semanticId: "DEFAULT_DESIRED_TARGETS_IS_ONE",
    sourcePath: "engine/sim/sim.cpp",
    anchor: "    desired_targets( 1 ),",
    before: 0,
    through: 0,
  },
  {
    semanticId: "DEFAULT_ENEMY_IS_THE_ONE_TARGET",
    sourcePath: "engine/sim/sim.cpp",
    anchor: '    target = module_t::tank_dummy_enemy()->create_player( this, "Fluffy_Pillow" );',
    before: 3,
    through: 6,
  },
  {
    semanticId: "DISTANCE_TARGETING_DEFAULTS_OFF",
    sourcePath: "engine/sim/sim.cpp",
    anchor: "    distance_targeting_enabled( false ),",
    before: 0,
    through: 0,
  },
  {
    semanticId: "ACTIVE_ENEMIES_IS_CONSTANT_ONE",
    sourcePath: "engine/sim/sim.cpp",
    anchor: '  if ( util::str_compare_ci( name_str, "active_enemies" ) )',
    before: 0,
    through: 9,
  },
  {
    semanticId: "FIGHT_STYLE_IS_A_NAME_COMPARISON",
    sourcePath: "engine/sim/sim.cpp",
    anchor: '  if ( splits.size() == 2 && util::str_compare_ci( splits[ 0 ], "fight_style" ) )',
    before: 0,
    through: 4,
  },
  {
    semanticId: "RAID_EVENT_EXPRESSION_IS_CONSTANT_WHEN_NONE_MATCH",
    sourcePath: "engine/sim/sim.cpp",
    anchor: '  if ( splits.size() >= 3 && util::str_compare_ci( splits[ 0 ], "raid_event" ) )',
    before: 0,
    through: 12,
  },
  {
    semanticId: "RAID_EVENT_ABSENT_VALUES",
    sourcePath: "engine/sim/raid_event.cpp",
    anchor: "  if ( matching_events.empty() )",
    before: 0,
    through: 10,
  },
  {
    semanticId: "TIMESPAN_MAXIMUM",
    sourcePath: "engine/util/timespan.hpp",
    anchor: "    static constexpr timespan_t max()",
    before: 0,
    through: 3,
  },
  {
    semanticId: "SPELL_TARGETS_WITHOUT_DISTANCE_TARGETING",
    sourcePath: "engine/action/action.cpp",
    anchor:
      '      if ( sim->target_list.size() == 1U && !sim->has_raid_event( "adds" ) && !sim->has_raid_event( "pull" ) )',
    before: 1,
    through: 8,
  },
  {
    semanticId: "TARGET_IF_WITH_ONE_CANDIDATE",
    sourcePath: "engine/action/action.cpp",
    anchor: "  if ( target_list().size() == 1 )",
    before: 0,
    through: 9,
  },
  {
    semanticId: "TARGET_READY",
    sourcePath: "engine/action/action.cpp",
    anchor: "bool action_t::target_ready( player_t* candidate_target )",
    before: 0,
    through: 15,
  },
];

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

function parseArgs(argv) {
  const parsed = new Map();
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`bad argument ${String(key)}`);
    parsed.set(key.slice(2), value);
  }
  return parsed;
}

/** The excerpt for one semantic. Refuses an anchor that does not occur exactly once. */
export function citeSemantic(semantic, text) {
  const lines = text.split("\n");
  const hits = [];
  lines.forEach((line, index) => {
    if (line.trimEnd() === semantic.anchor) hits.push(index);
  });
  if (hits.length !== 1) {
    throw new Error(
      `${semantic.semanticId}: anchor occurs ${String(hits.length)} times in ${semantic.sourcePath}`,
    );
  }
  const anchorIndex = hits[0];
  const start = anchorIndex - semantic.before;
  const end = anchorIndex + semantic.through;
  const excerpt = lines
    .slice(start, end + 1)
    .map((line) => line.trimEnd())
    .join("\n");
  return {
    semanticId: semantic.semanticId,
    sourcePath: semantic.sourcePath,
    sourceSha256: sha256(text),
    startLine: start + 1,
    endLine: end + 1,
    excerptSha256: sha256(excerpt),
  };
}

function titleCase(token) {
  return token.charAt(0).toUpperCase() + token.slice(1);
}

const CLASS_PROFILE_NAMES = {
  deathknight: "Death_Knight",
  demonhunter: "Demon_Hunter",
};

/** `profiles/MID1/MID1_<Class>_<Spec>`, the base name of one specialization's profiles. */
export function profileStemOf(className, specName) {
  const classPart = CLASS_PROFILE_NAMES[className] ?? titleCase(className);
  const specPart = specName.split("_").map(titleCase).join("_");
  return `MID1_${classPart}_${specPart}`;
}

function main() {
  const args = parseArgs(process.argv);
  const repo = args.get("repo");
  const pin = args.get("pin");
  const also = args.get("also");
  const extractedOn = args.get("extracted-on");
  const out = args.get("out");
  if (!repo || !pin || !also || !extractedOn || !out) {
    throw new Error("--repo, --pin, --also, --extracted-on and --out are all required");
  }

  const git = (...gitArgs) =>
    execFileSync("git", ["-C", repo, ...gitArgs], { encoding: "utf8", maxBuffer: 1 << 28 });
  const show = (commit, path) => git("show", `${commit}:${path}`).replace(/\r\n/g, "\n");
  const profilesAt = (commit) =>
    git("ls-tree", "--name-only", `${commit}:${PROFILE_DIRECTORY}`)
      .split("\n")
      .filter((name) => name.endsWith(".simc"));

  const modelOf = (commit) => ({
    simcCommit: commit,
    gameDataBuild: clientBuildOf(show(commit, CLIENT_DATA_VERSION)),
    commitDate: git("show", "-s", "--format=%cI", commit).trim(),
    semantics: ENGINE_SEMANTICS.map((semantic) => citeSemantic(semantic, show(commit, semantic.sourcePath))),
  });
  const pinModel = modelOf(pin);
  const alsoModel = modelOf(also);
  const excerpts = (model) =>
    model.semantics.map((entry) => `${entry.semanticId}:${entry.excerptSha256}`).join();

  const pinFiles = profilesAt(pin);
  const alsoFiles = new Set(profilesAt(also));
  let alsoAgrees = excerpts(pinModel) === excerpts(alsoModel);

  const profiles = readdirSync(APL_DIRECTORY)
    .filter((name) => name.endsWith(".apl.json"))
    .sort()
    .map((name) => {
      const artifact = JSON.parse(readFileSync(join(APL_DIRECTORY, name), "utf8"));
      if (artifact.provenance.commitSha !== pin) {
        throw new Error(`${name} is pinned to ${String(artifact.provenance.commitSha)}, not ${pin}`);
      }
      const stem = profileStemOf(artifact.spec.className, artifact.spec.specName);
      const matching = pinFiles.filter((file) => file === `${stem}.simc` || file.startsWith(`${stem}_`));
      if (!matching.includes(`${stem}.simc`)) throw new Error(`${name}: no profile ${stem}.simc at the pin`);
      const files = matching.map((file) => {
        const path = `${PROFILE_DIRECTORY}/${file}`;
        const text = show(pin, path);
        const environmentOptionLines = environmentOptionLinesOf(text);
        if (alsoFiles.has(file)) {
          const later = environmentOptionLinesOf(show(also, path));
          if (later.join("\n") !== environmentOptionLines.join("\n")) alsoAgrees = false;
        } else {
          alsoAgrees = false;
        }
        return { path, sha256: sha256(text), environmentOptionLines };
      });
      return {
        aplAuthorityId: artifact.authorityId,
        profiles: files,
      };
    });

  const artifact = {
    artifactVersion: 1,
    datasetId: "SIMC_PROFILE_ENVIRONMENT",
    datasetRevision: `simc-${pin.slice(0, 8)}-1`,
    generatorRevision: GENERATOR_REVISION,
    extractedOn,
    source: {
      repository: "simulationcraft/simc",
      analyzerPin: pin,
      profileDirectory: PROFILE_DIRECTORY,
    },
    engineDefaultEnvironment: {
      fightStyle: "Patchwerk",
      targetCount: 1,
      raidEventCount: 0,
      distanceTargetingEnabled: false,
    },
    models: alsoAgrees ? [pinModel, alsoModel] : [pinModel],
    specializations: profiles,
  };
  return format(JSON.stringify(artifact), { parser: "json" }).then(async (text) => {
    const config = await resolveConfig(out);
    const formatted = await format(text, { ...config, parser: "json" });
    writeFileSync(out, formatted);
    process.stdout.write(
      `${out}: ${String(profiles.length)} specializations, models ${artifact.models.map((model) => model.gameDataBuild).join(", ")}\n`,
    );
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}

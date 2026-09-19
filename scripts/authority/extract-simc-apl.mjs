#!/usr/bin/env node
/**
 * Deterministic SimulationCraft APL extractor.
 *
 * Reads ONE pinned commit of one class module's APL source and emits one
 * specialization's authority artifact. Run manually; never at runtime. The
 * analyzer has no network dependency on GitHub or the SimulationCraft site — it
 * imports the committed JSON this produces.
 *
 * TARGETS. Each extractable specialization is a TARGET profile below: which
 * source file, which region markers, which function header, which authority
 * id, and which facts the pinned source must exhibit. `--target` selects one;
 * the default is `rogue-assassination`, so every invocation recorded before
 * M10-B regenerates the Assassination artifact byte for byte. M10-B added
 * `paladin-protection` (`engine/class_modules/apl/apl_paladin.cpp`, the
 * `//protection_apl_start` region). A target is a set of coordinates and
 * required facts, never a different parser.
 *
 * FAIL CLOSED IS THE WHOLE POINT. This is not a general C++ parser, and it does
 * not try to be. It understands exactly five constructs inside the bounded
 * region: the list declaration, `add_action`, braces, comments, and (M11-B2)
 * a CLIENT-VERSION GUARD — `if ( p->sim->dbc->wowv() <op> wowv_t( a, b, c ) )`
 * or its `else if` — over a `{ ... }` block or the single statement that
 * follows. Anything else inside that region is a hard failure with a line
 * number, because an extractor that silently skipped a line it did not
 * understand would emit an artifact that LOOKS complete while missing an action
 * — and the reachability proof built on it would be worthless.
 *
 * VERSION GUARDS (M11-B2). SimulationCraft keeps both sides of a patch
 * transition in one region and picks at runtime by the client build the DBC
 * was generated from. A target that names a `clientVersion` has every guard
 * EVALUATED against it: the statements under a guard that holds are emitted at
 * their ordinal positions, the statements under one that does not are parsed
 * (they must still be well-formed `add_action` lines) and DROPPED, and every
 * guard — its line, its comparison, whether it held, how many statements it
 * governed — is recorded in the artifact's provenance so a reader can see that
 * a dead branch was excluded rather than never present. A target without
 * `clientVersion` fails on the first guard, exactly as before: no target
 * silently acquires branch selection. One level only; a nested guard fails.
 *
 * The artifact stores `actionStringVerbatim`: the exact first string argument
 * given to `add_action`. It deliberately does NOT store a synthesized
 * `actions+=/...` line, because the source does not contain one, and it does NOT
 * store derived fields (actionToken, conditionRaw, callsListName) — those are
 * derived at load time from the verbatim string, so there is exactly one source
 * of truth and "reproducible from the verbatim string" is true by construction.
 *
 *   node scripts/authority/extract-simc-apl.mjs \
 *     --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
 *     --out src/simc/data/rogue-assassination.apl.json
 *
 *   node scripts/authority/extract-simc-apl.mjs --target paladin-protection \
 *     --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
 *     --out src/simc/data/paladin-protection.apl.json
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const REPOSITORY = "https://github.com/simulationcraft/simc";
const EXTRACTOR_VERSION = 1;
const ARTIFACT_VERSION = 1;

/**
 * Facts this extractor REQUIRES the pinned source to exhibit, per target.
 *
 * Checked against the extracted artifact, not against a prompt. If the pinned
 * commit stops satisfying one of these, extraction fails loudly rather than
 * producing an artifact whose downstream verdicts would rest on a stale belief.
 *
 * Assassination's facts are about its list call graph. Protection's are
 * deliberately structural only — two lists, no list dispatch, the spender and
 * the self-heal each present exactly once in `default` — because M10-B pins
 * the artifact without evaluating it; the facts a Protection evaluator will
 * rest on are M10-C's to state.
 */
const TARGETS = {
  "rogue-assassination": {
    sourcePath: "engine/class_modules/apl/apl_rogue.cpp",
    regionStart: "//assassination_apl_start",
    regionEnd: "//assassination_apl_end",
    functionHeader: "void assassination( player_t* p )",
    regionName: "assassination",
    authorityId: "SIMC_APL_ROGUE_ASSASSINATION",
    spec: { className: "rogue", specName: "assassination" },
    defaultOut: "src/simc/data/rogue-assassination.apl.json",
    requiredFacts: {
      kind: "ASSASSINATION_CALL_GRAPH",
      entryListName: "default",
      requiredLists: [
        "default",
        "precombat",
        "cds",
        "core_dot",
        "generate",
        "spend",
        "items",
        "misc_cds",
        "vanish",
      ],
      spendCallCondition:
        "!buff.darkest_night.up&combo_points>=5|buff.darkest_night.up&combo_points.deficit=0",
      generateCallCondition:
        "!buff.darkest_night.up&combo_points<5|buff.darkest_night.up&combo_points.deficit>0",
      envenomOnlyInList: "spend",
      crimsonTempestInList: "generate",
      defaultOrder: ["cds", "core_dot", "generate", "spend"],
    },
  },
  "paladin-protection": {
    sourcePath: "engine/class_modules/apl/apl_paladin.cpp",
    regionStart: "//protection_apl_start",
    regionEnd: "//protection_apl_end",
    functionHeader: "void protection( player_t* p )",
    regionName: "protection",
    authorityId: "SIMC_APL_PALADIN_PROTECTION",
    spec: { className: "paladin", specName: "protection" },
    defaultOut: "src/simc/data/paladin-protection.apl.json",
    requiredFacts: {
      kind: "PROTECTION_STRUCTURE",
      entryListName: "default",
      requiredLists: ["default", "precombat"],
      noListDispatch: true,
      exactlyOnceInDefault: ["shield_of_the_righteous", "word_of_glory"],
    },
  },
  "paladin-retribution": {
    sourcePath: "engine/class_modules/apl/apl_paladin.cpp",
    regionStart: "//retribution_apl_start",
    regionEnd: "//retribution_apl_end",
    functionHeader: "void retribution( player_t* p )",
    regionName: "retribution",
    authorityId: "SIMC_APL_PALADIN_RETRIBUTION",
    spec: { className: "paladin", specName: "retribution" },
    defaultOut: "src/simc/data/paladin-retribution.apl.json",
    // The facts the M11-A4 spender slice rests on (agent/m11-a4-first-spec-contract.md
    // section 2): every one is structural and read off the pinned text.
    requiredFacts: {
      kind: "RETRIBUTION_CALL_GRAPH",
      entryListName: "default",
      requiredLists: ["default", "precombat", "cooldowns", "generators", "finishers"],
      defaultOrder: ["cooldowns", "generators"],
      // `finishers` is reachable from `generators` exactly twice: a gated call
      // the shared evaluator cannot decide, and an UNCONDITIONAL call further
      // down, which is the definitive entry to the spender decision.
      finishersCalls: [
        {
          list: "generators",
          ordinal: 0,
          condition: "holy_power=5&cooldown.wake_of_ashes.remains|buff.hammer_of_light_free.remains<gcd*2",
        },
        { list: "generators", ordinal: 5, condition: null },
      ],
      // The two spenders: one entry each, both in `finishers`, in this order.
      finishersSpenders: [
        { token: "divine_storm", condition: "variable.ds_castable" },
        { token: "templars_verdict", condition: null },
      ],
      dsCastableValue:
        "(active_enemies>=2|buff.divine_arbiter_verdict.up)&!buff.empyrean_legacy.up&!buff.divine_arbiter_divine_storm.up",
      // `pre_es_wake` is reset in precombat and never assigned in combat.
      resetOnlyVariables: ["pre_es_wake"],
    },
  },
  "deathknight-blood": {
    sourcePath: "engine/class_modules/apl/apl_death_knight.cpp",
    regionStart: "//blood_apl_start",
    regionEnd: "//blood_apl_end",
    functionHeader: "void blood( player_t* p )",
    regionName: "blood",
    authorityId: "SIMC_APL_DEATHKNIGHT_BLOOD",
    spec: { className: "deathknight", specName: "blood" },
    defaultOut: "src/simc/data/deathknight-blood.apl.json",
    // The pinned region carries both sides of the 12.1.0 transition behind
    // `p->sim->dbc->wowv()` guards; the roster pins the DBC at 12.1.0.69587,
    // so the `>= 12.1.0` side is the authority and the `< 12.1.0` side is dead.
    clientVersion: [12, 1, 0],
    // M11-B2: a GENERIC pinned dispatch graph. The verifier below reads no
    // Blood semantics; this data is the whole claim. Every dispatch entry in
    // the artifact must be listed here with its kind, source, ordinal, target
    // and verbatim gate — call and run are distinct kinds — and every list's
    // entry count is pinned, so a moved, added, removed or re-gated dispatch
    // line, or any change to a list's length, fails extraction.
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: ["default", "precombat", "high_prio_actions", "deathbringer", "san_gift", "sanlayn"],
      listSizes: {
        default: 17,
        precombat: 2,
        high_prio_actions: 2,
        deathbringer: 12,
        san_gift: 8,
        sanlayn: 15,
      },
      edges: [
        { from: "default", ordinal: 13, kind: "CALL", to: "high_prio_actions", condition: null },
        {
          from: "default",
          ordinal: 14,
          kind: "RUN",
          to: "deathbringer",
          condition: "hero_tree.deathbringer",
        },
        {
          from: "default",
          ordinal: 15,
          kind: "RUN",
          to: "san_gift",
          condition: "hero_tree.sanlayn&buff.gift_of_the_sanlayn.up",
        },
        { from: "default", ordinal: 16, kind: "RUN", to: "sanlayn", condition: "hero_tree.sanlayn" },
      ],
      forbiddenTokens: ["swap_action_list"],
      noTargetingOptions: true,
    },
  },
};

const args = parseArgs(process.argv.slice(2));
const targetName = typeof args.target === "string" ? args.target : "rogue-assassination";
const TARGET = TARGETS[targetName];
if (TARGET === undefined) {
  console.error(
    `EXTRACTION FAILED: unknown --target '${targetName}' (known: ${Object.keys(TARGETS).join(", ")})`,
  );
  process.exit(1);
}
const SOURCE_PATH = TARGET.sourcePath;
const REGION_START = TARGET.regionStart;
const REGION_END = TARGET.regionEnd;
const REQUIRED_FACTS = TARGET.requiredFacts;

function fail(message) {
  console.error(`EXTRACTION FAILED: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    args[key] = next === undefined || next.startsWith("--") ? true : next;
    if (args[key] !== true) i += 1;
  }
  return args;
}

async function loadSource(args) {
  if (typeof args.file === "string") {
    return readFileSync(args.file);
  }
  if (typeof args.sha !== "string" || !/^[0-9a-f]{40}$/.test(args.sha)) {
    fail("--sha must be a full 40-character commit SHA (or pass --file for a local copy)");
  }
  const url = `https://raw.githubusercontent.com/simulationcraft/simc/${args.sha}/${SOURCE_PATH}`;
  const response = await fetch(url, { headers: { "User-Agent": "wlc-vnext-extractor" } });
  if (!response.ok) {
    fail(`could not fetch pinned source (HTTP ${response.status}) from ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Reads one C++ double-quoted string literal starting at `start`.
 *
 * Handles `\"` and `\\`. Returns the decoded value and the index just past the
 * closing quote. A literal that does not terminate is a failure, never a
 * truncated value.
 */
function readStringLiteral(line, start, lineNumber) {
  if (line[start] !== '"') {
    fail(`line ${lineNumber}: expected a string literal at column ${start + 1}`);
  }
  let value = "";
  let index = start + 1;
  while (index < line.length) {
    const char = line[index];
    if (char === "\\") {
      const escaped = line[index + 1];
      if (escaped === undefined) fail(`line ${lineNumber}: dangling escape in string literal`);
      if (escaped === '"') value += '"';
      else if (escaped === "\\") value += "\\";
      else if (escaped === "n") value += "\n";
      else fail(`line ${lineNumber}: unsupported escape \\${escaped} in string literal`);
      index += 2;
      continue;
    }
    if (char === '"') {
      return { value, next: index + 1 };
    }
    value += char;
    index += 1;
  }
  fail(`line ${lineNumber}: unterminated string literal`);
  return { value: "", next: index };
}

/** `add_action( "a" )` or `add_action( "a", "comment" )`. Anything else fails. */
function parseAddActionArguments(line, openParenIndex, lineNumber) {
  let index = openParenIndex + 1;
  const skipSpace = () => {
    while (index < line.length && /\s/.test(line[index])) index += 1;
  };

  skipSpace();
  const first = readStringLiteral(line, index, lineNumber);
  index = first.next;
  skipSpace();

  let comment = null;
  if (line[index] === ",") {
    index += 1;
    skipSpace();
    const second = readStringLiteral(line, index, lineNumber);
    comment = second.value;
    index = second.next;
    skipSpace();
  }

  if (line[index] !== ")") {
    fail(
      `line ${lineNumber}: add_action takes one or two string literals; found an unsupported argument form`,
    );
  }
  index += 1;
  skipSpace();
  if (line[index] !== ";" || index + 1 !== line.length) {
    fail(`line ${lineNumber}: expected the statement to end with ');'`);
  }
  return { actionStringVerbatim: first.value, comment };
}

/**
 * A client-version guard line, or `null`.
 *
 *     if ( p->sim->dbc->wowv() < wowv_t( 12, 1, 0 ) )
 *     else if ( p->sim->dbc->wowv() >= wowv_t( 12, 1, 0 ) )
 *
 * Only this exact shape is a guard. Any other `if` is an unsupported construct
 * and fails the region, as every unknown line always has.
 */
const VERSION_GUARD =
  /^(else\s+)?if\s*\(\s*p->sim->dbc->wowv\(\)\s*(<=|>=|==|!=|<|>)\s*wowv_t\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*\)$/;

function compareVersions(left, right) {
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

/** Whether `clientVersion <op> guardVersion` holds. Total over the six operators the regex admits. */
function guardHolds(clientVersion, operator, guardVersion) {
  const cmp = compareVersions(clientVersion, guardVersion);
  switch (operator) {
    case "<":
      return cmp < 0;
    case "<=":
      return cmp <= 0;
    case ">":
      return cmp > 0;
    case ">=":
      return cmp >= 0;
    case "==":
      return cmp === 0;
    case "!=":
      return cmp !== 0;
    default:
      return fail(`unsupported version operator '${operator}'`);
  }
}

function extract(sourceText) {
  const lines = sourceText.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === REGION_START);
  const endIndex = lines.findIndex((line) => line.trim() === REGION_END);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    fail(`could not locate the bounded region between ${REGION_START} and ${REGION_END}`);
  }

  const listNameByReceiver = new Map();
  const actionsByList = new Map();
  const listOrder = [];

  const declaration =
    /^action_priority_list_t\*\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*p->get_action_priority_list\(\s*"([^"]+)"\s*\)\s*;$/;
  const addActionHead = /^([A-Za-z_][A-Za-z0-9_]*)->add_action\s*\(/;

  let sawFunctionHeader = false;
  let braceDepth = 0;

  // ---- version guards (M11-B2) ----
  //
  // `pending` is a guard whose governed statement(s) have not started yet:
  // the next line decides whether it governs a `{ ... }` block or one
  // statement. `active` is a block guard until its closing brace. Both
  // carry `taken`; a statement under a guard that did not hold is parsed
  // for well-formedness and then dropped, and the guard's record counts it.
  const guards = [];
  let pending = null;
  let active = null;
  let lastGuard = null;

  for (let i = startIndex + 1; i < endIndex; i += 1) {
    const rawLine = lines[i];
    const lineNumber = i + 1;
    const line = rawLine.trim();

    if (line.length === 0) continue;
    if (line.startsWith("//")) continue;

    if (!sawFunctionHeader) {
      if (line === TARGET.functionHeader) {
        sawFunctionHeader = true;
        continue;
      }
      fail(
        `line ${lineNumber}: unexpected construct before the ${TARGET.regionName} function header: ${line}`,
      );
    }

    const guard = VERSION_GUARD.exec(line);
    if (guard !== null) {
      const [, elseKeyword, operator, a, b, c] = guard;
      if (TARGET.clientVersion === undefined) {
        fail(
          `line ${lineNumber}: a client-version guard exists in the ${TARGET.regionName} region and the target declares no clientVersion to evaluate it against: ${line}`,
        );
      }
      if (pending !== null)
        fail(`line ${lineNumber}: a version guard follows another with no governed statement`);
      if (active !== null) fail(`line ${lineNumber}: nested version guards are not supported`);
      if (elseKeyword !== undefined && (lastGuard === null || lastGuard.endLine === null)) {
        fail(`line ${lineNumber}: 'else if' with no preceding closed version guard`);
      }
      const guardVersion = [Number(a), Number(b), Number(c)];
      const taken = guardHolds(TARGET.clientVersion, operator, guardVersion);
      const record = {
        line: lineNumber,
        form: elseKeyword === undefined ? "IF" : "ELSE_IF",
        comparison: `wowv() ${operator} ${guardVersion.join(".")}`,
        clientVersion: TARGET.clientVersion.join("."),
        holds: taken,
        statementsEmitted: 0,
        statementsDropped: 0,
        endLine: null,
      };
      guards.push(record);
      pending = record;
      lastGuard = record;
      continue;
    }

    if (line === "{") {
      braceDepth += 1;
      if (pending !== null) {
        active = { record: pending, depth: braceDepth };
        pending = null;
      }
      continue;
    }
    if (line === "}") {
      if (pending !== null) fail(`line ${lineNumber}: a version guard governs no statement`);
      if (active !== null && active.depth === braceDepth) {
        active.record.endLine = lineNumber;
        active = null;
      }
      braceDepth -= 1;
      if (braceDepth < 0) fail(`line ${lineNumber}: unbalanced closing brace`);
      continue;
    }

    // The guard governing THIS line, if any: a block guard, or a pending
    // single-statement guard, which this line closes.
    let governing = active === null ? null : active.record;
    if (pending !== null) {
      governing = pending;
      governing.endLine = lineNumber;
      pending = null;
    }

    const declared = declaration.exec(line);
    if (declared !== null) {
      const [, receiver, listName] = declared;
      if (listNameByReceiver.has(receiver)) {
        fail(`line ${lineNumber}: receiver ${receiver} declared twice`);
      }
      if (listOrder.includes(listName)) {
        fail(`line ${lineNumber}: list ${listName} declared twice`);
      }
      listNameByReceiver.set(receiver, listName);
      actionsByList.set(listName, []);
      listOrder.push(listName);
      continue;
    }

    const added = addActionHead.exec(line);
    if (added !== null) {
      const receiver = added[1];
      const listName = listNameByReceiver.get(receiver);
      if (listName === undefined) {
        fail(`line ${lineNumber}: add_action on undeclared receiver '${receiver}'`);
      }
      const openParen = line.indexOf("(", added[0].length - 1);
      const parsed = parseAddActionArguments(line, openParen, lineNumber);
      if (governing !== null && !governing.holds) {
        // Well-formed, parsed, and NOT the authority at this client version.
        governing.statementsDropped += 1;
        continue;
      }
      if (governing !== null) governing.statementsEmitted += 1;
      const bucket = actionsByList.get(listName);
      bucket.push({
        priorityOrdinal: bucket.length,
        actionStringVerbatim: parsed.actionStringVerbatim,
        comment: parsed.comment,
        sourceLine: lineNumber,
      });
      continue;
    }

    if (governing !== null) {
      fail(`line ${lineNumber}: a version guard may govern only add_action statements: ${line}`);
    }

    // Reached only by a construct this extractor does not model. Failing here is
    // the contract: a silently skipped line produces a complete-looking artifact
    // with a missing action, and every reachability proof built on it is void.
    fail(`line ${lineNumber}: unsupported construct inside the ${TARGET.regionName} region: ${line}`);
  }

  if (!sawFunctionHeader) fail(`${TARGET.regionName} function header not found inside the region`);
  if (braceDepth !== 0) fail(`unbalanced braces inside the ${TARGET.regionName} region`);
  if (pending !== null || active !== null) fail(`a version guard is left open at the end of the region`);

  return {
    lists: listOrder.map((listName) => ({
      listName,
      receiverIdentifier: [...listNameByReceiver.entries()].find(([, name]) => name === listName)[0],
      actions: actionsByList.get(listName),
    })),
    guards,
  };
}

// --------------------------------------------------------------------------
// Derivations used only to VERIFY the required facts. The artifact stores none
// of them; the runtime re-derives them from `actionStringVerbatim`.
// --------------------------------------------------------------------------

function actionTokenOf(actionString) {
  const comma = actionString.indexOf(",");
  return comma < 0 ? actionString : actionString.slice(0, comma);
}

function conditionOf(actionString) {
  const marker = ",if=";
  const at = actionString.indexOf(marker);
  if (at < 0) return null;
  if (actionString.indexOf(marker, at + 1) >= 0) {
    fail(`action string carries more than one ',if=' and is ambiguous: ${actionString}`);
  }
  return actionString.slice(at + marker.length);
}

function callsListOf(actionString) {
  const token = actionTokenOf(actionString);
  if (token !== "call_action_list" && token !== "run_action_list") return null;
  const match = /(?:^|,)name=([A-Za-z_][A-Za-z0-9_]*)/.exec(actionString);
  if (match === null) fail(`${token} without a name= parameter: ${actionString}`);
  return match[1];
}

function verifyRequiredFacts(artifact) {
  const byName = new Map(artifact.lists.map((list) => [list.listName, list]));
  const problems = [];

  for (const required of REQUIRED_FACTS.requiredLists) {
    if (!byName.has(required)) problems.push(`missing required list '${required}'`);
  }
  if (artifact.entryListName !== REQUIRED_FACTS.entryListName) {
    problems.push(`entry list is '${artifact.entryListName}'`);
  }

  if (REQUIRED_FACTS.kind === "PROTECTION_STRUCTURE") {
    // Structural facts only: no call_action_list / run_action_list anywhere,
    // and each named action exactly once in `default`. Nothing about which
    // action wins — that is not this milestone's claim.
    for (const list of artifact.lists) {
      for (const action of list.actions) {
        if (REQUIRED_FACTS.noListDispatch && callsListOf(action.actionStringVerbatim) !== null) {
          problems.push(`list dispatch found in '${list.listName}': ${action.actionStringVerbatim}`);
        }
        const token = actionTokenOf(action.actionStringVerbatim);
        if (token === "run_action_list" || token === "swap_action_list") {
          problems.push(`unmodelled dispatch '${token}' found in '${list.listName}'`);
        }
      }
    }
    const defaults = byName.get("default");
    for (const required of REQUIRED_FACTS.exactlyOnceInDefault) {
      const count = (defaults?.actions ?? []).filter(
        (action) => actionTokenOf(action.actionStringVerbatim) === required,
      ).length;
      if (count !== 1)
        problems.push(`'${required}' appears ${count} times in default, expected exactly once`);
    }
    return problems;
  }

  if (REQUIRED_FACTS.kind === "DISPATCH_GRAPH") {
    // GENERIC (M11-B2). The target supplies the whole expected topology —
    // every list's size and every dispatch edge with its kind, coordinates and
    // verbatim gate — and this block compares, in full, both ways. It reads
    // no token semantics: which list a run enters or what a gate means is the
    // target's data, never this code's opinion. A run edge and a call edge
    // are different kinds and never match each other.
    for (const [listName, size] of Object.entries(REQUIRED_FACTS.listSizes)) {
      const actual = byName.get(listName)?.actions.length ?? null;
      if (actual !== size) {
        problems.push(`list '${listName}' has ${String(actual)} entries, expected ${String(size)}`);
      }
    }
    for (const list of artifact.lists) {
      if (!(list.listName in REQUIRED_FACTS.listSizes)) {
        problems.push(`list '${list.listName}' is not in the pinned topology`);
      }
    }
    const actualEdges = [];
    for (const list of artifact.lists) {
      list.actions.forEach((action, ordinal) => {
        const token = actionTokenOf(action.actionStringVerbatim);
        if ((REQUIRED_FACTS.forbiddenTokens ?? []).includes(token)) {
          problems.push(`forbidden token '${token}' found in '${list.listName}'`);
        }
        if (
          REQUIRED_FACTS.noTargetingOptions &&
          /(?:^|,)(?:target_if|cycle_targets)=/.test(action.actionStringVerbatim)
        ) {
          problems.push(`targeting option found in '${list.listName}': ${action.actionStringVerbatim}`);
        }
        const kind = token === "call_action_list" ? "CALL" : token === "run_action_list" ? "RUN" : null;
        if (kind === null) return;
        actualEdges.push({
          from: list.listName,
          ordinal,
          kind,
          to: callsListOf(action.actionStringVerbatim),
          condition: conditionOf(action.actionStringVerbatim),
        });
      });
    }
    const key = (edge) =>
      `${edge.from}[${String(edge.ordinal)}] ${edge.kind} -> ${edge.to} if=${JSON.stringify(edge.condition)}`;
    const expected = REQUIRED_FACTS.edges.map(key);
    const actual = actualEdges.map(key);
    if (expected.join("\n") !== actual.join("\n")) {
      problems.push(
        `dispatch graph differs from the pinned topology\n  expected:\n    ${expected.join("\n    ")}\n  actual:\n    ${actual.join("\n    ")}`,
      );
    }
    for (const edge of actualEdges) {
      if (!byName.has(edge.to))
        problems.push(`dispatch edge ${key(edge)} names a list the region does not declare`);
    }
    return problems;
  }

  if (REQUIRED_FACTS.kind === "RETRIBUTION_CALL_GRAPH") {
    for (const list of artifact.lists) {
      for (const action of list.actions) {
        const token = actionTokenOf(action.actionStringVerbatim);
        if (token === "run_action_list" || token === "swap_action_list") {
          problems.push(`unmodelled dispatch '${token}' found in '${list.listName}'`);
        }
        if (/(?:^|,)(?:target_if|cycle_targets)=/.test(action.actionStringVerbatim)) {
          problems.push(`targeting option found in '${list.listName}': ${action.actionStringVerbatim}`);
        }
      }
    }
    const defaults = byName.get("default");
    const calls = (defaults?.actions ?? [])
      .map((action) => callsListOf(action.actionStringVerbatim))
      .filter((name) => name !== null);
    if (calls.join(",") !== REQUIRED_FACTS.defaultOrder.join(",")) {
      problems.push(
        `default list calls [${calls.join(", ")}], expected [${REQUIRED_FACTS.defaultOrder.join(", ")}]`,
      );
    }
    // Every call into `finishers`, anywhere, must be one of the two pinned ones.
    const finisherCalls = [];
    for (const list of artifact.lists) {
      list.actions.forEach((action, ordinal) => {
        if (callsListOf(action.actionStringVerbatim) === "finishers") {
          finisherCalls.push({
            list: list.listName,
            ordinal,
            condition: conditionOf(action.actionStringVerbatim),
          });
        }
      });
    }
    const expectedCalls = REQUIRED_FACTS.finishersCalls;
    if (JSON.stringify(finisherCalls) !== JSON.stringify(expectedCalls)) {
      problems.push(
        `finishers is called as ${JSON.stringify(finisherCalls)}, expected ${JSON.stringify(expectedCalls)}`,
      );
    }
    // The spenders appear ONLY in `finishers`, once each, in order, with the pinned gates.
    for (const spender of REQUIRED_FACTS.finishersSpenders) {
      const occurrences = [];
      for (const list of artifact.lists) {
        for (const action of list.actions) {
          if (actionTokenOf(action.actionStringVerbatim) === spender.token) {
            occurrences.push({ list: list.listName, condition: conditionOf(action.actionStringVerbatim) });
          }
        }
      }
      if (
        occurrences.length !== 1 ||
        occurrences[0].list !== "finishers" ||
        occurrences[0].condition !== spender.condition
      ) {
        problems.push(
          `'${spender.token}' occurrences ${JSON.stringify(occurrences)}, expected once in finishers with condition ${JSON.stringify(spender.condition)}`,
        );
      }
    }
    const finishers = byName.get("finishers");
    const spenderTokens = (finishers?.actions ?? [])
      .map((action) => actionTokenOf(action.actionStringVerbatim))
      .filter((token) => REQUIRED_FACTS.finishersSpenders.some((spender) => spender.token === token));
    if (
      spenderTokens.join(",") !== REQUIRED_FACTS.finishersSpenders.map((spender) => spender.token).join(",")
    ) {
      problems.push(`finishers spender order is [${spenderTokens.join(", ")}]`);
    }
    // `variable.ds_castable` is assigned exactly once, in `finishers`, with the pinned value.
    const dsAssignments = [];
    for (const list of artifact.lists) {
      for (const action of list.actions) {
        if (/^variable,name=ds_castable(?:,|$)/.test(action.actionStringVerbatim)) {
          const value = /(?:^|,)value=(.*)$/.exec(action.actionStringVerbatim)?.[1] ?? null;
          dsAssignments.push({ list: list.listName, value });
        }
      }
    }
    if (
      dsAssignments.length !== 1 ||
      dsAssignments[0].list !== "finishers" ||
      dsAssignments[0].value !== REQUIRED_FACTS.dsCastableValue
    ) {
      problems.push(`variable ds_castable assignments ${JSON.stringify(dsAssignments)}`);
    }
    // Reset-only variables: assigned in precombat with op=reset and nowhere else.
    for (const name of REQUIRED_FACTS.resetOnlyVariables) {
      const assignments = [];
      for (const list of artifact.lists) {
        for (const action of list.actions) {
          if (new RegExp(`^variable,name=${name}(?:,|$)`).test(action.actionStringVerbatim)) {
            assignments.push({ list: list.listName, action: action.actionStringVerbatim });
          }
        }
      }
      const only = assignments[0];
      if (
        assignments.length !== 1 ||
        only.list !== "precombat" ||
        !/,op=reset,default=0$/.test(only.action)
      ) {
        problems.push(
          `variable '${name}' assignments ${JSON.stringify(assignments)}, expected one precombat reset`,
        );
      }
    }
    return problems;
  }

  const defaultList = byName.get("default");
  if (defaultList === undefined) {
    problems.push("no default list");
  } else {
    const calls = defaultList.actions
      .map((action) => callsListOf(action.actionStringVerbatim))
      .filter((name) => name !== null);
    const expected = REQUIRED_FACTS.defaultOrder;
    const filtered = calls.filter((name) => expected.includes(name));
    if (filtered.join(",") !== expected.join(",")) {
      problems.push(`default list call order is [${filtered.join(", ")}], expected [${expected.join(", ")}]`);
    }

    const spendCall = defaultList.actions.find(
      (action) => callsListOf(action.actionStringVerbatim) === "spend",
    );
    const generateCall = defaultList.actions.find(
      (action) => callsListOf(action.actionStringVerbatim) === "generate",
    );
    if (spendCall === undefined) problems.push("default does not call spend");
    else {
      const condition = conditionOf(spendCall.actionStringVerbatim);
      if (condition !== REQUIRED_FACTS.spendCallCondition) {
        problems.push(
          `spend call condition is:\n    ${condition}\n  expected:\n    ${REQUIRED_FACTS.spendCallCondition}`,
        );
      }
    }
    if (generateCall === undefined) problems.push("default does not call generate");
    else {
      const condition = conditionOf(generateCall.actionStringVerbatim);
      if (condition !== REQUIRED_FACTS.generateCallCondition) {
        problems.push(
          `generate call condition is:\n    ${condition}\n  expected:\n    ${REQUIRED_FACTS.generateCallCondition}`,
        );
      }
    }
  }

  const envenomLists = new Set();
  const crimsonTempestLists = new Set();
  for (const list of artifact.lists) {
    for (const action of list.actions) {
      const token = actionTokenOf(action.actionStringVerbatim);
      if (token === "envenom") envenomLists.add(list.listName);
      if (token === "crimson_tempest") crimsonTempestLists.add(list.listName);
    }
  }
  if (envenomLists.size !== 1 || !envenomLists.has(REQUIRED_FACTS.envenomOnlyInList)) {
    problems.push(`envenom appears in lists [${[...envenomLists].join(", ")}]`);
  }
  if (!crimsonTempestLists.has(REQUIRED_FACTS.crimsonTempestInList)) {
    problems.push(`crimson_tempest not found in '${REQUIRED_FACTS.crimsonTempestInList}'`);
  }

  return problems;
}

const sourceBuffer = await loadSource(args);
const sourceSha256 = createHash("sha256").update(sourceBuffer).digest("hex");

if (typeof args["expect-sha256"] === "string" && args["expect-sha256"] !== sourceSha256) {
  fail(`source SHA-256 mismatch\n  expected ${args["expect-sha256"]}\n  actual   ${sourceSha256}`);
}

const sourceText = sourceBuffer.toString("utf8");
const extracted = extract(sourceText);

const artifact = {
  artifactVersion: ARTIFACT_VERSION,
  authorityId: TARGET.authorityId,
  artifactRevision: `simc-${String(args.sha ?? "local").slice(0, 8)}-${EXTRACTOR_VERSION}`,
  spec: TARGET.spec,
  entryListName: "default",
  provenance: {
    repository: REPOSITORY,
    branch: typeof args.branch === "string" ? args.branch : "midnight",
    commitSha: typeof args.sha === "string" ? args.sha : "UNKNOWN",
    commitDate: typeof args["commit-date"] === "string" ? args["commit-date"] : "UNKNOWN",
    sourcePath: SOURCE_PATH,
    sourceSha256,
    sourceByteLength: sourceBuffer.length,
    regionStartMarker: REGION_START,
    regionEndMarker: REGION_END,
    extractedOn:
      typeof args["extracted-on"] === "string" ? args["extracted-on"] : new Date().toISOString().slice(0, 10),
    extractorVersion: EXTRACTOR_VERSION,
    ...(TARGET.clientVersion === undefined
      ? {}
      : {
          // M11-B2: what the extractor DECIDED about the region's version
          // guards, so a reader of the artifact can see that a dead branch was
          // excluded rather than absent from the source.
          conditionalCompilation: {
            clientVersion: TARGET.clientVersion.join("."),
            guards: extracted.guards,
          },
        }),
  },
  lists: extracted.lists,
};

const problems = verifyRequiredFacts(artifact);
if (problems.length > 0) {
  console.error("EXTRACTION FAILED: the pinned source does not exhibit the required authority facts.\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nDo not rewrite expectations to match. Report the discrepancy.");
  process.exit(1);
}

const outPath = typeof args.out === "string" ? args.out : TARGET.defaultOut;
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

console.log(`Wrote ${outPath}`);
console.log(`  commit      ${artifact.provenance.commitSha}`);
console.log(`  sourceSha256 ${sourceSha256}`);
console.log(`  lists       ${artifact.lists.length}`);
console.log(`  actions     ${artifact.lists.reduce((n, l) => n + l.actions.length, 0)}`);
console.log("  required authority facts: VERIFIED");

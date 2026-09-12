#!/usr/bin/env node
/**
 * Deterministic SimulationCraft APL extractor.
 *
 * Reads ONE pinned commit of `engine/class_modules/apl/apl_rogue.cpp` and emits
 * the Assassination authority artifact. Run manually; never at runtime. The
 * analyzer has no network dependency on GitHub or the SimulationCraft site — it
 * imports the committed JSON this produces.
 *
 * FAIL CLOSED IS THE WHOLE POINT. This is not a general C++ parser, and it does
 * not try to be. It understands exactly four constructs inside the bounded
 * Assassination region. Anything else inside that region is a hard failure with
 * a line number, because an extractor that silently skipped a line it did not
 * understand would emit an artifact that LOOKS complete while missing an action
 * — and the reachability proof built on it would be worthless.
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
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const REPOSITORY = "https://github.com/simulationcraft/simc";
const SOURCE_PATH = "engine/class_modules/apl/apl_rogue.cpp";
const REGION_START = "//assassination_apl_start";
const REGION_END = "//assassination_apl_end";
const EXTRACTOR_VERSION = 1;
const ARTIFACT_VERSION = 1;

/**
 * Facts this extractor REQUIRES the pinned source to exhibit.
 *
 * Checked against the extracted artifact, not against a prompt. If the pinned
 * commit stops satisfying one of these, extraction fails loudly rather than
 * producing an artifact whose downstream verdicts would rest on a stale belief.
 */
const REQUIRED_FACTS = {
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
  spendCallCondition: "!buff.darkest_night.up&combo_points>=5|buff.darkest_night.up&combo_points.deficit=0",
  generateCallCondition: "!buff.darkest_night.up&combo_points<5|buff.darkest_night.up&combo_points.deficit>0",
  envenomOnlyInList: "spend",
  crimsonTempestInList: "generate",
  defaultOrder: ["cds", "core_dot", "generate", "spend"],
};

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

  for (let i = startIndex + 1; i < endIndex; i += 1) {
    const rawLine = lines[i];
    const lineNumber = i + 1;
    const line = rawLine.trim();

    if (line.length === 0) continue;
    if (line.startsWith("//")) continue;

    if (!sawFunctionHeader) {
      if (line === "void assassination( player_t* p )") {
        sawFunctionHeader = true;
        continue;
      }
      fail(`line ${lineNumber}: unexpected construct before the assassination function header: ${line}`);
    }

    if (line === "{") {
      braceDepth += 1;
      continue;
    }
    if (line === "}") {
      braceDepth -= 1;
      if (braceDepth < 0) fail(`line ${lineNumber}: unbalanced closing brace`);
      continue;
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
      const bucket = actionsByList.get(listName);
      bucket.push({
        priorityOrdinal: bucket.length,
        actionStringVerbatim: parsed.actionStringVerbatim,
        comment: parsed.comment,
        sourceLine: lineNumber,
      });
      continue;
    }

    // Reached only by a construct this extractor does not model. Failing here is
    // the contract: a silently skipped line produces a complete-looking artifact
    // with a missing action, and every reachability proof built on it is void.
    fail(`line ${lineNumber}: unsupported construct inside the assassination region: ${line}`);
  }

  if (!sawFunctionHeader) fail("assassination function header not found inside the region");
  if (braceDepth !== 0) fail("unbalanced braces inside the assassination region");

  return {
    lists: listOrder.map((listName) => ({
      listName,
      receiverIdentifier: [...listNameByReceiver.entries()].find(([, name]) => name === listName)[0],
      actions: actionsByList.get(listName),
    })),
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

const args = parseArgs(process.argv.slice(2));
const sourceBuffer = await loadSource(args);
const sourceSha256 = createHash("sha256").update(sourceBuffer).digest("hex");

if (typeof args["expect-sha256"] === "string" && args["expect-sha256"] !== sourceSha256) {
  fail(`source SHA-256 mismatch\n  expected ${args["expect-sha256"]}\n  actual   ${sourceSha256}`);
}

const sourceText = sourceBuffer.toString("utf8");
const extracted = extract(sourceText);

const artifact = {
  artifactVersion: ARTIFACT_VERSION,
  authorityId: "SIMC_APL_ROGUE_ASSASSINATION",
  artifactRevision: `simc-${String(args.sha ?? "local").slice(0, 8)}-${EXTRACTOR_VERSION}`,
  spec: { className: "rogue", specName: "assassination" },
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
    extractedOn: new Date().toISOString().slice(0, 10),
    extractorVersion: EXTRACTOR_VERSION,
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

const outPath = typeof args.out === "string" ? args.out : "src/simc/data/rogue-assassination.apl.json";
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

console.log(`Wrote ${outPath}`);
console.log(`  commit      ${artifact.provenance.commitSha}`);
console.log(`  sourceSha256 ${sourceSha256}`);
console.log(`  lists       ${artifact.lists.length}`);
console.log(`  actions     ${artifact.lists.reduce((n, l) => n + l.actions.length, 0)}`);
console.log("  required authority facts: VERIFIED");

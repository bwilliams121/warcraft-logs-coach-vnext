/**
 * The autopilot's Claude launcher: runs a program with its stdin from a file
 * and writes its stdout and stderr to files LINE BY LINE, REDACTED BEFORE
 * ANYTHING TOUCHES DISK.
 *
 *     node scripts/autopilot/run-claude.mjs <stdinFile> <stdoutFile> <stderrFile> -- <program> [args...]
 *
 * Why a wrapper:
 * - The supervisor must be able to audit a run even if the supervisor itself
 *   dies mid-run, so the transcript has to be on disk as it is produced.
 * - No raw secret may ever be written, so redaction happens per line, before
 *   the line is written. Each line is written synchronously, so a crash loses
 *   at most the line being produced.
 * - The wrapper's own command line names the transcript file, which is how a
 *   restarted supervisor finds and stops a run that outlived it.
 *
 * Exit code: the program's, or 1 if it could not be started or was killed.
 * Plain Node, no dependencies.
 */

import { spawn } from "node:child_process";
import { closeSync, createReadStream, openSync, writeSync } from "node:fs";
import { createInterface } from "node:readline";

/** Redaction rules, kept equal to Redact in run-project.ps1 (its self-test checks both). */
// A secret VALUE after a key is either quoted or bare. A quoted value is
// redacted WHOLE: from its opening quote to the matching closing quote at the
// same escape level (the same run of backslashes, not itself escaped), so
// spaces, backslashes and escaped quotes inside it go too, and the quotes and
// escapes around it are kept, so a JSON transcript line stays valid. A bare
// value runs to whitespace, a quote, a comma or a backslash. A secret key is
// any identifier ENDING in secret, token, password, passwd, api key or
// client_id (ANALYSIS_AUTH_TOKEN, WCL_CLIENT_SECRET, access_token, ...); a
// usage counter such as output_tokens does not end there and is left alone.
const QUOTED = String.raw`(?<q>\\*)(?<qc>["'])(?<v>.*?)(?<!\\)\k<q>\k<qc>`;
const SECRET_KEY = new RegExp(
  String.raw`([A-Za-z0-9_]*(?:secret|token|password|passwd|api[_-]?key|client_id))(\\*["']?\s*[:=]\s*)(?:${QUOTED}|(?<bare>[^\s"',\\]+))`,
  "gi",
);
const AUTHORIZATION = new RegExp(
  String.raw`(authorization)(\\*["']?\s*[:=]\s*)(?:${QUOTED}|(?<p>bearer\s+|basic\s+|token\s+)?(?<bare>[^\s"',\\]+))`,
  "gi",
);

function replaceValue(match, key, separator, ...rest) {
  const groups = rest[rest.length - 1];
  if (groups.qc !== undefined)
    return `${key}${separator}${groups.q}${groups.qc}[REDACTED]${groups.q}${groups.qc}`;
  return `${key}${separator}${groups.p ?? ""}[REDACTED]`;
}

/** Redaction rules, kept equal to Redact in run-project.ps1 (its self-test checks both). */
export function redact(line) {
  return line
    .replace(/(gho|ghp|ghs|ghu|github_pat)_[A-Za-z0-9_]{10,}/g, "$1_[REDACTED]")
    .replace(/sk-(ant-|proj-)?[A-Za-z0-9_-]{10,}/gi, "[REDACTED_KEY]")
    .replace(AUTHORIZATION, replaceValue)
    .replace(/\b(bearer|basic)\s+(?!\[REDACTED\])[A-Za-z0-9._~+/-]{8,}=*/gi, "$1 [REDACTED]")
    .replace(SECRET_KEY, replaceValue);
}

function main(argv) {
  const separator = argv.indexOf("--");
  if (separator !== 3 || argv.length < 5) {
    process.stderr.write(
      "usage: run-claude.mjs <stdinFile> <stdoutFile> <stderrFile> -- <program> [args...]\n",
    );
    process.exit(2);
  }
  const [stdinFile, stdoutFile, stderrFile] = argv;
  const [program, ...args] = argv.slice(separator + 1);
  // A .cmd or .bat target would run through cmd.exe, which re-splits the
  // arguments: "Bash(gh pr merge:*)" would silently stop being one tool rule.
  // Fail closed; pass the real executable instead.
  if (/\.(cmd|bat)$/i.test(program)) {
    process.stderr.write(
      "run-claude: refusing a .cmd/.bat program; pass the executable (claude.exe) itself\n",
    );
    process.exit(2);
  }
  const outFd = openSync(stdoutFile, "a");
  const errFd = openSync(stderrFile, "a");
  const child = spawn(program, args, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let open = 2;
  let exitCode = null;
  const finish = () => {
    if (open > 0 || exitCode === null) return;
    closeSync(outFd);
    closeSync(errFd);
    process.exit(exitCode);
  };
  const drain = (stream, fd) => {
    createInterface({ input: stream, crlfDelay: Infinity })
      .on("line", (line) => writeSync(fd, `${redact(line)}\n`))
      .on("close", () => {
        open -= 1;
        finish();
      });
  };
  drain(child.stdout, outFd);
  drain(child.stderr, errFd);
  child.on("error", (error) => {
    writeSync(errFd, `${redact(`run-claude: could not start ${program}: ${error.message}`)}\n`);
    exitCode = 1;
    open = 0;
    finish();
  });
  child.on("exit", (code) => {
    exitCode = code ?? 1;
    finish();
  });
  createReadStream(stdinFile).pipe(child.stdin);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/").split("/").pop())) {
  main(process.argv.slice(2));
}

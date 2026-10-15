/**
 * ENGINE LAUNCHERS (M11-G3-1): run the pinned SimulationCraft binary on one
 * prepared input, with no shell, a fixed executable, a fixed argument vector,
 * a private per-job directory, a timeout and bounded output.
 *
 * - DirectLauncher runs a binary on this host. It is what the production
 *   container runs (the image's /opt/simc/simc), and what tests run against
 *   a fake engine.
 * - DockerLauncher runs the digest-pinned runner image from a development
 *   host (Windows/Docker Desktop): `docker run --rm --network none`, memory,
 *   CPU and PID caps, a read-only root filesystem and the job directory as
 *   the only writable mount. Image TAGS are refused; only content-addressed
 *   references (`sha256:<image id>` or `name@sha256:<digest>`) run.
 *
 * Both use the same argument vector: `<dir>/job.simc json2=<dir>/out.json`.
 * The input file is the builder's text; nothing from the caller is ever an
 * argument. The output path is runner-owned.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RunnerLimits } from "./limits.js";

export interface LaunchRequest {
  readonly input: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export type LaunchOutcome =
  | {
      readonly kind: "COMPLETED";
      readonly executedBinarySha256: string;
      readonly json: string;
      readonly jsonBytes: number;
      readonly wallMs: number;
    }
  | { readonly kind: "TIMEOUT"; readonly wallMs: number }
  | { readonly kind: "CANCELLED" }
  | { readonly kind: "UNAVAILABLE"; readonly detail: string }
  | { readonly kind: "ENGINE_FAILED"; readonly detail: string }
  | { readonly kind: "OUTPUT_TOO_LARGE"; readonly bytes: number };

export interface EngineLauncher {
  launch(request: LaunchRequest): Promise<LaunchOutcome>;
}

const sha256File = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");

interface ProcessSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Record<string, string>;
  /** Extra cleanup on timeout/cancel (e.g. `docker kill`). */
  readonly onKill?: () => void;
}

interface ProcessExit {
  readonly kind: "EXITED" | "TIMEOUT" | "CANCELLED" | "SPAWN_FAILED";
  readonly code: number | null;
  readonly stderrTail: string;
  readonly spawnErrorCode?: string;
  readonly wallMs: number;
}

/** Runs one process to completion, kill-on-timeout, with bounded stdio capture. */
function runProcess(
  spec: ProcessSpec,
  cwd: string,
  timeoutMs: number,
  limits: RunnerLimits,
  signal?: AbortSignal,
): Promise<ProcessExit> {
  return new Promise((resolve) => {
    const started = Date.now();
    let stderr = "";
    let stderrBytes = 0;
    let settled = false;
    let reason: ProcessExit["kind"] = "EXITED";
    const decoder = new TextDecoder();
    const child = spawn(spec.command, spec.args, {
      cwd,
      env: spec.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stop = (why: ProcessExit["kind"]): void => {
      if (reason !== "EXITED") return;
      reason = why;
      child.kill("SIGKILL");
      spec.onKill?.();
    };
    const timer = setTimeout(() => stop("TIMEOUT"), timeoutMs);
    const onAbort = (): void => stop("CANCELLED");
    signal?.addEventListener("abort", onAbort);
    child.stdout.on("data", () => undefined);
    child.stderr.on("data", (chunk) => {
      if (stderrBytes >= limits.maxStdioBytes) return;
      stderrBytes += chunk.byteLength;
      stderr += decoder.decode(chunk, { stream: true });
    });
    const finish = (exit: Omit<ProcessExit, "wallMs" | "stderrTail">): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({ ...exit, stderrTail: stderr.slice(-2_000), wallMs: Date.now() - started });
    };
    child.on("error", (error) =>
      finish({ kind: "SPAWN_FAILED", code: null, spawnErrorCode: error.code ?? "UNKNOWN" }),
    );
    child.on("close", (code) => finish({ kind: reason, code }));
    if (signal?.aborted === true) onAbort();
  });
}

/** Removes host paths from engine text before it can appear in a failure detail. */
function sanitize(text: string, dir: string): string {
  return text.split(dir).join("<job>").split(dir.replace(/\\/g, "/")).join("<job>").trim().slice(-500);
}

abstract class TempDirLauncher implements EngineLauncher {
  constructor(protected readonly limits: RunnerLimits) {}

  /** Paths as the ENGINE sees them, and the process to run. */
  protected abstract spec(hostDir: string): ProcessSpec;
  protected abstract executedBinarySha256(): string;

  async launch(request: LaunchRequest): Promise<LaunchOutcome> {
    if (request.signal?.aborted === true) return { kind: "CANCELLED" };
    let binarySha: string;
    try {
      binarySha = this.executedBinarySha256();
    } catch (error) {
      return { kind: "UNAVAILABLE", detail: `engine binary: ${(error as Error).message}`.slice(0, 300) };
    }
    const dir = mkdtempSync(join(tmpdir(), "wlc-simc-"));
    try {
      writeFileSync(join(dir, "job.simc"), request.input, "utf8");
      const timeoutMs = Math.min(request.timeoutMs, this.limits.maxWallClockMs);
      const exit = await runProcess(this.spec(dir), dir, timeoutMs, this.limits, request.signal);
      if (exit.kind === "SPAWN_FAILED")
        return { kind: "UNAVAILABLE", detail: `spawn: ${exit.spawnErrorCode ?? ""}` };
      if (exit.kind === "TIMEOUT") return { kind: "TIMEOUT", wallMs: exit.wallMs };
      if (exit.kind === "CANCELLED") return { kind: "CANCELLED" };
      if (exit.code !== 0) {
        return {
          kind: "ENGINE_FAILED",
          detail: `exit ${String(exit.code)}: ${sanitize(exit.stderrTail, dir)}`,
        };
      }
      const out = join(dir, "out.json");
      if (!existsSync(out)) return { kind: "ENGINE_FAILED", detail: "exit 0 without a JSON report" };
      const bytes = statSync(out).size;
      if (bytes > this.limits.maxOutputBytes) return { kind: "OUTPUT_TOO_LARGE", bytes };
      const json = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(readFileSync(out));
      return {
        kind: "COMPLETED",
        executedBinarySha256: binarySha,
        json,
        jsonBytes: bytes,
        wallMs: exit.wallMs,
      };
    } catch (error) {
      return { kind: "ENGINE_FAILED", detail: sanitize(`runner: ${(error as Error).message}`, dir) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

export interface DirectLauncherOptions {
  /** The executable to start. In production, the engine itself. */
  readonly executable: string;
  /** Fixed arguments before the job arguments (tests: a fake-engine script). */
  readonly leadingArgs?: readonly string[];
  /** The file whose SHA-256 identifies the engine. Defaults to `executable`. */
  readonly binaryToHash?: string;
}

export class DirectLauncher extends TempDirLauncher {
  constructor(
    private readonly options: DirectLauncherOptions,
    limits: RunnerLimits,
  ) {
    super(limits);
  }

  protected spec(hostDir: string): ProcessSpec {
    return {
      command: this.options.executable,
      args: [
        ...(this.options.leadingArgs ?? []),
        join(hostDir, "job.simc"),
        `json2=${join(hostDir, "out.json")}`,
      ],
      env: {},
    };
  }

  protected executedBinarySha256(): string {
    return sha256File(this.options.binaryToHash ?? this.options.executable);
  }
}

/** Environment the Docker CLI needs on a development host; nothing else is passed. */
const DOCKER_CLI_ENV = [
  "PATH",
  "SystemRoot",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "ProgramData",
  "TEMP",
  "TMP",
  "HOME",
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_CONFIG",
];

export interface DockerLauncherOptions {
  /** `sha256:<image id>` or `name@sha256:<digest>` — a tag is refused. */
  readonly imageRef: string;
  readonly dockerExecutable: string;
  /** CPUs given to the container; at least the job's thread count. */
  readonly cpus: number;
  /** Values for DOCKER_CLI_ENV, read by the caller from its own environment. */
  readonly cliEnv: Record<string, string | undefined>;
}

/** Content-addressed only: a local image id (`sha256:<id>`) or a registry digest (`name@sha256:<digest>`). */
const IMAGE_DIGEST_REF = /^(?:[a-z0-9][a-z0-9._/-]*@)?sha256:[0-9a-f]{64}$/;

export class DockerLauncher extends TempDirLauncher {
  private cachedSha: string | null = null;

  constructor(
    private readonly options: DockerLauncherOptions,
    limits: RunnerLimits,
  ) {
    super(limits);
    if (!IMAGE_DIGEST_REF.test(options.imageRef)) {
      throw new Error(
        "DockerLauncher: the image must be content-addressed by digest (sha256:<id> or name@sha256:<digest>)",
      );
    }
  }

  private env(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const key of DOCKER_CLI_ENV) {
      const value = this.options.cliEnv[key];
      if (value !== undefined) env[key] = value;
    }
    return env;
  }

  protected spec(hostDir: string): ProcessSpec {
    const name = `wlc-simc-${crypto.randomUUID()}`;
    const docker = this.options.dockerExecutable;
    const env = this.env();
    return {
      command: docker,
      args: [
        "run",
        "--rm",
        "--name",
        name,
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "256",
        "--memory",
        String(this.limits.memoryBytes),
        "--memory-swap",
        String(this.limits.memoryBytes),
        "--cpus",
        String(this.options.cpus),
        "--mount",
        `type=bind,source=${hostDir},target=/work`,
        this.options.imageRef,
        "/work/job.simc",
        "json2=/work/out.json",
      ],
      env,
      onKill: () => {
        spawn(docker, ["kill", name], {
          cwd: hostDir,
          env,
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
      },
    };
  }

  /**
   * The image is immutable by digest, so the engine inside it is hashed once
   * per launcher by running `sha256sum` against the same image digest.
   */
  protected executedBinarySha256(): string {
    if (this.cachedSha !== null) return this.cachedSha;
    throw new Error("call DockerLauncher.resolveBinarySha256() before launching");
  }

  async resolveBinarySha256(): Promise<string> {
    const dir = mkdtempSync(join(tmpdir(), "wlc-simc-hash-"));
    try {
      let output = "";
      const decoder = new TextDecoder();
      const code = await new Promise<number | null>((resolve) => {
        const child = spawn(
          this.options.dockerExecutable,
          [
            "run",
            "--rm",
            "--network",
            "none",
            "--entrypoint",
            "sha256sum",
            this.options.imageRef,
            "/opt/simc/simc",
          ],
          { cwd: dir, env: this.env(), shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
        );
        child.stdout.on("data", (chunk) => {
          output += decoder.decode(chunk, { stream: true });
        });
        child.stderr.on("data", () => undefined);
        child.on("error", () => resolve(null));
        child.on("close", (exitCode) => resolve(exitCode));
      });
      const match = /^([0-9a-f]{64})\s/.exec(output);
      if (code !== 0 || match?.[1] === undefined)
        throw new Error("could not hash /opt/simc/simc in the image");
      this.cachedSha = match[1];
      return match[1];
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

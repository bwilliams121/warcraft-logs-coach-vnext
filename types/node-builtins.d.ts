/**
 * Minimal ambient declarations for the Node builtins used by manual tooling.
 *
 * The Worker bundle has no Node builtins and no runtime dependencies, and this
 * project adds none — so `@types/node` is not installed. Rather than drop the
 * probe harness out of `npm run typecheck`, this declares exactly the surface
 * the tooling touches and nothing more.
 *
 * If this file starts growing, that is a signal the tooling is doing more than
 * capturing and slicing a probe, and should be looked at rather than extended.
 */

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string, encoding: "utf8"): void;
  export function mkdirSync(path: string, options: { recursive: boolean }): string | undefined;
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string, options: { recursive: boolean; withFileTypes: false }): string[];
  export function statSync(path: string): { isFile(): boolean; size: number };
  // M11-D2-C: the APL extractor's batch tests stage a scratch source root and
  // output directory, and remove them.
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
  // M11-G3-1: the simulation runner hashes the engine binary it executes.
  export function readFileSync(path: string): Uint8Array;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
}

declare module "node:os" {
  export function tmpdir(): string;
  // M11-G3-1: the simulation benchmark records the host CPU.
  export function cpus(): { model: string }[];
  export function availableParallelism(): number;
}

declare module "node:crypto" {
  export function createHash(algorithm: "sha256"): {
    update(data: string | Uint8Array): { digest(encoding: "hex"): string };
  };
}

declare module "node:child_process" {
  export function spawnSync(
    command: string,
    args: readonly string[],
    options: { encoding: "utf8" },
  ): { status: number | null; stdout: string; stderr: string };

  // M11-G3-1: the simulation runner launches the pinned engine as a child
  // process — a fixed executable and argument vector, never a shell.
  export interface ChildProcessHandle {
    readonly stdout: { on(event: "data", listener: (chunk: Uint8Array) => void): void };
    readonly stderr: { on(event: "data", listener: (chunk: Uint8Array) => void): void };
    on(event: "close", listener: (code: number | null, signal: string | null) => void): void;
    on(event: "error", listener: (error: Error & { code?: string }) => void): void;
    kill(signal: "SIGKILL"): boolean;
  }
  export function spawn(
    command: string,
    args: readonly string[],
    options: {
      cwd: string;
      env: Record<string, string>;
      shell: false;
      windowsHide: true;
      stdio: ["ignore", "pipe", "pipe"];
    },
  ): ChildProcessHandle;
}

/**
 * Minimal ambient declaration for `import.meta.glob`.
 *
 * Vite supplies this at build time and Vitest inherits it, but the full
 * `vite/client` type package also declares DOM-flavoured ambient globals and
 * asset-module shapes. Pulling that in through `tsconfig.json`'s `types` array
 * would make browser APIs look available to Worker source that must not use
 * them — the same reason `@types/node` is not installed. See
 * `./node-builtins.d.ts`, which exists for exactly this reason.
 *
 * So this declares exactly the two forms the test suite uses and nothing else:
 *
 *   - eager, raw, default — source TEXT, for the layering sweeps
 *     (`tests/contracts/m6a-mcp-layering.test.ts` and its siblings)
 *   - eager MODULES — the evaluated exports of each matched file, used by ONE
 *     guard, `tests/contracts/m11a-registration-list-complete.test.ts`, to
 *     compare every `src/specs/<class>/<spec>/registration.ts` module's real
 *     registration object against the production catalog by identity rather
 *     than by filename. Reading source text cannot prove that comparison.
 *
 * A third overload appearing here is a signal the suite has started relying
 * on Vite's module graph for more than those two things, which should be
 * looked at rather than accommodated. Neither form is available to `src/`:
 * this file is test typing, and the Worker never calls `import.meta.glob`.
 */

interface ImportMeta {
  glob(pattern: string, options: { eager: true; query: "?raw"; import: "default" }): Record<string, string>;
  glob(pattern: string, options: { eager: true }): Record<string, Record<string, unknown>>;
}

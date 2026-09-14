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
 * So this declares the one form the test suite uses — eager, raw, default —
 * and nothing else. A second overload appearing here is a signal the suite has
 * started relying on Vite's module graph for more than reading source text,
 * which should be looked at rather than accommodated.
 *
 * Used by `tests/contracts/m6a-mcp-layering.test.ts` to enumerate source files
 * without a filesystem walk.
 */

interface ImportMeta {
  glob(pattern: string, options: { eager: true; query: "?raw"; import: "default" }): Record<string, string>;
}

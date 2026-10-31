# Review request

Rolling file: overwritten for each review cycle.

## Tranche

TEST-HYGIENE: the default offline test suite reads no `.dev.vars`. Branch
`test-hygiene-dev-vars`, from main at 788248b (PREP-4 merged).

Owner choice: "Test suite hygiene". This resolves the TEST-HYGIENE follow-up
in `agent/follow-ups.md` (raised at M7-F). The follow-up is explicit about
scope: it is not an invitation to redesign the test runner, the two-project
split or the Miniflare bindings, and none of them is changed.

## The defect

- **The cause.** Wrangler's `getVarsForDev` loads `.dev.vars` (or, failing
  that, `.env`) from the directory of the config file it is given.
  `@cloudflare/vitest-pool-workers` calls `unstable_getMiniflareWorkerOptions`
  with only a config path, and no env-file option exists on that path.
- **The effect.** Pointing the pool at the production `wrangler.jsonc` made
  every `npm test` read the developer's `.dev.vars`, which holds real Warcraft
  Logs credentials, and print `Using secrets defined in .dev.vars` once per
  worker.
- **Why it was contained.**
  - The sentinel `miniflare.bindings` override the loaded values.
  - The outbound guard answers every request locally.
  - Defence in depth should not depend on those two lines alone.

## What changed

- **`tests/workers/wrangler.jsonc` (new).** A test-only copy of the production
  config, in a directory holding no secrets file. Only the two
  repository-relative paths (`$schema`, `main`) are rebased.
- **`vitest.config.ts`.** The workers project's `configPath` now points at the
  copy, with a comment saying why. Nothing else in the file changed: the
  sentinel bindings, `outboundService` and `remoteBindings: false` are as
  before.
- **`tests/contracts/test-hygiene-dev-vars.test.ts` (new, node project).**
  It asserts four things:
  1. `vitest.config.ts` has exactly one `configPath`, and it is the copy.
  2. `unstable_readConfig` of both files is deep-equal once `configPath` and
     `userConfigPath` are removed. So `main` resolves to the same
     `src/api/worker.ts`, and the name, compatibility date, vars, limits,
     ratelimits and observability all match.
  3. `tests/workers/` holds no file matching `^\.(dev\.vars|env)(\..*)?$`.
  4. `unstable_getMiniflareWorkerOptions(copy)` carries binding keys
     `["ENVIRONMENT"]` and nothing else. This holds whatever the repository
     root holds.
- **Docs.**
  - `agent/follow-ups.md`: TEST-HYGIENE is marked resolved, with the shape
    chosen; the original record is kept.
  - `agent/testing.md`: new section.
  - `agent/architecture.md`: short TEST-HYGIENE section.
  - `README.md`: the Verify section says the suite reads no `.dev.vars` and
    that the two configs must be changed together.

## Validation

- **Mutation proofs.** Each mutation was applied, run against the contract
  test and restored by hand; `git status` and `git diff` confirm the
  restoration.
  - A fake `.dev.vars` (`WCL_CLIENT_ID=fake-mutation-sentinel`) beside the
    copy: assertions 3 and 4 fail.
  - The pool pointed back at `./wrangler.jsonc`: assertion 1 fails.
  - `cpu_ms` changed in the copy: assertion 2 fails.
- **The output claim, A/B on the same four workers files.**
  - With the new pointer: `Using secrets defined in .dev.vars` printed 0 times.
  - With main's `vitest.config.ts` (stashed): it printed 4 times.
- **Binding check, run directly.** The Miniflare options from the copy give
  `ENVIRONMENT` only. From the production config on this machine they give
  `ENVIRONMENT,WCL_CLIENT_ID,WCL_CLIENT_SECRET,ANALYSIS_AUTH_TOKEN`.
- **Static checks.** `npm run typecheck` is clean.
- **Contract test.** 4/4 pass.
- **Workers project.** It boots from the copy and runs: 71/75 files and
  1188/1195 tests passed.
  - All 7 failures are 5 s default-timeout overruns under heavy local load.
  - The same four files were rerun with main's config under the same load,
    and the same `m8g-encounter-context-composition` test timed out
    (5.6 s against 5 s), so the overruns are not caused by this change.
  - Timeouts were not changed.
- **Full suite.** See the next section.

## Full suite

`npm test` on a heavily loaded machine reported 349 files and 10,074 tests, of
which 16 tests failed. `Using secrets defined in .dev.vars` printed 0 times.

- **Timeouts (14).** 12 overran the 5 s default and 1 its own 20 s timeout.
- **Shared-tmpdir races (2).** These are the known `wlc-simc-*` counting
  races between parallel runner tests: `runner-and-parser` U and
  `runner-service-queue` W.
- **Reruns, serially.**
  - The 10 failing node files plus the new contract test: 11/11 files and
    161/161 tests passed.
  - The 3 failing workers files: 38/39 passed. The one failure is the same
    m8g test, at 5.68 s against its 5 s timeout. It also fails with main's
    config under the same load (shown above).
- **The node project is untouched by this change**, apart from the new test.
- **CI is the authority** for the unloaded run.

## External / network activity

None. No Warcraft Logs request was made, and no credential was read by any
test or printed anywhere. The binding check above lists key names only.

## Known limitations

- The copy must be kept equal to the production config by hand. The contract
  test fails on any drift and names the field.
- Assertion 4 shows that no secrets file is read from the copy's directory.
  It relies on wrangler's current loading rule, which the A/B above
  demonstrates on the installed version.

## Staged / committed

Committed after the local review returned APPROVED. The committed files are:

- `vitest.config.ts`
- `tests/workers/wrangler.jsonc`
- `tests/contracts/test-hygiene-dev-vars.test.ts`
- `agent/follow-ups.md`, `agent/testing.md`, `agent/architecture.md`,
  `agent/review-request.md`
- `README.md`

`.claude/` and the three local `scripts/probe/*.probe.ts` files stay excluded.

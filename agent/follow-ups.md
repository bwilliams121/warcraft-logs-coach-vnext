# Named follow-ups

Work that is deliberately NOT being done inside the milestone that discovered it,
recorded so it is a decision rather than a thing everyone stopped noticing.

Each entry states what is true today, why it was not fixed in place, and what
"done" would look like. Nothing here is a bug in shipped behaviour; these are
hygiene and clarity items.

---

## TEST-HYGIENE: make the normal offline test suite independent of production `.dev.vars`

**Raised:** M7-F closeout (2026-09-15). **Do after:** M7 closeout.

### What happens today

`npm test` runs two Vitest projects. The `workers` project uses
`@cloudflare/vitest-pool-workers` pointed at `wrangler.jsonc`, and that pool reads
`.dev.vars` as part of building the Miniflare environment. The run prints:

```text
Using secrets defined in .dev.vars
```

once per worker. `.dev.vars` is gitignored and, on a developer machine, normally
holds real Warcraft Logs client credentials.

### Why this is not currently dangerous

- `vitest.config.ts` sets an `outboundService` that answers **every** outbound
  request from workerd locally, so no test can reach Warcraft Logs even if it
  tried — in CI, on a laptop, with or without credentials.
- The pool config declares explicit sentinel bindings
  (`fake-client-id-not-real`, `fake-client-secret-not-real`,
  `fake-analysis-token-not-real`), and tests that matter construct their own
  `Env` objects rather than relying on ambient ones.
- Regression tests sweep responses and headers for credential sentinels.

### Why it is still worth fixing

"Nothing can escape" is a property of one config line, and the failure mode it
guards against is not hypothetical: during M7-B a positional file filter caused a
credential-loading probe config to run and spend real API points. The normal test
command should not be reading a production credential file at all — defence in
depth should not depend on remembering that the outbound guard is there.

Recording it accurately rather than calling it ideal: it is **acceptable today,
and not the arrangement we want**.

### What done looks like

The default `npm test` run does not read `.dev.vars`, and says so in its output.
Possible shapes, none chosen yet:

- point the pool at a committed, credential-free vars file for tests;
- give the test config its own wrangler environment with no secret loading;
- or keep the pool's loading but prove, by test, that no loaded value reaches an
  `Env` any test uses.

Whatever the shape, the credential-loading probe config
(`vitest.probe.config.ts`) must stay separate and must stay the only thing that
can spend Warcraft Logs points.

### Explicitly out of scope

This is not an invitation to redesign the test runner, the two-project split, or
the Miniflare bindings while doing it.

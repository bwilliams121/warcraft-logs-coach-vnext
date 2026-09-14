# Post-merge deployment and smoke checklist — Milestone 6

Run manually, in order, after M6-E is merged. Nothing here is executed by CI or
by an agent: every step touches production or spends Warcraft Logs API points.

**Milestone 6 is not complete until step 13.** Every offline test can pass while
the one thing that has never been exercised still fails — see
[Why the full-fight step matters](#why-the-full-fight-step-matters).

---

## 1. Confirm CI is green

The M6-E GitHub Actions run for the merged commit must be green: formatting,
typecheck and the full suite.

Do not deploy on a red or pending run.

## 2. Confirm the analysis bearer secret exists

```powershell
npx wrangler secret list
```

`ANALYSIS_AUTH_TOKEN` must be present. If it is not:

```powershell
npx wrangler secret put ANALYSIS_AUTH_TOKEN
```

Generate a high-entropy value, for example
`python -c "import secrets; print(secrets.token_urlsafe(32))"`.

**One credential guards both analysis surfaces** — `/v1/analysis` and `/mcp`.
Without it both fail closed with 401, which is correct but means no analysis
smoke step below can pass. `/health` stays public either way.

Never paste the value into documentation, a commit, or an issue.

## 3. Confirm the rate-limit binding is recognized

```powershell
npx wrangler deploy --dry-run
```

The output must list:

```text
env.ANALYSIS_RATE_LIMITER (10 requests/60s)      Rate Limit
```

No dashboard resource is required. If the binding is missing, both analysis
paths will fail closed with `RATE_LIMITER_UNAVAILABLE` — safe, but unusable.

## 4. Deploy

```powershell
npx wrangler deploy
```

## 5. REST health smoke

```powershell
Invoke-WebRequest -Uri https://<worker-host>/health
```

Expect HTTP 200 and `{"status":"ok","version":"...","environment":"..."}`. It
must disclose nothing about configuration.

## 6. REST real Assassination analysis smoke

Spends Warcraft Logs API points.

```powershell
$auth = @{ Authorization = "Bearer <ANALYSIS_AUTH_TOKEN>" }
$body = @{ reportCode = "<REPORT_CODE>"; fightId = <FIGHT_ID>; sourceId = <SOURCE_ID> } | ConvertTo-Json
Invoke-WebRequest -Uri https://<worker-host>/v1/analysis -Method POST -Body $body -ContentType "application/json" -Headers $auth -SkipHttpErrorCheck
```

Also send it once **without** the header and confirm `401` with
`WWW-Authenticate: Bearer`. The expensive endpoint must not be anonymously
callable.

Use a **public or unlisted** report containing a known Assassination Rogue. The
repository records no real report identity, so supply your own; do not invent
one.

Expect HTTP 200 and a body whose `schemaVersion` is
`warcraft-logs-coach.analysis/1`.

## 7. MCP `tools/list` smoke

```powershell
$headers = @{ Authorization = "Bearer <ANALYSIS_AUTH_TOKEN>"; "Mcp-Method" = "tools/list" }
$body = '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"smoke","version":"1.0.0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'
Invoke-WebRequest -Uri https://<worker-host>/mcp -Method POST -Body $body -ContentType "application/json" -Headers $headers -SkipHttpErrorCheck
```

Expect exactly one tool: `analyze_warcraft_log`. No `ping`, no primitives.

## 8. MCP real Assassination `tools/call` smoke

Spends Warcraft Logs API points. Use the same report/fight/source as step 6.

Add `"Mcp-Name" = "analyze_warcraft_log"` to the headers and call
`tools/call` with:

```json
{ "source": "ids", "reportCode": "<REPORT_CODE>", "fightId": <FIGHT_ID>, "sourceId": <SOURCE_ID> }
```

Expect a successful tool result with `structuredContent` and a matching JSON
text block, and `isError` absent.

## 9. Compare the two transports

For the **same** report/fight/source, the REST body from step 6 and the MCP
`structuredContent` from step 8 must be deeply equal. Compare parsed structures,
not bytes — property order is not part of the contract.

They should also both equal `JSON.parse(content[0].text)` from the MCP result.

## 10. Inspect full-fight coverage for sanity

This is the step the offline suite cannot do. See below.

Check the `ANALYZED` result from step 6 or 8:

- `coverage.match + coverage.rejected + coverage.unknown == coverage.eligibleDecisions`
- `decisions.length == coverage.eligibleDecisions`
- `coverage.resolvedComparisons == coverage.match + coverage.rejected`
- `coverage.exactEntryMatches + coverage.tokenConvergedMatches == coverage.match`
- exclusion counts sum to `coverage.excludedCastCount`
- no excluded `position` appears among `decisions`
- `eligibleDecisions` is plausible for a whole pull — tens, not thousands, and
  not zero for an active Assassination Rogue
- no decision appears twice with the same `locator`
- `authority.commitSha` is `33622e9d1662ff0e451691edf85a6b49cc9d11d9`
- `capability.matchMeaning` is `AUTHORITY_COMPATIBLE_ONLY`,
  `capability.scoresPerformance` is `false`

**Do not expect `11 / 1 / 0 / 10`.** Those are M5-D2 *fixture* regression counts
for one sanitized window, not a target for any other fight.

## 11. Confirm no leakage

Across every response from steps 5–8, in bodies **and** headers:

- no `WCL_CLIENT_ID` or `WCL_CLIENT_SECRET` value
- no `ANALYSIS_AUTH_TOKEN` value
- no OAuth access token
- no raw GraphQL error text or stack trace
- no `rateLimit` / `pointsSpentThisHour` operational metadata

Then send one deliberately bad request (a nonexistent report code) and confirm
the error is a specific code with an author-written message, not upstream text.

Confirm the `401` challenge header is exactly `Bearer` — the scheme, never the
credential.

## 12. Operator note — what the rate limiter is and is not

`ANALYSIS_RATE_LIMITER` is **10 requests / 60 seconds**, shared by both
transports under one key.

It is **defence-in-depth, not a quota accounting system**:

- Cloudflare Worker Rate Limiting counters are **local to each Cloudflare
  location** and intentionally eventually consistent.
- So `10 / 60s` is a per-location brake. It is **not** an exact global cap on
  Warcraft Logs API spend, and must not be reported as one.
- It does **not** replace authentication. The `ANALYSIS_AUTH_TOKEN` bearer
  credential is what decides who may spend capacity at all; the limiter only
  decides how fast an already-authorized caller may spend it.

After deployment, watch for unexpected analysis volume rather than assuming the
limiter bounds it globally. Building a monitoring subsystem is future
operational-maturity work, deliberately not part of this milestone.

## 13. Only then mark Milestone 6 complete

If every step above passes, M6 is complete. If step 10 surfaces a full-fight
problem, M6 is not complete — record what was observed and stop, rather than
adjusting the analyzer to make the smoke pass.

---

## Why the full-fight step matters

Every M5 regression fixture is a **sanitized window** — a few hundred events
chosen to exercise specific decisions. Production ingestion delivers a **whole
fight**: thousands of events, the full cast history, every phase.

The composition is identical, and nothing in M3, M4 or M5 was changed to
accommodate either shape. But the whole-fight path has never actually been
executed, so its behaviour is unproven rather than proven-good. Plausible
surprises include decision counts far larger than expected, exclusion categories
that dominate, or normalization defects that only appear at scale.

That risk was deliberately not "fixed" preemptively in M6-E. Trimming, sorting
or filtering the production fight to resemble a fixture would have made the
smoke test meaningless — it would prove the trimming worked, not the engine.

If an offline-reproducible defect turns up, capture it as a fixture and fix it
in the owning milestone. Do not repair gameplay or state architecture from
inside a deployment checklist.

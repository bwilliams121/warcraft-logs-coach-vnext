# Post-merge deployment and smoke checklist

Three parts, all run **manually**, in order. Nothing here is executed by CI or
by an agent: every step touches production or spends Warcraft Logs API points.

- **Part I — Milestone 6** (below) is the original single-fight checklist. It is
  kept as written because it is what was actually run. Two expectations in it
  are now historical rather than current, and are marked where they occur.
- **[Part II — Milestone 8](#part-ii--milestone-8)** covers the whole deployed
  surface: three REST endpoints and three MCP tools. Its step M8-5 is
  superseded by Part III (see the note there).
- **[Part III — Milestone 10-D](#part-iii--milestone-10-d)** is the current
  checklist: the second public analyzer (Protection Paladin), the Arms Warrior
  as the unsupported subject, and the invariance of everything else.

If you are deploying today, run Part III. Part II M8-1 (preconditions) and
M8-13 (leakage sweep) still apply verbatim and Part III refers to them.

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

> **Historical.** True at M6. The deployed server now lists **three** tools —
> M7 added `analyze_raid_night` and M8 added `analyze_encounter_context`. See
> Part II step 9 for the current expectation.

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

---

# Part II — Milestone 8

The deployed surface after M8-H:

| Transport | Route / tool | Schema |
| --- | --- | --- |
| REST | `POST /v1/analysis` | `warcraft-logs-coach.analysis/1` |
| REST | `POST /v1/raid-night` | `warcraft-logs-coach.raid-night/1` |
| REST | `POST /v1/encounter-context` | `warcraft-logs-coach.encounter-context/1` |
| MCP | `analyze_warcraft_log` | same as `/v1/analysis` |
| MCP | `analyze_raid_night` | same as `/v1/raid-night` |
| MCP | `analyze_encounter_context` | same as `/v1/encounter-context` |

`/health` remains public. Everything else requires the bearer token.

**Milestone 8 is not complete until step M8-14.**

## Secret handling — read first

No step below prints a secret. Load the bearer token once, into a variable, in a
way that does not echo it and does not put it in shell history:

```powershell
$secure = Read-Host "ANALYSIS_AUTH_TOKEN" -AsSecureString
$token  = [System.Net.NetworkCredential]::new("", $secure).Password
$auth   = @{ Authorization = "Bearer $token" }
$base   = "https://<worker-host>"
```

Then use `$auth` everywhere. Do **not** `Write-Host $token`, do not paste the
literal value into a command, and do not commit a transcript that contains one.
`WCL_CLIENT_ID` and `WCL_CLIENT_SECRET` are never needed here at all — they are
backend-only and no smoke step sends them.

Do not regenerate or rotate the existing token as part of this checklist. Rotate
only if there is an actual reason to believe it leaked.

## M8-1. Preconditions

Part I steps 1-3, unchanged:

1. CI green on the merged commit.
2. `npx wrangler secret list` shows `ANALYSIS_AUTH_TOKEN`.
3. `npx wrangler deploy --dry-run` lists
   `env.ANALYSIS_RATE_LIMITER (10 requests/60s)`.

The dry run must also show the Worker still fits its bundle and that no new
binding appeared. M8 added **no** binding, **no** namespace and **no** second
rate-limit key.

## M8-2. Deploy

The exact command, run from the repository root:

```powershell
npx.cmd wrangler deploy
```

This is the only deployment command. No agent runs it; Brandon does.

## M8-3. Health

```powershell
Invoke-WebRequest -Uri "$base/health" | Select-Object -ExpandProperty Content
```

HTTP 200, `{"status":"ok","version":"...","environment":"..."}`, and nothing
about configuration.

## M8-4. REST single fight — supported spec

Spends Warcraft Logs API points. Costs **1** rate-limit unit.

```powershell
$body = @{ reportCode = "A7R6kxPJ1hC8YQ4w"; fightId = 7; sourceId = 19 } | ConvertTo-Json
$r = Invoke-WebRequest -Uri "$base/v1/analysis" -Method POST -Body $body `
     -ContentType "application/json" -Headers $auth -SkipHttpErrorCheck
$r.StatusCode
```

Report `A7R6kxPJ1hC8YQ4w` fight 7 is Entombed Sentinels (`encounterID` 3445,
difficulty 5, a kill); actor 19 is an Assassination Rogue. This is the identity
the repository's own fixture provenance was captured from, so it is a report
that genuinely exists rather than an invented one.

Expect 200 and `schemaVersion = warcraft-logs-coach.analysis/1`, with the
supported-spec result and its coverage disclosure. Then run Part I step 10's
full-fight sanity list against it — that arithmetic is unchanged.

## M8-5. REST single fight — unsupported spec

> **Superseded by Part III step M10-5.** Kept as written because it is what
> was run at M8. Two of its statements are no longer accurate: the committed
> A7R6 master data has actor 5 as an Evoker (Preservation), not a Protection
> Paladin — and Protection Paladin has been a SUPPORTED specialization since
> M10-D in any case — and schema `warcraft-logs-coach.analysis/1` carries no
> consumable category, so the second bullet below cannot be checked against
> the current output (preparation analysis is unimplemented product intent;
> see `agent/follow-ups.md`). Use M10-5, whose unsupported subject is
> machine-pinned from the committed context artifact.

Costs **1** unit. Same report, fight 6 (Sszorak, `encounterID` 3420), actor 5,
who is a Protection Paladin.

```powershell
$body = @{ reportCode = "A7R6kxPJ1hC8YQ4w"; fightId = 6; sourceId = 5 } | ConvertTo-Json
$r = Invoke-WebRequest -Uri "$base/v1/analysis" -Method POST -Body $body `
     -ContentType "application/json" -Headers $auth -SkipHttpErrorCheck
$r.StatusCode
```

**This step exists to prove a negative, and it is the most important single-fight
check on the list.** Expect 200 with an explicit `SPEC_NOT_SUPPORTED` outcome.
Confirm all three:

- the response states plainly that specialization gameplay analysis is
  unsupported, and labels itself partial coverage;
- the consumable categories (health potion, healthstone, combat potion) are
  still present with a status, because they are required regardless of spec;
- there is **no** empty gameplay finding list presented as a clean result.

An unsupported spec that returns a well-formed report containing no findings
reads to a player as "you played perfectly". If this response could be mistaken
for that, stop and record it.

## M8-6. REST raid night

Costs **1 unit per fight** — 3 for the request below. Spends materially more
Warcraft Logs points than a single fight.

```powershell
$body = @{ reportCode = "A7R6kxPJ1hC8YQ4w"; fightIds = @(5, 6, 7) } | ConvertTo-Json
$r = Invoke-WebRequest -Uri "$base/v1/raid-night" -Method POST -Body $body `
     -ContentType "application/json" -Headers $auth -SkipHttpErrorCheck
$r.StatusCode
```

Expect 200 and `schemaVersion = warcraft-logs-coach.raid-night/1`. At most 4
fights and 25 players per request; a fifth fight is refused before any
retrieval, deliberately.

## M8-7. REST encounter context — local only

Costs **3** units (one per fight, no external phase).

```powershell
$body = @{ reportCode = "A7R6kxPJ1hC8YQ4w"; fightIds = @(5, 6, 7) } | ConvertTo-Json
$local = Invoke-WebRequest -Uri "$base/v1/encounter-context" -Method POST -Body $body `
         -ContentType "application/json" -Headers $auth -SkipHttpErrorCheck
$local.StatusCode
$local.Content | Set-Content -Path .\smoke-context-rest.json -Encoding utf8
```

Expect 200 and `schemaVersion = warcraft-logs-coach.encounter-context/1`.

Check, against the document:

- `externalReferences.status` is `NOT_REQUESTED`. Nothing external was
  contacted, and nothing was charged for it.
- `encounters[]` groups pulls by encounter identity. Fights of *different*
  encounters must be in *different* sequences — 5, 6 and 7 are not one
  progression just because they were the same night.
- every `pulls[]` entry is in chronological order within its sequence, and pull
  ordinals are per-sequence, not global.
- a fight that resolved no encounter identity appears under `unresolvedPulls`,
  **not** dropped and not forced into a sequence.
- `capability` reads `NO_SCORE_NO_RATING_NO_RANKING` and
  `NO_NEXT_ACTION_PREDICTION`. Search the raw body for `score`, `rating`,
  `parse`, `percentile` and `rank` — the only legitimate hits are inside those
  capability strings and the `RANKINGS_DERIVED_REFERENCE_POOL...` label.

## M8-8. REST encounter context — external references enabled

Costs **9** units: 3 fights + 6 for the bounded external phase (one ranking page
plus at most five metadata lookups). The maximum any single request can cost is
10, and that is pinned by test.

```powershell
$ext = @{
  reportCode = "A7R6kxPJ1hC8YQ4w"
  fightIds   = @(5, 6, 7)
  externalReferences = @{
    mode           = "ENABLED"
    subjectFightId = 7
    className      = "Rogue"
    specName       = "Assassination"
    metric         = "dps"
    partition      = @{ mode = "LATEST" }
  }
} | ConvertTo-Json -Depth 6

$r = Invoke-WebRequest -Uri "$base/v1/encounter-context" -Method POST -Body $ext `
     -ContentType "application/json" -Headers $auth -SkipHttpErrorCheck
$r.StatusCode
```

**Why `LATEST` and not `PINNED`.** A pinned partition is reproducible only if the
partition number is the right one, and this repository has established no
verified encounter-to-partition mapping — M8-F looked and found no typed subject
field to derive one from. Supplying a number that merely looks plausible would
produce a confidently wrong retrieval. `LATEST` is the honest choice here, and it
is explicitly **not** reproducible: after a partition rollover the same request
can return a different pool. Use `PINNED` only when you can actually establish
the partition from Warcraft Logs, and record how you established it.

Then confirm, in order of importance:

1. **The request is still 200.** Every external outcome is a document, not an
   error. A rejected ranking request, an unrecognised payload, an empty pool and
   an unknown encounter all produce a complete, valid document carrying the full
   local progression.
2. **The local half is byte-identical to step M8-7.** Compare the `identity`,
   `encounters` and `unresolvedPulls` of both responses. External discovery must
   not have moved a single local fact.
3. `externalReferences.status` is one of the modelled outcomes:
   `NOT_REQUESTED`, `SUBJECT_PULL_NOT_IN_A_SEQUENCE`, `REQUEST_REJECTED`,
   `PAYLOAD_UNRECOGNISED`, `ENCOUNTER_NOT_FOUND`, or a populated section.
4. If references came back, each one may be `qualification = QUALIFIED` while
   `comparability = UNKNOWN`. **That is correct, not a bug.** Qualification means
   the external pull and player identity were established. Comparability means
   whether the two pulls may be compared at all, which across reports is
   currently UNKNOWN because version semantics are unproven. Do not read an
   UNKNOWN comparison as "a similar pull".
5. No ranking position, parse number or percentile appears anywhere.

If `status` is `SUBJECT_PULL_NOT_IN_A_SEQUENCE`, the subject fight resolved no
encounter identity. Pick a `subjectFightId` that appears in `encounters[]` in
the step M8-7 document and retry once. Do not retry repeatedly — see M8-12.

## M8-9. MCP `tools/list`

```powershell
$h = $auth + @{ "Mcp-Method" = "tools/list" }
$b = '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"smoke","version":"1.0.0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'
$r = Invoke-WebRequest -Uri "$base/mcp" -Method POST -Body $b -ContentType "application/json" `
     -Headers $h -SkipHttpErrorCheck
($r.Content | ConvertFrom-Json).result.tools.name
```

Expect exactly these three, and nothing else — no `ping`, no primitives:

```text
analyze_warcraft_log
analyze_raid_night
analyze_encounter_context
```

Read `analyze_encounter_context`'s description as a model would. Its first
sentence must still say what the tool is **not** (not a score, not a rating, not
a ranking), because a summarising client that keeps only the first sentence must
still be unable to conclude that a ranked player's log is a standard.

## M8-10. MCP `tools/call` — encounter context

Costs the same **3** units as step M8-7. Same identifiers, so the two documents
are comparable.

```powershell
$h = $auth + @{ "Mcp-Method" = "tools/call"; "Mcp-Name" = "analyze_encounter_context" }
$b = '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"analyze_encounter_context","arguments":{"source":"ids","reportCode":"A7R6kxPJ1hC8YQ4w","fightIds":[5,6,7]},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"smoke","version":"1.0.0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'
$m = Invoke-WebRequest -Uri "$base/mcp" -Method POST -Body $b -ContentType "application/json" `
     -Headers $h -SkipHttpErrorCheck
$m.StatusCode
```

Expect `isError` absent, a `structuredContent` object, and a `content[0].text`
block whose parsed JSON equals it.

## M8-11. Transport parity, decoded from raw bytes

The M7 production defect was a **decoding** one, so this step must not go through
any convenience accessor that re-decodes for you. Read the bytes.

```powershell
# REST body, decoded explicitly as UTF-8 from the raw stream.
$local.RawContentStream.Seek(0, 'Begin') | Out-Null
$restText = [System.Text.Encoding]::UTF8.GetString($local.RawContentStream.ToArray())
$restText | Set-Content -Path .\smoke-rest.json -Encoding utf8

# MCP structuredContent, likewise.
$m.RawContentStream.Seek(0, 'Begin') | Out-Null
$mcpText = [System.Text.Encoding]::UTF8.GetString($m.RawContentStream.ToArray())
($mcpText | ConvertFrom-Json).result.structuredContent | ConvertTo-Json -Depth 100 `
  | Set-Content -Path .\smoke-mcp.json -Encoding utf8
```

Confirm both responses declare a charset:

```powershell
$local.Headers["Content-Type"]
$m.Headers["Content-Type"]
```

Both must contain `charset=utf-8`.

Then compare the two documents key-order-independently:

```powershell
node -e "const fs=require('fs');const c=o=>Array.isArray(o)?o.map(c):(o&&typeof o==='object'?Object.fromEntries(Object.keys(o).sort().map(k=>[k,c(o[k])])):o);const a=c(JSON.parse(fs.readFileSync('smoke-rest.json','utf8')));const b=c(JSON.parse(fs.readFileSync('smoke-mcp.json','utf8')));console.log(JSON.stringify(a)===JSON.stringify(b)?'PARITY OK':'PARITY MISMATCH')"
```

Expect `PARITY OK`. Property order is not part of the contract; content is.

**Non-ASCII check.** Zone names, encounter names and player names can carry
accented Latin characters and typographic punctuation. Find one in the document
and confirm the characters are identical in both files and render correctly —
`Ã¬` where `ì` belongs means something decoded as Latin-1. If the report has no
non-ASCII text at all, say so rather than recording the check as passed.

Delete `smoke-rest.json`, `smoke-mcp.json` and `smoke-context-rest.json` when
done. They contain no secrets, but they are not repository content.

## M8-12. Rate limiting — observe, do not exhaust

The limiter is **10 requests / 60 seconds** on one shared key,
`analysis:warcraft_log`, for all three endpoints and all three tools. M8 added no
second key and no separate allowance, so encounter context spends the *same*
budget as everything else.

Units, for reference:

| Request | Units |
| --- | --- |
| `/v1/analysis`, one fight | 1 |
| `/v1/raid-night`, n fights | n (max 4) |
| `/v1/encounter-context`, n fights, local only | n (max 4) |
| `/v1/encounter-context`, n fights, external enabled | n + 6 (max 10) |

A request is charged **before** any retrieval, and priced from the request
rather than from what happens — an external phase that returns nothing costs the
same six units as one that returns five references. That is deliberate: a cheap
failure must not be the cheapest way to probe the API repeatedly.

**Do not deliberately exhaust the limit to watch it trigger.** Confirming the
429 path is not worth spending a shared, paid quota, and the offline suite
already proves it. If a 429 occurs naturally, confirm the body is the
author-written `RATE_LIMITED` message and carries no upstream text.

Also remember what the limiter is not: Cloudflare rate-limit counters are
per-location and eventually consistent. `10/60s` is a brake, not a ledger, and
must never be reported as an exact global cap on Warcraft Logs spend.

## M8-13. Unauthorized and leakage sweep

Send one request to **each** of the three routes with no `Authorization` header:

```powershell
foreach ($path in "/v1/analysis", "/v1/raid-night", "/v1/encounter-context") {
  $r = Invoke-WebRequest -Uri "$base$path" -Method POST -Body '{}' `
       -ContentType "application/json" -SkipHttpErrorCheck
  "{0} -> {1} / {2}" -f $path, $r.StatusCode, $r.Headers["WWW-Authenticate"]
}
```

Each must be `401` with `WWW-Authenticate: Bearer` — the scheme alone, never the
credential. `/health` must still answer 200 without a token.

Then, across every response captured in steps M8-3 to M8-11, in bodies **and**
headers, confirm none of the following appears:

- a `WCL_CLIENT_ID` or `WCL_CLIENT_SECRET` value
- the `ANALYSIS_AUTH_TOKEN` value
- an OAuth access token
- raw GraphQL error text or a stack trace
- `rateLimit` / `pointsSpentThisHour` operational metadata

Finally send one deliberately bad request — a report code that does not exist —
and confirm the error is a specific code with an author-written message rather
than upstream text.

## M8-14. Only then mark Milestone 8 complete

If every step passes, M8 is complete.

If a step surfaces a problem, M8 is **not** complete: record exactly what was
observed and stop. Do not adjust the analyzer, the projection or the bounds to
make a smoke step pass. If the defect is reproducible offline, capture it as a
fixture and fix it in the milestone that owns the behaviour — not from inside
this checklist.

---

## What Part II cannot prove

Worth stating, so a green checklist is not over-read:

- **External discovery against a live ranking board has never run.** Every M8-F
  and M8-G test drives fixtures through the decoder. Step M8-8 is the first real
  execution, and the ranking payload is explicitly non-frozen JSON that Warcraft
  Logs may reshape without notice. An unfamiliar shape is *supposed* to land as
  `PAYLOAD_UNRECOGNISED` rather than as a wrong answer — if it lands as anything
  else, that is the finding.
- **Partition semantics remain unproven.** `LATEST` moves. Two identical requests
  either side of a rollover can legitimately return different pools, and nothing
  in the document claims otherwise.
- **Cross-report comparability is UNKNOWN by construction**, not by accident of
  this particular report. No live run will change that; only a proven version
  semantics would.
- **The 25-player and 4-fight bounds are conservative product choices, not
  measurements.** This workload has still never been profiled inside a
  Cloudflare isolate. Step M8-6 is the closest thing to evidence, and it is one
  data point.

---

# Part III — Milestone 10-D

The deployed surface is unchanged in routes and tools. What changed: a second
public analyzer, `paladin-protection-observed-decisions`, selected for
`Paladin/Protection`; the public `specId` enum of
`warcraft-logs-coach.analysis/1` now carries `paladin/protection`; and the
`analyze_warcraft_log` / `analyze_raid_night` descriptions name both supported
specializations and Protection's limits. No schema version moved.

**Run Part III only after M10-D is reviewed, committed, pushed, CI-green and
deployment is separately authorized. Nothing below is executed by an agent.**

Preconditions, unchanged: Part II M8-1 (CI green on the merged commit,
`ANALYSIS_AUTH_TOKEN` present, the dry run lists the rate-limit binding and no
new binding). Secret handling as in Part II — load the token once into `$auth`,
never print it.

## M10-1. Deploy

```powershell
npx.cmd wrangler deploy
```

Brandon runs it; no agent does.

## M10-2. Health

As M8-3. HTTP 200, nothing about configuration.

## M10-3. REST single fight — Assassination (invariance)

Costs **1** unit. Same identifiers as M8-4: `A7R6kxPJ1hC8YQ4w` fight 7 actor 19.

Expect 200, `schemaVersion = warcraft-logs-coach.analysis/1`, `status`
`ANALYZED`, `specialization.specId = "rogue/assassination"`,
`analyzerId = "rogue-assassination-observed-decisions"`. Compare the body,
key-order-independently, with the pre-deploy capture of the same request if one
was taken: the Assassination document must not have moved. Then run Part I
step 10's arithmetic.

## M10-4. REST single fight — Protection Paladin (newly public)

Costs **1** unit. Same report and fight, actor **7** — the Protection Paladin
the committed corpus evidence was captured from (`wcl-fight-context-a7r6-fight-7`
proves the identity: masterData subType Paladin, friendlySpecs "Protection").

```powershell
$body = @{ reportCode = "A7R6kxPJ1hC8YQ4w"; fightId = 7; sourceId = 7 } | ConvertTo-Json
$r = Invoke-WebRequest -Uri "$base/v1/analysis" -Method POST -Body $body `
     -ContentType "application/json" -Headers $auth -SkipHttpErrorCheck
$r.StatusCode
```

Expect 200 and confirm all of:

- `status` is `ANALYZED` — **not** `SPEC_NOT_SUPPORTED`;
- `specialization` is `{ "specId": "paladin/protection", "gameplaySupported": true }`;
- `analyzerId` is `paladin-protection-observed-decisions`;
- `authority.authorityId` is `SIMC_APL_PALADIN_PROTECTION`,
  `authority.artifactRevision` is `simc-33622e9d-1`,
  `authority.commitSha` is `33622e9d1662ff0e451691edf85a6b49cc9d11d9`;
- `capability.matchMeaning` is `AUTHORITY_COMPATIBLE_ONLY` and
  `capability.scoresPerformance` is `false`;
- Part I step 10's arithmetic holds;
- `coverage.exclusions` contains a `NON_GCD_ACTION` row (Shield of the
  Righteous and melee swings land there) and the string `MELEE_SWING` appears
  **nowhere** in the body;
- none of `rawBlocker`, `domains`, `holyPower`, `build`, `resolved` appears as
  a key;
- `eligibleDecisions` is plausible for the whole pull — the committed 165 s
  bundle over the same subject yields 149 eligible / 4 MATCH / 0 REJECTED /
  145 UNKNOWN, so the whole pull is expected to be UNKNOWN-heavy with a small
  number of MATCH decisions. Do not read that as a grade. The committed MATCH
  decisions inside the first 165 s (Divine Toll at report times 2,026,655 and
  2,088,835; Avenger's Shield at 2,074,381 and 2,139,100) should appear as
  `MATCH` with `selectionPrecision` `EXACT_ENTRY` if the whole-pull evidence
  agrees with the committed slices; if any differs, record it — that is a
  finding about whole-fight evidence, not something to adjust.

## M10-5. REST single fight — unsupported (Arms Warrior)

Costs **1** unit. Same report and fight, actor **4** — Warrior/Arms per the
same committed context artifact. Since M11-A2 this is the CURRENT
UNSUPPORTED SUBJECT centralized in `tests/support/unsupported-subject.ts`
(`A7R6kxPJ1hC8YQ4w` / fight 7 / actor 4 / Warrior / Arms); if that fixture
has been migrated, use its current coordinates here. (Part II's M8-5 used fight 6 actor 5 and
called it a Protection Paladin; the committed master data has actor 5 as an
Evoker. Either way it was unsupported. Use actor 4 now, whose identity is
machine-pinned.)

Expect 200 with `status` `SPEC_NOT_SUPPORTED`, `specialization`
`{ "specId": null, "gameplaySupported": false }`, `analyzerId` `null`, a
`detail` naming `warrior/arms` and saying no gameplay analysis was attempted,
and **no** `decisions`, `coverage` or `authority` field. This is still the most
important negative on the list: an unsupported spec must not read as clean
play.

## M10-6. MCP `tools/list`

As M8-9: exactly the three tools. Then read the two descriptions as a model
would and confirm each contains, verbatim modulo line wrapping:

- `Supported specializations: Assassination Rogue and Protection Paladin`
- `OFFENSIVE global-cooldown decisions`
- `NOT evaluate defensive cooldowns, active mitigation, self-healing,`
- `interrupts, or survival`
- `Shield of the Righteous are excluded,` … `not judged`
- `not that a mistake was made`

and that neither says `Only Assassination Rogue`. Then confirm the
`analyze_warcraft_log` **outputSchema** advertises `specId` with exactly the
two enum members `rogue/assassination` and `paladin/protection`. This
`tools/list` change is the ONLY intended Assassination-adjacent metadata
change of the deployment.

## M10-7. MCP `tools/call` — Protection and Arms

Costs **1** unit each. Call `analyze_warcraft_log` with
`{ "source": "ids", "reportCode": "A7R6kxPJ1hC8YQ4w", "fightId": 7, "sourceId": 7 }`
and again with `"sourceId": 4`. Expect `isError` absent for both, a
`structuredContent` object, and `content[0].text` whose parsed JSON equals it.

## M10-8. Transport parity, decoded from raw bytes

Exactly M8-11's procedure, applied to the Protection pair (M10-4 vs the first
M10-7 call) and to the Arms pair (M10-5 vs the second). Both must print
`PARITY OK`. Delete the scratch files afterwards.

## M10-9. Raid night with the tank

Costs **1** unit. `{ reportCode = "A7R6kxPJ1hC8YQ4w"; fightIds = @(7) }`.
Expect 200, `schemaVersion = warcraft-logs-coach.raid-night/1`, and in `cells`:
actor 7 `kind` `ANALYZED` with `provenance.specId` `paladin/protection`;
actor 19 `ANALYZED` with `rogue/assassination`; actor 4 `NOT_ANALYZED` with
`status` `SPEC_NOT_SUPPORTED`; every other participant `NOT_ANALYZED` /
`SPEC_NOT_SUPPORTED` or `ANALYSIS_UNAVAILABLE` as their identity dictates. No
`MELEE_SWING` anywhere. `coverage.cellsAnalyzed` is 2.

## M10-10. Encounter context does not move authority

Costs **1** unit (local only). `/v1/encounter-context` with the same single
fight. The actor-7 point's cell must deep-equal the actor-7 cell from M10-9
(counts, provenance, recurrence). `externalReferences.status` is
`NOT_REQUESTED`.

## M10-11. Unauthorized and leakage sweep

As M8-13, over every response captured in this Part.

## M10-12. Only then mark Milestone 10 complete

If every step passes, M10 is complete. If a step surfaces a problem — a
Protection request answering `SPEC_NOT_SUPPORTED`, a `MELEE_SWING` or internal
field on the wire, an Assassination document that moved, a whole-pull outcome
that contradicts the committed slices — M10 is **not** complete: record exactly
what was observed and stop. Do not adjust the analyzer, the projection or the
descriptions to make a smoke step pass.

## What Part III cannot prove

- **Whole-pull Protection cost inside a Cloudflare isolate has never been
  measured.** The committed evidence is bounded (22 s, 45 s, 165 s); the
  offline measurements in `scripts/bench/m10d-public-invariance.bench.ts` are
  Node numbers. M10-4 is the first whole-pull execution, and `cpu_ms` stays at
  120,000 until a measurement says otherwise.
- **Identity/evidence mismatch is not detected.** A Warcraft Logs identity that
  names a supported specialization over another class's events dispatches the
  real analyzer; `IDENTITY_CONFLICT` remains M15's. The identities above are
  machine-pinned from the committed context artifact precisely so this cannot
  happen here.

---

# Part IV — Milestone 11-A5

The deployed surface is unchanged in routes and tools. What changed: a third
public analyzer, `paladin-retribution-observed-decisions`, selected for
`Paladin/Retribution`; the public `specId` enum of
`warcraft-logs-coach.analysis/1` now carries `paladin/retribution`; the public
exclusion-reason enum carries a fourth, spec-neutral value
`OUTSIDE_SUPPORTED_SLICE`; and the `analyze_warcraft_log` /
`analyze_raid_night` descriptions name all three supported specializations
and Retribution's limits. No schema version moved.

**Run Part IV only after M11-A5 is reviewed, committed, pushed, CI-green and
deployment is separately authorized. Nothing below is executed by an agent.**

Preconditions, unchanged from Part III. Secret handling as in Part II.

## M11-1. Deploy, M11-2. Health

As M10-1 and M10-2.

## M11-3. REST single fight — Assassination and Protection (invariance)

As M10-3 and M10-4: both documents must be what Part III recorded, byte for
byte where the report revision has not moved. Neither may carry
`OUTSIDE_SUPPORTED_SLICE` (their slices are their authorities' whole GCD action
sets).

## M11-4. REST single fight — Retribution Paladin (newly public)

Costs **1** unit. Same report and fight, actor **6** — the Retribution Paladin
the committed corpus evidence was captured from (`wcl-fight-context-a7r6-fight-7`
proves the identity: masterData subType Paladin, friendlySpecs "Retribution").
Same request shape as M10-4 with `sourceId = 6`. Expect 200 and confirm all
of:

- `status` is `ANALYZED` — **not** `SPEC_NOT_SUPPORTED`;
- `specialization` is `{ "specId": "paladin/retribution", "gameplaySupported": true }`;
- `analyzerId` is `paladin-retribution-observed-decisions`;
- `authority.authorityId` is `SIMC_APL_PALADIN_RETRIBUTION`,
  `authority.artifactRevision` is `simc-33622e9d-1`,
  `authority.commitSha` is `33622e9d1662ff0e451691edf85a6b49cc9d11d9`;
- `capability.matchMeaning` is `AUTHORITY_COMPATIBLE_ONLY` and
  `capability.scoresPerformance` is `false`;
- Part I step 10's arithmetic holds;
- every `decisions[].observedToken` is `divine_storm` or `templars_verdict`;
- `coverage.exclusions` contains a `NON_GCD_ACTION` row and an
  `OUTSIDE_SUPPORTED_SLICE` row (Judgment, Blade of Justice, Hammer of Wrath,
  Wake of Ashes, Divine Toll, Execution Sentence land there), and the strings
  `OUTSIDE_FIRST_SLICE` and `MELEE_SWING` appear **nowhere** in the body;
- none of `rawBlocker`, `rootScanBlockedAt`, `domains`, `holyPower`, `build`,
  `resolved`, `foregroundProvenByObservedExecution` appears as a key;
- `eligibleDecisions` is plausible for the whole pull — the committed 165 s
  bundle over the same subject yields 69 eligible / 1 MATCH / 10 REJECTED /
  58 UNKNOWN, so the whole pull is expected to be UNKNOWN-heavy. Do not read
  that as a grade. The committed MATCH (Final Verdict at report time
  2,108,996, `EXACT_ENTRY` `templars_verdict`) and the committed REJECTED
  Divine Storms (2,006,193; 2,105,158 and 2,106,382 with `EXACT_ENTRY`
  `templars_verdict`) should appear as such if the whole-pull evidence agrees
  with the committed slices; if any differs, record it — that is a finding
  about whole-fight evidence, not something to adjust.

## M11-5. REST single fight — unsupported (Arms Warrior)

As M10-5, unchanged: actor 4 is still `SPEC_NOT_SUPPORTED`.

## M11-6. MCP `tools/list`

As M10-6, with the sentence now
`Supported specializations: Assassination Rogue, Protection Paladin and Retribution Paladin`
and, in addition to the Protection lines, each description containing
verbatim modulo line wrapping:

- `only observed Holy Power SPENDER decisions`
- `OUTSIDE_SUPPORTED_SLICE`
- `does NOT evaluate` … `defensive cooldowns, interrupts`

and neither saying `full Retribution rotation`. The `analyze_warcraft_log`
**outputSchema** advertises `specId` with exactly the three enum members and
the exclusion `reason` with exactly the four.

## M11-7. MCP `tools/call` — Retribution and Arms

As M10-7 with `sourceId` 6 and 4.

## M11-8. Transport parity, decoded from raw bytes

As M10-8, applied to the Retribution pair and the Arms pair.

## M11-9. Raid night with all three

As M10-9 over fight 7: the actor-6 cell is `ANALYZED` under
`paladin/retribution`, the actor-7 cell is what Part III recorded, the
actor-4 cell is `SPEC_NOT_SUPPORTED`; one roster discovery, one ingestion.

## M11-10. Unauthorized and leakage sweep, M11-11. Completion

As M10-11 and M10-12. If a step surfaces a problem — a Retribution request
answering `SPEC_NOT_SUPPORTED`, `OUTSIDE_FIRST_SLICE` or an internal field on
the wire, an Assassination or Protection document that moved — M11-A5 is
**not** complete: record exactly what was observed and stop. Do not adjust the
analyzer, the projection or the descriptions to make a smoke step pass.

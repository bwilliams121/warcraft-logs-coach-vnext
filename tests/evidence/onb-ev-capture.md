# ONB-EV neutral evidence campaign: provenance

Human-readable record of the campaign's Warcraft Logs requests. Nothing here is read by a test, and it backs no artifact: the raw captures stay retained under `.probe/onb-ev/` and no fixture is committed.

## Authority

Owner grant of 2026-11-06, `agent/autopilot-queue.md` "ONB-EV" and `agent/architecture.md` "Owner grant (2026-11-06): ONB-EV": at most 60 Warcraft Logs HTTP requests, running ONB-EV-PLAN's frozen plan.

Plan: `agent/onb-ev-plan.json`, digest `48066f986e7035542bf81c0263f4cec0d9d70e0f3d892ab6eb7ed535e6fa0013`, rule revision `onb-ev-selection/1`. The runner checked that digest before requests 1 to 4, and revision 2's, `49303e1c03d0a056829b3474c1c47dc8cf0a37ca99ba5c532c74650c5519828f`, before request 5.

## Requests (2026-11-07): 2 of 60, 58 left

Counted at the fetch layer, by a counter that refuses a 61st HTTP request.

| # | Time (UTC) | Request | HTTP | Outcome |
| --- | --- | --- | ---: | --- |
| 1 | 06:58:33.019 | OAuth client-credentials token | 200 | OK |
| 2 | 06:58:33.568 | Listing, 12.1.0.69933 page 1: `reports(zoneID: 53, startTime: 1790737200000, endTime: 1791778694000, limit: 100, page: 1)` with the plan's fields | 200 | **Refused**: one GraphQL error, `UPSTREAM_DATA_INVALID`, stage TRANSPORT |

The refusal's body is 79 characters long, sha256 `f9c86105ac35a6f8e6acc5fd0d9875603306ab673abb5e95750df67551e32a8e`. Its text was not retained at the time: the runner's ledger kept the length and digest of each body, and the production client reports only the count of GraphQL errors. The owner's retry below recovered it.

## The owner's retry and plan revision 2 (2026-11-07)

| # | Time (UTC) | Request | HTTP | Outcome |
| --- | --- | --- | ---: | --- |
| 3 | 08:29:27.986 | OAuth client-credentials token | 200 | OK |
| 4 | 08:29:28.536 | The identical listing, with the same query and variables as request 2 | 200 | **Refused**, the same 79-character body with the same sha256 |

The body's text, now retained: `{"errors":[{"message":"Max query complexity should be 50000 but got 100701."}]}`. Selected headers: `content-type: application/json`, `x-ratelimit-limit: 800`, `x-ratelimit-remaining: 798`. No retry-after. Category: GraphQL error, no code supplied. Attributable to the listing's query shape, because the message says so and carries the numbers.

Revision 2 (`agent/onb-ev-plan.json`, digest `49303e1c03d0a056829b3474c1c47dc8cf0a37ca99ba5c532c74650c5519828f`) repairs that one thing. See `agent/architecture.md` "ONB-EV plan revision 2". Requests 1 to 4 ran against revision 1, digest `48066f986e7035542bf81c0263f4cec0d9d70e0f3d892ab6eb7ed535e6fa0013`.

## Plan revision 2's run (2026-11-07): stopped at the cap

**56 of 60 requests, 4 left.** Every request of the campaign, counted at the fetch layer from the first, with the raw bodies under the gitignored `.probe/onb-ev/`:

| # | Time (UTC, 2026-11-07) | Request | HTTP | Body chars | Outcome | Body sha256 |
| --- | --- | --- | ---: | ---: | --- | --- |
| 1 | 06:58:33.019 | OAuth client-credentials token | 200 |  | OK |  |
| 2 | 06:58:33.568 | Listing 12.1.0.69933, limit 100 (revision 1) | 200 | 79 | Refused | `f9c86105ac35a6f8e6acc5fd0d9875603306ab673abb5e95750df67551e32a8e` |
| 3 | 08:29:27.986 | OAuth client-credentials token | 200 |  | OK |  |
| 4 | 08:29:28.536 | The identical listing, the owner's retry | 200 | 79 | Refused | `f9c86105ac35a6f8e6acc5fd0d9875603306ab673abb5e95750df67551e32a8e` |
| 5 | 08:39:56.794 | OAuth client-credentials token | 200 |  | OK |  |
| 6 | 08:39:57.337 | Listing 12.1.0.69933, limit 34, request page 1 | 200 | 336,133 | OK | `4dfec13352c6fdc69954358c6ea9415524d3c9b1d25810d18dbbf9ea26cc7e15` |
| 7 | 08:40:06.608 | Listing 12.1.0.69933, limit 34, request page 2 | 200 | 343,853 | OK | `25f59608fbbc84e2f417d1ae8b704eb18981ca57dc4cbb92516e17a850ac0d15` |
| 8 | 08:40:15.772 | Listing 12.1.0.69933, limit 34, request page 3 | 200 | 397,676 | OK | `6100ff18deddaae1c6155accfc8f04fbc6f07d48ec819ea256c6bb73f694ee4e` |
| 9 | 08:40:26.042 | Fight context, priest/discipline | 200 | 354,096 | OK | `10c938044bd1bb0fcc97b61585fa25e365afcc5507615706d7857a6816171f80` |
| 10 | 08:40:26.586 | Events, fight 4, page 1 | 200 | 1,566,215 | OK | `f6225abbaef670ceb616fc1b00e21fe67bd563d1ec3c02561e2384b7b6926a57` |
| 11 | 08:40:26.904 | Events, fight 4, page 2 | 200 | 1,405,896 | OK | `5de188d00a985593cc515fca863d64414b440671bde9cdd9fbce8a364b4397e5` |
| 12 | 08:40:27.213 | Events, fight 4, page 3 | 200 | 1,443,432 | OK | `0f8f13c2d8523f981c85177b1db943201db3f00000e57cd08c403207c2372e3b` |
| 13 | 08:40:27.586 | Events, fight 4, page 4 | 200 | 1,431,779 | OK | `3db4cfecf20eca13bb148d8563adafcb2adf60029d47bf0d4a62c86e68f53fd1` |
| 14 | 08:40:27.874 | Events, fight 4, page 5 | 200 | 1,391,403 | OK | `a9fa0e42784e812f1e70d4ce56c15ab81013554d91acb49f1598962df6757f6c` |
| 15 | 08:40:28.145 | Events, fight 4, page 6 | 200 | 1,397,529 | OK | `3843fe205c823b88a00182d8623db898494f3bea6881d3189bb1a71bfef4d9a4` |
| 16 | 08:40:28.417 | Events, fight 4, page 7 | 200 | 1,462,280 | OK | `9968f78673139e2ed72f66fae59bc9bd98ecc3d520257871e1b17f81d460e006` |
| 17 | 08:40:28.737 | Events, fight 4, page 8 | 200 | 1,410,942 | OK | `4dfea26d54e0d4074e6e961c804b338b5a99ad39ac2683b067e3b0acbbdfaa35` |
| 18 | 08:40:29.017 | Events, fight 4, page 9 | 200 | 1,387,037 | OK | `08c304275987fc18ac2b78bc33249a80dc05da600295a5b9d98a88bf0418ec4c` |
| 19 | 08:40:29.308 | Events, fight 4, page 10 | 200 | 480,520 | OK | `3e8c6b056cb266d24571959f4df31940dcf3253edc75b80ff9d5816ae610bc43` |
| 20 | 08:40:29.531 | Report revision | 200 | 49 | OK | `c933291fd4d0ac079c24d0c43cbf413a3c0d6475e6edb5c7663564b947358189` |
| 21 | 08:40:29.696 | Fight context, rogue/subtlety | 200 | 120,622 | OK | `d8d778baaeb6803429068f8b84e4c22c91021bc6c045adf0b3d9925e3cbaa882` |
| 22 | 08:40:30.138 | Events, fight 16, page 1 | 200 | 3,298,503 | OK | `a8e153000d2773e8321e412b892bbe703382bc350911929b8cb80779c1383ae1` |
| 23 | 08:40:30.542 | Events, fight 16, page 2 | 200 | 3,313,815 | OK | `31f09b17ecfa8cbe7e4d7a9ba963b0f354828d108a956c3a80629b5b0cde5dba` |
| 24 | 08:40:30.957 | Events, fight 16, page 3 | 200 | 3,290,347 | OK | `4fc55a620733488bb6ebd86eb86f3eb6dff9dc529a3b5bd2189a9c131a196f67` |
| 25 | 08:40:31.369 | Events, fight 16, page 4 | 200 | 3,248,156 | OK | `e17e91fffe5d6af2523fbc80a4e1fa3875e2737b961d312e63a845b9df6b425e` |
| 26 | 08:40:31.791 | Events, fight 16, page 5 | 200 | 3,167,757 | OK | `377e9fd3d4a7d940ba79c1943c6ff974a388bcae3f26c8115b964d66497a05f6` |
| 27 | 08:40:32.193 | Events, fight 16, page 6 | 200 | 3,204,115 | OK | `35e549a541c2d0196819e76a0488ddc81f03a467746bbe2b114e0c8768250739` |
| 28 | 08:40:32.619 | Events, fight 16, page 7 | 200 | 3,209,346 | OK | `1d2278aff555ccdb10b505dde1e32f55e66ce0f5007f7530d07edd1e28c01519` |
| 29 | 08:40:33.042 | Events, fight 16, page 8 | 200 | 3,208,871 | OK | `0a0c486073f1718688efd9fbca40d3a9e216618a4e7ef5b89d43d2ab7dee1b96` |
| 30 | 08:40:33.629 | Events, fight 16, page 9 | 200 | 27,393 | OK | `d5366683aa1a1f52127a2794ad75eee48512bf6204b062738c848ff28dedeb00` |
| 31 | 08:40:33.822 | Report revision | 200 | 49 | OK | `c933291fd4d0ac079c24d0c43cbf413a3c0d6475e6edb5c7663564b947358189` |
| 32 | 08:40:34.002 | Fight context, warrior/fury | 200 | 243,688 | OK | `4ac1f63da8a2af9b0750df690e0412ced112df1ee600d3543f9c64d76462d79c` |
| 33 | 08:40:34.598 | Fight context, hunter/survival | 200 | 243,687 | OK | `3f51b837a2cd6a44623ef246b87bdf24248086e2fe13a84c7d7c2620a09d7a00` |
| 34 | 08:40:34.917 | Events, fight 16, page 1 | 200 | 3,145,318 | OK | `a057da21556fc267a74e85ac303d729e077e79fa0e28e03cd480d89c4c5979e1` |
| 35 | 08:40:35.314 | Events, fight 16, page 2 | 200 | 3,157,291 | OK | `064f7fa4ccd008192af7f82df6f83dccb6118dd09b1cd7c32c5ae2e5d017dc35` |
| 36 | 08:40:35.709 | Events, fight 16, page 3 | 200 | 3,138,747 | OK | `ad92bdb48fe2f8168fac54566c85a79a02a2234dffda4866590a52131da4d9af` |
| 37 | 08:40:36.113 | Events, fight 16, page 4 | 200 | 3,017,950 | OK | `3bd0e8d2601092ae268483114b59e0980f9ece43f21eec2b1989a3c3f29af03a` |
| 38 | 08:40:36.524 | Events, fight 16, page 5 | 200 | 1,784,560 | OK | `7bb7f1b4bf90ec4c4a9fdf68661a6ec8dfc02cabcefb6bf0dd463308d2ab7bff` |
| 39 | 08:40:36.860 | Report revision | 200 | 49 | OK | `c933291fd4d0ac079c24d0c43cbf413a3c0d6475e6edb5c7663564b947358189` |
| 40 | 08:40:37.025 | Fight context, warrior/protection | 200 | 91,907 | OK | `1021b61db8c802edcce512b568014de9e866a51f107988e67a9a08d3624b652e` |
| 41 | 08:40:37.620 | Events, fight 1, page 1 | 200 | 3,080,279 | OK | `63c7cecd51ceb9acf3c6495031845c7123a5ba141160773e91887a2cb6ed8588` |
| 42 | 08:40:38.029 | Events, fight 1, page 2 | 200 | 3,047,489 | OK | `ebc83db1570e265e779025b22052071a12e78393537576a3150f46a8e461e647` |
| 43 | 08:40:38.465 | Events, fight 1, page 3 | 200 | 3,107,437 | OK | `99d4d9a278c16900fbb82d04754f16565e5002b0ee01be2626e732ac45c09a9d` |
| 44 | 08:40:38.873 | Events, fight 1, page 4 | 200 | 3,057,967 | OK | `54ff982bfc9f374a63cc9ec6560dec90e68556e5a196a8b09076ae061299000f` |
| 45 | 08:40:39.245 | Events, fight 1, page 5 | 200 | 3,049,453 | OK | `1c187c738c2267e629fb29f274a093edafc85fd8ac7d2a71fd5e951b2fe06802` |
| 46 | 08:40:39.640 | Events, fight 1, page 6 | 200 | 3,041,980 | OK | `ec2d40bea189d45dfb87066fc2e3329ea23ff5f9f1024f9d05a9077210172e98` |
| 47 | 08:40:40.015 | Events, fight 1, page 7 | 200 | 1,188,085 | OK | `ad6c95472a4c3c613957491b39e739f251d67c84c7c1fd77fbbfd576afe6dcee` |
| 48 | 08:40:40.368 | Report revision | 200 | 49 | OK | `c933291fd4d0ac079c24d0c43cbf413a3c0d6475e6edb5c7663564b947358189` |
| 49 | 08:40:40.545 | Fight context, shaman/enhancement | 200 | 243,648 | OK | `16e557bde85c96eaed084d83cb80d203b8ed2b2defc184e4f8521b13c056f57a` |
| 50 | 08:40:41.219 | Events, fight 8, page 1 | 200 | 1,577,487 | OK | `84bcd18bb9933048ff0e1f32d67e10a05b6a15167b16111105c05bc7b7360100` |
| 51 | 08:40:41.515 | Events, fight 8, page 2 | 200 | 1,398,331 | OK | `36d3ee8043f845cef043a7f76a466e15367aeadb50d64a85876b91925d2474d5` |
| 52 | 08:40:41.783 | Events, fight 8, page 3 | 200 | 1,372,552 | OK | `6654b967082c28924b06dc9aaa4ffc93915e6532fd324abee544e09dc176d9ad` |
| 53 | 08:40:42.074 | Events, fight 8, page 4 | 200 | 1,397,767 | OK | `e4b1f6a459cb0279c1456bba6c159583c684e0a818118a0058df6bac9e906bcb` |
| 54 | 08:40:42.355 | Events, fight 8, page 5 | 200 | 1,410,491 | OK | `5a5834a6c8c78116673e0e238503e8353caf048c653d3becf509d34defb2cd2a` |
| 55 | 08:40:42.629 | Events, fight 8, page 6 | 200 | 1,323,630 | OK | `d6da5364a2f8ab706bd4c0c93d884f0117105e7194068f2b1911522bc202d2cb` |
| 56 | 08:40:42.895 | Report revision | 200 | 49 | OK | `c933291fd4d0ac079c24d0c43cbf413a3c0d6475e6edb5c7663564b947358189` |

Real report codes stay in the raw root. Below, `EV-R<n>` names a report in order of first appearance.

## Selection

The first listing page was enough, so 3 of the listing's 12 possible requests were sent: 102 rows, 102 distinct codes, of which the first 100 are the page. The three bodies' combined sha256 is `128ef2956076ef04bac92df34e5b27968e99d89d33b960ebf03156e5ee7ce8e7`. Each row's first candidate is its selected fight, and the others are the gate's retries, none of which was used. The gate refused nothing.

| Specialization | Candidates, in the fixed order |
| --- | --- |
| Discipline Priest | EV-R1 f4 a592 139086ms; EV-R5 f5 a138 205956ms; EV-R6 f1 a7 319968ms |
| Subtlety Rogue | EV-R2 f16 a11 140187ms; EV-R7 f7 a140 408828ms; EV-R8 f2 a5 290556ms |
| Fury Warrior | EV-R3 f16 a8 398009ms; EV-R3 f8 a8 259097ms; EV-R7 f7 a161 408828ms |
| Protection Warrior | EV-R4 f1 a20 407319ms; EV-R9 f33 a15 122629ms; EV-R10 f36 a1 143716ms |
| Enhancement Shaman | EV-R3 f8 a4 259097ms; EV-R7 f7 a186 408828ms; EV-R3 f9 a4 446114ms |
| Outlaw Rogue | EV-R11 f8 a11 191908ms; EV-R11 f4 a11 149093ms; EV-R11 f7 a11 212374ms |
| Guardian Druid | EV-R12 f20 a1 426205ms; EV-R13 f21 a12 333373ms; EV-R7 f7 a130 408828ms |
| Survival Hunter | EV-R3 f16 a15 398009ms; EV-R3 f8 a15 259097ms; EV-R3 f9 a15 446114ms |
| Frost Mage | EV-R12 f20 a112 426205ms; EV-R8 f39 a404 122322ms; EV-R8 f31 a8 204743ms |
| Affliction Warlock | EV-R1 f39 a578 135176ms; EV-R2 f16 a15 140187ms; EV-R1 f4 a578 139086ms |
| Marksmanship Hunter | EV-R8 f39 a10 122322ms; EV-R1 f39 a13 135176ms; EV-R8 f31 a10 204743ms |
| Vengeance Demon Hunter | EV-R5 f5 a5 205956ms; EV-R14 f20 a136 433332ms; EV-R11 f4 a43 149093ms |

## Captures

Five fights, every one COMPLETE and inside its window, each page's cursor the previous page's `nextPageTimestamp`, and no report's revision moved. The digest covers the stored pages in order.

| Report | Fight | Window | Resources | Pages | Events | State | Revision | Pages sha256 |
| --- | ---: | --- | --- | ---: | ---: | --- | --- | --- |
| EV-R1 | 4 | whole fight | no | 10 | 93,558 | COMPLETE | 1 → 1 | `260147cc41fc` |
| EV-R2 | 16 | first 90 s | yes | 9 | 80,128 | COMPLETE | 1 → 1 | `ef213112249f` |
| EV-R3 | 16 | first 90 s | yes | 5 | 45,810 | COMPLETE | 1 → 1 | `29ec1a62d50c` |
| EV-R4 | 1 | first 90 s | yes | 7 | 63,931 | COMPLETE | 1 → 1 | `4d3af9187106` |
| EV-R3 | 8 | first 90 s | no | 6 | 59,634 | COMPLETE | 1 → 1 | `085b801888a3` |

## Subjects

Stated identity and retrieval counts. No amount, kill flag, boss percentage or rank was read. Casts and resource changes are those the subject sourced. `classResources` counts its events carrying that field.

| Specialization | Subject | Fight | Combatant info | Talent rows | Casts | Resource changes | With `classResources` |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| Discipline Priest | EV-R1 fight 4 actor 592 | Mythic, encounter 3379 | 1 row, specID 256 | 77 | 127 | 97 | 0 |
| Subtlety Rogue | EV-R2 fight 16 actor 11 | Mythic, encounter 3429 | 1 row, specID 261 | 78 | 380 | 313 | 2,043 |
| Fury Warrior | EV-R3 fight 16 actor 8 | Heroic, encounter 3492 | 1 row, specID 72 | 76 | 204 | 101 | 943 |
| Survival Hunter | EV-R3 fight 16 actor 15 | Heroic, encounter 3492 | 1 row, specID 255 | 73 | 95 | 68 | 477 |
| Protection Warrior | EV-R4 fight 1 actor 20 | Mythic, encounter 3445 | 1 row, specID 73 | 78 | 173 | 160 | 885 |
| Enhancement Shaman | EV-R3 fight 8 actor 4 | Heroic, encounter 3429 | 1 row, specID 263 | 79 | 233 | 24 | 0 |

**Evidence still to acquire:** Outlaw Rogue, Guardian Druid, Frost Mage, Affliction Warlock, Marksmanship Hunter and Vengeance Demon Hunter.

## Why it stopped

The next capture in the frozen order, Outlaw Rogue on EV-R11 fight 8, needs 12 requests at its ceiling, and 4 were left. The campaign never skips ahead. The owner's report is in `agent/follow-ups.md` "After ONB-EV's cap stop".

The raw ledger is the gitignored `.probe/onb-ev/ledger.json`, and the summary is beside it. No rankings, comparison or top-log data was requested.

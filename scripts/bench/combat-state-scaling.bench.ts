/**
 * LOCAL NODE MEASUREMENT of per-player `CombatState` construction.
 *
 * WHAT QUESTION THIS ANSWERS
 *
 * M7-B reuses ONE retrieval across every analysed player, which removes the
 * network cost of a raid night. It does NOT remove the state cost: each player
 * still gets their own `CombatState`, and each of those makes several forward
 * passes over the whole event array. That is `O(P·E)` — twenty players over a
 * two-hundred-thousand-event pull — and M7-A flagged the size of it as unmeasured.
 *
 * This measures it, so the decision to leave `combat-state.ts` alone rests on a
 * number rather than on a hope.
 *
 * WHAT THESE NUMBERS ARE NOT
 *
 * They are NOT a Cloudflare production guarantee. This runs on whatever
 * developer machine invokes it, under Node, with Node's garbage collector and
 * Node's JIT. A Workers isolate has different memory accounting, a different CPU
 * budget and different limits, and nothing here establishes any of them.
 *
 * For reference, the platform documents (September 2026):
 *
 *     memory per isolate            128 MB
 *     Workers Paid CPU, default     30 seconds
 *     Workers Paid CPU, max         5 minutes (configurable)
 *
 * `wrangler.jsonc` sets `limits.cpu_ms` to 120,000 (M10-C4). Those are
 * PLATFORM numbers sitting beside a NODE measurement; comparing them directly
 * would be the error this comment exists to prevent. A heap delta measured here
 * does not prove anything fits there.
 *
 * Treat the output as an ORDER OF MAGNITUDE and a SHAPE — specifically, whether
 * the twentieth state costs roughly what the first did, or dramatically more.
 *
 * WHY IT IS NOT A TEST
 *
 * Because a wall-clock threshold in CI fails on a slow runner and teaches the
 * team to ignore it. `npm test` includes only `tests/`; this file has its own
 * offline config and runs only when someone asks:
 *
 *     npx vitest run --config scripts/bench/vitest.config.ts
 *
 * NOT `npm run probe`, which is the credential-loading Warcraft Logs config and
 * spends real API points. An earlier draft of this comment named that command by
 * mistake, which is precisely the accident the split config exists to prevent.
 *
 * It makes no network request, reads no credential, and needs no Warcraft Logs
 * access — unlike its neighbour, which does all three.
 *
 * The input is SYNTHETIC AND DETERMINISTIC. Every event is generated from a
 * fixed arithmetic rule, so two runs on one machine measure the same work, and
 * no committed fixture is needed to reproduce it.
 */

import { describe, expect, it } from "vitest";

import { createCombatState } from "../../src/engine/state/combat-state.js";
import { focusedFightFor } from "../../src/engine/normalization/fight-core.js";
import type { CombatActor } from "../../src/engine/normalization/actors.js";
import type { CombatEvent } from "../../src/engine/normalization/normalized-events.js";
import { castEvent, damageEvent, syntheticFightCore } from "../../tests/support/synthetic-fight.js";

/** Close to the 196,366 events `retrieval-plan.ts` measured for one heroic pull. */
const EVENT_COUNT = 200_000;
/** A mythic roster. */
const PLAYER_COUNT = 20;

const RAIDERS = Array.from({ length: PLAYER_COUNT }, (_, index) => index * 3 + 1);
const BOSS = 900;
const FIGHT_START = 1_000;
const FIGHT_END = FIGHT_START + EVENT_COUNT * 2;

function actorCatalog(): ReadonlyMap<number, CombatActor> {
  const actors = new Map<number, CombatActor>();
  for (const actorId of [...RAIDERS, BOSS]) {
    actors.set(actorId, {
      actorId,
      gameId: null,
      name: `actor-${String(actorId)}`,
      server: null,
      actorType: actorId === BOSS ? "NPC" : "PLAYER",
      rawType: actorId === BOSS ? "NPC" : "Player",
      subType: null,
      petOwnerActorId: null,
    });
  }
  return actors;
}

/**
 * A deterministic event sequence spread across every raider.
 *
 * Timestamps advance by 2 ms with a deliberate repeat every tenth event, so the
 * indexes meet the equal-timestamp runs they meet in real data rather than a
 * strictly increasing sequence that would flatter the measurement.
 */
function syntheticEvents(): readonly CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let index = 0; index < EVENT_COUNT; index += 1) {
    const actorId = RAIDERS[index % PLAYER_COUNT] ?? 1;
    const reportTimeMs = FIGHT_START + index * 2 - (index % 10 === 0 ? 2 : 0);
    const options = {
      ordinal: index,
      reportTimeMs,
      sourceActorId: actorId,
      targetActorId: BOSS,
      abilityGameId: 700 + (index % 17),
    };
    events.push(
      index % 3 === 0
        ? castEvent({ ...options, castPhase: "COMPLETE" })
        : damageEvent({ ...options, amount: 100 + (index % 7) }),
    );
  }
  return events;
}

function heapMb(): number {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

describe("LOCAL NODE MEASUREMENT: CombatState construction scaling", () => {
  it("reports the cost of one state and of twenty sequential states", () => {
    const events = syntheticEvents();
    const core = syntheticFightCore({
      events,
      startTimeMs: FIGHT_START,
      endTimeMs: FIGHT_END,
      actors: actorCatalog(),
      friendlyPlayers: RAIDERS,
      talentImport: { actorId: RAIDERS[0] ?? 1, code: null },
    });

    // Warm the JIT so the first measured state is not paying compilation for
    // all nineteen that follow.
    createCombatState(focusedFightFor(core, RAIDERS[0] ?? 1, "PLAYER_CONTEXT"));

    const oneStart = performance.now();
    const single = createCombatState(focusedFightFor(core, RAIDERS[0] ?? 1, "PLAYER_CONTEXT"));
    const oneMs = performance.now() - oneStart;
    expect(single.fight.events).toHaveLength(EVENT_COUNT);

    // SEQUENTIAL, AND EACH RELEASED. This is the shape M7 must actually use:
    // one state live at a time, discarded before the next player. Holding all
    // twenty at once is the memory hazard, and it is not what is measured here
    // because it is not what is recommended.
    const perPlayerMs: number[] = [];
    const allStart = performance.now();
    for (const raider of RAIDERS) {
      const start = performance.now();
      const state = createCombatState(focusedFightFor(core, raider, "PLAYER_CONTEXT"));
      // One cheap query per player, so construction cannot be optimised away.
      expect(state.positionsBySourceActor(raider).length).toBeGreaterThan(0);
      perPlayerMs.push(performance.now() - start);
    }
    const allMs = performance.now() - allStart;

    const first = perPlayerMs[0] ?? 0;
    const last = perPlayerMs[perPlayerMs.length - 1] ?? 0;

    // THE HAZARD CASE, measured because it is the one worth knowing: what does
    // it cost to hold every player's state at once? The recommended shape does
    // NOT do this, and this number is the reason.
    //
    // Heap readings without a forced collection are noisy — Node may collect
    // mid-window and report a negative delta — so this is taken as a single
    // before/after around a retained array and reported as approximate. It is a
    // signal about ORDER OF MAGNITUDE, not a measurement to tune against.
    const beforeAll = heapMb();
    const retained = RAIDERS.map((raider) =>
      createCombatState(focusedFightFor(core, raider, "PLAYER_CONTEXT")),
    );
    const retainedMb = heapMb() - beforeAll;
    // Keep them alive across the reading; without this the array is collectable
    // before the measurement is taken and the number describes nothing.
    expect(retained).toHaveLength(PLAYER_COUNT);
    expect(retained[PLAYER_COUNT - 1]?.fight.events).toHaveLength(EVENT_COUNT);

    // eslint-disable-next-line no-console
    console.log(
      [
        "",
        "  LOCAL NODE MEASUREMENT — not a Cloudflare production guarantee",
        "  ------------------------------------------------------------",
        `  events                       ${String(EVENT_COUNT)}`,
        `  players                      ${String(PLAYER_COUNT)}`,
        `  one CombatState              ${String(round(oneMs))} ms`,
        `  ${String(PLAYER_COUNT)} sequential states         ${String(round(allMs))} ms total`,
        `  mean per player              ${String(round(allMs / PLAYER_COUNT))} ms`,
        `  first / last player          ${String(round(first))} ms / ${String(round(last))} ms`,
        `  ${String(PLAYER_COUNT)} states held at once     ~${String(round(retainedMb))} MB heap delta`,
        "    (approximate: no forced GC, so a collection inside the window can",
        "     make this read low or negative. Order of magnitude only.)",
        "",
      ].join("\n"),
    );

    // The ONLY assertion, and it is about SHAPE, not speed: per-player cost must
    // not grow as players are processed. A rising curve would mean state is
    // being retained across players, which is the memory defect this design
    // depends on avoiding. Ten times the first player's cost is a deliberately
    // loose bound that a slow or noisy machine cannot trip.
    expect(last).toBeLessThan(Math.max(first * 10, 50));
  });
});

import { beforeAll, describe, expect, it } from "vitest";

import { TALENT_SELECTIONS } from "../../src/data/game/talent-selection.js";
import type { CombatState } from "../../src/engine/state/combat-state.js";
import type { AplAuthority } from "../../src/simc/apl-authority.js";
import {
  resolveProtectionApplicability,
  USE_ITEM_TOKEN,
  USE_ITEMS_TOKEN,
  type ProtectionBuildFacts,
} from "../../src/specs/paladin/protection/action-profile.js";
import { initialProtectionState } from "../../src/specs/paladin/protection/first-gcd-state.js";
import type { ProtectionPaladinAnalysis } from "../../src/specs/paladin/protection/observed-analysis.js";
import { pinnedProtectionPaladinAuthority } from "../../src/specs/paladin/protection/pinned-authority.js";
import { PROTECTION_PALADIN_REGISTRATION } from "../../src/specs/paladin/protection/registration.js";
import {
  observedTokenApplicabilityEntries,
  protectionApplicabilityBuildFacts,
  SNAPSHOT_READING_APPLICABILITY_TOKENS,
} from "../support/corpus/executors/spec-protection-paladin.js";
import { stateOfBundle } from "../support/corpus/fight.js";
import { committedCorpusFiles, loadCorpusOrThrow } from "../support/corpus/loader.js";

/**
 * M11-C4h closeout: the build facts SPEC_PROTECTION_PALADIN.OBSERVED_TOKEN_APPLICABILITY
 * hands the production applicability rules must be the production analyzer's
 * own, or the discrimination gate would rest on an unverified test-side copy.
 *
 * The production facade assembles its `ProtectionBuildFacts` privately
 * (`observed-analysis.ts`): four talent / hero-tree facts, which it also
 * exposes as `analysis.build`, and three combatant-snapshot facts (worn gear,
 * malformed gear rows, Divine Inspiration), which it does not. This proves, for
 * the committed subject in the committed control and parent bundles:
 *
 *   1. the four exposed facts the assertion uses ARE the analysis's objects;
 *   2. the snapshot facts come from the subject's ONLY combatant info — the
 *      snapshot the facade's own first-match reader must also select;
 *   3. for every pinned token except the item tokens, the applicability
 *      verdict is invariant under every value of the three snapshot facts —
 *      so it depends only on facts proven equal in (1);
 *   4. the item tokens are the ones that do read them, and the assertion
 *      refuses them.
 *
 * Together: every verdict the assertion can return is computed from the
 * production analyzer's resolved build facts.
 */

const SUBJECT = 7;
const B2 = "wcl-protection-paladin-a7r6-rotational-165s";
const HISTORY = ["wcl-protection-paladin-a7r6-rotational-45s", `${B2}.seg-45-60`];
const BUNDLES = {
  control: [
    ...HISTORY,
    `${B2}.seg-60-90.control-2074381-divine-toll`,
    `${B2}.seg-90-120`,
    `${B2}.seg-120-165`,
  ],
  parent: [...HISTORY, `${B2}.seg-60-90`, `${B2}.seg-90-120`, `${B2}.seg-120-165`],
} as const;

type Analyzed = Extract<ProtectionPaladinAnalysis, { status: "ANALYZED" }>;

async function subject(parts: readonly string[]): Promise<{
  readonly state: CombatState;
  readonly analysis: Analyzed;
  readonly facts: ProtectionBuildFacts;
  readonly authority: AplAuthority;
}> {
  const corpus = await loadCorpusOrThrow(committedCorpusFiles());
  const state = stateOfBundle(corpus, [...parts], []);
  const analysis = PROTECTION_PALADIN_REGISTRATION.analyze({
    state,
    actorId: SUBJECT,
    specId: "paladin/protection",
    targetActorId: null,
  }) as ProtectionPaladinAnalysis;
  if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
  const facts = protectionApplicabilityBuildFacts(state, SUBJECT, analysis.build);
  if (facts === null) throw new Error("no combatant info");
  const loaded = pinnedProtectionPaladinAuthority();
  if (!loaded.ok) throw new Error(loaded.reason);
  return { state, analysis, facts, authority: loaded.authority };
}

/** Every combination of the three snapshot-derived facts the rules could see. */
function snapshotVariants(facts: ProtectionBuildFacts): readonly ProtectionBuildFacts[] {
  const gears = [facts.wornGear, []];
  const malformed = [facts.malformedGearRows, [], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]];
  return gears.flatMap((wornGear) =>
    malformed.flatMap((malformedGearRows) =>
      TALENT_SELECTIONS.map((divineInspiration) => ({
        ...facts,
        wornGear,
        malformedGearRows,
        divineInspiration,
      })),
    ),
  );
}

const verdict = (facts: ProtectionBuildFacts, action: AplAuthority["actions"][number]) =>
  JSON.stringify(resolveProtectionApplicability(facts, initialProtectionState("OTHER"), action));

/** One corpus load and one real analysis per bundle: bounded like the other Protection layer tests. */
const ANALYSIS_TIMEOUT_MS = 20_000;

describe.each(Object.entries(BUNDLES))("the %s bundle", (_name, parts) => {
  let subjectPromise: ReturnType<typeof subject>;
  beforeAll(async () => {
    subjectPromise = subject(parts);
    await subjectPromise;
  }, ANALYSIS_TIMEOUT_MS);

  it("the four talent and hero-tree facts are the production analysis's own resolution objects", async () => {
    const { analysis, facts } = await subjectPromise;
    expect(facts.blessedHammer).toBe(analysis.build.blessedHammer);
    expect(facts.sentinel).toBe(analysis.build.sentinel);
    expect(facts.avengingWrath).toBe(analysis.build.avengingWrath);
    expect(facts.heroTree).toBe(analysis.build.heroTree);
  });

  it("the snapshot facts come from the subject's only combatant info, the one the facade must also read", async () => {
    const { state, facts } = await subjectPromise;
    const snapshots = state
      .positionsOfKind("COMBATANT_INFO")
      .map((position) => state.eventAt(position))
      .filter((event) => event?.kind === "COMBATANT_INFO" && event.snapshot.actorId === SUBJECT);
    expect(snapshots).toHaveLength(1);
    const only = snapshots[0];
    if (only?.kind !== "COMBATANT_INFO") throw new Error("no snapshot");
    expect(facts.wornGear).toBe(only.snapshot.gear);
    expect(facts.malformedGearRows).toBe(only.snapshot.malformedGearRows);
  });

  it("every non-item token's applicability is invariant under every value of the snapshot facts", async () => {
    const { facts, authority } = await subjectPromise;
    const variants = snapshotVariants(facts);
    expect(variants).toHaveLength(18);
    const nonItem = authority.actions.filter(
      (action) =>
        action.entryKind === "PLAYER_ACTION" &&
        !SNAPSHOT_READING_APPLICABILITY_TOKENS.includes(action.actionToken),
    );
    expect(nonItem.length).toBeGreaterThan(0);
    for (const action of nonItem) {
      const base = verdict(facts, action);
      for (const variant of variants) {
        expect(
          verdict(variant, action),
          `${action.listName}[${String(action.priorityOrdinal)}] ${action.actionToken}`,
        ).toBe(base);
      }
    }
  });

  it("the item tokens are exactly the snapshot readers — their verdict moves with the snapshot facts — and the assertion refuses them", async () => {
    const { facts, authority } = await subjectPromise;
    expect([...SNAPSHOT_READING_APPLICABILITY_TOKENS].sort()).toEqual(
      [USE_ITEM_TOKEN, USE_ITEMS_TOKEN].sort(),
    );
    const items = authority.actions.filter(
      (action) =>
        action.entryKind === "PLAYER_ACTION" &&
        SNAPSHOT_READING_APPLICABILITY_TOKENS.includes(action.actionToken),
    );
    // Not vacuous: at least one item entry's verdict does change with the snapshot facts.
    expect(
      items.some((action) =>
        snapshotVariants(facts).some((variant) => verdict(variant, action) !== verdict(facts, action)),
      ),
    ).toBe(true);
    for (const token of SNAPSHOT_READING_APPLICABILITY_TOKENS) {
      expect(observedTokenApplicabilityEntries(facts, authority, token).ok, token).toBe(false);
    }
  });

  it("the substituted Divine Toll is APPLICABLE at its only entry, whatever the snapshot facts", async () => {
    const { facts, authority } = await subjectPromise;
    for (const variant of [facts, ...snapshotVariants(facts)]) {
      expect(observedTokenApplicabilityEntries(variant, authority, "divine_toll")).toEqual({
        ok: true,
        entries: [{ listName: "default", priorityOrdinal: 6, applicability: "APPLICABLE" }],
      });
    }
  });
});

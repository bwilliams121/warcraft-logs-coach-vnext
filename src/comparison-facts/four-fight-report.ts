/**
 * The INTERNAL four-fight factual comparison (M11-G2): the subject and the
 * three G1 cohort members, side by side, for dogfooding and review only.
 *
 * Every number carries its authority and epistemic state: EXACT, AT_LEAST
 * (an uncertified capture), UNKNOWN, a Warcraft Logs-computed table amount,
 * or a raw `amount` sum (M1 NOT_YET_PROVEN). It recommends nothing, estimates
 * no difference in output, ranks no one and explains no difference: a later
 * causal layer may ask why, using these facts.
 */

import type { Proven } from "../combat-facts/coverage.js";
import type { RawFieldSum } from "../combat-facts/window-query.js";
import type { FightFacts } from "./fight-facts.js";

export interface FightPerformance {
  /** G1's ACTUAL_DPS: a Warcraft Logs total over the whole fight, per second. */
  readonly actualDps: { readonly value: number; readonly source: string } | { readonly unavailable: string };
  readonly durationMs: number;
  readonly itemLevel: number | null;
  /**
   * The G2 raid entry re-checked against the G1 figure: EQUAL within 0.01 per
   * second, or EVIDENCE_MISMATCH — never silently reconciled.
   */
  readonly g1Agreement: "EQUAL" | "EVIDENCE_MISMATCH" | "SAME_SURFACE";
}

export interface ReportedFight {
  readonly label: string;
  readonly role: "SUBJECT" | "COMPARISON";
  readonly performance: FightPerformance;
  readonly facts: FightFacts;
}

/** Rate agreement between a raid-table total and the G1 figure. */
export function g1AgreementOf(
  raidTotal: number,
  totalTimeMs: number,
  g1Dps: number,
): "EQUAL" | "EVIDENCE_MISMATCH" {
  return Math.abs(raidTotal / (totalTimeMs / 1000) - g1Dps) <= 0.01 ? "EQUAL" : "EVIDENCE_MISMATCH";
}

export function shownCount(value: Proven<number>): string {
  if (value.kind === "EXACT") return value.value.toLocaleString("en-US");
  if (value.kind === "AT_LEAST") return `≥${value.value.toLocaleString("en-US")}`;
  return `UNKNOWN (${value.reason})`;
}

export function shownRawSum(value: Proven<RawFieldSum>): string {
  if (value.kind === "EXACT")
    return `${value.value.sumOfSuppliedValues.toLocaleString("en-US")} (raw amount, M1)`;
  if (value.kind === "AT_LEAST")
    return `≥${value.value.sumOfSuppliedValues.toLocaleString("en-US")} (raw amount, M1)`;
  return `UNKNOWN (${value.reason})`;
}

const wcl = (total: number | undefined | null): string =>
  total === undefined || total === null ? "—" : `${Math.round(total).toLocaleString("en-US")} (WCL table)`;

function row(cells: readonly string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string[] {
  return [row(header), row(header.map(() => "---")), ...rows.map(row)];
}

function kindTotals(fight: ReportedFight, kind: string) {
  const children = fight.facts.subActors.children.filter((child) => child.kind === kind);
  const ids = new Set(children.map((child) => child.actorId));
  return {
    children,
    wclRaid: fight.facts.wclComputed.petsInRaidEntry
      .filter((pet) => ids.has(pet.actorId))
      .reduce((sum, pet) => sum + pet.total, 0),
    hasRaid: fight.facts.wclComputed.petsInRaidEntry.some((pet) => ids.has(pet.actorId)),
  };
}

/** The markdown dogfood report. Deterministic for the same inputs. */
export function renderFourFightReport(
  fights: readonly ReportedFight[],
  abilityNames: ReadonlyMap<number, string>,
): string {
  const name = (id: number | null) =>
    id === null ? "(none)" : `${abilityNames.get(id) ?? "?"} (${String(id)})`;
  const out: string[] = [
    "# M11-G2 four-fight factual comparison (internal)",
    "",
    "Facts only. This report states what was observed: it gives no advice, estimates no output difference, orders no player and explains no difference.",
    "Comparison event counts come from server-filtered captures with no coverage grant: `≥n` means n events were observed and more may exist.",
    "Raw `amount` sums are not damage done (M1 NOT_YET_PROVEN). Warcraft Logs table amounts are labelled `(WCL table)`.",
    "",
    "## Side by side",
    "",
  ];
  const headers = ["Fact", ...fights.map((fight) => `${fight.label} (${fight.role})`)];
  const per = (f: (fight: ReportedFight) => string) => fights.map(f);
  out.push(
    ...table(headers, [
      ["Evidence basis", ...per((fight) => fight.facts.basis.kind)],
      [
        "ACTUAL_DPS (G1, WCL total / fight seconds)",
        ...per((fight) =>
          "value" in fight.performance.actualDps
            ? `${fight.performance.actualDps.value.toFixed(2)}`
            : `UNAVAILABLE (${fight.performance.actualDps.unavailable})`,
        ),
      ],
      ["G1 ↔ G2 raid entry", ...per((fight) => fight.performance.g1Agreement)],
      ["Duration (ms)", ...per((fight) => fight.performance.durationMs.toLocaleString("en-US"))],
      [
        "Item level",
        ...per((fight) => (fight.performance.itemLevel === null ? "—" : String(fight.performance.itemLevel))),
      ],
      [
        "Raid-entry total, focus + pets",
        ...per((fight) => wcl(fight.facts.wclComputed.focusRaidEntry?.total)),
      ],
      ...["Boss", "NPC"].map((type) => [
        `Raid-entry total on ${type}-type targets`,
        ...per((fight) =>
          wcl(
            fight.facts.wclComputed.targetTypesInRaidEntry
              .filter((entry) => entry.type === type)
              .reduce((sum, entry) => sum + entry.total, 0),
          ),
        ),
      ]),
      [
        "Focus-own DamageDone leaves",
        ...per((fight) =>
          fight.facts.wclComputed.perActor === "NO_PER_ACTOR_TABLES"
            ? "— (no per-actor table)"
            : wcl(
                fight.facts.wclComputed.perActor.find((entry) => entry.actorId === fight.facts.focusActorId)
                  ?.total,
              ),
        ),
      ],
      [
        "Focus COMPLETE cast events",
        ...per((fight) => shownCount(fight.facts.focusCasts.completeEventCount)),
      ],
      ["Focus BEGIN cast events", ...per((fight) => shownCount(fight.facts.focusCasts.beginEventCount))],
      [
        "Focus damage events",
        ...per((fight) => shownCount(fight.facts.environment.focusDamage.damageEventCount)),
      ],
      [
        "Focus raw amount sum",
        ...per((fight) => shownRawSum(fight.facts.environment.focusDamage.rawAmountFieldSum)),
      ],
      [
        "Focus distinct target instances",
        ...per((fight) => shownCount(fight.facts.environment.focusDamage.distinctTargets)),
      ],
      ...[
        "WCL_BOSS_SUBTYPE",
        "WCL_ENEMY_NPC_CLASSIFIED",
        "OBSERVED_NPC_OTHER",
        "OBSERVED_PLAYER_TARGET",
        "OTHER_OBSERVED_TARGET",
      ].map((label) => [
        `Focus damage events on ${label}`,
        ...per((fight) => {
          const listHeld = fight.facts.environment.enemyNpcs.kind === "RETRIEVED";
          if (label === "WCL_ENEMY_NPC_CLASSIFIED" && !listHeld)
            return "label unavailable (enemy list not retrieved)";
          const entry = fight.facts.environment.focusDamage.byTargetLabel.items.find(
            (item) => item.label === label,
          );
          const shown =
            entry === undefined
              ? fight.facts.basis.kind === "COVERAGE_VOUCHED"
                ? "0"
                : "none observed"
              : shownCount(entry.damageEventCount);
          return label === "OBSERVED_NPC_OTHER" && !listHeld
            ? `${shown} (every non-boss NPC: list not retrieved)`
            : shown;
        }),
      ]),
      [
        "Focus damage events on non-boss NPC targets (any label)",
        ...per((fight) => {
          const items = fight.facts.environment.focusDamage.byTargetLabel.items.filter(
            (item) => item.label === "WCL_ENEMY_NPC_CLASSIFIED" || item.label === "OBSERVED_NPC_OTHER",
          );
          const total = items.reduce(
            (sum, item) => sum + (item.damageEventCount.kind === "UNKNOWN" ? 0 : item.damageEventCount.value),
            0,
          );
          if (fight.facts.basis.kind === "COVERAGE_VOUCHED") return total.toLocaleString("en-US");
          return total > 0 ? `≥${total.toLocaleString("en-US")}` : "none observed";
        }),
      ],
      [
        "Enemy-listed NPCs never observed hit by focus",
        ...per((fight) =>
          fight.facts.environment.enemyListedNotObservedHitByFocus === "ENEMY_LIST_NOT_RETRIEVED"
            ? "enemy list not retrieved"
            : `[${fight.facts.environment.enemyListedNotObservedHitByFocus.join(", ")}]`,
        ),
      ],
      ["Positive deaths (focus + owned)", ...per((fight) => String(fight.facts.environment.deaths.length))],
    ]),
  );

  // ---- Dancing Rune Weapon ----
  out.push("", "## Cooldown windows", "");
  for (const fight of fights) {
    for (const cooldown of fight.facts.cooldowns) {
      const windows = cooldown.windows.windows;
      const casts = cooldown.windows.triggerCasts.items;
      out.push(
        `### ${fight.label}: ${cooldown.windows.windowKind}`,
        "",
        `Trigger casts: ${String(casts.length)} (${casts.map((cast) => `${cast.association.kind}${"windowIndex" in cast.association ? ` #${String(cast.association.windowIndex)}` : ""}`).join(", ")}); aura windows: ${String(windows.items.length)} (${windows.claim}).`,
        "",
        ...table(
          [
            "#",
            "Start",
            "End",
            "Length (ms)",
            "Trigger",
            "Focus COMPLETE casts",
            "Focus damage events",
            "Boss / other target events",
            "Owned damage events",
            "WCL table, focus + owned",
          ],
          cooldown.windowFacts.map((facts) => {
            const window = windows.items.find((entry) => entry.index === facts.windowIndex);
            const boss = facts.focusDamage?.byTargetLabel.items.find(
              (item) => item.label === "WCL_BOSS_SUBTYPE",
            );
            const other =
              facts.focusDamage?.byTargetLabel.items.filter((item) => item.label !== "WCL_BOSS_SUBTYPE") ??
              [];
            const otherCount = other.reduce(
              (sum, item) =>
                sum + (item.damageEventCount.kind === "UNKNOWN" ? 0 : item.damageEventCount.value),
              0,
            );
            return [
              String(facts.windowIndex),
              window?.start.kind === "OBSERVED" ? String(window.start.reportTimeMs) : `UNKNOWN`,
              window?.end.kind === "OBSERVED"
                ? String(window.end.reportTimeMs)
                : `UNKNOWN (${window?.end.kind === "UNKNOWN" ? window.end.reason : ""})`,
              window?.length.kind === "OBSERVED"
                ? window.length.durationMs.toLocaleString("en-US")
                : "UNKNOWN",
              window?.trigger.kind === "CAST_AT_START"
                ? `cast ${window.trigger.offsetMs >= 0 ? "+" : ""}${String(window.trigger.offsetMs)} ms`
                : "no cast at start",
              facts.focusCasts === null ? "—" : shownCount(facts.focusCasts.completeEventCount),
              facts.focusDamage === null ? "—" : shownCount(facts.focusDamage.damageEventCount),
              facts.focusDamage === null
                ? "—"
                : `${boss === undefined ? "0" : shownCount(boss.damageEventCount)} / ${fight.facts.basis.kind === "COVERAGE_VOUCHED" ? String(otherCount) : otherCount > 0 ? `≥${String(otherCount)}` : "none observed"}`,
              facts.ownedDamage === null ? "—" : shownCount(facts.ownedDamage.damageEventCount),
              facts.wclComputed === "NO_MATCHING_WINDOW_TABLE"
                ? "—"
                : wcl(facts.wclComputed.reduce((sum, entry) => sum + entry.total, 0)),
            ];
          }),
        ),
        "",
      );
    }
  }

  // ---- Sub-actors ----
  for (const kind of ["RUNE_WEAPON", "BLOOD_BEAST", "RISEN_GHOUL"]) {
    out.push(`## ${kind}`, "");
    out.push(
      ...table(headers, [
        [
          "Owned actor ids",
          ...per(
            (fight) =>
              kindTotals(fight, kind)
                .children.map((child) => String(child.actorId))
                .join(", ") || "none",
          ),
        ],
        [
          "Instances observed",
          ...per((fight) =>
            String(
              kindTotals(fight, kind).children.reduce((sum, child) => sum + child.instances.items.length, 0),
            ),
          ),
        ],
        [
          "Summon events observed",
          ...per((fight) =>
            String(
              kindTotals(fight, kind).children.reduce((sum, child) => sum + child.summons.items.length, 0),
            ),
          ),
        ],
        ...["castCompleteEventCount"].map((key) => [
          "COMPLETE cast events",
          ...per(
            (fight) =>
              kindTotals(fight, kind)
                .children.map((child) => shownCount(child[key as "castCompleteEventCount"]))
                .join(", ") || "—",
          ),
        ]),
        [
          "Damage events",
          ...per(
            (fight) =>
              kindTotals(fight, kind)
                .children.map((child) => shownCount(child.damage.damageEventCount))
                .join(", ") || "—",
          ),
        ],
        [
          "Boss-subtype target events",
          ...per(
            (fight) =>
              kindTotals(fight, kind)
                .children.map((child) => {
                  const entry = child.damage.byTargetLabel.items.find(
                    (item) => item.label === "WCL_BOSS_SUBTYPE",
                  );
                  return entry === undefined ? "0 observed" : shownCount(entry.damageEventCount);
                })
                .join(", ") || "—",
          ),
        ],
        [
          "Distinct target instances",
          ...per(
            (fight) =>
              kindTotals(fight, kind)
                .children.map((child) => shownCount(child.damage.distinctTargets))
                .join(", ") || "—",
          ),
        ],
        [
          "Raw amount sum",
          ...per(
            (fight) =>
              kindTotals(fight, kind)
                .children.map((child) => shownRawSum(child.damage.rawAmountFieldSum))
                .join(", ") || "—",
          ),
        ],
        [
          "Raid-entry pet total",
          ...per((fight) => (kindTotals(fight, kind).hasRaid ? wcl(kindTotals(fight, kind).wclRaid) : "—")),
        ],
        [
          "Instance ↔ window association",
          ...per((fight) => {
            const tally = new Map<string, number>();
            for (const child of kindTotals(fight, kind).children) {
              for (const instance of child.instances.items) {
                tally.set(
                  instance.windowAssociation.kind,
                  (tally.get(instance.windowAssociation.kind) ?? 0) + 1,
                );
              }
            }
            return (
              [...tally]
                .sort()
                .map(([key, count]) => `${key}: ${String(count)}`)
                .join("; ") || "—"
            );
          }),
        ],
      ]),
      "",
    );
  }

  // ---- Focus casts and damage events by ability ----
  const castAbilities = [
    ...new Set(
      fights.flatMap((fight) => fight.facts.focusCasts.byAbility.items.map((item) => item.abilityGameId)),
    ),
  ].sort((a, b) => (a ?? -1) - (b ?? -1));
  out.push("## Focus COMPLETE cast events by ability", "");
  out.push(
    ...table(
      ["Ability", ...fights.map((fight) => fight.label)],
      castAbilities.map((ability) => [
        name(ability),
        ...per((fight) => {
          const entry = fight.facts.focusCasts.byAbility.items.find((item) => item.abilityGameId === ability);
          return entry === undefined
            ? fight.facts.basis.kind === "COVERAGE_VOUCHED"
              ? "0"
              : "none observed"
            : shownCount(entry.completeEventCount);
        }),
      ]),
    ),
    "",
  );
  const damageAbilities = [
    ...new Set(
      fights.flatMap((fight) =>
        fight.facts.environment.focusDamage.byAbility.items.map((item) => item.abilityGameId),
      ),
    ),
  ].sort((a, b) => (a ?? -1) - (b ?? -1));
  out.push("## Focus damage events by ability", "");
  out.push(
    ...table(
      ["Ability", ...fights.map((fight) => fight.label)],
      damageAbilities.map((ability) => [
        name(ability),
        ...per((fight) => {
          const entry = fight.facts.environment.focusDamage.byAbility.items.find(
            (item) => item.abilityGameId === ability,
          );
          return entry === undefined
            ? fight.facts.basis.kind === "COVERAGE_VOUCHED"
              ? "0"
              : "none observed"
            : shownCount(entry.damageEventCount);
        }),
      ]),
    ),
    "",
  );

  // ---- Raw hitType ----
  out.push("## Focus raw hitType distribution (no mapping; M2 unresolved)", "");
  const hitTypes = [
    ...new Set(
      fights.flatMap((fight) =>
        fight.facts.environment.focusDamage.hitTypeRaw.items.map((item) => item.hitTypeRaw),
      ),
    ),
  ].sort((a, b) => (a ?? -1) - (b ?? -1));
  out.push(
    ...table(
      ["Raw hitType", ...fights.map((fight) => fight.label)],
      hitTypes.map((hitType) => [
        String(hitType),
        ...per((fight) => {
          const entry = fight.facts.environment.focusDamage.hitTypeRaw.items.find(
            (item) => item.hitTypeRaw === hitType,
          );
          const claim = fight.facts.environment.focusDamage.hitTypeRaw.claim;
          return entry === undefined
            ? claim === "EXHAUSTIVE"
              ? "0"
              : "none observed"
            : `${claim === "EXHAUSTIVE" ? "" : "≥"}${String(entry.observedEventCount)}`;
        }),
      ]),
    ),
    "",
  );
  return `${out.join("\n")}\n`;
}

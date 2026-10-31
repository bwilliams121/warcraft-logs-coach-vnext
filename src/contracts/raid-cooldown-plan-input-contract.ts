/**
 * The public INPUT shape of an optional raid cooldown plan (M12-E).
 *
 * The MCP tool advertises this so a model can call it reliably. It is a SHAPE,
 * not a second parser: every semantic rule (tolerance must be stated, names
 * are letters only, limits, note import) is the application parser's
 * (`src/services/raid-cooldown-plan-request.ts`), which REST reaches with the
 * same body. `tests/contracts/m12e-raid-cooldown-plan-input.test.ts` pins that
 * every example valid here is accepted there.
 */

import * as z from "zod";

const plannedTime = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("PHASE_RELATIVE"),
      phase: z.string().describe('The plan\'s own phase label, as a STRING: "1", "2", "2.5".'),
      offsetMs: z.number().int().nonnegative().describe("Milliseconds after that phase starts."),
    })
    .strict(),
  z
    .object({
      kind: z.literal("FIGHT_RELATIVE"),
      offsetMs: z.number().int().nonnegative().describe("Milliseconds after the pull."),
    })
    .strict(),
]);

const common = {
  encounterId: z
    .number()
    .int()
    .positive()
    .describe("The Warcraft Logs encounter id the plan is for, e.g. 3429."),
  difficulty: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "The Warcraft Logs fight difficulty id the plan is for. A plan for another fight is not applied.",
    ),
  label: z.string().optional().describe("Optional caller label for the plan."),
};

export const RaidCooldownPlanInputSchema = z
  .discriminatedUnion("format", [
    z
      .object({
        format: z.literal("STRUCTURED"),
        ...common,
        defaultToleranceMs: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Tolerance either side of the planned time for assignments that state none."),
        assignments: z.array(
          z
            .object({
              player: z
                .object({ name: z.string(), realm: z.string().optional() })
                .strict()
                .describe("Character name, and realm when the name alone is not unique in the fight."),
              abilityId: z.number().int().positive().describe("Numeric spell id, e.g. 98008."),
              plannedTime,
              toleranceMs: z.number().int().nonnegative().optional(),
              bossSpellId: z.number().int().positive().optional(),
            })
            .strict(),
        ),
      })
      .strict(),
    z
      .object({
        format: z.literal("TIMELINE_NOTE"),
        ...common,
        defaultToleranceMs: z
          .number()
          .int()
          .nonnegative()
          .describe("Required: the note format states no tolerance, and countdown is not one."),
        text: z.string().describe("The raid note, lines like time:3;ph:2;tag:Name;spellid:98008;"),
      })
      .strict(),
  ])
  .describe(
    "Optional: the raid's own cooldown assignment plan, the only authority for judging assignment execution. " +
      "Never inferred when absent.",
  );

export type RaidCooldownPlanInput = z.infer<typeof RaidCooldownPlanInputSchema>;

/**
 * Warcraft Logs preflight payload fixtures.
 *
 * See PROVENANCE.md: these are hand-authored synthetic payloads that mirror the
 * documented v2 schema, not captures from a live report. They contain no
 * credential, no access token and no real character data.
 *
 * Each builder returns a fresh mutable object, so a test can shape a variant
 * without leaking that change into the next test.
 */

export interface ActorFixture {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  subType?: unknown;
}

export interface FightFixture {
  id?: unknown;
  name?: unknown;
  encounterID?: unknown;
  difficulty?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  friendlyPlayers?: unknown;
  friendlySpecs?: unknown;
}

export const REQUEST = { reportCode: "aBcDeFgH12345678", fightId: 8, sourceId: 15 } as const;

export function validActors(): ActorFixture[] {
  return [
    { id: 15, name: "Coachtest", type: "Player", subType: "Rogue" },
    { id: 16, name: "Otherplayer", type: "Player", subType: "Paladin" },
    { id: 42, name: "Coachtest's Pet", type: "Pet", subType: "Pet" },
    { id: 99, name: "Test Boss", type: "NPC", subType: "Boss" },
  ];
}

export function validFight(): FightFixture {
  return {
    id: 8,
    name: "Test Encounter",
    encounterID: 2902,
    difficulty: 5,
    startTime: 120_000,
    endTime: 420_000,
    friendlyPlayers: [15, 16],
    friendlySpecs: ["Assassination", "Protection"],
  };
}

export interface ReportFixture {
  code?: unknown;
  revision?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  masterData?: unknown;
  fights?: unknown;
}

export function validReport(): ReportFixture {
  return {
    code: REQUEST.reportCode,
    revision: 24,
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_600_000,
    masterData: {
      logVersion: 26,
      gameVersion: 1,
      actors: validActors(),
    },
    fights: [validFight()],
  };
}

export function rateLimitData(): Record<string, unknown> {
  return { limitPerHour: 3600, pointsSpentThisHour: 12.5, pointsResetIn: 1800 };
}

/** The `data` half of a GraphQL response body. */
export function preflightData(report: ReportFixture | null = validReport()): Record<string, unknown> {
  return { rateLimitData: rateLimitData(), reportData: { report } };
}

/** A complete GraphQL success body. */
export function preflightBody(report: ReportFixture | null = validReport()): Record<string, unknown> {
  return { data: preflightData(report) };
}

/**
 * A GraphQL error body.
 *
 * The message text is deliberately generic. There is no verified
 * machine-readable code for "this report is private" in the public schema, so
 * no fixture here asserts one — inventing that contract is exactly what the
 * transport refuses to do.
 */
export function graphqlErrorBody(): Record<string, unknown> {
  return { errors: [{ message: "Simulated upstream GraphQL error." }], data: null };
}

/** Builds a report whose single fight has been modified. */
export function reportWithFight(overrides: FightFixture): ReportFixture {
  const report = validReport();
  report.fights = [{ ...validFight(), ...overrides }];
  return report;
}

/** Builds a report whose actor list has been replaced. */
export function reportWithActors(actors: readonly unknown[]): ReportFixture {
  const report = validReport();
  report.masterData = { logVersion: 26, gameVersion: 1, actors: [...actors] };
  return report;
}

/** Builds a report whose master data has been modified. */
export function reportWithMasterData(overrides: Record<string, unknown>): ReportFixture {
  const report = validReport();
  report.masterData = { logVersion: 26, gameVersion: 1, actors: validActors(), ...overrides };
  return report;
}

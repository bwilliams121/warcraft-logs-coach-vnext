/**
 * The ANALYZER AUTHORITY MODEL (M11 model registry): the one SimulationCraft
 * commit and game-data build that the public analyzers' authority was
 * extracted from — APL artifacts (src/simc/data/*.apl.json) and the analyzer
 * data artifacts in src/data/game.
 *
 * It is NOT a simulation model and selects none. Simulation models live in the
 * simulation-model registry (src/simulation/model-registry.ts); neither module
 * imports the other, and moving one never moves the other.
 * tests/contracts/m11-simulation-model-registry.test.ts holds every analyzer
 * authority artifact to this pin and keeps the two concepts apart.
 *
 * Changing this pin is a public-authority migration (re-extraction, review,
 * corpus and public-digest consequences), never a side effect of promoting a
 * simulation model.
 */

export const ANALYZER_AUTHORITY_MODEL = {
  role: "ANALYZER_AUTHORITY",
  simcCommit: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  gameDataBuild: "12.1.0.69587",
} as const;

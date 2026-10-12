/**
 * Sanitizes the M11-G1 capture (observed performance + elite cohort) into
 * committed evidence-archive artifacts. Deterministic; plain `node`.
 *
 *     node scripts/corpus/sanitize-g1-cohort.mjs <capture-dir> <subject-context.json> <out-dir>
 *
 * POLICY (the existing selection-frame / payload policy, applied to G1):
 *
 *   - The SUBJECT report keeps its code in clear (as every committed subject
 *     does). Its players become `Actor<report actor id>`.
 *   - Every THIRD-PARTY identity is pseudonymized consistently across all G1
 *     artifacts: a player NAME becomes `Player<nnnn>`, a report code becomes
 *     `COHORT<nnn>AAAAAAA`, numbered in SHA-256 order of the real value so
 *     neither retrieval order nor the real string leaks into the number.
 *     Servers become null (the existing rankings rule), so identity resolution
 *     in committed evidence is NAME_ONLY over pseudonyms. Pseudonyms are keyed
 *     by NAME ALONE because the two surfaces spell realms differently (rankings
 *     "Tarren Mill" / masterData "TarrenMill", observed in this capture):
 *     keying by name + server would split one player into two pseudonyms,
 *     while the live resolution already fell back to the unique name-only
 *     match for exactly those rows.
 *   - Dropped outright: guilds, character ids, GUIDs, icons, item and enchant
 *     names, rate-limit data, parse percentiles and ranks, and every NPC actor.
 *   - Kept: exactly the fields the G1 decoders read, plus the selected members'
 *     gear ids, enchant ids, gem ids, bonus ids and talent tree.
 *
 * Refuses to write output containing a credential-shaped value or any real
 * third-party name, server or report code it saw in the input.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const G1_SANITIZER_REVISION = "sanitize-g1-cohort-1";
const SUBJECT_CODE = "b1PmaKrd6CDfzngc";
const FORBIDDEN = ["client_secret", "access_token", "authorization", "bearer ", "wcl_client_secret"];

const sha = (text) => createHash("sha256").update(text).digest("hex");
const ordinalMap = (values, format) => {
  const sorted = [...new Set(values)].sort((a, b) => (sha(a) < sha(b) ? -1 : sha(a) > sha(b) ? 1 : 0));
  return new Map(sorted.map((value, index) => [value, format(index + 1)]));
};
const playerKey = (name, _server) => name;

/**
 * The ONE third-party pseudonym scheme (M11-G1), exported so M11-G2 reuses it
 * rather than inventing a second: every third-party player name seen in the
 * G1 capture -> Player<nnnn>, every third-party report code -> COHORT<nnn>AAAAAAA,
 * both numbered in SHA-256 order of the distinct inputs. Keyed by name alone
 * (the surfaces spell realms differently).
 */
export function g1PseudonymTables(capture) {
  const { pages, candidates } = capture;
  const thirdPartyPlayers = [];
  const thirdPartyCodes = [];
  for (const page of pages) {
    for (const row of page.data.worldData.encounter.characterRankings.rankings) {
      if (row.report.code !== SUBJECT_CODE) {
        thirdPartyPlayers.push(playerKey(row.name, row.server?.name ?? null));
        thirdPartyCodes.push(row.report.code);
      }
    }
  }
  for (const candidate of candidates) {
    const report = candidate.data.reportData.report;
    thirdPartyCodes.push(report.code);
    for (const actor of report.masterData.actors)
      if (actor.type === "Player") thirdPartyPlayers.push(playerKey(actor.name, actor.server || null));
    for (const fight of report.rankings.data) {
      for (const role of Object.values(fight.roles))
        for (const c of role.characters) thirdPartyPlayers.push(playerKey(c.name, c.server?.name ?? null));
    }
  }
  const players = ordinalMap(thirdPartyPlayers, (n) => `Player${String(n).padStart(4, "0")}`);
  const codes = ordinalMap(thirdPartyCodes, (n) => `COHORT${String(n).padStart(3, "0")}AAAAAAA`);
  return { players, codes };
}

export function sanitizeG1(capture, subjectContext) {
  const { subject, pages, candidates } = capture;
  const subjectActors = subjectContext.reportData.report.masterData.actors.filter((a) => a.type === "Player");
  // The M8-F rule: a unique server-exact match first; more than one is
  // ambiguous; otherwise a unique name-only match (the surfaces spell realms
  // differently: rankings "Tarren Mill", masterData "TarrenMill").
  const subjectActorId = (name, server) => {
    const exact = subjectActors.filter((a) => a.name === name && server !== null && a.server === server);
    if (exact.length === 1) return exact[0].id;
    if (exact.length > 1) return null;
    const byName = subjectActors.filter((a) => a.name === name);
    return byName.length === 1 ? byName[0].id : null;
  };

  const { players, codes } = g1PseudonymTables(capture);
  const pseudoPlayer = (name, server) => players.get(playerKey(name, server)) ?? "UnresolvedPlayer";
  const pseudoCode = (code) => (code === SUBJECT_CODE ? code : (codes.get(code) ?? "COHORT000AAAAAAA"));

  const rankingCharacters = (fight, nameOf) => ({
    fightID: fight.fightID,
    partition: fight.partition,
    encounter: { id: fight.encounter?.id ?? null },
    difficulty: fight.difficulty,
    kill: fight.kill,
    duration: fight.duration,
    bracketData: fight.bracketData,
    bracket: fight.bracket,
    roles: Object.fromEntries(
      Object.entries(fight.roles).map(([role, value]) => [
        role,
        {
          characters: value.characters.map((c) => ({
            name: nameOf(c),
            server: null,
            class: c.class,
            spec: c.spec,
            amount: c.amount,
            bracketData: c.bracketData,
            bracket: c.bracket,
          })),
        },
      ]),
    ),
  });

  // ---- subject performance surfaces ----
  const s = subject.reportData.report;
  const subjectOut = {
    reportData: {
      report: {
        code: s.code,
        revision: s.revision,
        fights: s.fights,
        rankings: {
          data: s.rankings.data.map((fight) =>
            rankingCharacters(fight, (c) => {
              const id = subjectActorId(c.name, c.server?.name ?? null);
              return id === null ? "UnresolvedActor" : `Actor${String(id)}`;
            }),
          ),
        },
        damageDone: {
          data: {
            totalTime: s.damageDone.data.totalTime,
            logVersion: s.damageDone.data.logVersion,
            gameVersion: s.damageDone.data.gameVersion,
            entries: s.damageDone.data.entries.map((e) => ({
              name: `Actor${String(e.id)}`,
              id: e.id,
              type: e.type,
              itemLevel: e.itemLevel,
              total: e.total,
              activeTime: e.activeTime,
              pets: (e.pets ?? []).map((p) => ({ id: p.id, type: p.type, total: p.total })),
              targets: (e.targets ?? []).map((t) => ({ type: t.type, total: t.total })),
            })),
          },
        },
      },
    },
  };

  // ---- ranking pages ----
  const pagesOut = pages.map((page) => {
    const cr = page.data.worldData.encounter.characterRankings;
    return {
      bracket: page.bracket,
      data: {
        worldData: {
          encounter: {
            characterRankings: {
              page: cr.page,
              hasMorePages: cr.hasMorePages,
              count: cr.count,
              rankings: cr.rankings.map((row) => ({
                name:
                  row.report.code === SUBJECT_CODE
                    ? "SubjectRow"
                    : pseudoPlayer(row.name, row.server?.name ?? null),
                class: row.class,
                spec: row.spec,
                amount: row.amount,
                hardModeLevel: row.hardModeLevel,
                duration: row.duration,
                startTime: row.startTime,
                report: {
                  code: pseudoCode(row.report.code),
                  fightID: row.report.fightID,
                  startTime: row.report.startTime,
                },
                server: null,
                bracketData: row.bracketData,
                ...(row.hidden === true ? { hidden: true } : {}),
              })),
            },
          },
        },
      },
    };
  });

  // ---- candidate contexts ----
  const candidatesOut = candidates.map((candidate) => {
    const report = candidate.data.reportData.report;
    const playerActors = report.masterData.actors.filter((a) => a.type === "Player");
    const nameOfActor = new Map(playerActors.map((a) => [a.id, pseudoPlayer(a.name, a.server || null)]));
    const details = report.playerDetails.data.playerDetails;
    return {
      ordinal: candidate.ordinal,
      data: {
        reportData: {
          report: {
            code: pseudoCode(report.code),
            fights: report.fights,
            masterData: {
              actors: playerActors.map((a) => ({
                id: a.id,
                name: nameOfActor.get(a.id),
                server: null,
                type: a.type,
                subType: a.subType,
              })),
            },
            rankings: {
              data: report.rankings.data.map((fight) =>
                rankingCharacters(fight, (c) => pseudoPlayer(c.name, c.server?.name ?? null)),
              ),
            },
            playerDetails: {
              data: {
                playerDetails: Object.fromEntries(
                  Object.entries(details).map(([role, list]) => [
                    role,
                    list.map((p) => ({
                      id: p.id,
                      type: p.type,
                      specs: p.specs,
                      ...(p.id === candidate.memberActorId && p.combatantInfo
                        ? {
                            combatantInfo: {
                              specIDs: p.combatantInfo.specIDs,
                              gear: p.combatantInfo.gear.map((g) => ({
                                id: g.id,
                                slot: g.slot,
                                itemLevel: g.itemLevel,
                                ...(g.quality === undefined ? {} : { quality: g.quality }),
                                // Key presence is meaning (the shared gear adapter reads an absent
                                // key as KNOWN_NONE), so each enchant key is copied only when present.
                                ...(g.permanentEnchant === undefined
                                  ? {}
                                  : { permanentEnchant: g.permanentEnchant }),
                                ...(g.temporaryEnchant === undefined
                                  ? {}
                                  : { temporaryEnchant: g.temporaryEnchant }),
                                bonusIDs: g.bonusIDs,
                                ...(g.gems === undefined
                                  ? {}
                                  : {
                                      gems: g.gems.map((gem) => ({ id: gem.id, itemLevel: gem.itemLevel })),
                                    }),
                                ...(g.setID === undefined ? {} : { setID: g.setID }),
                              })),
                              talentTree: p.combatantInfo.talentTree.map((t) => ({
                                id: t.id,
                                rank: t.rank,
                                nodeID: t.nodeID,
                              })),
                            },
                          }
                        : {}),
                    })),
                  ]),
                ),
              },
            },
            deaths: {
              data: {
                entries: report.deaths.data.entries.map((d) => ({
                  id: d.id,
                  type: d.type,
                  timestamp: d.timestamp,
                })),
              },
            },
          },
        },
      },
    };
  });

  // Every real identity seen anywhere in the input is a needle the output
  // must not contain: third-party names, the subject report's own player
  // names, every server spelling, every third-party report code.
  const servers = new Set();
  for (const page of pages) {
    for (const row of page.data.worldData.encounter.characterRankings.rankings)
      if (row.server?.name) servers.add(row.server.name);
  }
  for (const candidate of candidates) {
    for (const actor of candidate.data.reportData.report.masterData.actors)
      if (actor.type === "Player" && actor.server) servers.add(actor.server);
  }
  for (const fight of subject.reportData.report.rankings.data) {
    for (const role of Object.values(fight.roles))
      for (const c of role.characters) if (c.server?.name) servers.add(c.server.name);
  }
  for (const actor of subjectActors) if (actor.server) servers.add(actor.server);
  return {
    subject: subjectOut,
    pages: pagesOut,
    candidates: candidatesOut,
    leakNeedles: {
      players: [...players.keys(), ...subjectActors.map((actor) => actor.name)],
      servers: [...servers],
      codes: [...codes.keys()],
    },
  };
}

function assertClean(label, text, needles) {
  const lowered = text.toLowerCase();
  const credential = FORBIDDEN.find((needle) => lowered.includes(needle));
  if (credential !== undefined)
    throw new Error(`refusing to write ${label}: credential-shaped value (${credential})`);
  for (const name of needles.players) {
    if (name.length > 2 && text.includes(JSON.stringify(name))) {
      throw new Error(`refusing to write ${label}: a real player name survived`);
    }
  }
  for (const server of needles.servers) {
    if (text.includes(JSON.stringify(server)))
      throw new Error(`refusing to write ${label}: a real server survived`);
  }
  for (const code of needles.codes) {
    if (text.includes(code))
      throw new Error(`refusing to write ${label}: a real third-party report code survived`);
  }
}

/** The G1 raw capture (gitignored), assembled exactly as `main` assembles it. */
export function readG1Capture(captureDir) {
  const read = (name) => JSON.parse(readFileSync(join(captureDir, name), "utf8"));
  const outcomes = read("stage-c-outcomes.json").outcomes;
  const replay = read("replay.json");
  return {
    subject: read("r01-subject.json"),
    pages: [18, 19, 20].map((bracket) => ({
      bracket,
      data: read(`r-rankings-bracket-${String(bracket)}.json`),
    })),
    candidates: outcomes.map((outcome, index) => ({
      ordinal: index + 1,
      data: read(`r-candidate-${String(outcome.rank).padStart(2, "0")}.json`),
      memberActorId:
        replay.cohort.members.find(
          (m) => m.comparisonRef.reportCode === outcome.code && m.comparisonRef.fightId === outcome.fight,
        )?.comparisonRef.actorId ?? null,
    })),
  };
}

function main() {
  const [captureDir, subjectContextPath, outDir] = process.argv.slice(2);
  if (captureDir === undefined || subjectContextPath === undefined || outDir === undefined) {
    console.error(
      "usage: node scripts/corpus/sanitize-g1-cohort.mjs <capture-dir> <subject-context.json> <out-dir>",
    );
    process.exit(1);
  }
  const capture = readG1Capture(captureDir);
  const out = sanitizeG1(capture, JSON.parse(readFileSync(subjectContextPath, "utf8")));
  mkdirSync(outDir, { recursive: true });
  const write = (file, value) => {
    const text = `${JSON.stringify(value, null, 2)}\n`;
    assertClean(file, text, out.leakNeedles);
    writeFileSync(join(outDir, file), text, "utf8");
    console.log(`wrote ${file} (${String(Buffer.byteLength(text))} bytes) with ${G1_SANITIZER_REVISION}`);
  };
  write("wcl-g1-subject-performance-b1pm-fight-48.json", out.subject);
  for (const page of out.pages)
    write(`wcl-g1-cohort-rankings-3455-5-blood-bracket-${String(page.bracket)}.json`, page.data);
  for (const candidate of out.candidates)
    write(`wcl-g1-cohort-candidate-${String(candidate.ordinal)}.json`, candidate.data);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

/**
 * M13-A: the Augmentation capture sanitizer's rules
 * (scripts/corpus/sanitize-m13a-augmentation.mjs).
 *
 * - The merge of the three server-filtered streams is by timestamp, and ties
 *   keep a recorded, deterministic order (stream, then in-stream) rather than
 *   pretending to be Warcraft Logs' order.
 * - The context keeps ids, types, classes and petOwner, and loses the report
 *   code, every name, every server and every player gameID.
 * - The committed context is exactly that transformation's shape.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  M13A_PSEUDONYM_CODE,
  mergeStreams,
  sanitizeContext,
} from "../../scripts/corpus/sanitize-m13a-augmentation.mjs";

describe("the M13-A sanitizer", () => {
  it("merges by timestamp; equal timestamps keep stream order, then each stream's own order", () => {
    const casts = [
      { timestamp: 10, id: "c1" },
      { timestamp: 20, id: "c2" },
    ];
    const auras = [
      { timestamp: 10, id: "a1" },
      { timestamp: 15, id: "a2" },
      { timestamp: 20, id: "a3" },
    ];
    const deaths = [{ timestamp: 20, id: "d1" }];
    expect(mergeStreams([casts, auras, deaths]).map((event) => event.id)).toEqual([
      "c1",
      "a1",
      "a2",
      "c2",
      "a3",
      "d1",
    ]);
  });

  it("pseudonymizes the report code and every name, and drops servers and player gameIDs, keeping identity structure", () => {
    const raw = {
      reportData: {
        report: {
          code: "RealCode12345678",
          masterData: {
            actors: [
              {
                id: 1,
                gameID: 256696733,
                name: "RealName",
                server: "RealServer",
                type: "Player",
                subType: "Evoker",
                petOwner: null,
              },
              {
                id: 46,
                gameID: 199531,
                name: "Future Self",
                server: null,
                type: "Pet",
                subType: "Pet",
                petOwner: 1,
              },
            ],
          },
        },
      },
    };
    const sanitized = sanitizeContext(raw) as typeof raw;
    const text = JSON.stringify(sanitized);
    expect(text).not.toMatch(/RealCode|RealName|RealServer|256696733/);
    expect(sanitized.reportData.report.code).toBe(M13A_PSEUDONYM_CODE);
    expect(sanitized.reportData.report.masterData.actors).toEqual([
      {
        id: 1,
        gameID: null,
        name: "Actor1",
        server: null,
        type: "Player",
        subType: "Evoker",
        petOwner: null,
      },
      { id: 46, gameID: 199531, name: "Actor46", server: null, type: "Pet", subType: "Pet", petOwner: 1 },
    ]);
  });

  it("the committed context carries only pseudonymous identities", () => {
    const committed = JSON.parse(
      readFileSync("tests/evidence/artifacts/wcl-graphql/wcl-m13a-fight-context-aug1-fight-1.json", "utf8"),
    ) as {
      reportData: {
        report: {
          code: string;
          masterData: {
            actors: {
              id: number;
              name: string;
              server: string | null;
              type: string;
              gameID: number | null;
            }[];
          };
        };
      };
    };
    const report = committed.reportData.report;
    expect(report.code).toBe(M13A_PSEUDONYM_CODE);
    for (const actor of report.masterData.actors) {
      expect(actor.name).toBe(`Actor${String(actor.id)}`);
      expect(actor.server).toBeNull();
      if (actor.type === "Player") expect(actor.gameID).toBeNull();
    }
  });
});

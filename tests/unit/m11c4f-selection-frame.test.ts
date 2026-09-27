import { describe, expect, it } from "vitest";

import { committedEvidenceArchiveFiles } from "../support/corpus/evidence-archive.js";
import { sha256Hex } from "../support/corpus/loader.js";

/**
 * M11-C4f: the committed selection frame for the NEUTRAL second Brewmaster
 * subject (tests/evidence/selection-frames/brewmaster-second-subject.json).
 *
 * The frame is audit evidence for a rule fixed BEFORE any analyzer ran: a
 * fixed population, a fixed order, a walk that stops at the first eligible
 * subject. Everything this file checks is recomputed from the frame itself —
 * never taken from its own summary fields — and linked to the archive's
 * provenance. Under the approved privacy policy, unselected candidates carry
 * SHA-256(report code) only.
 */

const FRAME: Record<string, string> = import.meta.glob(
  "../evidence/selection-frames/brewmaster-second-subject.json",
  { eager: true, query: "?raw", import: "default" },
);

interface Row {
  readonly order: number;
  readonly rank: number;
  readonly fightID: number;
  readonly startTime: number;
  readonly duration: number;
  readonly size: number;
  readonly codeSha256: string;
}
interface Walked {
  readonly order: number;
  readonly rank: number;
  readonly fightID: number;
  readonly codeSha256: string;
  readonly eligibility: {
    readonly fightPresent: boolean;
    readonly encounterID: number | null;
    readonly difficulty: number | null;
    readonly gameVersion: number | null;
    readonly logVersion: number | null;
    readonly durationMs: number | null;
  } | null;
  readonly brewmasterActorIds: readonly number[];
  readonly heroTrees: Readonly<Record<string, string>> | null;
  readonly failure: string | null;
  readonly selected: boolean;
}
interface Frame {
  readonly population: {
    readonly rows: number;
    readonly canonicalDigest: string;
    readonly hashedCanonicalDigest: string;
  };
  readonly excluded: readonly (Row & { readonly reportCode: string; readonly reason: string })[];
  readonly order: { readonly startTimeTies: number };
  readonly candidates: readonly Row[];
  readonly eligibility: {
    readonly caps: { readonly fightContextRequests: number; readonly heroTreePageRequests: number };
  };
  readonly walk: readonly Walked[];
  readonly selected: {
    readonly order: number;
    readonly reportCode: string;
    readonly codeSha256: string;
    readonly fightId: number;
    readonly actorId: number;
    readonly heroTree: string;
    readonly reportRevision: number;
    readonly evidenceWindow: { readonly fromReportTimeMs: number; readonly toReportTimeMs: number };
  };
  readonly requests: { readonly fightContext: number; readonly heroTreePage: number };
}

const TEXT = FRAME["../evidence/selection-frames/brewmaster-second-subject.json"] ?? "";
const frame = JSON.parse(TEXT) as Frame;
const hash = (text: string): Promise<string> => sha256Hex(new TextEncoder().encode(text));
const FAILURES = [
  "REPORT_UNREACHABLE",
  "RANKED_FIGHT_ABSENT",
  "ENCOUNTER_MISMATCH",
  "DIFFICULTY_MISMATCH",
  "GAME_VERSION_MISMATCH",
  "LOG_VERSION_MISMATCH",
  "DURATION_BELOW_165000",
  "NO_BREWMASTER_IN_FIGHT",
  "NO_SHADO_PAN_BREWMASTER",
];

describe("the fixed population", () => {
  it("is 100 distinct rows: 99 ordered candidates and subject 1, excluded", () => {
    expect(TEXT.length).toBeGreaterThan(0);
    expect(frame.population.rows).toBe(100);
    expect(frame.candidates).toHaveLength(99);
    expect(frame.excluded).toHaveLength(1);
    const keys = [...frame.candidates, ...frame.excluded].map(
      (row) => `${row.codeSha256}:${String(row.fightID)}`,
    );
    expect(new Set(keys).size).toBe(100);
    expect(frame.population.canonicalDigest).toBe(
      "6b5fd2af0bc3575e00ca35e0d52dacaa4c748e6183e4851604ef6bbf93d9a50c",
    );
  });

  it("recomputes its hashed canonical digest from its own rows", async () => {
    const lines = [...frame.candidates, ...frame.excluded]
      .map((row) => `${row.codeSha256}:${String(row.fightID)}:${String(row.startTime)}`)
      .sort()
      .join("\n");
    expect(await hash(lines)).toBe(frame.population.hashedCanonicalDigest);
  });

  it("excludes exactly subject 1, whose clear code is already committed provenance", async () => {
    const [excluded] = frame.excluded;
    expect(excluded?.reportCode).toBe("gtKb2xHn87pNcFfW");
    expect(excluded?.rank).toBe(1);
    expect(excluded?.fightID).toBe(22);
    expect(excluded?.codeSha256).toBe(await hash("gtKb2xHn87pNcFfW"));
  });
});

describe("the fixed order", () => {
  it("is fight start time ascending, numbered 1..99, with no ties to break", () => {
    expect(frame.candidates.map((row) => row.order)).toEqual(frame.candidates.map((_, index) => index + 1));
    for (let index = 1; index < frame.candidates.length; index += 1) {
      const previous = frame.candidates[index - 1];
      const current = frame.candidates[index];
      expect(current !== undefined && previous !== undefined && current.startTime > previous.startTime).toBe(
        true,
      );
    }
    expect(frame.order.startTimeTies).toBe(0);
    // Rank is carried, never used: the order is not the ranking order.
    expect(frame.candidates.map((row) => row.rank)).not.toEqual(
      [...frame.candidates].map((row) => row.rank).sort((a, b) => a - b),
    );
  });
});

describe("the walk", () => {
  it("is exactly the first N candidates in order, within the caps", () => {
    expect(frame.walk.length).toBeGreaterThan(0);
    expect(frame.walk.length).toBeLessThanOrEqual(frame.eligibility.caps.fightContextRequests);
    expect(frame.requests.fightContext).toBe(frame.walk.length);
    expect(frame.requests.heroTreePage).toBeLessThanOrEqual(frame.eligibility.caps.heroTreePageRequests);
    frame.walk.forEach((walked, index) => {
      const candidate = frame.candidates[index];
      expect(walked.order).toBe(index + 1);
      expect(walked.codeSha256).toBe(candidate?.codeSha256);
      expect(walked.fightID).toBe(candidate?.fightID);
      expect(walked.rank).toBe(candidate?.rank);
    });
  });

  it("names a fixed-rule failure for every candidate before the winner, and only the last is selected", () => {
    const last = frame.walk[frame.walk.length - 1];
    for (const walked of frame.walk.slice(0, -1)) {
      expect(walked.selected, String(walked.order)).toBe(false);
      expect(FAILURES, String(walked.order)).toContain(walked.failure);
      if (walked.failure === "NO_BREWMASTER_IN_FIGHT") expect(walked.brewmasterActorIds).toEqual([]);
    }
    expect(last?.selected).toBe(true);
    expect(last?.failure).toBeNull();
  });

  it("the winner meets every objective criterion and its lowest Shado-Pan Brewmaster is the subject", () => {
    const last = frame.walk[frame.walk.length - 1];
    const facts = last?.eligibility;
    expect(facts).toMatchObject({
      fightPresent: true,
      encounterID: 3420,
      difficulty: 4,
      gameVersion: 1,
      logVersion: 17,
    });
    expect(facts?.durationMs ?? 0).toBeGreaterThanOrEqual(165_000);
    const shadoPan = (last?.brewmasterActorIds ?? []).filter(
      (id) => last?.heroTrees?.[String(id)] === "shadopan",
    );
    expect(shadoPan.length).toBeGreaterThan(0);
    expect(frame.selected.actorId).toBe(Math.min(...shadoPan));
    expect(frame.selected.heroTree).toBe("shadopan");
    expect(frame.selected.order).toBe(last?.order);
  });
});

describe("the selected subject is the archive's evidence subject", () => {
  it("its clear code hashes to its row, and the archive's segment and context descend from it", async () => {
    expect(await hash(frame.selected.reportCode)).toBe(frame.selected.codeSha256);
    const manifest = JSON.parse(committedEvidenceArchiveFiles()["manifest.json"] ?? "{}") as {
      artifacts: {
        artifactId: string;
        provenance: {
          source: {
            reportCode: string;
            fightId: number;
            reportRevision: number;
            sourceActorId: number;
            query: { kind?: string; startTimeMs?: number; endTimeMs?: number };
          } | null;
        };
      }[];
    };
    const segment = manifest.artifacts.find(
      (entry) => entry.artifactId === "wcl-brewmaster-monk-rxaf-rotational-165s.seg-20-165",
    );
    const context = manifest.artifacts.find(
      (entry) => entry.artifactId === "wcl-fight-context-rxaf-fight-13",
    );
    for (const entry of [segment, context]) {
      expect(entry?.provenance.source?.reportCode).toBe(frame.selected.reportCode);
      expect(entry?.provenance.source?.fightId).toBe(frame.selected.fightId);
      expect(entry?.provenance.source?.sourceActorId).toBe(frame.selected.actorId);
      expect(entry?.provenance.source?.reportRevision).toBe(frame.selected.reportRevision);
    }
    expect(segment?.provenance.source?.query.startTimeMs).toBe(
      frame.selected.evidenceWindow.fromReportTimeMs,
    );
    expect(segment?.provenance.source?.query.endTimeMs).toBe(frame.selected.evidenceWindow.toReportTimeMs);
    expect(
      frame.selected.evidenceWindow.toReportTimeMs - frame.selected.evidenceWindow.fromReportTimeMs,
    ).toBe(165_000);
  });
});

describe("privacy", () => {
  it("carries clear report codes for subject 1 and the selected subject only", () => {
    const clear = [...TEXT.matchAll(/"reportCode":\s*"([^"]+)"/g)].map((match) => match[1]);
    expect([...new Set(clear)].sort()).toEqual(["gtKb2xHn87pNcFfW", "rXAfw9t1q8YpmkKD"]);
    // No name, server, guild, amount or bracket field anywhere.
    for (const field of ['"name"', '"server"', '"guild"', '"amount"', '"bracketData"']) {
      expect(TEXT, field).not.toContain(field);
    }
    // Every unselected row's identity is a 64-hex digest.
    for (const row of frame.candidates) expect(row.codeSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

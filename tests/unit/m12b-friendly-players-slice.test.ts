/**
 * M12-B: the friendly-players actor slice, from the slicer to the loader.
 *
 * - The slicer derives the roster from a committed fight context and refuses
 *   to guess: a missing or duplicated fight, an empty roster, a duplicate id,
 *   or an id the master data does not list exactly once as a Player.
 * - The committed raid damage segments are exactly what the predicate keeps:
 *   re-cut from the committed bytes themselves, to the byte.
 * - The loader never takes the declaration on trust: a roster, grant scope,
 *   category or event that disagrees with the catalog or the bytes is
 *   ACTOR_SLICE_INVALID.
 */

import { describe, expect, it } from "vitest";

import { deriveFriendlyPlayerRoster, ownedPetSlice, serializeSlice } from "../../scripts/sanitize-probe.mjs";
import { committedEvidenceArchiveFiles } from "../support/corpus/evidence-archive.js";
import {
  canonicalBytesOf,
  committedCorpusFiles,
  sha256Hex,
  validateEvidenceArchive,
} from "../support/corpus/loader.js";

type Json = Record<string, unknown>;

const SEGMENTS = [
  "wcl-b1pm-fight-48-friendly-players.seg-69500-72500",
  "wcl-b1pm-fight-48-friendly-players.seg-72500-75500",
  "wcl-b1pm-fight-48-friendly-players.seg-75500-77000",
];
const CONTEXT_PATH = "artifacts/wcl-graphql/wcl-fight-context-b1pm-fight-48.json";
const ROSTER = [1, 2, 3, 5, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 121, 122, 164, 170];
const pathOf = (artifactId: string) => `artifacts/wcl-events/${artifactId}.json`;

function context(): Json {
  return JSON.parse(committedEvidenceArchiveFiles()[CONTEXT_PATH] ?? "null") as Json;
}

function report(json: Json): { fights: Json[]; masterData: { actors: Json[] } } {
  return (json["reportData"] as Json)["report"] as { fights: Json[]; masterData: { actors: Json[] } };
}

describe("the slicer derives the roster from the catalog, and refuses to guess", () => {
  it("derives fight 48's twenty friendly players, ascending", () => {
    expect(deriveFriendlyPlayerRoster(context(), 48)).toEqual({ ok: true, fightId: 48, roster: ROSTER });
  });

  it("refuses a fight the catalog does not list once", () => {
    expect(deriveFriendlyPlayerRoster(context(), 47).ok).toBe(false);
    const twice = context();
    report(twice).fights.push({ ...report(twice).fights[0] });
    expect(deriveFriendlyPlayerRoster(twice, 48)).toMatchObject({
      ok: false,
      error: expect.stringContaining("2 times"),
    });
  });

  it("refuses an empty roster, a duplicate id, and an id that is not one Player", () => {
    const empty = context();
    (report(empty).fights[0] as Json)["friendlyPlayers"] = [];
    expect(deriveFriendlyPlayerRoster(empty, 48).ok).toBe(false);

    const duplicate = context();
    (report(duplicate).fights[0] as Json)["friendlyPlayers"] = [...ROSTER, 5];
    expect(deriveFriendlyPlayerRoster(duplicate, 48)).toMatchObject({
      ok: false,
      error: expect.stringContaining("more than once"),
    });

    const pet = context();
    const npc = report(pet).masterData.actors.find((actor) => actor["type"] !== "Player");
    (report(pet).fights[0] as Json)["friendlyPlayers"] = [...ROSTER, npc?.["id"]];
    expect(deriveFriendlyPlayerRoster(pet, 48)).toMatchObject({
      ok: false,
      error: expect.stringContaining("not a Player"),
    });

    const unknown = context();
    (report(unknown).fights[0] as Json)["friendlyPlayers"] = [...ROSTER, 999_999];
    expect(deriveFriendlyPlayerRoster(unknown, 48)).toMatchObject({
      ok: false,
      error: expect.stringContaining("0 times"),
    });
  });
});

describe("the committed segments are exactly the predicate", () => {
  it("re-cuts each segment from the committed bytes, to the byte", () => {
    const files = committedEvidenceArchiveFiles();
    const all = SEGMENTS.flatMap((id) => JSON.parse(files[pathOf(id)] ?? "[]") as Json[]);
    const start = 7_436_292;
    const bounds = [
      [69_500, 72_500],
      [72_500, 75_500],
      [75_500, 77_000],
    ];
    SEGMENTS.forEach((id, index) => {
      const [from, to] = bounds[index] ?? [0, 0];
      const recut = ownedPetSlice(all, ROSTER, {
        fromMs: start + (from ?? 0),
        untilMs: start + (to ?? 0),
        families: ["damage", "extraattacks", "heal", "absorbed", "healabsorbed", "death"],
        actorlessFamilies: [],
      });
      expect(serializeSlice(recut, true), id).toBe(files[pathOf(id)]);
    });
  });
});

describe("the loader refuses a friendly-players declaration that disagrees with its catalog or its bytes", () => {
  async function errorsAfter(
    edit: (manifest: { artifacts: Json[] }, files: Record<string, string>) => Promise<void> | void,
  ) {
    const files: Record<string, string> = { ...committedEvidenceArchiveFiles() };
    const manifest = JSON.parse(files["manifest.json"] ?? "null") as { artifacts: Json[] };
    await edit(manifest, files);
    files["manifest.json"] = JSON.stringify(manifest);
    const result = await validateEvidenceArchive(files, committedCorpusFiles());
    return result.ok ? [] : result.errors;
  }
  const record = (manifest: { artifacts: Json[] }, artifactId: string) => {
    const found = manifest.artifacts.find((entry) => entry["artifactId"] === artifactId);
    if (found === undefined) throw new Error(artifactId);
    return found as Json & { provenance: Json & { actorSlice: Json; retainedCoverage: { grants: Json[] } } };
  };
  const codes = (errors: readonly { readonly code: string }[]) => [
    ...new Set(errors.map((error) => error.code)),
  ];

  it("the committed archive itself passes", async () => {
    expect(await errorsAfter(() => undefined)).toEqual([]);
  });

  it("refuses a declared roster the catalog does not state", async () => {
    const errors = await errorsAfter((manifest) => {
      record(manifest, SEGMENTS[0] ?? "").provenance.actorSlice["playerActorIds"] = ROSTER.slice(1);
    });
    expect(codes(errors)).toEqual(["ACTOR_SLICE_INVALID"]);
    expect(errors.map((error) => error.message).join("\n")).toContain("catalog's friendlyPlayers give");
  });

  it("refuses a grant whose actor scope is not the whole roster", async () => {
    const errors = await errorsAfter((manifest) => {
      const grant = record(manifest, SEGMENTS[1] ?? "").provenance.retainedCoverage.grants[0];
      if (grant !== undefined) grant["actorScope"] = [5];
    });
    expect(codes(errors)).toContain("ACTOR_SLICE_INVALID");
  });

  it("refuses a grant for a category whose families were not retained (CASTS)", async () => {
    const errors = await errorsAfter((manifest) => {
      const grant = record(manifest, SEGMENTS[2] ?? "").provenance.retainedCoverage.grants[0];
      if (grant !== undefined) grant["categories"] = [...(grant["categories"] as string[]), "CASTS"];
    });
    expect(codes(errors)).toEqual(["ACTOR_SLICE_INVALID"]);
    expect(errors[0]?.message).toContain("CASTS");
  });

  it("refuses a slice that names another fight", async () => {
    const errors = await errorsAfter((manifest) => {
      record(manifest, SEGMENTS[0] ?? "").provenance.actorSlice["fightId"] = 47;
    });
    expect(codes(errors)).toEqual(["ACTOR_SLICE_INVALID"]);
  });

  it("refuses an event no roster player sources or receives", async () => {
    const errors = await errorsAfter(async (manifest, files) => {
      const id = SEGMENTS[2] ?? "";
      const events = JSON.parse(files[pathOf(id)] ?? "[]") as Json[];
      const last = events[events.length - 1] ?? {};
      events.push({ ...last, sourceID: 161, targetID: 180, type: "damage" });
      const text = serializeSlice(events, true);
      files[pathOf(id)] = text;
      const entry = record(manifest, id);
      entry["sha256"] = await sha256Hex(canonicalBytesOf(text));
      entry["byteLength"] = canonicalBytesOf(text).byteLength;
    });
    expect(codes(errors)).toEqual(["ACTOR_SLICE_INVALID"]);
    expect(errors[0]?.message).toContain("outside the declared slice");
  });
});

/**
 * Talent-LOADOUT node tables (M11-G3-2), keyed by class id and
 * machine-extracted from the pinned SimulationCraft trait table by
 * scripts/authority/extract-simc-trait-loadout.mjs.
 *
 * Shared, class-neutral data: each table says in which order an import string
 * is read for one class, nothing about which talents are good. A
 * specialization asks for its own class's table through its binding. A class
 * the artifact does not carry is a typed refusal, never an empty table (which
 * would decode every code to "no talents").
 */

import { z } from "zod";

import artifact from "./trait-loadout-tables.json";
import type { LoadoutTable } from "./talent-loadout.js";

const entry = z.object({
  entryId: z.number().int().positive(),
  tree: z.enum(["INVALID", "CLASS", "SPECIALIZATION", "HERO", "SELECTION"]),
  nodeType: z.string(),
  maxRanks: z.number().int().nonnegative(),
  specIds: z.array(z.number().int().positive()),
  subTreeId: z.number().int().nonnegative(),
  spellId: z.number().int().nonnegative(),
  displayNameEn: z.string(),
});

const schema = z.object({
  artifactVersion: z.literal(1),
  datasetId: z.literal("SIMC_TRAIT_LOADOUT_TABLES"),
  artifactRevision: z.string(),
  provenance: z.object({
    commitSha: z.literal("33622e9d1662ff0e451691edf85a6b49cc9d11d9"),
    clientDataWowVersion: z.literal("12.1.0.69587"),
    sources: z.array(
      z.object({ path: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/), byteLength: z.number() }),
    ),
  }),
  tables: z
    .array(
      z.object({
        classId: z.number().int().positive(),
        nodes: z
          .array(z.object({ nodeId: z.number().int().positive(), entries: z.array(entry).min(1) }))
          .min(1),
      }),
    )
    .min(1),
});

export type LoadoutTableLoad =
  { readonly ok: true; readonly table: LoadoutTable } | { readonly ok: false; readonly detail: string };

let parsed:
  | { readonly ok: true; readonly data: z.infer<typeof schema> }
  | { readonly ok: false; readonly detail: string }
  | null = null;

export function pinnedLoadoutTable(classId: number): LoadoutTableLoad {
  if (parsed === null) {
    const result = schema.safeParse(artifact);
    parsed = result.success
      ? { ok: true, data: result.data }
      : { ok: false, detail: result.error.issues[0]?.message ?? "invalid loadout artifact" };
  }
  if (!parsed.ok) return parsed;
  const table = parsed.data.tables.find((candidate) => candidate.classId === classId);
  if (table === undefined) return { ok: false, detail: `no loadout table for class ${String(classId)}` };
  const ids = table.nodes.map((node) => node.nodeId);
  if (ids.some((id, index) => index > 0 && id <= (ids[index - 1] ?? 0))) {
    return { ok: false, detail: `class ${String(classId)}: nodes are not strictly ascending by node id` };
  }
  return {
    ok: true,
    table: { classId, artifactRevision: parsed.data.artifactRevision, nodes: table.nodes },
  };
}

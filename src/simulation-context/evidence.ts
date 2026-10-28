/**
 * M11-G4-1 deploy-calendar EVIDENCE: what proves which client build a log ran
 * on (owner decisions 2026-10-28, agent/architecture.md "M11-G4-1").
 *
 * Two committed datasets, validated on load. A dataset that fails validation
 * yields NO evidence, never partial evidence.
 *
 * - LIVE_BUILD_OBSERVATIONS (`src/data/simulation-context/build-observations.json`,
 *   scripts/authority/capture-live-build-evidence.mjs).
 *   - wago.tools' OBSERVATION of each build on Blizzard's version server
 *     (third party; timezone undeclared; region not recorded).
 *   - Blizzard's CDN copy of that build's config, which verifies the build's
 *     identity and gives the Blizzard-origin time it existed on the CDN.
 * - REGIONAL_RESTART_EVIDENCE (`src/data/simulation-context/regional-restarts.json`):
 *   dated, sourced regional maintenance windows. Every source keeps its
 *   evidence class; third-party timing is never labelled Blizzard-authored.
 */

import { z } from "zod";

import buildObservationsJson from "../data/simulation-context/build-observations.json";
import regionalRestartsJson from "../data/simulation-context/regional-restarts.json";

/**
 * A real UTC instant: the syntax AND the calendar date and time must round-trip
 * (2026-99-99 is refused), in years 2000-2999 so that every derived bound
 * (± hours) stays representable.
 */
const realInstant = (asIso: string): boolean => {
  const ms = Date.parse(asIso);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== asIso.slice(0, 19)) return false;
  const year = new Date(ms).getUTCFullYear();
  return year >= 2000 && year <= 2999;
};
const isoUtc = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/)
  .refine(realInstant, "not a real UTC instant");
/** wago's `YYYY-MM-DD hh:mm:ss` wall-clock observation (timezone undeclared). */
const wallClock = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  .refine((text) => realInstant(`${text.replace(" ", "T")}Z`), "not a real wall-clock time");

export const buildObservationsSchema = z.object({
  artifactVersion: z.literal(1),
  datasetId: z.literal("LIVE_BUILD_OBSERVATIONS"),
  generatorRevision: z.number().int().positive(),
  provenance: z.object({
    appearanceSource: z.object({
      kind: z.literal("THIRD_PARTY_VERSION_SERVER_RECORDER"),
      publisher: z.string(),
      url: z.string(),
      retrievedAtUtc: isoUtc,
      responseSha256: z.string().regex(/^[0-9a-f]{64}$/),
      product: z.literal("wow"),
      createdAtSemantics: z.literal("WAGO_OBSERVATION_TIME_TIMEZONE_UNDECLARED"),
      regionRecorded: z.literal(false),
    }),
    identitySource: z.object({
      kind: z.literal("BLIZZARD_CDN_BUILD_CONFIG"),
      host: z.string(),
      path: z.string(),
      lastModifiedSemantics: z.literal("BLIZZARD_CDN_OBJECT_LAST_MODIFIED"),
    }),
    minVersion: z.string(),
    generator: z.string(),
  }),
  observations: z
    .array(
      z.object({
        version: z.string().regex(/^\d+\.\d+\.\d+\.\d+$/),
        buildId: z.number().int().positive(),
        wago: z.object({
          createdAtRaw: wallClock,
          buildConfig: z.string().regex(/^[0-9a-f]{32}$/),
          cdnConfig: z.string(),
          productConfig: z.string(),
        }),
        blizzardCdn: z.object({
          url: z.string(),
          retrievedAtUtc: isoUtc,
          httpStatus: z.number().int(),
          lastModifiedUtc: isoUtc.nullable(),
          contentMd5MatchesKey: z.boolean(),
          buildName: z.string().nullable(),
          buildNameMatchesVersion: z.boolean(),
        }),
      }),
    )
    .min(1),
});

export type LiveBuildObservations = z.infer<typeof buildObservationsSchema>;
export type LiveBuildObservation = LiveBuildObservations["observations"][number];

export const RESTART_EVIDENCE_CLASSES = ["BLIZZARD_AUTHORED", "THIRD_PARTY_NEWS_REPORT"] as const;

export const regionalRestartsSchema = z.object({
  artifactVersion: z.literal(1),
  datasetId: z.literal("REGIONAL_RESTART_EVIDENCE"),
  provenance: z.object({
    curation: z.literal("HAND_ENTERED_FROM_ARCHIVED_SOURCES"),
    curatedOn: z.string(),
    ownerPolicy: z.string(),
    blizzardAuthoredSearch: z.string(),
    coverage: z.string(),
    excerptNormalization: z.string(),
  }),
  restarts: z.array(
    z.object({
      restartId: z.string(),
      /** A Warcraft Logs region slug, upper case. */
      region: z.string().regex(/^[A-Z]{2}$/),
      window: z.object({ fromUtc: isoUtc, toUtc: isoUtc }),
      windowTimezoneInterpretation: z.string(),
      sources: z
        .array(
          z.object({
            evidenceClass: z.enum(RESTART_EVIDENCE_CLASSES),
            publisher: z.string().min(1),
            url: z.string().url(),
            publishedAt: z.string(),
            modifiedAt: z.string().nullable(),
            retrievedAtUtc: isoUtc,
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
            byteLength: z.number().int().positive(),
            localArchive: z.string(),
            claimedRegion: z.string().min(1),
            claimedWindow: z.string().min(1),
            claimedCompletion: z.string().nullable(),
            excerpts: z.array(z.string()).min(1),
          }),
        )
        .min(1),
    }),
  ),
});

export type RegionalRestartEvidence = z.infer<typeof regionalRestartsSchema>;
export type RegionalRestart = RegionalRestartEvidence["restarts"][number];

export interface DeployCalendarEvidence {
  readonly observations: LiveBuildObservations;
  readonly restarts: RegionalRestartEvidence;
}

export type DeployCalendarEvidenceLoad =
  | { readonly ok: true; readonly evidence: DeployCalendarEvidence }
  | { readonly ok: false; readonly detail: string };

/** Validates raw datasets. Exported for tests; production reads `COMMITTED_DEPLOY_CALENDAR_EVIDENCE`. */
export function loadDeployCalendarEvidence(raw: {
  readonly observations: unknown;
  readonly restarts: unknown;
}): DeployCalendarEvidenceLoad {
  const observations = buildObservationsSchema.safeParse(raw.observations);
  if (!observations.success) return { ok: false, detail: "invalid LIVE_BUILD_OBSERVATIONS" };
  const restarts = regionalRestartsSchema.safeParse(raw.restarts);
  if (!restarts.success) return { ok: false, detail: "invalid REGIONAL_RESTART_EVIDENCE" };
  const ids = restarts.data.restarts.map((restart) => restart.restartId);
  if (new Set(ids).size !== ids.length) return { ok: false, detail: "duplicate restartId" };
  return { ok: true, evidence: { observations: observations.data, restarts: restarts.data } };
}

export const COMMITTED_DEPLOY_CALENDAR_EVIDENCE: DeployCalendarEvidenceLoad = loadDeployCalendarEvidence({
  observations: buildObservationsJson,
  restarts: regionalRestartsJson,
});

/**
 * Synthetic APL authority artifacts for M5 tests.
 *
 * The pinned artifact is real evidence and must not be doctored to produce an
 * edge case. These builders construct deliberately-shaped authorities — two
 * lists containing the same action, an unconditional gate, an unsupported
 * condition — so the reachability and expression refusals can be exercised
 * without touching the committed one.
 */

import { loadAplAuthority, type AplAuthority } from "../../src/simc/apl-authority.js";

const FAKE_COMMIT = "0".repeat(40);
const FAKE_SOURCE_HASH = "1".repeat(64);

export interface SyntheticListSpec {
  readonly listName: string;
  readonly actions: readonly string[];
}

/** Builds an artifact object in exactly the committed schema. */
export function syntheticArtifact(options: {
  readonly entryListName?: string;
  readonly lists: readonly SyntheticListSpec[];
}): Record<string, unknown> {
  return {
    artifactVersion: 1,
    authorityId: "SIMC_APL_TEST",
    artifactRevision: "test-1",
    spec: { className: "rogue", specName: "assassination" },
    entryListName: options.entryListName ?? "default",
    provenance: {
      repository: "https://example.invalid/simc",
      branch: "test",
      commitSha: FAKE_COMMIT,
      commitDate: "2026-01-01",
      sourcePath: "engine/class_modules/apl/apl_rogue.cpp",
      sourceSha256: FAKE_SOURCE_HASH,
      sourceByteLength: 1,
      regionStartMarker: "//assassination_apl_start",
      regionEndMarker: "//assassination_apl_end",
      extractedOn: "2026-01-01",
      extractorVersion: 1,
    },
    lists: options.lists.map((list) => ({
      listName: list.listName,
      receiverIdentifier: list.listName,
      actions: list.actions.map((actionStringVerbatim, index) => ({
        priorityOrdinal: index,
        actionStringVerbatim,
        comment: null,
        sourceLine: 100 + index,
      })),
    })),
  };
}

export function syntheticAuthority(options: {
  readonly entryListName?: string;
  readonly lists: readonly SyntheticListSpec[];
}): AplAuthority {
  const loaded = loadAplAuthority(syntheticArtifact(options));
  if (!loaded.ok) {
    throw new Error(`synthetic artifact failed validation: ${loaded.reason} — ${loaded.detail}`);
  }
  return loaded.authority;
}

/** An authority shaped like the real one, with a substitutable gate condition. */
export function authorityWithGateCondition(condition: string): AplAuthority {
  return syntheticAuthority({
    lists: [
      { listName: "default", actions: [`call_action_list,name=spend,if=${condition}`] },
      { listName: "spend", actions: ["envenom,if=buff.envenom.remains<=1"] },
    ],
  });
}

/**
 * An authority shaped like the real one, with a substitutable gate AND sub-list.
 *
 * The pinned `spend` list holds three Envenom lines, which is exactly the shape
 * M5-B was built for and therefore the shape least able to prove the ordered
 * walk handles anything else. These builders supply the cases the real authority
 * does not contain — a competing token above a definite winner, an all-false
 * list, an authoritatively empty list — without doctoring the committed
 * artifact.
 */
export function authorityWithSpendList(options: {
  readonly gateCondition: string;
  readonly spendActions: readonly string[];
}): AplAuthority {
  return syntheticAuthority({
    lists: [
      {
        listName: "default",
        actions: [`call_action_list,name=spend,if=${options.gateCondition}`],
      },
      { listName: "spend", actions: options.spendActions },
    ],
  });
}

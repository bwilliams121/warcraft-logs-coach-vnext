import type { ASSERTION_KINDS, AssertionKind } from "../contract.js";

/** The validated parameter type of one registered assertion kind. */
export type ParamsOf<K extends AssertionKind> = (typeof ASSERTION_KINDS)[K]["params"]["_output"];

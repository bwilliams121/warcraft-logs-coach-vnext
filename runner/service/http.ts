/**
 * RUNNER HTTP ROUTING (M11-G3-5), transport-independent: a request is
 * {method, path, headers, body bytes} and a response is {status, body}. The
 * node:http adapter (server.ts) only reads a bounded body and writes JSON.
 *
 *   GET    /livez                     process is up (no auth, no detail)
 *   GET    /v1/readiness              200 READY / 503 NOT READY (no auth, no detail)
 *   GET    /v1/metrics                authenticated
 *   POST   /v1/simulations            authenticated; 202 queued, 200 terminal (cache HIT),
 *                                     422 rejected job, 503 overloaded/unavailable
 *   GET    /v1/simulations/:id        authenticated; 200 / 404
 *   DELETE /v1/simulations/:id        authenticated; 200 / 404
 *
 * Every authenticated route is signed over (method, path, body hash); a query
 * string is refused so the signed path is the whole target. Auth failures all
 * answer the same 401 body; the reason code goes only to the structured log.
 */

import type { SimulationFailureCode } from "../../src/simulation/failures.js";
import {
  JOB_ID_PATTERN,
  MAX_RUNNER_REQUEST_BYTES,
  RUNNER_PATHS,
  RUNNER_PROTOCOL,
  RUNNER_SERVICE_REVISION,
  submitSimulationRequestSchema,
  TERMINAL_STATUSES,
  type TransportError,
  type TransportErrorCode,
} from "../../src/simulation/runner-protocol.js";
import type { AuthRejection, RequestAuthenticator } from "./auth.js";
import type { SimulationService } from "./service.js";

export interface RunnerHttpRequest {
  readonly method: string;
  /** The request target as received (path plus any query). */
  readonly target: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** Null when the body exceeded MAX_RUNNER_REQUEST_BYTES and was not read. */
  readonly body: Uint8Array | null;
}

export interface RunnerHttpResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface HttpEvent {
  readonly event: "AUTH_REJECTED" | "BAD_REQUEST";
  readonly reason: AuthRejection | TransportErrorCode;
  readonly method: string;
  readonly route: string;
}

const transportError = (status: number, code: TransportErrorCode, detail: string): RunnerHttpResponse => ({
  status,
  body: {
    protocol: RUNNER_PROTOCOL,
    serviceRevision: RUNNER_SERVICE_REVISION,
    error: { code, detail },
  } satisfies TransportError,
});

/** Rejections the caller should retry later rather than fix. */
const RETRYABLE: readonly SimulationFailureCode[] = ["RUNNER_OVERLOADED", "RUNNER_UNAVAILABLE"];

const SIMULATION_ROUTE = /^\/v1\/simulations\/([^/]+)$/;

/** A route label for logs: never the job id. */
function routeOf(path: string): string {
  if (SIMULATION_ROUTE.test(path)) return "/v1/simulations/:id";
  return Object.values(RUNNER_PATHS).includes(path as never) ? path : "(other)";
}

export class RunnerHttpHandler {
  constructor(
    private readonly service: SimulationService,
    private readonly authenticator: RequestAuthenticator,
    private readonly log: (event: HttpEvent) => void = () => undefined,
  ) {}

  async handle(request: RunnerHttpRequest): Promise<RunnerHttpResponse> {
    const method = request.method.toUpperCase();
    if (request.target.includes("?") || request.target.includes("#")) {
      return this.bad(method, "(other)", 400, "BAD_REQUEST", "query strings are not accepted");
    }
    const path = request.target;
    const route = routeOf(path);

    if (path === RUNNER_PATHS.liveness) {
      return method === "GET" ? { status: 200, body: { live: true } } : this.methodNotAllowed(method, route);
    }
    if (path === RUNNER_PATHS.readiness) {
      if (method !== "GET") return this.methodNotAllowed(method, route);
      const readiness = this.service.readiness();
      return {
        status: readiness.ready ? 200 : 503,
        body: { ready: readiness.ready, checks: readiness.checks },
      };
    }

    const known =
      path === RUNNER_PATHS.metrics || path === RUNNER_PATHS.simulations || SIMULATION_ROUTE.test(path);
    if (!known) return this.bad(method, route, 404, "NOT_FOUND", "no such route");
    if (request.body === null) {
      return this.bad(
        method,
        route,
        413,
        "PAYLOAD_TOO_LARGE",
        `body exceeds ${String(MAX_RUNNER_REQUEST_BYTES)} bytes`,
      );
    }

    // Authenticate before looking at the body or the job id.
    const auth = await this.authenticator.authenticate({
      method,
      path,
      headers: request.headers,
      body: request.body,
    });
    if (!auth.ok) {
      this.log({ event: "AUTH_REJECTED", reason: auth.reason, method, route });
      return transportError(401, "AUTH_REJECTED", "request authentication failed");
    }

    if (path === RUNNER_PATHS.metrics) {
      return method === "GET"
        ? { status: 200, body: this.service.metrics() }
        : this.methodNotAllowed(method, route);
    }
    if (path === RUNNER_PATHS.simulations) {
      return method === "POST"
        ? await this.submit(request.body, method, route)
        : this.methodNotAllowed(method, route);
    }

    const jobId = SIMULATION_ROUTE.exec(path)?.[1] ?? "";
    if (!JOB_ID_PATTERN.test(jobId)) return this.bad(method, route, 404, "NOT_FOUND", "no such simulation");
    if (method === "GET") {
      const view = this.service.status(jobId);
      return view === null
        ? transportError(404, "NOT_FOUND", "no such simulation")
        : { status: 200, body: view };
    }
    if (method === "DELETE") {
      const view = this.service.cancel(jobId);
      return view === null
        ? transportError(404, "NOT_FOUND", "no such simulation")
        : { status: 200, body: view };
    }
    return this.methodNotAllowed(method, route);
  }

  private async submit(body: Uint8Array, method: string, route: string): Promise<RunnerHttpResponse> {
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(body));
    } catch {
      return this.bad(method, route, 400, "BAD_REQUEST", "body is not JSON");
    }
    const parsed = submitSimulationRequestSchema.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return this.bad(
        method,
        route,
        400,
        "BAD_REQUEST",
        `${issue?.path.join(".") ?? "(root)"}: ${issue?.code ?? "invalid"}`,
      );
    }
    // The G3-1 payload cap applies to the job itself, measured canonically.
    const jobBytes = new TextEncoder().encode(JSON.stringify(parsed.data.job) ?? "").byteLength;
    const submission = await this.service.submit({
      job: parsed.data.job,
      rawByteLength: jobBytes,
      ...(parsed.data.readiness === undefined ? {} : { readiness: parsed.data.readiness }),
    });
    if (!submission.accepted) {
      const retryable = RETRYABLE.includes(submission.rejected.failure.code);
      return {
        status: retryable ? 503 : 422,
        body: submission.rejected,
        ...(retryable ? { headers: { "retry-after": "5" } } : {}),
      };
    }
    const terminal = TERMINAL_STATUSES.includes(submission.ticket.status);
    return { status: terminal ? 200 : 202, body: submission.ticket };
  }

  private methodNotAllowed(method: string, route: string): RunnerHttpResponse {
    return this.bad(method, route, 405, "METHOD_NOT_ALLOWED", `${method} is not allowed here`);
  }

  private bad(
    method: string,
    route: string,
    status: number,
    code: TransportErrorCode,
    detail: string,
  ): RunnerHttpResponse {
    this.log({ event: "BAD_REQUEST", reason: code, method, route });
    return transportError(status, code, detail);
  }
}

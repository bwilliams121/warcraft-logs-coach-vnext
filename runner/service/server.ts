/**
 * node:http ADAPTER for the runner handler (M11-G3-5). It reads at most
 * MAX_RUNNER_REQUEST_BYTES of body (a declared or streamed larger body is
 * answered 413 without being buffered), passes single-valued headers only (a
 * repeated auth header is treated as absent), and writes JSON. It listens on a
 * loopback/private address; TLS is terminated in front of it.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { MAX_RUNNER_REQUEST_BYTES } from "../../src/simulation/runner-protocol.js";
import type { RunnerHttpHandler, RunnerHttpResponse } from "./http.js";

function singleValued(headers: IncomingMessage["headers"]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") out[name.toLowerCase()] = value;
  }
  return out;
}

function readBoundedBody(request: IncomingMessage): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const declared = Number(request.headers["content-length"] ?? "0");
    if (Number.isFinite(declared) && declared > MAX_RUNNER_REQUEST_BYTES) {
      resolve(null);
      return;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    let done = false;
    request.on("data", (chunk) => {
      if (done) return;
      total += chunk.byteLength;
      if (total > MAX_RUNNER_REQUEST_BYTES) {
        done = true;
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (done) return;
      done = true;
      const body = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(body);
    });
    request.on("error", () => {
      if (done) return;
      done = true;
      resolve(new Uint8Array(0));
    });
  });
}

function write(response: ServerResponse, result: RunnerHttpResponse, close: boolean): void {
  response.writeHead(result.status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...(close ? { connection: "close" } : {}),
    ...(result.headers ?? {}),
  });
  response.end(JSON.stringify(result.body));
}

export function createRunnerServer(handler: RunnerHttpHandler): Server {
  return createServer((request, response) => {
    void (async () => {
      const body = await readBoundedBody(request);
      const result = await handler.handle({
        method: request.method ?? "GET",
        target: request.url ?? "/",
        headers: singleValued(request.headers),
        body,
      });
      // An oversized body is not read; `connection: close` lets Node discard
      // the rest and close the socket after the 413 is delivered.
      write(response, result, body === null);
    })().catch(() => {
      write(response, { status: 500, body: { error: "internal" } }, true);
    });
  });
}

export function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address();
      resolve(typeof address === "object" && address !== null ? address.port : port);
    });
  });
}

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

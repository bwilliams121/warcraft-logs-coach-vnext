import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

/**
 * These tests exercise the REAL default export from src/api/worker.ts inside
 * workerd, wired from wrangler.jsonc. They prove the Worker actually boots,
 * rather than that a handler function happens to return objects.
 */
describe("worker shell", () => {
  it("worker_boots_and_serves_requests", async () => {
    const response = await SELF.fetch("https://coach.test/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("health_endpoint_returns_ok", async () => {
    const response = await SELF.fetch("https://coach.test/health");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok", version: "0.1.0", environment: "test" });
  });

  it("health_endpoint_discloses_no_configuration_state", async () => {
    const body = await (await SELF.fetch("https://coach.test/health")).text();

    for (const term of ["WCL", "wcl", "client", "secret", "configured", "credential"]) {
      expect(body).not.toContain(term);
    }
  });

  it("outbound_network_is_blocked_in_tests", async () => {
    // Makes the offline guarantee explicit instead of implied. Every outbound
    // request from this runtime is answered locally, so no test can reach
    // Warcraft Logs — in CI, or on a developer machine holding real credentials.
    const response = await fetch("https://www.warcraftlogs.com/api/v2/client", { method: "POST" });

    expect(response.status).toBe(503);
    expect(await response.text()).toContain("outbound network is blocked");
  });

  it("unknown_route_returns_structured_not_found", async () => {
    const response = await SELF.fetch("https://coach.test/nope");
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ ok: false, error: { code: "NOT_FOUND", message: "No such endpoint." } });
  });

  it("unsupported_method_returns_405", async () => {
    const onHealth = await SELF.fetch("https://coach.test/health", { method: "DELETE" });
    expect(onHealth.status).toBe(405);
    expect(onHealth.headers.get("allow")).toBe("GET");

    const onAnalysis = await SELF.fetch("https://coach.test/v1/analysis", { method: "GET" });
    expect(onAnalysis.status).toBe(405);
    expect(onAnalysis.headers.get("allow")).toBe("POST");

    const body = await onAnalysis.json();
    expect(body).toMatchObject({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } });
  });
});

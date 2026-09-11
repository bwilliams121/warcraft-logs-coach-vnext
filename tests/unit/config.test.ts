import { describe, expect, it } from "vitest";

import { loadConfig, REDACTED, type Env } from "../../src/config/env.js";

// Obvious fakes. No real credential appears in any test.
const FAKE_CLIENT_ID = "fake-client-id-not-real";
const FAKE_CLIENT_SECRET = "fake-client-secret-not-real";

const validEnv: Env = {
  ENVIRONMENT: "test",
  WCL_CLIENT_ID: FAKE_CLIENT_ID,
  WCL_CLIENT_SECRET: FAKE_CLIENT_SECRET,
};

describe("loadConfig", () => {
  it("loads_a_complete_configuration", () => {
    const result = loadConfig(validEnv);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.environment).toBe("test");
      expect(result.config.wcl.clientId).toBe(FAKE_CLIENT_ID);
      expect(result.config.wcl.clientSecret).toBe(FAKE_CLIENT_SECRET);
    }
  });

  it("missing_wcl_client_id_returns_configuration_error", () => {
    const result = loadConfig({ ENVIRONMENT: "test", WCL_CLIENT_SECRET: FAKE_CLIENT_SECRET });

    expect(result).toEqual({ ok: false, missing: ["WCL_CLIENT_ID"] });
  });

  it("blank_wcl_client_secret_returns_configuration_error", () => {
    const result = loadConfig({
      ENVIRONMENT: "test",
      WCL_CLIENT_ID: FAKE_CLIENT_ID,
      WCL_CLIENT_SECRET: "   ",
    });

    expect(result).toEqual({ ok: false, missing: ["WCL_CLIENT_SECRET"] });
  });

  it("reports_every_missing_key", () => {
    const result = loadConfig({});

    expect(result).toEqual({ ok: false, missing: ["WCL_CLIENT_ID", "WCL_CLIENT_SECRET"] });
  });

  it("configuration_error_does_not_contain_credential_values", () => {
    const result = loadConfig({ WCL_CLIENT_ID: FAKE_CLIENT_ID });

    expect(result.ok).toBe(false);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(FAKE_CLIENT_ID);
    expect(serialized).not.toContain(FAKE_CLIENT_SECRET);
  });

  it("serializing_config_redacts_credentials", () => {
    const result = loadConfig(validEnv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const whole = JSON.stringify(result.config);
    expect(whole).not.toContain(FAKE_CLIENT_ID);
    expect(whole).not.toContain(FAKE_CLIENT_SECRET);
    expect(JSON.parse(whole)).toEqual({ environment: "test", wcl: { configured: true } });

    // Defence in depth: serializing the nested credentials object alone is also
    // safe, so an accidental log of config.wcl cannot leak either value.
    const nested = JSON.stringify(result.config.wcl);
    expect(nested).not.toContain(FAKE_CLIENT_ID);
    expect(nested).not.toContain(FAKE_CLIENT_SECRET);
    expect(JSON.parse(nested)).toEqual({ clientId: REDACTED, clientSecret: REDACTED });
  });

  it("absent_environment_does_not_become_an_empty_string", () => {
    const result = loadConfig({
      WCL_CLIENT_ID: FAKE_CLIENT_ID,
      WCL_CLIENT_SECRET: FAKE_CLIENT_SECRET,
    });

    expect(result.ok && result.config.environment).toBe("unknown");
  });
});

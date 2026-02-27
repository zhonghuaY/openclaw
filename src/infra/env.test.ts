import { describe, expect, it } from "vitest";
import { withEnv } from "../test-utils/env.js";
import {
  isTruthyEnvValue,
  normalizeNoProxyLoopbackEnv,
  normalizeZaiEnv,
  resolveHookPhaseTimeoutMs,
} from "./env.js";

describe("normalizeZaiEnv", () => {
  it("copies Z_AI_API_KEY to ZAI_API_KEY when missing", () => {
    withEnv({ ZAI_API_KEY: "", Z_AI_API_KEY: "zai-legacy" }, () => {
      normalizeZaiEnv();
      expect(process.env.ZAI_API_KEY).toBe("zai-legacy");
    });
  });

  it("does not override existing ZAI_API_KEY", () => {
    withEnv({ ZAI_API_KEY: "zai-current", Z_AI_API_KEY: "zai-legacy" }, () => {
      normalizeZaiEnv();
      expect(process.env.ZAI_API_KEY).toBe("zai-current");
    });
  });

  it("ignores blank legacy Z_AI_API_KEY values", () => {
    withEnv({ ZAI_API_KEY: "", Z_AI_API_KEY: "   " }, () => {
      normalizeZaiEnv();
      expect(process.env.ZAI_API_KEY).toBe("");
    });
  });

  it("does not copy when legacy Z_AI_API_KEY is unset", () => {
    withEnv({ ZAI_API_KEY: "", Z_AI_API_KEY: undefined }, () => {
      normalizeZaiEnv();
      expect(process.env.ZAI_API_KEY).toBe("");
    });
  });
});

describe("isTruthyEnvValue", () => {
  it("accepts common truthy values", () => {
    expect(isTruthyEnvValue("1")).toBe(true);
    expect(isTruthyEnvValue("true")).toBe(true);
    expect(isTruthyEnvValue(" yes ")).toBe(true);
    expect(isTruthyEnvValue("ON")).toBe(true);
  });

  it("rejects other values", () => {
    expect(isTruthyEnvValue("0")).toBe(false);
    expect(isTruthyEnvValue("false")).toBe(false);
    expect(isTruthyEnvValue("")).toBe(false);
    expect(isTruthyEnvValue(undefined)).toBe(false);
  });
});

describe("normalizeNoProxyLoopbackEnv", () => {
  it("adds loopback hosts when NO_PROXY is missing", () => {
    withEnv({ NO_PROXY: undefined, no_proxy: undefined }, () => {
      normalizeNoProxyLoopbackEnv();
      expect(process.env.NO_PROXY).toBe("localhost,127.0.0.1,::1");
      expect(process.env.no_proxy).toBe("localhost,127.0.0.1,::1");
    });
  });

  it("preserves existing entries and appends missing loopback hosts", () => {
    withEnv({ NO_PROXY: "example.com,localhost", no_proxy: undefined }, () => {
      normalizeNoProxyLoopbackEnv();
      expect(process.env.NO_PROXY).toBe("example.com,localhost,127.0.0.1,::1");
      expect(process.env.no_proxy).toBe("example.com,localhost,127.0.0.1,::1");
    });
  });

  it("keeps value unchanged when loopback hosts already exist", () => {
    withEnv({ NO_PROXY: "localhost,127.0.0.1,::1", no_proxy: undefined }, () => {
      normalizeNoProxyLoopbackEnv();
      expect(process.env.NO_PROXY).toBe("localhost,127.0.0.1,::1");
      expect(process.env.no_proxy).toBeUndefined();
    });
  });
});

describe("resolveHookPhaseTimeoutMs", () => {
  it("returns default timeout when env var is missing", () => {
    withEnv({ OPENCLAW_HOOK_PHASE_TIMEOUT_MS: undefined }, () => {
      expect(resolveHookPhaseTimeoutMs()).toBe(8000);
    });
  });

  it("returns bounded timeout when env var is set", () => {
    withEnv({ OPENCLAW_HOOK_PHASE_TIMEOUT_MS: "1234" }, () => {
      expect(resolveHookPhaseTimeoutMs()).toBe(1234);
    });
    withEnv({ OPENCLAW_HOOK_PHASE_TIMEOUT_MS: "1" }, () => {
      expect(resolveHookPhaseTimeoutMs()).toBe(50);
    });
  });

  it("falls back to default for invalid values", () => {
    withEnv({ OPENCLAW_HOOK_PHASE_TIMEOUT_MS: "abc" }, () => {
      expect(resolveHookPhaseTimeoutMs()).toBe(8000);
    });
    withEnv({ OPENCLAW_HOOK_PHASE_TIMEOUT_MS: "-10" }, () => {
      expect(resolveHookPhaseTimeoutMs()).toBe(8000);
    });
  });
});

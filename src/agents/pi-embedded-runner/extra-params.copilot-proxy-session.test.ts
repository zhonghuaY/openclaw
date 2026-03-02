import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { Context, Model, SimpleStreamOptions } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { applyExtraParamsToAgent } from "./extra-params.js";

vi.mock("@mariozechner/pi-ai", () => ({
  streamSimple: vi.fn(() => ({
    push: vi.fn(),
    result: vi.fn(),
  })),
}));

function captureHeaders(params: {
  provider: string;
  modelId: string;
  sessionKey?: string;
  existingHeaders?: Record<string, string>;
}): Record<string, string> | undefined {
  let capturedHeaders: Record<string, string> | undefined;
  const baseStreamFn: StreamFn = (_model, _context, options) => {
    capturedHeaders = options?.headers;
    return {} as ReturnType<StreamFn>;
  };
  const agent = { streamFn: baseStreamFn };
  const model: Model<"openai-completions"> = {
    api: "openai-completions",
    provider: params.provider,
    id: params.modelId,
  } as Model<"openai-completions">;

  applyExtraParamsToAgent(
    agent,
    undefined,
    params.provider,
    params.modelId,
    undefined,
    undefined,
    undefined,
    params.sessionKey,
  );

  const context: Context = { messages: [] };
  void agent.streamFn?.(model, context, {
    headers: params.existingHeaders,
  } as SimpleStreamOptions);

  return capturedHeaders;
}

describe("extra-params: copilot-proxy X-Session-Id injection", () => {
  it("injects X-Session-Id header for copilot-proxy provider", () => {
    const headers = captureHeaders({
      provider: "copilot-proxy",
      modelId: "gpt-4.1",
      sessionKey: "agent:main:openai:abc-123-def",
    });

    expect(headers).toBeDefined();
    expect(headers!["X-Session-Id"]).toBe("openai_abc-123-def");
  });

  it("does not inject X-Session-Id for non-copilot-proxy providers", () => {
    const headers = captureHeaders({
      provider: "openai",
      modelId: "gpt-5",
      sessionKey: "agent:main:openai:abc-123-def",
    });

    expect(headers?.["X-Session-Id"]).toBeUndefined();
  });

  it("does not inject X-Session-Id when sessionKey is undefined", () => {
    const headers = captureHeaders({
      provider: "copilot-proxy",
      modelId: "gpt-4.1",
      sessionKey: undefined,
    });

    expect(headers?.["X-Session-Id"]).toBeUndefined();
  });

  it("does not inject X-Session-Id when sessionKey is empty", () => {
    const headers = captureHeaders({
      provider: "copilot-proxy",
      modelId: "gpt-4.1",
      sessionKey: "  ",
    });

    expect(headers?.["X-Session-Id"]).toBeUndefined();
  });

  it("preserves existing headers when injecting X-Session-Id", () => {
    const headers = captureHeaders({
      provider: "copilot-proxy",
      modelId: "gpt-4.1",
      sessionKey: "agent:main:openai:abc-123",
      existingHeaders: { "Content-Type": "application/json" },
    });

    expect(headers!["X-Session-Id"]).toBe("openai_abc-123");
    expect(headers!["Content-Type"]).toBe("application/json");
  });

  it("sanitizes special characters in sessionKey", () => {
    const headers = captureHeaders({
      provider: "copilot-proxy",
      modelId: "gpt-4.1",
      sessionKey: "agent:main:openai:some/weird:key!@#",
    });

    expect(headers!["X-Session-Id"]).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it("truncates long sessionKey to 64 chars", () => {
    const longKey = "agent:main:openai:" + "a".repeat(200);
    const headers = captureHeaders({
      provider: "copilot-proxy",
      modelId: "gpt-4.1",
      sessionKey: longKey,
    });

    expect(headers!["X-Session-Id"]).toBeDefined();
    expect(headers!["X-Session-Id"].length).toBeLessThanOrEqual(64);
  });

  it("uses bindingOverride when provided via createCopilotProxySessionWrapper", () => {
    let capturedHeaders: Record<string, string> | undefined;
    const wrappedBase: StreamFn = (_m, _c, opts) => {
      capturedHeaders = opts?.headers;
      return {} as ReturnType<StreamFn>;
    };
    const agent = { streamFn: wrappedBase };
    applyExtraParamsToAgent(
      agent,
      undefined,
      "copilot-proxy",
      "gpt-4.1",
      undefined,
      undefined,
      undefined,
      "agent:main:openai:abc",
    );
    const context: Context = { messages: [] };
    void agent.streamFn?.(
      {
        api: "openai-completions",
        provider: "copilot-proxy",
        id: "gpt-4.1",
      } as Model<"openai-completions">,
      context,
      { headers: {} } as SimpleStreamOptions,
    );
    // Default: uses sanitized sessionKey
    expect(capturedHeaders!["X-Session-Id"]).toBe("openai_abc");
  });

  it("falls back to sanitized sessionKey when bindingOverride is empty", () => {
    const headers = captureHeaders({
      provider: "copilot-proxy",
      modelId: "gpt-4.1",
      sessionKey: "agent:main:openai:fallback-test",
    });

    expect(headers!["X-Session-Id"]).toBe("openai_fallback-test");
  });
});

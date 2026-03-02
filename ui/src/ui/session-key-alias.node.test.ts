import { describe, expect, it } from "vitest";
import {
  findSessionRowByEquivalentKey,
  sessionKeysEquivalent,
  type SessionKeyDefaults,
} from "./session-key-alias.ts";
import type { GatewaySessionRow } from "./types.ts";

function row(overrides: Partial<GatewaySessionRow> & { key: string }): GatewaySessionRow {
  return {
    key: overrides.key,
    kind: overrides.kind ?? "direct",
    updatedAt: overrides.updatedAt ?? Date.now(),
    ...overrides,
  };
}

describe("session key alias matching", () => {
  const defaults: SessionKeyDefaults = {
    defaultAgentId: "main",
    mainKey: "main",
    mainSessionKey: "agent:main:main",
  };

  it("treats main alias and canonical main key as equivalent", () => {
    expect(sessionKeysEquivalent("main", "agent:main:main", defaults)).toBe(true);
    expect(sessionKeysEquivalent("agent:main:main", "main", defaults)).toBe(true);
  });

  it("does not treat other-agent main sessions as equivalent", () => {
    expect(sessionKeysEquivalent("main", "agent:ops:main", defaults)).toBe(false);
  });

  it("finds active session row when ui key uses main alias", () => {
    const sessions = [
      row({ key: "agent:ops:main", modelProvider: "openai", model: "gpt-4.1" }),
      row({ key: "agent:main:main", modelProvider: "anthropic", model: "claude-opus-4.6" }),
    ];

    const active = findSessionRowByEquivalentKey(sessions, "main", defaults);

    expect(active?.key).toBe("agent:main:main");
    expect(active?.modelProvider).toBe("anthropic");
    expect(active?.model).toBe("claude-opus-4.6");
  });
});

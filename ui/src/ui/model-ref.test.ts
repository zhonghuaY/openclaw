import { describe, expect, it } from "vitest";
import { formatModelRef } from "./model-ref.ts";

describe("formatModelRef", () => {
  it("returns provider/model when provider is present", () => {
    expect(formatModelRef("opencode", "big-pickle")).toBe("opencode/big-pickle");
  });

  it("keeps preformatted model refs", () => {
    expect(formatModelRef("opencode", "openai/gpt-4.1")).toBe("openai/gpt-4.1");
  });

  it("falls back to bare model when provider is missing", () => {
    expect(formatModelRef("", "gpt-4.1")).toBe("gpt-4.1");
  });
});

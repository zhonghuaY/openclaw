import { describe, expect, it, vi } from "vitest";
import { loadCronModelSuggestions, type CronModelSuggestionsState } from "./cron.ts";

function createState(models: unknown[]): CronModelSuggestionsState {
  return {
    client: {
      request: vi.fn(async () => ({ models })),
    } as unknown as CronModelSuggestionsState["client"],
    connected: true,
    cronModelSuggestions: [],
  };
}

describe("loadCronModelSuggestions", () => {
  it("normalizes models.list output to provider/model refs", async () => {
    const state = createState([
      { provider: "opencode", id: "big-pickle" },
      { provider: "copilot-api", id: "gpt-4.1" },
      { provider: "opencode", id: "big-pickle" },
      { id: "openai/gpt-4.1-mini" },
      { provider: "zai", id: "glm-4.7" },
      null,
      {},
    ]);

    await loadCronModelSuggestions(state);

    expect(state.cronModelSuggestions).toEqual([
      "copilot-api/gpt-4.1",
      "openai/gpt-4.1-mini",
      "opencode/big-pickle",
      "zai/glm-4.7",
    ]);
  });
});

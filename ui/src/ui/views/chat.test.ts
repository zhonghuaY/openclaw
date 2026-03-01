import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { SessionsListResult } from "../types.ts";
import { renderChat, type ChatProps } from "./chat.ts";

function createSessions(): SessionsListResult {
  return {
    ts: 0,
    path: "",
    count: 0,
    defaults: { model: null, contextTokens: null },
    sessions: [],
  };
}

function createProps(overrides: Partial<ChatProps> = {}): ChatProps {
  return {
    sessionKey: "main",
    onSessionKeyChange: () => undefined,
    thinkingLevel: null,
    showThinking: false,
    loading: false,
    sending: false,
    canAbort: false,
    compactionStatus: null,
    fallbackStatus: null,
    messages: [],
    toolMessages: [],
    stream: null,
    streamStartedAt: null,
    assistantAvatarUrl: null,
    draft: "",
    queue: [],
    connected: true,
    canSend: true,
    disabledReason: null,
    error: null,
    sessions: createSessions(),
    focusMode: false,
    assistantName: "OpenClaw",
    assistantAvatar: null,
    onRefresh: () => undefined,
    onToggleFocusMode: () => undefined,
    onDraftChange: () => undefined,
    onSend: () => undefined,
    onQueueRemove: () => undefined,
    onNewSession: () => undefined,
    ...overrides,
  };
}

describe("chat view", () => {
  it("renders compacting indicator as a badge", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          compactionStatus: {
            active: true,
            startedAt: Date.now(),
            completedAt: null,
          },
        }),
      ),
      container,
    );

    const indicator = container.querySelector(".compaction-indicator--active");
    expect(indicator).not.toBeNull();
    expect(indicator?.textContent).toContain("Compacting context...");
  });

  it("renders completion indicator shortly after compaction", () => {
    const container = document.createElement("div");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    render(
      renderChat(
        createProps({
          compactionStatus: {
            active: false,
            startedAt: 900,
            completedAt: 900,
          },
        }),
      ),
      container,
    );

    const indicator = container.querySelector(".compaction-indicator--complete");
    expect(indicator).not.toBeNull();
    expect(indicator?.textContent).toContain("Context compacted");
    nowSpy.mockRestore();
  });

  it("hides stale compaction completion indicator", () => {
    const container = document.createElement("div");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(10_000);
    render(
      renderChat(
        createProps({
          compactionStatus: {
            active: false,
            startedAt: 0,
            completedAt: 0,
          },
        }),
      ),
      container,
    );

    expect(container.querySelector(".compaction-indicator")).toBeNull();
    nowSpy.mockRestore();
  });

  it("renders fallback indicator shortly after fallback event", () => {
    const container = document.createElement("div");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    render(
      renderChat(
        createProps({
          fallbackStatus: {
            selected: "fireworks/minimax-m2p5",
            active: "deepinfra/moonshotai/Kimi-K2.5",
            attempts: ["fireworks/minimax-m2p5: rate limit"],
            occurredAt: 900,
          },
        }),
      ),
      container,
    );

    const indicator = container.querySelector(".compaction-indicator--fallback");
    expect(indicator).not.toBeNull();
    expect(indicator?.textContent).toContain("Fallback active: deepinfra/moonshotai/Kimi-K2.5");
    nowSpy.mockRestore();
  });

  it("hides stale fallback indicator", () => {
    const container = document.createElement("div");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(20_000);
    render(
      renderChat(
        createProps({
          fallbackStatus: {
            selected: "fireworks/minimax-m2p5",
            active: "deepinfra/moonshotai/Kimi-K2.5",
            attempts: [],
            occurredAt: 0,
          },
        }),
      ),
      container,
    );

    expect(container.querySelector(".compaction-indicator--fallback")).toBeNull();
    nowSpy.mockRestore();
  });

  it("renders fallback-cleared indicator shortly after transition", () => {
    const container = document.createElement("div");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    render(
      renderChat(
        createProps({
          fallbackStatus: {
            phase: "cleared",
            selected: "fireworks/minimax-m2p5",
            active: "fireworks/minimax-m2p5",
            previous: "deepinfra/moonshotai/Kimi-K2.5",
            attempts: [],
            occurredAt: 900,
          },
        }),
      ),
      container,
    );

    const indicator = container.querySelector(".compaction-indicator--fallback-cleared");
    expect(indicator).not.toBeNull();
    expect(indicator?.textContent).toContain("Fallback cleared: fireworks/minimax-m2p5");
    nowSpy.mockRestore();
  });

  it("shows a stop button when aborting is available", () => {
    const container = document.createElement("div");
    const onAbort = vi.fn();
    render(
      renderChat(
        createProps({
          canAbort: true,
          onAbort,
        }),
      ),
      container,
    );

    const stopButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "Stop",
    );
    expect(stopButton).not.toBeUndefined();
    stopButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("New session");
  });

  it("shows a new session button when aborting is unavailable", () => {
    const container = document.createElement("div");
    const onNewSession = vi.fn();
    render(
      renderChat(
        createProps({
          canAbort: false,
          onNewSession,
        }),
      ),
      container,
    );

    const newSessionButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "New session",
    );
    expect(newSessionButton).not.toBeUndefined();
    newSessionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onNewSession).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Stop");
  });

  it("renders model selector trigger button and model sheet", () => {
    const container = document.createElement("div");
    const onModelChange = vi.fn();
    const onModelSheetToggle = vi.fn();
    render(
      renderChat(
        createProps({
          modelOptions: ["openai/gpt-4.1", "openai/gpt-4.1-mini"],
          selectedModel: "openai/gpt-4.1",
          onModelChange,
          onModelSheetToggle,
        }),
      ),
      container,
    );

    const trigger = container.querySelector('button[aria-label="Chat model"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toContain("openai/gpt-4.1");

    trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onModelSheetToggle).toHaveBeenCalledTimes(1);
  });

  it("does not trigger send on Enter when sending is disabled", () => {
    const container = document.createElement("div");
    const onSend = vi.fn();
    render(
      renderChat(
        createProps({
          canSend: false,
          onSend,
        }),
      ),
      container,
    );

    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    textarea?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables model selector trigger while model switch is in progress", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          modelOptions: ["opencode/big-pickle"],
          selectedModel: "opencode/big-pickle",
          modelSwitching: true,
          onModelChange: () => undefined,
        }),
      ),
      container,
    );

    const trigger = container.querySelector('button[aria-label="Chat model"]') as HTMLButtonElement;
    expect(trigger?.disabled).toBe(true);
  });

  it("groups model options in model sheet by status and provider", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          modelOptions: [
            "opencode/big-pickle",
            "opencode/gpt-5-nano",
            "copilot-local/claude-opus-4.6",
          ],
          connectableModelOptions: ["opencode/big-pickle", "opencode/gpt-5-nano"],
          boundModelOptions: ["opencode/big-pickle", "copilot-local/claude-opus-4.6"],
          selectedModel: "opencode/big-pickle",
          onModelChange: () => undefined,
          modelSheetOpen: true,
        }),
      ),
      container,
    );

    // Model sheet should be rendered when open
    const sheet = container.querySelector(".model-sheet-panel");
    expect(sheet).not.toBeNull();

    // Should contain all model names
    expect(container.textContent).toContain("opencode/big-pickle");
    expect(container.textContent).toContain("opencode/gpt-5-nano");
    expect(container.textContent).toContain("copilot-local/claude-opus-4.6");

    // Should have group titles
    const groupTitles = Array.from(container.querySelectorAll(".model-sheet__group-title")).map(
      (el) => el.textContent?.trim() ?? "",
    );
    expect(groupTitles.length).toBeGreaterThan(0);
  });

  it("does not render a standalone model-session button", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          modelSessionStates: [{ model: "opencode/gpt-5-nano", status: "unstarted" }],
        }),
      ),
      container,
    );

    const button = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Model session"),
    );
    expect(button).toBeUndefined();
    expect(container.textContent).not.toContain("Model sessions");
    expect(container.textContent).not.toContain("Copilot API");
  });

  it("exposes model session actions inside model card details", () => {
    const container = document.createElement("div");
    const onModelSessionStart = vi.fn();
    const onModelSessionBind = vi.fn();
    const onModelSessionUnbind = vi.fn();
    const onModelSessionClose = vi.fn();
    render(
      renderChat(
        createProps({
          onModelChange: () => undefined,
          modelSheetOpen: true,
          modelSheetExpanded: "opencode/big-pickle",
          modelSessionStates: [
            { model: "opencode/gpt-5-nano", status: "unstarted" },
            { model: "opencode/big-pickle", status: "unbound", sessionId: "sid-unbound" },
            {
              model: "opencode/trinity-large-preview-free",
              status: "bound-self",
              sessionId: "sid-bound",
              boundKey: "main",
            },
          ],
          onModelSessionStart,
          onModelSessionBind,
          onModelSessionUnbind,
          onModelSessionClose,
        }),
      ),
      container,
    );

    // The model sheet should be rendered
    const sheet = container.querySelector(".model-sheet-panel");
    expect(sheet).not.toBeNull();

    // The expanded card should show action buttons
    const expandedCard = container.querySelector(".model-card--expanded");
    expect(expandedCard).not.toBeNull();

    // Should contain model names
    expect(container.textContent).toContain("opencode/gpt-5-nano");
    expect(container.textContent).toContain("opencode/big-pickle");
    expect(container.textContent).toContain("opencode/trinity-large-preview-free");

    // The expanded card (big-pickle with unbound status) should have Bind and Close buttons
    const actionButtons = expandedCard?.querySelectorAll(".model-card__actions .btn");
    expect(actionButtons?.length).toBeGreaterThan(0);
  });

  it("does not expose model session actions for bound-other rows in expanded card", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          onModelChange: () => undefined,
          modelSheetOpen: true,
          modelSheetExpanded: "opencode/minimax-m2.5-free",
          modelSessionStates: [
            {
              model: "opencode/minimax-m2.5-free",
              status: "bound-other",
              sessionId: "sid-other",
              boundKey: "agent:main:other",
            },
          ],
        }),
      ),
      container,
    );

    // The model sheet should be rendered
    const sheet = container.querySelector(".model-sheet-panel");
    expect(sheet).not.toBeNull();

    // The expanded card should not have bind/unbind actions for bound-other
    const expandedCard = container.querySelector(".model-card--expanded");
    expect(expandedCard).not.toBeNull();

    // Bound-other should not show Bind or Unbind buttons
    const buttons = Array.from(expandedCard?.querySelectorAll(".model-card__actions .btn") ?? []);
    const bindButton = buttons.find((btn) => btn.textContent?.trim() === "Bind");
    const unbindButton = buttons.find((btn) => btn.textContent?.trim() === "Unbind");
    expect(bindButton).toBeUndefined();
    expect(unbindButton).toBeUndefined();
  });
});

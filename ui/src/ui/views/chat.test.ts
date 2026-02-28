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

  it("renders model selector and triggers change callback", () => {
    const container = document.createElement("div");
    const onModelChange = vi.fn();
    render(
      renderChat(
        createProps({
          modelOptions: ["openai/gpt-4.1", "openai/gpt-4.1-mini"],
          selectedModel: "openai/gpt-4.1",
          onModelChange,
        }),
      ),
      container,
    );

    const select = container.querySelector('select[aria-label="Chat model"]');
    expect(select).not.toBeNull();
    expect(select?.value).toBe("openai/gpt-4.1");

    if (!select) {
      return;
    }
    select.value = "openai/gpt-4.1-mini";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onModelChange).toHaveBeenCalledWith("openai/gpt-4.1-mini");
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

  it("disables model selector while model switch is in progress", () => {
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

    const select = container.querySelector('select[aria-label="Chat model"]');
    expect(select?.disabled).toBe(true);
  });

  it("groups model options by connectable and binding state", () => {
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
        }),
      ),
      container,
    );

    const labels = Array.from(container.querySelectorAll("optgroup")).map(
      (group) => group.getAttribute("label") ?? "",
    );
    expect(labels).toContain("Connectable · Bound");
    expect(labels).toContain("Connectable · Unbound");
    expect(labels).toContain("Bound · Currently Unavailable");
    expect(container.textContent).toContain("opencode/big-pickle");
    expect(container.textContent).toContain("opencode/gpt-5-nano");
    expect(container.textContent).toContain("copilot-local/claude-opus-4.6");
  });

  it("renders model session binding button and triggers callback", () => {
    const container = document.createElement("div");
    const onEditModelSessionBinding = vi.fn();
    render(
      renderChat(
        createProps({
          onEditModelSessionBinding,
        }),
      ),
      container,
    );

    const button = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "Model session",
    );
    expect(button).not.toBeUndefined();
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onEditModelSessionBinding).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Copilot API");
  });

  it("renders model session rows with start/bind/unbind actions", () => {
    const container = document.createElement("div");
    const onModelSessionStart = vi.fn();
    const onModelSessionBind = vi.fn();
    const onModelSessionUnbind = vi.fn();
    render(
      renderChat(
        createProps({
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
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Model sessions");
    const startButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "Start",
    );
    const bindButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "Bind",
    );
    const unbindButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "Unbind",
    );

    startButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    bindButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    unbindButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onModelSessionStart).toHaveBeenCalledWith("opencode/gpt-5-nano");
    expect(onModelSessionBind).toHaveBeenCalledWith("opencode/big-pickle");
    expect(onModelSessionUnbind).toHaveBeenCalledWith("opencode/trinity-large-preview-free");
  });
});

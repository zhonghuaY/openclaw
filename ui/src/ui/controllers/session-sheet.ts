import type {
  GatewayInfo,
  GatewaySession,
  SessionSheetProps,
} from "../components/session-sheet.ts";

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

type SessionBinding = { gatewayUrl: string; sessionId: string };

const BINDING_PREFIX = "session-binding:";

export function getSessionBinding(sessionKey: string): SessionBinding | null {
  try {
    const raw = localStorage.getItem(BINDING_PREFIX + sessionKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as SessionBinding;
    if (parsed.gatewayUrl && parsed.sessionId) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function setSessionBinding(sessionKey: string, gatewayUrl: string, sessionId: string): void {
  localStorage.setItem(BINDING_PREFIX + sessionKey, JSON.stringify({ gatewayUrl, sessionId }));
}

export function clearSessionBinding(sessionKey: string): void {
  localStorage.removeItem(BINDING_PREFIX + sessionKey);
}

// ---------------------------------------------------------------------------
// Gateway REST API helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSessions(baseUrl: string): Promise<GatewaySession[]> {
  const res = await fetchWithTimeout(`${baseUrl}/sessions`, { method: "GET" }, 5000);
  if (!res.ok) {
    throw new Error(`GET /sessions failed: ${res.status}`);
  }
  return (await res.json()) as GatewaySession[];
}

export async function createSession(
  baseUrl: string,
  sessionId: string,
  model: string,
): Promise<void> {
  const res = await fetchWithTimeout(
    `${baseUrl}/sessions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, model, prewarm: true }),
    },
    10000,
  );
  if (!res.ok) {
    throw new Error(`POST /sessions failed: ${res.status}`);
  }
}

export async function deleteSession(baseUrl: string, sessionId: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${baseUrl}/sessions/${encodeURIComponent(sessionId)}?force=true`,
    { method: "DELETE" },
    5000,
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`DELETE /sessions/${sessionId} failed: ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// Gateway URL extraction
// ---------------------------------------------------------------------------

const knownGateways: Record<string, string> = {
  "copilot-local": "http://127.0.0.1:8001",
  "copilot-remote": "http://10.1.73.240:8001",
};

export function extractGateways(modelOptions: string[]): GatewayInfo[] {
  const seen = new Set<string>();
  const result: GatewayInfo[] = [];

  for (const opt of modelOptions) {
    const slashIdx = opt.indexOf("/");
    if (slashIdx < 0) {
      continue;
    }
    const prefix = opt.slice(0, slashIdx);
    if (seen.has(prefix)) {
      continue;
    }
    seen.add(prefix);
    const baseUrl = knownGateways[prefix];
    if (baseUrl) {
      result.push({ label: prefix, baseUrl });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const AVAILABLE_MODELS = [
  "gpt-4.1",
  "gpt-5.1",
  "gpt-5.2-codex",
  "gpt-5.3-codex",
  "claude-sonnet-4",
  "claude-sonnet-4.5",
  "claude-opus-4.6",
  "gemini-3-pro-preview",
];

export type SessionSheetState = {
  open: boolean;
  gateways: GatewayInfo[];
  activeGatewayIndex: number;
  sessions: GatewaySession[];
  loading: boolean;
  error: string | null;
  showCreateForm: boolean;
  createSessionId: string;
  createModel: string;
};

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export type SessionSheetController = {
  state: SessionSheetState;
  toggle(): void;
  refresh(): Promise<void>;
  bind(sessionKey: string, sessionId: string): void;
  unbind(sessionKey: string): void;
  deleteSession(sessionKey: string, sessionId: string): Promise<void>;
  createSession(): Promise<void>;
  setGateway(index: number): void;
  getProps(
    sessionKey: string,
    modelOptions: string[],
  ): Omit<SessionSheetProps, "open" | "onClose"> | null;
};

export function createSessionSheetController(onUpdate: () => void): SessionSheetController {
  const state: SessionSheetState = {
    open: false,
    gateways: [],
    activeGatewayIndex: 0,
    sessions: [],
    loading: false,
    error: null,
    showCreateForm: false,
    createSessionId: "",
    createModel: AVAILABLE_MODELS[0],
  };

  function activeGateway(): GatewayInfo | undefined {
    return state.gateways[state.activeGatewayIndex];
  }

  async function refresh(): Promise<void> {
    const gw = activeGateway();
    if (!gw) {
      return;
    }
    state.loading = true;
    state.error = null;
    onUpdate();
    try {
      state.sessions = await fetchSessions(gw.baseUrl);
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err);
      state.sessions = [];
    } finally {
      state.loading = false;
      onUpdate();
    }
  }

  const controller: SessionSheetController = {
    state,

    toggle() {
      state.open = !state.open;
      if (state.open && state.gateways.length > 0) {
        void refresh();
      }
      onUpdate();
    },

    refresh,

    bind(sessionKey: string, sessionId: string) {
      const gw = activeGateway();
      if (!gw) {
        return;
      }
      setSessionBinding(sessionKey, gw.baseUrl, sessionId);
      onUpdate();
    },

    unbind(sessionKey: string) {
      clearSessionBinding(sessionKey);
      onUpdate();
    },

    async deleteSession(sessionKey: string, sessionId: string) {
      const gw = activeGateway();
      if (!gw) {
        return;
      }
      try {
        await deleteSession(gw.baseUrl, sessionId);
        // Auto-unbind if we just deleted the currently bound session
        const binding = getSessionBinding(sessionKey);
        if (binding && binding.sessionId === sessionId) {
          clearSessionBinding(sessionKey);
        }
        await refresh();
      } catch (err) {
        state.error = err instanceof Error ? err.message : String(err);
        onUpdate();
      }
    },

    async createSession() {
      const gw = activeGateway();
      if (!gw) {
        return;
      }
      if (!state.createSessionId || !state.createModel) {
        return;
      }
      try {
        await createSession(gw.baseUrl, state.createSessionId, state.createModel);
        state.showCreateForm = false;
        state.createSessionId = "";
        state.createModel = AVAILABLE_MODELS[0];
        await refresh();
      } catch (err) {
        state.error = err instanceof Error ? err.message : String(err);
        onUpdate();
      }
    },

    setGateway(index: number) {
      if (index < 0 || index >= state.gateways.length) {
        return;
      }
      state.activeGatewayIndex = index;
      void refresh();
    },

    getProps(
      sessionKey: string,
      modelOptions: string[],
    ): Omit<SessionSheetProps, "open" | "onClose"> | null {
      // Lazily discover gateways from modelOptions
      const gateways = extractGateways(modelOptions);
      if (gateways.length === 0) {
        return null;
      }

      // Update gateways if they changed
      const gatewaysChanged =
        gateways.length !== state.gateways.length ||
        gateways.some(
          (g, i) =>
            g.label !== state.gateways[i]?.label || g.baseUrl !== state.gateways[i]?.baseUrl,
        );
      if (gatewaysChanged) {
        state.gateways = gateways;
        if (state.activeGatewayIndex >= gateways.length) {
          state.activeGatewayIndex = 0;
        }
      }

      const binding = getSessionBinding(sessionKey);

      return {
        gateways: state.gateways,
        activeGatewayIndex: state.activeGatewayIndex,
        sessions: state.sessions,
        loading: state.loading,
        error: state.error,
        currentSessionKey: sessionKey,
        boundSessionId: binding?.sessionId ?? null,
        showCreateForm: state.showCreateForm,
        createSessionId: state.createSessionId,
        createModel: state.createModel,
        availableModels: AVAILABLE_MODELS,
        onGatewayChange: (index: number) => controller.setGateway(index),
        onRefresh: () => void refresh(),
        onBind: (sessionId: string) => controller.bind(sessionKey, sessionId),
        onUnbind: () => controller.unbind(sessionKey),
        onDelete: (sessionId: string) => void controller.deleteSession(sessionKey, sessionId),
        onCreate: () => void controller.createSession(),
        onToggleCreateForm: () => {
          state.showCreateForm = !state.showCreateForm;
          onUpdate();
        },
        onCreateSessionIdChange: (value: string) => {
          state.createSessionId = value;
          onUpdate();
        },
        onCreateModelChange: (value: string) => {
          state.createModel = value;
          onUpdate();
        },
      };
    },
  };

  return controller;
}

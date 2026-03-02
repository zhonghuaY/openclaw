import { GatewayRequestError, type GatewayBrowserClient } from "../gateway.ts";
import type { ConfigSnapshot } from "../types.ts";

type CopilotServiceState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sessionKey: string;
  configSnapshot: ConfigSnapshot | null;
  lastError: string | null;
};

type ProviderSummary = {
  key: string;
  baseUrl: string;
  api: string;
  modelIds: string[];
  hasApiKey: boolean;
};

const PREFERRED_COPILOT_MODEL_ID = "gpt-4.1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeProviderKey(raw: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "copilot-api";
}

function normalizeApiBaseUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim());
    parsed.search = "";
    parsed.hash = "";

    let pathname = parsed.pathname.replace(/\/+$/, "");
    if (!pathname || pathname === "/") {
      pathname = "/v1";
    }
    parsed.pathname = pathname;

    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function isLoopbackBaseUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    const host = parsed.hostname.trim().toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

function resolveCopilotApiKey(baseUrl: string, rawApiKey?: string): string | undefined {
  const trimmed = rawApiKey?.trim();
  if (trimmed) {
    return trimmed;
  }
  // pi ModelRegistry requires apiKey for providers with declared models.
  // For local trusted OpenAI-compatible gateways, use a harmless placeholder.
  if (isLoopbackBaseUrl(baseUrl)) {
    return "openclaw-local-noauth";
  }
  return undefined;
}

function pickProviderByInput(input: string, providers: ProviderSummary[]): ProviderSummary | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const asIndex = Number.parseInt(trimmed, 10);
  if (Number.isFinite(asIndex) && asIndex >= 1 && asIndex <= providers.length) {
    return providers[asIndex - 1] ?? null;
  }
  return providers.find((provider) => provider.key === trimmed) ?? null;
}

function extractProviders(snapshot: ConfigSnapshot | null): ProviderSummary[] {
  const config = snapshot?.config;
  if (!isRecord(config)) {
    return [];
  }
  const models = config.models;
  if (!isRecord(models)) {
    return [];
  }
  const providers = models.providers;
  if (!isRecord(providers)) {
    return [];
  }

  const results: ProviderSummary[] = [];
  for (const [keyRaw, value] of Object.entries(providers)) {
    if (!isRecord(value)) {
      continue;
    }
    const key = keyRaw.trim();
    const baseUrl = typeof value.baseUrl === "string" ? value.baseUrl.trim() : "";
    const api = typeof value.api === "string" ? value.api.trim() : "";
    const hasApiKey = typeof value.apiKey === "string" && value.apiKey.trim().length > 0;
    const modelIds: string[] = [];
    const modelsRaw = value.models;
    if (Array.isArray(modelsRaw)) {
      for (const model of modelsRaw) {
        if (!isRecord(model)) {
          continue;
        }
        const id = typeof model.id === "string" ? model.id.trim() : "";
        if (!id || modelIds.includes(id)) {
          continue;
        }
        modelIds.push(id);
      }
    }
    if (!key || !baseUrl) {
      continue;
    }
    results.push({
      key,
      baseUrl,
      api,
      modelIds,
      hasApiKey,
    });
  }
  return results;
}

function isLikelyCopilotProvider(provider: ProviderSummary): boolean {
  const key = provider.key.toLowerCase();
  const baseUrl = provider.baseUrl.toLowerCase();
  return (
    key.includes("copilot") ||
    key.includes("cursor") ||
    baseUrl.includes("copilot") ||
    baseUrl.includes("cursor")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function pickSuggestedModelId(modelIds: string[]): string {
  for (const modelId of modelIds) {
    if (modelId.trim().toLowerCase() === PREFERRED_COPILOT_MODEL_ID) {
      return modelId;
    }
  }
  for (const modelId of modelIds) {
    const trimmed = modelId.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return PREFERRED_COPILOT_MODEL_ID;
}

function getDefaultsModelAllowlist(
  snapshot: ConfigSnapshot | null,
): Record<string, unknown> | null {
  const config = snapshot?.config;
  if (!isRecord(config)) {
    return null;
  }
  const agents = config.agents;
  if (!isRecord(agents)) {
    return null;
  }
  const defaults = agents.defaults;
  if (!isRecord(defaults)) {
    return null;
  }
  const models = defaults.models;
  return isRecord(models) ? models : null;
}

function shouldAddModelToAllowlist(snapshot: ConfigSnapshot | null, modelRef: string): boolean {
  const allowlist = getDefaultsModelAllowlist(snapshot);
  if (!allowlist) {
    return false;
  }
  const existingKeys = Object.keys(allowlist);
  if (existingKeys.length === 0) {
    // Keep "allow-any" behavior when no defaults allowlist is configured.
    return false;
  }
  const target = modelRef.trim().toLowerCase();
  return !existingKeys.some((key) => key.trim().toLowerCase() === target);
}

async function fetchConfigSnapshot(state: CopilotServiceState): Promise<ConfigSnapshot | null> {
  if (!state.client || !state.connected) {
    return null;
  }
  const snapshot = await state.client.request<ConfigSnapshot>("config.get", {});
  state.configSnapshot = snapshot;
  return snapshot;
}

async function fetchOpenAiModelIds(baseUrl: string, apiKey?: string): Promise<string[]> {
  const headers: Record<string, string> = {};
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/models`;
  try {
    const res = await fetch(endpoint, { method: "GET", headers });
    if (!res.ok) {
      return [];
    }
    const payload = (await res.json()) as unknown;
    if (!isRecord(payload)) {
      return [];
    }
    const data = payload.data;
    if (!Array.isArray(data)) {
      return [];
    }
    const ids: string[] = [];
    for (const item of data) {
      if (!isRecord(item)) {
        continue;
      }
      const id = typeof item.id === "string" ? item.id.trim() : "";
      if (!id || ids.includes(id)) {
        continue;
      }
      ids.push(id);
    }
    return ids;
  } catch {
    return [];
  }
}

function buildCopilotProviderPatch(params: {
  providerKey: string;
  baseUrl: string;
  modelId: string;
  apiKey?: string;
  addDefaultsAllowlistEntry?: boolean;
}): string {
  const modelDef = {
    id: params.modelId,
    name: params.modelId,
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 200_000,
    maxTokens: 8_192,
  };
  const providerDef: Record<string, unknown> = {
    baseUrl: params.baseUrl,
    api: "openai-completions",
    models: [modelDef],
  };
  if (params.apiKey?.trim()) {
    providerDef.apiKey = params.apiKey.trim();
  }
  const patch: Record<string, unknown> = {
    models: {
      providers: {
        [params.providerKey]: providerDef,
      },
    },
  };
  if (params.addDefaultsAllowlistEntry) {
    patch.agents = {
      defaults: {
        models: {
          [`${params.providerKey}/${params.modelId}`]: {},
        },
      },
    };
  }
  return JSON.stringify(patch);
}

function buildProviderApiKeyPatch(params: { providerKey: string; apiKey: string }): string {
  return JSON.stringify({
    models: {
      providers: {
        [params.providerKey]: {
          apiKey: params.apiKey,
        },
      },
    },
  });
}

async function waitForReconnect(state: CopilotServiceState, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (state.connected) {
      return true;
    }
    await sleep(250);
  }
  return state.connected;
}

async function patchSessionModel(
  state: CopilotServiceState,
  modelRef: string,
  attempts = 12,
): Promise<void> {
  if (!state.client) {
    throw new Error("Gateway client unavailable");
  }
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await state.client.request("sessions.patch", {
        key: state.sessionKey,
        model: modelRef,
      });
      return;
    } catch (err) {
      lastError = err;
      const message = String(err).toLowerCase();
      const retryable =
        message.includes("gateway closed") ||
        message.includes("not connected") ||
        message.includes("session catalog unavailable") ||
        message.includes("model catalog unavailable") ||
        message.includes("unknown model");
      if (!retryable || i >= attempts - 1) {
        break;
      }
      await sleep(700);
    }
  }
  throw (lastError as Error) ?? new Error("sessions.patch failed");
}

async function addCopilotServiceAndAttach(state: CopilotServiceState): Promise<void> {
  if (!state.client) {
    return;
  }
  const rawBaseUrl =
    window.prompt(
      "Copilot API base URL (HTTP). Example: http://127.0.0.1:8080/v1",
      "http://127.0.0.1:8080/v1",
    ) ?? "";
  if (!rawBaseUrl.trim()) {
    return;
  }
  const baseUrl = normalizeApiBaseUrl(rawBaseUrl);
  if (!baseUrl) {
    window.alert("Invalid base URL.");
    return;
  }

  const providerInput =
    window.prompt("Provider key to create/update:", "copilot-api") ?? "copilot-api";
  const providerKey = normalizeProviderKey(providerInput);
  const apiKey = window
    .prompt("API key (optional, leave blank if gateway is already trusted):", "")
    ?.trim();
  const resolvedApiKey = resolveCopilotApiKey(baseUrl, apiKey);

  const discoveredModels = await fetchOpenAiModelIds(baseUrl, apiKey);
  const suggestedModel = pickSuggestedModelId(discoveredModels);
  const modelInput =
    window.prompt(
      discoveredModels.length > 0
        ? `Model ID (detected: ${discoveredModels.join(", ")}):`
        : "Model ID:",
      suggestedModel,
    ) ?? suggestedModel;
  const modelId = modelInput.trim() || suggestedModel;

  const snapshot = await fetchConfigSnapshot(state);
  if (!snapshot) {
    throw new Error("Failed to load config snapshot");
  }
  const modelRef = `${providerKey}/${modelId}`;
  const addDefaultsAllowlistEntry = shouldAddModelToAllowlist(snapshot, modelRef);

  const req: { raw: string; baseHash?: string; sessionKey?: string; note?: string } = {
    raw: buildCopilotProviderPatch({
      providerKey,
      baseUrl,
      modelId,
      apiKey: resolvedApiKey,
      addDefaultsAllowlistEntry,
    }),
    sessionKey: state.sessionKey,
    note: `control-ui copilot service ${providerKey}`,
  };
  const hash = snapshot.hash?.trim();
  if (hash) {
    req.baseHash = hash;
  }

  await state.client.request("config.patch", req);
  await waitForReconnect(state, 10_000);
  await fetchConfigSnapshot(state);

  await patchSessionModel(state, `${providerKey}/${modelId}`);
  window.alert(`Connected ${providerKey}/${modelId} to session ${state.sessionKey}.`);
}

async function connectExistingCopilotService(state: CopilotServiceState): Promise<void> {
  const snapshot = await fetchConfigSnapshot(state);
  const providers = extractProviders(snapshot);
  if (providers.length === 0) {
    window.alert("No providers found in config. Add a Copilot API service first.");
    return;
  }

  const copilotLike = providers.filter(
    (provider) =>
      provider.api === "openai-completions" &&
      (isLikelyCopilotProvider(provider) || provider.modelIds.length > 0),
  );
  const candidates = copilotLike.length > 0 ? copilotLike : providers;

  const options = candidates
    .map(
      (provider, index) =>
        `${index + 1}. ${provider.key} (${provider.baseUrl})${
          provider.modelIds[0] ? ` [${provider.modelIds[0]}]` : ""
        }`,
    )
    .join("\n");
  const picked = window.prompt(
    `Select provider by number or key:\n${options}`,
    candidates[0]?.key ?? "1",
  );
  if (!picked) {
    return;
  }
  const selected = pickProviderByInput(picked, candidates);
  if (!selected) {
    window.alert("Provider selection is invalid.");
    return;
  }

  const suggestedModel = pickSuggestedModelId(selected.modelIds);
  const modelInput = window.prompt("Model ID to use in this session:", suggestedModel);
  if (modelInput == null) {
    return;
  }
  const modelId = modelInput.trim() || suggestedModel;
  if (!selected.hasApiKey) {
    const autoApiKey = resolveCopilotApiKey(selected.baseUrl);
    if (autoApiKey) {
      const apiKeyPatchReq: { raw: string; baseHash?: string; sessionKey?: string; note?: string } =
        {
          raw: buildProviderApiKeyPatch({
            providerKey: selected.key,
            apiKey: autoApiKey,
          }),
          sessionKey: state.sessionKey,
          note: `control-ui copilot service apiKey bootstrap ${selected.key}`,
        };
      const hash = snapshot?.hash?.trim();
      if (hash) {
        apiKeyPatchReq.baseHash = hash;
      }
      await state.client?.request("config.patch", apiKeyPatchReq);
      await waitForReconnect(state, 10_000);
      await fetchConfigSnapshot(state);
    }
  }
  await patchSessionModel(state, `${selected.key}/${modelId}`);
  window.alert(`Connected ${selected.key}/${modelId} to session ${state.sessionKey}.`);
}

export async function connectCopilotServiceFromChat(state: CopilotServiceState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  state.lastError = null;
  try {
    const actionRaw =
      window.prompt(
        'Copilot API action: "add" (new service) or "connect" (existing service)',
        "add",
      ) ?? "";
    const action = actionRaw.trim().toLowerCase();
    if (!action) {
      return;
    }
    if (action === "add" || action === "new") {
      await addCopilotServiceAndAttach(state);
      return;
    }
    if (action === "connect" || action === "existing") {
      await connectExistingCopilotService(state);
      return;
    }
    window.alert('Unknown action. Use "add" or "connect".');
  } catch (err) {
    state.lastError = err instanceof GatewayRequestError ? err.message : String(err);
  }
}

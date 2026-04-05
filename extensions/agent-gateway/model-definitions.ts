import type { ModelDefinitionConfig } from "openclaw/plugin-sdk/provider-model-shared";

export const DEFAULT_AGENT_GATEWAY_LOCAL_HOST = "http://localhost:3000";
export const DEFAULT_AGENT_GATEWAY_REMOTE_HOST = "http://10.1.73.240:3000";

export const DEFAULT_CLI_ROUTE = "cursor";

export const DEFAULT_CONTEXT_WINDOW = 200000;
export const DEFAULT_MAX_TOKENS = 128000;

export const AGENT_GATEWAY_COST: ModelDefinitionConfig["cost"] = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export type GatewayInstance = {
  id: string;
  keyword: string;
  model: string;
  cli: string;
  status: string;
  pid: number;
  createdAt: string;
  lastUsedAt: string;
  requestCount: number;
  turnCount: number;
  restartCount: number;
};

export function buildGatewayModelId(modelName: string, keyword: string): string {
  return `${modelName}/${keyword}`;
}

export function parseGatewayModelId(modelId: string): {
  modelName: string;
  keyword: string;
} {
  const slashIdx = modelId.indexOf("/");
  if (slashIdx === -1) {
    return { modelName: modelId, keyword: "" };
  }
  return {
    modelName: modelId.slice(0, slashIdx),
    keyword: modelId.slice(slashIdx + 1),
  };
}

export function buildGatewayModelDefinition(instance: GatewayInstance): ModelDefinitionConfig {
  const modelId = buildGatewayModelId(instance.model, instance.keyword);
  const cliLabel = instance.cli.toUpperCase();
  return {
    id: modelId,
    name: `${instance.model} [${cliLabel}:${instance.keyword}]`,
    reasoning: true,
    input: ["text"],
    cost: AGENT_GATEWAY_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
    headers: {
      "x-gateway-cli": instance.cli,
    },
  };
}

/**
 * Derives the admin API URL (for `/admin/instances`) from the host base.
 * The admin routes live at the root, not under a CLI prefix.
 */
export function gatewayAdminUrl(hostBase: string): string {
  return hostBase.replace(/\/(cursor|copilot)\/?$/, "");
}

/**
 * Derives the chat API base URL from the host base.
 * Chat routes live under `/{cli}/v1/...`.
 */
export function gatewayChatBaseUrl(hostBase: string, cliRoute = DEFAULT_CLI_ROUTE): string {
  const clean = hostBase.replace(/\/+$/, "");
  if (/\/(cursor|copilot)$/i.test(clean)) {
    return `${clean}/v1`;
  }
  return `${clean}/${cliRoute}/v1`;
}

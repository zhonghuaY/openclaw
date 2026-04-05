import type { ModelProviderConfig } from "openclaw/plugin-sdk/provider-model-shared";
import {
  buildGatewayModelDefinition,
  gatewayAdminUrl,
  gatewayChatBaseUrl,
  DEFAULT_AGENT_GATEWAY_LOCAL_HOST,
  DEFAULT_AGENT_GATEWAY_REMOTE_HOST,
  type GatewayInstance,
} from "./model-definitions.js";

async function fetchGatewayInstances(
  hostBase: string,
  timeoutMs = 5000,
): Promise<GatewayInstance[]> {
  const adminBase = gatewayAdminUrl(hostBase);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${adminBase}/admin/instances`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function filterActiveInstances(instances: GatewayInstance[]): GatewayInstance[] {
  return instances.filter((inst) => inst.status === "ready" || inst.status === "busy");
}

export async function discoverGatewayModels(hostBase: string): Promise<GatewayInstance[]> {
  const all = await fetchGatewayInstances(hostBase);
  return filterActiveInstances(all);
}

export function buildGatewayProviderConfig(
  hostBase: string,
  instances: GatewayInstance[],
): ModelProviderConfig {
  return {
    baseUrl: gatewayChatBaseUrl(hostBase),
    api: "openai-completions",
    apiKey: "agent-gateway-no-key-required",
    models: instances.map(buildGatewayModelDefinition),
  };
}

export async function buildLocalGatewayProvider(
  env?: NodeJS.ProcessEnv,
): Promise<ModelProviderConfig> {
  const hostBase = env?.AGENT_GATEWAY_LOCAL_URL?.trim() || DEFAULT_AGENT_GATEWAY_LOCAL_HOST;
  const instances = await discoverGatewayModels(hostBase);
  return buildGatewayProviderConfig(hostBase, instances);
}

export async function buildRemoteGatewayProvider(
  env?: NodeJS.ProcessEnv,
): Promise<ModelProviderConfig> {
  const hostBase = env?.AGENT_GATEWAY_REMOTE_URL?.trim() || DEFAULT_AGENT_GATEWAY_REMOTE_HOST;
  const instances = await discoverGatewayModels(hostBase);
  return buildGatewayProviderConfig(hostBase, instances);
}

export function resolveGatewayHostBase(
  providerId: string,
  env?: NodeJS.ProcessEnv,
  pluginConfig?: { localUrl?: string; remoteUrl?: string },
): string {
  if (providerId === "cursor-local") {
    return (
      pluginConfig?.localUrl?.trim() ||
      env?.AGENT_GATEWAY_LOCAL_URL?.trim() ||
      DEFAULT_AGENT_GATEWAY_LOCAL_HOST
    );
  }
  return (
    pluginConfig?.remoteUrl?.trim() ||
    env?.AGENT_GATEWAY_REMOTE_URL?.trim() ||
    DEFAULT_AGENT_GATEWAY_REMOTE_HOST
  );
}

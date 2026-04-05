import {
  definePluginEntry,
  type OpenClawPluginApi,
  type ProviderDiscoveryContext,
} from "openclaw/plugin-sdk/plugin-entry";
import { buildProviderReplayFamilyHooks } from "openclaw/plugin-sdk/provider-model-shared";
import {
  buildGatewayModelDefinition,
  gatewayChatBaseUrl,
  DEFAULT_AGENT_GATEWAY_LOCAL_HOST,
  DEFAULT_AGENT_GATEWAY_REMOTE_HOST,
} from "./model-definitions.js";
import { discoverGatewayModels } from "./provider-catalog.js";
import { createAgentGatewayStreamWrapper } from "./stream.js";

const LOCAL_PROVIDER_ID = "cursor-local";
const REMOTE_PROVIDER_ID = "cursor-remote";
const SYNTHETIC_API_KEY = "agent-gateway-no-key-required";

const OPENAI_COMPATIBLE_REPLAY_HOOKS = buildProviderReplayFamilyHooks({
  family: "openai-compatible",
});

type AgentGatewayPluginConfig = {
  localUrl?: string;
  remoteUrl?: string;
  discoveryIntervalMs?: number;
};

function resolveHostBase(
  providerId: string,
  env: NodeJS.ProcessEnv,
  pluginConfig?: AgentGatewayPluginConfig,
): string {
  if (providerId === LOCAL_PROVIDER_ID) {
    return (
      pluginConfig?.localUrl?.trim() ||
      env.AGENT_GATEWAY_LOCAL_URL?.trim() ||
      DEFAULT_AGENT_GATEWAY_LOCAL_HOST
    );
  }
  return (
    pluginConfig?.remoteUrl?.trim() ||
    env.AGENT_GATEWAY_REMOTE_URL?.trim() ||
    DEFAULT_AGENT_GATEWAY_REMOTE_HOST
  );
}

function buildDiscoveryHandler(providerId: string, pluginConfig: AgentGatewayPluginConfig) {
  return async (ctx: ProviderDiscoveryContext) => {
    const explicit = ctx.config.models?.providers?.[providerId];
    const hasExplicitModels = Array.isArray(explicit?.models) && explicit.models.length > 0;

    const hostBase = resolveHostBase(providerId, ctx.env, pluginConfig);

    if (hasExplicitModels && explicit) {
      return {
        provider: {
          ...explicit,
          baseUrl:
            typeof explicit.baseUrl === "string" && explicit.baseUrl.trim()
              ? explicit.baseUrl
              : gatewayChatBaseUrl(hostBase),
          api: explicit.api ?? "openai-completions",
          apiKey: SYNTHETIC_API_KEY,
        },
      };
    }

    const instances = await discoverGatewayModels(hostBase);
    if (instances.length === 0) {
      return null;
    }

    return {
      provider: {
        baseUrl: gatewayChatBaseUrl(hostBase),
        api: "openai-completions" as const,
        apiKey: SYNTHETIC_API_KEY,
        models: instances.map(buildGatewayModelDefinition),
      },
    };
  };
}

function registerGatewayProvider(
  api: OpenClawPluginApi,
  opts: {
    id: string;
    label: string;
    envVars: string[];
    defaultBaseUrl: string;
    pluginConfig: AgentGatewayPluginConfig;
  },
) {
  api.registerProvider({
    id: opts.id,
    label: opts.label,
    docsPath: "/providers/models",
    envVars: opts.envVars,
    discovery: {
      order: "late",
      run: buildDiscoveryHandler(opts.id, opts.pluginConfig),
    },
    auth: [
      {
        id: opts.id,
        label: opts.label,
        hint: `Agent API Gateway (${opts.id})`,
        kind: "custom",
        run: async () => ({
          profiles: [
            {
              profileId: `${opts.id}:default`,
              credential: {
                type: "api_key" as const,
                provider: opts.id,
                key: SYNTHETIC_API_KEY,
              },
            },
          ],
          configPatch: {},
        }),
      },
    ],
    ...OPENAI_COMPATIBLE_REPLAY_HOOKS,
    wrapStreamFn: createAgentGatewayStreamWrapper,
    resolveReasoningOutputMode: () => "native" as const,
    resolveSyntheticAuth: () => ({
      apiKey: SYNTHETIC_API_KEY,
      source: `${opts.id} (no auth required)`,
      mode: "api-key" as const,
    }),
    shouldDeferSyntheticProfileAuth: () => true,
  });
}

export default definePluginEntry({
  id: "agent-gateway",
  name: "Agent API Gateway",
  description: "Dynamic model provider backed by agent-api-gateway PTY sessions (local and remote)",
  register(api: OpenClawPluginApi) {
    const pluginConfig = (api.pluginConfig ?? {}) as AgentGatewayPluginConfig;

    registerGatewayProvider(api, {
      id: LOCAL_PROVIDER_ID,
      label: "Cursor Local",
      envVars: ["AGENT_GATEWAY_LOCAL_URL"],
      defaultBaseUrl: DEFAULT_AGENT_GATEWAY_LOCAL_HOST,
      pluginConfig,
    });

    registerGatewayProvider(api, {
      id: REMOTE_PROVIDER_ID,
      label: "Cursor Remote",
      envVars: ["AGENT_GATEWAY_REMOTE_URL"],
      defaultBaseUrl: DEFAULT_AGENT_GATEWAY_REMOTE_HOST,
      pluginConfig,
    });
  },
});

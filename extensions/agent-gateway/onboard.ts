import {
  applyAgentDefaultModelPrimary,
  withAgentModelAliases,
  type OpenClawConfig,
} from "openclaw/plugin-sdk/provider-onboard";
import {
  gatewayChatBaseUrl,
  DEFAULT_AGENT_GATEWAY_LOCAL_HOST,
  DEFAULT_AGENT_GATEWAY_REMOTE_HOST,
} from "./model-definitions.js";

export function applyAgentGatewayLocalConfig(
  cfg: OpenClawConfig,
  modelRef?: string,
): OpenClawConfig {
  const defaultRef = modelRef ?? "cursor-local/claude-4.6-opus-high";
  const next: OpenClawConfig = {
    ...cfg,
    models: {
      ...cfg.models,
      mode: cfg.models?.mode ?? "merge",
      providers: {
        ...cfg.models?.providers,
        "cursor-local": {
          baseUrl: gatewayChatBaseUrl(DEFAULT_AGENT_GATEWAY_LOCAL_HOST),
          api: "openai-completions",
          apiKey: "agent-gateway-no-key-required",
          models: [],
        },
      },
    },
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models: withAgentModelAliases(cfg.agents?.defaults?.models, [
          { modelRef: defaultRef, alias: "cursor-local" },
        ]),
      },
    },
  };
  return applyAgentDefaultModelPrimary(next, defaultRef);
}

export function applyAgentGatewayRemoteConfig(
  cfg: OpenClawConfig,
  modelRef?: string,
): OpenClawConfig {
  const defaultRef = modelRef ?? "cursor-remote/claude-4.6-opus-high";
  const next: OpenClawConfig = {
    ...cfg,
    models: {
      ...cfg.models,
      mode: cfg.models?.mode ?? "merge",
      providers: {
        ...cfg.models?.providers,
        "cursor-remote": {
          baseUrl: gatewayChatBaseUrl(DEFAULT_AGENT_GATEWAY_REMOTE_HOST),
          api: "openai-completions",
          apiKey: "agent-gateway-no-key-required",
          models: [],
        },
      },
    },
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models: withAgentModelAliases(cfg.agents?.defaults?.models, [
          { modelRef: defaultRef, alias: "cursor-remote" },
        ]),
      },
    },
  };
  return applyAgentDefaultModelPrimary(next, defaultRef);
}

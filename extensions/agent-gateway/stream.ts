import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { ProviderWrapStreamFnContext } from "openclaw/plugin-sdk/plugin-entry";
import { streamWithPayloadPatch } from "openclaw/plugin-sdk/provider-stream-shared";
import { DEFAULT_CLI_ROUTE, parseGatewayModelId } from "./model-definitions.js";

/**
 * Wraps the OpenAI-compatible stream to:
 *   1. Rewrite the `model` field in the JSON body (strip the keyword suffix)
 *   2. Inject the `x-instance-keyword` header for gateway routing
 *   3. Rewrite the baseUrl to use the correct CLI route (/cursor or /copilot)
 *
 * OpenClaw populates `model.id` with `{model-name}/{instance-keyword}`.
 * The agent-api-gateway expects:
 *   - POST `/{cli}/v1/chat/completions` (cli = cursor | copilot)
 *   - `model` in body = model name only
 *   - `x-instance-keyword` header = instance keyword
 */
export function createAgentGatewayStreamWrapper(
  ctx: ProviderWrapStreamFnContext,
): StreamFn | undefined {
  const underlying = ctx.streamFn;
  if (!underlying) {
    return undefined;
  }

  return (model, context, options) => {
    const { modelName, keyword } = parseGatewayModelId(model.id);

    const cliRoute = model.headers?.["x-gateway-cli"] ?? DEFAULT_CLI_ROUTE;

    const patchedModel = rewriteModelBaseUrl(model, cliRoute);

    const mergedHeaders: Record<string, string> = {
      ...options?.headers,
    };
    if (keyword) {
      mergedHeaders["x-instance-keyword"] = keyword;
    }

    return streamWithPayloadPatch(
      underlying,
      patchedModel,
      context,
      { ...options, headers: mergedHeaders },
      (payload) => {
        payload.model = modelName;
      },
    );
  };
}

/**
 * Rewrite the model's baseUrl so `/{oldCli}/v1` becomes `/{newCli}/v1`.
 * Handles the case where the original URL already contains a CLI prefix.
 */
function rewriteModelBaseUrl(
  model: Parameters<StreamFn>[0],
  cliRoute: string,
): Parameters<StreamFn>[0] {
  if (!model.baseUrl) {
    return model;
  }
  const rewritten = model.baseUrl.replace(/\/(cursor|copilot)\/v1\/?$/i, `/${cliRoute}/v1`);
  if (rewritten === model.baseUrl) {
    return model;
  }
  return { ...model, baseUrl: rewritten };
}

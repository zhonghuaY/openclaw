import { randomUUID } from "node:crypto";
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import type { ModelCatalogEntry } from "../agents/model-catalog.js";
import {
  normalizeProviderId,
  resolveAllowedModelRef,
  resolveDefaultModelForAgent,
  resolveSubagentConfiguredModelSelection,
} from "../agents/model-selection.js";
import { normalizeGroupActivation } from "../auto-reply/group-activation.js";
import {
  formatThinkingLevels,
  formatXHighModelHint,
  normalizeElevatedLevel,
  normalizeReasoningLevel,
  normalizeThinkLevel,
  normalizeUsageDisplay,
  supportsXHighThinking,
} from "../auto-reply/thinking.js";
import type { OpenClawConfig } from "../config/config.js";
import type { SessionEntry } from "../config/sessions.js";
import {
  isSubagentSessionKey,
  normalizeAgentId,
  parseAgentSessionKey,
} from "../routing/session-key.js";
import { applyVerboseOverride, parseVerboseOverride } from "../sessions/level-overrides.js";
import { applyModelOverrideToSessionEntry } from "../sessions/model-overrides.js";
import { normalizeSendPolicy } from "../sessions/send-policy.js";
import { parseSessionLabel } from "../sessions/session-label.js";
import {
  ErrorCodes,
  type ErrorShape,
  errorShape,
  type SessionsPatchParams,
} from "./protocol/index.js";

function invalid(message: string): { ok: false; error: ErrorShape } {
  return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, message) };
}

function normalizeExecHost(raw: string): "sandbox" | "gateway" | "node" | undefined {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "sandbox" || normalized === "gateway" || normalized === "node") {
    return normalized;
  }
  return undefined;
}

function normalizeExecSecurity(raw: string): "deny" | "allowlist" | "full" | undefined {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "deny" || normalized === "allowlist" || normalized === "full") {
    return normalized;
  }
  return undefined;
}

function normalizeExecAsk(raw: string): "off" | "on-miss" | "always" | undefined {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "off" || normalized === "on-miss" || normalized === "always") {
    return normalized;
  }
  return undefined;
}

function getProviderCliSessionId(entry: SessionEntry | undefined, provider: string): string {
  if (!entry) {
    return "";
  }
  const fromMap = entry.cliSessionIds?.[provider]?.trim() ?? "";
  if (fromMap) {
    return fromMap;
  }
  if (provider === "claude-cli") {
    return entry.claudeCliSessionId?.trim() ?? "";
  }
  return "";
}

function normalizeModelSessionRef(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.toLowerCase();
}

export async function applySessionsPatchToStore(params: {
  cfg: OpenClawConfig;
  store: Record<string, SessionEntry>;
  storeKey: string;
  patch: SessionsPatchParams;
  loadGatewayModelCatalog?: () => Promise<ModelCatalogEntry[]>;
}): Promise<{ ok: true; entry: SessionEntry } | { ok: false; error: ErrorShape }> {
  const { cfg, store, storeKey, patch } = params;
  const now = Date.now();
  const parsedAgent = parseAgentSessionKey(storeKey);
  const sessionAgentId = normalizeAgentId(parsedAgent?.agentId ?? resolveDefaultAgentId(cfg));
  const resolvedDefault = resolveDefaultModelForAgent({ cfg, agentId: sessionAgentId });
  const subagentModelHint = isSubagentSessionKey(storeKey)
    ? resolveSubagentConfiguredModelSelection({ cfg, agentId: sessionAgentId })
    : undefined;

  const existing = store[storeKey];
  const next: SessionEntry = existing
    ? {
        ...existing,
        updatedAt: Math.max(existing.updatedAt ?? 0, now),
      }
    : { sessionId: randomUUID(), updatedAt: now };

  if ("spawnedBy" in patch) {
    const raw = patch.spawnedBy;
    if (raw === null) {
      if (existing?.spawnedBy) {
        return invalid("spawnedBy cannot be cleared once set");
      }
    } else if (raw !== undefined) {
      const trimmed = String(raw).trim();
      if (!trimmed) {
        return invalid("invalid spawnedBy: empty");
      }
      if (!isSubagentSessionKey(storeKey)) {
        return invalid("spawnedBy is only supported for subagent:* sessions");
      }
      if (existing?.spawnedBy && existing.spawnedBy !== trimmed) {
        return invalid("spawnedBy cannot be changed once set");
      }
      next.spawnedBy = trimmed;
    }
  }

  if ("spawnDepth" in patch) {
    const raw = patch.spawnDepth;
    if (raw === null) {
      if (typeof existing?.spawnDepth === "number") {
        return invalid("spawnDepth cannot be cleared once set");
      }
    } else if (raw !== undefined) {
      if (!isSubagentSessionKey(storeKey)) {
        return invalid("spawnDepth is only supported for subagent:* sessions");
      }
      const numeric = Number(raw);
      if (!Number.isInteger(numeric) || numeric < 0) {
        return invalid("invalid spawnDepth (use an integer >= 0)");
      }
      const normalized = numeric;
      if (typeof existing?.spawnDepth === "number" && existing.spawnDepth !== normalized) {
        return invalid("spawnDepth cannot be changed once set");
      }
      next.spawnDepth = normalized;
    }
  }

  if ("label" in patch) {
    const raw = patch.label;
    if (raw === null) {
      delete next.label;
    } else if (raw !== undefined) {
      const parsed = parseSessionLabel(raw);
      if (!parsed.ok) {
        return invalid(parsed.error);
      }
      for (const [key, entry] of Object.entries(store)) {
        if (key === storeKey) {
          continue;
        }
        if (entry?.label === parsed.label) {
          return invalid(`label already in use: ${parsed.label}`);
        }
      }
      next.label = parsed.label;
    }
  }

  if ("displayName" in patch) {
    const raw = patch.displayName;
    if (raw === null) {
      delete next.displayName;
    } else if (raw !== undefined) {
      next.displayName = String(raw).trim().slice(0, 100);
    }
  }

  if ("thinkingLevel" in patch) {
    const raw = patch.thinkingLevel;
    if (raw === null) {
      // Clear the override and fall back to model default
      delete next.thinkingLevel;
    } else if (raw !== undefined) {
      const normalized = normalizeThinkLevel(String(raw));
      if (!normalized) {
        const hintProvider = existing?.providerOverride?.trim() || resolvedDefault.provider;
        const hintModel = existing?.modelOverride?.trim() || resolvedDefault.model;
        return invalid(
          `invalid thinkingLevel (use ${formatThinkingLevels(hintProvider, hintModel, "|")})`,
        );
      }
      next.thinkingLevel = normalized;
    }
  }

  if ("verboseLevel" in patch) {
    const raw = patch.verboseLevel;
    const parsed = parseVerboseOverride(raw);
    if (!parsed.ok) {
      return invalid(parsed.error);
    }
    applyVerboseOverride(next, parsed.value);
  }

  if ("reasoningLevel" in patch) {
    const raw = patch.reasoningLevel;
    if (raw === null) {
      delete next.reasoningLevel;
    } else if (raw !== undefined) {
      const normalized = normalizeReasoningLevel(String(raw));
      if (!normalized) {
        return invalid('invalid reasoningLevel (use "on"|"off"|"stream")');
      }
      // Persist "off" explicitly so that resolveDefaultReasoningLevel()
      // does not re-enable reasoning for capable models (#24406).
      next.reasoningLevel = normalized;
    }
  }

  if ("responseUsage" in patch) {
    const raw = patch.responseUsage;
    if (raw === null) {
      delete next.responseUsage;
    } else if (raw !== undefined) {
      const normalized = normalizeUsageDisplay(String(raw));
      if (!normalized) {
        return invalid('invalid responseUsage (use "off"|"tokens"|"full")');
      }
      if (normalized === "off") {
        delete next.responseUsage;
      } else {
        next.responseUsage = normalized;
      }
    }
  }

  if ("elevatedLevel" in patch) {
    const raw = patch.elevatedLevel;
    if (raw === null) {
      delete next.elevatedLevel;
    } else if (raw !== undefined) {
      const normalized = normalizeElevatedLevel(String(raw));
      if (!normalized) {
        return invalid('invalid elevatedLevel (use "on"|"off"|"ask"|"full")');
      }
      // Persist "off" explicitly so patches can override defaults.
      next.elevatedLevel = normalized;
    }
  }

  if ("execHost" in patch) {
    const raw = patch.execHost;
    if (raw === null) {
      delete next.execHost;
    } else if (raw !== undefined) {
      const normalized = normalizeExecHost(String(raw));
      if (!normalized) {
        return invalid('invalid execHost (use "sandbox"|"gateway"|"node")');
      }
      next.execHost = normalized;
    }
  }

  if ("execSecurity" in patch) {
    const raw = patch.execSecurity;
    if (raw === null) {
      delete next.execSecurity;
    } else if (raw !== undefined) {
      const normalized = normalizeExecSecurity(String(raw));
      if (!normalized) {
        return invalid('invalid execSecurity (use "deny"|"allowlist"|"full")');
      }
      next.execSecurity = normalized;
    }
  }

  if ("execAsk" in patch) {
    const raw = patch.execAsk;
    if (raw === null) {
      delete next.execAsk;
    } else if (raw !== undefined) {
      const normalized = normalizeExecAsk(String(raw));
      if (!normalized) {
        return invalid('invalid execAsk (use "off"|"on-miss"|"always")');
      }
      next.execAsk = normalized;
    }
  }

  if ("execNode" in patch) {
    const raw = patch.execNode;
    if (raw === null) {
      delete next.execNode;
    } else if (raw !== undefined) {
      const trimmed = String(raw).trim();
      if (!trimmed) {
        return invalid("invalid execNode: empty");
      }
      next.execNode = trimmed;
    }
  }

  if ("model" in patch) {
    const raw = patch.model;
    if (raw === null) {
      applyModelOverrideToSessionEntry({
        entry: next,
        selection: {
          provider: resolvedDefault.provider,
          model: resolvedDefault.model,
          isDefault: true,
        },
      });
    } else if (raw !== undefined) {
      const trimmed = String(raw).trim();
      if (!trimmed) {
        return invalid("invalid model: empty");
      }
      if (!params.loadGatewayModelCatalog) {
        return {
          ok: false,
          error: errorShape(ErrorCodes.UNAVAILABLE, "model catalog unavailable"),
        };
      }
      const catalog = await params.loadGatewayModelCatalog();
      const resolved = resolveAllowedModelRef({
        cfg,
        catalog,
        raw: trimmed,
        defaultProvider: resolvedDefault.provider,
        defaultModel: subagentModelHint ?? resolvedDefault.model,
      });
      if ("error" in resolved) {
        return invalid(resolved.error);
      }
      const isDefault =
        resolved.ref.provider === resolvedDefault.provider &&
        resolved.ref.model === resolvedDefault.model;
      applyModelOverrideToSessionEntry({
        entry: next,
        selection: {
          provider: resolved.ref.provider,
          model: resolved.ref.model,
          isDefault,
        },
      });
    }
  }

  if ("modelSessionModel" in patch || "modelSessionOp" in patch || "modelSessionId" in patch) {
    const rawModelRef = typeof patch.modelSessionModel === "string" ? patch.modelSessionModel : "";
    const modelSessionRef = normalizeModelSessionRef(rawModelRef);
    if (!modelSessionRef) {
      return invalid("modelSessionModel required");
    }
    const op = patch.modelSessionOp;
    if (!op) {
      return invalid("modelSessionOp required");
    }
    if (op === "bind" || op === "unbind") {
      if (storeKey === "global") {
        return invalid("modelSession bind/unbind requires a non-global session key");
      }
    }
    const requestedSessionId =
      typeof patch.modelSessionId === "string" ? patch.modelSessionId.trim() : undefined;
    if ("modelSessionId" in patch && patch.modelSessionId !== null && !requestedSessionId) {
      return invalid("invalid modelSessionId: empty");
    }

    const globalEntry: SessionEntry = store.global
      ? {
          ...store.global,
          updatedAt: Math.max(store.global.updatedAt ?? 0, now),
        }
      : { sessionId: randomUUID(), updatedAt: now };
    const nextRegistry = { ...globalEntry.modelSessions };
    const current = nextRegistry[modelSessionRef];
    const isSessionIdTaken = (sessionId: string, exceptModel: string) =>
      Object.entries(nextRegistry).some(([modelRef, entry]) => {
        if (modelRef === exceptModel) {
          return false;
        }
        return (entry?.sessionId ?? "").trim() === sessionId;
      });

    if (op === "start") {
      if (current) {
        if (requestedSessionId && requestedSessionId !== current.sessionId) {
          return invalid(`model session already started for ${modelSessionRef}`);
        }
      } else {
        const sessionId = requestedSessionId || randomUUID();
        if (isSessionIdTaken(sessionId, modelSessionRef)) {
          return invalid(`modelSessionId already exists: ${sessionId}`);
        }
        nextRegistry[modelSessionRef] = {
          sessionId,
          updatedAt: now,
        };
      }
    } else if (op === "bind") {
      if (!current?.sessionId) {
        return invalid(`model session not started: ${modelSessionRef}`);
      }
      if (requestedSessionId && requestedSessionId !== current.sessionId) {
        return invalid(`modelSessionId mismatch for ${modelSessionRef}`);
      }
      if (current.boundKey && current.boundKey !== storeKey) {
        return invalid(`model session already bound to ${current.boundKey}`);
      }
      nextRegistry[modelSessionRef] = {
        ...current,
        boundKey: storeKey,
        updatedAt: now,
      };
    } else if (op === "unbind") {
      if (!current?.sessionId) {
        return invalid(`model session not started: ${modelSessionRef}`);
      }
      if (current.boundKey !== storeKey) {
        return invalid(`model session is not bound to ${storeKey}`);
      }
      const rest = { ...current };
      delete rest.boundKey;
      nextRegistry[modelSessionRef] = {
        ...rest,
        updatedAt: now,
      };
    } else if (op === "close") {
      if (!current?.sessionId) {
        return invalid(`model session not started: ${modelSessionRef}`);
      }
      if (current.boundKey && current.boundKey !== storeKey && storeKey !== "global") {
        return invalid(`model session is bound to ${current.boundKey}`);
      }
      delete nextRegistry[modelSessionRef];
    }

    if (Object.keys(nextRegistry).length === 0) {
      delete globalEntry.modelSessions;
    } else {
      globalEntry.modelSessions = nextRegistry;
    }

    // Keep model-session updates when patching the "global" session itself.
    if (storeKey === "global") {
      if (globalEntry.modelSessions) {
        next.modelSessions = globalEntry.modelSessions;
      } else {
        delete next.modelSessions;
      }
      next.updatedAt = Math.max(next.updatedAt ?? 0, globalEntry.updatedAt ?? now);
      store.global = next;
    } else {
      store.global = globalEntry;
    }
  }

  if ("cliProvider" in patch && !("cliSessionId" in patch)) {
    return invalid("cliProvider requires cliSessionId");
  }

  if ("cliSessionId" in patch) {
    const rawProvider =
      typeof patch.cliProvider === "string" && patch.cliProvider.trim()
        ? patch.cliProvider
        : (next.providerOverride ?? next.modelProvider ?? resolvedDefault.provider);
    const normalizedProvider = normalizeProviderId(String(rawProvider ?? ""));
    if (!normalizedProvider) {
      return invalid("invalid cliProvider: empty");
    }

    const rawCliSessionId = patch.cliSessionId;
    if (rawCliSessionId === null) {
      const nextCliSessionIds = { ...next.cliSessionIds };
      delete nextCliSessionIds[normalizedProvider];
      if (Object.keys(nextCliSessionIds).length === 0) {
        delete next.cliSessionIds;
      } else {
        next.cliSessionIds = nextCliSessionIds;
      }
      if (normalizedProvider === "claude-cli") {
        delete next.claudeCliSessionId;
      }
    } else if (rawCliSessionId !== undefined) {
      const trimmedCliSessionId = String(rawCliSessionId).trim();
      if (!trimmedCliSessionId) {
        return invalid("invalid cliSessionId: empty");
      }
      for (const [candidateKey, candidateEntry] of Object.entries(store)) {
        if (candidateKey === storeKey) {
          continue;
        }
        const candidateCliSessionId = getProviderCliSessionId(candidateEntry, normalizedProvider);
        if (candidateCliSessionId && candidateCliSessionId === trimmedCliSessionId) {
          return invalid(
            `cliSessionId already bound for provider ${normalizedProvider}: ${candidateKey}`,
          );
        }
      }
      next.cliSessionIds = {
        ...next.cliSessionIds,
        [normalizedProvider]: trimmedCliSessionId,
      };
      if (normalizedProvider === "claude-cli") {
        next.claudeCliSessionId = trimmedCliSessionId;
      }
    }
  }

  if (next.thinkingLevel === "xhigh") {
    const effectiveProvider = next.providerOverride ?? resolvedDefault.provider;
    const effectiveModel = next.modelOverride ?? resolvedDefault.model;
    if (!supportsXHighThinking(effectiveProvider, effectiveModel)) {
      if ("thinkingLevel" in patch) {
        return invalid(`thinkingLevel "xhigh" is only supported for ${formatXHighModelHint()}`);
      }
      next.thinkingLevel = "high";
    }
  }

  if ("sendPolicy" in patch) {
    const raw = patch.sendPolicy;
    if (raw === null) {
      delete next.sendPolicy;
    } else if (raw !== undefined) {
      const normalized = normalizeSendPolicy(String(raw));
      if (!normalized) {
        return invalid('invalid sendPolicy (use "allow"|"deny")');
      }
      next.sendPolicy = normalized;
    }
  }

  if ("groupActivation" in patch) {
    const raw = patch.groupActivation;
    if (raw === null) {
      delete next.groupActivation;
    } else if (raw !== undefined) {
      const normalized = normalizeGroupActivation(String(raw));
      if (!normalized) {
        return invalid('invalid groupActivation (use "mention"|"always")');
      }
      next.groupActivation = normalized;
    }
  }

  store[storeKey] = next;
  return { ok: true, entry: next };
}

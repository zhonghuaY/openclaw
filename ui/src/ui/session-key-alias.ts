import type { GatewaySessionRow } from "./types.ts";

const DEFAULT_MAIN_KEY = "main";

export type SessionKeyDefaults = {
  defaultAgentId?: string | null;
  mainKey?: string | null;
  mainSessionKey?: string | null;
};

function normalizeToken(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function resolveMainKey(defaults?: SessionKeyDefaults): string {
  return normalizeToken(defaults?.mainKey) || DEFAULT_MAIN_KEY;
}

function buildMainAliasSet(defaults?: SessionKeyDefaults): Set<string> {
  const aliases = new Set<string>();
  aliases.add(DEFAULT_MAIN_KEY);

  const mainKey = resolveMainKey(defaults);
  aliases.add(mainKey);

  const mainSessionKey = normalizeToken(defaults?.mainSessionKey);
  if (mainSessionKey) {
    aliases.add(mainSessionKey);
  }

  const defaultAgentId = normalizeToken(defaults?.defaultAgentId);
  if (defaultAgentId) {
    aliases.add(`agent:${defaultAgentId}:main`);
    aliases.add(`agent:${defaultAgentId}:${mainKey}`);
  }

  return aliases;
}

export function normalizeSessionKeyForComparison(
  value: string | null | undefined,
  defaults?: SessionKeyDefaults,
): string {
  const key = normalizeToken(value);
  if (!key) {
    return "";
  }
  const aliases = buildMainAliasSet(defaults);
  if (!aliases.has(key)) {
    return key;
  }

  const mainSessionKey = normalizeToken(defaults?.mainSessionKey);
  if (mainSessionKey) {
    return mainSessionKey;
  }
  const defaultAgentId = normalizeToken(defaults?.defaultAgentId);
  if (defaultAgentId) {
    return `agent:${defaultAgentId}:${resolveMainKey(defaults)}`;
  }
  return resolveMainKey(defaults);
}

export function sessionKeysEquivalent(
  left: string | null | undefined,
  right: string | null | undefined,
  defaults?: SessionKeyDefaults,
): boolean {
  const a = normalizeSessionKeyForComparison(left, defaults);
  const b = normalizeSessionKeyForComparison(right, defaults);
  return Boolean(a) && a === b;
}

export function findSessionRowByEquivalentKey(
  sessions: GatewaySessionRow[] | null | undefined,
  key: string | null | undefined,
  defaults?: SessionKeyDefaults,
): GatewaySessionRow | undefined {
  const list = Array.isArray(sessions) ? sessions : [];
  if (list.length === 0) {
    return undefined;
  }
  const normalizedRaw = normalizeToken(key);
  if (!normalizedRaw) {
    return undefined;
  }
  const exact = list.find((row) => normalizeToken(row.key) === normalizedRaw);
  if (exact) {
    return exact;
  }
  const target = normalizeSessionKeyForComparison(normalizedRaw, defaults);
  if (target) {
    const aliasMatch = list.find(
      (row) => normalizeSessionKeyForComparison(row.key, defaults) === target,
    );
    if (aliasMatch) {
      return aliasMatch;
    }
  }
  // Fallback: match bare key against agent-prefixed keys (e.g. "chat-X" ↔ "agent:main:chat-X")
  const defaultAgentId = normalizeToken(defaults?.defaultAgentId);
  if (defaultAgentId) {
    const prefix = `agent:${defaultAgentId}:`;
    const bareKey = normalizedRaw.startsWith(prefix)
      ? normalizedRaw.slice(prefix.length)
      : normalizedRaw;
    return list.find((row) => {
      const rowKey = normalizeToken(row.key);
      const bareRowKey = rowKey.startsWith(prefix) ? rowKey.slice(prefix.length) : rowKey;
      return bareRowKey === bareKey;
    });
  }
  return undefined;
}

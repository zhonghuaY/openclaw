import { createSubsystemLogger } from "../logging/subsystem.js";
import { parseBooleanValue } from "../utils/boolean.js";

const log = createSubsystemLogger("env");
const loggedEnv = new Set<string>();

type AcceptedEnvOption = {
  key: string;
  description: string;
  value?: string;
  redact?: boolean;
};

function formatEnvValue(value: string, redact?: boolean): string {
  if (redact) {
    return "<redacted>";
  }
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 160) {
    return singleLine;
  }
  return `${singleLine.slice(0, 160)}…`;
}

export function logAcceptedEnvOption(option: AcceptedEnvOption): void {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return;
  }
  if (loggedEnv.has(option.key)) {
    return;
  }
  const rawValue = option.value ?? process.env[option.key];
  if (!rawValue || !rawValue.trim()) {
    return;
  }
  loggedEnv.add(option.key);
  log.info(`env: ${option.key}=${formatEnvValue(rawValue, option.redact)} (${option.description})`);
}

export function normalizeZaiEnv(): void {
  if (!process.env.ZAI_API_KEY?.trim() && process.env.Z_AI_API_KEY?.trim()) {
    process.env.ZAI_API_KEY = process.env.Z_AI_API_KEY;
  }
}

const LOOPBACK_NO_PROXY_ENTRIES = ["localhost", "127.0.0.1", "::1"] as const;
const DEFAULT_HOOK_PHASE_TIMEOUT_MS = 8000;
const MIN_HOOK_PHASE_TIMEOUT_MS = 50;
const MAX_HOOK_PHASE_TIMEOUT_MS = 120_000;

function splitNoProxyEntries(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeNoProxyLoopbackEnv(): void {
  const currentRaw = process.env.NO_PROXY?.trim() || process.env.no_proxy?.trim() || "";
  const currentEntries = splitNoProxyEntries(currentRaw);
  const lowered = new Set(currentEntries.map((entry) => entry.toLowerCase()));
  const missing = LOOPBACK_NO_PROXY_ENTRIES.filter((entry) => !lowered.has(entry));
  if (missing.length === 0) {
    return;
  }
  const merged = [...currentEntries, ...missing].join(",");
  process.env.NO_PROXY = merged;
  process.env.no_proxy = merged;
}

export function isTruthyEnvValue(value?: string): boolean {
  return parseBooleanValue(value) === true;
}

export function resolveHookPhaseTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.OPENCLAW_HOOK_PHASE_TIMEOUT_MS?.trim();
  if (!raw) {
    return DEFAULT_HOOK_PHASE_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HOOK_PHASE_TIMEOUT_MS;
  }
  const bounded = Math.max(MIN_HOOK_PHASE_TIMEOUT_MS, Math.min(MAX_HOOK_PHASE_TIMEOUT_MS, parsed));
  logAcceptedEnvOption({
    key: "OPENCLAW_HOOK_PHASE_TIMEOUT_MS",
    description: `per-phase plugin hook timeout in milliseconds (default=${DEFAULT_HOOK_PHASE_TIMEOUT_MS})`,
    value: String(bounded),
  });
  return bounded;
}

export function normalizeEnv(): void {
  normalizeZaiEnv();
  normalizeNoProxyLoopbackEnv();
}

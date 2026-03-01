import { html, nothing } from "lit";
import type { ModelSessionState } from "../views/chat.ts";
import { renderModelCard } from "./model-card.ts";

export type ModelSheetProps = {
  open: boolean;
  modelOptions: string[];
  connectableModelOptions: string[];
  boundModelOptions: string[];
  modelSessionStates: ModelSessionState[];
  selectedModel: string | null;
  defaultModel: string | null;
  searchQuery: string;
  expandedModel: string | null;
  onClose: () => void;
  onSearchChange: (query: string) => void;
  onExpandToggle: (model: string | null) => void;
  onModelChange: (model: string | null) => void;
  onModelSessionStart?: (model: string) => void;
  onModelSessionBind?: (model: string) => void;
  onModelSessionUnbind?: (model: string) => void;
  onModelSessionClose?: (model: string) => void;
};

type ProviderInfo = { name: string; cssClass: string };

function detectProvider(model: string): ProviderInfo {
  // Strip provider prefix (e.g. "copilot-local/claude-opus-4.6" → "claude-opus-4.6")
  const baseName = model.includes("/") ? model.split("/").pop()! : model;
  const lower = baseName.toLowerCase();
  if (lower.startsWith("claude")) {
    return { name: "Anthropic", cssClass: "anthropic" };
  }
  if (
    lower.startsWith("gpt") ||
    lower.startsWith("o1") ||
    lower.startsWith("o3") ||
    lower.startsWith("o4")
  ) {
    return { name: "OpenAI", cssClass: "openai" };
  }
  if (lower.startsWith("gemini")) {
    return { name: "Google", cssClass: "google" };
  }
  if (lower.startsWith("glm")) {
    return { name: "Zhipu", cssClass: "other" };
  }
  return { name: "Other", cssClass: "other" };
}

function normalizeKey(v: string): string {
  return v.trim().toLowerCase();
}

type GroupedModels = {
  active: string[];
  available: Map<string, string[]>; // provider → models
  unavailable: string[];
};

function groupModels(props: ModelSheetProps, query: string): GroupedModels {
  const connectable = new Set(props.connectableModelOptions.map(normalizeKey));
  const bound = new Set(props.boundModelOptions.map(normalizeKey));
  const sessionMap = new Map(props.modelSessionStates.map((s) => [normalizeKey(s.model), s]));

  const allModels = Array.from(
    new Set(
      [
        ...props.modelOptions,
        ...props.connectableModelOptions,
        ...props.boundModelOptions,
        ...props.modelSessionStates.map((s) => s.model),
      ]
        .map((m) => m.trim())
        .filter(Boolean),
    ),
  ).toSorted((a, b) => a.localeCompare(b));

  const lowerQuery = query.toLowerCase().trim();
  const filtered = lowerQuery
    ? allModels.filter((m) => {
        const provider = detectProvider(m);
        return (
          m.toLowerCase().includes(lowerQuery) || provider.name.toLowerCase().includes(lowerQuery)
        );
      })
    : allModels;

  const active: string[] = [];
  const availableMap = new Map<string, string[]>();
  const unavailable: string[] = [];

  for (const model of filtered) {
    const key = normalizeKey(model);
    const session = sessionMap.get(key);
    const isBound = session?.status === "bound-self" || session?.status === "bound-other";
    const isConnectable = connectable.has(key);

    if (isBound) {
      active.push(model);
    } else if (isConnectable || bound.has(key)) {
      const provider = detectProvider(model);
      const list = availableMap.get(provider.name) ?? [];
      list.push(model);
      availableMap.set(provider.name, list);
    } else {
      unavailable.push(model);
    }
  }

  return { active, available: availableMap, unavailable };
}

function getModelStatus(
  model: string,
  props: ModelSheetProps,
): ModelSessionState["status"] | "available" | "unavailable" {
  const key = normalizeKey(model);
  const session = props.modelSessionStates.find((s) => normalizeKey(s.model) === key);
  if (session) {
    return session.status;
  }
  const connectable = new Set(props.connectableModelOptions.map(normalizeKey));
  if (connectable.has(key)) {
    return "available";
  }
  return "unavailable";
}

function getSessionState(
  model: string,
  states: ModelSessionState[],
): ModelSessionState | undefined {
  const key = normalizeKey(model);
  return states.find((s) => normalizeKey(s.model) === key);
}

function renderProviderGroup(providerName: string, models: string[], props: ModelSheetProps) {
  const info = detectProvider(models[0] ?? "");
  return html`
    <div class="model-sheet__provider-title">
      <span class="model-sheet__provider-dot model-sheet__provider-dot--${info.cssClass}"></span>
      ${providerName}
    </div>
    ${models.map((model) => {
      const provider = detectProvider(model);
      const status = getModelStatus(model, props);
      return renderModelCard({
        model,
        provider: provider.name,
        providerClass: provider.cssClass,
        status,
        sessionState: getSessionState(model, props.modelSessionStates),
        isSelected: normalizeKey(props.selectedModel ?? "") === normalizeKey(model),
        isExpanded: props.expandedModel === model,
        onToggleExpand: () => props.onExpandToggle(props.expandedModel === model ? null : model),
        onSelect: (m) => {
          props.onModelChange(m);
          props.onClose();
        },
        onSessionStart: props.onModelSessionStart,
        onSessionBind: props.onModelSessionBind,
        onSessionUnbind: props.onModelSessionUnbind,
        onSessionClose: props.onModelSessionClose,
      });
    })}
  `;
}

function renderModelList(models: string[], props: ModelSheetProps) {
  return models.map((model) => {
    const provider = detectProvider(model);
    const status = getModelStatus(model, props);
    return renderModelCard({
      model,
      provider: provider.name,
      providerClass: provider.cssClass,
      status,
      sessionState: getSessionState(model, props.modelSessionStates),
      isSelected: normalizeKey(props.selectedModel ?? "") === normalizeKey(model),
      isExpanded: props.expandedModel === model,
      onToggleExpand: () => props.onExpandToggle(props.expandedModel === model ? null : model),
      onSelect: (m) => {
        props.onModelChange(m);
        props.onClose();
      },
      onSessionStart: props.onModelSessionStart,
      onSessionBind: props.onModelSessionBind,
      onSessionUnbind: props.onModelSessionUnbind,
      onSessionClose: props.onModelSessionClose,
    });
  });
}

export function renderModelSheet(props: ModelSheetProps) {
  if (!props.open) {
    return nothing;
  }

  console.debug(
    "[model-sheet] render — open:",
    props.open,
    "selected:",
    props.selectedModel,
    "search:",
    props.searchQuery,
    "models:",
    props.modelOptions.length,
    "connectable:",
    props.connectableModelOptions.length,
    "bound:",
    props.boundModelOptions.length,
    "sessions:",
    props.modelSessionStates.length,
  );

  const groups = groupModels(props, props.searchQuery);
  console.debug(
    "[model-sheet] groups — active:",
    groups.active.length,
    "available providers:",
    groups.available.size,
    "unavailable:",
    groups.unavailable.length,
  );
  const hasResults =
    groups.active.length > 0 || groups.available.size > 0 || groups.unavailable.length > 0;

  const autoLabel = props.defaultModel ? `Auto (${props.defaultModel})` : "Auto (default)";
  const isAutoSelected = !props.selectedModel;

  // Sort provider groups for consistent display
  const providerOrder = ["Anthropic", "OpenAI", "Google", "Other"];
  const sortedProviders = Array.from(groups.available.entries()).toSorted(([a], [b]) => {
    const ai = providerOrder.indexOf(a);
    const bi = providerOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return html`
    <div
      class="model-sheet-backdrop model-sheet-backdrop--open"
      @click=${props.onClose}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Escape") {
          props.onClose();
        }
      }}
    ></div>
    <div
      class="model-sheet-panel model-sheet-panel--open"
      role="dialog"
      aria-label="Select model"
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Escape") {
          props.onClose();
        }
      }}
    >
      <div class="model-sheet__handle"></div>
      <div class="model-sheet__search">
        <input
          class="model-sheet__search-input"
          type="text"
          placeholder="Search models..."
          .value=${props.searchQuery}
          @input=${(e: Event) => {
            const target = e.target as HTMLInputElement;
            props.onSearchChange(target.value);
          }}
          autofocus
        />
      </div>
      <div class="model-sheet__list">
        <button
          class="model-sheet__auto ${isAutoSelected ? "model-sheet__auto--selected" : ""}"
          type="button"
          @click=${() => {
            props.onModelChange(null);
            props.onClose();
          }}
        >
          ○ ${autoLabel}
        </button>

        ${
          !hasResults
            ? html`<div class="model-sheet__empty">No models match "${props.searchQuery}"</div>`
            : nothing
        }

        ${
          groups.active.length > 0
            ? html`
                <div class="model-sheet__group-title">Active · Bound</div>
                ${renderModelList(groups.active, props)}
              `
            : nothing
        }

        ${
          sortedProviders.length > 0
            ? html`
                <div class="model-sheet__group-title">Available</div>
                ${sortedProviders.map(([provider, models]) =>
                  renderProviderGroup(provider, models, props),
                )}
              `
            : nothing
        }

        ${
          groups.unavailable.length > 0
            ? html`
                <div class="model-sheet__group-title">Unavailable</div>
                ${renderModelList(groups.unavailable, props)}
              `
            : nothing
        }
      </div>
    </div>
  `;
}

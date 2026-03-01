import { html, nothing } from "lit";
import type { ModelSessionState } from "../views/chat.ts";

export type ModelCardProps = {
  model: string;
  provider: string;
  providerClass: string;
  status: ModelSessionState["status"] | "available" | "unavailable";
  sessionState?: ModelSessionState;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelect: (model: string) => void;
  onSessionStart?: (model: string) => void;
  onSessionBind?: (model: string) => void;
  onSessionUnbind?: (model: string) => void;
  onSessionClose?: (model: string) => void;
};

function statusLabel(status: ModelCardProps["status"]): string {
  switch (status) {
    case "bound-self":
      return "Bound";
    case "bound-other":
      return "Bound (other)";
    case "unbound":
      return "Started";
    case "unstarted":
      return "Not started";
    case "available":
      return "";
    case "unavailable":
      return "Unavailable";
    default:
      return "";
  }
}

function statusClass(status: ModelCardProps["status"]): string {
  switch (status) {
    case "bound-self":
    case "bound-other":
      return "model-card__status--bound";
    case "unavailable":
      return "model-card__status--unavailable";
    default:
      return "model-card__status--unbound";
  }
}

function renderSessionActions(props: ModelCardProps) {
  const { sessionState, model } = props;
  const buttons = [];

  // Select button — always shown
  buttons.push(html`
    <button
      class="btn primary"
      type="button"
      @click=${(e: Event) => {
        e.stopPropagation();
        console.debug("[model-card] select:", model);
        props.onSelect(model);
      }}
    >
      Select
    </button>
  `);

  if (!sessionState) {
    // No session state — offer start
    if (props.onSessionStart) {
      buttons.push(html`
        <button
          class="btn"
          type="button"
          @click=${(e: Event) => {
            e.stopPropagation();
            props.onSessionStart?.(model);
          }}
        >
          New Session
        </button>
      `);
    }
    return html`<div class="model-card__actions">${buttons}</div>`;
  }

  const status = sessionState.status;

  if (status === "unstarted" && props.onSessionStart) {
    buttons.push(html`
      <button
        class="btn"
        type="button"
        @click=${(e: Event) => {
          e.stopPropagation();
          props.onSessionStart?.(model);
        }}
      >
        New Session
      </button>
    `);
  }

  if (status === "unbound" && props.onSessionBind) {
    buttons.push(html`
      <button
        class="btn"
        type="button"
        @click=${(e: Event) => {
          e.stopPropagation();
          props.onSessionBind?.(model);
        }}
      >
        Bind
      </button>
    `);
  }

  if (status === "bound-self" && props.onSessionUnbind) {
    buttons.push(html`
      <button
        class="btn"
        type="button"
        @click=${(e: Event) => {
          e.stopPropagation();
          props.onSessionUnbind?.(model);
        }}
      >
        Unbind
      </button>
    `);
  }

  if (status !== "unstarted" && props.onSessionStart) {
    buttons.push(html`
      <button
        class="btn"
        type="button"
        @click=${(e: Event) => {
          e.stopPropagation();
          props.onSessionStart?.(model);
        }}
      >
        New Session
      </button>
    `);
  }

  if (status !== "unstarted" && props.onSessionClose) {
    buttons.push(html`
      <button
        class="btn btn--danger"
        type="button"
        @click=${(e: Event) => {
          e.stopPropagation();
          props.onSessionClose?.(model);
        }}
      >
        Close
      </button>
    `);
  }

  return html`<div class="model-card__actions">${buttons}</div>`;
}

function renderSessionInfo(sessionState?: ModelSessionState) {
  if (!sessionState) {
    return nothing;
  }

  return html`
    <div class="model-card__session-info">
      ${sessionState.sessionId ? html`<span>Session: ${sessionState.sessionId}</span>` : nothing}
      ${
        sessionState.boundKey
          ? html`<span>Bound to: ${sessionState.boundKey}</span>`
          : sessionState.status === "unbound"
            ? html`
                <span>Status: Started · Unbound</span>
              `
            : sessionState.status === "unstarted"
              ? html`
                  <span>Status: Not started</span>
                `
              : nothing
      }
    </div>
  `;
}

export function renderModelCard(props: ModelCardProps) {
  const label = statusLabel(props.status);
  const sClass = statusClass(props.status);
  const classes = [
    "model-card",
    props.isExpanded ? "model-card--expanded" : "",
    props.isSelected ? "model-card--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return html`
    <div
      class=${classes}
      @click=${() => props.onToggleExpand()}
      role="button"
      tabindex="0"
      aria-expanded=${props.isExpanded}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onToggleExpand();
        }
      }}
    >
      <div class="model-card__header">
        <span class="model-sheet__provider-dot model-sheet__provider-dot--${props.providerClass}"></span>
        <div class="model-card__info">
          <div class="model-card__name">${props.model}</div>
          <div class="model-card__provider">${props.provider}</div>
        </div>
        ${
          label
            ? html`
                <div class="model-card__status ${sClass}">
                  <span class="model-card__status-dot"></span>
                  ${label}
                </div>
              `
            : nothing
        }
      </div>
      <div class="model-card__details">
        ${renderSessionInfo(props.sessionState)}
        ${renderSessionActions(props)}
      </div>
    </div>
  `;
}

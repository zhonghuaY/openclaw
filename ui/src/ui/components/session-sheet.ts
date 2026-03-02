import { html, nothing } from "lit";

export type GatewaySession = {
  session_id: string;
  registered_model: string;
  registered_at: string;
  running: {
    alive: boolean;
    waiting: boolean;
    pid: number;
    model: string;
    created_at: number;
    last_active: number;
    round_count: number;
  } | null;
};

export type GatewayInfo = {
  label: string;
  baseUrl: string;
};

export type SessionSheetProps = {
  open: boolean;
  gateways: GatewayInfo[];
  activeGatewayIndex: number;
  sessions: GatewaySession[];
  loading: boolean;
  error: string | null;
  currentSessionKey: string;
  boundSessionId: string | null;
  showCreateForm: boolean;
  createSessionId: string;
  createModel: string;
  availableModels: string[];
  onClose: () => void;
  onGatewayChange: (index: number) => void;
  onRefresh: () => void;
  onBind: (sessionId: string) => void;
  onUnbind: () => void;
  onDelete: (sessionId: string) => void;
  onCreate: () => void;
  onToggleCreateForm: () => void;
  onCreateSessionIdChange: (value: string) => void;
  onCreateModelChange: (value: string) => void;
};

function sessionStatus(s: GatewaySession): "alive" | "waiting" | "dead" {
  if (!s.running) {
    return "dead";
  }
  if (s.running.alive) {
    return "alive";
  }
  if (s.running.waiting) {
    return "waiting";
  }
  return "dead";
}

function formatAge(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp * 1000;
  if (diffMs < 0) {
    return "just now";
  }
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusLabel(status: "alive" | "waiting" | "dead"): string {
  switch (status) {
    case "alive":
      return "Running";
    case "waiting":
      return "Waiting";
    case "dead":
      return "Stopped";
  }
}

function renderSessionCard(session: GatewaySession, props: SessionSheetProps) {
  const status = sessionStatus(session);
  const isBound = props.boundSessionId === session.session_id;

  return html`
    <div class="session-card ${isBound ? "session-card--current" : ""}">
      <div class="session-card__status session-card__status--${status}"></div>
      <div class="session-card__info">
        <div class="session-card__id">${session.session_id}</div>
        <div class="session-card__meta">
          ${
            session.running
              ? html`
                ${session.running.model} · ${statusLabel(status)} ·
                PID ${session.running.pid} ·
                ${formatAge(session.running.last_active)} ·
                ${session.running.round_count} rounds
              `
              : html`${session.registered_model} · ${statusLabel(status)}`
          }
        </div>
        ${
          isBound
            ? html`
                <div class="session-card__badge">← Current</div>
              `
            : nothing
        }
      </div>
      <div class="session-card__actions">
        ${
          isBound
            ? html`
              <button
                class="session-card__btn"
                type="button"
                @click=${() => props.onUnbind()}
              >
                Unbind
              </button>
            `
            : html`
              <button
                class="session-card__btn session-card__btn--primary"
                type="button"
                @click=${() => props.onBind(session.session_id)}
              >
                Bind
              </button>
            `
        }
        <button
          class="session-card__btn session-card__btn--danger"
          type="button"
          @click=${() => props.onDelete(session.session_id)}
        >
          Delete
        </button>
      </div>
    </div>
  `;
}

function renderGatewaySelector(props: SessionSheetProps) {
  if (props.gateways.length <= 1) {
    return nothing;
  }

  return html`
    <div class="session-sheet__gateways">
      ${props.gateways.map(
        (gw, i) => html`
          <button
            class="session-sheet__gateway-btn ${i === props.activeGatewayIndex ? "session-sheet__gateway-btn--active" : ""}"
            type="button"
            @click=${() => props.onGatewayChange(i)}
          >
            ${gw.label}
          </button>
        `,
      )}
    </div>
  `;
}

function renderCreateForm(props: SessionSheetProps) {
  if (!props.showCreateForm) {
    return nothing;
  }

  return html`
    <div class="session-sheet__create-form">
      <input
        class="session-sheet__create-input"
        type="text"
        placeholder="Session ID..."
        .value=${props.createSessionId}
        @input=${(e: Event) => {
          const target = e.target as HTMLInputElement;
          props.onCreateSessionIdChange(target.value);
        }}
      />
      <select
        class="session-sheet__create-select"
        .value=${props.createModel}
        @change=${(e: Event) => {
          const target = e.target as HTMLSelectElement;
          props.onCreateModelChange(target.value);
        }}
      >
        <option value="" disabled>Select model…</option>
        ${props.availableModels.map(
          (m) => html`<option value=${m} ?selected=${m === props.createModel}>${m}</option>`,
        )}
      </select>
      <button
        class="session-card__btn session-card__btn--primary"
        type="button"
        @click=${() => props.onCreate()}
      >
        Create
      </button>
    </div>
  `;
}

function renderSessionList(props: SessionSheetProps) {
  if (props.loading) {
    return html`
      <div class="session-sheet__loading">Loading sessions…</div>
    `;
  }

  if (props.error) {
    return html`<div class="session-sheet__error">${props.error}</div>`;
  }

  if (props.sessions.length === 0) {
    return html`
      <div class="session-sheet__empty">No sessions found</div>
    `;
  }

  return html`${props.sessions.map((s) => renderSessionCard(s, props))}`;
}

export function renderSessionSheet(props: SessionSheetProps) {
  if (!props.open) {
    return nothing;
  }

  const bindingStatus = props.boundSessionId
    ? `Bound: ${props.boundSessionId}`
    : "No active binding";

  return html`
    <div
      class="session-sheet-backdrop session-sheet-backdrop--open"
      @click=${props.onClose}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Escape") {
          props.onClose();
        }
      }}
    ></div>
    <div
      class="session-sheet-panel session-sheet-panel--open"
      role="dialog"
      aria-label="Gateway Sessions"
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Escape") {
          props.onClose();
        }
      }}
    >
      <div class="session-sheet__header">
        <h2 class="session-sheet__title">⚡ Gateway Sessions</h2>
        <button
          class="session-sheet__close"
          type="button"
          aria-label="Close"
          @click=${props.onClose}
        >
          ✕
        </button>
      </div>

      ${renderGatewaySelector(props)}

      <div class="session-sheet__list">
        ${renderSessionList(props)}
      </div>

      ${renderCreateForm(props)}

      <div class="session-sheet__footer">
        <button
          class="session-sheet__footer-btn ${props.showCreateForm ? "" : "session-sheet__footer-btn--primary"}"
          type="button"
          @click=${() => props.onToggleCreateForm()}
        >
          ${props.showCreateForm ? "Cancel" : "+ Create Session"}
        </button>
        <button
          class="session-sheet__footer-btn"
          type="button"
          @click=${() => props.onRefresh()}
        >
          🔄 Refresh
        </button>
        <span class="session-sheet__footer-status">${bindingStatus}</span>
      </div>
    </div>
  `;
}

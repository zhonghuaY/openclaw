let mermaidModule: typeof import("mermaid") | null = null;
let initPromise: Promise<void> | null = null;
let observerStarted = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const MERMAID_RENDER_DEBOUNCE_MS = 800;

async function ensureMermaid() {
  if (mermaidModule) {
    return mermaidModule;
  }
  if (!initPromise) {
    initPromise = (async () => {
      mermaidModule = await import("mermaid");
      mermaidModule.default.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "loose",
        fontFamily: "inherit",
      });
    })();
  }
  await initPromise;
  return mermaidModule!;
}

/**
 * Find all pending mermaid containers in the given root and render them.
 * Call this after DOM update (e.g., in LitElement updated()).
 */
export async function renderMermaidDiagrams(root: HTMLElement | Document = document) {
  const containers = root.querySelectorAll<HTMLDivElement>(
    '.mermaid-container[data-mermaid="pending"]',
  );
  if (containers.length === 0) {
    return;
  }

  const mod = await ensureMermaid();
  for (const container of containers) {
    container.setAttribute("data-mermaid", "rendering");
    const pre = container.querySelector<HTMLPreElement>("pre.mermaid");
    if (!pre) {
      continue;
    }

    const source = pre.textContent?.trim();
    if (!source) {
      continue;
    }

    try {
      const id = pre.id || `mermaid-${Date.now()}`;
      const { svg } = await mod.default.render(id, source);
      container.innerHTML = svg;
      container.setAttribute("data-mermaid", "rendered");
    } catch {
      container.setAttribute("data-mermaid", "error");
      const errLabel = document.createElement("div");
      errLabel.className = "mermaid-error-label";
      errLabel.textContent = "⚠ Diagram render failed (click to toggle source)";
      errLabel.style.cssText =
        "font-size:12px;color:var(--text-muted,#888);cursor:pointer;padding:4px 8px;user-select:none";
      pre.style.display = "none";
      pre.classList.add("mermaid-error");
      errLabel.addEventListener("click", () => {
        pre.style.display = pre.style.display === "none" ? "block" : "none";
      });
      container.insertBefore(errLabel, pre);
    }
  }
}

/** Debounced wrapper to avoid rendering partial mermaid during streaming */
export function debouncedRenderMermaid() {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void renderMermaidDiagrams();
  }, MERMAID_RENDER_DEBOUNCE_MS);
}

/** Start a MutationObserver to auto-render mermaid blocks added to the DOM */
export function startMermaidObserver() {
  if (observerStarted) {
    return;
  }
  observerStarted = true;
  const observer = new MutationObserver(() => {
    if (document.querySelector('.mermaid-container[data-mermaid="pending"]')) {
      debouncedRenderMermaid();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

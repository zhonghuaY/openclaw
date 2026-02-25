let mermaidModule: typeof import("mermaid") | null = null;
let initPromise: Promise<void> | null = null;

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
        securityLevel: "strict",
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
      pre.classList.add("mermaid-error");
    }
  }
}

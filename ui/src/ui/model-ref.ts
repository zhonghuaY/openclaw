export function formatModelRef(provider: unknown, model: unknown): string {
  const rawModel = typeof model === "string" ? model.trim() : "";
  if (!rawModel) {
    return "";
  }
  if (rawModel.includes("/")) {
    return rawModel;
  }
  const rawProvider = typeof provider === "string" ? provider.trim() : "";
  return rawProvider ? `${rawProvider}/${rawModel}` : rawModel;
}

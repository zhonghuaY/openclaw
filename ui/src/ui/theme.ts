export type ThemeMode = "system" | "light" | "dark" | "muhuotongming";
export type ResolvedTheme = "light" | "dark" | "muhuotongming-light" | "muhuotongming-dark";

export function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") {
    return getSystemTheme();
  }
  if (mode === "muhuotongming") {
    return getSystemTheme() === "dark" ? "muhuotongming-dark" : "muhuotongming-light";
  }
  return mode;
}

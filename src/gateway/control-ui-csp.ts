const NOTE_X_FRAME_ORIGIN = "https://tdx-trading-view.myaddr.io:180";

export function buildControlUiCspHeader(): string {
  // Control UI: block framing, block inline scripts, keep styles permissive
  // (UI uses a lot of inline style attributes in templates).
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' https:",
    "connect-src 'self' ws: wss:",
    `frame-src 'self' ${NOTE_X_FRAME_ORIGIN}`,
  ].join("; ");
}

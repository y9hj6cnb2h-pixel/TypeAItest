import { TypeAiClient } from "type-ai-sdk";
import { toClientConfig, type Settings } from "./config";

let cached: { key: string; client: TypeAiClient } | null = null;

/**
 * The SDK client is cheap to build but holds module-level global state, so we
 * rebuild it only when the settings that feed it actually change.
 */
export function getClient(settings: Settings): TypeAiClient {
  const cfg = toClientConfig(settings);
  const key = JSON.stringify(cfg);
  if (cached?.key === key) return cached.client;
  const client = new TypeAiClient(cfg);
  // The SDK swallows internal errors and returns a generic message, logging the real
  // cause through its own logger. Keep that logger on at ERROR level so the network
  // tap can capture the cause and explain the failure; `?debug=1` turns it up to DEBUG.
  const verbose =
    typeof location !== "undefined" && /(^|[?&])debug=1(&|$)/.test(location.search);
  client.setLogging(true, verbose ? 3 : 0);
  cached = { key, client };
  return client;
}

/**
 * The SDK's response constructor JSON-stringifies every `message` before returning it
 * (`message: stringify ? JSON.stringify(r) : r`, with `stringify` defaulting to true).
 * So a prose answer arrives as `"\"Gas is 12 gwei.\""` and a structured answer arrives
 * as a JSON string. Decode both back into something renderable.
 */
export function readMessage(message: unknown): { text: string; value: unknown } {
  if (typeof message !== "string")
    return { text: message == null ? "" : String(message), value: message };
  try {
    const value = JSON.parse(message);
    if (typeof value === "string") return { text: value, value };
    if (value === null || value === undefined) return { text: "", value };
    if (typeof value === "object")
      return { text: JSON.stringify(value, null, 2), value };
    return { text: String(value), value };
  } catch {
    // Not JSON — the SDK was called with stringify disabled, or it's already plain.
    return { text: message, value: message };
  }
}

/** The SDK rejects with plain Errors and axios errors; normalise both. */
export function describeError(err: unknown): string {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  const e = err as {
    message?: string;
    response?: { status?: number; data?: unknown };
    code?: string;
  };
  if (e.response?.status) {
    const detail =
      typeof e.response.data === "string"
        ? e.response.data
        : JSON.stringify(e.response.data ?? {}).slice(0, 300);
    return `HTTP ${e.response.status} — ${detail}`;
  }
  if (e.code === "ERR_NETWORK" || /network error/i.test(e.message ?? "")) {
    return (
      "Network request blocked. This is usually CORS: the browser refused the " +
      "cross-origin call. See Settings → Connectivity for the workaround."
    );
  }
  return e.message ?? String(err);
}

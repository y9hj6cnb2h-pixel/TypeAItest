import type { TypeAiClient, IResponseConstructorOutput } from "type-ai-sdk";
import { readMessage } from "./client";
import {
  TYPEAI_ORIGIN,
  SDK_GENERIC_FAILURE,
  getAutoRelay,
  resetDiagnosis,
  setAutoRelay,
  setProbeProxy,
} from "./netlog";
import type { Chain } from "./wallet";

/**
 * Gets to the hosted TypeAI model from a static site.
 *
 * `api.typeai.live` sends no Access-Control-Allow-Origin header, so a browser blocks
 * the response. A relay sits outside the browser, where that rule doesn't apply.
 * Rather than making the user pick one, this walks a list until something answers,
 * then remembers the winner so later questions go straight through it.
 *
 * Safe to do automatically because the call carries nothing secret: the SDK posts
 * `{message, blockchain, previousMessages}` with no Authorization, Bearer or API-key
 * header. Provider keys and RPC traffic are never relayed.
 */

export type Relay = { label: string; prefix: string };

/** `{url}` is percent-encoded into place; otherwise the target is appended. */
export const RELAYS: Relay[] = [
  { label: "corsproxy.io", prefix: "https://corsproxy.io/?url={url}" },
  { label: "codetabs", prefix: "https://api.codetabs.com/v1/proxy?quest={url}" },
  { label: "allorigins", prefix: "https://api.allorigins.win/raw?url={url}" },
  { label: "cors.eu.org", prefix: "https://cors.eu.org/" },
  { label: "corsfix", prefix: "https://proxy.corsfix.com/?" },
  { label: "cors.lol", prefix: "https://api.cors.lol/?url={url}" },
  { label: "isomorphic-git", prefix: "https://cors.isomorphic-git.org/" },
];

/* ------------------------------------------------------------------- probing */

export type ProbeResult = {
  label: string;
  prefix: string;
  ok: boolean;
  detail: string;
  ms: number;
};

const RUN_PATH = "/api/sdk/run-conversation";

/** Build the URL a given prefix would produce for the model endpoint. */
export function targetFor(prefix: string): string {
  const direct = TYPEAI_ORIGIN + RUN_PATH;
  if (!prefix) return direct;
  if (prefix.startsWith("/")) return prefix.replace(/\/$/, "") + RUN_PATH;
  return prefix.includes("{url}")
    ? prefix.replace("{url}", encodeURIComponent(direct))
    : prefix + direct;
}

/**
 * Ask each route the same real question and report what actually happened. This
 * replaces guesswork: relays come and go, and only the user's own browser can say
 * which ones work from where they are.
 */
export async function probeRoutes(
  onProgress?: (done: number, total: number) => void,
): Promise<ProbeResult[]> {
  const routes: Relay[] = [{ label: "Direct (no relay)", prefix: "" }, ...RELAYS];
  const results: ProbeResult[] = [];

  for (let i = 0; i < routes.length; i++) {
    const { label, prefix } = routes[i];
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(targetFor(prefix), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "hello",
          blockchain: "ethereum",
          previousMessages: [],
        }),
        signal: controller.signal,
      });
      const text = await res.text();
      let ok = res.ok;
      let detail = `HTTP ${res.status}`;
      if (ok) {
        // A relay can return 200 while relaying an upstream error page.
        try {
          const body = JSON.parse(text);
          ok = Boolean(body?.data);
          detail = ok ? `HTTP ${res.status} · model replied` : `HTTP ${res.status} · unexpected body`;
        } catch {
          ok = false;
          detail = `HTTP ${res.status} · non-JSON response`;
        }
      }
      results.push({ label, prefix, ok, detail, ms: Math.round(performance.now() - started) });
    } catch (err) {
      const aborted = (err as Error)?.name === "AbortError";
      results.push({
        label,
        prefix,
        ok: false,
        detail: aborted ? "timed out after 12s" : "blocked (CORS or unreachable)",
        ms: Math.round(performance.now() - started),
      });
    } finally {
      clearTimeout(timer);
      onProgress?.(i + 1, routes.length);
    }
  }
  return results;
}

export type PromptPayload = {
  message: string;
  blockchain: Chain;
  previousMessages?: Array<{ role: string; content: string }>;
};

export type ReachResult = {
  responses: IResponseConstructorOutput[];
  messageHistory?: unknown[];
  /** null when the direct call worked; otherwise the relay that answered. */
  via: string | null;
};

const succeeded = (responses: IResponseConstructorOutput[] | undefined) =>
  Boolean(responses?.length) &&
  !responses!.some((r) => readMessage(r.message).text.includes(SDK_GENERIC_FAILURE));

async function attempt(
  client: TypeAiClient,
  payload: PromptPayload,
): Promise<ReachResult | null> {
  resetDiagnosis();
  const result = await client.prompt({
    message: payload.message,
    blockchain: payload.blockchain as never,
    previousMessages: (payload.previousMessages ?? []) as never,
  });
  const responses = Array.isArray(result) ? result : result.responses;
  if (!succeeded(responses)) return null;
  return {
    responses,
    messageHistory: Array.isArray(result) ? undefined : result.messageHistory,
    via: null,
  };
}

/**
 * Try the direct call, then each relay in turn. Returns null only when every route
 * failed, at which point the caller falls back to answering offline.
 */
export async function reachModel(
  client: TypeAiClient,
  payload: PromptPayload,
  onStage?: (stage: string) => void,
): Promise<ReachResult | null> {
  // A relay that worked before goes first — getProxyPrefix() already returns it, so
  // the direct attempt below is really "whatever is currently configured".
  const remembered = getAutoRelay();

  onStage?.(remembered ? `Asking TypeAI via ${hostOf(remembered)}` : "Asking TypeAI");
  try {
    const direct = await attempt(client, payload);
    if (direct) return { ...direct, via: remembered ? hostOf(remembered) : null };
  } catch {
    /* fall through to the relays */
  }

  for (const relay of RELAYS) {
    if (relay.prefix === remembered) continue; // already tried above
    onStage?.(`Direct call blocked — trying ${relay.label}`);
    setProbeProxy(relay.prefix);
    try {
      const viaRelay = await attempt(client, payload);
      if (viaRelay) {
        setAutoRelay(relay.prefix);
        return { ...viaRelay, via: relay.label };
      }
    } catch {
      /* try the next one */
    } finally {
      setProbeProxy(null);
    }
  }

  // Nothing worked; forget a stale relay so we re-probe cleanly next time.
  if (remembered) setAutoRelay("");
  return null;
}

const hostOf = (prefix: string) => {
  try {
    return new URL(prefix.replace("{url}", "")).hostname;
  } catch {
    return prefix;
  }
};

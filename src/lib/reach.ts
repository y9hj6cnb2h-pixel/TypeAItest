import type { TypeAiClient, IResponseConstructorOutput } from "type-ai-sdk";
import { readMessage } from "./client";
import {
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
];

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

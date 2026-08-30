/**
 * A passive tap over `fetch` and `XMLHttpRequest`.
 *
 * The TypeAI SDK is an agent runtime: it asks a hosted model which tool to run, then
 * runs that tool *locally in this browser* against your own RPC/API keys, then sends
 * the tool output back to be turned into prose. None of that is visible from the
 * SDK's return value, so we watch the traffic it generates and surface it in the UI.
 * It is the clearest way to show what the SDK is actually doing on your behalf.
 *
 * The tap also (a) redacts API keys before anything is logged and (b) optionally
 * reroutes the TypeAI origin through a user-supplied CORS proxy.
 */

export const TYPEAI_ORIGIN = "https://api.typeai.live";
const PROXY_KEY = "onchain-copilot:proxy";

export type NetEvent = {
  id: string;
  ts: number;
  method: string;
  url: string;
  label: string;
  detail?: string;
  status?: number;
  ms?: number;
  ok?: boolean;
  error?: string;
};

export type AgentStep = {
  id: string;
  ts: number;
  kind: "plan" | "tool" | "answer";
  name?: string;
  args?: unknown;
  text?: string;
};

type Listener<T> = (item: T) => void;

const netListeners = new Set<Listener<NetEvent>>();
const stepListeners = new Set<Listener<AgentStep>>();

export const onNetEvent = (fn: Listener<NetEvent>) => {
  netListeners.add(fn);
  return () => netListeners.delete(fn);
};
export const onAgentStep = (fn: Listener<AgentStep>) => {
  stepListeners.add(fn);
  return () => stepListeners.delete(fn);
};

const emitNet = (e: NetEvent) => netListeners.forEach((fn) => fn(e));
const emitStep = (s: AgentStep) => stepListeners.forEach((fn) => fn(s));

let seq = 0;
const nextId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

/* ------------------------------------------------------------------ redaction */

const SECRET_PARAM = /(api[-_]?key|apikey|key|token|auth|secret|access[-_]?token)/i;
// Long opaque strings in a URL path are almost always keys (Alchemy, Helius, QuickNode).
const SECRET_PATH = /^[A-Za-z0-9_-]{20,}$/;

export function redact(rawUrl: string): string {
  try {
    const u = new URL(rawUrl, location.href);
    u.searchParams.forEach((_v, k) => {
      if (SECRET_PARAM.test(k)) u.searchParams.set(k, "•••");
    });
    u.pathname = u.pathname
      .split("/")
      .map((seg) => (SECRET_PATH.test(seg) ? "•••" : seg))
      .join("/");
    return u.toString();
  } catch {
    return rawUrl;
  }
}

/* --------------------------------------------------------------------- labels */

function classify(rawUrl: string): { label: string; detail?: string } {
  let host = "";
  let path = "";
  try {
    const u = new URL(rawUrl, location.href);
    host = u.hostname;
    path = u.pathname;
  } catch {
    return { label: "request" };
  }

  if (host.endsWith("typeai.live")) {
    if (path.includes("run-conversation"))
      return { label: "TypeAI Agent", detail: "plan · choose tool" };
    if (path.includes("refine-conversation"))
      return { label: "TypeAI Agent", detail: "compose answer" };
    return { label: "TypeAI Agent" };
  }

  const map: Array<[RegExp, string]> = [
    [/dextools\.io$/, "DEXTools"],
    [/etherscan\.io$/, "Etherscan"],
    [/coingecko\.com$/, "CoinGecko"],
    [/dexscreener\.com$/, "DEX Screener"],
    [/jup\.ag$/, "Jupiter"],
    [/kyberswap\.com$/, "KyberSwap"],
    [/covalenthq\.com$/, "Covalent"],
    [/alchemy\.com$/, "Alchemy RPC"],
    [/blockcypher\.com$/, "BlockCypher"],
    [/4byte\.directory$/, "4byte Directory"],
    [/githubusercontent\.com$/, "Solana token list"],
  ];
  for (const [re, label] of map) if (re.test(host)) return { label };

  if (/solana|helius|triton|rpcpool/i.test(host)) return { label: "Solana RPC" };
  if (/quicknode|ankr|infura|publicnode|llamarpc|drpc|rpc\./i.test(host))
    return { label: "Ethereum RPC", detail: host };
  return { label: host };
}

/**
 * Traffic worth showing. Skips the app's own assets, fonts, and the SDK's npm
 * version check, which fires on construction and has nothing to do with the agent.
 */
function isInteresting(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl, location.href);
    if (u.origin === location.origin) return false;
    if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return false;
    if (/(^|\.)npmjs\.org$/.test(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------- optional CORS proxy */

export function getProxyPrefix(): string {
  try {
    return localStorage.getItem(PROXY_KEY) ?? "";
  } catch {
    return "";
  }
}
export function setProxyPrefix(v: string) {
  try {
    if (v) localStorage.setItem(PROXY_KEY, v);
    else localStorage.removeItem(PROXY_KEY);
  } catch {
    /* storage unavailable — proxy simply stays off */
  }
}

/** Rewrite only the TypeAI origin, and only when the user has configured a proxy. */
function applyProxy(rawUrl: string): string {
  const prefix = getProxyPrefix();
  if (!prefix) return rawUrl;
  if (!rawUrl.startsWith(TYPEAI_ORIGIN)) return rawUrl;
  return prefix.includes("{url}")
    ? prefix.replace("{url}", encodeURIComponent(rawUrl))
    : prefix + rawUrl;
}

/* ---------------------------------------------------------- agent-step parsing */

/**
 * `/run-conversation` answers with the model's turn. When it contains `tool_calls`,
 * those are the on-chain functions the SDK is about to execute locally.
 */
function parseAgentTurn(body: string) {
  try {
    const data = JSON.parse(body)?.data;
    if (!data) return;
    const calls = data.tool_calls;
    if (Array.isArray(calls) && calls.length) {
      for (const call of calls) {
        let args: unknown = call?.function?.arguments;
        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            /* keep the raw string */
          }
        }
        emitStep({
          id: nextId(),
          ts: Date.now(),
          kind: "tool",
          name: call?.function?.name ?? "unknown",
          args,
        });
      }
    } else if (typeof data.content === "string" && data.content.trim()) {
      emitStep({
        id: nextId(),
        ts: Date.now(),
        kind: "plan",
        text: data.content,
      });
    }
  } catch {
    /* non-JSON or unexpected shape — nothing to show */
  }
}

/* ------------------------------------------------------------------ the tap */

let installed = false;

export function installNetworkTap() {
  if (installed) return;
  installed = true;

  /* ---- fetch ---- */
  const origFetch = globalThis.fetch?.bind(globalThis);
  if (origFetch) {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = (
        init?.method ??
        (input instanceof Request ? input.method : "GET")
      ).toUpperCase();

      const target = applyProxy(rawUrl);
      const nextInput =
        target === rawUrl
          ? input
          : input instanceof Request
            ? new Request(target, input)
            : target;

      if (!isInteresting(rawUrl)) return origFetch(nextInput as RequestInfo, init);

      const { label, detail } = classify(rawUrl);
      const id = nextId();
      const started = performance.now();
      emitNet({ id, ts: Date.now(), method, url: redact(rawUrl), label, detail });

      try {
        const res = await origFetch(nextInput as RequestInfo, init);
        emitNet({
          id,
          ts: Date.now(),
          method,
          url: redact(rawUrl),
          label,
          detail,
          status: res.status,
          ok: res.ok,
          ms: Math.round(performance.now() - started),
        });
        if (rawUrl.includes("run-conversation")) {
          res
            .clone()
            .text()
            .then(parseAgentTurn)
            .catch(() => {});
        }
        return res;
      } catch (err) {
        emitNet({
          id,
          ts: Date.now(),
          method,
          url: redact(rawUrl),
          label,
          detail,
          ok: false,
          ms: Math.round(performance.now() - started),
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    };
  }

  /* ---- XMLHttpRequest (axios uses this in the browser) ---- */
  const XHR = globalThis.XMLHttpRequest;
  if (!XHR) return;
  const origOpen = XHR.prototype.open;
  const origSend = XHR.prototype.send;

  type Tagged = XMLHttpRequest & {
    __tap?: { id: string; method: string; url: string; started: number };
  };

  XHR.prototype.open = function (
    this: Tagged,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    const rawUrl = url.toString();
    this.__tap = { id: nextId(), method: method.toUpperCase(), url: rawUrl, started: 0 };
    return (origOpen as (...a: unknown[]) => void).call(
      this,
      method,
      applyProxy(rawUrl),
      ...rest,
    );
  } as typeof XHR.prototype.open;

  XHR.prototype.send = function (this: Tagged, body?: Document | BodyInit | null) {
    const tap = this.__tap;
    if (!tap || !isInteresting(tap.url)) return origSend.call(this, body as never);

    const { label, detail } = classify(tap.url);
    const url = redact(tap.url);
    tap.started = performance.now();
    emitNet({ id: tap.id, ts: Date.now(), method: tap.method, url, label, detail });

    const finish = (extra: Partial<NetEvent>) =>
      emitNet({
        id: tap.id,
        ts: Date.now(),
        method: tap.method,
        url,
        label,
        detail,
        ms: Math.round(performance.now() - tap.started),
        ...extra,
      });

    this.addEventListener("load", () => {
      finish({ status: this.status, ok: this.status >= 200 && this.status < 400 });
      if (tap.url.includes("run-conversation")) {
        try {
          const text =
            this.responseType === "" || this.responseType === "text"
              ? this.responseText
              : JSON.stringify(this.response);
          parseAgentTurn(text);
        } catch {
          /* body not readable in this responseType */
        }
      }
    });
    this.addEventListener("error", () => finish({ ok: false, error: "network error" }));
    this.addEventListener("abort", () => finish({ ok: false, error: "aborted" }));
    this.addEventListener("timeout", () => finish({ ok: false, error: "timeout" }));

    return origSend.call(this, body as never);
  } as typeof XHR.prototype.send;
}

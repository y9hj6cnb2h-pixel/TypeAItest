import { useState } from "react";
import {
  DEFAULTS,
  capabilities,
  clearSettings,
  covalentKeyLooksValid,
  type Settings as S,
} from "../lib/config";
import { getProxyPrefix, setAutoRelay, setProxyPrefix, TYPEAI_ORIGIN } from "../lib/netlog";
import { probeRoutes, type ProbeResult } from "../lib/reach";
import { Banner, IconExternal, Spinner } from "./ui";

type KeyField = {
  id: keyof S;
  label: string;
  placeholder: string;
  hint: React.ReactNode;
  secret?: boolean;
};

const FIELDS: KeyField[] = [
  {
    id: "ethereumRpcUrl",
    label: "Ethereum RPC URL",
    placeholder: "https://ethereum-rpc.publicnode.com",
    hint: (
      <>
        Any CORS-enabled JSON-RPC endpoint. Defaults to a free public node that is
        rate-limited — swap in your own for real use.
      </>
    ),
  },
  {
    id: "solanaRpcUrl",
    label: "Solana RPC URL",
    placeholder: "https://api.mainnet-beta.solana.com",
    hint: (
      <>
        The public endpoint works but throttles hard. Helius, QuickNode or Triton give
        you headroom.
      </>
    ),
  },
  {
    id: "alchemyApiKey",
    label: "Alchemy API key",
    placeholder: "optional",
    secret: true,
    hint: (
      <>
        Optional alternative to the RPC URL above.{" "}
        <a href="https://www.alchemy.com/" target="_blank" rel="noreferrer">
          alchemy.com <IconExternal />
        </a>
      </>
    ),
  },
  {
    id: "etherscanApiKey",
    label: "Etherscan API key",
    placeholder: "required for Ethereum tx summaries",
    secret: true,
    hint: (
      <>
        Decodes contract methods in the transaction explainer.{" "}
        <a
          href="https://etherscan.io/apis"
          target="_blank"
          rel="noreferrer"
        >
          Free tier <IconExternal />
        </a>
      </>
    ),
  },
  {
    id: "dexToolsApiKey",
    label: "DEXTools API key",
    placeholder: "required for token research",
    secret: true,
    hint: (
      <>
        Powers token prices, market caps and the swap tax audit.{" "}
        <a
          href="https://developer.dextools.io/"
          target="_blank"
          rel="noreferrer"
        >
          developer.dextools.io <IconExternal />
        </a>
      </>
    ),
  },
  {
    id: "covalentApiKey",
    label: "Covalent API key",
    placeholder: "required for portfolios",
    secret: true,
    hint: (
      <>
        Fetches every token balance for a wallet in one call.{" "}
        <a
          href="https://goldrush.dev/"
          target="_blank"
          rel="noreferrer"
        >
          goldrush.dev <IconExternal />
        </a>
      </>
    ),
  },
];

/**
 * Public relays that accept a POST with a JSON body. The copilot call carries no
 * credentials, so the only thing one of these sees is the question text.
 */
const PUBLIC_PROXIES = [
  { label: "corsproxy.io", value: "https://corsproxy.io/?url={url}" },
  { label: "codetabs", value: "https://api.codetabs.com/v1/proxy?quest={url}" },
];

export default function Settings({
  settings,
  onChange,
}: {
  settings: S;
  onChange: (s: S) => void;
}) {
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [proxy, setProxy] = useState(getProxyPrefix());
  const [savedProxy, setSavedProxy] = useState(false);
  const [probing, setProbing] = useState("");
  const [probes, setProbes] = useState<ProbeResult[] | null>(null);
  const caps = capabilities(settings);

  const set = (id: keyof S, value: string) =>
    onChange({ ...settings, [id]: value });

  return (
    <div className="content-pad">
      <Banner>
        <strong>Sonari needs no keys.</strong> Every panel works out of the box on free
        public endpoints — Blockscout, DEX Screener and public RPC nodes — none of which
        need an account. The fields below are optional upgrades: they raise rate limits
        and add a little extra data. You never have to hand a key to anyone.
      </Banner>

      <Banner tone="warn">
        <strong>If you do add keys, they stay in this browser.</strong> This is a static site with no
        backend — everything you type here is saved to <code>localStorage</code> on
        your own machine and sent only to the matching provider. That also means
        anyone with access to this browser profile can read them, and any browser
        extension can too. Use free-tier, read-only keys, and rotate them when you're
        done experimenting.
      </Banner>

      <div className="card">
        <h2 className="card-title">What's available right now</h2>
        <p className="card-sub">
          Everything is available with no key at all. Hover a chip to see which provider
          is answering and what a key would change.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {caps.map((c) => (
            <span
              key={c.id}
              className={`chip ${c.ready ? "ok" : "warn"}`}
              title={c.needs}
            >
              <span className="dot" />
              {c.label}
              {!c.ready && " — needs a key"}
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Providers</h2>
        <p className="card-sub">
          All optional. These map one-to-one onto the <code>TypeAiClient</code>
          constructor options; leave them empty and the free providers are used instead.
          Changes take effect on the next request.
        </p>

        {FIELDS.map((f) => (
          <div className="field" key={f.id}>
            <label htmlFor={`f-${f.id}`}>{f.label}</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id={`f-${f.id}`}
                className="input mono"
                type={f.secret && !reveal[f.id] ? "password" : "text"}
                value={settings[f.id] ?? ""}
                placeholder={f.placeholder}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => set(f.id, e.target.value)}
              />
              {f.secret && (
                <button
                  className="btn sm ghost"
                  type="button"
                  onClick={() =>
                    setReveal((r) => ({ ...r, [f.id]: !r[f.id] }))
                  }
                >
                  {reveal[f.id] ? "Hide" : "Show"}
                </button>
              )}
            </div>
            <div className="hint">{f.hint}</div>
            {f.id === "covalentApiKey" &&
              settings.covalentApiKey &&
              !covalentKeyLooksValid(settings.covalentApiKey) && (
                <div className="hint" style={{ color: "var(--amber)" }}>
                  This doesn't look like a Covalent key — they read{" "}
                  <code>ckey_</code> followed by 27 hex characters, or{" "}
                  <code>cqt_</code> followed by 28. Covalent's client checks the
                  format itself and won't send the request.
                </div>
              )}
          </div>
        ))}

        <div className="row" style={{ marginTop: 6 }}>
          <button
            className="btn danger"
            onClick={() => {
              clearSettings();
              onChange({ ...DEFAULTS });
            }}
          >
            Clear all keys
          </button>
          <span className="faint" style={{ fontSize: 12 }}>
            Wipes them from this browser and restores the public defaults.
          </span>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Connectivity</h2>
        <p className="card-sub">
          The copilot calls <code>{TYPEAI_ORIGIN}</code> straight from the browser. That
          API does not send an <code>Access-Control-Allow-Origin</code> header, so the
          browser refuses to hand the response to this page and the SDK reports a
          network error. The request is not malformed and retrying will not fix it.
        </p>
        <p className="card-sub">
          <strong>You don't have to fix this to use Sonari.</strong> The hosted model
          only chooses which tool to run and polishes the wording — the SDK's tools
          themselves reach CORS-clean endpoints and already return readable prose. When
          the model is unreachable, Ask routes your question in the browser and answers
          from the SDK's own output, and Scan composes its read from the same numbers.
          Both are labelled so you know which answered. A proxy buys you the model's
          judgement and free-form phrasing, nothing more.
        </p>
        <p className="card-sub">
          A proxy sits outside the browser, where same-origin rules don't apply: it
          forwards the call and re-serves the answer with the header the browser wants.
          This repo ships one — <code>proxy/cloudflare-worker.js</code>, a single file
          you deploy free on{" "}
          <a
            href="https://dash.cloudflare.com"
            target="_blank"
            rel="noreferrer"
          >
            Cloudflare Workers <IconExternal />
          </a>{" "}
          in about two minutes. It only forwards to the TypeAI API, so it can't be
          abused as an open relay. Paste your worker URL below, keeping the trailing
          slash.
        </p>
        <div className="proxy-presets">
          <div className="proxy-preset-head">
            <span className="chip">Live connection test</span>
          </div>
          <p className="hint" style={{ margin: "0 0 10px" }}>
            Relays come and go, and only your browser can say which ones work from where
            you are. This sends one real request down every route and reports what came
            back — then you can pin whichever answered.
          </p>
          <div className="row">
            <button
              className="btn"
              disabled={Boolean(probing)}
              onClick={async () => {
                setProbes(null);
                setProbing("starting");
                const res = await probeRoutes((done, total) =>
                  setProbing(`testing ${done}/${total}`),
                );
                setProbes(res);
                setProbing("");
              }}
            >
              {probing ? <Spinner /> : null}
              {probing ? `Testing… ${probing.replace("testing ", "")}` : "Test all routes"}
            </button>
          </div>

          {probes && (
            <ul className="probe-list">
              {probes.map((r) => (
                <li key={r.label}>
                  <span className={`chip ${r.ok ? "ok" : "bad"}`}>
                    <span className="dot" />
                    {r.ok ? "works" : "no"}
                  </span>
                  <span className="probe-label">{r.label}</span>
                  <span className="probe-detail faint">
                    {r.detail} · {r.ms}ms
                  </span>
                  {r.ok && r.prefix && (
                    <button
                      className="btn sm"
                      onClick={() => {
                        setProxy(r.prefix);
                        setProxyPrefix(r.prefix);
                        setSavedProxy(true);
                      }}
                    >
                      Use
                    </button>
                  )}
                </li>
              ))}
              {probes.every((r) => !r.ok) && (
                <li className="faint" style={{ display: "block", fontSize: 12 }}>
                  No route reached the model. Ask still answers on-chain questions
                  itself, and the Cloudflare Worker above is the reliable fix.
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="proxy-presets">
          <div className="proxy-preset-head">
            <span className="chip ok">
              <span className="dot" /> One tap, no account
            </span>
          </div>
          <p className="hint" style={{ margin: "0 0 10px" }}>
            Route through a public relay. It only ever carries the copilot call, which
            sends <strong>no API key and no auth header</strong> — just your question
            text — so nothing credential-bearing passes through it. It is a third party
            you don't control though, and free relays rate-limit, so treat this as a way
            to get going and move to your own worker when you care.
          </p>
          <div className="row">
            {PUBLIC_PROXIES.map((pp) => (
              <button
                key={pp.value}
                className="btn sm"
                onClick={() => {
                  setProxy(pp.value);
                  setProxyPrefix(pp.value);
                  setSavedProxy(true);
                }}
              >
                Use {pp.label}
              </button>
            ))}
            {proxy && (
              <button
                className="btn sm ghost danger"
                onClick={() => {
                  setProxy("");
                  setProxyPrefix("");
                  setAutoRelay("");
                  setSavedProxy(true);
                }}
              >
                Turn proxy off
              </button>
            )}
          </div>
        </div>

        <div className="field">
          <label htmlFor="proxy">CORS proxy prefix (optional)</label>
          <input
            id="proxy"
            className="input mono"
            value={proxy}
            placeholder="https://sonari-proxy.you.workers.dev/"
            onChange={(e) => {
              setProxy(e.target.value);
              setSavedProxy(false);
            }}
          />
          <div className="hint">
            Only used for the TypeAI origin — never for your RPC endpoints or any
            key-bearing request, which keep going direct. The target URL is appended to
            this prefix; include <code>{"{url}"}</code> instead if your proxy wants it
            percent-encoded as a query parameter. Your own worker is the sturdier
            option — a public relay is someone else's server and can rate-limit or
            disappear.
          </div>
        </div>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              setProxyPrefix(proxy.trim());
              setSavedProxy(true);
            }}
          >
            Save proxy setting
          </button>
          {savedProxy && (
            <span className="chip ok">
              <span className="dot" /> Saved
            </span>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">About</h2>
        <p className="card-sub" style={{ marginBottom: 10 }}>
          Built on{" "}
          <a
            href="https://www.npmjs.com/package/type-ai-sdk"
            target="_blank"
            rel="noreferrer"
          >
            type-ai-sdk <IconExternal />
          </a>{" "}
          — every panel in this app is a direct call to one of its seven methods.
        </p>
        <dl className="kv">
          <dt>Scan</dt>
          <dd className="mono">
            getTokenBalance() · getTransactionFee() · getTokenPortfolio() · prompt()
          </dd>
          <dt>Ask</dt>
          <dd className="mono">client.prompt()</dd>
          <dt>Portfolio</dt>
          <dd className="mono">client.getTokenPortfolio()</dd>
          <dt>Token research</dt>
          <dd className="mono">
            client.getTokenDetails() · client.getTokenBalance()
          </dd>
          <dt>Transactions</dt>
          <dd className="mono">
            client.getTransactionSummary() · client.getTransactionFee()
          </dd>
          <dt>Trade</dt>
          <dd className="mono">client.swapTokens() · client.sendToken()</dd>
        </dl>
      </div>
    </div>
  );
}

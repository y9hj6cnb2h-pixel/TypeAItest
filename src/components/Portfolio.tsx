import { useState } from "react";
import { getClient, describeError, readMessage } from "../lib/client";
import { covalentKeyLooksValid, type Settings } from "../lib/config";
import { explorerAddressUrl, shortAddress, type Chain, type WalletState } from "../lib/wallet";
import { amount, usd } from "../lib/format";
import Donut, { SLICE_COLORS, type Slice } from "./Donut";
import {
  Banner,
  ChainToggle,
  Empty,
  ErrorBox,
  IconExternal,
  IconPie,
  Spinner,
} from "./ui";

/** Shape returned by `getTokenPortfolio` — one entry per holding. */
type Holding = {
  name?: string;
  symbol?: string;
  contract_name?: string;
  contract_address?: string;
  type?: string;
  balance?: string;
  balanceUSD?: string;
  quote?: number;
};

const parseUsd = (h: Holding) =>
  typeof h.quote === "number" && Number.isFinite(h.quote)
    ? h.quote
    : h.balanceUSD
      ? Number(h.balanceUSD.replace(/[$,]/g, "")) || 0
      : 0;

export default function Portfolio({
  settings,
  wallet,
  chain,
  onChainChange,
}: {
  settings: Settings;
  wallet: WalletState | null;
  chain: Chain;
  onChainChange: (c: Chain) => void;
}) {
  const [address, setAddress] = useState(wallet?.address ?? "");
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const addr = address.trim();
    if (!addr || busy) return;
    setBusy(true);
    setError(null);
    setHoldings(null);
    setSummary("");
    try {
      const res = await getClient(settings).getTokenPortfolio({
        walletAddress: addr,
        blockchain: chain,
        nftConfirmation: false,
      });
      const data = res?.data;
      const { text } = readMessage(res?.message);
      if (!Array.isArray(data)) {
        setError(text || "No portfolio data came back for that address.");
      } else {
        setHoldings(data as Holding[]);
        setSummary(text);
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const tokens = (holdings ?? []).filter((h) => h.type !== "nft");
  const withValue = tokens
    .map((h) => ({ h, value: parseUsd(h) }))
    .sort((a, b) => b.value - a.value);
  const total = withValue.reduce((s, x) => s + x.value, 0);

  const top = withValue.filter((x) => x.value > 0).slice(0, 9);
  const restValue = withValue
    .filter((x) => x.value > 0)
    .slice(9)
    .reduce((s, x) => s + x.value, 0);
  const slices: Slice[] = [
    ...top.map((x) => ({ label: x.h.symbol || x.h.name || "?", value: x.value })),
    ...(restValue > 0 ? [{ label: "Other", value: restValue }] : []),
  ];

  return (
    <div className="content-pad">
      {!settings.covalentApiKey && (
        <Banner tone="warn">
          Portfolio lookups go through Covalent, which needs an API key.{" "}
          <strong>Add one in Settings</strong> — the free tier is enough for this.
        </Banner>
      )}
      {settings.covalentApiKey && !covalentKeyLooksValid(settings.covalentApiKey) && (
        <Banner tone="warn">
          That Covalent key doesn't match either accepted format (
          <code>ckey_…</code> or <code>cqt_…</code>). Covalent's client rejects it
          before sending anything, so the lookup will fail with a generic error.{" "}
          <strong>Check it in Settings.</strong>
        </Banner>
      )}

      <div className="card">
        <h2 className="card-title">Wallet portfolio</h2>
        <p className="card-sub">
          <code>client.getTokenPortfolio()</code> — every token a wallet holds, priced
          and totalled, on Ethereum or Solana.
        </p>
        <div className="row">
          <div className="field" style={{ flex: "3 1 340px" }}>
            <label htmlFor="pf-addr">Wallet address</label>
            <input
              id="pf-addr"
              className="input mono"
              value={address}
              placeholder={
                chain === "ethereum"
                  ? "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
                  : "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
              }
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void load()}
            />
          </div>
          <div className="field">
            <label>Chain</label>
            <ChainToggle value={chain} onChange={onChainChange} />
          </div>
          <button
            className="btn primary"
            onClick={() => void load()}
            disabled={busy || !address.trim()}
          >
            {busy ? <Spinner /> : null}
            {busy ? "Loading…" : "Load portfolio"}
          </button>
          {wallet && wallet.address !== address && (
            <button className="btn ghost" onClick={() => setAddress(wallet.address)}>
              Use connected wallet
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 16 }}>
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}

      {holdings && tokens.length > 0 && (
        <>
          <div className="card">
            <div className="stat-row" style={{ marginBottom: 18 }}>
              <div className="stat">
                <div className="k">Total value</div>
                <div className="v">{total > 0 ? usd(total) : "—"}</div>
              </div>
              <div className="stat">
                <div className="k">Holdings</div>
                <div className="v">{tokens.length}</div>
              </div>
              <div className="stat">
                <div className="k">Largest position</div>
                <div className="v" style={{ fontSize: 17 }}>
                  {withValue[0]?.h.symbol ?? "—"}
                </div>
              </div>
              <div className="stat">
                <div className="k">Address</div>
                <div className="v" style={{ fontSize: 14, fontFamily: "var(--mono)" }}>
                  <a
                    href={explorerAddressUrl(chain, address.trim())}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {shortAddress(address.trim(), 5)} <IconExternal />
                  </a>
                </div>
              </div>
            </div>

            {slices.length > 0 && (
              <div className="donut-wrap">
                <Donut slices={slices} />
                <div className="legend" style={{ flex: "1 1 260px" }}>
                  {slices.map((s, i) => (
                    <div className="legend-item" key={s.label + i}>
                      <span
                        className="legend-swatch"
                        style={{
                          background: SLICE_COLORS[i % SLICE_COLORS.length],
                        }}
                      />
                      <span className="legend-name">{s.label}</span>
                      <span className="legend-val">
                        {usd(s.value)} · {((s.value / total) * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="card-title">All holdings</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Contract</th>
                    <th className="num">Balance</th>
                    <th className="num">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {withValue.map(({ h, value }, i) => (
                    <tr key={(h.contract_address ?? "") + i}>
                      <td>
                        <strong>{h.symbol ?? "—"}</strong>
                        <div className="faint" style={{ fontSize: 11.5 }}>
                          {h.name ?? h.contract_name ?? ""}
                        </div>
                      </td>
                      <td className="mono faint" style={{ fontSize: 11.5 }}>
                        {h.contract_address ? (
                          <a
                            href={explorerAddressUrl(chain, h.contract_address)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {shortAddress(h.contract_address, 5)}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="num">{amount(h.balance)}</td>
                      <td className="num">{value > 0 ? usd(value) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {summary && (
            <div className="card">
              <h3 className="card-title">What the SDK sends to the model</h3>
              <p className="card-sub">
                The same call also returns a prose summary — this is the string the
                copilot reasons over when you ask about a portfolio.
              </p>
              <p className="dim" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.7 }}>
                {summary}
              </p>
            </div>
          )}
        </>
      )}

      {holdings && tokens.length === 0 && !error && (
        <div className="card">
          <Empty icon={<IconPie size={28} />} title="No tokens found">
            That wallet holds no priced tokens on {chain}.
          </Empty>
        </div>
      )}
    </div>
  );
}

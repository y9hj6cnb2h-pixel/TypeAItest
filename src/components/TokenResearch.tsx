import { useState } from "react";
import { getClient, describeError, readMessage } from "../lib/client";
import type { Settings } from "../lib/config";
import { explorerAddressUrl, shortAddress, type Chain, type WalletState } from "../lib/wallet";
import { amount, compact, percent, usd } from "../lib/format";
import {
  Banner,
  ChainToggle,
  Empty,
  ErrorBox,
  IconExternal,
  IconSearch,
  Spinner,
} from "./ui";

type Details = {
  name?: string;
  symbol?: string;
  decimals?: number | string;
  currentPrice?: string | number;
  priceChange24h?: string | number;
  marketCap?: string | number;
  totalSupply?: string | number;
  contractAddress?: string;
  blockchain?: string;
};

export default function TokenResearch({
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
  const [token, setToken] = useState("USDC");
  const [details, setDetails] = useState<Details | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [balToken, setBalToken] = useState("USDC");
  const [balAddr, setBalAddr] = useState(wallet?.address ?? "");
  const [balance, setBalance] = useState<string | null>(null);
  const [balBusy, setBalBusy] = useState(false);
  const [balError, setBalError] = useState<string | null>(null);

  async function lookup() {
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(null);
    setDetails(null);
    setNote("");
    try {
      const res = await getClient(settings).getTokenDetails({
        token: token.trim(),
        blockchain: chain as never,
      });
      const data = res?.data;
      const { text } = readMessage(res?.message);
      if (data && typeof data === "object") {
        setDetails(data as Details);
      } else if (typeof data === "string") {
        // ETH and SOL take a price-only path that returns prose, not a struct.
        setNote(data);
      } else {
        setError(text || "No details came back for that token.");
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function checkBalance() {
    if (!balToken.trim() || !balAddr.trim() || balBusy) return;
    setBalBusy(true);
    setBalError(null);
    setBalance(null);
    try {
      const res = await getClient(settings).getTokenBalance({
        token: balToken.trim(),
        walletAddress: balAddr.trim(),
        blockchain: chain as never,
      });
      if (res?.data?.tokenBalance !== undefined) {
        setBalance(
          `${amount(res.data.tokenBalance)} ${res.data.tokenSymbol ?? balToken.toUpperCase()}`,
        );
      } else {
        setBalError(readMessage(res?.message).text || "No balance returned.");
      }
    } catch (err) {
      setBalError(describeError(err));
    } finally {
      setBalBusy(false);
    }
  }

  const change = Number(String(details?.priceChange24h ?? "").replace("%", ""));

  return (
    <div className="content-pad">
      {!settings.dexToolsApiKey && (
        <Banner tone="warn">
          Token details are served by DEXTools, which needs an API key.{" "}
          <strong>Add one in Settings</strong> to unlock this panel.
        </Banner>
      )}

      <div className="grid-2">
        <div>
          <div className="card">
            <h2 className="card-title">Token research</h2>
            <p className="card-sub">
              <code>client.getTokenDetails()</code> — price, market cap, supply and
              contract for any token, by symbol or address.
            </p>
            <div className="row">
              <div className="field" style={{ flex: "2 1 200px" }}>
                <label htmlFor="tk">Symbol or contract address</label>
                <input
                  id="tk"
                  className="input mono"
                  value={token}
                  placeholder="USDC, WETH, JUP, 0x…"
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void lookup()}
                />
              </div>
              <div className="field">
                <label>Chain</label>
                <ChainToggle value={chain} onChange={onChainChange} />
              </div>
              <button
                className="btn primary"
                onClick={() => void lookup()}
                disabled={busy || !token.trim()}
              >
                {busy ? <Spinner /> : null}
                {busy ? "Looking up…" : "Look up"}
              </button>
            </div>

            {error && (
              <div style={{ marginTop: 14 }}>
                <ErrorBox>{error}</ErrorBox>
              </div>
            )}
            {note && (
              <p className="dim" style={{ marginTop: 14, fontSize: 13 }}>
                {note}
              </p>
            )}
          </div>

          {details && (
            <div className="card">
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <h3 style={{ margin: 0, fontSize: 18, letterSpacing: "-0.02em" }}>
                  {details.name ?? token}
                </h3>
                <span className="chip">{details.symbol ?? "—"}</span>
                <span className="chip violet">{details.blockchain ?? chain}</span>
              </div>

              <div className="stat-row">
                <div className="stat">
                  <div className="k">Price</div>
                  <div className="v">{usd(details.currentPrice)}</div>
                </div>
                <div className="stat">
                  <div className="k">24h change</div>
                  <div
                    className={`v ${Number.isFinite(change) ? (change >= 0 ? "up" : "down") : ""}`}
                  >
                    {Number.isFinite(change)
                      ? percent(change)
                      : (details.priceChange24h ?? "—")}
                  </div>
                </div>
                <div className="stat">
                  <div className="k">Market cap</div>
                  <div className="v">${compact(details.marketCap)}</div>
                </div>
                <div className="stat">
                  <div className="k">Total supply</div>
                  <div className="v">{compact(details.totalSupply)}</div>
                </div>
              </div>

              <dl className="kv">
                <dt>Decimals</dt>
                <dd>{details.decimals ?? "—"}</dd>
                <dt>Contract</dt>
                <dd className="mono">
                  {details.contractAddress ? (
                    <a
                      href={explorerAddressUrl(chain, details.contractAddress)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {details.contractAddress} <IconExternal />
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </dl>
            </div>
          )}

          {!details && !note && !error && !busy && (
            <div className="card">
              <Empty icon={<IconSearch size={28} />} title="Nothing looked up yet">
                Enter a symbol above — try USDC, WETH or LINK on Ethereum.
              </Empty>
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <h2 className="card-title">Balance check</h2>
            <p className="card-sub">
              <code>client.getTokenBalance()</code> — how much of one token a specific
              wallet holds. Reads straight from your RPC endpoint.
            </p>
            <div className="field">
              <label htmlFor="bt">Token</label>
              <input
                id="bt"
                className="input mono"
                value={balToken}
                placeholder="USDC"
                onChange={(e) => setBalToken(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="ba">Wallet address</label>
              <input
                id="ba"
                className="input mono"
                value={balAddr}
                placeholder={chain === "ethereum" ? "0x…" : "Solana pubkey"}
                onChange={(e) => setBalAddr(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void checkBalance()}
              />
            </div>
            <div className="row">
              <button
                className="btn primary"
                onClick={() => void checkBalance()}
                disabled={balBusy || !balAddr.trim() || !balToken.trim()}
              >
                {balBusy ? <Spinner /> : null}
                {balBusy ? "Checking…" : "Check balance"}
              </button>
              {wallet && wallet.address !== balAddr && (
                <button
                  className="btn ghost"
                  onClick={() => setBalAddr(wallet.address)}
                >
                  Use connected wallet
                </button>
              )}
            </div>

            {balance && (
              <div className="stat" style={{ marginTop: 16 }}>
                <div className="k">Balance</div>
                <div className="v">{balance}</div>
                <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {shortAddress(balAddr.trim(), 6)}
                </div>
              </div>
            )}
            {balError && (
              <div style={{ marginTop: 14 }}>
                <ErrorBox>{balError}</ErrorBox>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

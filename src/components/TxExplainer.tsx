import { useEffect, useState } from "react";
import { getClient, describeError, readMessage } from "../lib/client";
import type { Settings } from "../lib/config";
import { explorerTxUrl, type Chain } from "../lib/wallet";
import {
  Banner,
  ChainToggle,
  Empty,
  ErrorBox,
  IconExternal,
  IconReceipt,
  Spinner,
} from "./ui";

type GasData = {
  gasPrice?: string | number;
  maxFeePerGas?: string | number;
  maxPriorityFeePerGas?: string | number;
};

export default function TxExplainer({
  settings,
  chain,
  onChainChange,
}: {
  settings: Settings;
  chain: Chain;
  onChainChange: (c: Chain) => void;
}) {
  const [hash, setHash] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [gas, setGas] = useState<GasData | string | null>(null);
  const [gasBusy, setGasBusy] = useState(false);
  const [gasError, setGasError] = useState<string | null>(null);

  async function loadGas() {
    setGasBusy(true);
    setGasError(null);
    setGas(null);
    try {
      const res = await getClient(settings).getTransactionFee({ blockchain: chain });
      setGas(
        res?.data && typeof res.data === "object"
          ? (res.data as GasData)
          : readMessage(res?.message).text || null,
      );
    } catch (err) {
      setGasError(describeError(err));
    } finally {
      setGasBusy(false);
    }
  }

  // Network conditions are the one thing worth showing before the user types anything.
  useEffect(() => {
    void loadGas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain]);

  async function explain() {
    const h = hash.trim();
    if (!h || busy) return;
    setBusy(true);
    setError(null);
    setSummary("");
    try {
      const res = await getClient(settings).getTransactionSummary({
        transactionHash: h,
        blockchain: chain as never,
      });
      const msg = readMessage(res?.message).text;
      if (/^Failed to get|^Getting .* failed/i.test(msg)) setError(msg);
      else setSummary(msg || "No summary returned.");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const needsEtherscan = chain === "ethereum" && !settings.etherscanApiKey;

  return (
    <div className="content-pad">
      {needsEtherscan && (
        <Banner tone="warn">
          Ethereum transaction summaries need an Etherscan API key to decode contract
          calls. <strong>Add one in Settings</strong>, or switch to Solana, which only
          needs an RPC URL.
        </Banner>
      )}

      <div className="card">
        <h2 className="card-title">Network conditions</h2>
        <p className="card-sub">
          <code>client.getTransactionFee()</code> — live fee data for {chain}.
        </p>
        {gasBusy && (
          <div className="dim" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Spinner /> Reading current fees…
          </div>
        )}
        {gasError && <ErrorBox>{gasError}</ErrorBox>}
        {gas && typeof gas === "object" && (
          <div className="stat-row" style={{ margin: 0 }}>
            <div className="stat">
              <div className="k">Gas price</div>
              <div className="v">{gas.gasPrice ?? "—"} <span className="faint" style={{ fontSize: 12 }}>gwei</span></div>
            </div>
            <div className="stat">
              <div className="k">Max fee</div>
              <div className="v">{gas.maxFeePerGas ?? "—"} <span className="faint" style={{ fontSize: 12 }}>gwei</span></div>
            </div>
            <div className="stat">
              <div className="k">Priority fee</div>
              <div className="v">{gas.maxPriorityFeePerGas ?? "—"} <span className="faint" style={{ fontSize: 12 }}>gwei</span></div>
            </div>
          </div>
        )}
        {gas && typeof gas === "string" && (
          <div className="stat" style={{ maxWidth: 280 }}>
            <div className="k">Current fee</div>
            <div className="v" style={{ fontSize: 15 }}>{gas}</div>
          </div>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          <ChainToggle value={chain} onChange={onChainChange} />
          <button className="btn ghost sm" onClick={() => void loadGas()} disabled={gasBusy}>
            Refresh
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Transaction explainer</h2>
        <p className="card-sub">
          <code>client.getTransactionSummary()</code> — paste any hash and get a plain
          English account of what it did: who sent what to whom, which contract method
          ran, and what it cost.
        </p>
        <div className="row">
          <div className="field" style={{ flex: "3 1 380px" }}>
            <label htmlFor="txh">Transaction hash or signature</label>
            <input
              id="txh"
              className="input mono"
              value={hash}
              placeholder={
                chain === "ethereum"
                  ? "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060"
                  : "base58 signature"
              }
              onChange={(e) => setHash(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void explain()}
            />
          </div>
          <button
            className="btn primary"
            onClick={() => void explain()}
            disabled={busy || !hash.trim()}
          >
            {busy ? <Spinner /> : null}
            {busy ? "Decoding…" : "Explain"}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 14 }}>
            <ErrorBox>{error}</ErrorBox>
          </div>
        )}

        {summary && (
          <div style={{ marginTop: 18 }}>
            <div
              style={{
                borderLeft: "2px solid var(--mint)",
                paddingLeft: 14,
                whiteSpace: "pre-wrap",
                lineHeight: 1.7,
                fontSize: 13.5,
              }}
            >
              {summary}
            </div>
            <div style={{ marginTop: 12 }}>
              <a
                href={explorerTxUrl(chain, hash.trim())}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12.5 }}
              >
                Open in explorer <IconExternal />
              </a>
            </div>
          </div>
        )}

        {!summary && !error && !busy && (
          <Empty icon={<IconReceipt size={28} />} title="Paste a transaction">
            The SDK pulls the receipt, resolves the token transfers, and decodes the
            method signature before writing the summary.
          </Empty>
        )}
      </div>
    </div>
  );
}

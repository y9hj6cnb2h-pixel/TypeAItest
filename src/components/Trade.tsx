import { useState } from "react";
import { getClient, describeError, readMessage } from "../lib/client";
import type { Settings } from "../lib/config";
import type { Chain, WalletState } from "../lib/wallet";
import { Banner, ChainToggle, ErrorBox, IconSwap, IconWallet, Spinner } from "./ui";
import SignPanel, { extractTx } from "./SignPanel";

type Prepared = { message: string; tx: unknown | null } | null;

export default function Trade({
  settings,
  wallet,
  chain,
  onChainChange,
  onConnect,
}: {
  settings: Settings;
  wallet: WalletState | null;
  chain: Chain;
  onChainChange: (c: Chain) => void;
  onConnect: () => void;
}) {
  const [mode, setMode] = useState<"swap" | "send">("swap");

  // Swap
  const [tokenIn, setTokenIn] = useState(chain === "ethereum" ? "ETH" : "SOL");
  const [tokenOut, setTokenOut] = useState("USDC");
  const [swapAmount, setSwapAmount] = useState("0.01");
  const [slippage, setSlippage] = useState("1");

  // Send
  const [sendToken, setSendToken] = useState(chain === "ethereum" ? "USDC" : "SOL");
  const [sendAmount, setSendAmount] = useState("1");
  const [recipient, setRecipient] = useState("");

  const [prepared, setPrepared] = useState<Prepared>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const address = wallet?.address ?? "";
  const wrongChain = wallet && wallet.chain !== chain;

  async function prepareSwap() {
    if (!address || busy) return;
    setBusy(true);
    setError(null);
    setPrepared(null);
    try {
      const res = await getClient(settings).swapTokens({
        tokenIn: tokenIn.trim(),
        tokenOut: tokenOut.trim(),
        amountToSwap: Number(swapAmount),
        slippage: slippage ? Number(slippage) : undefined,
        blockchain: chain,
        walletAddress: address,
      });
      const tx = extractTx(res?.data, chain);
      const msg = readMessage(res?.message).text;
      if (!tx && /fail/i.test(msg)) setError(msg);
      else setPrepared({ message: msg, tx });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function prepareSend() {
    if (!address || busy) return;
    setBusy(true);
    setError(null);
    setPrepared(null);
    try {
      const res = await getClient(settings).sendToken({
        token: sendToken.trim(),
        amount: Number(sendAmount),
        blockchain: chain as never,
        senderWalletAddress: address,
        recipientWalletAddress: recipient.trim(),
      });
      const tx = extractTx(res?.data, chain);
      const msg = readMessage(res?.message).text;
      if (!tx && /fail/i.test(msg)) setError(msg);
      else setPrepared({ message: msg, tx });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content-pad">
      <Banner tone="warn">
        <strong>This builds live mainnet transactions.</strong> The SDK only prepares
        an unsigned payload — it never sees a private key — but anything you approve in
        your wallet is real and irreversible. Start with a tiny amount.
      </Banner>

      <div className="card">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div className="seg" role="group" aria-label="Action">
            <button
              type="button"
              aria-pressed={mode === "swap"}
              onClick={() => {
                setMode("swap");
                setPrepared(null);
                setError(null);
              }}
            >
              Swap
            </button>
            <button
              type="button"
              aria-pressed={mode === "send"}
              onClick={() => {
                setMode("send");
                setPrepared(null);
                setError(null);
              }}
            >
              Send
            </button>
          </div>
          <ChainToggle
            value={chain}
            onChange={(c) => {
              onChainChange(c);
              setPrepared(null);
              setError(null);
              setTokenIn(c === "ethereum" ? "ETH" : "SOL");
              setSendToken(c === "ethereum" ? "USDC" : "SOL");
            }}
          />
          <span className="spacer" />
          {wallet ? (
            <span className="chip ok">
              <span className="dot" /> {wallet.chain} connected
            </span>
          ) : (
            <button className="btn sm" onClick={onConnect}>
              <IconWallet /> Connect wallet
            </button>
          )}
        </div>
      </div>

      {wrongChain && (
        <Banner tone="warn">
          Your connected wallet is on <strong>{wallet.chain}</strong> but this form is
          set to <strong>{chain}</strong>. Switch one of them before preparing a
          transaction.
        </Banner>
      )}

      <div className="card">
        {mode === "swap" ? (
          <>
            <h2 className="card-title">Swap tokens</h2>
            <p className="card-sub">
              <code>client.swapTokens()</code> — routes through KyberSwap on Ethereum
              and Jupiter on Solana, audits the output token for transfer taxes, and
              hands back a payload your wallet signs.
            </p>
            <div className="row">
              <div className="field">
                <label htmlFor="ti">From</label>
                <input
                  id="ti"
                  className="input mono"
                  value={tokenIn}
                  onChange={(e) => setTokenIn(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="to">To</label>
                <input
                  id="to"
                  className="input mono"
                  value={tokenOut}
                  onChange={(e) => setTokenOut(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="amt">Amount</label>
                <input
                  id="amt"
                  className="input mono"
                  inputMode="decimal"
                  value={swapAmount}
                  onChange={(e) => setSwapAmount(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="slip">Slippage %</label>
                <input
                  id="slip"
                  className="input mono"
                  inputMode="decimal"
                  value={slippage}
                  onChange={(e) => setSlippage(e.target.value)}
                />
              </div>
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button
                className="btn primary"
                onClick={() => void prepareSwap()}
                disabled={busy || !address || Number(swapAmount) <= 0}
              >
                {busy ? <Spinner /> : <IconSwap />}
                {busy ? "Building route…" : "Prepare swap"}
              </button>
              {!address && <span className="faint">Connect a wallet first.</span>}
            </div>
          </>
        ) : (
          <>
            <h2 className="card-title">Send tokens</h2>
            <p className="card-sub">
              <code>client.sendToken()</code> — resolves the token contract, checks
              decimals and balance, and returns a transfer ready for signing.
            </p>
            <div className="row">
              <div className="field">
                <label htmlFor="st">Token</label>
                <input
                  id="st"
                  className="input mono"
                  value={sendToken}
                  onChange={(e) => setSendToken(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="sa">Amount</label>
                <input
                  id="sa"
                  className="input mono"
                  inputMode="decimal"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                />
              </div>
              <div className="field" style={{ flex: "3 1 300px" }}>
                <label htmlFor="rc">Recipient</label>
                <input
                  id="rc"
                  className="input mono"
                  value={recipient}
                  placeholder={chain === "ethereum" ? "0x…" : "Solana pubkey"}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </div>
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button
                className="btn primary"
                onClick={() => void prepareSend()}
                disabled={
                  busy || !address || !recipient.trim() || Number(sendAmount) <= 0
                }
              >
                {busy ? <Spinner /> : null}
                {busy ? "Preparing…" : "Prepare transfer"}
              </button>
              {!address && <span className="faint">Connect a wallet first.</span>}
            </div>
          </>
        )}

        {error && (
          <div style={{ marginTop: 14 }}>
            <ErrorBox>{error}</ErrorBox>
          </div>
        )}
      </div>

      {prepared && (
        <div className="card">
          <h3 className="card-title">Quote</h3>
          <p
            className="dim"
            style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: 13 }}
          >
            {prepared.message || "The SDK returned a transaction with no summary."}
          </p>
          {prepared.tx ? (
            <SignPanel tx={prepared.tx} chain={chain} />
          ) : (
            <Banner>
              No signable payload came back — usually the route could not be built for
              this pair or amount. Try a different amount or token.
            </Banner>
          )}
        </div>
      )}
    </div>
  );
}

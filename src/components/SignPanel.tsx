import { useState } from "react";
import { describeError } from "../lib/client";
import {
  explorerTxUrl,
  sendEthereumTx,
  sendSolanaTx,
  shortAddress,
  type Chain,
  type EthTx,
} from "../lib/wallet";
import { Banner, ErrorBox, IconExternal, Spinner } from "./ui";

/** Pull a signable transaction out of an SDK response, if there is one. */
export function extractTx(data: unknown, chain: Chain): EthTx | unknown | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (chain === "solana") {
    const tx = d.tx as Record<string, unknown> | undefined;
    const swap = tx?.swap as Record<string, unknown> | undefined;
    return swap?.signAbleTransaction ?? null;
  }
  const tx = d.tx as EthTx | undefined;
  return tx && typeof tx === "object" && "to" in tx ? tx : null;
}

const safeJson = (v: unknown) => {
  try {
    return (
      JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2) ??
      String(v)
    ).slice(0, 4000);
  } catch {
    return String(v);
  }
};

/**
 * The SDK never holds a private key — it hands back an unsigned payload and the user's
 * own wallet does the signing. This panel is that handoff.
 */
export default function SignPanel({
  tx,
  chain,
  compact = false,
}: {
  tx: unknown;
  chain: Chain;
  compact?: boolean;
}) {
  const [state, setState] = useState<"idle" | "signing" | "sent" | "error">("idle");
  const [hash, setHash] = useState("");
  const [err, setErr] = useState("");

  async function sign() {
    setState("signing");
    setErr("");
    try {
      const h =
        chain === "ethereum"
          ? await sendEthereumTx(tx as EthTx)
          : await sendSolanaTx(tx);
      setHash(h);
      setState("sent");
    } catch (e) {
      setErr(describeError(e));
      setState("error");
    }
  }

  return (
    <div className="card" style={{ marginTop: compact ? 12 : 16, padding: 14 }}>
      <Banner tone="warn">
        This is a <strong>real transaction on {chain} mainnet</strong>. Nothing is
        signed until you approve it in your wallet — read the wallet prompt carefully,
        because approving moves real funds.
      </Banner>

      {state === "sent" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="chip ok">
            <span className="dot" /> Broadcast
          </span>
          <a
            href={explorerTxUrl(chain, hash)}
            target="_blank"
            rel="noreferrer"
            className="mono"
            style={{ fontSize: 12.5 }}
          >
            {shortAddress(hash, 8)} <IconExternal />
          </a>
        </div>
      ) : (
        <button
          className="btn primary"
          onClick={() => void sign()}
          disabled={state === "signing"}
        >
          {state === "signing" ? <Spinner /> : null}
          {state === "signing" ? "Waiting for wallet…" : "Review & sign in wallet"}
        </button>
      )}

      {state === "error" && (
        <div style={{ marginTop: 10 }}>
          <ErrorBox>{err}</ErrorBox>
        </div>
      )}

      <details style={{ marginTop: 12 }}>
        <summary className="faint" style={{ fontSize: 12, cursor: "pointer" }}>
          Raw transaction payload
        </summary>
        <pre
          className="mono"
          style={{
            fontSize: 11,
            background: "var(--bg)",
            border: "1px solid var(--line-soft)",
            borderRadius: 8,
            padding: 10,
            overflowX: "auto",
            marginTop: 8,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {safeJson(tx)}
        </pre>
      </details>
    </div>
  );
}

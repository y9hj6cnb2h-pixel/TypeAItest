import { useState } from "react";
import { getClient, describeError, readMessage } from "../lib/client";
import { covalentKeyLooksValid, type Settings } from "../lib/config";
import {
  explorerAddressUrl,
  shortAddress,
  type Chain,
  type WalletState,
} from "../lib/wallet";
import { amount, usd } from "../lib/format";
import {
  diagnoseAgentFailure,
  resetDiagnosis,
  SDK_GENERIC_FAILURE,
} from "../lib/netlog";
import Donut, { SLICE_COLORS, type Slice } from "./Donut";
import { PoweredBy } from "./Brand";
import { ChainToggle, ErrorBox, IconBolt, IconWallet, Spinner } from "./ui";

type Holding = {
  name?: string;
  symbol?: string;
  contract_address?: string;
  type?: string;
  balance?: string;
  balanceUSD?: string;
  quote?: number;
};

type Report = {
  address: string;
  chain: Chain;
  native?: { balance: number; symbol: string };
  gas?: string;
  holdings?: Holding[];
  verdict?: string;
  /** True when the read was composed here because the hosted model was unreachable. */
  verdictLocal?: boolean;
  notes: string[];
};

/**
 * A deterministic read for when the hosted model can't be reached. It says less than
 * the model would, but it is drawn from the same numbers and keeps the scan complete.
 */
function localRead(out: Report): string | undefined {
  const tokens = (out.holdings ?? []).filter((h) => h.type !== "nft");
  const ranked = tokens
    .map((h) => ({ h, v: parseUsd(h) }))
    .sort((a, b) => b.v - a.v);
  const total = ranked.reduce((s, x) => s + x.v, 0);
  const parts: string[] = [];

  if (out.native)
    parts.push(
      `Holds ${amount(out.native.balance)} ${out.native.symbol} natively.`,
    );
  if (!ranked.length) return parts.length ? parts.join(" ") : undefined;

  parts.push(
    `Across ${tokens.length} priced token${tokens.length === 1 ? "" : "s"} the ` +
      `wallet is worth about ${usd(total)}.`,
  );
  const top = ranked[0];
  if (total > 0 && top) {
    const pct = (top.v / total) * 100;
    parts.push(
      `${top.h.symbol ?? "Its largest position"} alone is ${pct.toFixed(0)}% of that, ` +
        (pct > 70
          ? "so the wallet lives or dies on that one position."
          : pct > 40
            ? "a meaningful concentration but not everything."
            : "so it is reasonably spread out."),
    );
  }
  return parts.join(" ");
}

const parseUsd = (h: Holding) =>
  typeof h.quote === "number" && Number.isFinite(h.quote)
    ? h.quote
    : h.balanceUSD
      ? Number(h.balanceUSD.replace(/[$,]/g, "")) || 0
      : 0;

/**
 * A single tap that fans out across several SDK calls and folds the results into one
 * read on a wallet. Each step degrades on its own: the native balance and gas come
 * from a plain RPC and need no key at all, holdings need Covalent, and the written
 * verdict needs the hosted model — so the scan is useful at every level of setup.
 */
export default function Scan({
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
  const [address, setAddress] = useState(wallet?.address ?? "");
  const [report, setReport] = useState<Report | null>(null);
  const [stage, setStage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const native = chain === "ethereum" ? "ETH" : "SOL";

  async function scan(addr: string) {
    const target = addr.trim();
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    setReport(null);
    resetDiagnosis();

    const client = getClient(settings);
    const out: Report = { address: target, chain, notes: [] };

    // 1. Native balance and network fees — plain RPC, no API key required.
    setStage(`Reading ${native} balance`);
    try {
      const res = await client.getTokenBalance({
        token: native,
        walletAddress: target,
        blockchain: chain as never,
      });
      if (res?.data?.tokenBalance !== undefined) {
        out.native = {
          balance: Number(res.data.tokenBalance),
          symbol: res.data.tokenSymbol ?? native,
        };
      }
    } catch (err) {
      out.notes.push(`Balance unavailable — ${describeError(err)}`);
    }

    setStage("Checking network fees");
    try {
      const res = await client.getTransactionFee({ blockchain: chain });
      const d = res?.data as { gasPrice?: string | number } | undefined;
      const text = readMessage(res?.message).text;
      // The SDK reports failures as prose in `message`; never let that land in a
      // stat tile, where it reads as a value.
      out.gas =
        d && typeof d === "object" && d.gasPrice !== undefined
          ? `${d.gasPrice} gwei`
          : /fail|error|unable/i.test(text)
            ? undefined
            : text.slice(0, 40) || undefined;
    } catch {
      /* fees are a nice-to-have */
    }

    // 2. Full holdings — needs Covalent.
    if (settings.covalentApiKey && covalentKeyLooksValid(settings.covalentApiKey)) {
      setStage("Pulling token holdings");
      try {
        const res = await client.getTokenPortfolio({
          walletAddress: target,
          blockchain: chain,
          nftConfirmation: false,
        });
        if (Array.isArray(res?.data)) out.holdings = res.data as Holding[];
        else out.notes.push(readMessage(res?.message).text.slice(0, 200));
      } catch (err) {
        out.notes.push(`Holdings unavailable — ${describeError(err)}`);
      }
    } else {
      out.notes.push(
        "Add a Covalent key in Settings to include the full token breakdown.",
      );
    }

    // 3. Ask the model to read the wallet, given what we just gathered.
    setStage("Asking TypeAI for a read");
    try {
      const facts: string[] = [`Wallet ${target} on ${chain}.`];
      if (out.native)
        facts.push(`Native balance: ${out.native.balance} ${out.native.symbol}.`);
      if (out.holdings?.length) {
        const top = out.holdings
          .filter((h) => h.type !== "nft")
          .map((h) => ({ h, v: parseUsd(h) }))
          .sort((a, b) => b.v - a.v)
          .slice(0, 8)
          .map(({ h, v }) => `${h.symbol ?? "?"} ${amount(h.balance)} (~$${v.toFixed(0)})`);
        facts.push(`Top holdings: ${top.join(", ")}.`);
      }
      const res = await client.prompt({
        message:
          `${facts.join(" ")} In 3 short sentences, describe what kind of wallet ` +
          `this looks like, how concentrated it is, and one practical observation. ` +
          `Do not repeat the raw numbers back.`,
        blockchain: chain as never,
      });
      const responses = Array.isArray(res) ? res : res.responses;
      const text = responses?.map((r) => readMessage(r.message).text).join("\n\n");
      if (text?.includes(SDK_GENERIC_FAILURE)) {
        await new Promise((r) => setTimeout(r, 60));
        out.notes.push(`AI read unavailable. ${diagnoseAgentFailure()}`);
      } else if (text) {
        out.verdict = text;
      }
    } catch (err) {
      out.notes.push(`AI read unavailable — ${describeError(err)}`);
    }

    // No hosted read? Compose one from the numbers we already have.
    if (!out.verdict) {
      const local = localRead(out);
      if (local) {
        out.verdict = local;
        out.verdictLocal = true;
      }
    }

    setStage("");
    setBusy(false);
    if (!out.native && !out.holdings && !out.verdict) {
      setError(
        out.notes.join(" ") ||
          "Nothing could be read for that address. Check the address and chain.",
      );
    } else {
      setReport(out);
    }
  }

  const tokens = (report?.holdings ?? []).filter((h) => h.type !== "nft");
  const ranked = tokens
    .map((h) => ({ h, value: parseUsd(h) }))
    .sort((a, b) => b.value - a.value);
  const total = ranked.reduce((s, x) => s + x.value, 0);
  const concentration = total > 0 && ranked[0] ? (ranked[0].value / total) * 100 : 0;

  const slices: Slice[] = ranked
    .filter((x) => x.value > 0)
    .slice(0, 6)
    .map((x) => ({ label: x.h.symbol || "?", value: x.value }));
  const rest = ranked
    .filter((x) => x.value > 0)
    .slice(6)
    .reduce((s, x) => s + x.value, 0);
  if (rest > 0) slices.push({ label: "Other", value: rest });

  return (
    <div className="content-pad">
      <section className="hero">
        <h2 className="hero-title">Ping any wallet.</h2>
        <p className="hero-sub">
          One tap fans out across the TypeAI SDK — balance, network fees, full token
          holdings — then asks the model to tell you what it's looking at.
        </p>

        <div className="scan-box">
          <input
            className="input mono scan-input"
            value={address}
            placeholder={chain === "ethereum" ? "0x… address" : "Solana address"}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void scan(address)}
          />
          <button
            className="btn primary lg"
            onClick={() => void scan(address)}
            disabled={busy || !address.trim()}
          >
            {busy ? <Spinner /> : <IconBolt />}
            {busy ? "Scanning…" : "Scan"}
          </button>
        </div>

        <div className="scan-actions">
          <ChainToggle value={chain} onChange={onChainChange} />
          {wallet ? (
            <button
              className="btn sm ghost"
              onClick={() => {
                setAddress(wallet.address);
                void scan(wallet.address);
              }}
            >
              <IconWallet /> Scan my wallet
            </button>
          ) : (
            <button className="btn sm ghost" onClick={onConnect}>
              <IconWallet /> Connect wallet
            </button>
          )}
        </div>

        {busy && stage && (
          <p className="scan-stage">
            <span className="pulse" /> {stage}…
          </p>
        )}
      </section>

      {error && <ErrorBox>{error}</ErrorBox>}

      {report && (
        <>
          <div className="stat-row">
            <div className="stat">
              <div className="k">{report.native?.symbol ?? native} balance</div>
              <div className="v">
                {report.native ? amount(report.native.balance) : "—"}
              </div>
            </div>
            {total > 0 && (
              <div className="stat">
                <div className="k">Portfolio value</div>
                <div className="v">{usd(total)}</div>
              </div>
            )}
            {tokens.length > 0 && (
              <div className="stat">
                <div className="k">Concentration</div>
                <div className={`v ${concentration > 70 ? "down" : "up"}`}>
                  {concentration.toFixed(0)}%
                </div>
                <div className="faint" style={{ fontSize: 11 }}>
                  in {ranked[0]?.h.symbol ?? "top position"}
                </div>
              </div>
            )}
            <div className="stat">
              <div className="k">Network fee</div>
              <div className="v" style={{ fontSize: 16 }}>{report.gas ?? "—"}</div>
            </div>
          </div>

          {report.verdict && (
            <div className="card verdict">
              <div className="verdict-head">
                {report.verdictLocal ? (
                  <span
                    className="chip warn"
                    title="The hosted TypeAI model was unreachable, so this was composed in your browser from the same SDK data."
                  >
                    <span className="dot" /> Offline read
                  </span>
                ) : (
                  <span className="chip ok">
                    <span className="dot" /> TypeAI read
                  </span>
                )}
                <PoweredBy compact />
              </div>
              <p className="verdict-text">{report.verdict}</p>
            </div>
          )}

          {slices.length > 0 && (
            <div className="card">
              <h3 className="card-title">Allocation</h3>
              <div className="donut-wrap">
                <Donut slices={slices} size={148} />
                <div className="legend">
                  {slices.map((s, i) => (
                    <div className="legend-item" key={s.label + i}>
                      <span
                        className="legend-swatch"
                        style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
                      />
                      <span className="legend-name">{s.label}</span>
                      <span className="legend-val">
                        {((s.value / total) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {ranked.length > 0 && (
            <div className="card">
              <h3 className="card-title">Holdings</h3>
              <ul className="holding-list">
                {ranked.slice(0, 12).map(({ h, value }, i) => (
                  <li key={(h.contract_address ?? "") + i}>
                    <span className="holding-sym">{h.symbol ?? "—"}</span>
                    <span className="holding-name faint">{h.name ?? ""}</span>
                    <span className="holding-amt mono">{amount(h.balance)}</span>
                    <span className="holding-val mono">
                      {value > 0 ? usd(value) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <h3 className="card-title">Scanned</h3>
            <a
              className="mono"
              href={explorerAddressUrl(report.chain, report.address)}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12.5, wordBreak: "break-all" }}
            >
              {shortAddress(report.address, 10)}
            </a>
            {report.notes.length > 0 && (
              <ul className="note-list">
                {report.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { loadSettings, saveSettings, type Settings as S } from "./lib/config";
import {
  connectEthereum,
  connectSolana,
  disconnectSolana,
  hasMetaMask,
  hasPhantom,
  shortAddress,
  type Chain,
  type WalletState,
} from "./lib/wallet";
import Copilot from "./components/Copilot";
import Portfolio from "./components/Portfolio";
import TokenResearch from "./components/TokenResearch";
import TxExplainer from "./components/TxExplainer";
import Trade from "./components/Trade";
import SettingsView from "./components/Settings";
import {
  IconGear,
  IconPie,
  IconReceipt,
  IconSearch,
  IconSpark,
  IconSwap,
  IconWallet,
  Spinner,
} from "./components/ui";

type ViewId = "copilot" | "portfolio" | "tokens" | "tx" | "trade" | "settings";

const VIEWS: Array<{
  id: ViewId;
  label: string;
  title: string;
  sub: string;
  icon: React.ReactNode;
  group: string;
}> = [
  {
    id: "copilot",
    label: "Copilot",
    title: "Copilot",
    sub: "Natural language over live chain data",
    icon: <IconSpark />,
    group: "Ask",
  },
  {
    id: "portfolio",
    label: "Portfolio",
    title: "Portfolio",
    sub: "Every token a wallet holds, priced",
    icon: <IconPie />,
    group: "Analyse",
  },
  {
    id: "tokens",
    label: "Tokens",
    title: "Token research",
    sub: "Prices, supply and balances",
    icon: <IconSearch />,
    group: "Analyse",
  },
  {
    id: "tx",
    label: "Transactions",
    title: "Transactions",
    sub: "Decode any hash, check live fees",
    icon: <IconReceipt />,
    group: "Analyse",
  },
  {
    id: "trade",
    label: "Swap & send",
    title: "Swap & send",
    sub: "Build transactions, sign in your wallet",
    icon: <IconSwap />,
    group: "Act",
  },
  {
    id: "settings",
    label: "Settings",
    title: "Settings",
    sub: "Providers, keys and connectivity",
    icon: <IconGear />,
    group: "Act",
  },
];

export default function App() {
  const [view, setView] = useState<ViewId>("copilot");
  const [settings, setSettings] = useState<S>(() => loadSettings());
  const [chain, setChain] = useState<Chain>("ethereum");
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setWalletError(null);
    try {
      setWallet(chain === "ethereum" ? await connectEthereum() : await connectSolana());
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }, [chain]);

  const disconnect = useCallback(async () => {
    if (wallet?.chain === "solana") await disconnectSolana();
    setWallet(null);
  }, [wallet]);

  const current = VIEWS.find((v) => v.id === view)!;
  const groups = [...new Set(VIEWS.map((v) => v.group))];
  const walletAvailable = chain === "ethereum" ? hasMetaMask() : hasPhantom();

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 17 8 8l4 5.5L15 10l6 7" />
            </svg>
          </div>
          <div className="brand-text">
            <div className="brand-name">Onchain Copilot</div>
            <div className="brand-sub">TypeAI SDK</div>
          </div>
        </div>

        <div className="nav">
          {groups.map((g) => (
            <div key={g}>
              <div className="nav-label">{g}</div>
              {VIEWS.filter((v) => v.group === g).map((v) => (
                <button
                  key={v.id}
                  className="nav-item"
                  aria-current={view === v.id}
                  onClick={() => setView(v.id)}
                >
                  <span className="nav-icon">{v.icon}</span>
                  <span>{v.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="sidebar-foot">
          Powered by <code>type-ai-sdk</code>
          <br />
          <a
            href="https://www.npmjs.com/package/type-ai-sdk"
            target="_blank"
            rel="noreferrer"
          >
            View on npm
          </a>
        </div>
      </nav>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{current.title}</h1>
            <div className="sub">{current.sub}</div>
          </div>
          <span className="spacer" />

          {walletError && (
            <span className="chip bad" title={walletError}>
              <span className="dot" /> {walletError.slice(0, 44)}
            </span>
          )}

          {wallet ? (
            <div className="wallet-pill">
              <span className="dot" style={{ color: "var(--mint)" }} />
              <span className="addr">{shortAddress(wallet.address, 5)}</span>
              <button className="btn sm ghost" onClick={() => void disconnect()}>
                Disconnect
              </button>
            </div>
          ) : (
            <button
              className="btn"
              onClick={() => void connect()}
              disabled={connecting}
              title={
                walletAvailable
                  ? undefined
                  : `No ${chain === "ethereum" ? "Ethereum" : "Solana"} wallet detected in this browser`
              }
            >
              {connecting ? <Spinner /> : <IconWallet />}
              {connecting
                ? "Connecting…"
                : `Connect ${chain === "ethereum" ? "MetaMask" : "Phantom"}`}
            </button>
          )}
        </header>

        <div className={`content${view === "copilot" ? " content-flush" : ""}`}>
          {view === "copilot" && (
            <Copilot
              settings={settings}
              wallet={wallet}
              chain={chain}
              onChainChange={setChain}
            />
          )}
          {view === "portfolio" && (
            <Portfolio
              settings={settings}
              wallet={wallet}
              chain={chain}
              onChainChange={setChain}
            />
          )}
          {view === "tokens" && (
            <TokenResearch
              settings={settings}
              wallet={wallet}
              chain={chain}
              onChainChange={setChain}
            />
          )}
          {view === "tx" && (
            <TxExplainer
              settings={settings}
              chain={chain}
              onChainChange={setChain}
            />
          )}
          {view === "trade" && (
            <Trade
              settings={settings}
              wallet={wallet}
              chain={chain}
              onChainChange={setChain}
              onConnect={() => void connect()}
            />
          )}
          {view === "settings" && (
            <SettingsView settings={settings} onChange={setSettings} />
          )}
        </div>
      </main>
    </div>
  );
}

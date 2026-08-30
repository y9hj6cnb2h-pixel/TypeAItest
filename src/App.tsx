import { useCallback, useEffect, useState } from "react";
import { loadSettings, saveSettings, type Settings as S } from "./lib/config";
import {
  connectEthereum,
  connectSolana,
  disconnectSolana,
  shortAddress,
  type Chain,
  type WalletState,
} from "./lib/wallet";
import Scan from "./components/Scan";
import Copilot from "./components/Copilot";
import Portfolio from "./components/Portfolio";
import TokenResearch from "./components/TokenResearch";
import TxExplainer from "./components/TxExplainer";
import Trade from "./components/Trade";
import SettingsView from "./components/Settings";
import { Logo, PoweredBy } from "./components/Brand";
import {
  IconBolt,
  IconGear,
  IconMore,
  IconPie,
  IconReceipt,
  IconSearch,
  IconSpark,
  IconSwap,
  IconWallet,
  Spinner,
} from "./components/ui";

type ViewId =
  | "scan"
  | "copilot"
  | "portfolio"
  | "tokens"
  | "tx"
  | "trade"
  | "settings"
  | "more";

type View = {
  id: ViewId;
  label: string;
  title: string;
  sub: string;
  icon: React.ReactNode;
  group: string;
};

const VIEWS: View[] = [
  {
    id: "scan",
    label: "Scan",
    title: "Scan",
    sub: "One tap, a full read on any wallet",
    icon: <IconBolt />,
    group: "Start",
  },
  {
    id: "copilot",
    label: "Ask",
    title: "Ask",
    sub: "Natural language over live chain data",
    icon: <IconSpark />,
    group: "Start",
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

// A phone can't carry seven tabs; the rest live behind "More".
const MOBILE_TABS: ViewId[] = ["scan", "copilot", "portfolio", "tokens"];
const MORE_VIEWS = VIEWS.filter((v) => !MOBILE_TABS.includes(v.id));

export default function App() {
  const [view, setView] = useState<ViewId>("scan");
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

  const current =
    VIEWS.find((v) => v.id === view) ??
    ({
      id: "more",
      label: "More",
      title: "More",
      sub: "Everything else Sonari can do",
      icon: <IconMore />,
      group: "",
    } as View);

  const groups = [...new Set(VIEWS.map((v) => v.group))];
  const shared = { settings, wallet, chain, onChainChange: setChain };

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Sections">
        <div className="brand">
          <Logo size={30} />
          <div className="brand-text">
            <div className="brand-name">Sonari</div>
            <div className="brand-sub">Onchain AI</div>
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
          <PoweredBy />
        </div>
      </nav>

      <main className="main">
        <header className="topbar">
          <div className="topbar-id">
            <span className="topbar-logo">
              <Logo size={26} />
            </span>
            <div className="topbar-text">
              <h1>{current.title}</h1>
              <div className="sub">{current.sub}</div>
            </div>
          </div>
          <span className="spacer" />

          <span className="topbar-powered">
            <PoweredBy compact />
          </span>

          {wallet ? (
            <div className="wallet-pill">
              <span className="dot" style={{ color: "var(--mint)" }} />
              <span className="addr">{shortAddress(wallet.address, 4)}</span>
              <button
                className="btn sm ghost"
                onClick={() => void disconnect()}
                aria-label="Disconnect wallet"
              >
                Exit
              </button>
            </div>
          ) : (
            <button
              className="btn sm connect-btn"
              onClick={() => void connect()}
              disabled={connecting}
            >
              {connecting ? <Spinner /> : <IconWallet />}
              <span className="connect-label">
                {connecting ? "Connecting…" : "Connect"}
              </span>
            </button>
          )}
        </header>

        {walletError && (
          <div className="topbar-alert" role="alert">
            {walletError}
            <button
              className="topbar-alert-x"
              onClick={() => setWalletError(null)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        <div className={`content${view === "copilot" ? " content-flush" : ""}`}>
          {view === "scan" && <Scan {...shared} onConnect={() => void connect()} />}
          {view === "copilot" && <Copilot {...shared} />}
          {view === "portfolio" && <Portfolio {...shared} />}
          {view === "tokens" && <TokenResearch {...shared} />}
          {view === "tx" && (
            <TxExplainer settings={settings} chain={chain} onChainChange={setChain} />
          )}
          {view === "trade" && (
            <Trade {...shared} onConnect={() => void connect()} />
          )}
          {view === "settings" && (
            <SettingsView settings={settings} onChange={setSettings} />
          )}
          {view === "more" && (
            <div className="content-pad">
              <ul className="more-list">
                {MORE_VIEWS.map((v) => (
                  <li key={v.id}>
                    <button onClick={() => setView(v.id)}>
                      <span className="more-icon">{v.icon}</span>
                      <span className="more-text">
                        <span className="more-label">{v.label}</span>
                        <span className="more-sub">{v.sub}</span>
                      </span>
                      <span className="more-chev" aria-hidden>
                        ›
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 22, textAlign: "center" }}>
                <PoweredBy />
              </div>
            </div>
          )}
        </div>

        <nav className="tabbar" aria-label="Sections">
          {MOBILE_TABS.map((id) => {
            const v = VIEWS.find((x) => x.id === id)!;
            return (
              <button
                key={id}
                className="tab"
                aria-current={view === id}
                onClick={() => setView(id)}
              >
                {v.icon}
                <span>{v.label}</span>
              </button>
            );
          })}
          <button
            className="tab"
            aria-current={view === "more" || MORE_VIEWS.some((v) => v.id === view)}
            onClick={() => setView("more")}
          >
            <IconMore />
            <span>More</span>
          </button>
        </nav>
      </main>
    </div>
  );
}

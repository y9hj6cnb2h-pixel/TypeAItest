import type { ITypeAiClientConfig } from "type-ai-sdk";

const STORE_KEY = "onchain-copilot:config";

export type Settings = {
  alchemyApiKey: string;
  alchemyNetwork: string;
  ethereumRpcUrl: string;
  etherscanApiKey: string;
  dexToolsApiKey: string;
  covalentApiKey: string;
  solanaRpcUrl: string;
};

/**
 * Public, keyless endpoints so the app does something useful on first load.
 * They are heavily rate-limited — the Settings tab explains how to swap in your own.
 */
export const DEFAULTS: Settings = {
  alchemyApiKey: "",
  alchemyNetwork: "mainnet",
  ethereumRpcUrl: "https://ethereum-rpc.publicnode.com",
  etherscanApiKey: "",
  dexToolsApiKey: "",
  covalentApiKey: "",
  solanaRpcUrl: "https://api.mainnet-beta.solana.com",
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* private mode / storage disabled — settings just won't persist */
  }
}

export function clearSettings() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* nothing to do */
  }
}

/** Only pass through what the user actually filled in. */
export function toClientConfig(s: Settings): ITypeAiClientConfig {
  const cfg: ITypeAiClientConfig = {};
  if (s.alchemyApiKey) {
    cfg.alchemyApiKey = s.alchemyApiKey;
    cfg.alchemyNetwork = s.alchemyNetwork || "mainnet";
  }
  if (s.ethereumRpcUrl) cfg.ethereumRpcUrl = s.ethereumRpcUrl;
  if (s.etherscanApiKey) cfg.etherscanApiKey = s.etherscanApiKey;
  if (s.dexToolsApiKey) cfg.dexToolsApiKey = s.dexToolsApiKey;
  if (s.covalentApiKey) cfg.covalentApiKey = s.covalentApiKey;
  if (s.solanaRpcUrl) cfg.solanaRpcUrl = s.solanaRpcUrl;
  return cfg;
}

/**
 * Covalent's client validates the key shape locally and refuses to make the request
 * if it doesn't match — the SDK then reports a generic "Failed to get portfolio", so
 * we check the format ourselves and say something useful instead.
 */
const COVALENT_KEY_RE =
  /^(ckey_[a-f0-9]{27}|cqt_(wF|rQ)[bcdfghjkmpqrtvwxyBCDFGHJKMPQRTVWXY346789]{26})$/;

export const covalentKeyLooksValid = (key: string) =>
  COVALENT_KEY_RE.test(key.trim());

/** Which capabilities are reachable with the current settings. */
export type Capability = {
  id: string;
  label: string;
  ready: boolean;
  needs: string;
};

export function capabilities(s: Settings): Capability[] {
  const eth = Boolean(s.ethereumRpcUrl || s.alchemyApiKey);
  return [
    {
      id: "chat",
      label: "AI copilot",
      ready: true,
      needs: "Hosted by TypeAI — no key required",
    },
    {
      id: "eth",
      label: "Ethereum reads",
      ready: eth,
      needs: "An Ethereum RPC URL or an Alchemy key",
    },
    {
      id: "sol",
      label: "Solana reads",
      ready: Boolean(s.solanaRpcUrl),
      needs: "A Solana RPC URL",
    },
    {
      id: "tokens",
      label: "Token research",
      ready: Boolean(s.dexToolsApiKey),
      needs: "A DEXTools API key (Solana falls back to DEX Screener)",
    },
    {
      id: "portfolio",
      label: "Portfolio",
      ready: Boolean(s.covalentApiKey),
      needs: "A Covalent API key",
    },
    {
      id: "txsum",
      label: "Transaction explainer",
      ready: Boolean(s.etherscanApiKey) || Boolean(s.solanaRpcUrl),
      needs: "An Etherscan key (Ethereum) or Solana RPC URL",
    },
  ];
}

/**
 * Keyless data providers.
 *
 * Three SDK paths need a paid-tier key: token details (DEXTools), portfolios
 * (Covalent) and Ethereum transaction summaries (Etherscan). This module fills those
 * gaps with public APIs that need no key, no account and no signup, and that send
 * `Access-Control-Allow-Origin: *` so a browser can call them directly:
 *
 *   - DEX Screener  — token price, market cap, liquidity, on both chains
 *   - Blockscout    — Ethereum token balances and decoded transactions
 *   - Public RPC    — Solana token accounts and native balances
 *
 * The shapes returned here deliberately match what the SDK returns, so the panels
 * render them without knowing which provider answered.
 */

const DEXSCREENER = "https://api.dexscreener.com";
const BLOCKSCOUT = "https://eth.blockscout.com/api/v2";
const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

export type KeylessHolding = {
  name?: string;
  symbol?: string;
  contract_name?: string;
  contract_address?: string;
  type?: string;
  balance?: string;
  balanceUSD?: string;
  quote?: number;
};

export type KeylessTokenDetails = {
  name?: string;
  symbol?: string;
  decimals?: number | string;
  currentPrice?: string;
  priceChange24h?: string;
  marketCap?: string;
  totalSupply?: string;
  contractAddress?: string;
  blockchain?: string;
  liquidityUsd?: string;
};

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

async function getJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${res.status}`);
  return res.json();
}

/* ------------------------------------------------------------- token details */

type DexPair = {
  chainId?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  fdv?: number;
  marketCap?: number;
  liquidity?: { usd?: number };
};

/** DEX Screener indexes both chains; pick the deepest pool for the token asked about. */
export async function keylessTokenDetails(
  token: string,
  chain: "ethereum" | "solana",
): Promise<KeylessTokenDetails> {
  const data = await getJson(
    `${DEXSCREENER}/latest/dex/search?q=${encodeURIComponent(token)}`,
  );
  const pairs: DexPair[] = Array.isArray(data?.pairs) ? data.pairs : [];
  const wanted = chain === "ethereum" ? "ethereum" : "solana";
  const query = token.trim().toLowerCase();

  const onChain = pairs.filter((p) => p.chainId === wanted);
  // Prefer an exact symbol or address match before falling back to fuzzy search hits.
  const exact = onChain.filter(
    (p) =>
      p.baseToken?.symbol?.toLowerCase() === query ||
      p.baseToken?.address?.toLowerCase() === query,
  );
  const pool = (exact.length ? exact : onChain).sort(
    (a, b) => num(b.liquidity?.usd) - num(a.liquidity?.usd),
  );
  const best = pool[0];
  if (!best)
    throw new Error(
      `No ${chain} market found for "${token}" on DEX Screener. Try the contract address.`,
    );

  const cap = num(best.marketCap) || num(best.fdv);
  return {
    name: best.baseToken?.name,
    symbol: best.baseToken?.symbol,
    currentPrice: best.priceUsd,
    priceChange24h:
      best.priceChange?.h24 !== undefined ? `${best.priceChange.h24}%` : undefined,
    marketCap: cap ? String(cap) : undefined,
    contractAddress: best.baseToken?.address,
    blockchain: chain,
    liquidityUsd: best.liquidity?.usd ? String(best.liquidity.usd) : undefined,
  };
}

/* ----------------------------------------------------------------- portfolio */

type BlockscoutBalance = {
  value?: string;
  token?: {
    address?: string;
    name?: string;
    symbol?: string;
    decimals?: string;
    exchange_rate?: string | null;
    type?: string;
  };
};

const scale = (raw: string, decimals: number) => {
  // Token balances overflow Number, so divide as a decimal string.
  const s = raw.padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals) || "0";
  const frac = decimals ? s.slice(s.length - decimals) : "";
  return Number(`${whole}.${frac || "0"}`);
};

async function ethPortfolio(address: string): Promise<KeylessHolding[]> {
  const [native, tokens] = await Promise.all([
    getJson(`${BLOCKSCOUT}/addresses/${address}`).catch(() => null),
    getJson(`${BLOCKSCOUT}/addresses/${address}/token-balances`).catch(() => []),
  ]);

  const out: KeylessHolding[] = [];

  if (native?.coin_balance) {
    const eth = scale(String(native.coin_balance), 18);
    const rate = num(native.exchange_rate);
    out.push({
      name: "Ether",
      symbol: "ETH",
      contract_address: "native",
      type: "cryptocurrency",
      balance: String(eth),
      quote: rate ? eth * rate : 0,
    });
  }

  for (const row of (tokens as BlockscoutBalance[]) ?? []) {
    const t = row?.token;
    if (!t || t.type === "ERC-721" || t.type === "ERC-1155") continue;
    const decimals = Number(t.decimals ?? 18) || 0;
    const amount = scale(String(row.value ?? "0"), decimals);
    if (!amount) continue;
    const rate = num(t.exchange_rate);
    out.push({
      name: t.name,
      symbol: t.symbol,
      contract_name: t.name,
      contract_address: t.address,
      type: "cryptocurrency",
      balance: String(amount),
      quote: rate ? amount * rate : 0,
    });
  }

  return out;
}

type SplAccount = {
  account?: {
    data?: {
      parsed?: {
        info?: {
          mint?: string;
          tokenAmount?: { uiAmount?: number; decimals?: number };
        };
      };
    };
  };
};

async function solPortfolio(
  address: string,
  rpcUrl: string,
): Promise<KeylessHolding[]> {
  const rpc = (method: string, params: unknown[]) =>
    getJson(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });

  const [lamports, accounts] = await Promise.all([
    rpc("getBalance", [address]).catch(() => null),
    rpc("getTokenAccountsByOwner", [
      address,
      { programId: SPL_TOKEN_PROGRAM },
      { encoding: "jsonParsed" },
    ]).catch(() => null),
  ]);

  const holdings: KeylessHolding[] = [];
  const sol = num(lamports?.result?.value) / 1e9;
  if (sol > 0)
    holdings.push({
      name: "Solana",
      symbol: "SOL",
      contract_address: "native",
      type: "cryptocurrency",
      balance: String(sol),
    });

  const rows: SplAccount[] = accounts?.result?.value ?? [];
  const mints: string[] = [];
  for (const r of rows) {
    const info = r?.account?.data?.parsed?.info;
    const amount = num(info?.tokenAmount?.uiAmount);
    if (!info?.mint || amount <= 0) continue;
    mints.push(info.mint);
    holdings.push({
      symbol: info.mint.slice(0, 4),
      contract_address: info.mint,
      type: "cryptocurrency",
      balance: String(amount),
    });
  }

  // Price and name what we can — DEX Screener takes up to 30 mints per call.
  const priced = new Map<string, DexPair>();
  for (let i = 0; i < mints.length; i += 30) {
    const batch = mints.slice(i, i + 30).join(",");
    try {
      const data = await getJson(`${DEXSCREENER}/tokens/v1/solana/${batch}`);
      const pairs: DexPair[] = Array.isArray(data) ? data : (data?.pairs ?? []);
      for (const p of pairs) {
        const addr = p.baseToken?.address;
        if (!addr) continue;
        const prev = priced.get(addr);
        if (!prev || num(p.liquidity?.usd) > num(prev.liquidity?.usd))
          priced.set(addr, p);
      }
    } catch {
      /* pricing is best-effort; balances still show */
    }
  }

  // SOL itself is priced through its wrapped mint.
  try {
    const wsol = await getJson(
      `${DEXSCREENER}/tokens/v1/solana/So11111111111111111111111111111111111111112`,
    );
    const pairs: DexPair[] = Array.isArray(wsol) ? wsol : (wsol?.pairs ?? []);
    const px = num(pairs.sort((a, b) => num(b.liquidity?.usd) - num(a.liquidity?.usd))[0]?.priceUsd);
    if (px && holdings[0]?.symbol === "SOL") holdings[0].quote = num(holdings[0].balance) * px;
  } catch {
    /* leave SOL unpriced */
  }

  for (const h of holdings) {
    const p = h.contract_address ? priced.get(h.contract_address) : undefined;
    if (!p) continue;
    h.name = p.baseToken?.name ?? h.name;
    h.symbol = p.baseToken?.symbol ?? h.symbol;
    h.quote = num(h.balance) * num(p.priceUsd);
  }

  return holdings;
}

export async function keylessPortfolio(
  address: string,
  chain: "ethereum" | "solana",
  solanaRpcUrl: string,
): Promise<KeylessHolding[]> {
  return chain === "ethereum"
    ? ethPortfolio(address)
    : solPortfolio(address, solanaRpcUrl);
}

/* ------------------------------------------------------- transaction summary */

/** Blockscout decodes the method and the token transfers, which is what Etherscan was for. */
export async function keylessTxSummary(hash: string): Promise<string> {
  const tx = await getJson(`${BLOCKSCOUT}/transactions/${hash}`);
  const lines: string[] = [];

  const when = tx?.timestamp ? new Date(tx.timestamp).toLocaleString() : null;
  lines.push(
    `Transaction ${hash} ${tx?.status === "ok" ? "succeeded" : `ended with status "${tx?.status ?? "unknown"}"`}` +
      `${when ? ` on ${when}` : ""}.`,
  );

  const from = tx?.from?.hash;
  const to = tx?.to?.hash ?? tx?.created_contract?.hash;
  if (from && to) lines.push(`Sent from ${from} to ${to}.`);

  const value = scale(String(tx?.value ?? "0"), 18);
  if (value > 0) lines.push(`It moved ${value} ETH.`);

  const method = tx?.decoded_input?.method_call ?? tx?.method;
  if (method) lines.push(`It called ${method}.`);

  try {
    const transfers = await getJson(`${BLOCKSCOUT}/transactions/${hash}/token-transfers`);
    for (const t of (transfers?.items ?? []).slice(0, 12)) {
      const dec = Number(t?.token?.decimals ?? 18) || 0;
      const raw = t?.total?.value ?? t?.total?.token_id;
      if (raw === undefined) continue;
      const amt = t?.total?.value ? scale(String(t.total.value), dec) : `#${t.total.token_id}`;
      lines.push(
        `Token transfer: ${amt} ${t?.token?.symbol ?? "?"} from ${t?.from?.hash} to ${t?.to?.hash}.`,
      );
    }
  } catch {
    /* transfers are supplementary */
  }

  const fee = scale(String(tx?.fee?.value ?? "0"), 18);
  if (fee > 0) lines.push(`The fee was ${fee} ETH.`);
  if (tx?.block_number) lines.push(`Included in block ${tx.block_number}.`);

  return lines.join("\n");
}

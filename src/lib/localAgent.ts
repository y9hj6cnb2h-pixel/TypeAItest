import type { TypeAiClient } from "type-ai-sdk";
import { readMessage } from "./client";
import { recordLocalTool } from "./netlog";
import type { Chain } from "./wallet";

/**
 * An offline stand-in for the hosted model's routing step.
 *
 * `prompt()` does two things: it asks TypeAI's model which tool to run, then asks it
 * to phrase the tool's output. Only that hosted call is blocked by CORS — the SDK's
 * tools themselves talk to CORS-clean endpoints and, crucially, already return
 * human-readable prose of their own ("The current gas price is 12 gwei…").
 *
 * So when the hosted call can't be reached, we do the routing here with plain pattern
 * matching and hand back the SDK's own sentence. It is narrower than a language model
 * and makes no attempt to hide that, but it keeps the app genuinely useful with no
 * proxy, no account and no third party in the path.
 */

export type LocalAnswer = {
  text: string;
  tool: string;
  args: Record<string, unknown>;
  data?: unknown;
};

const ETH_TX = /\b0x[a-fA-F0-9]{64}\b/;
const ETH_ADDR = /\b0x[a-fA-F0-9]{40}\b/;
// Base58 has no 0/O/I/l. Signatures are longer than addresses, so test them first.
const SOL_SIG = /\b[1-9A-HJ-NP-Za-km-z]{64,88}\b/;
const SOL_ADDR = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;

const KNOWN_TOKENS = [
  "ETH", "WETH", "USDC", "USDT", "DAI", "WBTC", "LINK", "UNI", "AAVE", "MATIC",
  "ARB", "OP", "PEPE", "SHIB", "CRV", "LDO", "MKR", "SNX", "COMP", "ENS",
  "SOL", "JUP", "BONK", "RAY", "ORCA", "JTO", "PYTH", "WIF", "MSOL",
];

function findTxHash(text: string, chain: Chain): string | null {
  if (chain === "ethereum") return text.match(ETH_TX)?.[0] ?? null;
  const sig = text.match(SOL_SIG)?.[0];
  return sig ?? null;
}

function findAddress(text: string, chain: Chain): string | null {
  if (chain === "ethereum") return text.match(ETH_ADDR)?.[0] ?? null;
  // Don't mistake a signature for an account.
  const stripped = text.replace(SOL_SIG, " ");
  return stripped.match(SOL_ADDR)?.[0] ?? null;
}

function findToken(text: string): string | null {
  const upper = text.toUpperCase();
  for (const t of KNOWN_TOKENS) {
    if (new RegExp(`\\b${t}\\b`).test(upper)) return t;
  }
  // Fall back to any short all-caps run that isn't a common English word.
  const m = text.match(/\b[A-Z]{2,6}\b/g);
  const stop = new Set(["I", "A", "THE", "AI", "USD", "NFT", "API", "RPC", "GAS"]);
  const candidate = m?.find((x) => !stop.has(x));
  return candidate ?? null;
}

/** Returns null when nothing matched, so the caller can say so honestly. */
export async function answerLocally(
  client: TypeAiClient,
  message: string,
  chain: Chain,
  walletAddress?: string,
): Promise<LocalAnswer | null> {
  const q = message.toLowerCase();
  const mine = /\bmy\b|\bmine\b|\bi hold\b|\bi own\b/.test(q);
  const address = findAddress(message, chain) ?? (mine ? walletAddress : undefined);
  const native = chain === "ethereum" ? "ETH" : "SOL";

  const run = async <T>(
    tool: string,
    args: Record<string, unknown>,
    call: () => Promise<T>,
  ) => {
    recordLocalTool(tool, args);
    return call();
  };

  // 1. Explain a transaction — a hash in the text is an unambiguous signal.
  const hash = findTxHash(message, chain);
  if (hash) {
    const res = await run("get_transaction_summary", { transactionHash: hash, blockchain: chain }, () =>
      client.getTransactionSummary({
        transactionHash: hash,
        blockchain: chain as never,
      }),
    );
    return {
      text: readMessage(res?.message).text,
      tool: "get_transaction_summary",
      args: { transactionHash: hash, blockchain: chain },
      data: res?.data,
    };
  }

  // 2. Network fees.
  if (/\bgas\b|\bfee\b|\bfees\b|gwei|cost to send|transaction cost/.test(q)) {
    const res = await run("get_transaction_fee", { blockchain: chain }, () =>
      client.getTransactionFee({ blockchain: chain }),
    );
    return {
      text: readMessage(res?.message).text,
      tool: "get_transaction_fee",
      args: { blockchain: chain },
      data: res?.data,
    };
  }

  // 3. Whole-wallet portfolio.
  if (/portfolio|holdings|holds|all (my )?tokens|net worth/.test(q) && address) {
    const res = await run("get_token_portfolio", { walletAddress: address, blockchain: chain }, () =>
      client.getTokenPortfolio({
        walletAddress: address,
        blockchain: chain,
        nftConfirmation: false,
      }),
    );
    return {
      text: readMessage(res?.message).text,
      tool: "get_token_portfolio",
      args: { walletAddress: address, blockchain: chain },
      data: res?.data,
    };
  }

  // 4. One token's balance in one wallet.
  if (/balance|how much|how many|do i have|holding/.test(q) && address) {
    const token = findToken(message) ?? native;
    const res = await run("get_token_balance", { token, walletAddress: address, blockchain: chain }, () =>
      client.getTokenBalance({
        token,
        walletAddress: address,
        blockchain: chain as never,
      }),
    );
    return {
      text: readMessage(res?.message).text,
      tool: "get_token_balance",
      args: { token, walletAddress: address, blockchain: chain },
      data: res?.data,
    };
  }

  // 5. Token research.
  const token = findToken(message);
  if (token && /price|worth|details|market cap|supply|about|tell me|what is|info/.test(q)) {
    const res = await run("all_token_details", { token, blockchain: chain }, () =>
      client.getTokenDetails({ token, blockchain: chain as never }),
    );
    const { text, value } = readMessage(res?.message);
    // getTokenDetails answers with a struct; render it as a readable summary.
    if (value && typeof value === "object") {
      const d = value as Record<string, unknown>;
      const line = [
        d.name ? `${d.name} (${d.symbol ?? token})` : token,
        d.currentPrice ? `trades at $${d.currentPrice}` : null,
        d.priceChange24h ? `${d.priceChange24h} over 24h` : null,
        d.marketCap ? `market cap ${d.marketCap}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return {
        text: `${line}.${d.contractAddress ? `\n\nContract: ${d.contractAddress}` : ""}`,
        tool: "all_token_details",
        args: { token, blockchain: chain },
        data: res?.data,
      };
    }
    return {
      text,
      tool: "all_token_details",
      args: { token, blockchain: chain },
      data: res?.data,
    };
  }

  // 6. Swaps and transfers move funds, so route to the screen that shows the payload
  //    and the wallet prompt rather than firing one off from a chat message.
  if (/\bswap\b|\btrade\b|\bexchange\b|\bsend\b|\btransfer\b/.test(q)) {
    return {
      text:
        "Swaps and transfers build a real transaction, so they live on the " +
        "Swap & send screen where you can review the payload and the fees before " +
        "your wallet signs it. Open it from the More tab.",
      tool: "route_to_trade",
      args: {},
    };
  }

  // 7. A balance-style question with no address to work from.
  if (/balance|portfolio|holdings|how much/.test(q)) {
    return {
      text:
        "I need a wallet address for that. Paste one into your question, or connect " +
        "your wallet and ask about “my” balance.",
      tool: "needs_address",
      args: {},
    };
  }

  return null;
}

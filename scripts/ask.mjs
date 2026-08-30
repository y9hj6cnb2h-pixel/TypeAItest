#!/usr/bin/env node
/**
 * Talk to the real TypeAI model from Node — no browser, so no CORS.
 *
 * CORS is a rule browsers enforce; nothing else does. `type-ai-sdk` is a Node SDK, so
 * running it here reaches api.typeai.live directly. This is the most honest end-to-end
 * test of prompt(): a real request, a real model, real on-chain tool execution, and
 * the real answer printed back.
 *
 *   node scripts/ask.mjs "what is the current gas fee on ethereum?"
 *   node scripts/ask.mjs --chain solana "what is the SOL balance of 9WzD...AWWM?"
 *
 * Optional env vars raise limits or unlock the paid-tier tools; none are required:
 *   ETHEREUM_RPC_URL  SOLANA_RPC_URL  DEXTOOLS_API_KEY  COVALENT_API_KEY
 *   ETHERSCAN_API_KEY ALCHEMY_API_KEY NETWORK
 */

import { TypeAiClient } from "type-ai-sdk";

const argv = process.argv.slice(2);
let chain = "ethereum";
const words = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--chain" || argv[i] === "-c") chain = argv[++i];
  else if (argv[i] === "--debug" || argv[i] === "-d") process.env.__DEBUG = "1";
  else words.push(argv[i]);
}
const message = words.join(" ").trim();

if (!message) {
  console.error(
    'Usage: node scripts/ask.mjs [--chain ethereum|solana] [--debug] "your question"',
  );
  process.exit(1);
}

const client = new TypeAiClient({
  ethereumRpcUrl: process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com",
  solanaRpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  alchemyApiKey: process.env.ALCHEMY_API_KEY || undefined,
  alchemyNetwork: process.env.NETWORK || undefined,
  dexToolsApiKey: process.env.DEXTOOLS_API_KEY || undefined,
  covalentApiKey: process.env.COVALENT_API_KEY || undefined,
  etherscanApiKey: process.env.ETHERSCAN_API_KEY || undefined,
});

// The SDK swallows internal errors and returns a generic message; its own logger is
// the only place the real cause appears.
client.setLogging(true, process.env.__DEBUG ? 3 : 0);

const started = Date.now();
console.log(`\n→ ${message}   [${chain}]\n`);

try {
  const result = await client.prompt({ message, blockchain: chain });
  const responses = Array.isArray(result) ? result : result.responses;

  for (const r of responses ?? []) {
    // Every `message` comes back JSON-stringified by the SDK's response constructor.
    let text = r?.message;
    if (typeof text === "string") {
      try {
        const parsed = JSON.parse(text);
        text = typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
      } catch {
        /* already plain */
      }
    }
    console.log(text);
    if (r?.data && process.env.__DEBUG) {
      console.log("\n--- data ---");
      console.log(JSON.stringify(r.data, null, 2).slice(0, 2000));
    }
  }

  if (!responses?.length) console.log("(the model returned no response)");

  // prompt() catches everything and returns this as a normal reply, so a failure looks
  // like an answer unless you check for it.
  const failed = (responses ?? []).some((r) =>
    String(r?.message ?? "").includes("An error occurred while processing your request"),
  );
  if (failed) {
    console.error(
      "\nThat is the SDK's generic failure — the request did not succeed.\n" +
        "Re-run with --debug to see the real cause. Common ones:\n" +
        "  • 'Network Error' / ENOTFOUND — this machine cannot reach api.typeai.live\n" +
        "  • HTTP 403 from a proxy — a corporate or sandbox firewall is blocking it\n" +
        "  • HTTP 4xx/5xx from typeai.live — the API itself rejected or failed",
    );
    process.exit(2);
  }
  console.log(`\n✓ ${((Date.now() - started) / 1000).toFixed(1)}s`);
} catch (err) {
  console.error("\n✗ Request failed:", err?.message ?? err);
  console.error(
    "\nIf this says 'Network Error', this machine cannot reach api.typeai.live at " +
      "all — a firewall or proxy, not CORS. Node does not enforce CORS.",
  );
  process.exit(1);
}

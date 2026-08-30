# Onchain Copilot

An AI wallet analyst for Ethereum and Solana, built entirely on the
[TypeAI SDK](https://www.npmjs.com/package/type-ai-sdk).

Ask a question in plain English, watch the agent pick an on-chain tool and run it in
your own browser, and sign any resulting transaction with your own wallet.

**Live:** https://y9hj6cnb2h-pixel.github.io/TypeAItest/

---

## Why this app

`type-ai-sdk` isn't a chatbot wrapper — it's an agent runtime with an unusual split:

1. Your question goes to TypeAI's hosted model, which decides **which tool to call**.
2. The SDK executes that tool **locally, in your process**, against *your* RPC
   endpoints and API keys.
3. Only the tool's result goes back to be written up as prose.

Your keys and your RPC traffic never pass through TypeAI. That's the property worth
showing off, and it's invisible from the SDK's return value — so this app taps its own
outbound traffic and renders the whole loop as a live **Agent trace** beside the chat.

## What's in it

Every panel is a direct call to one of the SDK's seven methods:

| Panel | SDK call |
| --- | --- |
| **Copilot** — natural-language Q&A with a live agent trace | `prompt()` |
| **Portfolio** — every token a wallet holds, priced, with an allocation donut | `getTokenPortfolio()` |
| **Token research** — price, market cap, supply, contract | `getTokenDetails()`, `getTokenBalance()` |
| **Transactions** — decode any hash into plain English; live fee data | `getTransactionSummary()`, `getTransactionFee()` |
| **Swap & send** — build real transactions, sign them in MetaMask or Phantom | `swapTokens()`, `sendToken()` |

## Running it locally

```bash
npm install
npm run dev
```

Then open the printed URL and add your provider keys under **Settings**.

```bash
npm run build     # production build into dist/
npm run preview   # serve that build
```

Add `?debug=1` to the URL to turn on the SDK's own logger — useful because the SDK
swallows internal errors and returns generic messages.

## Configuration

There is no backend. Keys are entered in the **Settings** panel and kept in
`localStorage` in your browser, then passed straight to `TypeAiClient`. They are sent
only to the matching provider.

Because this is a static site, anyone with access to your browser profile (or any
extension running in it) can read those keys. Use free-tier, read-only keys and rotate
them when you're done.

| Setting | Needed for | Notes |
| --- | --- | --- |
| Ethereum RPC URL | all Ethereum reads | defaults to a public, rate-limited node |
| Solana RPC URL | all Solana reads | defaults to the public mainnet endpoint |
| Alchemy API key | Ethereum reads | optional alternative to the RPC URL |
| Etherscan API key | Ethereum transaction summaries | decodes contract methods |
| DEXTools API key | token research, swap tax audit | |
| Covalent API key | portfolios | must be `ckey_…` or `cqt_…` — the client validates the format locally and won't send a request otherwise |

The copilot itself needs no key: TypeAI hosts the model.

## Notes on browser support

`type-ai-sdk` ships a CommonJS Node bundle, so a little wiring is needed to run it in a
browser. Both pieces are small and live in this repo:

- `src/shims/` — inert `fs`/`os`/`path`/`crypto` modules, aliased in `vite.config.ts`.
  The SDK bundles dotenv, which touches these at import time; dotenv catches the
  failures, so "no `.env` file" is the correct outcome.
- `src/polyfill.ts` — `Buffer`, `global` and a minimal `process`, installed before any
  module that touches the SDK. It's a separate module because ES imports are hoisted.

One quirk worth knowing if you build on this SDK: its response constructor
JSON-stringifies every `message` field before returning it, so prose answers arrive
wrapped in quotes and structured answers arrive as JSON strings. `readMessage()` in
`src/lib/client.ts` decodes both.

If the copilot returns a network error, the browser is probably blocking the
cross-origin call to `api.typeai.live`. **Settings → Connectivity** lets you route just
that origin through a CORS proxy you run yourself.

## Deployment

Pushing to `claude/web3-typeai-sdk-app-x2y0yf` triggers `.github/workflows/deploy.yml`,
which typechecks, builds, and publishes `dist/` to GitHub Pages. Pages must be set to
**Build and deployment → Source → GitHub Actions** in the repository settings.

The Vite `base` is `/TypeAItest/`, matching the repository name. Change it in
`vite.config.ts` if you rename or fork the repo.

## Safety

The swap and send panels build **real mainnet transactions**. The SDK never sees a
private key — it returns an unsigned payload and your wallet does the signing — but
anything you approve is real and irreversible. Start with a tiny amount.

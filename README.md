# Sonari

**Ping any wallet. Read any chain.**

An AI onchain analyst for Ethereum and Solana, built entirely on the
[TypeAI SDK](https://www.npmjs.com/package/type-ai-sdk) — the mark is a sonar ping,
because that is what the app does: you ping an address and it reads back what is there.

Ask a question in plain English, watch the agent pick an on-chain tool and run it in
your own browser, and sign any resulting transaction with your own wallet. Built
mobile-first: a bottom tab bar, a pull-up agent trace, and no horizontal scroll at
390px.

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
| **Scan** — one tap fans out across several calls and folds them into one read on a wallet | `getTokenBalance()`, `getTransactionFee()`, `getTokenPortfolio()`, `prompt()` |
| **Ask** — natural-language Q&A with a live agent trace | `prompt()` |
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

In dev, Ask reaches the **real** hosted model through Vite's proxy (see below), so this
is the way to exercise `prompt()` end to end without deploying anything.

## Configuration

**No API keys are required.** Every panel works on free public endpoints that need no
account and send CORS headers, so the browser can call them directly:

| Gap | Keyless provider | What a key adds |
| --- | --- | --- |
| Token details (DEXTools) | DEX Screener | supply figures, swap tax audit |
| Portfolio (Covalent) | Blockscout (ETH), public RPC + DEX Screener (SOL) | richer pricing, NFTs |
| Ethereum tx summary (Etherscan) | Blockscout | nothing material |
| Ethereum / Solana reads | public RPC nodes | higher rate limits |

These live in `src/lib/keyless.ts` and return the same shapes the SDK does, so the
panels render them without knowing which provider answered. Keys are optional upgrades.

There is no backend. Any keys you do add are entered in the **Settings** panel and kept
in `localStorage` in your browser, then passed straight to `TypeAiClient`. They are sent
only to the matching provider.

Because this is a static site, anyone with access to your browser profile (or any
extension running in it) can read those keys. Use free-tier, read-only keys and rotate
them when you're done.

| Optional setting | Improves | Notes |
| --- | --- | --- |
| Ethereum RPC URL | all Ethereum reads | defaults to a public, rate-limited node |
| Solana RPC URL | all Solana reads | defaults to the public mainnet endpoint |
| Alchemy API key | Ethereum reads | optional alternative to the RPC URL |
| Etherscan API key | Ethereum transaction summaries | decodes contract methods |
| DEXTools API key | token research, swap tax audit | |
| Covalent API key | portfolios | must be `ckey_…` or `cqt_…` — the client validates the format locally and won't send a request otherwise |

The copilot needs no key either: TypeAI hosts the model.

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

### Talking to the real TypeAI model

CORS is a rule *browsers* enforce. Two ways to reach the hosted model for real, both
free and needing no account:

**1. `npm run dev`** — Vite proxies `/typeai` to `https://api.typeai.live` server-side
(`vite.config.ts`). The browser makes a same-origin request, so CORS never applies and
Ask talks to the real model with no proxy to deploy. This is on by default in dev.

**2. `node scripts/ask.mjs`** — Node enforces no CORS at all, so the SDK reaches the
API directly. The purest end-to-end test of `prompt()`:

```bash
node scripts/ask.mjs "what is the current gas fee on ethereum?"
node scripts/ask.mjs --chain solana --debug "SOL balance of 9WzD...AWWM?"
```

`--debug` turns on the SDK's logger, which is the only place the real cause of a
failure appears.

> **A trap worth knowing.** The SDK hardcodes a second endpoint for development:
> `NODE_ENV === "development" ? "http://localhost:8080/api/sdk" : "https://api.typeai.live/api/sdk"`.
> Vite sets `NODE_ENV=development`, so in dev the SDK silently posts to a local backend
> nobody is running. `src/lib/netlog.ts` treats both origins as TypeAI and routes them
> through the proxy, which is what makes `npm run dev` work against the real API.

### The `api.typeai.live` CORS wall (deployed site)

The hosted model endpoint does not send an `Access-Control-Allow-Origin` header, so a
browser refuses to hand its response to the page and the SDK reports a bare
`Network Error`. This affects `prompt()` — and therefore **Ask** and the Scan verdict —
from any web origin. Everything else in the app talks to your own RPC and provider
endpoints, which do send CORS headers, so those panels work regardless.

A browser reports a blocked cross-origin response and an unreachable host identically.
To tell them apart, open <https://api.typeai.live> in a tab: if anything loads, the host
is up and it is CORS.

**The deployed app tries to get through on its own.** `src/lib/reach.ts` attempts the
direct call, then walks a list of public relays until one answers, and remembers the
winner so later questions go straight through it. The answer is labelled with the relay
that carried it. This is safe to do automatically because the call carries nothing
secret — the SDK posts `{message, blockchain, previousMessages}` with no Authorization
or API-key header; provider keys and RPC traffic are never relayed. Relays are
third-party servers that rate-limit and disappear, so the Cloudflare Worker below is
still the sturdier answer.

**And if every route fails, the app still works.** The hosted model only picks the tool and
phrases the reply; the SDK's tools already return readable prose of their own
("The current gas price is 12 gwei…"). So when the model is unreachable, Ask routes the
question in the browser (`src/lib/localAgent.ts`) and answers from the SDK's own output,
and Scan composes its read from the same numbers. Both label themselves *offline
routing* / *offline read*, so the source is never ambiguous. What a proxy buys you is
the model's judgement and free-form phrasing — not the on-chain data.

If you do want that, a proxy sits outside the browser where same-origin rules don't apply.
This repo ships one: [`proxy/cloudflare-worker.js`](proxy/cloudflare-worker.js) — a
single file you deploy free on Cloudflare Workers in about two minutes. It forwards
**only** to `api.typeai.live`, so it can't be abused as an open relay. Paste the worker
URL into **Settings → Connectivity** and the app rewrites just that one origin; your RPC
and key-bearing requests keep going direct.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which typechecks, builds,
and publishes `dist/` to GitHub Pages.

**One-time setup.** Before the first deploy can succeed, enable Pages on the
repository: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
The workflow cannot do this for itself — creating a Pages site requires
`administration:write`, which a workflow's `GITHUB_TOKEN` cannot be granted, so
`actions/configure-pages` fails with *"Resource not accessible by integration"* until
the setting exists. After that one click, every push to `main` deploys automatically;
you can also re-run the workflow by hand from the Actions tab (`workflow_dispatch`).

The Vite `base` is `/TypeAItest/`, matching the repository name. Change it in
`vite.config.ts` if you rename or fork the repo.

## Safety

The swap and send panels build **real mainnet transactions**. The SDK never sees a
private key — it returns an unsigned payload and your wallet does the signing — but
anything you approve is real and irreversible. Start with a tiny amount.

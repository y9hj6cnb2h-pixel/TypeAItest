import { useEffect, useRef, useState } from "react";
import type { ITypeAiClientMessage, IResponseConstructorOutput } from "type-ai-sdk";
import { getClient, describeError, readMessage } from "../lib/client";
import { answerLocally } from "../lib/localAgent";
import type { Settings } from "../lib/config";
import { shortAddress, type Chain, type WalletState } from "../lib/wallet";
import {
  diagnoseAgentFailure,
  resetDiagnosis,
  SDK_GENERIC_FAILURE,
} from "../lib/netlog";
import AgentTrace from "./AgentTrace";
import SignPanel, { extractTx } from "./SignPanel";
import { PoweredBy } from "./Brand";
import { ErrorBox, IconBolt, IconSend, Spinner } from "./ui";

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  chain: Chain;
  data?: unknown;
  /** Answered by the offline router because the hosted model was unreachable. */
  local?: boolean;
};

type Suggestion = { label: string; query: string };

const SUGGESTIONS: Record<Chain, Suggestion[]> = {
  ethereum: [
    {
      label: "What's gas costing right now?",
      query: "What is the current gas fee on Ethereum?",
    },
    {
      label: "Tell me everything about USDC",
      query: "Tell me everything about the USDC token",
    },
    {
      label: "How much ETH does vitalik.eth hold?",
      query:
        "What is the ETH balance of the wallet 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045?",
    },
    {
      label: "Explain this transaction to me",
      query:
        "Explain what happened in transaction 0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060",
    },
  ],
  solana: [
    {
      label: "Check a wallet's SOL balance",
      query:
        "What is the SOL balance of 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM?",
    },
    { label: "Look up the JUP token", query: "Give me the token details for JUP" },
    {
      label: "What do Solana fees look like?",
      query: "What is the current transaction fee on Solana?",
    },
    {
      label: "Swap 0.1 SOL into USDC",
      query: "I want to swap 0.1 SOL for USDC — what would that cost me?",
    },
  ],
};

const NEEDS_ADDRESS = /\bmy\b|\bmine\b|\bi own\b|\bi hold\b/i;
const HAS_ADDRESS = /0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}/;

export default function Copilot({
  settings,
  wallet,
  chain,
  onChainChange,
}: {
  settings: Settings;
  wallet: WalletState | null;
  chain: Chain;
  onChainChange: (c: Chain) => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [history, setHistory] = useState<ITypeAiClientMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traceKey, setTraceKey] = useState(0);
  const [traceOpen, setTraceOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  async function ask(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;

    // If the user says "my balance" while a wallet is connected, tell the agent which
    // address they mean — it has no other way to know.
    const augmented =
      wallet && NEEDS_ADDRESS.test(text) && !HAS_ADDRESS.test(text)
        ? `${text} (my wallet address is ${wallet.address})`
        : text;

    setInput("");
    setError(null);
    setTraceKey((k) => k + 1);
    resetDiagnosis();
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "user", text, chain },
    ]);
    setBusy(true);

    try {
      const client = getClient(settings);
      const result = await client.prompt({
        message: augmented,
        blockchain: chain as never,
        previousMessages: history.slice(-6),
      });

      const responses: IResponseConstructorOutput[] = Array.isArray(result)
        ? result
        : result.responses;

      if (!Array.isArray(result)) {
        setHistory(result.messageHistory as ITypeAiClientMessage[]);
      } else {
        setHistory((h) => [
          ...h,
          { role: "user", content: augmented },
          ...responses.map((r) => ({
            role: "assistant" as const,
            content: readMessage(r.message).text,
          })),
        ]);
      }

      if (!responses?.length) {
        setError("The agent returned no response. Try rephrasing the question.");
      }

      // prompt() catches everything internally and returns this as a normal reply
      // rather than throwing, so recognise it and surface the real cause.
      const swallowed = (responses ?? []).some((r) =>
        readMessage(r.message).text.includes(SDK_GENERIC_FAILURE),
      );
      if (swallowed) {
        // The failing request's outcome can land a tick after prompt() rejects, so
        // yield once before reading it — otherwise we diagnose from a half-filled tap.
        await new Promise((r) => setTimeout(r, 60));
        const reason = diagnoseAgentFailure();

        // The hosted model is only the router. Its tools still work, so route the
        // question here and answer from the SDK's own output rather than giving up.
        try {
          const local = await answerLocally(client, augmented, chain, wallet?.address);
          if (local) {
            setMessages((m) => [
              ...m,
              {
                id: crypto.randomUUID(),
                role: "assistant" as const,
                text: local.text,
                chain,
                data: local.data,
                local: true,
              },
            ]);
            setHistory((h) => [
              ...h,
              { role: "user", content: augmented },
              { role: "assistant", content: local.text },
            ]);
            setBusy(false);
            return;
          }
        } catch (fallbackErr) {
          setError(`${reason} Offline fallback also failed: ${describeError(fallbackErr)}`);
          setBusy(false);
          return;
        }

        setError(
          `${reason} I also tried answering it here without the hosted model, but ` +
            `couldn't tell which on-chain tool you wanted. Try naming one directly — ` +
            `gas fees, a token's price, a wallet balance, or a transaction hash.`,
        );
        setBusy(false);
        return;
      }

      setMessages((m) => [
        ...m,
        ...(responses ?? []).map((r) => ({
          id: crypto.randomUUID(),
          role: "assistant" as const,
          text: readMessage(r.message).text,
          chain,
          data: r.data,
        })),
      ]);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void ask(input);
    }
  };

  return (
    <div className="copilot">
      <div className="chat-col">
        <div className="chat-scroll" ref={scrollRef}>
          <div className="chat-inner">
            {messages.length === 0 && (
              <Intro chain={chain} onPick={(s) => void ask(s)} />
            )}

            {messages.map((m) => (
              <Message key={m.id} msg={m} />
            ))}

            {busy && (
              <div className="msg bot">
                <div className="msg-avatar">AI</div>
                <div className="msg-body">
                  <div className="msg-who">Copilot</div>
                  <div className="typing" aria-label="Thinking">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
            )}

            {error && <ErrorBox>{error}</ErrorBox>}
          </div>
        </div>

        <div className="composer">
          <div className="composer-inner">
            <div className="composer-box">
              <textarea
                ref={taRef}
                rows={1}
                value={input}
                placeholder={`Ask anything about ${chain}…`}
                onChange={(e) => {
                  setInput(e.target.value);
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                }}
                onKeyDown={onKeyDown}
                disabled={busy}
              />
              <button
                className="btn primary"
                onClick={() => void ask(input)}
                disabled={busy || !input.trim()}
                aria-label="Send"
              >
                {busy ? <Spinner /> : <IconSend />}
              </button>
            </div>
            <div className="composer-meta">
              <div className="seg" role="group" aria-label="Blockchain">
                <button
                  type="button"
                  aria-pressed={chain === "ethereum"}
                  onClick={() => onChainChange("ethereum")}
                >
                  Ethereum
                </button>
                <button
                  type="button"
                  aria-pressed={chain === "solana"}
                  onClick={() => onChainChange("solana")}
                >
                  Solana
                </button>
              </div>
              {wallet ? (
                <span className="composer-hint">
                  Wallet context: <code>{shortAddress(wallet.address, 6)}</code>
                </span>
              ) : (
                <span className="composer-hint">
                  Connect a wallet to ask about “my” balances.
                </span>
              )}
              <span className="spacer" />
              <button
                className="trace-toggle btn sm ghost"
                onClick={() => setTraceOpen(true)}
              >
                <IconBolt /> Agent trace
              </button>
              <span className="composer-hint">
                Enter to send · Shift+Enter for a new line
              </span>
            </div>
          </div>
        </div>
      </div>

      {traceOpen && (
        <div className="trace-backdrop" onClick={() => setTraceOpen(false)} />
      )}
      <AgentTrace
        resetKey={traceKey}
        open={traceOpen}
        onClose={() => setTraceOpen(false)}
      />
    </div>
  );
}

function Intro({
  chain,
  onPick,
}: {
  chain: Chain;
  onPick: (s: string) => void;
}) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <PoweredBy />
      </div>
      <h2 style={{ fontSize: 21, margin: "6px 0 6px", letterSpacing: "-0.02em" }}>
        Ask the chain anything.
      </h2>
      <p className="dim" style={{ margin: "0 0 4px", maxWidth: 620 }}>
        Sonari runs on the TypeAI SDK. A hosted model reads your question and picks
        an on-chain tool; the SDK then executes that tool right here in your browser
        and writes the answer back in plain English. Open the{" "}
        <strong>Agent trace</strong> to watch every step as it happens. If the hosted
        model can't be reached, Sonari routes the question itself and answers from the
        SDK's own output — marked <em>offline routing</em> so you always know which
        answered.
      </p>
      <div className="suggestions">
        {SUGGESTIONS[chain].map((s) => (
          <button
            key={s.label}
            className="suggestion"
            onClick={() => onPick(s.query)}
            title={s.query}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Message({ msg }: { msg: ChatMsg }) {
  const tx = msg.role === "assistant" ? extractTx(msg.data, msg.chain) : null;
  return (
    <div className={`msg ${msg.role === "user" ? "user" : "bot"}`}>
      <div className="msg-avatar">{msg.role === "user" ? "You" : "AI"}</div>
      <div className="msg-body">
        <div className="msg-who">
          {msg.role === "user" ? "You" : "Copilot"}
          {msg.local && (
            <span className="chip warn local-chip" title="The hosted TypeAI model was unreachable, so the question was routed in your browser and answered with the SDK tool's own output.">
              offline routing
            </span>
          )}
        </div>
        <div className="msg-text">{msg.text}</div>
        {tx ? <SignPanel tx={tx} chain={msg.chain} compact /> : null}
      </div>
    </div>
  );
}

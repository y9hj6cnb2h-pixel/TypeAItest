import { useEffect, useRef, useState } from "react";
import {
  onAgentStep,
  onNetEvent,
  type AgentStep,
  type NetEvent,
} from "../lib/netlog";
import { humanizeTool, timeOf } from "../lib/format";
import { IconBolt } from "./ui";

type Row =
  | { kind: "step"; at: number; step: AgentStep }
  | { kind: "net"; at: number; net: NetEvent };

/**
 * A live view of what the SDK is doing: which tool the hosted model chose, and every
 * outbound call the SDK made to execute it. Rendered from the network tap, since the
 * SDK's return value alone doesn't expose the agent loop.
 */
export default function AgentTrace({
  resetKey,
  open = false,
  onClose,
}: {
  resetKey: number;
  open?: boolean;
  onClose?: () => void;
}) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [nets, setNets] = useState<NetEvent[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const offStep = onAgentStep((s) => setSteps((prev) => [...prev, s]));
    const offNet = onNetEvent((e) =>
      setNets((prev) => {
        const i = prev.findIndex((p) => p.id === e.id);
        if (i === -1) return [...prev, e];
        const next = [...prev];
        next[i] = e;
        return next;
      }),
    );
    return () => {
      offStep();
      offNet();
    };
  }, []);

  useEffect(() => {
    setSteps([]);
    setNets([]);
  }, [resetKey]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [steps, nets]);

  const rows: Row[] = [
    ...steps.map((step) => ({ kind: "step" as const, at: step.ts, step })),
    ...nets.map((net) => ({ kind: "net" as const, at: net.ts, net })),
  ].sort((a, b) => a.at - b.at);

  return (
    <aside className={`trace${open ? " open" : ""}`}>
      <div className="trace-head">
        <span style={{ color: "var(--mint)", display: "grid" }}>
          <IconBolt />
        </span>
        <h2>Agent trace</h2>
        <span className="spacer" />
        <span className="chip">
          {steps.length} tool call{steps.length === 1 ? "" : "s"}
        </span>
        <button className="trace-close btn sm ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="trace-body" ref={bodyRef}>
        <p className="trace-note">
          TypeAI's hosted model picks a tool; the SDK then runs it{" "}
          <strong>in this browser</strong> against your own RPC endpoints, and sends
          only the result back to be written up. Your keys never leave the page.
        </p>

        {rows.length === 0 && (
          <p className="faint" style={{ fontSize: 12, padding: "8px 2px" }}>
            Ask something in the copilot and the agent's steps will appear here.
          </p>
        )}

        {rows.map((row, i) =>
          row.kind === "step" ? (
            <StepCard key={`s-${row.step.id}-${i}`} step={row.step} />
          ) : (
            <NetRow key={`n-${row.net.id}-${row.net.ms ?? "p"}`} net={row.net} />
          ),
        )}
      </div>
    </aside>
  );
}

function StepCard({ step }: { step: AgentStep }) {
  return (
    <div className="step">
      <div className="step-head">
        {step.kind === "tool" ? (
          <>
            <span className="chip ok" style={{ padding: "1px 7px" }}>
              tool
            </span>
            <span className="tool-name">{step.name}</span>
          </>
        ) : (
          <>
            <span className="chip violet" style={{ padding: "1px 7px" }}>
              model
            </span>
            <span>Direct answer</span>
          </>
        )}
        <span className="step-time">{timeOf(step.ts)}</span>
      </div>
      {step.kind === "tool" && (
        <>
          <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>
            {humanizeTool(step.name ?? "")} — executed locally by the SDK
          </div>
          {step.args != null && (
            <pre>{JSON.stringify(step.args, null, 2)}</pre>
          )}
        </>
      )}
      {step.kind === "plan" && step.text && (
        <div className="faint" style={{ fontSize: 11.5, marginTop: 5 }}>
          Answered without touching the chain.
        </div>
      )}
    </div>
  );
}

function NetRow({ net }: { net: NetEvent }) {
  const state =
    net.ms === undefined ? "pending" : net.ok ? "ok" : "bad";
  return (
    <div className={`netrow ${state}`} title={net.url}>
      <span className="dot" />
      <span className="label">{net.label}</span>
      <span className="detail">{net.detail ?? net.method}</span>
      <span className="ms">
        {net.ms === undefined
          ? "…"
          : net.error
            ? "failed"
            : `${net.status ?? ""} · ${net.ms}ms`}
      </span>
    </div>
  );
}

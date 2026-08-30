export function usd(n: number | string | undefined | null): string {
  const v = typeof n === "string" ? Number(n.replace(/[$,]/g, "")) : n;
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 8;
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function compact(n: number | string | undefined | null): string {
  const v = typeof n === "string" ? Number(n.replace(/[$,]/g, "")) : n;
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(v);
}

export function amount(n: number | string | undefined | null): string {
  const v = typeof n === "string" ? Number(n) : n;
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  if (Math.abs(v) < 0.0001) return v.toExponential(2);
  return v.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function percent(v: number | string | undefined | null): string {
  const n = typeof v === "string" ? Number(v.replace("%", "")) : v;
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export const timeOf = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-US", { hour12: false });

/** Turn a snake_case SDK tool name into something a human reads. */
export const humanizeTool = (name: string) =>
  name
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

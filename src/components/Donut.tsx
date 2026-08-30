export const SLICE_COLORS = [
  "#5eead4",
  "#818cf8",
  "#fbbf24",
  "#fb7185",
  "#34d399",
  "#60a5fa",
  "#f472b6",
  "#a78bfa",
  "#facc15",
  "#2dd4bf",
];

export type Slice = { label: string; value: number };

export default function Donut({
  slices,
  size = 168,
  thickness = 22,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;

  if (total <= 0) {
    return (
      <svg width={size} height={size} role="img" aria-label="No allocation data">
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={thickness}
        />
      </svg>
    );
  }

  let offset = 0;
  return (
    <svg
      width={size}
      height={size}
      role="img"
      aria-label={`Allocation across ${slices.length} holdings`}
    >
      <g transform={`rotate(-90 ${c} ${c})`}>
        {slices.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * circumference;
          const el = (
            <circle
              key={s.label + i}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={SLICE_COLORS[i % SLICE_COLORS.length]}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            >
              <title>{`${s.label} — ${(frac * 100).toFixed(1)}%`}</title>
            </circle>
          );
          offset += dash;
          return el;
        })}
      </g>
    </svg>
  );
}

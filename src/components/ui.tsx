import type { ReactNode } from "react";

type IconProps = { size?: number };
const svg = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const IconSpark = ({ size = 17 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5l2.6-1.5M17.2 9l2.6-1.5" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
);

export const IconPie = ({ size = 17 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M21 15.5A9 9 0 1 1 8.5 3" />
    <path d="M12 3a9 9 0 0 1 9 9h-9V3Z" />
  </svg>
);

export const IconSearch = ({ size = 17 }: IconProps) => (
  <svg {...svg(size)}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m20 20-4.5-4.5" />
  </svg>
);

export const IconReceipt = ({ size = 17 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M5 3.5v17l2.2-1.4 2.2 1.4 2.3-1.4 2.3 1.4 2.2-1.4 2.2 1.4v-17l-2.2 1.4-2.2-1.4-2.3 1.4-2.3-1.4-2.2 1.4L5 3.5Z" />
    <path d="M9 9.5h6M9 13.5h4" />
  </svg>
);

export const IconSwap = ({ size = 17 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M4 8h13l-3.2-3.2M20 16H7l3.2 3.2" />
  </svg>
);

export const IconGear = ({ size = 17 }: IconProps) => (
  <svg {...svg(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </svg>
);

export const IconWarn = ({ size = 16 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

export const IconInfo = ({ size = 16 }: IconProps) => (
  <svg {...svg(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

export const IconSend = ({ size = 16 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8 21 3Z" />
  </svg>
);

export const IconExternal = ({ size = 13 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M14 4h6v6M20 4l-9 9M18 13.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7.5A1.5 1.5 0 0 1 5 6h5.5" />
  </svg>
);

export const IconBolt = ({ size = 15 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M13 2 4.5 13.5H11l-.5 8.5L19 10.5h-6.5L13 2Z" />
  </svg>
);

export const IconWallet = ({ size = 15 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M20 8.5V7a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a1 1 0 0 1 1 1v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7" />
    <path d="M16.5 13.5h.01" />
  </svg>
);

export const IconMore = ({ size = 17 }: IconProps) => (
  <svg {...svg(size)}>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export function Spinner() {
  return <span className="spin" aria-hidden />;
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="error-box" role="alert">
      {children}
    </div>
  );
}

export function Banner({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn";
  children: ReactNode;
}) {
  return (
    <div className={`banner ${tone}`}>
      {tone === "warn" ? <IconWarn /> : <IconInfo />}
      <div>{children}</div>
    </div>
  );
}

export function Empty({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div style={{ color: "var(--text-faint)" }}>{icon}</div>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}

export function ChainToggle({
  value,
  onChange,
}: {
  value: "ethereum" | "solana";
  onChange: (v: "ethereum" | "solana") => void;
}) {
  return (
    <div className="seg" role="group" aria-label="Blockchain">
      <button
        type="button"
        aria-pressed={value === "ethereum"}
        onClick={() => onChange("ethereum")}
      >
        Ethereum
      </button>
      <button
        type="button"
        aria-pressed={value === "solana"}
        onClick={() => onChange("solana")}
      >
        Solana
      </button>
    </div>
  );
}

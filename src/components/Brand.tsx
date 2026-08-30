/**
 * Sonari's mark: a sonar ping — a source dot with two arcs sweeping out from it.
 * The app pings a wallet and reads back what's there, so the metaphor is the product.
 */
export function Logo({ size = 32 }: { size?: number }) {
  const id = `sonari-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Sonari"
      fill="none"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="#0a0d13" />
      <circle cx="10" cy="16" r="2.7" fill={`url(#${id})`} />
      <path
        d="M15.5 10.6a7.6 7.6 0 0 1 0 10.8"
        stroke={`url(#${id})`}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M20.4 6.6a14 14 0 0 1 0 18.8"
        stroke={`url(#${id})`}
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}

/** The one line that has to be unmissable: this runs on the TypeAI SDK. */
export function PoweredBy({ compact = false }: { compact?: boolean }) {
  return (
    <a
      className={`powered${compact ? " compact" : ""}`}
      href="https://www.npmjs.com/package/type-ai-sdk"
      target="_blank"
      rel="noreferrer"
    >
      <span className="powered-spark" aria-hidden>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 2 4.5 13.5H11l-.5 8.5L19 10.5h-6.5L13 2Z" />
        </svg>
      </span>
      Powered by <strong>TypeAI</strong>
      {!compact && <span className="powered-sdk">SDK</span>}
    </a>
  );
}

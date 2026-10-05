/**
 * The mark: a heavy M cut by a thin horizontal gap, the weekend gap Morrow protects against. The two feet below the gap
 * step sideways and land in the accent colour: the loan caught on the other side. Same geometry as the favicons and exports
 * (tools/make-brand.mjs).
 */
const TOP = "M6 5 H13.5 L24 21 L34.5 5 H42 V33.6 H35 V16.5 L24 32.5 L13 16.5 V33.6 H6 Z";

export function LogoMark({ size = 28, title, feet = "var(--accent)" }: { size?: number; title?: string; feet?: string }) {
  return (
    <svg width={size} height={size} viewBox="1.3 0 48 48" fill="none" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d={TOP} fill="currentColor" />
      <rect x="8.6" y="37" width="7" height="6" fill={feet} />
      <rect x="37.6" y="37" width="7" height="6" fill={feet} />
    </svg>
  );
}

export function Logo({ size = 28, feet, className = "text-ink" }: { size?: number; feet?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} feet={feet} />
      <span className="text-[1.15rem] font-semibold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
        morrow
      </span>
    </span>
  );
}

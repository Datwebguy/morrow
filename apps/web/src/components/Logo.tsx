/**
 * The mark: an M drawn from four strokes. A tiny "c" curl hooks onto the top-left of the left stem, and the last stroke on the
 * right rises well above the rest. The same geometry is used for the favicons and exports (tools/make-brand.mjs).
 */
export function LogoMark({ size = 28, title, strokeWidth = 3.4 }: { size?: number; title?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <g stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M 8.6 13 A 3.7 3.7 0 1 1 12 9.7 V 42" />
        <path d="M 12 9.7 L 25.5 29.5 L 39 11" />
        <path d="M 39 3.5 V 42" />
      </g>
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <LogoMark size={size} />
      <span className="text-[1.15rem] font-semibold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
        morrow
      </span>
    </span>
  );
}

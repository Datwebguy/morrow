/** The mark: a rounded shield drawn as one continuous line that also reads as a steady horizon. */
export function LogoMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path
        d="M2 26 H8 V10 C11 9 17 9 24 5 C31 9 37 9 40 10 V26 C40 35 33 41 24 45 C15 41 8 35 8 26 H46"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

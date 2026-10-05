export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden />;
}

/** Skeleton in the shape of a loan card, so nothing jumps when the data arrives. */
export function LoanCardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6" role="status" aria-label="Loading your loans">
      <Skeleton className="h-4 w-32" />
      <div className="mt-6 flex justify-center">
        <Skeleton className="h-28 w-56 rounded-t-full" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
      <Skeleton className="mt-4 h-5 w-3/4" />
      <Skeleton className="mt-3 h-10 w-full" />
    </div>
  );
}

export function RowSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

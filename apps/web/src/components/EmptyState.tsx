import Link from "next/link";
import type { ReactNode } from "react";

/** Every list has an honest empty state with a next action. */
export function EmptyState({ title, line, action }: { title: string; line?: string; action?: { label: string; href: string } | ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-muted/40 bg-surface px-6 py-10 text-center">
      <h2 className="text-lg">{title}</h2>
      {line ? <p className="mx-auto mt-2 max-w-md text-sm text-muted">{line}</p> : null}
      {action ? (
        <div className="mt-5">
          {typeof action === "object" && action !== null && "href" in (action as object) ? (
            <Link
              href={(action as { href: string }).href}
              className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-on-accent"
            >
              {(action as { label: string }).label}
            </Link>
          ) : (
            (action as ReactNode)
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-danger/50 bg-surface px-5 py-4 text-sm">
      <p className="text-danger">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-2 text-sm font-medium text-accent underline underline-offset-2">
          Try again
        </button>
      ) : null}
    </div>
  );
}

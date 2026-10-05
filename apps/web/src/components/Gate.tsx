"use client";

import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";
import { WORKER_URL } from "@/lib/api";
import { useKey } from "@/lib/useKey";

/** Shows the Connect prompt until the browser has an access key. Children only render when there is one. */
export function Gate({ children }: { children: ReactNode }) {
  const key = useKey();
  if (key === undefined) return <Skeleton className="h-40 w-full" />;
  if (!WORKER_URL) {
    return <EmptyState title="Not linked to a server yet" line="This site has no Morrow server to talk to. Once one is set up, Connect Bitget will appear here." />;
  }
  if (!key) return <EmptyState title="No loans yet" line="Connect Bitget to start." action={{ label: "Connect Bitget", href: "/app/connect" }} />;
  return <>{children}</>;
}

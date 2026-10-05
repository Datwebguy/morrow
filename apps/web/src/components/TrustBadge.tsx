import { CheckCircle2, AlertTriangle } from "lucide-react";
import { trustReason } from "@/lib/words";

export function TrustBadge({ trust }: { trust: { trusted: boolean; failures: string[] } | null }) {
  if (!trust) return <span className="text-sm text-muted">Price not checked yet</span>;
  return trust.trusted ? (
    <span className="inline-flex items-center gap-1.5 text-sm text-safe">
      <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden /> Price trusted
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-sm text-watch">
      <AlertTriangle size={16} strokeWidth={1.75} aria-hidden /> Price not trusted: {trustReason(trust.failures)}
    </span>
  );
}

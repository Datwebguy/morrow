import { ForbiddenRequestError, type WriteResult } from "@morrow/bitget";
import type { Assessment } from "./assess";
import type { Decision } from "./decide";
import type { Store } from "./db";
import type { Ports } from "./ports";

export interface ActDeps {
  store: Store;
  ports: Ports;
  /** Real writes only when the owner has said "go live". Otherwise every write is a dry run. */
  liveActions: boolean;
}

function amountString(n: number, decimals: number): string {
  const f = 10 ** decimals;
  // Round up so the plan still reaches its target after rounding.
  return (Math.ceil(n * f - 1e-9) / f).toFixed(decimals).replace(/\.?0+$/, "");
}

export interface ExecResult {
  sent: boolean;
  dryRun: boolean;
  refused: boolean;
  line: string;
}

/** Sends one checked proposal (or previews it) and writes it to the paper log in the required format. */
export async function execute(d: ActDeps, a: Assessment, decision: Decision, promiseId: string | null): Promise<ExecResult> {
  const p = decision.proposal;
  if (!p) throw new Error("execute needs a proposal");
  const dryRun = !d.liveActions;
  const decimals = p.kind === "pay_down" ? 6 : 8;
  const amount = amountString(p.amount, decimals);
  let result: WriteResult;
  try {
    result =
      p.kind === "pay_down"
        ? await d.ports.exec.payDown({ orderId: a.loan.orderId, amount }, { dryRun })
        : await d.ports.exec.addBacking({ orderId: a.loan.orderId, amount, pledgeCoin: a.loan.backingCoin }, { dryRun });
  } catch (e) {
    const why = e instanceof ForbiddenRequestError ? e.message : `Bitget did not accept it (${e instanceof Error ? e.message : "unknown reason"}).`;
    d.store.addLog({
      ts: a.nowMs, kind: "refused", loanId: a.loan.orderId, instrument: a.instrument, direction: p.kind === "pay_down" ? "pay down" : "add backing",
      price: a.price, quantity: Number(amount), balanceChange: "none", simulated: d.ports.simulated || dryRun, reason: `No action: ${why}`,
      detail: { decision, error: String(e) },
    });
    return { sent: false, dryRun, refused: true, line: `No action: ${why}` };
  }
  const label = d.ports.simulated || dryRun ? "simulated" : "sent";
  const change = p.kind === "pay_down" ? `-${amount} ${a.loan.loanCoin}` : `-${amount} ${a.loan.backingCoin} (moved into backing)`;
  d.store.addLog({
    ts: a.nowMs, kind: "action", loanId: a.loan.orderId, instrument: a.instrument, direction: p.kind === "pay_down" ? "pay down" : "add backing",
    price: a.price, quantity: Number(amount), balanceChange: change, simulated: d.ports.simulated || dryRun,
    reason: decision.reason, detail: { label, decision, request: result },
  });
  d.store.addSpend(a.nowMs, a.loan.orderId, p.kind === "pay_down" ? Number(amount) : Number(amount) * p.price, a.closure?.closeTs ?? 0);
  if (promiseId) d.store.appendPromiseAction(promiseId, { ts: a.nowMs, kind: p.kind, amount: Number(amount), valueInBorrowed: p.kind === "pay_down" ? Number(amount) : Number(amount) * p.price, label });
  return { sent: !dryRun, dryRun, refused: false, line: `${p.kind === "pay_down" ? "Pay down" : "Add backing"} ${amount} (${label}).` };
}

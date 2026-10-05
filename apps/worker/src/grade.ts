import { GRADE_DELAY_MINUTES, MS_PER_HOUR } from "@morrow/config";
import { records } from "./loans";
import type { PromiseBody } from "./promise";
import type { PromiseRow, Store } from "./db";
import type { Ports } from "./ports";

export interface Grade {
  /** True when the loan stayed below the margin-call level at the grade time and was not liquidated. Null when the loan is gone and not liquidated. */
  kept: boolean | null;
  status: "graded" | "loan_closed";
  gradedAt: number;
  priceUsed: number | null;
  healthAtGrade: number | null;
  /** Loan health at the grade price if Morrow had done nothing. */
  healthWithNoAction: number | null;
  wouldHaveHadMarginCall: boolean | null;
  wouldHaveBeenLiquidated: boolean | null;
  marginCallAvoided: boolean;
  liquidationAvoided: boolean;
  liquidated: boolean;
  actions: unknown[];
  paidDown: number;
  addedBackingValue: number;
}

/** Price 30 minutes after the open: the open of the hourly candle that starts at or after reopen + 30 minutes. */
async function priceAtGrade(ports: Ports, symbol: string, reopenTs: number): Promise<number | null> {
  const target = reopenTs + GRADE_DELAY_MINUTES * 60_000;
  const candleStart = Math.ceil(target / MS_PER_HOUR) * MS_PER_HOUR;
  const candles = await ports.market.history(symbol, candleStart, candleStart + MS_PER_HOUR);
  const c = candles.find((x) => x.t === candleStart);
  if (c) return c.open;
  if (Math.abs(ports.nowMs() - target) <= MS_PER_HOUR) {
    const q = await ports.market.quote(symbol);
    return (q.bid + q.ask) / 2;
  }
  return null;
}

async function wasLiquidated(ports: Ports, orderId: string, closeTs: number): Promise<boolean | null> {
  try {
    const raw = await ports.exec.read("getLoanReduces", { startTime: String(closeTs), endTime: String(ports.nowMs()) });
    const rows = records(raw);
    if (rows === null) return JSON.stringify(raw ?? "").includes(orderId);
    return rows.some((r) => JSON.stringify(r).includes(orderId));
  } catch {
    return null;
  }
}

export async function gradeDue(store: Store, ports: Ports): Promise<Array<{ row: PromiseRow; grade: Grade }>> {
  const due = store.ungradedPromisesDue(ports.nowMs(), GRADE_DELAY_MINUTES * 60_000);
  if (due.length === 0) return [];
  const read = await ports.loans();
  const out: Array<{ row: PromiseRow; grade: Grade }> = [];
  for (const row of due) {
    const body = JSON.parse(row.body) as PromiseBody;
    const actions = JSON.parse(row.actions) as Array<{ kind: string; amount: number; valueInBorrowed: number }>;
    const paidDown = actions.filter((x) => x.kind === "pay_down").reduce((s, x) => s + x.amount, 0);
    const addedValue = actions.filter((x) => x.kind === "add_backing").reduce((s, x) => s + x.valueInBorrowed, 0);
    const liquidated = await wasLiquidated(ports, body.loanId, body.closeTs);
    if (liquidated === null) continue; // could not read the liquidation records: try again next cycle
    const loan = read.loans.find((l) => l.orderId === body.loanId);
    const limits = await ports.limits(body.backingCoin);
    const symbol = await ports.market.symbolFor(body.backingCoin);
    if (!limits || !symbol) continue;
    const price = await priceAtGrade(ports, symbol, body.reopenTs);
    if (price === null) continue;

    const base = { gradedAt: ports.nowMs(), priceUsed: price, actions, paidDown, addedBackingValue: addedValue, liquidated };
    let grade: Grade;
    if (!loan && !liquidated) {
      grade = { ...base, kept: null, status: "loan_closed", healthAtGrade: null, healthWithNoAction: null, wouldHaveHadMarginCall: null, wouldHaveBeenLiquidated: null, marginCallAvoided: false, liquidationAvoided: false };
    } else {
      const noAction = body.debtAtSeal / (body.backingAtSeal * price);
      const now = loan ? loan.debt / (loan.backingAmount * price) : null;
      const wouldMc = noAction >= limits.marginCall;
      const wouldLq = noAction >= limits.liquidation;
      const kept = !liquidated && now !== null && now < limits.marginCall;
      grade = {
        ...base, kept, status: "graded", healthAtGrade: now, healthWithNoAction: noAction, wouldHaveHadMarginCall: wouldMc, wouldHaveBeenLiquidated: wouldLq,
        marginCallAvoided: kept && wouldMc, liquidationAvoided: kept && wouldLq,
      };
    }
    store.setGrade(row.id, grade, grade.gradedAt);
    store.addLog({
      ts: grade.gradedAt, kind: "grade", loanId: body.loanId, instrument: `${body.backingCoin} / ${body.loanCoin}`, direction: "", price,
      quantity: null, balanceChange: "none", simulated: row.simulated,
      reason: grade.kept === null ? "The loan was closed before the grade." : grade.kept ? "Promise kept: loan health stayed below the margin-call level." : "Promise missed: the loan reached the margin-call level or was liquidated.",
      detail: grade,
    });
    out.push({ row, grade });
  }
  return out;
}

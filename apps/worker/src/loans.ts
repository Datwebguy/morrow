import type { Balances, LoanRead, LoanRecord } from "./ports";

/**
 * Parsing of the user's private loan and balance responses.
 * Bitget has not published the field names for these (docs/VERIFIED.md item 4), so each value is looked up under
 * a short list of likely names. If a loan is missing any needed value it is reported as unreadable and never
 * acted on. Nothing is guessed or filled in.
 */

const NAMES = {
  orderId: ["orderId", "orderid", "id"],
  loanCoin: ["loanCoin", "borrowCoin", "debtCoin"],
  backingCoin: ["pledgeCoin", "collateralCoin", "pledgeToken"],
  debt: ["debt", "totalDebt", "debtAmount", "loanAmount", "borrowAmount", "totalBorrow"],
  backingAmount: ["pledgeAmount", "collateralAmount", "pledgeQty", "totalPledge"],
} as const;

export function records(raw: unknown): Record<string, unknown>[] | null {
  const unwrap = (v: unknown): unknown => (v && typeof v === "object" && !Array.isArray(v) && "data" in (v as object) ? (v as { data: unknown }).data : v);
  let v = unwrap(raw);
  v = unwrap(v);
  if (Array.isArray(v)) return v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
  if (v && typeof v === "object") {
    for (const val of Object.values(v as object)) {
      if (Array.isArray(val)) return val.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
    }
  }
  return null;
}

function pick(r: Record<string, unknown>, names: readonly string[]): unknown {
  for (const n of names) if (r[n] !== undefined && r[n] !== null && r[n] !== "") return r[n];
  return undefined;
}

function toNumber(v: unknown): number | null {
  const n = typeof v === "string" || typeof v === "number" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

export function parseLoans(ongoingRaw: unknown): LoanRead {
  const rows = records(ongoingRaw);
  if (rows === null) return { loans: [], problems: ["Bitget's loan answer was not in a form Morrow can read."] };
  const loans: LoanRecord[] = [];
  const problems: string[] = [];
  for (const r of rows) {
    const orderId = pick(r, NAMES.orderId);
    const loanCoin = pick(r, NAMES.loanCoin);
    const backingCoin = pick(r, NAMES.backingCoin);
    const debt = toNumber(pick(r, NAMES.debt));
    const backing = toNumber(pick(r, NAMES.backingAmount));
    if (typeof orderId !== "string" && typeof orderId !== "number") {
      problems.push("A loan has no order number, so it is skipped.");
      continue;
    }
    const id = String(orderId);
    if (typeof loanCoin !== "string" || typeof backingCoin !== "string" || debt === null || backing === null || backing <= 0) {
      problems.push(`Loan ${id} is missing a value Morrow needs (coin, amount owed or backing amount), so it is not touched.`);
      continue;
    }
    loans.push({ orderId: id, loanCoin, backingCoin, debt, backingAmount: backing });
  }
  return { loans, problems };
}

export function parseBalances(raw: unknown): Balances {
  const rows = records(raw);
  if (rows === null) return { byCoin: null, problem: "Bitget's balance answer was not in a form Morrow can read." };
  const byCoin: Record<string, number> = {};
  for (const r of rows) {
    const coin = pick(r, ["coin", "asset", "currency"]);
    const avail = toNumber(pick(r, ["available", "availableBalance", "free", "equity", "balance"]));
    if (typeof coin === "string" && avail !== null) byCoin[coin] = (byCoin[coin] ?? 0) + avail;
  }
  return { byCoin };
}

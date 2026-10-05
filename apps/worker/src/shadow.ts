import { MorrowBitget, type AddBackingRequest, type PayDownRequest, type WriteResult } from "@morrow/bitget";
import { CHECK_MY_LOAN } from "@morrow/config";
import type { Store } from "./db";
import type { Balances, LoanRead, Ports } from "./ports";
import { updateSettings } from "./settings";

/**
 * The shadow ledger (AGENTS.md section 3, VERIFY item 3): Bitget's demo environment has no Crypto Loans, so one
 * hypothetical loan, typed in by the owner, runs through the same worker with live prices, live loan limits and
 * dry-run previews. Every entry it writes is labelled simulated, and nothing is ever sent to Bitget.
 */
export const SHADOW_ORDER_ID = "shadow-1";
const KEY = "shadow_loan";

export interface ShadowLoan {
  backingCoin: string;
  backingAmount: number;
  /** Amount owed in the borrowed coin. */
  debt: number;
  /** Idle balance of the borrowed coin the simulated user holds. */
  idleBorrowed: number;
  /** Idle balance of the same token that backs the loan. */
  idleBacking: number;
}

export class ShadowError extends Error {}

function num(v: unknown, name: string, allowZero: boolean): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || (!allowZero && v === 0)) {
    throw new ShadowError(`${name} must be a number${allowZero ? " of zero or more" : " above zero"}.`);
  }
  if (v > CHECK_MY_LOAN.maxAmount) throw new ShadowError(`${name} is too large.`);
  return v;
}

export function loadShadow(store: Store): ShadowLoan | null {
  return store.getSetting<ShadowLoan>(KEY);
}

/** Validates and saves the simulated loan, and sets the shadow run's own controls (automatic, both actions, limits equal to the idle balance). */
export function saveShadow(store: Store, body: Record<string, unknown>): ShadowLoan {
  const coin = body["backingCoin"];
  if (typeof coin !== "string" || !/^[A-Za-z0-9]{2,20}$/.test(coin.trim())) throw new ShadowError("backingCoin must be a stock token.");
  const loan: ShadowLoan = {
    backingCoin: coin.trim(),
    backingAmount: num(body["backingAmount"], "backingAmount", false),
    debt: num(body["debt"], "debt", false),
    idleBorrowed: num(body["idleBorrowed"] ?? 0, "idleBorrowed", true),
    idleBacking: num(body["idleBacking"] ?? 0, "idleBacking", true),
  };
  store.setSetting(KEY, loan);
  updateSettings(store, {
    mode: "auto", paused: false, allowed: ["pay_down", "add_backing"], protectedLoans: [SHADOW_ORDER_ID],
    maxPerAction: loan.idleBorrowed, maxPerWeekend: loan.idleBorrowed, maxPerMonth: loan.idleBorrowed,
  });
  return loan;
}

export function clearShadow(store: Store): void {
  store.setSetting(KEY, null);
  updateSettings(store, { protectedLoans: [] });
}

const OFFLINE = {
  async call(): Promise<never> {
    throw new Error("The shadow ledger never talks to a Bitget account.");
  },
};

/** Always a preview. A previewed action is applied to the simulated loan so the next check sees it. */
class ShadowExec extends MorrowBitget {
  constructor(private readonly store: Store) {
    super(OFFLINE);
  }

  override async payDown(req: PayDownRequest): Promise<WriteResult> {
    const r = await super.payDown(req, { dryRun: true });
    const loan = loadShadow(this.store);
    const amount = Number(req.amount);
    if (loan && Number.isFinite(amount)) this.store.setSetting(KEY, { ...loan, debt: Math.max(0, loan.debt - amount), idleBorrowed: Math.max(0, loan.idleBorrowed - amount) });
    return r;
  }

  override async addBacking(req: AddBackingRequest): Promise<WriteResult> {
    const r = await super.addBacking(req, { dryRun: true });
    const loan = loadShadow(this.store);
    const amount = Number(req.amount);
    if (loan && Number.isFinite(amount)) this.store.setSetting(KEY, { ...loan, backingAmount: loan.backingAmount + amount, idleBacking: Math.max(0, loan.idleBacking - amount) });
    return r;
  }

  /** A simulated loan has no liquidation records at Bitget. The grade compares loan health at the reopen price instead. */
  override async read(operationId: Parameters<MorrowBitget["read"]>[0], args: Record<string, unknown> = {}): Promise<unknown> {
    if (operationId === "getLoanReduces") return { code: "00000", data: [] };
    return super.read(operationId, args);
  }
}

/** The worker's ports for the shadow run: live market and limits, a simulated loan and balances, preview-only actions. */
export function shadowPorts(base: Ports, store: Store): Ports {
  return {
    ...base,
    simulated: true,
    async loans(): Promise<LoanRead> {
      const s = loadShadow(store);
      if (!s) return { loans: [], problems: [] };
      return { loans: [{ orderId: SHADOW_ORDER_ID, loanCoin: CHECK_MY_LOAN.loanCoin, backingCoin: s.backingCoin, debt: s.debt, backingAmount: s.backingAmount }], problems: [] };
    },
    async idleBalances(): Promise<Balances> {
      const s = loadShadow(store);
      return { byCoin: s ? { [CHECK_MY_LOAN.loanCoin]: s.idleBorrowed, [s.backingCoin]: s.idleBacking } : {} };
    },
    exec: new ShadowExec(store),
    async notify() {
      // Simulated entries never message the user.
    },
  };
}

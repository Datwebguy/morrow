import type { MorrowBitget, OrderBook, Quote } from "@morrow/bitget";
import type { Candle, LoanLimits } from "@morrow/core";

/** A loan as read from the user's Bitget account. */
export interface LoanRecord {
  orderId: string;
  loanCoin: string;
  backingCoin: string;
  /** Amount owed in the borrowed coin. */
  debt: number;
  /** Amount of the backing token pledged. */
  backingAmount: number;
}

export interface LoanRead {
  loans: LoanRecord[];
  /** Plain reasons something could not be read. A loan with a problem is never acted on. */
  problems: string[];
}

export interface Balances {
  /** Idle balance per coin. Null when it could not be read. */
  byCoin: Record<string, number> | null;
  problem?: string;
}

export interface MarketPort {
  /** Spot symbol for a stock token coin (for example the symbol for rNVDA), or null when there is none. */
  symbolFor(coin: string): Promise<string | null>;
  quote(symbol: string): Promise<Quote>;
  lastTradeMs(symbol: string): Promise<number | null>;
  book(symbol: string, levels: number): Promise<OrderBook>;
  history(symbol: string, fromMs: number, toMs: number): Promise<Candle[]>;
}

/** Everything the worker touches outside itself. Tests and shadow runs replace these. */
export interface Ports {
  nowMs(): number;
  /** True for shadow runs: every log entry and promise is labelled simulated. */
  simulated: boolean;
  loans(): Promise<LoanRead>;
  /** Idle balances. A simulated ledger holds a separate balance per loan, so it can tell which loan is asking. A real account has one balance. */
  idleBalances(forLoan?: string): Promise<Balances>;
  /** Live limits for a backing coin, or null when Bitget does not list it. */
  limits(backingCoin: string): Promise<LoanLimits | null>;
  market: MarketPort;
  announcements(): Promise<string[]>;
  exec: MorrowBitget;
  /** Send a message to the user outside the app (Telegram). Optional. */
  notify(chatId: string, text: string): Promise<void>;
}

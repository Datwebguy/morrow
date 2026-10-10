import { MorrowBitget, type AddBackingRequest, type PayDownRequest, type WriteResult } from "@morrow/bitget";
import { CHECK_MY_LOAN, SCHEDULE, SIMULATION } from "@morrow/config";
import type { MarketClosure } from "@morrow/core";
import type { ProfileCache } from "./assess";
import type { Store } from "./db";
import type { Balances, LoanRead, MarketPort, Ports } from "./ports";
import { updateSettings } from "./settings";

/**
 * The shadow ledger (AGENTS.md section 3, VERIFY item 3). Bitget's demo environment has no Crypto Loans, so Morrow runs simulated loans
 * on the stock tokens with the most trading, with live prices, live loan limits and previews only. Every closure it opens a fresh
 * set, seals a promise for each, projects, decides and grades. Every entry is labelled simulated and nothing is ever sent to Bitget.
 */
export interface ShadowLoan {
  id: string;
  backingCoin: string;
  backingAmount: number;
  /** Amount owed in the borrowed coin. */
  debt: number;
  /** Idle balance of the borrowed coin the simulated user holds. */
  idleBorrowed: number;
  idleBacking: number;
  /** Loan health when the loan was opened. */
  startHealth: number;
  openedAt: number;
}

export interface ShadowBook {
  /** The closure these loans were opened for. Null for the first set, opened when the ledger starts. */
  closeTs: number | null;
  openedAt: number;
  loans: ShadowLoan[];
}

const KEY = "shadow_book";

export function loadBook(store: Store): ShadowBook {
  return store.getSetting<ShadowBook>(KEY) ?? { closeTs: null, openedAt: 0, loans: [] };
}

function saveBook(store: Store, book: ShadowBook): void {
  store.setSetting(KEY, book);
}

/** Opens a fresh set of simulated loans on the given tokens, placed between each token's live start and margin-call levels. */
export async function openBook(base: Ports, store: Store, coins: string[], closeTs: number | null): Promise<ShadowBook> {
  const nowMs = base.nowMs();
  const loans: ShadowLoan[] = [];
  for (const coin of coins) {
    const [limits, symbol] = await Promise.all([base.limits(coin), base.market.symbolFor(coin)]);
    if (!limits || !symbol) continue;
    const q = await base.market.quote(symbol);
    const price = (q.bid + q.ask) / 2;
    if (!(price > 0)) continue;
    SIMULATION.shadowStartPositions.forEach((pos, i) => {
      const startHealth = limits.start + pos * (limits.marginCall - limits.start);
      const debt = startHealth * SIMULATION.backingValueUsdt;
      loans.push({
        id: `${coin}-p${i}`, backingCoin: coin, backingAmount: SIMULATION.backingValueUsdt / price, debt,
        idleBorrowed: SIMULATION.idleShareOfDebt * debt, idleBacking: 0, startHealth, openedAt: nowMs,
      });
    });
  }
  const book: ShadowBook = { closeTs, openedAt: nowMs, loans };
  saveBook(store, book);
  // The shadow run's own controls: automatic, both actions, limits as wide as the whole book so no loan blocks another.
  const cap = SIMULATION.backingValueUsdt * Math.max(1, loans.length);
  updateSettings(store, {
    mode: "auto", paused: false, allowed: ["pay_down", "add_backing"], protectedLoans: loans.map((l) => l.id),
    maxPerAction: SIMULATION.backingValueUsdt, maxPerWeekend: cap, maxPerMonth: cap * 4,
  });
  return book;
}

/**
 * From tokens ranked by trading, keeps the first `count` that have enough reopening history for Morrow to project and act on.
 * A token with too little history cannot be protected, so a simulated loan on it would only sit there.
 */
export async function pickWithHistory(base: Ports, cache: ProfileCache, ranked: string[], count: number): Promise<string[]> {
  const out: string[] = [];
  for (const coin of ranked) {
    if (out.length >= count) break;
    try {
      const symbol = await base.market.symbolFor(coin);
      if (symbol && (await cache.get(symbol)).risk !== null) out.push(coin);
    } catch {
      // A token whose history cannot be read right now is skipped, not guessed.
    }
  }
  return out;
}

/**
 * Opens the first set when the ledger has none, and a fresh set for each closure as its promise window starts,
 * so every weekend is an independent test. Returns true when a new set was opened.
 */
export async function ensureBook(base: Ports, store: Store, pickCoins: () => Promise<string[]>, closure: MarketClosure | null): Promise<boolean> {
  const book = loadBook(store);
  const nowMs = base.nowMs();
  const inWindow = closure !== null && nowMs >= closure.closeTs - SCHEDULE.promiseLeadMinutes * 60_000 && nowMs < closure.reopenTs;
  const needFirst = book.loans.length === 0;
  const needFresh = inWindow && book.closeTs !== closure.closeTs;
  if (!needFirst && !needFresh) return false;
  const coins = await pickCoins();
  if (coins.length === 0) return false;
  const opened = await openBook(base, store, coins, inWindow ? closure.closeTs : null);
  return opened.loans.length > 0;
}

const OFFLINE = {
  async call(): Promise<never> {
    throw new Error("The shadow ledger never talks to a Bitget account.");
  },
};

/** Always a preview. A previewed action is applied to that simulated loan so the next check sees it. */
class ShadowExec extends MorrowBitget {
  constructor(private readonly store: Store) {
    super(OFFLINE);
  }

  private apply(orderId: string, change: (l: ShadowLoan) => ShadowLoan): void {
    const book = loadBook(this.store);
    saveBook(this.store, { ...book, loans: book.loans.map((l) => (l.id === orderId ? change(l) : l)) });
  }

  override async payDown(req: PayDownRequest): Promise<WriteResult> {
    const r = await super.payDown(req, { dryRun: true });
    const amount = Number(req.amount);
    if (Number.isFinite(amount)) this.apply(req.orderId, (l) => ({ ...l, debt: Math.max(0, l.debt - amount), idleBorrowed: Math.max(0, l.idleBorrowed - amount) }));
    return r;
  }

  override async addBacking(req: AddBackingRequest): Promise<WriteResult> {
    const r = await super.addBacking(req, { dryRun: true });
    const amount = Number(req.amount);
    if (Number.isFinite(amount)) this.apply(req.orderId, (l) => ({ ...l, backingAmount: l.backingAmount + amount, idleBacking: Math.max(0, l.idleBacking - amount) }));
    return r;
  }

  /** A simulated loan has no liquidation records at Bitget. The grade compares loan health at the reopen price instead. */
  override async read(operationId: Parameters<MorrowBitget["read"]>[0], args: Record<string, unknown> = {}): Promise<unknown> {
    if (operationId === "getLoanReduces") return { code: "00000", data: [] };
    return super.read(operationId, args);
  }
}

/** Shares one market read between loans on the same token for a few seconds, so fifteen loans do not mean fifteen calls. */
function sharedMarket(m: MarketPort, nowMs: () => number): MarketPort {
  const ttl = SCHEDULE.shadowMarketShareSeconds * 1000;
  const cache = new Map<string, { at: number; value: Promise<unknown> }>();
  const once = <T>(k: string, f: () => Promise<T>): Promise<T> => {
    const hit = cache.get(k);
    if (hit && nowMs() - hit.at < ttl) return hit.value as Promise<T>;
    const value = f();
    cache.set(k, { at: nowMs(), value });
    value.catch(() => cache.delete(k));
    return value;
  };
  return {
    symbolFor: (c) => m.symbolFor(c),
    quote: (s) => once(`q:${s}`, () => m.quote(s)),
    lastTradeMs: (s) => once(`t:${s}`, () => m.lastTradeMs(s)),
    book: (s, n) => once(`b:${s}:${n}`, () => m.book(s, n)),
    history: (s, f, t) => m.history(s, f, t),
  };
}

/** The worker's ports for the shadow run: live market and limits, simulated loans and per-loan balances, preview-only actions. */
export function shadowPorts(base: Ports, store: Store): Ports {
  return {
    ...base,
    simulated: true,
    market: sharedMarket(base.market, base.nowMs),
    async loans(): Promise<LoanRead> {
      return { loans: loadBook(store).loans.map((l) => ({ orderId: l.id, loanCoin: CHECK_MY_LOAN.loanCoin, backingCoin: l.backingCoin, debt: l.debt, backingAmount: l.backingAmount })), problems: [] };
    },
    async idleBalances(forLoan?: string): Promise<Balances> {
      const l = loadBook(store).loans.find((x) => x.id === forLoan);
      return { byCoin: l ? { [CHECK_MY_LOAN.loanCoin]: l.idleBorrowed, [l.backingCoin]: l.idleBacking } : {} };
    },
    exec: new ShadowExec(store),
    async notify() {
      // Simulated entries never message the user.
    },
  };
}

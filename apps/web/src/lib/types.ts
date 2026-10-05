/** Shapes the Morrow server returns. */

export interface Settings {
  mode: "auto" | "ask";
  paused: boolean;
  allowed: Array<"pay_down" | "add_backing">;
  targetBufferPoints: number;
  triggerBufferPoints: number;
  maxPerAction: number | null;
  maxPerWeekend: number | null;
  maxPerMonth: number | null;
  protectedLoans: string[];
  telegramChatId: string | null;
}

export interface Status {
  connected: boolean;
  keysOnServer: boolean;
  liveActions: boolean;
  now: number;
  calendar: { at: number; ok: boolean; detail: string } | null;
  settings: Settings;
  pendingApprovals: number;
}

export interface LoanView {
  orderId: string;
  instrument: string;
  protected: boolean;
  phase: "open" | "pre_closure" | "closed";
  asOf: number;
  loanCoin: string;
  backingCoin: string;
  health: {
    ratio: number;
    status: "safe" | "watch" | "margin_call" | "liquidation";
    distanceToMarginCall: number;
    distanceToLiquidation: number;
    priceDropToMarginCall: number;
    marginCallLevel: number;
    liquidationLevel: number;
  } | null;
  closure: { closeTs: number; reopenTs: number } | null;
  projection: { ratio: number; basis: string; price: number | null; status: string } | null;
  trust: { trusted: boolean; failures: string[] } | null;
  plan: { payDown: number; addBacking: number; reachesTarget: boolean; reason: string } | null;
  problems: string[];
}

export interface LoansResponse {
  connected: boolean;
  problems: string[];
  loans: LoanView[];
  closure: { closeTs: number; reopenTs: number } | null;
}

export interface Approval {
  id: number;
  createdAt: number;
  loanId: string;
  status: string;
  proposal: { kind: string; amount: number; price: number; reason: string };
}

export interface LogEntry {
  id: number;
  ts: number;
  kind: string;
  loanId: string;
  instrument: string;
  direction: string;
  price: number | null;
  quantity: number | null;
  balanceChange: string;
  simulated: boolean;
  reason: string;
  detail: unknown;
}

export interface OwnPromise {
  id: string;
  loanId: string;
  closeTs: number;
  reopenTs: number;
  fingerprint: string;
  createdAt: number;
  simulated: boolean;
  body: { backingCoin: string; loanCoin: string; marginCallLevel: number; targetLevel: number; projectedHealth: number | null; projectionBasis: string; late: boolean };
  grade: {
    kept: boolean | null;
    status: string;
    priceUsed: number | null;
    healthAtGrade: number | null;
    healthWithNoAction: number | null;
    wouldHaveHadMarginCall: boolean | null;
    marginCallAvoided: boolean;
    liquidationAvoided: boolean;
    paidDown: number;
    addedBackingValue: number;
  } | null;
  actions: Array<{ kind: string; amount: number }>;
}

export interface PublicPromise {
  id: string;
  closeTs: number;
  reopenTs: number;
  fingerprint: string;
  sealedAt: number;
  late: boolean;
  sizeBand: string;
  backingCoin: string;
  simulated: boolean;
  status: "sealed" | "graded";
  kept: boolean | null;
  actions: number;
  cost: number | null;
  wouldHaveHadMarginCall: boolean | null;
  wouldHaveBeenLiquidated: boolean | null;
  marginCallAvoided: boolean;
  liquidationAvoided: boolean;
}

export interface PublicRecord {
  totals: { promises: number; graded: number; kept: number; marginCallsAvoided: number; liquidationsAvoided: number; totalCost: number };
  promises: PublicPromise[];
  simulated: PublicPromise[];
}

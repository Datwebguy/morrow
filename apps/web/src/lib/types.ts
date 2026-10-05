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

/** "Check my loan": what the public check returns for three typed numbers. Nothing about it is stored. */
export interface CheckResult {
  asOf: number;
  token: string;
  loanCoin: string;
  phase: "open" | "pre_closure" | "closed";
  closure: { closeTs: number; reopenTs: number } | null;
  price: number | null;
  lastClose: number | null;
  moveSinceClose: number | null;
  health: {
    ratio: number;
    status: "safe" | "watch" | "margin_call" | "liquidation";
    distanceToMarginCall: number;
    distanceToLiquidation: number;
    priceDropToMarginCall: number;
    marginCallLevel: number;
    liquidationLevel: number;
    startLevel: number;
  } | null;
  projection: { ratio: number; status: string; basis: string; price: number | null } | null;
  history: { closures: number; likelyDrop: number; severeDrop: number; likelyPercentile: number; severePercentile: number; tradesOnWeekends: boolean } | null;
  trust: { trusted: boolean; failures: string[] } | null;
  suggestion: { payDown: number; addBacking: number; ratioAfter: number; targetRatio: number } | null;
  problems: string[];
}

/** A stock token Bitget accepts as backing, with its company name when the directory has one. */
export interface TokenOption {
  coin: string;
  name: string | null;
}

/** "Watch a weekend": one real closure replayed with a simulated loan. */
export interface WatchStep {
  id: "seal" | "weekend" | "project" | "decide" | "act" | "reopen" | "grade";
  at: number;
  title: string;
  line: string;
  facts: Array<{ label: string; value: string }>;
}

export interface WatchResult {
  label: string;
  token: string;
  symbol: string;
  closure: { closeTs: number; reopenTs: number; closeDate: string; reopenDate: string };
  reopenMove: number;
  loan: { backingAmount: number; backingValue: number; debt: number; startHealth: number; idleBorrowed: number; basis: "standard" | "yours" };
  limits: { marginCall: number; liquidation: number };
  decidedBy: string;
  prices: Array<{ t: number; price: number }>;
  steps: WatchStep[];
  outcome: { kept: boolean | null; healthWithMorrow: number | null; healthWithoutMorrow: number | null; marginCallWithoutMorrow: boolean | null; paidDown: number };
  notes: string[];
}

/** The shadow ledger as the public sees it. Every loan is simulated. */
export interface ShadowLoanView extends LoanView {
  simulated: true;
  startHealth: number;
  openedAt: number;
  lastDecision: { ts: number; kind: string; reason: string } | null;
}

export interface ShadowView {
  simulated: true;
  loans: ShadowLoanView[];
  closure: { closeTs: number; reopenTs: number } | null;
  asOf?: number;
}

export interface FeaturedClosure {
  coin: string;
  symbol: string;
  closeTs: number;
  reopenTs: number;
  move: number;
}

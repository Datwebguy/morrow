/**
 * The hard limits from AGENTS.md section 3. Every write passes through here before any request is built.
 * Nothing else in the product may reach a write endpoint.
 */

export type ForbiddenReason =
  | "operation_not_allowed"
  | "repay_method_must_be_borrowed_coin"
  | "revise_type_must_be_in"
  | "transfer_not_between_own_accounts"
  | "missing_field"
  | "bad_amount";

export class ForbiddenRequestError extends Error {
  readonly reason: ForbiddenReason;
  constructor(reason: ForbiddenReason, detail: string) {
    super(`Refused: ${detail}`);
    this.name = "ForbiddenRequestError";
    this.reason = reason;
  }
}

/** Read-only operations Morrow may call. */
export const READ_OPERATIONS = [
  "getLoanCoins",
  "getBorrowOngoing",
  "getLoanDebts",
  "getPledgeRateHistory",
  "getLoanReduces",
  "getRepayHistory",
  "getBorrowHistory",
  "getLoanInterest",
  // Account balances (read only), needed to know the user's idle balances.
  "getAccountAssets",
  "getAccountFundingAssets",
] as const;

/** The only write operations Morrow may call, each with its own checks below. */
export const WRITE_OPERATIONS = ["repayCoins", "revisePledge", "transfer"] as const;

export type ReadOperation = (typeof READ_OPERATIONS)[number];
export type WriteOperation = (typeof WRITE_OPERATIONS)[number];

/** Account types that belong to the user (from the SDK's transfer request type). A transfer must stay inside them. */
const OWN_ACCOUNT_TYPES = new Set([
  "spot", "p2p", "coin_futures", "usdt_futures", "usdc_futures", "crossed_margin", "isolated_margin", "uta",
]);

/** Fields that could send value to someone else. Never allowed on a transfer. */
const THIRD_PARTY_FIELDS = ["toUid", "toUserId", "subUid", "subAccountUid", "address", "chain", "tag", "email", "phone"];

export function assertOperationAllowed(operationId: string): void {
  const all: readonly string[] = [...READ_OPERATIONS, ...WRITE_OPERATIONS];
  if (!all.includes(operationId)) {
    throw new ForbiddenRequestError("operation_not_allowed", `operation "${operationId}" is not one Morrow may call`);
  }
}

function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || v.length === 0) throw new ForbiddenRequestError("missing_field", `"${key}" is required`);
  return v;
}

function requirePositiveAmount(args: Record<string, unknown>, key: string): string {
  const v = requireString(args, key);
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new ForbiddenRequestError("bad_amount", `"${key}" must be a positive number`);
  return v;
}

export interface PayDownRequest {
  orderId: string;
  /** Amount of the borrowed coin, as a decimal string. */
  amount: string;
}

export interface AddBackingRequest {
  orderId: string;
  /** Amount of the same token that already backs the loan, as a decimal string. */
  amount: string;
  pledgeCoin: string;
}

export interface OwnTransferRequest {
  fromType: string;
  toType: string;
  amount: string;
  coin: string;
}

/** Pay down: always `method=borrowed_coin`, never `repayAll`, never redeeming backing. */
export function buildPayDown(r: PayDownRequest): Record<string, string> {
  return {
    orderId: requireString(r as unknown as Record<string, unknown>, "orderId"),
    method: "borrowed_coin",
    repayAll: "no",
    amount: requirePositiveAmount(r as unknown as Record<string, unknown>, "amount"),
    repayUnlock: "no",
  };
}

/** Add backing: always `reviseType=IN`, set explicitly. */
export function buildAddBacking(r: AddBackingRequest): Record<string, string> {
  const rec = r as unknown as Record<string, unknown>;
  return {
    orderId: requireString(rec, "orderId"),
    amount: requirePositiveAmount(rec, "amount"),
    pledgeCoin: requireString(rec, "pledgeCoin"),
    reviseType: "IN",
  };
}

/** Transfer between the user's own Bitget accounts only. */
export function buildOwnTransfer(r: OwnTransferRequest): Record<string, string> {
  const rec = r as unknown as Record<string, unknown>;
  for (const f of THIRD_PARTY_FIELDS) {
    if (f in rec) throw new ForbiddenRequestError("transfer_not_between_own_accounts", `field "${f}" is not allowed on a transfer`);
  }
  const allowed = new Set(["fromType", "toType", "amount", "coin"]);
  for (const k of Object.keys(rec)) {
    if (!allowed.has(k)) throw new ForbiddenRequestError("transfer_not_between_own_accounts", `field "${k}" is not allowed on a transfer`);
  }
  const fromType = requireString(rec, "fromType");
  const toType = requireString(rec, "toType");
  if (!OWN_ACCOUNT_TYPES.has(fromType) || !OWN_ACCOUNT_TYPES.has(toType) || fromType === toType) {
    throw new ForbiddenRequestError("transfer_not_between_own_accounts", "a transfer must move between two of the user's own accounts");
  }
  return { fromType, toType, amount: requirePositiveAmount(rec, "amount"), coin: requireString(rec, "coin") };
}

/**
 * Check a raw request (as an outside caller might build it) against the hard limits.
 * Used by the generic `send` path so nothing can skip the builders above.
 */
export function assertRawWriteAllowed(operationId: string, args: Record<string, unknown>): Record<string, unknown> {
  assertOperationAllowed(operationId);
  if (operationId === "repayCoins") {
    if (args["method"] !== "borrowed_coin") {
      throw new ForbiddenRequestError("repay_method_must_be_borrowed_coin", 'repay is allowed only with method "borrowed_coin"');
    }
    if (args["repayAll"] !== "no") throw new ForbiddenRequestError("missing_field", 'repayAll must be "no"');
    if (args["repayUnlock"] !== undefined && args["repayUnlock"] !== "no") {
      throw new ForbiddenRequestError("repay_method_must_be_borrowed_coin", "repay may not redeem backing");
    }
    return buildPayDown({ orderId: args["orderId"] as string, amount: args["amount"] as string });
  }
  if (operationId === "revisePledge") {
    if (args["reviseType"] !== "IN") {
      throw new ForbiddenRequestError("revise_type_must_be_in", 'revise pledge is allowed only with reviseType "IN"');
    }
    return buildAddBacking({
      orderId: args["orderId"] as string,
      amount: args["amount"] as string,
      pledgeCoin: args["pledgeCoin"] as string,
    });
  }
  if (operationId === "transfer") {
    return buildOwnTransfer(args as unknown as OwnTransferRequest);
  }
  return args;
}
